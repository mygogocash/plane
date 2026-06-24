# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Automation rule evaluation worker (AI-T14).

Evaluates active rules on issue lifecycle signals (created/updated/mentioned/
labeled), executes their allowlisted actions through the shared Copilot action
executor, and records an immutable :class:`AutomationRun` plus an
:class:`AuditLog` entry per rule evaluated.

Loop safety:
  - ``MAX_EVENT_DEPTH`` bounds re-triggered evaluation depth.
  - An idempotency key ``(rule_id, entity_id, event_type)`` dedupes repeat
    evaluations so a rule whose action re-triggers itself cannot loop.

Action failures are caught per-action; the run is marked ``partial`` (some
actions applied) or ``failed`` (none applied). Error details never include
provider payloads or secrets.
"""

# Python imports
import json

# Django imports
from django.db import transaction
from django.db.models import Q

# Third party imports
from celery import shared_task

# Module imports
from plane.app.views.copilot import _build_action_plan
from plane.db.models import AuditLog, AutomationRule, AutomationRun, User
from plane.utils.automation_actions import write_audit_log
from plane.utils.exception_logger import log_exception

MAX_EVENT_DEPTH = 3


def _idempotency_key(rule_id, entity_id, event_type):
    return f"{rule_id}:{entity_id}:{event_type}"


def _safe_error(exc):
    """Return a bounded, secret-free description of a failed action."""
    detail = getattr(exc, "detail", None)
    if detail is not None:
        message = json.dumps(detail, default=str)
    else:
        message = str(exc)
    return f"{exc.__class__.__name__}: {message}"[:300]


def _apply_rule_action(slug, user, action, project_id, issue_id):
    _action, executor = _build_action_plan(
        slug=slug,
        user=user,
        action=action,
        context_project_id=project_id,
        context_issue_id=issue_id,
    )
    with transaction.atomic():
        return executor()


def _execute_rule(*, rule, event_type, entity_type, entity_id, project_id, actor_user_id):
    key = _idempotency_key(rule.id, entity_id, event_type)
    existing = AutomationRun.objects.filter(
        rule=rule, idempotency_key=key, deleted_at__isnull=True
    ).first()
    if existing is not None:
        # Idempotency guard: a self-retriggering rule cannot create a second run
        # for the same (rule, entity, event) tuple.
        return existing

    user = None
    if actor_user_id:
        user = User.objects.filter(id=actor_user_id).first()
    if user is None:
        user = rule.created_by

    slug = rule.workspace.slug
    actions = rule.actions or []
    actions_applied = []
    errors = []

    for action in actions:
        try:
            result = _apply_rule_action(slug, user, action, project_id or rule.project_id, entity_id)
            actions_applied.append(result)
        except Exception as exc:
            errors.append({"type": (action or {}).get("type"), "error": _safe_error(exc)})

    if errors and actions_applied:
        run_status = AutomationRun.Status.PARTIAL
    elif errors:
        run_status = AutomationRun.Status.FAILED
    else:
        run_status = AutomationRun.Status.SUCCESS

    run = AutomationRun.objects.create(
        rule=rule,
        workspace=rule.workspace,
        project=rule.project,
        triggered_by_event=event_type,
        status=run_status,
        actions_applied=actions_applied,
        error=json.dumps(errors) if errors else None,
        entity_type=entity_type,
        entity_id=entity_id,
        idempotency_key=key,
    )

    write_audit_log(
        workspace=rule.workspace,
        user=user,
        action=f"automation_rule.{run_status}",
        entity_type=entity_type,
        entity_id=entity_id,
        changes={
            "rule_id": str(rule.id),
            "actions_applied": len(actions_applied),
            "errors": len(errors),
        },
        actor_type=AuditLog.ActorType.SYSTEM,
    )
    return run


def evaluate_automation_rules(
    *,
    workspace_id,
    event_type,
    entity_type,
    entity_id,
    project_id=None,
    actor_user_id=None,
    depth=0,
):
    """Evaluate every active rule matching ``event_type`` for the workspace.

    Workspace-wide rules (null project) match any project event; project-scoped
    rules match only their own project. Returns a summary dict with the created
    run ids.
    """
    if depth > MAX_EVENT_DEPTH:
        return {"status": "depth_exceeded", "runs": []}

    rules = (
        AutomationRule.objects.filter(
            workspace_id=workspace_id,
            is_active=True,
            trigger=event_type,
            deleted_at__isnull=True,
        )
        .filter(Q(project_id__isnull=True) | Q(project_id=project_id))
        .select_related("workspace", "project", "created_by")
    )

    run_ids = []
    for rule in rules:
        run = _execute_rule(
            rule=rule,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
        )
        if run is not None:
            run_ids.append(str(run.id))

    return {"status": "ok", "runs": run_ids}


@shared_task
def automation_rule_task(
    workspace_id,
    event_type,
    entity_type,
    entity_id,
    project_id=None,
    actor_user_id=None,
    depth=0,
):
    try:
        return evaluate_automation_rules(
            workspace_id=workspace_id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            depth=depth,
        )
    except Exception as error:
        log_exception(error)
        return {"status": "error", "runs": []}

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Intake triage classification and suggestion-apply helpers (AI-T17).

A new ``IntakeIssue`` is classified asynchronously into a 1:1
``TriageSuggestion`` (status=pending). Suggested assignee/project are always
restricted to valid members/projects in scope, and imported text is sanitized.
Applying a suggestion is member-gated, audited, and idempotent.
"""

# Python imports
import json

# Django imports
from django.db import transaction

# Module imports
from plane.app.views.external.base import get_llm_config, get_llm_response, is_llm_configured
from plane.db.models import (
    AuditLog,
    IssueAssignee,
    IssueLabel,
    Label,
    ProjectMember,
    TriageSuggestion,
    User,
)
from plane.utils.automation_actions import write_audit_log
from plane.utils.content_validator import validate_html_content

LOW_CONFIDENCE_THRESHOLD = 0.5
ISSUE_PRIORITIES = {"urgent", "high", "medium", "low", "none"}


def sanitize_text(content):
    if not content:
        return ""
    is_valid, _error, clean_html = validate_html_content(content)
    return clean_html if clean_html is not None else content


def is_low_confidence(confidence):
    try:
        return float(confidence) < LOW_CONFIDENCE_THRESHOLD
    except (TypeError, ValueError):
        return True


def generate_triage_classification(prompt_text, api_key, model, provider):
    """LLM seam. Returns a dict classification or ``None``. Mocked in tests."""
    instruction = (
        "Classify this intake request for triage. Return strict JSON with keys: "
        "labels (array of label names), assignee (email or null), "
        "priority (one of urgent/high/medium/low/none), project (name or null), "
        "confidence (0..1 float). Use only the provided text; do not invent people."
    )
    text, error = get_llm_response("intake_triage", f"{instruction}\n\n{prompt_text}", api_key, model, provider)
    if error or not text:
        return None
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _validated_label_ids(project, raw_labels):
    """Resolve LLM-proposed label names to existing label IDs in the project.

    Never invents labels: unknown names are dropped.
    """
    if not isinstance(raw_labels, list) or not raw_labels:
        return []
    names = [str(name).strip() for name in raw_labels if str(name).strip()]
    if not names:
        return []
    labels = Label.objects.filter(project=project, name__in=names)
    return [str(label.id) for label in labels]


def _validated_assignee(project, raw_assignee):
    if not raw_assignee:
        return None
    user = User.objects.filter(email__iexact=str(raw_assignee)).first()
    if user is None:
        return None
    if not ProjectMember.objects.filter(project=project, member=user, is_active=True).exists():
        return None
    return user


def _validated_priority(raw_priority):
    value = str(raw_priority or "").strip().lower()
    return value if value in ISSUE_PRIORITIES else ""


def _validated_project(workspace, raw_project):
    if not raw_project:
        return None
    from plane.db.models import Project

    return Project.objects.filter(workspace=workspace, name__iexact=str(raw_project)).first()


def create_triage_suggestion_for_intake(intake_issue):
    """Classify an intake issue and persist a pending ``TriageSuggestion``.

    Returns the suggestion, or ``None`` when no LLM provider is configured (the
    manual queue is then left unchanged).
    """
    api_key, model, provider = get_llm_config()
    if not is_llm_configured(api_key, model, provider):
        return None

    issue = intake_issue.issue
    prompt_text = sanitize_text(f"{issue.name}\n{issue.description_html or ''}")
    classification = generate_triage_classification(prompt_text, api_key, model, provider)
    if not classification:
        return None

    project = intake_issue.project
    label_ids = _validated_label_ids(project, classification.get("labels"))
    assignee = _validated_assignee(project, classification.get("assignee"))
    priority = _validated_priority(classification.get("priority"))
    suggested_project = _validated_project(intake_issue.workspace, classification.get("project"))
    confidence = classification.get("confidence", 0.0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    suggestion, _created = TriageSuggestion.objects.update_or_create(
        intake_issue=intake_issue,
        defaults={
            "workspace": intake_issue.workspace,
            "project": project,
            "suggested_labels": label_ids,
            "suggested_assignee": assignee,
            "suggested_priority": priority,
            "suggested_project": suggested_project,
            "confidence": confidence,
            "status": TriageSuggestion.Status.PENDING,
        },
    )
    return suggestion


def apply_triage_suggestion(suggestion, user, overrides=None):
    """Apply a pending suggestion to its issue. Idempotent and audited.

    ``overrides`` (member-corrected values) take precedence over AI values when
    supplied. Returns ``(suggestion, outcome)`` where outcome is "applied" or
    "noop" (already applied/rejected).
    """
    if suggestion.status != TriageSuggestion.Status.PENDING:
        return suggestion, "noop"

    overrides = overrides or {}
    issue = suggestion.intake_issue.issue
    project = suggestion.project or issue.project

    label_ids = overrides.get("labels", suggestion.suggested_labels) or []
    if "assignee" in overrides:
        assignee_id = overrides.get("assignee")
    else:
        assignee_id = str(suggestion.suggested_assignee_id) if suggestion.suggested_assignee_id else None
    priority = overrides.get("priority", suggestion.suggested_priority)
    priority = _validated_priority(priority)

    applied_changes = {}
    with transaction.atomic():
        if priority:
            issue.priority = priority
            issue.save(update_fields=["priority", "updated_at"])
            applied_changes["priority"] = priority

        applied_label_ids = []
        for label_id in label_ids:
            label = Label.objects.filter(id=label_id, project=project).first()
            if label is None:
                continue
            IssueLabel.objects.get_or_create(
                issue=issue,
                label=label,
                deleted_at__isnull=True,
                defaults={"project": project, "workspace": issue.workspace},
            )
            applied_label_ids.append(str(label.id))
        if applied_label_ids:
            applied_changes["labels"] = applied_label_ids

        if assignee_id:
            member = User.objects.filter(id=assignee_id).first()
            if member and ProjectMember.objects.filter(project=project, member=member, is_active=True).exists():
                IssueAssignee.objects.get_or_create(
                    issue=issue,
                    assignee=member,
                    deleted_at__isnull=True,
                    defaults={"project": project, "workspace": issue.workspace},
                )
                applied_changes["assignee"] = str(member.id)

        suggestion.status = TriageSuggestion.Status.APPLIED
        suggestion.save(update_fields=["status", "updated_at"])

        write_audit_log(
            workspace=suggestion.workspace,
            user=user,
            action="intake_triage.apply",
            entity_type="intake_issue",
            entity_id=suggestion.intake_issue_id,
            changes=applied_changes,
            actor_type=AuditLog.ActorType.USER,
        )

    return suggestion, "applied"

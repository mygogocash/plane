# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workflow transition enforcement.

This is the single authoritative gate for state transitions. Callers (the issue-update
seam in WF-T6) resolve the issue + target state + acting user and call
``enforce_state_transition``; this service decides allow / illegal-transition / actor-not-allowed
and returns a decision. It never writes ``state_id`` itself.

Design notes:
- Only ``Project.workflow_status == "enabled"`` enforces. "disabled" (default) and "paused"
  allow everything, keeping existing projects fully backward-compatible.
- A project with zero rules is unrestricted. A ``from_state`` with no outgoing rule is also
  unrestricted; only transitions *out of a state that has outgoing rules* are gated.
- The allowed-actor set is the union of role grants (``allowed_roles``) and explicit member
  grants (``WorkflowTransitionActor``). An empty allowed set means any active project member.
- Fail-closed: any unexpected error during evaluation denies the transition; we never allow
  on internal error.
"""

# Python imports
from dataclasses import dataclass
from typing import Optional

# Module imports
from plane.db.models import (
    ProjectMember,
    WorkflowTransition,
    WorkflowTransitionActor,
)


class WorkflowTransitionError(Exception):
    """Base class for transition denials."""


class IllegalTransition(WorkflowTransitionError):
    """The requested from->to transition is not permitted by any rule (maps to HTTP 409)."""


class ActorNotAllowed(WorkflowTransitionError):
    """The acting user is not permitted to perform this transition (maps to HTTP 403)."""


@dataclass
class TransitionDecision:
    allowed: bool
    approval_required: bool = False
    rule: Optional[WorkflowTransition] = None


def resolve_rule_set(issue, project):
    """Return the candidate transition rules governing this issue.

    Only the project-default rule set (``issue_type__isnull=True``) for now. Typed
    resolution (WF-T8) replaces this helper without changing the enforcement mechanics.
    """
    return WorkflowTransition.objects.filter(
        project=project,
        issue_type__isnull=True,
        deleted_at__isnull=True,
    )


def _actor_allowed(rule, project, actor):
    """Whether ``actor`` may perform the transition described by ``rule``."""
    grants_exist = WorkflowTransitionActor.objects.filter(
        transition=rule, deleted_at__isnull=True
    ).exists()

    # An empty allowed set (no roles, no explicit grants) means any active member may move it.
    if not rule.allowed_roles and not grants_exist:
        return ProjectMember.objects.filter(project=project, member=actor, is_active=True).exists()

    explicit_grant = WorkflowTransitionActor.objects.filter(
        transition=rule, member__member=actor, deleted_at__isnull=True
    ).exists()
    if explicit_grant:
        return True

    membership = ProjectMember.objects.filter(project=project, member=actor, is_active=True).first()
    if membership is None:
        return False
    return membership.role in (rule.allowed_roles or [])


def enforce_state_transition(issue, new_state_id, actor) -> TransitionDecision:
    """Decide whether ``actor`` may move ``issue`` to ``new_state_id``.

    Returns a ``TransitionDecision`` when allowed; raises ``IllegalTransition`` (409) or
    ``ActorNotAllowed`` (403) when denied.
    """
    try:
        project = issue.project

        # Non-enforcing postures allow everything.
        if project.workflow_status != "enabled":
            return TransitionDecision(allowed=True)

        rules = resolve_rule_set(issue, project)

        # No rules for the project => unrestricted.
        if not rules.exists():
            return TransitionDecision(allowed=True)

        rule = rules.filter(from_state_id=issue.state_id, to_state_id=new_state_id).first()

        if rule is None:
            # If the current state has any outgoing rule, an unlisted target is illegal.
            if rules.filter(from_state_id=issue.state_id).exists():
                raise IllegalTransition(
                    f"Transition from {issue.state_id} to {new_state_id} is not permitted"
                )
            # Otherwise this state is unconstrained.
            return TransitionDecision(allowed=True)

        if not _actor_allowed(rule, project, actor):
            raise ActorNotAllowed("You are not permitted to perform this transition")

        return TransitionDecision(
            allowed=True, approval_required=rule.approval_required, rule=rule
        )
    except WorkflowTransitionError:
        # Typed denials propagate unchanged.
        raise
    except Exception as exc:  # fail closed: never allow on an unexpected error
        raise ActorNotAllowed("Transition denied due to an evaluation error") from exc

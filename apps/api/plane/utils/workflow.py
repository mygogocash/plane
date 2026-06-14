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
import logging
from dataclasses import dataclass
from typing import Optional

# Django imports
from django.conf import settings
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.db.models import (
    IssueActivity,
    IssueAssignee,
    Notification,
    ProjectMember,
    WorkflowTransition,
    WorkflowTransitionActor,
    WorkItemApproval,
    WorkItemApprovalApprover,
)
from plane.utils.content_validator import validate_html_content

logger = logging.getLogger("plane.api")


class WorkflowTransitionError(Exception):
    """Base class for transition denials."""


class IllegalTransition(WorkflowTransitionError):
    """The requested from->to transition is not permitted by any rule (maps to HTTP 409)."""


class ActorNotAllowed(WorkflowTransitionError):
    """The acting user is not permitted to perform this transition (maps to HTTP 403)."""


class ApprovalError(Exception):
    """An approval decision could not be resolved (maps to HTTP 400/403)."""


class ApprovalNotAllowed(ApprovalError):
    """The acting user may not decide on this approval (maps to HTTP 403)."""


@dataclass
class TransitionDecision:
    allowed: bool
    approval_required: bool = False
    rule: Optional[WorkflowTransition] = None

    @property
    def requires_approval(self) -> bool:
        """True only when the matched rule requires approval AND approvals are enabled.

        This lets approvals be disabled independently of transition enforcement: when
        ``WORKFLOW_APPROVALS_ENABLED`` is off, an otherwise-allowed move applies directly.
        """
        return bool(
            self.approval_required
            and self.rule is not None
            and getattr(settings, "WORKFLOW_APPROVALS_ENABLED", True)
        )


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


def _sanitize_comment(comment: Optional[str]) -> str:
    """Sanitize an approval comment with the project's shared HTML sanitizer.

    Reuses ``validate_html_content`` (nh3) so the rules match issue/comment rich text.
    Falls back to an empty string when the input is empty or sanitization fails closed.
    """
    if not comment:
        return ""
    is_valid, _error, clean_html = validate_html_content(comment)
    if not is_valid or clean_html is None:
        # Fail closed: never persist unsanitized content.
        return ""
    return clean_html


def _approver_members(rule, project):
    """ProjectMembers who may decide on a ``rule``: role grants ∪ explicit actor grants."""
    member_ids = set()

    actor_member_ids = WorkflowTransitionActor.objects.filter(
        transition=rule, deleted_at__isnull=True
    ).values_list("member_id", flat=True)
    member_ids.update(actor_member_ids)

    if rule.allowed_roles:
        role_member_ids = ProjectMember.objects.filter(
            project=project, role__in=rule.allowed_roles, is_active=True
        ).values_list("id", flat=True)
        member_ids.update(role_member_ids)

    return list(
        ProjectMember.objects.filter(id__in=member_ids, is_active=True).distinct()
    )


def _notify(receiver_id, *, issue, actor, title, sender):
    """Create a single in-app Notification row, swallowing dispatch errors with context."""
    try:
        Notification.objects.create(
            workspace=issue.workspace,
            project=issue.project,
            receiver_id=receiver_id,
            triggered_by=actor,
            entity_identifier=issue.id,
            entity_name="issue",
            title=title,
            sender=sender,
            data={
                "issue": {
                    "id": str(issue.id),
                    "name": str(issue.name),
                }
            },
        )
    except Exception as exc:  # async-boundary dispatch must not break the decision
        logger.exception("Failed to create approval notification: %s", exc)


def _record_activity(issue, actor, verb, *, note=""):
    """Insert an IssueActivity row for an approval/rejection (no mapper exists for these)."""
    try:
        IssueActivity.objects.create(
            project=issue.project,
            issue=issue,
            actor=actor,
            verb=verb,
            field="approval",
            new_value=note,
            epoch=timezone.now().timestamp(),
        )
    except Exception as exc:
        logger.exception("Failed to record approval activity: %s", exc)


def create_approval(issue, rule, target_state_id, actor):
    """Create a pending ``WorkItemApproval`` for an approval-gated transition.

    Snapshots ``target_state`` (the requested new state) and ``fallback_state`` (from the
    rule) so a later rule edit cannot change in-flight routing. Creates one approver row
    per allowed decider and notifies each approver. Does NOT change ``issue.state_id``.
    """
    with transaction.atomic():
        approval = WorkItemApproval.objects.create(
            project=issue.project,
            issue=issue,
            transition=rule,
            requested_by=actor,
            status="pending",
            target_state_id=target_state_id,
            fallback_state=rule.fallback_state,
        )
        approvers = _approver_members(rule, issue.project)
        for member in approvers:
            WorkItemApprovalApprover.objects.create(
                project=issue.project, approval=approval, member=member, responded=False
            )

    for member in approvers:
        _notify(
            member.member_id,
            issue=issue,
            actor=actor,
            title=f"Approval requested for {issue.name}",
            sender="in_app:workflow:approval_requested",
        )

    return approval


def _apply_state(issue, state_id):
    """The gated write of ``state_id`` (shared with the WF-T5 enforcement path)."""
    issue.state_id = state_id
    issue.save(update_fields=["state_id", "updated_at"])


def apply_approval_decision(approval, approver_user, approved: bool, comment=None):
    """Record one approver's decision and resolve the approval if complete.

    Authorization: ``approver_user`` must be an assigned approver, OR a workspace admin
    (override — recorded in activity). On final approval (all approvers approved) the
    work item advances to ``target_state``. On rejection it routes to the snapshotted
    ``fallback_state`` if set, else stays put and raises ``ApprovalError`` (fail-closed —
    never a silent move).
    """
    issue = approval.issue
    project = issue.project

    is_approver = WorkItemApprovalApprover.objects.filter(
        approval=approval, member__member=approver_user, member__is_active=True
    ).exists()

    is_workspace_admin = ProjectMember.objects.filter(
        project=project, member=approver_user, is_active=True
    ).exists() and _is_workspace_admin(issue, approver_user)

    if not is_approver and not is_workspace_admin:
        raise ApprovalNotAllowed("You are not permitted to decide on this approval")

    is_override = not is_approver and is_workspace_admin
    clean_comment = _sanitize_comment(comment)

    with transaction.atomic():
        approval = WorkItemApproval.objects.select_for_update().get(id=approval.id)
        if approval.status != "pending":
            raise ApprovalError("This approval has already been resolved")

        if clean_comment:
            approval.comment = clean_comment

        # Mark the approver (or all approver rows on admin override) as responded.
        approver_rows = WorkItemApprovalApprover.objects.filter(
            approval=approval, member__member=approver_user
        )
        approver_rows.update(responded=True)

        if not approved:
            return _resolve_rejection(approval, approver_user, is_override, clean_comment)

        if is_override:
            # An admin override approves immediately, bypassing the remaining approvers.
            return _resolve_approval(approval, approver_user, is_override, clean_comment)

        all_responded = not WorkItemApprovalApprover.objects.filter(
            approval=approval, responded=False
        ).exists()
        if all_responded:
            return _resolve_approval(approval, approver_user, is_override, clean_comment)

        # Still waiting on other approvers.
        approval.save(update_fields=["comment", "updated_at"])
        return approval


def _resolve_approval(approval, actor, is_override, comment):
    issue = approval.issue
    approval.status = "approved"
    approval.decided_by = actor
    approval.decided_at = timezone.now()
    approval.save(update_fields=["status", "decided_by", "decided_at", "comment", "updated_at"])
    _apply_state(issue, approval.target_state_id)

    note = "approved (workspace-admin override)" if is_override else "approved"
    _record_activity(issue, actor, "approved", note=note)
    return approval


def _resolve_rejection(approval, actor, is_override, comment):
    issue = approval.issue

    if approval.fallback_state_id is None:
        # Fail-closed: never silently move on rejection without a fallback.
        raise ApprovalError("Approval rejected and no fallback state is configured")

    approval.status = "rejected"
    approval.decided_by = actor
    approval.decided_at = timezone.now()
    approval.save(update_fields=["status", "decided_by", "decided_at", "comment", "updated_at"])
    _apply_state(issue, approval.fallback_state_id)

    note = "rejected (workspace-admin override)" if is_override else "rejected"
    _record_activity(issue, actor, "rejected", note=note)

    # Notify the original assignee(s) and the creator about the rejection.
    receiver_ids = set(
        IssueAssignee.objects.filter(issue=issue).values_list("assignee_id", flat=True)
    )
    if issue.created_by_id:
        receiver_ids.add(issue.created_by_id)
    for receiver_id in receiver_ids:
        _notify(
            receiver_id,
            issue=issue,
            actor=actor,
            title=f"Approval rejected for {issue.name}",
            sender="in_app:workflow:approval_rejected",
        )

    return approval


def _is_workspace_admin(issue, user) -> bool:
    from plane.db.models import WorkspaceMember

    return WorkspaceMember.objects.filter(
        workspace=issue.workspace, member=user, role=20, is_active=True
    ).exists()

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class WorkflowTransition(ProjectBaseModel):
    """A permitted state transition rule for a project (optionally scoped to a work item type).

    Zero rows for a project means unrestricted transitions, so existing projects keep
    behaving exactly as before until rules are authored and ``Project.workflow_status``
    is enabled.
    """

    from_state = models.ForeignKey(
        "db.State", on_delete=models.PROTECT, related_name="outgoing_transitions"
    )
    to_state = models.ForeignKey(
        "db.State", on_delete=models.PROTECT, related_name="incoming_transitions"
    )
    # null issue_type => the project-default rule set, applied to any work item type
    issue_type = models.ForeignKey(
        "db.IssueType",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="workflow_transitions",
    )
    allowed_roles = ArrayField(models.PositiveSmallIntegerField(), default=list, blank=True)
    approval_required = models.BooleanField(default=False)
    fallback_state = models.ForeignKey(
        "db.State",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="fallback_for_transitions",
    )
    auto_assign_member = models.ForeignKey(
        "db.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="workflow_auto_assignments",
    )
    auto_assign_role = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "issue_type", "from_state", "to_state"],
                condition=Q(deleted_at__isnull=True),
                name="workflow_transition_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Workflow Transition"
        verbose_name_plural = "Workflow Transitions"
        db_table = "workflow_transitions"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.from_state_id} -> {self.to_state_id} <{self.project_id}>"


class WorkflowTransitionActor(ProjectBaseModel):
    """A specific project member granted permission to perform a transition (beyond role grants)."""

    transition = models.ForeignKey(
        WorkflowTransition, on_delete=models.CASCADE, related_name="actors"
    )
    member = models.ForeignKey(
        "db.ProjectMember", on_delete=models.CASCADE, related_name="workflow_transition_actors"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["transition", "member"],
                condition=Q(deleted_at__isnull=True),
                name="workflow_transition_actor_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Workflow Transition Actor"
        verbose_name_plural = "Workflow Transition Actors"
        db_table = "workflow_transition_actors"
        ordering = ("-created_at",)


class WorkItemApproval(ProjectBaseModel):
    """An approval request gating a work item from completing a transition that requires approval."""

    STATUS_CHOICES = [
        ("pending", "pending"),
        ("approved", "approved"),
        ("rejected", "rejected"),
    ]

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="approvals")
    transition = models.ForeignKey(
        WorkflowTransition, on_delete=models.PROTECT, related_name="approvals"
    )
    requested_by = models.ForeignKey(
        "db.User", on_delete=models.CASCADE, related_name="requested_approvals"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    decided_by = models.ForeignKey(
        "db.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="decided_approvals",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True, default="")
    # target_state is where the work item lands when approved; fallback_state snapshots the
    # rule's fallback at request time so a later rule edit cannot change in-flight routing.
    target_state = models.ForeignKey(
        "db.State", null=True, on_delete=models.SET_NULL, related_name="approval_targets"
    )
    fallback_state = models.ForeignKey(
        "db.State",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approval_fallbacks",
    )

    class Meta:
        verbose_name = "Work Item Approval"
        verbose_name_plural = "Work Item Approvals"
        db_table = "work_item_approvals"
        ordering = ("-created_at",)

    def __str__(self):
        return f"approval({self.status}) issue={self.issue_id}"


class WorkItemApprovalApprover(ProjectBaseModel):
    """A project member assigned to decide on a given approval request."""

    approval = models.ForeignKey(
        WorkItemApproval, on_delete=models.CASCADE, related_name="approvers"
    )
    member = models.ForeignKey(
        "db.ProjectMember", on_delete=models.CASCADE, related_name="approval_assignments"
    )
    responded = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Work Item Approval Approver"
        verbose_name_plural = "Work Item Approval Approvers"
        db_table = "work_item_approval_approvers"
        ordering = ("-created_at",)

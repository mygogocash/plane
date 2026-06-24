# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from plane.db.models.workspace import WorkspaceBaseModel


class AutomationRule(WorkspaceBaseModel):
    """A workspace-scoped if-then automation rule.

    ``project`` is inherited from ``WorkspaceBaseModel`` and is nullable. A null
    project means the rule applies workspace-wide.
    """

    class Trigger(models.TextChoices):
        ISSUE_CREATED = "issue_created", "Issue Created"
        ISSUE_UPDATED = "issue_updated", "Issue Updated"
        ISSUE_MENTIONED = "issue_mentioned", "Issue Mentioned"
        ISSUE_LABELED = "issue_labeled", "Issue Labeled"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    trigger = models.CharField(max_length=40, choices=Trigger.choices)
    conditions = models.JSONField(default=dict, blank=True)
    actions = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "Automation Rule"
        verbose_name_plural = "Automation Rules"
        db_table = "automation_rules"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=["workspace", "is_active", "trigger"],
                name="automation_dispatch_idx",
            ),
        ]

    def __str__(self):
        return self.name


class AutomationRun(WorkspaceBaseModel):
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        PARTIAL = "partial", "Partial"
        FAILED = "failed", "Failed"

    rule = models.ForeignKey(
        "db.AutomationRule",
        on_delete=models.CASCADE,
        related_name="runs",
    )
    triggered_by_event = models.CharField(max_length=40)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SUCCESS,
    )
    actions_applied = models.JSONField(default=list, blank=True)
    error = models.TextField(null=True, blank=True)
    entity_type = models.CharField(max_length=100, null=True, blank=True)
    entity_id = models.UUIDField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=255, null=True, blank=True, db_index=True)

    class Meta:
        verbose_name = "Automation Run"
        verbose_name_plural = "Automation Runs"
        db_table = "automation_runs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.rule_id} <{self.status}>"

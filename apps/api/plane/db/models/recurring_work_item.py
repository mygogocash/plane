# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .project import ProjectBaseModel


class RecurringWorkItem(ProjectBaseModel):
    class Frequency(models.TextChoices):
        DAILY = "daily", "Daily"
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"
        CUSTOM = "custom", "Custom"

    name = models.CharField(max_length=255)
    template = models.ForeignKey(
        "db.WorkItemTemplate",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recurring_work_items",
    )
    payload = models.JSONField(default=dict)
    frequency = models.CharField(max_length=20, choices=Frequency.choices)
    rrule = models.CharField(max_length=512, null=True, blank=True)
    timezone = models.CharField(max_length=255)
    start_date = models.DateTimeField()
    end_date = models.DateTimeField(null=True, blank=True)
    max_iterations = models.PositiveIntegerField(null=True, blank=True)
    next_run_at = models.DateTimeField()
    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_recurring_work_items",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=["project", "is_active", "next_run_at"]),
            models.Index(fields=["project", "template"]),
        ]
        verbose_name = "Recurring Work Item"
        verbose_name_plural = "Recurring Work Items"
        db_table = "recurring_work_items"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.project_id}>"


class RecurringWorkItemRun(ProjectBaseModel):
    recurring_work_item = models.ForeignKey(
        "db.RecurringWorkItem",
        on_delete=models.CASCADE,
        related_name="runs",
    )
    generated_issue = models.ForeignKey(
        "db.Issue",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recurring_runs",
    )
    run_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["recurring_work_item", "run_at"],
                name="unique_recurring_work_item_run_at",
            )
        ]
        indexes = [models.Index(fields=["project", "run_at"])]
        verbose_name = "Recurring Work Item Run"
        verbose_name_plural = "Recurring Work Item Runs"
        db_table = "recurring_work_item_runs"
        ordering = ("-run_at",)

    def __str__(self):
        return f"{self.recurring_work_item_id} @ {self.run_at}"

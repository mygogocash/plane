# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .project import ProjectBaseModel


class AgentRun(ProjectBaseModel):
    """An auditable record of a requested AI agent run.

    v1 is intentionally non-autonomous: a run is only ever recorded and surfaced in
    issue activity. Status transitions are tracked, but no work-item mutation is
    performed by requesting or cancelling a run.
    """

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="agent_runs")
    agent_key = models.CharField(max_length=255)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_agent_runs",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    input = models.JSONField(default=dict)
    result = models.JSONField(null=True, blank=True)
    error = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Agent Run"
        verbose_name_plural = "Agent Runs"
        db_table = "agent_runs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.agent_key} <{self.status}>"

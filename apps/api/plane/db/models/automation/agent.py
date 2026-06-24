# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models.functions import Lower

# Module imports
from plane.db.models.workspace import WorkspaceBaseModel


class AutomationAgent(WorkspaceBaseModel):
    """A named automation agent. Agent names are unique per workspace,
    case-insensitively, so ``@Triage`` and ``@triage`` resolve to the same agent.
    """

    class Scope(models.TextChoices):
        READ_ONLY = "read_only", "Read Only"
        WRITE = "write", "Write"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    scope = models.CharField(
        max_length=20,
        choices=Scope.choices,
        default=Scope.READ_ONLY,
    )
    allowed_actions = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Automation Agent"
        verbose_name_plural = "Automation Agents"
        db_table = "automation_agents"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "workspace",
                condition=models.Q(deleted_at__isnull=True),
                name="automation_agent_unique_name_per_workspace",
            )
        ]

    def __str__(self):
        return self.name


class AgentMention(WorkspaceBaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        ABORTED = "aborted", "Aborted"

    agent = models.ForeignKey(
        "db.AutomationAgent",
        on_delete=models.CASCADE,
        related_name="mentions",
    )
    source_type = models.CharField(max_length=40)
    source_id = models.UUIDField(null=True, blank=True)
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="agent_mentions",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    response = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Agent Mention"
        verbose_name_plural = "Agent Mentions"
        db_table = "agent_mentions"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.agent_id} <{self.status}>"

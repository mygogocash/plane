# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports

# Django imports
from django.db import models

# Module imports
from plane.db.fields import SecretField
from plane.db.models.project import ProjectBaseModel


class SlackProjectSync(ProjectBaseModel):
    access_token = models.CharField(max_length=300)
    scopes = models.TextField()
    bot_user_id = models.CharField(max_length=50)
    webhook_url = models.URLField(max_length=1000)
    data = models.JSONField(default=dict)
    team_id = models.CharField(max_length=30)
    team_name = models.CharField(max_length=300)
    # Slack app signing secret, used to verify inbound event signatures.
    # Encrypted at rest; never echoed back through the API.
    signing_secret = SecretField(blank=True, default="")
    workspace_integration = models.ForeignKey(
        "db.WorkspaceIntegration", related_name="slack_syncs", on_delete=models.CASCADE
    )

    def __str__(self):
        """Return the repo name"""
        return f"{self.project.name}"

    class Meta:
        unique_together = ["team_id", "project"]
        verbose_name = "Slack Project Sync"
        verbose_name_plural = "Slack Project Syncs"
        db_table = "slack_project_syncs"
        ordering = ("-created_at",)


class SlackChannelBinding(ProjectBaseModel):
    """A channel binding under a :class:`SlackProjectSync`."""

    class Direction(models.TextChoices):
        INBOUND = "inbound", "Inbound"
        OUTBOUND = "outbound", "Outbound"

    class Kind(models.TextChoices):
        REQUEST = "request", "Request"
        SUMMARY = "summary", "Summary"
        ALERT = "alert", "Alert"

    slack_project_sync = models.ForeignKey(
        "db.SlackProjectSync",
        related_name="channel_bindings",
        on_delete=models.CASCADE,
    )
    channel_id = models.CharField(max_length=100)
    direction = models.CharField(max_length=20, choices=Direction.choices)
    schedule = models.CharField(max_length=120, null=True, blank=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)

    class Meta:
        verbose_name = "Slack Channel Binding"
        verbose_name_plural = "Slack Channel Bindings"
        db_table = "slack_channel_bindings"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.channel_id} <{self.direction}>"

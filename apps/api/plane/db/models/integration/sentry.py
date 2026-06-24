# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from plane.db.fields import SecretField
from plane.db.models.project import ProjectBaseModel


class SentryProjectSync(ProjectBaseModel):
    """Sentry connector config for a project. Mirrors :class:`SlackProjectSync`.

    ``webhook_secret`` is encrypted at rest via :class:`SecretField` and is
    never stored or returned as plaintext from the database column.
    """

    webhook_secret = SecretField(blank=True, default="")
    severity_map = models.JSONField(default=dict, blank=True)
    default_assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sentry_default_assignee",
    )
    workspace_integration = models.ForeignKey(
        "db.WorkspaceIntegration",
        related_name="sentry_syncs",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = "Sentry Project Sync"
        verbose_name_plural = "Sentry Project Syncs"
        db_table = "sentry_project_syncs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project.name}"

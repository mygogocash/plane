# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from ..base import BaseModel
from ..project import Project, ProjectBaseModel


class AISummary(ProjectBaseModel):
    class EntityType(models.TextChoices):
        CYCLE = "cycle", "Cycle"
        PROJECT = "project", "Project"
        INITIATIVE = "initiative", "Initiative"

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="project_%(class)s",
        null=True,
        blank=True,
    )
    entity_type = models.CharField(max_length=20, choices=EntityType.choices)
    entity_id = models.UUIDField()
    markdown = models.TextField(blank=True, default="")
    rollup = models.JSONField(default=dict, blank=True)
    share_token = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    share_expires_at = models.DateTimeField(null=True, blank=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_ai_summaries",
    )

    class Meta:
        verbose_name = "AI Summary"
        verbose_name_plural = "AI Summaries"
        db_table = "ai_summaries"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if self.project_id:
            self.workspace = self.project.workspace
        elif not self.workspace_id:
            raise ValidationError("workspace is required when project is not set")
        BaseModel.save(self, *args, **kwargs)

    def __str__(self):
        return f"{self.entity_type}:{self.entity_id}"

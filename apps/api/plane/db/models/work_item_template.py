# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from .project import ProjectBaseModel


class WorkItemTemplate(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description_html = models.TextField(default="<p></p>")
    template_data = models.JSONField(default=dict)
    issue_type = models.ForeignKey(
        "db.IssueType",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="templates",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [models.Index(fields=["project", "issue_type"])]
        verbose_name = "Work Item Template"
        verbose_name_plural = "Work Item Templates"
        db_table = "work_item_templates"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.project_id}>"

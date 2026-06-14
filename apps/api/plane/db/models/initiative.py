# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

# Module imports
from .base import BaseModel


class Initiative(BaseModel):
    class State(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PLANNED = "PLANNED", "Planned"
        ACTIVE = "ACTIVE", "Active"
        COMPLETED = "COMPLETED", "Completed"
        CLOSED = "CLOSED", "Closed"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="initiatives")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    description_json = models.JSONField(blank=True, default=dict)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    lead = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="led_initiatives",
        null=True,
        blank=True,
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    state = models.CharField(max_length=20, choices=State.choices, default=State.DRAFT)
    sort_order = models.FloatField(default=65535)
    logo_props = models.JSONField(default=dict, blank=True)
    progress_snapshot = models.JSONField(default=dict, blank=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Initiative"
        verbose_name_plural = "Initiatives"
        db_table = "initiatives"
        ordering = ("sort_order", "-created_at")

    def __str__(self):
        return self.name


class InitiativeEpic(BaseModel):
    initiative = models.ForeignKey("db.Initiative", on_delete=models.CASCADE, related_name="epic_members")
    epic = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="initiative_memberships")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["initiative", "epic"],
                condition=Q(deleted_at__isnull=True),
                name="initiative_epic_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Initiative Epic"
        verbose_name_plural = "Initiative Epics"
        db_table = "initiative_epics"
        ordering = ("-created_at",)

    def clean(self):
        if self.initiative_id and self.epic_id and self.initiative.workspace_id != self.epic.workspace_id:
            raise ValidationError({"epic": "Epic must belong to the initiative workspace."})
        if self.epic_id and (self.epic.type_id is None or not self.epic.type.is_epic):
            raise ValidationError({"epic": "Initiative members must be epic work items."})

    def save(self, *args, **kwargs):
        self.clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.initiative_id} / {self.epic_id}"


class InitiativeProject(BaseModel):
    initiative = models.ForeignKey("db.Initiative", on_delete=models.CASCADE, related_name="project_members")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="initiative_memberships")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["initiative", "project"],
                condition=Q(deleted_at__isnull=True),
                name="initiative_project_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Initiative Project"
        verbose_name_plural = "Initiative Projects"
        db_table = "initiative_projects"
        ordering = ("-created_at",)

    def clean(self):
        if self.initiative_id and self.project_id and self.initiative.workspace_id != self.project.workspace_id:
            raise ValidationError({"project": "Project must belong to the initiative workspace."})

    def save(self, *args, **kwargs):
        self.clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.initiative_id} / {self.project_id}"


class InitiativeLabel(BaseModel):
    initiative = models.ForeignKey("db.Initiative", on_delete=models.CASCADE, related_name="label_members")
    label = models.ForeignKey("db.Label", on_delete=models.CASCADE, related_name="initiative_memberships")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["initiative", "label"],
                condition=Q(deleted_at__isnull=True),
                name="initiative_label_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Initiative Label"
        verbose_name_plural = "Initiative Labels"
        db_table = "initiative_labels"
        ordering = ("-created_at",)

    def clean(self):
        if self.initiative_id and self.label_id and self.initiative.workspace_id != self.label.workspace_id:
            raise ValidationError({"label": "Label must belong to the initiative workspace."})

    def save(self, *args, **kwargs):
        self.clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.initiative_id} / {self.label_id}"

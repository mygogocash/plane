# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

# Module imports
from plane.utils.html_processor import strip_tags
from .base import BaseModel


class StatusUpdate(BaseModel):
    class Status(models.TextChoices):
        ON_TRACK = "ON_TRACK", "On Track"
        AT_RISK = "AT_RISK", "At Risk"
        OFF_TRACK = "OFF_TRACK", "Off Track"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="status_updates")
    epic = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="status_updates",
        null=True,
        blank=True,
    )
    initiative = models.ForeignKey(
        "db.Initiative",
        on_delete=models.CASCADE,
        related_name="status_updates",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=Status.choices)
    comment_stripped = models.TextField(verbose_name="Comment", blank=True)
    comment_json = models.JSONField(blank=True, default=dict)
    comment_html = models.TextField(blank=True, default="<p></p>")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="replies")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="status_updates",
        null=True,
        blank=True,
    )

    def clean(self):
        if self.epic_id and self.workspace_id and self.epic.workspace_id != self.workspace_id:
            raise ValidationError({"epic": "Epic must belong to the status update workspace."})
        if self.initiative_id and self.workspace_id and self.initiative.workspace_id != self.workspace_id:
            raise ValidationError({"initiative": "Initiative must belong to the status update workspace."})
        if self.parent_id and self.workspace_id and self.parent.workspace_id != self.workspace_id:
            raise ValidationError({"parent": "Parent status update must belong to the same workspace."})
        if self.parent_id and (self.epic_id != self.parent.epic_id or self.initiative_id != self.parent.initiative_id):
            raise ValidationError({"parent": "Parent status update must belong to the same owner."})

    def save(self, *args, **kwargs):
        self.comment_stripped = strip_tags(self.comment_html) if self.comment_html != "" else ""
        if self.deleted_at is None:
            self.clean()
        return super().save(*args, **kwargs)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(epic__isnull=False, initiative__isnull=True) | Q(epic__isnull=True, initiative__isnull=False)
                ),
                name="status_update_epic_xor_initiative",
            )
        ]
        verbose_name = "Status Update"
        verbose_name_plural = "Status Updates"
        db_table = "status_updates"
        ordering = ("-created_at",)

    def __str__(self):
        return str(self.id)


class StatusUpdateReaction(BaseModel):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="status_update_reactions",
    )
    status_update = models.ForeignKey(
        "db.StatusUpdate",
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    reaction = models.TextField()

    class Meta:
        unique_together = ["status_update", "actor", "reaction", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["status_update", "actor", "reaction"],
                condition=Q(deleted_at__isnull=True),
                name="status_update_reaction_unique_active",
            )
        ]
        verbose_name = "Status Update Reaction"
        verbose_name_plural = "Status Update Reactions"
        db_table = "status_update_reactions"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.status_update_id} {self.actor.email}"

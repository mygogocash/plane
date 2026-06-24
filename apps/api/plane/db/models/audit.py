# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Append-only audit trail shared by every mutating AI feature.

``AuditLog`` rows are immutable by convention: once written, ``action`` and
``changes`` must never be mutated. The ``save`` override enforces this by
rejecting updates to an already-persisted row.
"""

# Python imports
import uuid

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from ..mixins import TimeAuditModel


class AuditLog(TimeAuditModel):
    class ActorType(models.TextChoices):
        USER = "user", "User"
        AGENT = "agent", "Agent"
        SYSTEM = "system", "System"

    id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        db_index=True,
        primary_key=True,
    )
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="audit_logs",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    actor_type = models.CharField(
        max_length=20,
        choices=ActorType.choices,
        default=ActorType.USER,
    )
    action = models.CharField(max_length=255)
    entity_type = models.CharField(max_length=100)
    entity_id = models.UUIDField(null=True, blank=True)
    changes = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
        db_table = "audit_logs"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["workspace", "entity_type", "entity_id"]),
        ]

    def save(self, *args, **kwargs):
        # Append-only: reject any attempt to mutate an existing audit row.
        if not self._state.adding:
            raise ValueError("AuditLog is append-only and cannot be modified.")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.action} <{self.entity_type}:{self.entity_id}>"

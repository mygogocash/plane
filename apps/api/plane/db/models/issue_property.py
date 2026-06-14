# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .base import BaseModel
from .project import ProjectBaseModel


class IssueProperty(BaseModel):
    class PropertyType(models.TextChoices):
        TEXT = "text", "Text"
        OPTION = "option", "Option"
        NUMBER = "number", "Number"
        DATE = "date", "Date"
        SELECT = "select", "Select"
        MULTI_SELECT = "multi_select", "Multi Select"
        BOOLEAN = "boolean", "Boolean"
        MEMBER = "member", "Member"
        URL = "url", "URL"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="issue_properties")
    issue_type = models.ForeignKey("db.IssueType", on_delete=models.CASCADE, related_name="properties")
    name = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    property_type = models.CharField(max_length=32, choices=PropertyType.choices)
    settings = models.JSONField(default=dict, blank=True)
    is_multi = models.BooleanField(default=False)
    is_required = models.BooleanField(default=False)
    default_value = models.JSONField(null=True, blank=True)
    sort_order = models.FloatField(default=65535)
    is_active = models.BooleanField(default=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        unique_together = ["issue_type", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue_type", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_unique_type_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Issue Property"
        verbose_name_plural = "Issue Properties"
        db_table = "issue_properties"
        ordering = ("sort_order", "created_at")

    def save(self, *args, **kwargs):
        self.workspace = self.issue_type.workspace
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.display_name} <{self.issue_type_id}>"


class IssuePropertyOption(BaseModel):
    property = models.ForeignKey("db.IssueProperty", on_delete=models.CASCADE, related_name="options")
    name = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)
    is_default = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Issue Property Option"
        verbose_name_plural = "Issue Property Options"
        db_table = "issue_property_options"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return f"{self.name} <{self.property_id}>"


class IssuePropertyValue(ProjectBaseModel):
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="property_values")
    property = models.ForeignKey("db.IssueProperty", on_delete=models.CASCADE, related_name="values")
    value = models.JSONField(null=True, blank=True)
    value_text = models.TextField(null=True, blank=True)
    value_option = models.ForeignKey(
        "db.IssuePropertyOption",
        on_delete=models.CASCADE,
        related_name="values",
        null=True,
        blank=True,
    )
    value_uuid = models.UUIDField(null=True, blank=True)

    class Meta:
        unique_together = ["issue", "property", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "property"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_value_unique_issue_property_when_deleted_at_null",
            )
        ]
        verbose_name = "Issue Property Value"
        verbose_name_plural = "Issue Property Values"
        db_table = "issue_property_values"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} / {self.property_id}"

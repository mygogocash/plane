# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils.html import strip_tags

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import ProjectIssueType, WorkItemTemplate


class WorkItemTemplateSerializer(BaseSerializer):
    class Meta:
        model = WorkItemTemplate
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "name",
            "description_html",
            "template_data",
            "issue_type",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project"]

    def validate_name(self, value):
        if value is None or not value.strip():
            raise serializers.ValidationError("required")
        return value.strip()

    def validate_description_html(self, value):
        return strip_tags(value or "<p></p>")

    def validate_issue_type(self, value):
        project_id = self.context.get("project_id")
        if value is not None and project_id is not None:
            if not ProjectIssueType.objects.filter(project_id=project_id, issue_type=value).exists():
                raise serializers.ValidationError("issue_type_not_for_project")
        return value

    def validate_template_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("must_be_object")

        property_values = value.get("property_values")
        if isinstance(property_values, dict):
            value = value.copy()
            value["property_values"] = {
                property_id: strip_tags(property_value) if isinstance(property_value, str) else property_value
                for property_id, property_value in property_values.items()
            }
        return value

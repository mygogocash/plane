# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import Initiative, User, WorkspaceMember
from plane.utils.content_validator import validate_html_content
from plane.utils.html_processor import strip_tags


class InitiativeSerializer(BaseSerializer):
    lead_id = serializers.PrimaryKeyRelatedField(
        source="lead",
        queryset=User.objects.all(),
        required=False,
        allow_null=True,
    )
    progress = serializers.JSONField(read_only=True, required=False)

    class Meta:
        model = Initiative
        fields = [
            "id",
            "name",
            "description",
            "description_json",
            "description_html",
            "description_stripped",
            "lead_id",
            "start_date",
            "end_date",
            "state",
            "sort_order",
            "logo_props",
            "progress_snapshot",
            "progress",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "progress_snapshot",
            "progress",
        ]

    def validate_description_html(self, value):
        if not value:
            return value

        is_valid, error_msg, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(error_msg or "html content is not valid")
        return sanitized_html if sanitized_html is not None else value

    def validate(self, attrs):
        if (
            attrs.get("start_date") is not None
            and attrs.get("end_date") is not None
            and attrs["start_date"] > attrs["end_date"]
        ):
            raise serializers.ValidationError({"end_date": "End date cannot be before start date"})

        workspace = self.context.get("workspace")
        lead = attrs.get("lead")
        if lead is not None and workspace is not None:
            lead_is_member = WorkspaceMember.objects.filter(
                workspace=workspace,
                member=lead,
                is_active=True,
            ).exists()
            if not lead_is_member:
                raise serializers.ValidationError({"lead_id": "Lead must belong to the workspace"})

        if "description_html" in attrs:
            attrs["description_stripped"] = strip_tags(attrs.get("description_html") or "")

        return attrs

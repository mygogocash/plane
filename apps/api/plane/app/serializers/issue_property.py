# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueProperty


class IssuePropertySerializer(BaseSerializer):
    class Meta:
        model = IssueProperty
        fields = [
            "id",
            "workspace_id",
            "issue_type",
            "name",
            "display_name",
            "description",
            "property_type",
            "settings",
            "is_multi",
            "is_required",
            "default_value",
            "sort_order",
            "is_active",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace_id", "issue_type"]

    def validate(self, attrs):
        property_type = attrs.get(
            "property_type",
            self.instance.property_type if self.instance else None,
        )
        settings = attrs.get("settings", self.instance.settings if self.instance else {})

        if property_type in [
            IssueProperty.PropertyType.OPTION,
            IssueProperty.PropertyType.SELECT,
            IssueProperty.PropertyType.MULTI_SELECT,
        ] and not settings.get("options"):
            raise serializers.ValidationError({"settings": {"options": "required"}})

        return attrs

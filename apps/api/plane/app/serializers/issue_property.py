# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueProperty, IssuePropertyOption


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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        options = instance.options.filter(deleted_at__isnull=True).order_by("sort_order", "created_at")
        if options.exists():
            data["settings"] = {
                **(data.get("settings") or {}),
                "options": [
                    {
                        "id": option.id,
                        "is_default": option.is_default,
                        "label": option.name,
                        "name": option.name,
                        "sort_order": option.sort_order,
                        "value": option.id,
                    }
                    for option in options
                ],
            }
        return data

    def validate(self, attrs):
        property_type = attrs.get(
            "property_type",
            self.instance.property_type if self.instance else None,
        )
        settings = attrs.get("settings", self.instance.settings if self.instance else {})

        if property_type in [IssueProperty.PropertyType.SELECT, IssueProperty.PropertyType.MULTI_SELECT] and not (
            settings.get("options")
        ):
            raise serializers.ValidationError({"settings": {"options": "required"}})

        return attrs


class IssuePropertyOptionSerializer(BaseSerializer):
    class Meta:
        model = IssuePropertyOption
        fields = [
            "id",
            "property",
            "name",
            "sort_order",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["property"]

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import BaseSerializer
from .issue import IssueCreateSerializer
from plane.db.models import Issue, IssueAssignee, IssueLabel, ModuleIssue, ProjectIssueType


class EpicWriteSerializer(IssueCreateSerializer):
    def validate(self, attrs):
        if attrs.get("type") is None and self.instance is None and self.context.get("epic_type") is not None:
            attrs["type"] = self.context["epic_type"]

        attrs = super().validate(attrs)
        project_id = self.context.get("project_id")
        epic_type = attrs.get("type") or (self.instance and self.instance.type) or self.context.get("epic_type")

        if epic_type is None:
            raise serializers.ValidationError({"type": "epic_type_not_configured"})

        if not epic_type.is_epic:
            raise serializers.ValidationError({"type": "issue_type_must_be_epic"})

        if project_id and not ProjectIssueType.objects.filter(project_id=project_id, issue_type=epic_type).exists():
            raise serializers.ValidationError({"type": "issue_type_not_for_project"})

        attrs["type"] = epic_type
        return attrs


class EpicSerializer(BaseSerializer):
    assignee_ids = serializers.SerializerMethodField()
    attachment_count = serializers.SerializerMethodField()
    cycle_id = serializers.SerializerMethodField()
    is_epic = serializers.SerializerMethodField()
    is_recurring = serializers.SerializerMethodField()
    label_ids = serializers.SerializerMethodField()
    link_count = serializers.SerializerMethodField()
    module_ids = serializers.SerializerMethodField()
    property_values = serializers.SerializerMethodField()
    state_id = serializers.UUIDField(read_only=True, allow_null=True)
    sub_issues_count = serializers.SerializerMethodField()
    type_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "description_html",
            "description_stripped",
            "state_id",
            "sort_order",
            "completed_at",
            "estimate_point",
            "priority",
            "start_date",
            "target_date",
            "sequence_id",
            "project_id",
            "parent_id",
            "cycle_id",
            "module_ids",
            "label_ids",
            "assignee_ids",
            "sub_issues_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "attachment_count",
            "link_count",
            "is_recurring",
            "is_draft",
            "is_epic",
            "archived_at",
            "property_values",
            "type_id",
        ]
        read_only_fields = fields

    def get_assignee_ids(self, obj):
        return list(
            IssueAssignee.objects.filter(issue=obj, deleted_at__isnull=True).values_list("assignee_id", flat=True)
        )

    def get_attachment_count(self, obj):
        return 0

    def get_cycle_id(self, obj):
        return None

    def get_is_epic(self, obj):
        return bool(obj.type and obj.type.is_epic)

    def get_is_recurring(self, obj):
        return False

    def get_label_ids(self, obj):
        return list(IssueLabel.objects.filter(issue=obj, deleted_at__isnull=True).values_list("label_id", flat=True))

    def get_link_count(self, obj):
        return 0

    def get_module_ids(self, obj):
        return list(ModuleIssue.objects.filter(issue=obj, deleted_at__isnull=True).values_list("module_id", flat=True))

    def get_property_values(self, obj):
        return {str(value.property_id): value.value for value in obj.property_values.all()}

    def get_sub_issues_count(self, obj):
        return Issue.issue_objects.filter(parent=obj).count()

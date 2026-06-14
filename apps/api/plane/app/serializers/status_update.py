# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import StatusUpdate, StatusUpdateReaction
from plane.utils.content_validator import validate_html_content
from .base import BaseSerializer
from .user import UserLiteSerializer


class StatusUpdateReactionSerializer(BaseSerializer):
    display_name = serializers.CharField(source="actor.display_name", read_only=True)

    class Meta:
        model = StatusUpdateReaction
        fields = [
            "id",
            "actor",
            "status_update",
            "reaction",
            "display_name",
            "deleted_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "actor",
            "status_update",
            "deleted_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class StatusUpdateSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")
    reactions = StatusUpdateReactionSerializer(read_only=True, many=True)

    class Meta:
        model = StatusUpdate
        fields = [
            "id",
            "workspace",
            "epic",
            "initiative",
            "status",
            "comment_html",
            "comment_stripped",
            "comment_json",
            "parent",
            "actor",
            "actor_detail",
            "reactions",
            "deleted_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "workspace",
            "epic",
            "initiative",
            "comment_stripped",
            "actor",
            "actor_detail",
            "reactions",
            "deleted_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate_comment_html(self, value):
        if not value:
            return value

        is_valid, error_msg, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(error_msg or "html content is not valid")
        return sanitized_html if sanitized_html is not None else value

    def validate(self, attrs):
        parent = attrs.get("parent")
        if parent is None:
            return attrs

        epic = self.context.get("epic")
        initiative = self.context.get("initiative")
        if epic is not None and parent.epic_id != epic.id:
            raise serializers.ValidationError({"parent": "Parent status update must belong to the epic"})
        if initiative is not None and parent.initiative_id != initiative.id:
            raise serializers.ValidationError({"parent": "Parent status update must belong to the initiative"})
        return attrs

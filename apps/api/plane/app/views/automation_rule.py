# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Automation rule CRUD endpoints (ADMIN only) — AI-T13.

Rules are workspace-scoped. A null ``project`` means the rule applies
workspace-wide; a non-null ``project`` scopes it to that project. Every read
and write is scoped to the caller's workspace. Rules must declare at least one
allowlisted action (reusing the shared ``validate_actions_payload`` allowlist
from ``plane.utils.automation_actions``).
"""

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import AutomationRule, Project, Workspace
from plane.utils.automation_actions import validate_actions_payload

from .base import BaseAPIView


class AutomationRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationRule
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "trigger",
            "conditions",
            "actions",
            "project",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Rule name is required.")
        return value

    def validate_actions(self, value):
        # Reuse the shared allowlist; reject empty/non-allowlisted action lists.
        try:
            return validate_actions_payload(value)
        except serializers.ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict) and "actions" in detail:
                raise serializers.ValidationError(detail["actions"])
            raise


def _resolve_scoped_project(workspace, project):
    """Return ``(project_or_none, error_response_or_none)``.

    A project, when supplied, must belong to the caller's workspace.
    """
    if project is None:
        return None, None
    if project.workspace_id != workspace.id:
        return None, Response(
            {"error": "Project does not belong to this workspace."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return project, None


class AutomationRuleListEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        rules = AutomationRule.objects.filter(workspace__slug=slug).order_by("-created_at")
        return Response(AutomationRuleSerializer(rules, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = AutomationRuleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        project, error = _resolve_scoped_project(workspace, serializer.validated_data.get("project"))
        if error is not None:
            return error

        rule = serializer.save(workspace=workspace, project=project)
        return Response(AutomationRuleSerializer(rule).data, status=status.HTTP_201_CREATED)


class AutomationRuleDetailEndpoint(BaseAPIView):
    def _get_rule(self, slug, rule_id):
        return AutomationRule.objects.filter(workspace__slug=slug, id=rule_id).first()

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, rule_id):
        rule = self._get_rule(slug, rule_id)
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(AutomationRuleSerializer(rule).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, rule_id):
        rule = self._get_rule(slug, rule_id)
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = AutomationRuleSerializer(rule, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if "project" in serializer.validated_data:
            project, error = _resolve_scoped_project(rule.workspace, serializer.validated_data.get("project"))
            if error is not None:
                return error
            rule = serializer.save(project=project)
        else:
            rule = serializer.save()

        return Response(AutomationRuleSerializer(rule).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, rule_id):
        rule = self._get_rule(slug, rule_id)
        if rule is None:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

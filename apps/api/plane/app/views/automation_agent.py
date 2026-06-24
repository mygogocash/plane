# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Agent CRUD endpoints (ADMIN only).

Agents are workspace-scoped with a case-insensitive unique name. The
``read_only`` write-guardrail is enforced server-side in
``plane.utils.automation_actions`` (not here), so the API surface only manages
agent configuration.
"""

# Django imports
from django.db import IntegrityError

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import AutomationAgent, Workspace
from plane.utils.automation_actions import WRITE_ACTION_TYPES

from .base import BaseAPIView


class AutomationAgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationAgent
        fields = [
            "id",
            "name",
            "description",
            "scope",
            "allowed_actions",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Agent name is required.")
        return value

    def validate_allowed_actions(self, value):
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("allowed_actions must be a list.")
        invalid = [action for action in value if action not in WRITE_ACTION_TYPES]
        if invalid:
            raise serializers.ValidationError(f"Unsupported actions: {', '.join(map(str, invalid))}.")
        return value


def _duplicate_name_exists(workspace, name, exclude_id=None):
    queryset = AutomationAgent.objects.filter(workspace=workspace, name__iexact=name)
    if exclude_id:
        queryset = queryset.exclude(id=exclude_id)
    return queryset.exists()


class AutomationAgentListEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        agents = AutomationAgent.objects.filter(workspace__slug=slug).order_by("-created_at")
        return Response(AutomationAgentSerializer(agents, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = AutomationAgentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        name = serializer.validated_data["name"]
        if _duplicate_name_exists(workspace, name):
            return Response(
                {"error": "An agent with this name already exists in the workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            agent = serializer.save(workspace=workspace)
        except IntegrityError:
            return Response(
                {"error": "An agent with this name already exists in the workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(AutomationAgentSerializer(agent).data, status=status.HTTP_201_CREATED)


class AutomationAgentDetailEndpoint(BaseAPIView):
    def _get_agent(self, slug, agent_id):
        return AutomationAgent.objects.filter(workspace__slug=slug, id=agent_id).first()

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, agent_id):
        agent = self._get_agent(slug, agent_id)
        if agent is None:
            return Response({"error": "Agent not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(AutomationAgentSerializer(agent).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, agent_id):
        agent = self._get_agent(slug, agent_id)
        if agent is None:
            return Response({"error": "Agent not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = AutomationAgentSerializer(agent, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        name = serializer.validated_data.get("name")
        if name and _duplicate_name_exists(agent.workspace, name, exclude_id=agent.id):
            return Response(
                {"error": "An agent with this name already exists in the workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            agent = serializer.save()
        except IntegrityError:
            return Response(
                {"error": "An agent with this name already exists in the workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(AutomationAgentSerializer(agent).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, agent_id):
        agent = self._get_agent(slug, agent_id)
        if agent is None:
            return Response({"error": "Agent not found"}, status=status.HTTP_404_NOT_FOUND)
        agent.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers, status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.external.base import get_llm_config, is_llm_configured
from plane.db.models import Cycle, Initiative, Issue, Project, ProjectMember, WorkspaceMember
from plane.utils.context_assist import (
    empty_context_assist_payload,
    gather_context_for_cycle,
    gather_context_for_initiative,
    gather_context_for_issue,
    gather_context_for_project,
    generate_suggested_follow_ups,
)

from .base import BaseAPIView


class CopilotContextAssistSerializer(serializers.Serializer):
    entity_type = serializers.ChoiceField(
        choices=("issue", "cycle", "project", "initiative"),
        required=False,
        allow_null=True,
    )
    entity_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        entity_type = attrs.get("entity_type")
        entity_id = attrs.get("entity_id")
        if entity_type and not entity_id:
            raise serializers.ValidationError({"entity_id": "entity_id is required when entity_type is provided."})
        if entity_id and not entity_type:
            raise serializers.ValidationError({"entity_type": "entity_type is required when entity_id is provided."})
        return attrs


def _has_project_access(user, project_id):
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=user,
        is_active=True,
    ).exists()


def _resolve_entity(slug, user, entity_type, entity_id):
    if entity_type == "issue":
        issue = Issue.issue_objects.filter(id=entity_id, workspace__slug=slug).select_related("project").first()
        if issue is None:
            return None, Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _has_project_access(user, issue.project_id):
            return None, Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return ("issue", issue), None

    if entity_type == "project":
        project = Project.objects.filter(id=entity_id, workspace__slug=slug).first()
        if project is None:
            return None, Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _has_project_access(user, project.id):
            return None, Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return ("project", project), None

    if entity_type == "cycle":
        cycle = Cycle.objects.filter(id=entity_id, workspace__slug=slug).select_related("project").first()
        if cycle is None:
            return None, Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)
        if not _has_project_access(user, cycle.project_id):
            return None, Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return ("cycle", cycle), None

    initiative = Initiative.objects.filter(id=entity_id, workspace__slug=slug).first()
    if initiative is None:
        return None, Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)
    if not WorkspaceMember.objects.filter(
        workspace__slug=slug,
        member=user,
        is_active=True,
        role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
    ).exists():
        return None, Response(
            {"error": "You don't have the required permissions."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return ("initiative", initiative), None


class CopilotContextAssistEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        serializer = CopilotContextAssistSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        api_key, model, provider = get_llm_config()
        if not is_llm_configured(api_key, model, provider):
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entity_type = serializer.validated_data.get("entity_type")
        entity_id = serializer.validated_data.get("entity_id")
        if not entity_type or not entity_id:
            return Response(empty_context_assist_payload(), status=status.HTTP_200_OK)

        resolved, error_response = _resolve_entity(slug, request.user, entity_type, entity_id)
        if error_response is not None:
            return error_response

        resolved_type, entity = resolved
        if resolved_type == "issue":
            context = gather_context_for_issue(slug=slug, issue=entity)
        elif resolved_type == "project":
            context = gather_context_for_project(slug=slug, project=entity)
        elif resolved_type == "cycle":
            context = gather_context_for_cycle(slug=slug, cycle=entity)
        else:
            context = gather_context_for_initiative(slug=slug, initiative=entity)

        follow_ups = generate_suggested_follow_ups(
            context["blockers"],
            context["at_risk"],
            context["recent_changes"],
            api_key,
            model,
            provider,
        )
        return Response(
            {
                **context,
                "suggested_follow_ups": follow_ups,
            },
            status=status.HTTP_200_OK,
        )

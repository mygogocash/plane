# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.external.base import get_llm_config, is_llm_configured
from plane.db.models import AISummary, Cycle, Initiative, Project, ProjectMember
from plane.utils.ai_summaries import (
    SHARE_NOT_FOUND_ERROR,
    build_public_shared_summary_payload,
    build_shared_summary_response,
    build_summary_payload,
    compute_cycle_rollup,
    compute_initiative_rollup,
    compute_project_rollup,
    get_active_shared_summary,
    persist_shared_summary,
)

from .base import BaseAPIView


def _llm_not_configured_response():
    return Response(
        {"error": "LLM provider API key and model are required"},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _project_member_response(request, project_id):
    if ProjectMember.objects.filter(
        member=request.user,
        project_id=project_id,
        is_active=True,
        role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
    ).exists():
        return None

    return Response(
        {"error": "You don't have the required permissions."},
        status=status.HTTP_403_FORBIDDEN,
    )


def _summarize_entity(*, entity_label, rollup, is_empty):
    api_key, model, provider = get_llm_config()
    if not is_llm_configured(api_key, model, provider):
        return None, _llm_not_configured_response()

    payload, error = build_summary_payload(
        entity_label=entity_label,
        rollup=rollup,
        is_empty=is_empty,
        api_key=api_key,
        model=model,
        provider=provider,
    )
    if error:
        return None, Response(
            {"error": "An internal error has occurred."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return payload, None


def _create_shared_summary(request, slug, *, workspace, project, entity_type, entity_id, entity_label, rollup, is_empty):
    payload, error_response = _summarize_entity(
        entity_label=entity_label,
        rollup=rollup,
        is_empty=is_empty,
    )
    if error_response is not None:
        return error_response

    summary = persist_shared_summary(
        workspace=workspace,
        project=project,
        entity_type=entity_type,
        entity_id=entity_id,
        markdown=payload["markdown"],
        rollup=payload["rollup"],
        generated_by=request.user,
    )
    return Response(
        build_shared_summary_response(slug=slug, payload=payload, summary=summary),
        status=status.HTTP_200_OK,
    )


class CycleSummarizeEndpoint(BaseAPIView):
    def post(self, request, slug, cycle_id):
        cycle = Cycle.objects.filter(workspace__slug=slug, id=cycle_id).first()
        if cycle is None:
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)

        permission_response = _project_member_response(request, cycle.project_id)
        if permission_response is not None:
            return permission_response

        rollup, is_empty = compute_cycle_rollup(cycle)
        payload, error_response = _summarize_entity(
            entity_label=f"cycle {cycle.name}",
            rollup=rollup,
            is_empty=is_empty,
        )
        if error_response is not None:
            return error_response

        return Response(payload, status=status.HTTP_200_OK)


class CycleSummarizeShareEndpoint(BaseAPIView):
    def post(self, request, slug, cycle_id):
        cycle = Cycle.objects.filter(workspace__slug=slug, id=cycle_id).select_related("workspace", "project").first()
        if cycle is None:
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)

        permission_response = _project_member_response(request, cycle.project_id)
        if permission_response is not None:
            return permission_response

        rollup, is_empty = compute_cycle_rollup(cycle)
        return _create_shared_summary(
            request,
            slug,
            workspace=cycle.workspace,
            project=cycle.project,
            entity_type=AISummary.EntityType.CYCLE,
            entity_id=cycle.id,
            entity_label=f"cycle {cycle.name}",
            rollup=rollup,
            is_empty=is_empty,
        )


class ProjectSummarizeEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, id=project_id).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        rollup, is_empty = compute_project_rollup(project)
        payload, error_response = _summarize_entity(
            entity_label=f"project {project.name}",
            rollup=rollup,
            is_empty=is_empty,
        )
        if error_response is not None:
            return error_response

        return Response(payload, status=status.HTTP_200_OK)


class ProjectSummarizeShareEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, id=project_id).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        rollup, is_empty = compute_project_rollup(project)
        return _create_shared_summary(
            request,
            slug,
            workspace=project.workspace,
            project=project,
            entity_type=AISummary.EntityType.PROJECT,
            entity_id=project.id,
            entity_label=f"project {project.name}",
            rollup=rollup,
            is_empty=is_empty,
        )


class InitiativeSummarizeEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, initiative_id):
        initiative = Initiative.objects.filter(workspace__slug=slug, id=initiative_id).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        rollup, is_empty = compute_initiative_rollup(initiative)
        payload, error_response = _summarize_entity(
            entity_label=f"initiative {initiative.name}",
            rollup=rollup,
            is_empty=is_empty,
        )
        if error_response is not None:
            return error_response

        return Response(payload, status=status.HTTP_200_OK)


class InitiativeSummarizeShareEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, initiative_id):
        initiative = Initiative.objects.filter(workspace__slug=slug, id=initiative_id).select_related("workspace").first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        rollup, is_empty = compute_initiative_rollup(initiative)
        return _create_shared_summary(
            request,
            slug,
            workspace=initiative.workspace,
            project=None,
            entity_type=AISummary.EntityType.INITIATIVE,
            entity_id=initiative.id,
            entity_label=f"initiative {initiative.name}",
            rollup=rollup,
            is_empty=is_empty,
        )


class SharedSummaryReadEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug, share_token):
        summary = get_active_shared_summary(slug=slug, share_token=share_token)
        if summary is None:
            return Response({"error": SHARE_NOT_FOUND_ERROR}, status=status.HTTP_404_NOT_FOUND)

        return Response(build_public_shared_summary_payload(summary), status=status.HTTP_200_OK)

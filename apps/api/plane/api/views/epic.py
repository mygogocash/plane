# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from functools import wraps

from rest_framework import status
from rest_framework.response import Response

from plane.api.views.base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import EpicSerializer, EpicWriteSerializer
from plane.db.models import Issue, Project, ProjectIssueType


def project_workspace_match_required(view_func):
    @wraps(view_func)
    def _wrapped_view(instance, request, *args, **kwargs):
        project_id = kwargs.get("project_id")
        slug = kwargs.get("slug")

        if Project.objects.filter(id=project_id).exclude(workspace__slug=slug).exists():
            return Response({"error": "Project does not belong to workspace"}, status=status.HTTP_400_BAD_REQUEST)

        return view_func(instance, request, *args, **kwargs)

    return _wrapped_view


class EpicAPIEndpoint(BaseAPIView):
    def get_queryset(self):
        return (
            Issue.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
                type__is_epic=True,
                archived_at__isnull=True,
                project__archived_at__isnull=True,
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("project", "workspace", "state", "type")
            .order_by("-created_at")
            .distinct()
        )

    def get_default_epic_type(self, project_id):
        project_issue_type = (
            ProjectIssueType.objects.filter(project_id=project_id, issue_type__is_epic=True, issue_type__is_active=True)
            .select_related("issue_type")
            .order_by("-is_default", "level", "created_at")
            .first()
        )
        return project_issue_type.issue_type if project_issue_type else None

    def get_project(self, slug, project_id):
        return Project.objects.get(pk=project_id, workspace__slug=slug)

    def get_write_serializer_context(self, request, slug, project_id):
        project = self.get_project(slug, project_id)
        return {
            "actor": request.user,
            "default_assignee_id": project.default_assignee_id,
            "epic_type": self.get_default_epic_type(project_id),
            "project_id": project_id,
            "workspace_id": project.workspace_id,
        }

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, pk=None):
        if pk is None:
            return Response(EpicSerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

        epic = self.get_queryset().filter(pk=pk).first()
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(EpicSerializer(epic).data, status=status.HTTP_200_OK)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id):
        serializer = EpicWriteSerializer(
            data=request.data,
            context=self.get_write_serializer_context(request, slug, project_id),
        )

        if serializer.is_valid():
            epic = serializer.save(created_by=request.user)
            return Response(EpicSerializer(epic).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

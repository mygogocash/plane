# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorkItemTemplateSerializer
from plane.db.models import Project, WorkItemTemplate


class WorkItemTemplateViewSet(BaseViewSet):
    serializer_class = WorkItemTemplateSerializer
    model = WorkItemTemplate

    def get_queryset(self):
        return WorkItemTemplate.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
        ).select_related("project", "workspace", "issue_type")

    def _list_queryset(self, request):
        queryset = self.get_queryset()
        if request.GET.get("include_inactive") != "true":
            queryset = queryset.filter(is_active=True)

        issue_type = request.GET.get("issue_type")
        if issue_type:
            queryset = queryset.filter(issue_type_id=issue_type)
        return queryset

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def list(self, request, slug, project_id):
        serializer = WorkItemTemplateSerializer(self._list_queryset(request), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def retrieve(self, request, slug, project_id, pk):
        template = self.get_queryset().filter(pk=pk).first()
        if template is None:
            return Response({"error": "Work item template not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(WorkItemTemplateSerializer(template).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = WorkItemTemplateSerializer(data=request.data, context={"project_id": project_id})
        if serializer.is_valid():
            template = serializer.save(project=project, created_by=request.user)
            return Response(WorkItemTemplateSerializer(template).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        template = self.get_queryset().filter(pk=pk).first()
        if template is None:
            return Response({"error": "Work item template not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = WorkItemTemplateSerializer(
            template,
            data=request.data,
            partial=True,
            context={"project_id": project_id},
        )
        if serializer.is_valid():
            template = serializer.save(updated_by=request.user)
            return Response(WorkItemTemplateSerializer(template).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, pk):
        template = self.get_queryset().filter(pk=pk).first()
        if template is None:
            return Response({"error": "Work item template not found"}, status=status.HTTP_404_NOT_FOUND)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

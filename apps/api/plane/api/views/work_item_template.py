# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.api.serializers import WorkItemTemplateSerializer
from plane.db.models import ProjectMember, WorkItemTemplate


class WorkItemTemplateListAPIEndpoint(BaseAPIView):
    use_read_replica = True

    def get(self, request, slug, project_id):
        if not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            is_active=True,
        ).exists():
            return Response({"error": "You don't have the required permissions."}, status=status.HTTP_403_FORBIDDEN)

        queryset = WorkItemTemplate.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            is_active=True,
        ).select_related("project", "workspace", "issue_type")

        issue_type = request.GET.get("issue_type")
        if issue_type:
            queryset = queryset.filter(issue_type_id=issue_type)

        return Response(WorkItemTemplateSerializer(queryset, many=True).data, status=status.HTTP_200_OK)

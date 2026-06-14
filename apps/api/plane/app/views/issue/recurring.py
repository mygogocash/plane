# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import RecurringWorkItemRunSerializer, RecurringWorkItemSerializer
from plane.db.models import Project, RecurringWorkItem


class RecurringWorkItemViewSet(BaseViewSet):
    serializer_class = RecurringWorkItemSerializer
    model = RecurringWorkItem

    def get_queryset(self):
        return RecurringWorkItem.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
        ).select_related("project", "workspace", "template", "owned_by")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def list(self, request, slug, project_id):
        queryset = self.get_queryset()
        if request.GET.get("include_inactive") != "true":
            queryset = queryset.filter(is_active=True)
        return Response(RecurringWorkItemSerializer(queryset, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def retrieve(self, request, slug, project_id, pk):
        recurring_work_item = self.get_queryset().filter(pk=pk).first()
        if recurring_work_item is None:
            return Response({"error": "Recurring work item not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(RecurringWorkItemSerializer(recurring_work_item).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = RecurringWorkItemSerializer(data=request.data, context={"project_id": project_id})
        if serializer.is_valid():
            recurring_work_item = serializer.save(project=project, owned_by=request.user, created_by=request.user)
            return Response(RecurringWorkItemSerializer(recurring_work_item).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        recurring_work_item = self.get_queryset().filter(pk=pk).first()
        if recurring_work_item is None:
            return Response({"error": "Recurring work item not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = RecurringWorkItemSerializer(
            recurring_work_item,
            data=request.data,
            partial=True,
            context={"project_id": project_id},
        )
        if serializer.is_valid():
            recurring_work_item = serializer.save(updated_by=request.user)
            return Response(RecurringWorkItemSerializer(recurring_work_item).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, pk):
        recurring_work_item = self.get_queryset().filter(pk=pk).first()
        if recurring_work_item is None:
            return Response({"error": "Recurring work item not found"}, status=status.HTTP_404_NOT_FOUND)
        recurring_work_item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def runs(self, request, slug, project_id, pk):
        recurring_work_item = self.get_queryset().filter(pk=pk).first()
        if recurring_work_item is None:
            return Response({"error": "Recurring work item not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            RecurringWorkItemRunSerializer(recurring_work_item.runs.order_by("-run_at"), many=True).data,
            status=status.HTTP_200_OK,
        )

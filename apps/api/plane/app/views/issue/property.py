# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssuePropertySerializer
from plane.db.models import IssueActivity, IssueProperty, IssueType, Project


class IssuePropertyViewSet(BaseViewSet):
    serializer_class = IssuePropertySerializer
    model = IssueProperty

    def get_queryset(self):
        return (
            IssueProperty.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                issue_type_id=self.kwargs.get("type_id"),
            )
            .select_related("workspace", "issue_type")
            .order_by("sort_order", "created_at")
        )

    def _get_issue_type(self, slug, type_id):
        return IssueType.objects.filter(pk=type_id, workspace__slug=slug).first()

    def _activity_project(self, slug, issue_type_id):
        return (
            Project.objects.filter(
                workspace__slug=slug,
                project_projectissuetype__issue_type_id=issue_type_id,
                archived_at__isnull=True,
            )
            .order_by("created_at")
            .first()
            or Project.objects.filter(workspace__slug=slug, archived_at__isnull=True).order_by("created_at").first()
        )

    def _record_definition_activity(self, issue_property, actor, verb):
        project = self._activity_project(issue_property.workspace.slug, issue_property.issue_type_id)
        if project is None:
            return

        IssueActivity.objects.create(
            project=project,
            workspace=issue_property.workspace,
            issue=None,
            actor=actor,
            verb=verb,
            field="issue_property",
            new_value=issue_property.display_name,
            new_identifier=issue_property.id,
            comment=f"{verb} custom property",
            epoch=int(timezone.now().timestamp()),
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug, type_id):
        issue_type = self._get_issue_type(slug, type_id)
        if issue_type is None:
            return Response({"error": "Issue type not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(IssuePropertySerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, type_id, pk):
        issue_property = self.get_queryset().filter(pk=pk).first()
        if issue_property is None:
            return Response({"error": "Issue property not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(IssuePropertySerializer(issue_property).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug, type_id):
        issue_type = self._get_issue_type(slug, type_id)
        if issue_type is None:
            return Response({"error": "Issue type not found"}, status=status.HTTP_404_NOT_FOUND)

        if IssueProperty.objects.filter(issue_type=issue_type, name=request.data.get("name")).exists():
            return Response({"error": "property_name_exists"}, status=status.HTTP_409_CONFLICT)

        serializer = IssuePropertySerializer(data=request.data)
        if serializer.is_valid():
            try:
                issue_property = serializer.save(issue_type=issue_type, created_by=request.user)
            except IntegrityError:
                return Response({"error": "property_name_exists"}, status=status.HTTP_409_CONFLICT)

            self._record_definition_activity(issue_property, request.user, "created")
            return Response(IssuePropertySerializer(issue_property).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, type_id, pk):
        issue_property = self.get_queryset().filter(pk=pk).first()
        if issue_property is None:
            return Response({"error": "Issue property not found"}, status=status.HTTP_404_NOT_FOUND)

        if (
            "property_type" in request.data
            and request.data["property_type"] != issue_property.property_type
            and issue_property.values.exists()
        ):
            return Response({"error": "destructive_type_change_blocked"}, status=status.HTTP_409_CONFLICT)

        if (
            "name" in request.data
            and IssueProperty.objects.filter(issue_type=issue_property.issue_type, name=request.data["name"])
            .exclude(pk=issue_property.id)
            .exists()
        ):
            return Response({"error": "property_name_exists"}, status=status.HTTP_409_CONFLICT)

        serializer = IssuePropertySerializer(issue_property, data=request.data, partial=True)
        if serializer.is_valid():
            issue_property = serializer.save(updated_by=request.user)
            self._record_definition_activity(issue_property, request.user, "updated")
            return Response(IssuePropertySerializer(issue_property).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, type_id, pk):
        issue_property = self.get_queryset().filter(pk=pk).first()
        if issue_property is None:
            return Response({"error": "Issue property not found"}, status=status.HTTP_404_NOT_FOUND)
        issue_property.delete()
        self._record_definition_activity(issue_property, request.user, "deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import InitiativeSerializer
from plane.db.models import Initiative, Workspace


class InitiativeAPIEndpoint(BaseAPIView):
    def get_queryset(self):
        return (
            Initiative.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "lead")
            .order_by("sort_order", "-created_at")
        )

    def get_workspace(self, slug):
        return Workspace.objects.get(slug=slug)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk=None):
        if pk is None:
            return Response(InitiativeSerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

        initiative = self.get_queryset().filter(pk=pk).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(InitiativeSerializer(initiative).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        workspace = self.get_workspace(slug)
        serializer = InitiativeSerializer(data=request.data, context={"workspace": workspace})

        if serializer.is_valid():
            initiative = serializer.save(workspace=workspace, created_by=request.user)
            return Response(InitiativeSerializer(initiative).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

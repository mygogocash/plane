# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from functools import wraps

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, WorkspaceViewerPermission, allow_permission
from plane.app.serializers import StatusUpdateReactionSerializer, StatusUpdateSerializer
from plane.db.models import Initiative, Issue, Project, StatusUpdate, StatusUpdateReaction
from .base import BaseAPIView, BaseViewSet


def project_workspace_match_required(view_func):
    @wraps(view_func)
    def _wrapped_view(instance, request, *args, **kwargs):
        project_id = kwargs.get("project_id")
        slug = kwargs.get("slug")

        if Project.objects.filter(id=project_id).exclude(workspace__slug=slug).exists():
            return Response({"error": "Project does not belong to workspace"}, status=status.HTTP_400_BAD_REQUEST)

        return view_func(instance, request, *args, **kwargs)

    return _wrapped_view


class EpicStatusUpdateViewSet(BaseViewSet):
    serializer_class = StatusUpdateSerializer
    model = StatusUpdate
    webhook_event = "status_update"

    def get_epic(self, slug, project_id, epic_id):
        return Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            id=epic_id,
            type__is_epic=True,
        ).first()

    def get_queryset(self):
        return (
            StatusUpdate.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                epic_id=self.kwargs.get("epic_id"),
                epic__project_id=self.kwargs.get("project_id"),
                epic__type__is_epic=True,
                epic__project__project_projectmember__member=self.request.user,
                epic__project__project_projectmember__is_active=True,
                epic__project__archived_at__isnull=True,
            )
            .select_related("workspace", "epic", "initiative", "parent", "actor")
            .prefetch_related("reactions")
            .order_by("-created_at")
            .distinct()
        )

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def list(self, request, slug, project_id, epic_id):
        epic = self.get_epic(slug, project_id, epic_id)
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatusUpdateSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def create(self, request, slug, project_id, epic_id):
        epic = self.get_epic(slug, project_id, epic_id)
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatusUpdateSerializer(data=request.data, context={"epic": epic})
        if serializer.is_valid():
            status_update = serializer.save(
                workspace=epic.workspace,
                epic=epic,
                actor=request.user,
                created_by=request.user,
            )
            return Response(StatusUpdateSerializer(status_update).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def retrieve(self, request, slug, project_id, epic_id, pk):
        status_update = self.get_queryset().filter(pk=pk).first()
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(StatusUpdateSerializer(status_update).data, status=status.HTTP_200_OK)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def partial_update(self, request, slug, project_id, epic_id, pk):
        status_update = self.get_queryset().filter(pk=pk).first()
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatusUpdateSerializer(
            status_update,
            data=request.data,
            partial=True,
            context={"epic": status_update.epic},
        )
        if serializer.is_valid():
            status_update = serializer.save(updated_by=request.user)
            return Response(StatusUpdateSerializer(status_update).data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def destroy(self, request, slug, project_id, epic_id, pk):
        status_update = self.get_queryset().filter(pk=pk).first()
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        status_update.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InitiativeStatusUpdateViewSet(BaseViewSet):
    serializer_class = StatusUpdateSerializer
    permission_classes = [WorkspaceViewerPermission]
    model = StatusUpdate
    webhook_event = "status_update"

    def get_initiative(self, slug, initiative_id):
        return Initiative.objects.filter(workspace__slug=slug, id=initiative_id).first()

    def get_queryset(self):
        return (
            StatusUpdate.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                initiative_id=self.kwargs.get("initiative_id"),
            )
            .select_related("workspace", "epic", "initiative", "parent", "actor")
            .prefetch_related("reactions")
            .order_by("-created_at")
            .distinct()
        )

    def list(self, request, slug, initiative_id):
        initiative = self.get_initiative(slug, initiative_id)
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatusUpdateSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug, initiative_id):
        initiative = self.get_initiative(slug, initiative_id)
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatusUpdateSerializer(data=request.data, context={"initiative": initiative})
        if serializer.is_valid():
            status_update = serializer.save(
                workspace=initiative.workspace,
                initiative=initiative,
                actor=request.user,
                created_by=request.user,
            )
            return Response(StatusUpdateSerializer(status_update).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, slug, initiative_id, pk):
        status_update = self.get_queryset().filter(pk=pk).first()
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(StatusUpdateSerializer(status_update).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, initiative_id, pk):
        status_update = self.get_queryset().filter(pk=pk).first()
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatusUpdateSerializer(
            status_update,
            data=request.data,
            partial=True,
            context={"initiative": status_update.initiative},
        )
        if serializer.is_valid():
            status_update = serializer.save(updated_by=request.user)
            return Response(StatusUpdateSerializer(status_update).data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, initiative_id, pk):
        status_update = self.get_queryset().filter(pk=pk).first()
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        status_update.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EpicStatusUpdateReactionEndpoint(BaseAPIView):
    def get_status_update(self, slug, project_id, epic_id, status_update_id):
        return StatusUpdate.objects.filter(
            workspace__slug=slug,
            id=status_update_id,
            epic_id=epic_id,
            epic__project_id=project_id,
            epic__type__is_epic=True,
        ).first()

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, epic_id, status_update_id):
        status_update = self.get_status_update(slug, project_id, epic_id, status_update_id)
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatusUpdateReactionSerializer(data=request.data)
        if serializer.is_valid():
            if StatusUpdateReaction.objects.filter(
                status_update=status_update,
                actor=request.user,
                reaction=serializer.validated_data["reaction"],
            ).exists():
                return Response(
                    {"error": "Reaction already exists for the user"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                with transaction.atomic():
                    reaction = serializer.save(
                        status_update=status_update,
                        actor=request.user,
                        created_by=request.user,
                    )
            except IntegrityError:
                return Response(
                    {"error": "Reaction already exists for the user"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(StatusUpdateReactionSerializer(reaction).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def delete(self, request, slug, project_id, epic_id, status_update_id, reaction_code):
        status_update = self.get_status_update(slug, project_id, epic_id, status_update_id)
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        reaction = StatusUpdateReaction.objects.filter(
            status_update=status_update,
            reaction=reaction_code,
            actor=request.user,
        ).first()
        if reaction is None:
            return Response({"error": "Reaction not found"}, status=status.HTTP_404_NOT_FOUND)

        reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InitiativeStatusUpdateReactionEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]

    def get_status_update(self, slug, initiative_id, status_update_id):
        return StatusUpdate.objects.filter(
            workspace__slug=slug,
            id=status_update_id,
            initiative_id=initiative_id,
        ).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, initiative_id, status_update_id):
        status_update = self.get_status_update(slug, initiative_id, status_update_id)
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatusUpdateReactionSerializer(data=request.data)
        if serializer.is_valid():
            if StatusUpdateReaction.objects.filter(
                status_update=status_update,
                actor=request.user,
                reaction=serializer.validated_data["reaction"],
            ).exists():
                return Response(
                    {"error": "Reaction already exists for the user"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                with transaction.atomic():
                    reaction = serializer.save(
                        status_update=status_update,
                        actor=request.user,
                        created_by=request.user,
                    )
            except IntegrityError:
                return Response(
                    {"error": "Reaction already exists for the user"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(StatusUpdateReactionSerializer(reaction).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, initiative_id, status_update_id, reaction_code):
        status_update = self.get_status_update(slug, initiative_id, status_update_id)
        if status_update is None:
            return Response({"error": "Status update not found"}, status=status.HTTP_404_NOT_FOUND)

        reaction = StatusUpdateReaction.objects.filter(
            status_update=status_update,
            reaction=reaction_code,
            actor=request.user,
        ).first()
        if reaction is None:
            return Response({"error": "Reaction not found"}, status=status.HTTP_404_NOT_FOUND)

        reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

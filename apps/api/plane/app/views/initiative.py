# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from uuid import UUID

# Django imports
from django.db import transaction
from django.db.models import Count, Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, WorkspaceViewerPermission, allow_permission
from plane.app.serializers import InitiativeSerializer
from plane.db.models import Initiative, InitiativeEpic, InitiativeProject, Issue, Project, Workspace
from .base import BaseAPIView, BaseViewSet


STATE_GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"]


def _empty_counts_by_group():
    return {state_group: 0 for state_group in STATE_GROUPS}


def _normalize_uuid_list(value):
    if not isinstance(value, list) or not value:
        return []

    normalized_ids = []
    for item_id in value:
        try:
            normalized_ids.append(str(UUID(str(item_id))))
        except (TypeError, ValueError, AttributeError):
            return None

    return list(dict.fromkeys(normalized_ids))


def _progress_from_queryset(queryset):
    progress = queryset.aggregate(
        total_count=Count("id", distinct=True),
        backlog=Count("id", filter=Q(state__group="backlog"), distinct=True),
        unstarted=Count("id", filter=Q(state__group="unstarted"), distinct=True),
        started=Count("id", filter=Q(state__group="started"), distinct=True),
        completed=Count("id", filter=Q(state__group="completed"), distinct=True),
        cancelled=Count("id", filter=Q(state__group="cancelled"), distinct=True),
    )
    counts_by_group = {state_group: progress[state_group] or 0 for state_group in STATE_GROUPS}
    total_count = progress["total_count"] or 0
    percent_complete = round((counts_by_group["completed"] / total_count) * 100, 2) if total_count else 0
    return {
        "counts_by_group": counts_by_group,
        "percent_complete": percent_complete,
        "total_count": total_count,
    }


def initiative_progress(initiative, cleanup_invalid_epics=False):
    active_epic_memberships = InitiativeEpic.objects.filter(
        initiative=initiative,
        deleted_at__isnull=True,
    )
    invalid_epic_memberships = active_epic_memberships.exclude(
        epic__deleted_at__isnull=True,
        epic__type__is_epic=True,
    )
    if cleanup_invalid_epics:
        for membership in invalid_epic_memberships:
            membership.delete()

    epic_ids = list(
        active_epic_memberships.filter(
            epic__deleted_at__isnull=True,
            epic__type__is_epic=True,
        ).values_list("epic_id", flat=True)
    )
    project_ids = list(
        InitiativeProject.objects.filter(
            initiative=initiative,
            deleted_at__isnull=True,
            project__deleted_at__isnull=True,
        ).values_list("project_id", flat=True)
    )

    if not epic_ids and not project_ids:
        return {
            "counts_by_group": _empty_counts_by_group(),
            "percent_complete": 0,
            "total_count": 0,
        }

    work_items = (
        Issue.issue_objects.filter(workspace=initiative.workspace)
        .filter(Q(parent_id__in=epic_ids) | Q(project_id__in=project_ids))
        .exclude(type__is_epic=True)
        .distinct()
    )
    return _progress_from_queryset(work_items)


class InitiativeViewSet(BaseViewSet):
    serializer_class = InitiativeSerializer
    permission_classes = [WorkspaceViewerPermission]
    model = Initiative
    webhook_event = "initiative"

    def get_queryset(self):
        return (
            Initiative.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "lead")
            .order_by("sort_order", "-created_at")
        )

    def get_workspace(self, slug):
        return Workspace.objects.get(slug=slug)

    def serializer_context(self, slug):
        return {"workspace": self.get_workspace(slug)}

    def list(self, request, slug):
        serializer = InitiativeSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = self.get_workspace(slug)
        serializer = InitiativeSerializer(
            data=request.data,
            context={"workspace": workspace},
        )
        if serializer.is_valid():
            initiative = serializer.save(workspace=workspace, created_by=request.user)
            return Response(InitiativeSerializer(initiative).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, slug, pk):
        initiative = self.get_queryset().filter(pk=pk).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(InitiativeSerializer(initiative).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        initiative = self.get_queryset().filter(pk=pk).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = InitiativeSerializer(
            initiative,
            data=request.data,
            partial=True,
            context=self.serializer_context(slug),
        )
        if serializer.is_valid():
            initiative = serializer.save(updated_by=request.user)
            return Response(InitiativeSerializer(initiative).data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        initiative = self.get_queryset().filter(pk=pk).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        initiative.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InitiativeEpicMembersEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]

    def _get_initiative(self, slug, initiative_id):
        return Initiative.objects.filter(workspace__slug=slug, id=initiative_id).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, initiative_id):
        epic_ids = _normalize_uuid_list(request.data.get("epic_ids"))
        if epic_ids is None:
            return Response({"error": "invalid_epic_ids"}, status=status.HTTP_400_BAD_REQUEST)
        if not epic_ids:
            return Response({"error": "epic_ids_required"}, status=status.HTTP_400_BAD_REQUEST)

        initiative = self._get_initiative(slug, initiative_id)
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        epics = list(
            Issue.issue_objects.filter(
                workspace__slug=slug,
                id__in=epic_ids,
                type__is_epic=True,
            ).select_related("workspace", "type")
        )
        epics_by_id = {str(epic.id): epic for epic in epics}
        invalid_epic_ids = [epic_id for epic_id in epic_ids if epic_id not in epics_by_id]
        if invalid_epic_ids:
            return Response(
                {"error": "invalid_epic_ids", "epic_ids": invalid_epic_ids},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for epic_id in epic_ids:
                membership = InitiativeEpic.all_objects.filter(
                    initiative=initiative,
                    epic=epics_by_id[epic_id],
                ).first()
                if membership is None:
                    InitiativeEpic.objects.create(
                        initiative=initiative,
                        epic=epics_by_id[epic_id],
                        created_by=request.user,
                    )
                elif membership.deleted_at is not None:
                    membership.deleted_at = None
                    membership.updated_by = request.user
                    membership.save(update_fields=["deleted_at", "updated_by", "updated_at"])

        return Response({"attached_epic_ids": epic_ids}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, initiative_id):
        epic_ids = _normalize_uuid_list(request.data.get("epic_ids"))
        if epic_ids is None:
            return Response({"error": "invalid_epic_ids"}, status=status.HTTP_400_BAD_REQUEST)
        if not epic_ids:
            return Response({"error": "epic_ids_required"}, status=status.HTTP_400_BAD_REQUEST)

        initiative = self._get_initiative(slug, initiative_id)
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        InitiativeEpic.objects.filter(
            initiative=initiative,
            epic_id__in=epic_ids,
            deleted_at__isnull=True,
        ).delete()
        return Response({"detached_epic_ids": epic_ids}, status=status.HTTP_200_OK)


class InitiativeProjectMembersEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]

    def _get_initiative(self, slug, initiative_id):
        return Initiative.objects.filter(workspace__slug=slug, id=initiative_id).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, initiative_id):
        project_ids = _normalize_uuid_list(request.data.get("project_ids"))
        if project_ids is None:
            return Response({"error": "invalid_project_ids"}, status=status.HTTP_400_BAD_REQUEST)
        if not project_ids:
            return Response({"error": "project_ids_required"}, status=status.HTTP_400_BAD_REQUEST)

        initiative = self._get_initiative(slug, initiative_id)
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        projects = list(Project.objects.filter(workspace__slug=slug, id__in=project_ids))
        projects_by_id = {str(project.id): project for project in projects}
        invalid_project_ids = [project_id for project_id in project_ids if project_id not in projects_by_id]
        if invalid_project_ids:
            return Response(
                {"error": "invalid_project_ids", "project_ids": invalid_project_ids},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for project_id in project_ids:
                membership = InitiativeProject.all_objects.filter(
                    initiative=initiative,
                    project=projects_by_id[project_id],
                ).first()
                if membership is None:
                    InitiativeProject.objects.create(
                        initiative=initiative,
                        project=projects_by_id[project_id],
                        created_by=request.user,
                    )
                elif membership.deleted_at is not None:
                    membership.deleted_at = None
                    membership.updated_by = request.user
                    membership.save(update_fields=["deleted_at", "updated_by", "updated_at"])

        return Response({"attached_project_ids": project_ids}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, initiative_id):
        project_ids = _normalize_uuid_list(request.data.get("project_ids"))
        if project_ids is None:
            return Response({"error": "invalid_project_ids"}, status=status.HTTP_400_BAD_REQUEST)
        if not project_ids:
            return Response({"error": "project_ids_required"}, status=status.HTTP_400_BAD_REQUEST)

        initiative = self._get_initiative(slug, initiative_id)
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        InitiativeProject.objects.filter(
            initiative=initiative,
            project_id__in=project_ids,
            deleted_at__isnull=True,
        ).delete()
        return Response({"detached_project_ids": project_ids}, status=status.HTTP_200_OK)


class InitiativeProgressEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]

    def get(self, request, slug, initiative_id):
        initiative = Initiative.objects.filter(workspace__slug=slug, id=initiative_id).first()
        if initiative is None:
            return Response({"error": "Initiative not found"}, status=status.HTTP_404_NOT_FOUND)

        progress = initiative_progress(initiative, cleanup_invalid_epics=True)
        initiative.progress_snapshot = progress
        initiative.save(update_fields=["progress_snapshot"])
        return Response(progress, status=status.HTTP_200_OK)


class InitiativesSummaryEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]

    def get(self, request, slug):
        initiatives = Initiative.objects.filter(workspace__slug=slug).select_related("workspace", "lead")
        grouped = {state: [] for state in Initiative.State.values}

        for initiative in initiatives.order_by("sort_order", "-created_at"):
            progress = initiative_progress(initiative)
            data = InitiativeSerializer(initiative).data
            data["progress"] = progress
            grouped[initiative.state].append(data)

        return Response(grouped, status=status.HTTP_200_OK)

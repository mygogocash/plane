# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from functools import wraps
from uuid import UUID

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import EpicSerializer, EpicWriteSerializer
from plane.db.models import Issue, IssueActivity, Project, ProjectIssueType
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


class EpicViewSet(BaseViewSet):
    serializer_class = EpicSerializer
    model = Issue
    webhook_event = "epic"

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
    def list(self, request, slug, project_id):
        serializer = EpicSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def create(self, request, slug, project_id):
        serializer = EpicWriteSerializer(
            data=request.data,
            context=self.get_write_serializer_context(request, slug, project_id),
        )

        if serializer.is_valid():
            epic = serializer.save(created_by=request.user)
            return Response(EpicSerializer(epic).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def retrieve(self, request, slug, project_id, pk):
        epic = self.get_queryset().filter(pk=pk).first()
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(EpicSerializer(epic).data, status=status.HTTP_200_OK)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def partial_update(self, request, slug, project_id, pk):
        epic = self.get_queryset().filter(pk=pk).first()
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = EpicWriteSerializer(
            epic,
            data=request.data,
            partial=True,
            context=self.get_write_serializer_context(request, slug, project_id),
        )

        if serializer.is_valid():
            epic = serializer.save()
            return Response(EpicSerializer(epic).data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def destroy(self, request, slug, project_id, pk):
        epic = self.get_queryset().filter(pk=pk).first()
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        epic.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EpicProgressEndpoint(BaseAPIView):
    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, epic_id):
        epic_exists = Issue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            id=epic_id,
            type__is_epic=True,
        ).exists()
        if not epic_exists:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        progress = Issue.issue_objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            parent_id=epic_id,
        ).aggregate(
            total_count=Count("id"),
            backlog=Count("id", filter=Q(state__group="backlog")),
            unstarted=Count("id", filter=Q(state__group="unstarted")),
            started=Count("id", filter=Q(state__group="started")),
            completed=Count("id", filter=Q(state__group="completed")),
            cancelled=Count("id", filter=Q(state__group="cancelled")),
        )

        counts_by_group = {
            "backlog": progress["backlog"] or 0,
            "unstarted": progress["unstarted"] or 0,
            "started": progress["started"] or 0,
            "completed": progress["completed"] or 0,
            "cancelled": progress["cancelled"] or 0,
        }
        total_count = progress["total_count"] or 0
        percent_complete = round((counts_by_group["completed"] / total_count) * 100, 2) if total_count else 0

        return Response(
            {
                "counts_by_group": counts_by_group,
                "percent_complete": percent_complete,
                "total_count": total_count,
            },
            status=status.HTTP_200_OK,
        )


class EpicWorkItemsEndpoint(BaseAPIView):
    def _issue_identifier(self, issue):
        if issue is None:
            return ""

        return f"{issue.project.identifier}-{issue.sequence_id}"

    def _normalize_issue_ids(self, issue_ids):
        if not isinstance(issue_ids, list) or not issue_ids:
            return []

        normalized_issue_ids = []
        for issue_id in issue_ids:
            try:
                normalized_issue_ids.append(str(UUID(str(issue_id))))
            except (TypeError, ValueError, AttributeError):
                return None

        return list(dict.fromkeys(normalized_issue_ids))

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, epic_id):
        issue_ids = self._normalize_issue_ids(request.data.get("issue_ids"))
        if issue_ids is None:
            return Response({"error": "invalid_issue_ids"}, status=status.HTTP_400_BAD_REQUEST)

        if not issue_ids:
            return Response({"error": "issue_ids_required"}, status=status.HTTP_400_BAD_REQUEST)

        epic = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                id=epic_id,
                type__is_epic=True,
            )
            .select_related("project", "workspace")
            .first()
        )
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        issues = list(
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                id__in=issue_ids,
            ).select_related("project", "workspace", "type", "parent", "parent__project")
        )
        issues_by_id = {str(issue.id): issue for issue in issues}
        invalid_issue_ids = [issue_id for issue_id in issue_ids if issue_id not in issues_by_id]
        if invalid_issue_ids:
            return Response(
                {"error": "invalid_issue_ids", "issue_ids": invalid_issue_ids},
                status=status.HTTP_400_BAD_REQUEST,
            )

        epic_issue_ids = [
            issue_id for issue_id in issue_ids if issues_by_id[issue_id].type and issues_by_id[issue_id].type.is_epic
        ]
        if epic_issue_ids:
            return Response(
                {"error": "issue_ids_must_be_work_items", "issue_ids": epic_issue_ids},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reparent = bool(request.data.get("reparent", False))
        already_parented_issue_ids = [
            issue_id
            for issue_id in issue_ids
            if issues_by_id[issue_id].parent_id is not None and issues_by_id[issue_id].parent_id != epic.id
        ]
        if already_parented_issue_ids and not reparent:
            return Response(
                {"error": "already_parented", "issue_ids": already_parented_issue_ids},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for issue_id in issue_ids:
                issue = issues_by_id[issue_id]
                old_parent = issue.parent
                old_parent_id = issue.parent_id
                if old_parent_id == epic.id:
                    continue

                issue.parent = epic
                issue.updated_by = request.user
                issue.save(update_fields=["parent", "updated_by", "updated_at"])

                IssueActivity.objects.create(
                    issue=issue,
                    actor=request.user,
                    verb="updated",
                    old_value=self._issue_identifier(old_parent),
                    new_value=self._issue_identifier(epic),
                    field="parent",
                    project=issue.project,
                    workspace=issue.workspace,
                    comment="updated the parent issue to",
                    old_identifier=old_parent_id,
                    new_identifier=epic.id,
                    epoch=timezone.now().timestamp(),
                )

        return Response(
            {
                "attached_issue_ids": issue_ids,
                "epic_id": str(epic.id),
            },
            status=status.HTTP_200_OK,
        )

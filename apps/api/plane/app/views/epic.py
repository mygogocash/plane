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
from plane.db.models import Issue, IssueActivity, IssueAssignee, IssueLabel, IssueProperty, IssuePropertyOption
from plane.db.models import IssuePropertyValue, Label, Project, ProjectIssueType
from plane.db.models import ProjectMember, State, WorkspaceMember
from plane.utils.html_processor import strip_tags
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


def issue_identifier(issue):
    if issue is None:
        return ""

    return f"{issue.project.identifier}-{issue.sequence_id}"


def create_parent_activity(issue, actor, old_parent, new_parent):
    IssueActivity.objects.create(
        issue=issue,
        actor=actor,
        verb="updated",
        old_value=issue_identifier(old_parent),
        new_value=issue_identifier(new_parent),
        field="parent",
        project=issue.project,
        workspace=issue.workspace,
        comment="updated the parent issue to",
        old_identifier=(old_parent.id if old_parent else None),
        new_identifier=(new_parent.id if new_parent else None),
        epoch=timezone.now().timestamp(),
    )


def create_type_activity(issue, actor, old_type, new_type):
    IssueActivity.objects.create(
        issue=issue,
        actor=actor,
        verb="updated",
        old_value=(old_type.name if old_type else ""),
        new_value=(new_type.name if new_type else ""),
        field="type",
        project=issue.project,
        workspace=issue.workspace,
        comment="updated the work item type to",
        old_identifier=(old_type.id if old_type else None),
        new_identifier=(new_type.id if new_type else None),
        epoch=timezone.now().timestamp(),
    )


def create_duplicate_activity(source_issue, duplicated_issue, actor):
    IssueActivity.objects.create(
        issue=duplicated_issue,
        actor=actor,
        verb="created",
        old_value=issue_identifier(source_issue),
        new_value=issue_identifier(duplicated_issue),
        field="duplicate",
        project=duplicated_issue.project,
        workspace=duplicated_issue.workspace,
        comment="duplicated the epic from",
        old_identifier=source_issue.id,
        new_identifier=duplicated_issue.id,
        epoch=timezone.now().timestamp(),
    )


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
                    old_value=issue_identifier(old_parent),
                    new_value=issue_identifier(epic),
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


class EpicPropertyValuesEndpoint(BaseAPIView):
    def _get_epic(self, slug, project_id, epic_id):
        return (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                id=epic_id,
                type__is_epic=True,
            )
            .select_related("project", "workspace", "type")
            .first()
        )

    def _serialize_value(self, property_value):
        if property_value.value is not None:
            return property_value.value
        if property_value.value_uuid is not None:
            return str(property_value.value_uuid)
        if property_value.value_option_id is not None:
            return str(property_value.value_option_id)
        return property_value.value_text

    def _property_values(self, epic):
        values = IssuePropertyValue.objects.filter(issue=epic, deleted_at__isnull=True).select_related(
            "property", "value_option"
        )
        return {str(value.property_id): self._serialize_value(value) for value in values}

    def _is_missing_value(self, value):
        return value is None or value == "" or value == []

    def _normalize_option_value(self, issue_property, value):
        raw_option_ids = value if issue_property.is_multi else [value]
        if not isinstance(raw_option_ids, list):
            return None, "option_value_must_be_list" if issue_property.is_multi else "option_value_required"

        option_ids = []
        for option_id in raw_option_ids:
            try:
                option_ids.append(str(UUID(str(option_id))))
            except (TypeError, ValueError, AttributeError):
                return None, "option_not_found"

        option_ids = list(dict.fromkeys(option_ids))
        found_option_ids = set(
            str(option_id)
            for option_id in IssuePropertyOption.objects.filter(
                property=issue_property,
                id__in=option_ids,
                deleted_at__isnull=True,
            ).values_list("id", flat=True)
        )
        if len(found_option_ids) != len(option_ids):
            return None, "option_not_found"

        return (option_ids if issue_property.is_multi else option_ids[0]), None

    def _normalize_member_value(self, slug, value):
        try:
            member_id = str(UUID(str(value)))
        except (TypeError, ValueError, AttributeError):
            return None, "member_not_in_workspace"

        if not WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member_id=member_id,
            is_active=True,
        ).exists():
            return None, "member_not_in_workspace"

        return member_id, None

    def _normalize_property_value(self, slug, issue_property, value):
        if issue_property.property_type in [IssueProperty.PropertyType.TEXT, IssueProperty.PropertyType.URL]:
            if not isinstance(value, str):
                return None, "text_value_required"
            return strip_tags(value), None

        if issue_property.property_type in [
            IssueProperty.PropertyType.OPTION,
            IssueProperty.PropertyType.SELECT,
            IssueProperty.PropertyType.MULTI_SELECT,
        ]:
            if issue_property.property_type == IssueProperty.PropertyType.MULTI_SELECT:
                issue_property.is_multi = True
            return self._normalize_option_value(issue_property, value)

        if issue_property.property_type == IssueProperty.PropertyType.MEMBER:
            return self._normalize_member_value(slug, value)

        return value, None

    def _validate_values(self, slug, epic, incoming_values):
        if not isinstance(incoming_values, dict):
            return None, {"property_values": "required"}

        properties = {
            str(issue_property.id): issue_property
            for issue_property in IssueProperty.objects.filter(
                issue_type=epic.type,
                is_active=True,
                deleted_at__isnull=True,
            )
        }
        existing_values = self._property_values(epic)
        errors = {}
        normalized_values = {}

        for property_id, raw_value in incoming_values.items():
            property_key = str(property_id)
            issue_property = properties.get(property_key)
            if issue_property is None:
                errors[property_key] = "property_not_found"
                continue
            if self._is_missing_value(raw_value):
                errors[property_key] = "value_required" if issue_property.is_required else "value_empty"
                continue

            normalized_value, error = self._normalize_property_value(slug, issue_property, raw_value)
            if error:
                errors[property_key] = error
                continue
            normalized_values[property_key] = normalized_value

        missing_required = [
            issue_property.name
            for property_key, issue_property in properties.items()
            if issue_property.is_required
            and property_key not in normalized_values
            and self._is_missing_value(existing_values.get(property_key))
        ]
        if missing_required:
            errors["missing_required"] = missing_required

        if errors:
            return None, {"property_values": errors}

        return normalized_values, None

    def _sync_property_values(self, epic, properties, normalized_values, actor):
        for property_id, value in normalized_values.items():
            issue_property = properties[property_id]
            property_value = IssuePropertyValue.objects.filter(issue=epic, property=issue_property).first()
            if property_value is None:
                property_value = IssuePropertyValue(issue=epic, property=issue_property, project=epic.project)

            old_value = self._serialize_value(property_value)
            property_value.project = epic.project
            property_value.value = value
            property_value.value_text = None
            property_value.value_uuid = None
            property_value.value_option_id = None

            if issue_property.property_type in [IssueProperty.PropertyType.TEXT, IssueProperty.PropertyType.URL]:
                property_value.value_text = value
            elif issue_property.property_type == IssueProperty.PropertyType.MEMBER:
                property_value.value_uuid = value
            elif (
                issue_property.property_type
                in [
                    IssueProperty.PropertyType.OPTION,
                    IssueProperty.PropertyType.SELECT,
                ]
                and not issue_property.is_multi
            ):
                property_value.value_option_id = value

            property_value.updated_by = actor
            property_value.save()

            if old_value != value:
                IssueActivity.objects.create(
                    issue=epic,
                    project=epic.project,
                    workspace=epic.workspace,
                    actor=actor,
                    verb="updated",
                    field="property_values",
                    old_value=str(old_value) if old_value is not None else None,
                    new_value=str(value) if value is not None else None,
                    new_identifier=issue_property.id,
                    comment=f"updated {issue_property.display_name}",
                    epoch=int(timezone.now().timestamp()),
                )

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, epic_id):
        epic = self._get_epic(slug, project_id, epic_id)
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response({"property_values": self._property_values(epic)}, status=status.HTTP_200_OK)

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, epic_id):
        epic = self._get_epic(slug, project_id, epic_id)
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        normalized_values, errors = self._validate_values(slug, epic, request.data.get("property_values"))
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        properties = {
            str(issue_property.id): issue_property
            for issue_property in IssueProperty.objects.filter(id__in=normalized_values.keys())
        }

        with transaction.atomic():
            self._sync_property_values(epic, properties, normalized_values, request.user)

        return Response({"property_values": self._property_values(epic)}, status=status.HTTP_200_OK)


class EpicConvertEndpoint(BaseAPIView):
    child_reparenting_policy = "reparent_to_epic_parent"

    def _get_target_issue_type(self, slug, project_id, target_issue_type_id):
        try:
            target_issue_type_id = str(UUID(str(target_issue_type_id)))
        except (TypeError, ValueError, AttributeError):
            return None

        project_issue_type = (
            ProjectIssueType.objects.filter(
                project_id=project_id,
                issue_type_id=target_issue_type_id,
                issue_type__workspace__slug=slug,
                issue_type__is_active=True,
                issue_type__is_epic=False,
            )
            .select_related("issue_type")
            .first()
        )
        return project_issue_type.issue_type if project_issue_type else None

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, epic_id):
        target_type = self._get_target_issue_type(slug, project_id, request.data.get("target_issue_type_id"))
        if target_type is None:
            return Response({"error": "target_issue_type_invalid"}, status=status.HTTP_400_BAD_REQUEST)

        epic = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                id=epic_id,
                type__is_epic=True,
            )
            .select_related("project", "workspace", "type", "parent", "parent__project")
            .first()
        )
        if epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            children = list(
                Issue.objects.select_for_update()
                .filter(workspace__slug=slug, project_id=project_id, parent_id=epic.id)
                .select_related("project", "workspace", "parent", "parent__project")
            )
            target_parent = epic.parent

            for child in children:
                old_parent = child.parent
                child.parent = target_parent
                child.updated_by = request.user
                child.save(update_fields=["parent", "updated_by", "updated_at"])
                create_parent_activity(child, request.user, old_parent, target_parent)

            old_type = epic.type
            epic.type = target_type
            epic.updated_by = request.user
            epic.save(update_fields=["type", "updated_by", "updated_at"])
            create_type_activity(epic, request.user, old_type, target_type)

        return Response(
            {
                "child_reparenting_policy": self.child_reparenting_policy,
                "id": str(epic.id),
                "is_epic": False,
                "type_id": str(target_type.id),
            },
            status=status.HTTP_200_OK,
        )


class WorkItemConvertToEpicEndpoint(BaseAPIView):
    def get_default_epic_type(self, project_id):
        project_issue_type = (
            ProjectIssueType.objects.filter(project_id=project_id, issue_type__is_epic=True, issue_type__is_active=True)
            .select_related("issue_type")
            .order_by("-is_default", "level", "created_at")
            .first()
        )
        return project_issue_type.issue_type if project_issue_type else None

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, issue_id):
        issue = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                id=issue_id,
            )
            .select_related("project", "workspace", "type")
            .first()
        )
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        if issue.type and issue.type.is_epic:
            return Response({"error": "work_item_already_epic"}, status=status.HTTP_400_BAD_REQUEST)

        epic_type = self.get_default_epic_type(project_id)
        if epic_type is None:
            return Response({"error": "epic_type_not_configured"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            old_type = issue.type
            issue.type = epic_type
            issue.updated_by = request.user
            issue.save(update_fields=["type", "updated_by", "updated_at"])
            create_type_activity(issue, request.user, old_type, epic_type)

        return Response(
            {
                "id": str(issue.id),
                "is_epic": True,
                "type_id": str(epic_type.id),
            },
            status=status.HTTP_200_OK,
        )


class EpicDuplicateEndpoint(BaseAPIView):
    def _has_project_edit_role(self, project, user):
        return ProjectMember.objects.filter(project=project, member=user, is_active=True, role__gte=15).exists()

    def _resolve_target_project(self, slug, project_id, request):
        target_workspace_slug = request.data.get("target_workspace_slug") or slug
        target_project_id = request.data.get("target_project_id") or project_id

        try:
            target_project_id = str(UUID(str(target_project_id)))
        except (TypeError, ValueError, AttributeError):
            return None

        return (
            Project.objects.filter(id=target_project_id, workspace__slug=target_workspace_slug)
            .select_related("workspace", "default_state", "default_assignee")
            .first()
        )

    def _default_epic_type(self, target_project):
        project_issue_type = (
            ProjectIssueType.objects.filter(
                project=target_project,
                issue_type__workspace=target_project.workspace,
                issue_type__is_active=True,
                issue_type__is_epic=True,
            )
            .select_related("issue_type")
            .order_by("-is_default", "level", "created_at")
            .first()
        )
        return project_issue_type.issue_type if project_issue_type else None

    def _default_work_item_type(self, target_project):
        project_issue_type = (
            ProjectIssueType.objects.filter(
                project=target_project,
                issue_type__workspace=target_project.workspace,
                issue_type__is_active=True,
                issue_type__is_epic=False,
            )
            .select_related("issue_type")
            .order_by("-is_default", "level", "created_at")
            .first()
        )
        return project_issue_type.issue_type if project_issue_type else None

    def _resolve_issue_type(self, source_issue, target_project):
        if source_issue.type and source_issue.type.is_epic:
            return self._default_epic_type(target_project)

        if source_issue.type:
            project_issue_type = (
                ProjectIssueType.objects.filter(
                    project=target_project,
                    issue_type__workspace=target_project.workspace,
                    issue_type__name=source_issue.type.name,
                    issue_type__is_active=True,
                    issue_type__is_epic=source_issue.type.is_epic,
                )
                .select_related("issue_type")
                .first()
            )
            if project_issue_type:
                return project_issue_type.issue_type

        return self._default_work_item_type(target_project)

    def _append_remap(self, remap_summary, field, source_id, target_id, strategy):
        remap_summary.append(
            {
                "field": field,
                "source_id": str(source_id) if source_id else None,
                "strategy": strategy,
                "target_id": str(target_id) if target_id else None,
            }
        )

    def _resolve_state(self, source_issue, target_project, remap_summary):
        source_state = source_issue.state
        if source_state is None:
            return target_project.default_state

        if source_state.project_id == target_project.id:
            return source_state

        matched_state = State.objects.filter(
            project=target_project,
            name=source_state.name,
            group=source_state.group,
        ).first()
        if matched_state:
            return matched_state

        default_state = (
            target_project.default_state or State.objects.filter(project=target_project, default=True).first()
        )
        if default_state is None:
            default_state = State.objects.filter(project=target_project).first()

        self._append_remap(
            remap_summary,
            "state",
            source_state.id,
            default_state.id if default_state else None,
            "default_state" if default_state else "dropped",
        )
        return default_state

    def _copy_labels(self, source_issue, duplicated_issue, target_project, remap_summary):
        created_label_ids = set()
        source_issue_labels = IssueLabel.objects.filter(issue=source_issue).select_related("label")

        for source_issue_label in source_issue_labels:
            source_label = source_issue_label.label
            target_label = (
                Label.objects.filter(workspace=target_project.workspace, name=source_label.name)
                .filter(Q(project=target_project) | Q(project__isnull=True))
                .first()
            )

            if target_label is None:
                self._append_remap(remap_summary, "label", source_label.id, None, "dropped")
                continue

            if target_label.id in created_label_ids:
                continue

            IssueLabel.objects.create(project=target_project, issue=duplicated_issue, label=target_label)
            created_label_ids.add(target_label.id)

    def _fallback_assignee(self, target_project):
        if target_project.default_assignee_id is None:
            return None

        project_member = (
            ProjectMember.objects.filter(
                project=target_project,
                member=target_project.default_assignee,
                is_active=True,
                role__gte=15,
            )
            .select_related("member")
            .first()
        )
        return project_member.member if project_member else None

    def _copy_assignees(self, source_issue, duplicated_issue, target_project, remap_summary):
        created_assignee_ids = set()
        source_assignees = IssueAssignee.objects.filter(issue=source_issue).select_related("assignee")

        for source_assignee in source_assignees:
            project_member = (
                ProjectMember.objects.filter(
                    project=target_project,
                    member__email=source_assignee.assignee.email,
                    is_active=True,
                    role__gte=15,
                )
                .select_related("member")
                .first()
            )
            target_assignee = project_member.member if project_member else self._fallback_assignee(target_project)

            if project_member is None:
                self._append_remap(
                    remap_summary,
                    "assignee",
                    source_assignee.assignee_id,
                    target_assignee.id if target_assignee else None,
                    "default_assignee" if target_assignee else "dropped",
                )

            if target_assignee is None or target_assignee.id in created_assignee_ids:
                continue

            IssueAssignee.objects.create(project=target_project, issue=duplicated_issue, assignee=target_assignee)
            created_assignee_ids.add(target_assignee.id)

    def _copy_issue(self, source_issue, target_project, actor, parent, remap_summary):
        target_type = self._resolve_issue_type(source_issue, target_project)
        if target_type is None:
            raise ValueError("target_issue_type_not_configured")

        duplicated_issue = Issue.objects.create(
            project=target_project,
            type=target_type,
            state=self._resolve_state(source_issue, target_project, remap_summary),
            parent=parent,
            name=source_issue.name,
            description_json=source_issue.description_json,
            description_html=source_issue.description_html,
            description_stripped=source_issue.description_stripped,
            priority=source_issue.priority,
            start_date=source_issue.start_date,
            target_date=source_issue.target_date,
            sort_order=source_issue.sort_order,
            created_by=actor,
        )
        self._copy_labels(source_issue, duplicated_issue, target_project, remap_summary)
        self._copy_assignees(source_issue, duplicated_issue, target_project, remap_summary)
        create_duplicate_activity(source_issue, duplicated_issue, actor)
        return duplicated_issue

    @project_workspace_match_required
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, epic_id):
        target_project = self._resolve_target_project(slug, project_id, request)
        if target_project is None:
            return Response({"error": "target_project_invalid"}, status=status.HTTP_400_BAD_REQUEST)

        if not self._has_project_edit_role(target_project, request.user):
            return Response({"error": "target_project_permission_denied"}, status=status.HTTP_403_FORBIDDEN)

        source_epic = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                id=epic_id,
                type__is_epic=True,
            )
            .select_related("project", "workspace", "state", "type")
            .first()
        )
        if source_epic is None:
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        include_subtree = bool(request.data.get("include_subtree", False))
        remap_summary = []

        try:
            with transaction.atomic():
                duplicated_epic = self._copy_issue(
                    source_issue=source_epic,
                    target_project=target_project,
                    actor=request.user,
                    parent=None,
                    remap_summary=remap_summary,
                )

                child_issue_ids = []
                if include_subtree:
                    children = (
                        Issue.objects.filter(workspace__slug=slug, project_id=project_id, parent_id=source_epic.id)
                        .select_related("project", "workspace", "state", "type")
                        .order_by("created_at")
                    )
                    for child in children:
                        duplicated_child = self._copy_issue(
                            source_issue=child,
                            target_project=target_project,
                            actor=request.user,
                            parent=duplicated_epic,
                            remap_summary=remap_summary,
                        )
                        child_issue_ids.append(str(duplicated_child.id))
        except ValueError:
            return Response(
                {"error": "Target project is missing a compatible issue type"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "child_issue_ids": child_issue_ids,
                "epic_id": str(duplicated_epic.id),
                "remap_summary": remap_summary,
                "target_project_id": str(target_project.id),
                "target_workspace_slug": target_project.workspace.slug,
            },
            status=status.HTTP_201_CREATED,
        )

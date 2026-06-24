# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""api-key (v1) mirror of the session workflow-transitions CRUD + state-transition (WF-T7).

These endpoints expose the same behavior as ``plane.app.views.workflow`` over the external
api-key surface. The api-key middleware resolves ``request.user`` from the token, so the
same ``allow_permission`` role checks and the same ``enforce_state_transition`` gate apply
unchanged — a Guest-keyed caller attempting an admin-only/disallowed action gets the same
403/409 as session.
"""

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    IssueCreateSerializer,
    IssueDetailSerializer,
    WorkflowTransitionSerializer,
)
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Issue,
    ProjectMember,
    State,
    WorkflowTransition,
    WorkflowTransitionActor,
)
from plane.utils.host import base_host
from plane.utils.workflow import (
    ActorNotAllowed,
    IllegalTransition,
    create_approval,
    enforce_state_transition,
    workflow_error_message,
)


class WorkflowTransitionMixin:
    """Shared queryset scoping + write helpers for the v1 workflow-transition endpoints."""

    serializer_class = WorkflowTransitionSerializer
    model = WorkflowTransition

    def get_queryset(self):
        return (
            WorkflowTransition.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("project", "workspace", "from_state", "to_state")
            .distinct()
        )

    def _validate_same_project(self, project_id, data):
        """Reject rules referencing states from another project (multi-tenant guard)."""
        for field in ("from_state", "to_state", "fallback_state"):
            value = data.get(field)
            if value and not State.all_state_objects.filter(
                id=value, project_id=project_id, deleted_at__isnull=True
            ).exists():
                return f"{field} must belong to this project"
        return None

    def _replace_actors(self, rule, project_id, member_ids):
        """Soft-delete existing explicit-actor grants and recreate from the given ProjectMember ids."""
        WorkflowTransitionActor.objects.filter(transition=rule).delete()
        for member_id in member_ids or []:
            if ProjectMember.objects.filter(
                id=member_id, project_id=project_id, is_active=True
            ).exists():
                WorkflowTransitionActor.objects.create(
                    project_id=project_id, transition=rule, member_id=member_id
                )


class WorkflowTransitionAPIEndpoint(WorkflowTransitionMixin, BaseAPIView):
    """List/Create workflow transition rules (admin-only writes) over the api-key surface."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        queryset = self.get_queryset()
        from_state = request.GET.get("from_state")
        if from_state:
            queryset = queryset.filter(from_state_id=from_state)
        issue_type = request.GET.get("issue_type")
        if issue_type:
            queryset = queryset.filter(issue_type_id=issue_type)
        return Response(
            WorkflowTransitionSerializer(queryset, many=True).data, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        error = self._validate_same_project(project_id, request.data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        serializer = WorkflowTransitionSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                rule = serializer.save(project_id=project_id, created_by=request.user)
                self._replace_actors(rule, project_id, request.data.get("actors"))
            return Response(
                WorkflowTransitionSerializer(rule).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkflowTransitionDetailAPIEndpoint(WorkflowTransitionMixin, BaseAPIView):
    """Retrieve/Update/Delete a single workflow transition rule (admin-only writes)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, pk):
        rule = self.get_queryset().filter(pk=pk).first()
        if rule is None:
            return Response(
                {"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(WorkflowTransitionSerializer(rule).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id, pk):
        rule = WorkflowTransition.objects.filter(
            pk=pk, project_id=project_id, workspace__slug=slug
        ).first()
        if rule is None:
            return Response(
                {"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND
            )
        error = self._validate_same_project(project_id, request.data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        serializer = WorkflowTransitionSerializer(rule, data=request.data, partial=True)
        if serializer.is_valid():
            with transaction.atomic():
                rule = serializer.save()
                if "actors" in request.data:
                    self._replace_actors(rule, project_id, request.data.get("actors"))
            return Response(WorkflowTransitionSerializer(rule).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id, pk):
        rule = WorkflowTransition.objects.filter(
            pk=pk, project_id=project_id, workspace__slug=slug
        ).first()
        if rule is None:
            return Response(
                {"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND
            )
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueStateTransitionAPIEndpoint(BaseAPIView):
    """Move a work item to a new state through the enforcement gate (api-key surface).

    Guests reach the endpoint so that ``enforce_state_transition`` (not the route decorator)
    decides the outcome, identical to the session endpoint.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id):
        to_state = request.data.get("to_state")
        if not to_state:
            return Response({"error": "to_state is required"}, status=status.HTTP_400_BAD_REQUEST)

        issue = Issue.objects.filter(
            pk=issue_id, project_id=project_id, workspace__slug=slug
        ).first()
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            decision = enforce_state_transition(issue, to_state, request.user)
        except IllegalTransition as exc:
            return Response({"error": workflow_error_message(exc)}, status=status.HTTP_409_CONFLICT)
        except ActorNotAllowed as exc:
            return Response({"error": workflow_error_message(exc)}, status=status.HTTP_403_FORBIDDEN)

        # Approval-gated transition: defer the state change, create a pending approval,
        # and return 202 without touching state_id.
        if decision.requires_approval:
            approval = create_approval(issue, decision.rule, to_state, request.user)
            return Response({"approval_id": str(approval.id)}, status=status.HTTP_202_ACCEPTED)

        current_instance = json.dumps(IssueDetailSerializer(issue).data, cls=DjangoJSONEncoder)
        serializer = IssueCreateSerializer(
            issue, data={"state_id": str(to_state)}, partial=True, context={"project_id": project_id}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()

        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"state_id": str(to_state)}),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=current_instance,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )

        issue.refresh_from_db()
        return Response(IssueDetailSerializer(issue).data, status=status.HTTP_200_OK)

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

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
from .. import BaseAPIView, BaseViewSet
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
    WorkItemApproval,
)
from plane.utils.host import base_host
from plane.utils.workflow import (
    ActorNotAllowed,
    ApprovalError,
    ApprovalNotAllowed,
    IllegalTransition,
    apply_approval_decision,
    create_approval,
    enforce_state_transition,
)


class WorkflowTransitionViewSet(BaseViewSet):
    serializer_class = WorkflowTransitionSerializer
    model = WorkflowTransition

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
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
            if ProjectMember.objects.filter(id=member_id, project_id=project_id, is_active=True).exists():
                WorkflowTransitionActor.objects.create(
                    project_id=project_id, transition=rule, member_id=member_id
                )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
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

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        rule = self.get_queryset().filter(pk=pk).first()
        if rule is None:
            return Response({"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(WorkflowTransitionSerializer(rule).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        error = self._validate_same_project(project_id, request.data)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        serializer = WorkflowTransitionSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                rule = serializer.save(project_id=project_id, created_by=request.user)
                self._replace_actors(rule, project_id, request.data.get("actors"))
            return Response(WorkflowTransitionSerializer(rule).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        rule = WorkflowTransition.objects.filter(pk=pk, project_id=project_id, workspace__slug=slug).first()
        if rule is None:
            return Response({"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND)
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
    def destroy(self, request, slug, project_id, pk):
        rule = WorkflowTransition.objects.filter(pk=pk, project_id=project_id, workspace__slug=slug).first()
        if rule is None:
            return Response({"error": "Workflow transition not found"}, status=status.HTTP_404_NOT_FOUND)
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueStateTransitionEndpoint(BaseAPIView):
    """Dedicated endpoint to move a work item to a new state through the enforcement gate.

    Guests are allowed to reach the endpoint so that enforcement (not the route decorator)
    decides the outcome. The actual move reuses the issue serializer/save path so validation
    and activity logging stay consistent with ``IssueViewSet.partial_update``.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id):
        to_state = request.data.get("to_state")
        if not to_state:
            return Response({"error": "to_state is required"}, status=status.HTTP_400_BAD_REQUEST)

        issue = Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug).first()
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            decision = enforce_state_transition(issue, to_state, request.user)
        except IllegalTransition as exc:
            return Response({"error": str(exc)}, status=status.HTTP_409_CONFLICT)
        except ActorNotAllowed as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)

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


def _serialize_approval(approval):
    """Render an approval, re-sanitizing the comment on the way out (defense in depth)."""
    from plane.utils.workflow import _sanitize_comment

    return {
        "id": str(approval.id),
        "issue": str(approval.issue_id),
        "transition": str(approval.transition_id),
        "status": approval.status,
        "requested_by": str(approval.requested_by_id),
        "decided_by": str(approval.decided_by_id) if approval.decided_by_id else None,
        "decided_at": approval.decided_at,
        "target_state": str(approval.target_state_id) if approval.target_state_id else None,
        "fallback_state": (
            str(approval.fallback_state_id) if approval.fallback_state_id else None
        ),
        "comment": _sanitize_comment(approval.comment),
        "approvers": [
            {
                "member": str(a.member.member_id),
                "responded": a.responded,
            }
            for a in approval.approvers.all()
        ],
    }


class IssueApprovalsEndpoint(BaseAPIView):
    """List approval requests for a work item (any active project member may read)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        approvals = (
            WorkItemApproval.objects.filter(
                issue_id=issue_id, project_id=project_id, workspace__slug=slug
            )
            .select_related("issue", "transition")
            .prefetch_related("approvers__member")
        )
        return Response(
            [_serialize_approval(a) for a in approvals], status=status.HTTP_200_OK
        )


class ApprovalDecisionEndpoint(BaseAPIView):
    """Record an approve/reject decision on a pending approval.

    Guests are allowed to reach the endpoint so the service (not the route decorator)
    decides authorization: only assigned approvers, or a workspace admin override.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, approval_id):
        approved = request.data.get("approved")
        if approved is None:
            return Response(
                {"error": "approved is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        approval = (
            WorkItemApproval.objects.filter(
                pk=approval_id, project_id=project_id, workspace__slug=slug
            )
            .select_related("issue", "transition")
            .first()
        )
        if approval is None:
            return Response({"error": "Approval not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            approval = apply_approval_decision(
                approval,
                request.user,
                approved=bool(approved),
                comment=request.data.get("comment"),
            )
        except ApprovalNotAllowed as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ApprovalError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_serialize_approval(approval), status=status.HTTP_200_OK)

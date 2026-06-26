# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T9: transactional apply of an approved Build-mode project draft.

The build draft is synthesized (non-persisted) by the ``build_project`` Copilot
mode. This endpoint persists an approved/edited draft into the target project in
a single transaction: issues, then a cycle, then cycle membership. Missing
references (labels/assignees) are create-or-skipped with per-item warnings so a
single bad reference never fails the whole apply.

Safety properties (R0 path):
  - Atomicity: everything runs inside ``transaction.atomic()``; any failure
    rolls back fully — no partial rows.
  - Idempotency: applies are keyed on a client-echoed ``draft_token`` recorded in
    the audit trail. A repeat apply with the same token is a no-op that returns
    the original result.
  - Authorization: requires >= MEMBER on the target project; guests/viewers are
    rejected and nothing is persisted.
  - Audit: every successful apply writes an immutable ``AuditLog`` entry.
"""

import uuid

from django.db import transaction
from django.utils.html import escape
from rest_framework import serializers, status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.copilot import ISSUE_PRIORITIES, _normalize_project_draft
from plane.db.models import (
    AuditLog,
    Cycle,
    CycleIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    Label,
    Project,
    ProjectMember,
    User,
)
from plane.utils.automation_actions import write_audit_log
from plane.utils.exception_logger import log_exception

from .base import BaseAPIView

BUILD_APPLY_ACTION = "build_project.apply"


class BuildProjectApplySerializer(serializers.Serializer):
    draft_token = serializers.CharField(max_length=255, allow_blank=False, trim_whitespace=True)
    project_draft = serializers.DictField()

    def validate_project_draft(self, value):
        if not isinstance(value.get("work_items"), list) or not value.get("work_items"):
            raise serializers.ValidationError("project_draft.work_items must be a non-empty list.")
        return value


def _project_role(slug, user, project_id):
    return (
        ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=user,
            is_active=True,
        )
        .values_list("role", flat=True)
        .first()
    )


def _looks_like_uuid(value):
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def _apply_draft(*, slug, user, project, draft, draft_token):
    """Persist the draft into ``project`` atomically. Returns the result dict.

    Caller is responsible for wrapping in ``transaction.atomic()`` so an audit
    failure rolls back the whole apply.
    """
    warnings = []
    issue_ids = []
    cycle_id = None

    for item in draft["work_items"]:
        name = (item.get("name") or "").strip()[:255]
        if not name:
            warnings.append("Skipped a work item with no name.")
            continue

        priority = item.get("priority") if item.get("priority") in ISSUE_PRIORITIES else "none"
        description = item.get("description") or ""
        description_html = f"<p>{escape(description)}</p>" if description else "<p></p>"

        issue = Issue.objects.create(
            name=name,
            description_html=description_html,
            priority=priority,
            project=project,
            workspace=project.workspace,
            created_by=user,
        )
        issue_ids.append(str(issue.id))

        if item.get("estimate") is not None:
            warnings.append(f"Estimate for '{name}' not applied (configure estimates in project settings).")

        for label_name in item.get("labels") or []:
            label_name = (label_name or "").strip()[:255]
            if not label_name:
                continue
            label, _created = Label.objects.get_or_create(
                project=project,
                name=label_name,
                deleted_at__isnull=True,
                defaults={"workspace": project.workspace, "color": "#60646C", "created_by": user},
            )
            IssueLabel.objects.get_or_create(
                issue=issue,
                label=label,
                deleted_at__isnull=True,
                defaults={"project": project, "workspace": project.workspace, "created_by": user},
            )

        assignee_suggestion = item.get("assignee_suggestion")
        if assignee_suggestion:
            member = (
                User.objects.filter(id=assignee_suggestion).first()
                if _looks_like_uuid(assignee_suggestion)
                else None
            )
            if member and ProjectMember.objects.filter(project=project, member=member, is_active=True).exists():
                IssueAssignee.objects.get_or_create(
                    issue=issue,
                    assignee=member,
                    deleted_at__isnull=True,
                    defaults={"project": project, "workspace": project.workspace, "created_by": user},
                )
            else:
                warnings.append(f"Suggested assignee for '{name}' is not a project member; skipped.")

    suggested_cycle = draft.get("suggested_cycle")
    if isinstance(suggested_cycle, dict):
        cycle = Cycle.objects.create(
            name=(suggested_cycle.get("name") or "Cycle")[:255],
            start_date=suggested_cycle.get("start_date") or None,
            end_date=suggested_cycle.get("end_date") or None,
            project=project,
            workspace=project.workspace,
            owned_by=user,
            created_by=user,
        )
        cycle_id = str(cycle.id)
        for issue_id in issue_ids:
            CycleIssue.objects.create(
                cycle=cycle,
                issue_id=issue_id,
                project=project,
                workspace=project.workspace,
                created_by=user,
            )

    result = {
        "project_id": str(project.id),
        "issue_ids": issue_ids,
        "cycle_id": cycle_id,
        "warnings": warnings,
    }

    write_audit_log(
        workspace=project.workspace,
        user=user,
        action=BUILD_APPLY_ACTION,
        entity_type="project",
        entity_id=project.id,
        changes={"draft_token": draft_token, "result": result},
    )

    return result


class BuildProjectApplyEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, project_id):
        serializer = BuildProjectApplySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        project = Project.objects.filter(
            id=project_id, workspace__slug=slug, archived_at__isnull=True
        ).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        role = _project_role(slug, request.user, project_id)
        if role is None or role < ROLE.MEMBER.value:
            return Response(
                {"error": "Applying a build draft requires at least MEMBER access to the project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        draft_token = serializer.validated_data["draft_token"]

        # Idempotency: a repeat apply with the same token returns the stored
        # result without creating duplicate project/issues.
        existing = AuditLog.objects.filter(
            workspace=project.workspace,
            action=BUILD_APPLY_ACTION,
            changes__draft_token=draft_token,
        ).first()
        if existing is not None:
            stored = existing.changes.get("result")
            if stored:
                return Response({**stored, "idempotent": True}, status=status.HTTP_200_OK)

        draft = _normalize_project_draft(serializer.validated_data["project_draft"])
        if not draft["work_items"]:
            return Response(
                {"error": "project_draft must contain at least one valid work item."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                result = _apply_draft(
                    slug=slug,
                    user=request.user,
                    project=project,
                    draft=draft,
                    draft_token=draft_token,
                )
        except Exception as error:
            log_exception(error)
            return Response(
                {"error": "An internal error has occurred while applying the build draft."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(result, status=status.HTTP_201_CREATED)

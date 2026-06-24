# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Sentry connector: config CRUD + HMAC-verified webhook (AI-T20).

Config CRUD is ADMIN-only; the ``webhook_secret`` is write-only (encrypted at
rest, never echoed). The inbound webhook verifies an HMAC-SHA256 signature
(timing-safe) BEFORE any processing, maps ``severity -> priority`` via the
user-configured ``severity_map``, sanitizes the stack trace, creates a linked
issue, and (optionally) enqueues triage. An unbound project is ignored with an
info log (never a 500). The secret is never logged.
"""

# Python imports
import json
import logging

# Third party imports
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import (
    AuditLog,
    Intake,
    IntakeIssue,
    Issue,
    IssueAssignee,
    Project,
    SentryProjectSync,
    User,
)
from plane.utils.automation_actions import write_audit_log
from plane.utils.content_validator import validate_html_content
from plane.utils.integration_signature import verify_hmac_sha256

from ..base import BaseAPIView

logger = logging.getLogger(__name__)

DEFAULT_SEVERITY_MAP = {"fatal": "urgent", "error": "high", "warning": "medium", "info": "low"}
VALID_PRIORITIES = {"urgent", "high", "medium", "low", "none"}


class SentryConfigSerializer(serializers.ModelSerializer):
    # Secret is write-only: accepted on input, never serialized back out.
    webhook_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_secret = serializers.SerializerMethodField()

    class Meta:
        model = SentryProjectSync
        fields = [
            "id",
            "project",
            "severity_map",
            "default_assignee",
            "webhook_secret",
            "has_secret",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "project", "created_at", "updated_at"]

    def get_has_secret(self, obj):
        return bool(obj.webhook_secret)


class SentryConfigEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        configs = SentryProjectSync.objects.filter(workspace__slug=slug).order_by("-created_at")
        return Response(SentryConfigSerializer(configs, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        project = Project.objects.filter(workspace__slug=slug, id=request.data.get("project_id")).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = SentryConfigSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        sync, _created = SentryProjectSync.objects.update_or_create(
            project=project,
            workspace=project.workspace,
            defaults={
                "webhook_secret": serializer.validated_data.get("webhook_secret", ""),
                "severity_map": serializer.validated_data.get("severity_map", {}),
                "default_assignee": serializer.validated_data.get("default_assignee"),
            },
        )
        return Response(SentryConfigSerializer(sync).data, status=status.HTTP_201_CREATED)


class SentryWebhookEndpoint(BaseAPIView):
    """Public Sentry webhook. Verifies HMAC before any side effect."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, slug):
        raw_body = request.body
        try:
            payload = json.loads(raw_body or b"{}")
        except (ValueError, TypeError):
            return Response({"error": "Invalid payload"}, status=status.HTTP_400_BAD_REQUEST)

        project = Project.objects.filter(workspace__slug=slug, id=payload.get("project_id")).first()
        sync = (
            SentryProjectSync.objects.filter(workspace__slug=slug, project=project).first()
            if project
            else None
        )
        if sync is None or not sync.webhook_secret:
            # Unbound project: ignore, log info, never 500.
            logger.info("Sentry webhook for unbound project ignored (workspace=%s)", slug)
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)

        signature = request.headers.get("Sentry-Hook-Signature") or request.headers.get(
            "X-Sentry-Signature"
        )
        if not verify_hmac_sha256(sync.webhook_secret, raw_body, signature):
            return Response({"error": "Invalid signature"}, status=status.HTTP_403_FORBIDDEN)

        data = payload.get("data") or {}
        event = data.get("event") or payload.get("event") or {}
        external_id = str(event.get("event_id") or payload.get("id") or "")

        if external_id and IntakeIssue.objects.filter(
            project=project, external_source="sentry", external_id=external_id
        ).exists():
            return Response({"status": "duplicate"}, status=status.HTTP_200_OK)

        severity = str(event.get("level") or payload.get("level") or "").lower()
        severity_map = sync.severity_map or DEFAULT_SEVERITY_MAP
        priority = severity_map.get(severity, "none")
        if priority not in VALID_PRIORITIES:
            priority = "none"

        title = (event.get("title") or payload.get("message") or "Sentry alert")[:255]
        culprit = event.get("culprit") or ""
        web_url = event.get("web_url") or payload.get("url") or ""
        release = event.get("release") or ""
        raw_detail = f"<p>{culprit}</p><p>Release: {release}</p><p>{web_url}</p>"
        _is_valid, _error, clean_html = validate_html_content(raw_detail)
        description_html = clean_html or "<p></p>"

        issue = Issue.objects.create(
            name=title,
            description_html=description_html,
            priority=priority,
            project=project,
            workspace=sync.workspace,
        )
        if sync.default_assignee_id:
            assignee = User.objects.filter(id=sync.default_assignee_id).first()
            if assignee:
                IssueAssignee.objects.get_or_create(
                    issue=issue,
                    assignee=assignee,
                    deleted_at__isnull=True,
                    defaults={"project": project, "workspace": sync.workspace},
                )

        intake = (
            Intake.objects.filter(project=project, is_default=True).first()
            or Intake.objects.filter(project=project).first()
        )
        if intake is None:
            intake = Intake.objects.create(
                name="Sentry", project=project, workspace=sync.workspace, is_default=True
            )
        intake_issue = IntakeIssue.objects.create(
            intake=intake,
            issue=issue,
            project=project,
            workspace=sync.workspace,
            source="SENTRY",
            external_source="sentry",
            external_id=external_id or None,
        )

        write_audit_log(
            workspace=sync.workspace,
            user=None,
            action="sentry.webhook.issue_created",
            entity_type="issue",
            entity_id=issue.id,
            changes={"severity": severity, "priority": priority},
            actor_type=AuditLog.ActorType.SYSTEM,
        )

        try:
            from plane.bgtasks.intake_triage_task import intake_triage_task

            intake_triage_task.delay(str(intake_issue.id))
        except Exception as error:
            logger.info("Triage enqueue skipped: %s", type(error).__name__)

        return Response(
            {"status": "created", "issue_id": str(issue.id), "priority": priority},
            status=status.HTTP_201_CREATED,
        )

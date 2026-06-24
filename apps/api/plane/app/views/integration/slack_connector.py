# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Slack connector: channel-binding CRUD + signed inbound webhook (AI-T18).

Binding CRUD is ADMIN-only and gated on a connected ``SlackProjectSync``
(the "integrations" gate, since this fork has no separate feature-flag system).
The inbound webhook verifies the Slack request signature (HMAC-SHA256,
timing-safe, replay-windowed) BEFORE any side effect, then maps the message to
an ``IntakeIssue`` and enqueues triage. Unbound channels are ignored with an
info log (never a 500). The signing secret is encrypted at rest and never
echoed or logged.

Field mapping (Q5): ``message.text -> IntakeIssue.description_html``,
``message.user -> source_email``, ``message.ts -> external_id``.
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
    SlackChannelBinding,
    SlackProjectSync,
)
from plane.utils.automation_actions import write_audit_log
from plane.utils.content_validator import validate_html_content
from plane.utils.integration_signature import verify_slack_signature

from ..base import BaseAPIView

logger = logging.getLogger(__name__)


class SlackChannelBindingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SlackChannelBinding
        fields = [
            "id",
            "slack_project_sync",
            "channel_id",
            "direction",
            "schedule",
            "kind",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SlackChannelBindingListEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        bindings = SlackChannelBinding.objects.filter(workspace__slug=slug).order_by("-created_at")
        return Response(SlackChannelBindingSerializer(bindings, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        sync_id = request.data.get("slack_project_sync")
        sync = SlackProjectSync.objects.filter(workspace__slug=slug, id=sync_id).first() if sync_id else None
        if sync is None:
            # Gated by integrations: the Slack integration must be connected.
            return Response(
                {"error": "Slack integration is not connected for this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SlackChannelBindingSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        binding = serializer.save(
            slack_project_sync=sync,
            project=sync.project,
            workspace=sync.workspace,
        )
        return Response(SlackChannelBindingSerializer(binding).data, status=status.HTTP_201_CREATED)


class SlackChannelBindingDetailEndpoint(BaseAPIView):
    def _get_binding(self, slug, binding_id):
        return SlackChannelBinding.objects.filter(workspace__slug=slug, id=binding_id).first()

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, binding_id):
        binding = self._get_binding(slug, binding_id)
        if binding is None:
            return Response({"error": "Binding not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = SlackChannelBindingSerializer(binding, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, binding_id):
        binding = self._get_binding(slug, binding_id)
        if binding is None:
            return Response({"error": "Binding not found"}, status=status.HTTP_404_NOT_FOUND)
        binding.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlackEventsWebhookEndpoint(BaseAPIView):
    """Public inbound Slack events endpoint. Verifies signature before any work."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, slug):
        raw_body = request.body
        try:
            payload = json.loads(raw_body or b"{}")
        except (ValueError, TypeError):
            return Response({"error": "Invalid payload"}, status=status.HTTP_400_BAD_REQUEST)

        # Slack URL verification handshake.
        if payload.get("type") == "url_verification":
            return Response({"challenge": payload.get("challenge")}, status=status.HTTP_200_OK)

        team_id = payload.get("team_id")
        sync = (
            SlackProjectSync.objects.filter(workspace__slug=slug, team_id=team_id).first()
            if team_id
            else None
        )
        if sync is None or not sync.signing_secret:
            # No connected app for this team -> cannot verify -> reject.
            return Response({"error": "Unverified request"}, status=status.HTTP_401_UNAUTHORIZED)

        timestamp = request.headers.get("X-Slack-Request-Timestamp")
        signature = request.headers.get("X-Slack-Signature")
        if not verify_slack_signature(sync.signing_secret, timestamp, raw_body, signature):
            return Response({"error": "Invalid signature"}, status=status.HTTP_403_FORBIDDEN)

        event = payload.get("event") or {}
        channel_id = event.get("channel")
        binding = SlackChannelBinding.objects.filter(
            slack_project_sync=sync,
            channel_id=channel_id,
            direction=SlackChannelBinding.Direction.INBOUND,
        ).first()
        if binding is None:
            # Unbound channel: ignore, log at info, never 500.
            logger.info("Slack inbound for unbound channel ignored (workspace=%s)", slug)
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)

        external_id = event.get("ts")
        project = binding.project
        if external_id and IntakeIssue.objects.filter(
            project=project, external_source="slack", external_id=external_id
        ).exists():
            # Idempotent: duplicate/replayed event already imported.
            return Response({"status": "duplicate"}, status=status.HTTP_200_OK)

        _is_valid, _error, clean_html = validate_html_content(f"<p>{event.get('text', '')}</p>")
        description_html = clean_html or "<p></p>"

        intake = Intake.objects.filter(project=project, is_default=True).first() or Intake.objects.filter(
            project=project
        ).first()
        if intake is None:
            intake = Intake.objects.create(
                name="Slack", project=project, workspace=sync.workspace, is_default=True
            )

        issue = Issue.objects.create(
            name=(event.get("text") or "Slack request")[:255],
            description_html=description_html,
            project=project,
            workspace=sync.workspace,
        )
        intake_issue = IntakeIssue.objects.create(
            intake=intake,
            issue=issue,
            project=project,
            workspace=sync.workspace,
            source="SLACK",
            source_email=event.get("user"),
            external_source="slack",
            external_id=external_id,
        )

        write_audit_log(
            workspace=sync.workspace,
            user=None,
            action="slack.inbound.intake_created",
            entity_type="intake_issue",
            entity_id=intake_issue.id,
            changes={"channel_id": channel_id},
            actor_type=AuditLog.ActorType.SYSTEM,
        )

        try:
            from plane.bgtasks.intake_triage_task import intake_triage_task

            intake_triage_task.delay(str(intake_issue.id))
        except Exception as error:  # triage is best-effort; never fail the webhook
            logger.info("Triage enqueue skipped: %s", type(error).__name__)

        return Response(
            {"status": "created", "intake_issue_id": str(intake_issue.id)},
            status=status.HTTP_201_CREATED,
        )

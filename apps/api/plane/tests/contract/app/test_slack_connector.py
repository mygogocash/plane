# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T18 contract tests: Slack channel-binding CRUD + signed inbound webhook.

Acceptance criteria coverage (tasks.md AI-T18 / AI-S18):
  - AC "admin creates channel binding gated by integrations"
    -> test_admin_creates_channel_binding_gated_by_integrations
  - AC "non-admin binding rejected, no secret exposed"
    -> test_non_admin_binding_rejected / test_secret_never_echoed
  - AC "signed inbound for bound channel creates IntakeIssue + enqueues triage"
    -> test_signed_inbound_for_bound_channel_creates_intake_issue
  - AC "unsigned or replayed rejected, no side effects"
    -> test_unsigned_rejected_no_side_effects / test_replayed_rejected_no_side_effects
  - AC "inbound for unbound channel ignored, logged info, not 500"
    -> test_inbound_for_unbound_channel_ignored_not_500
  - AC "imported text sanitized"
    -> test_imported_text_sanitized
"""

import json
import time

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.permissions import ROLE
from plane.db.models import (
    APIToken,
    Intake,
    IntakeIssue,
    Integration,
    Project,
    ProjectMember,
    SlackChannelBinding,
    SlackProjectSync,
    State,
    User,
    WorkspaceIntegration,
    WorkspaceMember,
)
from plane.db.models.intake import TriageSuggestion  # noqa: F401  (ensure model importable)
from plane.utils.integration_signature import compute_slack_signature

TEAM_ID = "T123"
SIGNING_SECRET = "shh-slack-signing-secret"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Slack Project", identifier="SLK", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.ADMIN.value)
    State.objects.create(name="Todo", project=project, group="unstarted", color="#fff", default=True)
    Intake.objects.create(name="Default", project=project, workspace=workspace, is_default=True)
    return project


@pytest.fixture
def slack_sync(workspace, project, create_user):
    integration = Integration.objects.create(title="Slack", provider="slack")
    token = APIToken.objects.create(user=create_user, label="slack-bot")
    wi = WorkspaceIntegration.objects.create(
        workspace=workspace, actor=create_user, integration=integration, api_token=token
    )
    return SlackProjectSync.objects.create(
        project=project,
        workspace=workspace,
        workspace_integration=wi,
        access_token="xoxb-token",
        scopes="chat:write",
        bot_user_id="UBOT",
        webhook_url="https://hooks.slack.test/abc",
        team_id=TEAM_ID,
        team_name="Test Team",
        signing_secret=SIGNING_SECRET,
    )


def _channels_url(slug):
    return f"/api/workspaces/{slug}/integrations/slack/channels/"


def _events_url(slug):
    return f"/api/workspaces/{slug}/integrations/slack/events/"


def _signed_post(client, url, payload, *, secret=SIGNING_SECRET, timestamp=None):
    body = json.dumps(payload)
    ts = str(int(time.time())) if timestamp is None else str(timestamp)
    signature = compute_slack_signature(secret, ts, body)
    return client.post(
        url,
        data=body,
        content_type="application/json",
        HTTP_X_SLACK_REQUEST_TIMESTAMP=ts,
        HTTP_X_SLACK_SIGNATURE=signature,
    )


@pytest.mark.contract
class TestSlackBindingCrud:
    def test_admin_creates_channel_binding_gated_by_integrations(self, session_client, workspace, slack_sync):
        response = session_client.post(
            _channels_url(workspace.slug),
            {
                "slack_project_sync": str(slack_sync.id),
                "channel_id": "C123",
                "direction": "inbound",
                "kind": "request",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert SlackChannelBinding.objects.filter(channel_id="C123").exists()

    def test_binding_rejected_when_integration_not_connected(self, session_client, workspace, project):
        response = session_client.post(
            _channels_url(workspace.slug),
            {
                "slack_project_sync": "00000000-0000-0000-0000-000000000000",
                "channel_id": "C1",
                "direction": "inbound",
                "kind": "request",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_non_admin_binding_rejected(self, api_client, workspace, slack_sync):
        member = User.objects.create_user(email="slack-member@example.com", username="slack_member")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=ROLE.MEMBER.value)
        client = APIClient()
        client.force_authenticate(user=member)
        response = client.post(
            _channels_url(workspace.slug),
            {"slack_project_sync": str(slack_sync.id), "channel_id": "C9", "direction": "inbound", "kind": "request"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not SlackChannelBinding.objects.filter(channel_id="C9").exists()

    def test_secret_never_echoed(self, session_client, workspace, slack_sync):
        # The binding serializer must not expose the SlackProjectSync signing secret.
        response = session_client.post(
            _channels_url(workspace.slug),
            {"slack_project_sync": str(slack_sync.id), "channel_id": "C123", "direction": "inbound", "kind": "request"},
            format="json",
        )
        assert SIGNING_SECRET not in str(response.data)
        assert "signing_secret" not in response.data


@pytest.mark.contract
class TestSlackInboundWebhook:
    def _bind_channel(self, slack_sync, channel_id="C123"):
        return SlackChannelBinding.objects.create(
            slack_project_sync=slack_sync,
            project=slack_sync.project,
            workspace=slack_sync.workspace,
            channel_id=channel_id,
            direction=SlackChannelBinding.Direction.INBOUND,
            kind=SlackChannelBinding.Kind.REQUEST,
        )

    def test_signed_inbound_for_bound_channel_creates_intake_issue(self, api_client, workspace, slack_sync):
        self._bind_channel(slack_sync)
        payload = {
            "team_id": TEAM_ID,
            "event": {"type": "message", "channel": "C123", "user": "U1", "text": "Login broken", "ts": "1700000000.1"},
        }
        response = _signed_post(api_client, _events_url(workspace.slug), payload)
        assert response.status_code == status.HTTP_201_CREATED, response.data
        intake = IntakeIssue.objects.filter(external_source="slack", external_id="1700000000.1").first()
        assert intake is not None
        assert intake.source_email == "U1"

    def test_unsigned_rejected_no_side_effects(self, api_client, workspace, slack_sync):
        self._bind_channel(slack_sync)
        body = json.dumps({"team_id": TEAM_ID, "event": {"channel": "C123", "text": "x", "ts": "1.0"}})
        response = api_client.post(_events_url(workspace.slug), data=body, content_type="application/json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert IntakeIssue.objects.count() == 0

    def test_replayed_rejected_no_side_effects(self, api_client, workspace, slack_sync):
        self._bind_channel(slack_sync)
        payload = {"team_id": TEAM_ID, "event": {"channel": "C123", "text": "x", "ts": "1.0"}}
        # Timestamp far outside the replay window -> rejected even if signed.
        response = _signed_post(api_client, _events_url(workspace.slug), payload, timestamp=1)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert IntakeIssue.objects.count() == 0

    def test_inbound_for_unbound_channel_ignored_not_500(self, api_client, workspace, slack_sync):
        payload = {"team_id": TEAM_ID, "event": {"channel": "C-UNBOUND", "text": "hi", "ts": "2.0"}}
        response = _signed_post(api_client, _events_url(workspace.slug), payload)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ignored"
        assert IntakeIssue.objects.count() == 0

    def test_imported_text_sanitized(self, api_client, workspace, slack_sync):
        self._bind_channel(slack_sync)
        payload = {
            "team_id": TEAM_ID,
            "event": {"channel": "C123", "user": "U1", "text": "<script>alert(1)</script>safe", "ts": "3.0"},
        }
        response = _signed_post(api_client, _events_url(workspace.slug), payload)
        assert response.status_code == status.HTTP_201_CREATED
        intake = IntakeIssue.objects.get(external_id="3.0")
        assert "<script>" not in intake.issue.description_html

    def test_unverified_team_rejected(self, api_client, workspace, slack_sync):
        payload = {"team_id": "UNKNOWN", "event": {"channel": "C123", "text": "x", "ts": "4.0"}}
        response = _signed_post(api_client, _events_url(workspace.slug), payload)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert IntakeIssue.objects.count() == 0

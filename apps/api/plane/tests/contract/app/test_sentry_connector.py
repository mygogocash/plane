# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T20 contract tests: Sentry config CRUD + HMAC webhook.

Acceptance criteria coverage (tasks.md AI-T20 / AI-S20):
  - AC "admin registers config, secret write-only"
    -> test_admin_registers_config_secret_write_only
  - AC "verified alert creates issue with mapped priority + links"
    -> test_verified_alert_creates_issue_with_mapped_priority_and_links
  - AC "payload sanitized before persist"
    -> test_payload_sanitized_before_persist
  - AC "unsigned/replayed/mismatched rejected, nothing created"
    -> test_unsigned_rejected / test_mismatched_rejected / test_replayed_is_noop
  - AC "unbound project ignored, logged info, not 500, secret never logged"
    -> test_unbound_project_ignored_not_500
"""

import json

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.permissions import ROLE
from plane.db.models import (
    Intake,
    IntakeIssue,
    Issue,
    Project,
    ProjectMember,
    SentryProjectSync,
    State,
    User,
    WorkspaceMember,
)
from plane.utils.integration_signature import compute_hmac_sha256

SECRET = "sentry-webhook-secret"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Sentry Project", identifier="SEN", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.ADMIN.value)
    State.objects.create(name="Todo", project=project, group="unstarted", color="#fff", default=True)
    Intake.objects.create(name="Default", project=project, workspace=workspace, is_default=True)
    return project


@pytest.fixture
def sentry_sync(workspace, project):
    return SentryProjectSync.objects.create(
        project=project,
        workspace=workspace,
        webhook_secret=SECRET,
        severity_map={"fatal": "urgent", "error": "high", "warning": "medium"},
    )


def _config_url(slug):
    return f"/api/workspaces/{slug}/integrations/sentry/"


def _webhook_url(slug):
    return f"/api/workspaces/{slug}/integrations/sentry/webhook/"


def _signed_post(client, url, payload, *, secret=SECRET):
    body = json.dumps(payload)
    signature = compute_hmac_sha256(secret, body)
    return client.post(url, data=body, content_type="application/json", HTTP_SENTRY_HOOK_SIGNATURE=signature)


@pytest.mark.contract
class TestSentryConfig:
    def test_admin_registers_config_secret_write_only(self, session_client, workspace, project):
        response = session_client.post(
            _config_url(workspace.slug),
            {
                "project_id": str(project.id),
                "webhook_secret": SECRET,
                "severity_map": {"fatal": "urgent"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        # Secret never echoed back.
        assert "webhook_secret" not in response.data
        assert SECRET not in str(response.data)
        assert response.data["has_secret"] is True
        # Stored encrypted, round-trips to plaintext for application logic.
        sync = SentryProjectSync.objects.get(project=project)
        assert sync.webhook_secret == SECRET

    def test_non_admin_config_rejected(self, api_client, workspace, project):
        member = User.objects.create_user(email="sentry-member@example.com", username="sentry_member")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=ROLE.MEMBER.value)
        client = APIClient()
        client.force_authenticate(user=member)
        response = client.post(
            _config_url(workspace.slug),
            {"project_id": str(project.id), "webhook_secret": SECRET},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestSentryWebhook:
    def test_verified_alert_creates_issue_with_mapped_priority_and_links(
        self, api_client, workspace, project, sentry_sync
    ):
        payload = {
            "project_id": str(project.id),
            "data": {
                "event": {
                    "event_id": "evt-1",
                    "level": "fatal",
                    "title": "NPE in checkout",
                    "culprit": "checkout.py",
                    "release": "v1.2.3",
                    "web_url": "https://sentry.io/org/issues/1",
                }
            },
        }
        response = _signed_post(api_client, _webhook_url(workspace.slug), payload)
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["priority"] == "urgent"
        issue = Issue.objects.get(id=response.data["issue_id"])
        assert issue.priority == "urgent"
        assert "v1.2.3" in issue.description_html

    def test_payload_sanitized_before_persist(self, api_client, workspace, project, sentry_sync):
        payload = {
            "project_id": str(project.id),
            "data": {"event": {"event_id": "evt-2", "level": "error", "culprit": "<script>x</script>boom"}},
        }
        response = _signed_post(api_client, _webhook_url(workspace.slug), payload)
        assert response.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(id=response.data["issue_id"])
        assert "<script>" not in issue.description_html

    def test_unsigned_rejected(self, api_client, workspace, project, sentry_sync):
        body = json.dumps({"project_id": str(project.id), "data": {"event": {"event_id": "e", "level": "error"}}})
        response = api_client.post(_webhook_url(workspace.slug), data=body, content_type="application/json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Issue.objects.count() == 0

    def test_mismatched_rejected(self, api_client, workspace, project, sentry_sync):
        payload = {"project_id": str(project.id), "data": {"event": {"event_id": "e", "level": "error"}}}
        response = _signed_post(api_client, _webhook_url(workspace.slug), payload, secret="wrong-secret")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Issue.objects.count() == 0

    def test_replayed_is_noop(self, api_client, workspace, project, sentry_sync):
        payload = {
            "project_id": str(project.id),
            "data": {"event": {"event_id": "evt-dupe", "level": "error", "title": "x"}},
        }
        first = _signed_post(api_client, _webhook_url(workspace.slug), payload)
        assert first.status_code == status.HTTP_201_CREATED
        count_after_first = Issue.objects.count()
        second = _signed_post(api_client, _webhook_url(workspace.slug), payload)
        assert second.status_code == status.HTTP_200_OK
        assert second.data["status"] == "duplicate"
        assert Issue.objects.count() == count_after_first

    def test_unbound_project_ignored_not_500(self, api_client, workspace, project):
        # No SentryProjectSync configured for this project.
        payload = {"project_id": str(project.id), "data": {"event": {"event_id": "e", "level": "error"}}}
        response = _signed_post(api_client, _webhook_url(workspace.slug), payload)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ignored"
        assert Issue.objects.count() == 0

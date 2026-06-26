# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import re
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status

from plane.app.permissions import ROLE
from plane.db.models import AISummary, Issue, Project, ProjectMember, State, User, WorkspaceMember


def _project_share_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/summarize/share/"


def _shared_read_url(slug, share_token):
    return f"/api/workspaces/{slug}/summaries/shared/{share_token}/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Share Summary Project",
        identifier="SHR",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.ADMIN.value)
    return project


@pytest.fixture
def state(project):
    return State.objects.create(name="Started", project=project, group="started", color="#46A758")


def _configured_llm():
    return patch(
        "plane.app.views.ai_summary.get_llm_config",
        return_value=("test-key", "gpt-4o-mini", "openai"),
    )


def _mock_summary_markdown(markdown):
    return patch(
        "plane.utils.ai_summaries.generate_summary_markdown",
        return_value=(markdown, None),
    )


@pytest.mark.contract
class TestAISummaryShareEndpoints:
    def test_member_creates_share_token(self, session_client, workspace, project, state, create_user):
        issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Tracked issue",
            created_by=create_user,
        )

        with _configured_llm(), _mock_summary_markdown("## Shared digest\nProgress looks good."):
            response = session_client.post(_project_share_url(workspace.slug, project.id), format="json")

        assert response.status_code == status.HTTP_200_OK, response.data
        assert AISummary.objects.count() == 1
        summary = AISummary.objects.get()
        assert summary.share_token
        assert summary.share_expires_at
        assert summary.generated_by_id == create_user.id
        assert summary.entity_type == AISummary.EntityType.PROJECT
        assert summary.entity_id == project.id
        assert response.data["share_token"] == summary.share_token
        assert response.data["share_url"] == _shared_read_url(workspace.slug, summary.share_token)
        assert response.data["markdown"] == "## Shared digest\nProgress looks good."
        assert set(response.data["rollup"].keys()) == {"percent_complete", "blockers", "at_risk"}
        assert str(issue.id) not in response.data["markdown"]

    def test_shared_read_returns_rollup_markdown_only_no_private_ids(
        self, api_client, workspace, project, create_user
    ):
        private_issue_id = uuid4()
        malicious_markdown = (
            f'<script>alert("xss")</script><p>Digest for blocked work</p>'
            f"<p>Hidden id: {private_issue_id}</p>"
        )
        share_token = "valid-share-token-123456"
        AISummary.objects.create(
            workspace=workspace,
            project=project,
            entity_type=AISummary.EntityType.PROJECT,
            entity_id=project.id,
            markdown=malicious_markdown,
            rollup={
                "percent_complete": 25,
                "blockers": [{"issue_id": str(private_issue_id), "name": "Blocked item"}],
                "at_risk": [],
            },
            share_token=share_token,
            share_expires_at=timezone.now() + timedelta(days=7),
            generated_by=create_user,
            created_by=create_user,
        )

        response = api_client.get(_shared_read_url(workspace.slug, share_token))

        assert response.status_code == status.HTTP_200_OK, response.data
        assert set(response.data.keys()) == {"markdown"}
        assert "<script>" not in response.data["markdown"]
        assert "Digest for blocked work" in response.data["markdown"]
        assert str(private_issue_id) not in response.data["markdown"]
        assert "blockers" not in response.data
        assert "rollup" not in response.data

    def test_guest_cannot_create_share(self, api_client, workspace, project):
        guest = User.objects.create_user(email="guest-share@example.com", username="guest_share")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=ROLE.GUEST.value)
        ProjectMember.objects.create(project=project, member=guest, role=ROLE.GUEST.value)
        api_client.force_authenticate(user=guest)

        with _configured_llm(), _mock_summary_markdown("## Digest"):
            response = api_client.post(_project_share_url(workspace.slug, project.id), format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert AISummary.objects.count() == 0

    def test_invalid_revoked_expired_token_404(self, api_client, workspace, project, create_user):
        valid_token = "active-share-token"
        AISummary.objects.create(
            workspace=workspace,
            project=project,
            entity_type=AISummary.EntityType.PROJECT,
            entity_id=project.id,
            markdown="Active summary",
            rollup={"percent_complete": 0, "blockers": [], "at_risk": []},
            share_token=valid_token,
            share_expires_at=timezone.now() + timedelta(days=1),
            generated_by=create_user,
            created_by=create_user,
        )

        expired_summary = AISummary.objects.create(
            workspace=workspace,
            project=project,
            entity_type=AISummary.EntityType.PROJECT,
            entity_id=project.id,
            markdown="Expired summary",
            rollup={"percent_complete": 0, "blockers": [], "at_risk": []},
            share_token="expired-share-token",
            share_expires_at=timezone.now() - timedelta(minutes=1),
            generated_by=create_user,
            created_by=create_user,
        )
        AISummary.objects.create(
            workspace=workspace,
            project=project,
            entity_type=AISummary.EntityType.PROJECT,
            entity_id=project.id,
            markdown="Revoked summary",
            rollup={"percent_complete": 0, "blockers": [], "at_risk": []},
            share_token=None,
            share_expires_at=timezone.now() + timedelta(days=1),
            generated_by=create_user,
            created_by=create_user,
        )

        invalid_response = api_client.get(_shared_read_url(workspace.slug, "missing-token"))
        expired_response = api_client.get(_shared_read_url(workspace.slug, expired_summary.share_token))
        revoked_response = api_client.get(_shared_read_url(workspace.slug, "revoked-share-token"))

        assert invalid_response.status_code == status.HTTP_404_NOT_FOUND
        assert expired_response.status_code == status.HTTP_404_NOT_FOUND
        assert revoked_response.status_code == status.HTTP_404_NOT_FOUND
        assert invalid_response.data == {"error": "Summary not found"}
        assert expired_response.data == {"error": "Summary not found"}
        assert revoked_response.data == {"error": "Summary not found"}
        assert "workspace" not in str(invalid_response.data).lower()
        assert not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-", str(invalid_response.data))

        active_response = api_client.get(_shared_read_url(workspace.slug, valid_token))
        assert active_response.status_code == status.HTTP_200_OK

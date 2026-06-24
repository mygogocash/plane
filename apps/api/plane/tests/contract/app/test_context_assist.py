# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.app.permissions import ROLE
from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueActivity,
    IssueBlocker,
    Project,
    ProjectMember,
    State,
    StatusUpdate,
    User,
    Workspace,
    WorkspaceMember,
)


def _context_assist_url(slug):
    return f"/api/workspaces/{slug}/copilot/context-assist/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Context Assist Project",
        identifier="CTX",
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
        "plane.app.views.copilot_context.get_llm_config",
        return_value=("test-key", "gpt-4o-mini", "openai"),
    )


def _mock_follow_ups(follow_ups):
    return patch(
        "plane.app.views.copilot_context.generate_suggested_follow_ups",
        return_value=follow_ups,
    )


@pytest.mark.contract
class TestContextAssistEndpoint:
    def test_returns_blockers_at_risk_recent_for_entity(
        self, session_client, workspace, project, state, create_user
    ):
        blocked_issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Blocked rollout",
            created_by=create_user,
        )
        blocker_issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Infra dependency",
            created_by=create_user,
        )
        IssueBlocker.objects.create(
            project=project,
            workspace=workspace,
            block=blocked_issue,
            blocked_by=blocker_issue,
            created_by=create_user,
        )
        IssueActivity.objects.create(
            project=project,
            workspace=workspace,
            issue=blocked_issue,
            verb="updated",
            field="state",
            new_value="Started",
            actor=create_user,
            created_by=create_user,
        )

        with _configured_llm(), _mock_follow_ups(["Review the infra dependency before rollout."]):
            response = session_client.post(
                _context_assist_url(workspace.slug),
                {"entity_type": "project", "entity_id": str(project.id)},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert set(response.data.keys()) == {
            "blockers",
            "at_risk",
            "recent_changes",
            "suggested_follow_ups",
        }
        assert response.data["blockers"][0]["name"] == "Blocked rollout"
        assert response.data["blockers"][0]["blocked_by"]["name"] == "Infra dependency"
        assert response.data["recent_changes"][0]["issue_id"] == str(blocked_issue.id)
        assert response.data["suggested_follow_ups"] == ["Review the infra dependency before rollout."]

    def test_guest_without_project_membership_403(self, api_client, workspace, project):
        guest = User.objects.create_user(email="guest-context@example.com", username="guest_context")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=ROLE.GUEST.value)
        api_client.force_authenticate(user=guest)

        with _configured_llm(), _mock_follow_ups([]):
            response = api_client.post(
                _context_assist_url(workspace.slug),
                {"entity_type": "project", "entity_id": str(project.id)},
                format="json",
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "error" in response.data

    def test_cross_workspace_entity_rejected(self, session_client, workspace, project, create_user):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            owner=create_user,
            slug="other-workspace",
        )
        other_project = Project.objects.create(
            name="Other Project",
            identifier="OTH",
            workspace=other_workspace,
            created_by=create_user,
        )
        other_state = State.objects.create(
            name="Other Started",
            project=other_project,
            group="started",
            color="#46A758",
        )
        other_issue = Issue.objects.create(
            project=other_project,
            workspace=other_workspace,
            state=other_state,
            name="Secret cross-workspace issue",
            created_by=create_user,
        )

        with _configured_llm(), _mock_follow_ups([]):
            response = session_client.post(
                _context_assist_url(workspace.slug),
                {"entity_type": "issue", "entity_id": str(other_issue.id)},
                format="json",
            )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data == {"error": "Issue not found"}
        assert "Secret" not in str(response.data)

    def test_empty_entity_returns_empty_lists(self, session_client, workspace, project):
        with _configured_llm(), _mock_follow_ups([]):
            response = session_client.post(
                _context_assist_url(workspace.slug),
                {"entity_type": "project", "entity_id": str(project.id)},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "blockers": [],
            "at_risk": [],
            "recent_changes": [],
            "suggested_follow_ups": [],
        }

    def test_no_provider_returns_400(self, session_client, workspace, project):
        with patch(
            "plane.app.views.copilot_context.get_llm_config",
            return_value=(None, None, None),
        ), patch(
            "plane.app.views.copilot_context.is_llm_configured",
            return_value=False,
        ):
            response = session_client.post(
                _context_assist_url(workspace.slug),
                {"entity_type": "project", "entity_id": str(project.id)},
                format="json",
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "LLM provider" in response.data["error"]

    def test_missing_entity_returns_general_empty_context(self, session_client, workspace):
        with _configured_llm(), _mock_follow_ups([]):
            response = session_client.post(
                _context_assist_url(workspace.slug),
                {},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["blockers"] == []
        assert response.data["at_risk"] == []
        assert response.data["recent_changes"] == []
        assert response.data["suggested_follow_ups"] == []

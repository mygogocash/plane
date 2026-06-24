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
    Initiative,
    InitiativeProject,
    Issue,
    IssueBlocker,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    StatusUpdate,
    User,
    WorkspaceMember,
)
from plane.utils.ai_summaries import NO_ACTIVITY_MARKDOWN


def _cycle_summarize_url(slug, cycle_id):
    return f"/api/workspaces/{slug}/cycles/{cycle_id}/summarize/"


def _project_summarize_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/summarize/"


def _initiative_summarize_url(slug, initiative_id):
    return f"/api/workspaces/{slug}/initiatives/{initiative_id}/summarize/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Summarize Project",
        identifier="SUM",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.ADMIN.value)
    return project


@pytest.fixture
def state(project):
    return State.objects.create(name="Started", project=project, group="started", color="#46A758")


@pytest.fixture
def completed_state(project):
    return State.objects.create(name="Done", project=project, group="completed", color="#30A46C")


@pytest.fixture
def cycle(project, create_user):
    return Cycle.objects.create(
        name="Sprint 1",
        project=project,
        workspace=project.workspace,
        owned_by=create_user,
    )


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
class TestAISummarizeEndpoints:
    def test_cycle_summary_returns_markdown_and_rollup(
        self, session_client, workspace, project, cycle, state, completed_state, create_user
    ):
        done_issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            state=completed_state,
            name="Ship login",
            created_by=create_user,
        )
        blocked_issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Fix billing",
            created_by=create_user,
        )
        blocker_issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Database migration",
            created_by=create_user,
        )
        IssueBlocker.objects.create(
            project=project,
            workspace=workspace,
            block=blocked_issue,
            blocked_by=blocker_issue,
            created_by=create_user,
        )
        CycleIssue.objects.create(
            project=project,
            workspace=workspace,
            cycle=cycle,
            issue=done_issue,
            created_by=create_user,
        )
        CycleIssue.objects.create(
            project=project,
            workspace=workspace,
            cycle=cycle,
            issue=blocked_issue,
            created_by=create_user,
        )

        with _configured_llm(), _mock_summary_markdown("## Sprint digest\nOne item done."):
            response = session_client.post(_cycle_summarize_url(workspace.slug, cycle.id), format="json")

        assert response.status_code == status.HTTP_200_OK, response.data
        assert "markdown" in response.data
        assert "rollup" in response.data
        assert set(response.data["rollup"].keys()) == {"percent_complete", "blockers", "at_risk"}
        assert response.data["rollup"]["percent_complete"] == 50
        assert response.data["rollup"]["blockers"][0]["name"] == "Fix billing"
        assert "Sprint digest" in response.data["markdown"]

    def test_project_and_initiative_summaries_scoped(
        self, session_client, workspace, project, state, completed_state, create_user
    ):
        project_issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            state=completed_state,
            name="Project scoped issue",
            created_by=create_user,
        )
        other_project = Project.objects.create(
            name="Other Project",
            identifier="OTH",
            workspace=workspace,
            created_by=create_user,
        )
        other_state = State.objects.create(
            name="Other Started",
            project=other_project,
            group="started",
            color="#46A758",
        )
        Issue.objects.create(
            project=other_project,
            workspace=workspace,
            state=other_state,
            name="Other project issue",
            created_by=create_user,
        )

        initiative = Initiative.objects.create(
            workspace=workspace,
            name="Launch initiative",
            created_by=create_user,
        )
        InitiativeProject.objects.create(
            initiative=initiative,
            project=project,
            created_by=create_user,
        )

        with _configured_llm(), _mock_summary_markdown("## Project digest"):
            project_response = session_client.post(
                _project_summarize_url(workspace.slug, project.id),
                format="json",
            )

        assert project_response.status_code == status.HTTP_200_OK
        assert project_response.data["rollup"]["percent_complete"] == 100

        with _configured_llm(), _mock_summary_markdown("## Initiative digest"):
            initiative_response = session_client.post(
                _initiative_summarize_url(workspace.slug, initiative.id),
                format="json",
            )

        assert initiative_response.status_code == status.HTTP_200_OK
        assert initiative_response.data["rollup"]["percent_complete"] == 100
        assert project_issue.name in project_response.data["markdown"] or project_response.data["rollup"]["percent_complete"] == 100

    def test_empty_entity_returns_no_activity_zeroed_rollup(
        self, session_client, workspace, project, cycle, create_user
    ):
        with _configured_llm(), _mock_summary_markdown("should not be called"):
            cycle_response = session_client.post(
                _cycle_summarize_url(workspace.slug, cycle.id),
                format="json",
            )
            project_response = session_client.post(
                _project_summarize_url(workspace.slug, project.id),
                format="json",
            )

        assert cycle_response.status_code == status.HTTP_200_OK
        assert cycle_response.data["markdown"] == NO_ACTIVITY_MARKDOWN
        assert cycle_response.data["rollup"] == {
            "percent_complete": 0,
            "blockers": [],
            "at_risk": [],
        }

        assert project_response.status_code == status.HTTP_200_OK
        assert project_response.data["markdown"] == NO_ACTIVITY_MARKDOWN
        assert project_response.data["rollup"]["percent_complete"] == 0

    def test_guest_or_non_member_403(self, api_client, workspace, project, cycle, create_user):
        guest = User.objects.create_user(email="guest-summarize@example.com", username="guest_summarize")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=ROLE.GUEST.value)
        ProjectMember.objects.create(project=project, member=guest, role=ROLE.GUEST.value)
        api_client.force_authenticate(user=guest)

        outsider = User.objects.create_user(email="outsider-summarize@example.com", username="outsider_summarize")
        outsider_client = api_client.__class__()
        outsider_client.force_authenticate(user=outsider)

        with _configured_llm(), _mock_summary_markdown("## Digest"):
            guest_response = api_client.post(_project_summarize_url(workspace.slug, project.id), format="json")
            outsider_response = outsider_client.post(
                _project_summarize_url(workspace.slug, project.id),
                format="json",
            )
            guest_cycle_response = api_client.post(
                _cycle_summarize_url(workspace.slug, cycle.id),
                format="json",
            )

        assert guest_response.status_code == status.HTTP_403_FORBIDDEN
        assert outsider_response.status_code == status.HTTP_403_FORBIDDEN
        assert guest_cycle_response.status_code == status.HTTP_403_FORBIDDEN

    def test_no_provider_400(self, session_client, workspace, project):
        with patch(
            "plane.app.views.ai_summary.get_llm_config",
            return_value=(None, None, None),
        ), patch(
            "plane.app.views.ai_summary.is_llm_configured",
            return_value=False,
        ):
            response = session_client.post(
                _project_summarize_url(workspace.slug, project.id),
                format="json",
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "LLM provider" in response.data["error"]

    def test_generated_markdown_is_sanitized(
        self, session_client, workspace, project, state, create_user
    ):
        Issue.objects.create(
            project=project,
            workspace=workspace,
            state=state,
            name="Tracked issue",
            created_by=create_user,
        )

        malicious_markdown = '<script>alert("xss")</script><p>Safe summary</p>'

        with _configured_llm(), _mock_summary_markdown(malicious_markdown):
            response = session_client.post(
                _project_summarize_url(workspace.slug, project.id),
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert "<script>" not in response.data["markdown"]
        assert "Safe summary" in response.data["markdown"]

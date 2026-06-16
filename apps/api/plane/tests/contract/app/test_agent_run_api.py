# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for AI-2-BE: AgentRun request / status / cancel.

v1 is non-autonomous — requesting or cancelling a run never mutates a work item.
The LLM provider is always mocked.
"""

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import (
    AgentRun,
    Issue,
    IssueActivity,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.db.models.state import StateGroup


def _agent_runs_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/agent-runs/"


def _agent_run_detail_url(slug, project_id, issue_id, pk):
    return f"{_agent_runs_url(slug, project_id, issue_id)}{pk}/"


def _agent_run_cancel_url(slug, project_id, issue_id, pk):
    return f"{_agent_run_detail_url(slug, project_id, issue_id, pk)}cancel/"


def _configured_llm():
    return patch(
        "plane.app.views.issue.agent_run.get_llm_config",
        return_value=("test-key", "gpt-4o-mini", "openai"),
    )


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Agent Run Project", identifier="ARP", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def state(project):
    return State.objects.create(
        name="Backlog", color="#60646C", group=StateGroup.BACKLOG.value, default=True, project=project
    )


@pytest.fixture
def issue(project, state, create_user):
    return Issue.objects.create(
        name="Refactor auth handler",
        description_html="<p>Make it testable.</p>",
        project=project,
        state=state,
        created_by=create_user,
    )


@pytest.mark.contract
class TestAgentRunApi:
    @pytest.mark.django_db
    def test_agent_run_created_queued_and_logged_no_autonomous_action(self, session_client, workspace, project, issue):
        issue_count_before = Issue.objects.count()
        original_name = issue.name
        original_state_id = issue.state_id

        with _configured_llm():
            response = session_client.post(
                _agent_runs_url(workspace.slug, project.id, issue.id),
                {"agent_key": "summarize_issue", "input": {"hint": "blockers"}},
                format="json",
            )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == AgentRun.Status.QUEUED
        agent_run = AgentRun.objects.get(id=response.data["id"])
        assert agent_run.status == AgentRun.Status.QUEUED
        assert agent_run.requested_by_id is not None
        assert agent_run.issue_id == issue.id
        # Surfaced in issue activity.
        assert IssueActivity.objects.filter(issue=issue, field="agent_run").exists()
        # No autonomous mutation: issue untouched, no new issues created.
        issue.refresh_from_db()
        assert issue.name == original_name
        assert issue.state_id == original_state_id
        assert Issue.objects.count() == issue_count_before

    @pytest.mark.django_db
    def test_guest_or_viewer_cannot_request_agent_run_403(self, api_client, workspace, project, issue):
        guest = User.objects.create_user(email="agent-guest@example.com", username="agent-guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5)
        api_client.force_authenticate(user=guest)

        with _configured_llm():
            response = api_client.post(
                _agent_runs_url(workspace.slug, project.id, issue.id),
                {"agent_key": "summarize_issue"},
                format="json",
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not AgentRun.objects.filter(issue=issue).exists()

    @pytest.mark.django_db
    def test_agent_run_provider_unconfigured_400(self, session_client, workspace, project, issue):
        with (
            patch("plane.app.views.issue.agent_run.get_llm_config", return_value=(None, None, None)),
            patch("plane.app.views.issue.agent_run.is_llm_configured", return_value=False),
        ):
            response = session_client.post(
                _agent_runs_url(workspace.slug, project.id, issue.id),
                {"agent_key": "summarize_issue"},
                format="json",
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not AgentRun.objects.filter(issue=issue).exists()

    @pytest.mark.django_db
    def test_cancelled_run_no_side_effects(self, session_client, workspace, project, issue):
        with _configured_llm():
            created = session_client.post(
                _agent_runs_url(workspace.slug, project.id, issue.id),
                {"agent_key": "summarize_issue"},
                format="json",
            )
        run_id = created.data["id"]
        issue_count_before = Issue.objects.count()

        response = session_client.post(
            _agent_run_cancel_url(workspace.slug, project.id, issue.id, run_id),
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == AgentRun.Status.CANCELLED
        AgentRun.objects.get(id=run_id, status=AgentRun.Status.CANCELLED)
        assert Issue.objects.count() == issue_count_before

    @pytest.mark.django_db
    def test_agent_run_status_endpoint_returns_current_state(self, session_client, workspace, project, issue):
        with _configured_llm():
            created = session_client.post(
                _agent_runs_url(workspace.slug, project.id, issue.id),
                {"agent_key": "summarize_issue"},
                format="json",
            )
        run_id = created.data["id"]

        response = session_client.get(_agent_run_detail_url(workspace.slug, project.id, issue.id, run_id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == run_id
        assert response.data["status"] == AgentRun.Status.QUEUED
        assert response.data["agent_key"] == "summarize_issue"

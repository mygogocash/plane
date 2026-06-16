# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytest

# Module imports
from plane.db.models import AgentRun
from plane.tests.factories import IssueFactory, ProjectFactory, UserFactory


@pytest.fixture
def project():
    return ProjectFactory()


@pytest.fixture
def requester():
    return UserFactory(email="agent-run-requester@plane.so", username="agent_run_requester")


@pytest.mark.unit
class TestAgentRunModel:
    @pytest.mark.django_db
    def test_agent_run_defaults_queued(self, project, requester):
        issue = IssueFactory(project=project)

        agent_run = AgentRun.objects.create(
            project=project,
            workspace=project.workspace,
            issue=issue,
            agent_key="summarize_issue",
            requested_by=requester,
            input={"issue_id": str(issue.id)},
        )

        assert agent_run.id is not None
        assert agent_run.status == AgentRun.Status.QUEUED
        assert agent_run.requested_by_id == requester.id
        assert agent_run.project_id == project.id
        assert agent_run.workspace_id == project.workspace_id
        assert agent_run.result is None
        assert agent_run.error == ""

    @pytest.mark.django_db
    def test_agent_run_status_transitions_recorded(self, project, requester):
        issue = IssueFactory(project=project)
        agent_run = AgentRun.objects.create(
            project=project,
            workspace=project.workspace,
            issue=issue,
            agent_key="summarize_issue",
            requested_by=requester,
        )

        for next_status in (
            AgentRun.Status.RUNNING,
            AgentRun.Status.SUCCEEDED,
        ):
            agent_run.status = next_status
            agent_run.save(update_fields=["status", "updated_at"])
            agent_run.refresh_from_db()
            assert agent_run.status == next_status

        # Terminal failure/cancel are equally persistable.
        agent_run.status = AgentRun.Status.FAILED
        agent_run.error = "boom"
        agent_run.save(update_fields=["status", "error", "updated_at"])
        agent_run.refresh_from_db()
        assert agent_run.status == AgentRun.Status.FAILED
        assert agent_run.error == "boom"

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WF-T9 — suggested-transition endpoint (rules-first, copilot-optional).

The endpoint always computes a rules-only top pick from the resolved rule set; copilot
enrichment is best-effort. If the copilot is unavailable, errors, or times out, the
endpoint degrades to the rules-only result with HTTP 200 — never 500 — and never leaks the
prompt or model id. The AI prompt carries only state names / issue type / state history —
never emails, API keys, or descriptions.
"""

# Python imports
from unittest import mock

import pytest
from rest_framework import status

# Module imports
from plane.db.models import (
    Issue,
    IssueAssignee,
    Project,
    ProjectMember,
    State,
    User,
    WorkflowTransition,
)

_AI_PATH = "plane.app.views.workflow.suggestion"


def _url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/suggested-transition/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Workflow Project", identifier="WF", workspace=workspace, created_by=create_user
    )
    project.workflow_status = "enabled"
    project.save()
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def state_a(project):
    return State.objects.create(name="Todo", project=project, group="unstarted", color="#60646C")


@pytest.fixture
def state_b(project):
    return State.objects.create(name="Done", project=project, group="completed", color="#46A758")


@pytest.fixture
def state_c(project):
    return State.objects.create(name="In Progress", project=project, group="started", color="#F59E0B")


@pytest.fixture
def state_d(project):
    return State.objects.create(name="Backlog", project=project, group="backlog", color="#8B8D98")


@pytest.fixture
def secret_user(db):
    return User.objects.create(
        email="secret-assignee@plane.so", username="secret_assignee", first_name="Sec", last_name="Ret"
    )


@pytest.fixture
def issue_in_a(workspace, project, state_a, secret_user):
    issue = Issue.objects.create(
        name="Implement billing",
        description_html="<p>TOP-SECRET internal description text</p>",
        workspace=workspace,
        project=project,
        state=state_a,
        created_by=project.created_by,
    )
    IssueAssignee.objects.create(
        issue=issue, assignee=secret_user, project=project, workspace=workspace
    )
    return issue


@pytest.fixture
def rules_a_to_b_and_c(project, state_a, state_b, state_c):
    WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_b)
    WorkflowTransition.objects.create(project=project, from_state=state_a, to_state=state_c)


@pytest.mark.contract
class TestSuggestedTransition:
    @pytest.mark.django_db
    def test_copilot_available__returns_ai_source(
        self, session_client, workspace, project, state_b, issue_in_a, rules_a_to_b_and_c, secret_user
    ):
        captured = {}

        def _fake_llm(task, prompt, api_key, model, provider):
            captured["prompt"] = prompt
            captured["task"] = task
            return '{"to_state": "Done", "confidence": 0.82}', None

        with mock.patch(f"{_AI_PATH}.get_llm_config", return_value=("k", "gemini-2.0", "gemini")), \
             mock.patch(f"{_AI_PATH}.get_llm_response", side_effect=_fake_llm):
            response = session_client.get(_url(workspace.slug, project.id, issue_in_a.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["source"] == "ai"
        assert response.data["to_state"] == str(state_b.id)
        assert response.data["confidence"] == pytest.approx(0.82)

        # Prompt minimization: no assignee email, no description text, no model id leaked into prompt.
        sent = captured["prompt"] + captured["task"]
        assert secret_user.email not in sent
        assert "TOP-SECRET" not in sent

    @pytest.mark.django_db
    def test_copilot_error__returns_rules_only_200(
        self, session_client, workspace, project, state_b, state_c, issue_in_a, rules_a_to_b_and_c
    ):
        with mock.patch(f"{_AI_PATH}.get_llm_config", return_value=("k", "gemini-2.0", "gemini")), \
             mock.patch(f"{_AI_PATH}.get_llm_response", return_value=(None, "Rate limit exceeded")):
            response = session_client.get(_url(workspace.slug, project.id, issue_in_a.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["source"] == "rules"
        assert response.data["to_state"] in {str(state_b.id), str(state_c.id)}
        # No prompt / model id leakage: response surface is exactly these three keys.
        assert set(response.data.keys()) == {"to_state", "confidence", "source"}

    @pytest.mark.django_db
    def test_copilot_raises__returns_rules_only_never_500(
        self, session_client, workspace, project, state_b, state_c, issue_in_a, rules_a_to_b_and_c
    ):
        with mock.patch(f"{_AI_PATH}.get_llm_config", return_value=("k", "gemini-2.0", "gemini")), \
             mock.patch(f"{_AI_PATH}.get_llm_response", side_effect=TimeoutError("copilot timed out")):
            response = session_client.get(_url(workspace.slug, project.id, issue_in_a.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["source"] == "rules"

    @pytest.mark.django_db
    def test_no_legal_target__returns_empty(
        self, session_client, workspace, project, state_d, rules_a_to_b_and_c
    ):
        # Issue sits in Backlog, which has no outgoing rule -> nothing rankable.
        issue = Issue.objects.create(
            name="No outgoing", workspace=workspace, project=project, state=state_d, created_by=project.created_by
        )

        with mock.patch(f"{_AI_PATH}.get_llm_config", return_value=(None, None, None)):
            response = session_client.get(_url(workspace.slug, project.id, issue.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["to_state"] is None
        assert response.data["source"] == "rules"

    @pytest.mark.django_db
    def test_ranking_prefers_frequently_used_target(
        self, session_client, workspace, project, state_a, state_b, state_c, issue_in_a, rules_a_to_b_and_c
    ):
        from plane.db.models import IssueActivity
        from django.utils import timezone

        # Three past transitions into "In Progress", one into "Done" => C should rank first.
        for _ in range(3):
            IssueActivity.objects.create(
                project=project, issue=issue_in_a, field="state",
                new_value=state_c.name, epoch=timezone.now().timestamp(),
            )
        IssueActivity.objects.create(
            project=project, issue=issue_in_a, field="state",
            new_value=state_b.name, epoch=timezone.now().timestamp(),
        )

        with mock.patch(f"{_AI_PATH}.get_llm_config", return_value=(None, None, None)):
            response = session_client.get(_url(workspace.slug, project.id, issue_in_a.id))

        assert response.status_code == status.HTTP_200_OK
        assert response.data["source"] == "rules"
        assert response.data["to_state"] == str(state_c.id)

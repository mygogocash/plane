# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    StatusUpdate,
    User,
)


def _copilot_query_url(slug):
    return f"/api/workspaces/{slug}/copilot/query/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Copilot Query Project",
        identifier="CQP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def state(project):
    return State.objects.create(name="Backlog", project=project, group="backlog", color="#60646C", default=True)


@pytest.fixture
def epic_type(workspace, project):
    issue_type = IssueType.objects.create(workspace=workspace, name="Epic", is_epic=True)
    ProjectIssueType.objects.create(project=project, issue_type=issue_type, is_default=True)
    return issue_type


@pytest.fixture
def epic(project, state, epic_type, create_user):
    return Issue.objects.create(
        project=project,
        type=epic_type,
        state=state,
        name="Launch roadmap",
        description_html="<p>Launch roadmap covers beta readiness.</p>",
        description_stripped="Launch roadmap covers beta readiness.",
        created_by=create_user,
    )


@pytest.fixture
def status_update(workspace, epic, create_user):
    return StatusUpdate.objects.create(
        workspace=workspace,
        epic=epic,
        actor=create_user,
        status=StatusUpdate.Status.AT_RISK,
        comment_html="<p>Beta access is blocking the launch checklist.</p>",
        created_by=create_user,
    )


def _configured_llm():
    return patch("plane.app.views.copilot.get_llm_config", return_value=("test-key", "gpt-4o-mini", "openai"))


@pytest.mark.contract
class TestCopilotQueryEndpoint:
    @pytest.mark.django_db
    def test_epic_scope_returns_answer_summary_evidence_from_readable_objects(
        self, session_client, workspace, epic, status_update
    ):
        with (
            _configured_llm(),
            patch(
                "plane.app.views.copilot.call_copilot_llm",
                return_value={
                    "answer": "The launch roadmap is at risk because beta access is blocked.",
                    "summary": "Beta access is blocking launch readiness.",
                },
            ) as mocked_llm,
        ):
            response = session_client.post(
                _copilot_query_url(workspace.slug),
                {
                    "scope": "epic",
                    "object_id": str(epic.id),
                    "question": "Summarize blockers for this epic.",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["answer"] == "The launch roadmap is at risk because beta access is blocked."
        assert response.data["summary"] == "Beta access is blocking launch readiness."
        evidence_types = {item["entity_type"] for item in response.data["evidence"]}
        assert {"epic", "status_update"}.issubset(evidence_types)
        assert any(item["entity_id"] == str(status_update.id) for item in response.data["evidence"])

        llm_payload = mocked_llm.call_args.kwargs
        assert llm_payload["mode"] == "answer"
        assert llm_payload["message"] == "Summarize blockers for this epic."
        assert llm_payload["context"]["scope"] == "epic"
        assert llm_payload["context"]["object_id"] == str(epic.id)
        assert any(item["entity_id"] == str(status_update.id) for item in llm_payload["evidence"])

    @pytest.mark.django_db
    def test_project_scope_returns_answer_summary_evidence_from_readable_project(
        self, session_client, workspace, project, status_update
    ):
        with (
            _configured_llm(),
            patch(
                "plane.app.views.copilot.call_copilot_llm",
                return_value={
                    "answer": "Project delivery is at risk because beta access is blocked.",
                    "summary": "Project risk is tied to beta access.",
                    "actions": [],
                },
            ) as mocked_llm,
        ):
            response = session_client.post(
                _copilot_query_url(workspace.slug),
                {
                    "scope": "project",
                    "object_id": str(project.id),
                    "question": "Summarize project delivery risk.",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["answer"] == "Project delivery is at risk because beta access is blocked."
        evidence_types = {item["entity_type"] for item in response.data["evidence"]}
        assert {"project", "status_update"}.issubset(evidence_types)
        assert any(item["entity_id"] == str(status_update.id) for item in response.data["evidence"])

        llm_payload = mocked_llm.call_args.kwargs
        assert llm_payload["context"]["scope"] == "project"
        assert llm_payload["context"]["object_id"] == str(project.id)
        assert any(item["entity_id"] == str(status_update.id) for item in llm_payload["evidence"])

    @pytest.mark.django_db
    def test_evidence_excludes_unreadable_objects(
        self, session_client, workspace, project, epic, epic_type, create_user
    ):
        other_project = Project.objects.create(
            name="Private Project",
            identifier="PRV",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectIssueType.objects.create(project=other_project, issue_type=epic_type)
        other_state = State.objects.create(name="Todo", project=other_project, group="backlog", color="#60646C")
        unreadable_epic = Issue.objects.create(
            project=other_project,
            type=epic_type,
            state=other_state,
            name="Secret acquisition",
            description_html="<p>Secret acquisition details.</p>",
            description_stripped="Secret acquisition details.",
            created_by=create_user,
        )
        unreadable_update = StatusUpdate.objects.create(
            workspace=workspace,
            epic=unreadable_epic,
            actor=create_user,
            status=StatusUpdate.Status.OFF_TRACK,
            comment_html="<p>Secret acquisition is blocked.</p>",
            created_by=create_user,
        )

        def answer_from_readable_evidence(**kwargs):
            evidence = kwargs["evidence"]
            serialized = str(evidence)
            assert str(unreadable_epic.id) not in serialized
            assert str(unreadable_update.id) not in serialized
            assert "Secret acquisition" not in serialized
            return {"answer": "Only readable launch evidence was used.", "summary": "No private evidence included."}

        with (
            _configured_llm(),
            patch("plane.app.views.copilot.call_copilot_llm", side_effect=answer_from_readable_evidence),
        ):
            response = session_client.post(
                _copilot_query_url(workspace.slug),
                {
                    "scope": "epic",
                    "object_id": str(epic.id),
                    "question": "What is blocked?",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert "Secret acquisition" not in str(response.data)
        assert response.data["answer"] == "Only readable launch evidence was used."

    @pytest.mark.django_db
    def test_fail_closed_when_llm_not_configured_returns_409(self, session_client, workspace, epic):
        with (
            patch("plane.app.views.copilot.get_llm_config", return_value=(None, None, None)),
            patch("plane.app.views.copilot.is_llm_configured", return_value=False),
            patch("plane.app.views.copilot.call_copilot_llm") as mocked_llm,
        ):
            response = session_client.post(
                _copilot_query_url(workspace.slug),
                {
                    "scope": "epic",
                    "object_id": str(epic.id),
                    "question": "Summarize this epic.",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["error"] == "ai_provider_not_configured"
        mocked_llm.assert_not_called()

    @pytest.mark.django_db
    def test_provider_outage_returns_503_graceful(self, session_client, workspace, epic):
        with (
            _configured_llm(),
            patch("plane.app.views.copilot.call_copilot_llm", side_effect=TimeoutError("provider quota exhausted")),
        ):
            response = session_client.post(
                _copilot_query_url(workspace.slug),
                {
                    "scope": "epic",
                    "object_id": str(epic.id),
                    "question": "Summarize this epic.",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data["error"] == "ai_unavailable"
        assert "provider quota exhausted" not in str(response.data)

    @pytest.mark.django_db
    def test_non_member_of_scope_rejected(self, api_client, workspace, epic):
        outsider = User.objects.create_user(email="copilot-query-outsider@example.com", username="copilot_query_out")
        api_client.force_authenticate(user=outsider)

        with patch("plane.app.views.copilot.call_copilot_llm") as mocked_llm:
            response = api_client.post(
                _copilot_query_url(workspace.slug),
                {
                    "scope": "epic",
                    "object_id": str(epic.id),
                    "question": "Summarize this epic.",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        mocked_llm.assert_not_called()

# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from plane.app.views.copilot import call_copilot_llm
from plane.db.models import Issue, Project, ProjectMember, State, User, WorkspaceMember
from plane.db.models.state import StateGroup
from plane.license.models import Instance


def _copilot_url(workspace_slug):
    return f"/api/workspaces/{workspace_slug}/copilot/messages/"


def _create_project_with_issue(workspace, user, *, issue_name="Onboarding setup"):
    project = Project.objects.create(
        name="Copilot Project",
        identifier="COP",
        workspace=workspace,
    )
    ProjectMember.objects.create(project=project, member=user, role=20)
    state = State.objects.create(
        name="Backlog",
        color="#60646C",
        group=StateGroup.BACKLOG.value,
        default=True,
        project=project,
    )
    issue = Issue.objects.create(
        name=issue_name,
        description_html="<p>Prepare workspace invitation flow and smoke checks.</p>",
        project=project,
        state=state,
    )
    return project, issue


def _create_instance():
    return Instance.objects.create(
        instance_name="Test Plane",
        instance_id="test-plane",
        current_version="0.0.0",
        last_checked_at=timezone.now(),
    )


@pytest.mark.contract
class TestCopilotMessagesEndpoint:
    @pytest.mark.django_db
    def test_copilot__given_non_member__then_no_workspace_evidence_returned(self, api_client, workspace):
        outsider = User.objects.create_user(email="outsider@example.com", username="outsider")
        api_client.force_authenticate(user=outsider)

        with patch("plane.app.views.copilot.call_copilot_llm") as mocked_llm:
            response = api_client.post(
                _copilot_url(workspace.slug),
                {"message": "What is happening?", "mode": "answer"},
                format="json",
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        mocked_llm.assert_not_called()

    @pytest.mark.django_db
    def test_copilot__given_missing_llm_config__then_returns_400_without_querying_model(
        self, session_client, workspace
    ):
        with (
            patch("plane.app.views.copilot.get_llm_config", return_value=(None, None, None)),
            patch("plane.app.views.copilot.call_copilot_llm") as mocked_llm,
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {"message": "Summarize the workspace.", "mode": "answer"},
                format="json",
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "LLM provider API key and model are required"
        mocked_llm.assert_not_called()

    @pytest.mark.django_db
    def test_copilot__given_issue_context__then_returns_permission_scoped_citations(
        self, session_client, workspace, create_user
    ):
        project, issue = _create_project_with_issue(workspace, create_user)

        with (
            patch("plane.app.views.copilot.get_llm_config", return_value=("test-key", "gpt-4o-mini", "openai")),
            patch(
                "plane.app.views.copilot.call_copilot_llm",
                return_value={
                    "answer": "The onboarding setup work item owns the invitation flow.",
                    "subtask_draft": None,
                },
            ) as mocked_llm,
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {
                    "message": "What does this issue cover?",
                    "mode": "answer",
                    "project_id": str(project.id),
                    "issue_id": str(issue.id),
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["answer"] == "The onboarding setup work item owns the invitation flow."
        assert response.data["citations"]
        assert response.data["citations"][0]["entity_type"] == "issue"
        assert response.data["citations"][0]["entity_id"] == str(issue.id)
        assert response.data["citations"][0]["title"] == issue.name
        llm_payload = mocked_llm.call_args.kwargs
        assert any(item["entity_id"] == str(issue.id) for item in llm_payload["evidence"])

    @pytest.mark.django_db
    def test_copilot__given_vertex_provider__then_accepts_project_scoped_config_without_api_key(
        self, session_client, workspace, create_user
    ):
        project, issue = _create_project_with_issue(workspace, create_user)

        with (
            patch("plane.app.views.copilot.get_llm_config", return_value=("", "gemini-2.5-flash", "vertexai")),
            patch.dict(
                "os.environ",
                {
                    "LLM_VERTEX_PROJECT": "plane-test-project",
                    "LLM_VERTEX_LOCATION": "us-central1",
                },
            ),
            patch(
                "plane.app.views.copilot.call_copilot_llm",
                return_value={
                    "answer": "The launch work is ready for review.",
                    "subtask_draft": None,
                },
            ) as mocked_llm,
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {
                    "message": "Summarize this issue.",
                    "mode": "answer",
                    "project_id": str(project.id),
                    "issue_id": str(issue.id),
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["answer"] == "The launch work is ready for review."
        llm_payload = mocked_llm.call_args.kwargs
        assert llm_payload["api_key"] == ""
        assert llm_payload["provider"] == "vertexai"

    @pytest.mark.django_db
    def test_copilot__given_subtask_request__then_returns_valid_structured_draft(
        self, session_client, workspace, create_user
    ):
        project, issue = _create_project_with_issue(workspace, create_user, issue_name="Launch Plane workspace")
        draft = {
            "items": [
                {
                    "name": "Verify workspace invite email",
                    "description_html": "<p>Send a test invite and confirm delivery.</p>",
                    "priority": "high",
                    "assignee_ids": [],
                    "label_ids": [],
                    "rationale": "Invitation delivery is part of the launch checklist.",
                }
            ]
        }

        with (
            patch("plane.app.views.copilot.get_llm_config", return_value=("test-key", "gpt-4o-mini", "openai")),
            patch(
                "plane.app.views.copilot.call_copilot_llm",
                return_value={"answer": "Review these subtasks before creating them.", "subtask_draft": draft},
            ),
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {
                    "message": "Break this work item into subtasks.",
                    "mode": "draft_subtasks",
                    "project_id": str(project.id),
                    "issue_id": str(issue.id),
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mode"] == "draft_subtasks"
        assert response.data["subtask_draft"]["items"][0]["name"] == "Verify workspace invite email"
        assert response.data["subtask_draft"]["items"][0]["priority"] == "high"
        assert response.data["subtask_draft"]["items"][0]["assignee_ids"] == []
        assert response.data["subtask_draft"]["items"][0]["label_ids"] == []

    @pytest.mark.django_db
    def test_copilot__given_create_issue_command__then_applies_action_and_persists_conversation(
        self, session_client, workspace, create_user
    ):
        project, issue = _create_project_with_issue(workspace, create_user, issue_name="Launch Plane workspace")
        action = {
            "type": "create_issue",
            "project_id": str(project.id),
            "name": "Verify landing handoff",
            "description_html": "<p>Confirm CTA links point to the app domain.</p>",
            "priority": "high",
            "parent_id": str(issue.id),
        }

        with (
            patch("plane.app.views.copilot.get_llm_config", return_value=("", "gemini-2.5-flash", "vertexai")),
            patch.dict(
                "os.environ",
                {
                    "LLM_VERTEX_PROJECT": "plane-test-project",
                    "LLM_VERTEX_LOCATION": "us-central1",
                },
            ),
            patch(
                "plane.app.views.copilot.call_copilot_llm",
                return_value={
                    "answer": "I created a child work item for the landing handoff check.",
                    "subtask_draft": None,
                    "actions": [action],
                },
            ),
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {
                    "message": "Create a child work item to verify the landing handoff.",
                    "mode": "command",
                    "project_id": str(project.id),
                    "issue_id": str(issue.id),
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["conversation_id"]
        assert response.data["mode"] == "command"
        assert response.data["actions"][0]["status"] == "applied"
        assert response.data["action_results"][0]["status"] == "applied"

        created_issue = Issue.issue_objects.get(name="Verify landing handoff")
        assert created_issue.project_id == project.id
        assert created_issue.parent_id == issue.id
        assert created_issue.priority == "high"

        from plane.db.models import CopilotConversation, CopilotMessage

        conversation = CopilotConversation.objects.get(pk=response.data["conversation_id"])
        assert conversation.workspace_id == workspace.id
        assert conversation.user_id == create_user.id
        message = CopilotMessage.objects.get(conversation=conversation)
        assert message.actions[0]["type"] == "create_issue"
        assert message.action_results[0]["entity_id"] == str(created_issue.id)

    @pytest.mark.django_db
    def test_copilot__given_guest_write_command__then_rejects_without_querying_model(
        self, api_client, workspace, create_user
    ):
        project, issue = _create_project_with_issue(workspace, create_user, issue_name="Guest visible work")
        guest = User.objects.create_user(email="guest-copilot@example.com", username="guest-copilot")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5)
        api_client.force_authenticate(user=guest)

        with patch("plane.app.views.copilot.call_copilot_llm") as mocked_llm:
            response = api_client.post(
                _copilot_url(workspace.slug),
                {
                    "message": "Set this work item to high priority.",
                    "mode": "command",
                    "project_id": str(project.id),
                    "issue_id": str(issue.id),
                },
                format="json",
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        mocked_llm.assert_not_called()

    def test_call_copilot_llm__given_vertex_provider__then_uses_vertex_adapter(self):
        with patch(
            "plane.app.views.copilot.call_vertex_copilot_llm",
            return_value={"answer": "Vertex answer", "subtask_draft": None},
        ) as mocked_vertex:
            result = call_copilot_llm(
                api_key="",
                model="gemini-2.5-flash",
                provider="vertexai",
                mode="answer",
                message="What changed?",
                evidence=[],
                context={"workspace_slug": "test"},
            )

        assert result["answer"] == "Vertex answer"
        mocked_vertex.assert_called_once()

    @pytest.mark.django_db
    @override_settings(SKIP_ENV_VAR=False)
    def test_instance_config__given_cloudflare_provider__then_reports_default_model_and_unconfigured_without_secret(self, api_client):
        _create_instance()

        with patch.dict(
            "os.environ",
            {
                "LLM_API_KEY": "",
                "LLM_PROVIDER": "cloudflare",
                "LLM_MODEL": "@cf/zai-org/glm-5.2",
                "LLM_VERTEX_PROJECT": "plane-test-project",
                "LLM_VERTEX_LOCATION": "us-central1",
            },
        ):
            response = api_client.get("/api/instances/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["config"]["has_llm_configured"] is False

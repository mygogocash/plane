# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for AI-1-API: copilot create_work_item / describe / summarize_issue modes.

The LLM provider is always mocked — these tests never call a real provider.
"""

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.db.models.state import StateGroup


def _copilot_url(slug):
    return f"/api/workspaces/{slug}/copilot/messages/"


def _configured_llm():
    return patch(
        "plane.app.views.copilot.get_llm_config",
        return_value=("test-key", "gpt-4o-mini", "openai"),
    )


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="AI WorkItem Project",
        identifier="AIW",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def state(project):
    return State.objects.create(
        name="Backlog",
        color="#60646C",
        group=StateGroup.BACKLOG.value,
        default=True,
        project=project,
    )


@pytest.fixture
def issue(project, state, create_user):
    return Issue.objects.create(
        name="Login throws 500",
        description_html="<p>Steps to reproduce.</p>",
        description_stripped="Steps to reproduce.",
        project=project,
        state=state,
        created_by=create_user,
    )


@pytest.mark.contract
class TestCopilotWorkItemModes:
    @pytest.mark.django_db
    def test_create_work_item_mode_returns_structured_draft(self, session_client, workspace):
        before = Issue.objects.count()
        with (
            _configured_llm(),
            patch(
                "plane.app.views.copilot.call_copilot_workitem_llm",
                return_value={
                    "title": "Fix login 500 error",
                    "description_html": "<p>Investigate the auth handler.</p>",
                    "priority": "high",
                    "assignee": "alice",
                    "type": "Bug",
                    "property_values": {"severity": "high"},
                },
            ) as mocked,
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {"mode": "create_work_item", "message": "Draft a bug for the login 500 error"},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mode"] == "create_work_item"
        draft = response.data["draft"]
        for key in ("title", "description_html", "priority", "assignee", "type", "property_values"):
            assert key in draft, f"missing {key} in draft"
        assert draft["title"] == "Fix login 500 error"
        assert draft["priority"] == "high"
        # Drafts are returned for review — nothing is persisted.
        assert Issue.objects.count() == before
        mocked.assert_called_once()

    @pytest.mark.django_db
    def test_describe_mode_returns_text_for_each_action(self, session_client, workspace):
        for action in ("draft", "simplify", "rewrite"):
            with (
                _configured_llm(),
                patch(
                    "plane.app.views.copilot.call_copilot_workitem_llm",
                    return_value={"text": f"Clean {action} output"},
                ),
            ):
                response = session_client.post(
                    _copilot_url(workspace.slug),
                    {"mode": "describe", "action": action, "message": "Improve this description"},
                    format="json",
                )

            assert response.status_code == status.HTTP_200_OK, action
            assert response.data["mode"] == "describe"
            assert response.data["action"] == action
            assert response.data["text"] == f"Clean {action} output"

    @pytest.mark.django_db
    def test_invalid_describe_action_rejected_400(self, session_client, workspace):
        with (
            _configured_llm(),
            patch("plane.app.views.copilot.call_copilot_workitem_llm") as mocked,
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {"mode": "describe", "action": "translate", "message": "Translate this"},
                format="json",
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "invalid_describe_action"
        mocked.assert_not_called()

    @pytest.mark.django_db
    def test_summarize_issue_returns_scoped_digest(self, session_client, workspace, project, issue, create_user):
        # A cross-project issue the requester cannot read (no ProjectMember row).
        other_project = Project.objects.create(
            name="Private", identifier="PRV", workspace=workspace, created_by=create_user
        )
        other_state = State.objects.create(
            name="Todo", color="#60646C", group=StateGroup.BACKLOG.value, project=other_project
        )
        secret_issue = Issue.objects.create(
            name="Login secret breach",
            description_html="<p>Secret breach details.</p>",
            description_stripped="Secret breach details.",
            project=other_project,
            state=other_state,
            created_by=create_user,
        )

        with (
            _configured_llm(),
            patch(
                "plane.app.views.copilot.call_copilot_workitem_llm",
                return_value={"summary": "Login 500 confirmed on staging."},
            ),
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {
                    "mode": "summarize_issue",
                    "message": "Summarize",
                    "project_id": str(project.id),
                    "issue_id": str(issue.id),
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mode"] == "summarize_issue"
        assert response.data["summary"] == "Login 500 confirmed on staging."
        serialized = str(response.data["evidence"])
        assert str(secret_issue.id) not in serialized
        assert "secret breach" not in serialized.lower()

    @pytest.mark.django_db
    def test_summarize_empty_issue_graceful(self, session_client, workspace, project, issue):
        with (
            _configured_llm(),
            patch(
                "plane.app.views.copilot.call_copilot_workitem_llm",
                return_value={"summary": ""},
            ),
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {
                    "mode": "summarize_issue",
                    "message": "Summarize",
                    "project_id": str(project.id),
                    "issue_id": str(issue.id),
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["mode"] == "summarize_issue"
        assert "summary" in response.data

    @pytest.mark.django_db
    @pytest.mark.parametrize(
        "mode_payload",
        [
            {"mode": "create_work_item", "message": "Draft a bug"},
            {"mode": "describe", "action": "draft", "message": "Polish this"},
            {"mode": "summarize_issue", "message": "Summarize"},
        ],
    )
    def test_ai_modes_fail_closed_when_provider_unconfigured_400(self, session_client, workspace, mode_payload):
        with (
            patch("plane.app.views.copilot.get_llm_config", return_value=(None, None, None)),
            patch("plane.app.views.copilot.is_llm_configured", return_value=False),
            patch("plane.app.views.copilot.call_copilot_workitem_llm") as mocked,
        ):
            response = session_client.post(_copilot_url(workspace.slug), mode_payload, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        mocked.assert_not_called()

    @pytest.mark.django_db
    def test_summarize_issue_provider_outage_returns_503(self, session_client, workspace, project, issue):
        with (
            _configured_llm(),
            patch(
                "plane.app.views.copilot.call_copilot_workitem_llm",
                side_effect=TimeoutError("provider quota exhausted"),
            ),
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {
                    "mode": "summarize_issue",
                    "message": "Summarize",
                    "project_id": str(project.id),
                    "issue_id": str(issue.id),
                },
                format="json",
            )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data["error"] == "ai_unavailable"
        assert "provider quota exhausted" not in str(response.data)

    @pytest.mark.django_db
    def test_guest_blocked_from_ai_write_mode_403(self, api_client, workspace, create_user):
        guest = User.objects.create_user(email="guest-ai@example.com", username="guest-ai")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        api_client.force_authenticate(user=guest)

        with (
            _configured_llm(),
            patch("plane.app.views.copilot.call_copilot_workitem_llm") as mocked,
        ):
            response = api_client.post(
                _copilot_url(workspace.slug),
                {"mode": "create_work_item", "message": "Draft a bug"},
                format="json",
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        mocked.assert_not_called()

    @pytest.mark.django_db
    def test_ai_returned_html_sanitized(self, session_client, workspace):
        with (
            _configured_llm(),
            patch(
                "plane.app.views.copilot.call_copilot_workitem_llm",
                return_value={
                    "title": "XSS test",
                    "description_html": "<p>safe</p><script>alert('x')</script>",
                    "priority": "none",
                    "assignee": None,
                    "type": None,
                    "property_values": {},
                },
            ),
        ):
            response = session_client.post(
                _copilot_url(workspace.slug),
                {"mode": "create_work_item", "message": "Draft with script"},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        html = response.data["draft"]["description_html"]
        assert "<script>" not in html
        assert "safe" in html

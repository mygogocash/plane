# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.app.permissions import ROLE
from plane.db.models import Issue, Page, PageLog, Project, ProjectMember, ProjectPage, State, User, WorkspaceMember


def _generate_brief_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/generate-brief/"


def _rephrase_url(slug):
    return f"/api/workspaces/{slug}/rephrase-grammar/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Brief Project",
        identifier="BRF",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.ADMIN.value)
    return project


@pytest.fixture
def state(project):
    return State.objects.create(name="Open", project=project, group="started", color="#46A758")


@pytest.fixture
def issue(project, state, workspace, create_user):
    return Issue.objects.create(
        project=project,
        workspace=workspace,
        state=state,
        name="Checkout payment fails",
        description_html="<p>Users cannot complete checkout on mobile.</p>",
        created_by=create_user,
    )


def _configured_llm():
    return patch(
        "plane.app.views.generate_brief.get_llm_config",
        return_value=("test-key", "gpt-4o-mini", "openai"),
    )


def _mock_brief_llm(html):
    return patch(
        "plane.utils.generate_brief.get_llm_response",
        return_value=(html, None),
    )


def _configured_rephrase_llm():
    return patch(
        "plane.app.views.rephrase_grammar.get_llm_config",
        return_value=("test-key", "gpt-4o-mini", "openai"),
    )


def _mock_llm_response(text):
    return patch(
        "plane.app.views.rephrase_grammar.get_llm_response",
        return_value=(text, None),
    )


@pytest.mark.contract
class TestGenerateBriefAndTranslate:
    def test_generate_brief_creates_linked_sectioned_page(self, session_client, workspace, project, issue):
        brief_html = (
            "<h2>Problem</h2><p>Checkout fails on mobile.</p>"
            "<h2>Solution</h2><p>Fix payment gateway.</p>"
            "<h2>Acceptance Criteria</h2><ul><li>Payment succeeds</li></ul>"
            "<h2>Notes</h2><p>Track in sprint.</p>"
        )

        with _configured_llm(), _mock_brief_llm(brief_html):
            response = session_client.post(_generate_brief_url(workspace.slug, project.id, issue.id), format="json")

        assert response.status_code == status.HTTP_200_OK, response.data
        assert "page_id" in response.data

        page = Page.objects.get(pk=response.data["page_id"])
        assert "Problem" in page.description_html
        assert "Solution" in page.description_html
        assert ProjectPage.objects.filter(page=page, project=project).exists()
        assert PageLog.objects.filter(
            page=page,
            entity_name="issue",
            entity_identifier=issue.id,
        ).exists()

    def test_brief_content_sanitized_before_persist(self, session_client, workspace, project, issue):
        malicious_html = (
            '<h2>Problem</h2><p onclick="alert(1)">Issue</p>'
            '<script>alert("xss")</script><h2>Solution</h2><p>Fix it</p>'
            "<h2>Acceptance Criteria</h2><p>Done</p><h2>Notes</h2><p>None</p>"
        )

        with _configured_llm(), _mock_brief_llm(malicious_html):
            response = session_client.post(_generate_brief_url(workspace.slug, project.id, issue.id), format="json")

        assert response.status_code == status.HTTP_200_OK
        page = Page.objects.get(pk=response.data["page_id"])
        assert "<script" not in page.description_html
        assert "onclick" not in page.description_html
        assert "Fix it" in page.description_html

    def test_regenerate_does_not_destroy_prior_page(self, session_client, workspace, project, issue):
        brief_html = (
            "<h2>Problem</h2><p>First draft</p>"
            "<h2>Solution</h2><p>Plan A</p>"
            "<h2>Acceptance Criteria</h2><p>Criteria</p>"
            "<h2>Notes</h2><p>Notes</p>"
        )

        with _configured_llm(), _mock_brief_llm(brief_html):
            first = session_client.post(_generate_brief_url(workspace.slug, project.id, issue.id), format="json")
            second = session_client.post(
                _generate_brief_url(workspace.slug, project.id, issue.id),
                {"regenerate": True},
                format="json",
            )

        assert first.status_code == status.HTTP_200_OK
        assert second.status_code == status.HTTP_200_OK
        assert first.data["page_id"] != second.data["page_id"]
        assert Page.objects.filter(pk=first.data["page_id"]).exists()
        assert Page.objects.filter(pk=second.data["page_id"]).exists()
        assert second.data.get("regenerated") is True

    def test_guest_generate_brief_403(self, api_client, workspace, project, issue):
        guest = User.objects.create_user(email="guest-brief@example.com", username="guest_brief")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=ROLE.GUEST.value)
        ProjectMember.objects.create(project=project, member=guest, role=ROLE.GUEST.value)
        api_client.force_authenticate(user=guest)

        with _configured_llm(), _mock_brief_llm(
            "<h2>Problem</h2><p>x</p><h2>Solution</h2><p>x</p><h2>Acceptance Criteria</h2><p>x</p><h2>Notes</h2><p>x</p>"
        ):
            response = api_client.post(_generate_brief_url(workspace.slug, project.id, issue.id), format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_translate_branch_routes_through_rephrase_returns_translation(self, session_client, workspace):
        with _configured_rephrase_llm(), _mock_llm_response("Hola mundo"):
            response = session_client.post(
                _rephrase_url(workspace.slug),
                {
                    "task": "translate",
                    "text_input": "Hello world",
                    "target_language": "es",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["response"] == "Hola mundo"

    def test_translate_does_not_break_casual_formal_scoring(self, session_client, workspace):
        with _configured_rephrase_llm(), _mock_llm_response("Polished copy") as mock_llm:
            response = session_client.post(
                _rephrase_url(workspace.slug),
                {
                    "task": "ASK_ANYTHING",
                    "text_input": "hello team",
                    "casual_score": 0,
                    "formal_score": 10,
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["response"] == "Polished copy"
        prompt = mock_llm.call_args[0][1]
        assert "Formal tone score: 10/10" in prompt
        assert "Casual tone score: 0/10" in prompt

    def test_empty_selection_or_blank_language_validation_error_no_replace(self, session_client, workspace):
        empty_text = session_client.post(
            _rephrase_url(workspace.slug),
            {"task": "translate", "text_input": "   ", "target_language": "es"},
            format="json",
        )
        blank_language = session_client.post(
            _rephrase_url(workspace.slug),
            {"task": "translate", "text_input": "Hello", "target_language": "  "},
            format="json",
        )

        assert empty_text.status_code == status.HTTP_400_BAD_REQUEST
        assert blank_language.status_code == status.HTTP_400_BAD_REQUEST

    def test_guest_translate_rejected_via_write_modes(self, api_client, workspace):
        guest = User.objects.create_user(email="guest-translate@example.com", username="guest_translate")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=ROLE.GUEST.value)
        api_client.force_authenticate(user=guest)

        with _configured_rephrase_llm(), _mock_llm_response("Hola"):
            response = api_client.post(
                _rephrase_url(workspace.slug),
                {
                    "task": "translate",
                    "text_input": "Hello",
                    "target_language": "es",
                },
                format="json",
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN

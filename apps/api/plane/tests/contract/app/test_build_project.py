# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T9 contract tests: build_project Copilot mode + transactional apply.

Acceptance criteria coverage (tasks.md AI-T9 / AI-S10, AI-S11):
  - editable draft returned, nothing persisted until apply
  - transactional apply persists project + issues + cycle
  - missing label/assignee -> create-or-skip with per-item warning
  - mid-failure rolls back fully (no partial rows)
  - concurrent apply of same draft token is idempotent
  - guest build rejected; apply requires >= MEMBER
  - no provider -> 400 on build; quota -> 503 with no partial persist
  - apply writes an audit entry
"""

from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.permissions import ROLE
from plane.db.models import (
    AuditLog,
    Cycle,
    CycleIssue,
    Issue,
    Project,
    ProjectMember,
    User,
    WorkspaceMember,
)


def _messages_url(slug):
    return f"/api/workspaces/{slug}/copilot/messages/"


def _apply_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/build-project/apply/"


def _raw_draft():
    """A raw LLM draft in the shape ``_normalize_project_draft`` expects."""
    return {
        "name": "Mobile App",
        "description": "Build the mobile app",
        "work_items": [
            {
                "name": "Set up CI",
                "description": "ci",
                "estimate": None,
                "priority": "high",
                "labels": ["infra"],
                "assignee_suggestion": None,
            },
            {
                "name": "Login screen",
                "description": "login",
                "estimate": None,
                "priority": "medium",
                "labels": [],
                "assignee_suggestion": None,
            },
        ],
        "suggested_cycle": {"name": "Sprint 1", "start_date": None, "end_date": None},
    }


def _configured_llm():
    return patch(
        "plane.app.views.copilot.get_llm_config",
        return_value=("test-key", "gpt-4o-mini", "openai"),
    )


def _mock_synthesis(draft=None):
    return patch(
        "plane.app.views.copilot.synthesize_build_project_draft",
        return_value=draft or _raw_draft(),
    )


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Build Project",
        identifier="BLD",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.ADMIN.value)
    return project


@pytest.fixture
def guest_client(api_client, workspace):
    guest = User.objects.create_user(email="guest-build@example.com", username="guest_build")
    WorkspaceMember.objects.create(workspace=workspace, member=guest, role=ROLE.GUEST.value)
    client = APIClient()
    client.force_authenticate(user=guest)
    return client


@pytest.mark.contract
class TestBuildProject:
    def test_build_project_returns_editable_draft_not_persisted(self, session_client, workspace, project):
        with _configured_llm(), _mock_synthesis():
            response = session_client.post(
                _messages_url(workspace.slug),
                {"message": "Build a mobile app", "mode": "build_project", "project_id": str(project.id)},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["draft_token"]
        draft = response.data["project_draft"]
        assert draft is not None
        assert draft["name"] == "Mobile App"
        assert len(draft["work_items"]) == 2
        # Nothing persisted by synthesis.
        assert Issue.objects.filter(project=project).count() == 0
        assert Cycle.objects.filter(project=project).count() == 0

    def test_apply_persists_project_issues_cycle_in_one_transaction(self, session_client, workspace, project):
        response = session_client.post(
            _apply_url(workspace.slug, project.id),
            {"draft_token": "tok-apply-1", "project_draft": _raw_draft()},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["project_id"] == str(project.id)
        assert len(response.data["issue_ids"]) == 2
        assert response.data["cycle_id"]
        assert Issue.objects.filter(project=project).count() == 2
        assert Cycle.objects.filter(project=project).count() == 1
        assert CycleIssue.objects.filter(cycle_id=response.data["cycle_id"]).count() == 2

    def test_apply_missing_assignee_create_or_skip_with_warning(self, session_client, workspace, project):
        draft = _raw_draft()
        draft["work_items"][0]["assignee_suggestion"] = "ghost@nowhere.example.com"
        response = session_client.post(
            _apply_url(workspace.slug, project.id),
            {"draft_token": "tok-warn-1", "project_draft": draft},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        # Issue is still created despite the unresolved assignee.
        assert Issue.objects.filter(project=project, name="Set up CI").exists()
        assert response.data["warnings"], "expected a per-item warning for the unresolved assignee"

    def test_apply_mid_failure_rolls_back_fully(self, session_client, workspace, project):
        # The audit write runs last, inside the same transaction as the issue and
        # cycle inserts; forcing it to fail proves the whole apply rolls back.
        with patch(
            "plane.app.views.build_project_apply.write_audit_log",
            side_effect=RuntimeError("boom"),
        ):
            response = session_client.post(
                _apply_url(workspace.slug, project.id),
                {"draft_token": "tok-rollback-1", "project_draft": _raw_draft()},
                format="json",
            )
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        # Full rollback: no partial issue or cycle rows.
        assert Issue.objects.filter(project=project).count() == 0
        assert Cycle.objects.filter(project=project).count() == 0

    def test_concurrent_apply_same_draft_token_idempotent(self, session_client, workspace, project):
        body = {"draft_token": "tok-idem-1", "project_draft": _raw_draft()}
        first = session_client.post(_apply_url(workspace.slug, project.id), body, format="json")
        assert first.status_code == status.HTTP_201_CREATED, first.data

        second = session_client.post(_apply_url(workspace.slug, project.id), body, format="json")
        assert second.status_code == status.HTTP_200_OK, second.data
        assert second.data["project_id"] == str(project.id)
        # No duplicate issues created on the second apply.
        assert Issue.objects.filter(project=project).count() == 2

    def test_guest_build_project_rejected(self, guest_client, workspace, project):
        with _configured_llm(), _mock_synthesis():
            response = guest_client.post(
                _messages_url(workspace.slug),
                {"message": "Build a mobile app", "mode": "build_project", "project_id": str(project.id)},
                format="json",
            )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_apply_requires_member(self, guest_client, workspace, project):
        response = guest_client.post(
            _apply_url(workspace.slug, project.id),
            {"draft_token": "tok-guest-1", "project_draft": _raw_draft()},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Issue.objects.filter(project=project).count() == 0

    def test_no_provider_400_on_build(self, session_client, workspace, project):
        with patch(
            "plane.app.views.copilot.get_llm_config",
            return_value=(None, None, None),
        ), patch(
            "plane.app.views.copilot.is_llm_configured",
            return_value=False,
        ):
            response = session_client.post(
                _messages_url(workspace.slug),
                {"message": "Build a mobile app", "mode": "build_project", "project_id": str(project.id)},
                format="json",
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "LLM provider" in response.data["error"]

    def test_quota_503_no_partial_persist(self, session_client, workspace, project):
        with _configured_llm(), patch(
            "plane.app.views.copilot.synthesize_build_project_draft",
            side_effect=Exception("Error code: 429 - insufficient_quota"),
        ):
            response = session_client.post(
                _messages_url(workspace.slug),
                {"message": "Build a mobile app", "mode": "build_project", "project_id": str(project.id)},
                format="json",
            )
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert Issue.objects.filter(project=project).count() == 0

    def test_apply_writes_audit_entry(self, session_client, workspace, project):
        response = session_client.post(
            _apply_url(workspace.slug, project.id),
            {"draft_token": "tok-audit-1", "project_draft": _raw_draft()},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert AuditLog.objects.filter(
            workspace=workspace,
            action="build_project.apply",
            entity_id=project.id,
        ).exists()

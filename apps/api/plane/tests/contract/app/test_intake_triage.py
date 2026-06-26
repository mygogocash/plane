# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T17 contract tests: intake triage classifier + suggestion read/apply.

Acceptance criteria coverage (tasks.md AI-T17 / AI-S14, AI-S15):
  - "new intake issue produces a pending suggestion"
    -> test_new_intake_issue_produces_pending_suggestion
  - "no provider -> no suggestion, manual queue unchanged"
    -> test_no_provider_no_suggestion_manual_unchanged
  - "guest/non-member GET suggestions 403"
    -> test_guest_non_member_get_suggestions_403
  - "low confidence surfaced pending, never auto-applied"
    -> test_low_confidence_surfaced_pending_not_auto_applied
  - "member apply applies values, sets applied, audits"
    -> test_member_apply_applies_values_sets_applied_and_audits
  - "member-corrected values persist over AI values"
    -> test_member_corrected_values_persist_over_ai_values
  - "guest/viewer apply rejected, stays pending"
    -> test_guest_apply_rejected_stays_pending
  - "apply already-applied is idempotent no-op"
    -> test_apply_already_applied_is_idempotent_noop
"""

from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.permissions import ROLE
from plane.db.models import (
    AuditLog,
    Intake,
    IntakeIssue,
    Issue,
    Label,
    Project,
    ProjectMember,
    TriageSuggestion,
    User,
    WorkspaceMember,
)
from plane.utils.intake_triage import create_triage_suggestion_for_intake


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Triage Project", identifier="TRG", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.ADMIN.value)
    return project


@pytest.fixture
def intake(workspace, project, create_user):
    return Intake.objects.create(
        name="Default Intake", project=project, workspace=workspace, created_by=create_user, is_default=True
    )


@pytest.fixture
def intake_issue(workspace, project, intake, create_user):
    issue = Issue.objects.create(
        name="App crashes on login",
        description_html="<p>Steps to reproduce</p>",
        project=project,
        workspace=workspace,
        created_by=create_user,
    )
    return IntakeIssue.objects.create(
        intake=intake, issue=issue, project=project, workspace=workspace, created_by=create_user
    )


def _suggestions_url(slug, intake_id):
    return f"/api/workspaces/{slug}/intake/{intake_id}/triage-suggestions/"


def _apply_url(slug, suggestion_id):
    return f"/api/workspaces/{slug}/intake/triage-suggestions/{suggestion_id}/apply/"


def _configured():
    return patch(
        "plane.utils.intake_triage.get_llm_config",
        return_value=("test-key", "gpt-4o-mini", "openai"),
    )


def _classification(value):
    return patch(
        "plane.utils.intake_triage.generate_triage_classification",
        return_value=value,
    )


@pytest.mark.contract
class TestIntakeTriageClassifier:
    def test_new_intake_issue_produces_pending_suggestion(self, intake_issue):
        with _configured(), _classification(
            {"labels": [], "assignee": None, "priority": "high", "project": None, "confidence": 0.9}
        ):
            suggestion = create_triage_suggestion_for_intake(intake_issue)

        assert suggestion is not None
        assert suggestion.status == TriageSuggestion.Status.PENDING
        assert suggestion.suggested_priority == "high"
        assert suggestion.confidence == 0.9

    def test_no_provider_no_suggestion_manual_unchanged(self, intake_issue):
        with patch(
            "plane.utils.intake_triage.get_llm_config", return_value=(None, None, None)
        ), patch("plane.utils.intake_triage.is_llm_configured", return_value=False):
            suggestion = create_triage_suggestion_for_intake(intake_issue)

        assert suggestion is None
        assert not TriageSuggestion.objects.filter(intake_issue=intake_issue).exists()

    def test_low_confidence_surfaced_pending_not_auto_applied(self, intake_issue):
        with _configured(), _classification(
            {"labels": [], "assignee": None, "priority": "low", "project": None, "confidence": 0.2}
        ):
            suggestion = create_triage_suggestion_for_intake(intake_issue)

        assert suggestion.status == TriageSuggestion.Status.PENDING
        assert suggestion.confidence == 0.2
        # Low confidence never mutates the issue automatically.
        intake_issue.issue.refresh_from_db()
        assert intake_issue.issue.priority == "none"


@pytest.mark.contract
class TestIntakeTriageEndpoints:
    def test_guest_non_member_get_suggestions_403(self, api_client, workspace, project, intake_issue, create_user):
        TriageSuggestion.objects.create(
            intake_issue=intake_issue,
            workspace=workspace,
            project=project,
            suggested_priority="high",
            confidence=0.8,
        )

        guest = User.objects.create_user(email="guest-triage@example.com", username="guest_triage")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=ROLE.GUEST.value)
        ProjectMember.objects.create(project=project, member=guest, role=ROLE.GUEST.value)
        api_client.force_authenticate(user=guest)
        guest_response = api_client.get(_suggestions_url(workspace.slug, intake_issue.id))
        assert guest_response.status_code == status.HTTP_403_FORBIDDEN

        outsider = User.objects.create_user(email="outsider-triage@example.com", username="outsider_triage")
        outsider_client = APIClient()
        outsider_client.force_authenticate(user=outsider)
        outsider_response = outsider_client.get(_suggestions_url(workspace.slug, intake_issue.id))
        assert outsider_response.status_code == status.HTTP_403_FORBIDDEN

    def test_member_apply_applies_values_sets_applied_and_audits(
        self, session_client, workspace, project, intake_issue, create_user
    ):
        label = Label.objects.create(name="bug", project=project, workspace=workspace)
        suggestion = TriageSuggestion.objects.create(
            intake_issue=intake_issue,
            workspace=workspace,
            project=project,
            suggested_labels=[str(label.id)],
            suggested_priority="high",
            confidence=0.9,
        )
        audit_before = AuditLog.objects.count()

        response = session_client.post(_apply_url(workspace.slug, suggestion.id), format="json")
        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["outcome"] == "applied"

        suggestion.refresh_from_db()
        intake_issue.issue.refresh_from_db()
        assert suggestion.status == TriageSuggestion.Status.APPLIED
        assert intake_issue.issue.priority == "high"
        assert AuditLog.objects.count() > audit_before
        assert AuditLog.objects.filter(action="intake_triage.apply").exists()

    def test_member_corrected_values_persist_over_ai_values(
        self, session_client, workspace, project, intake_issue
    ):
        suggestion = TriageSuggestion.objects.create(
            intake_issue=intake_issue,
            workspace=workspace,
            project=project,
            suggested_priority="low",
            confidence=0.9,
        )

        response = session_client.post(
            _apply_url(workspace.slug, suggestion.id),
            {"priority": "urgent"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        intake_issue.issue.refresh_from_db()
        assert intake_issue.issue.priority == "urgent"

    def test_guest_apply_rejected_stays_pending(self, api_client, workspace, project, intake_issue):
        suggestion = TriageSuggestion.objects.create(
            intake_issue=intake_issue,
            workspace=workspace,
            project=project,
            suggested_priority="high",
            confidence=0.9,
        )
        guest = User.objects.create_user(email="guest-apply@example.com", username="guest_apply")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=ROLE.GUEST.value)
        ProjectMember.objects.create(project=project, member=guest, role=ROLE.GUEST.value)
        api_client.force_authenticate(user=guest)

        response = api_client.post(_apply_url(workspace.slug, suggestion.id), format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        suggestion.refresh_from_db()
        assert suggestion.status == TriageSuggestion.Status.PENDING

    def test_apply_already_applied_is_idempotent_noop(
        self, session_client, workspace, project, intake_issue
    ):
        suggestion = TriageSuggestion.objects.create(
            intake_issue=intake_issue,
            workspace=workspace,
            project=project,
            suggested_priority="high",
            confidence=0.9,
        )
        first = session_client.post(_apply_url(workspace.slug, suggestion.id), format="json")
        assert first.data["outcome"] == "applied"

        second = session_client.post(_apply_url(workspace.slug, suggestion.id), format="json")
        assert second.status_code == status.HTTP_200_OK
        assert second.data["outcome"] == "noop"

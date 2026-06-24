# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T13 contract tests: Automation rule CRUD (ADMIN, workspace-scoped).

Acceptance criteria coverage (tasks.md AI-T13 / AI-S12):
  - "admin creates workspace- or project-scoped rule (null project = workspace-wide)"
    -> test_admin_creates_workspace_scoped_rule
       test_admin_creates_project_scoped_rule
  - "non-admin CRUD rejected"
    -> test_non_admin_rule_crud_rejected
  - "rule with empty actions rejected" / "non-allowlisted action rejected"
    -> test_rule_with_empty_actions_rejected
       test_rule_with_non_allowlisted_action_rejected
  - "CRUD scoped to caller workspace"
    -> test_crud_scoped_to_caller_workspace
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.permissions import ROLE
from plane.db.models import (
    AutomationRule,
    Project,
    User,
    Workspace,
    WorkspaceMember,
)


def _rules_url(slug):
    return f"/api/workspaces/{slug}/automation/rules/"


def _rule_detail_url(slug, rule_id):
    return f"/api/workspaces/{slug}/automation/rules/{rule_id}/"


@pytest.fixture
def member_client(api_client, workspace):
    member = User.objects.create_user(email="rule-member@example.com", username="rule_member")
    WorkspaceMember.objects.create(workspace=workspace, member=member, role=ROLE.MEMBER.value)
    client = APIClient()
    client.force_authenticate(user=member)
    return client


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Rule Project",
        identifier="RUL",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.mark.contract
class TestAutomationRuleCrud:
    def test_admin_creates_workspace_scoped_rule(self, session_client, workspace):
        response = session_client.post(
            _rules_url(workspace.slug),
            {
                "name": "Auto prioritize",
                "trigger": "issue_created",
                "actions": [{"type": "set_priority", "priority": "high"}],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["project"] is None
        assert response.data["trigger"] == "issue_created"
        rule = AutomationRule.objects.get(id=response.data["id"])
        assert rule.workspace_id == workspace.id
        assert rule.project_id is None

    def test_admin_creates_project_scoped_rule(self, session_client, workspace, project):
        response = session_client.post(
            _rules_url(workspace.slug),
            {
                "name": "Project rule",
                "trigger": "issue_updated",
                "project": str(project.id),
                "actions": [{"type": "assign_user"}],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert str(response.data["project"]) == str(project.id)

    def test_non_admin_rule_crud_rejected(self, member_client, workspace):
        list_response = member_client.get(_rules_url(workspace.slug))
        assert list_response.status_code == status.HTTP_403_FORBIDDEN

        create_response = member_client.post(
            _rules_url(workspace.slug),
            {
                "name": "MemberRule",
                "trigger": "issue_created",
                "actions": [{"type": "set_priority"}],
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_403_FORBIDDEN
        assert not AutomationRule.objects.filter(name="MemberRule").exists()

    def test_rule_with_empty_actions_rejected(self, session_client, workspace):
        response = session_client.post(
            _rules_url(workspace.slug),
            {"name": "NoActions", "trigger": "issue_created", "actions": []},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "actions" in response.data

    def test_rule_with_non_allowlisted_action_rejected(self, session_client, workspace):
        response = session_client.post(
            _rules_url(workspace.slug),
            {
                "name": "BadAction",
                "trigger": "issue_created",
                "actions": [{"type": "delete_workspace"}],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "actions" in response.data

    def test_admin_full_crud_lifecycle(self, session_client, workspace):
        created = session_client.post(
            _rules_url(workspace.slug),
            {
                "name": "Lifecycle",
                "trigger": "issue_created",
                "actions": [{"type": "set_priority", "priority": "low"}],
            },
            format="json",
        )
        rule_id = created.data["id"]

        listed = session_client.get(_rules_url(workspace.slug))
        assert listed.status_code == status.HTTP_200_OK
        assert any(item["id"] == rule_id for item in listed.data)

        patched = session_client.patch(
            _rule_detail_url(workspace.slug, rule_id),
            {"is_active": False, "actions": [{"type": "assign_user"}]},
            format="json",
        )
        assert patched.status_code == status.HTTP_200_OK
        assert patched.data["is_active"] is False

        deleted = session_client.delete(_rule_detail_url(workspace.slug, rule_id))
        assert deleted.status_code == status.HTTP_204_NO_CONTENT
        assert not AutomationRule.objects.filter(id=rule_id).exists()

    def test_crud_scoped_to_caller_workspace(self, session_client, workspace, create_user):
        other_workspace = Workspace.objects.create(
            name="Other Workspace", owner=create_user, slug="other-rule-workspace"
        )
        WorkspaceMember.objects.create(
            workspace=other_workspace, member=create_user, role=ROLE.ADMIN.value
        )
        other_rule = AutomationRule.objects.create(
            workspace=other_workspace,
            name="Foreign rule",
            trigger=AutomationRule.Trigger.ISSUE_CREATED,
            actions=[{"type": "set_priority"}],
        )

        listed = session_client.get(_rules_url(workspace.slug))
        assert listed.status_code == status.HTTP_200_OK
        assert all(item["id"] != str(other_rule.id) for item in listed.data)

        detail = session_client.get(_rule_detail_url(workspace.slug, other_rule.id))
        assert detail.status_code == status.HTTP_404_NOT_FOUND

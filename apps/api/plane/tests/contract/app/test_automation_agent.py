# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T15 contract tests: Agent CRUD + read-only write-guardrail (ADMIN).

Acceptance criteria coverage (tasks.md AI-T15 / AI-S16):
  - AC "admin creates agent, unique name case-insensitive"
    -> test_admin_creates_agent_unique_name_case_insensitive
  - AC "read_only agent physically cannot invoke a write action (server-side)"
    -> test_read_only_agent_write_action_rejected_server_side
       test_read_only_agent_execute_action_makes_no_mutation
  - AC "non-admin CRUD rejected"
    -> test_non_admin_agent_crud_rejected
  - AC "duplicate name differing only by case rejected"
    -> test_duplicate_name_different_case_rejected
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.permissions import ROLE
from plane.db.models import (
    AuditLog,
    AutomationAgent,
    Issue,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.utils.automation_actions import (
    AgentGuardrailError,
    enforce_agent_scope,
    execute_agent_action,
)


def _agents_url(slug):
    return f"/api/workspaces/{slug}/automation/agents/"


def _agent_detail_url(slug, agent_id):
    return f"/api/workspaces/{slug}/automation/agents/{agent_id}/"


@pytest.fixture
def member_client(api_client, workspace):
    member = User.objects.create_user(email="agent-member@example.com", username="agent_member")
    WorkspaceMember.objects.create(workspace=workspace, member=member, role=ROLE.MEMBER.value)
    client = APIClient()
    client.force_authenticate(user=member)
    return client


@pytest.mark.contract
class TestAutomationAgentCrud:
    def test_admin_creates_agent_unique_name_case_insensitive(self, session_client, workspace):
        response = session_client.post(
            _agents_url(workspace.slug),
            {"name": "Triage", "scope": "read_only"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["name"] == "Triage"
        assert response.data["scope"] == "read_only"

        duplicate = session_client.post(
            _agents_url(workspace.slug),
            {"name": "triage", "scope": "write"},
            format="json",
        )
        assert duplicate.status_code == status.HTTP_400_BAD_REQUEST

    def test_duplicate_name_different_case_rejected(self, session_client, workspace):
        session_client.post(
            _agents_url(workspace.slug),
            {"name": "Releaser", "scope": "write", "allowed_actions": ["set_priority"]},
            format="json",
        )
        duplicate = session_client.post(
            _agents_url(workspace.slug),
            {"name": "RELEASER", "scope": "read_only"},
            format="json",
        )
        assert duplicate.status_code == status.HTTP_400_BAD_REQUEST
        assert AutomationAgent.objects.filter(workspace=workspace, name__iexact="releaser").count() == 1

    def test_non_admin_agent_crud_rejected(self, member_client, workspace):
        list_response = member_client.get(_agents_url(workspace.slug))
        assert list_response.status_code == status.HTTP_403_FORBIDDEN

        create_response = member_client.post(
            _agents_url(workspace.slug),
            {"name": "MemberAgent", "scope": "read_only"},
            format="json",
        )
        assert create_response.status_code == status.HTTP_403_FORBIDDEN
        assert not AutomationAgent.objects.filter(name__iexact="memberagent").exists()

    def test_admin_full_crud_lifecycle(self, session_client, workspace):
        created = session_client.post(
            _agents_url(workspace.slug),
            {"name": "Lifecycle", "scope": "read_only"},
            format="json",
        )
        agent_id = created.data["id"]

        listed = session_client.get(_agents_url(workspace.slug))
        assert listed.status_code == status.HTTP_200_OK
        assert any(item["id"] == agent_id for item in listed.data)

        patched = session_client.patch(
            _agent_detail_url(workspace.slug, agent_id),
            {"scope": "write", "allowed_actions": ["set_priority", "assign_user"]},
            format="json",
        )
        assert patched.status_code == status.HTTP_200_OK
        assert patched.data["scope"] == "write"
        assert patched.data["allowed_actions"] == ["set_priority", "assign_user"]

        deleted = session_client.delete(_agent_detail_url(workspace.slug, agent_id))
        assert deleted.status_code == status.HTTP_204_NO_CONTENT
        assert not AutomationAgent.objects.filter(id=agent_id).exists()

    def test_invalid_allowed_action_rejected(self, session_client, workspace):
        response = session_client.post(
            _agents_url(workspace.slug),
            {"name": "BadActions", "scope": "write", "allowed_actions": ["delete_workspace"]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestReadOnlyGuardrail:
    def test_read_only_agent_write_action_rejected_server_side(self, workspace):
        read_only = AutomationAgent.objects.create(
            workspace=workspace,
            name="ReadOnly",
            scope=AutomationAgent.Scope.READ_ONLY,
        )
        for write_action in ["create_issue", "update_issue", "set_priority", "assign_user"]:
            with pytest.raises(AgentGuardrailError):
                enforce_agent_scope(read_only, write_action)

        write_agent = AutomationAgent.objects.create(
            workspace=workspace,
            name="Writer",
            scope=AutomationAgent.Scope.WRITE,
        )
        # A write agent passes the scope guardrail (no exception raised).
        enforce_agent_scope(write_agent, "update_issue")

    def test_read_only_agent_execute_action_makes_no_mutation(self, workspace, create_user):
        project = Project.objects.create(
            name="Guard Project", identifier="GRD", workspace=workspace, created_by=create_user
        )
        ProjectMember.objects.create(project=project, member=create_user, role=ROLE.MEMBER.value)
        State.objects.create(name="Todo", project=project, group="unstarted", color="#fff")

        read_only = AutomationAgent.objects.create(
            workspace=workspace,
            name="ReadOnlyExec",
            scope=AutomationAgent.Scope.READ_ONLY,
        )

        issue_count_before = Issue.objects.count()
        audit_before = AuditLog.objects.count()

        with pytest.raises(AgentGuardrailError):
            execute_agent_action(
                slug=workspace.slug,
                user=create_user,
                agent=read_only,
                action={"type": "create_issue", "name": "Should not exist", "project_id": str(project.id)},
                context_project_id=str(project.id),
            )

        # Guardrail fires before any mutation or audit write.
        assert Issue.objects.count() == issue_count_before
        assert AuditLog.objects.count() == audit_before

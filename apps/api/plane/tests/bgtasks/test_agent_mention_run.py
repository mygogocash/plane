# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T16 tests: agent assignment + @mention run worker.

Acceptance criteria coverage (tasks.md AI-T16 / AI-S17):
  - AC "write agent mention executes action, threads inline response, audited"
    -> test_write_agent_mention_executes_action_threads_response_audited
  - AC "read_only agent mention cannot write (defense-in-depth)"
    -> test_read_only_agent_mention_cannot_write
  - AC "guest mention of write agent rejected"
    -> test_guest_mention_of_write_agent_rejected
  - AC "agent deactivated mid-run aborts gracefully, audit notes unavailable"
    -> test_agent_deactivated_mid_run_aborts_gracefully
  - AC "agent actions do not infinitely re-trigger rules (loop guard)"
    -> test_agent_actions_do_not_infinitely_retrigger_rules
  - AC "@mention parsing resolves case-insensitively to active agents"
    -> test_parse_agent_mentions_case_insensitive_active_only
"""

import pytest

from plane.app.permissions import ROLE
from plane.bgtasks.agent_mention_task import (
    MAX_AGENT_RUN_DEPTH,
    create_agent_mention,
    parse_agent_mentions,
    process_agent_mention,
)
from plane.db.models import (
    AgentMention,
    AuditLog,
    AutomationAgent,
    Issue,
    IssueComment,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Agent Project", identifier="AGT", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.MEMBER.value)
    State.objects.create(name="Todo", project=project, group="unstarted", color="#fff")
    return project


@pytest.fixture
def issue(workspace, project):
    return Issue.objects.create(name="Investigate latency", project=project, workspace=workspace)


@pytest.fixture
def write_agent(workspace):
    return AutomationAgent.objects.create(
        workspace=workspace, name="Releaser", scope=AutomationAgent.Scope.WRITE
    )


@pytest.fixture
def read_only_agent(workspace):
    return AutomationAgent.objects.create(
        workspace=workspace, name="Triage", scope=AutomationAgent.Scope.READ_ONLY
    )


@pytest.mark.django_db
class TestAgentMentionParsing:
    def test_parse_agent_mentions_case_insensitive_active_only(self, workspace, write_agent):
        AutomationAgent.objects.create(
            workspace=workspace, name="Dormant", scope=AutomationAgent.Scope.READ_ONLY, is_active=False
        )
        resolved = parse_agent_mentions("hey @releaser and @Dormant please look", workspace)
        assert [a.id for a in resolved] == [write_agent.id]


@pytest.mark.django_db
class TestAgentMentionRun:
    def test_write_agent_mention_executes_action_threads_response_audited(
        self, workspace, project, issue, write_agent, create_user
    ):
        mention = create_agent_mention(
            agent=write_agent, issue=issue, source_type="comment", workspace=workspace
        )
        audit_before = AuditLog.objects.count()

        process_agent_mention(
            mention,
            action={"type": "set_priority", "priority": "high"},
            actor=create_user,
        )

        mention.refresh_from_db()
        issue.refresh_from_db()
        assert mention.status == AgentMention.Status.COMPLETED
        assert mention.response
        assert issue.priority == "high"
        # Inline response threaded as an issue comment.
        assert IssueComment.objects.filter(issue=issue).count() == 1
        # Action audited (AGENT actor).
        assert AuditLog.objects.count() > audit_before
        assert AuditLog.objects.filter(actor_type=AuditLog.ActorType.AGENT).exists()

    def test_read_only_agent_mention_cannot_write(
        self, workspace, project, issue, read_only_agent, create_user
    ):
        mention = create_agent_mention(
            agent=read_only_agent, issue=issue, source_type="comment", workspace=workspace
        )

        process_agent_mention(
            mention,
            action={"type": "set_priority", "priority": "high"},
            actor=create_user,
        )

        mention.refresh_from_db()
        issue.refresh_from_db()
        assert mention.status == AgentMention.Status.FAILED
        assert issue.priority == "none"
        assert IssueComment.objects.filter(issue=issue).count() == 0

    def test_guest_mention_of_write_agent_rejected(
        self, workspace, project, issue, write_agent
    ):
        guest = User.objects.create_user(email="guest-mention@example.com", username="guest_mention")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=ROLE.GUEST.value)
        ProjectMember.objects.create(project=project, member=guest, role=ROLE.GUEST.value)

        mention = create_agent_mention(
            agent=write_agent, issue=issue, source_type="comment", workspace=workspace
        )

        process_agent_mention(
            mention,
            action={"type": "set_priority", "priority": "urgent"},
            actor=guest,
        )

        mention.refresh_from_db()
        issue.refresh_from_db()
        assert mention.status == AgentMention.Status.FAILED
        assert mention.response == "insufficient permissions"
        assert issue.priority == "none"

    def test_agent_deactivated_mid_run_aborts_gracefully(
        self, workspace, project, issue, write_agent, create_user
    ):
        mention = create_agent_mention(
            agent=write_agent, issue=issue, source_type="comment", workspace=workspace
        )
        # Agent deactivated after the mention was enqueued.
        write_agent.is_active = False
        write_agent.save(update_fields=["is_active"])
        mention.agent.refresh_from_db()

        process_agent_mention(
            mention,
            action={"type": "set_priority", "priority": "high"},
            actor=create_user,
        )

        mention.refresh_from_db()
        assert mention.status == AgentMention.Status.ABORTED
        assert mention.response == "agent unavailable"
        assert AuditLog.objects.filter(action="agent.aborted").exists()

    def test_agent_actions_do_not_infinitely_retrigger_rules(
        self, workspace, project, issue, write_agent, create_user
    ):
        mention = create_agent_mention(
            agent=write_agent, issue=issue, source_type="comment", workspace=workspace
        )

        # A successful run never spawns additional agent mentions (no recursion).
        process_agent_mention(
            mention,
            action={"type": "set_priority", "priority": "high"},
            actor=create_user,
        )
        assert AgentMention.objects.count() == 1

        # Depth ceiling aborts a runaway chain gracefully.
        deep = create_agent_mention(
            agent=write_agent, issue=issue, source_type="comment", workspace=workspace
        )
        process_agent_mention(
            deep,
            action={"type": "set_priority", "priority": "low"},
            actor=create_user,
            depth=MAX_AGENT_RUN_DEPTH + 1,
        )
        deep.refresh_from_db()
        assert deep.status == AgentMention.Status.ABORTED
        assert "loop guard" in deep.response

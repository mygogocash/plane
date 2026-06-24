# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T14 tests: automation rule evaluation worker + audit.

Acceptance criteria coverage (tasks.md AI-T14 / AI-S13):
  - "matching rule executes action and writes run + audit"
    -> test_matching_rule_executes_action_and_writes_run_and_audit
  - "no match records outcome, no action"
    -> test_no_match_records_outcome_no_action
  - "action failure sets partial/failed with error, no secret leak"
    -> test_action_failure_sets_failed_with_error_no_secret_leak
  - "loop cap + idempotency stop self-retrigger"
    -> test_loop_cap_and_idempotency_stops_self_retrigger
  - "workspace-wide rule triggers on project event, scoped correctly"
    -> test_workspace_wide_rule_triggers_on_project_event_scoped_correctly
"""

import uuid

import pytest

from plane.app.permissions import ROLE
from plane.bgtasks.automation_rule_task import (
    MAX_EVENT_DEPTH,
    evaluate_automation_rules,
)
from plane.db.models import (
    AuditLog,
    AutomationRule,
    AutomationRun,
    Issue,
    Project,
    ProjectMember,
    State,
)


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Engine Project", identifier="ENG", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.ADMIN.value)
    State.objects.create(name="Todo", project=project, group="unstarted", color="#fff")
    return project


@pytest.fixture
def issue(workspace, project, create_user):
    return Issue.objects.create(
        name="Engine issue", project=project, workspace=workspace, created_by=create_user
    )


def _make_rule(workspace, create_user, *, trigger, actions, project=None):
    return AutomationRule.objects.create(
        workspace=workspace,
        project=project,
        name="rule",
        trigger=trigger,
        actions=actions,
        created_by=create_user,
    )


@pytest.mark.django_db
class TestAutomationRuleEngine:
    def test_matching_rule_executes_action_and_writes_run_and_audit(
        self, workspace, project, issue, create_user
    ):
        _make_rule(
            workspace,
            create_user,
            trigger=AutomationRule.Trigger.ISSUE_UPDATED,
            actions=[{"type": "set_priority", "priority": "high"}],
            project=project,
        )
        audit_before = AuditLog.objects.count()

        result = evaluate_automation_rules(
            workspace_id=workspace.id,
            event_type="issue_updated",
            entity_type="issue",
            entity_id=issue.id,
            project_id=project.id,
            actor_user_id=create_user.id,
        )

        assert len(result["runs"]) == 1
        run = AutomationRun.objects.get(id=result["runs"][0])
        assert run.status == AutomationRun.Status.SUCCESS
        assert run.entity_id == issue.id
        issue.refresh_from_db()
        assert issue.priority == "high"
        assert AuditLog.objects.count() > audit_before

    def test_no_match_records_outcome_no_action(self, workspace, project, issue, create_user):
        _make_rule(
            workspace,
            create_user,
            trigger=AutomationRule.Trigger.ISSUE_CREATED,
            actions=[{"type": "set_priority", "priority": "high"}],
            project=project,
        )

        result = evaluate_automation_rules(
            workspace_id=workspace.id,
            event_type="issue_updated",
            entity_type="issue",
            entity_id=issue.id,
            project_id=project.id,
            actor_user_id=create_user.id,
        )

        assert result["runs"] == []
        assert AutomationRun.objects.count() == 0
        issue.refresh_from_db()
        assert issue.priority == "none"

    def test_action_failure_sets_failed_with_error_no_secret_leak(
        self, workspace, project, create_user
    ):
        _make_rule(
            workspace,
            create_user,
            trigger=AutomationRule.Trigger.ISSUE_UPDATED,
            actions=[{"type": "set_priority", "priority": "high"}],
            project=project,
        )

        missing_entity_id = uuid.uuid4()
        result = evaluate_automation_rules(
            workspace_id=workspace.id,
            event_type="issue_updated",
            entity_type="issue",
            entity_id=missing_entity_id,
            project_id=project.id,
            actor_user_id=create_user.id,
        )

        run = AutomationRun.objects.get(id=result["runs"][0])
        assert run.status == AutomationRun.Status.FAILED
        assert run.error is not None
        assert run.actions_applied == []
        # No secrets/keys leaked into the recorded error.
        assert "password" not in run.error.lower()
        assert "api_key" not in run.error.lower()

    def test_loop_cap_and_idempotency_stops_self_retrigger(
        self, workspace, project, issue, create_user
    ):
        _make_rule(
            workspace,
            create_user,
            trigger=AutomationRule.Trigger.ISSUE_UPDATED,
            actions=[{"type": "set_priority", "priority": "high"}],
            project=project,
        )

        first = evaluate_automation_rules(
            workspace_id=workspace.id,
            event_type="issue_updated",
            entity_type="issue",
            entity_id=issue.id,
            project_id=project.id,
            actor_user_id=create_user.id,
        )
        assert len(first["runs"]) == 1
        assert AutomationRun.objects.count() == 1

        # Idempotency: identical re-evaluation creates no new run.
        second = evaluate_automation_rules(
            workspace_id=workspace.id,
            event_type="issue_updated",
            entity_type="issue",
            entity_id=issue.id,
            project_id=project.id,
            actor_user_id=create_user.id,
        )
        assert second["runs"] == first["runs"]
        assert AutomationRun.objects.count() == 1

        # Loop cap: beyond max depth nothing runs.
        capped = evaluate_automation_rules(
            workspace_id=workspace.id,
            event_type="issue_updated",
            entity_type="issue",
            entity_id=issue.id,
            project_id=project.id,
            actor_user_id=create_user.id,
            depth=MAX_EVENT_DEPTH + 1,
        )
        assert capped["status"] == "depth_exceeded"
        assert AutomationRun.objects.count() == 1

    def test_workspace_wide_rule_triggers_on_project_event_scoped_correctly(
        self, workspace, project, issue, create_user
    ):
        workspace_rule = _make_rule(
            workspace,
            create_user,
            trigger=AutomationRule.Trigger.ISSUE_CREATED,
            actions=[{"type": "set_priority", "priority": "low"}],
            project=None,
        )
        other_project = Project.objects.create(
            name="Other Engine", identifier="OEN", workspace=workspace, created_by=create_user
        )
        ProjectMember.objects.create(project=other_project, member=create_user, role=ROLE.ADMIN.value)
        other_rule = _make_rule(
            workspace,
            create_user,
            trigger=AutomationRule.Trigger.ISSUE_CREATED,
            actions=[{"type": "set_priority", "priority": "urgent"}],
            project=other_project,
        )

        result = evaluate_automation_rules(
            workspace_id=workspace.id,
            event_type="issue_created",
            entity_type="issue",
            entity_id=issue.id,
            project_id=project.id,
            actor_user_id=create_user.id,
        )

        # Only the workspace-wide rule matches this project's event.
        assert AutomationRun.objects.filter(rule=workspace_rule).count() == 1
        assert AutomationRun.objects.filter(rule=other_rule).count() == 0
        assert len(result["runs"]) == 1
        issue.refresh_from_db()
        assert issue.priority == "low"

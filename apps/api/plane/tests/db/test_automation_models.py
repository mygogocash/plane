# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.db import connection

from plane.db.models import (
    AuditLog,
    AutomationRule,
    AutomationRun,
    Project,
    Workspace,
)


@pytest.fixture
def workspace(create_user):
    return Workspace.objects.create(
        name="Automation Workspace",
        owner=create_user,
        slug="automation-workspace",
    )


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="Automation Project",
        identifier="AUTO",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.mark.django_db
class TestAutomationModels:
    def test_automation_rule_fields_and_workspace_scope(self, workspace, project, create_user):
        workspace_wide = AutomationRule(
            workspace=workspace,
            project=None,
            name="Auto-assign urgent",
            is_active=True,
            trigger=AutomationRule.Trigger.ISSUE_CREATED,
            conditions={"priority": "urgent"},
            actions=[{"type": "assign_user", "assignee_id": str(create_user.id)}],
        )
        workspace_wide.save(created_by_id=create_user.id)

        assert workspace_wide.workspace_id == workspace.id
        assert workspace_wide.project_id is None
        assert workspace_wide.is_active is True
        assert workspace_wide.trigger == AutomationRule.Trigger.ISSUE_CREATED
        assert workspace_wide.conditions == {"priority": "urgent"}
        assert isinstance(workspace_wide.actions, list)
        assert workspace_wide.created_by_id == create_user.id

        project_scoped = AutomationRule.objects.create(
            workspace=workspace,
            project=project,
            name="Project rule",
            trigger=AutomationRule.Trigger.ISSUE_LABELED,
            actions=[{"type": "set_priority", "priority": "high"}],
        )
        assert project_scoped.project_id == project.id
        assert project_scoped.workspace_id == workspace.id

    def test_automation_run_links_rule_and_records_status(self, workspace, create_user):
        rule = AutomationRule.objects.create(
            workspace=workspace,
            name="Rule",
            trigger=AutomationRule.Trigger.ISSUE_UPDATED,
            actions=[{"type": "set_priority", "priority": "low"}],
        )
        run = AutomationRun.objects.create(
            workspace=workspace,
            rule=rule,
            triggered_by_event=AutomationRule.Trigger.ISSUE_UPDATED,
            status=AutomationRun.Status.SUCCESS,
            actions_applied=[{"type": "set_priority", "status": "applied"}],
            error=None,
            entity_type="issue",
            entity_id=workspace.id,
        )

        assert run.rule_id == rule.id
        assert run.status in {
            AutomationRun.Status.SUCCESS,
            AutomationRun.Status.PARTIAL,
            AutomationRun.Status.FAILED,
        }
        assert run.triggered_by_event == AutomationRule.Trigger.ISSUE_UPDATED
        assert run.actions_applied[0]["status"] == "applied"
        assert run.error is None
        assert run.entity_type == "issue"

    def test_dispatch_index_present(self):
        with connection.cursor() as cursor:
            indexes = connection.introspection.get_constraints(cursor, "automation_rules")
        dispatch_columns = [
            info["columns"]
            for info in indexes.values()
            if info.get("index") and info["columns"] == ["workspace_id", "is_active", "trigger"]
        ]
        assert dispatch_columns, "expected dispatch index on (workspace, is_active, trigger)"

    def test_audit_log_is_append_only_shape(self, workspace, create_user):
        entry = AuditLog.objects.create(
            workspace=workspace,
            user=create_user,
            action="build_project.apply",
            entity_type="project",
            entity_id=workspace.id,
            changes={"created": ["project", "issues"]},
        )

        field_names = {field.name for field in AuditLog._meta.get_fields()}
        assert {"workspace", "user", "action", "entity_type", "entity_id", "changes", "created_at"} <= field_names
        # No soft-delete field: audit entries are never edited or deleted in place.
        assert "deleted_at" not in field_names
        assert entry.created_at is not None

        # Append-only: mutating an existing entry must be rejected.
        entry.action = "tampered"
        with pytest.raises(ValueError):
            entry.save()

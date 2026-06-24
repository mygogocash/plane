# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from importlib import import_module

import pytest
from django.db import IntegrityError, connection, transaction

from plane.db.fields import SecretField
from plane.db.models import (
    AgentMention,
    AutomationAgent,
    Intake,
    IntakeIssue,
    Issue,
    Project,
    SentryProjectSync,
    SlackChannelBinding,
    SlackProjectSync,
    TriageSuggestion,
    Workspace,
    WorkspaceIntegration,
    Integration,
)
from plane.db.models.api import APIToken


@pytest.fixture
def workspace(create_user):
    return Workspace.objects.create(
        name="AI Foundation Workspace",
        owner=create_user,
        slug="ai-foundation-workspace",
    )


@pytest.fixture
def project(workspace, create_user):
    return Project.objects.create(
        name="AI Foundation Project",
        identifier="AIF",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def intake_issue(workspace, project, create_user):
    intake = Intake.objects.create(name="Default", project=project, workspace=workspace, is_default=True)
    issue = Issue.objects.create(name="Intake item", project=project, workspace=workspace, created_by=create_user)
    return IntakeIssue.objects.create(intake=intake, issue=issue, project=project, workspace=workspace)


@pytest.mark.django_db
class TestAIFoundationModels:
    def test_automation_agent_unique_name_case_insensitive(self, workspace):
        AutomationAgent.objects.create(workspace=workspace, name="Triage", scope=AutomationAgent.Scope.READ_ONLY)
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                AutomationAgent.objects.create(
                    workspace=workspace, name="triage", scope=AutomationAgent.Scope.READ_ONLY
                )

    def test_agent_scope_choices(self, workspace):
        agent = AutomationAgent.objects.create(
            workspace=workspace,
            name="Writer",
            scope=AutomationAgent.Scope.WRITE,
            allowed_actions=["set_priority", "assign_user"],
            is_active=True,
        )
        assert agent.scope in {AutomationAgent.Scope.READ_ONLY, AutomationAgent.Scope.WRITE}
        assert agent.allowed_actions == ["set_priority", "assign_user"]
        assert agent.is_active is True

        mention = AgentMention.objects.create(
            workspace=workspace,
            agent=agent,
            source_type="comment",
            source_id=workspace.id,
        )
        assert mention.status == AgentMention.Status.PENDING
        assert mention.response is None

    def test_triage_suggestion_1to1_with_intake_issue(self, workspace, project, intake_issue, create_user):
        TriageSuggestion.objects.create(
            workspace=workspace,
            project=project,
            intake_issue=intake_issue,
            suggested_labels=["bug"],
            suggested_assignee=create_user,
            suggested_priority="high",
            suggested_project=project,
            confidence=0.82,
            status=TriageSuggestion.Status.PENDING,
        )
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                TriageSuggestion.objects.create(
                    workspace=workspace,
                    project=project,
                    intake_issue=intake_issue,
                    confidence=0.4,
                )

    def test_sentry_sync_secret_is_secretfield(self, workspace, project):
        field = SentryProjectSync._meta.get_field("webhook_secret")
        assert isinstance(field, SecretField)

        sync = SentryProjectSync.objects.create(
            workspace=workspace,
            project=project,
            webhook_secret="super-secret-value",
            severity_map={"fatal": "urgent", "error": "high"},
        )

        with connection.cursor() as cursor:
            cursor.execute("SELECT webhook_secret FROM sentry_project_syncs WHERE id = %s", [str(sync.id)])
            raw_value = cursor.fetchone()[0]

        assert raw_value != "super-secret-value"
        assert "super-secret-value" not in raw_value

        sync.refresh_from_db()
        assert sync.webhook_secret == "super-secret-value"
        assert sync.severity_map["fatal"] == "urgent"

    def test_slack_channel_binding_fields(self, workspace, project, create_user):
        integration = Integration.objects.create(title="Slack", provider="slack", network=1)
        api_token = APIToken.objects.create(user=create_user, label="slack-token")
        ws_integration = WorkspaceIntegration.objects.create(
            workspace=workspace,
            integration=integration,
            config={},
            actor=create_user,
            api_token=api_token,
        )
        slack_sync = SlackProjectSync.objects.create(
            project=project,
            workspace=workspace,
            access_token="x",
            scopes="chat:write",
            bot_user_id="B1",
            webhook_url="https://hooks.slack.com/services/x",
            team_id="T1",
            team_name="Team",
            workspace_integration=ws_integration,
        )
        binding = SlackChannelBinding.objects.create(
            project=project,
            workspace=workspace,
            slack_project_sync=slack_sync,
            channel_id="C123",
            direction=SlackChannelBinding.Direction.OUTBOUND,
            schedule="0 9 * * 1",
            kind=SlackChannelBinding.Kind.SUMMARY,
        )
        assert binding.slack_project_sync_id == slack_sync.id
        assert binding.direction in {
            SlackChannelBinding.Direction.INBOUND,
            SlackChannelBinding.Direction.OUTBOUND,
        }
        assert binding.kind in {
            SlackChannelBinding.Kind.REQUEST,
            SlackChannelBinding.Kind.SUMMARY,
            SlackChannelBinding.Kind.ALERT,
        }
        assert binding.schedule == "0 9 * * 1"

    def test_new_migrations_leave_intake_and_slack_intact(self):
        # Tests run with --nomigrations, so the connection migration graph is
        # empty. Import the migration module directly and inspect its operations.
        migration_module = import_module("plane.db.migrations.0137_ai_automation_foundation")
        migration = migration_module.Migration("0137_ai_automation_foundation", "db")

        created_models = set()
        mutated_models = set()
        for operation in migration.operations:
            name = getattr(operation, "name", None)
            model_name = getattr(operation, "model_name", None)
            if operation.__class__.__name__ == "CreateModel" and name:
                created_models.add(name.lower())
            if operation.__class__.__name__ in {"AddField", "RemoveField", "AlterField", "DeleteModel"} and model_name:
                mutated_models.add(model_name.lower())

        # The new tables are created additively.
        assert {"triagesuggestion", "sentryprojectsync", "slackchannelbinding"} <= created_models
        # Existing intake/slack tables are never mutated by this migration.
        assert "intakeissue" not in mutated_models
        assert "slackprojectsync" not in mutated_models
        assert "intakeissue" not in created_models
        assert "slackprojectsync" not in created_models

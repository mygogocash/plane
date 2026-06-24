# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""AI-T19 tests: Slack outbound scheduled summaries + risk/overdue alerts.

Acceptance criteria coverage (tasks.md AI-T19 / AI-S19):
  - AC "scheduled summary binding posts to channel"
    -> test_scheduled_summary_binding_posts_to_channel
  - AC "alert binding posts on overdue/at-risk"
    -> test_alert_binding_posts_on_overdue
  - AC "integrations off or no provider skips and logs (fail-closed)"
    -> test_no_provider_skips_and_logs
  - AC "deleted channel failure handled, other bindings still run"
    -> test_deleted_channel_failure_handled_other_bindings_still_run
"""

import datetime

import pytest

from plane.app.permissions import ROLE
from plane.bgtasks import slack_outbound_task
from plane.db.models import (
    APIToken,
    Integration,
    Issue,
    Project,
    ProjectMember,
    SlackChannelBinding,
    SlackProjectSync,
    State,
    WorkspaceIntegration,
)


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Outbound Project", identifier="OUT", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=ROLE.ADMIN.value)
    State.objects.create(name="Todo", project=project, group="unstarted", color="#fff", default=True)
    return project


@pytest.fixture
def slack_sync(workspace, project, create_user):
    integration = Integration.objects.create(title="Slack", provider="slack")
    token = APIToken.objects.create(user=create_user, label="slack-bot")
    wi = WorkspaceIntegration.objects.create(
        workspace=workspace, actor=create_user, integration=integration, api_token=token
    )
    return SlackProjectSync.objects.create(
        project=project,
        workspace=workspace,
        workspace_integration=wi,
        access_token="xoxb-token",
        scopes="chat:write",
        bot_user_id="UBOT",
        webhook_url="https://hooks.slack.test/abc",
        team_id="T1",
        team_name="Team",
    )


def _outbound_binding(slack_sync, *, kind, channel_id):
    return SlackChannelBinding.objects.create(
        slack_project_sync=slack_sync,
        project=slack_sync.project,
        workspace=slack_sync.workspace,
        channel_id=channel_id,
        direction=SlackChannelBinding.Direction.OUTBOUND,
        kind=kind,
    )


@pytest.fixture
def captured_posts(monkeypatch):
    posts = []

    def fake_post(token, channel_id, text):
        if channel_id == "BAD":
            raise RuntimeError("channel_not_found")
        posts.append({"token": token, "channel_id": channel_id, "text": text})
        return True

    monkeypatch.setattr(slack_outbound_task, "post_slack_message", fake_post)
    return posts


@pytest.mark.django_db
class TestSlackScheduledSummaries:
    def test_scheduled_summary_binding_posts_to_channel(self, monkeypatch, slack_sync, captured_posts):
        monkeypatch.setattr(slack_outbound_task, "is_llm_configured", lambda *a, **k: True)
        monkeypatch.setattr(slack_outbound_task, "get_llm_config", lambda: ("k", "m", "openai"))
        monkeypatch.setattr(slack_outbound_task, "build_summary_text", lambda *a, **k: "Daily digest")
        _outbound_binding(slack_sync, kind=SlackChannelBinding.Kind.SUMMARY, channel_id="C-SUM")

        result = slack_outbound_task.run_scheduled_summaries()

        assert result["posted"] == 1
        assert captured_posts[0]["channel_id"] == "C-SUM"
        assert captured_posts[0]["text"] == "Daily digest"

    def test_no_provider_skips_and_logs(self, monkeypatch, slack_sync, captured_posts):
        monkeypatch.setattr(slack_outbound_task, "is_llm_configured", lambda *a, **k: False)
        monkeypatch.setattr(slack_outbound_task, "get_llm_config", lambda: (None, None, None))
        _outbound_binding(slack_sync, kind=SlackChannelBinding.Kind.SUMMARY, channel_id="C-SUM")

        result = slack_outbound_task.run_scheduled_summaries()

        assert result["status"] == "skipped_no_provider"
        assert captured_posts == []

    def test_deleted_channel_failure_handled_other_bindings_still_run(
        self, monkeypatch, slack_sync, captured_posts
    ):
        monkeypatch.setattr(slack_outbound_task, "is_llm_configured", lambda *a, **k: True)
        monkeypatch.setattr(slack_outbound_task, "get_llm_config", lambda: ("k", "m", "openai"))
        monkeypatch.setattr(slack_outbound_task, "build_summary_text", lambda *a, **k: "digest")
        _outbound_binding(slack_sync, kind=SlackChannelBinding.Kind.SUMMARY, channel_id="BAD")
        _outbound_binding(slack_sync, kind=SlackChannelBinding.Kind.SUMMARY, channel_id="C-OK")

        result = slack_outbound_task.run_scheduled_summaries()

        # One binding failed (deleted channel), the other still posted.
        assert result["posted"] == 1
        assert result["skipped"] == 1
        assert [p["channel_id"] for p in captured_posts] == ["C-OK"]


@pytest.mark.django_db
class TestSlackAlerts:
    def test_alert_binding_posts_on_overdue(self, monkeypatch, workspace, project, slack_sync, captured_posts):
        _outbound_binding(slack_sync, kind=SlackChannelBinding.Kind.ALERT, channel_id="C-ALERT")
        Issue.objects.create(
            name="Overdue task",
            project=project,
            workspace=workspace,
            target_date=datetime.date(2020, 1, 1),
        )

        result = slack_outbound_task.run_overdue_alerts()

        assert result["posted"] == 1
        assert captured_posts[0]["channel_id"] == "C-ALERT"
        assert "Overdue" in captured_posts[0]["text"]

    def test_no_alert_when_not_overdue(self, monkeypatch, workspace, project, slack_sync, captured_posts):
        _outbound_binding(slack_sync, kind=SlackChannelBinding.Kind.ALERT, channel_id="C-ALERT")
        Issue.objects.create(
            name="Future task",
            project=project,
            workspace=workspace,
            target_date=datetime.date(2999, 1, 1),
        )

        result = slack_outbound_task.run_overdue_alerts()

        assert result["posted"] == 0
        assert captured_posts == []

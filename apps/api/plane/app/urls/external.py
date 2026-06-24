# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import (
    UnsplashEndpoint,
    GPTIntegrationEndpoint,
    WorkspaceGPTIntegrationEndpoint,
    CopilotConversationsEndpoint,
    CopilotMessagesEndpoint,
    CopilotQueryEndpoint,
)
from plane.app.views.rephrase_grammar import RephraseGrammarEndpoint
from plane.app.views.ai_summary import (
    CycleSummarizeEndpoint,
    CycleSummarizeShareEndpoint,
    InitiativeSummarizeEndpoint,
    InitiativeSummarizeShareEndpoint,
    ProjectSummarizeEndpoint,
    ProjectSummarizeShareEndpoint,
    SharedSummaryReadEndpoint,
)
from plane.app.views.copilot_context import CopilotContextAssistEndpoint
from plane.app.views.build_project_apply import BuildProjectApplyEndpoint
from plane.app.views.automation_agent import (
    AutomationAgentDetailEndpoint,
    AutomationAgentListEndpoint,
)
from plane.app.views.automation_rule import (
    AutomationRuleDetailEndpoint,
    AutomationRuleListEndpoint,
)
from plane.app.views.intake_triage import (
    IntakeTriageSuggestionApplyEndpoint,
    IntakeTriageSuggestionListEndpoint,
)
from plane.app.views.integration.slack_connector import (
    SlackChannelBindingDetailEndpoint,
    SlackChannelBindingListEndpoint,
    SlackEventsWebhookEndpoint,
)
from plane.app.views.integration.sentry_connector import (
    SentryConfigEndpoint,
    SentryWebhookEndpoint,
)


urlpatterns = [
    path("unsplash/", UnsplashEndpoint.as_view(), name="unsplash"),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/ai-assistant/",
        GPTIntegrationEndpoint.as_view(),
        name="importer",
    ),
    path(
        "workspaces/<str:slug>/ai-assistant/",
        WorkspaceGPTIntegrationEndpoint.as_view(),
        name="importer",
    ),
    path(
        "workspaces/<str:slug>/copilot/messages/",
        CopilotMessagesEndpoint.as_view(),
        name="workspace-copilot-messages",
    ),
    path(
        "workspaces/<str:slug>/copilot/query/",
        CopilotQueryEndpoint.as_view(),
        name="workspace-copilot-query",
    ),
    path(
        "workspaces/<str:slug>/copilot/conversations/",
        CopilotConversationsEndpoint.as_view(),
        name="workspace-copilot-conversations",
    ),
    path(
        "workspaces/<str:slug>/copilot/context-assist/",
        CopilotContextAssistEndpoint.as_view(),
        name="workspace-copilot-context-assist",
    ),
    # AI-T9: Build Mode transactional apply
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/build-project/apply/",
        BuildProjectApplyEndpoint.as_view(),
        name="workspace-build-project-apply",
    ),
    path(
        "workspaces/<str:slug>/cycles/<uuid:cycle_id>/summarize/",
        CycleSummarizeEndpoint.as_view(),
        name="workspace-cycle-summarize",
    ),
    path(
        "workspaces/<str:slug>/cycles/<uuid:cycle_id>/summarize/share/",
        CycleSummarizeShareEndpoint.as_view(),
        name="workspace-cycle-summarize-share",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/summarize/",
        ProjectSummarizeEndpoint.as_view(),
        name="workspace-project-summarize",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/summarize/share/",
        ProjectSummarizeShareEndpoint.as_view(),
        name="workspace-project-summarize-share",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/summarize/",
        InitiativeSummarizeEndpoint.as_view(),
        name="workspace-initiative-summarize",
    ),
    path(
        "workspaces/<str:slug>/initiatives/<uuid:initiative_id>/summarize/share/",
        InitiativeSummarizeShareEndpoint.as_view(),
        name="workspace-initiative-summarize-share",
    ),
    path(
        "workspaces/<str:slug>/summaries/shared/<str:share_token>/",
        SharedSummaryReadEndpoint.as_view(),
        name="workspace-shared-summary-read",
    ),
    path(
        "workspaces/<str:slug>/rephrase-grammar/",
        RephraseGrammarEndpoint.as_view(),
        name="workspace-rephrase-grammar",
    ),
    # AI-T13: Automation rule CRUD (ADMIN)
    path(
        "workspaces/<str:slug>/automation/rules/",
        AutomationRuleListEndpoint.as_view(),
        name="workspace-automation-rules",
    ),
    path(
        "workspaces/<str:slug>/automation/rules/<uuid:rule_id>/",
        AutomationRuleDetailEndpoint.as_view(),
        name="workspace-automation-rule-detail",
    ),
    # AI-T15: Agent CRUD (ADMIN)
    path(
        "workspaces/<str:slug>/automation/agents/",
        AutomationAgentListEndpoint.as_view(),
        name="workspace-automation-agents",
    ),
    path(
        "workspaces/<str:slug>/automation/agents/<uuid:agent_id>/",
        AutomationAgentDetailEndpoint.as_view(),
        name="workspace-automation-agent-detail",
    ),
    # AI-T17: Intake triage suggestion read/apply
    path(
        "workspaces/<str:slug>/intake/<uuid:intake_id>/triage-suggestions/",
        IntakeTriageSuggestionListEndpoint.as_view(),
        name="workspace-intake-triage-suggestions",
    ),
    path(
        "workspaces/<str:slug>/intake/triage-suggestions/<uuid:suggestion_id>/apply/",
        IntakeTriageSuggestionApplyEndpoint.as_view(),
        name="workspace-intake-triage-suggestion-apply",
    ),
    # AI-T18: Slack connector — channel binding CRUD + signed inbound webhook
    path(
        "workspaces/<str:slug>/integrations/slack/channels/",
        SlackChannelBindingListEndpoint.as_view(),
        name="workspace-slack-channels",
    ),
    path(
        "workspaces/<str:slug>/integrations/slack/channels/<uuid:binding_id>/",
        SlackChannelBindingDetailEndpoint.as_view(),
        name="workspace-slack-channel-detail",
    ),
    path(
        "workspaces/<str:slug>/integrations/slack/events/",
        SlackEventsWebhookEndpoint.as_view(),
        name="workspace-slack-events",
    ),
    # AI-T20: Sentry connector — config CRUD + HMAC webhook
    path(
        "workspaces/<str:slug>/integrations/sentry/",
        SentryConfigEndpoint.as_view(),
        name="workspace-sentry-config",
    ),
    path(
        "workspaces/<str:slug>/integrations/sentry/webhook/",
        SentryWebhookEndpoint.as_view(),
        name="workspace-sentry-webhook",
    ),
]

// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { EAutomationAgentScope } from "@plane/constants";

export type TAutomationAgent = {
  id: string;
  name: string;
  scope: EAutomationAgentScope;
  allowed_actions: string[];
  is_active: boolean;
};

export type TAgentMentionStatus = "pending" | "completed" | "failed";

export type TAgentMention = {
  id: string;
  agent: string;
  agent_name?: string;
  source_type: "comment" | "issue";
  source_id: string;
  status: TAgentMentionStatus;
  response?: string | null;
};

export type TAgentMentionPayload = {
  agent_id: string;
  source_type: TAgentMention["source_type"];
  source_id: string;
};

export type TAgentService = {
  listAgents: (workspaceSlug: string) => Promise<TAutomationAgent[]>;
  createMention: (workspaceSlug: string, payload: TAgentMentionPayload) => Promise<TAgentMention>;
};

/** Agents surface is gated by `workflows_approvals` + provider. */
export const isAgentsSectionVisible = ({
  featureEnabled,
  isProviderConfigured,
}: {
  featureEnabled: boolean;
  isProviderConfigured?: boolean;
}) => featureEnabled && isProviderConfigured !== false;

export const isReadOnlyAgent = (agent: TAutomationAgent) => agent.scope === EAutomationAgentScope.READ_ONLY;

export const getAgentScopeBadgeLabel = (scope: EAutomationAgentScope): string =>
  scope === EAutomationAgentScope.READ_ONLY ? "read-only" : "write";

/**
 * Parses a leading-or-inline `@AgentName` mention from comment text against the
 * known agent list (case-insensitive). Returns the matched agent or `null`.
 * Longest-name-first so "@Triage Bot" wins over "@Triage".
 */
export const parseAgentMention = (text: string, agents: TAutomationAgent[]): TAutomationAgent | null => {
  if (!text) return null;
  const lowered = text.toLowerCase();
  const sorted = [...agents].toSorted((a, b) => b.name.length - a.name.length);
  for (const agent of sorted) {
    if (!agent.is_active) continue;
    if (lowered.includes(`@${agent.name.toLowerCase()}`)) return agent;
  }
  return null;
};

export const buildAgentMentionPayload = (
  agent: TAutomationAgent,
  source: { source_type: TAgentMention["source_type"]; source_id: string }
): TAgentMentionPayload => ({
  agent_id: agent.id,
  source_type: source.source_type,
  source_id: source.source_id,
});

/**
 * Returns the inline hint shown beside the composer for the currently-typed
 * `@mention`. `null` when no active agent is matched so the UI stays quiet
 * instead of guessing.
 */
export const getAgentMentionHint = (agent: TAutomationAgent | null): string | null =>
  agent ? `Run @${agent.name} (${getAgentScopeBadgeLabel(agent.scope)})` : null;

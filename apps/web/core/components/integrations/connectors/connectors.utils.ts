// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

export type TSlackBindingDirection = "inbound" | "outbound";
export type TSlackBindingKind = "request" | "summary" | "alert";

export type TSlackChannelBinding = {
  id: string;
  channel_id: string;
  direction: TSlackBindingDirection;
  kind: TSlackBindingKind;
  /** Standard cron expression for outbound scheduled summaries (Q17). */
  schedule?: string | null;
};

export type TSlackChannelBindingPayload = {
  channel_id: string;
  direction: TSlackBindingDirection;
  kind: TSlackBindingKind;
  schedule?: string | null;
};

export type TSentryConfig = {
  id: string;
  /** Server never echoes the secret; it returns only whether one is set. */
  has_secret: boolean;
  severity_map: Record<string, string>;
  default_assignee?: string | null;
  webhook_url?: string | null;
};

export type TSentryConfigPayload = {
  /** Write-only. Sent on save, never returned. Omit to leave the existing secret. */
  webhook_secret?: string;
  severity_map?: Record<string, string>;
  default_assignee?: string | null;
};

export type TConnectorService = {
  getSlackChannels: (workspaceSlug: string) => Promise<TSlackChannelBinding[]>;
  bindSlackChannel: (workspaceSlug: string, payload: TSlackChannelBindingPayload) => Promise<TSlackChannelBinding>;
  getSentryConfig: (workspaceSlug: string) => Promise<TSentryConfig | null>;
  upsertSentryConfig: (workspaceSlug: string, payload: TSentryConfigPayload) => Promise<TSentryConfig>;
};

export const SECRET_MASK = "••••";

/** Masks a secret for display. Components never receive the plaintext value. */
export const maskSecret = (hasSecret: boolean) => (hasSecret ? SECRET_MASK : "");

export type TConnectorCatalogEntry = {
  key: "slack" | "github" | "gitlab" | "sentry" | "mcp";
  name: string;
  description: string;
};

export const CONNECTOR_CATALOG: TConnectorCatalogEntry[] = [
  { key: "slack", name: "Slack", description: "Inbound requests to intake, outbound summaries and alerts." },
  { key: "github", name: "GitHub", description: "Sync issues and pull requests." },
  { key: "gitlab", name: "GitLab", description: "Sync issues and merge requests." },
  { key: "sentry", name: "Sentry", description: "Turn alerts into triaged, linked issues." },
  { key: "mcp", name: "Build your own", description: "Connect agents via the standalone MCP server." },
];

/** Connectors tab is gated by `integrations` + ADMIN. Hidden (never paywalled) when off. */
export const canViewConnectors = ({
  integrationsEnabled,
  isAdmin,
}: {
  integrationsEnabled: boolean;
  isAdmin: boolean;
}) => integrationsEnabled && isAdmin;

export const isConnectorsTabVisible = (integrationsEnabled: boolean) => integrationsEnabled;

export const buildSlackBindingPayload = (input: {
  channelId: string;
  direction: TSlackBindingDirection;
  kind: TSlackBindingKind;
  schedule?: string | null;
}): TSlackChannelBindingPayload => ({
  channel_id: input.channelId,
  direction: input.direction,
  kind: input.kind,
  schedule: input.direction === "outbound" ? (input.schedule ?? null) : null,
});

export const formatSlackSchedule = (binding: TSlackChannelBinding) =>
  binding.direction === "outbound" && binding.schedule ? `cron: ${binding.schedule}` : "—";

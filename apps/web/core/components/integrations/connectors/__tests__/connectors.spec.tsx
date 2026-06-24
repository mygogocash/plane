// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConnectorsList } from "../ConnectorsList";
import { SentryConnectorPanel } from "../SentryConnectorPanel";
import {
  SECRET_MASK,
  buildSlackBindingPayload,
  canViewConnectors,
  formatSlackSchedule,
  maskSecret,
  type TSlackChannelBinding,
} from "../connectors.utils";

const slackBindings: TSlackChannelBinding[] = [
  { id: "b1", channel_id: "C123", direction: "outbound", kind: "summary", schedule: "0 9 * * 1" },
  { id: "b2", channel_id: "C999", direction: "inbound", kind: "request", schedule: null },
];

describe("ConnectorsList", () => {
  it("lists Slack, GitHub, GitLab, Sentry and Build your own", () => {
    const markup = renderToStaticMarkup(<ConnectorsList integrationsEnabled slackBindings={slackBindings} />);

    expect(markup).toContain("connector-catalog-slack");
    expect(markup).toContain("connector-catalog-github");
    expect(markup).toContain("connector-catalog-gitlab");
    expect(markup).toContain("connector-catalog-sentry");
    expect(markup).toContain("connector-catalog-mcp");
    expect(markup).toContain("Build your own");
  });

  it("integrations off → tab hidden (no paywall)", () => {
    const markup = renderToStaticMarkup(<ConnectorsList integrationsEnabled={false} />);
    expect(markup).toBe("");
    expect(markup).not.toContain("Upgrade");
  });

  it("Slack outbound binding reflects the cron schedule in the list", () => {
    const markup = renderToStaticMarkup(<ConnectorsList integrationsEnabled slackBindings={slackBindings} />);
    expect(markup).toContain("slack-binding-b1");
    expect(markup).toContain("cron: 0 9 * * 1");
    // Inbound bindings show no schedule.
    expect(formatSlackSchedule(slackBindings[1])).toBe("—");
  });
});

describe("Sentry secret is write-only", () => {
  it("renders the mask placeholder and never the plaintext value", () => {
    const markup = renderToStaticMarkup(
      <SentryConnectorPanel config={{ id: "s1", has_secret: true, severity_map: {}, webhook_url: "/x/webhook/" }} />
    );

    // The input starts empty (value="") — the stored secret is only a placeholder.
    expect(markup).toContain(SECRET_MASK);
    expect(markup).toContain('type="password"');
    expect(markup).toContain("A secret is set.");
    // Plaintext secret should never appear in markup.
    expect(markup).not.toContain("super-secret");
  });

  it("masks only when a secret is set", () => {
    expect(maskSecret(true)).toBe(SECRET_MASK);
    expect(maskSecret(false)).toBe("");
  });
});

describe("connectors gating + payloads", () => {
  it("non-admin cannot view connectors", () => {
    expect(canViewConnectors({ integrationsEnabled: true, isAdmin: false })).toBe(false);
    expect(canViewConnectors({ integrationsEnabled: true, isAdmin: true })).toBe(true);
  });

  it("builds an outbound Slack binding payload storing the cron schedule", () => {
    expect(
      buildSlackBindingPayload({ channelId: "C1", direction: "outbound", kind: "summary", schedule: "0 9 * * 1" })
    ).toEqual({ channel_id: "C1", direction: "outbound", kind: "summary", schedule: "0 9 * * 1" });
  });

  it("drops schedule for inbound bindings", () => {
    expect(
      buildSlackBindingPayload({ channelId: "C1", direction: "inbound", kind: "request", schedule: "0 9 * * 1" })
    ).toEqual({ channel_id: "C1", direction: "inbound", kind: "request", schedule: null });
  });
});

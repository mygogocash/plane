// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/plane-web/lib/self-host-entitlements", () => ({
  isSelfHostedFeatureEnabled: () => true,
}));

import { AIChatRoot } from "../AIChatRoot";

const draft = {
  name: "Mobile launch",
  description: "Ship it",
  work_items: [{ name: "Auth flow" }],
  suggested_cycle: { name: "Sprint 1" },
};

describe("AIChatRoot", () => {
  it("empty Recents shows 'No threads available' and the composer placeholder", () => {
    const markup = renderToStaticMarkup(<AIChatRoot workspaceSlug="acme" conversations={[]} isProviderConfigured />);

    expect(markup).toContain("No threads available");
    expect(markup).toContain("What can I do for you?");
    expect(markup).toContain("New chat");
  });

  it("Build mode renders the BuildDraftEditor inline", () => {
    const markup = renderToStaticMarkup(
      <AIChatRoot
        workspaceSlug="acme"
        projectId="project-1"
        initialMode="build"
        buildDraft={draft}
        buildDraftToken="token-1"
        isProviderConfigured
      />
    );

    expect(markup).toContain("Mobile launch");
    expect(markup).toContain("Apply draft");
  });

  it("renders no-magic controls only as disabled coming-soon affordances", () => {
    const markup = renderToStaticMarkup(<AIChatRoot workspaceSlug="acme" conversations={[]} isProviderConfigured />);

    expect(markup).toContain("Voice input (coming soon)");
    expect(markup).toContain("Add files or photos (coming soon)");
    expect(markup).toContain("Web search (coming soon)");
    expect(markup).toMatch(/disabled[^>]*data-testid="composer-control-mic"/);
  });

  it("provider missing → connect hint, no paywall", () => {
    const markup = renderToStaticMarkup(
      <AIChatRoot workspaceSlug="acme" conversations={[]} isProviderConfigured={false} />
    );

    expect(markup).toContain("Connect an AI provider in instance settings");
    expect(markup).not.toContain("Upgrade");
  });

  it("hides entirely when the flag is off", () => {
    const markup = renderToStaticMarkup(
      <AIChatRoot workspaceSlug="acme" conversations={[]} featureEnabled={false} isProviderConfigured />
    );

    expect(markup).toBe("");
  });
});

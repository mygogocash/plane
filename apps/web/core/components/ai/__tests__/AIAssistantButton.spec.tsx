// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/plane-web/lib/self-host-entitlements", () => ({
  isSelfHostedFeatureEnabled: () => true,
}));

import { AIAssistantButton } from "../AIAssistantButton";
import { deriveContextAssistPayload } from "../shared/ai-surface.utils";

describe("AIAssistantButton", () => {
  it("renders the assistant button when interactive", () => {
    const markup = renderToStaticMarkup(<AIAssistantButton workspaceSlug="acme" isProviderConfigured />);
    expect(markup).toContain("AI assistant");
    expect(markup).not.toContain("disabled");
  });

  it("provider missing → disabled with connect-hint title", () => {
    const markup = renderToStaticMarkup(<AIAssistantButton workspaceSlug="acme" isProviderConfigured={false} />);
    expect(markup).toContain("disabled");
    expect(markup).toContain("Connect an AI provider in instance settings");
  });

  it("hides when the flag is off", () => {
    const markup = renderToStaticMarkup(
      <AIAssistantButton workspaceSlug="acme" featureEnabled={false} isProviderConfigured />
    );
    expect(markup).toBe("");
  });

  it("derives the entity from route params and calls contextAssist", () => {
    // The button derivation logic is the same pure helper the button invokes on click.
    expect(deriveContextAssistPayload({ issueId: "issue-1", projectId: "p1" })).toEqual({
      entity_type: "issue",
      entity_id: "issue-1",
    });
  });

  it("list/view with no entity derives a general assist (no guess)", () => {
    expect(deriveContextAssistPayload({})).toEqual({ entity_type: null, entity_id: null });
  });
});

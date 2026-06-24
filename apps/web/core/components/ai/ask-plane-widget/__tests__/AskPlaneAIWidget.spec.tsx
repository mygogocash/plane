// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/plane-web/lib/self-host-entitlements", () => ({
  isSelfHostedFeatureEnabled: () => true,
}));

import { AskPlaneAIWidget } from "../AskPlaneAIWidget";
import { mapUiModeToCopilotMode } from "../../shared/ai-surface.utils";

describe("AskPlaneAIWidget", () => {
  it("defaults the Ask/Build dropdown to Ask", () => {
    const markup = renderToStaticMarkup(<AskPlaneAIWidget isProviderConfigured workspaceLabel="Acme" />);

    expect(markup).toContain("Ask Plane AI");
    // The Ask option is the active toggle by default.
    expect(markup).toMatch(/data-active="true"[^>]*data-testid="copilot-mode-option-ask"/);
    expect(markup).toContain("Acme");
  });

  it("provider missing → disabled widget with connect hint (no paywall)", () => {
    const markup = renderToStaticMarkup(<AskPlaneAIWidget isProviderConfigured={false} />);

    expect(markup).toContain("Connect an AI provider in instance settings");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("Upgrade");
  });

  it("hides entirely when the feature flag is off", () => {
    const markup = renderToStaticMarkup(<AskPlaneAIWidget featureEnabled={false} isProviderConfigured />);

    expect(markup).toBe("");
  });

  it("Activate Build maps the ui mode to build_project", () => {
    expect(mapUiModeToCopilotMode("build")).toBe("build_project");
  });
});

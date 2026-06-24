// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, expect, it } from "vitest";

import {
  AI_COMPOSER_UNAVAILABLE_CONTROLS,
  deriveContextAssistPayload,
  getAiChatNavItem,
  getProviderDisabledHint,
  isAiSurfaceInteractive,
  isAiSurfaceVisible,
  isGeneralAssist,
  mapCopilotModeToUiMode,
  mapUiModeToCopilotMode,
} from "../ai-surface.utils";

describe("ai-surface mode mapping", () => {
  it("maps Ask to auto and Build to build_project", () => {
    expect(mapUiModeToCopilotMode("ask")).toBe("auto");
    expect(mapUiModeToCopilotMode("build")).toBe("build_project");
  });

  it("maps copilot mode back to the ui toggle", () => {
    expect(mapCopilotModeToUiMode("build_project")).toBe("build");
    expect(mapCopilotModeToUiMode("auto")).toBe("ask");
    expect(mapCopilotModeToUiMode("answer")).toBe("ask");
  });
});

describe("ai-surface gating", () => {
  it("hides the surface when the flag is off (no paywall)", () => {
    expect(isAiSurfaceVisible(false)).toBe(false);
    expect(isAiSurfaceVisible(true)).toBe(true);
  });

  it("is interactive only when flag on and provider configured", () => {
    expect(isAiSurfaceInteractive({ featureEnabled: true, isProviderConfigured: true })).toBe(true);
    expect(isAiSurfaceInteractive({ featureEnabled: true, isProviderConfigured: false })).toBe(false);
    expect(isAiSurfaceInteractive({ featureEnabled: false, isProviderConfigured: true })).toBe(false);
  });

  it("surfaces a connect hint only when provider missing", () => {
    expect(getProviderDisabledHint(false)).toBe("Connect an AI provider in instance settings");
    expect(getProviderDisabledHint(true)).toBeUndefined();
  });

  it("hides the ai_chat nav item when ai_copilot is off", () => {
    expect(getAiChatNavItem(false)).toBeNull();
    const navItem = getAiChatNavItem(true);
    expect(navItem?.href).toBe("/ai-chat/");
  });
});

describe("context-assist entity derivation (Q15)", () => {
  it("derives the most specific entity from route params", () => {
    expect(deriveContextAssistPayload({ issueId: "i1", cycleId: "c1", projectId: "p1" })).toEqual({
      entity_type: "issue",
      entity_id: "i1",
    });
    expect(deriveContextAssistPayload({ cycleId: "c1", projectId: "p1" })).toEqual({
      entity_type: "cycle",
      entity_id: "c1",
    });
    expect(deriveContextAssistPayload({ projectId: "p1" })).toEqual({
      entity_type: "project",
      entity_id: "p1",
    });
  });

  it("returns a general assist (no guess) when no entity is in scope", () => {
    const payload = deriveContextAssistPayload({});
    expect(payload).toEqual({ entity_type: null, entity_id: null });
    expect(isGeneralAssist(payload)).toBe(true);
  });
});

describe("no-magic composer controls", () => {
  it("declares mic, attachments, and web-search as disabled coming-soon", () => {
    const keys = AI_COMPOSER_UNAVAILABLE_CONTROLS.map((control) => control.key);
    expect(keys).toEqual(["mic", "attachments", "web_search"]);
    expect(AI_COMPOSER_UNAVAILABLE_CONTROLS.every((control) => control.disabled && control.comingSoon)).toBe(true);
  });
});

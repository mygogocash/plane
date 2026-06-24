// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, expect, it, vi } from "vitest";

import type { CoreRootStore } from "@/store/root.store";
import { AICopilotStore } from "../copilot.store";

const draft = {
  name: "Mobile launch",
  description: "Ship the mobile app",
  work_items: [{ name: "Auth flow", description: "OAuth login" }],
  suggested_cycle: { name: "Sprint 1" },
};

const createStore = (serviceOverrides: Record<string, unknown> = {}) => {
  const aiService = {
    applyBuildDraft: vi.fn(),
    listCopilotConversations: vi.fn().mockResolvedValue([]),
    ...serviceOverrides,
  };

  const store = new AICopilotStore({} as CoreRootStore, aiService as never);
  return { store, aiService };
};

describe("AICopilotStore", () => {
  it("setMode updates activeMode observable", () => {
    const { store } = createStore();

    store.setMode("build_project");

    expect(store.activeMode).toBe("build_project");
  });

  it("openPanel sets isPanelOpen and entity context", () => {
    const { store } = createStore();

    store.openPanel({ entityType: "issue", entityId: "issue-1" });

    expect(store.isPanelOpen).toBe(true);
    expect(store.panelEntityType).toBe("issue");
    expect(store.panelEntityId).toBe("issue-1");
  });

  it("applyBuildDraft success path clears buildDraft via runInAction", async () => {
    const { store, aiService } = createStore({
      applyBuildDraft: vi.fn().mockResolvedValue({ project_id: "project-1", issue_ids: ["issue-1"] }),
    });

    store.setBuildDraft(draft, "draft-token");
    const result = await store.applyBuildDraft("acme", "project-1");

    expect(result).toBe(true);
    expect(aiService.applyBuildDraft).toHaveBeenCalledWith("acme", "project-1", {
      draft_token: "draft-token",
      project_draft: draft,
    });
    expect(store.buildDraft).toBeNull();
    expect(store.buildDraftToken).toBeNull();
  });

  it("applyBuildDraft failure keeps draft", async () => {
    const { store } = createStore({
      applyBuildDraft: vi.fn().mockRejectedValue(new Error("apply failed")),
    });

    store.setBuildDraft(draft, "draft-token");
    const result = await store.applyBuildDraft("acme", "project-1");

    expect(result).toBe(false);
    expect(store.buildDraft).toEqual(draft);
    expect(store.buildDraftToken).toBe("draft-token");
  });
});

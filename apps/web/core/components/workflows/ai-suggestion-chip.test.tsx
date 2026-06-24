/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";
// local imports
import { acceptSuggestedTransition, getAiSuggestionChipModel } from "./ai-suggestion-chip.utils";

describe("AI suggestion chip helpers", () => {
  it("builds a visible chip model when a target state is rankable", () => {
    expect(
      getAiSuggestionChipModel({
        suggestion: { to_state: "state-done", confidence: 0.82, source: "rules" },
        getStateName: (stateId) => ({ "state-done": "Done" })[stateId] ?? stateId,
      })
    ).toEqual({
      label: "Suggest Done",
      source: "rules",
      targetStateId: "state-done",
    });
  });

  it("hides the chip when there is no rankable target", () => {
    expect(
      getAiSuggestionChipModel({
        suggestion: { to_state: null, confidence: 0, source: "rules" },
        getStateName: (stateId) => stateId,
      })
    ).toBeNull();
  });

  it("accepts the suggestion through the transition store action", async () => {
    const transitionWorkItem = vi.fn().mockResolvedValue({
      kind: "transitioned",
      issue: { id: "issue-1", state_id: "state-done" },
    });

    await acceptSuggestedTransition({
      transitionWorkItem,
      workspaceSlug: "acme",
      projectId: "project-1",
      issueId: "issue-1",
      fromStateId: "state-started",
      toStateId: "state-done",
    });

    expect(transitionWorkItem).toHaveBeenCalledWith("acme", "project-1", "issue-1", "state-started", "state-done");
  });
});

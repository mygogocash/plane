/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// A single mock service instance whose methods we configure per test. Hoisted so the
// vi.mock factory below can reference it (vi.mock is hoisted above imports).
const { mockService } = vi.hoisted(() => ({
  mockService: {
    listTransitions: vi.fn(),
    stateTransition: vi.fn(),
    updateConfig: vi.fn(),
    listApprovals: vi.fn(),
  },
}));

vi.mock("@/services/workflow.service", () => ({
  // The store does `new WorkflowService()`; a constructor function that returns an object
  // makes `new` yield our shared mock instance.
  WorkflowService: function WorkflowService() {
    return mockService;
  },
}));

import { WorkflowStore } from "./workflow.store";

const SLUG = "acme";
const PROJECT = "project-1";
const ISSUE = "issue-1";

describe("WorkflowStore", () => {
  let store: WorkflowStore;

  beforeEach(() => {
    vi.clearAllMocks();
    // The store does not depend on the root store for these behaviors.
    store = new WorkflowStore({} as never);
  });

  describe("fetchTransitions", () => {
    it("populates transitions keyed by project id", async () => {
      const rows = [
        { id: "t1", project: PROJECT, from_state: "A", to_state: "B" },
        { id: "t2", project: PROJECT, from_state: "A", to_state: "C" },
      ];
      mockService.listTransitions.mockResolvedValue(rows);

      await store.fetchTransitions(SLUG, PROJECT);

      expect(mockService.listTransitions).toHaveBeenCalledWith(SLUG, PROJECT, undefined);
      expect(store.getTransitionsByProject(PROJECT)).toEqual(rows);
    });
  });

  describe("transitionWorkItem", () => {
    it("keeps the work item state updated after a completed transition", async () => {
      mockService.stateTransition.mockResolvedValue({
        status: 200,
        data: { id: ISSUE, state_id: "B" },
      });

      const result = await store.transitionWorkItem(SLUG, PROJECT, ISSUE, "A", "B");

      expect(result).toEqual({ kind: "transitioned", issue: { id: ISSUE, state_id: "B" } });
      expect(store.getWorkItemState(ISSUE)).toBe("B");
    });

    it("refreshes approvals without changing state when approval is required", async () => {
      mockService.stateTransition.mockResolvedValue({
        status: 202,
        data: { approval_id: "approval-1" },
      });
      mockService.listApprovals.mockResolvedValue([
        { id: "approval-1", issue: ISSUE, status: "pending", approvers: [] },
      ]);

      const result = await store.transitionWorkItem(SLUG, PROJECT, ISSUE, "A", "B");

      expect(result).toEqual({ kind: "approval_required", approvalId: "approval-1" });
      expect(store.getWorkItemState(ISSUE)).toBeUndefined();
      expect(mockService.listApprovals).toHaveBeenCalledWith(SLUG, PROJECT, ISSUE);
    });

    it("rolls back to the previous state when the service rejects with 403", async () => {
      mockService.stateTransition.mockRejectedValue({ status: 403 });

      await expect(store.transitionWorkItem(SLUG, PROJECT, ISSUE, "A", "B")).rejects.toBeDefined();

      expect(store.getWorkItemState(ISSUE)).toBe("A");
    });

    it("rolls back to the previous state when the service rejects with 409", async () => {
      mockService.stateTransition.mockRejectedValue({ status: 409 });

      await expect(store.transitionWorkItem(SLUG, PROJECT, ISSUE, "A", "B")).rejects.toBeDefined();

      expect(store.getWorkItemState(ISSUE)).toBe("A");
    });
  });

  describe("setWorkflowStatus", () => {
    it("updates the workflow status for the project", async () => {
      mockService.updateConfig.mockResolvedValue({ workflow_status: "enabled" });

      await store.setWorkflowStatus(SLUG, PROJECT, "enabled");

      expect(mockService.updateConfig).toHaveBeenCalledWith(SLUG, PROJECT, { workflow_status: "enabled" });
      expect(store.getWorkflowStatus(PROJECT)).toBe("enabled");
    });
  });
});

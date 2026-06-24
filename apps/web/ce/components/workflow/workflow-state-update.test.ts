/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { parseWorkflowTransitionResponse, shouldRouteStateChangeThroughWorkflow } from "./workflow-state-update";

describe("workflow state update helpers", () => {
  it("routes pure state changes when workflows are enabled", () => {
    expect(
      shouldRouteStateChangeThroughWorkflow({
        featureEnabled: true,
        workflowStatus: "enabled",
        issueBeforeUpdate: { state_id: "state-a" },
        data: { state_id: "state-b" },
      })
    ).toEqual({ fromStateId: "state-a", toStateId: "state-b" });
  });

  it("skips mixed updates that also change non-workflow fields", () => {
    expect(
      shouldRouteStateChangeThroughWorkflow({
        featureEnabled: true,
        workflowStatus: "enabled",
        issueBeforeUpdate: { state_id: "state-a" },
        data: { state_id: "state-b", name: "Updated title" },
      })
    ).toBeNull();
  });

  it("parses approval-required responses", () => {
    expect(parseWorkflowTransitionResponse(202, { approval_id: "approval-1" })).toEqual({
      kind: "approval_required",
      approvalId: "approval-1",
    });
  });

  it("parses completed transition responses", () => {
    expect(parseWorkflowTransitionResponse(200, { id: "issue-1", state_id: "state-b" })).toEqual({
      kind: "transitioned",
      issue: { id: "issue-1", state_id: "state-b" },
    });
  });
});

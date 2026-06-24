/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";

import {
  parseWorkflowTransitionResponse,
  shouldRouteStateChangeThroughWorkflow,
  tryWorkflowRoutedIssueUpdate,
} from "./workflow-state-update";

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

describe("tryWorkflowRoutedIssueUpdate", () => {
  it("skips when shouldSync is false", async () => {
    const transitionWorkItem = vi.fn();
    const handled = await tryWorkflowRoutedIssueUpdate({
      workspaceSlug: "acme",
      projectId: "project-1",
      issueId: "issue-1",
      data: { state_id: "state-b" },
      shouldSync: false,
      issueBeforeUpdate: { state_id: "state-a" },
      workflowStatus: "enabled",
      transitionWorkItem,
      onApprovalRequired: vi.fn(),
      onTransitioned: vi.fn(),
    });

    expect(handled).toBe(false);
    expect(transitionWorkItem).not.toHaveBeenCalled();
  });

  it("routes state-only drag updates through transitionWorkItem", async () => {
    const onTransitioned = vi.fn().mockResolvedValue(undefined);
    const handled = await tryWorkflowRoutedIssueUpdate({
      workspaceSlug: "acme",
      projectId: "project-1",
      issueId: "issue-1",
      data: { state_id: "state-b" },
      shouldSync: true,
      issueBeforeUpdate: { state_id: "state-a" },
      workflowStatus: "enabled",
      transitionWorkItem: vi.fn().mockResolvedValue({
        kind: "transitioned",
        issue: { state_id: "state-b" },
      }),
      onApprovalRequired: vi.fn(),
      onTransitioned,
    });

    expect(handled).toBe(true);
    expect(onTransitioned).toHaveBeenCalledWith({ state_id: "state-b" });
  });

  it("handles approval-required transitions without mutating issue state", async () => {
    const onApprovalRequired = vi.fn();
    const onTransitioned = vi.fn();
    const handled = await tryWorkflowRoutedIssueUpdate({
      workspaceSlug: "acme",
      projectId: "project-1",
      issueId: "issue-1",
      data: { state_id: "state-b" },
      shouldSync: true,
      issueBeforeUpdate: { state_id: "state-a" },
      workflowStatus: "enabled",
      transitionWorkItem: vi.fn().mockResolvedValue({
        kind: "approval_required",
        approvalId: "approval-1",
      }),
      onApprovalRequired,
      onTransitioned,
    });

    expect(handled).toBe(true);
    expect(onApprovalRequired).toHaveBeenCalledOnce();
    expect(onTransitioned).not.toHaveBeenCalled();
  });
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
// plane imports
import type { IWorkItemApproval } from "@plane/types";
// local imports
import { getApprovalBannerModel, sanitizeApprovalComment } from "./approval-banner.utils";

const approval = (overrides: Partial<IWorkItemApproval> = {}): IWorkItemApproval => ({
  id: "approval-1",
  issue: "issue-1",
  transition: "transition-1",
  status: "pending",
  requested_by: "user-requester",
  decided_by: null,
  decided_at: null,
  target_state: "state-done",
  fallback_state: "state-started",
  comment: "Please review",
  approvers: [{ member: "project-member-1", responded: false }],
  ...overrides,
});

describe("approval banner helpers", () => {
  it("shows decision actions for an approver viewer", () => {
    expect(
      getApprovalBannerModel({
        approval: approval(),
        currentProjectMemberId: "project-member-1",
        getStateName: (stateId) => ({ "state-done": "Done", "state-started": "Started" })[stateId] ?? stateId,
        getUserName: (userId) => ({ "user-requester": "Kuna" })[userId] ?? userId,
      })
    ).toEqual({
      canDecide: true,
      comment: "Please review",
      fallbackStateName: "Started",
      requesterName: "Kuna",
      targetStateName: "Done",
    });
  });

  it("hides decision actions for a non-approver viewer", () => {
    expect(
      getApprovalBannerModel({
        approval: approval(),
        currentProjectMemberId: "project-member-2",
        getStateName: (stateId) => stateId,
        getUserName: (userId) => userId,
      })?.canDecide
    ).toBe(false);
  });

  it("renders markup comments as sanitized text", () => {
    expect(sanitizeApprovalComment("<strong>Ship</strong><script>alert(1)</script><p>Ready&nbsp;&amp; clear</p>")).toBe(
      "Ship\nReady & clear"
    );
  });
});

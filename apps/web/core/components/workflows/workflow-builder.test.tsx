/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
// plane imports
import type { IWorkflowTransition } from "@plane/types";
// local imports
import {
  DEFAULT_WORKFLOW_ISSUE_TYPE_ID,
  buildWorkflowTransitionPayload,
  getWorkflowBuilderMode,
  getWorkflowIssueTypeOptions,
  getWorkflowTransitionsForIssueType,
  groupWorkflowTransitionsByFromState,
} from "./workflow-builder.utils";

const transition = (overrides: Partial<IWorkflowTransition> = {}): IWorkflowTransition => ({
  id: "transition-1",
  project: "project-1",
  workspace: "workspace-1",
  from_state: "state-a",
  to_state: "state-b",
  issue_type: null,
  allowed_roles: [],
  approval_required: false,
  fallback_state: null,
  auto_assign_member: null,
  auto_assign_role: null,
  ...overrides,
});

describe("workflow builder helpers", () => {
  describe("builder mode", () => {
    it("returns disabled when the entitlement flag is off", () => {
      expect(
        getWorkflowBuilderMode({
          featureEnabled: false,
          workflowStatus: "enabled",
          transitions: [transition()],
        })
      ).toEqual({ kind: "disabled" });
    });

    it("returns unrestricted when workflows are on but no rules exist", () => {
      expect(
        getWorkflowBuilderMode({
          featureEnabled: true,
          workflowStatus: "enabled",
          transitions: [],
        })
      ).toEqual({ kind: "unrestricted" });
    });

    it("keeps paused visible as a non-enforcing mode", () => {
      expect(
        getWorkflowBuilderMode({
          featureEnabled: true,
          workflowStatus: "paused",
          transitions: [transition()],
        })
      ).toEqual({ kind: "paused" });
    });
  });

  describe("issue-type scoping", () => {
    it("lists default plus unique typed rule-set options", () => {
      expect(
        getWorkflowIssueTypeOptions([
          transition({ id: "default", issue_type: null }),
          transition({ id: "bug", issue_type: "bug" }),
          transition({ id: "bug-duplicate", issue_type: "bug" }),
          transition({ id: "story", issue_type: "story" }),
        ])
      ).toEqual([
        { id: DEFAULT_WORKFLOW_ISSUE_TYPE_ID, label: "Default workflow" },
        { id: "bug", label: "Type bug" },
        { id: "story", label: "Type story" },
      ]);
    });

    it("filters transitions to the selected issue-type rule set", () => {
      const rows = [
        transition({ id: "default", issue_type: null, to_state: "state-b" }),
        transition({ id: "bug", issue_type: "bug", to_state: "state-c" }),
      ];

      expect(getWorkflowTransitionsForIssueType(rows, DEFAULT_WORKFLOW_ISSUE_TYPE_ID).map((row) => row.id)).toEqual([
        "default",
      ]);
      expect(getWorkflowTransitionsForIssueType(rows, "bug").map((row) => row.id)).toEqual(["bug"]);
    });
  });

  describe("transition presentation", () => {
    it("groups transitions by source state", () => {
      expect(
        groupWorkflowTransitionsByFromState([
          transition({ id: "a-b", from_state: "state-a", to_state: "state-b" }),
          transition({ id: "a-c", from_state: "state-a", to_state: "state-c" }),
          transition({ id: "b-c", from_state: "state-b", to_state: "state-c" }),
        ])
      ).toEqual({
        "state-a": [
          transition({ id: "a-b", from_state: "state-a", to_state: "state-b" }),
          transition({ id: "a-c", from_state: "state-a", to_state: "state-c" }),
        ],
        "state-b": [transition({ id: "b-c", from_state: "state-b", to_state: "state-c" })],
      });
    });

    it("builds a store payload with normalized nullable fields", () => {
      expect(
        buildWorkflowTransitionPayload({
          fromStateId: "state-a",
          toStateId: "state-b",
          selectedIssueTypeId: DEFAULT_WORKFLOW_ISSUE_TYPE_ID,
          allowedRoles: ["20", "15"],
          approvalRequired: true,
          fallbackStateId: "",
          autoAssignMemberId: "",
          autoAssignRole: "5",
        })
      ).toEqual({
        from_state: "state-a",
        to_state: "state-b",
        issue_type: null,
        allowed_roles: [20, 15],
        approval_required: true,
        fallback_state: null,
        auto_assign_member: null,
        auto_assign_role: 5,
      });
    });
  });
});

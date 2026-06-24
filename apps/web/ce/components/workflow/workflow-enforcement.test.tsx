/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import type { IWorkflowTransition } from "@plane/types";

import {
  WORKFLOW_TRANSITION_NOT_ALLOWED_MESSAGE,
  getWorkflowStateIdFromGrouping,
  getWorkflowTransitionDecision,
  getWorkflowTransitionForTarget,
  shouldFilterStateOption,
} from "./workflow-enforcement";

const transition = (overrides: Partial<IWorkflowTransition>): IWorkflowTransition => ({
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

describe("workflow enforcement helpers", () => {
  describe("state-option filtering", () => {
    it("keeps all options selectable when the feature flag is off", () => {
      expect(
        shouldFilterStateOption({
          featureEnabled: false,
          workflowStatus: "enabled",
          filterAvailableStateIds: true,
          alwaysAllowStateChange: false,
          optionStateId: "state-c",
          selectedStateId: "state-a",
          legalTargetStateIds: ["state-b"],
        })
      ).toBe(false);
    });

    it("greys an illegal target when the flag is on and filtering is requested", () => {
      expect(
        shouldFilterStateOption({
          featureEnabled: true,
          workflowStatus: "enabled",
          filterAvailableStateIds: true,
          alwaysAllowStateChange: false,
          optionStateId: "state-c",
          selectedStateId: "state-a",
          legalTargetStateIds: ["state-b"],
        })
      ).toBe(true);

      expect(
        shouldFilterStateOption({
          featureEnabled: true,
          workflowStatus: "enabled",
          filterAvailableStateIds: true,
          alwaysAllowStateChange: false,
          optionStateId: "state-b",
          selectedStateId: "state-a",
          legalTargetStateIds: ["state-b"],
        })
      ).toBe(false);
    });
  });

  describe("drag-drop decisions", () => {
    it("preserves the no-op decision when workflow status is disabled", () => {
      expect(
        getWorkflowTransitionDecision({
          featureEnabled: true,
          workflowStatus: "disabled",
          sourceStateId: "state-a",
          targetStateId: "state-c",
          legalTargetStateIds: ["state-b"],
        })
      ).toEqual({ disabled: false });
    });

    it("blocks illegal target states with a workflow reason", () => {
      expect(
        getWorkflowTransitionDecision({
          featureEnabled: true,
          workflowStatus: "enabled",
          sourceStateId: "state-a",
          targetStateId: "state-c",
          legalTargetStateIds: ["state-b"],
        })
      ).toEqual({ disabled: true, reason: WORKFLOW_TRANSITION_NOT_ALLOWED_MESSAGE });
    });

    it("allows approval-required targets so the workflow API can create a pending approval", () => {
      expect(
        getWorkflowTransitionDecision({
          featureEnabled: true,
          workflowStatus: "enabled",
          sourceStateId: "state-a",
          targetStateId: "state-b",
          legalTargetStateIds: ["state-b"],
          transition: transition({ approval_required: true }),
        })
      ).toEqual({ disabled: false });
    });
  });

  describe("locked source states (no outgoing rules)", () => {
    it("blocks every drag out of a source with no legal targets once the project has rules", () => {
      expect(
        getWorkflowTransitionDecision({
          featureEnabled: true,
          workflowStatus: "enabled",
          sourceStateId: "state-terminal",
          targetStateId: "state-b",
          legalTargetStateIds: [],
          hasTransitionRules: true,
        })
      ).toEqual({ disabled: true, reason: WORKFLOW_TRANSITION_NOT_ALLOWED_MESSAGE });
    });

    it("does not enforce when no transition rules exist anywhere in the project", () => {
      expect(
        getWorkflowTransitionDecision({
          featureEnabled: true,
          workflowStatus: "enabled",
          sourceStateId: "state-a",
          targetStateId: "state-b",
          legalTargetStateIds: [],
          hasTransitionRules: false,
        })
      ).toEqual({ disabled: false });
    });

    it("greys every option for a locked source while rules exist elsewhere", () => {
      expect(
        shouldFilterStateOption({
          featureEnabled: true,
          workflowStatus: "enabled",
          filterAvailableStateIds: true,
          alwaysAllowStateChange: false,
          optionStateId: "state-b",
          selectedStateId: "state-terminal",
          legalTargetStateIds: [],
          hasTransitionRules: true,
        })
      ).toBe(true);
    });

    it("returns no governing transition when the target is unreachable from the source", () => {
      const transitions = [transition({ id: "a-b", from_state: "state-a", to_state: "state-b" })];
      expect(getWorkflowTransitionForTarget(transitions, "state-a", "state-z")).toBeUndefined();
    });
  });

  describe("grouping helpers", () => {
    it("resolves the state id from either group or subgroup state layouts", () => {
      expect(getWorkflowStateIdFromGrouping("state", undefined, "group-state", undefined)).toBe("group-state");
      expect(getWorkflowStateIdFromGrouping("priority", "state", "high", "sub-state")).toBe("sub-state");
      expect(getWorkflowStateIdFromGrouping("priority", undefined, "high", undefined)).toBeUndefined();
    });

    it("selects the typed transition when typed rules exist, otherwise falls back to default rules", () => {
      const transitions = [
        transition({ id: "default", from_state: "state-a", to_state: "state-b", issue_type: null }),
        transition({ id: "typed", from_state: "state-a", to_state: "state-c", issue_type: "bug" }),
      ];

      expect(getWorkflowTransitionForTarget(transitions, "state-a", "state-c", "bug")?.id).toBe("typed");
      expect(getWorkflowTransitionForTarget(transitions, "state-a", "state-b", "story")?.id).toBe("default");
    });
  });
});

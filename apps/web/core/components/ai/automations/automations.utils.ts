// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { AUTOMATION_ALLOWED_ACTIONS, EAutomationRuleAction, EAutomationRuleTrigger } from "@plane/constants";

export type TAutomationRuleAction = {
  type: EAutomationRuleAction;
  /** Action-specific config, e.g. `{ assignee_id }` or `{ priority }`. */
  value?: Record<string, unknown>;
};

export type TAutomationRule = {
  id: string;
  name: string;
  is_active: boolean;
  trigger: EAutomationRuleTrigger;
  conditions: Record<string, unknown>;
  actions: TAutomationRuleAction[];
  project: string | null;
};

export type TAutomationRulePayload = {
  name: string;
  trigger: EAutomationRuleTrigger;
  conditions: Record<string, unknown>;
  actions: TAutomationRuleAction[];
  project?: string | null;
  is_active?: boolean;
};

export type TAutomationRunStatus = "success" | "partial" | "failed";

export type TAutomationRun = {
  id: string;
  rule: string;
  rule_name?: string;
  triggered_by_event: string;
  status: TAutomationRunStatus;
  actions_applied: Record<string, unknown>[];
  error?: string | null;
  created_at: string;
};

export type TAutomationService = {
  listRules: (workspaceSlug: string) => Promise<TAutomationRule[]>;
  createRule: (workspaceSlug: string, payload: TAutomationRulePayload) => Promise<TAutomationRule>;
  updateRule: (
    workspaceSlug: string,
    ruleId: string,
    payload: Partial<TAutomationRulePayload>
  ) => Promise<TAutomationRule>;
  deleteRule: (workspaceSlug: string, ruleId: string) => Promise<void>;
  listRuns: (workspaceSlug: string) => Promise<TAutomationRun[]>;
};

/** Gating: the automations surface requires the `workflows_approvals` flag AND admin. */
export const isAutomationsVisible = (featureEnabled: boolean) => featureEnabled;

export const canManageAutomations = ({ featureEnabled, isAdmin }: { featureEnabled: boolean; isAdmin: boolean }) =>
  featureEnabled && isAdmin;

export type TRuleValidationError = "missing_name" | "missing_trigger" | "empty_actions" | "non_allowlisted_action";

/**
 * Validates a rule payload before submit. Mirrors the server-side rejection of
 * empty action lists and non-allowlisted actions (AI-T13). Returns the first
 * error or `null` when valid.
 */
export const validateRulePayload = (payload: Partial<TAutomationRulePayload>): TRuleValidationError | null => {
  if (!payload.name?.trim()) return "missing_name";
  if (!payload.trigger) return "missing_trigger";
  if (!payload.actions || payload.actions.length === 0) return "empty_actions";
  const hasInvalidAction = payload.actions.some((action) => !AUTOMATION_ALLOWED_ACTIONS.includes(action.type));
  if (hasInvalidAction) return "non_allowlisted_action";
  return null;
};

export const getRuleValidationMessage = (error: TRuleValidationError): string => {
  switch (error) {
    case "missing_name":
      return "Give the rule a name.";
    case "missing_trigger":
      return "Choose a trigger.";
    case "empty_actions":
      return "Add at least one action.";
    case "non_allowlisted_action":
      return "One or more actions are not allowed.";
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
};

export const formatRunStatusLabel = (status: TAutomationRunStatus): string => {
  switch (status) {
    case "success":
      return "Success";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
};

export const buildRulePayload = (input: {
  name: string;
  trigger: EAutomationRuleTrigger;
  conditions?: Record<string, unknown>;
  actions: TAutomationRuleAction[];
  project?: string | null;
}): TAutomationRulePayload => ({
  name: input.name.trim(),
  trigger: input.trigger,
  conditions: input.conditions ?? {},
  actions: input.actions,
  project: input.project ?? null,
  is_active: true,
});

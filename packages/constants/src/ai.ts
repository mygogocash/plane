/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum AI_EDITOR_TASKS {
  ASK_ANYTHING = "ASK_ANYTHING",
  TRANSLATE = "translate",
}

/** Automation rule triggers (AI-E6). Mirrors the server `AutomationRule.trigger` choices. */
export enum EAutomationRuleTrigger {
  ISSUE_CREATED = "issue_created",
  ISSUE_UPDATED = "issue_updated",
  ISSUE_MENTIONED = "issue_mentioned",
  ISSUE_LABELED = "issue_labeled",
}

/** Allowlisted automation actions (AI-E6). Mirrors the server action allowlist. */
export enum EAutomationRuleAction {
  ASSIGN = "assign",
  SET_PRIORITY = "set_priority",
  MOVE_TO_CYCLE = "move_to_cycle",
  POST_TO_SLACK = "post_to_slack",
  CLOSE = "close",
  RUN_AGENT = "run_agent",
}

/** Automation agent scope (AI-E8). `read_only` agents cannot invoke write actions. */
export enum EAutomationAgentScope {
  READ_ONLY = "read_only",
  WRITE = "write",
}

export type TAutomationRuleTriggerOption = {
  value: EAutomationRuleTrigger;
  i18n_label: string;
};

export type TAutomationRuleActionOption = {
  value: EAutomationRuleAction;
  i18n_label: string;
  /** Whether the action mutates data (rejected for read-only agents). */
  is_write: boolean;
};

export type TAutomationAgentScopeOption = {
  value: EAutomationAgentScope;
  i18n_label: string;
};

export const AUTOMATION_RULE_TRIGGERS: TAutomationRuleTriggerOption[] = [
  { value: EAutomationRuleTrigger.ISSUE_CREATED, i18n_label: "automation.trigger.issue_created" },
  { value: EAutomationRuleTrigger.ISSUE_UPDATED, i18n_label: "automation.trigger.issue_updated" },
  { value: EAutomationRuleTrigger.ISSUE_MENTIONED, i18n_label: "automation.trigger.issue_mentioned" },
  { value: EAutomationRuleTrigger.ISSUE_LABELED, i18n_label: "automation.trigger.issue_labeled" },
];

export const AUTOMATION_RULE_ACTIONS: TAutomationRuleActionOption[] = [
  { value: EAutomationRuleAction.ASSIGN, i18n_label: "automation.action.assign", is_write: true },
  { value: EAutomationRuleAction.SET_PRIORITY, i18n_label: "automation.action.set_priority", is_write: true },
  { value: EAutomationRuleAction.MOVE_TO_CYCLE, i18n_label: "automation.action.move_to_cycle", is_write: true },
  { value: EAutomationRuleAction.POST_TO_SLACK, i18n_label: "automation.action.post_to_slack", is_write: false },
  { value: EAutomationRuleAction.CLOSE, i18n_label: "automation.action.close", is_write: true },
  { value: EAutomationRuleAction.RUN_AGENT, i18n_label: "automation.action.run_agent", is_write: true },
];

export const AUTOMATION_AGENT_SCOPES: TAutomationAgentScopeOption[] = [
  { value: EAutomationAgentScope.READ_ONLY, i18n_label: "automation.agent_scope.read_only" },
  { value: EAutomationAgentScope.WRITE, i18n_label: "automation.agent_scope.write" },
];

/** Allowlisted action values used for client-side rule validation. */
export const AUTOMATION_ALLOWED_ACTIONS: EAutomationRuleAction[] = AUTOMATION_RULE_ACTIONS.map(
  (action) => action.value
);

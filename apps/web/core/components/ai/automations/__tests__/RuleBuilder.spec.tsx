// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EAutomationRuleAction, EAutomationRuleTrigger } from "@plane/constants";
import { RuleBuilder } from "../RuleBuilder";
import { RunHistoryTable } from "../RunHistoryTable";
import { buildRulePayload, canManageAutomations, validateRulePayload, type TAutomationRun } from "../automations.utils";

describe("RuleBuilder render", () => {
  it("renders trigger and action controls", () => {
    const markup = renderToStaticMarkup(<RuleBuilder />);
    expect(markup).toContain("rule-trigger-select");
    expect(markup).toContain("rule-action-select");
    expect(markup).toContain("Add action");
    expect(markup).toContain("Save rule");
  });
});

describe("rule payload validation (AI-T13 parity)", () => {
  it("accepts a trigger→conditions→actions rule", () => {
    const payload = buildRulePayload({
      name: "Auto-assign bugs",
      trigger: EAutomationRuleTrigger.ISSUE_CREATED,
      actions: [{ type: EAutomationRuleAction.ASSIGN }],
    });
    expect(validateRulePayload(payload)).toBeNull();
    expect(payload).toMatchObject({
      name: "Auto-assign bugs",
      trigger: "issue_created",
      actions: [{ type: "assign" }],
      is_active: true,
    });
  });

  it("rejects empty actions", () => {
    const payload = buildRulePayload({
      name: "No actions",
      trigger: EAutomationRuleTrigger.ISSUE_CREATED,
      actions: [],
    });
    expect(validateRulePayload(payload)).toBe("empty_actions");
  });

  it("rejects a non-allowlisted action", () => {
    expect(
      validateRulePayload({
        name: "Bad",
        trigger: EAutomationRuleTrigger.ISSUE_CREATED,
        actions: [{ type: "delete_workspace" as EAutomationRuleAction }],
      })
    ).toBe("non_allowlisted_action");
  });

  it("rejects a missing name", () => {
    expect(
      validateRulePayload({
        name: "   ",
        trigger: EAutomationRuleTrigger.ISSUE_CREATED,
        actions: [{ type: EAutomationRuleAction.ASSIGN }],
      })
    ).toBe("missing_name");
  });
});

describe("automations gating", () => {
  it("non-admin cannot manage automations", () => {
    expect(canManageAutomations({ featureEnabled: true, isAdmin: false })).toBe(false);
    expect(canManageAutomations({ featureEnabled: true, isAdmin: true })).toBe(true);
  });

  it("flag off → cannot manage (no paywall)", () => {
    expect(canManageAutomations({ featureEnabled: false, isAdmin: true })).toBe(false);
  });
});

describe("RunHistoryTable", () => {
  it("renders AutomationRun rows with status", () => {
    const runs: TAutomationRun[] = [
      {
        id: "run-1",
        rule: "rule-1",
        rule_name: "Auto-assign",
        triggered_by_event: "issue_created",
        status: "success",
        actions_applied: [],
        created_at: "2026-06-24",
      },
      {
        id: "run-2",
        rule: "rule-1",
        rule_name: "Auto-assign",
        triggered_by_event: "issue_updated",
        status: "partial",
        actions_applied: [],
        error: "Assignee skipped",
        created_at: "2026-06-24",
      },
    ];

    const markup = renderToStaticMarkup(<RunHistoryTable runs={runs} />);
    expect(markup).toContain("run-row-run-1");
    expect(markup).toContain("Success");
    expect(markup).toContain("Partial");
  });

  it("renders an empty state when there are no runs", () => {
    const markup = renderToStaticMarkup(<RunHistoryTable runs={[]} />);
    expect(markup).toContain("No runs recorded yet.");
  });
});

// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, expect, it } from "vitest";

import {
  AI_EDITOR_TASKS,
  AUTOMATION_AGENT_SCOPES,
  AUTOMATION_RULE_ACTIONS,
  AUTOMATION_RULE_TRIGGERS,
  EAutomationAgentScope,
  EAutomationRuleAction,
  EAutomationRuleTrigger,
  WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS,
} from "@plane/constants";
import { COPILOT_MODES, type TCopilotMode } from "../ai.service";

describe("AI-T22 shared copilot modes", () => {
  it("COPILOT_MODES includes build_project and context_assist", () => {
    expect(COPILOT_MODES).toContain("build_project");
    expect(COPILOT_MODES).toContain("context_assist");
  });

  it("TCopilotMode build_project type-checks", () => {
    const mode: TCopilotMode = "build_project";
    expect(mode).toBe("build_project");
  });
});

describe("AI-T22 editor tasks", () => {
  it("AI_EDITOR_TASKS includes TRANSLATE", () => {
    expect(AI_EDITOR_TASKS.TRANSLATE).toBe("translate");
  });
});

describe("AI-T22 rule/agent enums", () => {
  it("rule trigger enum exports expected members", () => {
    expect(EAutomationRuleTrigger.ISSUE_CREATED).toBe("issue_created");
    expect(EAutomationRuleTrigger.ISSUE_UPDATED).toBe("issue_updated");
    expect(EAutomationRuleTrigger.ISSUE_MENTIONED).toBe("issue_mentioned");
    expect(EAutomationRuleTrigger.ISSUE_LABELED).toBe("issue_labeled");
    expect(AUTOMATION_RULE_TRIGGERS.map((trigger) => trigger.value)).toEqual(
      expect.arrayContaining(["issue_created", "issue_updated", "issue_mentioned", "issue_labeled"])
    );
  });

  it("rule action enum exports expected members", () => {
    expect(EAutomationRuleAction.ASSIGN).toBe("assign");
    expect(EAutomationRuleAction.SET_PRIORITY).toBe("set_priority");
    expect(EAutomationRuleAction.MOVE_TO_CYCLE).toBe("move_to_cycle");
    expect(EAutomationRuleAction.POST_TO_SLACK).toBe("post_to_slack");
    expect(EAutomationRuleAction.CLOSE).toBe("close");
    expect(EAutomationRuleAction.RUN_AGENT).toBe("run_agent");
    expect(AUTOMATION_RULE_ACTIONS.map((action) => action.value)).toEqual(
      expect.arrayContaining(["assign", "set_priority", "move_to_cycle", "post_to_slack", "close", "run_agent"])
    );
  });

  it("agent scope enum exports expected members", () => {
    expect(EAutomationAgentScope.READ_ONLY).toBe("read_only");
    expect(EAutomationAgentScope.WRITE).toBe("write");
    expect(AUTOMATION_AGENT_SCOPES.map((scope) => scope.value)).toEqual(expect.arrayContaining(["read_only", "write"]));
  });
});

describe("AI-T22 workspace nav registry", () => {
  it("includes an ai_chat entry with href /ai-chat/", () => {
    const entry = WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS["ai_chat"];
    expect(entry).toBeTruthy();
    expect(entry.key).toBe("ai_chat");
    expect(entry.href).toBe("/ai-chat/");
  });
});

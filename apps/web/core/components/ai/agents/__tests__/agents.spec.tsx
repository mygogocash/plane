// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EAutomationAgentScope } from "@plane/constants";
import { AIService } from "@/services/ai.service";
import { AgentMentionComposer } from "../AgentMentionComposer";
import { AgentResponseThread } from "../AgentResponseThread";
import { AgentsAssigneeSection } from "../AgentsAssigneeSection";
import {
  buildAgentMentionPayload,
  getAgentMentionHint,
  parseAgentMention,
  type TAutomationAgent,
} from "../agents.utils";

const writeAgent: TAutomationAgent = {
  id: "agent-1",
  name: "Builder",
  scope: EAutomationAgentScope.WRITE,
  allowed_actions: ["assign"],
  is_active: true,
};

const readOnlyAgent: TAutomationAgent = {
  id: "agent-2",
  name: "Triage",
  scope: EAutomationAgentScope.READ_ONLY,
  allowed_actions: [],
  is_active: true,
};

describe("AgentsAssigneeSection", () => {
  it("shows the Agents section with scope badges", () => {
    const markup = renderToStaticMarkup(
      <AgentsAssigneeSection agents={[writeAgent, readOnlyAgent]} featureEnabled isProviderConfigured />
    );

    expect(markup).toContain("agents-assignee-section");
    expect(markup).toContain("Builder");
    expect(markup).toContain("Triage");
    expect(markup).toContain("agent-scope-badge-agent-1");
    expect(markup).toContain("write");
  });

  it("read-only agent chip shows the read-only badge", () => {
    const markup = renderToStaticMarkup(
      <AgentsAssigneeSection agents={[readOnlyAgent]} featureEnabled isProviderConfigured />
    );
    expect(markup).toContain("read-only");
  });

  it("workflows_approvals off → no Agents section", () => {
    const markup = renderToStaticMarkup(
      <AgentsAssigneeSection agents={[writeAgent]} featureEnabled={false} isProviderConfigured />
    );
    expect(markup).toBe("");
  });

  it("provider missing → no Agents section", () => {
    const markup = renderToStaticMarkup(
      <AgentsAssigneeSection agents={[writeAgent]} featureEnabled isProviderConfigured={false} />
    );
    expect(markup).toBe("");
  });
});

describe("@AgentName mention", () => {
  it("parses a mention and enqueues a run payload", () => {
    const matched = parseAgentMention("hey @Builder please draft subtasks", [writeAgent, readOnlyAgent]);
    expect(matched?.id).toBe("agent-1");

    const payload = buildAgentMentionPayload(matched!, { source_type: "comment", source_id: "comment-1" });
    expect(payload).toEqual({ agent_id: "agent-1", source_type: "comment", source_id: "comment-1" });
  });

  it("matches case-insensitively and ignores inactive agents", () => {
    expect(parseAgentMention("@TRIAGE look at this", [readOnlyAgent])?.id).toBe("agent-2");
    expect(parseAgentMention("@Builder", [{ ...writeAgent, is_active: false }])).toBeNull();
    expect(parseAgentMention("no mention here", [writeAgent])).toBeNull();
  });

  it("renders the inline agent response thread", () => {
    const markup = renderToStaticMarkup(
      <AgentResponseThread
        mention={{
          id: "mention-1",
          agent: "agent-1",
          agent_name: "Builder",
          source_type: "comment",
          source_id: "comment-1",
          status: "completed",
          response: "Created 3 subtasks.",
        }}
      />
    );

    expect(markup).toContain("agent-response-mention-1");
    expect(markup).toContain("Created 3 subtasks.");
  });

  it("shows a running state while the mention is pending", () => {
    const markup = renderToStaticMarkup(
      <AgentResponseThread
        mention={{
          id: "mention-2",
          agent: "agent-1",
          source_type: "comment",
          source_id: "comment-1",
          status: "pending",
        }}
      />
    );
    expect(markup).toContain("Running…");
  });
});

describe("AgentMentionComposer", () => {
  it("surfaces a Run affordance and hint when an agent is mentioned", () => {
    const markup = renderToStaticMarkup(
      <AgentMentionComposer
        agents={[writeAgent, readOnlyAgent]}
        featureEnabled
        isProviderConfigured
        value="ping @Builder"
      />
    );

    expect(markup).toContain("agent-mention-composer");
    expect(markup).toContain("agent-mention-hint");
    expect(markup).toContain("Run @Builder (write)");
    // enabled Run uses the active style, not the disabled one
    expect(markup).not.toContain("cursor-not-allowed");
  });

  it("disables Run with no hint when no agent is mentioned", () => {
    const markup = renderToStaticMarkup(
      <AgentMentionComposer agents={[writeAgent]} featureEnabled isProviderConfigured value="just a comment" />
    );

    expect(markup).not.toContain("agent-mention-hint");
    expect(markup).toContain("cursor-not-allowed");
  });

  it("provider missing → composer visible but Run disabled", () => {
    const markup = renderToStaticMarkup(
      <AgentMentionComposer agents={[writeAgent]} featureEnabled isProviderConfigured={false} value="@Builder go" />
    );

    expect(markup).toContain("agent-mention-composer");
    expect(markup).toContain("cursor-not-allowed");
  });

  it("workflows_approvals off → composer is hidden", () => {
    const markup = renderToStaticMarkup(
      <AgentMentionComposer agents={[writeAgent]} featureEnabled={false} isProviderConfigured value="@Builder" />
    );
    expect(markup).toBe("");
  });

  it("getAgentMentionHint returns null without a match", () => {
    expect(getAgentMentionHint(null)).toBeNull();
    expect(getAgentMentionHint(readOnlyAgent)).toBe("Run @Triage (read-only)");
  });
});

describe("AIService agent wiring (AI-T15/T16)", () => {
  it("listAgents GETs the automation agents route", async () => {
    const service = new AIService();
    const getSpy = vi.spyOn(service as any, "get").mockResolvedValue({ data: [writeAgent] });

    await service.listAgents("acme");
    expect(getSpy).toHaveBeenCalledWith("/api/workspaces/acme/automation/agents/");
  });

  it("createMention POSTs the mention payload", async () => {
    const service = new AIService();
    const postSpy = vi.spyOn(service as any, "post").mockResolvedValue({
      data: { id: "mention-1", agent: "agent-1", source_type: "comment", source_id: "comment-1", status: "pending" },
    });

    const payload = buildAgentMentionPayload(writeAgent, { source_type: "comment", source_id: "comment-1" });
    await service.createMention("acme", payload);
    expect(postSpy).toHaveBeenCalledWith("/api/workspaces/acme/automation/agents/mentions/", payload);
  });
});

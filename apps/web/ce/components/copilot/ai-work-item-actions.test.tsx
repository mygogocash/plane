/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// local imports
import { AIWorkItemActions, runAgentRunAction, runDescribeAction, runSummaryAction } from "./ai-work-item-actions";

const baseProps = {
  workspaceSlug: "acme",
  projectId: "project-1",
  issueId: "issue-1",
} as const;

describe("AIWorkItemActions", () => {
  it("renders Draft/Simplify/Rewrite, summary, and agent-run when provider configured and flag on", () => {
    const markup = renderToStaticMarkup(<AIWorkItemActions {...baseProps} isProviderConfigured featureEnabled />);
    expect(markup).toContain("Draft");
    expect(markup).toContain("Simplify");
    expect(markup).toContain("Rewrite");
    expect(markup).toContain("Generate summary");
    expect(markup).toContain("Run agent");
  });

  it("hides AI description actions when provider unconfigured (renders nothing, not disabled)", () => {
    const markup = renderToStaticMarkup(
      <AIWorkItemActions {...baseProps} isProviderConfigured={false} featureEnabled />
    );
    expect(markup).toBe("");
  });

  it("hides AI actions when ai_copilot flag off", () => {
    const markup = renderToStaticMarkup(
      <AIWorkItemActions {...baseProps} isProviderConfigured featureEnabled={false} />
    );
    expect(markup).toBe("");
  });

  it("hides the summary button when provider unconfigured", () => {
    const markup = renderToStaticMarkup(
      <AIWorkItemActions {...baseProps} isProviderConfigured={false} featureEnabled />
    );
    expect(markup).not.toContain("Generate summary");
  });

  it("hides the agent-run action when provider unconfigured", () => {
    const markup = renderToStaticMarkup(
      <AIWorkItemActions {...baseProps} isProviderConfigured={false} featureEnabled />
    );
    expect(markup).not.toContain("Run agent");
  });
});

describe("AIWorkItemActions service helpers", () => {
  it("runDescribeAction returns the rewritten text on success", async () => {
    const service = {
      describeWorkItem: vi.fn().mockResolvedValue({ mode: "describe", action: "rewrite", text: "Cleaner copy" }),
    };
    const result = await runDescribeAction(service, "acme", "rewrite", "old copy");
    expect(service.describeWorkItem).toHaveBeenCalledWith("acme", "rewrite", "old copy");
    expect(result).toEqual({ status: "success", text: "Cleaner copy" });
  });

  it("runDescribeAction surfaces an error message on failure without throwing", async () => {
    const service = {
      describeWorkItem: vi.fn().mockRejectedValue({ data: { error: "ai_unavailable", message: "provider down" } }),
    };
    const result = await runDescribeAction(service, "acme", "draft", "");
    expect(result).toEqual({ status: "error", message: "provider down" });
  });

  it("runSummaryAction returns the summary on success", async () => {
    const service = {
      summarizeIssue: vi.fn().mockResolvedValue({ mode: "summarize_issue", summary: "On track.", evidence: [] }),
    };
    const result = await runSummaryAction(service, "acme", "project-1", "issue-1");
    expect(service.summarizeIssue).toHaveBeenCalledWith("acme", "Summarize this work item.", "project-1", "issue-1");
    expect(result).toEqual({ status: "success", summary: "On track." });
  });

  it("runAgentRunAction returns the queued run on success", async () => {
    const run = { id: "run-1", status: "queued" };
    const service = { requestAgentRun: vi.fn().mockResolvedValue(run) };
    const result = await runAgentRunAction(service, "acme", "project-1", "issue-1");
    expect(service.requestAgentRun).toHaveBeenCalledWith("acme", "project-1", "issue-1", "summarize_issue");
    expect(result).toEqual({ status: "success", run });
  });
});

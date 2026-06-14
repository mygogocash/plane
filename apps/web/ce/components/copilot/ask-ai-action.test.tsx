/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// local imports
import { AskAIAction, submitCopilotQuestion } from "./ask-ai-action";

const owner = {
  scope: "epic",
  workspaceSlug: "acme",
  objectId: "epic-1",
  title: "Mobile launch",
} as const;

const answer = {
  answer: "Mobile launch is on track with one risky dependency.",
  summary: "Progress is green, but beta access needs follow-up.",
  evidence: [
    {
      entity_type: "epic",
      entity_id: "epic-1",
      title: "Mobile launch",
      url: "/acme/projects/project-1/issues/epic-1",
      source_text: "On track",
    },
  ],
};

describe("AskAIAction", () => {
  it("submits a scoped question and renders answer + summary on success", async () => {
    const service = {
      query: vi.fn().mockResolvedValue(answer),
    };

    const result = await submitCopilotQuestion({
      owner,
      question: "Summarize progress",
      service,
    });
    const markup = renderToStaticMarkup(
      <AskAIAction owner={owner} service={service} initialQuestion="Summarize progress" initialResult={answer} />
    );

    expect(service.query).toHaveBeenCalledWith("acme", {
      scope: "epic",
      object_id: "epic-1",
      question: "Summarize progress",
    });
    expect(result).toMatchObject({ status: "success", result: answer });
    expect(markup).toContain("Ask AI");
    expect(markup).toContain("Mobile launch is on track");
    expect(markup).toContain("Progress is green");
  });

  it("renders a disabled 'configure AI provider' state when the endpoint returns 409", async () => {
    const service = {
      query: vi.fn().mockRejectedValue({
        status: 409,
        data: { error: "ai_provider_not_configured" },
      }),
    };

    const result = await submitCopilotQuestion({
      owner,
      question: "Summarize progress",
      service,
    });
    const markup = renderToStaticMarkup(<AskAIAction owner={owner} service={service} initialStatus="not_configured" />);

    expect(result).toMatchObject({ status: "not_configured" });
    expect(markup).toContain("Configure AI provider");
    expect(markup).toContain("disabled");
  });

  it("renders an 'AI unavailable' message (no crash) on 503 without blocking the view", async () => {
    const service = {
      query: vi.fn().mockRejectedValue({
        status: 503,
        data: { error: "ai_unavailable" },
      }),
    };

    const result = await submitCopilotQuestion({
      owner: { ...owner, scope: "initiative", objectId: "initiative-1" },
      question: "Summarize progress",
      service,
    });
    const markup = renderToStaticMarkup(<AskAIAction owner={owner} service={service} initialStatus="unavailable" />);

    expect(result).toMatchObject({ status: "unavailable" });
    expect(markup).toContain("Ask AI");
    expect(markup).toContain("AI unavailable");
  });
});

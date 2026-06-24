// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AIService } from "@/services/ai.service";
import { TriageReviewChips } from "../TriageReviewChips";
import {
  buildTriageApplyPayload,
  formatConfidence,
  isLowConfidence,
  shouldShowTriageChips,
  type TTriageSuggestion,
} from "../intake-triage.utils";

const suggestion: TTriageSuggestion = {
  id: "sg-1",
  intake_issue: "intake-1",
  suggested_labels: [
    { id: "lbl-1", name: "bug" },
    { id: "lbl-2", name: "frontend" },
  ],
  suggested_assignee: { id: "user-1", display_name: "Ada" },
  suggested_priority: "high",
  suggested_project: { id: "proj-1", name: "Web" },
  confidence: 0.82,
  status: "pending",
};

describe("triage gating", () => {
  it("requires intake + ai + provider", () => {
    expect(shouldShowTriageChips({ intakeEnabled: true, aiEnabled: true, isProviderConfigured: true })).toBe(true);
    expect(shouldShowTriageChips({ intakeEnabled: false, aiEnabled: true, isProviderConfigured: true })).toBe(false);
    expect(shouldShowTriageChips({ intakeEnabled: true, aiEnabled: false, isProviderConfigured: true })).toBe(false);
    expect(shouldShowTriageChips({ intakeEnabled: true, aiEnabled: true, isProviderConfigured: false })).toBe(false);
  });
});

describe("confidence helpers", () => {
  it("formats and flags low confidence", () => {
    expect(formatConfidence(0.82)).toBe("82%");
    expect(isLowConfidence(0.82)).toBe(false);
    expect(isLowConfidence(0.3)).toBe(true);
  });
});

describe("buildTriageApplyPayload", () => {
  it("omits untouched fields and keeps corrected ones", () => {
    expect(buildTriageApplyPayload({})).toEqual({});
    expect(buildTriageApplyPayload({ label_ids: ["lbl-1"], assignee_id: null })).toEqual({
      label_ids: ["lbl-1"],
      assignee_id: null,
    });
  });
});

describe("TriageReviewChips", () => {
  it("renders suggestion chips with confidence and apply/dismiss controls", () => {
    const markup = renderToStaticMarkup(
      <TriageReviewChips suggestion={suggestion} intakeEnabled aiEnabled isProviderConfigured />
    );

    expect(markup).toContain("triage-suggestion-sg-1");
    expect(markup).toContain("triage-label-lbl-1");
    expect(markup).toContain("bug");
    expect(markup).toContain("@Ada");
    expect(markup).toContain("triage-priority");
    expect(markup).toContain("triage-project");
    expect(markup).toContain("82%");
    expect(markup).toContain("triage-apply");
    expect(markup).toContain("triage-reject");
  });

  it("flags low-confidence suggestions", () => {
    const markup = renderToStaticMarkup(
      <TriageReviewChips suggestion={{ ...suggestion, confidence: 0.2 }} intakeEnabled aiEnabled isProviderConfigured />
    );
    expect(markup).toContain("low confidence");
  });

  it("shows a status instead of actions once applied", () => {
    const markup = renderToStaticMarkup(
      <TriageReviewChips
        suggestion={{ ...suggestion, status: "applied" }}
        intakeEnabled
        aiEnabled
        isProviderConfigured
      />
    );
    expect(markup).toContain("triage-status");
    expect(markup).toContain("Applied");
    expect(markup).not.toContain("triage-apply");
  });

  it("hidden when gating fails (intake off)", () => {
    const markup = renderToStaticMarkup(
      <TriageReviewChips suggestion={suggestion} intakeEnabled={false} aiEnabled isProviderConfigured />
    );
    expect(markup).toBe("");
  });
});

describe("AIService triage wiring (AI-T17)", () => {
  it("listTriageSuggestions GETs the intake triage route", async () => {
    const service = new AIService();
    const getSpy = vi.spyOn(service as any, "get").mockResolvedValue({ data: [suggestion] });

    await service.listTriageSuggestions("acme", "intake-1");
    expect(getSpy).toHaveBeenCalledWith("/api/workspaces/acme/intake/intake-1/triage-suggestions/");
  });

  it("applyTriageSuggestion POSTs corrections to the apply route", async () => {
    const service = new AIService();
    const postSpy = vi.spyOn(service as any, "post").mockResolvedValue({ data: suggestion });

    await service.applyTriageSuggestion("acme", "sg-1", { label_ids: ["lbl-1"] });
    expect(postSpy).toHaveBeenCalledWith("/api/workspaces/acme/intake/triage-suggestions/sg-1/apply/", {
      label_ids: ["lbl-1"],
    });
  });
});

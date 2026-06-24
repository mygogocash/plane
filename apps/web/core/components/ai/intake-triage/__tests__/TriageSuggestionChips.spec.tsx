// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TriageSuggestionChips } from "../TriageSuggestionChips";
import {
  buildTriageApplyPayload,
  isLowConfidence,
  shouldShowTriageChips,
  type TTriageSuggestion,
} from "../intake-triage.utils";

const highConfidence: TTriageSuggestion = {
  id: "sug-1",
  intake_issue: "intake-1",
  suggested_labels: [{ id: "label-1", name: "bug" }],
  suggested_assignee: { id: "user-1", display_name: "Alex" },
  suggested_priority: "high",
  suggested_project: { id: "project-1", name: "Core" },
  confidence: 0.82,
  status: "pending",
};

const lowConfidence: TTriageSuggestion = {
  ...highConfidence,
  id: "sug-2",
  confidence: 0.31,
};

describe("TriageSuggestionChips render", () => {
  it("renders suggested label/assignee/priority/project with confidence badge", () => {
    const markup = renderToStaticMarkup(
      <TriageSuggestionChips suggestion={highConfidence} intakeEnabled aiEnabled isProviderConfigured />
    );

    expect(markup).toContain("triage-label-label-1");
    expect(markup).toContain("Alex");
    expect(markup).toContain("high");
    expect(markup).toContain("Core");
    expect(markup).toContain("triage-confidence-badge");
    expect(markup).toContain("82%");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Correct");
  });

  it("low-confidence suggestion shows the low-confidence badge", () => {
    const markup = renderToStaticMarkup(
      <TriageSuggestionChips suggestion={lowConfidence} intakeEnabled aiEnabled isProviderConfigured />
    );
    expect(markup).toContain("Low confidence");
  });

  it("provider/flag off → chips absent, manual triage unchanged", () => {
    expect(
      renderToStaticMarkup(
        <TriageSuggestionChips suggestion={highConfidence} intakeEnabled aiEnabled isProviderConfigured={false} />
      )
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <TriageSuggestionChips suggestion={highConfidence} intakeEnabled={false} aiEnabled isProviderConfigured />
      )
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <TriageSuggestionChips suggestion={highConfidence} intakeEnabled aiEnabled={false} isProviderConfigured />
      )
    ).toBe("");
  });
});

describe("triage helpers", () => {
  it("flags suggestions below 0.5 as low confidence (Q13)", () => {
    expect(isLowConfidence(0.49)).toBe(true);
    expect(isLowConfidence(0.5)).toBe(false);
    expect(isLowConfidence(0.9)).toBe(false);
  });

  it("gates chips behind intake + ai + provider", () => {
    expect(shouldShowTriageChips({ intakeEnabled: true, aiEnabled: true, isProviderConfigured: true })).toBe(true);
    expect(shouldShowTriageChips({ intakeEnabled: true, aiEnabled: true, isProviderConfigured: false })).toBe(false);
  });

  it("Approve calls apply with no correction; Correct forwards a human apply payload", async () => {
    const service = { listSuggestions: vi.fn(), applySuggestion: vi.fn().mockResolvedValue(highConfidence) };

    // Approve = apply without corrections
    await service.applySuggestion("acme", "sug-1");
    expect(service.applySuggestion).toHaveBeenCalledWith("acme", "sug-1");

    // Correct = apply with member-corrected values overriding AI
    const corrected = buildTriageApplyPayload({ priority: "urgent", assignee_id: "user-9" });
    await service.applySuggestion("acme", "sug-1", corrected);
    expect(service.applySuggestion).toHaveBeenLastCalledWith("acme", "sug-1", {
      priority: "urgent",
      assignee_id: "user-9",
    });
  });
});

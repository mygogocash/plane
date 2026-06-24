// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DuplicateWarning,
  DUPLICATE_OVERRIDE_LABEL,
  DUPLICATE_WARNING_TITLE,
  isDuplicateSubmitBlocked,
  shouldShowDuplicateWarning,
} from "../DuplicateWarning";
import type { TSimilarIssue } from "@/types/similar-issue";

const candidate = (overrides: Partial<TSimilarIssue> = {}): TSimilarIssue => ({
  id: "issue-1",
  name: "Login dashboard crash",
  confidence: 0.91,
  matched_on: ["title"],
  is_high_confidence: true,
  ...overrides,
});

describe("DuplicateWarning", () => {
  it("renders score chips and matched_on for candidates", () => {
    const markup = renderToStaticMarkup(
      <DuplicateWarning
        candidates={[candidate(), candidate({ id: "issue-2", confidence: 0.42, matched_on: ["description"] })]}
        acknowledgedOverride={false}
        onAcknowledgedOverrideChange={vi.fn()}
        threshold={0.65}
      />
    );

    expect(markup).toContain(DUPLICATE_WARNING_TITLE);
    expect(markup).toContain("91%");
    expect(markup).toContain("Matched on title");
    expect(markup).toContain("42%");
    expect(markup).toContain("Matched on description");
  });

  it("high_confidence at/above threshold blocks submit until Create anyway", () => {
    const blockedMarkup = renderToStaticMarkup(
      <DuplicateWarning
        candidates={[candidate()]}
        highConfidence
        acknowledgedOverride={false}
        onAcknowledgedOverrideChange={vi.fn()}
      />
    );
    const allowedMarkup = renderToStaticMarkup(
      <DuplicateWarning
        candidates={[candidate()]}
        highConfidence
        acknowledgedOverride
        onAcknowledgedOverrideChange={vi.fn()}
      />
    );

    expect(isDuplicateSubmitBlocked(true, false)).toBe(true);
    expect(isDuplicateSubmitBlocked(true, true)).toBe(false);
    expect(blockedMarkup).toContain('data-submit-blocked="true"');
    expect(blockedMarkup).toContain(DUPLICATE_OVERRIDE_LABEL);
    expect(allowedMarkup).toContain('data-submit-blocked="false"');
  });

  it("low_confidence shows suggestions but does not block submit", () => {
    const markup = renderToStaticMarkup(
      <DuplicateWarning
        candidates={[candidate({ confidence: 0.42, is_high_confidence: false })]}
        highConfidence={false}
        acknowledgedOverride={false}
        onAcknowledgedOverrideChange={vi.fn()}
      />
    );

    expect(markup).toContain("42%");
    expect(markup).not.toContain(DUPLICATE_OVERRIDE_LABEL);
    expect(isDuplicateSubmitBlocked(false, false)).toBe(false);
  });

  it("empty candidates renders nothing and never blocks", () => {
    const markup = renderToStaticMarkup(
      <DuplicateWarning candidates={[]} acknowledgedOverride={false} onAcknowledgedOverrideChange={vi.fn()} />
    );

    expect(markup).toBe("");
    expect(shouldShowDuplicateWarning({ featureEnabled: true, candidates: [] })).toBe(false);
  });

  it("ai_copilot off or provider missing → no duplicate UI, manual create works", () => {
    const disabledFeatureMarkup = renderToStaticMarkup(
      <DuplicateWarning
        candidates={[candidate()]}
        featureEnabled={false}
        acknowledgedOverride={false}
        onAcknowledgedOverrideChange={vi.fn()}
      />
    );
    const missingProviderMarkup = renderToStaticMarkup(
      <DuplicateWarning
        candidates={[candidate()]}
        isProviderConfigured={false}
        acknowledgedOverride={false}
        onAcknowledgedOverrideChange={vi.fn()}
      />
    );

    expect(disabledFeatureMarkup).toBe("");
    expect(missingProviderMarkup).toBe("");
    expect(shouldShowDuplicateWarning({ featureEnabled: false, candidates: [candidate()] })).toBe(false);
    expect(
      shouldShowDuplicateWarning({ featureEnabled: true, isProviderConfigured: false, candidates: [candidate()] })
    ).toBe(false);
  });
});

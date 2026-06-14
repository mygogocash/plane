/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecurringWorkItemModalSection } from "./recurrence-section";

const { entitlement, issueModalRef } = vi.hoisted(() => ({
  entitlement: {
    recurringWorkItemsEnabled: true,
  },
  issueModalRef: {
    current: undefined as unknown,
  },
}));

vi.mock("@/hooks/context/use-issue-modal", () => ({
  useIssueModal: () => issueModalRef.current,
}));

vi.mock("@/plane-web/lib/self-host-entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/plane-web/lib/self-host-entitlements")>();
  type FeatureFlag = Parameters<typeof actual.isSelfHostedFeatureEnabled>[0];

  return {
    ...actual,
    isSelfHostedFeatureEnabled: (feature: FeatureFlag) =>
      feature === "recurring_work_items"
        ? entitlement.recurringWorkItemsEnabled
        : actual.isSelfHostedFeatureEnabled(feature),
  };
});

describe("RecurringWorkItemModalSection", () => {
  beforeEach(() => {
    entitlement.recurringWorkItemsEnabled = true;
    issueModalRef.current = {
      recurrenceDraft: {
        enabled: true,
        frequency: "daily",
        timezone: "UTC",
        start_date: "2026-06-14T00:00",
        end_date: "",
        max_iterations: 5,
      },
      setRecurrenceDraft: vi.fn(),
      recurrenceRuns: [],
    };
  });

  it("renders an empty self-host recurrence runs state when enabled with zero runs", () => {
    const markup = renderToStaticMarkup(<RecurringWorkItemModalSection />);

    expect(markup).toContain("Repeat");
    expect(markup).toContain("Frequency");
    expect(markup).toContain("Self-hosted");
    expect(markup).toContain("no recurrence runs yet");
  });

  it("hides when the recurring work items feature flag is off", () => {
    entitlement.recurringWorkItemsEnabled = false;

    const markup = renderToStaticMarkup(<RecurringWorkItemModalSection />);

    expect(markup).toBe("");
  });
});

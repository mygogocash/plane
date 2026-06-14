/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
// local imports
import {
  SELF_HOSTED_FEATURE_FLAGS,
  SELF_HOSTED_PAID_FEATURES_ENABLED,
  SELF_HOSTED_PLAN_DESCRIPTION,
  SELF_HOSTED_PLAN_LABEL,
  isSelfHostedFeatureEnabled,
} from "./self-host-entitlements";

describe("self-host entitlements", () => {
  it("enables paid feature gates for this self-hosted instance", () => {
    expect(SELF_HOSTED_PAID_FEATURES_ENABLED).toBe(true);
    expect(SELF_HOSTED_PLAN_LABEL).toBe("Self-hosted");
    expect(SELF_HOSTED_PLAN_DESCRIPTION).toContain("Available CE features");
  });

  it("enables every shipped self-host feature family", () => {
    const enabledFeatureFamilies = [
      "active_cycles",
      "ai_copilot",
      "analytics",
      "audit_logs",
      "bulk_operations",
      "dashboards",
      "epics",
      "estimates_time",
      "intake",
      "integrations",
      "public_views_pages",
      "recurring_work_items",
      "teamspaces",
      "templates",
      "work_item_types",
      "workflows_approvals",
      "worklogs_time_tracking",
    ] as const;
    const disabledFeatureFamilies = ["initiatives"] as const;

    const configuredFeatures = new Set(Object.keys(SELF_HOSTED_FEATURE_FLAGS));

    expect(configuredFeatures.size).toBe(enabledFeatureFamilies.length + disabledFeatureFamilies.length);
    expect(enabledFeatureFamilies.every((feature) => configuredFeatures.has(feature))).toBe(true);
    expect(disabledFeatureFamilies.every((feature) => configuredFeatures.has(feature))).toBe(true);
    expect(enabledFeatureFamilies.every((feature) => isSelfHostedFeatureEnabled(feature))).toBe(true);
  });

  it("enables epics while initiatives remains disabled", () => {
    expect(SELF_HOSTED_FEATURE_FLAGS.epics).toBe(true);
    expect(SELF_HOSTED_FEATURE_FLAGS.initiatives).toBe(false);
    expect(isSelfHostedFeatureEnabled("epics")).toBe(true);
    expect(isSelfHostedFeatureEnabled("initiatives")).toBe(false);
  });
});

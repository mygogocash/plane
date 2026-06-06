/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
// local imports
import {
  SELF_HOSTED_PAID_FEATURES_ENABLED,
  SELF_HOSTED_PLAN_DESCRIPTION,
  SELF_HOSTED_PLAN_LABEL,
} from "./self-host-entitlements";

describe("self-host entitlements", () => {
  it("enables paid feature gates for this self-hosted instance", () => {
    expect(SELF_HOSTED_PAID_FEATURES_ENABLED).toBe(true);
    expect(SELF_HOSTED_PLAN_LABEL).toBe("Self-hosted");
    expect(SELF_HOSTED_PLAN_DESCRIPTION).toContain("Available CE features");
  });
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

describe("live shadow validation tool", () => {
  it("builds a unique lock key for each validation run", async () => {
    const { buildLockKey } = await import("../tools/live-shadow-validation.mjs");

    const first = buildLockKey();
    const second = buildLockKey();

    expect(first).toMatch(/^phase-07-shadow-/);
    expect(second).toMatch(/^phase-07-shadow-/);
    expect(first).not.toBe(second);
  });

  it("uses the same encoded lock key across acquire, conflict, and release checks", async () => {
    const { buildLockChecks } = await import("../tools/live-shadow-validation.mjs");

    const checks = buildLockChecks("phase 07/key");

    expect(checks.map((check: { id: string }) => check.id)).toEqual([
      "live-room-lock-acquire",
      "live-room-lock-conflict",
      "live-room-lock-release",
    ]);
    expect(checks.map((check: { path: string }) => check.path)).toEqual([
      "/locks/phase%2007%2Fkey/acquire",
      "/locks/phase%2007%2Fkey/acquire",
      "/locks/phase%2007%2Fkey/release",
    ]);
  });
});

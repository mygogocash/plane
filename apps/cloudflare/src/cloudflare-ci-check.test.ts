/*
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from "vitest";

import { parseReadinessJson, validateReadinessReport } from "../tools/cloudflare-ci-check.mjs";

function readinessReport(overrides: Record<string, unknown> = {}) {
  return {
    generated_at: "2026-06-24T12:00:00.000Z",
    selected_phase: "phase-07",
    status: "blocked",
    phase7_cutover_ready: false,
    phase8_decommission_ready: false,
    summary: {
      total: 2,
      passed: 1,
      blocked: 1,
    },
    checks: [
      {
        id: "phase-06-cicd",
        label: "Phase 6 Cloudflare CI/CD evidence",
        phase: "phase-06",
        status: "pass",
      },
      {
        id: "authenticated-smoke",
        label: "Authenticated production smoke",
        phase: "phase-07",
        status: "blocked",
      },
    ],
    ...overrides,
  };
}

describe("Cloudflare CI readiness wrapper", () => {
  it("parses readiness JSON emitted by the cutover gate", () => {
    expect(parseReadinessJson(JSON.stringify(readinessReport()))).toMatchObject({
      status: "blocked",
      summary: {
        total: 2,
      },
    });
  });

  it("fails closed when readiness output is not JSON", () => {
    expect(() => parseReadinessJson("Cutover readiness: blocked")).toThrow(/valid JSON/);
  });

  it("accepts the expected blocked readiness state", () => {
    expect(validateReadinessReport(readinessReport())).toEqual({
      status: "blocked",
      total: 2,
      passed: 1,
      blocked: 1,
      blockedChecks: ["authenticated-smoke"],
    });
  });

  it("rejects a false green report with blocked checks", () => {
    expect(() =>
      validateReadinessReport(
        readinessReport({
          status: "pass",
        })
      )
    ).toThrow(/reports pass while blocked checks remain/);
  });

  it("rejects inconsistent readiness summary counts", () => {
    expect(() =>
      validateReadinessReport(
        readinessReport({
          summary: {
            total: 2,
            passed: 2,
            blocked: 1,
          },
        })
      )
    ).toThrow(/counts must add up/);
  });

  it("rejects Phase 7 readiness while Phase 7 checks are blocked", () => {
    expect(() =>
      validateReadinessReport(
        readinessReport({
          phase7_cutover_ready: true,
        })
      )
    ).toThrow(/Phase 7 ready while Phase 7 checks are blocked/);
  });
});

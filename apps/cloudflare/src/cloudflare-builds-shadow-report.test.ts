/*
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from "vitest";

import {
  buildCloudflareBuildsShadowReport,
  buildTemplate,
  validateCloudflareBuildsShadowInput,
} from "../tools/cloudflare-builds-shadow-report.mjs";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    ...buildTemplate(),
    generated_at: "2026-06-24T12:40:00.000Z",
    run: {
      ...buildTemplate().run,
      build_url:
        "https://dash.cloudflare.com/187ab61ed9dbc6e616cb23e6b95aa8f1/workers/services/view/manut-app/production/builds/build-uuid",
      github_check_url: "https://github.com/mygogocash/plane/actions/runs/28000000000",
      commit_sha: "04dcbfbb7",
    },
    ...overrides,
  };
}

describe("Cloudflare Builds shadow report", () => {
  it("accepts a valid non-production shadow build with blocked readiness", () => {
    expect(validateCloudflareBuildsShadowInput(validInput())).toMatchObject({
      ok: true,
      errors: [],
      readiness: {
        total: 19,
        passed: 14,
        blocked: 5,
      },
    });
  });

  it("rejects non-production builds that changed production traffic", () => {
    const input = validInput({
      run: {
        ...validInput().run,
        production_traffic_changed: true,
      },
    });

    expect(validateCloudflareBuildsShadowInput(input)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["non_production_traffic_changed"]),
    });
  });

  it("rejects production branch builds without explicit deploy review", () => {
    const input = validInput({
      run: {
        ...validInput().run,
        branch: "preview",
        is_production_branch: true,
        deploy_command: "pnpm --filter @manut/cloudflare deploy:production",
        production_deploy_reviewed: false,
      },
    });

    expect(validateCloudflareBuildsShadowInput(input)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["production_deploy_not_reviewed"]),
    });
  });

  it("rejects false-green readiness evidence", () => {
    const input = validInput({
      readiness: {
        status: "pass",
        summary: {
          total: 19,
          passed: 14,
          blocked: 5,
        },
        blocked_checks: [
          "d1-import-validation",
          "authenticated-smoke",
          "betterstack-cutover-green",
          "operator-cutover-approval",
          "phase8-seven-green-days",
        ],
      },
    });

    expect(validateCloudflareBuildsShadowInput(input)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["readiness_false_green"]),
    });
  });

  it("builds a report that does not authorize GCP cutoff", () => {
    expect(buildCloudflareBuildsShadowReport(validInput())).toMatchObject({
      ok: true,
      conclusion: expect.stringContaining("does not authorize GCP cutoff"),
    });
  });
});

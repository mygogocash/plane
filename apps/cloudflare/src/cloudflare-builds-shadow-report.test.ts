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
      build_command_observed: true,
      deploy_command_observed: true,
      github_check_conclusion: "success",
      worker_version_id: "703b72f7-d075-4dc2-96aa-95d42fea5d0c",
      active_production_version_id_after: "f9aff236-d7b8-44a2-8d1f-d51bc67ad82b",
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

  it("rejects non-production evidence when the uploaded version is active in production", () => {
    const input = validInput({
      run: {
        ...validInput().run,
        active_production_version_id_after: "703b72f7-d075-4dc2-96aa-95d42fea5d0c",
      },
    });

    expect(validateCloudflareBuildsShadowInput(input)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["non_production_version_is_active"]),
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

  it("rejects evidence when Cloudflare build commands were not observed", () => {
    const input = validInput({
      run: {
        ...validInput().run,
        build_command_observed: false,
        deploy_command_observed: false,
      },
    });

    expect(validateCloudflareBuildsShadowInput(input)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["build_command_not_observed", "deploy_command_not_observed"]),
    });
  });

  it("rejects evidence when the GitHub check is not successful", () => {
    const input = validInput({
      run: {
        ...validInput().run,
        github_check_conclusion: "failure",
      },
    });

    expect(validateCloudflareBuildsShadowInput(input)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["github_check_not_successful"]),
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

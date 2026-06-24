// Copyright 2023-present Plane Authors. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";

import {
  buildRetirementReadinessReport,
  evaluateCommandObservation,
} from "../tools/github-actions-retirement-readiness.mjs";

const buildsEvidence = {
  run: {
    build_url: "https://dash.cloudflare.com/account/workers/services/view/manut-app/production/builds/build-uuid",
    github_check_url: "https://github.com/mygogocash/plane/runs/83199924061",
    worker_version_id: "703b72f7-d075-4dc2-96aa-95d42fea5d0c",
    active_production_version_id_after: "f9aff236-d7b8-44a2-8d1f-d51bc67ad82b",
  },
};

const blockedReadiness = {
  status: "blocked",
  summary: {
    total: 19,
    passed: 14,
    blocked: 5,
  },
  checks: [
    { id: "d1-import-validation", status: "blocked" },
    { id: "authenticated-smoke", status: "blocked" },
  ],
};

const passedReadiness = {
  status: "passed",
  summary: {
    total: 19,
    passed: 19,
    blocked: 0,
  },
  checks: [{ id: "phase-07", status: "passed" }],
};

const commandObservation = {
  ok: true,
  source: "cloudflare-dashboard",
  build_command: "pnpm --filter @manut/cloudflare deploy:build",
  deploy_command: "pnpm --filter @manut/cloudflare deploy:worker",
  observed_at: "2026-06-24T13:00:00.000Z",
};

describe("GitHub Actions retirement readiness", () => {
  it("blocks retirement when Builds command observation is missing", () => {
    const report = buildRetirementReadinessReport({
      readiness: passedReadiness,
      buildsEvidence,
      commandObservation: null,
      commandBlockerExists: true,
      generatedAt: "2026-06-24T13:00:00.000Z",
    });

    expect(report.ok).toBe(false);
    expect(report.github_actions_retirement_allowed).toBe(false);
    expect(report.blocked_reasons).toContain("cloudflare-builds-command-observation");
    expect(report.forbidden_actions).toContain("Disable GitHub Actions workflows.");
    expect(report.workflows_to_keep_enabled_until_ready).toContain(".github/workflows/ci-cd.yml");
  });

  it("blocks retirement while Phase 7 cutover readiness is blocked", () => {
    const report = buildRetirementReadinessReport({
      readiness: blockedReadiness,
      buildsEvidence,
      commandObservation,
      generatedAt: "2026-06-24T13:00:00.000Z",
    });

    expect(report.ok).toBe(false);
    expect(report.blocked_reasons).toContain("phase-7-cutover-readiness");
    expect(report.checks.find((check) => check.id === "phase-7-cutover-readiness")).toMatchObject({
      passed: 14,
      total: 19,
      blocked: 5,
      blocked_checks: ["d1-import-validation", "authenticated-smoke"],
    });
  });

  it("rejects incomplete command observations", () => {
    const check = evaluateCommandObservation(
      {
        ok: true,
        source: "cloudflare-dashboard",
        build_command: "pnpm build",
      },
      false
    );

    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(["deploy_command", "observed_at"]);
  });

  it("allows retirement only when Builds commands and Phase 7 readiness are green", () => {
    const report = buildRetirementReadinessReport({
      readiness: passedReadiness,
      buildsEvidence,
      commandObservation,
      generatedAt: "2026-06-24T13:00:00.000Z",
    });

    expect(report.ok).toBe(true);
    expect(report.github_actions_retirement_allowed).toBe(true);
    expect(report.blocked_reasons).toEqual([]);
    expect(report.forbidden_actions).toEqual([]);
    expect(report.workflows_to_keep_enabled_until_ready).toEqual([]);
  });
});

#!/usr/bin/env node

// Copyright 2023-present Plane Authors. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { findRepoRoot } from "./path-utils.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = findRepoRoot(SCRIPT_DIR);

export const DEFAULT_PATHS = {
  buildsEvidence: "process/features/cloudflare-stack-migration/reports/cloudflare-builds-shadow-evidence_24-06-26.json",
  commandObservation:
    "process/features/cloudflare-stack-migration/reports/cloudflare-builds-command-observation_24-06-26.json",
  commandBlocker:
    "process/features/cloudflare-stack-migration/reports/cloudflare-builds-command-observation-blocker_24-06-26.md",
};

const GITHUB_ACTIONS_WORKFLOWS_TO_KEEP_UNTIL_REPLACED = [
  ".github/workflows/ci-cd.yml",
  ".github/workflows/cloudflare-ci-cd.yml",
  ".github/workflows/betterstack-monitoring.yml",
  ".github/workflows/build-branch.yml",
  ".github/workflows/feature-deployment.yml",
  ".github/workflows/pull-request-build-lint-api.yml",
  ".github/workflows/pull-request-build-lint-web-apps.yml",
  ".github/workflows/check-version.yml",
  ".github/workflows/copyright-check.yml",
  ".github/workflows/i18n-sync-check.yml",
];

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveRepoPath(path) {
  return resolve(REPO_ROOT, path);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildCheck(id, ok, details = {}) {
  return {
    id,
    ok,
    status: ok ? "passed" : "blocked",
    ...details,
  };
}

export function evaluateBuildsShadowEvidence(buildsEvidence) {
  const missing = [];
  const run = buildsEvidence?.run ?? {};

  if (!hasText(run.build_url)) missing.push("run.build_url");
  if (!hasText(run.github_check_url)) missing.push("run.github_check_url");
  if (!hasText(run.worker_version_id)) missing.push("run.worker_version_id");
  if (!hasText(run.active_production_version_id_after)) {
    missing.push("run.active_production_version_id_after");
  }

  return buildCheck("cloudflare-builds-shadow-evidence", missing.length === 0, {
    evidence_path: DEFAULT_PATHS.buildsEvidence,
    missing,
    build_url: run.build_url ?? null,
    github_check_url: run.github_check_url ?? null,
  });
}

export function evaluateCommandObservation(commandObservation, commandBlockerExists = false) {
  const missing = [];

  if (commandObservation?.ok !== true) missing.push("ok:true");
  if (!hasText(commandObservation?.source)) missing.push("source");
  if (!hasText(commandObservation?.build_command)) missing.push("build_command");
  if (!hasText(commandObservation?.deploy_command)) missing.push("deploy_command");
  if (!hasText(commandObservation?.observed_at)) missing.push("observed_at");

  return buildCheck("cloudflare-builds-command-observation", missing.length === 0, {
    evidence_path: DEFAULT_PATHS.commandObservation,
    blocker_path: commandBlockerExists ? DEFAULT_PATHS.commandBlocker : null,
    missing,
  });
}

export function evaluatePhase7Readiness(readiness) {
  const status = readiness?.status ?? "missing";
  const summary = readiness?.summary ?? {};
  const blockedChecks =
    readiness?.checks
      ?.filter((check) => check.status !== "passed")
      .map((check) => check.id)
      .filter(Boolean) ?? [];

  const ok =
    status === "passed" &&
    Number(summary.blocked ?? 1) === 0 &&
    Number(summary.passed ?? 0) === Number(summary.total ?? -1);

  return buildCheck("phase-7-cutover-readiness", ok, {
    status,
    passed: summary.passed ?? null,
    total: summary.total ?? null,
    blocked: summary.blocked ?? null,
    blocked_checks: blockedChecks,
  });
}

export function buildRetirementReadinessReport({
  readiness,
  buildsEvidence,
  commandObservation = null,
  commandBlockerExists = false,
  generatedAt = new Date().toISOString(),
} = {}) {
  const checks = [
    evaluateBuildsShadowEvidence(buildsEvidence),
    evaluateCommandObservation(commandObservation, commandBlockerExists),
    evaluatePhase7Readiness(readiness),
  ];
  const blockedReasons = checks.filter((check) => !check.ok).map((check) => check.id);
  const ok = blockedReasons.length === 0;

  return {
    generated_at: generatedAt,
    ok,
    status: ok ? "ready" : "blocked",
    checks,
    blocked_reasons: blockedReasons,
    github_actions_retirement_allowed: ok,
    allowed_actions: ok
      ? [
          "Open a dedicated PR that disables or removes superseded GitHub Actions workflows.",
          "Update branch protection after Cloudflare Builds is the active required deployment gate.",
        ]
      : [
          "Keep GitHub Actions workflows enabled.",
          "Continue Cloudflare Builds shadow validation.",
          "Collect missing operator evidence.",
        ],
    forbidden_actions: ok
      ? []
      : [
          "Disable GitHub Actions workflows.",
          "Remove GitHub Actions required checks from protected branches.",
          "Cut off or decommission GCP-backed production paths.",
        ],
    workflows_to_keep_enabled_until_ready: ok ? [] : GITHUB_ACTIONS_WORKFLOWS_TO_KEEP_UNTIL_REPLACED,
    required_operator_inputs: ok
      ? []
      : [
          "Cloudflare Builds Build command observation.",
          "Cloudflare Builds Deploy command observation.",
          "Phase 7 cutover readiness green evidence.",
          "Explicit operator approval before workflow retirement.",
        ],
  };
}

function parseArgs(argv) {
  const args = {
    buildsEvidence: DEFAULT_PATHS.buildsEvidence,
    commandObservation: DEFAULT_PATHS.commandObservation,
    commandBlocker: DEFAULT_PATHS.commandBlocker,
    readiness: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--builds-evidence") args.buildsEvidence = argv[++index];
    else if (arg === "--command-observation") args.commandObservation = argv[++index];
    else if (arg === "--command-blocker") args.commandBlocker = argv[++index];
    else if (arg === "--readiness") args.readiness = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else if (arg === "--help") {
      console.log(`Usage: pnpm --filter @manut/cloudflare github-actions:retirement-readiness [--output path]

Options:
  --readiness path             Read cutover readiness JSON from a file.
  --builds-evidence path       Cloudflare Builds shadow evidence JSON.
  --command-observation path   Positive Build/Deploy command observation JSON.
  --command-blocker path       Markdown blocker report used when command evidence is absent.
  --output path                Write the readiness report to a JSON file.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function collectReadiness(readinessPath) {
  if (readinessPath) return readJsonFile(resolveRepoPath(readinessPath));

  const cutoverTool = resolve(SCRIPT_DIR, "cutover-readiness.mjs");
  const result = spawnSync(process.execPath, [cutoverTool, "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const stdout = result.stdout.trim();

  if (!stdout) {
    throw new Error(result.stderr.trim() || "cutover readiness emitted no JSON");
  }

  return JSON.parse(stdout);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const buildsEvidence = readJsonFile(resolveRepoPath(args.buildsEvidence));
  const commandObservationPath = resolveRepoPath(args.commandObservation);
  const commandBlockerPath = resolveRepoPath(args.commandBlocker);
  const commandObservation = existsSync(commandObservationPath) ? readJsonFile(commandObservationPath) : null;
  const report = buildRetirementReadinessReport({
    readiness: collectReadiness(args.readiness),
    buildsEvidence,
    commandObservation,
    commandBlockerExists: existsSync(commandBlockerPath),
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (args.output) {
    writeFileSync(resolveRepoPath(args.output), output);
  } else {
    process.stdout.write(output);
  }

  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

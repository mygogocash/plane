#!/usr/bin/env node

/*
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

const QUALITY_COMMANDS = [
  {
    label: "format",
    command: "pnpm",
    args: [
      "exec",
      "oxfmt",
      "--check",
      "apps/cloudflare",
      ".github/workflows/cloudflare-ci-cd.yml",
      "process/features/cloudflare-stack-migration",
    ],
  },
  {
    label: "lint",
    command: "pnpm",
    args: ["exec", "oxlint", "apps/cloudflare"],
  },
  {
    label: "typecheck",
    command: "pnpm",
    args: ["--filter", "@manut/cloudflare", "check"],
  },
  {
    label: "test",
    command: "pnpm",
    args: ["--filter", "@manut/cloudflare", "test"],
  },
];

const READINESS_COMMAND = {
  label: "cutover-readiness",
  command: "pnpm",
  args: ["--silent", "--filter", "@manut/cloudflare", "cutover:readiness", "--", "--json"],
};

function commandString({ command, args }) {
  return [command, ...args].join(" ");
}

function assertNumber(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Readiness JSON field ${field} must be a non-negative integer.`);
  }
}

export function parseReadinessJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Readiness command did not emit valid JSON: ${error.message}`, { cause: error });
  }
}

export function validateReadinessReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Readiness JSON must be an object.");
  }

  if (!["pass", "blocked"].includes(report.status)) {
    throw new Error(`Readiness JSON has unsupported status: ${String(report.status)}`);
  }

  if (!report.summary || typeof report.summary !== "object" || Array.isArray(report.summary)) {
    throw new Error("Readiness JSON must include a summary object.");
  }

  assertNumber(report.summary.total, "summary.total");
  assertNumber(report.summary.passed, "summary.passed");
  assertNumber(report.summary.blocked, "summary.blocked");

  if (report.summary.passed + report.summary.blocked !== report.summary.total) {
    throw new Error("Readiness summary counts must add up to summary.total.");
  }

  if (!Array.isArray(report.checks)) {
    throw new Error("Readiness JSON must include a checks array.");
  }

  const blockedChecks = report.checks.filter((check) => check?.status === "blocked");
  const failedChecks = report.checks.filter((check) => !["pass", "blocked"].includes(check?.status));

  if (failedChecks.length > 0) {
    const ids = failedChecks.map((check) => check?.id ?? "<unknown>").join(", ");
    throw new Error(`Readiness JSON contains unsupported check statuses: ${ids}`);
  }

  if (blockedChecks.length !== report.summary.blocked) {
    throw new Error("Readiness summary.blocked must match blocked checks.");
  }

  if (report.status === "pass" && report.summary.blocked > 0) {
    throw new Error("Readiness JSON reports pass while blocked checks remain.");
  }

  if (report.status === "blocked" && report.summary.blocked === 0) {
    throw new Error("Readiness JSON reports blocked without blocked checks.");
  }

  const blockedPhase7 = blockedChecks.some((check) => check.phase === "phase-07");
  const blockedPhase8 = blockedChecks.some((check) => check.phase === "phase-08");

  if (report.phase7_cutover_ready === true && blockedPhase7) {
    throw new Error("Readiness JSON reports Phase 7 ready while Phase 7 checks are blocked.");
  }

  if (report.phase8_decommission_ready === true && (blockedPhase8 || report.phase7_cutover_ready !== true)) {
    throw new Error(
      "Readiness JSON reports Phase 8 ready before Phase 7 is ready or while Phase 8 checks are blocked."
    );
  }

  return {
    status: report.status,
    total: report.summary.total,
    passed: report.summary.passed,
    blocked: report.summary.blocked,
    blockedChecks: blockedChecks.map((check) => check.id),
  };
}

function runCommand(step, options = {}) {
  console.log(`\n[cloudflare-ci] ${step.label}: ${commandString(step)}`);
  const result = spawnSync(step.command, step.args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: options.captureStdout ? ["ignore", "pipe", "inherit"] : "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !options.allowNonZero) {
    throw new Error(`${step.label} failed with exit code ${result.status}.`);
  }

  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
  };
}

export function runCloudflareCi() {
  for (const step of QUALITY_COMMANDS) {
    runCommand(step);
  }

  const readinessResult = runCommand(READINESS_COMMAND, { captureStdout: true, allowNonZero: true });
  const readiness = validateReadinessReport(parseReadinessJson(readinessResult.stdout));

  if (readinessResult.status !== 0 && readiness.status !== "blocked") {
    throw new Error(`cutover-readiness exited ${readinessResult.status} without a blocked readiness report.`);
  }

  console.log(
    `[cloudflare-ci] readiness: ${readiness.status} (${readiness.passed}/${readiness.total} passed, ${readiness.blocked} blocked)`
  );

  if (readiness.blockedChecks.length > 0) {
    console.log(`[cloudflare-ci] blocked checks: ${readiness.blockedChecks.join(", ")}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runCloudflareCi();
  } catch (error) {
    console.error(`[cloudflare-ci] failed: ${error.message}`);
    process.exit(1);
  }
}

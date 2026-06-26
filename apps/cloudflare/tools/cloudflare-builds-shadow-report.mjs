#!/usr/bin/env node

/*
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from "node:fs";

import { resolveRepoPath } from "./path-utils.mjs";

const TEMPLATE_KIND = "cloudflare-builds-shadow-input";
const ACCEPTED_BUILD_COMMANDS = new Set([
  "pnpm --filter @manut/cloudflare ci:cloudflare",
  "pnpm --dir ../.. --filter @manut/cloudflare ci:cloudflare",
  "pnpm --filter @manut/cloudflare deploy:build",
  "pnpm --dir ../.. --filter @manut/cloudflare deploy:build",
]);
const ACCEPTED_PRODUCTION_DEPLOY_COMMANDS = new Set([
  "pnpm --filter @manut/cloudflare deploy:production",
  "pnpm --dir ../.. --filter @manut/cloudflare deploy:production",
  "pnpm --filter @manut/cloudflare deploy:worker",
  "pnpm --dir ../.. --filter @manut/cloudflare deploy:worker",
]);
const ACCEPTED_PREVIEW_DEPLOY_COMMANDS = new Set([
  "pnpm --filter @manut/cloudflare exec wrangler versions upload --env production",
  "pnpm --dir ../.. --filter @manut/cloudflare exec wrangler versions upload --env production",
]);

function usage() {
  return `Usage: node apps/cloudflare/tools/cloudflare-builds-shadow-report.mjs [--input report-input.json] [--out report.json] [--json] [--template]

Validates operator-provided Cloudflare Workers Builds shadow-mode evidence.
This tool does not call Cloudflare APIs or mutate external systems.`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseArgs(argv) {
  const options = {
    inputPath: process.env.CLOUDFLARE_BUILDS_SHADOW_INPUT || null,
    outPath: null,
    json: false,
    template: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      options.inputPath = argv[++index];
    } else if (arg === "--out") {
      options.outPath = argv[++index];
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--template") {
      options.template = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseJsonFile(filePath) {
  const resolvedPath = resolveRepoPath(filePath);
  try {
    return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON input at ${resolvedPath}: ${error.message}`, { cause: error });
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(resolveRepoPath(filePath), `${JSON.stringify(value, null, 2)}\n`);
}

function validHttpsUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function validCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{7,40}$/i.test(value);
}

function validUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function validNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateReadiness(readiness, errors) {
  if (!isRecord(readiness)) {
    errors.push("readiness_missing");
    return null;
  }

  const summary = readiness.summary;
  if (!["pass", "blocked"].includes(readiness.status)) {
    errors.push("readiness_status_invalid");
  }

  if (!isRecord(summary)) {
    errors.push("readiness_summary_missing");
    return null;
  }

  const total = summary.total;
  const passed = summary.passed;
  const blocked = summary.blocked;
  if (![total, passed, blocked].every((value) => Number.isInteger(value) && value >= 0)) {
    errors.push("readiness_summary_counts_invalid");
    return null;
  }

  if (passed + blocked !== total) {
    errors.push("readiness_summary_counts_mismatch");
  }

  if (!Array.isArray(readiness.blocked_checks)) {
    errors.push("readiness_blocked_checks_missing");
  } else if (readiness.blocked_checks.length !== blocked) {
    errors.push("readiness_blocked_checks_count_mismatch");
  }

  if (readiness.status === "pass" && blocked > 0) {
    errors.push("readiness_false_green");
  }

  return { total, passed, blocked };
}

export function buildTemplate() {
  return {
    kind: TEMPLATE_KIND,
    generated_at: new Date().toISOString(),
    worker_name: "manut-app",
    repository: "mygogocash/plane",
    production_branch: "preview",
    root_directory: ".",
    package_manager: "pnpm",
    run: {
      build_url: "https://dash.cloudflare.com/<account>/workers/services/view/manut-app/production/builds/<build_uuid>",
      github_check_url: "https://github.com/mygogocash/plane/actions/runs/<run_id>",
      branch: "codex/cloudflare-cutoff-gates",
      commit_sha: "<commit-sha>",
      build_command: "pnpm --filter @manut/cloudflare deploy:build",
      build_command_observed: false,
      deploy_command: "pnpm --filter @manut/cloudflare exec wrangler versions upload --env production",
      deploy_command_observed: false,
      github_check_conclusion: "success",
      is_production_branch: false,
      worker_version_uploaded: true,
      worker_version_id: "<worker-version-id>",
      active_production_version_id_after: "<active-production-version-id>",
      production_traffic_changed: false,
      production_deploy_reviewed: false,
    },
    readiness: {
      status: "blocked",
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
    notes:
      "Fill this with the first real Cloudflare Workers Builds shadow run. Do not use public probes as authenticated smoke evidence.",
  };
}

export function validateCloudflareBuildsShadowInput(input) {
  const errors = [];
  const warnings = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["input_not_object"],
      warnings,
    };
  }

  if (input.kind !== TEMPLATE_KIND) {
    errors.push("kind_invalid");
  }

  if (input.worker_name !== "manut-app") {
    errors.push("worker_name_invalid");
  }

  if (input.repository !== "mygogocash/plane") {
    errors.push("repository_invalid");
  }

  if (!["preview", "main"].includes(input.production_branch)) {
    errors.push("production_branch_invalid");
  }

  if (![".", "", "apps/cloudflare"].includes(input.root_directory)) {
    warnings.push("root_directory_requires_operator_review");
  }

  if (input.package_manager !== "pnpm") {
    errors.push("package_manager_invalid");
  }

  if (!isRecord(input.run)) {
    errors.push("run_missing");
  } else {
    if (!validHttpsUrl(input.run.build_url)) {
      errors.push("build_url_invalid");
    }

    if (!validHttpsUrl(input.run.github_check_url)) {
      errors.push("github_check_url_invalid");
    }

    if (!validNonEmptyString(input.run.branch)) {
      errors.push("branch_missing");
    }

    if (!validCommitSha(input.run.commit_sha)) {
      errors.push("commit_sha_invalid");
    }

    if (!ACCEPTED_BUILD_COMMANDS.has(input.run.build_command)) {
      errors.push("build_command_invalid");
    }

    if (input.run.build_command_observed !== true) {
      errors.push("build_command_not_observed");
    }

    const isProductionBranch = input.run.branch === input.production_branch || input.run.is_production_branch === true;
    if (input.run.is_production_branch !== isProductionBranch) {
      errors.push("is_production_branch_mismatch");
    }

    const acceptedDeployCommands = isProductionBranch
      ? ACCEPTED_PRODUCTION_DEPLOY_COMMANDS
      : ACCEPTED_PREVIEW_DEPLOY_COMMANDS;
    if (!acceptedDeployCommands.has(input.run.deploy_command)) {
      errors.push("deploy_command_invalid");
    }

    if (input.run.deploy_command_observed !== true) {
      errors.push("deploy_command_not_observed");
    }

    if (input.run.github_check_conclusion !== "success") {
      errors.push("github_check_not_successful");
    }

    if (input.run.worker_version_uploaded !== true) {
      errors.push("worker_version_not_uploaded");
    }

    if (!validUuid(input.run.worker_version_id)) {
      errors.push("worker_version_id_invalid");
    }

    if (!validUuid(input.run.active_production_version_id_after)) {
      errors.push("active_production_version_id_after_invalid");
    }

    if (
      !isProductionBranch &&
      validUuid(input.run.worker_version_id) &&
      validUuid(input.run.active_production_version_id_after) &&
      input.run.worker_version_id === input.run.active_production_version_id_after
    ) {
      errors.push("non_production_version_is_active");
    }

    if (!isProductionBranch && input.run.production_traffic_changed !== false) {
      errors.push("non_production_traffic_changed");
    }

    if (isProductionBranch && input.run.production_deploy_reviewed !== true) {
      errors.push("production_deploy_not_reviewed");
    }
  }

  const readiness = validateReadiness(input.readiness, errors);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    readiness,
  };
}

export function buildCloudflareBuildsShadowReport(input) {
  const validation = validateCloudflareBuildsShadowInput(input);

  return {
    kind: "cloudflare-builds-shadow-report",
    generated_at: new Date().toISOString(),
    ok: validation.ok,
    worker_name: input?.worker_name ?? null,
    repository: input?.repository ?? null,
    production_branch: input?.production_branch ?? null,
    run: input?.run ?? null,
    readiness: input?.readiness ?? null,
    validation,
    conclusion: validation.ok
      ? "Cloudflare Builds shadow evidence is valid. This does not authorize GCP cutoff or production decommission."
      : "Cloudflare Builds shadow evidence is incomplete or unsafe.",
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.template) {
    const template = buildTemplate();
    const json = JSON.stringify(template, null, 2);
    if (options.outPath) {
      writeJsonFile(options.outPath, template);
    } else {
      console.log(json);
    }
    return;
  }

  if (!options.inputPath) {
    throw new Error("--input is required unless --template is used.");
  }

  const report = buildCloudflareBuildsShadowReport(parseJsonFile(options.inputPath));
  const json = JSON.stringify(report, null, 2);
  if (options.outPath) {
    writeJsonFile(options.outPath, report);
  }

  if (options.json || !options.outPath) {
    console.log(json);
  } else {
    console.log(`Cloudflare Builds shadow evidence: ${report.ok ? "PASS" : "BLOCKED"}`);
    console.log(`Report: ${options.outPath}`);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`Cloudflare Builds shadow report failed: ${error.message}`);
    process.exit(1);
  }
}

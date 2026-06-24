import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const REQUIRED_SEVEN_GREEN_DAYS_CHECKS = [
  {
    id: "betterstack-monitors",
    label: "Better Stack monitors remained green for manut.xyz, app.manut.xyz, and /api/instances/.",
  },
  {
    id: "cloudflare-worker-logs",
    label: "Cloudflare Worker logs show no sustained 5xx or exception spikes.",
  },
  {
    id: "d1-backup-export",
    label: "D1 backup or export is available outside destructive decommission scope.",
  },
  {
    id: "r2-backup-export",
    label: "R2 object backup or export is available outside destructive decommission scope.",
  },
  {
    id: "rollback-retention",
    label: "GKE/GCP rollback resources and final exports remain retained until explicit decommission approval.",
  },
];

function usage() {
  return `Usage: node apps/cloudflare/tools/seven-green-days-report.mjs --input <evidence.json> [--json] [--out <report.json>]

Builds canonical Phase 8 seven-green-days evidence from an operator-captured
checklist. This tool is non-destructive and does not decommission resources.

Input JSON shapes:
  {"cutover_at":"2026-06-21T00:00:00.000Z","verified_through":"2026-06-28T00:00:00.000Z","checks":[{"id":"betterstack-monitors","ok":true,"evidence":"report URL or note"}]}
  {"cutover_at":"...","verified_through":"...","betterstack-monitors":{"ok":true,"evidence":"..."}}

Exit codes:
  0  seven full green days and all required evidence checks are present
  1  evidence was captured but one or more checks failed
  2  usage or input error`;
}

function parseArgs(argv) {
  const options = {
    inputPath: null,
    json: false,
    outPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--input") {
      const inputPath = argv[index + 1];
      if (!inputPath) {
        throw new Error("--input requires a path");
      }
      options.inputPath = inputPath;
      index += 1;
      continue;
    }

    if (arg === "--out") {
      const outPath = argv[index + 1];
      if (!outPath) {
        throw new Error("--out requires a path");
      }
      options.outPath = outPath;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.help && !options.inputPath) {
    throw new Error("--input is required");
  }

  return options;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasEvidence(value) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasEvidence(item));
  }

  return isRecord(value) && Object.values(value).some((item) => hasEvidence(item));
}

function validateTargetOrigin(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: "Seven green days report target_origin must be https://app.manut.xyz." };
  }

  try {
    const url = new URL(value);
    if (url.origin !== "https://app.manut.xyz") {
      return { ok: false, message: "Seven green days report target_origin must be https://app.manut.xyz." };
    }
  } catch {
    return { ok: false, message: "Seven green days report target_origin must be https://app.manut.xyz." };
  }

  return { ok: true };
}

function normalizePhase7Readiness(value) {
  const fallback = {
    ok: false,
    status: "blocked",
    verified_at: null,
    evidence: null,
    command: null,
    report_path: null,
    message: "Phase 7 cutover readiness must be green before Phase 8 seven-green-days evidence can pass.",
  };

  if (!isRecord(value)) {
    return fallback;
  }

  const status =
    typeof value.status === "string" && value.status.trim().length > 0 ? value.status.trim() : fallback.status;
  const verifiedAt =
    typeof value.verified_at === "string" && value.verified_at.trim().length > 0 ? value.verified_at.trim() : null;
  const evidence = hasEvidence(value.evidence) ? String(value.evidence).trim() : null;
  const command = typeof value.command === "string" && value.command.trim().length > 0 ? value.command.trim() : null;
  const reportPath =
    typeof value.report_path === "string" && value.report_path.trim().length > 0 ? value.report_path.trim() : null;
  const verifiedAtValid = verifiedAt !== null && Number.isFinite(Date.parse(verifiedAt));
  const ok = value.ok === true && status === "ready" && verifiedAtValid && evidence !== null;

  return {
    ok,
    status,
    verified_at: verifiedAt,
    evidence,
    command,
    report_path: reportPath,
    message: ok
      ? "Phase 7 cutover readiness is green."
      : "Phase 7 cutover readiness must be green before Phase 8 seven-green-days evidence can pass.",
  };
}

function validatePhase7Readiness(value) {
  const phase7Readiness = normalizePhase7Readiness(value);

  if (!phase7Readiness.ok) {
    return { ok: false, message: phase7Readiness.message };
  }

  return { ok: true };
}

function parseTimestamp(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: `Seven green days report must include ${label}.` };
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return { ok: false, message: `Seven green days report ${label} must be a valid ISO timestamp.` };
  }

  return { ok: true, timestamp };
}

function stabilityWindowDays(cutoverAt, verifiedThrough) {
  const cutover = parseTimestamp(cutoverAt, "cutover_at");
  if (!cutover.ok) {
    return { ok: false, message: cutover.message };
  }

  const verified = parseTimestamp(verifiedThrough, "verified_through");
  if (!verified.ok) {
    return { ok: false, message: verified.message };
  }

  const durationMs = verified.timestamp - cutover.timestamp;
  if (durationMs < SEVEN_DAYS_MS) {
    return {
      ok: false,
      days: Math.max(0, Math.floor(durationMs / (24 * 60 * 60 * 1000))),
      message: "Seven green days report must cover at least 7 full days after cutover.",
    };
  }

  return {
    ok: true,
    days: Math.floor(durationMs / (24 * 60 * 60 * 1000)),
  };
}

function normalizeInputChecks(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (!isRecord(input)) {
    throw new Error("Seven green days input must be an object, array, or {checks} object.");
  }

  if (Array.isArray(input.checks)) {
    return input.checks;
  }

  return Object.entries(input)
    .filter(([, value]) => isRecord(value))
    .map(([id, value]) => Object.assign({ id }, value));
}

function normalizeCheck(row) {
  if (!isRecord(row)) {
    throw new Error("Each seven green days check must be an object.");
  }

  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new Error("Each seven green days check requires an id.");
  }

  return {
    id: row.id,
    ok: row.ok === true,
    evidence: row.evidence ?? row.report ?? row.url ?? row.note ?? row.notes ?? null,
    observed_at: typeof row.observed_at === "string" ? row.observed_at : null,
    url: typeof row.url === "string" ? row.url : null,
    note: typeof row.note === "string" ? row.note : typeof row.notes === "string" ? row.notes : null,
  };
}

export function validateSevenGreenDaysReport(report) {
  if (!isRecord(report)) {
    return { ok: false, message: "Seven green days report must be a JSON object." };
  }

  if (report.ok !== true) {
    return { ok: false, message: "Evidence JSON must contain ok: true." };
  }

  if (report.green_days_verified !== true) {
    return { ok: false, message: "Seven green days report must set green_days_verified: true." };
  }

  const targetOrigin = validateTargetOrigin(report.target_origin);
  if (!targetOrigin.ok) {
    return targetOrigin;
  }

  const window = stabilityWindowDays(report.cutover_at, report.verified_through);
  if (!window.ok) {
    return { ok: false, message: window.message };
  }

  if (!Array.isArray(report.checks)) {
    return { ok: false, message: "Seven green days report must include checks[]." };
  }

  const checksById = new Map(report.checks.map((check) => [check.id, check]));
  for (const definition of REQUIRED_SEVEN_GREEN_DAYS_CHECKS) {
    const check = checksById.get(definition.id);
    if (!check) {
      return { ok: false, message: `Seven green days report is missing ${definition.id}.` };
    }
    if (check.ok !== true) {
      return { ok: false, message: `Seven green days check ${definition.id} is not passing.` };
    }
    if (!hasEvidence(check.evidence)) {
      return { ok: false, message: `Seven green days check ${definition.id} is missing evidence.` };
    }
    const observedAt = parseTimestamp(check.observed_at, `checks.${definition.id}.observed_at`);
    if (!observedAt.ok) {
      return observedAt;
    }
  }

  const phase7Readiness = validatePhase7Readiness(report.phase7_readiness);
  if (!phase7Readiness.ok) {
    return phase7Readiness;
  }

  return { ok: true };
}

function failedCheckMessage(check) {
  if (check.status === "missing") {
    return `Seven green days report is missing ${check.id}.`;
  }

  if (check.status === "evidence_missing") {
    return `Seven green days check ${check.id} is missing evidence.`;
  }

  return `Seven green days check ${check.id} is not passing.`;
}

export function buildSevenGreenDaysReport(input, options = {}) {
  if (!isRecord(input)) {
    throw new Error("Seven green days input must be a JSON object.");
  }

  const window = stabilityWindowDays(input.cutover_at, input.verified_through);
  const checksById = new Map(
    normalizeInputChecks(input)
      .map(normalizeCheck)
      .map((check) => [check.id, check])
  );
  const checks = REQUIRED_SEVEN_GREEN_DAYS_CHECKS.map((definition) => {
    const check = checksById.get(definition.id);
    if (!check) {
      return {
        id: definition.id,
        label: definition.label,
        ok: false,
        status: "missing",
        evidence: null,
      };
    }

    const evidencePresent = hasEvidence(check.evidence);
    return {
      id: definition.id,
      label: definition.label,
      ok: check.ok && evidencePresent,
      status: check.ok ? (evidencePresent ? "pass" : "evidence_missing") : "fail",
      evidence: check.evidence,
      observed_at: check.observed_at,
      url: check.url,
      note: check.note,
    };
  });
  const phase7Readiness = normalizePhase7Readiness(input.phase7_readiness);
  const failed = checks.filter((check) => !check.ok);
  const report = {
    generated_at: new Date().toISOString(),
    evidence_kind: "seven-green-days",
    ok: phase7Readiness.ok && window.ok && failed.length === 0,
    green_days_verified: phase7Readiness.ok && window.ok && failed.length === 0,
    target_origin: options.targetOrigin ?? input.target_origin ?? null,
    phase7_readiness: phase7Readiness,
    cutover_at: input.cutover_at ?? null,
    verified_through: input.verified_through ?? null,
    stability_window_days: window.days ?? 0,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    required_check_ids: REQUIRED_SEVEN_GREEN_DAYS_CHECKS.map((check) => check.id),
    checks,
  };

  const validation = !phase7Readiness.ok
    ? { ok: false, message: phase7Readiness.message }
    : !window.ok
      ? { ok: false, message: window.message }
      : failed.length > 0
        ? { ok: false, message: failedCheckMessage(failed[0]) }
        : validateSevenGreenDaysReport(report);
  return validation.ok
    ? report
    : { ...report, ok: false, green_days_verified: false, validation_error: validation.message };
}

async function loadInput(inputPath) {
  const absolutePath = resolveRepoPath(inputPath);
  try {
    return JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read seven green days input: ${error.message}`, { cause: error });
  }
}

function printHumanReport(report) {
  console.log(`Seven green days report: ${report.ok ? "PASS" : "BLOCKED"}`);
  console.log(`Target: ${report.target_origin}`);
  console.log(`Cutover at: ${report.cutover_at ?? "missing"}`);
  console.log(`Verified through: ${report.verified_through ?? "missing"}`);
  console.log(`Stability window days: ${report.stability_window_days}`);
  console.log(`Checks passed: ${report.summary.passed}/${report.summary.total}`);

  for (const check of report.checks) {
    console.log(`- ${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.status}`);
  }
  if (report.validation_error) {
    console.log(`Validation: ${report.validation_error}`);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Seven green days report failed: ${error.message}`);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const input = await loadInput(options.inputPath);
  const report = buildSevenGreenDaysReport(input);

  if (options.outPath) {
    const outPath = resolveRepoPath(options.outPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Seven green days report failed: ${error.message}`);
    process.exitCode = 2;
  });
}

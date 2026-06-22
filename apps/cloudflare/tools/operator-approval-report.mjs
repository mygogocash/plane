import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

export const REQUIRED_OPERATOR_APPROVAL_CHECKS = [
  {
    id: "maintenance-window-announced",
    label: "Maintenance window is announced and scheduled.",
  },
  {
    id: "rollback-checkpoint-confirmed",
    label: "Rollback target, commands, and evidence capture path are confirmed.",
  },
  {
    id: "dns-change-approved",
    label: "The app.manut.xyz routing or DNS change is explicitly approved.",
  },
  {
    id: "write-freeze-confirmed",
    label: "Write freeze or maintenance coordination is confirmed for final delta import.",
  },
  {
    id: "smoke-plan-ready",
    label: "Public and authenticated smoke checklist is ready for immediate execution.",
  },
];

function usage() {
  return `Usage: node apps/cloudflare/tools/operator-approval-report.mjs --input <approval-evidence.json> [--json] [--out <report.json>]
       node apps/cloudflare/tools/operator-approval-report.mjs --template [--json] [--out <input-template.json>]

Builds canonical Phase 7 operator approval evidence. This tool is
non-destructive and does not change DNS, routing, data, or provider resources.

Input JSON shapes:
  {"approved_by":"operator@example.com","approved_at":"2026-06-21T12:00:00.000Z","maintenance_window":{"start_at":"...","end_at":"..."},"checks":[{"id":"maintenance-window-announced","ok":true,"evidence":"calendar link or note"}]}
  {"approved_by":"operator@example.com","approved_at":"...","maintenance-window-announced":{"ok":true,"evidence":"..."}}

Exit codes:
  0  all required operator approval checks have passing evidence
  1  evidence was captured but one or more checks failed
  2  usage or input error`;
}

function parseArgs(argv) {
  const options = {
    inputPath: null,
    template: false,
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

    if (arg === "--template") {
      options.template = true;
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

  if (!options.help && !options.template && !options.inputPath) {
    throw new Error("--input is required");
  }

  if (options.template && options.inputPath) {
    throw new Error("--template cannot be combined with --input");
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

function parseTimestamp(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: `Operator approval report must include ${label}.` };
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return { ok: false, message: `Operator approval report ${label} must be a valid ISO timestamp.` };
  }

  return { ok: true, timestamp };
}

function validateMaintenanceWindow(window) {
  if (!isRecord(window)) {
    return { ok: false, message: "Operator approval report must include maintenance_window." };
  }

  const start = parseTimestamp(window.start_at, "maintenance_window.start_at");
  if (!start.ok) {
    return start;
  }

  const end = parseTimestamp(window.end_at, "maintenance_window.end_at");
  if (!end.ok) {
    return end;
  }

  if (end.timestamp <= start.timestamp) {
    return { ok: false, message: "Operator approval maintenance_window.end_at must be after start_at." };
  }

  return { ok: true };
}

function validateTargetOrigin(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: "Operator approval report target_origin must be https://app.manut.xyz." };
  }

  try {
    const url = new URL(value);
    if (url.origin !== "https://app.manut.xyz") {
      return { ok: false, message: "Operator approval report target_origin must be https://app.manut.xyz." };
    }
  } catch {
    return { ok: false, message: "Operator approval report target_origin must be https://app.manut.xyz." };
  }

  return { ok: true };
}

function normalizeInputChecks(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (!isRecord(input)) {
    throw new Error("Operator approval input must be an object, array, or {checks} object.");
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
    throw new Error("Each operator approval check must be an object.");
  }

  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new Error("Each operator approval check requires an id.");
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

export function validateOperatorApprovalReport(report) {
  if (!isRecord(report)) {
    return { ok: false, message: "Operator approval report must be a JSON object." };
  }

  if (report.ok !== true) {
    return { ok: false, message: "Evidence JSON must contain ok: true." };
  }

  const targetOrigin = validateTargetOrigin(report.target_origin);
  if (!targetOrigin.ok) {
    return targetOrigin;
  }

  if (typeof report.approved_by !== "string" || report.approved_by.trim() === "") {
    return { ok: false, message: "Operator approval report must include approved_by." };
  }

  const approvedAt = parseTimestamp(report.approved_at, "approved_at");
  if (!approvedAt.ok) {
    return approvedAt;
  }

  const maintenanceWindow = validateMaintenanceWindow(report.maintenance_window);
  if (!maintenanceWindow.ok) {
    return maintenanceWindow;
  }

  if (report.cutover_approved !== true) {
    return { ok: false, message: "Operator approval report must set cutover_approved: true." };
  }

  if (!Array.isArray(report.checks)) {
    return { ok: false, message: "Operator approval report must include checks[]." };
  }

  const checksById = new Map(report.checks.map((check) => [check.id, check]));
  for (const definition of REQUIRED_OPERATOR_APPROVAL_CHECKS) {
    const check = checksById.get(definition.id);
    if (!check) {
      return { ok: false, message: `Operator approval report is missing ${definition.id}.` };
    }
    if (check.ok !== true) {
      return { ok: false, message: `Operator approval check ${definition.id} is not passing.` };
    }
    if (!hasEvidence(check.evidence)) {
      return { ok: false, message: `Operator approval check ${definition.id} is missing evidence.` };
    }
  }

  return { ok: true };
}

export function buildOperatorApprovalInputTemplate({ generatedAt = new Date().toISOString() } = {}) {
  return {
    template_kind: "operator-approval-input",
    schema_version: 1,
    generated_at: generatedAt,
    instructions:
      "Fill this from an explicit operator approval event. Do not mark cutover approval true until the maintenance window, rollback checkpoint, DNS/routing approval, write freeze, and smoke plan are all confirmed.",
    approved_by: "",
    approved_at: "",
    target_origin: "https://app.manut.xyz",
    maintenance_window: {
      start_at: "",
      end_at: "",
    },
    checks: REQUIRED_OPERATOR_APPROVAL_CHECKS.map((check) => ({
      id: check.id,
      label: check.label,
      ok: false,
      evidence: "",
      observed_at: "",
      url: "",
      note: "",
    })),
  };
}

function failedCheckMessage(check) {
  if (check.status === "missing") {
    return `Operator approval report is missing ${check.id}.`;
  }

  if (check.status === "evidence_missing") {
    return `Operator approval check ${check.id} is missing evidence.`;
  }

  return `Operator approval check ${check.id} is not passing.`;
}

export function buildOperatorApprovalReport(input, options = {}) {
  if (!isRecord(input)) {
    throw new Error("Operator approval input must be a JSON object.");
  }

  const checksById = new Map(
    normalizeInputChecks(input)
      .map(normalizeCheck)
      .map((check) => [check.id, check])
  );
  const checks = REQUIRED_OPERATOR_APPROVAL_CHECKS.map((definition) => {
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
  const failed = checks.filter((check) => !check.ok);
  const report = {
    generated_at: new Date().toISOString(),
    evidence_kind: "operator-approval",
    ok: failed.length === 0,
    cutover_approved: failed.length === 0,
    target_origin: options.targetOrigin ?? input.target_origin ?? null,
    approved_by: typeof input.approved_by === "string" ? input.approved_by : null,
    approved_at: typeof input.approved_at === "string" ? input.approved_at : null,
    maintenance_window: isRecord(input.maintenance_window) ? input.maintenance_window : null,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    required_check_ids: REQUIRED_OPERATOR_APPROVAL_CHECKS.map((check) => check.id),
    checks,
  };

  const validation =
    failed.length > 0 ? { ok: false, message: failedCheckMessage(failed[0]) } : validateOperatorApprovalReport(report);
  return validation.ok
    ? report
    : { ...report, ok: false, cutover_approved: false, validation_error: validation.message };
}

async function loadInput(inputPath) {
  const absolutePath = resolveRepoPath(inputPath);
  try {
    return JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read operator approval input: ${error.message}`, { cause: error });
  }
}

function printHumanReport(report) {
  console.log(`Operator approval report: ${report.ok ? "PASS" : "BLOCKED"}`);
  console.log(`Target: ${report.target_origin}`);
  console.log(`Approved by: ${report.approved_by ?? "missing"}`);
  console.log(`Approved at: ${report.approved_at ?? "missing"}`);
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
    console.error(`Operator approval report failed: ${error.message}`);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const report = options.template
    ? buildOperatorApprovalInputTemplate()
    : buildOperatorApprovalReport(await loadInput(options.inputPath));

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

  process.exitCode = options.template || report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Operator approval report failed: ${error.message}`);
    process.exitCode = 2;
  });
}

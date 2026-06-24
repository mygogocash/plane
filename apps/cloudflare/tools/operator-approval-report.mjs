import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

export const REQUIRED_OPERATOR_APPROVAL_CHECKS = [
  {
    id: "maintenance-window-announced",
    label: "Maintenance window is announced and scheduled.",
    required_inputs: [
      { path: "maintenance_window.start_at", label: "Maintenance window start timestamp" },
      { path: "maintenance_window.end_at", label: "Maintenance window end timestamp" },
      {
        path: "operator_inputs.maintenance_window.announcement_url",
        label: "Maintenance announcement or calendar URL",
      },
      { path: "operator_inputs.maintenance_window.owner", label: "Maintenance-window operator owner" },
    ],
  },
  {
    id: "rollback-checkpoint-confirmed",
    label: "Rollback target, commands, and evidence capture path are confirmed.",
    required_inputs: [
      { path: "operator_inputs.rollback_checkpoint.rollback_target", label: "Rollback target or checkpoint" },
      { path: "operator_inputs.rollback_checkpoint.rollback_command", label: "Rollback command or runbook step" },
      {
        path: "operator_inputs.rollback_checkpoint.checkpoint_evidence_path",
        label: "Rollback checkpoint evidence path",
      },
      { path: "operator_inputs.rollback_checkpoint.owner", label: "Rollback owner" },
    ],
  },
  {
    id: "dns-change-approved",
    label: "The app.manut.xyz routing or DNS change is explicitly approved.",
    required_inputs: [
      { path: "operator_inputs.dns_routing.change_ticket_url", label: "DNS or routing change ticket URL" },
      { path: "operator_inputs.dns_routing.current_origin", label: "Current production origin before cutoff" },
      { path: "operator_inputs.dns_routing.cutover_origin", label: "Approved Cloudflare cutover origin" },
      { path: "operator_inputs.dns_routing.routing_owner", label: "DNS or routing owner" },
    ],
  },
  {
    id: "write-freeze-confirmed",
    label: "Write freeze or maintenance coordination is confirmed for final delta import.",
    required_inputs: [
      { path: "operator_inputs.write_freeze.start_at", label: "Write-freeze start timestamp" },
      { path: "operator_inputs.write_freeze.end_at", label: "Write-freeze end timestamp" },
      { path: "operator_inputs.write_freeze.announcement_url", label: "Write-freeze announcement URL" },
      { path: "operator_inputs.write_freeze.coordinator", label: "Write-freeze coordinator" },
    ],
  },
  {
    id: "smoke-plan-ready",
    label: "Public and authenticated smoke checklist is ready for immediate execution.",
    required_inputs: [
      { path: "operator_inputs.smoke_readiness.public_smoke_command", label: "Public smoke command" },
      { path: "operator_inputs.smoke_readiness.authenticated_smoke_command", label: "Authenticated smoke command" },
      { path: "operator_inputs.smoke_readiness.evidence_path", label: "Smoke evidence output path" },
      { path: "operator_inputs.smoke_readiness.owner", label: "Smoke executor owner" },
    ],
  },
];

const OPERATOR_INPUT_TEMPLATE = {
  maintenance_window: {
    announcement_url: "",
    owner: "",
  },
  rollback_checkpoint: {
    rollback_target: "",
    rollback_command: "",
    checkpoint_evidence_path: "",
    owner: "",
  },
  dns_routing: {
    change_ticket_url: "",
    current_origin: "",
    cutover_origin: "",
    routing_owner: "",
  },
  write_freeze: {
    start_at: "",
    end_at: "",
    announcement_url: "",
    coordinator: "",
  },
  smoke_readiness: {
    public_smoke_command: "",
    authenticated_smoke_command: "",
    evidence_path: "",
    owner: "",
  },
};

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

function normalizeOperatorInputSection(template, value) {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    Object.keys(template).map((key) => [key, typeof source[key] === "string" ? source[key] : ""])
  );
}

function normalizeOperatorInputs(value) {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    Object.entries(OPERATOR_INPUT_TEMPLATE).map(([section, template]) => [
      section,
      normalizeOperatorInputSection(template, source[section]),
    ])
  );
}

function getPathValue(root, pathValue) {
  return pathValue.split(".").reduce((value, key) => {
    if (!isRecord(value)) {
      return undefined;
    }

    return value[key];
  }, root);
}

function missingInputsFor(definition, context) {
  return (definition.required_inputs ?? []).filter((input) => !hasEvidence(getPathValue(context, input.path)));
}

function remainingOperatorInputs(checks) {
  return checks.flatMap((check) =>
    (check.missing_inputs ?? []).map((input) => ({
      check_id: check.id,
      path: input.path,
      label: input.label,
    }))
  );
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

  const schemaVersion = Number(report.schema_version);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 2) {
    return { ok: false, message: "Operator approval report schema_version must be 2." };
  }

  {
    if (report.decision_complete !== true) {
      return { ok: false, message: "Operator approval report must set decision_complete: true." };
    }

    if (Array.isArray(report.remaining_operator_inputs) && report.remaining_operator_inputs.length > 0) {
      return { ok: false, message: "Operator approval report has remaining operator inputs." };
    }
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
    const observedAt = parseTimestamp(check.observed_at, `checks.${definition.id}.observed_at`);
    if (!observedAt.ok) {
      return observedAt;
    }
  }

  return { ok: true };
}

export function buildOperatorApprovalInputTemplate({ generatedAt = new Date().toISOString() } = {}) {
  return {
    template_kind: "operator-approval-input",
    schema_version: 2,
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
    operator_inputs: normalizeOperatorInputs({}),
    checks: REQUIRED_OPERATOR_APPROVAL_CHECKS.map((check) => ({
      id: check.id,
      label: check.label,
      ok: false,
      evidence: "",
      observed_at: "",
      url: "",
      note: "",
      required_inputs: check.required_inputs,
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

  if (check.status === "operator_input_missing") {
    const missing = check.missing_inputs?.[0];
    return `Operator approval check ${check.id} is missing operator input ${missing?.path ?? "unknown"}.`;
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
  const targetOrigin = options.targetOrigin ?? input.target_origin ?? null;
  const maintenanceWindow = isRecord(input.maintenance_window) ? input.maintenance_window : null;
  const decisionInputsRequired = Number(input.schema_version) >= 2 || isRecord(input.operator_inputs);
  const operatorInputs = decisionInputsRequired ? normalizeOperatorInputs(input.operator_inputs) : null;
  const decisionContext = {
    target_origin: targetOrigin,
    maintenance_window: maintenanceWindow,
    operator_inputs: operatorInputs ?? normalizeOperatorInputs({}),
  };
  const checks = REQUIRED_OPERATOR_APPROVAL_CHECKS.map((definition) => {
    const check = checksById.get(definition.id);
    if (!check) {
      return {
        id: definition.id,
        label: definition.label,
        ok: false,
        status: "missing",
        evidence: null,
        required_inputs: definition.required_inputs,
        missing_inputs: definition.required_inputs,
      };
    }

    const evidencePresent = hasEvidence(check.evidence);
    const missingInputs = decisionInputsRequired ? missingInputsFor(definition, decisionContext) : [];
    const ok = check.ok && evidencePresent && missingInputs.length === 0;
    return {
      id: definition.id,
      label: definition.label,
      ok,
      status: check.ok
        ? evidencePresent
          ? missingInputs.length === 0
            ? "pass"
            : "operator_input_missing"
          : "evidence_missing"
        : "fail",
      evidence: check.evidence,
      observed_at: check.observed_at,
      url: check.url,
      note: check.note,
      required_inputs: definition.required_inputs,
      missing_inputs: missingInputs,
    };
  });
  const failed = checks.filter((check) => !check.ok);
  const remainingInputs = remainingOperatorInputs(checks);
  const report = {
    schema_version: decisionInputsRequired ? 2 : 1,
    generated_at: new Date().toISOString(),
    evidence_kind: "operator-approval",
    ok: failed.length === 0,
    cutover_approved: failed.length === 0,
    decision_complete: decisionInputsRequired ? failed.length === 0 && remainingInputs.length === 0 : null,
    target_origin: targetOrigin,
    approved_by: typeof input.approved_by === "string" ? input.approved_by : null,
    approved_at: typeof input.approved_at === "string" ? input.approved_at : null,
    maintenance_window: maintenanceWindow,
    operator_inputs: operatorInputs,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      remaining_operator_inputs: remainingInputs.length,
    },
    required_check_ids: REQUIRED_OPERATOR_APPROVAL_CHECKS.map((check) => check.id),
    remaining_operator_inputs: remainingInputs,
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

function printHumanTemplate(template, outPath) {
  console.log("Operator approval input template");
  console.log(`Target: ${template.target_origin}`);
  console.log(`Checks: ${template.checks.length}`);
  if (outPath) {
    console.log(`Wrote: ${outPath}`);
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
  } else if (options.template) {
    printHumanTemplate(report, options.outPath);
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

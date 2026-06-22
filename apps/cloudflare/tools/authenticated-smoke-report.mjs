import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

export const REQUIRED_AUTHENTICATED_SMOKE_CHECKS = [
  {
    id: "login",
    label: "User can log in and reach the authenticated app shell.",
  },
  {
    id: "session-refresh",
    label: "Authenticated session survives a hard refresh.",
  },
  {
    id: "workspace-sidebar",
    label: "Workspace sidebar renders expected workspace context.",
  },
  {
    id: "project-list",
    label: "Project list loads for the authenticated workspace.",
  },
  {
    id: "work-item-create",
    label: "A non-critical work item can be created.",
  },
  {
    id: "work-item-edit",
    label: "The non-critical work item can be edited.",
  },
  {
    id: "work-item-delete",
    label: "The non-critical work item can be deleted or archived.",
  },
  {
    id: "upload-attachment",
    label: "Attachment or logo upload succeeds and resolves through uploads.",
  },
  {
    id: "live-update",
    label: "A representative live update propagates to another view or session.",
  },
  {
    id: "admin-route",
    label: "The authorized admin route loads or correctly denies non-admin users.",
  },
  {
    id: "public-space-route",
    label: "A public space route loads without authenticated-session leakage.",
  },
];

function usage() {
  return `Usage: node apps/cloudflare/tools/authenticated-smoke-report.mjs --input <manual-evidence.json> [--json] [--out <report.json>]
       node apps/cloudflare/tools/authenticated-smoke-report.mjs --template [--json] [--out <input-template.json>]

Builds canonical Phase 7 authenticated smoke evidence from a manually captured
checklist. This tool does not log in for you; it validates that each required
authenticated workflow has explicit evidence.

Input JSON shapes:
  {"checks":[{"id":"login","ok":true,"evidence":"screenshot or note"}]}
  {"login":{"ok":true,"evidence":"screenshot or note"}}

Exit codes:
  0  all required authenticated smoke checks have passing evidence
  1  evidence was captured but one or more required checks failed
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

function validateTargetOrigin(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: "Authenticated smoke report target_origin must be https://app.manut.xyz." };
  }

  try {
    const url = new URL(value);
    if (url.origin !== "https://app.manut.xyz") {
      return { ok: false, message: "Authenticated smoke report target_origin must be https://app.manut.xyz." };
    }
  } catch {
    return { ok: false, message: "Authenticated smoke report target_origin must be https://app.manut.xyz." };
  }

  return { ok: true };
}

function parseTimestamp(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: `Authenticated smoke report must include ${label}.` };
  }

  if (Number.isNaN(Date.parse(value))) {
    return { ok: false, message: `Authenticated smoke report ${label} must be a valid ISO timestamp.` };
  }

  return { ok: true };
}

function normalizeInputChecks(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (!isRecord(input)) {
    throw new Error("Authenticated smoke input must be an object, array, or {checks} object.");
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
    throw new Error("Each authenticated smoke check must be an object.");
  }

  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new Error("Each authenticated smoke check requires an id.");
  }

  return {
    id: row.id,
    ok: row.ok === true,
    evidence: row.evidence ?? row.screenshot ?? row.url ?? row.note ?? row.notes ?? null,
    observed_at: typeof row.observed_at === "string" ? row.observed_at : null,
    url: typeof row.url === "string" ? row.url : null,
    note: typeof row.note === "string" ? row.note : typeof row.notes === "string" ? row.notes : null,
  };
}

export function validateAuthenticatedSmokeReport(report) {
  if (!isRecord(report)) {
    return { ok: false, message: "Authenticated smoke report must be a JSON object." };
  }

  if (report.ok !== true) {
    return { ok: false, message: "Evidence JSON must contain ok: true." };
  }

  const targetOrigin = validateTargetOrigin(report.target_origin);
  if (!targetOrigin.ok) {
    return targetOrigin;
  }

  if (typeof report.actor !== "string" || report.actor.trim() === "") {
    return { ok: false, message: "Authenticated smoke report must include actor." };
  }

  if (report.cloudflare_route_verified !== true) {
    return { ok: false, message: "Authenticated smoke report must set cloudflare_route_verified: true." };
  }

  if (!hasEvidence(report.cloudflare_route_evidence)) {
    return { ok: false, message: "Authenticated smoke report must include cloudflare_route_evidence." };
  }

  if (!Array.isArray(report.checks)) {
    return { ok: false, message: "Authenticated smoke report must include checks[]." };
  }

  const checksById = new Map(report.checks.map((check) => [check.id, check]));
  for (const definition of REQUIRED_AUTHENTICATED_SMOKE_CHECKS) {
    const check = checksById.get(definition.id);
    if (!check) {
      return { ok: false, message: `Authenticated smoke report is missing ${definition.id}.` };
    }
    if (check.ok !== true) {
      return { ok: false, message: `Authenticated smoke check ${definition.id} is not passing.` };
    }
    if (!hasEvidence(check.evidence)) {
      return { ok: false, message: `Authenticated smoke check ${definition.id} is missing evidence.` };
    }
    const observedAt = parseTimestamp(check.observed_at, `checks.${definition.id}.observed_at`);
    if (!observedAt.ok) {
      return observedAt;
    }
  }

  return { ok: true };
}

export function buildAuthenticatedSmokeInputTemplate({ generatedAt = new Date().toISOString() } = {}) {
  return {
    template_kind: "authenticated-smoke-input",
    schema_version: 1,
    generated_at: generatedAt,
    instructions:
      "Fill every ok/evidence/observed_at field from a real authenticated production smoke run, then pass this file to auth:smoke-report. Do not mark checks passing from assumptions or public health probes.",
    actor: "",
    target_origin: "https://app.manut.xyz",
    cloudflare_route_verified: false,
    cloudflare_route_evidence: {
      edge_header: "",
      worker_url: "",
      dns_or_route_evidence: "",
    },
    checks: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.map((check) => ({
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
    return `Authenticated smoke report is missing ${check.id}.`;
  }

  if (check.status === "evidence_missing") {
    return `Authenticated smoke check ${check.id} is missing evidence.`;
  }

  return `Authenticated smoke check ${check.id} is not passing.`;
}

export function buildAuthenticatedSmokeReport(input, options = {}) {
  const checksById = new Map(
    normalizeInputChecks(input)
      .map(normalizeCheck)
      .map((check) => [check.id, check])
  );
  const checks = REQUIRED_AUTHENTICATED_SMOKE_CHECKS.map((definition) => {
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
    evidence_kind: "authenticated-smoke",
    ok: failed.length === 0,
    target_origin: options.targetOrigin ?? (isRecord(input) ? input.target_origin : null) ?? null,
    actor: options.actor ?? (isRecord(input) ? input.actor : null) ?? null,
    cloudflare_route_verified:
      options.cloudflareRouteVerified ??
      (isRecord(input) && typeof input.cloudflare_route_verified === "boolean"
        ? input.cloudflare_route_verified
        : false),
    cloudflare_route_evidence:
      options.cloudflareRouteEvidence ??
      (isRecord(input) ? (input.cloudflare_route_evidence ?? input.route_provenance ?? null) : null),
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    required_check_ids: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.map((check) => check.id),
    checks,
  };

  const validation =
    failed.length > 0
      ? { ok: false, message: failedCheckMessage(failed[0]) }
      : validateAuthenticatedSmokeReport(report);
  return validation.ok ? report : { ...report, ok: false, validation_error: validation.message };
}

async function loadInput(inputPath) {
  const absolutePath = resolveRepoPath(inputPath);
  try {
    return JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read authenticated smoke input: ${error.message}`, { cause: error });
  }
}

function printHumanReport(report) {
  console.log(`Authenticated smoke report: ${report.ok ? "PASS" : "BLOCKED"}`);
  console.log(`Target: ${report.target_origin}`);
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
    console.error(`Authenticated smoke report failed: ${error.message}`);
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
    ? buildAuthenticatedSmokeInputTemplate()
    : buildAuthenticatedSmokeReport(await loadInput(options.inputPath));

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
    console.error(`Authenticated smoke report failed: ${error.message}`);
    process.exitCode = 2;
  });
}

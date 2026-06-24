#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

const DEFAULT_TARGET_ORIGIN = "https://app.manut.xyz";
const INPUT_TEMPLATE_KIND = "authenticated-smoke-input";
const REPORT_KIND = "authenticated-smoke";
const REPORT_SCHEMA_VERSION = 1;
const EVIDENCE_MODEL_VERSION = 2;

export const REQUIRED_AUTHENTICATED_SMOKE_CHECKS = Object.freeze([
  Object.freeze({ id: "login", label: "User can log in and reach the authenticated app shell." }),
  Object.freeze({ id: "session-refresh", label: "Authenticated session survives a hard refresh." }),
  Object.freeze({ id: "workspace-sidebar", label: "Workspace sidebar renders expected workspace context." }),
  Object.freeze({ id: "project-list", label: "Project list loads for the authenticated workspace." }),
  Object.freeze({ id: "work-item-create", label: "A non-critical work item can be created." }),
  Object.freeze({ id: "work-item-edit", label: "The non-critical work item can be edited." }),
  Object.freeze({ id: "work-item-delete", label: "The non-critical work item can be deleted or archived." }),
  Object.freeze({
    id: "upload-attachment",
    label: "Attachment or logo upload succeeds and resolves through uploads.",
  }),
  Object.freeze({
    id: "live-update",
    label: "A representative live update propagates to another view or session.",
  }),
  Object.freeze({
    id: "admin-route",
    label: "The authorized admin route loads or correctly denies non-admin users.",
  }),
  Object.freeze({
    id: "public-space-route",
    label: "A public space route loads without authenticated-session leakage.",
  }),
]);

const PUBLIC_PROBE_ROUTE_PATTERNS = [
  /^\/api\/instances(?:\/|$)/i,
  /^\/api\/health(?:\/|$)/i,
  /^\/health(?:\/|$)/i,
  /^\/cdn-cgi\/trace$/i,
  /^\/login(?:\/|$)/i,
  /^\/sign-?up(?:\/|$)/i,
  /^\/signup(?:\/|$)/i,
  /^\/accounts?(?:\/|$)/i,
  /^\/auth(?:\/|$)/i,
];

const UNAUTHENTICATED_EVIDENCE_PATTERNS = [
  /\bsign\s*up\s*-\s*manut\b/i,
  /\bsign\s*up\b/i,
  /\bsignup\b/i,
  /\bnot\s+logged\s+in\b/i,
  /\bunauthenticated\b/i,
  /\bpublic\s+probe\b/i,
  /\bpublic\s+health\b/i,
  /\bapi\/instances\b/i,
  /\bapi\/health\b/i,
];

function usage() {
  return `Usage: node apps/cloudflare/tools/authenticated-smoke-report.mjs --input <manual-evidence.json> [--json] [--out <report.json>]
       node apps/cloudflare/tools/authenticated-smoke-report.mjs --template [--json] [--out <input-template.json>]

Converts real logged-in operator smoke evidence into the canonical Cloudflare/GCP cutover
authenticated smoke report. Public probes, auth pages, and assumptions remain blocked.`;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value) {
  const trimmed = trimString(value);
  return trimmed.length > 0 ? trimmed : null;
}

function hasEvidence(value) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).some((entry) => {
    if (typeof entry === "string") {
      return entry.trim().length > 0;
    }

    if (Array.isArray(entry)) {
      return entry.some(hasEvidence);
    }

    return isRecord(entry) && hasEvidence(entry);
  });
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function parseProductionUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, url: null, reason: "url_missing" };
  }

  try {
    const url = new URL(value.trim());
    if (url.origin !== DEFAULT_TARGET_ORIGIN) {
      return { ok: false, url, reason: "url_not_production" };
    }

    return { ok: true, url, reason: null };
  } catch {
    return { ok: false, url: null, reason: "url_invalid" };
  }
}

function isPublicProbeRoute(url) {
  return PUBLIC_PROBE_ROUTE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

function evidenceTextContainsUnauthenticatedProbe(...values) {
  const text = values
    .flatMap((value) => {
      if (typeof value === "string") {
        return [value];
      }

      if (isRecord(value)) {
        return Object.values(value).filter((entry) => typeof entry === "string");
      }

      return [];
    })
    .join("\n");

  return UNAUTHENTICATED_EVIDENCE_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeInputChecks(input) {
  const source = isRecord(input) && isRecord(input.checks) ? input.checks : input?.checks;

  if (Array.isArray(source)) {
    return new Map(
      source
        .filter(isRecord)
        .map((row) => [trimString(row.id), row])
        .filter(([id]) => id.length > 0)
    );
  }

  if (isRecord(source)) {
    return new Map(
      Object.entries(source)
        .filter(([, row]) => isRecord(row))
        .map(([id, row]) => [id, { id, ...row }])
    );
  }

  if (isRecord(input) && !("checks" in input)) {
    return new Map(
      Object.entries(input)
        .filter(([, row]) => isRecord(row))
        .map(([id, row]) => [id, { id, ...row }])
    );
  }

  return new Map();
}

function normalizeOperatorEvidence(input) {
  const source = isRecord(input?.operator_evidence)
    ? input.operator_evidence
    : isRecord(input?.operator_context)
      ? input.operator_context
      : {};

  return {
    run_id: optionalString(source.run_id ?? input?.run_id),
    workspace_identifier: optionalString(
      source.workspace_identifier ?? source.workspace_slug ?? input?.workspace_identifier ?? input?.workspace_slug
    ),
    authenticated_workspace_url: optionalString(
      source.authenticated_workspace_url ??
        source.workspace_url ??
        input?.authenticated_workspace_url ??
        input?.workspace_url
    ),
    user_identity_redacted: optionalString(
      source.user_identity_redacted ?? source.session_subject ?? input?.user_identity_redacted ?? input?.session_subject
    ),
    browser_artifact: optionalString(
      source.browser_artifact ?? source.screenshot ?? input?.browser_artifact ?? input?.screenshot
    ),
    note: optionalString(source.note ?? input?.operator_note),
  };
}

function validateOperatorEvidence(operatorEvidence, required) {
  const errors = [];
  const present = Object.values(operatorEvidence).some((value) => typeof value === "string" && value.length > 0);

  if (!present && !required) {
    return { present, verified: false, errors };
  }

  if (!present && required) {
    errors.push("operator_evidence_missing");
    return { present, verified: false, errors };
  }

  if (!operatorEvidence.workspace_identifier) {
    errors.push("operator_workspace_identifier_missing");
  }

  if (!operatorEvidence.authenticated_workspace_url) {
    errors.push("operator_authenticated_workspace_url_missing");
  } else {
    const workspaceUrl = parseProductionUrl(operatorEvidence.authenticated_workspace_url);
    if (!workspaceUrl.ok) {
      errors.push(`operator_authenticated_workspace_${workspaceUrl.reason}`);
    } else if (isPublicProbeRoute(workspaceUrl.url)) {
      errors.push("operator_authenticated_workspace_public_probe_url");
    }
  }

  if (!operatorEvidence.user_identity_redacted && !operatorEvidence.browser_artifact) {
    errors.push("operator_session_evidence_missing");
  }

  if (
    evidenceTextContainsUnauthenticatedProbe(
      operatorEvidence.authenticated_workspace_url,
      operatorEvidence.user_identity_redacted,
      operatorEvidence.browser_artifact,
      operatorEvidence.note
    )
  ) {
    errors.push("operator_evidence_not_authenticated");
  }

  return { present, verified: errors.length === 0, errors };
}

function normalizeCheck(requiredCheck, row, fallbackObservedAt) {
  const evidence = row?.evidence ?? null;
  const observedAt = optionalString(row?.observed_at) ?? optionalString(fallbackObservedAt);
  const url = optionalString(row?.url ?? (isRecord(evidence) ? evidence.url : null));
  const note = optionalString(row?.note ?? (isRecord(evidence) ? evidence.note : null));
  const title = optionalString(row?.title ?? (isRecord(evidence) ? evidence.title : null));
  const issues = [];

  if (!row) {
    issues.push("missing");
  } else if (row.ok !== true) {
    issues.push("ok_false");
  }

  if (!hasEvidence(evidence)) {
    issues.push("evidence_missing");
  }

  if (!observedAt) {
    issues.push("observed_at_missing");
  } else if (!isIsoTimestamp(observedAt)) {
    issues.push("observed_at_invalid");
  }

  if (!url) {
    issues.push("url_missing");
  } else {
    const checkUrl = parseProductionUrl(url);
    if (!checkUrl.ok) {
      issues.push(checkUrl.reason);
    } else if (isPublicProbeRoute(checkUrl.url)) {
      issues.push("public_probe_url");
    }
  }

  if (evidenceTextContainsUnauthenticatedProbe(evidence, note, title, url)) {
    issues.push("unauthenticated_evidence");
  }

  const ok = row?.ok === true && issues.length === 0;

  return {
    id: requiredCheck.id,
    label: requiredCheck.label,
    ok,
    status: ok ? "pass" : issues[0],
    evidence,
    observed_at: observedAt,
    url,
    note,
    title,
    blockers: issues,
  };
}

function buildValidationErrors(report) {
  const errors = [];
  const warnings = [];

  if (!isRecord(report)) {
    return { errors: ["Evidence JSON must be an object."], warnings };
  }

  if (report.target_origin !== DEFAULT_TARGET_ORIGIN) {
    errors.push(`Authenticated smoke report target_origin must be ${DEFAULT_TARGET_ORIGIN}.`);
  }

  if (report.evidence_kind !== REPORT_KIND) {
    errors.push(`Evidence JSON evidence_kind must be "${REPORT_KIND}".`);
  }

  if (!trimString(report.actor)) {
    errors.push("Authenticated smoke actor is required.");
  }

  if (report.cloudflare_route_verified !== true) {
    errors.push("Authenticated smoke report must set cloudflare_route_verified: true.");
  }

  if (!hasEvidence(report.cloudflare_route_evidence)) {
    errors.push("Cloudflare route evidence is required.");
  }

  if (report.ok !== true) {
    errors.push("Evidence JSON ok must be true.");
  }

  const operatorEvidence = normalizeOperatorEvidence(report);
  const operatorValidation = validateOperatorEvidence(operatorEvidence, true);
  if (operatorValidation.errors.length > 0) {
    errors.push(...operatorValidation.errors);
  } else if (!operatorValidation.present) {
    warnings.push("operator_evidence_not_supplied");
  }

  const checks = Array.isArray(report.checks) ? report.checks : [];
  const reportChecks = new Map(checks.filter(isRecord).map((check) => [check.id, check]));

  for (const requiredCheck of REQUIRED_AUTHENTICATED_SMOKE_CHECKS) {
    if (!reportChecks.has(requiredCheck.id)) {
      errors.push(`Authenticated smoke report is missing ${requiredCheck.id}.`);
    }
  }

  for (const requiredCheck of REQUIRED_AUTHENTICATED_SMOKE_CHECKS) {
    const check = reportChecks.get(requiredCheck.id);
    if (!check) {
      continue;
    }

    if (check.ok !== true || check.status !== "pass") {
      errors.push(`Authenticated smoke check ${requiredCheck.id} is not passing.`);
    }

    if (!hasEvidence(check.evidence)) {
      errors.push(`Authenticated smoke check ${requiredCheck.id} is missing evidence.`);
    }

    if (!isIsoTimestamp(check.observed_at)) {
      errors.push(`Authenticated smoke check ${requiredCheck.id} is missing a valid observed_at timestamp.`);
    }

    const checkUrl = parseProductionUrl(check.url);
    if (!checkUrl.ok) {
      errors.push(`Authenticated smoke check ${requiredCheck.id} must use a ${DEFAULT_TARGET_ORIGIN} URL.`);
    } else if (isPublicProbeRoute(checkUrl.url)) {
      errors.push(
        `Authenticated smoke check ${requiredCheck.id} uses public or unauthenticated probe URL ${check.url}.`
      );
    }

    if (evidenceTextContainsUnauthenticatedProbe(check.evidence, check.note, check.title, check.url)) {
      errors.push(`Authenticated smoke check ${requiredCheck.id} evidence is not authenticated workspace evidence.`);
    }
  }

  return { errors, warnings };
}

export function validateAuthenticatedSmokeReport(report) {
  const { errors, warnings } = buildValidationErrors(report);

  if (errors.length === 0) {
    return { ok: true };
  }

  const result = {
    ok: false,
    message: errors[0],
    errors,
  };

  return warnings.length === 0 ? result : { ...result, warnings };
}

export function buildAuthenticatedSmokeInputTemplate(options = {}) {
  const now = typeof options === "string" ? options : (options.now ?? new Date().toISOString());

  return {
    template_kind: INPUT_TEMPLATE_KIND,
    schema_version: REPORT_SCHEMA_VERSION,
    evidence_model_version: EVIDENCE_MODEL_VERSION,
    generated_at: now,
    instructions:
      "Fill every operator_evidence field and every check ok/evidence/observed_at/url field from a real logged-in production smoke run. Every check URL must be under https://app.manut.xyz and must not be a public health/API probe, auth page, or Sign up page. Do not mark checks passing from assumptions.",
    actor: "",
    target_origin: DEFAULT_TARGET_ORIGIN,
    cloudflare_route_verified: false,
    cloudflare_route_evidence: {
      url: "",
      note: "Record Cloudflare production-route evidence, for example cf-ray/cdn-cgi trace captured during the authenticated run.",
    },
    operator_evidence_required: true,
    operator_evidence: {
      run_id: "",
      workspace_identifier: "",
      authenticated_workspace_url: "",
      user_identity_redacted: "",
      browser_artifact: "",
      note: "",
    },
    checks: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.map((check) => ({
      id: check.id,
      label: check.label,
      ok: false,
      evidence: "",
      observed_at: "",
      url: "",
      note: "",
      title: "",
    })),
  };
}

export function buildAuthenticatedSmokeReport(input, options = {}) {
  const source = isRecord(input) ? input : {};
  const now = typeof options === "string" ? options : (options.now ?? new Date().toISOString());
  const targetOrigin = optionalString(source.target_origin);
  const actor = optionalString(source.actor);
  const inputChecks = normalizeInputChecks(source);
  const operatorEvidenceRequired = true;
  const operatorEvidence = normalizeOperatorEvidence(source);
  const operatorValidation = validateOperatorEvidence(operatorEvidence, operatorEvidenceRequired);
  const routeEvidence = source.cloudflare_route_evidence ?? source.route_evidence ?? null;

  const checks = REQUIRED_AUTHENTICATED_SMOKE_CHECKS.map((requiredCheck) =>
    normalizeCheck(requiredCheck, inputChecks.get(requiredCheck.id), source.observed_at)
  );

  const passed = checks.filter((check) => check.ok).length;
  const report = {
    generated_at: now,
    evidence_kind: REPORT_KIND,
    schema_version: REPORT_SCHEMA_VERSION,
    evidence_model_version: EVIDENCE_MODEL_VERSION,
    ok: false,
    target_origin: targetOrigin,
    actor,
    cloudflare_route_verified: source.cloudflare_route_verified === true,
    cloudflare_route_evidence: routeEvidence,
    operator_evidence_required: operatorEvidenceRequired,
    operator_evidence_verified: operatorValidation.verified,
    operator_evidence: operatorEvidence,
    summary: {
      total: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length,
      passed,
      failed: REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length - passed,
    },
    checks,
  };

  const preflightErrors = [];
  if (targetOrigin !== DEFAULT_TARGET_ORIGIN) {
    preflightErrors.push(`Authenticated smoke report target_origin must be ${DEFAULT_TARGET_ORIGIN}.`);
  }

  if (!actor) {
    preflightErrors.push("Authenticated smoke actor is required.");
  }

  if (source.cloudflare_route_verified !== true) {
    preflightErrors.push("Authenticated smoke report must set cloudflare_route_verified: true.");
  }

  if (!hasEvidence(routeEvidence)) {
    preflightErrors.push("Cloudflare route evidence is required.");
  }

  if (operatorValidation.errors.length > 0) {
    preflightErrors.push(...operatorValidation.errors);
  }

  const checkErrors = checks.flatMap((check) => {
    if (check.ok) {
      return [];
    }

    if (check.status === "missing") {
      return [`Authenticated smoke report is missing ${check.id}.`];
    }

    return [`Authenticated smoke check ${check.id} is blocked: ${check.status}.`];
  });

  report.ok = preflightErrors.length === 0 && checkErrors.length === 0;
  report.errors = [...preflightErrors, ...checkErrors];
  report.warnings = operatorValidation.present ? [] : ["operator_evidence_not_supplied"];
  report.validation = {
    ok: report.ok,
    errors: report.errors,
    warnings: report.warnings,
  };

  return report;
}

function parseArgs(argv) {
  const options = {
    inputPath: null,
    outPath: null,
    json: false,
    template: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--template") {
      options.template = true;
    } else if (arg === "--input") {
      const inputPath = argv[index + 1];
      if (!inputPath) {
        throw new Error("--input requires a path.");
      }
      options.inputPath = inputPath;
      index += 1;
    } else if (arg === "--out") {
      const outPath = argv[index + 1];
      if (!outPath) {
        throw new Error("--out requires a path.");
      }
      options.outPath = outPath;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.template && options.inputPath) {
    throw new Error("--template and --input are mutually exclusive.");
  }

  if (!options.template && !options.inputPath && !options.help) {
    throw new Error("--input is required unless --template is used.");
  }

  return options;
}

async function writeJson(outPath, value) {
  const resolved = resolveRepoPath(outPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(usage());
    return 0;
  }

  if (options.template) {
    const template = buildAuthenticatedSmokeInputTemplate();
    if (options.outPath) {
      await writeJson(options.outPath, template);
    }

    console.log(
      options.json
        ? JSON.stringify(template, null, 2)
        : `Authenticated smoke input template
Checks: ${REQUIRED_AUTHENTICATED_SMOKE_CHECKS.length}
Target origin: ${DEFAULT_TARGET_ORIGIN}
Operator evidence required: true`
    );
    return 0;
  }

  const input = JSON.parse(await readFile(resolveRepoPath(options.inputPath), "utf8"));
  const report = buildAuthenticatedSmokeReport(input);

  if (options.outPath) {
    await writeJson(options.outPath, report);
  }

  console.log(options.json ? JSON.stringify(report, null, 2) : usage());
  return report.ok ? 0 : 1;
}

const isCliEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliEntrypoint) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 1;
  }
}

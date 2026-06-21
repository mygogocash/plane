import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

function usage() {
  return `Usage: node apps/cloudflare/tools/cutover-readiness.mjs [--json] [--root <repo-root>] [--phase phase-07|phase-08|all]

Checks whether the Manut Cloudflare migration has enough evidence to cut over
production and decommission GKE/GCP. This command is non-destructive: it only
reads local files and environment variables.

Exit codes:
  0  all cutover and decommission gates have evidence
  1  one or more required gates are blocked
  2  usage error

Optional evidence environment variables:
  CLOUDFLARE_PREVIEW_SMOKE_REPORT
  CLOUDFLARE_PRODUCTION_DEPLOY_REPORT
  D1_IMPORT_VALIDATION_REPORT
  R2_MANIFEST_VALIDATION_REPORT
  LIVE_SHADOW_TEST_REPORT
  AUTHENTICATED_SMOKE_REPORT
  BETTERSTACK_CUTOVER_REPORT
  SEVEN_GREEN_DAYS_REPORT

Approval environment variables:
  CUTOVER_APPROVED=true`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    phase: "phase-07",
    root: null,
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

    if (arg === "--root") {
      const root = argv[index + 1];
      if (!root) {
        throw new Error("--root requires a path");
      }
      options.root = root;
      index += 1;
      continue;
    }

    if (arg === "--phase") {
      const phase = argv[index + 1];
      if (!phase || !["phase-07", "phase-08", "all"].includes(phase)) {
        throw new Error("--phase must be phase-07, phase-08, or all");
      }
      options.phase = phase;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function findRepoRoot(startPath) {
  let currentPath = path.resolve(startPath);

  while (true) {
    const markerPath = path.join(currentPath, "process/features/cloudflare-stack-migration");
    if (existsSync(markerPath)) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return path.resolve(startPath);
    }

    currentPath = parentPath;
  }
}

async function fileStatus(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return { exists: false, sizeBytes: 0 };
    }
    return { exists: true, sizeBytes: fileStat.size };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { exists: false, sizeBytes: 0 };
    }
    throw error;
  }
}

function phaseFile(root, relativePath) {
  return path.resolve(root, relativePath);
}

async function requiredFileCheck({ id, label, phase, root, relativePath, remediation }) {
  const absolutePath = phaseFile(root, relativePath);
  const status = await fileStatus(absolutePath);

  return {
    id,
    label,
    phase,
    status: status.exists ? "pass" : "blocked",
    evidence: path.relative(root, absolutePath),
    size_bytes: status.exists ? status.sizeBytes : null,
    remediation: status.exists ? null : remediation,
  };
}

async function envFileCheck({ id, label, phase, root, envName, relativePath, remediation }) {
  const rawPath = process.env[envName] ?? relativePath;

  if (!rawPath) {
    return {
      id,
      label,
      phase,
      status: "blocked",
      evidence: null,
      env: envName,
      remediation: remediation ?? `Set ${envName} to a local evidence report path.`,
    };
  }

  const absolutePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(root, rawPath);
  const status = await fileStatus(absolutePath);
  const jsonValidation = status.exists ? await validateEvidenceJson(absolutePath) : { ok: true };

  return {
    id,
    label,
    phase,
    status: status.exists && jsonValidation.ok ? "pass" : "blocked",
    evidence: path.relative(root, absolutePath),
    env: process.env[envName] ? envName : null,
    size_bytes: status.exists ? status.sizeBytes : null,
    remediation:
      status.exists && jsonValidation.ok
        ? null
        : (jsonValidation.message ?? (relativePath ? remediation : `${envName} points to a missing file.`)),
  };
}

async function validateEvidenceJson(filePath) {
  if (!filePath.endsWith(".json")) {
    return { ok: true };
  }

  try {
    const json = JSON.parse(await readFile(filePath, "utf8"));
    return json.ok === true
      ? { ok: true }
      : {
          ok: false,
          message: "Evidence JSON must contain ok: true.",
        };
  } catch (error) {
    return {
      ok: false,
      message: `Evidence JSON is invalid: ${error.message}`,
    };
  }
}

function approvalCheck() {
  const approved = process.env.CUTOVER_APPROVED === "true";

  return {
    id: "operator-cutover-approval",
    label: "Explicit operator approval",
    phase: "phase-07",
    status: approved ? "pass" : "blocked",
    evidence: approved ? "CUTOVER_APPROVED=true" : null,
    env: "CUTOVER_APPROVED",
    remediation: approved
      ? null
      : "Set CUTOVER_APPROVED=true only after maintenance window, rollback checkpoint, and operator approval are recorded.",
  };
}

async function buildReport(root, selectedPhase) {
  const localEvidence = [
    {
      id: "phase-00-baseline-report",
      label: "Phase 0 baseline evidence",
      phase: "phase-00",
      relativePath: "process/features/cloudflare-stack-migration/reports/phase-00-baseline-evidence_21-06-26.md",
      remediation: "Capture the current GKE/GCP/DNS baseline before proceeding.",
    },
    {
      id: "phase-01-foundation-report",
      label: "Phase 1 Cloudflare foundation evidence",
      phase: "phase-01",
      relativePath:
        "process/features/cloudflare-stack-migration/reports/phase-01-cloudflare-foundation-evidence_21-06-26.md",
      remediation: "Record Cloudflare resource scaffold and provisioning status.",
    },
    {
      id: "phase-02-routing-report",
      label: "Phase 2 edge routing evidence",
      phase: "phase-02",
      relativePath:
        "process/features/cloudflare-stack-migration/reports/phase-02-frontend-edge-routing-evidence_21-06-26.md",
      remediation: "Capture frontend and edge routing verification.",
    },
    {
      id: "phase-03-r2-report",
      label: "Phase 3 R2 upload evidence",
      phase: "phase-03",
      relativePath:
        "process/features/cloudflare-stack-migration/reports/phase-03-r2-upload-migration-evidence_21-06-26.md",
      remediation: "Capture R2 upload compatibility and manifest validation evidence.",
    },
    {
      id: "phase-04-d1-report",
      label: "Phase 4 D1 backend evidence",
      phase: "phase-04",
      relativePath:
        "process/features/cloudflare-stack-migration/reports/phase-04-d1-backend-rewrite-evidence_21-06-26.md",
      remediation: "Capture D1 schema/import and API contract evidence.",
    },
    {
      id: "phase-05-live-report",
      label: "Phase 5 queues/cache/live evidence",
      phase: "phase-05",
      relativePath:
        "process/features/cloudflare-stack-migration/reports/phase-05-queues-cache-live-evidence_21-06-26.md",
      remediation: "Capture Queue, KV, Durable Object, and live shadow evidence.",
    },
    {
      id: "phase-06-cicd-report",
      label: "Phase 6 Cloudflare CI/CD evidence",
      phase: "phase-06",
      relativePath: "process/features/cloudflare-stack-migration/reports/phase-06-cloudflare-cicd-evidence_21-06-26.md",
      remediation: "Capture workflow, dry-run, and manual deploy gate evidence.",
    },
    {
      id: "phase-07-cutover-plan",
      label: "Phase 7 production cutover plan",
      phase: "phase-07",
      relativePath: "process/features/cloudflare-stack-migration/active/phase-07-production-cutover_PLAN_21-06-26.md",
      remediation: "Create the production cutover plan before any DNS change.",
    },
    {
      id: "phase-08-decommission-plan",
      label: "Phase 8 decommission plan",
      phase: "phase-08",
      relativePath: "process/features/cloudflare-stack-migration/active/phase-08-decommission_PLAN_21-06-26.md",
      remediation: "Create the decommission plan before removing rollback resources.",
    },
  ];

  const externalEvidence = [
    {
      id: "cloudflare-preview-smoke",
      label: "Cloudflare preview smoke",
      phase: "phase-07",
      envName: "CLOUDFLARE_PREVIEW_SMOKE_REPORT",
      relativePath:
        "process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-preview-smoke_21-06-26.json",
      remediation: "Run a preview Worker/Page smoke and record HTTP/status/headers.",
    },
    {
      id: "cloudflare-production-deploy",
      label: "Cloudflare production deploy evidence",
      phase: "phase-07",
      envName: "CLOUDFLARE_PRODUCTION_DEPLOY_REPORT",
      relativePath:
        "process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-deploy_21-06-26.json",
      remediation: "Record the manually dispatched Cloudflare production deploy run.",
    },
    {
      id: "d1-import-validation",
      label: "D1 import validation",
      phase: "phase-07",
      envName: "D1_IMPORT_VALIDATION_REPORT",
      relativePath: "process/features/cloudflare-stack-migration/reports/phase-07-d1-import-validation_21-06-26.json",
      remediation: "Import the final Postgres delta into D1 and record row-count and relationship checks.",
    },
    {
      id: "r2-manifest-validation",
      label: "R2 upload manifest validation",
      phase: "phase-07",
      envName: "R2_MANIFEST_VALIDATION_REPORT",
      relativePath: "process/features/cloudflare-stack-migration/reports/phase-07-r2-manifest-validation_21-06-26.json",
      remediation: "Compare final GCS and R2 manifests and record object count/checksum results.",
    },
    {
      id: "live-shadow-validation",
      label: "Live shadow validation",
      phase: "phase-07",
      envName: "LIVE_SHADOW_TEST_REPORT",
      relativePath: "process/features/cloudflare-stack-migration/reports/phase-07-live-shadow-validation_21-06-26.json",
      remediation: "Run Durable Object live shadow tests against representative rooms.",
    },
    {
      id: "authenticated-smoke",
      label: "Authenticated production smoke",
      phase: "phase-07",
      envName: "AUTHENTICATED_SMOKE_REPORT",
      relativePath: "process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json",
      remediation: "Record login, workspace, project, work-item, upload, admin, and public-space smoke evidence.",
    },
    {
      id: "betterstack-cutover-green",
      label: "Better Stack cutover monitors green",
      phase: "phase-07",
      envName: "BETTERSTACK_CUTOVER_REPORT",
      relativePath: "process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json",
      remediation: "Record green monitors for manut.xyz, app.manut.xyz, and /api/instances/.",
    },
    {
      id: "phase8-seven-green-days",
      label: "Seven green days before decommission",
      phase: "phase-08",
      envName: "SEVEN_GREEN_DAYS_REPORT",
      relativePath: "process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json",
      remediation: "Wait 7 green days after cutover and record Better Stack/runtime evidence.",
    },
  ];

  const checks = [
    ...(await Promise.all(localEvidence.map((check) => requiredFileCheck({ ...check, root })))),
    ...(await Promise.all(externalEvidence.map((check) => envFileCheck({ ...check, root })))),
    approvalCheck(),
  ];

  const phase7Checks = checks.filter((check) => check.phase !== "phase-08");
  const phase8Checks = checks;
  const selectedChecks = selectedPhase === "all" ? checks : selectedPhase === "phase-08" ? phase8Checks : phase7Checks;
  const blocked = checks.filter((check) => check.status === "blocked");
  const selectedBlocked = selectedChecks.filter((check) => check.status === "blocked");

  return {
    generated_at: new Date().toISOString(),
    selected_phase: selectedPhase,
    status: selectedBlocked.length === 0 ? "ready" : "blocked",
    phase7_cutover_ready: phase7Checks.every((check) => check.status === "pass"),
    phase8_decommission_ready: phase8Checks.every((check) => check.status === "pass"),
    summary: {
      total: checks.length,
      passed: checks.length - blocked.length,
      blocked: blocked.length,
    },
    selected_summary: {
      total: selectedChecks.length,
      passed: selectedChecks.length - selectedBlocked.length,
      blocked: selectedBlocked.length,
    },
    checks,
  };
}

function printHumanReport(report) {
  console.log(`Cutover readiness: ${report.status.toUpperCase()}`);
  console.log(`Selected gate: ${report.selected_phase}`);
  console.log(`Phase 7 cutover ready: ${report.phase7_cutover_ready ? "yes" : "no"}`);
  console.log(`Phase 8 decommission ready: ${report.phase8_decommission_ready ? "yes" : "no"}`);
  console.log(`Selected checks passed: ${report.selected_summary.passed}/${report.selected_summary.total}`);
  console.log(`All checks passed: ${report.summary.passed}/${report.summary.total}`);

  const blocked = report.checks.filter((check) => {
    if (report.selected_phase === "all") {
      return check.status === "blocked";
    }
    if (report.selected_phase === "phase-08") {
      return check.status === "blocked";
    }
    return check.status === "blocked" && check.phase !== "phase-08";
  });
  if (blocked.length === 0) {
    return;
  }

  console.log("");
  console.log("Blocked gates:");
  for (const check of blocked) {
    console.log(`- ${check.id}: ${check.remediation}`);
  }
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Cutover readiness failed: ${error.message}`);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const root = path.resolve(options.root ?? findRepoRoot(process.cwd()));
  const report = await buildReport(root, options.phase);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exitCode = report.status === "ready" ? 0 : 1;
}

main().catch((error) => {
  console.error(`Cutover readiness failed: ${error.message}`);
  process.exitCode = 2;
});

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { findRepoRoot, resolveRepoPath } from "./path-utils.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = findRepoRoot(packageRoot);
const defaultReportsDir = "process/features/cloudflare-stack-migration/reports";

const reportFiles = {
  d1: "phase-07-d1-import-validation_21-06-26.json",
  r2: "phase-07-r2-manifest-validation_21-06-26.json",
  authenticatedSmoke: "phase-07-authenticated-smoke_21-06-26.json",
  betterstack: "phase-07-betterstack-cutover_21-06-26.json",
  operatorApproval: "phase-07-operator-cutover-approval_21-06-26.json",
  sevenGreenDays: "phase-08-seven-green-days_21-06-26.json",
};

function usage() {
  return `Usage: node apps/cloudflare/tools/collect-cutover-evidence.mjs [--json] [--out <summary.json>] [--reports-dir <dir>] [--dry-run] [--soft-fail] [--skip-betterstack]

Runs the remaining non-destructive Phase 7 and Phase 8 evidence collectors for
Manut Cloudflare cutover. This command does not change DNS, routing, data,
Cloudflare resources, GCP resources, or Kubernetes resources.

Required environment for local evidence:
  D1_POSTGRES_COUNTS
  D1_D1_COUNTS
  D1_RELATIONSHIPS
  R2_GCS_MANIFEST
  R2_R2_MANIFEST
  AUTHENTICATED_SMOKE_INPUT
  OPERATOR_APPROVAL_INPUT
  SEVEN_GREEN_DAYS_INPUT

Required environment for live Better Stack evidence:
  BETTERSTACK_API_TOKEN

Exit codes:
  0  all evidence tasks passed, or --soft-fail was supplied
  1  one or more evidence tasks failed or were skipped
  2  usage error`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    outPath: null,
    reportsDir: defaultReportsDir,
    dryRun: false,
    softFail: false,
    skipBetterstack: false,
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

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--soft-fail") {
      options.softFail = true;
      continue;
    }

    if (arg === "--skip-betterstack") {
      options.skipBetterstack = true;
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

    if (arg === "--reports-dir") {
      const reportsDir = argv[index + 1];
      if (!reportsDir) {
        throw new Error("--reports-dir requires a path");
      }
      options.reportsDir = reportsDir;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function reportPath(reportsDir, filename) {
  return path.join(reportsDir, filename);
}

function commandToString(args) {
  return ["node", ...args].join(" ");
}

function missingEnv(names, env = process.env) {
  return names.filter((name) => !env[name] || env[name].trim() === "");
}

function buildTasks(reportsDir, options, env = process.env) {
  const tasks = [
    {
      id: "d1-import-validation",
      label: "D1 final import validation",
      phase: "phase-07",
      requiredEnv: ["D1_POSTGRES_COUNTS", "D1_D1_COUNTS", "D1_RELATIONSHIPS"],
      reportPath: reportPath(reportsDir, reportFiles.d1),
      command: () => [
        "tools/validate-d1-import.mjs",
        env.D1_POSTGRES_COUNTS,
        env.D1_D1_COUNTS,
        "--relationships",
        env.D1_RELATIONSHIPS,
        "--json",
        "--out",
        reportPath(reportsDir, reportFiles.d1),
      ],
    },
    {
      id: "r2-manifest-validation",
      label: "R2 upload manifest validation",
      phase: "phase-07",
      requiredEnv: ["R2_GCS_MANIFEST", "R2_R2_MANIFEST"],
      reportPath: reportPath(reportsDir, reportFiles.r2),
      command: () => [
        "tools/compare-upload-manifests.mjs",
        env.R2_GCS_MANIFEST,
        env.R2_R2_MANIFEST,
        "--require-checksum",
        "--json",
        "--out",
        reportPath(reportsDir, reportFiles.r2),
      ],
    },
    {
      id: "authenticated-smoke",
      label: "Authenticated production smoke",
      phase: "phase-07",
      requiredEnv: ["AUTHENTICATED_SMOKE_INPUT"],
      reportPath: reportPath(reportsDir, reportFiles.authenticatedSmoke),
      command: () => [
        "tools/authenticated-smoke-report.mjs",
        "--input",
        env.AUTHENTICATED_SMOKE_INPUT,
        "--json",
        "--out",
        reportPath(reportsDir, reportFiles.authenticatedSmoke),
      ],
    },
    {
      id: "betterstack-cutover-green",
      label: "Better Stack cutover monitors green",
      phase: "phase-07",
      requiredEnv: ["BETTERSTACK_API_TOKEN"],
      reportPath: reportPath(reportsDir, reportFiles.betterstack),
      skip: options.skipBetterstack ? "Skipped by --skip-betterstack." : null,
      command: () => [
        "tools/betterstack-cutover-report.mjs",
        "--json",
        "--out",
        reportPath(reportsDir, reportFiles.betterstack),
      ],
    },
    {
      id: "operator-cutover-approval",
      label: "Explicit operator cutover approval",
      phase: "phase-07",
      requiredEnv: ["OPERATOR_APPROVAL_INPUT"],
      reportPath: reportPath(reportsDir, reportFiles.operatorApproval),
      command: () => [
        "tools/operator-approval-report.mjs",
        "--input",
        env.OPERATOR_APPROVAL_INPUT,
        "--json",
        "--out",
        reportPath(reportsDir, reportFiles.operatorApproval),
      ],
    },
    {
      id: "phase8-seven-green-days",
      label: "Phase 8 seven green days evidence",
      phase: "phase-08",
      requiredEnv: ["SEVEN_GREEN_DAYS_INPUT"],
      reportPath: reportPath(reportsDir, reportFiles.sevenGreenDays),
      command: () => [
        "tools/seven-green-days-report.mjs",
        "--input",
        env.SEVEN_GREEN_DAYS_INPUT,
        "--json",
        "--out",
        reportPath(reportsDir, reportFiles.sevenGreenDays),
      ],
    },
  ];

  return tasks;
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function runTask(task, options, env = process.env) {
  if (task.skip) {
    return {
      id: task.id,
      label: task.label,
      phase: task.phase,
      status: "skipped",
      reason: task.skip,
      evidence: task.reportPath,
    };
  }

  const missing = missingEnv(task.requiredEnv, env);
  if (missing.length > 0) {
    return {
      id: task.id,
      label: task.label,
      phase: task.phase,
      status: "skipped",
      missing_env: missing,
      evidence: task.reportPath,
      remediation: `Set ${missing.join(", ")} before collecting this evidence.`,
    };
  }

  const args = task.command();
  const command = commandToString(args);

  if (options.dryRun) {
    return {
      id: task.id,
      label: task.label,
      phase: task.phase,
      status: "skipped",
      reason: "Dry run: command was not executed.",
      command,
      evidence: task.reportPath,
    };
  }

  try {
    const result = await execFileAsync("node", args, {
      cwd: packageRoot,
      env,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const report = parseJsonOutput(result.stdout);

    return {
      id: task.id,
      label: task.label,
      phase: task.phase,
      status: report?.ok === true ? "pass" : "fail",
      command,
      evidence: task.reportPath,
      report_ok: report?.ok ?? null,
      remediation:
        report?.ok === true ? null : (report?.validation_error ?? "Evidence command completed without ok:true."),
    };
  } catch (error) {
    const report = parseJsonOutput(error.stdout ?? "");
    const status = report?.ok === true ? "pass" : "fail";

    return {
      id: task.id,
      label: task.label,
      phase: task.phase,
      status,
      command,
      evidence: task.reportPath,
      report_ok: report?.ok ?? null,
      exit_code: error.status ?? error.code ?? 1,
      stderr: typeof error.stderr === "string" && error.stderr.trim() ? error.stderr.trim() : null,
      remediation: status === "pass" ? null : (report?.validation_error ?? error.message),
    };
  }
}

function summarizeTasks(tasks) {
  return {
    total: tasks.length,
    passed: tasks.filter((task) => task.status === "pass").length,
    failed: tasks.filter((task) => task.status === "fail").length,
    skipped: tasks.filter((task) => task.status === "skipped").length,
  };
}

function buildReport(tasks, options, reportsDir) {
  const summary = summarizeTasks(tasks);
  const ok = summary.total > 0 && summary.passed === summary.total;

  return {
    generated_at: new Date().toISOString(),
    ok,
    status: ok ? "ready" : "blocked",
    dry_run: options.dryRun,
    reports_dir: reportsDir,
    summary,
    tasks,
  };
}

async function writeJson(outPath, data) {
  const absoluteOutPath = resolveRepoPath(outPath, repoRoot);
  await mkdir(path.dirname(absoluteOutPath), { recursive: true });
  await writeFile(absoluteOutPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function printHumanReport(report) {
  console.log(`Cutover evidence bundle: ${report.ok ? "READY" : "BLOCKED"}`);
  console.log(`Reports dir: ${report.reports_dir}`);
  console.log(`Tasks passed: ${report.summary.passed}/${report.summary.total}`);
  console.log(`Tasks skipped: ${report.summary.skipped}`);
  console.log(`Tasks failed: ${report.summary.failed}`);
  for (const task of report.tasks) {
    console.log(`- ${task.status.toUpperCase()} ${task.id}`);
    if (task.missing_env) {
      console.log(`  missing env: ${task.missing_env.join(", ")}`);
    } else if (task.reason) {
      console.log(`  ${task.reason}`);
    } else if (task.remediation) {
      console.log(`  ${task.remediation}`);
    }
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Cutover evidence bundle failed: ${error.message}`);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const reportsDir = resolveRepoPath(options.reportsDir, repoRoot);
  await mkdir(reportsDir, { recursive: true });
  const taskDefinitions = buildTasks(reportsDir, options);
  const tasks = await Promise.all(taskDefinitions.map((task) => runTask(task, options)));

  const report = buildReport(tasks, options, reportsDir);

  if (options.outPath) {
    await writeJson(options.outPath, report);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exitCode = report.ok || options.softFail ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Cutover evidence bundle failed: ${error.message}`);
    process.exitCode = 2;
  });
}

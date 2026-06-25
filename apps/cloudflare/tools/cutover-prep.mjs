import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { findRepoRoot } from "./path-utils.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = "process/features/cloudflare-stack-migration/reports";

const BLOCKER_COMMANDS = {
  "d1-import-validation": [
    "pnpm --filter @manut/cloudflare d1:validation-queries --json --out process/features/cloudflare-stack-migration/reports/phase-07-d1-validation-query-manifest_22-06-26.json",
    "pnpm --filter @manut/cloudflare d1:source-counts --json --input <psql-counts.json> --source final-postgres-import-window --out <postgres-source-counts.json>",
    "pnpm --filter @manut/cloudflare d1:target-evidence --json --database manut-prod --out <d1-target-snapshot.json> --counts-out <d1-target-counts.json> --relationships-out <d1-target-relationships.json>",
    "pnpm --filter @manut/cloudflare d1:validate-import <postgres-source-counts.json> <d1-target-counts.json> --relationships <d1-target-relationships.json> --out process/features/cloudflare-stack-migration/reports/phase-07-d1-import-validation_21-06-26.json --json",
  ],
  "authenticated-smoke": [
    "pnpm --filter @manut/cloudflare auth:smoke-report --template --out process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json",
    "pnpm --filter @manut/cloudflare auth:smoke-report --input process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke-input_24-06-26.json --out process/features/cloudflare-stack-migration/reports/phase-07-authenticated-smoke_21-06-26.json --json",
  ],
  "betterstack-cutover-green": [
    "export BETTERSTACK_API_TOKEN=<token>",
    "pnpm --filter @manut/cloudflare betterstack:cutover-report --json --require-endpoint-probes --out process/features/cloudflare-stack-migration/reports/phase-07-betterstack-cutover_21-06-26.json",
  ],
  "operator-cutover-approval": [
    "pnpm --filter @manut/cloudflare operator:approval-report --template --out process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval-input_24-06-26.json",
    "pnpm --filter @manut/cloudflare operator:approval-report --input process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval-input_24-06-26.json --out process/features/cloudflare-stack-migration/reports/phase-07-operator-cutover-approval_21-06-26.json --json",
    "export CUTOVER_APPROVED=true",
  ],
  "cloudflare-production-smoke": [
    "export MANUT_DIAGNOSTIC_TOKEN=<token>",
    "pnpm --filter @manut/cloudflare smoke:worker -- https://manut-app.bettergogocash.workers.dev --json --out process/features/cloudflare-stack-migration/reports/phase-07-cloudflare-production-smoke_21-06-26.json",
  ],
  "phase8-seven-green-days": [
    "Use process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days-input-template_24-06-26.json",
    "pnpm --filter @manut/cloudflare seven-green-days:report --input process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days-input-template_24-06-26.json --out process/features/cloudflare-stack-migration/reports/phase-08-seven-green-days_21-06-26.json --json",
  ],
};

function usage() {
  return `Usage: node apps/cloudflare/tools/cutover-prep.mjs [--json] [--phase phase-07|phase-08|all] [--skip-templates] [--skip-evidence]

Non-destructive Phase 7/8 prep orchestrator. Runs cutover readiness, prints blocker
commands, generates input templates, and dry-runs the evidence bundle.

Does not import D1, change DNS, approve cutover, or decommission GCP.`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    phase: "all",
    skipTemplates: false,
    skipEvidence: false,
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
    if (arg === "--skip-templates") {
      options.skipTemplates = true;
      continue;
    }
    if (arg === "--skip-evidence") {
      options.skipEvidence = true;
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

async function runNodeTool(scriptName, args = []) {
  const scriptPath = path.join(packageRoot, "tools", scriptName);
  const { stdout, stderr } = await execFileAsync("node", [scriptPath, ...args], {
    cwd: packageRoot,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout, stderr };
}

async function runReadiness(phase) {
  const args = ["--json"];
  if (phase !== "all") {
    args.unshift("--phase", phase);
  }

  try {
    const { stdout } = await runNodeTool("cutover-readiness.mjs", args);
    return JSON.parse(stdout);
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
    if (stdout.trim()) {
      return JSON.parse(stdout);
    }
    throw error;
  }
}

async function generateTemplates() {
  const tasks = [
    {
      id: "authenticated-smoke-input",
      script: "authenticated-smoke-report.mjs",
      args: ["--template", "--out", `${reportsDir}/phase-07-authenticated-smoke-input_24-06-26.json`],
    },
    {
      id: "operator-approval-input",
      script: "operator-approval-report.mjs",
      args: ["--template", "--out", `${reportsDir}/phase-07-operator-cutover-approval-input_24-06-26.json`],
    },
    {
      id: "d1-validation-queries",
      script: "d1-import-validation-queries.mjs",
      args: ["--json", "--out", `${reportsDir}/phase-07-d1-validation-query-manifest_22-06-26.json`],
    },
  ];

  const results = [];
  for (const task of tasks) {
    try {
      // Templates are generated sequentially so failures stay attributable per artifact.
      // oxlint-disable-next-line no-await-in-loop
      await runNodeTool(task.script, task.args);
      results.push({ id: task.id, status: "ok" });
    } catch (error) {
      results.push({
        id: task.id,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

async function dryRunEvidence() {
  try {
    const { stdout } = await runNodeTool("collect-cutover-evidence.mjs", ["--json", "--dry-run"]);
    return { status: "ok", report: JSON.parse(stdout) };
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout) : "";
    if (stdout.trim()) {
      try {
        return { status: "partial", report: JSON.parse(stdout) };
      } catch {
        // fall through
      }
    }
    return {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildBlockerPlaybook(readiness) {
  const blocked = readiness.selected_checks.filter((check) => check.status !== "pass");
  return blocked.map((check) => ({
    id: check.id,
    label: check.label,
    phase: check.phase,
    remediation: check.remediation,
    commands: BLOCKER_COMMANDS[check.id] ?? [],
  }));
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const repoRoot = findRepoRoot(packageRoot);
  const readiness = await runReadiness(options.phase);
  const playbook = buildBlockerPlaybook(readiness);

  let templates = [];
  if (!options.skipTemplates) {
    templates = await generateTemplates();
  }

  let evidence = null;
  if (!options.skipEvidence) {
    evidence = await dryRunEvidence();
  }

  const output = {
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    selected_phase: options.phase,
    readiness: {
      status: readiness.status,
      phase7_cutover_ready: readiness.phase7_cutover_ready,
      phase8_decommission_ready: readiness.phase8_decommission_ready,
      summary: readiness.selected_summary,
    },
    blocked_playbook: playbook,
    templates,
    evidence_dry_run: evidence,
    operator_note:
      "Phase 7 cutover and Phase 8 GCP decommission require production credentials, explicit operator approval, a D1 import maintenance window, and seven elapsed green days after cutover. This command only prepares artifacts and reports blockers.",
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`Cutover prep (${options.phase})`);
    console.log(`Readiness: ${output.readiness.status}`);
    console.log(`Phase 7 ready: ${output.readiness.phase7_cutover_ready ? "yes" : "no"}`);
    console.log(`Phase 8 ready: ${output.readiness.phase8_decommission_ready ? "yes" : "no"}`);
    console.log(`Blocked checks: ${output.readiness.summary.blocked}`);
    for (const item of playbook) {
      console.log(`\n[${item.id}] ${item.label}`);
      if (item.remediation) {
        console.log(`  remediation: ${item.remediation}`);
      }
      for (const command of item.commands) {
        console.log(`  $ ${command}`);
      }
    }
    if (!options.skipTemplates) {
      console.log(
        `\nTemplates: ${templates.filter((item) => item.status === "ok").length}/${templates.length} generated`
      );
    }
  }

  return output.readiness.status === "ready" ? 0 : 1;
}

const isCliEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCliEntrypoint) {
  main().then(
    (code) => {
      process.exitCode = code;
      return code;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      console.error(usage());
      process.exitCode = 2;
    }
  );
}

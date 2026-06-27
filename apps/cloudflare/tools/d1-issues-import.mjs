import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildIssuesImportSql } from "./d1-issues-sql.mjs";
import { buildStatesImportSql } from "./d1-states-sql.mjs";
import { exportJsonObjectFromDockerPostgres } from "./postgres-docker-export.mjs";
import { KUBECTL_ISSUES_EXPORT_PYTHON, POSTGRES_ISSUES_EXPORT_QUERY } from "./postgres-issues-export-manifest.mjs";
import { POSTGRES_STATES_EXPORT_QUERY } from "./postgres-states-export-manifest.mjs";
import { resolveRepoPath } from "./path-utils.mjs";

function usage() {
  return `Usage: node apps/cloudflare/tools/d1-issues-import.mjs [--input <export.json>] [--from-kubectl] [--from-docker] [--sql-out <import.sql>] [--json] [--out <report.json>]

Builds Slice 4 states + issues import SQL for production D1.
Use --from-kubectl, --from-docker (plane-db), or --input JSON with:
  {"issues":[...], "states":[...]}`;
}

function parseArgs(argv) {
  const options = {
    inputPath: null,
    fromKubectl: false,
    fromDocker: false,
    dockerContainer: "plane-db",
    sqlOutPath: null,
    outPath: null,
    json: false,
    help: false,
    kubectlNamespace: "plane-ce",
    kubectlDeployment: "plane-app-api-wl",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--from-kubectl") {
      options.fromKubectl = true;
    } else if (arg === "--from-docker") {
      options.fromDocker = true;
    } else if (arg === "--docker-container") {
      options.dockerContainer = argv[index + 1];
      if (!options.dockerContainer) {
        throw new Error("--docker-container requires a name");
      }
      index += 1;
    } else if (arg === "--input") {
      options.inputPath = argv[index + 1];
      if (!options.inputPath) {
        throw new Error("--input requires a path");
      }
      index += 1;
    } else if (arg === "--sql-out") {
      options.sqlOutPath = argv[index + 1];
      if (!options.sqlOutPath) {
        throw new Error("--sql-out requires a path");
      }
      index += 1;
    } else if (arg === "--out") {
      options.outPath = argv[index + 1];
      if (!options.outPath) {
        throw new Error("--out requires a path");
      }
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.inputPath && !options.fromKubectl && !options.fromDocker) {
    throw new Error("Provide --input <json>, --from-kubectl, or --from-docker");
  }

  return options;
}

function normalizePayload(raw) {
  return {
    issues: raw.issues ?? [],
    states: raw.states ?? [],
  };
}

function exportIssuesFromKubectl(options) {
  const stdout = execFileSync(
    "kubectl",
    [
      "exec",
      "-n",
      options.kubectlNamespace,
      `deploy/${options.kubectlDeployment}`,
      "--",
      "python",
      "-c",
      KUBECTL_ISSUES_EXPORT_PYTHON,
    ],
    { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
  );

  return normalizePayload(JSON.parse(stdout));
}

function exportIssuesFromDocker(options) {
  const issues = exportJsonObjectFromDockerPostgres({
    container: options.dockerContainer,
    query: POSTGRES_ISSUES_EXPORT_QUERY,
  }).rows;
  const states = exportJsonObjectFromDockerPostgres({
    container: options.dockerContainer,
    query: POSTGRES_STATES_EXPORT_QUERY,
  }).rows;

  return normalizePayload({ issues, states });
}

export function buildIssuesImportReport(payload, { generatedAt = new Date().toISOString(), source = "postgres" } = {}) {
  const { issues, states } = normalizePayload(payload);
  const sql = `BEGIN TRANSACTION;\n${buildStatesImportSql({ states })}${buildIssuesImportSql({ issues })}COMMIT;\n`;

  return {
    ok: true,
    evidence_kind: "d1-issues-import",
    schema_version: 2,
    generated_at: generatedAt,
    source,
    counts: {
      issues: issues.length,
      states: states.length,
    },
    sql,
  };
}

async function writeJson(filePath, value) {
  const resolvedPath = resolveRepoPath(filePath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolvedPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const payload = options.fromKubectl
    ? exportIssuesFromKubectl(options)
    : options.fromDocker
      ? exportIssuesFromDocker(options)
      : normalizePayload(JSON.parse(await readFile(resolveRepoPath(options.inputPath), "utf8")));

  const report = buildIssuesImportReport(payload, {
    source: options.fromKubectl
      ? "kubectl:plane-ce/plane-app-api-wl"
      : options.fromDocker
        ? `docker:${options.dockerContainer}`
        : options.inputPath,
  });

  if (options.sqlOutPath) {
    const sqlPath = resolveRepoPath(options.sqlOutPath);
    await mkdir(path.dirname(sqlPath), { recursive: true });
    await writeFile(sqlPath, report.sql, "utf8");
    report.sql_out = sqlPath;
  }

  if (options.outPath) {
    await writeJson(options.outPath, report);
  }

  if (options.json) {
    const { sql, ...jsonReport } = report;
    console.log(JSON.stringify({ ...jsonReport, sql_byte_length: sql.length }, null, 2));
  } else {
    console.log("D1 work items import SQL generated.");
    console.log(`Counts: states=${report.counts.states}, issues=${report.counts.issues}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`D1 issues import failed: ${error.message}`);
    process.exitCode = 2;
  });
}

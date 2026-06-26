import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildIssuesImportSql } from "./d1-issues-sql.mjs";
import { KUBECTL_ISSUES_EXPORT_PYTHON } from "./postgres-issues-export-manifest.mjs";
import { resolveRepoPath } from "./path-utils.mjs";

function usage() {
  return `Usage: node apps/cloudflare/tools/d1-issues-import.mjs [--input <issues-export.json>] [--from-kubectl] [--sql-out <import.sql>] [--json] [--out <report.json>]

Builds Slice 4 issue import SQL for the D1 issues table.
Use --from-kubectl to export live rows from the plane-ce API pod, or pass --input JSON with:
  {"issues":[...]}`;
}

function parseArgs(argv) {
  const options = {
    inputPath: null,
    fromKubectl: false,
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

  if (!options.help && !options.inputPath && !options.fromKubectl) {
    throw new Error("Provide --input <json> or --from-kubectl");
  }

  return options;
}

function normalizePayload(raw) {
  return { issues: raw.issues ?? [] };
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

export function buildIssuesImportReport(payload, { generatedAt = new Date().toISOString(), source = "postgres" } = {}) {
  const { issues } = normalizePayload(payload);
  const sql = buildIssuesImportSql({ issues });

  return {
    ok: true,
    evidence_kind: "d1-issues-import",
    schema_version: 1,
    generated_at: generatedAt,
    source,
    counts: {
      issues: issues.length,
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
    : normalizePayload(JSON.parse(await readFile(resolveRepoPath(options.inputPath), "utf8")));

  const report = buildIssuesImportReport(payload, {
    source: options.fromKubectl ? "kubectl:plane-ce/plane-app-api-wl" : options.inputPath,
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
    console.log("D1 issues import SQL generated.");
    console.log(`Counts: issues=${report.counts.issues}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`D1 issues import failed: ${error.message}`);
    process.exitCode = 2;
  });
}

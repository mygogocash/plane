import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildIdentityImportSql } from "./d1-identity-sql.mjs";
import { KUBECTL_IDENTITY_EXPORT_PYTHON } from "./postgres-identity-export-manifest.mjs";
import { resolveRepoPath } from "./path-utils.mjs";

function usage() {
  return `Usage: node apps/cloudflare/tools/d1-identity-import.mjs [--input <identity-export.json>] [--from-kubectl] [--sql-out <import.sql>] [--json] [--out <report.json>]

Builds Slice 1 identity import SQL for users, profiles, and workspace_members.
Use --from-kubectl to export live rows from the plane-ce API pod, or pass --input JSON with:
  {"users":[...],"profiles":[...],"workspace_members":[...]}`;
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
  const users = raw.users ?? [];
  const profiles = raw.profiles ?? [];
  const workspaceMembers = raw.workspace_members ?? raw.workspaceMembers ?? [];
  const projectLogoProps = raw.project_logo_props ?? raw.projectLogoProps ?? [];

  return { users, profiles, workspaceMembers, projectLogoProps };
}

function exportIdentityFromKubectl(options) {
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
      KUBECTL_IDENTITY_EXPORT_PYTHON,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );

  return normalizePayload(JSON.parse(stdout));
}

export function buildIdentityImportReport(
  payload,
  { generatedAt = new Date().toISOString(), source = "postgres" } = {}
) {
  const { users, profiles, workspaceMembers, projectLogoProps } = normalizePayload(payload);
  const sql = buildIdentityImportSql({ users, profiles, workspaceMembers, projectLogoProps });

  return {
    ok: true,
    evidence_kind: "d1-identity-import",
    schema_version: 1,
    generated_at: generatedAt,
    source,
    counts: {
      users: users.length,
      profiles: profiles.length,
      workspace_members: workspaceMembers.length,
      project_logo_props: projectLogoProps.length,
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
    ? exportIdentityFromKubectl(options)
    : normalizePayload(JSON.parse(await readFile(resolveRepoPath(options.inputPath), "utf8")));

  const report = buildIdentityImportReport(payload, {
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
    console.log("D1 identity import SQL generated.");
    console.log(
      `Counts: users=${report.counts.users}, profiles=${report.counts.profiles}, workspace_members=${report.counts.workspace_members}, project_logo_props=${report.counts.project_logo_props}`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`D1 identity import failed: ${error.message}`);
    process.exitCode = 2;
  });
}

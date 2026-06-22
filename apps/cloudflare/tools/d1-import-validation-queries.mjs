import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

export const D1_VALIDATION_TABLES = [
  {
    table: "workspaces",
    source_table: "workspaces",
    target_table: "workspaces",
    where: "deleted_at IS NULL",
  },
  {
    table: "projects",
    source_table: "projects",
    target_table: "projects",
    where: "deleted_at IS NULL",
  },
];

export const D1_VALIDATION_RELATIONSHIPS = [
  {
    name: "projects.workspace_id",
    source: "projects",
    target: "workspaces",
    source_alias: "p",
    target_alias: "w",
    source_key: "workspace_id",
    target_key: "id",
    source_where: "p.deleted_at IS NULL",
    target_where: "w.deleted_at IS NULL",
  },
];

function usage() {
  return `Usage: node apps/cloudflare/tools/d1-import-validation-queries.mjs [--json] [--out <manifest.json>] [--sql-dir <dir>] [--generated-at <iso>]

Builds the SQL query manifest for final Phase 7 D1 import validation inputs.
The generated scope matches the current D1 shadow slice: active workspaces,
active projects, and projects.workspace_id -> workspaces.id orphan checks.`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    outPath: null,
    sqlDir: null,
    generatedAt: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--out requires a path");
      }
      options.outPath = value;
      index += 1;
    } else if (arg === "--sql-dir") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--sql-dir requires a directory");
      }
      options.sqlDir = value;
      index += 1;
    } else if (arg === "--generated-at") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--generated-at requires an ISO timestamp");
      }
      options.generatedAt = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function countSelect(table, dialect) {
  const countExpression = dialect === "postgres" ? "COUNT(*)::bigint" : "COUNT(*)";
  const tableName = dialect === "postgres" ? table.source_table : table.target_table;

  return `SELECT '${table.table}' AS table_name, ${countExpression} AS count
FROM ${tableName}
WHERE ${table.where}`;
}

function buildCountSql(dialect) {
  return `${D1_VALIDATION_TABLES.map((table) => countSelect(table, dialect)).join("\nUNION ALL\n")}
ORDER BY table_name;
`;
}

function buildRelationshipSql() {
  return `${D1_VALIDATION_RELATIONSHIPS.map(
    (relationship) => `SELECT
  '${relationship.name}' AS name,
  '${relationship.source}' AS source,
  '${relationship.target}' AS target,
  COUNT(*) AS orphan_count
FROM ${relationship.source} ${relationship.source_alias}
LEFT JOIN ${relationship.target} ${relationship.target_alias}
  ON ${relationship.target_alias}.${relationship.target_key} = ${relationship.source_alias}.${relationship.source_key}
  AND ${relationship.target_where}
WHERE ${relationship.source_where}
  AND ${relationship.target_alias}.${relationship.target_key} IS NULL`
  ).join("\nUNION ALL\n")}
ORDER BY name;
`;
}

export function buildD1ValidationQueries({ generatedAt = new Date().toISOString(), files = null } = {}) {
  return {
    ok: true,
    evidence_kind: "d1-import-validation-queries",
    schema_version: 1,
    generated_at: generatedAt,
    scope: "active-workspaces-projects-shadow-read",
    tables: D1_VALIDATION_TABLES.map(({ table, source_table, target_table, where }) => ({
      table,
      source_table,
      target_table,
      where,
    })),
    relationships: D1_VALIDATION_RELATIONSHIPS.map(
      ({ name, source, target, source_key, target_key, source_where, target_where }) => ({
        name,
        source,
        target,
        source_key,
        target_key,
        source_where,
        target_where,
      })
    ),
    postgres_count_sql: buildCountSql("postgres"),
    d1_count_sql: buildCountSql("d1"),
    d1_relationship_sql: buildRelationshipSql(),
    files,
  };
}

async function writeJson(filePath, value) {
  const resolvedPath = resolveRepoPath(filePath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolvedPath;
}

async function writeText(filePath, value) {
  const resolvedPath = resolveRepoPath(filePath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, value, "utf8");
  return resolvedPath;
}

async function writeSqlFiles(sqlDir, report) {
  const resolvedDir = resolveRepoPath(sqlDir);
  const files = {
    postgres_count_sql: path.join(resolvedDir, "postgres-counts.sql"),
    d1_count_sql: path.join(resolvedDir, "d1-counts.sql"),
    d1_relationship_sql: path.join(resolvedDir, "d1-relationships.sql"),
  };

  await writeText(files.postgres_count_sql, report.postgres_count_sql);
  await writeText(files.d1_count_sql, report.d1_count_sql);
  await writeText(files.d1_relationship_sql, report.d1_relationship_sql);

  return files;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  let report = buildD1ValidationQueries({ generatedAt: options.generatedAt ?? new Date().toISOString() });

  if (options.sqlDir) {
    const files = await writeSqlFiles(options.sqlDir, report);
    report = buildD1ValidationQueries({
      generatedAt: report.generated_at,
      files,
    });
  }

  if (options.outPath) {
    await writeJson(options.outPath, report);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("D1 import validation queries generated.");
    console.log(`Tables: ${report.tables.map((table) => table.table).join(", ")}`);
    console.log(`Relationships: ${report.relationships.map((relationship) => relationship.name).join(", ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`D1 import validation query generation failed: ${error.message}`);
    process.exitCode = 2;
  });
}

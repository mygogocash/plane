import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { buildD1ImportValidationNextSteps, buildD1ImportValidationRunbook } from "./d1-import-validation-contract.mjs";
import { buildD1ValidationQueries } from "./d1-import-validation-queries.mjs";
import { resolveRepoPath } from "./path-utils.mjs";

const execFileAsync = promisify(execFile);

function usage() {
  return `Usage: node apps/cloudflare/tools/collect-d1-target-evidence.mjs [--database <name>] [--local] [--json] [--out <summary.json>] [--counts-out <counts.json>] [--relationships-out <relationships.json>]

Collects the D1-side target inputs required by final Phase 7 import validation.
This command is read-only. It does not import data, mutate D1, change routing, or
mark cutover ready.

Defaults:
  --database defaults to D1_TARGET_DATABASE, D1_DATABASE_NAME, or manut-prod
  remote D1 is used unless --local is supplied

Exit codes:
  0  D1 target inputs were collected
  1  D1 target was collected but required counts are empty
  2  usage or collection error`;
}

function parseArgs(argv) {
  const options = {
    database: process.env.D1_TARGET_DATABASE || process.env.D1_DATABASE_NAME || "manut-prod",
    local: false,
    json: false,
    outPath: null,
    countsOutPath: null,
    relationshipsOutPath: null,
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
    } else if (arg === "--local") {
      options.local = true;
    } else if (arg === "--database") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--database requires a value");
      }
      options.database = value;
      index += 1;
    } else if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--out requires a path");
      }
      options.outPath = value;
      index += 1;
    } else if (arg === "--counts-out") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--counts-out requires a path");
      }
      options.countsOutPath = value;
      index += 1;
    } else if (arg === "--relationships-out") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--relationships-out requires a path");
      }
      options.relationshipsOutPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceNonNegativeInteger(value, label) {
  const numberValue = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }

  return numberValue;
}

function normalizeOutputPath(filePath) {
  return filePath ? path.normalize(filePath) : null;
}

function throwIfRunnerFailed(wrapper, label) {
  const hasFailureStatus = "success" in wrapper && wrapper.success !== true;
  const errors = wrapper.errors ?? wrapper.error;
  const hasErrors = Array.isArray(errors) ? errors.length > 0 : Boolean(errors);

  if (hasFailureStatus || hasErrors) {
    const detail = hasErrors ? `: ${JSON.stringify(errors)}` : "";
    throw new Error(`${label} SQL runner reported failure${detail}`);
  }
}

export function unwrapWranglerRows(json, label) {
  if (Array.isArray(json) && json.length === 1 && isRecord(json[0]) && Array.isArray(json[0].results)) {
    throwIfRunnerFailed(json[0], label);
    return json[0].results;
  }

  if (isRecord(json) && Array.isArray(json.results)) {
    throwIfRunnerFailed(json, label);
    return json.results;
  }

  if (isRecord(json) && Array.isArray(json.rows)) {
    throwIfRunnerFailed(json, label);
    return json.rows;
  }

  throw new Error(`${label} must be Wrangler JSON with results or rows`);
}

function normalizeCountRows(rows) {
  const counts = {};

  for (const [index, row] of rows.entries()) {
    if (!isRecord(row)) {
      throw new Error(`count_rows[${index}] must be an object`);
    }

    const table = row.table_name ?? row.table ?? row.name;
    if (typeof table !== "string" || table.length === 0) {
      throw new Error(`count_rows[${index}] is missing table_name/table/name`);
    }

    if (Object.hasOwn(counts, table)) {
      throw new Error(`Duplicate count table: ${table}`);
    }

    counts[table] = coerceNonNegativeInteger(row.count ?? row.rows ?? row.row_count, `count for ${table}`);
  }

  return counts;
}

function normalizeRelationshipRows(rows) {
  return rows.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`relationship_rows[${index}] must be an object`);
    }

    const name = row.name ?? row.relationship ?? row.id;
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`relationship_rows[${index}] is missing name/relationship/id`);
    }

    const orphanCount = coerceNonNegativeInteger(
      row.orphan_count ?? row.orphanCount ?? row.count ?? row.rows,
      `orphan count for ${name}`
    );

    return {
      name,
      ok: orphanCount === 0,
      source: typeof row.source === "string" ? row.source : null,
      target: typeof row.target === "string" ? row.target : null,
      orphan_count: orphanCount,
    };
  });
}

export function buildD1TargetEvidence({
  database,
  generatedAt = new Date().toISOString(),
  local = false,
  countRows,
  relationshipRows,
  outputFiles = null,
}) {
  const counts = normalizeCountRows(countRows);
  const relationshipChecks = normalizeRelationshipRows(relationshipRows);
  const queries = buildD1ValidationQueries({ generatedAt });
  const requiredTables = queries.tables.map((table) => table.table);
  const requiredRelationships = queries.relationships.map((relationship) => relationship.name);
  const missingTables = requiredTables.filter((table) => !Object.hasOwn(counts, table));
  const missingRelationships = requiredRelationships.filter(
    (relationship) => !relationshipChecks.some((check) => check.name === relationship)
  );
  const requiredTotalRows = requiredTables.reduce((total, table) => total + (counts[table] ?? 0), 0);
  const failedRelationships = relationshipChecks.filter((check) => !check.ok);
  const validationInputReady =
    missingTables.length === 0 && missingRelationships.length === 0 && failedRelationships.length === 0;
  const finalImportReady = validationInputReady && requiredTotalRows > 0;
  const operatorRunbook = buildD1ImportValidationRunbook({
    targetCounts: outputFiles?.counts,
    relationships: outputFiles?.relationships,
  });

  return {
    generated_at: generatedAt,
    evidence_kind: "d1-target-snapshot",
    schema_version: 1,
    ok: finalImportReady,
    database,
    mode: local ? "local" : "remote",
    final_import_ready: finalImportReady,
    final_import_blocked:
      !validationInputReady || requiredTotalRows <= 0
        ? {
            reason:
              requiredTotalRows <= 0
                ? "D1 target required tables are empty; final import validation requires non-empty imported rows."
                : "D1 target input coverage is incomplete.",
            missing_tables: missingTables,
            missing_relationships: missingRelationships,
            failed_relationships: failedRelationships.map((check) => check.name),
          }
        : null,
    required_scope: {
      count_tables: requiredTables,
      relationships: requiredRelationships,
    },
    summary: {
      count_tables_total: Object.keys(counts).length,
      required_scope_target_rows: requiredTotalRows,
      relationship_checks_total: relationshipChecks.length,
      relationship_checks_failed: failedRelationships.length,
    },
    operator_runbook: operatorRunbook,
    operator_next_steps: buildD1ImportValidationNextSteps({
      targetRows: requiredTotalRows,
      missingTables,
      missingRelationships,
      hasRelationshipFailures: failedRelationships.length > 0,
      ok: finalImportReady,
    }),
    counts: {
      counts,
    },
    relationships: {
      checks: relationshipChecks,
    },
    output_files: outputFiles,
  };
}

async function runWranglerQuery(database, sql, { local }) {
  const wranglerBin = process.env.WRANGLER_BIN || "wrangler";
  const modeFlag = local ? "--local" : "--remote";
  const { stdout } = await execFileAsync(
    wranglerBin,
    ["d1", "execute", database, modeFlag, "--json", "--command", sql],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  return JSON.parse(stdout);
}

async function writeJson(filePath, value) {
  const resolvedPath = resolveRepoPath(filePath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolvedPath;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`D1 target evidence collection failed: ${error.message}`);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const queries = buildD1ValidationQueries();
  const countsJson = await runWranglerQuery(options.database, queries.d1_count_sql, options);
  const relationshipsJson = await runWranglerQuery(options.database, queries.d1_relationship_sql, options);
  const countRows = unwrapWranglerRows(countsJson, "d1 counts");
  const relationshipRows = unwrapWranglerRows(relationshipsJson, "d1 relationships");
  const outputFiles = {
    counts: normalizeOutputPath(options.countsOutPath),
    relationships: normalizeOutputPath(options.relationshipsOutPath),
    summary: normalizeOutputPath(options.outPath),
  };
  const report = buildD1TargetEvidence({
    database: options.database,
    generatedAt: queries.generated_at,
    local: options.local,
    countRows,
    relationshipRows,
    outputFiles,
  });

  if (options.countsOutPath) {
    await writeJson(options.countsOutPath, report.counts);
  }
  if (options.relationshipsOutPath) {
    await writeJson(options.relationshipsOutPath, report.relationships);
  }
  if (options.outPath) {
    await writeJson(options.outPath, report);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`D1 target snapshot: ${report.final_import_ready ? "READY" : "BLOCKED"}`);
    console.log(`Database: ${report.database} (${report.mode})`);
    console.log(`Required target rows: ${report.summary.required_scope_target_rows}`);
    if (report.final_import_blocked) {
      console.log(`Reason: ${report.final_import_blocked.reason}`);
    }
  }

  process.exitCode = report.final_import_ready ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`D1 target evidence collection failed: ${error.message}`);
    process.exitCode = 2;
  });
}

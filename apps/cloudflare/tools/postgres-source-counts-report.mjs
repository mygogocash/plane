import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeCounts } from "./compare-row-counts.mjs";
import { buildD1ImportValidationNextSteps, buildD1ImportValidationRunbook } from "./d1-import-validation-contract.mjs";
import { D1_VALIDATION_TABLES } from "./d1-import-validation-queries.mjs";
import { resolveRepoPath } from "./path-utils.mjs";

const REQUIRED_COUNT_TABLES = D1_VALIDATION_TABLES.map((table) => table.table);

function usage() {
  return `Usage: node apps/cloudflare/tools/postgres-source-counts-report.mjs --input <psql-counts.json> [--source <label>] [--json] [--out <report.json>] [--generated-at <iso>]

Builds the canonical source-side Postgres count artifact used as
D1_POSTGRES_COUNTS during Phase 7 D1 import validation.

Accepted input shapes match psql JSON rows and the shared count normalizer:
  [{"table_name":"workspaces","count":"1"},{"table_name":"projects","count":"2"}]
  {"rows":[{"table_name":"workspaces","count":1},{"table_name":"projects","count":2}]}
  {"counts":{"workspaces":1,"projects":2}}`;
}

function parseArgs(argv) {
  const options = {
    inputPath: null,
    source: null,
    generatedAt: null,
    json: false,
    outPath: null,
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
    } else if (arg === "--input") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--input requires a path");
      }
      options.inputPath = value;
      index += 1;
    } else if (arg === "--source") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--source requires a label");
      }
      options.source = value;
      index += 1;
    } else if (arg === "--generated-at") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--generated-at requires an ISO timestamp");
      }
      options.generatedAt = value;
      index += 1;
    } else if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--out requires a path");
      }
      options.outPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.inputPath) {
    throw new Error("--input is required");
  }

  return options;
}

async function readJson(filePath) {
  const content = await readFile(filePath, "utf8");
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Input is not valid JSON: ${error.message}`, { cause: error });
  }
}

function rejectFailedEvidenceArtifact(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return;
  }

  if (json.ok === false) {
    const errors = Array.isArray(json.validation_errors) ? `: ${JSON.stringify(json.validation_errors)}` : "";
    throw new Error(`source count input is marked ok=false${errors}`);
  }
}

function requiredScopeRows(counts) {
  return REQUIRED_COUNT_TABLES.reduce((total, table) => total + (counts.get(table) ?? 0), 0);
}

function orderedCountsObject(counts) {
  return Object.fromEntries([...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)));
}

export function buildPostgresSourceCountReport(counts, { generatedAt, source }) {
  const missingTables = REQUIRED_COUNT_TABLES.filter((table) => !counts.has(table));
  const sourceRows = requiredScopeRows(counts);
  const validationErrors = [];

  if (missingTables.length > 0) {
    validationErrors.push(`Postgres source counts are missing required table coverage: ${missingTables.join(", ")}.`);
  }

  if (missingTables.length === 0 && sourceRows <= 0) {
    validationErrors.push("Postgres source counts require non-empty required table counts.");
  }

  const ok = validationErrors.length === 0;

  return {
    ok,
    evidence_kind: "postgres-source-counts",
    schema_version: 1,
    generated_at: generatedAt,
    source: source ?? null,
    required_scope: {
      count_tables: REQUIRED_COUNT_TABLES,
    },
    counts: orderedCountsObject(counts),
    summary: {
      required_tables_total: REQUIRED_COUNT_TABLES.length,
      required_tables_present: REQUIRED_COUNT_TABLES.length - missingTables.length,
      required_scope_source_rows: sourceRows,
    },
    operator_runbook: buildD1ImportValidationRunbook(),
    operator_next_steps: buildD1ImportValidationNextSteps({
      sourceRows,
      missingTables,
      ok: false,
    }),
    validation_errors: validationErrors,
  };
}

async function writeReport(outPath, report) {
  const absoluteOutPath = resolveRepoPath(outPath);
  await mkdir(path.dirname(absoluteOutPath), { recursive: true });
  await writeFile(absoluteOutPath, `${JSON.stringify(report, null, 2)}\n`);
}

function printHumanReport(report) {
  console.log(`Postgres source counts: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(
    `Required tables present: ${report.summary.required_tables_present}/${report.summary.required_tables_total}`
  );
  console.log(`Required scope rows: ${report.summary.required_scope_source_rows}`);
  if (report.validation_errors.length > 0) {
    console.log("Validation errors:");
    for (const error of report.validation_errors) {
      console.log(`- ${error}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const inputPath = resolveRepoPath(options.inputPath);
  const rawInput = await readJson(inputPath);
  rejectFailedEvidenceArtifact(rawInput);
  const counts = normalizeCounts(rawInput, "source");
  const report = buildPostgresSourceCountReport(counts, {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: options.source,
  });

  if (options.outPath) {
    await writeReport(options.outPath, report);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Postgres source count report failed: ${error.message}`);
    process.exitCode = 2;
  });
}

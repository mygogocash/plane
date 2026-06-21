import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { compareCounts, loadCounts } from "./compare-row-counts.mjs";
import { resolveRepoPath } from "./path-utils.mjs";

function usage() {
  return `Usage: node apps/cloudflare/tools/validate-d1-import.mjs <postgres-counts.json> <d1-counts.json> --relationships <checks.json> [--json] [--out <report.json>]

Builds canonical Phase 7 D1 import evidence from exported Postgres and D1 row
counts plus relationship checks. Exit codes:
  0  counts and relationship checks pass
  1  one or more checks fail
  2  usage or input error

Relationship JSON shapes:
  [{"name":"projects.workspace_id","ok":true,"orphanCount":0}]
  {"checks":[{"name":"projects.workspace_id","source":"projects","target":"workspaces","orphan_count":0}]}`;
}

function parseArgs(argv) {
  const positional = [];
  const options = { json: false, outPath: null, relationshipsPath: null };

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

    if (arg === "--out") {
      const outPath = argv[index + 1];
      if (!outPath) {
        throw new Error("--out requires a path");
      }
      options.outPath = outPath;
      index += 1;
      continue;
    }

    if (arg === "--relationships") {
      const relationshipsPath = argv[index + 1];
      if (!relationshipsPath) {
        throw new Error("--relationships requires a path");
      }
      options.relationshipsPath = relationshipsPath;
      index += 1;
      continue;
    }

    positional.push(arg);
  }

  if (!options.help && positional.length !== 2) {
    throw new Error("Expected Postgres and D1 count JSON file paths");
  }

  return {
    ...options,
    sourcePath: positional[0],
    targetPath: positional[1],
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceNonNegativeInteger(value, fallback = 0) {
  const candidate = value ?? fallback;
  const numberValue = typeof candidate === "string" && candidate.trim() !== "" ? Number(candidate) : candidate;

  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`Invalid relationship check count: ${JSON.stringify(value)}`);
  }

  return numberValue;
}

function normalizeRelationshipCheck(row, index) {
  if (!isRecord(row)) {
    throw new Error(`relationships[${index}] must be an object`);
  }

  const name = row.name ?? row.relationship ?? row.id;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`relationships[${index}] is missing a name/relationship/id string`);
  }

  const orphanCount = coerceNonNegativeInteger(row.orphanCount ?? row.orphan_count ?? row.count ?? row.rows, 0);
  const ok = typeof row.ok === "boolean" ? row.ok && orphanCount === 0 : orphanCount === 0;

  return {
    name,
    ok,
    source: typeof row.source === "string" ? row.source : null,
    target: typeof row.target === "string" ? row.target : null,
    orphan_count: orphanCount,
    details: isRecord(row.details) ? row.details : null,
  };
}

async function loadRelationshipChecks(filePath) {
  if (!filePath) {
    return [];
  }

  const json = JSON.parse(await readFile(filePath, "utf8"));
  const rows = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.checks) ? json.checks : null;

  if (!rows) {
    throw new Error("Relationship checks must be an array or {checks:[...]}");
  }

  return rows.map((row, index) => normalizeRelationshipCheck(row, index));
}

function buildValidationReport(sourcePath, targetPath, countReport, relationshipChecks) {
  const failedRelationshipChecks = relationshipChecks.filter((check) => !check.ok);
  const validationErrors =
    relationshipChecks.length === 0 ? ["D1 import validation requires at least one relationship check."] : [];

  return {
    generated_at: new Date().toISOString(),
    ok: countReport.ok && failedRelationshipChecks.length === 0 && validationErrors.length === 0,
    source_counts: path.normalize(sourcePath),
    target_counts: path.normalize(targetPath),
    summary: {
      count_tables_matched: countReport.matchedTableCount,
      count_tables_mismatched: countReport.mismatchedTableCount,
      relationship_checks_total: relationshipChecks.length,
      relationship_checks_failed: failedRelationshipChecks.length,
    },
    validation_errors: validationErrors,
    count_report: countReport,
    relationship_checks: relationshipChecks,
  };
}

async function writeReport(outPath, report) {
  const absoluteOutPath = resolveRepoPath(outPath);
  await mkdir(path.dirname(absoluteOutPath), { recursive: true });
  await writeFile(absoluteOutPath, `${JSON.stringify(report, null, 2)}\n`);
}

function printHumanReport(report) {
  console.log(`D1 import validation: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Matched count tables: ${report.summary.count_tables_matched}`);
  console.log(`Mismatched count tables: ${report.summary.count_tables_mismatched}`);
  console.log(`Relationship checks: ${report.summary.relationship_checks_total}`);
  console.log(`Failed relationship checks: ${report.summary.relationship_checks_failed}`);
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

  const sourcePath = resolveRepoPath(options.sourcePath);
  const targetPath = resolveRepoPath(options.targetPath);
  const relationshipsPath = options.relationshipsPath ? resolveRepoPath(options.relationshipsPath) : null;
  const sourceCounts = await loadCounts(sourcePath, "source");
  const targetCounts = await loadCounts(targetPath, "target");
  const countReport = compareCounts(sourceCounts, targetCounts);
  const relationshipChecks = await loadRelationshipChecks(relationshipsPath);
  const report = buildValidationReport(sourcePath, targetPath, countReport, relationshipChecks);

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
    console.error(`D1 import validation failed: ${error.message}`);
    process.exitCode = 2;
  });
}

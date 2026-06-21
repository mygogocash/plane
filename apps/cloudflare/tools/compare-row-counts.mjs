import { readFile } from "node:fs/promises";
import path from "node:path";

function usage() {
  return `Usage: node apps/cloudflare/tools/compare-row-counts.mjs <source-counts.json> <target-counts.json> [--json]

Compares table row counts from two JSON files. Exit codes:
  0  counts match
  1  one or more table counts differ
  2  usage or input error

Accepted JSON shapes:
  {"issues": 12, "projects": 3}
  {"counts": {"issues": 12, "projects": 3}}
  [{"table": "issues", "count": 12}, {"name": "projects", "rows": 3}]`;
}

function parseArgs(argv) {
  const positional = [];
  const options = { json: false };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else {
      positional.push(arg);
    }
  }

  if (!options.help && positional.length !== 2) {
    throw new Error("Expected source and target JSON file paths");
  }

  return {
    ...options,
    sourcePath: positional[0],
    targetPath: positional[1],
  };
}

function coerceCount(value, tableName) {
  const numberValue = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`Invalid count for ${tableName}: ${JSON.stringify(value)}`);
  }

  return numberValue;
}

function normalizeCounts(json, label) {
  const candidate = json && typeof json === "object" && !Array.isArray(json) && json.counts ? json.counts : json;
  const counts = new Map();

  if (Array.isArray(candidate)) {
    for (const [index, row] of candidate.entries()) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`${label}[${index}] must be an object`);
      }
      const table = row.table ?? row.name ?? row.model ?? row.dbTable;
      const rawCount = row.count ?? row.rows ?? row.row_count ?? row.rowCount;
      if (typeof table !== "string" || table.length === 0) {
        throw new Error(`${label}[${index}] is missing a table/name/model/dbTable string`);
      }
      counts.set(table, coerceCount(rawCount, table));
    }
    return counts;
  }

  if (!candidate || typeof candidate !== "object") {
    throw new Error(`${label} must be an object map, {counts}, or an array of count rows`);
  }

  for (const [table, rawCount] of Object.entries(candidate)) {
    if (rawCount && typeof rawCount === "object" && !Array.isArray(rawCount)) {
      const nestedCount = rawCount.count ?? rawCount.rows ?? rawCount.row_count ?? rawCount.rowCount;
      counts.set(table, coerceCount(nestedCount, table));
    } else {
      counts.set(table, coerceCount(rawCount, table));
    }
  }

  return counts;
}

async function loadCounts(filePath, label) {
  const content = await readFile(filePath, "utf8");
  let json;

  try {
    json = JSON.parse(content);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }

  return normalizeCounts(json, label);
}

function compareCounts(sourceCounts, targetCounts) {
  const tableNames = [...new Set([...sourceCounts.keys(), ...targetCounts.keys()])].toSorted();
  const mismatches = [];
  const matches = [];

  for (const table of tableNames) {
    const sourceCount = sourceCounts.get(table);
    const targetCount = targetCounts.get(table);

    if (sourceCount === targetCount) {
      matches.push({ table, sourceCount, targetCount });
      continue;
    }

    mismatches.push({
      table,
      sourceCount: sourceCount ?? null,
      targetCount: targetCount ?? null,
      delta: typeof sourceCount === "number" && typeof targetCount === "number" ? targetCount - sourceCount : null,
      status: sourceCount === undefined ? "missing_source" : targetCount === undefined ? "missing_target" : "mismatch",
    });
  }

  return {
    ok: mismatches.length === 0,
    matchedTableCount: matches.length,
    mismatchedTableCount: mismatches.length,
    mismatches,
  };
}

function printHumanReport(report, sourcePath, targetPath) {
  console.log(`Row count comparison: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Source: ${path.normalize(sourcePath)}`);
  console.log(`Target: ${path.normalize(targetPath)}`);
  console.log(`Matched tables: ${report.matchedTableCount}`);
  console.log(`Mismatched tables: ${report.mismatchedTableCount}`);

  if (report.mismatches.length > 0) {
    console.log("");
    console.log("Mismatches:");
    for (const mismatch of report.mismatches) {
      const source = mismatch.sourceCount ?? "(missing)";
      const target = mismatch.targetCount ?? "(missing)";
      const delta = mismatch.delta === null ? "n/a" : mismatch.delta;
      console.log(`- ${mismatch.table}: source=${source} target=${target} delta=${delta} status=${mismatch.status}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const sourceCounts = await loadCounts(options.sourcePath, "source");
  const targetCounts = await loadCounts(options.targetPath, "target");
  const report = compareCounts(sourceCounts, targetCounts);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report, options.sourcePath, options.targetPath);
  }

  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`Row count comparison failed: ${error.message}`);
  process.exitCode = 2;
});

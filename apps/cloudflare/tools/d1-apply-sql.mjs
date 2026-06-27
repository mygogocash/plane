import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

const DEFAULT_BATCH_SIZE = 200;

function usage() {
  return `Usage: node apps/cloudflare/tools/d1-apply-sql.mjs --file <import.sql> [--env production|preview] [--remote] [--batch-size 200] [--dry-run]

Applies generated D1 import SQL in batches via wrangler d1 execute.`;
}

function parseArgs(argv) {
  const options = {
    filePath: null,
    envName: "production",
    remote: true,
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--remote") {
      options.remote = true;
    } else if (arg === "--local") {
      options.remote = false;
    } else if (arg === "--file") {
      options.filePath = argv[index + 1];
      if (!options.filePath) {
        throw new Error("--file requires a path");
      }
      index += 1;
    } else if (arg === "--env") {
      options.envName = argv[index + 1];
      if (!options.envName) {
        throw new Error("--env requires a value");
      }
      index += 1;
    } else if (arg === "--batch-size") {
      const value = Number.parseInt(argv[index + 1] ?? "", 10);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error("--batch-size requires a positive integer");
      }
      options.batchSize = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.filePath) {
    throw new Error("--file is required");
  }

  return options;
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("--"));
}

function chunkStatements(statements, batchSize) {
  const chunks = [];
  for (let index = 0; index < statements.length; index += batchSize) {
    chunks.push(statements.slice(index, index + batchSize));
  }
  return chunks;
}

function runWranglerExecute(filePath, options) {
  const args = ["exec", "wrangler", "d1", "execute", "manut-prod", "--file", filePath];

  if (options.remote) {
    args.push("--remote");
  }

  if (options.envName) {
    args.push("--env", options.envName);
  }

  execFileSync("pnpm", args, {
    cwd: resolveRepoPath("apps/cloudflare"),
    encoding: "utf8",
    stdio: "pipe",
  });
}

export async function applySqlFile(filePath, options) {
  const resolvedPath = resolveRepoPath(filePath);
  const sql = await readFile(resolvedPath, "utf8");
  const statements = splitSqlStatements(sql);

  if (statements.length === 0) {
    return { batches: 0, statements: 0 };
  }

  const chunks = chunkStatements(statements, options.batchSize);
  const tempDir = resolveRepoPath("apps/cloudflare/.tmp/d1-apply-sql");

  await mkdir(tempDir, { recursive: true });

  for (let index = 0; index < chunks.length; index += 1) {
    const batchPath = path.join(tempDir, `batch-${String(index + 1).padStart(4, "0")}.sql`);
    const batchSql = `${chunks[index].join("\n")}\n`;

    if (options.dryRun) {
      continue;
    }

    // Batches must run sequentially so each wrangler execute completes before the next.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await writeFile(batchPath, batchSql, "utf8");
    runWranglerExecute(batchPath, options);
  }

  return { batches: chunks.length, statements: statements.length };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await applySqlFile(options.filePath, options);
  console.log(
    options.dryRun
      ? `Dry run: would apply ${result.statements} statements in ${result.batches} batches from ${options.filePath}`
      : `Applied ${result.statements} statements in ${result.batches} batches from ${options.filePath}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`D1 apply SQL failed: ${error.message}`);
    process.exitCode = 2;
  });
}

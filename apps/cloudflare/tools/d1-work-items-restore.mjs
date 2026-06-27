import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { applySqlFile } from "./d1-apply-sql.mjs";
import { resolveRepoPath } from "./path-utils.mjs";

function usage() {
  return `Usage: node apps/cloudflare/tools/d1-work-items-restore.mjs [--input <export.json>] [--from-docker] [--apply] [--env production] [--json]

Restores project states + issues into production D1.

1. Applies migration 0007_states_core when --apply is set
2. Builds import SQL from --input or --from-docker
3. Applies SQL to remote D1 when --apply is set

Production data recovery:
- Export Postgres rows to JSON (issues + states) from a Cloud SQL backup or restored instance
- Then run: pnpm --filter @manut/cloudflare d1:work-items-restore -- --input <export.json> --apply`;
}

function parseArgs(argv) {
  const options = {
    inputPath: null,
    fromDocker: false,
    apply: false,
    envName: "production",
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--from-docker") {
      options.fromDocker = true;
    } else if (arg === "--input") {
      options.inputPath = argv[index + 1];
      if (!options.inputPath) {
        throw new Error("--input requires a path");
      }
      index += 1;
    } else if (arg === "--env") {
      options.envName = argv[index + 1];
      if (!options.envName) {
        throw new Error("--env requires a value");
      }
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.inputPath && !options.fromDocker) {
    throw new Error("Provide --input <export.json> or --from-docker");
  }

  return options;
}

function runMigrations(envName) {
  execFileSync("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", "manut-prod", "--remote", "--env", envName], {
    cwd: resolveRepoPath("apps/cloudflare"),
    encoding: "utf8",
    stdio: "inherit",
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const importArgs = options.fromDocker ? ["--from-docker", "--json"] : ["--input", options.inputPath, "--json"];
  const stdout = execFileSync("node", ["tools/d1-issues-import.mjs", ...importArgs], {
    cwd: resolveRepoPath("apps/cloudflare"),
    encoding: "utf8",
  });

  const report = JSON.parse(stdout);
  const sqlPath = resolveRepoPath("apps/cloudflare/.tmp/work-items-restore.sql");
  await mkdir(path.dirname(sqlPath), { recursive: true });
  await writeFile(sqlPath, report.sql, "utf8");

  const result = {
    ok: report.ok,
    evidence_kind: "d1-work-items-restore",
    generated_at: new Date().toISOString(),
    source: report.source,
    counts: report.counts,
    sql_path: sqlPath,
    applied: false,
  };

  if (options.apply) {
    if (report.counts.issues === 0) {
      throw new Error(
        "Refusing to apply an empty issues import. Export production Postgres data first (Cloud SQL backup restore or issues-export.json)."
      );
    }

    runMigrations(options.envName);
    const applyResult = await applySqlFile(sqlPath, {
      envName: options.envName,
      remote: true,
      batchSize: 200,
      dryRun: false,
    });
    result.applied = true;
    result.apply_result = applyResult;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Prepared work items restore SQL at ${sqlPath} (states=${report.counts.states}, issues=${report.counts.issues})`
    );
    if (result.applied) {
      console.log(`Applied ${result.apply_result.statements} statements in ${result.apply_result.batches} batches.`);
    } else {
      console.log("Dry run only. Re-run with --apply to migrate + import into production D1.");
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`D1 work items restore failed: ${error.message}`);
    process.exitCode = 2;
  });
}

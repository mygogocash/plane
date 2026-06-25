/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildD1ValidationRelationshipChecks,
  D1_VALIDATION_FIXTURE_COUNTS,
} from "../tools/d1-import-validation-queries.mjs";

const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

function fixtureTargetCounts(overrides = {}) {
  return Object.entries({ ...D1_VALIDATION_FIXTURE_COUNTS, ...overrides }).map(([table, count]) => ({
    table,
    count,
  }));
}

function fixtureSourceCounts(overrides = {}) {
  return { counts: { ...D1_VALIDATION_FIXTURE_COUNTS, ...overrides } };
}

function runTool(args: string[]) {
  try {
    return {
      exitCode: 0,
      stdout: execFileSync("node", args, {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      stderr: "",
    };
  } catch (error) {
    return {
      exitCode: (error as { status?: number }).status ?? 1,
      stdout: (error as { stdout?: string }).stdout ?? "",
      stderr: (error as { stderr?: string }).stderr ?? "",
    };
  }
}

function d1RelationshipCheck(overrides: Record<string, unknown> = {}) {
  return buildD1ValidationRelationshipChecks(overrides)[0];
}

function d1RelationshipChecks(overrides: Record<string, unknown> = {}) {
  return buildD1ValidationRelationshipChecks(overrides);
}

describe("migration validation tools", () => {
  it("writes a canonical D1 import validation report when counts and relationships pass", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");
    const outPath = path.join(root, "report.json");

    await writeFile(sourcePath, JSON.stringify(fixtureSourceCounts()));
    await writeFile(targetPath, JSON.stringify(fixtureTargetCounts()));
    await writeFile(relationshipsPath, JSON.stringify({ checks: d1RelationshipChecks() }));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
      "--out",
      outPath,
    ]);
    const stdoutReport = JSON.parse(result.stdout);
    const fileReport = JSON.parse(await readFile(outPath, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(stdoutReport).toMatchObject({
      ok: true,
      summary: {
        count_tables_matched: 6,
        count_tables_mismatched: 0,
        relationship_checks_failed: 0,
      },
      operator_runbook: {
        readiness_blocker_id: "d1-import-validation",
        canonical_report:
          "process/features/cloudflare-stack-migration/reports/phase-07-d1-import-validation_21-06-26.json",
      },
    });
    expect(stdoutReport.operator_runbook.commands.validate_import).toContain("d1:validate-import");
    expect(fileReport).toMatchObject({ ok: true });
  });

  it("keeps D1 import validation blocked when target required rows are empty", async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourceCounts = path.join(tmpDir, "postgres-counts.json");
    const d1Counts = path.join(tmpDir, "d1-counts.json");
    const relationships = path.join(tmpDir, "relationships.json");

    await writeFile(sourceCounts, JSON.stringify(fixtureSourceCounts()), "utf8");
    await writeFile(d1Counts, JSON.stringify({ counts: { workspaces: 0, projects: 0 } }), "utf8");
    await writeFile(relationships, JSON.stringify(d1RelationshipChecks()), "utf8");

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourceCounts,
      d1Counts,
      "--relationships",
      relationships,
      "--json",
    ]);
    expect(result.exitCode).toBe(1);

    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      ok: false,
      summary: {
        required_scope_source_rows: 15,
        required_scope_target_rows: 0,
      },
    });
    expect(report.operator_next_steps).toEqual(
      expect.arrayContaining([expect.stringContaining("operator-approved D1 import")])
    );
  });

  it("fails D1 import validation when relationship checks are missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const outPath = path.join(root, "report.json");

    await writeFile(sourcePath, JSON.stringify(fixtureSourceCounts()));
    await writeFile(targetPath, JSON.stringify(fixtureTargetCounts()));

    const result = runTool(["tools/validate-d1-import.mjs", sourcePath, targetPath, "--json", "--out", outPath]);
    const stdoutReport = JSON.parse(result.stdout);
    const fileReport = JSON.parse(await readFile(outPath, "utf8"));

    expect(result.exitCode).toBe(1);
    expect(stdoutReport).toMatchObject({
      ok: false,
    });
    expect(stdoutReport.validation_errors).toEqual(
      expect.arrayContaining(["D1 import validation requires at least one relationship check."])
    );
    expect(fileReport).toMatchObject({ ok: false });
  });

  it("fails D1 import validation when no count tables are present", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");
    const outPath = path.join(root, "report.json");

    await writeFile(sourcePath, JSON.stringify({ counts: {} }));
    await writeFile(targetPath, JSON.stringify([]));
    await writeFile(relationshipsPath, JSON.stringify(d1RelationshipChecks()));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
      "--out",
      outPath,
    ]);
    const stdoutReport = JSON.parse(result.stdout);
    const fileReport = JSON.parse(await readFile(outPath, "utf8"));

    expect(result.exitCode).toBe(1);
    expect(stdoutReport).toMatchObject({
      ok: false,
    });
    expect(stdoutReport.validation_errors).toEqual(
      expect.arrayContaining(["D1 import validation requires at least one matched count table."])
    );
    expect(fileReport).toMatchObject({ ok: false });
  });

  it("fails D1 import validation when required table counts are all empty", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify([
        { table_name: "workspaces", count: 0 },
        { table_name: "projects", count: 0 },
        { table_name: "users", count: 0 },
        { table_name: "profiles", count: 0 },
        { table_name: "workspace_members", count: 0 },
        { table_name: "issues", count: 0 },
      ])
    );
    await writeFile(
      targetPath,
      JSON.stringify([
        { table_name: "workspaces", count: 0 },
        { table_name: "projects", count: 0 },
        { table_name: "users", count: 0 },
        { table_name: "profiles", count: 0 },
        { table_name: "workspace_members", count: 0 },
        { table_name: "issues", count: 0 },
      ])
    );
    await writeFile(relationshipsPath, JSON.stringify(d1RelationshipChecks()));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      summary: {
        required_scope_source_rows: 0,
        required_scope_target_rows: 0,
      },
    });
    expect(report.validation_errors).toEqual(
      expect.arrayContaining(["D1 import validation requires non-empty required table counts."])
    );
  });

  it("writes relative D1 import reports from the repository root when run through the package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");
    const relativeOutPath = `.tmp/${path.basename(root)}/d1-report.json`;
    const repoOutPath = path.join(repoRoot, relativeOutPath);
    const packageOutPath = path.join(packageRoot, relativeOutPath);

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });
    await rm(path.dirname(packageOutPath), { recursive: true, force: true });
    await writeFile(sourcePath, JSON.stringify(fixtureSourceCounts()));
    await writeFile(targetPath, JSON.stringify(fixtureTargetCounts()));
    await writeFile(relationshipsPath, JSON.stringify(d1RelationshipChecks()));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
      "--out",
      relativeOutPath,
    ]);
    const fileReport = JSON.parse(await readFile(repoOutPath, "utf8"));

    await rm(path.dirname(repoOutPath), { recursive: true, force: true });
    await rm(path.dirname(packageOutPath), { recursive: true, force: true });

    expect(result.exitCode).toBe(0);
    expect(fileReport).toMatchObject({ ok: true });
  });

  it("accepts wrapped D1 execute JSON for count and relationship validation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify({
        results: fixtureTargetCounts(),
      })
    );
    await writeFile(
      targetPath,
      JSON.stringify([
        {
          success: true,
          results: fixtureTargetCounts(),
        },
      ])
    );
    await writeFile(
      relationshipsPath,
      JSON.stringify([
        {
          success: true,
          results: d1RelationshipChecks(),
        },
      ])
    );

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      ok: true,
      summary: {
        count_tables_matched: 6,
        relationship_checks_total: 6,
      },
    });
  });

  it("accepts generated table_name count rows for D1 import validation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(
      targetPath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(relationshipsPath, JSON.stringify(d1RelationshipChecks()));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      ok: true,
      summary: {
        count_tables_matched: 6,
      },
    });
  });

  it("rejects failed SQL runner envelopes even when they include result rows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify([
        {
          success: false,
          errors: ["source count query failed"],
          results: [
            { table_name: "workspaces", count: 1 },
            { table_name: "projects", count: 2 },
          ],
        },
      ])
    );
    await writeFile(
      targetPath,
      JSON.stringify([
        { table_name: "workspaces", count: 1 },
        { table_name: "projects", count: 2 },
      ])
    );
    await writeFile(relationshipsPath, JSON.stringify(d1RelationshipChecks()));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("source SQL runner reported failure");
  });

  it("rejects failed SQL runner envelopes that expose rows instead of results", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify({
        success: false,
        error: "source count query failed",
        rows: [
          { table_name: "workspaces", count: 1 },
          { table_name: "projects", count: 2 },
        ],
      })
    );
    await writeFile(
      targetPath,
      JSON.stringify([
        { table_name: "workspaces", count: 1 },
        { table_name: "projects", count: 2 },
      ])
    );
    await writeFile(relationshipsPath, JSON.stringify(d1RelationshipChecks()));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("source SQL runner reported failure");
  });

  it("rejects failed relationship runner envelopes that expose data instead of results", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(
      targetPath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(
      relationshipsPath,
      JSON.stringify({
        success: false,
        errors: ["relationship query failed"],
        data: [{ name: "projects.workspace_id", orphan_count: 0 }],
      })
    );

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("relationships SQL runner reported failure");
  });

  it("rejects D1 import validation when the expected Phase 7 table scope is incomplete", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(sourcePath, JSON.stringify([{ table_name: "workspaces", count: 1 }]));
    await writeFile(targetPath, JSON.stringify([{ table_name: "workspaces", count: 1 }]));
    await writeFile(relationshipsPath, JSON.stringify(d1RelationshipChecks()));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      validation_errors: [expect.stringContaining("D1 import validation is missing count table coverage:")],
    });
  });

  it("rejects D1 import validation when the expected Phase 7 relationship scope is incomplete", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(
      targetPath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(relationshipsPath, JSON.stringify([{ name: "projects.owner_id", orphan_count: 0 }]));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      validation_errors: [expect.stringContaining("D1 import validation is missing relationship coverage:")],
    });
  });

  it("rejects D1 relationship checks without expected source and target tables", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(
      targetPath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(relationshipsPath, JSON.stringify([{ name: "projects.workspace_id", orphan_count: 0 }]));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      validation_errors: expect.arrayContaining([
        "D1 import validation relationship projects.workspace_id must include source projects and target workspaces.",
      ]),
    });
  });

  it("rejects D1 relationship checks without an explicit orphan count", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(
      targetPath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count })))
    );
    await writeFile(relationshipsPath, JSON.stringify([d1RelationshipCheck({ ok: true, orphan_count: undefined })]));

    const result = runTool([
      "tools/validate-d1-import.mjs",
      sourcePath,
      targetPath,
      "--relationships",
      relationshipsPath,
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("relationships[0] is missing orphan_count/orphanCount/count/rows");
  });

  it("writes a canonical Postgres source count report from psql JSON rows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-postgres-source-counts-"));
    const inputPath = path.join(root, "psql-counts.json");
    const outPath = path.join(root, "postgres-source-counts.json");

    await writeFile(
      inputPath,
      JSON.stringify(fixtureTargetCounts().map(({ table, count }) => ({ table_name: table, count: String(count) })))
    );

    const result = runTool([
      "tools/postgres-source-counts-report.mjs",
      "--input",
      inputPath,
      "--source",
      "cloud-sql:manut-pg18-prod",
      "--generated-at",
      "2026-06-22T12:00:00.000Z",
      "--json",
      "--out",
      outPath,
    ]);
    const stdoutReport = JSON.parse(result.stdout);
    const fileReport = JSON.parse(await readFile(outPath, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(stdoutReport).toMatchObject({
      ok: true,
      evidence_kind: "postgres-source-counts",
      generated_at: "2026-06-22T12:00:00.000Z",
      source: "cloud-sql:manut-pg18-prod",
      counts: D1_VALIDATION_FIXTURE_COUNTS,
      summary: {
        required_tables_present: 6,
        required_scope_source_rows: 15,
      },
    });
    expect(fileReport).toMatchObject({ ok: true });
  });

  it("rejects Postgres source count reports missing Phase 7 required tables", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-postgres-source-counts-"));
    const inputPath = path.join(root, "psql-counts.json");

    await writeFile(inputPath, JSON.stringify([{ table_name: "workspaces", count: 1 }]));

    const result = runTool(["tools/postgres-source-counts-report.mjs", "--input", inputPath, "--json"]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      validation_errors: [expect.stringContaining("Postgres source counts are missing required table coverage:")],
    });
  });

  it("rejects Postgres source count reports when required scope is empty", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-postgres-source-counts-"));
    const inputPath = path.join(root, "psql-counts.json");

    await writeFile(
      inputPath,
      JSON.stringify(
        fixtureTargetCounts({ workspaces: 0, projects: 0, users: 0, profiles: 0, workspace_members: 0, issues: 0 }).map(
          ({ table, count }) => ({ table_name: table, count })
        )
      )
    );

    const result = runTool(["tools/postgres-source-counts-report.mjs", "--input", inputPath, "--json"]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      summary: {
        required_scope_source_rows: 0,
      },
    });
    expect(report.validation_errors).toEqual(
      expect.arrayContaining(["Postgres source counts require non-empty required table counts."])
    );
  });

  it("rejects failed Postgres source SQL runner envelopes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-postgres-source-counts-"));
    const inputPath = path.join(root, "psql-counts.json");

    await writeFile(
      inputPath,
      JSON.stringify({
        success: false,
        error: "source query failed",
        rows: [
          { table_name: "workspaces", count: 1 },
          { table_name: "projects", count: 2 },
        ],
      })
    );

    const result = runTool(["tools/postgres-source-counts-report.mjs", "--input", inputPath, "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Postgres source count report failed: source SQL runner reported failure");
  });

  it("rejects failed Postgres source count artifacts before re-canonicalizing counts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-postgres-source-counts-"));
    const inputPath = path.join(root, "psql-counts.json");

    await writeFile(
      inputPath,
      JSON.stringify({
        ok: false,
        validation_errors: ["operator marked source export invalid"],
        counts: {
          workspaces: 1,
          projects: 2,
        },
      })
    );

    const result = runTool(["tools/postgres-source-counts-report.mjs", "--input", inputPath, "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Postgres source count report failed: source count input is marked ok=false");
  });

  it("fails upload validation when strict checksum parity has no shared checksum", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-r2-validation-"));
    const sourcePath = path.join(root, "gcs-manifest.json");
    const targetPath = path.join(root, "r2-manifest.json");

    await writeFile(sourcePath, JSON.stringify([{ key: "workspace/logo.png", size: 12 }]));
    await writeFile(targetPath, JSON.stringify([{ key: "workspace/logo.png", size: 12 }]));

    const result = runTool([
      "tools/compare-upload-manifests.mjs",
      sourcePath,
      targetPath,
      "--require-checksum",
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      checksumPolicy: {
        requireSharedChecksum: true,
      },
      mismatches: [
        {
          key: "workspace/logo.png",
          checksumMismatches: [
            {
              status: "missing_shared_checksum",
            },
          ],
        },
      ],
    });
  });

  it("fails strict upload validation when both manifests are empty", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-r2-validation-"));
    const sourcePath = path.join(root, "gcs-manifest.json");
    const targetPath = path.join(root, "r2-manifest.json");

    await writeFile(sourcePath, JSON.stringify([]));
    await writeFile(targetPath, JSON.stringify([]));

    const result = runTool([
      "tools/compare-upload-manifests.mjs",
      sourcePath,
      targetPath,
      "--require-checksum",
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      validation_errors: ["Strict upload manifest validation requires at least one matched object."],
    });
  });

  it("prints canonical upload validation JSON with manifest paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-r2-validation-"));
    const sourcePath = path.join(root, "gcs-manifest.json");
    const targetPath = path.join(root, "r2-manifest.json");

    await writeFile(sourcePath, JSON.stringify([{ key: "workspace/logo.png", size: 12, sha256: "abc" }]));
    await writeFile(targetPath, JSON.stringify([{ key: "workspace/logo.png", size: 12, sha256: "abc" }]));

    const result = runTool([
      "tools/compare-upload-manifests.mjs",
      sourcePath,
      targetPath,
      "--require-checksum",
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      ok: true,
      source_manifest: sourcePath,
      target_manifest: targetPath,
      checksumPolicy: {
        requireSharedChecksum: true,
      },
    });
  });

  it("accepts real gcloud storage checksum field names for upload validation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-r2-validation-"));
    const sourcePath = path.join(root, "gcs-manifest.json");
    const targetPath = path.join(root, "r2-manifest.json");

    await writeFile(
      sourcePath,
      JSON.stringify([
        {
          name: "workspace/logo.png",
          size: "12",
          crc32c_hash: "abc123",
          md5_hash: "def456",
          content_type: "image/png",
          update_time: "2026-06-22T01:00:00+0000",
        },
      ])
    );
    await writeFile(
      targetPath,
      JSON.stringify([
        {
          key: "workspace/logo.png",
          size: 12,
          crc32c: "abc123",
          md5Hash: "def456",
        },
      ])
    );

    const result = runTool([
      "tools/compare-upload-manifests.mjs",
      sourcePath,
      targetPath,
      "--require-checksum",
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      ok: true,
      sourceObjectCount: 1,
      targetObjectCount: 1,
      matchedObjectCount: 1,
      mismatchedObjectCount: 0,
      mismatches: [],
    });
  });

  it("accepts nested R2 checksum objects for upload validation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-r2-validation-"));
    const sourcePath = path.join(root, "gcs-manifest.json");
    const targetPath = path.join(root, "r2-manifest.json");

    await writeFile(sourcePath, JSON.stringify([{ key: "workspace/logo.png", size: 12, sha256: "abc" }]));
    await writeFile(
      targetPath,
      JSON.stringify([{ key: "workspace/logo.png", size: 12, checksums: { sha256: "abc" } }])
    );

    const result = runTool([
      "tools/compare-upload-manifests.mjs",
      sourcePath,
      targetPath,
      "--require-checksum",
      "--json",
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      ok: true,
      checksumPolicy: {
        requireSharedChecksum: true,
      },
    });
  });

  it("rejects duplicate D1 count rows instead of silently overwriting them", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");

    await writeFile(sourcePath, JSON.stringify([{ table: "workspaces", count: 1 }]));
    await writeFile(
      targetPath,
      JSON.stringify([
        { table: "workspaces", count: 0 },
        { table: "workspaces", count: 1 },
      ])
    );

    const result = runTool(["tools/validate-d1-import.mjs", sourcePath, targetPath, "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("target contains duplicate table: workspaces");
  });
});

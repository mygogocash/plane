/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildD1ValidationQueries } from "../tools/d1-import-validation-queries.mjs";

const packageRoot = path.resolve(__dirname, "..");

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

describe("D1 import validation query manifest", () => {
  it("builds count and relationship queries for the current D1 shadow scope", () => {
    const report = buildD1ValidationQueries({ generatedAt: "2026-06-22T00:00:00.000Z" });

    expect(report.tables).toHaveLength(6);
    expect(report.tables.map((table: { table: string }) => table.table)).toEqual([
      "workspaces",
      "projects",
      "users",
      "profiles",
      "workspace_members",
      "issues",
    ]);
    expect(report.relationships).toHaveLength(6);
    expect(report.relationships.map((relationship: { name: string }) => relationship.name)).toEqual([
      "projects.workspace_id",
      "profiles.user_id",
      "workspace_members.workspace_id",
      "workspace_members.member_id",
      "issues.project_id",
      "issues.workspace_id",
    ]);
    expect(report).toMatchObject({
      ok: true,
      generated_at: "2026-06-22T00:00:00.000Z",
      scope: "worker-native-identity-and-issues",
    });
    expect(report.postgres_count_sql).toContain("'workspaces' AS table_name");
    expect(report.postgres_count_sql).toContain("COUNT(*)::bigint AS count");
    expect(report.postgres_count_sql).toContain("FROM workspaces");
    expect(report.d1_count_sql).toContain("'projects' AS table_name");
    expect(report.d1_count_sql).toContain("COUNT(*) AS count");
    expect(report.d1_count_sql).not.toContain("AS table,");
    expect(report.d1_relationship_sql).toContain("LEFT JOIN workspaces w");
    expect(report.d1_relationship_sql).toContain("ON w.id = p.workspace_id");
    expect(report).not.toHaveProperty("relationship_template");
  });

  it("writes SQL files and a manifest for final evidence collection", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-queries-"));
    const outPath = path.join(root, "manifest.json");
    const sqlDir = path.join(root, "sql");

    const result = runTool([
      "tools/d1-import-validation-queries.mjs",
      "--generated-at",
      "2026-06-22T00:00:00.000Z",
      "--sql-dir",
      sqlDir,
      "--out",
      outPath,
      "--json",
    ]);
    const stdoutReport = JSON.parse(result.stdout);
    const fileReport = JSON.parse(await readFile(outPath, "utf8"));
    const postgresSql = await readFile(path.join(sqlDir, "postgres-counts.sql"), "utf8");
    const d1Sql = await readFile(path.join(sqlDir, "d1-counts.sql"), "utf8");
    const relationshipSql = await readFile(path.join(sqlDir, "d1-relationships.sql"), "utf8");

    expect(result.exitCode).toBe(0);
    expect(fileReport).toEqual(stdoutReport);
    expect(postgresSql).toContain("FROM projects");
    expect(d1Sql).toContain("ORDER BY table");
    expect(relationshipSql).toContain("'projects.workspace_id' AS name");
    expect(stdoutReport.files).toMatchObject({
      postgres_count_sql: path.join(sqlDir, "postgres-counts.sql"),
      d1_count_sql: path.join(sqlDir, "d1-counts.sql"),
      d1_relationship_sql: path.join(sqlDir, "d1-relationships.sql"),
    });
  });
});

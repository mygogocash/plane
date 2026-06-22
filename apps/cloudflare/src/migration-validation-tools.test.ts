import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

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

describe("migration validation tools", () => {
  it("writes a canonical D1 import validation report when counts and relationships pass", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");
    const outPath = path.join(root, "report.json");

    await writeFile(sourcePath, JSON.stringify({ counts: { workspaces: 1, projects: 2 } }));
    await writeFile(
      targetPath,
      JSON.stringify([
        { table: "workspaces", count: 1 },
        { table: "projects", count: 2 },
      ])
    );
    await writeFile(relationshipsPath, JSON.stringify({ checks: [{ name: "projects.workspace_id", orphanCount: 0 }] }));

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
        count_tables_matched: 2,
        count_tables_mismatched: 0,
        relationship_checks_failed: 0,
      },
    });
    expect(fileReport).toMatchObject({ ok: true });
  });

  it("fails D1 import validation when relationship checks are missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const outPath = path.join(root, "report.json");

    await writeFile(sourcePath, JSON.stringify({ counts: { workspaces: 1, projects: 2 } }));
    await writeFile(
      targetPath,
      JSON.stringify([
        { table: "workspaces", count: 1 },
        { table: "projects", count: 2 },
      ])
    );

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
    await writeFile(relationshipsPath, JSON.stringify([{ name: "projects.workspace_id", orphanCount: 0 }]));

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
      ])
    );
    await writeFile(
      targetPath,
      JSON.stringify([
        { table_name: "workspaces", count: 0 },
        { table_name: "projects", count: 0 },
      ])
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
    await writeFile(sourcePath, JSON.stringify({ counts: { workspaces: 1, projects: 2 } }));
    await writeFile(
      targetPath,
      JSON.stringify([
        { table: "workspaces", count: 1 },
        { table: "projects", count: 2 },
      ])
    );
    await writeFile(relationshipsPath, JSON.stringify([{ name: "projects.workspace_id", orphanCount: 0 }]));

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
        results: [
          { table: "workspaces", count: 1 },
          { table: "projects", count: 2 },
        ],
      })
    );
    await writeFile(
      targetPath,
      JSON.stringify([
        {
          success: true,
          results: [
            { table: "workspaces", count: 1 },
            { table: "projects", count: 2 },
          ],
        },
      ])
    );
    await writeFile(
      relationshipsPath,
      JSON.stringify([
        {
          success: true,
          results: [{ name: "projects.workspace_id", source: "projects", target: "workspaces", orphan_count: 0 }],
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
        count_tables_matched: 2,
        relationship_checks_total: 1,
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
      JSON.stringify([
        { table_name: "workspaces", count: 1 },
        { table_name: "projects", count: 2 },
      ])
    );
    await writeFile(
      targetPath,
      JSON.stringify([
        { table_name: "workspaces", count: 1 },
        { table_name: "projects", count: 2 },
      ])
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

    expect(result.exitCode).toBe(0);
    expect(report).toMatchObject({
      ok: true,
      summary: {
        count_tables_matched: 2,
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
    await writeFile(relationshipsPath, JSON.stringify([{ name: "projects.workspace_id", orphan_count: 0 }]));

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

  it("rejects D1 import validation when the expected Phase 7 table scope is incomplete", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(sourcePath, JSON.stringify([{ table_name: "workspaces", count: 1 }]));
    await writeFile(targetPath, JSON.stringify([{ table_name: "workspaces", count: 1 }]));
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
      validation_errors: ["D1 import validation is missing count table coverage: projects."],
    });
  });

  it("rejects D1 import validation when the expected Phase 7 relationship scope is incomplete", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-d1-validation-"));
    const sourcePath = path.join(root, "postgres-counts.json");
    const targetPath = path.join(root, "d1-counts.json");
    const relationshipsPath = path.join(root, "relationships.json");

    await writeFile(
      sourcePath,
      JSON.stringify([
        { table_name: "workspaces", count: 1 },
        { table_name: "projects", count: 2 },
      ])
    );
    await writeFile(
      targetPath,
      JSON.stringify([
        { table_name: "workspaces", count: 1 },
        { table_name: "projects", count: 2 },
      ])
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
      validation_errors: ["D1 import validation is missing relationship coverage: projects.workspace_id."],
    });
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

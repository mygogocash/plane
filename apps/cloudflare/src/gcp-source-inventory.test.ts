import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildGcpSourceInventoryReport } from "../tools/gcp-source-inventory.mjs";

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

function bucketFixture() {
  return {
    name: "plane-affine-495114-uploads",
    location: "ASIA-SOUTHEAST1",
    default_storage_class: "STANDARD",
    cors_config: [{ origin: ["https://app.manut.xyz"], method: ["GET"] }],
    uniform_bucket_level_access: true,
    public_access_prevention: "inherited",
    soft_delete_policy: { retentionDurationSeconds: "604800" },
  };
}

function objectFixture() {
  return [
    {
      name: "sensitive-user-profile.jpg",
      size: "976520",
      crc32c_hash: "MyRQ7Q==",
      md5_hash: "nltOrzMRlo9LREY54QA2YA==",
      content_type: "image/jpeg",
      updated: "2026-06-21T01:23:45.000Z",
    },
    {
      name: "workspace/logo.png",
      size: 12,
      crc32c: "abc123",
      md5Hash: "def456",
      contentType: "image/png",
    },
  ];
}

function sqlFixture() {
  return [
    {
      name: "plane-pg",
      project: "affine-495114",
      databaseVersion: "POSTGRES_15",
      region: "asia-southeast1",
      state: "RUNNABLE",
      deletionProtectionEnabled: true,
      connectionName: "affine-495114:asia-southeast1:plane-pg",
      ipAddresses: [{ ipAddress: "10.0.0.10", type: "PRIVATE" }],
      serverCaCert: { cert: "-----BEGIN CERTIFICATE-----\nunsafe\n-----END CERTIFICATE-----" },
      settings: {
        backupConfiguration: {
          enabled: true,
          pointInTimeRecoveryEnabled: true,
          transactionLogRetentionDays: 7,
        },
        retainedBackups: 7,
        retainBackupsOnDelete: true,
      },
    },
    {
      name: "unrelated-cache",
      databaseVersion: "MYSQL_8_0",
      region: "us-central1",
      state: "RUNNABLE",
    },
  ];
}

describe("GCP source inventory report", () => {
  it("summarizes GCS uploads without exposing object names", () => {
    const report = buildGcpSourceInventoryReport({
      bucket: bucketFixture(),
      objects: objectFixture(),
      sqlInstances: sqlFixture(),
      generatedAt: "2026-06-22T00:00:00.000Z",
    });

    expect(report).toMatchObject({
      ok: true,
      source_inventory_ready: true,
      generated_at: "2026-06-22T00:00:00.000Z",
      gcs_bucket: {
        name: "plane-affine-495114-uploads",
        location: "ASIA-SOUTHEAST1",
        storage_class: "STANDARD",
        uniform_bucket_level_access_enabled: true,
        public_access_prevention: "inherited",
        soft_delete_retention_seconds: 604800,
        cors_origins: ["https://app.manut.xyz"],
        object_count: 2,
        total_size: 976532,
        checksum_coverage: {
          crc32c: 2,
          md5: 2,
        },
        object_key_policy: "sha256-only",
      },
    });
    expect(report.gcs_bucket.sample_objects).toEqual([
      expect.objectContaining({
        key_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        size: 976520,
        has_crc32c: true,
        has_md5: true,
      }),
      expect.objectContaining({
        key_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        size: 12,
        has_crc32c: true,
        has_md5: true,
      }),
    ]);
    expect(JSON.stringify(report)).not.toContain("sensitive-user-profile.jpg");
    expect(JSON.stringify(report)).not.toContain("workspace/logo.png");
  });

  it("sanitizes Cloud SQL inventory and omits network/certificate fields", () => {
    const report = buildGcpSourceInventoryReport({
      bucket: bucketFixture(),
      objects: objectFixture(),
      sqlInstances: sqlFixture(),
      generatedAt: "2026-06-22T00:00:00.000Z",
    });

    expect(report.cloud_sql).toMatchObject({
      instance_count: 2,
      candidate_instances: [
        {
          name: "plane-pg",
          project: "affine-495114",
          database_version: "POSTGRES_15",
          region: "asia-southeast1",
          state: "RUNNABLE",
          deletion_protection_enabled: true,
          backup_enabled: true,
          point_in_time_recovery_enabled: true,
          transaction_log_retention_days: 7,
          retained_backups: 7,
          retain_backups_on_delete: true,
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain("10.0.0.10");
    expect(JSON.stringify(report)).not.toContain("BEGIN CERTIFICATE");
    expect(JSON.stringify(report)).not.toContain("serverCaCert");
    expect(JSON.stringify(report)).not.toContain("ipAddresses");
  });

  it("rejects invalid GCS object sizes instead of reporting zero-byte evidence", () => {
    expect(() =>
      buildGcpSourceInventoryReport({
        bucket: bucketFixture(),
        objects: [{ name: "broken-object.png", size: "not-a-number" }],
        sqlInstances: sqlFixture(),
        generatedAt: "2026-06-22T00:00:00.000Z",
      })
    ).toThrow("Invalid size for GCS object inventory");
  });

  it("writes a canonical JSON report from gcloud output files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "manut-gcp-source-inventory-"));
    const bucketPath = path.join(root, "bucket.json");
    const objectsPath = path.join(root, "objects.json");
    const sqlPath = path.join(root, "sql.json");
    const outPath = path.join(root, "report.json");

    await writeFile(bucketPath, JSON.stringify(bucketFixture()), "utf8");
    await writeFile(objectsPath, JSON.stringify(objectFixture()), "utf8");
    await writeFile(sqlPath, JSON.stringify(sqlFixture()), "utf8");

    const result = runTool([
      "tools/gcp-source-inventory.mjs",
      "--gcs-bucket",
      bucketPath,
      "--gcs-objects",
      objectsPath,
      "--sql-instances",
      sqlPath,
      "--generated-at",
      "2026-06-22T00:00:00.000Z",
      "--json",
      "--out",
      outPath,
    ]);
    const stdoutReport = JSON.parse(result.stdout);
    const fileReport = JSON.parse(await readFile(outPath, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(stdoutReport).toMatchObject({ ok: true, source_inventory_ready: true });
    expect(fileReport).toEqual(stdoutReport);
  });
});

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

function usage() {
  return `Usage: node apps/cloudflare/tools/gcp-source-inventory.mjs --gcs-bucket <bucket.json> --gcs-objects <objects.json> --sql-instances <instances.json> [--json] [--out <report.json>] [--generated-at <iso>]

Builds a sanitized source-side GCP inventory for Cloudflare cutover planning.

Required inputs are JSON files produced by read-only gcloud commands:
  gcloud storage buckets describe gs://plane-affine-495114-uploads --format=json
  gcloud storage objects list gs://plane-affine-495114-uploads --format=json
  gcloud sql instances list --format=json

The report intentionally omits object names, Cloud SQL IP addresses, and SQL certificates.`;
}

function parseArgs(argv) {
  const options = {
    gcsBucketPath: null,
    gcsObjectsPath: null,
    sqlInstancesPath: null,
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
    } else if (arg === "--gcs-bucket") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--gcs-bucket requires a path");
      }
      options.gcsBucketPath = value;
      index += 1;
    } else if (arg === "--gcs-objects") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--gcs-objects requires a path");
      }
      options.gcsObjectsPath = value;
      index += 1;
    } else if (arg === "--sql-instances") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--sql-instances requires a path");
      }
      options.sqlInstancesPath = value;
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

  if (!options.help && (!options.gcsBucketPath || !options.gcsObjectsPath || !options.sqlInstancesPath)) {
    throw new Error("--gcs-bucket, --gcs-objects, and --sql-instances are required");
  }

  return options;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRows(json, listKeys) {
  if (Array.isArray(json)) {
    return json;
  }

  if (isRecord(json)) {
    for (const key of listKeys) {
      if (Array.isArray(json[key])) {
        return json[key];
      }
    }
  }

  throw new Error(`Expected JSON array or one of: ${listKeys.join(", ")}`);
}

function readString(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function readBoolean(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function coerceSafeInteger(value, fallback = 0) {
  const numberValue = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (Number.isSafeInteger(numberValue) && numberValue >= 0) {
    return numberValue;
  }
  return fallback;
}

function readRequiredSafeInteger(value, label) {
  const numberValue = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (Number.isSafeInteger(numberValue) && numberValue >= 0) {
    return numberValue;
  }
  throw new Error(`Invalid size for ${label}: ${JSON.stringify(value)}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeObject(row) {
  if (!isRecord(row)) {
    throw new Error("GCS object row must be an object");
  }

  const key = readString(row, ["name", "key", "object", "objectKey", "path"]);
  if (!key) {
    throw new Error("GCS object row is missing name/key/object/objectKey/path");
  }

  return {
    keyHash: sha256(key),
    size: readRequiredSafeInteger(row.size, "GCS object inventory"),
    hasCrc32c: Boolean(readString(row, ["crc32c", "crc32c_hash"])),
    hasMd5: Boolean(readString(row, ["md5Hash", "md5_hash", "md5"])),
    contentType: readString(row, ["contentType", "content_type"]) ?? "unknown",
    updatedAt: readString(row, ["updated", "updated_at", "timeUpdated", "time_updated", "update_time"]),
  };
}

function normalizeBucket(bucket) {
  if (!isRecord(bucket)) {
    throw new Error("GCS bucket JSON must be an object");
  }

  const corsOrigins = [];
  const corsRows = Array.isArray(bucket.cors)
    ? bucket.cors
    : Array.isArray(bucket.cors_config)
      ? bucket.cors_config
      : [];
  for (const row of corsRows) {
    if (isRecord(row) && Array.isArray(row.origin)) {
      corsOrigins.push(...row.origin.filter((origin) => typeof origin === "string"));
    }
  }
  const uniformBucketLevelAccess =
    typeof bucket.uniform_bucket_level_access === "boolean"
      ? bucket.uniform_bucket_level_access
      : (bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled ??
        bucket.iam_configuration?.uniform_bucket_level_access?.enabled ??
        null);

  return {
    name: readString(bucket, ["name", "id"]),
    location: readString(bucket, ["location"]),
    storage_class: readString(bucket, ["storageClass", "storage_class", "default_storage_class"]),
    uniform_bucket_level_access_enabled: uniformBucketLevelAccess,
    public_access_prevention:
      bucket.public_access_prevention ??
      bucket.iamConfiguration?.publicAccessPrevention ??
      bucket.iam_configuration?.public_access_prevention ??
      null,
    soft_delete_retention_seconds: coerceSafeInteger(
      bucket.softDeletePolicy?.retentionDurationSeconds ??
        bucket.soft_delete_policy?.retentionDurationSeconds ??
        bucket.soft_delete_policy?.retention_duration_seconds,
      0
    ),
    cors_origins: [...new Set(corsOrigins)].toSorted(),
  };
}

function normalizeSqlInstance(instance) {
  const backupConfiguration = instance.settings?.backupConfiguration ?? instance.settings?.backup_configuration ?? {};
  const retentionSettings = backupConfiguration.retentionSettings ?? backupConfiguration.retention_settings ?? {};

  return {
    name: readString(instance, ["name"]),
    project: readString(instance, ["project"]),
    database_version: readString(instance, ["databaseVersion", "database_version"]),
    region: readString(instance, ["region"]),
    state: readString(instance, ["state"]),
    deletion_protection_enabled:
      readBoolean(instance, ["deletionProtectionEnabled", "deletion_protection_enabled"]) ??
      readBoolean(instance.settings ?? {}, ["deletionProtectionEnabled", "deletion_protection_enabled"]) ??
      null,
    backup_enabled: readBoolean(backupConfiguration, ["enabled"]) ?? null,
    point_in_time_recovery_enabled:
      readBoolean(backupConfiguration, ["pointInTimeRecoveryEnabled", "point_in_time_recovery_enabled"]) ?? null,
    transaction_log_retention_days: coerceSafeInteger(
      backupConfiguration.transactionLogRetentionDays ?? backupConfiguration.transaction_log_retention_days,
      0
    ),
    retained_backups: coerceSafeInteger(
      instance.settings?.retainedBackups ??
        instance.settings?.retained_backups ??
        retentionSettings.retainedBackups ??
        retentionSettings.retained_backups,
      0
    ),
    retain_backups_on_delete:
      readBoolean(instance.settings ?? {}, ["retainBackupsOnDelete", "retain_backups_on_delete"]) ?? null,
  };
}

function isCloudSqlCandidate(instance) {
  const name = readString(instance, ["name"]) ?? "";
  const databaseVersion = readString(instance, ["databaseVersion", "database_version"]) ?? "";

  return databaseVersion.startsWith("POSTGRES") && /(?:^|[-_])(plane|manut|pg|prod)(?:$|[-_0-9a-z])/i.test(name);
}

export function buildGcpSourceInventoryReport({
  bucket,
  objects,
  sqlInstances,
  generatedAt = new Date().toISOString(),
}) {
  const normalizedBucket = normalizeBucket(bucket);
  const normalizedObjects = normalizeRows(objects, ["items", "objects"]).map((row) => normalizeObject(row));
  const normalizedSqlInstances = normalizeRows(sqlInstances, ["items", "instances"]);
  const candidateInstances = normalizedSqlInstances.filter(isCloudSqlCandidate).map(normalizeSqlInstance);
  const totalSize = normalizedObjects.reduce((sum, object) => sum + object.size, 0);
  const validationErrors = [];

  if (!normalizedBucket.name) {
    validationErrors.push("GCS bucket inventory is missing a bucket name.");
  }
  if (normalizedObjects.length === 0) {
    validationErrors.push("GCS object inventory is empty.");
  }
  if (candidateInstances.length === 0) {
    validationErrors.push("Cloud SQL inventory has no likely Manut/Plane Postgres candidate.");
  }

  const report = {
    ok: validationErrors.length === 0,
    source_inventory_ready: validationErrors.length === 0,
    evidence_kind: "gcp-source-inventory",
    schema_version: 1,
    generated_at: generatedAt,
    redactions: ["gcs_object_names", "cloud_sql_ip_addresses", "cloud_sql_server_ca_certificates"],
    validation_errors: validationErrors,
    gcs_bucket: {
      ...normalizedBucket,
      object_count: normalizedObjects.length,
      total_size: totalSize,
      checksum_coverage: {
        crc32c: normalizedObjects.filter((object) => object.hasCrc32c).length,
        md5: normalizedObjects.filter((object) => object.hasMd5).length,
      },
      object_key_policy: "sha256-only",
      sample_objects: normalizedObjects.slice(0, 10).map((object) => ({
        key_sha256: object.keyHash,
        size: object.size,
        has_crc32c: object.hasCrc32c,
        has_md5: object.hasMd5,
        content_type: object.contentType,
        updated_at: object.updatedAt,
      })),
    },
    cloud_sql: {
      instance_count: normalizedSqlInstances.length,
      candidate_instances: candidateInstances,
    },
  };

  return report;
}

async function readJson(filePath, label) {
  const content = await readFile(filePath, "utf8");
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

async function writeReport(outPath, report) {
  const resolvedOutPath = resolveRepoPath(outPath);
  await mkdir(path.dirname(resolvedOutPath), { recursive: true });
  await writeFile(resolvedOutPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const report = buildGcpSourceInventoryReport({
    bucket: await readJson(options.gcsBucketPath, "GCS bucket inventory"),
    objects: await readJson(options.gcsObjectsPath, "GCS objects inventory"),
    sqlInstances: await readJson(options.sqlInstancesPath, "Cloud SQL instances inventory"),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  });

  if (options.outPath) {
    await writeReport(options.outPath, report);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`GCP source inventory: ${report.ok ? "PASS" : "FAIL"}`);
    console.log(`GCS objects: ${report.gcs_bucket.object_count}`);
    console.log(`Cloud SQL candidates: ${report.cloud_sql.candidate_instances.length}`);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`GCP source inventory failed: ${error.message}`);
    process.exit(2);
  });
}

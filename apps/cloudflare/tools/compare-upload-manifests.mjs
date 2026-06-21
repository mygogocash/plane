import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function usage() {
  return `Usage: node apps/cloudflare/tools/compare-upload-manifests.mjs <gcs-manifest.json> <r2-manifest.json> [--json] [--out <report.json>] [--require-checksum]

Compares exported GCS and R2 upload manifests. Exit codes:
  0  manifests match by key, size, and shared checksum fields
  1  one or more objects differ
  2  usage or input error

Accepted JSON shapes:
  [{"key":"workspace/logo.png","size":123,"crc32c":"..."}]
  [{"name":"workspace/logo.png","metadata":{"size":123,"etag":"..."}}]
  {"objects":[{"key":"workspace/logo.png","size":123}]}
  {"workspace/logo.png":{"size":123,"etag":"..."}}`;
}

function parseArgs(argv) {
  const positional = [];
  const options = { json: false, outPath: null, requireChecksum: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--out") {
      const outPath = argv[index + 1];
      if (!outPath) {
        throw new Error("--out requires a path");
      }
      options.outPath = outPath;
      index += 1;
    } else if (arg === "--require-checksum") {
      options.requireChecksum = true;
    } else {
      positional.push(arg);
    }
  }

  if (!options.help && positional.length !== 2) {
    throw new Error("Expected source and target manifest JSON file paths");
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

function coerceSize(value, key) {
  const numberValue = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`Invalid size for ${key}: ${JSON.stringify(value)}`);
  }

  return numberValue;
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

function readNested(row, key) {
  if (row[key] !== undefined) {
    return row[key];
  }
  if (isRecord(row.metadata) && row.metadata[key] !== undefined) {
    return row.metadata[key];
  }
  if (isRecord(row.httpMetadata) && row.httpMetadata[key] !== undefined) {
    return row.httpMetadata[key];
  }
  return undefined;
}

function normalizeChecksum(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^"|"$/g, "");
}

function normalizeObject(row, fallbackKey, label) {
  if (!isRecord(row)) {
    throw new Error(`${label} object for ${fallbackKey ?? "(unknown)"} must be an object`);
  }

  const key = readString(row, ["key", "name", "object", "objectKey", "path"]) ?? fallbackKey;
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(`${label} object is missing key/name/object/objectKey/path`);
  }

  const rawSize = readNested(row, "size") ?? readNested(row, "contentLength") ?? readNested(row, "content_length");
  const checksums = {
    crc32c: normalizeChecksum(readNested(row, "crc32c")),
    etag: normalizeChecksum(readNested(row, "etag") ?? readNested(row, "httpEtag")),
    md5Hash: normalizeChecksum(readNested(row, "md5Hash") ?? readNested(row, "md5")),
    sha256: normalizeChecksum(readNested(row, "sha256") ?? readNested(row, "checksum")),
  };

  return {
    key,
    size: coerceSize(rawSize, key),
    checksums: Object.fromEntries(Object.entries(checksums).filter(([, value]) => value !== null)),
  };
}

function manifestRows(json) {
  if (Array.isArray(json)) {
    return json.map((row) => [null, row]);
  }

  if (isRecord(json) && Array.isArray(json.objects)) {
    return json.objects.map((row) => [null, row]);
  }

  if (isRecord(json) && Array.isArray(json.items)) {
    return json.items.map((row) => [null, row]);
  }

  if (!isRecord(json)) {
    throw new Error("Manifest must be an array, {objects}, {items}, or an object map");
  }

  return Object.entries(json);
}

export function normalizeManifest(json, label) {
  const objects = new Map();

  for (const [fallbackKey, row] of manifestRows(json)) {
    const object = normalizeObject(row, fallbackKey, label);
    if (objects.has(object.key)) {
      throw new Error(`${label} manifest contains duplicate key: ${object.key}`);
    }
    objects.set(object.key, object);
  }

  return objects;
}

export async function loadManifest(filePath, label) {
  const content = await readFile(filePath, "utf8");
  let json;

  try {
    json = JSON.parse(content);
  } catch (error) {
    throw new Error(`${label} manifest is not valid JSON: ${error.message}`, { cause: error });
  }

  return normalizeManifest(json, label);
}

function compareChecksums(source, target, options = {}) {
  const fields = [...new Set([...Object.keys(source.checksums), ...Object.keys(target.checksums)])].toSorted();
  const mismatches = [];
  let sharedChecksumCount = 0;

  for (const field of fields) {
    const sourceValue = source.checksums[field];
    const targetValue = target.checksums[field];

    if (!sourceValue || !targetValue) {
      continue;
    }

    sharedChecksumCount += 1;

    if (sourceValue !== targetValue) {
      mismatches.push({ field, sourceValue, targetValue });
    }
  }

  if (options.requireChecksum && sharedChecksumCount === 0) {
    mismatches.push({
      field: "shared-checksum",
      sourceValue: null,
      targetValue: null,
      status: "missing_shared_checksum",
    });
  }

  return mismatches;
}

export function compareManifests(sourceObjects, targetObjects, options = {}) {
  const keys = [...new Set([...sourceObjects.keys(), ...targetObjects.keys()])].toSorted();
  const mismatches = [];
  let matchedObjectCount = 0;

  for (const key of keys) {
    const source = sourceObjects.get(key);
    const target = targetObjects.get(key);

    if (!source || !target) {
      mismatches.push({
        key,
        status: source ? "missing_target" : "missing_source",
        sourceSize: source?.size ?? null,
        targetSize: target?.size ?? null,
      });
      continue;
    }

    const checksumMismatches = compareChecksums(source, target, options);
    if (source.size !== target.size || checksumMismatches.length > 0) {
      mismatches.push({
        key,
        status: "mismatch",
        sourceSize: source.size,
        targetSize: target.size,
        checksumMismatches,
      });
      continue;
    }

    matchedObjectCount += 1;
  }

  return {
    ok: mismatches.length === 0,
    checksumPolicy: {
      requireSharedChecksum: Boolean(options.requireChecksum),
    },
    sourceObjectCount: sourceObjects.size,
    targetObjectCount: targetObjects.size,
    matchedObjectCount,
    mismatchedObjectCount: mismatches.length,
    mismatches,
  };
}

async function writeReport(outPath, report, sourcePath, targetPath) {
  const absoluteOutPath = path.resolve(outPath);
  await mkdir(path.dirname(absoluteOutPath), { recursive: true });
  await writeFile(
    absoluteOutPath,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        ok: report.ok,
        source_manifest: path.normalize(sourcePath),
        target_manifest: path.normalize(targetPath),
        ...report,
      },
      null,
      2
    )}\n`
  );
}

function printHumanReport(report, sourcePath, targetPath) {
  console.log(`Upload manifest comparison: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Source: ${path.normalize(sourcePath)}`);
  console.log(`Target: ${path.normalize(targetPath)}`);
  console.log(`Source objects: ${report.sourceObjectCount}`);
  console.log(`Target objects: ${report.targetObjectCount}`);
  console.log(`Matched objects: ${report.matchedObjectCount}`);
  console.log(`Mismatched objects: ${report.mismatchedObjectCount}`);

  if (report.mismatches.length > 0) {
    console.log("");
    console.log("Mismatches:");
    for (const mismatch of report.mismatches.slice(0, 50)) {
      console.log(`- ${mismatch.key}: ${mismatch.status}`);
    }
    if (report.mismatches.length > 50) {
      console.log(`... ${report.mismatches.length - 50} more mismatches omitted`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const sourceManifest = await loadManifest(options.sourcePath, "source");
  const targetManifest = await loadManifest(options.targetPath, "target");
  const report = compareManifests(sourceManifest, targetManifest, {
    requireChecksum: options.requireChecksum,
  });

  if (options.outPath) {
    await writeReport(options.outPath, report, options.sourcePath, options.targetPath);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report, options.sourcePath, options.targetPath);
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Upload manifest comparison failed: ${error.message}`);
    process.exitCode = 2;
  });
}

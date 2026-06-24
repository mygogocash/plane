import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveRepoPath } from "./path-utils.mjs";

function usage() {
  return `Usage: node apps/cloudflare/tools/smoke-worker.mjs <worker-base-url> [--json] [--out <report.json>]

Runs non-authenticated smoke checks against a deployed Manut Cloudflare Worker.

Exit codes:
  0  required smoke checks passed
  1  one or more smoke checks failed
  2  usage or input error`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    outPath: null,
    positional: [],
  };

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

    if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    options.positional.push(arg);
  }

  if (!options.help && options.positional.length !== 1) {
    throw new Error("Expected exactly one Worker base URL");
  }

  return {
    ...options,
    baseUrl: options.positional[0],
  };
}

function normalizeBaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

const checks = [
  {
    id: "healthz",
    path: "/healthz",
    expectedStatuses: [200],
    validateJson: (json) => json.ok === true && json.service === "manut-cloudflare",
  },
  {
    id: "instances",
    path: "/api/instances/",
    expectedStatuses: [200],
    validateJson: (json) => json.instance?.instance_name === "Manut" && json.instance?.edition === "PLANE_COMMUNITY",
  },
  {
    id: "migration-status",
    path: "/api/cloudflare/migration-status",
    expectedStatuses: [200],
    validateJson: (json) =>
      json.status === "queues-cron-cache-live" &&
      json.legacy_proxy_configured === true &&
      json.r2_uploads_read_enabled === false,
  },
  {
    id: "route-map",
    path: "/api/cloudflare/routes",
    expectedStatuses: [200],
    validateJson: (json) =>
      json.cutover_ready === false && json.legacy_proxy_configured === true && Array.isArray(json.routes),
  },
  {
    id: "d1-workspaces-shadow",
    path: "/api/cloudflare/d1/workspaces",
    expectedStatuses: [200],
    validateJson: (json) =>
      json.status === "shadow" &&
      json.source === "d1" &&
      json.cutover_ready === false &&
      Array.isArray(json.workspaces),
  },
  {
    id: "legacy-api-proxy",
    path: "/api/workspaces/",
    expectedStatuses: [401, 403],
    validateHeaders: (headers) =>
      headers["x-manut-edge-route"] === "legacy-gke" && headers["x-manut-edge-contract"] === "api",
  },
  {
    id: "legacy-uploads-proxy",
    path: "/uploads",
    expectedStatuses: [403],
    validateHeaders: (headers) =>
      headers["x-manut-edge-route"] === "legacy-gke" && headers["x-manut-edge-contract"] === "uploads",
  },
];

function diagnosticHeaders() {
  const token = process.env.MANUT_DIAGNOSTIC_TOKEN?.trim();
  return token ? { "x-manut-diagnostic-token": token } : {};
}

async function runCheck(baseUrl, check) {
  const url = new URL(check.path, baseUrl);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      headers: diagnosticHeaders(),
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    const headers = Object.fromEntries(
      [...response.headers.entries()].map(([key, value]) => [key.toLowerCase(), value])
    );
    const assertions = [];
    const expectedStatus = check.expectedStatuses.includes(response.status);

    assertions.push({
      ok: expectedStatus,
      name: "status",
      expected: check.expectedStatuses,
      actual: response.status,
    });

    let json = null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json") && body) {
      try {
        json = JSON.parse(body);
      } catch {
        json = null;
      }
    }

    if (check.validateJson) {
      assertions.push({
        ok: Boolean(json && check.validateJson(json)),
        name: "json-contract",
      });
    }

    if (check.validateHeaders) {
      assertions.push({
        ok: check.validateHeaders(headers),
        name: "headers-contract",
      });
    }

    return {
      id: check.id,
      ok: assertions.every((assertion) => assertion.ok),
      url: url.toString(),
      status: response.status,
      duration_ms: Date.now() - startedAt,
      content_type: contentType || null,
      cf_ray: response.headers.get("cf-ray"),
      edge_route: response.headers.get("x-manut-edge-route"),
      edge_contract: response.headers.get("x-manut-edge-contract"),
      assertions,
      body_sample: body.slice(0, 160),
    };
  } catch (error) {
    return {
      id: check.id,
      ok: false,
      url: url.toString(),
      duration_ms: Date.now() - startedAt,
      error: error.message,
      assertions: [
        {
          ok: false,
          name: "request",
        },
      ],
    };
  }
}

function printHuman(report) {
  console.log(`Cloudflare Worker smoke: ${report.ok ? "PASS" : "FAIL"}`);
  console.log(`Base URL: ${report.base_url}`);
  console.log(`Checks passed: ${report.summary.passed}/${report.summary.total}`);

  for (const check of report.checks) {
    console.log(`- ${check.ok ? "PASS" : "FAIL"} ${check.id}: HTTP ${check.status ?? "n/a"}`);
  }
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Worker smoke failed: ${error.message}`);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const results = await Promise.all(checks.map((check) => runCheck(baseUrl, check)));
  const failed = results.filter((result) => !result.ok);
  const report = {
    generated_at: new Date().toISOString(),
    evidence_kind: "worker-smoke",
    base_url: baseUrl.toString(),
    ok: failed.length === 0,
    summary: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
    },
    checks: results,
  };

  if (options.outPath) {
    const outPath = resolveRepoPath(options.outPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`Worker smoke failed: ${error.message}`);
  process.exitCode = 2;
});

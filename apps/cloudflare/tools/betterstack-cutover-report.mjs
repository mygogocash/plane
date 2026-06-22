import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoPath } from "./path-utils.mjs";

function usage() {
  return `Usage: node apps/cloudflare/tools/betterstack-cutover-report.mjs [--json] [--out <report.json>] [--require-endpoint-probes] [--soft-fail]

Captures Phase 7 Better Stack cutover evidence for manut.xyz, app.manut.xyz,
and app.manut.xyz/api/instances/. The command also records live endpoint probes
as required cutover evidence. The --require-endpoint-probes flag is accepted for
explicit workflow readability; endpoint probes are always required by the Phase 7
readiness gate.

Environment:
  BETTERSTACK_API_TOKEN       required for ok:true monitor evidence
  BETTERSTACK_API_BASE        default https://uptime.betterstack.com/api/v2
  BETTERSTACK_SITE_URL        default https://manut.xyz
  BETTERSTACK_APP_URL         default https://app.manut.xyz
  BETTERSTACK_SITE_MONITOR_NAME
  BETTERSTACK_APP_MONITOR_NAME
  BETTERSTACK_API_MONITOR_NAME

Exit codes:
  0  Better Stack monitors are up and live endpoint probes pass
  1  evidence was captured but one or more gates failed, unless --soft-fail is set
  2  usage or request error`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    outPath: null,
    requireEndpointProbes: false,
    softFail: false,
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

    if (arg === "--require-endpoint-probes") {
      options.requireEndpointProbes = true;
      continue;
    }

    if (arg === "--soft-fail") {
      options.softFail = true;
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function normalizeMonitorUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  const normalizedPath = trimTrailingSlash(url.pathname);
  url.pathname = normalizedPath === "" ? "/" : normalizedPath;

  return trimTrailingSlash(url.toString());
}

export function requiredMonitorDefinitions(env = process.env) {
  const appUrl = trimTrailingSlash(env.BETTERSTACK_APP_URL || env.GCP_APP_URL || "https://app.manut.xyz");
  const siteUrl = trimTrailingSlash(env.BETTERSTACK_SITE_URL || "https://manut.xyz");

  return [
    {
      id: "public-site",
      name: env.BETTERSTACK_SITE_MONITOR_NAME || "manut.xyz",
      url: siteUrl,
      required_keyword: env.BETTERSTACK_SITE_KEYWORD || "Manut",
    },
    {
      id: "app-root",
      name: env.BETTERSTACK_APP_MONITOR_NAME || "app.manut.xyz",
      url: appUrl,
      required_keyword: env.BETTERSTACK_APP_KEYWORD || "Manut",
    },
    {
      id: "api-instances",
      name: env.BETTERSTACK_API_MONITOR_NAME || "app.manut.xyz API instances",
      url: `${appUrl}/api/instances/`,
      required_keyword: env.BETTERSTACK_API_KEYWORD || "current_version",
    },
  ];
}

export function endpointProbeHeaders() {
  return {
    "user-agent": "Mozilla/5.0 (compatible; ManutCutoverProbe/1.0; +https://manut.xyz)",
    accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  };
}

function monitorAttributes(monitor) {
  return monitor && typeof monitor === "object" && monitor.attributes && typeof monitor.attributes === "object"
    ? monitor.attributes
    : {};
}

export function findMatchingMonitor(monitors, definition) {
  const urlMatch = monitors.find((monitor) => monitorUrlMatches(monitorAttributes(monitor).url, definition.url));
  if (urlMatch) {
    return urlMatch;
  }

  return monitors.find((monitor) => monitorAttributes(monitor).pronounceable_name === definition.name) ?? null;
}

function monitorUrlMatches(rawUrl, expectedUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return false;
  }

  try {
    return normalizeMonitorUrl(rawUrl) === normalizeMonitorUrl(expectedUrl);
  } catch {
    return false;
  }
}

export function buildMonitorReport(monitors, definitions = requiredMonitorDefinitions()) {
  const checks = definitions.map((definition) => {
    const monitor = findMatchingMonitor(monitors, definition);
    const attributes = monitorAttributes(monitor);
    const status = typeof attributes.status === "string" ? attributes.status : null;
    const url = typeof attributes.url === "string" ? attributes.url : null;
    const urlMatches = monitorUrlMatches(url, definition.url);
    const ok = Boolean(monitor) && status === "up" && urlMatches;
    const remediation = (() => {
      if (ok) {
        return null;
      }

      if (!monitor) {
        return `Better Stack monitor ${definition.name} was not found by name or URL.`;
      }

      if (!urlMatches) {
        return `Better Stack monitor ${definition.name} points to ${url ?? "missing URL"}, expected ${definition.url}.`;
      }

      return `Better Stack monitor ${definition.name} is ${status ?? "missing status"}, expected up.`;
    })();

    return {
      id: definition.id,
      ok,
      expected_status: "up",
      monitor_id: monitor?.id ?? null,
      monitor_name: attributes.pronounceable_name ?? null,
      expected_name: definition.name,
      url,
      expected_url: definition.url,
      url_matches: urlMatches,
      required_keyword: attributes.required_keyword ?? definition.required_keyword,
      status,
      last_checked_at: attributes.last_checked_at ?? null,
      updated_at: attributes.updated_at ?? null,
      remediation,
    };
  });
  const failed = checks.filter((check) => !check.ok);

  return {
    ok: failed.length === 0,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    checks,
  };
}

export function buildBlockedMonitorReport(definitions = requiredMonitorDefinitions(), remediation) {
  const checks = definitions.map((definition) => ({
    id: definition.id,
    ok: false,
    expected_name: definition.name,
    expected_url: definition.url,
    status: null,
    remediation,
  }));

  return {
    ok: false,
    summary: {
      total: checks.length,
      passed: 0,
      failed: checks.length,
    },
    checks,
  };
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Better Stack API ${url} failed with HTTP ${response.status}: ${body.slice(0, 240)}`);
  }

  return body ? JSON.parse(body) : {};
}

async function listBetterStackMonitors(apiBase, token, nextUrl = `${trimTrailingSlash(apiBase)}/monitors`, page = 0) {
  if (!nextUrl || page >= 20) {
    return [];
  }

  const json = await fetchJson(nextUrl, token);
  const pageMonitors = Array.isArray(json.data) ? json.data : [];
  const followingUrl = typeof json.pagination?.next === "string" ? json.pagination.next : "";
  const followingMonitors = await listBetterStackMonitors(apiBase, token, followingUrl, page + 1);

  return [...pageMonitors, ...followingMonitors];
}

async function probeEndpoint(definition) {
  const startedAt = Date.now();

  try {
    const response = await fetch(definition.url, {
      method: "GET",
      headers: endpointProbeHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    const keywordOk = definition.required_keyword ? body.includes(definition.required_keyword) : true;
    const statusOk = response.status === 200;

    return {
      id: definition.id,
      ok: statusOk && keywordOk,
      url: definition.url,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      content_type: response.headers.get("content-type"),
      required_keyword: definition.required_keyword,
      keyword_found: keywordOk,
      body_sample: body.slice(0, 160),
      remediation:
        statusOk && keywordOk
          ? null
          : `Live endpoint ${definition.url} must return HTTP 200 and contain ${definition.required_keyword}.`,
    };
  } catch (error) {
    return {
      id: definition.id,
      ok: false,
      url: definition.url,
      duration_ms: Date.now() - startedAt,
      error: error.message,
      remediation: `Live endpoint ${definition.url} request failed.`,
    };
  }
}

async function writeReport(outPath, report) {
  const absoluteOutPath = resolveRepoPath(outPath);
  await mkdir(path.dirname(absoluteOutPath), { recursive: true });
  await writeFile(absoluteOutPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function buildCutoverReport({ apiBase, betterStackApiError, endpointChecks, monitorReport }) {
  const failedEndpointChecks = endpointChecks.filter((check) => !check.ok);

  return {
    generated_at: new Date().toISOString(),
    evidence_kind: "betterstack-cutover",
    ok: monitorReport.ok && failedEndpointChecks.length === 0,
    api_base: apiBase,
    betterstack_api_error: betterStackApiError,
    endpoint_probes_required: true,
    monitor_summary: monitorReport.summary,
    endpoint_summary: {
      total: endpointChecks.length,
      passed: endpointChecks.length - failedEndpointChecks.length,
      failed: failedEndpointChecks.length,
    },
    monitor_checks: monitorReport.checks,
    endpoint_checks: endpointChecks,
  };
}

function printHumanReport(report) {
  console.log(`Better Stack cutover report: ${report.ok ? "PASS" : "BLOCKED"}`);
  console.log(`Monitor checks: ${report.monitor_summary.passed}/${report.monitor_summary.total}`);
  console.log(`Endpoint probes: ${report.endpoint_summary.passed}/${report.endpoint_summary.total}`);

  for (const check of report.monitor_checks) {
    console.log(`- ${check.ok ? "PASS" : "FAIL"} monitor ${check.expected_name}: ${check.status ?? "missing"}`);
  }
  for (const check of report.endpoint_checks) {
    console.log(`- ${check.ok ? "PASS" : "FAIL"} endpoint ${check.id}: HTTP ${check.status ?? "n/a"}`);
  }
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Better Stack cutover report failed: ${error.message}`);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const definitions = requiredMonitorDefinitions();
  const endpointChecks = await Promise.all(definitions.map((definition) => probeEndpoint(definition)));
  let monitorReport = buildBlockedMonitorReport(
    definitions,
    "BETTERSTACK_API_TOKEN is required to verify monitor state."
  );
  let betterStackApiError = null;

  const token = process.env.BETTERSTACK_API_TOKEN;
  const apiBase = process.env.BETTERSTACK_API_BASE || "https://uptime.betterstack.com/api/v2";

  if (token) {
    try {
      const monitors = await listBetterStackMonitors(apiBase, token);
      monitorReport = buildMonitorReport(monitors, definitions);
    } catch (error) {
      betterStackApiError = error.message;
      monitorReport = buildBlockedMonitorReport(definitions, `Better Stack API request failed: ${error.message}`);
    }
  }

  const report = buildCutoverReport({
    apiBase,
    betterStackApiError,
    endpointChecks,
    monitorReport,
  });

  if (options.outPath) {
    await writeReport(options.outPath, report);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exitCode = report.ok || options.softFail ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Better Stack cutover report failed: ${error.message}`);
    process.exitCode = 2;
  });
}

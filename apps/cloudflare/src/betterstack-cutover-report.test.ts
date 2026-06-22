import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildBlockedMonitorReport,
  buildCutoverReport,
  buildMonitorReport,
  findMatchingMonitor,
  normalizeMonitorUrl,
  requiredMonitorDefinitions,
} from "../tools/betterstack-cutover-report.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");
const reportCli = path.join(repoRoot, "apps", "cloudflare", "tools", "betterstack-cutover-report.mjs");

const env = {
  BETTERSTACK_APP_URL: "https://app.manut.xyz/",
  BETTERSTACK_SITE_URL: "https://manut.xyz/",
  BETTERSTACK_APP_MONITOR_NAME: "app.manut.xyz",
  BETTERSTACK_SITE_MONITOR_NAME: "manut.xyz",
  BETTERSTACK_API_MONITOR_NAME: "app.manut.xyz API instances",
};

function runReportCli(args: string[], outPath: string, envOverride: NodeJS.ProcessEnv = {}) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn("node", [reportCli, ...args, "--out", outPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        BETTERSTACK_API_TOKEN: "",
        BETTERSTACK_APP_URL: "http://127.0.0.1:9",
        BETTERSTACK_SITE_URL: "http://127.0.0.1:9",
        ...envOverride,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

describe("Better Stack cutover report helpers", () => {
  it("normalizes monitor URLs for trailing-slash matching", () => {
    expect(normalizeMonitorUrl("https://app.manut.xyz/")).toBe("https://app.manut.xyz");
    expect(normalizeMonitorUrl("https://app.manut.xyz/api/instances/")).toBe("https://app.manut.xyz/api/instances");
  });

  it("requires app, public site, and API instance monitors", () => {
    expect(requiredMonitorDefinitions(env)).toEqual([
      expect.objectContaining({
        id: "public-site",
        name: "manut.xyz",
        url: "https://manut.xyz",
      }),
      expect.objectContaining({
        id: "app-root",
        name: "app.manut.xyz",
        url: "https://app.manut.xyz",
      }),
      expect.objectContaining({
        id: "api-instances",
        name: "app.manut.xyz API instances",
        url: "https://app.manut.xyz/api/instances/",
      }),
    ]);
  });

  it("matches existing monitors by name or normalized URL", () => {
    const definitions = requiredMonitorDefinitions(env);
    const monitor = {
      id: "monitor-api",
      attributes: {
        pronounceable_name: "legacy display name",
        url: "https://app.manut.xyz/api/instances",
        status: "up",
      },
    };

    expect(findMatchingMonitor([monitor], definitions[2])).toBe(monitor);
  });

  it("prefers the canonical URL match over a stale duplicate monitor name", () => {
    const definitions = requiredMonitorDefinitions(env);
    const staleNameMatch = {
      id: "monitor-stale-app",
      attributes: {
        pronounceable_name: "app.manut.xyz",
        url: "https://staging.manut.xyz",
        status: "up",
      },
    };
    const canonicalUrlMatch = {
      id: "monitor-canonical-app",
      attributes: {
        pronounceable_name: "legacy display name",
        url: "https://app.manut.xyz/",
        status: "up",
      },
    };

    expect(findMatchingMonitor([staleNameMatch, canonicalUrlMatch], definitions[1])).toBe(canonicalUrlMatch);
  });

  it("ignores invalid monitor URLs while looking for a matching monitor", () => {
    const definitions = requiredMonitorDefinitions(env);
    const matchingMonitor = {
      id: "monitor-api",
      attributes: {
        pronounceable_name: "api",
        url: "https://app.manut.xyz/api/instances/",
        status: "up",
      },
    };

    expect(
      findMatchingMonitor(
        [
          {
            id: "broken-monitor",
            attributes: {
              pronounceable_name: "broken",
              url: "not a url",
              status: "up",
            },
          },
          matchingMonitor,
        ],
        definitions[2]
      )
    ).toBe(matchingMonitor);
  });

  it("blocks cutover evidence when any required monitor is missing or not up", () => {
    const definitions = requiredMonitorDefinitions(env);
    const report = buildMonitorReport(
      [
        {
          id: "monitor-site",
          attributes: {
            pronounceable_name: "manut.xyz",
            url: "https://manut.xyz",
            status: "up",
          },
        },
        {
          id: "monitor-app",
          attributes: {
            pronounceable_name: "app.manut.xyz",
            url: "https://app.manut.xyz/",
            status: "validating",
          },
        },
      ],
      definitions
    );

    expect(report).toMatchObject({
      ok: false,
      summary: {
        total: 3,
        passed: 1,
        failed: 2,
      },
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "app-root",
          ok: false,
          status: "validating",
        }),
        expect.objectContaining({
          id: "api-instances",
          ok: false,
          monitor_id: null,
        }),
      ])
    );
  });

  it("blocks name-matched monitors that point at the wrong URL", () => {
    const definitions = requiredMonitorDefinitions(env);
    const report = buildMonitorReport(
      [
        {
          id: "monitor-app",
          attributes: {
            pronounceable_name: "app.manut.xyz",
            url: "https://legacy.manut.example/",
            status: "up",
          },
        },
      ],
      [definitions[1]]
    );

    expect(report).toMatchObject({
      ok: false,
      summary: {
        total: 1,
        passed: 0,
        failed: 1,
      },
    });
    expect(report.checks[0]).toMatchObject({
      id: "app-root",
      ok: false,
      status: "up",
      url: "https://legacy.manut.example/",
      expected_url: "https://app.manut.xyz",
      url_matches: false,
      remediation:
        "Better Stack monitor app.manut.xyz points to https://legacy.manut.example/, expected https://app.manut.xyz.",
    });
  });

  it("builds blocked monitor evidence when the Better Stack API cannot be queried", () => {
    const definitions = requiredMonitorDefinitions(env);
    const report = buildBlockedMonitorReport(definitions, "Better Stack API request failed with HTTP 401.");

    expect(report).toMatchObject({
      ok: false,
      summary: {
        total: 3,
        passed: 0,
        failed: 3,
      },
    });
    expect(report.checks).toEqual(
      definitions.map((definition) =>
        expect.objectContaining({
          id: definition.id,
          ok: false,
          expected_name: definition.name,
          expected_url: definition.url,
          status: null,
          remediation: "Better Stack API request failed with HTTP 401.",
        })
      )
    );
  });

  it("can write blocked evidence without failing CI capture when soft-fail is enabled", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "betterstack-report-"));
    const reportPath = path.join(tempDir, "report.json");

    const result = await runReportCli(["--json", "--soft-fail"], reportPath);
    const report = JSON.parse(await readFile(reportPath, "utf8"));

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(report).toMatchObject({
      ok: false,
      monitor_summary: {
        total: 3,
        passed: 0,
        failed: 3,
      },
    });
    expect(report.monitor_checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ok: false,
          remediation: "BETTERSTACK_API_TOKEN is required to verify monitor state.",
        }),
      ])
    );
  });

  it("blocks cutover evidence when live endpoint probes fail even if monitors are up", () => {
    const definitions = requiredMonitorDefinitions(env);
    const monitorReport = buildMonitorReport(
      definitions.map((definition) => ({
        id: `monitor-${definition.id}`,
        attributes: {
          pronounceable_name: definition.name,
          url: definition.url,
          status: "up",
        },
      })),
      definitions
    );
    const report = buildCutoverReport({
      apiBase: "https://uptime.betterstack.com/api/v2",
      betterStackApiError: null,
      endpointChecks: [
        { id: "public-site", ok: true },
        { id: "app-root", ok: false, status: 503 },
        { id: "api-instances", ok: true },
      ],
      monitorReport,
    });

    expect(report).toMatchObject({
      ok: false,
      endpoint_probes_required: true,
      monitor_summary: { failed: 0 },
      endpoint_summary: { failed: 1 },
    });
  });
});

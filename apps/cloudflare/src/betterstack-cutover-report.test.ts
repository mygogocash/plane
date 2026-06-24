/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildBlockedMonitorReport,
  buildCutoverReport,
  buildMonitorReport,
  buildMonitorReportFromState,
  endpointProbeHeaders,
  findMatchingMonitor,
  normalizeMonitorUrl,
  probeEndpoint,
  requiredMonitorDefinitions,
} from "../tools/betterstack-cutover-report.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");
const reportCli = path.join(repoRoot, "apps", "cloudflare", "tools", "betterstack-cutover-report.mjs");

const env = {
  BETTERSTACK_APP_URL: "https://app.manut.xyz/",
  BETTERSTACK_SITE_URL: "https://manut.xyz/",
  BETTERSTACK_SITE_FALLBACK_URL: "https://manut.pages.dev",
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes monitor URLs for trailing-slash matching", () => {
    expect(normalizeMonitorUrl("https://app.manut.xyz/")).toBe("https://app.manut.xyz");
    expect(normalizeMonitorUrl("https://app.manut.xyz/api/instances/")).toBe("https://app.manut.xyz/api/instances");
  });

  it("requires app, public site, and API instance monitors", () => {
    expect(requiredMonitorDefinitions(env)).toEqual([
      expect.objectContaining({
        id: "public-site",
        name: "manut.xyz",
        fallback_url: "https://manut.pages.dev",
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

  it("uses browser-compatible headers for live endpoint probes", () => {
    expect(endpointProbeHeaders()).toMatchObject({
      "user-agent": expect.stringContaining("ManutCutoverProbe"),
      accept: expect.stringContaining("text/html"),
    });
  });

  it("falls back to the Pages origin only when the public site probe sees a Cloudflare challenge", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>challenge-platform</body></html>",
          {
            status: 403,
            headers: {
              "content-type": "text/html; charset=UTF-8",
            },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response("<!DOCTYPE html><html><head><title>Manut</title></head><body>Manut</body></html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const check = await probeEndpoint({
      id: "public-site",
      url: "https://manut.xyz",
      fallback_url: "https://manut.pages.dev",
      required_keyword: "Manut",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://manut.xyz",
      expect.objectContaining({ headers: endpointProbeHeaders() })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://manut.pages.dev",
      expect.objectContaining({ headers: endpointProbeHeaders() })
    );
    expect(check).toMatchObject({
      id: "public-site",
      ok: true,
      url: "https://manut.xyz",
      status: 200,
      primary_status: 403,
      fallback_url: "https://manut.pages.dev",
      fallback_used: true,
      keyword_found: true,
      remediation: null,
    });
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

  it("builds green monitor checks from operator-provided monitor state", () => {
    const definitions = requiredMonitorDefinitions(env);
    const report = buildMonitorReportFromState(
      {
        monitors: [
          {
            id: "betterstack-public-site",
            name: "manut.xyz",
            url: "https://manut.xyz/",
            status: "up",
          },
          {
            id: "betterstack-app-root",
            name: "app.manut.xyz",
            url: "https://app.manut.xyz/",
            status: "up",
          },
          {
            id: "betterstack-api-instances",
            name: "app.manut.xyz API instances",
            url: "https://app.manut.xyz/api/instances/",
            status: "up",
          },
        ],
      },
      definitions
    );

    expect(report).toMatchObject({
      ok: true,
      summary: { total: 3, passed: 3, failed: 0 },
    });
    expect(report.checks.map((check) => [check.id, check.monitor_id, check.status, check.url_matches])).toEqual([
      ["public-site", "betterstack-public-site", "up", true],
      ["app-root", "betterstack-app-root", "up", true],
      ["api-instances", "betterstack-api-instances", "up", true],
    ]);
  });

  it("keeps missing monitors blocked when monitor state is incomplete", () => {
    const definitions = requiredMonitorDefinitions(env);
    const report = buildMonitorReportFromState(
      {
        monitors: [
          {
            id: "betterstack-public-site",
            name: "manut.xyz",
            url: "https://manut.xyz/",
            status: "up",
          },
        ],
      },
      definitions
    );

    expect(report).toMatchObject({
      ok: false,
      summary: { total: 3, passed: 1, failed: 2 },
    });
    expect(report.checks.find((check) => check.id === "app-root")).toMatchObject({
      ok: false,
      monitor_id: null,
      status: null,
      remediation: "Better Stack monitor app.manut.xyz was not found by name or URL.",
    });
  });

  it("uses monitor-state files only when no Better Stack API token is available", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "betterstack-state-"));
    const outPath = path.join(tempDir, "report.json");
    const monitorStatePath = path.join(tempDir, "monitor-state.json");
    await writeFile(
      monitorStatePath,
      `${JSON.stringify({
        monitor_checks: [
          {
            id: "public-site",
            monitor_id: "betterstack-public-site",
            expected_name: "manut.xyz",
            url: "http://127.0.0.1:9",
            expected_url: "http://127.0.0.1:9",
            status: "up",
          },
          {
            id: "app-root",
            monitor_id: "betterstack-app-root",
            expected_name: "app.manut.xyz",
            url: "http://127.0.0.1:9",
            expected_url: "http://127.0.0.1:9",
            status: "up",
          },
          {
            id: "api-instances",
            monitor_id: "betterstack-api-instances",
            expected_name: "app.manut.xyz API instances",
            url: "http://127.0.0.1:9/api/instances/",
            expected_url: "http://127.0.0.1:9/api/instances/",
            status: "up",
          },
        ],
      })}\n`,
      "utf8"
    );

    const result = await runReportCli(["--monitor-state", monitorStatePath], outPath, {
      BETTERSTACK_APP_URL: "http://127.0.0.1:9",
      BETTERSTACK_SITE_URL: "http://127.0.0.1:9",
    });
    const report = JSON.parse(await readFile(outPath, "utf8"));

    expect(result.code).toBe(1);
    expect(report).toMatchObject({
      ok: false,
      betterstack_api_error: null,
      monitor_source: "monitor-state-file",
      monitor_state_path: monitorStatePath,
      monitor_summary: { total: 3, passed: 3, failed: 0 },
      endpoint_summary: { failed: 3 },
    });
  });
});

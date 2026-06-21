import { describe, expect, it } from "vitest";

import {
  buildBlockedMonitorReport,
  buildMonitorReport,
  findMatchingMonitor,
  normalizeMonitorUrl,
  requiredMonitorDefinitions,
} from "../tools/betterstack-cutover-report.mjs";

const env = {
  BETTERSTACK_APP_URL: "https://app.manut.xyz/",
  BETTERSTACK_SITE_URL: "https://manut.xyz/",
  BETTERSTACK_APP_MONITOR_NAME: "app.manut.xyz",
  BETTERSTACK_SITE_MONITOR_NAME: "manut.xyz",
  BETTERSTACK_API_MONITOR_NAME: "app.manut.xyz API instances",
};

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
});

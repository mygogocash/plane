/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";

import { proxyLegacyApi, proxyLegacyApiGet } from "./legacy-proxy";

vi.mock("../edge-routing", () => ({
  fetchLegacyOrigin: vi.fn(async () =>
    Response.json([{ id: "project-1", logo_props: { in_use: "emoji", emoji: { value: "🚀" } } }], {
      headers: { allow: "GET, HEAD, OPTIONS" },
    })
  ),
}));

describe("proxyLegacyApi", () => {
  it("forwards POST bodies to legacy with worker-native response headers", async () => {
    const response = await proxyLegacyApi(
      new Request("https://app.manut.xyz/api/assets/v2/workspaces/gogocash/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "logo.png", entity_type: "WORKSPACE_LOGO" }),
      }),
      {
        APP_ORIGIN: "https://app.manut.xyz",
        LEGACY_GKE_ORIGIN: "https://app.manut.xyz",
      },
      "/api/assets/v2/workspaces/gogocash/"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-manut-edge-route")).toBe("worker-native-api");
  });
});

describe("proxyLegacyApiGet", () => {
  it("returns legacy payloads with worker-native response headers", async () => {
    const response = await proxyLegacyApiGet(
      new Request("https://app.manut.xyz/api/workspaces/gogocash/projects/"),
      {
        APP_ORIGIN: "https://app.manut.xyz",
        LEGACY_GKE_ORIGIN: "https://app.manut.xyz",
      },
      "/api/workspaces/gogocash/projects/"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-manut-edge-route")).toBe("worker-native-api");
    await expect(response.json()).resolves.toEqual([
      { id: "project-1", logo_props: { in_use: "emoji", emoji: { value: "🚀" } } },
    ]);
  });
});

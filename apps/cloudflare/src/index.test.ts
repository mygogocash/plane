import { describe, expect, it } from "vitest";

import { app, LiveRoomDurableObject } from "./index";
import type { CloudflareBindings } from "./types";

const env = {
  APP_ENV: "test",
  APP_ORIGIN: "https://app.manut.xyz",
  INSTANCE_VERSION: "test-version",
} satisfies CloudflareBindings;

describe("Manut Cloudflare Worker foundation", () => {
  it("reports health for the Cloudflare runtime", async () => {
    const response = await app.request("/healthz", {}, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "manut-cloudflare",
      env: "test",
    });
  });

  it("preserves the /api/instances/ contract shape", async () => {
    const response = await app.request("/api/instances/", {}, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      config: {
        enable_signup: false,
        is_email_password_enabled: true,
        is_google_enabled: false,
        is_smtp_configured: true,
      },
      instance: {
        current_version: "test-version",
        edition: "PLANE_COMMUNITY",
        instance_name: "Manut",
        is_setup_done: true,
        workspaces_exist: true,
      },
    });
  });

  it("exposes migration status without moving production traffic", async () => {
    const response = await app.request("/api/cloudflare/migration-status", {}, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "frontend-edge-routing",
      active_phase: "frontend-edge-routing",
      app_origin: "https://app.manut.xyz",
      legacy_proxy_configured: false,
      data_target: "d1",
      upload_target: "r2",
      queue_target: "cloudflare-queues",
      live_target: "durable-objects",
    });
  });

  it("publishes the Phase 2 route map without exposing the legacy origin", async () => {
    const response = await app.request(
      "/api/cloudflare/routes",
      {},
      {
        ...env,
        LEGACY_GKE_ORIGIN: "https://legacy-gke.manut.internal",
      }
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      status: "frontend-edge-routing",
      active_phase: "frontend-edge-routing",
      cutover_ready: false,
      legacy_proxy_configured: true,
    });
    expect(JSON.stringify(body)).not.toContain("legacy-gke.manut.internal");
    expect(body.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "local", path: "/api/instances/" }),
        expect.objectContaining({ action: "legacy-proxy", contract: "api", path: "/api/workspaces/" }),
        expect.objectContaining({ action: "legacy-proxy", contract: "static", path: "/assets/index.js" }),
        expect.objectContaining({ action: "legacy-proxy", contract: "app-shell", path: "/" }),
      ])
    );
  });

  it("keeps uploads on the legacy path until R2 cutover is configured", async () => {
    const response = await app.request("/uploads/workspace/logo.png", {}, env);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "LEGACY_GKE_ORIGIN_NOT_CONFIGURED",
    });
  });

  it("defines the live room durable object health path", async () => {
    const durableObject = new LiveRoomDurableObject({ id: { toString: () => "test-room" } } as DurableObjectState, env);
    const response = await durableObject.fetch(new Request("https://app.manut.xyz/live/room/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "manut-live-room",
      storage: "durable-object",
      env: "test",
      id: "test-room",
    });
  });
});

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
      current_version: "test-version",
      deployment_target: "cloudflare",
      is_email_password_enabled: true,
      is_google_enabled: false,
      is_setup_done: true,
      is_signup_enabled: false,
      name: "Manut",
      smtp: true,
    });
  });

  it("exposes migration status without moving production traffic", async () => {
    const response = await app.request("/api/cloudflare/migration-status", {}, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "foundation",
      active_phase: "cloudflare-foundation",
      app_origin: "https://app.manut.xyz",
      legacy_origin: "https://app.manut.xyz",
      data_target: "d1",
      upload_target: "r2",
      queue_target: "cloudflare-queues",
      live_target: "durable-objects",
    });
  });

  it("keeps uploads blocked until the R2 phase implements compatibility", async () => {
    const response = await app.request("/uploads/workspace/logo.png", {}, env);

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({
      error: "R2_UPLOAD_ROUTE_NOT_IMPLEMENTED",
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

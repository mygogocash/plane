import { describe, expect, it, vi } from "vitest";

import cloudflareWorker, { app, LiveRoomDurableObject } from "./index";
import type { CloudflareBindings } from "./types";

const env = {
  APP_ENV: "test",
  APP_ORIGIN: "https://app.manut.xyz",
  INSTANCE_VERSION: "test-version",
} satisfies CloudflareBindings;

type FakeD1Handler = {
  match: string;
  rows: Record<string, unknown>[];
};

function fakeD1(...handlers: FakeD1Handler[]): D1Database {
  return {
    prepare(query: string) {
      const handler = handlers.find(({ match }) => query.includes(match));
      const state = {
        args: [] as unknown[],
      };

      return {
        bind(...args: unknown[]) {
          state.args = args;
          return this;
        },
        async all<T>() {
          const rows =
            handler?.rows.filter((row) => {
              if (!query.includes("w.slug = ?")) {
                return true;
              }
              return row.slug === state.args[0] || row.workspace_slug === state.args[0];
            }) ?? [];

          return {
            results: rows as T[],
            success: true,
            meta: {},
          };
        },
        async first<T>() {
          const rows =
            handler?.rows.filter((row) => {
              if (!query.includes("slug = ?")) {
                return true;
              }
              return row.slug === state.args[0];
            }) ?? [];

          return (rows[0] ?? null) as T | null;
        },
      } as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

function fakeD1Throws(message = "D1 query failed"): D1Database {
  return {
    prepare() {
      return {
        all() {
          throw new Error(message);
        },
      } as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

function fakeLiveRoomsNamespace(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get(id: DurableObjectId) {
      return {
        fetch(request: Request) {
          const room = new LiveRoomDurableObject({ id, storage: undefined } as unknown as DurableObjectState, env);

          return room.fetch(request);
        },
      } as DurableObjectStub;
    },
  } as DurableObjectNamespace;
}

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

  it("preserves the /api/instances contract shape without a trailing slash", async () => {
    const response = await app.request("/api/instances", {}, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      instance: {
        current_version: "test-version",
        instance_name: "Manut",
      },
    });
  });

  it("returns an explicit error when instance config D1 reads fail", async () => {
    const response = await app.request(
      "/api/instances/",
      {},
      {
        ...env,
        MANUT_DB: fakeD1Throws(),
      }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "D1_CONFIG_READ_FAILED",
    });
  });

  it("does not return fallback instance metadata in production without D1", async () => {
    const response = await app.request(
      "/api/instances/",
      {},
      {
        ...env,
        APP_ENV: "production",
      }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "D1_CONFIG_BINDING_MISSING",
    });
  });

  it("exports a Cloudflare Queue consumer for preview deploy triggers", async () => {
    const ack = vi.fn();
    const retry = vi.fn();

    await cloudflareWorker.queue?.(
      {
        queue: "manut-jobs-test",
        messages: [
          {
            id: "message-upload-audit-1",
            body: {
              id: "job-upload-audit-1",
              schemaVersion: 1,
              type: "upload-audit",
              createdAt: "2026-06-21T09:40:00.000Z",
              payload: {
                objectKey: "workspaces/demo/logo.png",
                status: "verified",
                targetBucket: "manut-uploads-preview",
              },
            },
            ack,
            retry,
          },
        ],
      } as unknown as MessageBatch<unknown>,
      env,
      {} as ExecutionContext
    );

    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("exposes migration status without moving production traffic", async () => {
    const response = await app.request("/api/cloudflare/migration-status", {}, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "queues-cron-cache-live",
      active_phase: "queues-cron-cache-live",
      app_origin: "https://app.manut.xyz",
      legacy_proxy_configured: false,
      cache_target: "kv",
      d1_shadow_domains: ["workspaces", "projects"],
      lock_target: "durable-objects",
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

  it("routes uploads to R2 only when the read flag is explicitly enabled", async () => {
    const response = await app.request(
      "/uploads/workspace/logo.png",
      {},
      {
        ...env,
        R2_UPLOADS_READ_ENABLED: "true",
      }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "R2_UPLOADS_BINDING_MISSING",
      key: "workspace/logo.png",
    });
  });

  it("returns an explicit D1 error when workspace shadow reads are not configured", async () => {
    const response = await app.request("/api/cloudflare/d1/workspaces", {}, env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "D1_BINDING_MISSING",
      domain: "workspaces",
    });
  });

  it("requires an internal diagnostic token for production D1 shadow reads", async () => {
    const response = await app.request(
      "/api/cloudflare/d1/workspaces",
      {},
      {
        ...env,
        APP_ENV: "production",
        MANUT_DB: fakeD1({
          match: "FROM workspaces",
          rows: [],
        }),
        MANUT_DIAGNOSTIC_TOKEN: "diagnostic-secret",
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "MANUT_DIAGNOSTIC_ACCESS_DENIED",
    });
  });

  it("allows production D1 shadow reads with the internal diagnostic token", async () => {
    const response = await app.request(
      "/api/cloudflare/d1/workspaces",
      {
        headers: {
          "x-manut-diagnostic-token": "diagnostic-secret",
        },
      },
      {
        ...env,
        APP_ENV: "production",
        MANUT_DB: fakeD1({
          match: "FROM workspaces",
          rows: [],
        }),
        MANUT_DIAGNOSTIC_TOKEN: "diagnostic-secret",
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "d1",
      domain: "workspaces",
    });
  });

  it("lists D1 workspaces through the shadow read endpoint", async () => {
    const response = await app.request(
      "/api/cloudflare/d1/workspaces",
      {},
      {
        ...env,
        MANUT_DB: fakeD1({
          match: "FROM workspaces",
          rows: [
            {
              id: "workspace-1",
              name: "GoGoCash",
              slug: "gogocash",
              logo: null,
              timezone: "Asia/Bangkok",
              created_at: "2026-06-01T00:00:00.000Z",
              updated_at: "2026-06-02T00:00:00.000Z",
            },
          ],
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "shadow",
      source: "d1",
      cutover_ready: false,
      workspaces: [
        {
          id: "workspace-1",
          name: "GoGoCash",
          slug: "gogocash",
          logo_url: null,
          timezone: "Asia/Bangkok",
        },
      ],
    });
  });

  it("lists D1 projects scoped to a workspace slug through the shadow read endpoint", async () => {
    const response = await app.request(
      "/api/cloudflare/d1/workspaces/gogocash/projects",
      {},
      {
        ...env,
        MANUT_DB: fakeD1(
          {
            match: "FROM workspaces",
            rows: [{ id: "workspace-1", slug: "gogocash" }],
          },
          {
            match: "FROM projects",
            rows: [
              {
                id: "project-1",
                workspace_id: "workspace-1",
                workspace_slug: "gogocash",
                name: "Mobile App",
                identifier: "MOB",
                network: 2,
                created_at: "2026-06-03T00:00:00.000Z",
                updated_at: "2026-06-04T00:00:00.000Z",
              },
            ],
          }
        ),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "shadow",
      source: "d1",
      cutover_ready: false,
      workspace_slug: "gogocash",
      projects: [
        {
          id: "project-1",
          workspace_id: "workspace-1",
          name: "Mobile App",
          identifier: "MOB",
          network: 2,
        },
      ],
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

  it("exposes Durable Object live shadow diagnostics without moving /live traffic", async () => {
    const response = await app.request(
      "/api/cloudflare/live/rooms/shadow-room/health",
      {},
      {
        ...env,
        LIVE_ROOMS: fakeLiveRoomsNamespace(),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "manut-live-room",
      storage: "durable-object",
      env: "test",
      id: "shadow-room",
      capabilities: {
        health: true,
        locks: true,
        metadata: true,
        websocket: true,
        collaboration: true,
      },
    });
  });

  it("requires an internal diagnostic token for production live room diagnostics", async () => {
    const response = await app.request(
      "/api/cloudflare/live/rooms/shadow-room/health",
      {},
      {
        ...env,
        APP_ENV: "production",
        LIVE_ROOMS: fakeLiveRoomsNamespace(),
        MANUT_DIAGNOSTIC_TOKEN: "diagnostic-secret",
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "MANUT_DIAGNOSTIC_ACCESS_DENIED",
    });
  });
});

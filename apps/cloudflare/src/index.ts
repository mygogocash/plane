/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Hono } from "hono";

import { classifyEdgeRoute, proxyToLegacyOrigin } from "./edge-routing";
import { legacyNativeCompatibilityStubResponse } from "./legacy-get-stubs";
import { resolveRequestRouting, WORKER_NATIVE_ROUTE_DEFINITIONS, isWorkerNativeApiEnabled } from "./api-router";
import { handleD1WorkspaceProjectsRequest, handleD1WorkspacesRequest } from "./d1-core";
import { buildInstancePayload } from "./instance";
import { handleEmailDispatchJob, isResendConfigured } from "./auth/email-dispatch";
import { handleAuthRequest, matchAuthRoute } from "./auth/handlers";
import { serveWorkerAssets, shouldServeWorkerAssets } from "./assets";
import { consumeJobQueue } from "./jobs";
import { LiveRoomDurableObject } from "./live-room";
import { handleWorkerNativeApiRequest } from "./native-api";
import type { CloudflareBindings } from "./types";
import { handleUploadsRequest } from "./uploads";

export { LiveRoomDurableObject };

export const app = new Hono<{ Bindings: CloudflareBindings }>();

const migrationPhases = [
  "baseline-guardrails",
  "cloudflare-foundation",
  "frontend-edge-routing",
  "r2-upload-migration",
  "d1-backend-rewrite",
  "queues-cron-cache-live",
  "cloudflare-ci-cd",
  "production-cutover",
  "worker-native-api-migration",
  "decommission",
] as const;

const routeMapSamples = [
  { path: "/healthz", purpose: "runtime health" },
  { path: "/api/instances/", purpose: "instance metadata contract" },
  { path: "/api/cloudflare/d1/workspaces", purpose: "D1 workspace shadow reads" },
  { path: "/api/cloudflare/d1/workspaces/gogocash/projects", purpose: "D1 project shadow reads" },
  { path: "/api/cloudflare/live/rooms/shadow-room/health", purpose: "Durable Object live room shadow health" },
  { path: "/api/cloudflare/migration-status", purpose: "migration status contract" },
  { path: "/api/workspaces/", purpose: "legacy API contract" },
  { path: "/auth/login", purpose: "legacy auth contract" },
  { path: "/live/workspace/ws-id/", purpose: "legacy live contract" },
  { path: "/uploads/workspace/logo.png", purpose: "legacy upload compatibility path" },
  { path: "/spaces", purpose: "legacy public spaces contract" },
  { path: "/god-mode", purpose: "legacy admin contract" },
  { path: "/assets/index.js", purpose: "static frontend asset path" },
  { path: "/", purpose: "frontend app shell" },
] as const;

function describeRoute(path: string, purpose: string, appOrigin: string) {
  const classification = classifyEdgeRoute(new Request(new URL(path, appOrigin).toString()));

  return {
    method: "GET",
    purpose,
    ...classification,
  };
}

function isR2UploadsReadEnabled(env: CloudflareBindings): boolean {
  return env.R2_UPLOADS_READ_ENABLED?.toLowerCase() === "true";
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function diagnosticAccessFailure(request: Request, env: CloudflareBindings): Response | null {
  if (env.APP_ENV !== "production") {
    return null;
  }

  const expectedToken = env.MANUT_DIAGNOSTIC_TOKEN?.trim();
  const diagnosticToken = new URL(request.url).searchParams.get("diagnostic_token")?.trim();
  const providedToken =
    request.headers.get("x-manut-diagnostic-token")?.trim() || readBearerToken(request) || diagnosticToken;

  if (expectedToken && providedToken === expectedToken) {
    return null;
  }

  return Response.json(
    {
      error: "MANUT_DIAGNOSTIC_ACCESS_DENIED",
      message: "Production Cloudflare diagnostics require an internal diagnostic token.",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: 403,
    }
  );
}

app.get("/healthz", (c) =>
  c.json({
    ok: true,
    service: "manut-cloudflare",
    env: c.env.APP_ENV ?? "preview",
  })
);

async function buildInstancesResponse(env: CloudflareBindings): Promise<Response> {
  if (env.APP_ENV === "production" && !env.MANUT_DB) {
    return Response.json(
      {
        error: "D1_CONFIG_BINDING_MISSING",
        message: "Production Manut instance metadata requires the MANUT_DB binding.",
      },
      { status: 503 }
    );
  }

  try {
    return Response.json(await buildInstancePayload(env));
  } catch {
    return Response.json(
      {
        error: "D1_CONFIG_READ_FAILED",
        message: "Unable to read Manut instance config from D1.",
      },
      { status: 503 }
    );
  }
}

app.get("/api/instances", (c) => buildInstancesResponse(c.env));
app.get("/api/instances/", (c) => buildInstancesResponse(c.env));

app.get("/api/cloudflare/d1/workspaces", (c) => {
  const accessFailure = diagnosticAccessFailure(c.req.raw, c.env);
  return accessFailure ?? handleD1WorkspacesRequest(c.req.raw, c.env);
});

app.get("/api/cloudflare/d1/workspaces/:workspaceSlug/projects", (c) => {
  const accessFailure = diagnosticAccessFailure(c.req.raw, c.env);
  return accessFailure ?? handleD1WorkspaceProjectsRequest(c.req.raw, c.env, c.req.param("workspaceSlug"));
});

app.get("/api/cloudflare/migration-status", (c) =>
  c.json({
    status: "worker-native-api-migration",
    active_phase: "worker-native-api-migration",
    app_origin: c.env.APP_ORIGIN ?? "https://app.manut.xyz",
    legacy_proxy_configured: Boolean(c.env.LEGACY_GKE_ORIGIN?.trim()),
    worker_native_api_enabled: isWorkerNativeApiEnabled(c.env),
    r2_uploads_read_enabled: isR2UploadsReadEnabled(c.env),
    resend_configured: isResendConfigured(c.env),
    resend_from_email: c.env.RESEND_FROM_EMAIL ?? "Manut <no-reply@gogocash.co>",
    cache_target: "kv",
    data_target: "d1",
    d1_shadow_domains: ["workspaces", "projects", "users", "profiles", "workspace_members", "issues"],
    worker_native_route_ids: WORKER_NATIVE_ROUTE_DEFINITIONS.map((route) => route.id),
    identity_tables_schema: "0003_identity_core",
    issues_tables_schema: "0004_issues_core",
    lock_target: "durable-objects",
    upload_target: "r2",
    queue_target: "cloudflare-queues",
    live_target: "durable-objects",
    phases: migrationPhases,
  })
);

app.get("/api/cloudflare/routes", (c) => {
  const appOrigin = c.env.APP_ORIGIN ?? "https://app.manut.xyz";

  return c.json({
    status: "frontend-edge-routing",
    active_phase: "frontend-edge-routing",
    app_origin: appOrigin,
    cutover_ready: false,
    legacy_proxy_configured: Boolean(c.env.LEGACY_GKE_ORIGIN?.trim()),
    r2_uploads_read_enabled: isR2UploadsReadEnabled(c.env),
    routes: routeMapSamples.map((route) => describeRoute(route.path, route.purpose, appOrigin)),
    notes: [
      "This route map is a shadow-routing contract only.",
      "app.manut.xyz must remain on GKE until the later cutover gate is explicitly approved.",
      "LEGACY_GKE_ORIGIN is intentionally reported only as configured/not configured.",
    ],
  });
});

app.all("/api/cloudflare/live/rooms/*", async (c) => {
  const accessFailure = diagnosticAccessFailure(c.req.raw, c.env);
  if (accessFailure) {
    return accessFailure;
  }

  if (!c.env.LIVE_ROOMS) {
    return c.json(
      {
        error: "LIVE_ROOMS_BINDING_MISSING",
        message: "Durable Object live room binding is not configured.",
      },
      { status: 503 }
    );
  }

  const url = new URL(c.req.url);
  const match = url.pathname.match(/^\/api\/cloudflare\/live\/rooms\/([^/]+)(?:\/(.*))?$/);
  const roomName = match ? decodeURIComponent(match[1] ?? "") : "";
  const roomPath = match?.[2] ? `/${match[2]}` : "";

  if (!roomName) {
    return c.json(
      {
        error: "LIVE_ROOM_NAME_REQUIRED",
        message: "A live room name is required.",
      },
      { status: 400 }
    );
  }

  const id = c.env.LIVE_ROOMS.idFromName(roomName);
  const room = c.env.LIVE_ROOMS.get(id);
  const targetUrl = new URL(
    `/live/${encodeURIComponent(roomName)}${roomPath}`,
    c.env.APP_ORIGIN ?? "https://app.manut.xyz"
  );
  targetUrl.search = url.search;

  return room.fetch(new Request(targetUrl.toString(), c.req.raw));
});

app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const authRoute = matchAuthRoute(c.req.method, url.pathname);
  if (authRoute) {
    return handleAuthRequest(c.req.raw, c.env, authRoute);
  }

  const routing = resolveRequestRouting(c.req.raw, c.env);

  if (routing.kind === "worker-native") {
    return handleWorkerNativeApiRequest(c.req.raw, c.env, routing.route, routing.params);
  }

  const legacyStubResponse = isWorkerNativeApiEnabled(c.env) ? legacyNativeCompatibilityStubResponse(c.req.raw) : null;
  if (legacyStubResponse) {
    return legacyStubResponse;
  }

  const classification = routing.classification;

  if (classification.action === "legacy-proxy") {
    if (classification.contract === "uploads" && isR2UploadsReadEnabled(c.env)) {
      return handleUploadsRequest(c.req.raw, c.env);
    }

    if (shouldServeWorkerAssets(classification.contract)) {
      const assetResponse = await serveWorkerAssets(c.req.raw, c.env);
      if (assetResponse) {
        return assetResponse;
      }
    }

    return proxyToLegacyOrigin(c.req.raw, c.env, classification.contract);
  }

  return c.json(
    {
      error: "CLOUDFLARE_ROUTE_NOT_IMPLEMENTED",
      message: "This route has not been migrated to the Cloudflare runtime yet.",
      route_action: classification.action,
      route_reason: classification.reason,
    },
    { status: 501 }
  );
});

app.notFound((c) =>
  c.json(
    {
      error: "CLOUDFLARE_ROUTE_NOT_IMPLEMENTED",
      message: "This route has not been migrated to the Cloudflare runtime yet.",
    },
    { status: 501 }
  )
);

export const worker = {
  fetch: app.fetch,
  async queue(batch, env) {
    const summary = await consumeJobQueue(batch, env, {
      "email-dispatch": async (envelope, context) => {
        await handleEmailDispatchJob(envelope, context.env);
      },
    });
    console.log(
      "MANUT_QUEUE_CONSUMER_SUMMARY",
      JSON.stringify({
        accepted: summary.accepted,
        failed: summary.failed,
        queueName: summary.queueName,
        total: summary.total,
      })
    );
  },
} satisfies ExportedHandler<CloudflareBindings>;

export default worker;

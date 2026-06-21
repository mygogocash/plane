import { Hono } from "hono";

import { classifyEdgeRoute, proxyToLegacyOrigin } from "./edge-routing";
import { handleD1WorkspaceProjectsRequest, handleD1WorkspacesRequest } from "./d1-core";
import { buildInstancePayload } from "./instance";
import { consumeJobQueue } from "./jobs";
import { LiveRoomDurableObject } from "./live-room";
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
  "decommission",
] as const;

const routeMapSamples = [
  { path: "/healthz", purpose: "runtime health" },
  { path: "/api/instances/", purpose: "instance metadata contract" },
  { path: "/api/cloudflare/d1/workspaces", purpose: "D1 workspace shadow reads" },
  { path: "/api/cloudflare/d1/workspaces/gogocash/projects", purpose: "D1 project shadow reads" },
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

app.get("/healthz", (c) =>
  c.json({
    ok: true,
    service: "manut-cloudflare",
    env: c.env.APP_ENV ?? "preview",
  })
);

app.get("/api/instances/", async (c) => c.json(await buildInstancePayload(c.env)));

app.get("/api/cloudflare/d1/workspaces", (c) => handleD1WorkspacesRequest(c.req.raw, c.env));

app.get("/api/cloudflare/d1/workspaces/:workspaceSlug/projects", (c) =>
  handleD1WorkspaceProjectsRequest(c.req.raw, c.env, c.req.param("workspaceSlug"))
);

app.get("/api/cloudflare/migration-status", (c) =>
  c.json({
    status: "queues-cron-cache-live",
    active_phase: "queues-cron-cache-live",
    app_origin: c.env.APP_ORIGIN ?? "https://app.manut.xyz",
    legacy_proxy_configured: Boolean(c.env.LEGACY_GKE_ORIGIN?.trim()),
    r2_uploads_read_enabled: isR2UploadsReadEnabled(c.env),
    cache_target: "kv",
    data_target: "d1",
    d1_shadow_domains: ["workspaces", "projects"],
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

app.all("*", async (c) => {
  const classification = classifyEdgeRoute(c.req.raw);

  if (classification.action === "legacy-proxy") {
    if (classification.contract === "uploads" && isR2UploadsReadEnabled(c.env)) {
      return handleUploadsRequest(c.req.raw, c.env);
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
    const summary = await consumeJobQueue(batch, env);
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

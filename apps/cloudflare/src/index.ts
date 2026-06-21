import { Hono } from "hono";

import { buildInstancePayload } from "./instance";
import { LiveRoomDurableObject } from "./live-room";
import type { CloudflareBindings } from "./types";

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

app.get("/healthz", (c) =>
  c.json({
    ok: true,
    service: "manut-cloudflare",
    env: c.env.APP_ENV ?? "preview",
  })
);

app.get("/api/instances/", async (c) => c.json(await buildInstancePayload(c.env)));

app.get("/api/cloudflare/migration-status", (c) =>
  c.json({
    status: "foundation",
    active_phase: "cloudflare-foundation",
    app_origin: c.env.APP_ORIGIN ?? "https://app.manut.xyz",
    legacy_origin: c.env.LEGACY_GKE_ORIGIN ?? "https://app.manut.xyz",
    data_target: "d1",
    upload_target: "r2",
    queue_target: "cloudflare-queues",
    live_target: "durable-objects",
    phases: migrationPhases,
  })
);

app.all("/uploads/*", (c) =>
  c.json(
    {
      error: "R2_UPLOAD_ROUTE_NOT_IMPLEMENTED",
      message: "The R2 uploads compatibility route is scheduled for Phase 3.",
    },
    { status: 501 }
  )
);

app.notFound((c) =>
  c.json(
    {
      error: "CLOUDFLARE_ROUTE_NOT_IMPLEMENTED",
      message: "This route has not been migrated to the Cloudflare runtime yet.",
    },
    { status: 501 }
  )
);

export default app;

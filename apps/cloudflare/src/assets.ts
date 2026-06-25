/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LegacyRouteContract } from "./edge-routing";
import type { CloudflareBindings } from "./types";

const ASSET_CONTRACTS = new Set<LegacyRouteContract>(["app-shell", "static", "spaces", "god-mode"]);

export function shouldServeWorkerAssets(contract?: LegacyRouteContract): boolean {
  return contract !== undefined && ASSET_CONTRACTS.has(contract);
}

export async function serveWorkerAssets(request: Request, env: CloudflareBindings): Promise<Response | null> {
  if (!env.ASSETS) {
    return null;
  }

  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("x-manut-edge-route", "worker-assets");
  headers.set("x-manut-cloudflare-phase", "frontend-edge-routing");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

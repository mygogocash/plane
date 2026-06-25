/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../types";

export function buildSafeRedirectUrl(
  env: CloudflareBindings,
  nextPath: string | null | undefined,
  params: Record<string, string> = {}
): string {
  const base = env.APP_ORIGIN ?? "https://app.manut.xyz";
  const safePath = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
  const url = new URL(safePath, base);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

export function redirectResponse(location: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
      "x-manut-edge-route": "worker-native-auth",
      "x-manut-cloudflare-phase": "worker-native-api-migration",
      ...extraHeaders,
    },
  });
}

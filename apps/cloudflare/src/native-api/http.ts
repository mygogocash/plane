/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../types";

export function nativeApiHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "cache-control": "private, no-store",
    "x-manut-edge-route": "worker-native-api",
    "x-manut-cloudflare-phase": "worker-native-api-migration",
    ...extra,
  };
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: nativeApiHeaders(extraHeaders),
  });
}

export function errorResponse(
  status: number,
  error: string,
  message: string,
  details: Record<string, unknown> = {}
): Response {
  return jsonResponse(
    {
      error,
      message,
      ...details,
    },
    status
  );
}

export function d1Missing(domain: string): Response {
  return errorResponse(503, "D1_BINDING_MISSING", "The MANUT_DB D1 binding is required for worker-native API reads.", {
    domain,
  });
}

export function d1QueryFailed(domain: string): Response {
  return errorResponse(500, "D1_QUERY_FAILED", "The worker-native D1 query failed.", { domain });
}

export function requireDatabase(env: CloudflareBindings): D1Database | Response {
  if (!env.MANUT_DB) {
    return d1Missing("native-api");
  }

  return env.MANUT_DB;
}

export function isResponse<T>(value: T | Response): value is Response {
  return value instanceof Response;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newUuid(): string {
  return crypto.randomUUID();
}

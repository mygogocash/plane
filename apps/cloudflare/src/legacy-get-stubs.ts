/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { jsonResponse } from "./native-api/http";

const EMPTY_COLLECTION_PATTERNS = [
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/members\/$/,
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/issue-labels\/$/,
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/modules\/$/,
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/cycles\/$/,
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/views\/$/,
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/estimates\/$/,
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/pages\/$/,
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/workflow-transitions\/$/,
  /^\/api\/workspaces\/[^/]+\/modules\/$/,
  /^\/api\/workspaces\/[^/]+\/users\/notifications\/unread\/$/,
] as const;

const EMPTY_OBJECT_PATTERNS = [
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/user-properties\/$/,
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/epics-user-properties\/$/,
  /^\/api\/workspaces\/[^/]+\/projects\/[^/]+\/workflow-config\/$/,
] as const;

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname;
  }

  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function legacyGetEmptyStubResponse(request: Request): Response | null {
  if (request.method.toUpperCase() !== "GET") {
    return null;
  }

  const path = normalizePath(new URL(request.url).pathname);

  if (EMPTY_COLLECTION_PATTERNS.some((pattern) => pattern.test(path))) {
    return jsonResponse([]);
  }

  if (EMPTY_OBJECT_PATTERNS.some((pattern) => pattern.test(path))) {
    if (path.endsWith("/workflow-config/")) {
      return jsonResponse({ workflow_status: "disabled" });
    }

    return jsonResponse({});
  }

  return null;
}

export function legacyNativeCompatibilityStubResponse(request: Request): Response | null {
  const method = request.method.toUpperCase();
  const path = normalizePath(new URL(request.url).pathname);

  if (method === "POST" && path === "/api/client-errors/") {
    return new Response(null, {
      status: 204,
      headers: {
        "x-manut-edge-route": "worker-native-api-stub",
        "x-manut-cloudflare-phase": "worker-native-api-migration",
      },
    });
  }

  return legacyGetEmptyStubResponse(request);
}

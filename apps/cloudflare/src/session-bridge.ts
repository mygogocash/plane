/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { fetchLegacyOrigin } from "./edge-routing";
import type { CloudflareBindings } from "./types";

export type LegacyAuthenticatedUser = {
  id: string;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  avatar?: string;
  is_active?: boolean;
  is_bot?: boolean;
  raw: Record<string, unknown>;
};

function unauthorizedResponse(): Response {
  return Response.json(
    {
      detail: "Authentication credentials were not provided.",
    },
    {
      status: 401,
      headers: {
        "x-manut-edge-route": "worker-native-api",
        "x-manut-cloudflare-phase": "worker-native-api-migration",
      },
    }
  );
}

function bridgeUnavailableResponse(): Response {
  return Response.json(
    {
      error: "LEGACY_SESSION_BRIDGE_UNAVAILABLE",
      message: "LEGACY_GKE_ORIGIN is required to validate authenticated sessions during migration.",
    },
    {
      status: 503,
      headers: {
        "x-manut-edge-route": "worker-native-api",
        "x-manut-cloudflare-phase": "worker-native-api-migration",
      },
    }
  );
}

export async function resolveLegacyAuthenticatedUser(
  request: Request,
  env: CloudflareBindings
): Promise<LegacyAuthenticatedUser | Response> {
  const legacyOrigin = env.LEGACY_GKE_ORIGIN?.trim();

  if (!legacyOrigin) {
    return bridgeUnavailableResponse();
  }

  const appOrigin = env.APP_ORIGIN ?? "https://app.manut.xyz";
  const targetUrl = new URL("/api/users/me/", appOrigin);

  try {
    const response = await fetchLegacyOrigin(
      new Request(targetUrl.toString(), {
        method: "GET",
        headers: request.headers,
      }),
      env,
      "api"
    );

    if (response.status === 401 || response.status === 403) {
      return unauthorizedResponse();
    }

    if (!response.ok) {
      return Response.json(
        {
          error: "LEGACY_SESSION_BRIDGE_FAILED",
          message: "Unable to resolve the authenticated user from the legacy session bridge.",
          legacy_status: response.status,
        },
        {
          status: 502,
          headers: {
            "x-manut-edge-route": "worker-native-api",
            "x-manut-cloudflare-phase": "worker-native-api-migration",
          },
        }
      );
    }

    const raw = (await response.json()) as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    const email = typeof raw.email === "string" ? raw.email : "";

    if (!id || !email) {
      return Response.json(
        {
          error: "LEGACY_SESSION_BRIDGE_INVALID_USER",
          message: "Legacy /api/users/me/ did not return a valid user id and email.",
        },
        {
          status: 502,
          headers: {
            "x-manut-edge-route": "worker-native-api",
            "x-manut-cloudflare-phase": "worker-native-api-migration",
          },
        }
      );
    }

    return {
      id,
      email,
      username: typeof raw.username === "string" ? raw.username : undefined,
      first_name: typeof raw.first_name === "string" ? raw.first_name : undefined,
      last_name: typeof raw.last_name === "string" ? raw.last_name : undefined,
      display_name: typeof raw.display_name === "string" ? raw.display_name : undefined,
      avatar: typeof raw.avatar === "string" ? raw.avatar : undefined,
      is_active: typeof raw.is_active === "boolean" ? raw.is_active : undefined,
      is_bot: typeof raw.is_bot === "boolean" ? raw.is_bot : undefined,
      raw,
    };
  } catch (error) {
    console.error("LEGACY_SESSION_BRIDGE_ERROR", error);
    return Response.json(
      {
        error: "LEGACY_SESSION_BRIDGE_ERROR",
        message: "Failed to call the legacy session bridge.",
      },
      {
        status: 502,
        headers: {
          "x-manut-edge-route": "worker-native-api",
          "x-manut-cloudflare-phase": "worker-native-api-migration",
        },
      }
    );
  }
}

export function isResponse(value: LegacyAuthenticatedUser | Response): value is Response {
  return value instanceof Response;
}

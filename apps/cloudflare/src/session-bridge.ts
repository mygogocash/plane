/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "./types";
import { getUserById, mapUserMePayload } from "./native-api/db";
import { isResponse } from "./native-api/http";
import { resolveWorkerAuthenticatedUser } from "./auth/session";

export type AuthenticatedUser = Awaited<ReturnType<typeof getUserById>> & object;

export async function resolveLegacyAuthenticatedUser(
  request: Request,
  env: CloudflareBindings
): Promise<NonNullable<Awaited<ReturnType<typeof getUserById>>> | Response> {
  const legacyOrigin = env.LEGACY_GKE_ORIGIN?.trim();
  if (!legacyOrigin) {
    const user = await resolveWorkerAuthenticatedUser(request, env);
    if (user instanceof Response) {
      return user;
    }

    return user;
  }

  const { fetchLegacyOrigin } = await import("./edge-routing");
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
      return Response.json(
        { detail: "Authentication credentials were not provided." },
        {
          status: 401,
          headers: {
            "x-manut-edge-route": "worker-native-api",
            "x-manut-cloudflare-phase": "worker-native-api-migration",
          },
        }
      );
    }

    if (!response.ok) {
      return Response.json(
        {
          error: "LEGACY_SESSION_BRIDGE_FAILED",
          message: "Unable to resolve the authenticated user from the legacy session bridge.",
          legacy_status: response.status,
        },
        { status: 502 }
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
        { status: 502 }
      );
    }

    const user = await getUserById(env, id);
    if (isResponse(user)) {
      return user;
    }

    if (!user) {
      return Response.json({ detail: "Authentication credentials were not provided." }, { status: 401 });
    }

    return user;
  } catch (error) {
    console.error("LEGACY_SESSION_BRIDGE_ERROR", error);
    return Response.json(
      {
        error: "LEGACY_SESSION_BRIDGE_ERROR",
        message: "Failed to call the legacy session bridge.",
      },
      { status: 502 }
    );
  }
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export function mapAuthenticatedUserPayload(user: NonNullable<Awaited<ReturnType<typeof getUserById>>>) {
  return mapUserMePayload(user);
}

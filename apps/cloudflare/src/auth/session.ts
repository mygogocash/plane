/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../types";
import { getUserById } from "../native-api/db";
import { isResponse } from "../native-api/http";

export const SESSION_COOKIE_NAME = "session-id";
export const CSRF_COOKIE_NAME = "csrftoken";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type WorkerSessionRecord = {
  userId: string;
  createdAt: string;
};

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

export function createSessionId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function createCsrfToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function cookieAttributes(env: CloudflareBindings, maxAge: number): string {
  const appOrigin = env.APP_ORIGIN ?? "https://app.manut.xyz";
  const secure = appOrigin.startsWith("https://") ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function csrfCookieAttributes(env: CloudflareBindings, maxAge: number): string {
  const appOrigin = env.APP_ORIGIN ?? "https://app.manut.xyz";
  const secure = appOrigin.startsWith("https://") ? "; Secure" : "";
  return `Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createWorkerSession(
  env: CloudflareBindings,
  userId: string
): Promise<{ sessionId: string; setCookie: string }> {
  if (!env.CONFIG) {
    throw new Error("CONFIG_BINDING_MISSING");
  }

  const sessionId = createSessionId();
  const record: WorkerSessionRecord = {
    userId,
    createdAt: new Date().toISOString(),
  };

  await env.CONFIG.put(sessionKey(sessionId), JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return {
    sessionId,
    setCookie: `${SESSION_COOKIE_NAME}=${sessionId}; ${cookieAttributes(env, SESSION_TTL_SECONDS)}`,
  };
}

export async function deleteWorkerSession(env: CloudflareBindings, sessionId: string): Promise<void> {
  if (!env.CONFIG) {
    return;
  }

  await env.CONFIG.delete(sessionKey(sessionId));
}

export async function resolveWorkerAuthenticatedUser(request: Request, env: CloudflareBindings) {
  const sessionId = readCookie(request, SESSION_COOKIE_NAME);
  if (!sessionId || !env.CONFIG) {
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

  const raw = await env.CONFIG.get(sessionKey(sessionId));
  if (!raw) {
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

  const record = JSON.parse(raw) as WorkerSessionRecord;
  const user = await getUserById(env, record.userId);
  if (isResponse(user)) {
    return user;
  }

  if (!user) {
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

  return user;
}

export function clearSessionCookie(env: CloudflareBindings): string {
  return `${SESSION_COOKIE_NAME}=; ${cookieAttributes(env, 0)}`;
}

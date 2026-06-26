/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CloudflareBindings } from "../types";
import { getUserByEmail } from "../native-api/db";
import { isResponse, jsonResponse } from "../native-api/http";
import { MagicCodeError, initiateMagicCode, verifyMagicCode } from "./magic-code";
import { sendMagicLoginEmail } from "./email-dispatch";
import { buildSafeRedirectUrl, redirectResponse } from "./redirect";
import {
  CSRF_COOKIE_NAME,
  clearSessionCookie,
  createCsrfToken,
  createWorkerSession,
  csrfCookieAttributes,
  deleteWorkerSession,
  readCookie,
} from "./session";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function readFormBody(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const params = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        params.set(key, value);
      }
    }
    return params;
  }

  return new URLSearchParams();
}

async function deliverMagicLoginEmail(env: CloudflareBindings, email: string, token: string): Promise<void> {
  try {
    await sendMagicLoginEmail(env, email, token);
  } catch (error) {
    console.error("MAGIC_EMAIL_DELIVERY_FAILED", error);
    throw error;
  }
}

export async function handleGetCsrfToken(request: Request, env: CloudflareBindings): Promise<Response> {
  const existing = readCookie(request, CSRF_COOKIE_NAME);
  const csrfToken = existing ?? createCsrfToken();

  return jsonResponse({ csrf_token: csrfToken }, 200, {
    "set-cookie": `${CSRF_COOKIE_NAME}=${csrfToken}; ${csrfCookieAttributes(env, 60 * 60 * 24)}`,
    "x-manut-edge-route": "worker-native-auth",
  });
}

export async function handleEmailCheck(request: Request, env: CloudflareBindings): Promise<Response> {
  const body = await readJsonBody<{ email?: string }>(request);
  const email = body?.email?.trim().toLowerCase() ?? "";

  if (!email) {
    return jsonResponse({ error_code: "5005", error_message: "EMAIL_REQUIRED" }, 400, {
      "x-manut-edge-route": "worker-native-auth",
    });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return jsonResponse({ error_code: "5010", error_message: "INVALID_EMAIL" }, 400, {
      "x-manut-edge-route": "worker-native-auth",
    });
  }

  const user = await getUserByEmail(env, email);
  if (isResponse(user)) {
    return user;
  }

  if (user) {
    return jsonResponse(
      {
        existing: true,
        status: "MAGIC_CODE",
      },
      200,
      { "x-manut-edge-route": "worker-native-auth" }
    );
  }

  return jsonResponse(
    {
      existing: false,
      status: "MAGIC_CODE",
    },
    200,
    { "x-manut-edge-route": "worker-native-auth" }
  );
}

export async function handleMagicGenerate(request: Request, env: CloudflareBindings): Promise<Response> {
  const body = await readJsonBody<{ email?: string }>(request);
  const email = body?.email?.trim().toLowerCase() ?? "";

  if (!email || !EMAIL_PATTERN.test(email)) {
    return jsonResponse({ error_code: "5010", error_message: "INVALID_EMAIL" }, 400, {
      "x-manut-edge-route": "worker-native-auth",
    });
  }

  try {
    const { key, token } = await initiateMagicCode(env, email);
    await deliverMagicLoginEmail(env, email, token);
    return jsonResponse({ key }, 200, { "x-manut-edge-route": "worker-native-auth" });
  } catch (error) {
    if (error instanceof MagicCodeError) {
      return jsonResponse(error.toPayload(), 400, { "x-manut-edge-route": "worker-native-auth" });
    }

    console.error("MAGIC_GENERATE_FAILED", error);
    return jsonResponse({ error: "MAGIC_GENERATE_FAILED", message: "Unable to generate a magic login code." }, 500, {
      "x-manut-edge-route": "worker-native-auth",
    });
  }
}

async function readMagicSignInParams(request: Request): Promise<URLSearchParams> {
  const form = await readFormBody(request);
  if ([...form.keys()].length > 0) {
    return form;
  }

  return new URL(request.url).searchParams;
}

async function handleMagicSignInLike(
  request: Request,
  env: CloudflareBindings,
  mode: "sign-in" | "sign-up"
): Promise<Response> {
  const form = await readMagicSignInParams(request);
  const email = form.get("email")?.trim().toLowerCase() ?? "";
  const code = form.get("code")?.trim() ?? "";
  const nextPath = form.get("next_path");

  if (!email || !code) {
    const errorCode = mode === "sign-in" ? "5085" : "5055";
    const errorMessage = mode === "sign-in" ? "MAGIC_SIGN_IN_EMAIL_CODE_REQUIRED" : "MAGIC_SIGN_UP_EMAIL_CODE_REQUIRED";
    return redirectResponse(
      buildSafeRedirectUrl(env, nextPath, {
        error_code: errorCode,
        error_message: errorMessage,
      })
    );
  }

  const user = await getUserByEmail(env, email);
  if (isResponse(user)) {
    return user;
  }

  if (mode === "sign-in" && !user) {
    return redirectResponse(
      buildSafeRedirectUrl(env, nextPath, {
        error_code: "5060",
        error_message: "USER_DOES_NOT_EXIST",
      })
    );
  }

  if (mode === "sign-up" && user) {
    return redirectResponse(
      buildSafeRedirectUrl(env, nextPath, {
        error_code: "5030",
        error_message: "USER_ALREADY_EXIST",
      })
    );
  }

  if (mode === "sign-up" && !user) {
    return redirectResponse(
      buildSafeRedirectUrl(env, nextPath, {
        error_code: "5060",
        error_message: "USER_DOES_NOT_EXIST",
      })
    );
  }

  if (!user) {
    return redirectResponse(buildSafeRedirectUrl(env, nextPath));
  }

  try {
    await verifyMagicCode(env, email, code);
    const session = await createWorkerSession(env, user.id);
    const path = nextPath && nextPath.startsWith("/") ? nextPath : "/";
    return redirectResponse(buildSafeRedirectUrl(env, path), {
      "set-cookie": session.setCookie,
    });
  } catch (error) {
    if (error instanceof MagicCodeError) {
      return redirectResponse(
        buildSafeRedirectUrl(env, nextPath, {
          error_code: error.errorCode,
          error_message: error.errorMessage,
        })
      );
    }

    console.error("MAGIC_SIGN_IN_FAILED", error);
    return redirectResponse(
      buildSafeRedirectUrl(env, nextPath, {
        error_code: "5090",
        error_message: "INVALID_MAGIC_CODE_SIGN_IN",
      })
    );
  }
}

export async function handleMagicSignIn(request: Request, env: CloudflareBindings): Promise<Response> {
  return handleMagicSignInLike(request, env, "sign-in");
}

export async function handleMagicSignUp(request: Request, env: CloudflareBindings): Promise<Response> {
  return handleMagicSignInLike(request, env, "sign-up");
}

export async function handleMagicSignInGet(request: Request, env: CloudflareBindings): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const email = params.get("email")?.trim().toLowerCase() ?? "";
  const code = params.get("code")?.trim() ?? "";

  if (email && code) {
    return handleMagicSignInLike(request, env, "sign-in");
  }

  return redirectResponse(buildSafeRedirectUrl(env, params.get("next_path") ?? "/"));
}

export async function handleMagicSignUpGet(request: Request, env: CloudflareBindings): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const email = params.get("email")?.trim().toLowerCase() ?? "";
  const code = params.get("code")?.trim() ?? "";

  if (email && code) {
    return handleMagicSignInLike(request, env, "sign-up");
  }

  return redirectResponse(buildSafeRedirectUrl(env, params.get("next_path") ?? "/"));
}

export async function handleSignOut(request: Request, env: CloudflareBindings): Promise<Response> {
  const sessionId = readCookie(request, "session-id");
  if (sessionId) {
    await deleteWorkerSession(env, sessionId);
  }

  const form = await readFormBody(request);
  const nextPath = form.get("next_path");

  return redirectResponse(buildSafeRedirectUrl(env, nextPath ?? "/"), {
    "set-cookie": clearSessionCookie(env),
  });
}

export type AuthRouteId =
  | "get-csrf-token"
  | "email-check"
  | "magic-generate"
  | "magic-sign-in"
  | "magic-sign-in-get"
  | "magic-sign-up"
  | "magic-sign-up-get"
  | "sign-out";

const AUTH_ROUTES: Array<{ id: AuthRouteId; method: string; pattern: RegExp }> = [
  { id: "get-csrf-token", method: "GET", pattern: /^\/auth\/get-csrf-token\/?$/ },
  { id: "email-check", method: "POST", pattern: /^\/auth\/email-check\/?$/ },
  { id: "magic-generate", method: "POST", pattern: /^\/auth\/magic-generate\/?$/ },
  { id: "magic-sign-in", method: "POST", pattern: /^\/auth\/magic-sign-in\/?$/ },
  { id: "magic-sign-in-get", method: "GET", pattern: /^\/auth\/magic-sign-in\/?$/ },
  { id: "magic-sign-up", method: "POST", pattern: /^\/auth\/magic-sign-up\/?$/ },
  { id: "magic-sign-up-get", method: "GET", pattern: /^\/auth\/magic-sign-up\/?$/ },
  { id: "sign-out", method: "POST", pattern: /^\/auth\/sign-out\/?$/ },
];

export function matchAuthRoute(method: string, pathname: string): AuthRouteId | null {
  const normalizedPath = pathname.endsWith("/") ? pathname : `${pathname}/`;

  for (const route of AUTH_ROUTES) {
    if (route.method === method.toUpperCase() && route.pattern.test(normalizedPath)) {
      return route.id;
    }
  }

  return null;
}

export async function handleAuthRequest(
  request: Request,
  env: CloudflareBindings,
  routeId: AuthRouteId
): Promise<Response> {
  switch (routeId) {
    case "get-csrf-token":
      return handleGetCsrfToken(request, env);
    case "email-check":
      return handleEmailCheck(request, env);
    case "magic-generate":
      return handleMagicGenerate(request, env);
    case "magic-sign-in":
      return handleMagicSignIn(request, env);
    case "magic-sign-in-get":
      return handleMagicSignInGet(request, env);
    case "magic-sign-up":
      return handleMagicSignUp(request, env);
    case "magic-sign-up-get":
      return handleMagicSignUpGet(request, env);
    case "sign-out":
      return handleSignOut(request, env);
    default: {
      const exhaustive: never = routeId;
      return jsonResponse({ error: "AUTH_ROUTE_UNKNOWN", message: exhaustive }, 501);
    }
  }
}

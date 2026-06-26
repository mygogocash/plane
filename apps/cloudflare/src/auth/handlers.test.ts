/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";

import { handleMagicGenerate, matchAuthRoute } from "./handlers";
import { initiateMagicCode } from "./magic-code";
import { createWorkerSession, readCookie, resolveWorkerAuthenticatedUser } from "./session";
import type { CloudflareBindings } from "../types";

function fakeKv(store = new Map<string, string>()) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as KVNamespace;
}

describe("auth routes", () => {
  it("matches worker-native auth endpoints", () => {
    expect(matchAuthRoute("GET", "/auth/get-csrf-token")).toBe("get-csrf-token");
    expect(matchAuthRoute("POST", "/auth/magic-generate/")).toBe("magic-generate");
    expect(matchAuthRoute("GET", "/auth/magic-sign-in/")).toBe("magic-sign-in-get");
    expect(matchAuthRoute("POST", "/auth/magic-sign-in/")).toBe("magic-sign-in");
  });

  it("creates a session cookie after magic code verification path", async () => {
    const env = {
      CONFIG: fakeKv(),
      APP_ORIGIN: "https://app.manut.xyz",
    } satisfies CloudflareBindings;

    const { setCookie } = await createWorkerSession(env, "user-1");
    expect(setCookie).toContain("session-id=");

    const request = new Request("https://app.manut.xyz/api/users/me/", {
      headers: {
        cookie: setCookie.split(";")[0],
      },
    });

    const dbUser = {
      id: "user-1",
      email: "ops@manut.xyz",
      display_name: "Ops",
      first_name: "Ops",
      last_name: "User",
      avatar: null,
      is_active: 1,
      is_bot: 0,
      last_active: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
    };

    const envWithDb = {
      ...env,
      MANUT_DB: {
        prepare() {
          return {
            bind() {
              return this;
            },
            async first() {
              return dbUser;
            },
          };
        },
      } as D1Database,
    } satisfies CloudflareBindings;

    const user = await resolveWorkerAuthenticatedUser(request, envWithDb);
    expect(user).toMatchObject({ id: "user-1", email: "ops@manut.xyz" });
  });

  it("stores magic codes in KV and returns the email key", async () => {
    const store = new Map<string, string>();
    const env = { CONFIG: fakeKv(store) } satisfies CloudflareBindings;

    const result = await initiateMagicCode(env, "ops@manut.xyz");
    expect(result.key).toBe("ops@manut.xyz");
    expect(result.token).toMatch(/^\d{6}$/);
    expect(store.has("magic:ops@manut.xyz")).toBe(true);
  });

  it("returns a csrf token and cookie", async () => {
    const response = await handleMagicGenerate(
      new Request("https://app.manut.xyz/auth/magic-generate/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
      { CONFIG: fakeKv(), JOBS: { send: vi.fn() } as unknown as Queue }
    );

    expect(response.status).toBe(400);
  });
});

describe("readCookie", () => {
  it("reads named cookies from the request", () => {
    const request = new Request("https://app.manut.xyz/", {
      headers: { cookie: "session-id=abc123; other=value" },
    });

    expect(readCookie(request, "session-id")).toBe("abc123");
  });
});

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { deleteJsonCache, getJsonCache, putJsonCache } from "./cache";
import type { CloudflareBindings } from "./types";

class FakeKV {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.values.set(key, value);
    if (options?.expirationTtl) {
      this.expirations.set(key, options.expirationTtl);
    }
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
    this.expirations.delete(key);
  }

  asBinding(): KVNamespace {
    return this as unknown as KVNamespace;
  }
}

function env(kv?: FakeKV): CloudflareBindings {
  return {
    APP_ENV: "test",
    CONFIG: kv?.asBinding(),
  };
}

describe("KV JSON cache primitives", () => {
  it("returns an explicit miss when the KV binding is not configured", async () => {
    await expect(getJsonCache(env(), "workspace", "gogocash")).resolves.toMatchObject({
      hit: false,
      reason: "KV_BINDING_MISSING",
    });
  });

  it("stores and reads namespaced JSON values with a bounded TTL", async () => {
    const kv = new FakeKV();

    await expect(
      putJsonCache(env(kv), "workspace", "gogocash", { projectCount: 2 }, { ttlSeconds: 120 })
    ).resolves.toMatchObject({
      ok: true,
      key: "workspace:gogocash",
    });

    await expect(getJsonCache<{ projectCount: number }>(env(kv), "workspace", "gogocash")).resolves.toMatchObject({
      hit: true,
      key: "workspace:gogocash",
      value: {
        projectCount: 2,
      },
    });
    expect(kv.expirations.get("workspace:gogocash")).toBe(120);
  });

  it("deletes cached values through the same namespace key", async () => {
    const kv = new FakeKV();
    await putJsonCache(env(kv), "workspace", "gogocash", { projectCount: 2 });

    await expect(deleteJsonCache(env(kv), "workspace", "gogocash")).resolves.toMatchObject({
      ok: true,
      key: "workspace:gogocash",
    });
    await expect(getJsonCache(env(kv), "workspace", "gogocash")).resolves.toMatchObject({
      hit: false,
      reason: "CACHE_MISS",
    });
  });
});

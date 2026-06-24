/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { LiveRoomDurableObject } from "./live-room";
import type { CloudflareBindings } from "./types";

const env = {
  APP_ENV: "test",
} satisfies CloudflareBindings;

function createStorage() {
  const values = new Map<string, unknown>();

  return {
    values,
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        return values.get(key) as T | undefined;
      },
      async put<T>(key: string, value: T): Promise<void> {
        values.set(key, value);
      },
      async delete(key: string): Promise<boolean> {
        return values.delete(key);
      },
    },
  };
}

function createLiveRoom(id = "test-room", storage = createStorage().storage): LiveRoomDurableObject {
  return new LiveRoomDurableObject({ id: { toString: () => id }, storage } as unknown as DurableObjectState, env);
}

describe("LiveRoomDurableObject foundation contract", () => {
  it("reports explicit room metadata on health checks", async () => {
    const response = await createLiveRoom().fetch(new Request("https://app.manut.xyz/live/test-room/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "manut-live-room",
      storage: "durable-object",
      env: "test",
      id: "test-room",
      room: {
        id: "test-room",
        status: "planned",
        phase: "queues-cron-cache-live",
      },
      capabilities: {
        health: true,
        metadata: true,
        websocket: true,
        collaboration: true,
      },
    });
  });

  it("exposes room metadata without starting collaboration", async () => {
    const response = await createLiveRoom("room-meta").fetch(
      new Request("https://app.manut.xyz/live/room-meta/metadata")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: "manut-live-room",
      room: {
        id: "room-meta",
        status: "planned",
        storage: "durable-object",
      },
      capabilities: {
        websocket: true,
        collaboration: true,
      },
    });
  });

  it("returns planned responses for non-health live room requests", async () => {
    const response = await createLiveRoom().fetch(new Request("https://app.manut.xyz/live/test-room"));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: "planned",
      service: "manut-live-room",
      phase: "queues-cron-cache-live",
      room: {
        id: "test-room",
        status: "planned",
      },
      message: "Live collaboration shadow primitives are available on the WebSocket upgrade path.",
    });
  });

  it("acquires and releases Durable Object room locks without starting collaboration", async () => {
    const storage = createStorage();
    const room = createLiveRoom("room-lock", storage.storage);

    const acquireResponse = await room.fetch(
      new Request("https://app.manut.xyz/live/room-lock/locks/import/acquire", {
        body: JSON.stringify({ holder: "job-import-1", ttl_seconds: 60 }),
        method: "POST",
      })
    );
    expect(acquireResponse.status).toBe(200);
    await expect(acquireResponse.json()).resolves.toMatchObject({
      ok: true,
      lock: {
        key: "import",
        holder: "job-import-1",
        ttl_seconds: 60,
      },
    });

    const conflictResponse = await room.fetch(
      new Request("https://app.manut.xyz/live/room-lock/locks/import/acquire", {
        body: JSON.stringify({ holder: "job-import-2", ttl_seconds: 60 }),
        method: "POST",
      })
    );
    expect(conflictResponse.status).toBe(409);

    const releaseResponse = await room.fetch(
      new Request("https://app.manut.xyz/live/room-lock/locks/import/release", {
        body: JSON.stringify({ holder: "job-import-1" }),
        method: "POST",
      })
    );
    expect(releaseResponse.status).toBe(200);
    await expect(releaseResponse.json()).resolves.toMatchObject({
      ok: true,
      lock: {
        key: "import",
        released: true,
      },
    });
  });

  it("rejects Durable Object room lock operations without an explicit holder", async () => {
    const response = await createLiveRoom().fetch(
      new Request("https://app.manut.xyz/live/room-lock/locks/import/acquire", {
        body: JSON.stringify({ ttl_seconds: 60 }),
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "LIVE_ROOM_LOCK_HOLDER_REQUIRED",
    });
  });
});

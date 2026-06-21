import { describe, expect, it } from "vitest";

import { LiveRoomDurableObject } from "./live-room";
import type { CloudflareBindings } from "./types";

const env = {
  APP_ENV: "test",
} satisfies CloudflareBindings;

function createLiveRoom(id = "test-room"): LiveRoomDurableObject {
  return new LiveRoomDurableObject({ id: { toString: () => id } } as DurableObjectState, env);
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
        websocket: false,
        collaboration: false,
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
        websocket: false,
        collaboration: false,
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
      message: "Live collaboration is not implemented in the Cloudflare runtime yet.",
    });
  });
});

import type { CloudflareBindings } from "./types";

const liveRoomService = "manut-live-room";
const liveRoomPhase = "queues-cron-cache-live";
const liveRoomCapabilities = {
  health: true,
  locks: true,
  metadata: true,
  websocket: true,
  collaboration: true,
} as const;

type RoomLockRecord = {
  holder: string;
  expiresAt: string;
  ttlSeconds: number;
};

export class LiveRoomDurableObject {
  private readonly sessions = new Set<WebSocket>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: CloudflareBindings
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const metadata = this.buildMetadata();
    const lockMatch = url.pathname.match(/\/locks\/([^/]+)\/(acquire|release)$/);

    if (lockMatch) {
      return this.handleLockRequest(
        request,
        decodeURIComponent(lockMatch[1] ?? ""),
        lockMatch[2] as "acquire" | "release"
      );
    }

    if (url.pathname.endsWith("/health")) {
      return Response.json({
        ok: true,
        service: liveRoomService,
        storage: "durable-object",
        env: this.env.APP_ENV ?? "preview",
        id: metadata.room.id,
        room: metadata.room,
        capabilities: liveRoomCapabilities,
      });
    }

    if (url.pathname.endsWith("/metadata")) {
      return Response.json(metadata);
    }

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocket(request, metadata);
    }

    return Response.json(
      {
        status: "planned",
        service: liveRoomService,
        phase: liveRoomPhase,
        room: metadata.room,
        capabilities: liveRoomCapabilities,
        message: "Live collaboration shadow primitives are available on the WebSocket upgrade path.",
      },
      { status: 202 }
    );
  }

  private buildMetadata() {
    return {
      service: liveRoomService,
      room: {
        id: this.state.id.toString(),
        env: this.env.APP_ENV ?? "preview",
        status: "planned",
        phase: liveRoomPhase,
        storage: "durable-object",
        collaboration: "shadow-websocket",
      },
      capabilities: liveRoomCapabilities,
    };
  }

  private handleWebSocket(_request: Request, metadata: ReturnType<LiveRoomDurableObject["buildMetadata"]>): Response {
    if (typeof WebSocketPair === "undefined") {
      return Response.json(
        {
          error: "LIVE_ROOM_WEBSOCKET_UNAVAILABLE",
          message: "WebSocketPair is not available in this runtime.",
          room: metadata.room,
          capabilities: liveRoomCapabilities,
        },
        { status: 501 }
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();
    this.sessions.add(server);
    server.send(
      JSON.stringify({
        type: "room.ready",
        service: liveRoomService,
        room: metadata.room,
        capabilities: liveRoomCapabilities,
      })
    );

    server.addEventListener("message", (event) => {
      this.broadcast({
        type: "room.message",
        service: liveRoomService,
        room: metadata.room,
        data: typeof event.data === "string" ? event.data : String(event.data),
      });
    });
    server.addEventListener("close", () => {
      this.sessions.delete(server);
    });
    server.addEventListener("error", () => {
      this.sessions.delete(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private broadcast(payload: Record<string, unknown>): void {
    const message = JSON.stringify(payload);

    for (const session of this.sessions) {
      try {
        session.send(message);
      } catch {
        this.sessions.delete(session);
      }
    }
  }

  private async handleLockRequest(request: Request, key: string, action: "acquire" | "release"): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json(
        {
          error: "LIVE_ROOM_LOCK_METHOD_NOT_ALLOWED",
          message: "Durable Object lock operations require POST.",
        },
        {
          headers: {
            allow: "POST",
          },
          status: 405,
        }
      );
    }

    if (!key) {
      return Response.json(
        {
          error: "LIVE_ROOM_LOCK_KEY_REQUIRED",
          message: "A lock key is required.",
        },
        { status: 400 }
      );
    }

    const payload = await readJsonBody(request);
    const holder = typeof payload.holder === "string" && payload.holder.trim() ? payload.holder.trim() : "anonymous";
    const ttlSeconds =
      typeof payload.ttl_seconds === "number" && Number.isSafeInteger(payload.ttl_seconds) && payload.ttl_seconds > 0
        ? Math.min(payload.ttl_seconds, 3600)
        : 60;

    if (action === "release") {
      return this.releaseLock(key, holder);
    }

    return this.acquireLock(key, holder, ttlSeconds);
  }

  private async acquireLock(key: string, holder: string, ttlSeconds: number): Promise<Response> {
    const storageKey = buildLockStorageKey(key);
    const now = Date.now();
    const existing = await this.state.storage?.get<RoomLockRecord>(storageKey);

    if (existing && Date.parse(existing.expiresAt) > now && existing.holder !== holder) {
      return Response.json(
        {
          error: "LIVE_ROOM_LOCK_CONFLICT",
          message: "The Durable Object lock is already held.",
          lock: {
            key,
            holder: existing.holder,
            expires_at: existing.expiresAt,
          },
        },
        { status: 409 }
      );
    }

    const lock: RoomLockRecord = {
      holder,
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
      ttlSeconds,
    };
    await this.state.storage?.put(storageKey, lock);

    return Response.json({
      ok: true,
      lock: {
        key,
        holder: lock.holder,
        expires_at: lock.expiresAt,
        ttl_seconds: lock.ttlSeconds,
      },
    });
  }

  private async releaseLock(key: string, holder: string): Promise<Response> {
    const storageKey = buildLockStorageKey(key);
    const existing = await this.state.storage?.get<RoomLockRecord>(storageKey);

    if (existing && existing.holder !== holder) {
      return Response.json(
        {
          error: "LIVE_ROOM_LOCK_HELD_BY_ANOTHER_HOLDER",
          message: "The Durable Object lock is held by another holder.",
          lock: {
            key,
            holder: existing.holder,
            released: false,
          },
        },
        { status: 409 }
      );
    }

    await this.state.storage?.delete(storageKey);

    return Response.json({
      ok: true,
      lock: {
        key,
        released: true,
      },
    });
  }
}

function buildLockStorageKey(key: string): string {
  return `lock:${encodeURIComponent(key)}`;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload = await request.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

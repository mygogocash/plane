import type { CloudflareBindings } from "./types";

const liveRoomService = "manut-live-room";
const liveRoomPhase = "queues-cron-cache-live";
const liveRoomCapabilities = {
  health: true,
  metadata: true,
  websocket: false,
  collaboration: false,
} as const;

export class LiveRoomDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: CloudflareBindings
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const metadata = this.buildMetadata();

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
      return Response.json(
        {
          error: "LIVE_ROOM_WEBSOCKET_NOT_IMPLEMENTED",
          message: "Durable Object WebSocket room support is scheduled for Phase 5.",
          room: metadata.room,
          capabilities: liveRoomCapabilities,
        },
        { status: 501 }
      );
    }

    return Response.json(
      {
        status: "planned",
        service: liveRoomService,
        phase: liveRoomPhase,
        room: metadata.room,
        capabilities: liveRoomCapabilities,
        message: "Live collaboration is not implemented in the Cloudflare runtime yet.",
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
        collaboration: "not-implemented",
      },
      capabilities: liveRoomCapabilities,
    };
  }
}

import type { CloudflareBindings } from "./types";

export class LiveRoomDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: CloudflareBindings
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/health")) {
      return Response.json({
        ok: true,
        service: "manut-live-room",
        storage: "durable-object",
        env: this.env.APP_ENV ?? "preview",
        id: this.state.id.toString(),
      });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return Response.json(
        {
          error: "LIVE_ROOM_WEBSOCKET_NOT_IMPLEMENTED",
          message: "Durable Object WebSocket room support is scheduled for Phase 5.",
        },
        { status: 501 }
      );
    }

    return Response.json(
      {
        status: "planned",
        service: "manut-live-room",
        phase: "queue-cache-live",
      },
      { status: 202 }
    );
  }
}

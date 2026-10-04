export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "NeonCore Cloudflare Multiplayer Prototype",
        role: "websocket-room-authority",
        release: "PROTOTYPE",
        backend: "Durable Objects"
      });
    }

    if (url.pathname !== "/ws") {
      return new Response("NeonCore Cloudflare Multiplayer Prototype", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket requerido", { status: 426 });
    }

    const room = String(url.searchParams.get("room") || "OPEN")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 32) || "OPEN";

    const id = env.NEON_ROOM.idFromName(room);
    return env.NEON_ROOM.get(id).fetch(request);
  }
};

export class NeonRoom {
  constructor(state) {
    this.state = state;
    this.sockets = new Map();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket requerido", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    const playerId = crypto.randomUUID();

    this.sockets.set(playerId, server);

    server.addEventListener("message", event => {
      try {
        const msg = JSON.parse(String(event.data || "{}"));

        if (msg.type === "hello") {
          server.send(JSON.stringify({
            type: "connected",
            id: playerId,
            releaseId: "PROTOTYPE"
          }));
          return;
        }

        if (msg.type === "ping") {
          server.send(JSON.stringify({ type: "pong", t: Date.now() }));
          return;
        }

        this.broadcast({
          ...msg,
          _cloudflare: true,
          _sender: playerId
        }, playerId);
      } catch {
        server.send(JSON.stringify({
          type: "cloudflare_error",
          message: "Mensaje inválido"
        }));
      }
    });

    const cleanup = () => this.sockets.delete(playerId);
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    server.send(JSON.stringify({
      type: "connected",
      id: playerId,
      releaseId: "PROTOTYPE"
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message, exceptId) {
    const data = JSON.stringify(message);

    for (const [id, socket] of this.sockets) {
      if (id === exceptId) continue;

      try {
        socket.send(data);
      } catch {
        this.sockets.delete(id);
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "neoncore-realtime-test",
        version: "V82-test"
      });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }

      const roomId = url.searchParams.get("room") || "12345";
      const id = env.NEON_ROOM.idFromName(roomId);
      const room = env.NEON_ROOM.get(id);
      return room.fetch(new Request(request));
    }

    return new Response("NeonCore realtime test", { status: 200 });
  }
};

export class NeonRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    const sockets = this.state.getWebSockets();
    const welcome = JSON.stringify({
      type: "room_connected",
      room: "12345",
      players: sockets.length
    });

    server.send(welcome);

    for (const socket of sockets) {
      if (socket !== server) {
        try {
          socket.send(JSON.stringify({
            type: "player_count",
            players: sockets.length
          }));
        } catch {}
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
    let payload;
    try {
      payload = JSON.parse(String(message));
    } catch {
      payload = { type: "message", text: String(message) };
    }

    const outgoing = JSON.stringify({
      type: "room_message",
      from: payload.from || "test",
      text: payload.text || "",
      ts: Date.now()
    });

    for (const peer of this.state.getWebSockets()) {
      try {
        peer.send(outgoing);
      } catch {}
    }
  }

  async webSocketClose() {}
  async webSocketError() {}
}

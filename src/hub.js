// 실시간 알림 허브 (Durable Object 하나). 브라우저마다 웹소켓 하나를 붙잡아 두고, 새 메시지가 오면 "room" 신호만 보내요.
// 메시지 내용은 보내지 않아요 — 받은 쪽이 평소처럼 GET /api/room 으로 가져가요 (권한 확인이 한 곳에만 있게).
// 웹소켓 hibernation API 를 써서 조용할 땐 요금·메모리를 거의 안 써요. 소켓 태그 = 사용자 id.
import { DurableObject } from "cloudflare:workers";

export class RoomHub extends DurableObject {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/connect") {
      const userId = url.searchParams.get("user");
      if (!userId || req.headers.get("Upgrade") !== "websocket") return new Response("bad request", { status: 400 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], [userId]);
      pair[1].serializeAttachment({ userId, at: Date.now() });
      pair[1].send(JSON.stringify({ type: "hello" }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === "/notify" && req.method === "POST") {
      const { users, payload } = await req.json();
      const msg = JSON.stringify(payload || { type: "room" });
      const targets = Array.isArray(users) && users.length ? users.flatMap((u) => this.ctx.getWebSockets(u)) : this.ctx.getWebSockets();
      let sent = 0;
      for (const ws of targets) { try { ws.send(msg); sent++; } catch {} }
      return Response.json({ sent });
    }
    return new Response("not found", { status: 404 });
  }
  // 살아 있는지 확인하는 ping 에만 답해요 (브라우저가 25초마다 보냄)
  async webSocketMessage(ws, data) { if (data === "ping") { try { ws.send("pong"); } catch {} } }
  async webSocketClose(ws, code) { try { ws.close(code, "bye"); } catch {} }
  async webSocketError() {}
}

const hub = (env) => env.ROOM_HUB?.get(env.ROOM_HUB.idFromName("hub"));

// 방 사람들에게 신호 (users 가 없으면 모두). 실패해도 메시지 저장은 그대로라 조용히 넘어가요.
export async function hubNotify(env, users, payload) {
  const h = hub(env); if (!h) return;
  try { await h.fetch("https://hub/notify", { method: "POST", body: JSON.stringify({ users, payload }) }); } catch (e) { console.warn("hub notify", e.message); }
}
export function hubConnect(env, req, userId) {
  const h = hub(env); if (!h) return new Response("실시간 연결을 쓸 수 없어요.", { status: 503 });
  return h.fetch(new Request("https://hub/connect?user=" + encodeURIComponent(userId), req));
}

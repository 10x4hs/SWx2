// 실시간 알림 허브 (Durable Object 하나). 브라우저마다 웹소켓 하나를 붙잡아 두고, 새 메시지가 오면 "room" 신호만 보내요.
// 메시지 내용은 보내지 않아요 — 받은 쪽이 평소처럼 GET /api/room 으로 가져가요 (권한 확인이 한 곳에만 있게).
// 웹소켓 hibernation API 를 써서 조용할 땐 요금·메모리를 거의 안 써요. 소켓 태그 = 사용자 id.
import { DurableObject } from "cloudflare:workers";
import { pushUsers } from "./push.js";

const KST = 9 * 3600e3;

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
      const d = await req.json();
      // { users, payload } 하나 또는 { list: [{ users, payload }, ...] } 여러 개 (관리자 단체 메시지 — 사람마다 다른 방 신호를 한 번에)
      let sent = 0;
      for (const { users, payload } of Array.isArray(d.list) ? d.list : [d]) {
        const msg = JSON.stringify(payload || { type: "room" });
        const targets = Array.isArray(users) && users.length ? users.flatMap((u) => this.ctx.getWebSockets(u)) : Array.isArray(d.list) ? [] : this.ctx.getWebSockets();
        for (const ws of targets) { try { ws.send(msg); sent++; } catch {} }
      }
      return Response.json({ sent });
    }
    if (url.pathname === "/focus-kick" && req.method === "POST") { await this.focusTick(); return Response.json({ ok: true }); }
    return new Response("not found", { status: 404 });
  }
  // 자동 집중 알람: 지금 시작할 계획은 알리고(웹소켓 + 푸시), 다음 계획 시각에 알람을 맞춰요. 계획이 바뀔 때 · 매시 크론 때 다시 맞춰요
  async alarm() { await this.focusTick(); }
  async focusTick() {
    const env = this.env, t = Date.now(), day = (x) => new Date(x + KST).toISOString().slice(0, 10);
    const { results } = await env.DB.prepare("SELECT id, user_id, period, start, text, auto_focus FROM plans WHERE auto_focus IS NOT NULL AND focus_sent_at IS NULL AND done = 0 AND scope = 'day' AND start IS NOT NULL AND period IN (?, ?)")
      .bind("D:" + day(t), "D:" + day(t + 864e5)).all();
    const at = (p) => Date.parse(`${p.period.slice(2)}T${p.start}:00Z`) - KST;
    const due = results.filter((p) => at(p) <= t + 20e3 && at(p) >= t - 10 * 60e3);
    if (due.length) {
      await env.DB.batch(due.map((p) => env.DB.prepare("UPDATE plans SET focus_sent_at = ? WHERE id = ?").bind(t, p.id)));
      for (const p of due) {
        const msg = JSON.stringify({ type: "focus", plan: { id: p.id, text: p.text, start: p.start, mins: p.auto_focus } });
        for (const ws of this.ctx.getWebSockets(p.user_id)) { try { ws.send(msg); } catch {} }
      }
      await pushUsers(env, null, [...new Set(due.map((p) => p.user_id))], { room: "focus" });
    }
    // 집중 끝 (presence.ends_at): 그 시각에 깨워서 푸시 — 한 번만 (DO 저장소에 보낸 표시)
    const { results: ends } = await env.DB.prepare("SELECT user_id, ends_at FROM presence WHERE state = 'focus' AND ends_at > ?").bind(t - 3 * 60e3).all();
    const sent = (await this.ctx.storage.get("endSent")) || {};
    const fin = ends.filter((x) => x.ends_at <= t + 5e3 && sent[x.user_id] !== x.ends_at);
    if (fin.length) {
      for (const x of fin) sent[x.user_id] = x.ends_at;
      for (const k of Object.keys(sent)) if (sent[k] < t - 864e5) delete sent[k];
      await this.ctx.storage.put("endSent", sent);
      await pushUsers(env, null, [...new Set(fin.map((x) => x.user_id))], { room: "focus" });
    }
    const next = [...results.map(at).filter((x) => x > t + 20e3), ...ends.map((x) => x.ends_at).filter((x) => x > t + 5e3)].sort((a, b) => a - b)[0];
    if (next) await this.ctx.storage.setAlarm(next); else await this.ctx.storage.deleteAlarm();
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
// 여러 신호를 왕복 한 번에: list = [{ users, payload }, ...] (users 가 비면 그 신호는 건너뛰어요)
export async function hubNotifyMany(env, list) {
  const h = hub(env); if (!h || !list.length) return;
  try { await h.fetch("https://hub/notify", { method: "POST", body: JSON.stringify({ list }) }); } catch (e) { console.warn("hub notify", e.message); }
}
// 자동 집중 알람 다시 맞추기 (계획이 바뀐 뒤 · 매시 크론)
export async function focusKick(env) {
  const h = hub(env); if (!h) return;
  try { await h.fetch("https://hub/focus-kick", { method: "POST" }); } catch (e) { console.warn("focus kick", e.message); }
}
export function hubConnect(env, req, userId) {
  const h = hub(env); if (!h) return new Response("실시간 연결을 쓸 수 없어요.", { status: 503 });
  return h.fetch(new Request("https://hub/connect?user=" + encodeURIComponent(userId), req));
}

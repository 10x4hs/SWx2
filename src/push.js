// 웹 푸시 알림 (대화방 새 메시지). 내용 없이 "깨우기"만 보내고, 서비스 워커가 깨어나 /api/room/unread 를 읽어 알림을 띄워요.
// 그래서 메시지 암호화가 필요 없고 VAPID 서명(ES256)만 있으면 돼요. 키: VAPID_PUBLIC_KEY(공개, base64url 65바이트) · VAPID_PRIVATE_KEY(비밀, JWK JSON).
//   GET    /push/key                       → { key }  (없으면 key: null → 브라우저가 알림 버튼을 숨겨요)
//   POST   /push/subscribe { endpoint, keys:{p256dh,auth} } → 저장 (같은 endpoint 면 덮어써요)
//   DELETE /push/subscribe { endpoint }
// 보내기: pushUsers(env, ec, userIds, { room }) — 404/410 이면 그 구독은 지워요.

import { b64url } from "./lib/crypto.js";

const enc = (s) => b64url(new TextEncoder().encode(s));

export function registerPush(on, { json, body, fail, uid, now }) {
  on("GET", "/push/key", ({ env }) => json({ key: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null }));

  on("POST", "/push/subscribe", async ({ req, env, user }) => {
    const b = await body(req);
    const endpoint = String(b.endpoint || ""), p256dh = String(b.keys?.p256dh || ""), auth = String(b.keys?.auth || "");
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 2000) fail(400, "구독 정보가 이상해요.");
    await env.DB.prepare("INSERT INTO push_subs (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth")
      .bind(uid(), user.id, endpoint, p256dh, auth, now()).run();
    return json({ ok: true });
  });

  on("DELETE", "/push/subscribe", async ({ req, env, user }) => {
    const b = await body(req);
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?").bind(String(b.endpoint || ""), user.id).run();
    return json({ ok: true });
  });
}

async function vapidJwt(env, audience) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_KEY);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = enc(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = enc(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:admin@dsm-mafia.local" }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`; // WebCrypto 의 ECDSA 서명은 이미 r||s 64바이트라 그대로 써요
}

// userIds 에게 "깨우기" 푸시. 응답을 기다리지 않게 ec.waitUntil 로 감싸요.
export function pushUsers(env, ec, userIds, info = {}) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !userIds.length) return;
  const task = (async () => {
    const { results } = await env.DB.prepare(`SELECT id, endpoint FROM push_subs WHERE user_id IN (${userIds.map(() => "?").join(",")})`).bind(...userIds).all();
    const dead = [];
    await Promise.all(results.map(async (s) => {
      try {
        const aud = new URL(s.endpoint).origin;
        const jwt = await vapidJwt(env, aud);
        const res = await fetch(s.endpoint, { method: "POST", headers: { TTL: "3600", Urgency: "normal", Topic: (info.room || "room").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "room", Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, "Content-Length": "0" }, signal: AbortSignal.timeout(8000) });
        if (res.status === 404 || res.status === 410) dead.push(s.id);
        else if (!res.ok) console.warn("push", res.status, (await res.text()).slice(0, 120));
      } catch (e) { console.warn("push fail", e.message); }
    }));
    if (dead.length) await env.DB.prepare(`DELETE FROM push_subs WHERE id IN (${dead.map(() => "?").join(",")})`).bind(...dead).run();
  })();
  if (ec) ec.waitUntil(task); else return task;
}

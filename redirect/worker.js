// 옛 주소(dsm-mafia.dsm-mafia.workers.dev) → 새 주소(swx2.dsm-mafia.workers.dev).
// GET · HEAD 는 301, 그 밖(POST 등)은 방법과 본문을 그대로 넘기는 308. 경로 · 쿼리 · #해시는 브라우저가 그대로 들고 가요.
const TO = "https://swx2.dsm-mafia.workers.dev";

// 옛 주소에 깔린 서비스 워커는 sw.js 를 다시 받아야 바뀌는데, sw.js 가 넘어가 버리면(리디렉트) 업데이트에 실패해서
// 옛 캐시 화면 + "오프라인" 에 갇혀요. 그래서 sw.js 만은 200 으로: 캐시를 다 지우고 스스로 빠진 뒤, 열린 창을 새 주소로 보내요.
const KILL_SW = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: "window" })) {
    const u = new URL(c.url);
    c.navigate("${TO}" + u.pathname + u.search + u.hash).catch(() => {});
  }
})()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") { const u = new URL(e.request.url); e.respondWith(Response.redirect("${TO}" + u.pathname + u.search, 302)); }
});`;

export default {
  fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/sw.js") return new Response(KILL_SW, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
    const status = req.method === "GET" || req.method === "HEAD" ? 301 : 308;
    return new Response(null, { status, headers: { location: TO + u.pathname + u.search, "cache-control": "public, max-age=86400" } });
  },
};

// 예전 워커에 있던 Durable Object 자리 — 지우면 Cloudflare 가 마이그레이션을 요구해서 빈 클래스로 남겨 둬요
export class RoomHub {
  fetch() { return Response.redirect(TO, 301); }
}

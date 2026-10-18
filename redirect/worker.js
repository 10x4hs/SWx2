// 옛 주소(dsm-mafia.dsm-mafia.workers.dev) → 새 주소(swx2.dsm-mafia.workers.dev).
// GET · HEAD 는 301, 그 밖(POST 등)은 방법과 본문을 그대로 넘기는 308. 경로 · 쿼리 · #해시는 브라우저가 그대로 들고 가요.
const TO = "https://swx2.dsm-mafia.workers.dev";

export default {
  fetch(req) {
    const u = new URL(req.url);
    const status = req.method === "GET" || req.method === "HEAD" ? 301 : 308;
    return new Response(null, { status, headers: { location: TO + u.pathname + u.search, "cache-control": "public, max-age=86400" } });
  },
};

// 예전 워커에 있던 Durable Object 자리 — 지우면 Cloudflare 가 마이그레이션을 요구해서 빈 클래스로 남겨 둬요
export class RoomHub {
  fetch() { return Response.redirect(TO, 301); }
}

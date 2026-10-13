// Dsm-mafia API — Cloudflare Worker + D1.
// Static files in ./public are served by the assets binding; only /api/* reaches this code.
import { registerAi } from "./ai.js";
import { registerBrain } from "./brain.js";
import { registerEnglish } from "./english.js";
import { registerPages, servePageFile } from "./pages.js";
import { registerProxy, handleProxy } from "./proxy.js";
import { registerPapers, cleanupPaperNotes } from "./papers.js";
import { registerBooks } from "./books.js";
import { handleMcp, registerMcpTokens } from "./mcp.js";
import { handleOAuth } from "./oauth.js";
import { registerHomePad } from "./homepad.js";
import { registerCalendar } from "./calendar.js";
import { registerTogether, weeklyReviewCron } from "./together.js";
import { registerRoom } from "./room.js";
import { registerLibrary } from "./library.js";
import { registerPush } from "./push.js";
import { registerNews, newsCron, newsPulse } from "./news.js";
import { kstToday } from "./lib/day.js";
import { HttpError, fail, json, body, now, uid, str } from "./http.js";
import { on, match } from "./router.js";
import { requireUser, sessionUser, tokenUser, loginWith, MUST_CHANGE_OPEN, registerAuth } from "./auth.js";
import { registerPlans } from "./plans.js";
import { registerDiary } from "./diary.js";
import { registerCustom } from "./custom.js";
import { registerFiles } from "./files.js";
import { registerNotes, indexStmts, MAX_NOTE } from "./notes.js";
import { registerRecords, autoSaveYesterday } from "./records.js";
export { RoomHub } from "./hub.js"; // Durable Object 클래스는 main 모듈에서 내보내야 해요

const WEEKLY_CRON = "0 13 * * SUN";
const NEWS_CRON = "0 23 * * *";        // 08:00 한국 시간 — 뉴스 모으고 요약 · 지도 태그 · 줄기 · 브리핑
const NEWS_PULSE_CRON = "20 * * * *";  // 매시 20분 — 글만 긁어 와요 (토큰 0)

export default {
  async fetch(req, env, ec) {
    const url = new URL(req.url);
    // OAuth 2.1 (ChatGPT · claude.ai 커넥터처럼 OAuth 로만 붙는 MCP 앱)
    if (url.pathname.startsWith("/.well-known/") || url.pathname.startsWith("/oauth/")) {
      try { const r = await handleOAuth(req, env, url, { sessionUser, loginWith }); if (r) return r; }
      catch (e) { console.error("oauth", e); return json({ error: "server_error", error_description: "서버에서 문제가 생겼어요." }, 500); }
    }
    // MCP (어떤 MCP 클라이언트든): Bearer 토큰(직접 만든 토큰 또는 OAuth)으로 로그인, 앱 API 를 안에서 그대로 불러요
    if (url.pathname === "/mcp") {
      try { return await handleMcp(req, env, ec, { tokenUser, internal: internalCall }); }
      catch (e) { console.error("mcp", e); return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "서버에서 문제가 생겼어요." } }, 500); }
    }
    if (url.pathname.startsWith("/px/")) { // 내장 브라우저(프록시, 실험) — 토큰은 주소 안에
      try { return await handleProxy(req, env, url); }
      catch (e) { console.error("px", e); return new Response("프록시에서 문제가 생겼어요.", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }); }
    }
    if (url.pathname.startsWith("/pf/")) { // Dock 사용자 페이지 파일 (sandbox iframe 이 불러요)
      try { return await servePageFile(req, env, url, () => sessionUser(req, env)); } // 로그인은 파일 토큰이 없을 때만 찾아봐요
      catch (e) { console.error("pf", e); return new Response("서버에서 문제가 생겼어요.", { status: 500 }); }
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url, ec);
    } catch (e) {
      if (e instanceof HttpError) return json({ ...(e.extra || {}), error: e.message }, e.status);
      console.error(e);
      return json({ error: "서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, 500);
    }
  },
  // wrangler.jsonc 의 triggers.crons
  //   "5 15 * * *"  매일 00:05 (한국 시간) — 지난 하루의 계획·기록을 모두 자동 저장
  //   "0 13 * * SUN" 일요일 22:00 (한국 시간) — 이번 주 활동이 있는 사람의 주간 회고를 미리 만들기
  async scheduled(event, env, ec) {
    if (event.cron === NEWS_PULSE_CRON) {
      ec.waitUntil(newsPulse(env).then((r) => r.added && console.log("속보 수집", r.added + "편")).catch((e) => console.log("속보 실패", String(e?.message || e))));
      return;
    }
    if (event.cron === NEWS_CRON) {
      ec.waitUntil(newsCron(env, kstToday(0))
        .then((r) => console.log("뉴스", r.added + "편", "요약 " + r.summed, r.dying.length ? "죽어가는 피드 " + r.dying.join(",") : "", r.head || ""))
        .catch((e) => console.log("뉴스 실패", String(e?.message || e))));
      return;
    }
    if (event.cron === WEEKLY_CRON) {
      ec.waitUntil(weeklyReviewCron(env).then((r) => console.log("주간 회고", r.week, r.made + "명", r.skipped || "")));
      return;
    }
    ec.waitUntil(autoSaveYesterday(env).then((r) => console.log("자동 저장", r.day, r.saved + "명")));
    // 논문 스프린트가 끝났으면(10-06~) 노트의 논문 구역을 지워요
    ec.waitUntil(cleanupPaperNotes(env, kstToday(0)).then((r) => r.deleted && console.log("논문 구역 정리", r.deleted + "개")));
  },
};

// ---------- routing ----------
async function route(req, env, url, ec) {
  const path = url.pathname.slice(4); // strip "/api"
  const hit = match(req.method, path);
  if (!hit) fail(404, "없는 주소예요.");
  const { r, m } = hit;
  // CSRF: every write must come from our own fetch() with this header (a form post can't set it)
  if (req.method !== "GET" && req.headers.get("x-trio") !== "1") fail(403, "잘못된 요청이에요.");
  const ctx = { req, env, ec, url, params: m.groups || {}, q: url.searchParams };
  if (r.auth) {
    ctx.user = await requireUser(req, env);
    // 첫 로그인: 비밀번호를 바꾸기 전에는 내 정보·멤버 목록·로그인 관련 API만 쓸 수 있어요
    if (ctx.user.must_change_pw && !MUST_CHANGE_OPEN(path)) fail(403, "먼저 비밀번호를 바꿔 주세요.", { must_change_password: true });
  }
  return r.handler(ctx);
}

// 앱 API 를 HTTP 없이 안에서 부르기 (MCP 도구가 웹 화면과 같은 검증 · 권한을 쓰게)
async function internalCall(env, ec, origin, user, method, path, payload) {
  const url = new URL("/api" + path, origin), p = url.pathname.slice(4);
  const hit = match(method, p);
  if (!hit) return { status: 404, data: { error: "없는 주소예요." } };
  const { r, m } = hit;
  const req = new Request(url, { method, headers: { "content-type": "application/json", "x-trio": "1" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  try {
    const res = await r.handler({ req, env, ec, url, params: m.groups || {}, q: url.searchParams, user });
    return { status: res.status, data: await res.json().catch(() => null) };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, data: { error: e.message } };
    throw e;
  }
}

// ---------- routes: 등록 순서가 곧 매칭 순서예요 (auth → plans · logs → diary → notes → records → 나머지) ----------
registerAuth(on);
registerPlans(on);
registerDiary(on);
registerNotes(on);
registerRecords(on);
registerCustom(on); // Dock 아이콘 우클릭 → 내 CSS · HTML · JS
registerFiles(on); // 노트 이미지 (R2)

// ---------- AI chat ----------
registerAi(on, { json, body, fail, str, uid, now });
registerBrain(on, { json, body, fail, uid, now, indexStmts, MAX_NOTE });
registerEnglish(on, { json, body, fail, uid, now });
registerPages(on, { json, body, fail, uid, now }); // Dock 사용자 페이지 + AI 코드 생성
registerProxy(on, { json, fail }); // 내장 브라우저(프록시) 보조 API
registerPapers(on, { json, body, fail, now });
registerBooks(on, { json, body, fail, now }); // AI 공부책 (#/books)
registerMcpTokens(on, { json, body, fail, now });
registerHomePad(on, { json, body, fail, now });
registerCalendar(on, { json, fail });
registerTogether(on, { json, body, fail, now });
registerRoom(on, { json, body, fail, uid, now });
registerPush(on, { json, body, fail, uid, now });
registerLibrary(on, { json, body, fail, uid, now });
registerNews(on, { json, body, fail, now }); // 뉴스 Signal Map (#/news)

// SWx2 API — Cloudflare Worker + D1.
import "./lib/budget.js"; // 맨 먼저: fetch 를 세는 포장 (크론 예산)
// Static files in ./public are served by the assets binding; only /api/* reaches this code.
import { registerAi } from "./ai.js";
import { registerBrain } from "./brain.js";
import { registerEnglish } from "./english.js";
import { registerPages, servePageFile } from "./pages.js";
import { registerProxy, handleProxy } from "./proxy.js";
import { registerPapers } from "./papers.js";
import { registerBooks } from "./books.js";
import { registerMba, registerDev } from "./mba.js";
import { handleMcp, registerMcpTokens } from "./mcp.js";
import { handleOAuth } from "./oauth.js";
import { registerHomePad } from "./homepad.js";
import { registerCalendar } from "./calendar.js";
import { registerTogether } from "./together.js";
import { registerRoom } from "./room.js";
import { registerLibrary } from "./library.js";
import { registerPush } from "./push.js";
import { registerNews } from "./news.js";
import { registerReminders } from "./reminders.js";
import { registerCron, runCron, cronCatchUp } from "./cron.js";
import { HttpError, fail, json, body, now, uid, str } from "./http.js";
import { on, match } from "./router.js";
import { requireUser, sessionUser, tokenUser, loginWith, MUST_CHANGE_OPEN, registerAuth } from "./auth.js";
import { registerPlans } from "./plans.js";
import { registerDiary } from "./diary.js";
import { registerAdmin } from "./admin.js";
import { registerCustom } from "./custom.js";
import { registerFiles } from "./files.js";
import { registerNotes, indexStmts, MAX_NOTE } from "./notes.js";
import { registerRecords } from "./records.js";
export { RoomHub } from "./hub.js"; // Durable Object 클래스는 main 모듈에서 내보내야 해요

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
    ec.waitUntil(cronCatchUp(env).catch((e) => console.log("크론 대신 실패", String(e?.message || e))));
    try {
      return await route(req, env, url, ec);
    } catch (e) {
      if (e instanceof HttpError) return json({ ...(e.extra || {}), error: e.message }, e.status);
      console.error(e);
      return json({ error: "서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, 500);
    }
  },
  // wrangler.jsonc 의 triggers.crons — 무엇이 언제 도는지는 src/cron.js 맨 위에 있어요
  async scheduled(event, env, ec) {
    ec.waitUntil(runCron(env, event.cron)
      .then((r) => console.log("크론", event.cron, "바깥 요청 " + r.used + "/" + r.limit, JSON.stringify(r.result).slice(0, 600)))
      .catch((e) => console.log("크론 실패", event.cron, String(e?.message || e))));
  },
};

// ---------- routing ----------
const WIDGET_PATH = /^\/(?:me|users|plans(?:\/[A-Za-z0-9_-]+)?|widget\/stamp)$/;
async function route(req, env, url, ec) {
  const path = url.pathname.slice(4); // strip "/api"
  const hit = match(req.method, path);
  if (!hit) fail(404, "없는 주소예요.");
  const { r, m } = hit;
  // CSRF: every write must come from our own fetch() with this header (a form post can't set it)
  if (req.method !== "GET" && req.headers.get("x-trio") !== "1") fail(403, "잘못된 요청이에요.");
  const ctx = { req, env, ec, url, params: m.groups || {}, q: url.searchParams };
  if (r.auth) {
    // Mac 위젯: 쿠키 대신 내 토큰(Authorization: Bearer)으로 — 계획 · 멤버 · 바뀜 확인만
    const bearer = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(req.headers.get("authorization") || "")?.[1];
    if (bearer && WIDGET_PATH.test(path)) {
      const t = await tokenUser(env, bearer);
      if (!t) fail(401, "위젯 연결이 끊겼어요. 웹에서 다시 연결해 주세요.");
      ctx.user = t.user;
      return r.handler(ctx);
    }
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
registerAdmin(on);
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
registerMba(on, { json, body, fail, now }); // 경영 마이크로디그리 (#/mba)
registerDev(on, { json, body, fail, now }); // 개발 흐름 마이크로디그리 (#/dev) — 같은 모양, dev_* 표
registerMcpTokens(on, { json, body, fail, now });
registerHomePad(on, { json, body, fail, now });
registerCalendar(on, { json, fail });
registerTogether(on, { json, body, fail, now });
registerRoom(on, { json, body, fail, uid, now });
registerPush(on, { json, body, fail, uid, now });
registerReminders(on, { json, fail });
registerCron(on, { json, fail }); // 로컬 시험: POST /api/cron/run?cron=hourly|am|close
registerLibrary(on, { json, body, fail, uid, now });
registerNews(on, { json, body, fail, now }); // 뉴스 Signal Map (#/news)

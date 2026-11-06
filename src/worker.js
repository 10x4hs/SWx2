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
import { registerMba, registerDev, registerVg, registerOnto } from "./mba.js";
import { registerAppState } from "./appstate.js";
import { registerCimAsk } from "./cimask.js";
import { registerSvm } from "./svm.js";
import { registerPsy } from "./psy.js";
import { registerRag } from "./rag.js";
import { registerRels } from "./onto.js";
import { registerDecide } from "./decide.js";
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
import { registerTeams } from "./teams.js";
import { registerFeatures, gate } from "./features.js";
import { registerCustom } from "./custom.js";
import { registerFiles } from "./files.js";
import { registerNotes, indexStmts, MAX_NOTE } from "./notes.js";
import { registerRecords } from "./records.js";
import { registerApiKeys, handleV1 } from "./apikeys.js";
import { aiMockOn, mockEnv } from "./lib/aimock.js";
export { RoomHub } from "./hub.js"; // Durable Object 클래스는 main 모듈에서 내보내야 해요

export default {
  async fetch(req, env, ec) {
    const url = new URL(req.url);
    // 아이디만으로 들어가기(PASSWORDLESS=1)는 내 컴퓨터(localhost)에서만 — 배포본 설정에 실수로 들어가도 꺼져요
    if (env.PASSWORDLESS === "1" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) env = { ...env, PASSWORDLESS: "0" };
    if (aiMockOn(env, url)) env = mockEnv(env); // 로컬 검사만: 가짜 AI (src/lib/aimock.js)
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
    // 바깥 사이트용 읽기 전용 REST: 개인 API 키(Bearer)만 · CORS * · 쿠키는 안 봐요 (보통 /api 와 완전히 따로)
    if (url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/")) return handleV1(req, env, url);
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
    if (aiMockOn(env)) env = mockEnv(env);
    ec.waitUntil(runCron(env, event.cron)
      .then((r) => console.log("크론", event.cron, "바깥 요청 " + r.used + "/" + r.limit, JSON.stringify(r.result).slice(0, 600)))
      .catch((e) => console.log("크론 실패", event.cron, String(e?.message || e))));
  },
};

// ---------- routing ----------
const WIDGET_PATH = /^\/(?:me|users|presence|plans(?:\/[A-Za-z0-9_-]+)?|widget\/stamp)$/;
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
    // 기능 잠금: 관리자 말고는 승인받은 기능만 (뉴스 · 대화방 · 계획은 누구나)
    const locked = gate(req.method, path, ctx.user);
    if (locked) return locked;
    // AI 하루 사용량: 첫 팀(SWx2) 밖의 사람은 하루 AI_DAILY 번까지 (키 비용)
    if (req.method === "POST" && AI_PATH.test(path)) await aiQuota(env, ctx.user);
    // 첫 로그인: 비밀번호를 바꾸기 전에는 내 정보·멤버 목록·로그인 관련 API만 쓸 수 있어요
    if (ctx.user.must_change_pw && !MUST_CHANGE_OPEN(path)) fail(403, "먼저 비밀번호를 바꿔 주세요.", { must_change_password: true });
  }
  return r.handler(ctx);
}

const AI_PATH = /^\/(?:ai\/[a-z-]+|books\/ask|apps\/cim\/ask|apps\/psy\/spar|svm\/translate|papers\/(?:ask|explain|quiz)|review\/week\/ai|room\/ai|news\/(?:summarize|item\/[^/]+\/(?:deep|summarize|ask)|comments\/[^/]+\/ai-rebut))$/;
async function aiQuota(env, user) {
  if (await env.DB.prepare("SELECT 1 FROM team_members WHERE team_id = 'swx2' AND user_id = ?").bind(user.id).first()) return;
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), max = Number(env.AI_DAILY || 30);
  const r = await env.DB.prepare("INSERT INTO ai_quota (user_id, day, n) VALUES (?1, ?2, 1) ON CONFLICT(user_id, day) DO UPDATE SET n = n + 1 WHERE n < ?3").bind(user.id, day, max).run();
  if (!r.meta.changes) fail(429, `오늘 AI 는 ${max}번까지 쓸 수 있어요. 내일 다시 써 주세요.`);
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
registerTeams(on);
registerFeatures(on);
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
registerDev(on, { json, body, fail, now }); // 개발 흐름 마이크로디그리 (#/sw/dev) — 같은 모양, dev_* 표
registerVg(on, { json, body, fail, now }); // Vector & Graph 과정 (#/sw/vg) — 같은 모양, vg_* 표
registerOnto(on, { json, body, fail, now }); // 온톨로지 (#/sw/onto) · Palantir AIP (#/sw/aip) — 같은 모양, onto_* · aip_* 표
registerAppState(on, { json, body, fail, now }); // 내장 Dock 앱의 사람별 저장소 (#/cim 투자자산운용사)
registerCimAsk(on, { json, body, fail }); // CIM AI 튜터 옆 패널 (POST /apps/cim/ask · 하루 사용량은 AI_PATH) — 근거 [1]..[n] 은 rag.js 에서
registerSvm(on, { json, body, fail }); // Silicon Valley Mafia (#/svm, 관리자만) — 내용 · 원문 읽기 · 단락 번역 (POST /svm/translate 는 AI_PATH)
registerPsy(on, { json, body, fail }); // Psychology (#/psy) AI 스파링 (POST /apps/psy/spar · AI_PATH + 앱 하루 60번)
registerRels(on); // 관계 종류 · 제안함 · 새 노트 자리 제안 (/rels/* · /notes/:id/sort) — src/onto.js
registerDecide(on, { json, fail }); // decide() 판정 통계 (GET /decide/stats, 관리자) — src/decide.js
registerRag(on, { json, fail }); // 뜻으로 찾기 (GET /search/semantic) · 색인 관리 (/rag/*, 관리자)
registerMcpTokens(on, { json, body, fail, now });
registerApiKeys(on); // 개인 API 키 (/api/v1 은 위 fetch 에서 따로)
registerHomePad(on, { json, body, fail, now });
registerCalendar(on, { json, fail });
registerTogether(on, { json, body, fail, now });
registerRoom(on, { json, body, fail, uid, now });
registerPush(on, { json, body, fail, uid, now });
registerReminders(on, { json, fail });
registerCron(on, { json, fail }); // 로컬 시험: POST /api/cron/run?cron=hourly|am|close
registerLibrary(on, { json, body, fail, uid, now });
registerNews(on, { json, body, fail, now }); // 뉴스 Signal Map (#/news)

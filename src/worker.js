// Dsm-mafia API — Cloudflare Worker + D1.
// Static files in ./public are served by the assets binding; only /api/* reaches this code.
import { registerAi, aiJson, isModel } from "./ai.js";
import { registerBrain } from "./brain.js";
import { registerEnglish } from "./english.js";
import { registerPages, servePageFile } from "./pages.js";
import { registerProxy, handleProxy } from "./proxy.js";
import { registerPapers, cleanupPaperNotes } from "./papers.js";
import { registerBooks } from "./books.js";
import { handleMcp, registerMcpTokens } from "./mcp.js";
import { handleOAuth, oauthTokenUser } from "./oauth.js";
import { registerHomePad } from "./homepad.js";
import { registerCalendar } from "./calendar.js";
import { registerTogether, weeklyReviewCron } from "./together.js";
import { registerRoom } from "./room.js";
import { registerLibrary } from "./library.js";
import { registerPush } from "./push.js";
export { RoomHub } from "./hub.js"; // Durable Object 클래스는 main 모듈에서 내보내야 해요

const COLORS = ["#E8552B", "#4C6FFF", "#14A38B"]; // Golden Gate orange, bay blue, cypress green
const SESSION_DAYS = 30;
const WEEKLY_CRON = "0 13 * * SUN";
const PBKDF2_ITERATIONS = 100_000; // Workers' WebCrypto maximum
const MAX_NOTE = 200_000;

const PERIOD_RE = {
  year: /^Y:\d{4}$/,
  month: /^M:\d{4}-(0[1-9]|1[0-2])$/,
  week: /^W:\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/,
  day: /^D:\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
};
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TONES = ["ink", "graphite", "slate", "steel", "silver", "sand", "ivory", "champagne"];
const PRIORITIES = ["low", "medium", "high", "xhigh", "max"];
// 우선순위: 저장은 low~max, 화면 · AI · MCP 는 1(가장 급함)~5(여유) 도 써요 → 같은 값으로 바꿔요
const PRIO_NUM = { 1: "max", 2: "xhigh", 3: "high", 4: "medium", 5: "low" };
const prioIn = (v) => (PRIO_NUM[String(v).trim()] || (typeof v === "string" ? v.trim().toLowerCase() : v));
const prio = (v0, v = prioIn(v0)) => (v0 === null || v0 === "" ? null : PRIORITIES.includes(v) ? v : fail(400, "우선순위는 1(가장 급함)~5(여유) 또는 low · medium · high · xhigh · max 중 하나예요."));
const tone = (v) => (v === null ? null : TONES.includes(v) ? v : fail(400, "고를 수 없는 색이에요."));

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
// extra: 에러 몸통에 같이 실어 보낼 값 (예: { must_change_password: true })
const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

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
      try { return await servePageFile(req, env, url, await sessionUser(req, env)); }
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
    if (event.cron === WEEKLY_CRON) {
      ec.waitUntil(weeklyReviewCron(env).then((r) => console.log("주간 회고", r.week, r.made + "명", r.skipped || "")));
      return;
    }
    ec.waitUntil(autoSaveYesterday(env).then((r) => console.log("자동 저장", r.day, r.saved + "명")));
    // 논문 스프린트가 끝났으면(10-06~) 노트의 논문 구역을 지워요
    ec.waitUntil(cleanupPaperNotes(env, kstDay(0)).then((r) => r.deleted && console.log("논문 구역 정리", r.deleted + "개")));
  },
};

// ---------- routing ----------
const routes = [];
const on = (method, pattern, handler, opts = {}) =>
  routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), handler, auth: opts.auth !== false });

async function route(req, env, url, ec) {
  const path = url.pathname.slice(4); // strip "/api"
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = path.match(r.re);
    if (!m) continue;
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
  fail(404, "없는 주소예요.");
}

// MCP 토큰 → { user, agent }. 직접 만든 토큰(api_tokens) 먼저, 아니면 OAuth 접근 토큰. 쓸 때마다 last_used_at 만 고쳐요
async function tokenUser(env, token) {
  const h = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT t.token_hash, t.agent, u.id, u.username, u.display_name, u.color, u.day_goal FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?"
  ).bind(h).first();
  const shape = (u, agent) => ({ agent, user: { id: u.id, username: u.username, display_name: u.display_name, color: u.color, day_goal: u.day_goal, must_change_pw: false } });
  if (row) {
    await env.DB.prepare("UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?").bind(now(), row.token_hash).run();
    return shape(row, row.agent);
  }
  const o = await oauthTokenUser(env, h);
  if (!o) return null;
  const u = await env.DB.prepare("SELECT id, username, display_name, color, day_goal FROM users WHERE id = ?").bind(o.user_id).first();
  return u ? shape(u, o.agent) : null;
}
// OAuth 화면용: 앱에 이미 로그인돼 있으면 그 사람 (아니면 null)
async function sessionUser(req, env) {
  try { return await requireUser(req, env); } catch { return null; }
}
// OAuth 화면용 로그인: 앱의 /auth/login 을 그대로 써요(잠금 · 비밀번호 규칙 같음). 성공하면 세션 쿠키도 같이
async function loginWith(env, req, username, password) {
  const r = routes.find((x) => x.method === "POST" && x.re.test("/auth/login"));
  const url = new URL("/api/auth/login", req.url);
  try {
    const res = await r.handler({ req: new Request(url, { method: "POST", headers: { "content-type": "application/json", "x-trio": "1" }, body: JSON.stringify({ username, password }) }), env, url, params: {}, q: url.searchParams });
    const d = await res.json().catch(() => ({}));
    if (res.status !== 200) return { error: d.error || "로그인하지 못했어요." };
    return { user: d.user, cookie: res.headers.get("set-cookie") };
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message };
    throw e;
  }
}
// 앱 API 를 HTTP 없이 안에서 부르기 (MCP 도구가 웹 화면과 같은 검증 · 권한을 쓰게)
async function internalCall(env, ec, origin, user, method, path, payload) {
  const url = new URL("/api" + path, origin), p = url.pathname.slice(4);
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = p.match(r.re);
    if (!m) continue;
    const req = new Request(url, { method, headers: { "content-type": "application/json", "x-trio": "1" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    try {
      const res = await r.handler({ req, env, ec, url, params: m.groups || {}, q: url.searchParams, user });
      return { status: res.status, data: await res.json().catch(() => null) };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, data: { error: e.message } };
      throw e;
    }
  }
  return { status: 404, data: { error: "없는 주소예요." } };
}

const MUST_CHANGE_OPEN = (path) => path === "/me" || path === "/users" || path.startsWith("/auth/");

// ---------- helpers ----------
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
async function body(req) {
  try { return await req.json(); } catch { fail(400, "요청 형식이 올바르지 않아요."); }
}
const now = () => Date.now();
const uid = () => crypto.randomUUID();
const str = (v, max, name) => {
  if (typeof v !== "string") fail(400, `${name}을(를) 입력해 주세요.`);
  const s = v.trim();
  if (!s) fail(400, `${name}을(를) 입력해 주세요.`);
  if (s.length > max) fail(400, `${name}은(는) ${max}자까지 쓸 수 있어요.`);
  return s;
};
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

async function hashPassword(password, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { hash: hex(bits), salt: hex(salt) };
}
function safeEqual(a, b) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  return crypto.subtle.timingSafeEqual ? crypto.subtle.timingSafeEqual(ea, eb) : ea.every((x, i) => x === eb[i]);
}

function cookie(req, token, maxAge) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `trio_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
async function startSession(req, env, userId) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, now() + SESSION_DAYS * 864e5).run();
  return cookie(req, token, SESSION_DAYS * 86400);
}
// 비밀번호를 꼭 바꿔야 하는지. 아이디만으로 들어가는 로컬(PASSWORDLESS=1)에서는 묻지 않아요.
// 단, 요청에 "x-trio-strict: 1" 이 있으면 로컬에서도 배포본처럼 검사해요 (smoke 테스트용 — 더 엄격해지기만 하고 풀어 주는 일은 없어요)
const pwStrict = (req, env) => env.PASSWORDLESS !== "1" || req.headers.get("x-trio-strict") === "1";
const mustChange = (req, env, u) => pwStrict(req, env) && Number(u.must_change_pw) === 1;
async function requireUser(req, env) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)trio_session=([A-Za-z0-9_-]+)/);
  if (!m) fail(401, "로그인이 필요해요.");
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, u.display_name, u.color, u.day_goal, u.bio, u.avatar, u.status, u.plans_open, u.must_change_pw, u.ai_model, u.dock_order, u.hidden_pages FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?"
  ).bind(await sha256(m[1]), now()).first();
  if (!row) fail(401, "로그인이 만료됐어요. 다시 로그인해 주세요.");
  return { ...row, must_change_pw: mustChange(req, env, row) };
}
// must_change_pw 는 requireUser / login 에서 이미 true·false 로 바뀐 값이에요
// 활동 상태: 정해진 단어만 · coding 이면 쓰는 AI 도구(여럿)
const STATUSES = ["coding", "working", "studying", "reading", "resting", "sleeping", "away"], TOOLS = ["claude", "codex", "gemini"];
const readStatus = (raw) => { try { const o = typeof raw === "string" ? JSON.parse(raw) : raw; return o && STATUSES.includes(o.s) ? { s: o.s, tools: o.s === "coding" ? (o.tools || []).filter((t) => TOOLS.includes(t)) : [], at: o.at || null } : null; } catch { return null; } };
const publicUser = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, color: u.color, day_goal: u.day_goal, bio: u.bio || null, avatar: u.avatar || null, status: readStatus(u.status), plans_open: u.plans_open !== 0, must_change_pw: u.must_change_pw === true, ai_model: u.ai_model || null, dock_order: readList(u.dock_order), hidden_pages: readList(u.hidden_pages) }); // 본인에게만 (로그인 · /me)
function readList(v) { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } }

// ---------- auth ----------
// 가입은 기본으로 꺼져 있어요. 계정은 scripts/add-user.mjs 로 만들어요 (ALLOW_SIGNUP=1 이면 켜짐)
on("POST", "/auth/signup", async ({ req, env }) => {
  if (env.ALLOW_SIGNUP !== "1") fail(403, "가입은 닫혀 있어요. 스터디장에게 계정을 받아 주세요.");
  const b = await body(req);
  if (!env.INVITE_CODE || typeof b.invite !== "string" || !safeEqual(b.invite.trim(), env.INVITE_CODE)) fail(403, "초대 코드가 맞지 않아요.");
  const username = str(b.username, 20, "아이디").toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) fail(400, "아이디는 영문 소문자·숫자·_ 로 3~20자예요.");
  if (typeof b.password !== "string" || b.password.length < 8) fail(400, "비밀번호는 8자 이상이어야 해요.");
  const display = str(b.display_name, 12, "이름");
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  if (n >= Number(env.MAX_USERS || 3)) fail(403, `이미 ${env.MAX_USERS || 3}명이 모두 가입했어요.`);
  if (await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first()) fail(409, "이미 있는 아이디예요.");
  const { hash, salt } = await hashPassword(b.password);
  const user = { id: uid(), username, display_name: display, color: COLORS[n % COLORS.length], day_goal: 240 };
  await env.DB.prepare("INSERT INTO users (id, username, display_name, color, pw_hash, pw_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(user.id, username, display, user.color, hash, salt, now()).run();
  return json({ user }, 201, { "set-cookie": await startSession(req, env, user.id) });
}, { auth: false });

on("POST", "/auth/login", async ({ req, env }) => {
  const b = await body(req);
  const username = String(b.username || "").trim().toLowerCase();
  const u = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
  // 아이디만으로 들어가기 (PASSWORDLESS=1): 세 사람만 쓰는 공간이라 비밀번호를 묻지 않아요
  if (env.PASSWORDLESS === "1") {
    if (!u) fail(401, "없는 아이디예요.");
    return json({ user: publicUser({ ...u, must_change_pw: mustChange(req, env, u) }) }, 200, { "set-cookie": await startSession(req, env, u.id) });
  }
  if (!b.password) return json({ error: "비밀번호를 입력해 주세요.", need_password: true }, 401);
  const wrong = "아이디 또는 비밀번호가 맞지 않아요.";
  if (!u) { await hashPassword(String(b.password || "")); fail(401, wrong); } // same cost either way
  if (u.locked_until > now()) fail(429, "여러 번 틀려서 잠시 잠겼어요. 5분 뒤에 다시 시도해 주세요.");
  const { hash } = await hashPassword(String(b.password || ""), u.pw_salt);
  if (!safeEqual(hash, u.pw_hash)) {
    const fails = u.fail_count + 1;
    await env.DB.prepare("UPDATE users SET fail_count = ?, locked_until = ? WHERE id = ?")
      .bind(fails >= 5 ? 0 : fails, fails >= 5 ? now() + 5 * 60e3 : 0, u.id).run();
    fail(401, wrong);
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET fail_count = 0, locked_until = 0 WHERE id = ?").bind(u.id),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
  ]);
  return json({ user: publicUser({ ...u, must_change_pw: mustChange(req, env, u) }) }, 200, { "set-cookie": await startSession(req, env, u.id) });
}, { auth: false });

on("POST", "/auth/logout", async ({ req, env }) => {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)trio_session=([A-Za-z0-9_-]+)/);
  if (m) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(m[1])).run();
  return json({ ok: true }, 200, { "set-cookie": cookie(req, "", 0) });
}, { auth: false });

// 내 비밀번호 바꾸기: 지금 비밀번호를 맞혀야 바뀌어요. 틀리면 로그인처럼 5번에 5분 잠김.
// 바꾸면 다른 기기의 로그인은 모두 풀리고, 지금 이 기기만 남아요. 첫 로그인 표시(must_change_pw)도 여기서 꺼져요.
on("POST", "/auth/password", async ({ req, env, user }) => {
  const b = await body(req);
  const u = await env.DB.prepare("SELECT id, pw_hash, pw_salt, fail_count, locked_until FROM users WHERE id = ?").bind(user.id).first();
  if (u.locked_until > now()) fail(429, "여러 번 틀려서 잠시 잠겼어요. 5분 뒤에 다시 시도해 주세요.");
  if (typeof b.current !== "string" || !b.current) fail(400, "지금 비밀번호를 입력해 주세요.");
  if (typeof b.next !== "string" || b.next.length < 8) fail(400, "새 비밀번호는 8자 이상이어야 해요.");
  if (b.next.length > 200) fail(400, "새 비밀번호가 너무 길어요.");
  const { hash } = await hashPassword(b.current, u.pw_salt);
  if (!safeEqual(hash, u.pw_hash)) {
    const fails = u.fail_count + 1;
    await env.DB.prepare("UPDATE users SET fail_count = ?, locked_until = ? WHERE id = ?")
      .bind(fails >= 5 ? 0 : fails, fails >= 5 ? now() + 5 * 60e3 : 0, u.id).run();
    fail(403, "지금 비밀번호가 맞지 않아요.");
  }
  if (b.next === b.current) fail(400, "지금과 다른 비밀번호로 정해 주세요.");
  const next = await hashPassword(b.next);
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)trio_session=([A-Za-z0-9_-]+)/);
  const keep = await sha256(m[1]);
  const r = await env.DB.batch([
    env.DB.prepare("UPDATE users SET pw_hash = ?, pw_salt = ?, fail_count = 0, locked_until = 0, must_change_pw = 0 WHERE id = ?").bind(next.hash, next.salt, u.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(u.id, keep),
  ]);
  return json({ ok: true, signed_out: r[1].meta.changes || 0 });
});

on("GET", "/me", ({ user }) => json({ user: publicUser(user) }));

on("PATCH", "/me", async ({ req, env, user }) => {
  const b = await body(req);
  const display = b.display_name !== undefined ? str(b.display_name, 12, "이름") : user.display_name;
  const goal = b.day_goal !== undefined ? Math.max(30, Math.min(960, Math.round(Number(b.day_goal) || 240))) : user.day_goal;
  // 내 AI 모델: "" · null = 자동. 모르는 id 는 400
  // Dock 순서 · 숨긴 친구 페이지: 문자열 배열. 모양이 틀리면 400
  const list = (v, re, max, name) => (Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && re.test(x)) ? JSON.stringify([...new Set(v)]) : fail(400, `${name} 모양이 아니에요.`));
  const dockOrder = b.dock_order === undefined ? (user.dock_order ?? null) : b.dock_order === null ? null : list(b.dock_order, /^(nav:[a-z-]{1,20}|page:[A-Za-z0-9-]{1,64})$/, 120, "Dock 순서");
  const hiddenPages = b.hidden_pages === undefined ? (user.hidden_pages ?? null) : b.hidden_pages === null ? null : list(b.hidden_pages, /^[A-Za-z0-9-]{1,64}$/, 300, "숨긴 페이지");
  const aiModel = b.ai_model === undefined ? user.ai_model || null : b.ai_model === "" || b.ai_model === null ? null : isModel(b.ai_model) ? b.ai_model : fail(400, "없는 AI 모델이에요.");
  const color = typeof b.color === "string" && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : user.color;
  let bio = user.bio || null;
  if (b.bio !== undefined) {
    if (b.bio !== null && typeof b.bio !== "string") fail(400, "한 줄 소개 형식이 올바르지 않아요.");
    bio = String(b.bio || "").replace(/\s+/g, " ").trim() || null;
    if (bio && bio.length > 40) fail(400, "한 줄 소개는 40자까지예요.");
  }
  // 프로필 사진: 브라우저가 줄여 보낸 data URL 만 (jpeg · png · webp, 80KB 까지). null 이면 지워요
  let avatar = user.avatar || null;
  if (b.avatar !== undefined) {
    if (b.avatar === null || b.avatar === "") avatar = null;
    else if (typeof b.avatar === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.avatar) && b.avatar.length <= 80_000) avatar = b.avatar;
    else fail(400, "사진은 앱에서 고른 이미지만 올릴 수 있어요 (80KB 까지).");
  }
  let status = readStatus(user.status);
  if (b.status !== undefined) {
    if (b.status === null) status = null;
    else { status = readStatus({ ...b.status, at: Date.now() }); if (!status) fail(400, "상태 형식이 올바르지 않아요."); }
  }
  const plans_open = b.plans_open !== undefined ? !!b.plans_open : user.plans_open !== 0;
  await env.DB.prepare("UPDATE users SET display_name = ?, day_goal = ?, color = ?, bio = ?, avatar = ?, status = ?, plans_open = ?, ai_model = ?, dock_order = ?, hidden_pages = ? WHERE id = ?").bind(display, goal, color, bio, avatar, status ? JSON.stringify(status) : null, plans_open ? 1 : 0, aiModel, dockOrder, hiddenPages, user.id).run();
  return json({ user: { ...publicUser(user), display_name: display, day_goal: goal, color, bio, avatar, status, plans_open, ai_model: aiModel, dock_order: readList(dockOrder), hidden_pages: readList(hiddenPages) } });
});

on("GET", "/users", async ({ env }) => {
  const { results } = await env.DB.prepare("SELECT id, username, display_name, color, day_goal, bio, avatar, status, plans_open FROM users ORDER BY created_at").all();
  return json({ users: results.map((u) => ({ ...u, status: readStatus(u.status), plans_open: u.plans_open !== 0 })) });
});

// ---------- plans (everyone reads, owner writes) ----------
function checkPeriod(scope, period) {
  if (!PERIOD_RE[scope]) fail(400, "계획 종류가 올바르지 않아요.");
  if (typeof period !== "string" || !PERIOD_RE[scope].test(period)) fail(400, "기간 형식이 올바르지 않아요.");
}
function checkSlot(b, into) {
  if (b.start !== undefined) {
    if (b.start !== null && !TIME_RE.test(b.start)) fail(400, "시작 시각은 HH:MM 형식이에요.");
    into.start = b.start;
  }
  if (b.mins !== undefined) {
    const m = b.mins === null ? null : Math.round(Number(b.mins));
    if (m !== null && !(m >= 1 && m <= 1440)) fail(400, "걸리는 시간은 1분~24시간이에요.");
    into.mins = m;
  }
}
async function ownPlan(env, id, user) {
  const p = await env.DB.prepare("SELECT * FROM plans WHERE id = ?").bind(id).first();
  if (!p) fail(404, "계획을 찾을 수 없어요.");
  if (p.user_id !== user.id) fail(403, "다른 사람의 계획은 수정할 수 없어요.");
  return p;
}

on("GET", "/plans", async ({ env, q, user }) => {
  const periods = (q.get("periods") || "").split(",").filter(Boolean).slice(0, 20);
  // days=YYYY-MM-DD..YYYY-MM-DD : 그 사이 날마다의 계획을 한 번에 (홈 차트가 요청 여러 번 대신 한 번으로). 최대 62일
  const dm = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(q.get("days") || "");
  const range = dm && dm[1] <= dm[2] && (Date.parse(dm[2]) - Date.parse(dm[1])) / 864e5 <= 62 ? ["D:" + dm[1], "D:" + dm[2]] : null;
  if (!periods.length && !range) return json({ plans: [] });
  const who = q.get("user") || user.id;
  // 친구 계획은 그 사람이 공개(open)했을 때만. 아니면 빈 목록 + closed 표시
  if (who !== user.id) {
    const o = await env.DB.prepare("SELECT plans_open FROM users WHERE id = ?").bind(who).first();
    if (!o || o.plans_open === 0) return json({ plans: [], closed: true });
  }
  const where = [periods.length ? `period IN (${periods.map(() => "?").join(",")})` : "", range ? "(period >= ? AND period <= ?)" : ""].filter(Boolean).join(" OR ");
  const { results } = await env.DB.prepare(
    `SELECT plans.*, (SELECT COALESCE(SUM(l.mins), 0) FROM logs l WHERE l.plan_id = plans.id AND l.kind = 'focus') AS focus_mins
     FROM plans WHERE user_id = ? AND (${where}) ORDER BY CASE WHEN start IS NULL THEN 1 ELSE 0 END, start, sort, created_at`
  ).bind(who, ...periods, ...(range || [])).all();
  // focus_mins = 그 할 일에 쌓인 집중 기록 분의 합 (logs.plan_id)
  // 친구 계획: open 한 사람 것은 내용까지 그대로 보여요 (not open 이면 위에서 이미 빈 목록)
  return json({ plans: results });
});

on("POST", "/plans", async ({ req, env, user }) => {
  const b = await body(req);
  checkPeriod(b.scope, b.period);
  const p = { id: uid(), user_id: user.id, scope: b.scope, period: b.period, text: str(b.text, 200, "내용"), done: 0, start: null, mins: null, color: b.color === undefined ? null : tone(b.color), priority: b.priority === undefined ? null : prio(b.priority), sort: now(), created_at: now(), updated_at: now(), done_at: null };
  if (b.scope === "day") checkSlot(b, p);
  await env.DB.prepare("INSERT INTO plans (id, user_id, scope, period, text, done, start, mins, color, priority, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)")
    .bind(p.id, p.user_id, p.scope, p.period, p.text, p.start, p.mins, p.color, p.priority, p.sort, p.created_at, p.updated_at).run();
  return json({ plan: p }, 201);
});

on("PATCH", "/plans/:id", async ({ req, env, user, params }) => {
  const p = await ownPlan(env, params.id, user);
  const b = await body(req);
  const next = { ...p };
  if (b.text !== undefined) next.text = str(b.text, 200, "내용");
  if (b.done !== undefined) { next.done = b.done ? 1 : 0; next.done_at = b.done ? now() : null; if (b.done) next.missed = 0; }
  // 못함(빨간 표시) — 켜면 끝냄은 꺼져요
  if (b.missed !== undefined) { next.missed = b.missed ? 1 : 0; if (b.missed) { next.done = 0; next.done_at = null; } }
  if (b.period !== undefined) { checkPeriod(p.scope, b.period); if (b.period !== p.period && b.missed === undefined) next.missed = 0; next.period = b.period; } // 다른 날로 미루면 못함 표시는 지워요
  if (p.scope === "day") checkSlot(b, next);
  if (b.color !== undefined) next.color = tone(b.color);
  if (b.priority !== undefined) next.priority = prio(b.priority);
  next.updated_at = now();
  await env.DB.prepare("UPDATE plans SET text = ?, done = ?, done_at = ?, missed = ?, period = ?, start = ?, mins = ?, color = ?, priority = ?, updated_at = ? WHERE id = ?")
    .bind(next.text, next.done, next.done_at, next.missed ? 1 : 0, next.period, next.start, next.mins, next.color, next.priority ?? null, next.updated_at, p.id).run();
  return json({ plan: next });
});

on("DELETE", "/plans/:id", async ({ env, user, params }) => {
  await ownPlan(env, params.id, user);
  await env.DB.prepare("DELETE FROM plans WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
});

// 못 끝낸 계획을 다른 기간으로 옮기기 (예: 어제 → 오늘)
on("POST", "/plans/carry", async ({ req, env, user }) => {
  const b = await body(req);
  checkPeriod(b.scope, b.from);
  checkPeriod(b.scope, b.to);
  const r = await env.DB.prepare("UPDATE plans SET period = ?, missed = 0, updated_at = ? WHERE user_id = ? AND scope = ? AND period = ? AND done = 0")
    .bind(b.to, now(), user.id, b.scope, b.from).run();
  return json({ moved: r.meta.changes || 0 });
});

// 연간 히트맵: 하루별 완료 수
on("GET", "/plans/heatmap", async ({ env, q, user }) => {
  const year = q.get("year");
  if (!/^\d{4}$/.test(year || "")) fail(400, "연도를 알려 주세요.");
  const { results } = await env.DB.prepare(
    "SELECT period, COUNT(*) AS total, SUM(done) AS done FROM plans WHERE user_id = ? AND scope = 'day' AND period LIKE ? GROUP BY period"
  ).bind(q.get("user") || user.id, `D:${year}-%`).all();
  return json({ days: results });
});

// 우리 셋: 기간별 진행 요약
on("GET", "/summary", async ({ env, q }) => {
  const periods = (q.get("periods") || "").split(",").filter(Boolean).slice(0, 10);
  if (!periods.length) return json({ rows: [] });
  const { results } = await env.DB.prepare(
    `SELECT user_id, period, COUNT(*) AS total, SUM(done) AS done, SUM(COALESCE(mins, 0)) AS mins,
            SUM(CASE WHEN done = 1 THEN COALESCE(mins, 0) ELSE 0 END) AS done_mins
     FROM plans WHERE period IN (${periods.map(() => "?").join(",")}) GROUP BY user_id, period`
  ).bind(...periods).all();
  return json({ rows: results });
});

// ---------- logs: 실행 타임라인 ----------
on("GET", "/logs", async ({ env, q, user }) => {
  const day = q.get("day") || "";
  if (!DAY_RE.test(day)) fail(400, "날짜 형식이 올바르지 않아요.");
  if (q.get("user") && q.get("user") !== user.id) fail(403, "다른 사람의 기록은 볼 수 없어요.");
  const { results } = await env.DB.prepare("SELECT * FROM logs WHERE user_id = ? AND day = ? ORDER BY at, created_at")
    .bind(user.id, day).all();
  return json({ logs: results });
});

on("POST", "/logs", async ({ req, env, user }) => {
  const b = await body(req);
  if (!DAY_RE.test(b.day || "")) fail(400, "날짜 형식이 올바르지 않아요.");
  if (!TIME_RE.test(b.at || "")) fail(400, "시각은 HH:MM 형식이에요.");
  const kind = ["note", "done", "focus"].includes(b.kind) ? b.kind : "note";
  const mins = kind === "focus" && Number(b.mins) > 0 ? Math.min(600, Math.round(Number(b.mins))) : null;
  // plan_id: 타이머를 할 일에서 시작했으면 그 할 일(내 계획만)에 집중 분이 쌓여요
  let plan_id = null;
  if (b.plan_id != null) {
    if (typeof b.plan_id !== "string" || b.plan_id.length > 64) fail(400, "할 일 정보가 올바르지 않아요.");
    const p = await env.DB.prepare("SELECT user_id FROM plans WHERE id = ?").bind(b.plan_id).first();
    if (!p) fail(400, "연결할 할 일을 찾을 수 없어요.");
    if (p.user_id !== user.id) fail(403, "다른 사람의 할 일에는 기록을 달 수 없어요.");
    plan_id = b.plan_id;
  }
  const log = { id: uid(), user_id: user.id, day: b.day, at: b.at, text: str(b.text, 500, "기록"), kind, mins, plan_id, created_at: now() };
  await env.DB.prepare("INSERT INTO logs (id, user_id, day, at, text, kind, mins, plan_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(log.id, log.user_id, log.day, log.at, log.text, log.kind, log.mins, log.plan_id, log.created_at).run();
  return json({ log }, 201);
});

on("PATCH", "/logs/:id", async ({ req, env, user, params }) => {
  const l = await env.DB.prepare("SELECT * FROM logs WHERE id = ?").bind(params.id).first();
  if (!l) fail(404, "기록을 찾을 수 없어요.");
  if (l.user_id !== user.id) fail(403, "다른 사람의 기록은 수정할 수 없어요.");
  const b = await body(req);
  const text = b.text !== undefined ? str(b.text, 500, "기록") : l.text;
  const at = b.at !== undefined ? (TIME_RE.test(b.at) ? b.at : fail(400, "시각은 HH:MM 형식이에요.")) : l.at;
  await env.DB.prepare("UPDATE logs SET text = ?, at = ? WHERE id = ?").bind(text, at, l.id).run();
  return json({ log: { ...l, text, at } });
});

on("DELETE", "/logs/:id", async ({ env, user, params }) => {
  const r = await env.DB.prepare("DELETE FROM logs WHERE id = ? AND user_id = ?").bind(params.id, user.id).run();
  if (!r.meta.changes) fail(404, "기록을 찾을 수 없어요.");
  return json({ ok: true });
});

// 공부 시간: 집중 타이머 기록의 합 (하루별)
on("GET", "/logs/focus", async ({ env, q, user }) => {
  const from = q.get("from") || "", to = q.get("to") || "";
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) fail(400, "날짜 형식이 올바르지 않아요.");
  const { results } = await env.DB.prepare(
    "SELECT user_id, day, SUM(COALESCE(mins, 0)) AS mins, COUNT(*) AS sessions FROM logs WHERE kind = 'focus' AND day BETWEEN ? AND ? AND (? = '' OR user_id = ?) GROUP BY user_id, day"
  ).bind(from, to, q.get("user") || "", q.get("user") || "").all();
  return json({ days: results });
});

// ---------- diary: 하루 한 편, 본인만 ----------
on("GET", "/diary", async ({ env, q, user }) => {
  const day = q.get("day") || "";
  if (!DAY_RE.test(day)) fail(400, "날짜 형식이 올바르지 않아요.");
  const d = await env.DB.prepare("SELECT day, mood, body, updated_at FROM diaries WHERE user_id = ? AND day = ?").bind(user.id, day).first();
  return json({ diary: d || null });
});

on("PUT", "/diary", async ({ req, env, user }) => {
  const b = await body(req);
  if (!DAY_RE.test(b.day || "")) fail(400, "날짜 형식이 올바르지 않아요.");
  const mood = b.mood == null ? null : Math.round(Number(b.mood));
  if (mood !== null && !(mood >= 1 && mood <= 5)) fail(400, "기분은 1~5 중에서 골라 주세요.");
  const text = typeof b.body === "string" ? b.body : "";
  if (text.length > 20000) fail(400, "일기가 너무 길어요.");
  if (!text.trim() && mood === null) {
    await env.DB.prepare("DELETE FROM diaries WHERE user_id = ? AND day = ?").bind(user.id, b.day).run();
    return json({ diary: null });
  }
  const at = now();
  await env.DB.prepare(
    "INSERT INTO diaries (user_id, day, mood, body, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET mood = excluded.mood, body = excluded.body, updated_at = excluded.updated_at"
  ).bind(user.id, b.day, mood, text, at).run();
  return json({ diary: { day: b.day, mood, body: text, updated_at: at } });
});

// 잔디: 한 해 동안 일기를 쓴 날
on("GET", "/diary/days", async ({ env, q, user }) => {
  const year = q.get("year") || "";
  if (!/^\d{4}$/.test(year)) fail(400, "연도를 알려 주세요.");
  const { results } = await env.DB.prepare("SELECT day, mood, length(body) AS len FROM diaries WHERE user_id = ? AND day LIKE ? ORDER BY day")
    .bind(user.id, year + "-%").all();
  return json({ days: results });
});

on("GET", "/diary/list", async ({ env, q, user }) => {
  const before = DAY_RE.test(q.get("before") || "") ? q.get("before") : "9999-12-31";
  const { results } = await env.DB.prepare(
    "SELECT day, mood, substr(body, 1, 200) AS snippet, length(body) AS len, updated_at FROM diaries WHERE user_id = ? AND day < ? ORDER BY day DESC LIMIT 60"
  ).bind(user.id, before).all();
  return json({ entries: results });
});

// ---------- notes (owner, or shared) ----------
const VISIBLE = "(n.user_id = ?1)"; // 노트는 본인만 봐요 (서로는 차트만)
function parseLinks(text) {
  const out = new Set();
  for (const m of text.matchAll(/\[\[([^\[\]|#\n]+)(?:[#|][^\]\n]*)?\]\]/g)) {
    const t = m[1].trim();
    if (t) out.add(t.slice(0, 120));
  }
  return [...out].slice(0, 200);
}
function parseTags(text) {
  const clean = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const out = new Set();
  for (const m of clean.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu)) out.add(m[1].slice(0, 40));
  return [...out].slice(0, 50);
}
function indexStmts(env, id, text) {
  return [
    env.DB.prepare("DELETE FROM note_links WHERE src_id = ?").bind(id),
    env.DB.prepare("DELETE FROM note_tags WHERE note_id = ?").bind(id),
    ...parseLinks(text).map((t) => env.DB.prepare("INSERT OR IGNORE INTO note_links (src_id, dst_title) VALUES (?, ?)").bind(id, t)),
    ...parseTags(text).map((t) => env.DB.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?, ?)").bind(id, t)),
  ];
}
async function indexNote(env, id, text) {
  await env.DB.batch(indexStmts(env, id, text));
}
async function visibleNote(env, id, user) {
  const n = await env.DB.prepare(`SELECT n.* FROM notes n WHERE n.id = ?2 AND ${VISIBLE}`).bind(user.id, id).first();
  if (!n) fail(404, "노트를 찾을 수 없어요.");
  return n;
}

on("GET", "/notes", async ({ env, user, q }) => {
  const tag = q.get("tag");
  const sql = tag
    ? `SELECT n.id, n.user_id, n.title, n.shared, n.parent_id, n.updated_at, substr(n.body, 1, 160) AS snippet FROM notes n JOIN note_tags t ON t.note_id = n.id AND t.tag = ?2 WHERE ${VISIBLE} ORDER BY n.updated_at DESC`
    : `SELECT n.id, n.user_id, n.title, n.shared, n.parent_id, n.updated_at, substr(n.body, 1, 160) AS snippet FROM notes n WHERE ${VISIBLE} ORDER BY n.updated_at DESC`;
  const stmt = tag ? env.DB.prepare(sql).bind(user.id, tag) : env.DB.prepare(sql).bind(user.id);
  const { results } = await stmt.all();
  return json({ notes: results });
});

on("GET", "/notes/resolve", async ({ env, user, q }) => {
  const title = String(q.get("title") || "").trim();
  if (!title) fail(400, "제목을 알려 주세요.");
  const n = await env.DB.prepare(
    `SELECT n.id FROM notes n WHERE n.title = ?2 COLLATE NOCASE AND ${VISIBLE} ORDER BY CASE WHEN n.user_id = ?1 THEN 0 ELSE 1 END LIMIT 1`
  ).bind(user.id, title).first();
  return json({ id: n ? n.id : null });
});

on("GET", "/notes/:id", async ({ env, user, params }) => {
  const n = await visibleNote(env, params.id, user);
  const [back, tags, children] = await env.DB.batch([
    env.DB.prepare(
      `SELECT n.id, n.user_id, n.title, substr(n.body, 1, 160) AS snippet FROM note_links l JOIN notes n ON n.id = l.src_id
       WHERE l.dst_title = ?2 AND n.id != ?3 AND ${VISIBLE} ORDER BY n.updated_at DESC`
    ).bind(user.id, n.title, n.id),
    env.DB.prepare("SELECT tag FROM note_tags WHERE note_id = ?").bind(n.id),
    env.DB.prepare("SELECT id, title, updated_at FROM notes WHERE parent_id = ? AND user_id = ? ORDER BY created_at").bind(n.id, user.id),
  ]);
  // 위로 올라가는 경로 (부모 › 조부모 …, 최대 6단계)
  const crumbs = [];
  for (let pid = n.parent_id, i = 0; pid && i < 6; i++) {
    const p = await env.DB.prepare("SELECT id, title, parent_id FROM notes WHERE id = ? AND user_id = ?").bind(pid, user.id).first();
    if (!p) break; crumbs.unshift({ id: p.id, title: p.title }); pid = p.parent_id;
  }
  return json({ note: n, backlinks: back.results, tags: tags.results.map((t) => t.tag), children: children.results, crumbs });
});

on("POST", "/notes", async ({ req, env, user }) => {
  const b = await body(req);
  const title = str(b.title, 120, "제목");
  if (/[\[\]|#]/.test(title)) fail(400, "제목에는 [ ] | # 를 쓸 수 없어요.");
  const text = typeof b.body === "string" ? b.body.slice(0, MAX_NOTE) : "";
  const dup = await env.DB.prepare("SELECT id FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE").bind(user.id, title).first();
  if (dup) return json({ error: "같은 제목의 노트가 이미 있어요.", id: dup.id }, 409);
  let parent_id = null;
  if (typeof b.parent_id === "string" && b.parent_id) {
    const p = await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").bind(b.parent_id, user.id).first();
    if (!p) fail(404, "상위 노트를 찾을 수 없어요.");
    parent_id = p.id;
  }
  const n = { id: uid(), user_id: user.id, title, body: text, shared: b.shared ? 1 : 0, parent_id, created_at: now(), updated_at: now() };
  await env.DB.prepare("INSERT INTO notes (id, user_id, title, body, shared, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(n.id, n.user_id, n.title, n.body, n.shared, n.parent_id, n.created_at, n.updated_at).run();
  await indexNote(env, n.id, text);
  return json({ note: n }, 201);
});

on("PUT", "/notes/:id", async ({ req, env, user, params }) => {
  const n = await visibleNote(env, params.id, user);
  if (n.user_id !== user.id) fail(403, "다른 사람의 노트는 수정할 수 없어요.");
  const b = await body(req);
  const next = { ...n };
  if (b.title !== undefined) {
    next.title = str(b.title, 120, "제목");
    if (/[\[\]|#]/.test(next.title)) fail(400, "제목에는 [ ] | # 를 쓸 수 없어요.");
    const dup = await env.DB.prepare("SELECT id FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE AND id != ?").bind(user.id, next.title, n.id).first();
    if (dup) fail(409, "같은 제목의 노트가 이미 있어요.");
  }
  if (typeof b.body === "string") {
    if (b.body.length > MAX_NOTE) fail(400, "노트가 너무 길어요. 나눠서 저장해 주세요.");
    next.body = b.body;
  }
  if (b.shared !== undefined) next.shared = b.shared ? 1 : 0;
  if (b.parent_id !== undefined) {
    if (b.parent_id === null || b.parent_id === "") next.parent_id = null;
    else {
      if (b.parent_id === n.id) fail(400, "자기 자신 아래에 둘 수 없어요.");
      const p = await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").bind(b.parent_id, user.id).first();
      if (!p) fail(404, "상위 노트를 찾을 수 없어요.");
      next.parent_id = p.id;
    }
  }
  next.updated_at = now();
  await env.DB.prepare("UPDATE notes SET title = ?, body = ?, shared = ?, parent_id = ?, updated_at = ? WHERE id = ?")
    .bind(next.title, next.body, next.shared, next.parent_id ?? null, next.updated_at, n.id).run();
  if (typeof b.body === "string") await indexNote(env, n.id, next.body);
  return json({ note: next });
});

// 그래프에서 클릭으로 연결: 본문 끝 "## 연결" 아래에 [[제목]] 한 줄을 적어요 (옵시디언처럼 노트 안에서도 보이게)
const LINK_HEAD = "## 연결";
function addLinkLine(text, title) {
  const t = text.replace(/\s+$/, "");
  const re = new RegExp("\\[\\[" + title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:[#|][^\\]]*)?\\]\\]", "i");
  if (re.test(t)) return null;
  // AI 구역은 맨 끝에 두는 규칙이라 그 앞에 끼워 넣어요
  const ai = t.indexOf("<!-- ai:start -->");
  const head = ai >= 0 ? t.slice(0, ai).replace(/\s+$/, "") : t, tail = ai >= 0 ? "\n\n" + t.slice(ai) : "";
  const idx = head.lastIndexOf("\n" + LINK_HEAD);
  const section = idx >= 0 || head.startsWith(LINK_HEAD);
  return (section ? head + "\n- [[" + title + "]]" : head + (head ? "\n\n" : "") + LINK_HEAD + "\n- [[" + title + "]]") + tail + "\n";
}
function removeLink(text, title) {
  const q = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = text.replace(new RegExp("^[ \\t]*[-*][ \\t]*\\[\\[" + q + "(?:[#|][^\\]]*)?\\]\\][ \\t]*\\n?", "gim"), "");
  out = out.replace(new RegExp("\\[\\[" + q + "(?:#[^\\]|]*)?(?:\\|([^\\]]+))?\\]\\]", "gi"), (_, label) => label || title);
  out = out.replace(new RegExp("(^|\\n)" + LINK_HEAD + "[ \\t]*\\n(?=\\s*(?:\\n|$|<!--))", ""), "$1"); // 빈 연결 절은 지워요
  return out.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "\n");
}
async function relink(env, n, text) {
  await env.DB.batch([
    env.DB.prepare("UPDATE notes SET body = ?, updated_at = ? WHERE id = ?").bind(text, now(), n.id),
    ...indexStmts(env, n.id, text),
  ]);
  return { ...n, body: text, updated_at: now() };
}
on("POST", "/notes/:id/link", async ({ req, env, user, params }) => {
  const n = await visibleNote(env, params.id, user);
  if (n.user_id !== user.id) fail(403, "다른 사람의 노트는 수정할 수 없어요.");
  const b = await body(req);
  const title = str(b.title, 120, "연결할 노트 제목");
  if (/[\[\]|#]/.test(title)) fail(400, "제목에는 [ ] | # 를 쓸 수 없어요.");
  if (title.toLowerCase() === n.title.toLowerCase()) fail(400, "자기 자신과는 연결할 수 없어요.");
  const text = addLinkLine(n.body || "", title);
  if (text === null) return json({ note: n, added: false });
  if (text.length > MAX_NOTE) fail(400, "노트가 너무 길어요.");
  return json({ note: await relink(env, n, text), added: true });
});
on("DELETE", "/notes/:id/link", async ({ env, user, params, q }) => {
  const n = await visibleNote(env, params.id, user);
  if (n.user_id !== user.id) fail(403, "다른 사람의 노트는 수정할 수 없어요.");
  const title = String(q.get("title") || "").trim();
  if (!title) fail(400, "끊을 연결의 제목을 알려 주세요.");
  const text = removeLink(n.body || "", title);
  if (text === n.body) return json({ note: n, removed: false });
  return json({ note: await relink(env, n, text), removed: true });
});

on("DELETE", "/notes/:id", async ({ env, user, params }) => {
  const r = await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(params.id, user.id).run();
  if (!r.meta.changes) fail(404, "노트를 찾을 수 없어요.");
  return json({ ok: true });
});

on("GET", "/graph", async ({ env, user }) => {
  const [nodes, edges] = await env.DB.batch([
    env.DB.prepare(`SELECT n.id, n.user_id, n.title, n.topic, n.parent_id, (SELECT group_concat(t.tag) FROM note_tags t WHERE t.note_id = n.id) AS tags FROM notes n WHERE ${VISIBLE}`).bind(user.id),
    env.DB.prepare(`SELECT l.src_id, l.dst_title FROM note_links l JOIN notes n ON n.id = l.src_id WHERE ${VISIBLE}`).bind(user.id),
  ]);
  return json({ nodes: nodes.results, edges: edges.results });
});

on("GET", "/tags", async ({ env, user }) => {
  const { results } = await env.DB.prepare(
    `SELECT t.tag, COUNT(*) AS count FROM note_tags t JOIN notes n ON n.id = t.note_id WHERE ${VISIBLE} GROUP BY t.tag COLLATE NOCASE ORDER BY count DESC, t.tag LIMIT 100`
  ).bind(user.id).all();
  return json({ tags: results });
});

on("GET", "/search", async ({ env, user, q }) => {
  const term = String(q.get("q") || "").trim().slice(0, 60);
  if (!term) return json({ notes: [], plans: [] });
  const like = "%" + term.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const [notes, plans] = await env.DB.batch([
    env.DB.prepare(
      `SELECT n.id, n.user_id, n.title, substr(n.body, max(1, instr(lower(n.body), lower(?3)) - 30), 110) AS snippet
       FROM notes n WHERE ${VISIBLE} AND (n.title LIKE ?2 ESCAPE '\\' OR n.body LIKE ?2 ESCAPE '\\')
       ORDER BY CASE WHEN n.title LIKE ?2 ESCAPE '\\' THEN 0 ELSE 1 END, n.updated_at DESC LIMIT 12`
    ).bind(user.id, like, term),
    env.DB.prepare("SELECT id, scope, period, text, done FROM plans WHERE user_id = ?1 AND text LIKE ?2 ESCAPE '\\' ORDER BY created_at DESC LIMIT 8")
      .bind(user.id, like),
  ]);
  return json({ notes: notes.results, plans: plans.results });
});

// ---------- 하루 기록: 그날 계획·실행을 얼려 둔 사본 (본인만) ----------
// 점수 공식은 public/js/util.js 의 dayScore 와 같아요: 계획 40 + 실행 60
// 하루 점수 (public/js/util.js 의 dayScore 와 같은 식): 계획 35 + 실행 65.
// 실행 = 끝낸 일의 무게 / 전체 무게. 무게 = 우선순위(low 1 · medium 2 · high 3 · xhigh 4 · max 5, 없으면 2) × 걸리는 시간(없으면 30분)
const PRIO_W = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
function scoreOf(plans, goal) {
  const planned = plans.reduce((a, p) => a + (p.mins || 0), 0);
  const doneMins = plans.filter((p) => p.done).reduce((a, p) => a + (p.mins || 0), 0);
  const count = plans.length, doneCount = plans.filter((p) => p.done).length;
  const plan = Math.min(1, (planned || count * 30) / Math.max(30, goal || 240));
  const w = (p) => (PRIO_W[p.priority] || 2) * (p.mins || 30);
  const all = plans.reduce((a, p) => a + w(p), 0), got = plans.filter((p) => p.done).reduce((a, p) => a + w(p), 0);
  const exec = all ? got / all : 0;
  return { planned, doneMins, count, doneCount, plan, exec, score: count ? Math.round(35 * plan + 65 * exec) : null };
}
async function snapshotDay(env, u, day, auto) {
  const [plans, logs] = await env.DB.batch([
    env.DB.prepare("SELECT text, done, missed, start, mins, priority, done_at FROM plans WHERE user_id = ? AND period = ? ORDER BY CASE WHEN start IS NULL THEN 1 ELSE 0 END, start, sort, created_at").bind(u.id, "D:" + day),
    env.DB.prepare("SELECT at, text, kind, mins FROM logs WHERE user_id = ? AND day = ? ORDER BY at, created_at").bind(u.id, day),
  ]);
  const P = plans.results, L = logs.results;
  if (!P.length && !L.length) return null;
  const sc = scoreOf(P, u.day_goal);
  const focus = L.filter((l) => l.kind === "focus").reduce((a, l) => a + (l.mins || 0), 0);
  const data = { plans: P.map((p) => ({ text: p.text, done: !!p.done, start: p.start, mins: p.mins, priority: p.priority || null })), logs: L, ...sc, focus, goal: u.day_goal };
  const at = now();
  await env.DB.prepare(
    "INSERT INTO day_records (user_id, day, data, score, done, total, auto, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET data = excluded.data, score = excluded.score, done = excluded.done, total = excluded.total, auto = excluded.auto, saved_at = excluded.saved_at"
  ).bind(u.id, day, JSON.stringify(data), sc.score, sc.doneCount, sc.count, auto ? 1 : 0, at).run();
  return { day, data, score: sc.score, done: sc.doneCount, total: sc.count, auto: auto ? 1 : 0, saved_at: at };
}
// 자정의 AI 채점: 그날 계획(우선순위·시간·끝냄)·집중 시간을 보고 0~100 점 + 한 줄 평. AI 가 안 되면 계산식 점수를 그대로 써요.
const PRIO_KO = { low: "5순위(여유)", medium: "4순위(나중에)", high: "3순위(보통)", xhigh: "2순위(중요)", max: "1순위(가장 급함)" };
async function aiScoreDay(env, u, day) {
  const r = await env.DB.prepare("SELECT data, score FROM day_records WHERE user_id = ? AND day = ?").bind(u.id, day).first();
  if (!r || r.data === "{}") return null;
  const d = JSON.parse(r.data);
  const lines = (d.plans || []).map((p) => `- [${p.done ? "x" : p.missed ? "못함" : " "}] ${p.start ? p.start + (p.mins ? `(${p.mins}분) ` : " ") : "(시간 없음) "}${p.text}${p.priority ? ` · 우선순위 ${PRIO_KO[p.priority]}` : ""}`).join("\n");
  let ai = null, note = "", model = null;
  try {
    const out = await aiJson(env,
      "너는 공부 앱의 하루 채점관이야. 하루 계획과 실행을 보고 0~100 점과 한국어 한 줄 평(40자 안팎, 다정하지만 솔직하게)을 줘. 우선순위가 높은 일(1순위·2순위·3순위)을 끝냈는지를 가장 크게 보고, 계획이 너무 적거나 비현실적이면 감점. 공부 시간도 반영.",
      `날짜: ${day}\n하루 목표 공부 시간: ${d.goal || 240}분\n집중 기록: ${d.focus || 0}분\n계산식 점수(참고): ${r.score ?? "없음"}\n계획:\n${lines || "(없음)"}\n\nJSON 으로만: {"score": 0~100 정수, "note": "한 줄 평"}`, u.ai_model || null);
    const v = Math.round(Number(out.data?.score));
    if (v >= 0 && v <= 100) { ai = v; note = String(out.data?.note || "").slice(0, 120); model = out.used || null; }
  } catch (e) { console.warn("AI 채점 실패", u.id, day, e.message); }
  if (ai === null) { if (r.score == null) return null; ai = r.score; note = "AI 가 바빠서 계산식 점수로 기록했어요."; model = "formula"; }
  await env.DB.prepare("UPDATE day_records SET ai_score = ?, ai_note = ?, ai_model = ? WHERE user_id = ? AND day = ?").bind(ai, note, model, u.id, day).run();
  return { ai_score: ai, ai_note: note, ai_model: model };
}
// 한국 시간 기준 날짜 (자정 자동 저장용)
const kstDay = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);
// 어제 기록이 아직 없으면 만들어 둬요 (크론이 못 돈 날을 위한 대비책)
async function ensureYesterday(env, u, ec = null) {
  const later = (p) => (ec ? ec.waitUntil(p.catch((e) => console.warn("AI 채점", e.message))) : p); // AI 채점은 뒤에서 (화면을 기다리게 하지 않게)
  const y = kstDay(-1);
  const has = await env.DB.prepare("SELECT 1 FROM day_records WHERE user_id = ? AND day = ? AND data != '{}'").bind(u.id, y).first(); // 내 점수만 적힌 빈 기록은 없는 것으로
  if (!has) { const s0 = await snapshotDay(env, u, y, true); if (s0) await later(aiScoreDay(env, u, y)); }
  else { const a = await env.DB.prepare("SELECT ai_score FROM day_records WHERE user_id = ? AND day = ?").bind(u.id, y).first(); if (a && a.ai_score == null) await later(aiScoreDay(env, u, y)); } // 크론이 못 돌았으면 여기서
}
export async function autoSaveYesterday(env) {
  const y = kstDay(-1);
  const { results } = await env.DB.prepare(
    "SELECT u.id, u.day_goal, u.ai_model FROM users u WHERE EXISTS (SELECT 1 FROM plans p WHERE p.user_id = u.id AND p.period = ?) OR EXISTS (SELECT 1 FROM logs l WHERE l.user_id = u.id AND l.day = ?)"
  ).bind("D:" + y, y).all();
  for (const u of results) { const s0 = await snapshotDay(env, u, y, true); if (s0) await aiScoreDay(env, u, y); }
  return { day: y, saved: results.length };
}

on("POST", "/records", async ({ req, env, user }) => {
  const b = await body(req);
  if (!DAY_RE.test(b.day || "")) fail(400, "날짜 형식이 올바르지 않아요.");
  const r = await snapshotDay(env, user, b.day, false);
  if (!r) fail(400, "그날은 저장할 계획이나 기록이 없어요.");
  return json({ record: r });
});
on("GET", "/records", async ({ env, q, user }) => {
  const day = q.get("day") || "";
  if (!DAY_RE.test(day)) fail(400, "날짜 형식이 올바르지 않아요.");
  const r = await env.DB.prepare("SELECT day, data, score, self, ai_score, ai_note, ai_model, done, total, auto, saved_at FROM day_records WHERE user_id = ? AND day = ?").bind(user.id, day).first();
  return json({ record: r ? { ...r, data: JSON.parse(r.data) } : null });
});
// 내가 매긴 하루 점수 (0~100, null 이면 지워요). 기록이 없던 날이면 빈 기록을 만들어 점수만 붙여요.
on("PUT", "/records/self", async ({ req, env, user }) => {
  const b = await body(req);
  if (!DAY_RE.test(b.day || "")) fail(400, "날짜 형식이 올바르지 않아요.");
  const v = b.self === null || b.self === "" ? null : Math.round(Number(b.self));
  if (v !== null && !(v >= 0 && v <= 100)) fail(400, "점수는 0~100 이에요.");
  await env.DB.prepare("INSERT INTO day_records (user_id, day, data, score, self, done, total, auto, saved_at) VALUES (?, ?, '{}', NULL, ?, 0, 0, 0, ?) ON CONFLICT(user_id, day) DO UPDATE SET self = excluded.self")
    .bind(user.id, b.day, v, now()).run();
  return json({ day: b.day, self: v });
});
// 최근 N일 점수 흐름 (자동 · 내 점수)
on("GET", "/records/recent", async ({ env, q, user, ec }) => {
  const to = DAY_RE.test(q.get("to") || "") ? q.get("to") : kstDay(0);
  const n = Math.min(60, Math.max(3, +q.get("days") || 14));
  const from = new Date(new Date(to + "T00:00:00Z").getTime() - (n - 1) * 864e5).toISOString().slice(0, 10);
  await ensureYesterday(env, user, ec);
  const { results } = await env.DB.prepare("SELECT day, score, ai_score, ai_note, done, total FROM day_records WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day").bind(user.id, from, to).all();
  return json({ from, to, days: results });
});
on("GET", "/records/days", async ({ env, q, user, ec }) => {
  const year = q.get("year") || "";
  if (!/^\d{4}$/.test(year)) fail(400, "연도를 알려 주세요.");
  await ensureYesterday(env, user, ec);
  const { results } = await env.DB.prepare("SELECT day, score, ai_score, done, total, auto FROM day_records WHERE user_id = ? AND day LIKE ? ORDER BY day").bind(user.id, year + "-%").all();
  return json({ days: results });
});

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
registerTogether(on, { json, body, fail, now, kstDay });
registerRoom(on, { json, body, fail, uid, now });
registerPush(on, { json, body, fail, uid, now });
registerLibrary(on, { json, body, fail, uid, now });

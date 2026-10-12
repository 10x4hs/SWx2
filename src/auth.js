// 로그인 · 세션 · 비밀번호 · 내 정보(/me) · 멤버 목록(/users). 이 파일은 worker.js 를 불러오지 않아요 (순환 방지)
import { isModel } from "./ai.js";
import { agentName } from "./oauth.js";
import { hex, sha256, b64url } from "./lib/crypto.js";
import { HttpError, fail, json, body, now, uid, str } from "./http.js";
import { match } from "./router.js";

const COLORS = ["#E8552B", "#4C6FFF", "#14A38B"]; // Golden Gate orange, bay blue, cypress green
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000; // Workers' WebCrypto maximum

// MCP 토큰 → { user, agent }. 직접 만든 토큰(api_tokens) 먼저, 아니면 OAuth 접근 토큰. 쓸 때마다 last_used_at 만 고쳐요
export async function tokenUser(env, token) {
  const h = await sha256(token), t = now();
  // 한 번에(왕복 1번): 직접 토큰 찾기 + 쓴 시각, OAuth 토큰 찾기 + (직접 토큰이 아니고 안 끝났으면) 쓴 시각
  const [api, , oa] = await env.DB.batch([
    env.DB.prepare("SELECT t.agent, u.id, u.username, u.display_name, u.color, u.day_goal FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?").bind(h),
    env.DB.prepare("UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?").bind(t, h),
    env.DB.prepare("SELECT t.access_expires, c.client_name, c.client_id, u.id, u.username, u.display_name, u.color, u.day_goal FROM oauth_tokens t JOIN oauth_clients c ON c.client_id = t.client_id JOIN users u ON u.id = t.user_id WHERE t.access_hash = ?").bind(h),
    env.DB.prepare("UPDATE oauth_tokens SET last_used_at = ?1 WHERE access_hash = ?2 AND access_expires >= ?1 AND NOT EXISTS (SELECT 1 FROM api_tokens WHERE token_hash = ?2)").bind(t, h),
  ]);
  const shape = (u, agent) => ({ agent, user: { id: u.id, username: u.username, display_name: u.display_name, color: u.color, day_goal: u.day_goal, must_change_pw: false } });
  const row = api.results[0], o = oa.results[0];
  if (row) return shape(row, row.agent);
  return o && o.access_expires >= t ? shape(o, agentName(o.client_name, o.client_id)) : null;
}
// OAuth 화면용: 앱에 이미 로그인돼 있으면 그 사람 (아니면 null)
export async function sessionUser(req, env) {
  try { return await requireUser(req, env); } catch { return null; }
}
// OAuth 화면용 로그인: 앱의 /auth/login 을 그대로 써요(잠금 · 비밀번호 규칙 같음). 성공하면 세션 쿠키도 같이
export async function loginWith(env, req, username, password) {
  const { r } = match("POST", "/auth/login"); // 로그인 라우트는 항상 있어요 (아래 registerAuth)
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

export const MUST_CHANGE_OPEN = (path) => path === "/me" || path === "/users" || path.startsWith("/auth/");

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
const sessionToken = (req) => (req.headers.get("cookie") || "").match(/(?:^|;\s*)trio_session=([A-Za-z0-9_-]+)/)?.[1] || null;
// 틀린 비밀번호 LOCK_TRIES 번이면 LOCK_MINUTES 분 잠가요 (잠기는 순간 횟수는 0 으로 돌아가요)
const LOCK_TRIES = 5, LOCK_MINUTES = 5;
const LOCKED_MSG = `여러 번 틀려서 잠시 잠겼어요. ${LOCK_MINUTES}분 뒤에 다시 시도해 주세요.`;
async function bumpFail(env, u) {
  const fails = u.fail_count + 1, lock = fails >= LOCK_TRIES;
  await env.DB.prepare("UPDATE users SET fail_count = ?, locked_until = ? WHERE id = ?").bind(lock ? 0 : fails, lock ? now() + LOCK_MINUTES * 60e3 : 0, u.id).run();
}
export async function requireUser(req, env) {
  const token = sessionToken(req);
  if (!token) fail(401, "로그인이 필요해요.");
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, u.display_name, u.color, u.day_goal, u.bio, u.avatar, u.status, u.plans_open, u.must_change_pw, u.ai_model, u.dock_order, u.hidden_pages, u.graph_prefs FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?"
  ).bind(await sha256(token), now()).first();
  if (!row) fail(401, "로그인이 만료됐어요. 다시 로그인해 주세요.");
  return { ...row, must_change_pw: mustChange(req, env, row) };
}
// must_change_pw 는 requireUser / login 에서 이미 true·false 로 바뀐 값이에요
// 활동 상태: 정해진 단어만 · coding 이면 쓰는 AI 도구(여럿)
const STATUSES = ["coding", "working", "studying", "reading", "resting", "sleeping", "away"], TOOLS = ["claude", "codex", "gemini"];
const readStatus = (raw) => { try { const o = typeof raw === "string" ? JSON.parse(raw) : raw; return o && STATUSES.includes(o.s) ? { s: o.s, tools: o.s === "coding" ? (o.tools || []).filter((t) => TOOLS.includes(t)) : [], at: o.at || null } : null; } catch { return null; } };
const publicUser = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, color: u.color, day_goal: u.day_goal, bio: u.bio || null, avatar: u.avatar || null, status: readStatus(u.status), plans_open: u.plans_open !== 0, must_change_pw: u.must_change_pw === true, ai_model: u.ai_model || null, dock_order: readList(u.dock_order), hidden_pages: readList(u.hidden_pages), graph_prefs: readObj(u.graph_prefs) }); // 본인에게만 (로그인 · /me)
function readObj(v) { try { const o = JSON.parse(v || "null"); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { return null; } }
function readList(v) { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } }

export function registerAuth(on) {
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
    if (u.locked_until > now()) fail(429, LOCKED_MSG);
    const { hash } = await hashPassword(String(b.password || ""), u.pw_salt);
    if (!safeEqual(hash, u.pw_hash)) {
      await bumpFail(env, u);
      fail(401, wrong);
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET fail_count = 0, locked_until = 0 WHERE id = ?").bind(u.id),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
    ]);
    return json({ user: publicUser({ ...u, must_change_pw: mustChange(req, env, u) }) }, 200, { "set-cookie": await startSession(req, env, u.id) });
  }, { auth: false });

  on("POST", "/auth/logout", async ({ req, env }) => {
    const token = sessionToken(req);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": cookie(req, "", 0) });
  }, { auth: false });

  // 내 비밀번호 바꾸기: 지금 비밀번호를 맞혀야 바뀌어요. 틀리면 로그인처럼 5번에 5분 잠김.
  // 바꾸면 다른 기기의 로그인은 모두 풀리고, 지금 이 기기만 남아요. 첫 로그인 표시(must_change_pw)도 여기서 꺼져요.
  on("POST", "/auth/password", async ({ req, env, user }) => {
    const b = await body(req);
    const u = await env.DB.prepare("SELECT id, pw_hash, pw_salt, fail_count, locked_until FROM users WHERE id = ?").bind(user.id).first();
    if (u.locked_until > now()) fail(429, LOCKED_MSG);
    if (typeof b.current !== "string" || !b.current) fail(400, "지금 비밀번호를 입력해 주세요.");
    if (typeof b.next !== "string" || b.next.length < 8) fail(400, "새 비밀번호는 8자 이상이어야 해요.");
    if (b.next.length > 200) fail(400, "새 비밀번호가 너무 길어요.");
    const { hash } = await hashPassword(b.current, u.pw_salt);
    if (!safeEqual(hash, u.pw_hash)) {
      await bumpFail(env, u);
      fail(403, "지금 비밀번호가 맞지 않아요.");
    }
    if (b.next === b.current) fail(400, "지금과 다른 비밀번호로 정해 주세요.");
    const next = await hashPassword(b.next);
    const keep = await sha256(sessionToken(req));
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
    // 그래프 설정: 작은 객체 하나 (4KB 까지)
    const graphPrefs = b.graph_prefs === undefined ? (user.graph_prefs ?? null) : b.graph_prefs === null ? null : b.graph_prefs && typeof b.graph_prefs === "object" && !Array.isArray(b.graph_prefs) && JSON.stringify(b.graph_prefs).length <= 4000 ? JSON.stringify(b.graph_prefs) : fail(400, "그래프 설정 모양이 아니에요.");
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
    await env.DB.prepare("UPDATE users SET display_name = ?, day_goal = ?, color = ?, bio = ?, avatar = ?, status = ?, plans_open = ?, ai_model = ?, dock_order = ?, hidden_pages = ?, graph_prefs = ? WHERE id = ?").bind(display, goal, color, bio, avatar, status ? JSON.stringify(status) : null, plans_open ? 1 : 0, aiModel, dockOrder, hiddenPages, graphPrefs, user.id).run();
    return json({ user: { ...publicUser(user), display_name: display, day_goal: goal, color, bio, avatar, status, plans_open, ai_model: aiModel, dock_order: readList(dockOrder), hidden_pages: readList(hiddenPages), graph_prefs: readObj(graphPrefs) } });
  });

  on("GET", "/users", async ({ env }) => {
    const { results } = await env.DB.prepare("SELECT id, username, display_name, color, day_goal, bio, avatar, status, plans_open FROM users ORDER BY created_at").all();
    return json({ users: results.map((u) => ({ ...u, status: readStatus(u.status), plans_open: u.plans_open !== 0 })) });
  });
}

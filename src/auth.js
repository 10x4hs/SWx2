// 로그인 · 세션 · 비밀번호 · 내 정보(/me) · 멤버 목록(/users). 이 파일은 worker.js 를 불러오지 않아요 (순환 방지)
import { isModel } from "./ai.js";
import { agentName } from "./oauth.js";
import { hex, sha256, b64url } from "./lib/crypto.js";
import { HttpError, fail, json, body, now, uid, str } from "./http.js";
import { match } from "./router.js";
import { PEERS } from "./teams.js";
import { pushUsers } from "./push.js";
import { AVATAR_V, avatarUrl } from "./avatar.js";

const COLORS = ["#E8552B", "#4C6FFF", "#14A38B"]; // Golden Gate orange, bay blue, cypress green
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000; // Workers' WebCrypto maximum

// 로그인한 사람 한 줄 — 세션(requireUser)과 토큰(tokenUser)이 같은 모양을 쓰게 (role · features · trial_until · must_change_pw 까지)
// ?2 = 지금 시각 (기간이 끝난 기능은 빼요)
const USER_COLS = `u.id, u.username, u.display_name, u.color, u.day_goal, u.bio, ${AVATAR_V("u.avatar")} AS avatar_v, u.status, u.plans_open, u.must_change_pw, u.ai_model, u.dock_order, u.dock_folders, u.hidden_pages, u.graph_prefs, u.diary_circle, u.role, u.state, u.last_seen_at, u.trial_until, (SELECT group_concat(feature) FROM user_features f WHERE f.user_id = u.id AND (f.expires_at IS NULL OR f.expires_at > ?2)) AS feature_list`; // 사진 본문(avatar)은 안 읽어요 — 버전만 (src/avatar.js)
const withFeatures = (row, mustChangePw) => {
  const { feature_list, agent, client_name, client_id, access_expires, ...u } = row;
  return { ...u, features: feature_list ? feature_list.split(",") : [], must_change_pw: mustChangePw };
};

// MCP 토큰 → { user, agent }. 직접 만든 토큰(api_tokens) 먼저, 아니면 OAuth 접근 토큰. 쓸 때마다 last_used_at 만 고쳐요
// user 는 세션 로그인과 같은 모양이라 기능 잠금 · AI 사용량 · 첫 비밀번호 검사(worker.js authorize)를 똑같이 받아요
const TOKEN_IDLE = 90 * 864e5; // 직접 만든 MCP 토큰은 90일 안 쓰면 더는 안 받아요 (잊힌 토큰이 새도 못 쓰게) — 다시 만들면 돼요
export async function tokenUser(env, token) {
  const h = await sha256(token), t = now();
  // 한 번에(왕복 1번): 직접 토큰 찾기 + 쓴 시각, OAuth 토큰 찾기 + (직접 토큰이 아니고 안 끝났으면) 쓴 시각
  const [api, , oa] = await env.DB.batch([
    env.DB.prepare(`SELECT t.agent, ${USER_COLS} FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?1 AND u.state = 'active' AND COALESCE(t.last_used_at, t.created_at) > ?3`).bind(h, t, t - TOKEN_IDLE),
    env.DB.prepare("UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?").bind(t, h),
    env.DB.prepare(`SELECT t.access_expires, c.client_name, c.client_id, ${USER_COLS} FROM oauth_tokens t JOIN oauth_clients c ON c.client_id = t.client_id JOIN users u ON u.id = t.user_id WHERE t.access_hash = ?1 AND u.state = 'active'`).bind(h, t),
    env.DB.prepare("UPDATE oauth_tokens SET last_used_at = ?1 WHERE access_hash = ?2 AND access_expires >= ?1 AND NOT EXISTS (SELECT 1 FROM api_tokens WHERE token_hash = ?2)").bind(t, h),
  ]);
  // 토큰에는 요청 헤더가 없어서 x-trio-strict 스위치는 없어요: 배포본(PASSWORDLESS 아님)이면 첫 비밀번호 표시를 그대로 따라요
  const shape = (u, agent) => ({ agent, user: withFeatures({ ...u, imp_by: null }, env.PASSWORDLESS !== "1" && Number(u.must_change_pw) === 1) });
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
    // 로그인 응답의 user 에는 기능 목록이 없어요 → 세션과 같은 모양으로 다시 읽어요 (OAuth 화면이 MCP 기능 잠금을 보게)
    const full = await env.DB.prepare(`SELECT ${USER_COLS} FROM users u WHERE u.id = ?1`).bind(d.user.id, now()).first();
    return { user: withFeatures(full, d.user.must_change_pw === true), cookie: res.headers.get("set-cookie") };
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message };
    throw e;
  }
}

export const MUST_CHANGE_OPEN = (path) => path === "/me" || path === "/users" || path.startsWith("/auth/");

export async function hashPassword(password, saltHex) {
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
// impBy: 관리자가 '이 회원으로 들어가기' 한 세션이면 그 관리자 id (하루만 유효)
export async function startSession(req, env, userId, impBy = null) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const days = impBy ? 1 : SESSION_DAYS;
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, imp_by) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, now() + days * 864e5, impBy).run();
  return cookie(req, token, days * 86400);
}
// 대신 들어가기 기록 (관리자 화면 #/admin): 시작 · 끝마다 한 줄 — 누가(admin) · 누구로(user) · 언제(at) · 어디서(ip = IP 해시 12글자, IP 그대로는 안 남겨요)
// 저장: 그 관리자의 user_app_state 한 줄(app = IMP_LOG — /apps API 의 APPS 표에 없어서 화면에서는 못 읽고 못 써요) = 배열, 최근 IMP_KEEP 줄. 새 표(마이그레이션) 없이
export const IMP_LOG = "imp_log", IMP_KEEP = 200;
export async function logImpersonation(env, req, kind, adminId, userId) {
  const ip = (await sha256("imp-ip:" + (req.headers.get("cf-connecting-ip") || "local"))).slice(0, 12), t = now();
  const row = JSON.stringify({ kind, at: t, admin: adminId, user: userId, ip });
  // 한 문장으로 덧붙이기 (동시에 와도 안 사라지게) · 가득 차면 가장 오래된 줄을 빼요
  await env.DB.prepare(`INSERT INTO user_app_state (user_id, app, data, updated_at) VALUES (?1, ?2, json_array(json(?3)), ?4)
    ON CONFLICT(user_id, app) DO UPDATE SET data = json_insert(CASE WHEN json_array_length(data) >= ?5 THEN json_remove(data, '$[0]') ELSE data END, '$[#]', json(?3)), updated_at = ?4`)
    .bind(adminId, IMP_LOG, row, t, IMP_KEEP).run();
}
export const sessionId = async (req) => { const t = sessionToken(req); return t ? sha256(t) : null; };
// 승인 대기 · 정지된 계정은 들어올 수 없어요
const STATE_MSG = { pending: "가입 승인을 기다리는 중이에요. 관리자 두 사람(HSK · GYK)이 모두 승인하면 들어올 수 있어요.", suspended: "정지된 계정이에요. 관리자에게 문의해 주세요." };
// 가입 승인 현황: 관리자마다 승인했는지 (승인 대기 본인 · 관리자 화면이 같이 써요)
export async function approvalStatus(env, userId) {
  const { results } = await env.DB.prepare("SELECT a.username AS admin, s.at FROM users a LEFT JOIN signup_approvals s ON s.admin_id = a.id AND s.user_id = ? WHERE a.role = 'admin' AND a.state = 'active' ORDER BY a.username").bind(userId).all();
  return results.map((r) => ({ admin: r.admin, approved: !!r.at, at: r.at || null }));
}
// 들어올 수 없는 계정이면 403. 승인 대기면 누가 승인했는지도 같이 (비밀번호를 맞힌 뒤에만 불러요)
const checkState = async (env, u) => {
  if (!u.state || u.state === "active") return;
  fail(403, STATE_MSG[u.state] || "들어올 수 없는 계정이에요.", { account_state: u.state, ...(u.state === "pending" ? { approvals: await approvalStatus(env, u.id) } : {}) });
};
// 비밀번호를 꼭 바꿔야 하는지. 아이디만으로 들어가는 로컬(PASSWORDLESS=1)에서는 묻지 않아요.
// 단, 요청에 "x-trio-strict: 1" 이 있으면 로컬에서도 배포본처럼 검사해요 (smoke 테스트용 — 더 엄격해지기만 하고 풀어 주는 일은 없어요)
const pwStrict = (req, env) => env.PASSWORDLESS !== "1" || req.headers.get("x-trio-strict") === "1";
const mustChange = (req, env, u) => pwStrict(req, env) && Number(u.must_change_pw) === 1;
const sessionToken = (req) => (req.headers.get("cookie") || "").match(/(?:^|;\s*)trio_session=([A-Za-z0-9_-]+)/)?.[1] || null;
// 틀린 비밀번호 LOCK_TRIES 번마다 잠가요: 5분 → 10분 → 20분 → 40분 → 60분(최대). 맞게 들어오면 횟수가 0 으로 돌아가요
// (전엔 늘 5분이라 계정 하나에 하루 1,440번까지 넣어 볼 수 있었어요. 최대를 1시간으로 둬서 남이 일부러 잠가도 오래 막히진 않아요)
const LOCK_TRIES = 5, LOCK_MINUTES = 5, LOCK_MAX_MINUTES = 60;
const LOCKED_MSG = "여러 번 틀려서 잠시 잠겼어요. 조금 뒤에 다시 시도해 주세요.";
async function bumpFail(env, u) {
  const fails = u.fail_count + 1, n = Math.floor(fails / LOCK_TRIES), lock = fails % LOCK_TRIES === 0;
  const mins = Math.min(LOCK_MAX_MINUTES, LOCK_MINUTES * 2 ** (n - 1));
  await env.DB.prepare("UPDATE users SET fail_count = ?, locked_until = ? WHERE id = ?").bind(fails, lock ? now() + mins * 60e3 : 0, u.id).run();
}
// 로그인 잠금은 (아이디, 접속 IP) 마다예요 — 남이 내 아이디로 일부러 틀려도 그 사람 IP 만 잠기고, 다른 IP 에서 맞는 비밀번호는 들어와요.
// (아이디가 영문 3글자라 누구나 맞혀 볼 수 있어서, 전엔 아무나 남의 계정을 계속 잠가 둘 수 있었어요.) 여러 IP 를 돌리는 시도는 ipLimit 이 IP 마다 1분 10번으로 막아요.
// 저장: user_app_state 한 줄(app = LOGIN_FAILS — /apps API 의 APPS 표에 없어서 화면에서는 못 읽고 못 써요) = { "<IP 해시>": { n, until, at } }. 새 표(마이그레이션) 없이.
const LOGIN_FAILS = "login_fails", FAIL_KEYS = 50, FAIL_FORGET = 24 * 3600e3;
const clientIp = (req) => req.headers.get("cf-connecting-ip") || "local";
const ipKey = async (ip) => (await sha256("login-ip:" + ip)).slice(0, 16);
async function loginFails(env, userId) {
  const r = await env.DB.prepare("SELECT data FROM user_app_state WHERE user_id = ? AND app = ?").bind(userId, LOGIN_FAILS).first();
  try { const o = JSON.parse(r?.data || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
async function saveLoginFails(env, userId, map) {
  const t = now();
  // 오래된(하루 넘게 조용한 · 잠금 끝난) IP 는 잊고, 많아도 최근 FAIL_KEYS 개만
  const keep = Object.entries(map).filter(([, v]) => v && (v.until > t || v.at > t - FAIL_FORGET)).sort((a, b) => b[1].at - a[1].at).slice(0, FAIL_KEYS);
  if (!keep.length) return env.DB.prepare("DELETE FROM user_app_state WHERE user_id = ? AND app = ?").bind(userId, LOGIN_FAILS).run();
  return env.DB.prepare("INSERT INTO user_app_state (user_id, app, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, app) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
    .bind(userId, LOGIN_FAILS, JSON.stringify(Object.fromEntries(keep)), t).run();
}
// 틀린 횟수 · 잠금은 bumpFail 과 같은 규칙(5번마다 5 → 10 → 20 → 40 → 60분)
function nextFail(prev) {
  const fails = (prev?.n || 0) + 1, n = Math.floor(fails / LOCK_TRIES), lock = fails % LOCK_TRIES === 0;
  return { n: fails, until: lock ? now() + Math.min(LOCK_MAX_MINUTES, LOCK_MINUTES * 2 ** (n - 1)) * 60e3 : 0, at: now() };
}
// IP 하나당 로그인 · 가입 시도 수 제한 (Cloudflare Rate Limiting 바인딩 · 없으면 그냥 통과 — 로컬 테스트)
async function ipLimit(req, env) {
  const ip = req.headers.get("cf-connecting-ip"); if (!ip || !env.LOGIN_RL || ip === "127.0.0.1" || ip === "::1") return; // 내 컴퓨터(로컬 테스트)는 빼요
  let ok = true; try { ok = (await env.LOGIN_RL.limit({ key: ip })).success; } catch {}
  if (!ok) fail(429, "시도가 너무 많아요. 1분 뒤에 다시 해 주세요.");
}
export async function requireUser(req, env) {
  const token = sessionToken(req);
  if (!token) fail(401, "로그인이 필요해요.");
  const row = await env.DB.prepare(
    `SELECT ${USER_COLS}, s.imp_by, (SELECT username FROM users a WHERE a.id = s.imp_by) AS imp_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?1 AND s.expires_at > ?2`
  ).bind(await sha256(token), now()).first();
  if (!row) fail(401, "로그인이 만료됐어요. 다시 로그인해 주세요.");
  if (row.state !== "active") fail(401, STATE_MSG[row.state] || "들어올 수 없는 계정이에요.");
  // 최근 접속: 5분에 한 번만 적어요 (관리자가 대신 들어간 건 안 적어요)
  if (!row.imp_by && !(row.last_seen_at > now() - 300e3)) await env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now(), row.id).run();
  return withFeatures(row, mustChange(req, env, row));
}
// must_change_pw 는 requireUser / login 에서 이미 true·false 로 바뀐 값이에요
// 활동 상태: 정해진 단어만 · coding 이면 쓰는 AI 도구(여럿)
const STATUSES = ["coding", "working", "studying", "reading", "resting", "sleeping", "away"], TOOLS = ["claude", "codex", "gemini"];
const readStatus = (raw) => { try { const o = typeof raw === "string" ? JSON.parse(raw) : raw; return o && STATUSES.includes(o.s) ? { s: o.s, tools: o.s === "coding" ? (o.tools || []).filter((t) => TOOLS.includes(t)) : [], at: o.at || null } : null; } catch { return null; } };
const publicUser = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, color: u.color, day_goal: u.day_goal, bio: u.bio || null, avatar: avatarUrl(u.id, u.avatar_v), status: readStatus(u.status), plans_open: u.plans_open !== 0, must_change_pw: u.must_change_pw === true, ai_model: u.ai_model || null, dock_order: readList(u.dock_order), dock_folders: readObj(u.dock_folders) || {}, hidden_pages: readList(u.hidden_pages), graph_prefs: readObj(u.graph_prefs), diary_circle: u.diary_circle === 1, role: u.role || "member", impersonated_by: u.imp_name || null, features: u.features || [], trial_until: u.trial_until > Date.now() ? u.trial_until : null }); // 본인에게만 (로그인 · /me)
function readObj(v) { try { const o = JSON.parse(v || "null"); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { return null; } }
const DOCK_KEY = /^(nav:[a-z-]{1,20}|page:[A-Za-z0-9-]{1,64})$/;
function folderMap(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(400, "Dock 폴더 모양이 아니에요.");
  const ids = Object.keys(v); if (ids.length > 20) fail(400, "Dock 폴더는 20개까지예요.");
  const seen = new Set(), out = {};
  for (const id of ids) {
    const f = v[id];
    if (!/^[a-z0-9]{1,12}$/.test(id) || !f || typeof f !== "object" || typeof f.name !== "string" || !Array.isArray(f.items) || !f.items.length || f.items.length > 30) fail(400, "Dock 폴더 모양이 아니에요.");
    const name = f.name.replace(/\s+/g, " ").trim();
    if (!name || [...name].length > 20) fail(400, "폴더 이름은 1~20자예요.");
    if (!f.items.every((k) => typeof k === "string" && DOCK_KEY.test(k) && !seen.has(k) && seen.add(k))) fail(400, "Dock 폴더 모양이 아니에요.");
    out[id] = { name, items: f.items };
  }
  return JSON.stringify(out);
}
function readList(v) { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } }

export function registerAuth(on) {
  // ---------- auth ----------
  // 가입 신청: 누구나. 만들어진 계정은 '승인 대기' — 관리자 모두(HSK · GYK)가 승인해야 로그인돼요 (src/admin.js)
  on("POST", "/auth/signup", async ({ req, env, ec }) => {
    await ipLimit(req, env);
    const b = await body(req);
    const username = str(b.username, 20, "아이디").toLowerCase();
    if (!/^[a-z]{3}$/.test(username)) fail(400, "아이디는 영문 3글자예요 (예: hsk). 이름 이니셜로 정해 주세요."); // 가입은 이니셜 3글자만 (스크립트로 만든 계정은 예외)
    if (typeof b.password !== "string" || b.password.length < 8) fail(400, "비밀번호는 8자 이상이어야 해요.");
    if (b.password.length > 200) fail(400, "비밀번호가 너무 길어요.");
    const display = b.display_name ? str(b.display_name, 12, "이름") : username.slice(0, 12);
    const { n, waiting } = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(state = 'pending') AS waiting FROM users").first();
    if ((waiting || 0) >= Number(env.MAX_PENDING || 30)) fail(429, "가입 신청이 밀려 있어요. 잠시 뒤에 다시 해 주세요.");
    if (await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first()) fail(409, "이미 있는 아이디예요.");
    // 추천한 친구 (선택): 지금 쓰고 있는 회원 아이디만 · 나 자신은 안 돼요 — 계정이 열리면 그 친구에게 체험 24시간 (src/admin.js)
    const ref = String(b.referrer || "").trim().toLowerCase();
    if (ref && (!/^[a-z]{3}$/.test(ref) || ref === username)) fail(400, "친구 아이디는 다른 사람의 영문 3글자 아이디예요.");
    const refId = ref ? (await env.DB.prepare("SELECT id FROM users WHERE username = ? AND state = 'active'").bind(ref).first())?.id || fail(400, "그 친구 아이디를 찾지 못했어요.") : null;
    const { hash, salt } = await hashPassword(b.password);
    const t = now();
    const newId = uid();
    await env.DB.prepare("INSERT INTO users (id, username, display_name, color, pw_hash, pw_salt, created_at, state, pw_changed_at, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
      .bind(newId, username, display, COLORS[n % COLORS.length], hash, salt, t, t, refId).run();
    // 관리자들에게 "가입 신청이 왔어요" 푸시 (내용은 서비스 워커가 /admin/pending 에서 읽어요)
    const admins = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' AND state = 'active'").all()).results.map((r) => r.id);
    pushUsers(env, ec, admins, { room: "signup" });
    return json({ pending: true, message: STATE_MSG.pending, approvals: await approvalStatus(env, newId) }, 201);
  }, { auth: false });

  on("POST", "/auth/login", async ({ req, env }) => {
    await ipLimit(req, env);
    const b = await body(req);
    const username = String(b.username || "").trim().toLowerCase();
    const u = await env.DB.prepare(`SELECT *, ${AVATAR_V()} AS avatar_v FROM users WHERE username = ?`).bind(username).first();
    // 아이디만으로 들어가기 (PASSWORDLESS=1): 세 사람만 쓰는 공간이라 비밀번호를 묻지 않아요 ("x-trio-strict: 1" 이면 로컬에서도 배포본처럼 — smoke 용)
    if (!pwStrict(req, env)) {
      if (!u) fail(401, "없는 아이디예요.");
      await checkState(env, u);
      return json({ user: publicUser({ ...u, must_change_pw: mustChange(req, env, u) }) }, 200, { "set-cookie": await startSession(req, env, u.id) });
    }
    if (!b.password) return json({ error: "비밀번호를 입력해 주세요.", need_password: true }, 401);
    const wrong = "아이디 또는 비밀번호가 맞지 않아요.";
    if (!u) { await hashPassword(String(b.password || "")); fail(401, wrong); } // same cost either way
    const [key, fails] = await Promise.all([ipKey(clientIp(req)), loginFails(env, u.id)]);
    if (fails[key]?.until > now()) fail(429, LOCKED_MSG);
    const { hash } = await hashPassword(String(b.password || ""), u.pw_salt);
    if (!safeEqual(hash, u.pw_hash)) {
      await saveLoginFails(env, u.id, { ...fails, [key]: nextFail(fails[key]) });
      fail(401, wrong);
    }
    await checkState(env, u);
    delete fails[key];
    await Promise.all([saveLoginFails(env, u.id, fails), env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()).run()]);
    return json({ user: publicUser({ ...u, must_change_pw: mustChange(req, env, u) }) }, 200, { "set-cookie": await startSession(req, env, u.id) });
  }, { auth: false });

  on("POST", "/auth/logout", async ({ req, env }) => {
    const token = sessionToken(req);
    const gone = token ? await env.DB.prepare("DELETE FROM sessions WHERE id = ? RETURNING user_id, imp_by").bind(await sha256(token)).first() : null;
    if (gone?.imp_by) await logImpersonation(env, req, "end", gone.imp_by, gone.user_id); // 대신 들어간 채로 로그아웃 = 끝
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
      env.DB.prepare("UPDATE users SET pw_hash = ?, pw_salt = ?, fail_count = 0, locked_until = 0, must_change_pw = 0, pw_changed_at = ? WHERE id = ?").bind(next.hash, next.salt, now(), u.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(u.id, keep),
      env.DB.prepare("DELETE FROM oauth_tokens WHERE user_id = ?").bind(u.id), // 비밀번호를 바꾸면 OAuth 로 붙은 AI 연결도 다시 로그인
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
    const dockOrder = b.dock_order === undefined ? (user.dock_order ?? null) : b.dock_order === null ? null : list(b.dock_order, /^(nav:[a-z-]{1,20}|page:[A-Za-z0-9-]{1,64}|folder:[a-z0-9]{1,12})$/, 120, "Dock 순서");
    // Dock 폴더: { id: { name, items } } — 20개 · 폴더마다 30개 · 이름 20자까지. 한 아이콘은 한 폴더에만
    const dockFolders = b.dock_folders === undefined ? (user.dock_folders ?? null) : b.dock_folders === null ? null : folderMap(b.dock_folders);
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
    let avatar = null; // 보낸 게 없으면(undefined) 사진은 그대로 두고 건드리지 않아요
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
    const saved = await env.DB.prepare(`UPDATE users SET display_name = ?, day_goal = ?, color = ?, bio = ?, avatar = CASE WHEN ? THEN ? ELSE avatar END, status = ?, plans_open = ?, ai_model = ?, dock_order = ?, dock_folders = ?, hidden_pages = ?, graph_prefs = ? WHERE id = ? RETURNING ${AVATAR_V()} AS avatar_v`).bind(display, goal, color, bio, b.avatar !== undefined ? 1 : 0, avatar, status ? JSON.stringify(status) : null, plans_open ? 1 : 0, aiModel, dockOrder, dockFolders, hiddenPages, graphPrefs, user.id).first();
    return json({ user: { ...publicUser(user), display_name: display, day_goal: goal, color, bio, avatar: avatarUrl(user.id, saved?.avatar_v), status, plans_open, ai_model: aiModel, dock_order: readList(dockOrder), dock_folders: readObj(dockFolders) || {}, hidden_pages: readList(hiddenPages), graph_prefs: readObj(graphPrefs) } });
  });

  // 같은 팀 사람(나 포함)만
  on("GET", "/users", async ({ env, user }) => {
    const { results } = await env.DB.prepare(`SELECT id, username, display_name, color, day_goal, bio, ${AVATAR_V()} AS avatar_v, status, plans_open FROM users WHERE state = 'active' AND id IN ${PEERS("?")} ORDER BY created_at`).bind(user.id).all();
    return json({ users: results.map(({ avatar_v, ...u }) => ({ ...u, avatar: avatarUrl(u.id, avatar_v), status: readStatus(u.status), plans_open: u.plans_open !== 0 })) });
  });
}

// 개인 API 키 (프로필 메뉴 → 페이지 API · 개인 키) + 바깥 사이트용 읽기 전용 REST (/api/v1/*)
// - 키 만들기 · 목록 · 지우기: 앱 로그인(쿠키)으로 /api/apikeys. 사람마다 5개까지, 키는 만들 때 한 번만 보여요 (서버엔 sha256 만)
// - /api/v1: Authorization: Bearer <키> 만 봐요. 쿠키로는 안 열리고, 키로는 보통 /api 를 못 써요 (worker.js 가 /api/v1 을 먼저 따로 보내요)
// - 어느 사이트에서나 부를 수 있게 CORS * (쿠키 없음) · GET 만 · 키마다 분당 60번
import { sha256, b64url } from "./lib/crypto.js";
import { fail, json, body, now, uid, str } from "./http.js";

const MAX_KEYS = 5, PER_MIN = 60, USED_EVERY = 5 * 60e3; // last_used_at 은 5분에 한 번만 고쳐요
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "86400" };
const out = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra } });
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const planOut = (p) => ({ id: p.id, date: p.period.slice(2), text: p.text, start: p.start || null, mins: p.mins ?? null, done: !!p.done, missed: !!p.missed, priority: p.priority || null, focus_mins: p.focus_mins || 0 });

export function registerApiKeys(on) {
  on("GET", "/apikeys", async ({ env, url, user }) => {
    const { results } = await env.DB.prepare("SELECT id, name, prefix, created_at, last_used_at FROM user_api_keys WHERE user_id = ? ORDER BY created_at").bind(user.id).all();
    return json({ keys: results, max: MAX_KEYS, base: new URL("/api/v1", url.origin).toString() });
  });
  on("POST", "/apikeys", async ({ req, env, url, user }) => {
    const b = await body(req);
    const name = str(b.name, 30, "키 이름");
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_api_keys WHERE user_id = ?").bind(user.id).first();
    if (n >= MAX_KEYS) fail(400, `키는 ${MAX_KEYS}개까지예요. 안 쓰는 키를 지우고 만들어 주세요.`);
    const key = "swx2_" + b64url(crypto.getRandomValues(new Uint8Array(24)));
    const row = { id: uid(), name, prefix: key.slice(0, 10), created_at: now(), last_used_at: null };
    await env.DB.prepare("INSERT INTO user_api_keys (id, user_id, name, key_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(row.id, user.id, name, await sha256(key), row.prefix, row.created_at).run();
    return json({ key: row, secret: key, base: new URL("/api/v1", url.origin).toString() }, 201);
  });
  on("DELETE", "/apikeys/:id", async ({ env, user, params }) => {
    const r = await env.DB.prepare("DELETE FROM user_api_keys WHERE id = ? AND user_id = ?").bind(params.id, user.id).run();
    if (!r.meta.changes) fail(404, "그 키를 찾지 못했어요.");
    return json({ ok: true });
  });
}

// 키 → 사람. 한 번 왕복: 분 단위 요청 수 올리기(+ 5분에 한 번 last_used_at) 와 사람 찾기
async function keyUser(env, req) {
  const key = /^Bearer\s+(swx2_[A-Za-z0-9_-]{20,64})$/.exec(req.headers.get("authorization") || "")?.[1];
  if (!key) return { err: out({ error: "Authorization: Bearer <개인 API 키> 가 필요해요." }, 401) };
  const h = await sha256(key), t = now(), win = Math.floor(t / 60e3);
  const [up, who] = await env.DB.batch([
    env.DB.prepare("UPDATE user_api_keys SET n = CASE WHEN win = ?1 THEN n + 1 ELSE 1 END, win = ?1, last_used_at = CASE WHEN last_used_at IS NULL OR last_used_at < ?2 THEN ?3 ELSE last_used_at END WHERE key_hash = ?4 RETURNING n").bind(win, t - USED_EVERY, t, h),
    env.DB.prepare("SELECT u.id, u.username, u.display_name, u.color, u.state FROM user_api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ?").bind(h),
  ]);
  const u = who.results[0];
  if (!u || u.state !== "active") return { err: out({ error: "키가 맞지 않거나 지워졌어요." }, 401) };
  if ((up.results[0]?.n || 0) > PER_MIN) return { err: out({ error: `키마다 1분에 ${PER_MIN}번까지예요. 잠시 뒤에 다시 불러 주세요.` }, 429, { "retry-after": String(60 - Math.floor((t / 1000) % 60)) }) };
  return { user: u };
}

const dayPlans = (env, userId, from, to) => env.DB.prepare(
  `SELECT plans.*, (SELECT COALESCE(SUM(l.mins), 0) FROM logs l WHERE l.plan_id = plans.id AND l.kind = 'focus') AS focus_mins
   FROM plans WHERE user_id = ? AND scope = 'day' AND period >= ? AND period <= ? ORDER BY period, CASE WHEN start IS NULL THEN 1 ELSE 0 END, start, sort, created_at`
).bind(userId, "D:" + from, "D:" + to).all().then((r) => r.results.map(planOut));

// GET /api/v1/me → { user:{id,username,display_name,color} }
// GET /api/v1/plans/today → { date, plans:[{id,date,text,start,mins,done,missed,priority,focus_mins}] } (한국 날짜)
// GET /api/v1/plans?from=YYYY-MM-DD&to=YYYY-MM-DD → { from, to, plans:[…] } (하루 계획만, 62일까지)
export async function handleV1(req, env, url) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return out({ error: "읽기(GET)만 돼요." }, 405, { allow: "GET, OPTIONS" });
  try {
    const path = url.pathname.slice(7).replace(/\/+$/, ""); // "/api/v1" 뺀 나머지
    if (!["/me", "/plans/today", "/plans"].includes(path)) return out({ error: "없는 주소예요. GET /api/v1/me · /api/v1/plans/today · /api/v1/plans?from=&to=" }, 404);
    const { user, err } = await keyUser(env, req);
    if (err) return err;
    if (path === "/me") return out({ user: { id: user.id, username: user.username, display_name: user.display_name, color: user.color } });
    if (path === "/plans/today") { const d = kstDay(); return out({ date: d, plans: await dayPlans(env, user.id, d, d) }); }
    const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || from;
    if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) return out({ error: "from · to 는 YYYY-MM-DD 예요 (from ≤ to)." }, 400);
    if ((Date.parse(to) - Date.parse(from)) / 864e5 > 62) return out({ error: "한 번에 62일까지만 볼 수 있어요." }, 400);
    return out({ from, to, plans: await dayPlans(env, user.id, from, to) });
  } catch (e) {
    console.error("v1", e);
    return out({ error: "서버에서 문제가 생겼어요." }, 500);
  }
}

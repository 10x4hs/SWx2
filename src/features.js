// 기능 잠금: 관리자(role = 'admin')는 다 쓰고, 다른 사람은 일기 · 대화방(+창고) · 계획(홈 · 캘린더) · Second Brain(내 노트)을 기본으로 써요.
// 나머지 기능은 '사용 신청' → 관리자 모두(HSK · GYK)가 승인하면 그 기능만 열려요 (user_features). 화면은 public/js/features.js 가 같은 목록으로 자물쇠를 그려요.
// 관리자가 '시간 추가'로 전체 체험(trial_until)이나 기능 하나(user_features.expires_at)를 몇 시간 · 며칠 늘려 줄 수도 있어요.
import { fail, json, body, now, uid } from "./http.js";
import { pushUsers } from "./push.js";
import { postRoomMessage, helpRoom } from "./room.js";

export const DEMO_IDS = ["dmo"]; // 데모 아이디는 관리자 한 명 승인으로 바로 — 가입 · 신청 흐름 확인용 (확인이 끝나면 빼요)
// 한국 시각 "10/23 14:00"
export const kst = (t) => { const d = new Date(t + 9 * 3600e3), p = (n) => String(n).padStart(2, "0"); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
// 그 회원의 관리자 문의방에 시스템 한 줄 + 푸시
export async function tellUser(env, ec, userId, text) {
  await postRoomMessage(env, { id: uid(), room: helpRoom(userId), user_id: null, kind: "system", body: text, created_at: now() });
  pushUsers(env, ec, [userId], { room: "help" });
}

export const FEATURES = {
  study: "공부 (영어 · 논문 · AI 공부책)",
  ai: "AI",
  biz: "경영 마이크로디그리",
  dev: "SW (개발 흐름 · Vector & Graph)",
  pages: "내 페이지 (Dock)",
  mcp: "MCP 연결 (AI 에이전트)",
  news: "뉴스",
  cim: "CIM (투자자산운용사)",
};
// 서버 주소 → 기능 (없으면 누구나)
const MAP = [
  [/^\/(?:english|papers|books)(?:\/|$)/, "study"],
  [/^\/news(?:\/|$)/, "news"],
  [/^\/mba\/(?:state|read|review|day|done|ask)$/, "biz"], // 경영 과정 기록 · 튜터 (내용 파일 /mba/*.json 은 정적이라 여기 안 와요)
  [/^\/(?:dev|vg|onto|aip)\/(?:state|read|review|day|done|ask)$/, "dev"], // SW 공간의 과정 기록 · 튜터 (내용 파일 /dev · /vg · /onto · /aip *.json 은 정적이라 여기 안 와요)
  [/^\/ai\/(?!(?:command|plan|models)$)/, "ai"], [/^\/review\/week\/ai$/, "ai"], // 계획 짤 때 쓰는 AI(시키기 · 계획 짜기 · 모델 목록)는 누구나 — AI 탭(대화 · 노트 정리 · 페이지 만들기)만 잠겨요

  [/^\/(?:pages|site-meta|proxy-token)(?:\/|$)/, "pages"],
  [/^\/mcp\/tokens/, "mcp"],
  [/^\/apps\/cim\//, "cim"], // CIM 기록 · AI 튜터 (내용 파일 /cim/*.json 은 정적이라 여기 안 와요)
];
export const featureOf = (path) => MAP.find(([re]) => re.test(path))?.[1] || null;
export const TRIAL_MS = 24 * 3600e3; // 무료체험 24시간 (계정이 열리는 순간부터)
export const inTrial = (user) => (user.trial_until || 0) > Date.now();
export const canUse = (user, f) => !f || user.role === "admin" || inTrial(user) || (user.features || []).includes(f);
// route() 에서: 잠긴 기능이면 403 (Dock 의 페이지 목록만은 빈 목록으로 — 화면이 깨지지 않게)
export function gate(method, path, user) {
  const f = featureOf(path);
  if (canUse(user, f)) return null;
  if (method === "GET" && path === "/pages") return json({ pages: [] });
  fail(403, `'${FEATURES[f]}' 은(는) 잠겨 있어요. 사용 신청을 하면 관리자가 열어 줘요.`, { locked: f });
}

// 계속 열기 (시간 제한이 있던 것도 계속으로)
const grant = (env, userId, f, by) => env.DB.prepare("INSERT INTO user_features (user_id, feature, granted_by, at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, feature) DO UPDATE SET expires_at = NULL").bind(userId, f, by, now()).run();

export function registerFeatures(on) {
  // 내 기능: 열린 것 · 신청 중인 것
  on("GET", "/features", async ({ env, user }) => {
    const { results } = await env.DB.prepare("SELECT feature FROM feature_requests WHERE user_id = ? AND status = 'pending'").bind(user.id).all();
    const ex = (await env.DB.prepare("SELECT feature, expires_at FROM user_features WHERE user_id = ? AND expires_at > ?").bind(user.id, now()).all()).results;
    return json({ all: FEATURES, open: user.role === "admin" || inTrial(user) ? Object.keys(FEATURES) : user.features || [], pending: results.map((r) => r.feature), trial_until: inTrial(user) ? user.trial_until : null, expires: Object.fromEntries(ex.map((r) => [r.feature, r.expires_at])) });
  });
  on("POST", "/features/request", async ({ req, env, user, ec }) => {
    const b = await body(req);
    const f = String(b.feature || "");
    if (!FEATURES[f]) fail(400, "없는 기능이에요.");
    if (canUse(user, f)) return json({ ok: true, open: true });
    if (await env.DB.prepare("SELECT 1 FROM feature_requests WHERE user_id = ? AND feature = ? AND status = 'pending'").bind(user.id, f).first()) return json({ ok: true, pending: true });
    const note = String(b.note || "").trim().slice(0, 200) || null;
    await env.DB.prepare("INSERT INTO feature_requests (id, user_id, feature, note, created_at) VALUES (?, ?, ?, ?, ?)").bind(uid(), user.id, f, note, now()).run();
    const admins = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' AND state = 'active'").all()).results.map((r) => r.id);
    pushUsers(env, ec, admins, { room: "feature" });
    return json({ ok: true, pending: true }, 201);
  });

  const needAdmin = (user) => { if (user.role !== "admin" || user.imp_by) fail(403, "관리자만 쓸 수 있어요."); };
  on("GET", "/admin/feature-requests", async ({ env, user }) => {
    needAdmin(user);
    const [rq, gr, ap, ad] = await env.DB.batch([
      env.DB.prepare("SELECT r.id, r.feature, r.note, r.created_at, u.id AS user_id, u.username, u.display_name FROM feature_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' ORDER BY r.created_at"),
      env.DB.prepare("SELECT f.user_id, f.feature, f.expires_at FROM user_features f WHERE f.expires_at IS NULL OR f.expires_at > ?").bind(now()),
      env.DB.prepare("SELECT p.request_id, u.username, p.at FROM feature_request_approvals p JOIN users u ON u.id = p.admin_id JOIN feature_requests r ON r.id = p.request_id WHERE r.status = 'pending'"),
      env.DB.prepare("SELECT username FROM users WHERE role = 'admin' ORDER BY username"),
    ]);
    const by = {}, at = {};
    for (const a of ap.results) { (by[a.request_id] ||= []).push(a.username); (at[a.request_id] ||= {})[a.username] = a.at; }
    return json({ all: FEATURES, admins: ad.results.map((a) => a.username), requests: rq.results.map((r) => ({ ...r, approvals: by[r.id] || [], approval_at: at[r.id] || {} })), granted: gr.results });
  });
  on("POST", "/admin/feature-requests/:id/:act", async ({ env, user, params }) => {
    needAdmin(user);
    if (!["approve", "deny"].includes(params.act)) fail(404, "없는 주소예요.");
    const r = await env.DB.prepare("SELECT r.*, u.username FROM feature_requests r JOIN users u ON u.id = r.user_id WHERE r.id = ? AND r.status = 'pending'").bind(params.id).first();
    if (!r) fail(404, "이미 처리된 신청이에요.");
    const t = now();
    // 거절은 관리자 한 명이면 끝
    if (params.act === "deny") { await env.DB.prepare("UPDATE feature_requests SET status = 'denied', decided_by = ?, decided_at = ? WHERE id = ?").bind(user.id, t, r.id).run(); return json({ ok: true, granted: false }); }
    // 승인: 관리자마다 한 번씩 → 관리자 모두가 승인한 순간 열려요 (가입 승인과 같은 규칙 · 데모 아이디는 한 명으로)
    await env.DB.prepare("INSERT OR IGNORE INTO feature_request_approvals (request_id, admin_id, at) VALUES (?, ?, ?)").bind(r.id, user.id, t).run();
    const u = await env.DB.prepare(
      "UPDATE feature_requests SET status = 'approved', decided_by = ?3, decided_at = ?4 WHERE id = ?1 AND status = 'pending' AND (?2 OR NOT EXISTS (SELECT 1 FROM users a WHERE a.role = 'admin' AND NOT EXISTS (SELECT 1 FROM feature_request_approvals p WHERE p.request_id = ?1 AND p.admin_id = a.id)))"
    ).bind(r.id, DEMO_IDS.includes(r.username) ? 1 : 0, user.id, t).run();
    const granted = (u.meta.changes || 0) > 0;
    if (granted) await grant(env, r.user_id, r.feature, user.id);
    else { const others = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' AND state = 'active' AND id != ?").bind(user.id).all()).results.map((x) => x.id); pushUsers(env, null, others, { room: "feature" }); }
    return json({ ok: true, granted });
  });
  // 관리자가 직접 열기 · 닫기
  on("PUT", "/admin/users/:id/features/:f", async ({ env, user, params }) => {
    needAdmin(user);
    if (!FEATURES[params.f]) fail(400, "없는 기능이에요.");
    await grant(env, params.id, params.f, user.id);
    return json({ ok: true });
  });
  // 시간 추가 · 빼기: scope 'all' = 전체 Dock 체험(trial_until), 기능 키 = 그 기능만(expires_at). hours 가 음수면 빼요 (잘못 늘렸을 때)
  //   늘리기는 지금이나 남은 끝 시각 중 늦은 쪽에서, 빼기는 남은 끝 시각에서 — 지금보다 앞이 되면 바로 끝(잠김)
  on("POST", "/admin/users/:id/time", async ({ req, env, user, params, ec }) => {
    needAdmin(user);
    const b = await body(req), scope = String(b.scope || ""), hours = Number(b.hours);
    if (![24, 72, 168].includes(Math.abs(hours))) fail(400, "24 · 72 · 168시간 (빼기는 앞에 −) 중에서 골라 주세요.");
    if (scope !== "all" && !FEATURES[scope]) fail(400, "없는 기능이에요.");
    const u = await env.DB.prepare("SELECT id, role, state, trial_until FROM users WHERE id = ?").bind(params.id).first() || fail(404, "없는 회원이에요.");
    if (u.role === "admin") fail(400, "관리자는 이미 전부 열려 있어요.");
    const t = now(), add = hours * 3600e3, sub = hours < 0, name = scope === "all" ? "전체 Dock" : FEATURES[scope];
    let until;
    if (scope === "all") {
      if (sub && !((u.trial_until || 0) > t)) return json({ ok: true, none: true, message: "남은 체험 시간이 없어요." });
      until = sub ? u.trial_until + add : Math.max(t, u.trial_until || 0) + add;
      await env.DB.prepare("UPDATE users SET trial_until = ? WHERE id = ?").bind(until > t ? until : null, u.id).run();
    } else {
      const g = await env.DB.prepare("SELECT expires_at FROM user_features WHERE user_id = ? AND feature = ?").bind(u.id, scope).first();
      if (g && g.expires_at == null) return json({ ok: true, permanent: true, message: `'${FEATURES[scope]}' 은(는) 계속 열려 있어요${sub ? " — 닫으려면 기능 칩을 눌러 주세요." : "."}` });
      if (sub && !(g?.expires_at > t)) return json({ ok: true, none: true, message: `'${FEATURES[scope]}' 은(는) 남은 시간이 없어요.` });
      until = sub ? g.expires_at + add : Math.max(t, g?.expires_at || 0) + add;
      if (until > t) await env.DB.prepare("INSERT INTO user_features (user_id, feature, granted_by, at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, feature) DO UPDATE SET expires_at = excluded.expires_at, granted_by = excluded.granted_by").bind(u.id, scope, user.id, t, until).run();
      else await env.DB.prepare("DELETE FROM user_features WHERE user_id = ? AND feature = ?").bind(u.id, scope).run();
    }
    const h = Math.abs(hours), len = h === 24 ? "24시간" : h / 24 + "일";
    await tellUser(env, ec, u.id, sub ? `관리자가 ${name} 사용 시간을 ${len} 줄였어요 · ${until > t ? kst(until) + "까지" : "지금 끝났어요"}` : `관리자가 ${name} 사용 시간을 ${len} 늘려 줬어요 · ${kst(until)}까지`);
    return json({ ok: true, until: until > t ? until : null });
  });
  on("DELETE", "/admin/users/:id/features/:f", async ({ env, user, params }) => {
    needAdmin(user);
    await env.DB.prepare("DELETE FROM user_features WHERE user_id = ? AND feature = ?").bind(params.id, params.f).run();
    return json({ ok: true });
  });
}

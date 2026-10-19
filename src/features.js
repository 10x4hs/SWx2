// 기능 잠금: 관리자(role = 'admin')는 다 쓰고, 다른 사람은 뉴스 · 대화방(+창고) · 계획(홈 · 캘린더)만 기본으로 써요.
// 나머지 기능은 '사용 신청' → 관리자 한 명이 승인하면 그 기능만 열려요 (user_features). 화면은 public/js/features.js 가 같은 목록으로 자물쇠를 그려요.
import { fail, json, body, now, uid } from "./http.js";
import { pushUsers } from "./push.js";

export const FEATURES = {
  brain: "Brain · 노트",
  study: "공부 (영어 · 논문 · AI 공부책)",
  diary: "일기",
  ai: "AI",
  biz: "경영 마이크로디그리",
  dev: "SW (개발 흐름 · Vector & Graph)",
  pages: "내 페이지 (Dock)",
  mcp: "MCP 연결 (AI 에이전트)",
};
// 서버 주소 → 기능 (없으면 누구나)
const MAP = [
  [/^\/(?:notes|graph|search|tags|embed-check)(?:\/|$)/, "brain"],
  [/^\/(?:english|papers|books)(?:\/|$)/, "study"],
  [/^\/diary(?:\/|$)/, "diary"],
  [/^\/mba\/(?:state|read|review|day|done|ask)$/, "biz"], // 경영 과정 기록 · 튜터 (내용 파일 /mba/*.json 은 정적이라 여기 안 와요)
  [/^\/(?:dev|vg)\/(?:state|read|review|day|done|ask)$/, "dev"], // SW 공간의 과정 기록 · 튜터 (내용 파일 /dev/*.json · /vg/*.json 은 정적이라 여기 안 와요)
  [/^\/ai\//, "ai"], [/^\/review\/week\/ai$/, "ai"],
  [/^\/(?:pages|site-meta|proxy-token)(?:\/|$)/, "pages"],
  [/^\/mcp\/tokens/, "mcp"],
];
export const featureOf = (path) => MAP.find(([re]) => re.test(path))?.[1] || null;
export const canUse = (user, f) => !f || user.role === "admin" || (user.features || []).includes(f);
// route() 에서: 잠긴 기능이면 403 (Dock 의 페이지 목록만은 빈 목록으로 — 화면이 깨지지 않게)
export function gate(method, path, user) {
  const f = featureOf(path);
  if (canUse(user, f)) return null;
  if (method === "GET" && path === "/pages") return json({ pages: [] });
  fail(403, `'${FEATURES[f]}' 은(는) 잠겨 있어요. 사용 신청을 하면 관리자가 열어 줘요.`, { locked: f });
}

export function registerFeatures(on) {
  // 내 기능: 열린 것 · 신청 중인 것
  on("GET", "/features", async ({ env, user }) => {
    const { results } = await env.DB.prepare("SELECT feature FROM feature_requests WHERE user_id = ? AND status = 'pending'").bind(user.id).all();
    return json({ all: FEATURES, open: user.role === "admin" ? Object.keys(FEATURES) : user.features || [], pending: results.map((r) => r.feature) });
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
    const [rq, gr] = await env.DB.batch([
      env.DB.prepare("SELECT r.id, r.feature, r.note, r.created_at, u.id AS user_id, u.username, u.display_name FROM feature_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' ORDER BY r.created_at"),
      env.DB.prepare("SELECT f.user_id, f.feature FROM user_features f"),
    ]);
    return json({ all: FEATURES, requests: rq.results, granted: gr.results });
  });
  on("POST", "/admin/feature-requests/:id/:act", async ({ env, user, params }) => {
    needAdmin(user);
    if (!["approve", "deny"].includes(params.act)) fail(404, "없는 주소예요.");
    const r = await env.DB.prepare("SELECT * FROM feature_requests WHERE id = ? AND status = 'pending'").bind(params.id).first();
    if (!r) fail(404, "이미 처리된 신청이에요.");
    const t = now(), ok = params.act === "approve";
    await env.DB.batch([
      env.DB.prepare("UPDATE feature_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?").bind(ok ? "approved" : "denied", user.id, t, r.id),
      ...(ok ? [env.DB.prepare("INSERT OR IGNORE INTO user_features (user_id, feature, granted_by, at) VALUES (?, ?, ?, ?)").bind(r.user_id, r.feature, user.id, t)] : []),
    ]);
    return json({ ok: true });
  });
  // 관리자가 직접 열기 · 닫기
  on("PUT", "/admin/users/:id/features/:f", async ({ env, user, params }) => {
    needAdmin(user);
    if (!FEATURES[params.f]) fail(400, "없는 기능이에요.");
    await env.DB.prepare("INSERT OR IGNORE INTO user_features (user_id, feature, granted_by, at) VALUES (?, ?, ?, ?)").bind(params.id, params.f, user.id, now()).run();
    return json({ ok: true });
  });
  on("DELETE", "/admin/users/:id/features/:f", async ({ env, user, params }) => {
    needAdmin(user);
    await env.DB.prepare("DELETE FROM user_features WHERE user_id = ? AND feature = ?").bind(params.id, params.f).run();
    return json({ ok: true });
  });
}

// 내장 Dock 앱의 사람별 저장소 (user_app_state) — JSON 한 덩어리를 통째로 읽고 써요.
//   GET /apps/:app/state            → { data, updated_at }   (없으면 data: null, updated_at: 0)
//   PUT /apps/:app/state {data, at} → { updated_at }         at = 내가 마지막으로 본 updated_at
//     다른 기기가 그 사이에 썼으면 409 + { data, updated_at } (지금 서버 값) → 화면이 합쳐서 다시 보내요
// 기능 잠금: CIM 은 "cim" 기능이에요 (src/features.js 의 MAP · /apps/cim/* — 관리자 두 명이 승인해야 열려요)
const APPS = { cim: 600_000, ui: 4_000, svm: 40_000, psy: 200_000 }; // 앱 → 최대 크기(글자) · ui = 화면 꾸미기 (테마 · 배경 · 강조 색, js/theme.js — 잠금 없음) · svm = Silicon Valley Mafia 읽은 글 · 설정 (관리자만, features.js ADMIN_ONLY) · psy = Psychology SRS · 퀴즈 · 스파링 점수 (기능 psy)

export function registerAppState(on, { json, body, fail, now }) {
  const appOf = (p) => (Object.hasOwn(APPS, p.app) ? p.app : fail(404, "없는 앱이에요."));
  on("GET", "/apps/:app/state", async ({ env, user, params }) => {
    const app = appOf(params);
    const r = await env.DB.prepare("SELECT data, updated_at FROM user_app_state WHERE user_id = ? AND app = ?").bind(user.id, app).first();
    let data = null;
    try { data = r ? JSON.parse(r.data) : null; } catch { data = null; }
    return json({ data, updated_at: r?.updated_at || 0 });
  });
  on("PUT", "/apps/:app/state", async ({ req, env, user, params }) => {
    const app = appOf(params);
    const b = await body(req);
    if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) fail(400, "저장할 값이 없어요.");
    const text = JSON.stringify(b.data);
    if (text.length > APPS[app]) fail(413, "저장할 기록이 너무 커요.");
    const at = Number.isInteger(b.at) && b.at >= 0 ? b.at : 0;
    const next = Math.max(now(), at + 1);
    // 처음이면 넣고, 있으면 내가 본 판(at)일 때만 덮어써요
    const r = await env.DB.prepare(
      "INSERT INTO user_app_state (user_id, app, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, app) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE user_app_state.updated_at = ?5"
    ).bind(user.id, app, text, next, at).run();
    if ((r.meta.changes || 0) > 0) return json({ updated_at: next });
    const cur = await env.DB.prepare("SELECT data, updated_at FROM user_app_state WHERE user_id = ? AND app = ?").bind(user.id, app).first();
    let data = null;
    try { data = cur ? JSON.parse(cur.data) : null; } catch {}
    fail(409, "다른 기기에서 먼저 저장했어요.", { data, updated_at: cur?.updated_at || 0 });
  });
}

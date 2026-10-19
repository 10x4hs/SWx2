// 관리자(users.role = 'admin', 지금은 HSK · GYK) 전용: 회원 목록 · 가입 승인(관리자 모두 승인해야 들어와요) · 정지 · 삭제 ·
// 임시 비밀번호 · 이 회원으로 들어가기(비밀번호 없이, 하루짜리 세션 — 돌아가기로 관리자 세션으로 돌아와요)
import { b64url } from "./lib/crypto.js";
import { fail, json, now, uid, body } from "./http.js";
import { startSession, sessionId, hashPassword } from "./auth.js";
import { pushUsers } from "./push.js";

// 대신 들어간 세션에서는 관리자 기능을 못 써요 (회원 화면만)
const DEMO_IDS = ["dmo"]; // 확인이 끝나면 빼요
const needAdmin = (user) => { if (user.role !== "admin" || user.imp_by) fail(403, "관리자만 쓸 수 있어요."); };
const target = async (env, id) => (await env.DB.prepare("SELECT id, username, role, state FROM users WHERE id = ?").bind(id).first()) || fail(404, "없는 회원이에요.");
const notAdmin = (u) => { if (u.role === "admin") fail(400, "관리자 계정에는 할 수 없어요."); };

export function registerAdmin(on) {
  on("GET", "/admin/users", async ({ env, user }) => {
    needAdmin(user);
    const [us, ap, ad, tres] = await env.DB.batch([
      env.DB.prepare("SELECT id, username, display_name, color, role, state, created_at, last_seen_at, pw_changed_at, must_change_pw, locked_until FROM users ORDER BY state = 'pending' DESC, created_at"),
      env.DB.prepare("SELECT a.user_id, u.username, a.at FROM signup_approvals a JOIN users u ON u.id = a.admin_id"),
      env.DB.prepare("SELECT id, username FROM users WHERE role = 'admin' ORDER BY username"),
      env.DB.prepare("SELECT m.user_id, t.name FROM team_members m JOIN teams t ON t.id = m.team_id ORDER BY m.joined_at"),
    ]);
    const tm = {};
    for (const r of tres.results) (tm[r.user_id] ||= []).push(r.name);
    const by = {}, at = {};
    for (const a of ap.results) { (by[a.user_id] ||= []).push(a.username); (at[a.user_id] ||= {})[a.username] = a.at; }
    const users = us.results.map((u) => ({ ...u, must_change_pw: u.must_change_pw === 1, approvals: by[u.id] || [], approval_at: at[u.id] || {}, teams: tm[u.id] || [] }));
    const week = now() - 7 * 864e5;
    const stats = {
      total: users.length,
      active: users.filter((u) => u.state === "active").length,
      pending: users.filter((u) => u.state === "pending").length,
      suspended: users.filter((u) => u.state === "suspended").length,
      seen_week: users.filter((u) => u.last_seen_at > week).length,
    };
    return json({ users, admins: ad.results.map((a) => a.username), stats });
  });

  // 알림용: 내가 아직 승인 안 한 가입 신청 (개수 + 가장 최근 것)
  on("GET", "/admin/pending", async ({ env, user }) => {
    needAdmin(user);
    const [mine, rec] = await env.DB.batch([
      env.DB.prepare("SELECT u.username, u.created_at FROM users u WHERE u.state = 'pending' AND NOT EXISTS (SELECT 1 FROM signup_approvals a WHERE a.user_id = u.id AND a.admin_id = ?) ORDER BY u.created_at DESC").bind(user.id),
      // 다른 관리자가 방금 승인했고 내 승인만 남은 신청 (알림: "HSK가 @abc 를 승인했어요")
      env.DB.prepare("SELECT a.username AS by, u.username, s.at FROM signup_approvals s JOIN users a ON a.id = s.admin_id JOIN users u ON u.id = s.user_id WHERE s.admin_id != ?1 AND u.state = 'pending' AND NOT EXISTS (SELECT 1 FROM signup_approvals m WHERE m.user_id = u.id AND m.admin_id = ?1) ORDER BY s.at DESC LIMIT 1").bind(user.id),
    ]);
    return json({ n: mine.results.length, last: mine.results[0] || null, recent: rec.results[0] || null });
  });
  // 팀 전체: 이름 · 팀장 · 팀원 · 초대 코드
  on("GET", "/admin/teams", async ({ env, user }) => {
    needAdmin(user);
    const [ts, ms] = await env.DB.batch([
      env.DB.prepare("SELECT t.id, t.name, t.code, t.created_at, o.username AS owner FROM teams t LEFT JOIN users o ON o.id = t.owner_id ORDER BY t.created_at"),
      env.DB.prepare("SELECT m.team_id, u.id, u.username, u.display_name, m.joined_at FROM team_members m JOIN users u ON u.id = m.user_id ORDER BY m.joined_at"),
    ]);
    return json({ teams: ts.results.map((t) => ({ ...t, members: ms.results.filter((m) => m.team_id === t.id).map(({ team_id, ...m }) => m) })) });
  });
  // 한 회원의 일정: 날짜 범위(최대 31일)의 계획 (공개 여부와 상관없이 — 가입 화면에 알린 대로)
  on("GET", "/admin/users/:id/plans", async ({ env, user, params, q }) => {
    needAdmin(user);
    const u = await target(env, params.id);
    const from = q.get("from") || "", to = q.get("to") || from;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from || (Date.parse(to) - Date.parse(from)) / 864e5 > 31) fail(400, "날짜 범위가 올바르지 않아요 (31일까지).");
    const { results } = await env.DB.prepare("SELECT id, period, text, start, mins, done FROM plans WHERE user_id = ? AND scope = 'day' AND period BETWEEN ? AND ? ORDER BY period, CASE WHEN start IS NULL THEN 1 ELSE 0 END, start, sort").bind(u.id, "D:" + from, "D:" + to).all();
    return json({ user: { id: u.id, username: u.username }, plans: results });
  });
  // 공지
  on("POST", "/admin/announcements", async ({ env, user, req }) => {
    needAdmin(user);
    const b = await body(req);
    const text = String(b.body || "").trim();
    if (!text || text.length > 300) fail(400, "공지는 1~300자로 써 주세요.");
    const a = { id: uid(), body: text, created_at: now() };
    await env.DB.batch([
      env.DB.prepare("UPDATE announcements SET active = 0 WHERE active = 1"),
      env.DB.prepare("INSERT INTO announcements (id, body, created_by, created_at) VALUES (?, ?, ?, ?)").bind(a.id, a.body, user.id, a.created_at),
    ]);
    return json({ announcement: a }, 201);
  });
  on("DELETE", "/admin/announcements/:id", async ({ env, user, params }) => {
    needAdmin(user);
    await env.DB.prepare("UPDATE announcements SET active = 0 WHERE id = ?").bind(params.id).run();
    return json({ ok: true });
  });
  // 모든 사람: 지금 공지 (없으면 null)
  on("GET", "/announcement", async ({ env }) => {
    const a = await env.DB.prepare("SELECT id, body, created_at FROM announcements WHERE active = 1 ORDER BY created_at DESC LIMIT 1").first();
    return json({ announcement: a || null });
  });

  // 승인: 관리자마다 한 번씩. 관리자 모두가 승인하면 그때 '활성'
  on("POST", "/admin/users/:id/approve", async ({ env, user, params, ec }) => {
    needAdmin(user);
    const u = await target(env, params.id);
    if (u.state !== "pending") fail(400, "승인을 기다리는 회원이 아니에요.");
    await env.DB.prepare("INSERT OR IGNORE INTO signup_approvals (user_id, admin_id, at) VALUES (?, ?, ?)").bind(u.id, user.id, now()).run();
    // 데모 아이디(DEMO_IDS)는 관리자 한 명 승인으로 바로 — 가입 흐름 확인용
    const r = await env.DB.prepare(
      "UPDATE users SET state = 'active' WHERE id = ?1 AND state = 'pending' AND (?2 OR NOT EXISTS (SELECT 1 FROM users a WHERE a.role = 'admin' AND NOT EXISTS (SELECT 1 FROM signup_approvals s WHERE s.user_id = ?1 AND s.admin_id = a.id)))"
    ).bind(u.id, DEMO_IDS.includes(u.username) ? 1 : 0).run();
    const active = (r.meta.changes || 0) > 0;
    // 아직 남았으면 다른 관리자에게 "내 승인만 남았어요" 알림
    if (!active) { const others = (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' AND state = 'active' AND id != ?").bind(user.id).all()).results.map((x) => x.id); pushUsers(env, ec, others, { room: "approve" }); }
    return json({ ok: true, active });
  });
  // 거절: 승인 대기 계정을 지워요
  on("POST", "/admin/users/:id/reject", async ({ env, user, params }) => {
    needAdmin(user);
    const u = await target(env, params.id);
    if (u.state !== "pending") fail(400, "승인을 기다리는 회원이 아니에요.");
    await env.DB.prepare("DELETE FROM users WHERE id = ? AND state = 'pending'").bind(u.id).run();
    return json({ ok: true });
  });
  // 정지 · 풀기: 정지하면 로그인 · 토큰이 모두 끊겨요
  on("POST", "/admin/users/:id/suspend", async ({ env, user, params, req }) => {
    needAdmin(user);
    const u = await target(env, params.id); notAdmin(u);
    const on_ = (await req.json().catch(() => ({}))).on !== false;
    if (u.state === "pending") fail(400, "승인 대기 회원은 승인하거나 거절해 주세요.");
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET state = ? WHERE id = ?").bind(on_ ? "suspended" : "active", u.id),
      ...(on_ ? [env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id)] : []),
    ]);
    return json({ ok: true, state: on_ ? "suspended" : "active" });
  });
  on("DELETE", "/admin/users/:id", async ({ env, user, params }) => {
    needAdmin(user);
    const u = await target(env, params.id); notAdmin(u);
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id).run();
    return json({ ok: true });
  });
  // 임시 비밀번호: 한 번만 보여 줘요. 회원은 다음 로그인 때 새 비밀번호로 바꿔야 해요. 다른 기기 로그인은 끊겨요
  on("POST", "/admin/users/:id/reset-password", async ({ env, user, params }) => {
    needAdmin(user);
    const u = await target(env, params.id); notAdmin(u);
    const temp = b64url(crypto.getRandomValues(new Uint8Array(9)));
    const { hash, salt } = await hashPassword(temp);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET pw_hash = ?, pw_salt = ?, must_change_pw = 1, fail_count = 0, locked_until = 0, pw_changed_at = ? WHERE id = ?").bind(hash, salt, now(), u.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
    ]);
    return json({ ok: true, temp_password: temp }, 200, { "cache-control": "no-store" });
  });
  // 이 회원으로 들어가기: 지금 관리자 세션은 그대로 두고, 그 회원의 하루짜리 세션 쿠키로 바꿔요
  on("POST", "/admin/users/:id/impersonate", async ({ env, user, params, req }) => {
    needAdmin(user);
    const u = await target(env, params.id); notAdmin(u);
    if (u.state !== "active") fail(400, "활성 회원만 들어갈 수 있어요.");
    return json({ ok: true }, 200, { "set-cookie": await startSession(req, env, u.id, user.id) });
  });
  // 관리자로 돌아가기: 대신 들어간 세션을 지우고 관리자 세션을 새로 줘요
  on("POST", "/auth/unimpersonate", async ({ env, user, req }) => {
    if (!user.imp_by) fail(400, "대신 들어간 상태가 아니에요.");
    const admin = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'admin' AND state = 'active'").bind(user.imp_by).first();
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sessionId(req)).run();
    if (!admin) fail(401, "관리자 계정을 찾지 못했어요. 다시 로그인해 주세요.");
    return json({ ok: true }, 200, { "set-cookie": await startSession(req, env, admin.id) });
  });
}

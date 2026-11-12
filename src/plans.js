// 계획(plans) · 기간 요약(summary) · 실행 기록(logs). 계획은 모두가 읽고 주인만 써요.
import { fail, json, body, now, uid, str, dayParam, yearParam } from "./http.js";
import { PEERS } from "./teams.js";
import { focusKick } from "./hub.js";
import { registerBoard, boardFields, syncDone, outPlan } from "./board.js";

const PERIOD_RE = {
  year: /^Y:\d{4}$/,
  month: /^M:\d{4}-(0[1-9]|1[0-2])$/,
  week: /^W:\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/,
  day: /^D:\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
};
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TONES = ["ink", "graphite", "slate", "steel", "silver", "sand", "ivory", "champagne"];
const PRIORITIES = ["low", "medium", "high", "xhigh", "max"];
// 우선순위: 저장은 low~max, 화면 · AI · MCP 는 1(가장 급함)~5(여유) 도 써요 → 같은 값으로 바꿔요
const PRIO_NUM = { 1: "max", 2: "xhigh", 3: "high", 4: "medium", 5: "low" };
const prioIn = (v) => (PRIO_NUM[String(v).trim()] || (typeof v === "string" ? v.trim().toLowerCase() : v));
const prio = (v0, v = prioIn(v0)) => (v0 === null || v0 === "" ? null : PRIORITIES.includes(v) ? v : fail(400, "우선순위는 1(가장 급함)~5(여유) 또는 low · medium · high · xhigh · max 중 하나예요."));
// 그룹 id — 묶을 때 브라우저가 만든 아무 글자 (null = 풀기)
const groupId = (v) => (v === null || v === "" ? null : typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : fail(400, "그룹 id 가 올바르지 않아요."));
// 되돌리기용 확인: expect 의 값과 지금 값이 다르면 그 사이 다른 곳에서 바뀐 것 → 덮어쓰지 않아요 (409)
const same = (k, a, b) => (k === "done" || k === "missed" ? !!a === !!b : (a ?? null) === (b ?? null) || String(a ?? "") === String(b ?? ""));
const tone = (v) => (v === null ? null : TONES.includes(v) ? v : fail(400, "고를 수 없는 색이에요."));

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

export function registerPlans(on) {
  registerBoard(on); // 할 일 보드 (/plans/board · /plans/board/cols) — /plans/:id 보다 먼저
  on("GET", "/plans", async ({ env, q, user }) => {
    const periods = (q.get("periods") || "").split(",").filter(Boolean).slice(0, 20);
    // days=YYYY-MM-DD..YYYY-MM-DD : 그 사이 날마다의 계획을 한 번에 (홈 차트가 요청 여러 번 대신 한 번으로). 최대 62일
    const dm = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(q.get("days") || "");
    const range = dm && dm[1] <= dm[2] && (Date.parse(dm[2]) - Date.parse(dm[1])) / 864e5 <= 62 ? ["D:" + dm[1], "D:" + dm[2]] : null;
    if (!periods.length && !range) return json({ plans: [] });
    const who = q.get("user") || user.id;
    const where = [periods.length ? `period IN (${periods.map(() => "?").join(",")})` : "", range ? "(period >= ? AND period <= ?)" : ""].filter(Boolean).join(" OR ");
    const list = env.DB.prepare(
      `SELECT plans.*, (SELECT COALESCE(SUM(l.mins), 0) FROM logs l WHERE l.plan_id = plans.id AND l.kind = 'focus') AS focus_mins
     FROM plans WHERE user_id = ? AND (${where}) ORDER BY CASE WHEN start IS NULL THEN 1 ELSE 0 END, start, sort, created_at`
    ).bind(who, ...periods, ...(range || []));
    // 친구 계획은 그 사람이 공개(open)했을 때만. 아니면 빈 목록 + closed 표시 (공개 여부와 목록을 한 번에 물어보고, 닫혀 있으면 목록은 버려요)
    if (who !== user.id) {
      const [o, l] = await env.DB.batch([env.DB.prepare(`SELECT plans_open FROM users WHERE id = ?1 AND id IN ${PEERS("?2")}`).bind(who, user.id), list]);
      if (!o.results[0] || o.results[0].plans_open === 0) return json({ plans: [], closed: true });
      return json({ plans: l.results.map(outPlan) });
    }
    const { results } = await list.all();
    // focus_mins = 그 할 일에 쌓인 집중 기록 분의 합 (logs.plan_id)
    // 친구 계획: open 한 사람 것은 내용까지 그대로 보여요 (not open 이면 위에서 이미 빈 목록)
    return json({ plans: results.map(outPlan) });
  });

  // Mac 위젯이 몇 초마다 묻는 '바뀐 게 있나' — 그 날들의 계획 수 + 마지막 수정 시각 (나와 같은 팀 사람 것만). 값이 달라지면 위젯이 다시 그려요
  on("GET", "/widget/stamp", async ({ env, q, user }) => {
    const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(q.get("days") || "");
    if (!m || m[1] > m[2]) fail(400, "days=YYYY-MM-DD..YYYY-MM-DD 형식이에요.");
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS t FROM plans WHERE period >= ?1 AND period <= ?2 AND user_id IN ${PEERS("?3")}`).bind("D:" + m[1], "D:" + m[2], user.id).first();
    return json({ stamp: `${r.n}:${r.t}` });
  });

  on("POST", "/plans", async ({ req, env, user }) => {
    const b = await body(req);
    checkPeriod(b.scope, b.period);
    const p = { id: uid(), user_id: user.id, scope: b.scope, period: b.period, text: str(b.text, 200, "내용"), done: 0, missed: 0, start: null, mins: null, color: b.color === undefined ? null : tone(b.color), priority: b.priority === undefined ? null : prio(b.priority), sort: now(), created_at: now(), updated_at: now(), done_at: null, status: null, project: null, due: null, subtasks: null, note: null, group_id: b.group_id === undefined ? null : groupId(b.group_id) };
    if (b.scope === "day") checkSlot(b, p);
    boardFields(b, p); // 보드: 칸 · 프로젝트 · 마감일 · 작은 할 일 · 메모 · 순서 (없으면 예전 그대로)
    if (p.status === "done") { p.done = 1; p.done_at = now(); }
    await env.DB.prepare("INSERT INTO plans (id, user_id, scope, period, text, done, done_at, start, mins, color, priority, sort, created_at, updated_at, status, project, due, subtasks, note, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(p.id, p.user_id, p.scope, p.period, p.text, p.done, p.done_at, p.start, p.mins, p.color, p.priority, p.sort, p.created_at, p.updated_at, p.status, p.project, p.due, p.subtasks, p.note, p.group_id).run();
    return json({ plan: outPlan(p) }, 201);
  });

  on("PATCH", "/plans/:id", async ({ req, env, user, params }) => {
    const p = await ownPlan(env, params.id, user);
    const b = await body(req);
    if (b.expect && typeof b.expect === "object") for (const [k, v] of Object.entries(b.expect)) if (k in p && !same(k, p[k], v)) fail(409, "그 사이 다른 곳에서 바뀌었어요. 덮어쓰지 않았어요.");
    const next = { ...p };
    if (b.text !== undefined) next.text = str(b.text, 200, "내용");
    if (b.done !== undefined) { next.done = b.done ? 1 : 0; next.done_at = b.done ? now() : null; if (b.done) next.missed = 0; }
    // 못함(빨간 표시) — 켜면 끝냄은 꺼져요
    if (b.missed !== undefined) { next.missed = b.missed ? 1 : 0; if (b.missed) { next.done = 0; next.done_at = null; } }
    if (b.period !== undefined) { checkPeriod(p.scope, b.period); if (b.period !== p.period && b.missed === undefined) next.missed = 0; next.period = b.period; } // 다른 날로 미루면 못함 표시는 지워요
    if (p.scope === "day") checkSlot(b, next);
    if (b.color !== undefined) next.color = tone(b.color);
    if (b.priority !== undefined) next.priority = prio(b.priority);
    if (b.group_id !== undefined) next.group_id = groupId(b.group_id);
    boardFields(b, next);
    syncDone(b, p, next); // '완료' 칸 ↔ done 을 같게
    // 자동 집중: 분(1~계획 길이) 또는 null(끄기). 시각 · 날 · 집중 분이 바뀌면 그 시각 알림을 다시 보낼 수 있게
    if (b.auto_focus !== undefined) {
      if (b.auto_focus === null || b.auto_focus === false || b.auto_focus === 0) next.auto_focus = null;
      else { const m = Math.round(Number(b.auto_focus)); if (!(m >= 1 && m <= 1440)) fail(400, "집중 시간은 1분 이상이어야 해요."); if (!next.start) fail(400, "시각이 있는 계획에만 자동 집중을 켤 수 있어요."); next.auto_focus = m; }
    }
    if (next.auto_focus && !next.start) next.auto_focus = null;
    if (next.auto_focus !== p.auto_focus || next.start !== p.start || next.period !== p.period) next.focus_sent_at = null;
    next.updated_at = now();
    await env.DB.prepare("UPDATE plans SET text = ?, done = ?, done_at = ?, missed = ?, period = ?, start = ?, mins = ?, color = ?, priority = ?, status = ?, project = ?, due = ?, subtasks = ?, note = ?, sort = ?, group_id = ?, auto_focus = ?, focus_sent_at = ?, updated_at = ? WHERE id = ?")
      .bind(next.text, next.done, next.done_at, next.missed ? 1 : 0, next.period, next.start, next.mins, next.color, next.priority ?? null, next.status ?? null, next.project ?? null, next.due ?? null, next.subtasks ?? null, next.note ?? null, next.sort, next.group_id ?? null, next.auto_focus ?? null, next.focus_sent_at ?? null, next.updated_at, p.id).run();
    if (next.auto_focus || p.auto_focus) await focusKick(env); // 알람 시각을 다시 맞춰요
    return json({ plan: outPlan(next) });
  });

  // 서비스 워커가 푸시를 받으면 묻는 '방금 시작한 자동 집중' (지난 10분 안에 알람이 보낸 것)
  on("GET", "/plans/focus-due", async ({ env, user }) => {
    const { results } = await env.DB.prepare("SELECT id, text, start, period, auto_focus AS mins FROM plans WHERE user_id = ? AND auto_focus IS NOT NULL AND focus_sent_at > ? ORDER BY focus_sent_at DESC LIMIT 3").bind(user.id, now() - 10 * 60e3).all();
    return json({ plans: results });
  });

  // 지금 시간 칸 안에 있는 자동 집중 계획 (앱이 늦게 열렸거나 · 탭이 자고 있었거나 · 다른 집중이 끝난 뒤에 이어서 켜려고)
  //   알람이 실제로 갔는지와 상관없이, 시작 시각은 지났고 끝(시작 + 집중 분)은 1분 넘게 남은 것만
  on("GET", "/plans/focus-open", async ({ env, user }) => {
    const KST = 9 * 36e5, t = now(), day = (x) => new Date(x + KST).toISOString().slice(0, 10);
    const { results } = await env.DB.prepare("SELECT id, text, start, period, auto_focus FROM plans WHERE user_id = ? AND auto_focus IS NOT NULL AND done = 0 AND missed = 0 AND scope = 'day' AND start IS NOT NULL AND period IN (?, ?)")
      .bind(user.id, "D:" + day(t), "D:" + day(t - 864e5)).all();
    const plans = (results || []).map((p) => { const at = Date.parse(`${p.period.slice(2)}T${p.start}:00Z`) - KST, until = at + p.auto_focus * 60e3; return { id: p.id, text: p.text, start: p.start, mins: p.auto_focus, at, until }; })
      .filter((p) => p.at <= t + 20e3 && p.until - t > 60e3).sort((a, b) => a.at - b.at);
    return json({ plans, now: t });
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
    const year = q.get("year"), who = q.get("user") || user.id;
    yearParam(year);
    const heat = env.DB.prepare(
      "SELECT period, COUNT(*) AS total, SUM(done) AS done FROM plans WHERE user_id = ? AND scope = 'day' AND period LIKE ? GROUP BY period"
    ).bind(who, `D:${year}-%`);
    // 친구의 하루별 개수도 그 사람이 계획을 공개(open)했을 때만 — GET /plans 와 같은 규칙 (닫혀 있으면 빈 목록 + closed)
    if (who !== user.id) {
      const [o, h] = await env.DB.batch([env.DB.prepare(`SELECT plans_open FROM users WHERE id = ?1 AND id IN ${PEERS("?2")}`).bind(who, user.id), heat]);
      if (!o.results[0] || o.results[0].plans_open === 0) return json({ days: [], closed: true });
      return json({ days: h.results });
    }
    return json({ days: (await heat.all()).results });
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
    dayParam(day);
    if (q.get("user") && q.get("user") !== user.id) fail(403, "다른 사람의 기록은 볼 수 없어요.");
    const { results } = await env.DB.prepare("SELECT * FROM logs WHERE user_id = ? AND day = ? ORDER BY at, created_at")
      .bind(user.id, day).all();
    return json({ logs: results });
  });

  on("POST", "/logs", async ({ req, env, user }) => {
    const b = await body(req);
    dayParam(b.day);
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
    dayParam(from); dayParam(to);
    const { results } = await env.DB.prepare(
      `SELECT user_id, day, SUM(COALESCE(mins, 0)) AS mins, COUNT(*) AS sessions FROM logs WHERE kind = 'focus' AND day BETWEEN ? AND ? AND (? = '' OR user_id = ?) AND user_id IN ${PEERS("?")} GROUP BY user_id, day`
    ).bind(from, to, q.get("user") || "", q.get("user") || "", user.id).all();
    return json({ days: results });
  });
}

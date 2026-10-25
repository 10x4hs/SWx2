// 하루 기록: 점수 계산 · 하루 얼려 두기 · 자정 AI 채점 · 자동 저장(크론에서 불러요) · /records API.
import { aiJson } from "./ai.js";
import { kstToday } from "./lib/day.js";
import { fail, json, body, now, DAY_RE, dayParam, yearParam } from "./http.js";

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
  const data = { plans: P.map((p) => ({ text: p.text, done: !!p.done, missed: !!p.missed, start: p.start, mins: p.mins, priority: p.priority || null })), logs: L, ...sc, focus, goal: u.day_goal };
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
      `날짜: ${day}\n하루 목표 공부 시간: ${d.goal || 240}분\n집중 기록: ${d.focus || 0}분\n계산식 점수(참고): ${r.score ?? "없음"}\n계획:\n${lines || "(없음)"}\n\nJSON 으로만: {"score": 0~100 정수, "note": "한 줄 평"}`, u.ai_model || null, { private: true }); // 하루 계획 → Groq 만
    const v = Math.round(Number(out.data?.score));
    if (v >= 0 && v <= 100) { ai = v; note = String(out.data?.note || "").slice(0, 120); model = out.used || null; }
  } catch (e) { console.warn("AI 채점 실패", u.id, day, e.message); }
  if (ai === null) { if (r.score == null) return null; ai = r.score; note = "AI 가 바빠서 계산식 점수로 기록했어요."; model = "formula"; }
  await env.DB.prepare("UPDATE day_records SET ai_score = ?, ai_note = ?, ai_model = ? WHERE user_id = ? AND day = ?").bind(ai, note, model, u.id, day).run();
  return { ai_score: ai, ai_note: note, ai_model: model };
}
// 한국 시간 기준 날짜 (자정 자동 저장용)
// 어제 기록이 아직 없으면 만들어 둬요 (크론이 못 돈 날을 위한 대비책) — 그리고 main 쿼리 결과를 돌려줘요.
// 확인과 main 을 왕복 한 번에 묻고, 어제 기록을 새로 만든 때만 main 을 다시 물어요
async function ensureYesterday(env, u, ec, main) {
  const later = (p) => (ec ? ec.waitUntil(p.catch((e) => console.warn("AI 채점", e.message))) : p); // AI 채점은 뒤에서 (화면을 기다리게 하지 않게)
  const y = kstToday(-1);
  const [chk, res] = await env.DB.batch([env.DB.prepare("SELECT data != '{}' AS full, ai_score FROM day_records WHERE user_id = ? AND day = ?").bind(u.id, y), main]);
  const has = chk.results[0]?.full ? chk.results[0] : null; // 내 점수만 적힌 빈 기록은 없는 것으로
  let again = false;
  if (!has) { const s0 = await snapshotDay(env, u, y, true); if (s0) { await later(aiScoreDay(env, u, y)); again = true; } }
  else if (has.ai_score == null) { await later(aiScoreDay(env, u, y)); again = !ec; } // 크론이 못 돌았으면 여기서 (ec 없이 기다렸으면 새 점수로 다시)
  return again ? (await main.all()).results : res.results;
}
export async function autoSaveYesterday(env) {
  const y = kstToday(-1);
  const { results } = await env.DB.prepare(
    "SELECT u.id, u.day_goal, u.ai_model FROM users u WHERE EXISTS (SELECT 1 FROM plans p WHERE p.user_id = u.id AND p.period = ?) OR EXISTS (SELECT 1 FROM logs l WHERE l.user_id = u.id AND l.day = ?)"
  ).bind("D:" + y, y).all();
  for (const u of results) { const s0 = await snapshotDay(env, u, y, true); if (s0) await aiScoreDay(env, u, y); }
  return { day: y, saved: results.length };
}

export function registerRecords(on) {
  on("POST", "/records", async ({ req, env, user }) => {
    const b = await body(req);
    dayParam(b.day);
    const r = await snapshotDay(env, user, b.day, false);
    if (!r) fail(400, "그날은 저장할 계획이나 기록이 없어요.");
    return json({ record: r });
  });
  on("GET", "/records", async ({ env, q, user }) => {
    const day = q.get("day") || "";
    dayParam(day);
    const r = await env.DB.prepare("SELECT day, data, score, self, ai_score, ai_note, ai_model, done, total, auto, saved_at FROM day_records WHERE user_id = ? AND day = ?").bind(user.id, day).first();
    return json({ record: r ? { ...r, data: JSON.parse(r.data) } : null });
  });
  // 내가 매긴 하루 점수 (0~100, null 이면 지워요). 기록이 없던 날이면 빈 기록을 만들어 점수만 붙여요.
  on("PUT", "/records/self", async ({ req, env, user }) => {
    const b = await body(req);
    dayParam(b.day);
    const v = b.self === null || b.self === "" ? null : Math.round(Number(b.self));
    if (v !== null && !(v >= 0 && v <= 100)) fail(400, "점수는 0~100 이에요.");
    await env.DB.prepare("INSERT INTO day_records (user_id, day, data, score, self, done, total, auto, saved_at) VALUES (?, ?, '{}', NULL, ?, 0, 0, 0, ?) ON CONFLICT(user_id, day) DO UPDATE SET self = excluded.self")
      .bind(user.id, b.day, v, now()).run();
    return json({ day: b.day, self: v });
  });
  // 최근 N일 점수 흐름 (자동 · 내 점수)
  on("GET", "/records/recent", async ({ env, q, user, ec }) => {
    const to = DAY_RE.test(q.get("to") || "") ? q.get("to") : kstToday(0);
    const n = Math.min(60, Math.max(3, +q.get("days") || 14));
    const from = new Date(new Date(to + "T00:00:00Z").getTime() - (n - 1) * 864e5).toISOString().slice(0, 10);
    const results = await ensureYesterday(env, user, ec, env.DB.prepare("SELECT day, score, ai_score, ai_note, done, total FROM day_records WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day").bind(user.id, from, to));
    return json({ from, to, days: results });
  });
  on("GET", "/records/days", async ({ env, q, user, ec }) => {
    const year = q.get("year") || "";
    yearParam(year);
    const results = await ensureYesterday(env, user, ec, env.DB.prepare("SELECT day, score, ai_score, done, total, auto FROM day_records WHERE user_id = ? AND day LIKE ? ORDER BY day").bind(user.id, year + "-%"));
    return json({ days: results });
  });
}

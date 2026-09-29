// 캘린더: 한 달 칸 요약 + 하루 한 페이지 (할 일 · 일기 · 그날 한 공부). 전부 본인 것만.
// 할 일은 기존 plans(scope 'day', period 'D:YYYY-MM-DD') 를 그대로 써요 — 쓰기는 /plans API.

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_RANGE = 43; // 달력 한 판(6주) + 여유
const toMs = (day) => Date.parse(day + "T00:00:00Z");
const realDay = (d) => typeof d === "string" && DAY_RE.test(d) && new Date(toMs(d)).toISOString().slice(0, 10) === d;
// 한국 시간 하루의 시작·끝 (노트 수정 시각은 ms 라서)
const kstRange = (day) => { const a = Date.parse(day + "T00:00:00+09:00"); return [a, a + 864e5]; };
const KST = 9 * 3600e3;

export function registerCalendar(on, { json, fail }) {
  // 한 달 칸: 날마다 할 일 앞 몇 개 + 개수, 일기 기분, 집중·영어 분, 하루 점수
  on("GET", "/calendar", async ({ env, q, user }) => {
    const from = q.get("from") || "", to = q.get("to") || "";
    if (!realDay(from) || !realDay(to) || to < from) fail(400, "날짜 범위가 올바르지 않아요.");
    if ((toMs(to) - toMs(from)) / 864e5 + 1 > MAX_RANGE) fail(400, `한 번에 ${MAX_RANGE}일까지만 볼 수 있어요.`);
    const [ms0] = kstRange(from), [, ms1] = kstRange(to);
    const [plans, diaries, focus, english, records, notes] = await env.DB.batch([
      env.DB.prepare(
        "SELECT id, substr(period, 3) AS day, text, done, start, mins FROM plans WHERE user_id = ? AND scope = 'day' AND period BETWEEN ? AND ? ORDER BY period, CASE WHEN start IS NULL THEN 1 ELSE 0 END, start, sort, created_at"
      ).bind(user.id, "D:" + from, "D:" + to),
      env.DB.prepare("SELECT day, mood, length(body) AS len FROM diaries WHERE user_id = ? AND day BETWEEN ? AND ?").bind(user.id, from, to),
      env.DB.prepare("SELECT day, SUM(COALESCE(mins, 0)) AS mins FROM logs WHERE user_id = ? AND kind = 'focus' AND day BETWEEN ? AND ? GROUP BY day").bind(user.id, from, to),
      env.DB.prepare("SELECT day, minutes FROM english_days WHERE user_id = ? AND day BETWEEN ? AND ?").bind(user.id, from, to),
      env.DB.prepare("SELECT day, score FROM day_records WHERE user_id = ? AND day BETWEEN ? AND ?").bind(user.id, from, to),
      env.DB.prepare("SELECT updated_at FROM notes WHERE user_id = ? AND updated_at >= ? AND updated_at < ?").bind(user.id, ms0, ms1),
    ]);
    const days = {};
    const at = (d) => (days[d] ||= { todos: [], total: 0, done: 0, mood: null, diary: 0, focus: 0, english: 0, study_mins: 0, notes: 0, score: null });
    for (const p of plans.results) {
      const d = at(p.day);
      d.total++; if (p.done) d.done++;
      if (d.todos.length < 4) d.todos.push({ id: p.id, text: p.text, done: !!p.done, start: p.start });
    }
    for (const r of diaries.results) Object.assign(at(r.day), { mood: r.mood, diary: r.len || 0 });
    for (const r of focus.results) at(r.day).focus = r.mins || 0;
    for (const r of english.results) at(r.day).english = r.minutes || 0;
    for (const r of records.results) at(r.day).score = r.score;
    for (const r of notes.results) at(new Date(r.updated_at + KST).toISOString().slice(0, 10)).notes++;
    // 하루 공부 시간 = 집중 기록 + 영어 (회고·홈과 같은 정의)
    for (const d of Object.values(days)) d.study_mins = d.focus + d.english;
    return json({ from, to, days });
  });

  // 하루 한 페이지: 할 일 · 실행 기록 · 일기 · 영어 · 하루 기록 · 그날 쓴 노트
  on("GET", "/calendar/day", async ({ env, q, user }) => {
    const day = q.get("day") || "";
    if (!realDay(day)) fail(400, "날짜 형식이 올바르지 않아요.");
    const [ms0, ms1] = kstRange(day);
    const [plans, logs, diary, english, record, notes] = await env.DB.batch([
      env.DB.prepare("SELECT * FROM plans WHERE user_id = ? AND period = ? ORDER BY CASE WHEN start IS NULL THEN 1 ELSE 0 END, start, sort, created_at").bind(user.id, "D:" + day),
      env.DB.prepare("SELECT id, at, text, kind, mins, plan_id FROM logs WHERE user_id = ? AND day = ? ORDER BY at, created_at").bind(user.id, day),
      env.DB.prepare("SELECT day, mood, body, updated_at FROM diaries WHERE user_id = ? AND day = ?").bind(user.id, day),
      env.DB.prepare("SELECT blocks, minutes, spoken, newwords, mistakes, sentence FROM english_days WHERE user_id = ? AND day = ?").bind(user.id, day),
      env.DB.prepare("SELECT score, self, ai_score, ai_note, ai_model, done, total, auto, saved_at FROM day_records WHERE user_id = ? AND day = ?").bind(user.id, day),
      env.DB.prepare("SELECT id, title, created_at, updated_at FROM notes WHERE user_id = ? AND updated_at >= ? AND updated_at < ? ORDER BY updated_at DESC LIMIT 30").bind(user.id, ms0, ms1),
    ]);
    const en = english.results[0];
    const focusMins = logs.results.filter((l) => l.kind === "focus").reduce((a, l) => a + (l.mins || 0), 0);
    return json({
      day,
      study_mins: focusMins + (en?.minutes || 0),
      plans: plans.results,
      logs: logs.results,
      diary: diary.results[0] || null,
      english: en ? { ...en, blocks: JSON.parse(en.blocks || "{}") } : null,
      record: record.results[0] || null,
      notes: notes.results.map((n) => ({ id: n.id, title: n.title, created: n.created_at >= ms0 })),
    });
  });
}

// 같이 하기: 지금 공부 중 · 응원 · 주간 회고. 내용은 계속 비공개 — 서로에게는 숫자와 상태만 보여요.
//   GET/PUT /presence          지금 공부 중인지 (무엇을 하는지는 저장도, 전송도 안 해요)
//   POST /cheers, GET /cheers  하루(한국 시간) 한 번 응원
//   GET /review/week           한 주 숫자는 셋 다, 회고 글은 나만
//   POST /review/week/ai       AI가 내 기록만으로 회고 쓰기 (일기 본문은 절대 안 보내요)
import { aiJson } from "./ai.js";
import { kstToday } from "./lib/day.js";
import { PEERS } from "./teams.js";
import { focusKick } from "./hub.js";

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const KST = 9 * 3600e3;
const MAX_FOCUS = 12 * 3600e3;      // 집중 한 번은 12시간까지
const REGEN_GAP = 30e3;             // 회고 다시 만들기는 30초에 한 번
const PROMPT_BUDGET = 12_000;       // AI에게 보내는 기록 글자 수

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const realDay = (d) => typeof d === "string" && DAY_RE.test(d) && iso(Date.parse(d + "T00:00:00Z")) === d;
const kstStart = (day) => Date.parse(day + "T00:00:00+09:00");

// ISO 주: 월요일 시작, 그 주 목요일이 속한 해가 주의 해
export function isoWeekOf(day) {
  const t = Date.parse(day + "T00:00:00Z");
  const thu = t + (3 - ((new Date(t).getUTCDay() + 6) % 7)) * 864e5;
  const year = new Date(thu).getUTCFullYear();
  const week = Math.floor((thu - Date.UTC(year, 0, 1)) / 864e5 / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
// 'YYYY-Www' → 월요일~일요일. 없는 주(예: 2027-W53)면 null
export function weekRange(week) {
  const m = WEEK_RE.exec(week || "");
  if (!m) return null;
  const y = Number(m[1]), w = Number(m[2]);
  if (w < 1 || w > 53) return null;
  const jan4 = Date.UTC(y, 0, 4);
  const mon = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 864e5 + (w - 1) * 7 * 864e5;
  const from = iso(mon), to = iso(mon + 6 * 864e5);
  return isoWeekOf(from) === week ? { from, to } : null;
}

export function registerTogether(on, { json, body, fail, now }) {
  const pickWeek = (v) => {
    const week = v || isoWeekOf(kstToday());
    const r = weekRange(week);
    if (!r) fail(400, "주 형식이 올바르지 않아요. (예: 2026-W40)");
    return { week, ...r };
  };

  // ---------- 지금 공부 중 ----------
  // PUT { state: 'focus', ends_at(ms), started_at?(ms) } | { state: 'idle' }
  // started_at 을 안 보내면: 이미 공부 중이면 그대로, 아니면 지금부터
  on("PUT", "/presence", async ({ req, env, user }) => {
    const b = await body(req);
    const t = now();
    if (b.state === "idle") {
      await env.DB.prepare(
        "INSERT INTO presence (user_id, state, started_at, ends_at, updated_at) VALUES (?, 'idle', NULL, NULL, ?) ON CONFLICT(user_id) DO UPDATE SET state = 'idle', started_at = NULL, ends_at = NULL, updated_at = excluded.updated_at"
      ).bind(user.id, t).run();
      return json({ presence: { user_id: user.id, focus: false, started_at: null, ends_at: null } });
    }
    if (b.state !== "focus") fail(400, "상태는 focus 또는 idle 이에요.");
    const ends = Math.round(Number(b.ends_at));
    if (!Number.isFinite(ends) || ends <= t || ends > t + MAX_FOCUS) fail(400, "끝나는 시각이 올바르지 않아요.");
    let started;
    if (b.started_at != null) {
      started = Math.round(Number(b.started_at));
      if (!Number.isFinite(started) || started > t + 60e3 || started < t - MAX_FOCUS) fail(400, "시작 시각이 올바르지 않아요.");
      started = Math.min(started, t);
    } else {
      const cur = await env.DB.prepare("SELECT state, started_at, ends_at FROM presence WHERE user_id = ?").bind(user.id).first();
      started = cur && cur.state === "focus" && cur.ends_at > t && cur.started_at ? cur.started_at : t;
    }
    await env.DB.prepare(
      "INSERT INTO presence (user_id, state, started_at, ends_at, updated_at) VALUES (?, 'focus', ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET state = 'focus', started_at = excluded.started_at, ends_at = excluded.ends_at, updated_at = excluded.updated_at"
    ).bind(user.id, started, ends, t).run();
    await focusKick(env); // 끝나는 시각에 알람 → 앱이 닫혀 있어도 '집중 끝' 푸시 (hub.js focusTick)
    return json({ presence: { user_id: user.id, focus: true, started_at: started, ends_at: ends } });
  });

  // 방금(3분 안) 끝난 내 집중 — 서비스 워커가 푸시를 받으면 물어봐요. 앱이 열려 있었으면 이미 idle 이라 비어요
  on("GET", "/presence/ended", async ({ env, user }) => {
    const t = now();
    const r = await env.DB.prepare("SELECT started_at, ends_at FROM presence WHERE user_id = ? AND state = 'focus' AND ends_at <= ? AND ends_at > ?").bind(user.id, t + 5e3, t - 3 * 60e3).first();
    return json({ ended: r ? { mins: Math.round((r.ends_at - (r.started_at || r.ends_at)) / 60e3), ends_at: r.ends_at } : null });
  });

  // 멤버 전원. ends_at 이 지났으면 focus=false (타이머를 끄지 않고 창을 닫은 경우)
  on("GET", "/presence", async ({ env, user }) => {
    const t = now();
    const { results } = await env.DB.prepare(
      `SELECT u.id AS user_id, p.state, p.started_at, p.ends_at FROM users u LEFT JOIN presence p ON p.user_id = u.id WHERE u.id IN ${PEERS("?")} ORDER BY u.created_at`
    ).bind(user.id).all();
    const members = results.map((r) => {
      const focus = r.state === "focus" && r.ends_at > t;
      return { user_id: r.user_id, focus, started_at: focus ? r.started_at : null, ends_at: focus ? r.ends_at : null };
    });
    return json({ now: t, members });
  });

  // ---------- 응원 ----------
  on("POST", "/cheers", async ({ req, env, user }) => {
    const b = await body(req);
    if (typeof b.to !== "string" || !b.to) fail(400, "누구에게 응원할지 알려 주세요.");
    if (b.to === user.id) fail(400, "나에게는 응원할 수 없어요.");
    const to = await env.DB.prepare(`SELECT id FROM users WHERE id = ?1 AND id IN ${PEERS("?2")}`).bind(b.to, user.id).first();
    if (!to) fail(404, "없는 멤버예요.");
    const day = kstToday(), at = now();
    const r = await env.DB.prepare("INSERT OR IGNORE INTO cheers (from_id, to_id, day, created_at) VALUES (?, ?, ?, ?)").bind(user.id, b.to, day, at).run();
    if (!r.meta.changes) fail(409, "오늘은 이미 응원했어요. 내일 또 해 주세요.");
    return json({ cheer: { from_id: user.id, to_id: b.to, day, created_at: at } }, 201);
  });

  // 그날(기본 오늘) 내가 받은 응원과 내가 보낸 사람
  on("GET", "/cheers", async ({ env, q, user }) => {
    const day = q.get("day") || kstToday();
    if (!realDay(day)) fail(400, "날짜 형식이 올바르지 않아요.");
    const [got, sent] = await env.DB.batch([
      env.DB.prepare("SELECT from_id, created_at FROM cheers WHERE to_id = ? AND day = ? ORDER BY created_at").bind(user.id, day),
      env.DB.prepare("SELECT to_id FROM cheers WHERE from_id = ? AND day = ? ORDER BY created_at").bind(user.id, day),
    ]);
    return json({ day, received: got.results, sent: sent.results.map((r) => r.to_id) });
  });

  // ---------- 주간 회고 ----------
  // 숫자는 셋 다. study_mins = 집중 기록 + 영어 (캘린더·홈과 같은 정의)
  on("GET", "/review/week", async ({ env, q, user }) => {
    const { week, from, to } = pickWeek(q.get("week"));
    const P = ["D:" + from, "D:" + to];
    const [users, plans, focus, english, diary, score, cheers, active, mine] = await env.DB.batch([
      env.DB.prepare(`SELECT id FROM users WHERE id IN ${PEERS("?")} ORDER BY created_at`).bind(user.id),
      env.DB.prepare("SELECT user_id, COUNT(*) AS total, SUM(done) AS done FROM plans WHERE scope = 'day' AND period BETWEEN ? AND ? GROUP BY user_id").bind(...P),
      env.DB.prepare("SELECT user_id, SUM(COALESCE(mins, 0)) AS mins FROM logs WHERE kind = 'focus' AND day BETWEEN ? AND ? GROUP BY user_id").bind(from, to),
      env.DB.prepare("SELECT user_id, SUM(minutes) AS mins FROM english_days WHERE day BETWEEN ? AND ? GROUP BY user_id").bind(from, to),
      env.DB.prepare("SELECT user_id, COUNT(*) AS n FROM diaries WHERE day BETWEEN ? AND ? GROUP BY user_id").bind(from, to),
      env.DB.prepare("SELECT user_id, AVG(score) AS avg FROM day_records WHERE day BETWEEN ? AND ? AND score IS NOT NULL GROUP BY user_id").bind(from, to),
      env.DB.prepare("SELECT to_id AS user_id, COUNT(*) AS n FROM cheers WHERE day BETWEEN ? AND ? GROUP BY to_id").bind(from, to),
      // 뭔가 한 날: 실행 기록 · 영어 · 끝낸 할 일 · 일기 중 하나라도 있는 날
      env.DB.prepare(
        `SELECT user_id, COUNT(*) AS n FROM (
           SELECT user_id, day FROM logs WHERE day BETWEEN ?1 AND ?2
           UNION SELECT user_id, day FROM english_days WHERE day BETWEEN ?1 AND ?2 AND minutes > 0
           UNION SELECT user_id, substr(period, 3) FROM plans WHERE scope = 'day' AND done = 1 AND period BETWEEN ?3 AND ?4
           UNION SELECT user_id, day FROM diaries WHERE day BETWEEN ?1 AND ?2
         ) GROUP BY user_id`
      ).bind(from, to, ...P),
      env.DB.prepare("SELECT body, created_at FROM weekly_reviews WHERE user_id = ? AND week = ?").bind(user.id, week),
    ]);
    const by = (res, key = "user_id") => new Map(res.results.map((r) => [r[key], r]));
    const [pl, fo, en, di, sc, ch, ac] = [plans, focus, english, diary, score, cheers, active].map((r) => by(r));
    const members = users.results.map(({ id }) => {
      const focus_mins = fo.get(id)?.mins || 0, english_mins = en.get(id)?.mins || 0, avg = sc.get(id)?.avg;
      return {
        user_id: id,
        plans_done: pl.get(id)?.done || 0,
        plans_total: pl.get(id)?.total || 0,
        focus_mins, english_mins,
        study_mins: focus_mins + english_mins,
        diary_days: di.get(id)?.n || 0,
        active_days: ac.get(id)?.n || 0,
        score_avg: avg == null ? null : Math.round(avg),
        cheers: ch.get(id)?.n || 0,
      };
    });
    return json({ week, from, to, members, mine: mine.results[0] || null });
  });

  on("POST", "/review/week/ai", async ({ req, env, user }) => {
    const b = await body(req);
    const w = pickWeek(b.week);
    const prev = await env.DB.prepare("SELECT created_at FROM weekly_reviews WHERE user_id = ? AND week = ?").bind(user.id, w.week).first();
    if (prev && now() - prev.created_at < REGEN_GAP) fail(429, "방금 만들었어요. 잠시 뒤에 다시 눌러 주세요.");
    const r = await makeReview(env, user.id, w);
    if (r.empty) fail(400, "이번 주에는 돌아볼 기록이 아직 없어요.");
    if (r.error) fail(r.status, r.error);
    return json({ review: { body: r.body, created_at: r.created_at } });
  });
}

// ---------- 회고 만들기 (API와 크론이 같이 써요) ----------
const SYSTEM = [
  "너는 작은 공부 모임의 다정하지만 솔직한 코치야. 한 사람의 한 주 공부 기록을 보고 짧은 회고를 써.",
  "항상 쉬운 한국어 존댓말(~요). 4~8줄, 한 줄에 한 문장, 60자 안팎.",
  "순서: 잘한 점(숫자 근거) → 밀린 점 → 마지막 줄은 다음 주에 해 볼 구체적인 제안 하나('다음 주엔'으로 시작).",
  "기록에 없는 일은 지어내지 마. 이모지·마크다운·번호 금지.",
  '출력은 JSON {"lines": ["첫 줄", "둘째 줄", ...]} 하나만.',
].join("\n");

// 내 기록만 모아요: 계획(제목·완료·집중 분), 실행 기록, 영어, 하루 점수, 노트 제목. 일기는 읽지도 않아요.
async function weekFacts(env, userId, { week, from, to }) {
  const [goals, plans, logs, english, records, notes] = await env.DB.batch([
    env.DB.prepare("SELECT text, done FROM plans WHERE user_id = ? AND scope = 'week' AND period = ? ORDER BY sort, created_at").bind(userId, "W:" + week),
    env.DB.prepare(
      "SELECT substr(p.period, 3) AS day, p.text, p.done, p.mins, (SELECT COALESCE(SUM(l.mins), 0) FROM logs l WHERE l.plan_id = p.id AND l.kind = 'focus') AS focus FROM plans p WHERE p.user_id = ? AND p.scope = 'day' AND p.period BETWEEN ? AND ? ORDER BY p.period, p.sort, p.created_at"
    ).bind(userId, "D:" + from, "D:" + to),
    env.DB.prepare("SELECT day, at, text, kind, mins FROM logs WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day, at LIMIT 200").bind(userId, from, to),
    env.DB.prepare("SELECT day, minutes, spoken, newwords, mistakes FROM english_days WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day").bind(userId, from, to),
    env.DB.prepare("SELECT day, score FROM day_records WHERE user_id = ? AND day BETWEEN ? AND ? AND score IS NOT NULL ORDER BY day").bind(userId, from, to),
    env.DB.prepare("SELECT title FROM notes WHERE user_id = ? AND updated_at >= ? AND updated_at < ? ORDER BY updated_at DESC LIMIT 40").bind(userId, kstStart(from), kstStart(to) + 864e5),
  ]);
  const G = goals.results, P = plans.results, L = logs.results, E = english.results, R = records.results, N = notes.results;
  if (!P.length && !L.length && !E.length && !N.length) return null;
  const focus = L.filter((l) => l.kind === "focus").reduce((a, l) => a + (l.mins || 0), 0);
  const eng = E.reduce((a, e) => a + (e.minutes || 0), 0);
  const lines = [
    `기간: ${week} (${from} ~ ${to})`,
    `합계: 할 일 ${P.filter((p) => p.done).length}/${P.length}개 끝냄 · 집중 ${focus}분 · 영어 ${eng}분 · 공부 ${focus + eng}분`,
    G.length ? "## 이번 주 목표\n" + G.map((g) => `- ${g.done ? "[완료]" : "[ ]"} ${g.text}`).join("\n") : "",
    P.length ? "## 날짜별 할 일\n" + P.map((p) => `- ${p.day} ${p.done ? "[완료]" : "[못함]"} ${p.text}${p.mins ? ` (계획 ${p.mins}분)` : ""}${p.focus ? ` (집중 ${p.focus}분)` : ""}`).join("\n") : "",
    L.length ? "## 실행 기록\n" + L.map((l) => `- ${l.day} ${l.at} ${l.kind === "focus" ? `집중 ${l.mins || 0}분` : l.kind === "done" ? "끝냄" : "메모"}: ${l.text}`).join("\n") : "",
    E.length ? "## 영어\n" + E.map((e) => `- ${e.day} ${e.minutes}분 (말하기·소리 ${e.spoken}분, 새 단어 ${e.newwords}, 실수 ${e.mistakes})`).join("\n") : "",
    R.length ? "## 하루 점수\n" + R.map((r) => `- ${r.day} ${r.score}점`).join("\n") : "",
    N.length ? "## 이번 주에 쓴 노트 제목\n" + N.map((n) => n.title).join(", ") : "",
  ];
  return lines.filter(Boolean).join("\n").slice(0, PROMPT_BUDGET);
}

const cleanLine = (s) => String(s || "").replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").replace(/[*_`#]/g, "").trim().slice(0, 200);

// → { body, created_at } | { empty: true } | { error, status }
async function makeReview(env, userId, w) {
  const facts = await weekFacts(env, userId, w);
  if (!facts) return { empty: true };
  let data;
  const pick = await env.DB.prepare("SELECT ai_model FROM users WHERE id = ?").bind(userId).first().catch(() => null);
  try { ({ data } = await aiJson(env, SYSTEM, facts, pick?.ai_model || null, { private: true })); } // 계획 · 기록 · 노트 제목 → Groq 만
  catch (e) {
    if (e.private) return { status: e.status || 502, error: e.message };
    if (e.status === 503) return { status: 503, error: "AI 키가 없어서 회고를 만들 수 없어요. 숫자 회고는 그대로 볼 수 있어요." };
    return { status: 502, error: e.message || "AI 답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  }
  const raw = Array.isArray(data?.lines) ? data.lines : typeof data?.body === "string" ? data.body.split("\n") : [];
  const lines = raw.map(cleanLine).filter(Boolean).slice(0, 8);
  if (!lines.length) return { status: 502, error: "AI가 빈 회고를 보냈어요. 다시 눌러 주세요." };
  const body = lines.join("\n"), created_at = Date.now();
  await env.DB.prepare(
    "INSERT INTO weekly_reviews (user_id, week, body, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, week) DO UPDATE SET body = excluded.body, created_at = excluded.created_at"
  ).bind(userId, w.week, body, created_at).run();
  return { body, created_at };
}

// 일요일 22:00 (한국 시간): 이번 주 활동이 있는 사람 것을 미리 만들어요.
// 그날(일요일) 이미 직접 만든 회고가 있으면 덮어쓰지 않아요.
export async function weeklyReviewCron(env) {
  const today = kstToday();
  const week = isoWeekOf(today);
  const w = { week, ...weekRange(week) };
  const sunday = kstStart(w.to);
  const { results } = await env.DB.prepare(
    `SELECT u.id FROM users u
     WHERE (EXISTS (SELECT 1 FROM plans p WHERE p.user_id = u.id AND p.scope = 'day' AND p.period BETWEEN ?1 AND ?2)
         OR EXISTS (SELECT 1 FROM logs l WHERE l.user_id = u.id AND l.day BETWEEN ?3 AND ?4)
         OR EXISTS (SELECT 1 FROM english_days e WHERE e.user_id = u.id AND e.day BETWEEN ?3 AND ?4))
       AND NOT EXISTS (SELECT 1 FROM weekly_reviews r WHERE r.user_id = u.id AND r.week = ?5 AND r.created_at >= ?6)`
  ).bind("D:" + w.from, "D:" + w.to, w.from, w.to, week, sunday).all();
  let made = 0;
  const skipped = [];
  for (const u of results) {
    try {
      const r = await makeReview(env, u.id, w);
      if (r.body) made++;
      else if (r.status === 503) return { week, made, skipped: "AI 키 없음" };
      else if (r.error) skipped.push(r.error);
    } catch (e) { skipped.push(String(e.message || e)); }
  }
  return { week, made, skipped: skipped.join(" / ") };
}

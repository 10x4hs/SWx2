// 영어 공부 (ENGLISH-OS 연동): 하루 블록 기록 · 내가 막힌 표현 · 라이트너 복습 카드
// 전부 본인 것만 읽고 써요 — 다른 사람 id 는 아예 받지 않아요.
// 공부 내용(문장·패턴·일정)은 public/english/data.json (scripts/english-import.mjs 가 볼트에서 만들어요)

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const BLOCKS = ["words", "sound", "speak", "recall"];      // 매일 4블록
const EXTRA_BLOCKS = ["pattern", "review"];                // 주말에만 있는 블록
const MOODS = ["좋음", "보통", "나쁨"];
const MAX_TEXT = 2000;
const MAX_BLOCK = 600;          // 한 블록 최대 10시간
const MAX_CHECKS = 20;
const MAX_RANGE = 400;          // days 조회는 400일까지
const LEITNER_GAP = [0, 1, 2, 4, 7, 15]; // 상자 번호 → 다음 복습까지 며칠

const toMs = (day) => Date.parse(day + "T00:00:00Z");
// 2026-02-30 같은 없는 날짜도 걸러요
const realDay = (d) => typeof d === "string" && DAY_RE.test(d) && new Date(toMs(d)).toISOString().slice(0, 10) === d;
const addDays = (day, n) => new Date(toMs(day) + n * 864e5).toISOString().slice(0, 10);

export function registerEnglish(on, { json, body, fail, uid, now }) {
  const dayOf = (v) => (realDay(v) ? v : fail(400, "날짜 형식이 올바르지 않아요."));
  const count = (v, max, name) => {
    if (v == null || v === "") return 0;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > max) fail(400, `${name}은(는) 0~${max} 사이 정수로 적어 주세요.`);
    return n;
  };
  const text = (v, name) => {
    if (v == null) return null;
    if (typeof v !== "string") fail(400, `${name} 형식이 올바르지 않아요.`);
    const s = v.trim();
    if (s.length > MAX_TEXT) fail(400, `${name}은(는) ${MAX_TEXT}자까지 쓸 수 있어요.`);
    return s || null;
  };

  // DB 줄 → 응답 모양
  const shapeDay = (r) => {
    if (!r) return null;
    let blocks = {}, checks = [];
    try { blocks = JSON.parse(r.blocks) || {}; } catch {}
    try { checks = JSON.parse(r.checks) || []; } catch {}
    const out = {};
    for (const k of BLOCKS) out[k] = blocks[k] || 0;
    for (const k of EXTRA_BLOCKS) if (blocks[k] != null) out[k] = blocks[k];
    return { day: r.day, blocks: out, checks, minutes: r.minutes, spoken: r.spoken, newwords: r.newwords, mistakes: r.mistakes, mood: r.mood, sentence: r.sentence, note: r.note, updated_at: r.updated_at };
  };
  const DAY_COLS = "day, blocks, checks, minutes, spoken, newwords, mistakes, mood, sentence, note, updated_at";

  // ---------- 하루 기록 ----------
  on("GET", "/english/day", async ({ env, q, user }) => {
    const day = dayOf(q.get("day"));
    const r = await env.DB.prepare(`SELECT ${DAY_COLS} FROM english_days WHERE user_id = ? AND day = ?`).bind(user.id, day).first();
    return json({ day: shapeDay(r) });
  });

  on("PUT", "/english/day", async ({ req, env, user }) => {
    const b = await body(req);
    const day = dayOf(b.day);
    const src = b.blocks && typeof b.blocks === "object" && !Array.isArray(b.blocks) ? b.blocks : {};
    const blocks = {};
    for (const k of BLOCKS) blocks[k] = count(src[k], MAX_BLOCK, "블록 분");
    for (const k of EXTRA_BLOCKS) if (src[k] != null && src[k] !== "") blocks[k] = count(src[k], MAX_BLOCK, "블록 분");
    if (b.checks != null && !Array.isArray(b.checks)) fail(400, "체크리스트 형식이 올바르지 않아요.");
    const checks = (b.checks || []).slice(0, MAX_CHECKS).map((c) => c === true);
    const newwords = count(b.newwords, 10000, "새 단어 수");
    const mistakes = count(b.mistakes, 10000, "틀린 수");
    const mood = b.mood == null || b.mood === "" ? null : MOODS.includes(b.mood) ? b.mood : fail(400, "컨디션은 좋음·보통·나쁨 중에서 골라 주세요.");
    const sentence = text(b.sentence, "오늘의 한 문장");
    const note = text(b.note, "메모");
    // 합계는 서버가 계산해요: 공부 시간 = 블록 합, 입 연 시간 = 소리 + 말하기
    const minutes = Object.values(blocks).reduce((a, n) => a + n, 0);
    const spoken = blocks.sound + blocks.speak;

    // 전부 비었으면 줄을 지워요
    if (!minutes && !newwords && !mistakes && !mood && !sentence && !note && !checks.some(Boolean)) {
      await env.DB.prepare("DELETE FROM english_days WHERE user_id = ? AND day = ?").bind(user.id, day).run();
      return json({ day: null });
    }
    const at = now();
    await env.DB.prepare(
      `INSERT INTO english_days (user_id, ${DAY_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET blocks = excluded.blocks, checks = excluded.checks, minutes = excluded.minutes, spoken = excluded.spoken,
         newwords = excluded.newwords, mistakes = excluded.mistakes, mood = excluded.mood, sentence = excluded.sentence, note = excluded.note, updated_at = excluded.updated_at`
    ).bind(user.id, day, JSON.stringify(blocks), JSON.stringify(checks), minutes, spoken, newwords, mistakes, mood, sentence, note, at).run();
    return json({ day: shapeDay({ day, blocks: JSON.stringify(blocks), checks: JSON.stringify(checks), minutes, spoken, newwords, mistakes, mood, sentence, note, updated_at: at }) });
  });

  // 기간 요약 (잔디·그래프용)
  on("GET", "/english/days", async ({ env, q, user }) => {
    const from = dayOf(q.get("from")), to = dayOf(q.get("to"));
    if (from > to) fail(400, "시작 날짜가 끝 날짜보다 늦어요.");
    if ((toMs(to) - toMs(from)) / 864e5 + 1 > MAX_RANGE) fail(400, `한 번에 ${MAX_RANGE}일까지만 볼 수 있어요.`);
    const { results } = await env.DB.prepare(
      "SELECT day, minutes, spoken, newwords, mistakes, mood FROM english_days WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day"
    ).bind(user.id, from, to).all();
    return json({ days: results });
  });

  // ---------- 내가 막힌 표현 ----------
  on("GET", "/english/phrases", async ({ env, user }) => {
    const { results } = await env.DB.prepare(
      "SELECT id, day, ko, en, chunk, created_at FROM english_phrases WHERE user_id = ? ORDER BY created_at DESC LIMIT 2000"
    ).bind(user.id).all();
    return json({ phrases: results });
  });

  on("POST", "/english/phrases", async ({ req, env, user }) => {
    const b = await body(req);
    const ko = text(b.ko, "한국어");
    if (!ko) fail(400, "한국어로 하고 싶었던 말을 적어 주세요.");
    const day = b.day == null || b.day === "" ? null : dayOf(b.day);
    const phrase = { id: uid(), day, ko, en: text(b.en, "영어"), chunk: text(b.chunk, "덩어리"), created_at: now() };
    await env.DB.prepare("INSERT INTO english_phrases (id, user_id, day, ko, en, chunk, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(phrase.id, user.id, phrase.day, phrase.ko, phrase.en, phrase.chunk, phrase.created_at).run();
    return json({ phrase }, 201);
  });

  on("DELETE", "/english/phrases/:id", async ({ env, params, user }) => {
    const r = await env.DB.prepare("DELETE FROM english_phrases WHERE id = ? AND user_id = ?").bind(params.id, user.id).run();
    if (!r.meta.changes) fail(404, "없는 표현이에요.");
    // 이 표현으로 만든 복습 카드도 같이 치워요
    await env.DB.prepare("DELETE FROM english_cards WHERE user_id = ? AND card_id = ?").bind(user.id, "ph:" + params.id).run();
    return json({ ok: true });
  });

  // ---------- 복습 카드 (라이트너) ----------
  on("GET", "/english/cards", async ({ env, user }) => {
    const { results } = await env.DB.prepare("SELECT card_id, box, due, reps, last FROM english_cards WHERE user_id = ? ORDER BY due, card_id").bind(user.id).all();
    return json({ cards: results });
  });

  // good → 한 상자 위로 (최대 5), again → 1번 상자로. 다음 복습 = today + [0,1,2,4,7,15][상자]
  on("POST", "/english/cards/review", async ({ req, env, user }) => {
    const b = await body(req);
    const id = typeof b.card_id === "string" ? b.card_id.trim() : "";
    if (!id || id.length > 40 || /[\u0000-\u001f]/.test(id)) fail(400, "카드 id 는 1~40자로 보내 주세요.");
    if (b.result !== "good" && b.result !== "again") fail(400, "결과는 good 또는 again 이어야 해요.");
    const today = dayOf(b.today);
    const old = await env.DB.prepare("SELECT box, reps FROM english_cards WHERE user_id = ? AND card_id = ?").bind(user.id, id).first();
    const box = b.result === "good" ? Math.min(5, (old?.box || 0) + 1) : 1;
    const card = { card_id: id, box, due: addDays(today, LEITNER_GAP[box]), reps: (old?.reps || 0) + 1, last: now() };
    await env.DB.prepare(
      `INSERT INTO english_cards (user_id, card_id, box, due, reps, last) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id) DO UPDATE SET box = excluded.box, due = excluded.due, reps = excluded.reps, last = excluded.last`
    ).bind(user.id, id, card.box, card.due, card.reps, card.last).run();
    return json({ card });
  });
}

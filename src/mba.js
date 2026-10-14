// 경영 마이크로디그리 (#/mba) — 모듈 12개 × 카드. 내용은 정적 파일(public/mba/*.json), 여기선 사람별 기록만 다뤄요.
//   GET  /mba/state      읽은 카드 · 복습 단계 · 오늘 복습할 카드 · 끝낸 케이스 · 문제 · 강의 · 최근 24주(168일) 하루 기록
//   PUT  /mba/read       카드를 다 읽음 (stage 1 · 1일 뒤 복습) — 다시 읽어도 단계는 그대로
//   PUT  /mba/review     복습 결과 → 절반 이상 맞히면 다음 간격(1 → 3 → 7 → 21 → 60일 → 끝), 아니면 한 단계 뒤로 · 내일 다시
//   PUT  /mba/day        오늘 공부한 분 더하기 · '내일 한 줄'
//   PUT  /mba/done       케이스 · 연습문제 · 강의를 끝냄 (done:false 면 취소) — 문제는 score/total
//   POST /mba/ask        그 카드 내용(+ 화면의 지금 값)을 넣은 AI 튜터 (SSE · 쉽게/깊게)
import { aiText } from "./ai.js";
import { kstTodayReq } from "./lib/day.js";

const GAP = [0, 1, 3, 7, 21, 60]; // stage → 다음 복습까지 날 수
const DONE = 6;
const MAX_TURNS = 12;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const num = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

// 정적 파일 읽기 (같은 워커의 assets). 목록은 잠깐 기억해 둬요
let idxCache = null, idxAt = 0;
async function asset(env, url, path) {
  const r = await env.ASSETS.fetch(new Request(new URL(path, url)));
  if (!r.ok) return null;
  return r.json();
}
async function index(env, url) {
  if (idxCache && Date.now() - idxAt < 60e3) return idxCache;
  const j = await asset(env, url, "/mba/index.json");
  if (j) { idxCache = j; idxAt = Date.now(); }
  return j || { modules: [] };
}

export function registerMba(on, { json, body, fail, now }) {
  // module/card 가 목록에 있는지 — 없는 id 는 400
  // kinds: 어떤 목록에서 찾을지 — 읽음 · 복습은 카드만, 튜터는 카드와 케이스
  async function place(env, url, b, kinds = ["cards"]) {
    const module = typeof b.module === "string" && ID_RE.test(b.module) ? b.module : fail(400, "없는 모듈이에요.");
    const card = typeof b.card === "string" && ID_RE.test(b.card) ? b.card : fail(400, "없는 카드예요.");
    const m = (await index(env, url)).modules.find((x) => x.id === module);
    if (!m) fail(400, "없는 모듈이에요.");
    if (!kinds.some((k) => (m[k] || []).some((c) => c.id === card))) fail(400, "없는 카드예요.");
    return { module, card };
  }
  async function state(req, env, uid) {
    const today = kstTodayReq(req, env), from = addDay(today, -167);
    const [r, d, k] = await env.DB.batch([
      env.DB.prepare("SELECT module, card, stage, due_day, read_at, correct, total, reviews FROM mba_reads WHERE user_id = ? ORDER BY read_at").bind(uid),
      env.DB.prepare("SELECT day, minutes, plan FROM mba_days WHERE user_id = ? AND day >= ? ORDER BY day").bind(uid, from),
      env.DB.prepare("SELECT module, item, kind, score, total, done_at FROM mba_done WHERE user_id = ? ORDER BY done_at").bind(uid),
    ]);
    const items = r.results;
    return { today, items, due: items.filter((x) => x.stage < DONE && x.due_day <= today).map((x) => ({ module: x.module, card: x.card, stage: x.stage })), days: d.results, done: k.results };
  }
  on("GET", "/mba/state", async ({ req, env, user }) => json(await state(req, env, user.id)));

  on("PUT", "/mba/read", async ({ req, env, url, user }) => {
    const b = await body(req), { module, card } = await place(env, url, b), today = kstTodayReq(req, env), t = now();
    const correct = num(b.correct, 20), total = num(b.total, 20);
    if (correct != null && (total == null || correct > total)) fail(400, "퀴즈 결과가 이상해요.");
    await env.DB.prepare(`INSERT INTO mba_reads (user_id, module, card, stage, due_day, read_at, correct, total, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, module, card) DO UPDATE SET correct = COALESCE(excluded.correct, correct), total = COALESCE(excluded.total, total), updated_at = excluded.updated_at`)
      .bind(user.id, module, card, addDay(today, GAP[1]), t, correct, total, t).run();
    return json(await state(req, env, user.id));
  });

  on("PUT", "/mba/review", async ({ req, env, user }) => {
    const b = await body(req), today = kstTodayReq(req, env), t = now();
    const list = Array.isArray(b.results) ? b.results.slice(0, 60) : fail(400, "results 가 필요해요.");
    const rows = new Map((await env.DB.prepare("SELECT module, card, stage FROM mba_reads WHERE user_id = ?").bind(user.id).all()).results.map((r) => [r.module + "/" + r.card, r.stage]));
    const stmts = [];
    for (const r of list) {
      if (!r || typeof r !== "object" || !ID_RE.test(String(r.module)) || !ID_RE.test(String(r.card))) continue;
      const key = r.module + "/" + r.card, correct = num(r.correct, 20), total = num(r.total, 20);
      if (correct == null || !total || correct > total || !rows.has(key)) continue;
      // 절반 이상 맞히면 다음 간격으로, 아니면 한 단계 뒤로 가서 내일 다시
      const st = rows.get(key), ok = correct * 2 >= total;
      const next = ok ? Math.min(DONE, st + 1) : Math.max(1, st - 1);
      const due = next >= DONE ? "9999-12-31" : addDay(today, ok ? GAP[next] : 1);
      stmts.push(env.DB.prepare("UPDATE mba_reads SET stage = ?, due_day = ?, correct = ?, total = ?, reviews = reviews + 1, updated_at = ? WHERE user_id = ? AND module = ? AND card = ?")
        .bind(next, due, correct, total, t, user.id, r.module, r.card));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json(await state(req, env, user.id));
  });

  on("PUT", "/mba/done", async ({ req, env, url, user }) => {
    const b = await body(req);
    const module = typeof b.module === "string" && ID_RE.test(b.module) ? b.module : fail(400, "없는 모듈이에요.");
    const item = typeof b.item === "string" && ID_RE.test(b.item) ? b.item : fail(400, "없는 항목이에요.");
    const kind = ["case", "problem", "lecture"].includes(b.kind) ? b.kind : fail(400, "kind 는 case · problem · lecture 예요.");
    const m = (await index(env, url)).modules.find((x) => x.id === module);
    const list = m && { case: m.cases, problem: m.problems, lecture: m.lectures }[kind];
    if (!list || !list.some((x) => x.id === item)) fail(400, "없는 항목이에요.");
    if (b.done === false) await env.DB.prepare("DELETE FROM mba_done WHERE user_id = ? AND module = ? AND item = ?").bind(user.id, module, item).run();
    else {
      const score = num(b.score, 20), total = num(b.total, 20);
      if (score != null && (total == null || score > total)) fail(400, "점수가 이상해요.");
      await env.DB.prepare(`INSERT INTO mba_done (user_id, module, item, kind, score, total, done_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, module, item) DO UPDATE SET score = excluded.score, total = excluded.total, done_at = excluded.done_at`)
        .bind(user.id, module, item, kind, score, total, now()).run();
    }
    return json(await state(req, env, user.id));
  });

  on("PUT", "/mba/day", async ({ req, env, user }) => {
    const b = await body(req), today = kstTodayReq(req, env), t = now();
    const add = num(b.minutes, 240) ?? 0;
    const plan = typeof b.plan === "string" ? b.plan.trim().slice(0, 140) : null;
    if (!add && plan == null) fail(400, "minutes 나 plan 이 필요해요.");
    await env.DB.prepare(`INSERT INTO mba_days (user_id, day, minutes, plan, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, day) DO UPDATE SET minutes = MIN(600, minutes + excluded.minutes), plan = COALESCE(excluded.plan, plan), updated_at = excluded.updated_at`)
      .bind(user.id, today, add, plan, t).run();
    return json(await state(req, env, user.id));
  });

  // 튜터: 그 카드의 생각 · 예시 · 낱말 + 화면의 지금 값(context)을 시스템 프롬프트에 넣어요. level = easy(기본) | deep
  on("POST", "/mba/ask", async ({ req, env, url, q, ec }) => {
    const b = await body(req), { module, card } = await place(env, url, b, ["cards", "cases"]);
    const msgs = Array.isArray(b.messages) ? b.messages.slice(-MAX_TURNS) : [];
    const clean = msgs.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (!clean.length || clean[clean.length - 1].role !== "user") fail(400, "질문을 적어 주세요.");
    const doc = await asset(env, url, `/mba/${module}.json`), c = doc?.cards?.find((x) => x.id === card), cs = c ? null : doc?.cases?.find((x) => x.id === card);
    if (!c && !cs) fail(404, "카드를 찾지 못했어요.");
    const context = typeof b.context === "string" ? b.context.trim().slice(0, cs ? 2000 : 600) : "";
    const deep = b.level === "deep";
    const rules = `규칙: 쉬운 한국어 해요체, 짧은 문단. ${deep ? "지금은 '깊게' 모드예요 — 원어 용어 · 공식 · 교과서 이름을 써도 돼요. 정확하게, 근거가 있으면 출처를 말해요." : "지금은 '쉽게' 모드예요 — 일상 비유 먼저, 처음 쓰는 용어는 그 자리에서 한 줄로 풀어요."} 숫자를 쓸 때는 계산을 한 줄로 보여 줘. 자료에 없는 통계 · 법 조문 · 세율은 지어내지 말고 "확인이 필요해요"라고 해. 법 · 세금 · 노무는 전문가(변호사 · 세무사 · 노무사) 확인이 필요하다고 덧붙여. 답 끝에 학생이 스스로 떠올려 볼 질문 하나를 '한번 생각해 볼까요?' 로 붙여.`;
    const sys = (cs ? `너는 "경영 마이크로디그리"의 케이스 토론 코치야. 학생은 MBA 대학원에 가는 대신 하루 1~2시간씩 경영을 스스로 배우는 한국 학생이야. 지금 푸는 케이스: 《${doc.title}》 ${cs.title}.
${rules} 케이스 질문에는 답을 바로 주지 말고, 학생이 먼저 생각을 말하게 묻고 힌트를 한 단계씩 줘. 학생이 자기 답을 말하면 근거 · 계산 · 빠진 관점을 짚어 줘.
[상황] ${(cs.story || []).join(" ")}
${cs.data ? `[데이터] ${[cs.data.cols.join(" | "), ...cs.data.rows.map((r) => r.join(" | "))].join(" / ")}` : ""}
[질문] ${(cs.questions || []).map((q, i) => `${i + 1}) ${q.q}`).join(" ")}
[좋은 답의 방향 — 학생에게 그대로 주지 말 것] ${(cs.questions || []).map((q, i) => `${i + 1}) ${(q.answer || []).join(" ")}`).join(" ")}
${context ? `[학생이 지금까지 적은 답] ${context}` : ""}` : `너는 "경영 마이크로디그리"의 튜터야. 학생은 MBA 대학원에 가는 대신 하루 1~2시간씩 경영을 스스로 배우는 한국 학생이야. 지금 보는 카드: 《${doc.title}》 ${c.title}.
${rules}
[이 카드의 생각] ${(c.idea || []).join(" ")}
${c.example ? `[숫자 예시] ${c.example}` : ""}
${c.deep?.length ? `[더 자세히] ${c.deep.join(" ")}` : ""}
${c.words?.length ? `[낱말] ${c.words.map((w) => `${w.term}${w.en ? `(${w.en})` : ""}=${w.easy}`).join(" · ")}` : ""}
${c.recall ? `[떠올리기] ${c.recall.q} → ${c.recall.a}` : ""}
${context ? `[학생 화면의 지금 값] ${context}` : ""}`).replace(/\*\*/g, "");
    if (q.get("stream") === "0") {
      try { const r = await aiText(env, sys, clean); return json({ text: r.text, used: r.used }); }
      catch (e) { fail(e.status || 502, e.message || "AI 답을 받지 못했어요."); }
    }
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter(), enc = new TextEncoder();
    let open = true;
    const send = async (o) => { if (!open) return; try { await writer.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { open = false; } };
    ec.waitUntil((async () => {
      try {
        const r = await aiText(env, sys, clean, undefined, (t, meta) => (meta?.reset ? send({ type: "reset" }) : send({ type: "delta", text: t })));
        await send({ type: "end", text: r.text, used: r.used });
      } catch (e) { await send({ type: "error", message: e.message || "AI 답을 받지 못했어요." }); }
      open = false; try { await writer.close(); } catch {}
    })());
    return new Response(readable, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  });
}

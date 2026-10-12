// AI 공부책 (#/books) — 책 여러 권 × 장. 내용은 정적 파일(public/books/*.json), 여기선 사람별 기록만 다뤄요.
//   GET  /books/state            읽은 장 · 복습 단계 · 오늘 복습할 장 · 실습 체크
//   PUT  /books/read             장을 다 읽음 (stage 1 · 1일 뒤 복습) — 다시 읽어도 단계는 그대로
//   PUT  /books/review           복습 퀴즈 결과 → 절반 이상이면 다음 간격(3일 → 7일 → 끝), 아니면 내일 다시
//   PUT  /books/task             이번 주 실습 체크
//   POST /books/ask              그 장의 내용을 넣은 AI 튜터 (SSE · 쉽게/깊게)
// 복습 규칙은 논문 쉽게 읽기(papers.js easy_reads)와 같아요 — 1 → 3 → 7일 간격 (Cepeda 2008).
import { aiText } from "./ai.js";
import { kstTodayReq } from "./lib/day.js";

const GAP = [0, 1, 3, 7];
const MAX_TURNS = 12;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const TASK_RE = /^[a-z0-9-]+\/[a-z0-9-]+\/\d{1,2}$/;
const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const num = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

// 정적 파일 읽기 (같은 워커의 assets). 책 목록은 잠깐 기억해 둬요
let idxCache = null, idxAt = 0;
async function asset(env, url, path) {
  const r = await env.ASSETS.fetch(new Request(new URL(path, url)));
  if (!r.ok) return null;
  return r.json();
}
async function index(env, url) {
  if (idxCache && Date.now() - idxAt < 60e3) return idxCache;
  const j = await asset(env, url, "/books/index.json");
  if (j) { idxCache = j; idxAt = Date.now(); }
  return j || { books: [] };
}

export function registerBooks(on, { json, body, fail, now }) {
  // book/chapter 가 목록에 있는지 — 없는 id 는 400
  async function place(env, url, b) {
    const book = typeof b.book === "string" && ID_RE.test(b.book) ? b.book : fail(400, "없는 책이에요.");
    const chapter = typeof b.chapter === "string" && ID_RE.test(b.chapter) ? b.chapter : fail(400, "없는 장이에요.");
    const idx = await index(env, url), bk = idx.books.find((x) => x.id === book);
    if (!bk) fail(400, "없는 책이에요.");
    if (!(bk.chapters || []).some((c) => c.id === chapter)) fail(400, "없는 장이에요.");
    return { book, chapter };
  }
  async function state(req, env, uid) {
    const today = kstTodayReq(req, env);
    const [{ results }, t] = await Promise.all([
      env.DB.prepare("SELECT book, chapter, stage, due_day, read_at, recall, recall_total, reviews FROM book_reads WHERE user_id = ? ORDER BY read_at").bind(uid).all(),
      env.DB.prepare("SELECT task FROM book_tasks WHERE user_id = ?").bind(uid).all(),
    ]);
    return { today, items: results, due: results.filter((r) => r.stage < 4 && r.due_day <= today).map((r) => ({ book: r.book, chapter: r.chapter })), tasks: t.results.map((r) => r.task) };
  }
  on("GET", "/books/state", async ({ req, env, user }) => json(await state(req, env, user.id)));

  on("PUT", "/books/read", async ({ req, env, url, user }) => {
    const b = await body(req), { book, chapter } = await place(env, url, b), today = kstTodayReq(req, env), t = now();
    const recall = num(b.recall, 20), total = num(b.total, 20);
    await env.DB.prepare(`INSERT INTO book_reads (user_id, book, chapter, stage, due_day, read_at, recall, recall_total, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, book, chapter) DO UPDATE SET recall = COALESCE(excluded.recall, recall), recall_total = COALESCE(excluded.recall_total, recall_total), updated_at = excluded.updated_at`)
      .bind(user.id, book, chapter, addDay(today, GAP[1]), t, recall, total, t).run();
    return json(await state(req, env, user.id));
  });

  on("PUT", "/books/review", async ({ req, env, url, user }) => {
    const b = await body(req), today = kstTodayReq(req, env), t = now();
    const list = Array.isArray(b.results) ? b.results.slice(0, 40) : fail(400, "results 가 필요해요.");
    const rows = new Map((await env.DB.prepare("SELECT book, chapter, stage FROM book_reads WHERE user_id = ?").bind(user.id).all()).results.map((r) => [r.book + "/" + r.chapter, r.stage]));
    const stmts = [];
    for (const r of list) {
      if (!r || typeof r !== "object") continue;
      const key = r.book + "/" + r.chapter, correct = num(r.correct, 20), total = num(r.total, 20);
      if (correct == null || !total || correct > total || !rows.has(key) || !ID_RE.test(String(r.book)) || !ID_RE.test(String(r.chapter))) continue;
      // 절반 이상 맞히면 다음 간격으로, 아니면 내일 다시
      const st = rows.get(key), next = correct * 2 >= total ? Math.min(4, st + 1) : st;
      stmts.push(env.DB.prepare("UPDATE book_reads SET stage = ?, due_day = ?, reviews = reviews + 1, updated_at = ? WHERE user_id = ? AND book = ? AND chapter = ?")
        .bind(next, next >= 4 ? "9999-12-31" : addDay(today, next === st ? 1 : GAP[next]), t, user.id, r.book, r.chapter));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json(await state(req, env, user.id));
  });

  on("PUT", "/books/task", async ({ req, env, user }) => {
    const b = await body(req);
    const task = typeof b.task === "string" && TASK_RE.test(b.task) ? b.task : fail(400, "task 모양이 아니에요.");
    if (b.done === false) await env.DB.prepare("DELETE FROM book_tasks WHERE user_id = ? AND task = ?").bind(user.id, task).run();
    else await env.DB.prepare("INSERT OR IGNORE INTO book_tasks (user_id, task, done_at) VALUES (?, ?, ?)").bind(user.id, task, now()).run();
    return json(await state(req, env, user.id));
  });

  // 튜터: 그 장의 정리 · 낱말 · 본문(앞부분)을 시스템 프롬프트에 넣어요. level = easy(기본) | deep
  on("POST", "/books/ask", async ({ req, env, url, q, ec }) => {
    const b = await body(req), { book, chapter } = await place(env, url, b);
    const msgs = Array.isArray(b.messages) ? b.messages.slice(-MAX_TURNS) : [];
    const clean = msgs.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (!clean.length || clean[clean.length - 1].role !== "user") fail(400, "질문을 적어 주세요.");
    const doc = await asset(env, url, `/books/${book}.json`), ch = doc?.chapters?.find((c) => c.id === chapter);
    if (!ch) fail(404, "장을 찾지 못했어요.");
    const text = (ch.sections || []).map((s) => `## ${s.title}\n` + (s.body || []).map((x) => x.t === "p" ? x.text : x.t === "deep" ? (x.body || []).map((y) => y.text || "").join(" ") : x.caption || "").filter(Boolean).join("\n")).join("\n\n").replace(/\*\*|\{[abc]:|\}/g, "").slice(0, 9000);
    const deep = b.level === "deep";
    const sys = `너는 "AI 공부책"의 튜터야. 학생은 1달 안에 자기만의 작은 언어 모델과 '자비스' 비서를 만들려는 사람이고, Python 과 수학은 익숙해. 지금 읽는 장: 《${doc.title}》 ${ch.title}.
규칙: 쉬운 한국어 해요체, 짧은 문단. ${deep ? "지금은 '깊게' 모드예요 — 수식 · 원어 용어 · 논문 이름을 써도 돼요. 정확하게, 근거가 있으면 출처를 말해요." : "지금은 '쉽게' 모드예요 — 비유 먼저, 처음 쓰는 용어는 그 자리에서 한 줄로 풀어요, 수식은 꼭 필요할 때만 말로."} 자료에 없는 수치는 지어내지 말고 "확인이 필요해요"라고 해. 답 끝에 학생이 스스로 떠올려 볼 질문 하나를 '한번 생각해 봐요:' 로 붙여.
${ch.recap ? `[이 장의 정리] ${ch.recap.text}` : ""}
${ch.words ? `[이 장의 낱말] ${ch.words.map((w) => `${w.term}${w.en ? `(${w.en})` : ""}=${w.easy}`).join(" · ")}` : ""}
[본문]
${text}`.replace(/\*\*/g, "");
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

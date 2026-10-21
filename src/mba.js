// 마이크로디그리 과정 — 경영 (#/mba · public/mba · mba_*) · SW 공간의 개발 흐름 (#/sw/dev · public/dev · dev_*) · Vector & Graph (#/sw/vg · public/vg · vg_*). 내용은 정적 파일, 여기선 사람별 기록만 다뤄요.
// 아래 경로는 /mba 기준이고, 개발 과정은 같은 모양으로 /dev 아래에 있어요.
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
const idxCache = {}, idxAt = {};
async function asset(env, url, path) {
  const r = await env.ASSETS.fetch(new Request(new URL(path, url)));
  if (!r.ok) return null;
  return r.json();
}
async function index(env, url, dir) {
  if (idxCache[dir] && Date.now() - idxAt[dir] < 60e3) return idxCache[dir];
  const j = await asset(env, url, dir + "/index.json");
  if (j) { idxCache[dir] = j; idxAt[dir] = Date.now(); }
  return j || { modules: [] };
}

// 설명 그림 목록 (public/figs/map.json) — SW 과정 튜터가 답 안에 [[그림:id]] 로 학생 화면에 그림을 띄울 수 있게. 번호는 클라이언트(figs/catalog.js)와 같아요
let figMap = null, figAt = 0;
async function figMapOf(env, url) {
  if (figMap && Date.now() - figAt < 60e3) return figMap;
  const j = await asset(env, url, "/figs/map.json").catch(() => null);
  if (j) { figMap = j; figAt = Date.now(); }
  return j || { figs: {}, place: {} };
}
// 한 모듈의 그림 (카드 순서대로 "그림 <장>-<n>") — 같은 그림이 여러 카드에 있으면 한 번만 (이 카드에 있으면 이 카드의 번호, 아니면 처음 번호)
export function figsOfModule(map, key, doc, cardId) {
  const out = new Map(); let k = 0;
  // 같은 그림이 여러 자리면: 이 카드의 자리 > 옵션 없는 기본 자리 > 처음 자리 (클라이언트 figs/catalog.js figRefs 와 같은 규칙)
  const rank = (cid, p) => (cid === cardId ? 0 : Object.keys(p.opts || {}).length ? 2 : 1);
  for (const c of doc?.cards || []) for (const p of map.place?.[`${key}/${doc.id}/${c.id}`] || []) {
    const f = p.fig && map.figs?.[p.fig]; if (!f) continue;
    const no = `${Number(doc.no)}-${++k}`, r = rank(c.id, p), cur = out.get(p.fig);
    if (!cur || r < cur.r) out.set(p.fig, { id: p.fig, no, title: f.title, about: f.about, here: r === 0, r });
  }
  return [...out.values()].map(({ r, ...x }) => x);
}
function figPrompt(list) {
  if (!list.length) return "";
  return `[설명 그림 — 학생 화면에 띄울 수 있어요] ${list.map((f) => `그림 ${f.no} [[그림:${f.id}]] ${f.title}${f.here ? " (이 카드에 있음)" : ""} — ${f.about}`).join(" / ")}
그림이 이해에 도움이 되면(학생이 '그림으로', '보여 줘', '어떻게 생겼어'라고 하거나 공간 · 순서 · 흐름을 물을 때) 답 중간에 [[그림:<id>]] 를 한 줄로 따로 써. 그 자리에 그 그림이 떠. 한 답에 그림은 1개(많아야 2개). 그림을 띄우면 몇 단계에서 무엇을 보면 되는지 한 줄로 알려 줘. 목록에 없는 그림 id 는 쓰지 마.`;
}

const COURSES = {
  mba: { dir: "/mba", t: { reads: "mba_reads", days: "mba_days", done: "mba_done" }, name: "경영 마이크로디그리", who: "MBA 대학원에 가는 대신 하루 1~2시간씩 경영을 스스로 배우는 한국 학생", tail: "" },
  dev: { dir: "/dev", t: { reads: "dev_reads", days: "dev_days", done: "dev_done" }, name: "개발 흐름 마이크로디그리", who: "코드를 짜는 법이 아니라 회사에서 개발 프로젝트가 흘러가는 방식을 배우는, 개발팀을 이끌 대표가 되려는 한국 학생", tail: " 코드는 꼭 필요할 때만 몇 줄, 읽는 법과 함께 보여 줘. 가상 회사 '두런' 이야기를 예로 써도 좋아." },
  onto: { dir: "/onto", t: { reads: "onto_reads", days: "onto_days", done: "onto_done" }, name: "온톨로지 과정", who: "온톨로지를 원리(논리 · RDF/OWL · 그래프)부터 설계 방법, AI 시대에 왜 뜨는지, 세계 동향까지 깊게 배우는 한국 학생(엔지니어 · 기획자)", tail: " 예시는 병원 · 회사 · 일상 중 그 개념에 가장 잘 맞는 것으로 골라. 코드는 Turtle · SPARQL · Cypher 몇 줄로, 읽는 법과 함께 보여 줘." },
  aip: { dir: "/aip", t: { reads: "aip_reads", days: "aip_days", done: "aip_done" }, name: "Palantir AIP 과정", who: "Palantir 의 Foundry 온톨로지와 AIP(LLM 이 온톨로지 위에서 일하는 방식)를 원리부터 사례 · 한계까지 깊게 배우는 한국 학생(엔지니어 · 기획자)", tail: " Palantir 공식 문서의 용어(Object type · Link type · Action type · Function · AIP Logic 등)를 그대로 쓰고, 확실하지 않은 내부 동작은 추측이라고 말해 줘." },
  vg: { dir: "/vg", t: { reads: "vg_reads", days: "vg_days", done: "vg_done" }, name: "Vector & Graph 과정", who: "임베딩 · 벡터 검색 · 벡터DB · 지식그래프 · GraphRAG 를 처음부터 실무까지 배우는 한국 학생(엔지니어)", tail: " 코드는 파이썬이나 SQL · Cypher 몇 줄로, 읽는 법과 함께 보여 줘. 숫자 예시는 작은 벡터로 직접 계산해 보여 줘." },
};

export function registerMba(on, deps) { registerCourse(on, deps, "mba"); }
export function registerDev(on, deps) { registerCourse(on, deps, "dev"); }
export function registerVg(on, deps) { registerCourse(on, deps, "vg"); }
export function registerOnto(on, deps) { registerCourse(on, deps, "onto"); registerCourse(on, deps, "aip"); } // 온톨로지 · Palantir AIP

function registerCourse(on, { json, body, fail, now }, key) {
  const C = COURSES[key], T = C.t, P = "/" + key;
  // module/card 가 목록에 있는지 — 없는 id 는 400
  // kinds: 어떤 목록에서 찾을지 — 읽음 · 복습은 카드만, 튜터는 카드와 케이스
  async function place(env, url, b, kinds = ["cards"]) {
    const module = typeof b.module === "string" && ID_RE.test(b.module) ? b.module : fail(400, "없는 모듈이에요.");
    const card = typeof b.card === "string" && ID_RE.test(b.card) ? b.card : fail(400, "없는 카드예요.");
    const m = (await index(env, url, C.dir)).modules.find((x) => x.id === module);
    if (!m) fail(400, "없는 모듈이에요.");
    if (!kinds.some((k) => (m[k] || []).some((c) => c.id === card))) fail(400, "없는 카드예요.");
    return { module, card };
  }
  async function placeModule(env, url, b) {
    const module = typeof b.module === "string" && ID_RE.test(b.module) ? b.module : fail(400, "없는 모듈이에요.");
    if (!(await index(env, url, C.dir)).modules.some((x) => x.id === module)) fail(400, "없는 모듈이에요.");
    return { module, card: "week" };
  }
  async function state(req, env, uid) {
    const today = kstTodayReq(req, env), from = addDay(today, -167);
    const [r, d, k] = await env.DB.batch([
      env.DB.prepare(`SELECT module, card, stage, due_day, read_at, correct, total, reviews FROM ${T.reads} WHERE user_id = ? ORDER BY read_at`).bind(uid),
      env.DB.prepare(`SELECT day, minutes, plan FROM ${T.days} WHERE user_id = ? AND day >= ? ORDER BY day`).bind(uid, from),
      env.DB.prepare(`SELECT module, item, kind, score, total, done_at FROM ${T.done} WHERE user_id = ? ORDER BY done_at`).bind(uid),
    ]);
    const items = r.results;
    return { today, items, due: items.filter((x) => x.stage < DONE && x.due_day <= today).map((x) => ({ module: x.module, card: x.card, stage: x.stage })), days: d.results, done: k.results };
  }
  on("GET", P + "/state", async ({ req, env, user }) => json(await state(req, env, user.id)));

  on("PUT", P + "/read", async ({ req, env, url, user }) => {
    const b = await body(req), { module, card } = await place(env, url, b), today = kstTodayReq(req, env), t = now();
    const correct = num(b.correct, 20), total = num(b.total, 20);
    if (correct != null && (total == null || correct > total)) fail(400, "퀴즈 결과가 이상해요.");
    await env.DB.prepare(`INSERT INTO ${T.reads} (user_id, module, card, stage, due_day, read_at, correct, total, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, module, card) DO UPDATE SET correct = COALESCE(excluded.correct, correct), total = COALESCE(excluded.total, total), updated_at = excluded.updated_at`)
      .bind(user.id, module, card, addDay(today, GAP[1]), t, correct, total, t).run();
    return json(await state(req, env, user.id));
  });

  on("PUT", P + "/review", async ({ req, env, user }) => {
    const b = await body(req), today = kstTodayReq(req, env), t = now();
    const list = Array.isArray(b.results) ? b.results.slice(0, 60) : fail(400, "results 가 필요해요.");
    const rows = new Map((await env.DB.prepare(`SELECT module, card, stage FROM ${T.reads} WHERE user_id = ?`).bind(user.id).all()).results.map((r) => [r.module + "/" + r.card, r.stage]));
    const stmts = [];
    for (const r of list) {
      if (!r || typeof r !== "object" || !ID_RE.test(String(r.module)) || !ID_RE.test(String(r.card))) continue;
      const key = r.module + "/" + r.card, correct = num(r.correct, 20), total = num(r.total, 20);
      if (correct == null || !total || correct > total || !rows.has(key)) continue;
      // 절반 이상 맞히면 다음 간격으로, 아니면 한 단계 뒤로 가서 내일 다시
      const st = rows.get(key), ok = correct * 2 >= total;
      const next = ok ? Math.min(DONE, st + 1) : Math.max(1, st - 1);
      const due = next >= DONE ? "9999-12-31" : addDay(today, ok ? GAP[next] : 1);
      stmts.push(env.DB.prepare(`UPDATE ${T.reads} SET stage = ?, due_day = ?, correct = ?, total = ?, reviews = reviews + 1, updated_at = ? WHERE user_id = ? AND module = ? AND card = ?`)
        .bind(next, due, correct, total, t, user.id, r.module, r.card));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json(await state(req, env, user.id));
  });

  on("PUT", P + "/done", async ({ req, env, url, user }) => {
    const b = await body(req);
    const module = typeof b.module === "string" && ID_RE.test(b.module) ? b.module : fail(400, "없는 모듈이에요.");
    const item = typeof b.item === "string" && ID_RE.test(b.item) ? b.item : fail(400, "없는 항목이에요.");
    const kind = ["case", "problem", "lecture"].includes(b.kind) ? b.kind : fail(400, "kind 는 case · problem · lecture 예요.");
    const m = (await index(env, url, C.dir)).modules.find((x) => x.id === module);
    const list = m && { case: m.cases, problem: m.problems, lecture: m.lectures }[kind];
    if (!list || !list.some((x) => x.id === item)) fail(400, "없는 항목이에요.");
    if (b.done === false) await env.DB.prepare(`DELETE FROM ${T.done} WHERE user_id = ? AND module = ? AND item = ?`).bind(user.id, module, item).run();
    else {
      const score = num(b.score, 20), total = num(b.total, 20);
      if (score != null && (total == null || score > total)) fail(400, "점수가 이상해요.");
      await env.DB.prepare(`INSERT INTO ${T.done} (user_id, module, item, kind, score, total, done_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, module, item) DO UPDATE SET score = excluded.score, total = excluded.total, done_at = excluded.done_at`)
        .bind(user.id, module, item, kind, score, total, now()).run();
    }
    return json(await state(req, env, user.id));
  });

  on("PUT", P + "/day", async ({ req, env, user }) => {
    const b = await body(req), today = kstTodayReq(req, env), t = now();
    const add = num(b.minutes, 240) ?? 0;
    const plan = typeof b.plan === "string" ? b.plan.trim().slice(0, 140) : null;
    if (!add && plan == null) fail(400, "minutes 나 plan 이 필요해요.");
    await env.DB.prepare(`INSERT INTO ${T.days} (user_id, day, minutes, plan, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, day) DO UPDATE SET minutes = MIN(600, minutes + excluded.minutes), plan = COALESCE(excluded.plan, plan), updated_at = excluded.updated_at`)
      .bind(user.id, today, add, plan, t).run();
    return json(await state(req, env, user.id));
  });

  // 튜터: 그 카드의 생각 · 예시 · 낱말 + 화면의 지금 값(context)을 시스템 프롬프트에 넣어요. level = easy(기본) | deep
  on("POST", P + "/ask", async ({ req, env, url, q, ec }) => {
    const b = await body(req);
    // 개발 과정의 'AI 질문' 탭: card = "week" 이면 카드 하나가 아니라 그 주 전체(두런 장면 · 목표 · 카드 · 사례)를 보고 답해요
    const week = key !== "mba" && b.card === "week";
    const { module, card } = week ? await placeModule(env, url, b) : await place(env, url, b, ["cards", "cases"]);
    const msgs = Array.isArray(b.messages) ? b.messages.slice(-MAX_TURNS) : [];
    const clean = msgs.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (!clean.length || clean[clean.length - 1].role !== "user") fail(400, "질문을 적어 주세요.");
    const doc = await asset(env, url, `${C.dir}/${module}.json`), c = week ? null : doc?.cards?.find((x) => x.id === card), cs = week || c ? null : doc?.cases?.find((x) => x.id === card);
    if (week ? !doc : !c && !cs) fail(404, "카드를 찾지 못했어요.");
    const context = typeof b.context === "string" ? b.context.trim().slice(0, cs ? 2000 : 600) : "";
    const figLine = key !== "mba" && !cs ? figPrompt(figsOfModule(await figMapOf(env, url), key, doc, week ? null : card)) : "";
    const deep = b.level === "deep";
    const rules = `규칙: 쉬운 한국어 해요체, 짧은 문단. ${deep ? "지금은 '깊게' 모드예요 — 원어 용어 · 공식 · 교과서 이름을 써도 돼요. 정확하게, 근거가 있으면 출처를 말해요." : "지금은 '쉽게' 모드예요 — 일상 비유 먼저, 처음 쓰는 용어는 그 자리에서 한 줄로 풀어요."} 숫자를 쓸 때는 계산을 한 줄로 보여 줘. 자료에 없는 통계 · 법 조문 · 세율은 지어내지 말고 "확인이 필요해요"라고 해. 법 · 세금 · 노무는 전문가(변호사 · 세무사 · 노무사) 확인이 필요하다고 덧붙여. 답 끝에 학생이 스스로 떠올려 볼 질문 하나를 '한번 생각해 볼까요?' 로 붙여.`;
    const sys = (week ? `너는 "${C.name}"의 튜터야. 학생은 ${C.who}이야.${C.tail} 지금 공부하는 주: 《${doc.no} ${doc.title}》 · 이번 주 질문 "${doc.q}".
${rules} 학생이 이 주 내용을 물으면 아래 자료를 근거로 답하고, 어느 카드에 더 자세히 있는지 카드 제목으로 알려 줘. 학생이 '내가 대표(엔지니어)라면' 같은 판단을 물으면 바로 정답을 주기보다 선택지와 기준을 먼저 보여 주고 학생 생각을 물어 줘.
[이번 주 장면 · 가상 이야기] ${(doc.story?.body || []).join(" ")}
[이번 주 목표] ${(doc.goals || []).join(" / ")}
[카드] ${(doc.cards || []).map((x) => `${x.id} ${x.title} — ${x.lead || ""}`).join(" / ")}
[사례] ${(doc.cases || []).map((x) => x.title).join(" / ")}
${figLine}
${context ? `[학생 화면의 지금 값] ${context}` : ""}` : cs ? `너는 "${C.name}"의 케이스 토론 코치야. 학생은 ${C.who}이야.${C.tail} 지금 푸는 케이스: 《${doc.title}》 ${cs.title}.
${rules} 케이스 질문에는 답을 바로 주지 말고, 학생이 먼저 생각을 말하게 묻고 힌트를 한 단계씩 줘. 학생이 자기 답을 말하면 근거 · 계산 · 빠진 관점을 짚어 줘.
[상황] ${(cs.story || []).join(" ")}
${cs.data ? `[데이터] ${[cs.data.cols.join(" | "), ...cs.data.rows.map((r) => r.join(" | "))].join(" / ")}` : ""}
[질문] ${(cs.questions || []).map((q, i) => `${i + 1}) ${q.q}`).join(" ")}
[좋은 답의 방향 — 학생에게 그대로 주지 말 것] ${(cs.questions || []).map((q, i) => `${i + 1}) ${(q.answer || []).join(" ")}`).join(" ")}
${context ? `[학생이 지금까지 적은 답] ${context}` : ""}` : `너는 "${C.name}"의 튜터야. 학생은 ${C.who}이야.${C.tail} 지금 보는 카드: 《${doc.title}》 ${c.title}.
${rules}
${c.lead ? `[핵심] ${c.lead}\n` : ""}[이 카드의 생각] ${(c.idea || []).join(" ")}
${c.example ? `[숫자 예시] ${c.example}` : ""}
${c.deep?.length ? `[더 자세히] ${c.deep.join(" ")}` : ""}
${c.words?.length ? `[낱말] ${c.words.map((w) => `${w.term}${w.en ? `(${w.en})` : ""}=${w.easy}`).join(" · ")}` : ""}
${c.recall ? `[떠올리기] ${c.recall.q} → ${c.recall.a}` : ""}
${figLine}
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

// 논문 스프린트 (2026-10-01 → 10-05): 16편 × 3단계(읽기 · 퀴즈 · 3분 설명) 체크, 한 줄 정리, AI 튜터 · 채점,
// 옵시디언 노트에 끼워 넣는 개인 토큰 페이지. 셋이 서로의 체크와 한 줄 정리를 봐요 — 쓰기는 본인만.
// 공부 자료는 정적 파일(public/papers/*)이고, 여기선 기록만 다뤄요.
import { aiJson, aiText } from "./ai.js";

export const PAPER_IDS = ["yolov10", "bytetrack", "fdta", "sam", "sam3", "dino", "dinov3", "rtdetrv4", "cradiov4", "videomae", "vjepa21", "adaptformer", "cmx", "mspecgene", "intquant", "iptqvit"];
const PAPER_SET = new Set(PAPER_IDS);
const STEPS = ["read", "quiz", "explain"];
export const PAPERS_UNTIL = "2026-10-05"; // 이날(한국 시간)이 지나면 쓰기는 막고 결과만 보여 줘요
const QUIZ_PASS = 4;       // 5문제 중
const EXPLAIN_PASS = 70;   // AI 점수
const MAX_NOTE = 300;
const MAX_EXPLAIN = 4000;
const MAX_TURNS = 12;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

// 한국 시간 오늘. 로컬 테스트(PASSWORDLESS=1)에서만 x-papers-now 헤더로 날짜를 바꿀 수 있어요.
function kstToday(req, env) {
  const fake = env.PASSWORDLESS === "1" ? req.headers.get("x-papers-now") : null;
  if (fake && /^\d{4}-\d{2}-\d{2}$/.test(fake)) return fake;
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
export const papersEnded = (req, env) => kstToday(req, env) > PAPERS_UNTIL;

export function registerPapers(on, { json, body, fail, now }) {
  const paperOf = (v) => (typeof v === "string" && PAPER_SET.has(v) ? v : fail(400, "없는 논문이에요."));
  const stepOf = (v) => (STEPS.includes(v) ? v : fail(400, "단계는 read · quiz · explain 중 하나예요."));
  const open = (req, env) => { if (papersEnded(req, env)) fail(410, "논문 스프린트가 끝났어요. 결과만 볼 수 있어요."); };

  // 셋 모두의 체크 · 한 줄 정리
  async function progress(env) {
    const [users, checks, notes] = await Promise.all([
      env.DB.prepare("SELECT id, display_name, color FROM users ORDER BY created_at").all(),
      env.DB.prepare("SELECT user_id, paper, step, score, done_at FROM paper_checks").all(),
      env.DB.prepare("SELECT user_id, paper, body, updated_at FROM paper_notes").all(),
    ]);
    const by = new Map(users.results.map((u) => [u.id, { user_id: u.id, name: u.display_name, color: u.color, checks: {}, notes: {} }]));
    for (const c of checks.results) {
      const m = by.get(c.user_id);
      if (!m || !PAPER_SET.has(c.paper)) continue;
      const p = (m.checks[c.paper] ||= {});
      p[c.step] = c.done_at;
      if (c.score != null) p[c.step + "_score"] = c.score;
    }
    for (const n of notes.results) by.get(n.user_id) && (by.get(n.user_id).notes[n.paper] = n.body);
    return [...by.values()].map((m) => ({ ...m, done: Object.values(m.checks).reduce((s, p) => s + STEPS.filter((k) => p[k]).length, 0) }));
  }
  const shape = async (req, env, extra = {}) => ({ until: PAPERS_UNTIL, today: kstToday(req, env), ended: papersEnded(req, env), total: PAPER_IDS.length * STEPS.length, members: await progress(env), ...extra });

  async function setCheck(env, userId, paper, step, done, score = null) {
    if (done) {
      await env.DB.prepare(`INSERT INTO paper_checks (user_id, paper, step, score, done_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id, paper, step) DO UPDATE SET score = COALESCE(excluded.score, paper_checks.score), done_at = paper_checks.done_at`)
        .bind(userId, paper, step, score, now()).run();
    } else {
      await env.DB.prepare("DELETE FROM paper_checks WHERE user_id = ? AND paper = ? AND step = ?").bind(userId, paper, step).run();
    }
  }
  // 점수가 기준에 못 미쳐도 점수는 기록해요(체크는 안 함) — 체크가 이미 있으면 더 높은 점수만 남겨요
  async function recordScore(env, userId, paper, step, score, pass) {
    if (pass) {
      await env.DB.prepare(`INSERT INTO paper_checks (user_id, paper, step, score, done_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id, paper, step) DO UPDATE SET score = MAX(COALESCE(paper_checks.score, 0), excluded.score)`)
        .bind(userId, paper, step, score, now()).run();
    }
  }
  const checkBody = (b) => {
    const paper = paperOf(b.paper), step = stepOf(b.step);
    if (typeof b.done !== "boolean") fail(400, "done 은 true / false 로 보내 주세요.");
    let score = null;
    if (b.score != null) {
      const n = Number(b.score), max = step === "quiz" ? 5 : 100;
      if (!Number.isInteger(n) || n < 0 || n > max) fail(400, `점수는 0~${max} 사이 정수예요.`);
      score = n;
    }
    return { paper, step, done: b.done, score };
  };

  // ---------- 로그인한 사람 ----------
  on("GET", "/papers/progress", async ({ req, env, user }) => json(await shape(req, env, { me: user.id })));

  // ---------- 쉽게 읽기: 간격 복습 (본인만 · 스프린트가 끝나도 계속 써요) ----------
  // 복습 간격은 1 → 3 → 7일 (간격 효과: 기억할 기간의 10~20% 쯤 띄울 때 가장 오래 가요 · Cepeda 2008)
  const GAP = [0, 1, 3, 7];
  const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const num = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  async function easyState(req, env, uid) {
    const today = kstToday(req, env);
    const { results } = await env.DB.prepare("SELECT paper, stage, due_day, read_at, recall, recall_total, reviews FROM easy_reads WHERE user_id = ?").bind(uid).all();
    return { today, items: results, due: results.filter((r) => r.stage < 4 && r.due_day <= today).map((r) => r.paper) };
  }
  on("GET", "/papers/easy", async ({ req, env, user }) => json(await easyState(req, env, user.id)));
  on("PUT", "/papers/easy/read", async ({ req, env, user }) => {
    const b = await body(req), paper = paperOf(b.paper), today = kstToday(req, env), t = now();
    const recall = num(b.recall, 20), total = num(b.total, 20);
    // 처음 읽으면 1일 뒤 복습. 다시 읽어도 단계는 그대로 (복습은 퀴즈로만 올라가요)
    await env.DB.prepare(`INSERT INTO easy_reads (user_id, paper, stage, due_day, read_at, recall, recall_total, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, paper) DO UPDATE SET recall = COALESCE(excluded.recall, recall), recall_total = COALESCE(excluded.recall_total, recall_total), updated_at = excluded.updated_at`)
      .bind(user.id, paper, addDay(today, GAP[1]), t, recall, total, t).run();
    return json(await easyState(req, env, user.id));
  });
  on("PUT", "/papers/easy/review", async ({ req, env, user }) => {
    const b = await body(req), today = kstToday(req, env), t = now();
    const list = Array.isArray(b.results) ? b.results.slice(0, 16) : fail(400, "results 가 필요해요.");
    const rows = new Map((await env.DB.prepare("SELECT paper, stage FROM easy_reads WHERE user_id = ?").bind(user.id).all()).results.map((r) => [r.paper, r.stage]));
    const stmts = [];
    for (const r of list) {
      const paper = paperOf(r.paper), correct = num(r.correct, 10), total = num(r.total, 10);
      if (correct == null || !total || correct > total || !rows.has(paper)) continue;
      // 절반 이상 맞히면 다음 간격으로, 아니면 내일 다시 (틀린 건 빨리 다시 보는 게 좋아요)
      const st = rows.get(paper), next = correct * 2 >= total ? Math.min(4, st + 1) : st;
      stmts.push(env.DB.prepare("UPDATE easy_reads SET stage = ?, due_day = ?, reviews = reviews + 1, updated_at = ? WHERE user_id = ? AND paper = ?")
        .bind(next, next >= 4 ? "9999-12-31" : addDay(today, next === st ? 1 : GAP[next]), t, user.id, paper));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json(await easyState(req, env, user.id));
  });

  on("PUT", "/papers/check", async ({ req, env, user }) => {
    open(req, env);
    const c = checkBody(await body(req));
    await setCheck(env, user.id, c.paper, c.step, c.done, c.score);
    return json(await shape(req, env, { me: user.id }));
  });

  on("PUT", "/papers/note", async ({ req, env, user }) => {
    open(req, env);
    const b = await body(req);
    const paper = paperOf(b.paper);
    if (b.text != null && typeof b.text !== "string") fail(400, "한 줄 정리 형식이 올바르지 않아요.");
    const text = (b.text || "").trim();
    if (text.length > MAX_NOTE) fail(400, `한 줄 정리는 ${MAX_NOTE}자까지예요.`);
    if (text) await env.DB.prepare(`INSERT INTO paper_notes (user_id, paper, body, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, paper) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`).bind(user.id, paper, text, now()).run();
    else await env.DB.prepare("DELETE FROM paper_notes WHERE user_id = ? AND paper = ?").bind(user.id, paper).run();
    return json({ paper, text: text || null });
  });

  // 퀴즈 점수: 기준 이상이면 체크까지
  on("POST", "/papers/quiz", async ({ req, env, user }) => {
    open(req, env);
    const b = await body(req);
    const paper = paperOf(b.paper), n = Number(b.correct);
    if (!Number.isInteger(n) || n < 0 || n > 5) fail(400, "맞힌 수는 0~5 사이 정수예요.");
    await recordScore(env, user.id, paper, "quiz", n, n >= QUIZ_PASS);
    return json({ ...(await shape(req, env, { me: user.id })), passed: n >= QUIZ_PASS, need: QUIZ_PASS });
  });

  // 자료 JSON (정적 파일) — AI 에게 넘길 때만 읽어요
  async function content(env, url, paper) {
    const res = await env.ASSETS.fetch(new Request(new URL(`/papers/content/${paper}.json`, url)));
    if (!res.ok) fail(404, "이 논문 자료가 아직 없어요.");
    return res.json();
  }
  const brief = (c) => [
    `논문: ${c.full_title || c.title} (${c.year}, ${c.venue || ""}) · 분야: ${c.field}`,
    `한 줄: ${c.one_line}`, `비유: ${c.analogy}`, `문제: ${c.problem}`,
    `아이디어:\n${(c.idea || []).map((x, i) => `${i + 1}. ${x.title} — ${x.body}`).join("\n")}`,
    `결과:\n${(c.results || []).map((x) => `- ${x.label}: ${x.value} (${x.note || ""})`).join("\n")}`,
    `우리 파이프라인에서: ${c.pipeline_role}`, `주의: ${(c.caveats || []).join(" / ")}`,
    `용어: ${(c.glossary || []).map((g) => `${g.term}=${g.easy}`).join(" · ")}`,
  ].join("\n\n").replace(/\*\*/g, "");

  // 3분 설명 채점
  on("POST", "/papers/explain", async ({ req, env, url, user }) => {
    open(req, env);
    const b = await body(req);
    const paper = paperOf(b.paper);
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (text.length < 60) fail(400, "설명을 조금 더 길게 써 주세요 (60자 이상).");
    if (text.length > MAX_EXPLAIN) fail(400, `설명은 ${MAX_EXPLAIN}자까지예요.`);
    const c = await content(env, url, paper);
    const system = `너는 친절하지만 정확한 딥러닝 논문 스터디 코치야. 학생이 '3분 설명'을 썼어. 기준: ① 무슨 문제 ② 핵심 아이디어 ③ 결과 ④ 우리 파이프라인(RGB+열화상 → 탐지·추적 → RKNN 보드 배포)에서의 쓰임. 핵심어: ${(c.keywords_3min || []).join(", ")}.
틀린 내용이 있으면 반드시 짚어. 쉬운 한국어 해요체로. JSON 으로만 답해: {"score":0~100 정수,"good":["잘한 점",…최대3],"missing":["빠졌거나 틀린 점",…최대4],"tip":"다음에 한 문장 더 넣으면 좋을 말"}`;
    let r;
    try { r = (await aiJson(env, system, `[논문 자료]\n${brief(c)}\n\n[학생 설명]\n${text}`)).data; }
    catch (e) { fail(e.status || 502, e.message || "AI 채점을 하지 못했어요. 직접 체크해도 돼요."); }
    const score = Math.max(0, Math.min(100, Math.round(Number(r?.score) || 0)));
    const list = (v, n) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, n) : []);
    await recordScore(env, user.id, paper, "explain", score, score >= EXPLAIN_PASS);
    return json({ score, passed: score >= EXPLAIN_PASS, need: EXPLAIN_PASS, good: list(r?.good, 3), missing: list(r?.missing, 4), tip: typeof r?.tip === "string" ? r.tip.slice(0, 300) : "" });
  });

  // 논문 튜터 (자료를 시스템 프롬프트로)
  on("POST", "/papers/ask", async ({ req, env, url, q, ec }) => {
    const b = await body(req);
    const paper = paperOf(b.paper);
    const msgs = Array.isArray(b.messages) ? b.messages.slice(-MAX_TURNS) : [];
    const clean = msgs.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (!clean.length || clean[clean.length - 1].role !== "user") fail(400, "질문을 적어 주세요.");
    const c = await content(env, url, paper);
    const system = `너는 이 논문 하나를 셋에게 가르치는 튜터야. 학생들은 딥러닝 기초만 알아. 규칙: 쉬운 한국어 해요체, 짧은 문단, 비유 먼저, 용어는 풀어서, 필요하면 숫자 예시. 자료에 없는 수치는 지어내지 말고 "원문에서 확인해요"라고 해. 목표는 10월 5일까지 이 논문을 3분 안에 설명하게 만드는 것. 우리 프로젝트: RGB+열화상 카메라 → 탐지·추적 → Rockchip NPU(RKNN) INT8 배포.\n\n[논문 자료]\n${brief(c)}`;
    if (q.get("stream") === "0") {
      try { const r = await aiText(env, system, clean); return json({ text: r.text, used: r.used }); }
      catch (e) { fail(e.status || 502, e.message || "AI 답을 받지 못했어요."); }
    }
    // 스트리밍(SSE): data: {type: "delta"|"reset"|"end"|"error", …}
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter(), enc = new TextEncoder();
    let open = true;
    const send = async (o) => { if (!open) return; try { await writer.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { open = false; } };
    ec.waitUntil((async () => {
      try {
        const r = await aiText(env, system, clean, undefined, (t, meta) => (meta?.reset ? send({ type: "reset" }) : send({ type: "delta", text: t })));
        await send({ type: "end", text: r.text, used: r.used });
      } catch (e) { await send({ type: "error", message: e.message || "AI 답을 받지 못했어요." }); }
      open = false; try { await writer.close(); } catch {}
    })());
    return new Response(readable, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  });

  // 옵시디언에 넣을 노트: 새 토큰을 만들고(옛 것은 무효) 노트 본문을 돌려줘요
  on("POST", "/papers/obsidian", async ({ req, env, url, user }) => {
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare(`INSERT INTO paper_tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at`).bind(await sha256(token), user.id, now()).run();
    const link = new URL(`/papers/embed#t=${token}`, url.origin).toString(); // 에셋은 .html 없는 주소로 바로 (307 없이)
    return json({ filename: "📊 논문 현황.md", url: link, markdown: obsidianNote(link, user.display_name) });
  });

  // 로컬 테스트용(PASSWORDLESS=1): 크론이 하는 정리를 날짜를 바꿔 바로 돌려 봐요
  on("POST", "/papers/cleanup", async ({ req, env }) => {
    if (env.PASSWORDLESS !== "1") fail(404, "없는 주소예요.");
    return json(await cleanupPaperNotes(env, kstToday(req, env)));
  });

  // ---------- 토큰 (옵시디언 iframe, 로그인 없음) ----------
  async function tokenUser(env, token) {
    if (!TOKEN_RE.test(token || "")) fail(404, "주소가 올바르지 않아요.");
    const u = await env.DB.prepare("SELECT u.id, u.display_name, u.color FROM paper_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?").bind(await sha256(token)).first();
    if (!u) fail(404, "이 주소는 더 이상 쓸 수 없어요. 앱의 논문 화면에서 '옵시디언에 넣기'로 새 노트를 받아 주세요.");
    return u;
  }
  on("GET", "/papers/t/:token", async ({ req, env, params }) => {
    const u = await tokenUser(env, params.token);
    return json(await shape(req, env, { me: u.id }));
  }, { auth: false });
  on("PUT", "/papers/t/:token/check", async ({ req, env, params }) => {
    const u = await tokenUser(env, params.token);
    open(req, env);
    const c = checkBody(await body(req));
    await setCheck(env, u.id, c.paper, c.step, c.done, c.score);
    return json(await shape(req, env, { me: u.id }));
  }, { auth: false });
}

// 10-06 부터: 앱 노트에 넣어 준 '📄 논문 공부' 구역을 지워요 (그 아래에 직접 만든 하위 페이지까지)
export async function cleanupPaperNotes(env, today) {
  if (today <= PAPERS_UNTIL) return { deleted: 0 };
  const TREE = `WITH RECURSIVE t(id) AS (SELECT note_id FROM study_seed_notes WHERE kind = 'papers' UNION SELECT n.id FROM notes n JOIN t ON n.parent_id = t.id) SELECT id FROM t`;
  const [count] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM (${TREE})`),
    env.DB.prepare(`DELETE FROM notes WHERE id IN (${TREE})`), // 링크 · 태그 · 기록은 CASCADE 로 같이 지워져요
  ]);
  return { deleted: count.results[0]?.n || 0 };
}

export function obsidianNote(link, name) {
  return `---
tags: [논문스프린트]
until: ${PAPERS_UNTIL}
---
# 📊 논문 현황 · ${name}

> [!info] 10월 1일 → 5일 · 16편 × 3단계 (읽기 · 퀴즈 · 3분 설명)
> 아래 판에서 바로 체크하면 셋에게 똑같이 보여요. 공부는 **[앱에서 열기](${link.replace(/\/papers\/embed(?:\.html)?#.*$/, "/#/papers")})**.
> 10월 6일부터 이 판은 "끝났어요"로 바뀌어요. 그 뒤엔 이 노트를 지워도 돼요.

<iframe src="${link}" width="100%" height="900" style="border:0;border-radius:14px;" allow="clipboard-write"></iframe>

*판이 안 보이면: 읽기 모드(⌘E)로 바꾸거나 [브라우저로 열기](${link}).*
`;
}

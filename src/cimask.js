// CIM 투자자산운용사 AI 튜터 — POST /apps/cim/ask (#/cim 의 'AI에게 묻기' 옆 패널)
//   몸통: { messages: [{role, content}…], context: { kind: "card" | "quiz" | "general", key, chapter, title, body, question, options, answer, picked, explain, topic } }
//   화면이 지금 보는 내용(카드 본문 · 문제와 내 답)을 context 로 같이 보내고, 학생은 질문만 적어요.
//   근거 달린 답 (src/rag.js): 질문 + 지금 화면으로 CIM 카드(늘)와 내 노트를 찾아 [1]..[n] 번호를 붙여 프롬프트에 넣고, 답에 [1] 처럼 달게 해요.
//     · 지금 보는 카드(context.key)는 언제나 [1] · 나머지는 찾은 것 중 기준(minCos) 넘는 것만 (최대 5개, 노트는 2개까지)
//     · 서버가 답의 번호를 검사해요: 없는 번호는 지우고, 실제로 단 번호만 cited=true
//     · 근거가 하나도 없으면 "자료에 근거가 없어요" 라고 먼저 말하게 해요 (지어내지 않게)
//     · 내 노트가 들어가면 무료 등급 데이터로 학습하지 않는 곳(Groq)으로만 보내요 — 거기가 안 되면 노트를 빼고 CIM 근거로만 다시 (Gemini 무료 등급 등에는 노트를 안 보내요)
//   답은 다른 튜터(/mba/ask · /books/ask)처럼 글자 단위 SSE: {type:"sources"|"delta"|"reset"|"end"|"error"} — end 에 고친 text 와 sources(cited 표시)가 와요.
//   하루 사용량은 worker.js 의 AI_PATH(aiQuota) 가 세요 — 첫 팀(SWx2) 밖은 하루 AI_DAILY 번. (근거 찾기의 임베딩은 세지 않아요)
//   기능 잠금: "cim" 기능이 있어야 해요 (features.js MAP · /apps/cim/*).
//   빠르게 (2026-10-26): 카드 화면의 짧은 질문은 그 카드 + 쉽게 보기만으로 답해요 (근거 찾기 건너뜀) · 그 밖의 찾기는 RETRIEVE_MS 안에 끝나야 해요(넘으면 카드만)
//     · 공급사는 첫 글자가 빠른 모델부터 (aiText fast: Groq gpt-oss-20b → qwen → Gemini flash-lite) · 노트가 섞이면 Groq 만 (그대로)
import { aiText, TEXT_ORDER, PRIVATE_SAFE } from "./ai.js";
import { retrieve, settings, hrefOf } from "./rag.js";
import { checkCites } from "./lib/rag-text.js";
// 길 고르기 (src/airoute.js): 규칙 먼저 · 애매하면 embed-proto. 기본은 기록만(DECIDE_ROUTE 비어 있음 = log), DECIDE_ROUTE=1 이면 프롬프트 한 줄 + 내 자료 질문의 노트 근거 4개
import { routeAsk, routeMode, ROUTES } from "./airoute.js";

const MAX_TURNS = 12;
const MAX_SOURCES = 5, MAX_NOTE_SOURCES = 2;
// 개인 자료(노트)를 보낼 수 있는 공급사 목록은 ai.js PRIVATE_SAFE 한곳에 있어요 (예전 이름 그대로 다시 내보내요)
export { PRIVATE_SAFE };
const s = (v, n) => (typeof v === "string" ? v.replace(/\s+\n/g, "\n").trim().slice(0, n) : "");
const KEY_RE = /^s[1-3]c\d{1,2}-\d{1,3}$/;
const RETRIEVE_MS = 1500; // 근거 찾기(글자 + 벡터) 시간 한도 — 넘으면 지금 카드만으로 답해요
const SHORT_Q = 40; // 카드 화면에서 이보다 짧은 질문("쉽게 설명해줘" · "예시 들어줘")은 그 카드 하나로 충분해요
// 쉽게 보기(화면이 보낸 p.easy) → 프롬프트 몇 줄
function easyBlock(e) {
  if (!e || typeof e !== "object") return "";
  const L = (a) => (Array.isArray(a) ? a.slice(0, 5).map((x) => s(x, 160)).filter(Boolean) : []);
  const lines = L(e.lines), pts = L(e.points);
  if (!lines.length) return "";
  return `\n[쉽게 보기 — 이미 학생에게 보여 준 쉬운 설명]\n${lines.join("\n")}${s(e.analogy, 200) ? `\n비유: ${s(e.analogy, 200)}` : ""}${s(e.example, 240) ? `\n${s(e.example, 240)}` : ""}${pts.length ? `\n시험 포인트: ${pts.join(" / ")}` : ""}`;
}

// 화면 내용 → 프롬프트 자료 (모든 값은 길이를 잘라요)
function material(c) {
  c = c && typeof c === "object" ? c : {};
  const kind = ["card", "quiz", "general"].includes(c.kind) ? c.kind : "general";
  const ch = s(c.chapter, 120);
  if (kind === "card") return `[지금 읽는 카드] ${ch ? ch + " · " : ""}${s(c.title, 160)}${easyBlock(c.easy)}`;
  if (kind === "quiz") {
    const opts = Array.isArray(c.options) ? c.options.slice(0, 5).map((o, i) => `${i + 1}) ${s(o, 300)}`).join("\n") : "";
    const ans = Number.isInteger(c.answer) ? `${c.answer + 1}번` : "모름";
    const picked = Number.isInteger(c.picked) ? `${c.picked + 1}번${c.picked === c.answer ? " (맞음)" : " (틀림)"}` : "아직 안 고름";
    return `[지금 푸는 문제] ${ch}\n${s(c.question, 800)}\n[보기]\n${opts}\n[정답] ${ans}\n[학생이 고른 답] ${picked}\n[해설] ${s(c.explain, 1200)}`;
  }
  return `[지금 화면] ${s(c.topic, 300) || "CIM 오늘 화면"}${ch ? ` · ${ch}` : ""}`;
}

/** 질문 + 화면 → 근거 목록 [{n, type, id, title, path, text, href}] */
export async function findSources(env, user, ctx, question, { maxNotes = MAX_NOTE_SOURCES } = {}) {
  ctx = ctx && typeof ctx === "object" ? ctx : {};
  const S = settings(env), out = [];
  const key = typeof ctx.key === "string" && KEY_RE.test(ctx.key) ? ctx.key : null;
  if (key) {
    const c = await env.DB.prepare("SELECT id, source_type, source_id, title, path, text FROM chunks WHERE id = ?").bind("cim:" + key).first();
    if (c) out.push({ ...c, pinned: true });
  }
  // 짧은 질문("쉽게 설명해줘")은 화면 제목이 뜻을 실어 줘요
  const qtext = [s(question, 500), s(ctx.title, 160), ctx.kind === "quiz" ? s(ctx.question, 300) : "", ctx.kind === "general" ? s(ctx.topic, 200) : ""].filter(Boolean).join("\n");
  let items = [], vecOk = false;
  // 카드 화면의 짧은 질문은 그 카드가 답이에요 — 찾기(임베딩 · 벡터 · 재정렬)를 건너뛰어 첫 글자를 빨리
  const quick = (!!out.length || !!s(ctx.body, 50)) && ctx.kind === "card" && s(question, 500).length <= SHORT_Q;
  if (!quick) {
    let tm;
    try {
      ({ items, vecOk } = await Promise.race([
        retrieve(env, user, qtext, { cim: true, notes: true, rerank: false }),
        new Promise((_, no) => { tm = setTimeout(() => no(new Error("retrieve timeout")), RETRIEVE_MS); }),
      ]));
    } catch (e) { console.log("cim ask retrieve", String(e?.message || e)); }
    clearTimeout(tm);
  }
  let notes = 0;
  for (const it of items) {
    if (out.length >= MAX_SOURCES) break;
    if (out.some((o) => o.id === it.id || (it.source_type !== "note" && o.source_id === it.source_id))) continue;
    // 뜻이 가까운 것만 (벡터가 없을 때는 글자 찾기 위쪽 3개만)
    const strong = vecOk ? (it.cos ?? 0) >= S.minCos : it.kw !== null && it.kw <= 3;
    if (!strong) continue;
    if (it.source_type === "note") { if (notes >= maxNotes) continue; notes++; }
    out.push(it);
  }
  // 색인이 아직 없거나(배포 직후) 옛 화면이라 key 가 없으면: 화면이 보낸 카드 본문을 [1] 로
  if (!out.some((o) => o.pinned) && ctx.kind === "card" && s(ctx.body, 50)) {
    out.unshift({ pinned: true, source_type: "cim", source_id: key, title: s(ctx.title, 160), path: [s(ctx.chapter, 120), s(ctx.title, 160)].filter(Boolean).join(" > "), text: s(ctx.body, 3500) });
    if (out.length > MAX_SOURCES) out.pop();
  }
  return out.map((it, i) => ({ n: i + 1, type: it.source_type === "note" ? "note" : "cim", id: it.source_id, title: it.title, path: it.path, text: it.text, href: it.source_id ? hrefOf(it) : null }));
}

function sourceBlock(list) {
  if (!list.length) return "[근거]\n(없음 — 이 질문에 맞는 교재 카드나 노트를 찾지 못했어요)";
  return "[근거]\n" + list.map((x) => `[${x.n}] ${x.type === "note" ? "내 노트" : "CIM 카드"} · ${x.path}\n${s(x.text, x.n === 1 ? 2500 : 1200)}`).join("\n\n");
}
function systemPrompt(ctx, list, route = null) {
  return `너는 투자자산운용사(CIM) 시험을 준비하는 학생의 튜터야. 학생은 내용이 어렵다고 느껴. 중학생도 알아듣게 말해.
말투: 쉬운 한국어 해요체. 기본은 짧게 — 6줄 이내. 어려운 용어는 바로 쉬운 말로 풀어 줘. 가능하면 일상 비유 한 줄 + 아주 작은 숫자 예 한 줄.
학생이 "더 자세히"를 부탁할 때만 10~15줄까지 길게 써도 돼.
근거: 아래 [근거]의 번호 자료(교재 카드 · 노트)로만 사실을 말하고, 사실을 말한 문장 끝에 [1] 처럼 근거 번호를 붙여. 여러 개면 [1][2]. [근거]에 없는 번호는 쓰지 마.
숫자 규칙: 세율 · 한도 · 기간 · 비율 · 법 조문 같은 숫자는 [근거]에 그대로 있는 것만 써. 지어내지 마. 비유 · 계산 예시에서 쓰는 숫자는 "예를 들어"라고 밝히고 쓰고, 교재 기준처럼 말하지 마.
확실하지 않은 부분은 지어내지 말고 그 자리에 "교재로 확인이 필요해요"라고 써. [근거]로 답할 수 없는 질문이면 첫 문장을 "자료에 근거가 없어요."로 시작하고, 교재에서 어떤 내용을 찾아보면 되는지만 짧게 말해 (장 · 쪽 번호는 [근거]에 있을 때만). 예시 · 비유 문장에는 근거 번호를 달지 마.
계산이 나오면 한 줄씩 숫자로 보여 줘. 문제를 물으면 왜 정답이 맞는지, 학생이 고른 답이 왜 틀렸는지(헷갈리게 만든 함정)를 짚어 줘.
'비슷한 문제'를 부탁하면 4지선다 한 문제를 내고 정답과 해설은 맨 끝에 따로 적어. 외우는 법을 부탁하면 짧은 기억 훅(앞글자 · 비유)을 하나 줘.
LaTeX(\\[ \\] \\frac 같은 것)는 쓰지 마. 공식은 "듀레이션 = …" 처럼 글자로 한 줄.
${route && ROUTES[route] ? ROUTES[route].hint + "\n" : ""}${material(ctx)}

${sourceBlock(list)}`.replace(/\*\*/g, "");
}

const publicSources = (list, used) => list.map(({ text, ...x }) => ({ ...x, cited: used ? used.has(x.n) : false }));

export function registerCimAsk(on, { json, body, fail }) {
  on("POST", "/apps/cim/ask", async ({ req, env, q, ec, user }) => {
    const b = await body(req);
    const msgs = Array.isArray(b.messages) ? b.messages.slice(-MAX_TURNS) : [];
    const clean = msgs.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (!clean.length || clean[clean.length - 1].role !== "user") fail(400, "질문을 적어 주세요.");
    const ask = clean[clean.length - 1].content, mode = routeMode(env), ckind = ["card", "quiz", "general"].includes(b.context?.kind) ? b.context.kind : "general";
    let route = null;
    if (mode === "apply") route = (await routeAsk(env, user, ask, ckind).catch(() => null))?.choice || null;
    else if (mode === "log") ec.waitUntil(routeAsk(env, user, ask, ckind).catch(() => null)); // 기록만 — 답은 지금과 같아요
    let list = await findSources(env, user, b.context, ask, { maxNotes: route === "my_notes" ? 4 : MAX_NOTE_SOURCES });
    const hasNotes = () => list.some((x) => x.type === "note");
    const withoutNotes = () => { list = list.filter((x) => x.type !== "note").map((x, i) => ({ ...x, n: i + 1 })); };
    // 노트가 있으면 안전한 공급사로만. 실패하면(키 없음 · 막힘) 노트를 빼고 보통 순서로 다시
    const run = async (onTok) => {
      if (hasNotes()) {
        try { return await aiText(env, systemPrompt(b.context, list, route), clean, PRIVATE_SAFE, onTok, { private: true, fast: true }); }
        catch (e) { console.log("cim ask private provider failed → CIM only", String(e?.message || e)); withoutNotes(); if (onTok) await onTok("", { reset: true, sources: true }); }
      }
      return aiText(env, systemPrompt(b.context, list, route), clean, TEXT_ORDER, onTok, { fast: true });
    };
    if (q.get("stream") === "0") {
      try {
        const r = await run(null);
        const c = checkCites(r.text, list.length);
        return json({ text: c.text, used: r.used, sources: publicSources(list, c.used) });
      } catch (e) { fail(e.status || 502, e.message || "AI 답을 받지 못했어요."); }
    }
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter(), enc = new TextEncoder();
    let open = true;
    const send = async (o) => { if (!open) return; try { await writer.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { open = false; } };
    ec.waitUntil((async () => {
      try {
        await send({ type: "sources", sources: publicSources(list) });
        const r = await run(async (t, meta) => {
          if (meta?.reset) { await send({ type: "reset" }); if (meta.sources) await send({ type: "sources", sources: publicSources(list) }); return; }
          await send({ type: "delta", text: t });
        });
        const c = checkCites(r.text, list.length);
        await send({ type: "end", text: c.text, used: r.used, sources: publicSources(list, c.used) });
      } catch (e) { await send({ type: "error", message: e.message || "AI 답을 받지 못했어요." }); }
      open = false; try { await writer.close(); } catch {}
    })());
    return new Response(readable, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  });
}

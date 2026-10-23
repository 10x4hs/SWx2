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
import { aiText, TEXT_ORDER } from "./ai.js";
import { retrieve, settings, hrefOf } from "./rag.js";
import { checkCites } from "./lib/rag-text.js";

const MAX_TURNS = 12;
const MAX_SOURCES = 5, MAX_NOTE_SOURCES = 2;
// 개인 자료(노트)를 보낼 수 있는 공급사: 무료 API 데이터로 모델을 학습하지 않는 곳만. Gemini 무료 등급 · OpenRouter/Kilo 무료 · MiMo · GLM 은 빼요.
// Cohere 는 체험 키 데이터 정책이 분명하지 않아서 뺐어요.
export const PRIVATE_SAFE = ["groq"];
const s = (v, n) => (typeof v === "string" ? v.replace(/\s+\n/g, "\n").trim().slice(0, n) : "");
const KEY_RE = /^s[1-3]c\d{1,2}-\d{1,3}$/;

// 화면 내용 → 프롬프트 자료 (모든 값은 길이를 잘라요)
function material(c) {
  c = c && typeof c === "object" ? c : {};
  const kind = ["card", "quiz", "general"].includes(c.kind) ? c.kind : "general";
  const ch = s(c.chapter, 120);
  if (kind === "card") return `[지금 읽는 카드] ${ch ? ch + " · " : ""}${s(c.title, 160)}`;
  if (kind === "quiz") {
    const opts = Array.isArray(c.options) ? c.options.slice(0, 5).map((o, i) => `${i + 1}) ${s(o, 300)}`).join("\n") : "";
    const ans = Number.isInteger(c.answer) ? `${c.answer + 1}번` : "모름";
    const picked = Number.isInteger(c.picked) ? `${c.picked + 1}번${c.picked === c.answer ? " (맞음)" : " (틀림)"}` : "아직 안 고름";
    return `[지금 푸는 문제] ${ch}\n${s(c.question, 800)}\n[보기]\n${opts}\n[정답] ${ans}\n[학생이 고른 답] ${picked}\n[해설] ${s(c.explain, 1200)}`;
  }
  return `[지금 화면] ${s(c.topic, 300) || "CIM 오늘 화면"}${ch ? ` · ${ch}` : ""}`;
}

/** 질문 + 화면 → 근거 목록 [{n, type, id, title, path, text, href}] */
export async function findSources(env, user, ctx, question) {
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
  try { ({ items, vecOk } = await retrieve(env, user, qtext, { cim: true, notes: true })); } catch (e) { console.log("cim ask retrieve", String(e?.message || e)); }
  let notes = 0;
  for (const it of items) {
    if (out.length >= MAX_SOURCES) break;
    if (out.some((o) => o.id === it.id || (it.source_type !== "note" && o.source_id === it.source_id))) continue;
    // 뜻이 가까운 것만 (벡터가 없을 때는 글자 찾기 위쪽 3개만)
    const strong = vecOk ? (it.cos ?? 0) >= S.minCos : it.kw !== null && it.kw <= 3;
    if (!strong) continue;
    if (it.source_type === "note") { if (notes >= MAX_NOTE_SOURCES) continue; notes++; }
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
function systemPrompt(ctx, list) {
  return `너는 투자자산운용사(CIM) 시험을 2주 안에 준비하는 학생의 튜터야.
규칙: 쉬운 한국어 해요체, 짧은 문단(3~6문장), 필요하면 짧은 목록. 처음 쓰는 용어는 그 자리에서 한 줄로 풀어 줘.
근거: 아래 [근거]의 번호 자료로만 사실을 말하고, 사실을 말한 문장 끝에 [1] 처럼 근거 번호를 붙여. 여러 개면 [1][2]. [근거]에 없는 번호는 쓰지 마.
[근거]에 없는 세율 · 한도 · 법 조문 · 통계 숫자는 지어내지 마. [근거]로 답할 수 없는 질문이면 첫 문장을 "자료에 근거가 없어요."로 시작하고, 무엇을 교재에서 찾아보면 되는지만 짧게 말해.
계산이 나오면 한 줄씩 숫자로 보여 줘. 문제를 물으면 왜 정답이 맞는지, 학생이 고른 답이 왜 틀렸는지(헷갈리게 만든 함정)를 짚어 줘.
'비슷한 문제'를 부탁하면 4지선다 한 문제를 내고 정답과 해설은 맨 끝에 따로 적어. 외우는 법을 부탁하면 짧은 기억 훅(앞글자 · 비유)을 하나 줘.
${material(ctx)}

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
    let list = await findSources(env, user, b.context, clean[clean.length - 1].content);
    const hasNotes = () => list.some((x) => x.type === "note");
    const withoutNotes = () => { list = list.filter((x) => x.type !== "note").map((x, i) => ({ ...x, n: i + 1 })); };
    // 노트가 있으면 안전한 공급사로만. 실패하면(키 없음 · 막힘) 노트를 빼고 보통 순서로 다시
    const run = async (onTok) => {
      if (hasNotes()) {
        try { return await aiText(env, systemPrompt(b.context, list), clean, PRIVATE_SAFE, onTok); }
        catch (e) { console.log("cim ask private provider failed → CIM only", String(e?.message || e)); withoutNotes(); if (onTok) await onTok("", { reset: true, sources: true }); }
      }
      return aiText(env, systemPrompt(b.context, list), clean, TEXT_ORDER, onTok);
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

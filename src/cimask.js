// CIM 투자자산운용사 AI 튜터 — POST /apps/cim/ask (#/cim 의 'AI에게 묻기' 옆 패널)
//   몸통: { messages: [{role, content}…], context: { kind: "card" | "quiz" | "general", chapter, title, body, question, options, answer, picked, explain, topic } }
//   화면이 지금 보는 내용(카드 본문 · 문제와 내 답)을 context 로 같이 보내고, 학생은 질문만 적어요.
//   답은 다른 튜터(/mba/ask · /books/ask)처럼 글자 단위 SSE: {type:"delta"|"reset"|"end"|"error"}.
//   하루 사용량은 worker.js 의 AI_PATH(aiQuota) 가 세요 — 첫 팀(SWx2) 밖은 하루 AI_DAILY 번.
//   기능 잠금: "cim" 기능이 있어야 해요 (features.js MAP · /apps/cim/*).
import { aiText } from "./ai.js";

const MAX_TURNS = 12;
const s = (v, n) => (typeof v === "string" ? v.replace(/\s+\n/g, "\n").trim().slice(0, n) : "");

// 화면 내용 → 프롬프트 자료 (모든 값은 길이를 잘라요)
function material(c) {
  c = c && typeof c === "object" ? c : {};
  const kind = ["card", "quiz", "general"].includes(c.kind) ? c.kind : "general";
  const ch = s(c.chapter, 120);
  if (kind === "card") return `[지금 읽는 카드] ${ch ? ch + " · " : ""}${s(c.title, 160)}\n[카드 본문]\n${s(c.body, 3500)}`;
  if (kind === "quiz") {
    const opts = Array.isArray(c.options) ? c.options.slice(0, 5).map((o, i) => `${i + 1}) ${s(o, 300)}`).join("\n") : "";
    const ans = Number.isInteger(c.answer) ? `${c.answer + 1}번` : "모름";
    const picked = Number.isInteger(c.picked) ? `${c.picked + 1}번${c.picked === c.answer ? " (맞음)" : " (틀림)"}` : "아직 안 고름";
    return `[지금 푸는 문제] ${ch}\n${s(c.question, 800)}\n[보기]\n${opts}\n[정답] ${ans}\n[학생이 고른 답] ${picked}\n[해설] ${s(c.explain, 1200)}`;
  }
  return `[지금 화면] ${s(c.topic, 300) || "CIM 오늘 화면"}${ch ? ` · ${ch}` : ""}`;
}

export function registerCimAsk(on, { json, body, fail }) {
  on("POST", "/apps/cim/ask", async ({ req, env, q, ec }) => {
    const b = await body(req);
    const msgs = Array.isArray(b.messages) ? b.messages.slice(-MAX_TURNS) : [];
    const clean = msgs.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (!clean.length || clean[clean.length - 1].role !== "user") fail(400, "질문을 적어 주세요.");
    const sys = `너는 투자자산운용사(CIM) 시험을 2주 안에 준비하는 학생의 튜터야.
규칙: 쉬운 한국어 해요체, 짧은 문단(3~6문장), 필요하면 짧은 목록. 아래 [자료]를 근거로 답하고, 처음 쓰는 용어는 그 자리에서 한 줄로 풀어 줘.
계산이 나오면 한 줄씩 숫자로 보여 줘. 자료에 없는 세율 · 한도 · 법 조문 · 통계 숫자는 지어내지 말고 "교재로 확인이 필요해요"라고 말해. 확실하지 않으면 모른다고 말해.
문제를 물으면 왜 정답이 맞는지, 학생이 고른 답이 왜 틀렸는지(헷갈리게 만든 함정)를 짚어 줘. '비슷한 문제'를 부탁하면 4지선다 한 문제를 내고 정답과 해설은 맨 끝에 따로 적어.
외우는 법을 부탁하면 짧은 기억 훅(앞글자 · 비유)을 하나 줘.
[자료]
${material(b.context)}`.replace(/\*\*/g, "");
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

// CIM AI 튜터 — 공부 튜터(tutor.js)의 서랍 + 대화 칸 위에 CIM 것만 얹어요. 'AI에게 묻기'(머리 · 카드 · 문제 화면)로 열고 닫아요.
//   · 지금 화면 내용이 저절로 같이 가요 (setAi): 카드 = 장 · 제목 · 본문 / 문제 = 문제 · 보기 · 정답 · 내 답 · 해설 / 그 밖 = 주제 한 줄
//   · 빠른 질문은 화면마다 (카드 · 문제 · 맞힌 문제 · 그 밖), 대화 흐름도 화면마다 따로
//   · 빠른 질문(쉽게 설명해줘 · 예시 들어줘 · 외우는 법)은 카드에 '쉽게 보기'(p.easy)가 있으면 AI 를 부르지 않고 바로 답해요 → '더 자세히 (AI)'를 누르면 AI 에게
//   · 근거: 서버가 찾은 CIM 카드 · 내 노트에 [1]..[n] 번호를 붙여 보내고(sources), 답의 [1] 은 그 자료로 가는 링크 · 아래 '근거' 칩
//   · 크기 · 열림은 이 기기에 기억(cim-ai-size · cim-ai-open), 대화는 이번 접속 동안(cim-ai-chat)
import { streamCimAsk } from "../api.js";
import { chatMarkup, mountChat, drawerMarkup, mountDrawer } from "../tutor.js";

// 화면(카드 · 문제)이 바뀌면 대화 흐름도 새로: 같은 화면에서 나눈 말만 AI 에 보내요 (앞 화면 이야기에 끌려가지 않게)
const keyOf = (c) => (c.kind === "card" ? "card:" + (c.chapter || "") + (c.title || "") : c.kind === "quiz" ? "quiz:" + (c.question || "").slice(0, 80) : "general");

const QUICK = {
  card: ["쉽게 설명해줘", "예시 들어줘", "외우는 법"],
  quiz: ["왜 틀렸어?", "비슷한 문제 내줘"],
  quizOk: ["왜 이게 정답이야?", "비슷한 문제 내줘"],
  general: ["오늘 뭐부터 할까?"],
};

// 바로 답 (AI 없이) — 카드의 쉽게 보기에서 꺼내요. 없으면 null → AI 에게
function instantAnswer(q, c) {
  const e = c?.kind === "card" ? c.easy : null;
  if (!e?.lines?.length) return null;
  const src = `\n\n_교재${c.page ? " " + c.page + "쪽" : ""} 카드의 쉽게 보기에서 가져왔어요._`;
  if (q === "쉽게 설명해줘") return e.lines.map((l) => "- " + l).join("\n") + (e.analogy ? `\n\n**비유하면** ${e.analogy}` : "") + src;
  if (q === "예시 들어줘") return (e.example ? `**숫자로** ${e.example.replace(/^예\s*[:：]\s*/, "")}` : `**비유하면** ${e.analogy}`) + (e.example && e.analogy ? `\n\n**비유하면** ${e.analogy}` : "") + src;
  if (q === "외우는 법") return `**시험 포인트**\n${(e.points || []).map((l) => "- " + l).join("\n")}` + (e.analogy ? `\n\n**그림으로 기억** ${e.analogy}` : "") + src;
  return null;
}

let ctxNow = { kind: "general", topic: "CIM 오늘 화면" }, chat = null;
// 화면이 지금 보는 내용을 알려 줘요 (서랍이 닫혀 있어도 기억만)
export function setAi(c) { ctxNow = c || { kind: "general" }; chat?.refresh(); }

function ctxLine(c) {
  if (c.kind === "card") return `지금 카드 · ${c.title || ""}`;
  if (c.kind === "quiz") return `지금 문제 · ${c.chapter || ""}`;
  return c.topic ? `지금 화면 · ${c.topic}` : "";
}

// root = .cim (여기에 --tut-w · --tut-h · .tut-on 을 붙여요). 돌려주는 함수 = 정리
export function mountAi(root) {
  root.insertAdjacentHTML("beforeend", drawerMarkup({ id: "c-ai", title: "AI에게 묻기", body: chatMarkup("full", { sub: "", empty: "지금 화면 내용을 같이 보내요. 질문만 적으면 돼요.", ph: "궁금한 걸 적고 Enter", quick: () => [] }) }));
  const aside = root.querySelector("#c-ai");
  chat = mountChat(aside, "cim", null, null, {
    storeKey: "cim-ai-chat", keepQuick: true, errors: "inline",
    sub: () => ctxLine(ctxNow),
    quick: () => (ctxNow.kind === "quiz" ? (ctxNow.picked != null && ctxNow.picked === ctxNow.answer ? QUICK.quizOk : QUICK.quiz) : QUICK[ctxNow.kind] || QUICK.general),
    instant: (q) => instantAnswer(q, ctxNow),
    scope: () => ({ k: keyOf(ctxNow), t: ctxLine(ctxNow) }),
    stream: (_id, thread, onEvent, signal) => streamCimAsk(ctxNow, thread, onEvent, signal),
  });
  const offDrawer = mountDrawer(root, aside, { opener: "[data-ai-open]", sizeKey: "cim-ai-size", openKey: "cim-ai-open" });
  const offChat = chat;
  return () => { offChat(); offDrawer(); if (chat === offChat) chat = null; };
}

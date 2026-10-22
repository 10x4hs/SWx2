// CIM AI 튜터 옆 패널 — 'AI에게 묻기'(머리 · 카드 · 문제 화면)로 열고 닫아요.
//   · 지금 화면 내용이 저절로 같이 가요 (setAi): 카드 = 장 · 제목 · 본문 / 문제 = 문제 · 보기 · 정답 · 내 답 · 해설 / 그 밖 = 주제 한 줄
//   · 넓은 화면은 오른쪽 패널(왼쪽 가장자리를 끌어 너비 320–720px, 작게 · 보통 · 크게), 열면 본문이 왼쪽으로 비켜요
//   · 폰(≤760px)은 아래에서 올라오는 판, 위 손잡이를 끌어 높이
//   · 열림 · 크기는 이 기기에 기억(localStorage cim-ai-open · cim-ai-size), 대화는 이번 접속 동안(sessionStorage)
//   · 답은 /api/apps/cim/ask 에서 글자 단위로(SSE), 도는 동안 '멈추기'. Enter 보내기 · Shift+Enter 줄바꿈
import { streamCimAsk } from "../api.js";
import { renderMarkdown as renderMd } from "../md.js";
import { esc } from "./ui.js";

const SIZE_KEY = "cim-ai-size", OPEN_KEY = "cim-ai-open", CHAT_KEY = "cim-ai-chat";
const SIZES = { s: [340, 0.42], m: [440, 0.62], l: [640, 0.9] };
const narrow = () => innerWidth <= 760;
const clampW = (w) => Math.round(Math.max(320, Math.min(w, 720, Math.max(320, innerWidth - 360))));
const clampH = (h) => Math.max(0.3, Math.min(0.92, h));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
// **굵게** 는 미리 <strong> 으로 — 한글 조사가 바로 붙거나 '?' 로 끝나도 굵어지게 (마크다운 규칙으로는 안 굵어지는 자리). 결과는 DOMPurify 가 걸러요
const md = (s) => renderMd(String(s || "").replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, "<strong>$1</strong>"));
// 화면(카드 · 문제)이 바뀌면 대화 흐름도 새로: 같은 화면에서 나눈 말만 AI 에 보내요 (앞 화면 이야기에 끌려가지 않게)
const keyOf = (c) => (c.kind === "card" ? "card:" + (c.chapter || "") + (c.title || "") : c.kind === "quiz" ? "quiz:" + (c.question || "").slice(0, 80) : "general");

const QUICK = {
  card: ["쉽게 설명해줘", "예시 들어줘", "외우는 법"],
  quiz: ["왜 틀렸어?", "비슷한 문제 내줘"],
  quizOk: ["왜 이게 정답이야?", "비슷한 문제 내줘"],
  general: ["오늘 뭐부터 할까?"],
};

let ctxNow = { kind: "general", topic: "CIM 오늘 화면" }, panel = null;
// 화면이 지금 보는 내용을 알려 줘요 (패널이 닫혀 있어도 기억만)
export function setAi(c) { ctxNow = c || { kind: "general" }; panel?.refresh(); }
export const aiContext = () => ctxNow;

function ctxLine(c) {
  if (c.kind === "card") return `지금 카드 · ${c.title || ""}`;
  if (c.kind === "quiz") return `지금 문제 · ${c.chapter || ""}`;
  return c.topic ? `지금 화면 · ${c.topic}` : "";
}

// root = .cim (여기에 --ai-w · --ai-h · .ai-on 을 붙여요). 돌려주는 함수 = 정리
export function mountAi(root) {
  root.insertAdjacentHTML("beforeend", `<aside class="c-ai" id="c-ai" hidden aria-label="AI 튜터">
    <div class="c-ai-grip" role="separator" tabindex="0" aria-label="패널 크기 (화살표 키로도 바꿔요)" aria-valuemin="0" aria-valuemax="100"><i></i></div>
    <div class="c-ai-h"><b>AI에게 묻기</b><span class="c-ai-sz" role="group" aria-label="크기">${[["s", "작게"], ["m", "보통"], ["l", "크게"]].map(([k, t]) => `<button type="button" data-sz="${k}">${t}</button>`).join("")}</span><button type="button" class="c-ghost press" data-ai-clear hidden>새 대화</button><button type="button" class="c-ai-x press" data-ai-x aria-label="닫기">✕</button></div>
    <p class="c-ai-ctx" id="c-ai-ctx"></p>
    <div class="c-ai-log" id="c-ai-log" aria-live="polite"></div>
    <div class="c-ai-quick" id="c-ai-quick"></div>
    <form class="c-ai-form" id="c-ai-form"><textarea rows="1" placeholder="궁금한 걸 적고 Enter" aria-label="AI 튜터에게 질문"></textarea><button class="c-ai-send press" type="submit">보내기</button><button class="c-ai-stop press" type="button" data-ai-stop hidden>멈추기</button></form>
  </aside>`);
  const ai = root.querySelector("#c-ai"), grip = ai.querySelector(".c-ai-grip"), log = ai.querySelector("#c-ai-log"), ta = ai.querySelector("textarea");
  let size = load(SIZE_KEY, null); if (!size || !size.w || !size.h) size = { w: 440, h: 0.62, k: "m" };
  let chat = []; try { chat = JSON.parse(sessionStorage.getItem(CHAT_KEY) || "[]"); } catch {}
  let busy = false, ctrl = null, errMsg = "";

  const apply = () => {
    root.style.setProperty("--ai-w", clampW(size.w) + "px");
    root.style.setProperty("--ai-h", Math.round(clampH(size.h) * 100) + "dvh");
    ai.querySelectorAll("[data-sz]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sz === size.k)));
    grip.setAttribute("aria-orientation", narrow() ? "horizontal" : "vertical");
    grip.setAttribute("aria-valuenow", String(narrow() ? Math.round(clampH(size.h) * 100) : Math.round(((clampW(size.w) - 320) / 400) * 100)));
  };
  const saveChat = () => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-24))); } catch {} };
  const paint = (live = -1) => {
    log.innerHTML = chat.length ? chat.map((m, i) => (m.role === "user" && i && chat[i - 1].k !== m.k ? `<p class="c-ai-sep">${esc(m.t || "새 화면")}</p>` : "") + (m.role === "user" ? `<div class="c-ai-msg me"><p>${esc(m.content)}</p></div>`
      : `<div class="c-ai-msg bot${i === live ? " live" : ""}"><div class="md">${m.content ? md(m.content) : `<span class="c-ai-dots" aria-label="답을 쓰는 중"><i></i><i></i><i></i></span>`}</div></div>`)).join("")
      + (errMsg ? `<div class="c-ai-msg err" role="alert"><b>답을 받지 못했어요</b><p>${esc(errMsg)}</p></div>` : "")
      : `<div class="c-ai-empty">${errMsg ? `<div class="c-ai-msg err" role="alert"><b>답을 받지 못했어요</b><p>${esc(errMsg)}</p></div>` : "지금 화면 내용을 같이 보내요. 질문만 적으면 돼요."}</div>`;
    log.scrollTop = log.scrollHeight;
    ai.querySelector("[data-ai-clear]").hidden = !chat.length;
    ai.querySelector("[data-ai-stop]").hidden = !busy;
    ai.querySelector(".c-ai-send").hidden = busy;
  };
  const refresh = () => {
    const c = ctxNow, list = c.kind === "quiz" ? (c.picked != null && c.picked === c.answer ? QUICK.quizOk : QUICK.quiz) : QUICK[c.kind] || QUICK.general;
    ai.querySelector("#c-ai-ctx").textContent = ctxLine(c);
    ai.querySelector("#c-ai-quick").innerHTML = list.map((q) => `<button type="button" class="c-chip press" data-ai-q="${esc(q)}">${esc(q)}</button>`).join("");
  };
  let raf = 0;
  const paintLive = (i, text) => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const el = log.querySelector(".c-ai-msg.live .md"); if (!el) return paint(i); el.innerHTML = md(text); log.scrollTop = log.scrollHeight; }); };

  async function ask(text) {
    const q = String(text || "").trim();
    if (!q || busy) return;
    errMsg = "";
    const k = keyOf(ctxNow), t = ctxLine(ctxNow);
    chat.push({ role: "user", content: q, k, t }, { role: "assistant", content: "", k });
    const at = chat.length - 1;
    busy = true; ta.value = ""; ta.style.height = ""; paint(at);
    ctrl = new AbortController();
    let got = "";
    try {
      const thread = chat.slice(0, at).filter((m) => m.k === k && m.content).map(({ role, content }) => ({ role, content }));
      await streamCimAsk(ctxNow, thread, (ev) => {
        if (ev.type === "delta") { got += ev.text; chat[at].content = got; paintLive(at, got); }
        else if (ev.type === "reset") { got = ""; chat[at].content = ""; paint(at); }
        else if (ev.type === "end") chat[at].content = ev.text || got;
        else if (ev.type === "error") throw new Error(ev.message);
      }, ctrl.signal);
      if (!chat[at].content && !ctrl.signal.aborted) throw new Error("AI 답이 비어 있어요.");
    } catch (e) {
      if (e.name !== "AbortError") errMsg = e.message || "AI 답을 받지 못했어요.";
    } finally {
      if (!chat[at]?.content) chat.splice(at, 1); // 빈 답은 지우고 내 질문은 남겨요 (다시 물을 수 있게)
      busy = false; ctrl = null; paint(); saveChat();
    }
  }

  const setOpen = (open, focus = true) => {
    ai.hidden = !open; root.classList.toggle("ai-on", open);
    root.querySelectorAll("[data-ai-open]").forEach((b) => b.setAttribute("aria-expanded", String(open)));
    keep(OPEN_KEY, open ? 1 : 0);
    if (open) { apply(); refresh(); paint(); if (focus) ta.focus({ preventScroll: true }); }
  };
  const onClick = (e) => {
    const t = e.target;
    if (t.closest("[data-ai-open]")) { setOpen(ai.hidden); return; }
    if (!ai.contains(t)) return;
    if (t.closest("[data-ai-x]")) return setOpen(false);
    const sz = t.closest("[data-sz]"); if (sz) { const [w, h] = SIZES[sz.dataset.sz]; size = { w, h, k: sz.dataset.sz }; apply(); keep(SIZE_KEY, size); return; }
    const qk = t.closest("[data-ai-q]"); if (qk) return ask(qk.dataset.aiQ);
    if (t.closest("[data-ai-stop]")) return ctrl?.abort();
    if (t.closest("[data-ai-clear]")) { ctrl?.abort(); chat = []; errMsg = ""; saveChat(); paint(); }
  };
  ai.querySelector("#c-ai-form").addEventListener("submit", (e) => { e.preventDefault(); ask(ta.value); });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(ta.value); } if (e.key === "Escape") setOpen(false); });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; });
  // 끌기: 넓은 화면 = 왼쪽 가장자리를 좌우로, 폰 = 위 손잡이를 위아래로
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch {} root.classList.add("ai-drag");
    const mv = (ev) => { size = narrow() ? { ...size, h: clampH(1 - ev.clientY / innerHeight), k: "" } : { ...size, w: clampW(innerWidth - ev.clientX - 16), k: "" }; apply(); };
    const up = () => { root.classList.remove("ai-drag"); grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up); keep(SIZE_KEY, size); };
    grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
  });
  grip.addEventListener("keydown", (e) => {
    const d = narrow() ? { ArrowUp: 0.05, ArrowDown: -0.05 }[e.key] : { ArrowLeft: 30, ArrowRight: -30 }[e.key]; if (!d) return;
    e.preventDefault(); size = narrow() ? { ...size, h: clampH(size.h + d), k: "" } : { ...size, w: clampW(size.w + d), k: "" }; apply(); keep(SIZE_KEY, size);
  });
  root.addEventListener("click", onClick);
  addEventListener("resize", apply);
  panel = { refresh };
  apply();
  // 열어 둔 채 떠났으면 다시 열어요 — 폰은 글을 가리니까 닫힌 채로
  if (load(OPEN_KEY, 0) === 1 && !narrow()) setOpen(true, false);
  return () => { ctrl?.abort(); panel = null; root.removeEventListener("click", onClick); removeEventListener("resize", apply); };
}

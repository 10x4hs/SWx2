// 논문 튜터 채팅 — 옆 칸(목차 아래)과 아래 섹션이 같은 대화를 봐요.
// 답은 글자 단위로 흘러나오고(SSE), 본문 글자를 긁으면 입력창 위에 "인용 중" 칩이 붙어요.
import { $, $$, esc, toast } from "../util.js";
import { streamPaperAsk } from "../api.js";
import { icon } from "../icons.js";
import { renderMarkdown as renderMd } from "../md.js";
// 모델이 한글 단어 사이에 **굵게** 를 붙이면 마크다운 규칙상 안 굵어져요 → 앞뒤에 보이지 않는 경계를 넣어 줘요
const renderMarkdown = (s) => renderMd(String(s || "").replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, "\u200b**$1**\u200b"));

const QUICK = ["이 논문을 처음 보는 사람에게 3문장으로", "핵심 아이디어가 왜 효과가 있어요?", "우리 프로젝트(RGB+열화상 · RKNN)에서 어떻게 써요?", "헷갈리기 쉬운 점 3개만", "지금 읽는 부분을 숫자 예시로"];

export function chatMarkup(variant) {
  const mini = variant === "mini";
  return `<div class="ppc ${mini ? "mini" : ""}" data-ppc="${variant}">
    <div class="ppc-head">${icon.spark(13)} <b>AI 튜터</b><span class="faint">${mini ? "읽다가 바로" : "이 논문 자료를 다 읽은 AI 예요"}</span><button type="button" class="ppc-clear" data-ppc-clear title="대화 지우기" hidden>${icon.x(12)}</button></div>
    <div class="ppc-log" data-ppc-log><div class="ppc-empty faint">${mini ? "모르는 걸 바로 물어봐요. 본문 글자를 긁으면 그 문장으로 물어볼 수 있어요." : "무엇이든 물어봐요. 답은 옆 칸에도 똑같이 보여요."}</div></div>
    <div class="ppc-quick">${QUICK.map((q) => `<button type="button" class="chip ppc-q" data-ppc-quick="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <form class="ppc-form" data-ppc-form>
      <div class="ppc-quote" data-ppc-quote hidden><span class="ppc-quote-k">인용 중</span><span class="ppc-quote-t" data-ppc-quote-text></span><button type="button" class="ppc-quote-x" data-ppc-quote-x aria-label="인용 빼기">${icon.x(11)}</button></div>
      <div class="ppc-row"><textarea class="ppc-in" rows="1" placeholder="${mini ? "질문을 적고 Enter" : "예: 왜 NMS 가 없어도 상자가 겹치지 않아요?"}" aria-label="AI 튜터에게 묻기"></textarea>
        <button class="ppc-send" type="submit" aria-label="보내기">${icon.send(15)}</button><button class="ppc-stop" type="button" data-ppc-stop aria-label="멈추기" hidden><i></i></button></div>
    </form>
  </div>`;
}

// root: 공부 페이지 뷰, id: 논문 id, article: 본문 요소(글자 긁기 감지용)
export function mountChat(root, id, article, decorate = null) {
  const KEY = `trio-pp-chat-${id}`;
  let chat = [], busy = false, ctrl = null, quote = "";
  try { chat = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch {}
  const panels = $$("[data-ppc]", root).sort((a, b) => (b.dataset.ppc === "mini") - (a.dataset.ppc === "mini")); // 옆 칸 먼저
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(chat.slice(-24))); } catch {} };

  function paint(streamingIdx = -1) {
    const html = chat.map((m, i) => `<div class="ppc-msg ${m.role} ${i === streamingIdx ? "live" : ""}">${m.role === "assistant" ? `<span class="ppc-av">${icon.spark(11)}</span><div class="ppc-bub md">${m.content ? renderMarkdown(m.content) : `<span class="ppc-dots"><i></i><i></i><i></i></span>`}</div>` : `<div class="ppc-bub">${esc(m.content)}</div>`}</div>`).join("");
    panels.forEach((p) => {
      const log = $("[data-ppc-log]", p);
      const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
      log.innerHTML = html || `<div class="ppc-empty faint">${p.dataset.ppc === "mini" ? "모르는 걸 바로 물어봐요. 본문 글자를 긁으면 그 문장으로 물어볼 수 있어요." : "무엇이든 물어봐요. 답은 옆 칸에도 똑같이 보여요."}</div>`;
      if (stick || streamingIdx < 0) log.scrollTop = log.scrollHeight;
      if (decorate && streamingIdx < 0) log.querySelectorAll(".ppc-msg.assistant .ppc-bub").forEach((x) => decorate(x)); // 다 받은 답에도 용어 밑줄
      $("[data-ppc-clear]", p).hidden = !chat.length;
      $("[data-ppc-stop]", p).hidden = !busy;
      $(".ppc-send", p).hidden = busy;
      $(".ppc-quick", p).hidden = chat.length > 0;
    });
  }
  function setQuote(t) {
    quote = t || "";
    panels.forEach((p) => { const q = $("[data-ppc-quote]", p); q.hidden = !quote; $("[data-ppc-quote-text]", p).textContent = quote.length > 140 ? quote.slice(0, 140) + "…" : quote; });
  }
  async function ask(text, fromPanel) {
    const q = String(text || "").trim();
    if (!q || busy) return;
    const full = quote ? `"${quote}"\n\n${q}` : q;
    setQuote("");
    chat.push({ role: "user", content: full });
    chat.push({ role: "assistant", content: "" });
    const ai = chat.length - 1;
    busy = true; panels.forEach((p) => { const ta = $(".ppc-in", p); ta.value = ""; ta.style.height = ""; });
    paint(ai);
    ctrl = new AbortController();
    let got = "";
    try {
      await streamPaperAsk(id, chat.slice(0, ai), (ev) => {
        if (ev.type === "delta") { got += ev.text; chat[ai].content = got; paintLive(ai, got); }
        else if (ev.type === "reset") { got = ""; chat[ai].content = ""; paint(ai); }
        else if (ev.type === "end") { chat[ai].content = ev.text || got; }
        else if (ev.type === "error") throw new Error(ev.message);
      }, ctrl.signal);
      if (!chat[ai].content) throw new Error("AI 답을 받지 못했어요.");
    } catch (e) {
      if (!got) { chat.splice(ai - 1, 2); if (e.name !== "AbortError") toast(e.message || "AI 답을 못 받았어요.", "err"); }
    } finally { busy = false; ctrl = null; paint(); save(); fromPanel && $(".ppc-in", fromPanel)?.focus(); }
  }
  // 글자가 올 때마다 전체를 다시 그리지 않고, 마지막 말풍선만 갱신해요
  let raf = 0;
  function paintLive(ai, text) {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      panels.forEach((p) => {
        const log = $("[data-ppc-log]", p), last = log.querySelector(".ppc-msg.live .ppc-bub");
        if (!last) return paint(ai);
        const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
        last.innerHTML = renderMarkdown(text) + `<span class="ppc-caret"></span>`;
        if (stick) log.scrollTop = log.scrollHeight;
      });
    });
  }

  panels.forEach((p) => {
    const form = $("[data-ppc-form]", p), ta = $(".ppc-in", p);
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; };
    ta.addEventListener("input", grow);
    form.addEventListener("submit", (e) => { e.preventDefault(); ask(ta.value, p); });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(ta.value, p); } });
    $("[data-ppc-stop]", p).addEventListener("click", () => ctrl?.abort());
    $("[data-ppc-clear]", p).addEventListener("click", () => { if (busy) ctrl?.abort(); chat = []; save(); paint(); });
    $("[data-ppc-quote-x]", p).addEventListener("click", () => setQuote(""));
    $$("[data-ppc-quick]", p).forEach((b) => b.addEventListener("click", () => ask(b.dataset.ppcQuick, p)));
  });

  // 본문 글자 긁기 → 보이는 패널의 입력창 위에 "인용 중" 칩
  let selT = 0;
  const onSel = () => {
    clearTimeout(selT);
    selT = setTimeout(() => {
      const s = getSelection(), t = s?.toString().trim();
      if (!t || t.length < 4 || t.length > 600 || !s.rangeCount || !article.contains(s.anchorNode)) return;
      setQuote(t);
      const target = panels.find((p) => p.offsetParent !== null) || panels[0];
      $(".ppc-in", target)?.focus({ preventScroll: true });
    }, 250);
  };
  document.addEventListener("mouseup", onSel);
  document.addEventListener("touchend", onSel);
  paint();
  return () => { ctrl?.abort(); document.removeEventListener("mouseup", onSel); document.removeEventListener("touchend", onSel); clearTimeout(selT); };
}

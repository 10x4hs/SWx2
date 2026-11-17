// 공부 AI 튜터 하나 — 논문 · 쉽게 읽기 · 책 · MBA · SW 과정 · CIM 이 같이 써요.
//   chatMarkup + mountChat: 대화 칸 (옆 칸 · 아래 섹션이 같은 대화를 볼 수 있어요)
//     · 답은 글자 단위로 흘러나와요(SSE delta), 도는 동안 '멈추기'. Enter 보내기 · Shift+Enter 줄바꿈
//     · 본문 글자를 긁으면 입력창 위에 "인용 중" 칩 (article 을 줄 때만)
//     · 고를 수 있는 기능 (opts): 근거[n] 링크 + 근거 칩(서버가 sources 를 보내면 저절로) · 빠른 질문의 바로 답(instant, AI 없이) → '더 자세히 (AI)'
//       · 화면마다 따로 이어지는 대화(scope) · 그림 토큰(post · decorate) · 쉽게/깊게(level) · 오류를 대화 안에 보여 주기(errors: "inline")
//   drawerMarkup + mountDrawer: 오른쪽 서랍 하나 (CIM · SW 과정)
//     · 넓은 화면 = 오른쪽 패널, 왼쪽 가장자리를 끌어 너비 320–720px · 작게 · 보통 · 크게 · 화살표 키, 1100px 이상이면 본문이 옆으로 비켜 나란히
//     · 폰(≤760px) = 아래에서 올라오는 판, 위 손잡이를 끌어 높이
//     · 크기 · 열림은 이 기기에 기억(localStorage, 앱마다 키), 열어 둔 채 떠났으면 나란히 놓이는 넓은 화면에서만 다시 열어요
import { $, $$, esc, toast } from "./util.js";
import { streamPaperAsk } from "./api.js";
import { icon } from "./icons.js";
import { renderMarkdown } from "./md.js";

// **굵게** 는 미리 <strong> 으로 — 한글 조사가 바로 붙거나 '?' 로 끝나도 굵어지게 (마크다운 규칙으로는 안 굵어지는 자리). 결과는 DOMPurify 가 걸러요
export const md = (s) => renderMarkdown(String(s || "").replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, "<strong>$1</strong>"));
// 답 속 [1] → 그 근거로 가는 작은 링크 (근거가 없는 번호는 서버가 이미 지웠어요)
const cites = (html, src) => (src?.length ? html.replace(/\[(\d{1,2})\]/g, (m, n) => { const x = src.find((y) => y.n === +n); return x?.href ? `<a class="ppc-cite" href="${esc(x.href)}" title="${esc(x.title || "")}">${n}</a>` : x ? `<sup class="ppc-cite">${n}</sup>` : m; }) : html);
// 칩은 답이 실제로 단 근거만. 하나도 안 달았으면 찾은 자료를 '참고'로 — 단 "자료에 근거가 없어요" 답이면 칩도 없어요
const srcChips = (src, text) => {
  if (!src?.length) return "";
  const cited = src.filter((x) => x.cited);
  if (!cited.length && /^\s*자료에 근거가 없어요/.test(text || "")) return "";
  return `<div class="ppc-src" aria-label="근거"><span>${cited.length ? "근거" : "참고"}</span>${(cited.length ? cited : src).map((x) => `${x.href ? `<a class="ppc-src-c" href="${esc(x.href)}"` : `<span class="ppc-src-c"`} title="${esc(x.path || "")}"><b class="num">${x.n}</b>${x.type === "note" ? "노트 · " : ""}${esc(x.title || "")}${x.href ? "</a>" : "</span>"}`).join("")}</div>`;
};

const QUICK = ["이 논문을 처음 보는 사람에게 3문장으로", "핵심 아이디어가 왜 효과가 있어요?", "우리 프로젝트(RGB+열화상 · RKNN)에서 어떻게 써요?", "헷갈리기 쉬운 점 3개만", "지금 읽는 부분을 숫자 예시로"];
const EMPTY_MINI = "모르는 걸 바로 물어봐요. 본문 글자를 긁으면 그 문장으로 물어볼 수 있어요.", EMPTY_FULL = "무엇이든 물어봐요. 답은 옆 칸에도 똑같이 보여요.";
const quickHtml = (list) => list.map((q) => `<button type="button" class="chip ppc-q" data-ppc-quick="${esc(q)}">${esc(q)}</button>`).join("");

// opts.quick: 빠른 질문 목록 · opts.sub: 머리 줄 설명 · opts.empty: 빈 대화 안내 · opts.ph: 입력창 안내 · opts.title: 머리 이름
export function chatMarkup(variant, opts = {}) {
  const mini = variant === "mini";
  const quick = typeof opts.quick === "function" ? [] : opts.quick || QUICK;
  return `<div class="ppc ${mini ? "mini" : ""}" data-ppc="${variant}"${opts.empty ? ` data-ppc-empty="${esc(opts.empty)}"` : ""}>
    <div class="ppc-head">${icon.spark(13)} <b>${esc(opts.title || "AI 튜터")}</b><span class="faint" data-ppc-sub>${esc(typeof opts.sub === "string" ? opts.sub : mini ? "읽다가 바로" : "이 논문 자료를 다 읽은 AI 예요")}</span><button type="button" class="ppc-clear" data-ppc-clear title="대화 지우기" aria-label="대화 지우기" hidden>${icon.x(12)}</button></div>
    <div class="ppc-log" data-ppc-log aria-live="polite"><div class="ppc-empty faint">${esc(opts.empty || (mini ? EMPTY_MINI : EMPTY_FULL))}</div></div>
    <div class="ppc-quick" data-ppc-quicks>${quickHtml(quick)}</div>
    <form class="ppc-form" data-ppc-form>
      <div class="ppc-quote" data-ppc-quote hidden><span class="ppc-quote-k">인용 중</span><span class="ppc-quote-t" data-ppc-quote-text></span><button type="button" class="ppc-quote-x" data-ppc-quote-x aria-label="인용 빼기" title="인용 빼기">${icon.x(13)}</button></div>
      <div class="ppc-row"><textarea class="ppc-in" rows="1" placeholder="${opts.ph ? esc(opts.ph) : mini ? "질문을 적고 Enter" : "예: 왜 NMS 가 없어도 상자가 겹치지 않아요?"}" aria-label="AI 튜터에게 묻기"></textarea>
        <button class="ppc-send" type="submit" aria-label="보내기">${icon.send(15)}</button><button class="ppc-stop" type="button" data-ppc-stop aria-label="멈추기" hidden><i></i></button></div>
    </form>
  </div>`;
}

// root: 대화 칸이 든 요소, id: 대화 저장 이름(논문 id 등), article: 본문 요소(글자 긁기 감지용, 없으면 null)
// decorate(bub): 다 받은 답 말풍선을 한 번 더 손볼 때 (용어 밑줄 · 그림)
// opts.stream(id, messages, onEvent, signal, level): 튜터 API (기본 = 논문) · opts.level: "easy" | "deep" (바꿔도 돼요, 쉽게 대화는 따로 저장)
// opts.post(html): 그린 HTML 을 손볼 때 (SW 과정: [[그림:id]] → 그림 칩) · opts.storeKey: 저장 이름을 통째로
// opts.quick: 목록 또는 () => 목록 (refresh() 로 다시 그려요) · opts.keepQuick: 대화가 있어도 빠른 질문을 계속 보여요 · opts.sub: 글 또는 () => 글
// opts.instant(q): 빠른 질문에 AI 없이 바로 줄 답 (없으면 null) → 그 답 아래 '더 자세히 (AI)'
// opts.scope(): { k, t } 화면 열쇠 · 이름 — 같은 화면에서 나눈 말만 AI 에 보내고, 화면이 바뀐 자리에 줄을 그어요
// opts.errors: "inline" 이면 실패를 대화 안에 남기고 내 질문은 그대로 (기본은 토스트 + 질문도 거둬요)
// 돌려주는 함수 = 정리. 그 함수의 .refresh() = 빠른 질문 · 머리 줄을 다시 그려요
export function mountChat(root, id, article, decorate = null, opts = {}) {
  const KEY = opts.storeKey || `trio-pp-chat-${id}${opts.level ? "-" + opts.level : ""}`;
  let chat = [], busy = false, ctrl = null, quote = "", err = "";
  try { chat = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch {}
  const panels = $$("[data-ppc]", root).sort((a, b) => (b.dataset.ppc === "mini") - (a.dataset.ppc === "mini")); // 옆 칸 먼저
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(chat.slice(-24))); } catch {} };
  const post = opts.post || ((h) => h);
  const inline = opts.errors === "inline";
  const emptyOf = (p) => p.dataset.ppcEmpty || (p.dataset.ppc === "mini" ? EMPTY_MINI : EMPTY_FULL); // chatMarkup 의 opts.empty 를 그대로 (다시 그려도 안내가 바뀌지 않게)
  const errHtml = () => (err ? `<div class="ppc-err" role="alert"><b>답을 받지 못했어요</b><p>${esc(err)}</p></div>` : "");

  function bot(m, i, live) {
    const body = m.content ? post(cites(md(m.content), m.sources)) : `<span class="ppc-dots" aria-label="답을 쓰는 중"><i></i><i></i><i></i></span>`;
    const more = m.inst && i === chat.length - 1 && !busy ? `<button type="button" class="chip ppc-more" data-ppc-more="${esc(m.inst)}">더 자세히 (AI)</button>` : "";
    return `<div class="ppc-msg assistant ${live ? "live" : ""}"><span class="ppc-av">${icon.spark(11)}</span><div class="ppc-bub md">${body}${live ? "" : srcChips(m.sources, m.content)}${more}</div></div>`;
  }
  function paint(streamingIdx = -1) {
    const html = chat.map((m, i) => (opts.scope && m.role === "user" && i && chat[i - 1].k !== m.k ? `<p class="ppc-sep">${esc(m.t || "새 화면")}</p>` : "")
      + (m.role === "assistant" ? bot(m, i, i === streamingIdx) : `<div class="ppc-msg user"><div class="ppc-bub">${esc(m.content)}</div></div>`)).join("") + errHtml();
    panels.forEach((p) => {
      const log = $("[data-ppc-log]", p);
      const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
      log.innerHTML = html || `<div class="ppc-empty faint">${esc(emptyOf(p))}</div>`;
      if (stick || streamingIdx < 0) log.scrollTop = log.scrollHeight;
      if (decorate && streamingIdx < 0) log.querySelectorAll(".ppc-msg.assistant .ppc-bub").forEach((x) => decorate(x)); // 다 받은 답에도 용어 밑줄
      $("[data-ppc-clear]", p).hidden = !chat.length && !err;
      $("[data-ppc-stop]", p).hidden = !busy;
      $(".ppc-send", p).hidden = busy;
      $(".ppc-quick", p).hidden = !opts.keepQuick && chat.length > 0;
    });
  }
  function refresh() {
    if (typeof opts.quick === "function") { const h = quickHtml(opts.quick() || []); panels.forEach((p) => { $("[data-ppc-quicks]", p).innerHTML = h; }); }
    if (typeof opts.sub === "function") { const s = opts.sub() || ""; panels.forEach((p) => { $("[data-ppc-sub]", p).textContent = s; }); }
  }
  function setQuote(t) {
    quote = t || "";
    panels.forEach((p) => { const q = $("[data-ppc-quote]", p); q.hidden = !quote; $("[data-ppc-quote-text]", p).textContent = quote.length > 140 ? quote.slice(0, 140) + "…" : quote; });
  }
  async function ask(text, fromPanel, quick = false) {
    const q = String(text || "").trim();
    if (!q || busy) return;
    err = "";
    const { k, t } = opts.scope?.() || {};
    const inst = quick && opts.instant ? opts.instant(q) : null;
    if (inst) { chat.push({ role: "user", content: q, k, t }, { role: "assistant", content: inst, k, inst: q }); paint(); save(); return; } // AI 를 부르지 않아요
    const full = quote ? `"${quote}"\n\n${q}` : q;
    setQuote("");
    chat.push({ role: "user", content: full, k, t }, { role: "assistant", content: "", k });
    const ai = chat.length - 1;
    busy = true; panels.forEach((p) => { const ta = $(".ppc-in", p); ta.value = ""; ta.style.height = ""; });
    paint(ai);
    ctrl = new AbortController();
    let got = "";
    try {
      const thread = chat.slice(0, ai).filter((m) => m.content && (!opts.scope || m.k === k)).map(({ role, content }) => ({ role, content }));
      await (opts.stream || streamPaperAsk)(id, thread, (ev) => {
        if (ev.type === "delta") { got += ev.text; chat[ai].content = got; paintLive(ai, got); }
        else if (ev.type === "reset") { got = ""; chat[ai].content = ""; paint(ai); }
        else if (ev.type === "sources") chat[ai].sources = ev.sources;
        else if (ev.type === "end") { chat[ai].content = ev.text || got; if (ev.sources) chat[ai].sources = ev.sources; }
        else if (ev.type === "error") throw new Error(ev.message);
      }, ctrl.signal, opts.level);
      if (!chat[ai].content && !ctrl.signal.aborted) throw new Error("AI 답을 받지 못했어요.");
    } catch (e) {
      if (e.name !== "AbortError") { if (inline) err = e.message || "AI 답을 받지 못했어요."; else if (!got) toast(e.message || "AI 답을 못 받았어요.", "err"); }
    } finally {
      // 빈 답은 지워요 — inline 이면 내 질문은 남겨요 (다시 물을 수 있게), 아니면 질문도 같이
      if (chat[ai]?.role === "assistant" && !chat[ai].content) chat.splice(inline ? ai : ai - 1, inline ? 1 : 2);
      if (raf) { cancelAnimationFrame(raf); raf = 0; } // 늦게 도는 글자 그리기가 끝난 답(근거 칩)을 '쓰는 중' 모양으로 덮지 않게
      busy = false; ctrl = null; paint(); save(); fromPanel && $(".ppc-in", fromPanel)?.focus();
    }
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
        last.innerHTML = post(md(text)) + `<span class="ppc-caret"></span>`;
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
    p.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest("[data-ppc-stop]")) return ctrl?.abort();
      if (t.closest("[data-ppc-clear]")) { if (busy) ctrl?.abort(); chat = []; err = ""; save(); return paint(); }
      if (t.closest("[data-ppc-quote-x]")) return setQuote("");
      const qk = t.closest("[data-ppc-quick]"); if (qk) return ask(qk.dataset.ppcQuick, p, true);
      const mo = t.closest("[data-ppc-more]"); if (mo) return ask(`${mo.dataset.ppcMore} — 더 자세히 알려줘`, p);
    });
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
  if (article) { document.addEventListener("mouseup", onSel); document.addEventListener("touchend", onSel); }
  refresh();
  paint();
  const stop = () => { ctrl?.abort(); document.removeEventListener("mouseup", onSel); document.removeEventListener("touchend", onSel); clearTimeout(selT); };
  stop.refresh = refresh;
  return stop;
}

// ---------- 서랍 ----------
const SIZES = { s: [340, 0.42], m: [440, 0.62], l: [640, 0.9] }; // 작게 · 보통 · 크게 = [넓은 화면 너비 px, 폰 높이 비율]
const SIDE = 1100; // 이보다 넓으면 본문이 비켜 나란히
const narrow = () => innerWidth <= 760;
const clampW = (w) => Math.round(Math.max(320, Math.min(w, 720, Math.max(320, innerWidth - 360))));
const clampH = (h) => Math.max(0.3, Math.min(0.92, h));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// id: 서랍 요소 id · title: 머리 이름 · body: 안에 넣을 HTML (보통 chatMarkup) · level: 쉽게/깊게 단추를 넣을지
export function drawerMarkup({ id, title, body, level = false }) {
  return `<aside class="tut" id="${esc(id)}" hidden aria-label="AI 튜터">
    <div class="tut-grip" role="separator" tabindex="0" aria-label="튜터 크기 — 끌거나 화살표 키" aria-valuemin="0" aria-valuemax="100"><i></i></div>
    <div class="tut-h"><b class="tut-n">${esc(title)}</b><span class="tut-r"><span class="tut-sz" role="group" aria-label="튜터 크기">${[["s", "작게"], ["m", "보통"], ["l", "크게"]].map(([k, l]) => `<button type="button" data-sz="${k}" aria-pressed="false">${l}</button>`).join("")}</span>${level ? `<button type="button" class="tut-b" data-tut-lv aria-pressed="false" title="답 수준">쉽게</button>` : ""}<button type="button" class="tut-b" data-tut-x aria-label="튜터 접기">접기</button></span></div>
    <div class="tut-body">${body}</div>
  </aside>`;
}

// root: 서랍과 여는 단추가 든 화면 (여기에 --tut-w · --tut-h · .tut-on 을 붙여요)
// opts.opener: 여는 단추 선택자 · opts.sizeKey / opts.openKey: 이 기기에 기억할 이름 · opts.onLevel(level): 쉽게/깊게 바꿀 때
// 돌려주는 함수 = 정리
export function mountDrawer(root, aside, { opener, sizeKey, openKey, onLevel } = {}) {
  const grip = $(".tut-grip", aside);
  let size = load(sizeKey, null); if (!size?.w || !size?.h) size = { w: SIZES.m[0], h: SIZES.m[1], k: "m" };
  const openers = () => $$(opener, root);
  const apply = () => {
    root.style.setProperty("--tut-w", clampW(size.w) + "px");
    root.style.setProperty("--tut-h", Math.round(clampH(size.h) * 100) + "dvh");
    $$("[data-sz]", aside).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sz === size.k)));
    grip.setAttribute("aria-orientation", narrow() ? "horizontal" : "vertical");
    grip.setAttribute("aria-valuenow", String(narrow() ? Math.round(((clampH(size.h) - 0.3) / 0.62) * 100) : Math.round(((clampW(size.w) - 320) / 400) * 100)));
  };
  const setOpen = (open, focus = true) => {
    aside.hidden = !open; root.classList.toggle("tut-on", open);
    openers().forEach((b) => b.setAttribute("aria-expanded", String(open)));
    keep(openKey, open ? 1 : 0);
    if (open) { apply(); if (focus) $("textarea, input", aside)?.focus({ preventScroll: true }); }
  };
  const resize = (next) => { size = next; apply(); keep(sizeKey, size); };
  const onClick = (e) => {
    const t = e.target;
    if (opener && t.closest(opener)) return setOpen(aside.hidden);
    if (!aside.contains(t)) return;
    if (t.closest("[data-tut-x]")) { setOpen(false); openers().find((b) => b.offsetParent !== null)?.focus({ preventScroll: true }); return; }
    const sz = t.closest("[data-sz]"); if (sz) { const [w, h] = SIZES[sz.dataset.sz]; return resize({ w, h, k: sz.dataset.sz }); }
    const lv = t.closest("[data-tut-lv]");
    if (lv) { const deep = lv.getAttribute("aria-pressed") !== "true"; lv.setAttribute("aria-pressed", String(deep)); lv.textContent = deep ? "깊게" : "쉽게"; onLevel?.(deep ? "deep" : "easy"); }
  };
  const onKey = (e) => { if (e.key === "Escape" && !e.isComposing) { setOpen(false); openers().find((b) => b.offsetParent !== null)?.focus({ preventScroll: true }); } };
  // 끌기: 넓은 화면 = 왼쪽 가장자리를 좌우로, 폰 = 위 손잡이를 위아래로
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch {} root.classList.add("tut-drag");
    const mv = (ev) => { size = narrow() ? { ...size, h: clampH(1 - ev.clientY / innerHeight), k: "" } : { ...size, w: clampW(innerWidth - ev.clientX - 16), k: "" }; apply(); };
    const up = () => { root.classList.remove("tut-drag"); grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up); keep(sizeKey, size); };
    grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
  });
  grip.addEventListener("keydown", (e) => {
    const d = narrow() ? { ArrowUp: 0.05, ArrowDown: -0.05 }[e.key] : { ArrowLeft: 30, ArrowRight: -30 }[e.key]; if (!d) return;
    e.preventDefault(); resize(narrow() ? { ...size, h: clampH(size.h + d), k: "" } : { ...size, w: clampW(size.w + d), k: "" });
  });
  root.addEventListener("click", onClick);
  aside.addEventListener("keydown", onKey);
  addEventListener("resize", apply);
  apply();
  // 열어 둔 채 떠났으면 다시 열어요 — 나란히 놓이는 넓은 화면에서만 (좁으면 글을 가리니까 닫힌 채로)
  if (load(openKey, 0) === 1 && innerWidth >= SIDE) setOpen(true, false);
  return () => { root.removeEventListener("click", onClick); removeEventListener("resize", apply); root.classList.remove("tut-on", "tut-drag"); };
}

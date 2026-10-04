// 형광펜 · 메모 (노션처럼): 본문 글자를 드래그하면 색 바가 뜨고, 고르면 칠해져요. 칠한 글자를 누르면 색 바꾸기 · 메모 · 지우기.
// 위치는 '섹션 id + 칠한 글자 + 앞뒤 글자' 로 저장해요 (글이 조금 바뀌어도 다시 찾아요). 본인에게만 보여요.
import { $, $$, esc, toast } from "../util.js";
import { api } from "../api.js";
import { icon } from "../icons.js";

export const HL_COLORS = [["yellow", "노랑"], ["green", "초록"], ["blue", "파랑"], ["rose", "분홍"]];
const CTX = 32;        // 앞뒤로 기억하는 글자 수
const MAX_QUOTE = 2000;
// 이 안의 글자는 칠하지 않아요 (입력칸 · 버튼 · 채팅 · 코드 · 메모 배지)
const SKIP = "textarea, input, select, button, .ppc, [class^=ppc-], .pp-hl-note, .pp-mini-ai, #pp-tutor, #pp-notes, .pp-ex-box, .pp-opts, .ez-ai, .qz-c, nav, script, style, svg, [data-nomark]";

// ---------- 글자 좌표: 섹션 안 텍스트 노드를 한 줄로 이어 붙여 글자 번호를 매겨요 ----------
function textNodes(scope) {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (!n.nodeValue || n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [], starts = []; let total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push(n); starts.push(total); total += n.nodeValue.length; }
  return { nodes, starts, total, text: nodes.map((n) => n.nodeValue).join("") };
}
// Range 의 (container, offset) → 섹션 글자 번호
function charAt(map, container, offset) {
  const { nodes, starts, total } = map;
  if (container.nodeType === Node.TEXT_NODE) { const i = nodes.indexOf(container); return i < 0 ? -1 : starts[i] + offset; }
  const child = container.childNodes[offset];
  if (child) {
    for (let i = 0; i < nodes.length; i++) {
      const rel = child.compareDocumentPosition(nodes[i]);
      if (child === nodes[i] || rel & Node.DOCUMENT_POSITION_CONTAINED_BY || rel & Node.DOCUMENT_POSITION_FOLLOWING) return starts[i];
    }
    return total;
  }
  for (let i = nodes.length - 1; i >= 0; i--) if (container.contains(nodes[i])) return starts[i] + nodes[i].nodeValue.length;
  return total;
}
// 글자 번호 [s, e) 를 <mark> 로 감싸요 (텍스트 노드마다 하나씩 — 굵게 · 용어 밑줄을 가로질러도 돼요)
function wrap(map, s, e, mark) {
  const made = [];
  for (let i = 0; i < map.nodes.length; i++) {
    const n = map.nodes[i], a = map.starts[i], b = a + n.nodeValue.length;
    if (b <= s || a >= e) continue;
    let node = n;
    if (s > a) node = node.splitText(s - a);
    if (e < b) node.splitText(e - Math.max(s, a));
    if (!node.nodeValue.trim()) continue;
    const m = document.createElement("mark");
    m.className = "pp-hl"; m.dataset.hl = mark.id; m.dataset.c = mark.color;
    node.replaceWith(m); m.append(node); made.push(m);
  }
  if (made.length) {
    const last = made[made.length - 1];
    const note = document.createElement("button");
    note.type = "button"; note.className = "pp-hl-note"; note.dataset.hl = mark.id; note.hidden = !mark.memo;
    note.setAttribute("aria-label", "메모 보기"); note.innerHTML = icon.edit(12);
    last.after(note);
  }
  return made;
}
// 저장된 인용문을 섹션 글에서 찾아요: 여러 번 나오면 앞뒤 글자가 가장 비슷한 자리
function locate(text, mark) {
  const q = mark.quote; if (!q) return -1;
  const hits = []; let i = text.indexOf(q);
  while (i >= 0) { hits.push(i); i = text.indexOf(q, i + 1); }
  if (!hits.length) return -1;
  if (hits.length === 1) return hits[0];
  const score = (at) => {
    let s = 0;
    const pre = text.slice(Math.max(0, at - CTX), at), suf = text.slice(at + q.length, at + q.length + CTX);
    for (let k = 1; k <= Math.min(pre.length, mark.prefix.length) && pre.at(-k) === mark.prefix.at(-k); k++) s++;
    for (let k = 0; k < Math.min(suf.length, mark.suffix.length) && suf[k] === mark.suffix[k]; k++) s++;
    return s;
  };
  return hits.sort((a, b) => score(b) - score(a))[0];
}

// ---------- 떠 있는 작은 창(색 바 · 메모 창) ----------
function place(el, rect, below = false) {
  el.hidden = false;
  const w = el.offsetWidth, h = el.offsetHeight, vw = innerWidth, vh = innerHeight;
  let x = rect.left + rect.width / 2 - w / 2, y = below ? rect.bottom + 8 : rect.top - h - 8;
  if (y < 8) y = rect.bottom + 8;
  if (y + h > vh - 8) y = Math.max(8, rect.top - h - 8);
  x = Math.max(8, Math.min(vw - w - 8, x));
  el.style.left = x + "px"; el.style.top = y + "px";
}

/**
 * mountMarks(article, { paper, mode, secOf?, listHost?, onAsk? })
 *  - article: 본문 요소. 이 안에서만 드래그 → 형광펜
 *  - secOf(el): 섹션 요소 → 저장용 id (없으면 data-sec 또는 id)
 *  - listHost: '내 형광펜 · 메모' 목록을 그릴 자리 (선택)
 *  - onAsk(text): 색 바의 'AI에게 묻기' (선택)
 * 돌려주는 것: { apply(), stop() } — 본문이 나중에 더 그려지면 apply() 를 다시 불러요
 */
export function mountMarks(article, { paper, mode = "page", secOf, listHost = null, onAsk = null } = {}) {
  let marks = [], alive = true, saved = null; // saved = 드래그한 Range (채팅 입력창이 선택을 가져가도 남겨요)
  const keyOf = secOf || ((el) => el.dataset.sec || el.id || "");
  const sectionOf = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest("[data-sec], section[id]");
  const elsOf = (id) => $$(`[data-hl="${CSS.escape(id)}"]`, article);

  // 색 바
  const bar = document.createElement("div");
  bar.className = "pp-hlbar"; bar.hidden = true; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "형광펜");
  bar.innerHTML = `${HL_COLORS.map(([c, l]) => `<button type="button" class="pp-hl-dot" data-c="${c}" title="${l} 형광펜" aria-label="${l} 형광펜"></button>`).join("")}
    <span class="pp-hlbar-sep"></span><button type="button" class="pp-hlbar-btn" data-act="memo">${icon.edit(14)} 메모</button>${onAsk ? `<button type="button" class="pp-hlbar-btn" data-act="ask">${icon.spark(14)} AI</button>` : ""}`;
  // 메모 창
  const pop = document.createElement("div");
  pop.className = "pp-hlpop"; pop.hidden = true; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "형광펜 메모");
  document.body.append(bar, pop);

  // ---------- 그리기 ----------
  function clear(id) { elsOf(id).forEach((el) => { if (el.classList.contains("pp-hl-note")) el.remove(); else el.replaceWith(...el.childNodes); }); }
  function applyOne(m) {
    if (elsOf(m.id).length) return true;
    const sec = $$("[data-sec], section[id]", article).find((x) => keyOf(x) === m.sec);
    if (!sec) return false;
    sec.normalize();
    const map = textNodes(sec), at = locate(map.text, m);
    if (at < 0) return false;
    return wrap(map, at, at + m.quote.length, m).length > 0;
  }
  function apply() {
    if (!alive) return;
    marks.forEach((m) => { m.found = applyOne(m); });
    paintList();
  }
  function paintList() {
    if (!listHost) return;
    if (!marks.length) { listHost.innerHTML = `<p class="pp-hl-empty faint">본문 글자를 드래그하면 형광펜 · 메모를 남길 수 있어요. 나만 봐요.</p>`; return; }
    listHost.innerHTML = `<ul class="pp-hl-list">${marks.map((m) => `<li><button type="button" class="pp-hl-item" data-go="${esc(m.id)}" data-c="${esc(m.color)}">
      <span class="pp-hl-q">${esc(m.quote.length > 90 ? m.quote.slice(0, 90) + "…" : m.quote)}</span>
      ${m.memo ? `<span class="pp-hl-m">${esc(m.memo)}</span>` : ""}${m.found === false ? `<span class="faint pp-hl-lost">본문에서 못 찾았어요 (글이 바뀌었나 봐요)</span>` : ""}</button></li>`).join("")}</ul>`;
  }

  // ---------- 드래그 → 색 바 ----------
  function selInfo() {
    const s = getSelection();
    if (!s || !s.rangeCount || s.isCollapsed) return null;
    const r = s.getRangeAt(0);
    if (!article.contains(r.commonAncestorContainer)) return null;
    const a = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    if (a?.closest(SKIP)) return null;
    const sec = sectionOf(r.startContainer);
    if (!sec || sec !== sectionOf(r.endContainer)) return null; // 섹션을 가로지르면 안 돼요
    const map = textNodes(sec);
    let s0 = charAt(map, r.startContainer, r.startOffset), e0 = charAt(map, r.endContainer, r.endOffset);
    if (s0 < 0 || e0 < 0 || e0 <= s0) return null;
    while (s0 < e0 && /\s/.test(map.text[s0])) s0++;
    while (e0 > s0 && /\s/.test(map.text[e0 - 1])) e0--;
    const quote = map.text.slice(s0, e0);
    if (!quote || quote.length > MAX_QUOTE) return null;
    return { sec: keyOf(sec), quote, prefix: map.text.slice(Math.max(0, s0 - CTX), s0), suffix: map.text.slice(e0, e0 + CTX), rect: r.getBoundingClientRect() };
  }
  let selT = 0;
  const onUp = () => {
    clearTimeout(selT);
    selT = setTimeout(() => {
      if (!alive) return;
      const info = selInfo();
      if (!info || !info.quote.trim()) { if (!bar.matches(":hover")) bar.hidden = true; return; }
      if (!info.sec) return;
      saved = info; pop.hidden = true;
      place(bar, info.rect);
    }, 60);
  };
  async function create(color, withMemo = false) {
    if (!saved) return;
    const b = { paper, mode, sec: saved.sec, quote: saved.quote, prefix: saved.prefix, suffix: saved.suffix, color };
    bar.hidden = true; getSelection()?.removeAllRanges();
    try {
      const { mark } = await api.addPaperMark(b);
      marks.push(mark); apply();
      if (withMemo) { const el = elsOf(mark.id)[0]; if (el) openPop(mark, el.getBoundingClientRect(), true); }
    } catch (e) { toast(e.message, "err"); }
    saved = null;
  }
  bar.addEventListener("mousedown", (e) => e.preventDefault()); // 선택이 풀리지 않게
  bar.addEventListener("click", (e) => {
    const dot = e.target.closest(".pp-hl-dot"); if (dot) return create(dot.dataset.c);
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "memo") return create("yellow", true);
    if (act === "ask") { bar.hidden = true; onAsk?.(saved?.quote || ""); }
  });

  // ---------- 칠한 글자 누르기 → 메모 창 ----------
  function openPop(m, rect, focus = false) {
    pop.innerHTML = `<div class="pp-hlpop-top">${HL_COLORS.map(([c, l]) => `<button type="button" class="pp-hl-dot ${m.color === c ? "on" : ""}" data-c="${c}" title="${l}" aria-label="${l}"></button>`).join("")}
        <span class="grow"></span><button type="button" class="pp-hlbar-btn danger" data-act="del">${icon.trash(13)} 지우기</button></div>
      <blockquote class="pp-hlpop-q">${esc(m.quote.length > 160 ? m.quote.slice(0, 160) + "…" : m.quote)}</blockquote>
      <textarea class="textarea pp-hlpop-memo" rows="3" maxlength="2000" placeholder="여기에 메모 — 왜 중요한지, 궁금한 점, 내 말로 다시 쓰기">${esc(m.memo)}</textarea>
      <div class="pp-hlpop-foot"><span class="faint pp-hlpop-hint">창을 닫으면 저장돼요</span><span class="grow"></span>${onAsk ? `<button type="button" class="pp-hlbar-btn" data-act="ask">${icon.spark(13)} AI에게 묻기</button>` : ""}<button type="button" class="btn sm" data-act="close">완료</button></div>`;
    pop.dataset.id = m.id;
    place(pop, rect, true);
    const ta = $("textarea", pop);
    if (focus) setTimeout(() => ta.focus(), 30);
  }
  async function savePop() {
    const id = pop.dataset.id, m = marks.find((x) => x.id === id);
    if (!m) return;
    const memo = $("textarea", pop)?.value.trim() ?? m.memo;
    if (memo === m.memo) return;
    try { const r = await api.updatePaperMark(id, { memo }); Object.assign(m, r.mark); elsOf(id).forEach((el) => { if (el.classList.contains("pp-hl-note")) el.hidden = !memo; }); paintList(); }
    catch (e) { toast(e.message, "err"); }
  }
  function closePop() { if (pop.hidden) return; savePop(); pop.hidden = true; }
  pop.addEventListener("click", async (e) => {
    const id = pop.dataset.id, m = marks.find((x) => x.id === id);
    if (!m) return;
    const dot = e.target.closest(".pp-hl-dot");
    if (dot) {
      try { const r = await api.updatePaperMark(id, { color: dot.dataset.c }); Object.assign(m, r.mark); elsOf(id).forEach((el) => { el.dataset.c = m.color; }); $$(".pp-hl-dot", pop).forEach((d) => d.classList.toggle("on", d.dataset.c === m.color)); paintList(); }
      catch (err) { toast(err.message, "err"); }
      return;
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "del") {
      try { await api.deletePaperMark(id); marks = marks.filter((x) => x.id !== id); clear(id); pop.hidden = true; paintList(); toast("형광펜을 지웠어요."); }
      catch (err) { toast(err.message, "err"); }
    } else if (act === "close") closePop();
    else if (act === "ask") { closePop(); onAsk?.(m.quote); }
  });
  article.addEventListener("click", (e) => {
    const el = e.target.closest(".pp-hl, .pp-hl-note");
    if (!el || !article.contains(el)) return;
    if (e.target.closest(".pp-term")) return; // 용어 밑줄은 용어 카드가 우선
    const m = marks.find((x) => x.id === el.dataset.hl); if (!m) return;
    const sel = getSelection(); if (sel && !sel.isCollapsed) return; // 드래그 중이면 색 바가 우선
    e.preventDefault(); e.stopPropagation();
    openPop(m, el.getBoundingClientRect(), el.classList.contains("pp-hl-note"));
  });
  listHost?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    const m = marks.find((x) => x.id === b.dataset.go); if (!m) return;
    if (!m.found) m.found = applyOne(m);
    const el = elsOf(m.id)[0]; if (!el) return toast("본문에서 이 글자를 못 찾았어요.", "err");
    el.closest("details")?.toggleAttribute("open", true);
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    elsOf(m.id).forEach((x) => { x.classList.add("flash"); setTimeout(() => x.classList.remove("flash"), 1200); });
  });

  // 바깥을 누르면 닫기 · Esc
  const onDown = (e) => { if (!bar.contains(e.target) && !e.target.closest?.(".pp-hl, .pp-hl-note")) bar.hidden = true; if (!pop.hidden && !pop.contains(e.target) && !e.target.closest?.(".pp-hl, .pp-hl-note")) closePop(); };
  const onKey = (e) => { if (e.key === "Escape") { bar.hidden = true; closePop(); } };
  const onScroll = () => { bar.hidden = true; };
  document.addEventListener("mouseup", onUp); document.addEventListener("touchend", onUp);
  document.addEventListener("mousedown", onDown, true); document.addEventListener("touchstart", onDown, { capture: true, passive: true });
  document.addEventListener("keydown", onKey);
  article.closest(".main, .ez")?.addEventListener("scroll", onScroll, { passive: true });
  addEventListener("scroll", onScroll, { passive: true });

  api.paperMarks(paper, mode).then((r) => { if (!alive) return; marks = r.marks || []; apply(); }).catch(() => { if (listHost) listHost.innerHTML = `<p class="faint">형광펜을 못 불러왔어요.</p>`; });

  return {
    apply,
    stop() {
      alive = false; closePop(); bar.remove(); pop.remove(); clearTimeout(selT);
      document.removeEventListener("mouseup", onUp); document.removeEventListener("touchend", onUp);
      document.removeEventListener("mousedown", onDown, true); document.removeEventListener("touchstart", onDown, { capture: true });
      document.removeEventListener("keydown", onKey);
      article.closest(".main, .ez")?.removeEventListener("scroll", onScroll); removeEventListener("scroll", onScroll);
    },
  };
}

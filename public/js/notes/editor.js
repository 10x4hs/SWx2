// 블록 편집기 — Notion 처럼. 문서 전체가 하나의 편집 영역이라 여러 줄을 긁어서 지우거나 옮기는 게 그대로 돼요.
// 저장은 그대로 마크다운이라 예전 노트·[[링크]]·그래프·AI 정리가 다 그대로 돼요.
// 블록: 본문 · 제목1~3 · 목록 · 번호 · 할 일 · 인용 · 코드 · 구분선 · 페이지([[제목]] 한 줄) · AI 답(<!-- ai:start --> … <!-- ai:end -->) · 그대로(표 등)
// "/" 를 치면 블록 메뉴, 글자를 긁으면 작은 서식 도구, "[[" 를 치면 노트 제목 자동완성. 왼쪽 손잡이(⋮⋮)를 끌면 블록 순서가 바뀌어요.
import { renderInline, renderMarkdown } from "../md.js";
import { esc } from "../util.js";
import { icon } from "../icons.js";
import { shrink, imageFiles, pickImages, MAX_IMAGES } from "../imgattach.js";

const AI_START = "<!-- ai:start -->", AI_END = "<!-- ai:end -->", MOC_MARK = "<!-- ai:moc -->";
const PAPERS_MARK = "<!-- papers:board -->"; // 논문 스프린트 현황판 (셋 진도 · 체크) — 앱이 그 자리에 판을 그려요
const TYPES = {
  p: { label: "본문", hint: "그냥 글", key: "" },
  h1: { label: "제목 1", hint: "가장 큰 제목", key: "#" },
  h2: { label: "제목 2", hint: "중간 제목", key: "##" },
  h3: { label: "제목 3", hint: "작은 제목", key: "###" },
  bullet: { label: "목록", hint: "• 점 목록", key: "-" },
  number: { label: "번호 목록", hint: "1. 2. 3.", key: "1." },
  todo: { label: "할 일", hint: "체크 상자", key: "[]" },
  quote: { label: "인용", hint: "왼쪽 줄이 있는 글", key: ">" },
  code: { label: "코드", hint: "고정폭 글자", key: "```" },
  divider: { label: "구분선", hint: "가로 줄", key: "---" },
  page: { label: "페이지", hint: "이 노트 아래 새 노트", key: "" },
  link: { label: "노트 링크", hint: "다른 노트로 [[연결]]", key: "[[" },
  ai: { label: "AI에게 묻기", hint: "답을 여기에 넣어요", key: "ai" },
};
const MENU = ["p", "h1", "h2", "h3", "bullet", "number", "todo", "quote", "code", "divider", "link", "page", "ai"];
const LISTY = new Set(["bullet", "number", "todo"]);
const TEXTY = new Set(["p", "h1", "h2", "h3", "bullet", "number", "todo", "quote"]);
const WIDGET = new Set(["divider", "page", "ai", "ask", "newpage", "meta", "papers"]);

// ---------- 마크다운 → 블록 ----------
function parseBlocks(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (l.startsWith(MOC_MARK)) { out.push({ type: "meta", text: MOC_MARK }); continue; }
    if (l.trim() === PAPERS_MARK) { out.push({ type: "papers" }); continue; }
    if (l.startsWith(AI_START)) {
      const buf = []; let j = i + 1;
      while (j < lines.length && !lines[j].startsWith(AI_END)) buf.push(lines[j++]);
      out.push({ type: "ai", text: buf.join("\n").replace(/^\n*(?:---\n)?/, "").trim() }); i = j; continue;
    }
    let m;
    if ((m = /^```(\w*)\s*$/.exec(l))) {
      const buf = []; let j = i + 1;
      while (j < lines.length && !/^```\s*$/.test(lines[j])) buf.push(lines[j++]);
      out.push({ type: "code", text: buf.join("\n"), lang: m[1] || "" }); i = j; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push({ type: "divider" }); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { out.push({ type: "h" + m[1].length, text: m[2] }); continue; }
    if ((m = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/.exec(l))) { out.push({ type: "todo", text: m[2], checked: m[1] !== " " }); continue; }
    if ((m = /^\s*[-*]\s+(.*)$/.exec(l))) { out.push({ type: "bullet", text: m[1] }); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { out.push({ type: "number", text: m[1] }); continue; }
    if (/^>\s?/.test(l)) {
      const buf = [l.replace(/^>\s?/, "")]; let j = i + 1;
      while (j < lines.length && /^>\s?/.test(lines[j])) buf.push(lines[j++].replace(/^>\s?/, ""));
      out.push({ type: "quote", text: buf.join("\n") }); i = j - 1; continue;
    }
    if ((m = /^\s*\[\[([^\[\]|#\n]+)\]\]\s*$/.exec(l))) { out.push({ type: "page", text: m[1].trim() }); continue; }
    if (/^\s*(\||<)/.test(l)) { // 표·HTML 은 그대로 두고 글자만 고쳐요
      const buf = [l]; let j = i + 1;
      while (j < lines.length && lines[j].trim() && !lines[j].startsWith(AI_START)) buf.push(lines[j++]);
      out.push({ type: "raw", text: buf.join("\n") }); i = j - 1; continue;
    }
    const buf = [l]; let j = i + 1;
    while (j < lines.length && lines[j].trim() && !/^(#{1,3}\s|\s*[-*]\s|\s*\d+[.)]\s|>|```|-{3,}\s*$|\s*\[\[[^\]]+\]\]\s*$|<!--|\s*\|)/.test(lines[j])) buf.push(lines[j++]);
    out.push({ type: "p", text: buf.join("\n") }); i = j - 1;
  }
  return out;
}

// ---------- 블록 → 마크다운 ----------
function serializeBlocks(blocks) {
  const parts = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], t = (b.text || "").replace(/\s+$/, "");
    let s;
    switch (b.type) {
      case "meta": s = b.text; break;
      case "papers": s = PAPERS_MARK; break;
      case "h1": s = "# " + t; break;
      case "h2": s = "## " + t; break;
      case "h3": s = "### " + t; break;
      case "bullet": s = "- " + t.replace(/\n/g, "\n  "); break;
      case "number": s = `${numberOf(blocks, i)}. ` + t.replace(/\n/g, "\n   "); break;
      case "todo": s = `- [${b.checked ? "x" : " "}] ` + t.replace(/\n/g, "\n  "); break;
      case "quote": s = t.split("\n").map((x) => "> " + x).join("\n"); break;
      case "code": s = "```" + (b.lang || "") + "\n" + (b.text || "") + "\n```"; break;
      case "divider": s = "---"; break;
      case "page": s = `[[${t}]]`; break;
      case "ai": s = `${AI_START}\n${t}\n${AI_END}`; break;
      default: s = t;
    }
    const prev = blocks[i - 1];
    const tight = prev && LISTY.has(prev.type) && LISTY.has(b.type);
    parts.push((i && !tight ? "\n" : "") + s);
  }
  return parts.join("\n").replace(/^\n+/, "") + (parts.length ? "\n" : "");
}
function numberOf(blocks, i) { let n = 1; for (let j = i - 1; j >= 0 && blocks[j].type === "number"; j--) n++; return n; }

// ---------- 인라인: HTML(편집 중) → 마크다운 ----------
function inlineToMd(node) {
  let out = "";
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { out += c.nodeValue.replace(/ /g, " ").replace(/​/g, ""); continue; }
    if (c.nodeType !== 1) continue;
    const tag = c.tagName, inner = () => inlineToMd(c);
    if (tag === "BR") out += "\n";
    else if (tag === "DIV" || tag === "P") out += (out && !out.endsWith("\n") ? "\n" : "") + inner();
    else if (tag === "STRONG" || tag === "B") { const x = inner(); out += x.trim() ? `**${x}**` : x; }
    else if (tag === "EM" || tag === "I") { const x = inner(); out += x.trim() ? `_${x}_` : x; }
    else if (tag === "S" || tag === "DEL" || tag === "STRIKE") { const x = inner(); out += x.trim() ? `~~${x}~~` : x; }
    else if (tag === "CODE") out += "`" + c.textContent + "`";
    else if (tag === "A" && c.dataset.wikilink) { const t = c.dataset.wikilink, label = c.textContent; out += label && label !== t ? `[[${t}|${label}]]` : `[[${t}]]`; }
    else if (tag === "A" && c.dataset.tag) out += "#" + c.dataset.tag;
    else if (tag === "A") { const href = c.getAttribute("href") || ""; const x = inner(); out += href ? `[${x || href}](${href})` : x; }
    else if (tag === "INPUT" || tag === "BUTTON") out += "";
    else if (tag === "SPAN" && c.style.fontWeight && +c.style.fontWeight >= 600) { const x = inner(); out += x.trim() ? `**${x}**` : x; }
    else out += inner();
  }
  return out.replace(/\n$/, "");
}

// 논문 현황판: 같은 로그인으로 /papers/embed 를 끼워 넣어요 (10.5 가 지나면 판이 "끝났어요"로 바뀌고, 10.6 에 이 구역이 지워져요)
function papersBoard() {
  const theme = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  return `<div class="bx-papers"><iframe src="/papers/embed#mode=note&theme=${theme}" title="논문 스프린트 현황판" loading="lazy" height="560"></iframe></div>`;
}
// 판이 자기 높이를 알려 주면 그만큼 늘려요 (안쪽 스크롤 없이)
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.type !== "papers-embed-height") return;
  document.querySelectorAll(".bx-papers iframe").forEach((f) => { if (f.contentWindow === e.source) f.height = String(Math.max(200, Math.min(4000, Math.ceil(e.data.h)))); });
});

// ---------- 편집기 ----------
// opts: notes(제목 목록) · onChange() · onOpenTitle(title) · onOpenTag(tag) · onAsk(question, context) → Promise<markdown|{text,model}> · onNewPage(title) → Promise<note|null> · readOnly
export function createEditor(host, opts) {
  const isMac = /Mac/.test(navigator.platform);
  const state = { sugg: null, slash: null };
  const RO = !!opts.readOnly;
  host.classList.add("blocks-host");
  host.innerHTML = `
    <div class="nb-doc" id="doc" contenteditable="${RO ? "false" : "true"}" spellcheck="false" role="textbox" aria-multiline="true" aria-label="노트 본문"></div>
    ${RO ? "" : `<div class="blk-gut" id="gut" hidden contenteditable="false"><button type="button" data-plus title="아래에 블록 추가">＋</button><button type="button" data-menu title="끌어서 옮기기 · 누르면 바꾸기">⋮⋮</button></div>
    <div class="blk-drop" id="drop" hidden></div>
    <div class="blk-bubble" id="bubble" hidden role="toolbar" contenteditable="false">
      <button type="button" data-fmt="bold" title="굵게"><b>B</b></button>
      <button type="button" data-fmt="italic" title="기울임"><i>I</i></button>
      <button type="button" data-fmt="strike" title="취소선"><s>S</s></button>
      <button type="button" data-fmt="code" title="코드">\`</button>
      <button type="button" data-fmt="link" title="링크">${icon.share(13)}</button>
      <span></span>
      <button type="button" data-ask-sel class="ai-tool">${icon.spark(12)} 물어보기</button>
    </div>`}`;
  const doc = host.querySelector("#doc"), bubble = host.querySelector("#bubble"), gut = host.querySelector("#gut"), dropEl = host.querySelector("#drop");

  // ---- 그리기: 블록 하나 → 요소 ----
  function placeholder(b) { return b.type === "p" ? "글을 쓰거나 '/' 를 눌러 보세요" : b.type.startsWith("h") ? TYPES[b.type].label : b.type === "quote" ? "인용" : b.type === "todo" ? "할 일" : LISTY.has(b.type) ? "목록" : ""; }
  function mkEl(b) {
    const el = document.createElement("div");
    el.className = "blk"; el.dataset.type = b.type;
    if (b.checked) el.dataset.checked = "1";
    switch (b.type) {
      case "meta": el.contentEditable = "false"; el.dataset.md = b.text; el.hidden = true; break;
      case "divider": el.contentEditable = "false"; el.innerHTML = `<hr>`; break;
      case "papers": el.contentEditable = "false"; el.innerHTML = papersBoard(); break;
      case "code": el.innerHTML = `<div class="code-top" contenteditable="false"><input class="code-lang" value="${esc(b.lang || "")}" placeholder="언어" aria-label="코드 언어" ${RO ? "readonly" : ""}></div><div class="bx" data-plain="1">${esc(b.text)}</div>`; break;
      case "raw": el.innerHTML = `<div class="bx" data-plain="1">${esc(b.text)}</div>`; break;
      case "page": el.contentEditable = "false"; el.dataset.page = b.text; el.innerHTML = `<a class="bx-page" href="#"><span class="pg-ic">📄</span><span class="pg-t">${esc(b.text)}</span><span class="faint">페이지</span></a>`; break;
      case "ai": el.contentEditable = "false"; el.dataset.md = b.text; el.innerHTML = `<div class="bx-ai"><div class="ai-head">${icon.spark(12)} AI${b.model ? `<span class="faint"> · ${esc(b.model)}</span>` : ""}${RO ? "" : `<span class="ai-acts"><button type="button" data-ai-plain>본문으로</button><button type="button" data-ai-del>지우기</button></span>`}</div><div class="md ai-md">${renderMarkdown(b.text)}</div></div>`; break;
      case "ask": el.contentEditable = "false"; el.innerHTML = `<form class="bx-ask" data-ask><span class="ai-ic">${icon.spark(13)}</span><input class="ask-in" placeholder="무엇이 궁금해요? 이 노트를 보면서 답해요 · Enter" maxlength="2000" aria-label="AI에게 물어볼 것" value="${esc(b.text || "")}"><button type="button" class="icon-btn sm" data-ask-img aria-label="이미지 붙이기" title="이미지 붙이기 · 붙여넣기(⌘V)도 돼요">${icon.image(14)}</button><button type="submit" class="btn sm accent">묻기</button><button type="button" class="icon-btn sm" data-ask-x aria-label="닫기">✕</button><div class="ask-busy" hidden>${icon.spark(13)} 생각하는 중… 필요하면 웹도 찾아봐요</div><div class="att-tray ask-att" hidden></div></form>`; break;
      case "newpage": el.contentEditable = "false"; el.innerHTML = `<form class="bx-ask" data-newpage><span class="ai-ic">📄</span><input class="ask-in" placeholder="새 페이지 제목 · Enter" maxlength="120" aria-label="새 페이지 제목"><button type="submit" class="btn sm accent">만들기</button><button type="button" class="icon-btn sm" data-ask-x aria-label="닫기">✕</button></form>`; break;
      default: el.innerHTML = renderInline(b.text) || ""; el.dataset.ph = placeholder(b);
    }
    return el;
  }
  const blocksOf = () => [...doc.children].filter((el) => el.classList.contains("blk"));
  function render(blocks) {
    if (!blocks.length) blocks = [{ type: "p", text: "" }];
    doc.replaceChildren(...blocks.map(mkEl));
  }
  // ---- 읽기: 요소 → 블록 ----
  function readEl(el) {
    if (!el.classList?.contains("blk")) return { type: "p", text: el.nodeType === 3 ? el.nodeValue.trim() : inlineToMd(el) }; // 브라우저가 만든 낯선 조각
    const t = el.dataset.type;
    switch (t) {
      case "meta": return { type: "meta", text: el.dataset.md };
      case "ai": return { type: "ai", text: el.dataset.md || "" };
      case "page": return { type: "page", text: el.dataset.page || "" };
      case "divider": return { type: "divider" };
      case "papers": return { type: "papers" };
      case "ask": case "newpage": return null;
      case "code": return { type: "code", lang: el.querySelector(".code-lang")?.value.trim() || "", text: (el.querySelector(".bx")?.innerText || "").replace(/\n$/, "") };
      case "raw": return { type: "raw", text: (el.querySelector(".bx")?.innerText || "").replace(/\n$/, "") };
      default: return { type: TEXTY.has(t) ? t : "p", text: inlineToMd(el), ...(t === "todo" ? { checked: !!el.dataset.checked } : {}) };
    }
  }
  const readAll = () => [...doc.childNodes].map(readEl).filter((b) => b && (b.type !== "p" || b.text.trim() || true));
  // 브라우저가 지우고 합친 뒤 남는 이상한 조각 정리 (문서 안에 .blk 아닌 것 · 빈 문서)
  function normalize() {
    for (const n of [...doc.childNodes]) {
      if (n.nodeType === 1 && n.classList.contains("blk")) { if (!TEXTY.has(n.dataset.type) && !WIDGET.has(n.dataset.type) && n.dataset.type !== "code" && n.dataset.type !== "raw") n.dataset.type = "p"; continue; }
      if (n.nodeType === 3 && !n.nodeValue.trim()) { n.remove(); continue; }
      const el = mkEl({ type: "p", text: "" }); n.replaceWith(el);
      if (n.nodeType === 3) el.textContent = n.nodeValue; else el.append(...n.childNodes);
    }
    if (!doc.children.length) render([]);
  }

  // ---- 커서 ----
  const curEl = () => { const s = getSelection(); const n = s?.anchorNode; const el = (n?.nodeType === 1 ? n : n?.parentElement)?.closest(".blk"); return el && doc.contains(el) ? el : null; };
  const textHost = (el) => el.querySelector(".bx") || el;
  function placeCaret(el, where = "end") {
    const t = textHost(el);
    if (el.contentEditable === "false") { (el.querySelector("a, input") || el).focus?.(); return; }
    const sel = getSelection(), r = document.createRange();
    if (where === "start") { r.setStart(t, 0); r.collapse(true); }
    else if (typeof where === "number") { const p = nodeAt(t, where); r.setStart(p.node, p.off); r.collapse(true); }
    else { r.selectNodeContents(t); r.collapse(false); }
    sel.removeAllRanges(); sel.addRange(r); doc.focus({ preventScroll: true });
  }
  function nodeAt(el, off) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, acc = 0;
    while ((n = w.nextNode())) { if (acc + n.nodeValue.length >= off) return { node: n, off: off - acc }; acc += n.nodeValue.length; }
    return { node: el, off: el.childNodes.length };
  }
  function caretOffset(t) { const s = getSelection(); if (!s?.rangeCount) return 0; const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(t); r.setEnd(s.anchorNode, s.anchorOffset); return r.toString().length; }
  const changed = () => opts.onChange?.();
  function insertText(text) { const s = getSelection(); if (!s?.rangeCount) return; const r = s.getRangeAt(0); r.deleteContents(); const n = document.createTextNode(text); r.insertNode(n); r.setStartAfter(n); r.collapse(true); s.removeAllRanges(); s.addRange(r); }

  // ---- 블록 조작 ----
  function insertAfter(el, b, focus = true) { const ne = mkEl(b); el.after(ne); if (focus) placeCaret(ne, "start"); changed(); return ne; }
  function replaceEl(el, b, focus = "end") { const ne = mkEl(b); el.replaceWith(ne); if (focus) placeCaret(ne, focus); changed(); return ne; }
  function turn(el, type) {
    const b = readEl(el) || { type: "p", text: "" };
    if (type === "page") { if (b.text?.trim()) insertAfter(el, { type: "newpage" }); else replaceEl(el, { type: "newpage" }); return; }
    if (type === "ai") { if (b.text?.trim()) insertAfter(el, { type: "ask", text: "" }); else replaceEl(el, { type: "ask", text: "" }); return; }
    if (type === "link") { if (!TEXTY.has(b.type)) el = replaceEl(el, { type: "p", text: b.text || "" }); else placeCaret(el, "end"); insertText("[["); openSuggest(); return; }
    if (type === "divider") { if (b.text?.trim()) { const d = insertAfter(el, { type: "divider" }, false); insertAfter(d, { type: "p", text: "" }); } else { const d = replaceEl(el, { type: "divider" }, null); insertAfter(d, { type: "p", text: "" }); } return; }
    if (type === "code") { replaceEl(el, { type: "code", text: b.text || "", lang: b.lang || "" }); return; }
    if (TEXTY.has(type)) { el.dataset.type = type; if (type !== "todo") delete el.dataset.checked; el.dataset.ph = placeholder({ type }); if (b.type === "code" || b.type === "raw") { el.innerHTML = renderInline(b.text || ""); } placeCaret(el, "end"); changed(); }
  }
  function remove(el, focusPrev = true) { const nb = focusPrev ? el.previousElementSibling : el.nextElementSibling; el.remove(); if (!doc.children.length) render([]); const f = nb || doc.firstElementChild; if (f && f.contentEditable !== "false") placeCaret(f, focusPrev ? "end" : "start"); changed(); }

  // ---- 키 ----
  doc.addEventListener("keydown", (e) => {
    if (state.slash && onSlashKey(e)) return;
    if (state.sugg && onSuggKey(e)) return;
    const el = curEl(); if (!el) return;
    const type = el.dataset.type, t = textHost(el), plain = type === "code" || type === "raw";
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); return fmt("bold"); }
    if (mod && !e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); return fmt("italic"); }
    if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); return fmt("code"); }
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); return fmt("link"); }
    if (mod && e.key === "Enter") { e.preventDefault(); return insertAfter(el, { type: "p", text: "" }); }
    if (e.key === "Tab" && !plain) { e.preventDefault(); return; } // 포커스가 밖으로 나가지 않게
    if (e.key === "Enter" && !e.isComposing) {
      if (plain) { if (e.shiftKey) { e.preventDefault(); return insertAfter(el, { type: "p", text: "" }); } e.preventDefault(); insertText("\n"); return; }
      if (e.shiftKey) { e.preventDefault(); insertText("\n"); return; }
      e.preventDefault();
      const s = getSelection(); if (!s?.rangeCount) return;
      if (!s.isCollapsed) s.getRangeAt(0).deleteContents();
      const full = t.textContent, off = caretOffset(t);
      if (LISTY.has(type) && !full.trim()) { turn(el, "p"); return; }
      const next = LISTY.has(type) ? type : "p";
      if (off >= full.length) { insertAfter(el, { type: next, text: "" }); return; }
      if (off === 0) { const ne = mkEl({ type: next, text: "" }); el.before(ne); changed(); return; }
      const r = document.createRange(); const sr = s.getRangeAt(0); r.setStart(sr.startContainer, sr.startOffset); r.setEndAfter(t.lastChild || t);
      const frag = r.extractContents(); const ne = mkEl({ type: next, text: "" }); ne.append(...frag.childNodes); ne.normalize();
      el.after(ne); placeCaret(ne, "start"); changed(); return;
    }
    if (e.key === "Backspace" && getSelection().isCollapsed && caretOffset(t) === 0) {
      if (type !== "p" && TEXTY.has(type)) { e.preventDefault(); turn(el, "p"); return; }
      if (plain && !t.textContent) { e.preventDefault(); remove(el); return; }
      const prev = el.previousElementSibling;
      if (prev && prev.contentEditable === "false") { e.preventDefault(); if (prev.dataset.type === "meta") return; if (!t.textContent) remove(el); else { prev.remove(); changed(); } return; }
      if (prev && (prev.dataset.type === "code" || prev.dataset.type === "raw")) { e.preventDefault(); if (!t.textContent) remove(el); else placeCaret(prev, "end"); return; }
      if (!prev) { e.preventDefault(); return; }
      // 앞 블록과 합치기 (브라우저에 맡기면 서식이 섞여요)
      e.preventDefault();
      const at = prev.textContent.length; prev.append(...t.childNodes); prev.normalize(); el.remove(); placeCaret(prev, at); changed(); return;
    }
    if (e.key === "Delete" && getSelection().isCollapsed && caretOffset(t) >= t.textContent.length) {
      const nx = el.nextElementSibling; if (nx && nx.contentEditable !== "false" && !nx.querySelector(".bx")) { e.preventDefault(); const at = t.textContent.length; t.append(...textHost(nx).childNodes); t.normalize(); nx.remove(); placeCaret(el, at); changed(); return; }
    }
    if (e.key === "Escape") { closeSlash(); closeSuggest(); bubble && (bubble.hidden = true); }
  });
  // 마크다운 단축: 줄 앞에 "# ", "- ", "1. ", "[] ", "> ", "```" 을 치면 그 블록으로
  doc.addEventListener("input", (e) => {
    normalize();
    const el = curEl();
    if (el) {
      const type = el.dataset.type, t = textHost(el);
      if (type === "p") {
        const txt = t.textContent, m = /^(#{1,3}|-|\*|1\.|\[\]|>|```) ?\s$/.exec(txt) || (txt === "```" && ["```", "```"]) || (txt === "---" && ["---", "---"]);
        if (m) { const map = { "#": "h1", "##": "h2", "###": "h3", "-": "bullet", "*": "bullet", "1.": "number", "[]": "todo", ">": "quote", "```": "code", "---": "divider" }; t.textContent = ""; turn(el, map[m[1]]); return; }
      }
      if (TEXTY.has(type)) {
        const txt = t.textContent;
        if (!state.slash && txt === "/") openSlash(el);
        else if (state.slash) { if (!txt.startsWith("/")) closeSlash(); else filterSlash(txt.slice(1)); }
        suggestMaybe(t);
      }
    }
    changed();
  });
  doc.addEventListener("input", (e) => { if (e.target.classList?.contains("code-lang")) changed(); });
  // 다른 블록으로 옮겨가면 방금 떠난 블록의 **굵게** 같은 기호를 서식으로 바꿔요
  let lastEl = null;
  function tidy(el) {
    if (!el?.isConnected || !TEXTY.has(el.dataset.type)) return;
    const md = inlineToMd(el); if (!/(\*\*|__|~~|`|\[\[|\]\(|(^|\s)#\S)/.test(md)) return;
    const html = renderInline(md); if (html !== el.innerHTML) el.innerHTML = html;
  }
  // 붙여넣기: 글자만 받아서 여러 줄이면 블록으로
  doc.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text/plain"); if (text == null) return;
    e.preventDefault();
    const el = curEl(); const plain = el && (el.dataset.type === "code" || el.dataset.type === "raw");
    if (plain || !/\n/.test(text.trim())) { insertText(text); changed(); return; }
    const blocks = parseBlocks(text); if (!blocks.length) return;
    const s = getSelection(); if (!s.isCollapsed) s.getRangeAt(0).deleteContents();
    let anchor = el;
    if (el && TEXTY.has(el.dataset.type) && !textHost(el).textContent.trim() && blocks[0]) { anchor = replaceEl(el, blocks.shift(), null); }
    else if (!anchor) anchor = doc.lastElementChild;
    let last = anchor; for (const b of blocks) { const ne = mkEl(b); last.after(ne); last = ne; }
    if (last && last.contentEditable !== "false") placeCaret(last, "end"); changed();
  });

  // ---- 클릭 ----
  doc.addEventListener("click", (e) => {
    const el = e.target.closest(".blk"); if (!el) return;
    const w = e.target.closest("[data-wikilink]"); if (w) { e.preventDefault(); opts.onOpenTitle?.(w.dataset.wikilink); return; }
    const tg = e.target.closest("[data-tag]"); if (tg) { e.preventDefault(); opts.onOpenTag?.(tg.dataset.tag); return; }
    const a = e.target.closest("a[href]"); if (a && !a.closest(".bx-page")) { const href = a.getAttribute("href"); if (/^https?:/i.test(href)) { e.preventDefault(); window.open(href, "_blank", "noopener"); } return; }
    if (e.target.closest(".bx-page")) { e.preventDefault(); opts.onOpenTitle?.(el.dataset.page); return; }
    if (RO) return;
    if (el.dataset.type === "todo" && e.clientX < el.getBoundingClientRect().left + 30) { e.preventDefault(); if (el.dataset.checked) delete el.dataset.checked; else el.dataset.checked = "1"; changed(); return; }
    if (e.target.closest("[data-ask-x]")) { remove(el, false); return; }
    if (e.target.closest("[data-ask-img]")) { const f = e.target.closest("form"); pickImages().then((fs) => addAskImgs(f, fs)); return; }
    const ax = e.target.closest(".ask-att [data-att-x]"); if (ax) { const f = ax.closest("form"); (askImgs.get(f) || []).splice(+ax.dataset.attX, 1); drawAskImgs(f); return; }
    if (e.target.closest("[data-ai-del]")) { remove(el); return; }
    if (e.target.closest("[data-ai-plain]")) { const nb = parseBlocks(el.dataset.md || ""); const els = (nb.length ? nb : [{ type: "p", text: "" }]).map(mkEl); el.replaceWith(...els); placeCaret(els[els.length - 1]); changed(); return; }
  });
  // 빈 곳(마지막 블록 아래)을 누르면 이어 쓰기
  host.addEventListener("mousedown", (e) => {
    if (RO || e.target !== doc && e.target !== host) return;
    const last = doc.lastElementChild; if (!last) return;
    if (e.clientY < last.getBoundingClientRect().bottom) return;
    e.preventDefault();
    if (TEXTY.has(last.dataset.type) && !last.textContent.trim()) placeCaret(last); else insertAfter(last, { type: "p", text: "" });
  });
  // AI 묻기 · 새 페이지
  // 물어보기 칸의 이미지 (폼마다 따로)
  const askImgs = new WeakMap();
  const drawAskImgs = (f) => { const t = f.querySelector(".ask-att"), list = askImgs.get(f) || []; t.hidden = !list.length; t.innerHTML = list.map((u, i) => `<span class="att"><img src="${esc(u)}" alt=""><button type="button" data-att-x="${i}" aria-label="이미지 빼기">✕</button></span>`).join(""); };
  async function addAskImgs(f, files) {
    const list = askImgs.get(f) || []; askImgs.set(f, list);
    for (const file of files.slice(0, Math.max(0, MAX_IMAGES - list.length))) { try { list.push(await shrink(file)); } catch (err) { opts.onError?.(err); } }
    drawAskImgs(f);
  }
  doc.addEventListener("paste", (e) => { if (!e.target.matches?.(".ask-in")) return; const fs = imageFiles(e.clipboardData); if (!fs.length) return; e.preventDefault(); e.stopPropagation(); addAskImgs(e.target.closest("form"), fs); }, true);
  doc.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, el = f.closest(".blk");
    if (f.matches("[data-ask]")) {
      const images = askImgs.get(f) || [];
      const q = f.querySelector(".ask-in").value.trim() || (images.length ? "이 이미지 내용을 정리해 줘" : ""); if (!q) return;
      f.querySelector(".ask-busy").hidden = false; f.querySelector("button[type=submit]").disabled = true;
      try {
        const ctxMd = serializeBlocks(readAll());
        const r = await opts.onAsk(q, ctxMd, images); const md = typeof r === "string" ? r : r.text;
        replaceEl(el, { type: "ai", text: `**Q.** ${q}\n\n${md}`, model: typeof r === "string" ? "" : r.model }, null);
      } catch (err) { if (f.isConnected) { f.querySelector(".ask-busy").hidden = true; f.querySelector("button[type=submit]").disabled = false; } opts.onError?.(err); }
    } else if (f.matches("[data-newpage]")) {
      const title = f.querySelector(".ask-in").value.trim().replace(/[\[\]|#]/g, ""); if (!title) return;
      f.querySelector("button[type=submit]").disabled = true;
      try { const note = await opts.onNewPage(title); if (note) replaceEl(el, { type: "page", text: note.title }, null); else f.querySelector("button[type=submit]").disabled = false; }
      catch (err) { f.querySelector("button[type=submit]").disabled = false; opts.onError?.(err); }
    }
  });
  doc.addEventListener("keydown", (e) => { if (e.target.matches?.(".ask-in, .code-lang")) e.stopPropagation(); }, true);

  // ---- 서식 ----
  function fmt(kind) {
    const s = getSelection(); if (!s?.rangeCount) return;
    const el = curEl(); if (!el || el.dataset.type === "code" || el.dataset.type === "raw") return;
    if (kind === "bold") document.execCommand("bold");
    else if (kind === "italic") document.execCommand("italic");
    else if (kind === "strike") document.execCommand("strikeThrough");
    else if (kind === "code") { const r = s.getRangeAt(0); if (r.collapsed) return insertText("`코드`"); const c = document.createElement("code"); c.textContent = r.toString(); r.deleteContents(); r.insertNode(c); }
    else if (kind === "link") { const r = s.getRangeAt(0); const text = r.toString(); askUrl(el, (url) => { if (!url) return; placeRange(r); const a = document.createElement("a"); a.href = url; a.textContent = text || url; a.target = "_blank"; r.deleteContents(); r.insertNode(a); changed(); }); return; }
    changed();
  }
  function placeRange(r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function askUrl(el, done) {
    closeSlash(); if (bubble) bubble.hidden = true;
    const pop = document.createElement("form"); pop.className = "blk-url glass";
    pop.innerHTML = `<input class="input" type="url" placeholder="https://…" aria-label="링크 주소" required><button class="btn sm accent" type="submit">넣기</button>`;
    const r = el.getBoundingClientRect(); pop.style.left = Math.min(r.left, innerWidth - 340) + "px"; pop.style.top = r.bottom + 6 + "px";
    document.body.appendChild(pop); pop.querySelector("input").focus();
    const close = () => { pop.remove(); document.removeEventListener("mousedown", out); };
    const out = (e) => { if (!pop.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener("mousedown", out), 0);
    pop.addEventListener("submit", (e) => { e.preventDefault(); const v = pop.querySelector("input").value.trim(); close(); done(/^https?:\/\//i.test(v) ? v : "https://" + v); });
    pop.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }
  if (!RO) {
    host.addEventListener("mousedown", (e) => { if (e.target.closest(".blk-bubble, .blk-gut")) e.preventDefault(); }); // 포커스를 잃지 않게
    host.addEventListener("click", (e) => {
      const f = e.target.closest("[data-fmt]"); if (f) return fmt(f.dataset.fmt);
      if (e.target.closest("[data-ask-sel]")) { const q = getSelection().toString().trim(); const el = curEl(); if (!el) return; insertAfter(el, { type: "ask", text: q ? `"${q.slice(0, 200)}" 를 설명해 줘` : "" }); bubble.hidden = true; }
      if (e.target.closest("[data-plus]") && gutEl) { const ne = insertAfter(gutEl, { type: "p", text: "" }); openSlash(ne, true); }
      if (e.target.closest("[data-menu]") && gutEl && !dragMoved) openSlash(gutEl, false, true);
    });
  }
  // 글자를 긁으면 작은 도구 · 블록을 옮겨가면 서식 정리
  document.addEventListener("selectionchange", onSelChange);
  function onSelChange() {
    const el = curEl();
    if (el !== lastEl) { const prev = lastEl; lastEl = el; if (prev && prev !== el) tidy(prev); }
    if (!bubble) return;
    const s = getSelection();
    if (!el || !s || s.isCollapsed || !s.toString().trim() || el.dataset.type === "code" || el.dataset.type === "raw") { bubble.hidden = true; return; }
    const r = s.getRangeAt(0).getBoundingClientRect(), h = host.getBoundingClientRect();
    bubble.hidden = false;
    const bw = bubble.offsetWidth || 300;
    bubble.style.left = Math.max(0, Math.min(r.left + r.width / 2 - bw / 2 - h.left, h.width - bw)) + "px";
    bubble.style.top = r.top - h.top - bubble.offsetHeight - 8 + "px";
  }

  // ---- 왼쪽 손잡이: ＋ · ⋮⋮ (끌어서 순서 바꾸기) ----
  let gutEl = null, dragMoved = false;
  if (gut) {
    host.addEventListener("pointermove", (e) => {
      if (dragging) return;
      const el = e.target.closest?.(".blk") || (e.target === doc || e.target === host ? blockAtY(e.clientY) : null);
      if (el && el !== gutEl && !el.hidden) { gutEl = el; const r = el.getBoundingClientRect(), h = host.getBoundingClientRect(); gut.hidden = false; gut.style.top = r.top - h.top + (el.dataset.type === "h1" ? 22 : el.dataset.type === "h2" ? 16 : el.dataset.type === "h3" ? 8 : 4) + "px"; }
    });
    host.addEventListener("pointerleave", () => { if (!dragging) { gut.hidden = true; gutEl = null; } });
    let dragging = null;
    gut.querySelector("[data-menu]").addEventListener("pointerdown", (e) => {
      if (!gutEl) return; dragMoved = false; const el = gutEl; dragging = { el, y: e.clientY, target: null, after: false };
      const move = (ev) => {
        if (Math.abs(ev.clientY - dragging.y) < 5 && !dragMoved) return;
        dragMoved = true; el.classList.add("blk-lift");
        const list = blocksOf().filter((b) => b !== el && !b.hidden); let best = null, after = false;
        for (const b of list) { const r = b.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { best = b; after = false; break; } best = b; after = true; }
        dragging.target = best; dragging.after = after;
        if (best) { const r = best.getBoundingClientRect(), h = host.getBoundingClientRect(); dropEl.hidden = false; dropEl.style.top = (after ? r.bottom : r.top) - h.top - 1 + "px"; }
      };
      const up = () => {
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
        el.classList.remove("blk-lift"); dropEl.hidden = true;
        if (dragMoved && dragging.target) { dragging.after ? dragging.target.after(el) : dragging.target.before(el); changed(); placeCaret(el, "end"); }
        dragging = null; setTimeout(() => (dragMoved = false), 0);
      };
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
    });
  }
  function blockAtY(y) { let best = null; for (const b of blocksOf()) { const r = b.getBoundingClientRect(); if (y >= r.top - 2 && y <= r.bottom + 2) return b; if (y > r.bottom) best = b; } return best; }

  // ---- "/" 메뉴 ----
  let menuEl = null;
  function openSlash(el, fresh = false, asMenu = false) {
    closeSlash(); closeSuggest();
    menuEl = document.createElement("div"); menuEl.className = "blk-slash glass"; menuEl.setAttribute("role", "listbox");
    state.slash = { el, sel: 0, items: MENU, asMenu };
    const r = el.getBoundingClientRect();
    menuEl.style.left = Math.min(r.left, innerWidth - 280) + "px"; menuEl.style.top = Math.min(r.bottom + 4, innerHeight - 340) + "px";
    document.body.appendChild(menuEl); drawSlash();
    menuEl.addEventListener("mousedown", (e) => { e.preventDefault(); const b = e.target.closest("[data-k]"); if (b) pickSlash(b.dataset.k); });
    setTimeout(() => document.addEventListener("mousedown", slashOut), 0);
    if (asMenu && el.contentEditable !== "false") placeCaret(el, "end");
  }
  const slashOut = (e) => { if (menuEl && !menuEl.contains(e.target)) closeSlash(); };
  function filterSlash(q) { if (!state.slash) return; q = q.trim().toLowerCase(); state.slash.items = MENU.filter((k) => !q || TYPES[k].label.toLowerCase().includes(q) || TYPES[k].key.includes(q) || k.includes(q)); state.slash.sel = 0; if (!state.slash.items.length) return closeSlash(); drawSlash(); }
  function drawSlash() {
    const s = state.slash; if (!menuEl || !s) return;
    menuEl.innerHTML = `<div class="slash-t">${s.asMenu ? "이 블록을…" : "블록 넣기"}</div>` + s.items.map((k, j) => `<button type="button" role="option" data-k="${k}" aria-selected="${j === s.sel}"><span class="sl-k">${slashGlyph(k)}</span><span><b>${TYPES[k].label}</b><small>${TYPES[k].hint}</small></span></button>`).join("") + (s.asMenu ? `<button type="button" role="option" data-k="__del" class="danger"><span class="sl-k">✕</span><span><b>블록 지우기</b></span></button>` : "");
    menuEl.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }
  const slashGlyph = (k) => ({ p: "¶", h1: "H1", h2: "H2", h3: "H3", bullet: "•", number: "1.", todo: "☐", quote: "❝", code: "</>", divider: "—", page: "📄", link: "[[", ai: "✦" }[k] || "");
  function onSlashKey(e) {
    const s = state.slash;
    if (e.key === "ArrowDown") { e.preventDefault(); s.sel = (s.sel + 1) % s.items.length; drawSlash(); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); s.sel = (s.sel - 1 + s.items.length) % s.items.length; drawSlash(); return true; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickSlash(s.items[s.sel]); return true; }
    if (e.key === "Escape") { e.preventDefault(); closeSlash(); return true; }
    return false;
  }
  function pickSlash(k) {
    const s = state.slash; if (!s) return; closeSlash();
    const el = s.el; if (!el?.isConnected) return;
    if (k === "__del") return remove(el);
    if (!s.asMenu) { const t = textHost(el); if (t.textContent.startsWith("/")) t.textContent = ""; }
    turn(el, k);
  }
  function closeSlash() { if (menuEl) { menuEl.remove(); menuEl = null; } state.slash = null; document.removeEventListener("mousedown", slashOut); }

  // ---- [[ 자동완성 ----
  let sugEl = null;
  function suggestMaybe() {
    const s = getSelection(); if (!s?.rangeCount || !s.isCollapsed) return closeSuggest();
    const node = s.anchorNode; if (!node || node.nodeType !== 3) return closeSuggest();
    const upto = node.nodeValue.slice(0, s.anchorOffset), open = upto.lastIndexOf("[[");
    if (open < 0 || upto.slice(open).includes("]]")) return closeSuggest();
    const q = upto.slice(open + 2);
    const titles = (opts.notes?.() || []).filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
    const items = titles.map((t) => ({ t })); if (q && !titles.some((t) => t.toLowerCase() === q.toLowerCase())) items.push({ t: q, fresh: true });
    if (!items.length) return closeSuggest();
    if (!sugEl) { sugEl = document.createElement("div"); sugEl.className = "suggest"; sugEl.setAttribute("role", "listbox"); document.body.appendChild(sugEl); sugEl.addEventListener("mousedown", (e) => { e.preventDefault(); const b = e.target.closest("[data-i]"); if (b) { state.sugg.sel = +b.dataset.i; pickSuggest(); } }); }
    state.sugg = { items, sel: 0, node, open, q };
    const r = s.getRangeAt(0).getBoundingClientRect();
    sugEl.style.left = Math.min(r.left, innerWidth - 260) + "px"; sugEl.style.top = r.bottom + 6 + "px";
    drawSuggest();
  }
  function openSuggest() { suggestMaybe(); }
  function drawSuggest() { sugEl.innerHTML = state.sugg.items.map((o, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === state.sugg.sel}">${o.fresh ? icon.plus(13) + `새 노트: ${esc(o.t)}` : esc(o.t)}</button>`).join(""); }
  function pickSuggest() {
    const sg = state.sugg; if (!sg) return;
    const o = sg.items[sg.sel], node = sg.node, s = getSelection();
    const r = document.createRange(); r.setStart(node, sg.open); r.setEnd(node, Math.min(node.nodeValue.length, sg.open + 2 + sg.q.length));
    if (node.nodeValue.slice(sg.open + 2 + sg.q.length).startsWith("]]")) r.setEnd(node, sg.open + 2 + sg.q.length + 2);
    r.deleteContents();
    const a = document.createElement("a"); a.className = "wikilink"; a.dataset.wikilink = o.t; a.href = "#"; a.textContent = o.t;
    r.insertNode(a); const sp = document.createTextNode(" "); a.after(sp);
    r.setStartAfter(sp); r.collapse(true); s.removeAllRanges(); s.addRange(r);
    closeSuggest(); changed();
  }
  function onSuggKey(e) {
    const sg = state.sugg;
    if (e.key === "ArrowDown") { e.preventDefault(); sg.sel = (sg.sel + 1) % sg.items.length; drawSuggest(); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); sg.sel = (sg.sel - 1 + sg.items.length) % sg.items.length; drawSuggest(); return true; }
    if ((e.key === "Enter" || e.key === "Tab") && !e.isComposing) { e.preventDefault(); pickSuggest(); return true; }
    if (e.key === "Escape") { e.preventDefault(); closeSuggest(); return true; }
    return false;
  }
  function closeSuggest() { if (sugEl) { sugEl.remove(); sugEl = null; } state.sugg = null; }

  // ---- 공개 API ----
  const api = {
    setValue(md) { render(parseBlocks(md)); },
    getValue() { return serializeBlocks(readAll()); },
    focus(where = "end") { const els = blocksOf(); const el = where === "start" ? els[0] : els[els.length - 1]; if (el) placeCaret(el, where); },
    isEmpty() { return readAll().every((b) => !(b.text || "").trim() && b.type !== "divider" && b.type !== "page"); },
    destroy() { closeSlash(); closeSuggest(); document.removeEventListener("selectionchange", onSelChange); },
  };
  api.setValue(opts.value || "");
  host.__ed = { blocks: () => readAll() }; // 자동 테스트용
  return api;
}

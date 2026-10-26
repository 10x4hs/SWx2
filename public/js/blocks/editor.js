// Notion-style block editor over { v: 1, blocks } (docs/blocks-schema.md).
// One contenteditable per text block: raw inline markdown while focused, rendered when not.
// Enter / Backspace / Tab / Shift-Tab, "/" menu, ⋮⋮ drag handle, markdown shortcuts, [[ autocomplete, toggles that remember open state.
// ⌘Z / Ctrl+Z · ⌘⇧Z / Ctrl+Shift+Z / Ctrl+Y: its own history of doc snapshots (the browser's undo breaks once blocks re-render).
//   Typing in one block within 600ms is one step; Enter · Backspace-join · "/" · markdown shortcuts · drags are their own steps.
//   Undo puts the caret back where it was before that step, then calls onChange (so the page saves).
import { renderInline } from "../md.js";
import { esc } from "../util.js";
import { block, canNest, mdToBlocks, MAX_COLS } from "./md.js";
import { inlineWithMath, paintMath } from "./math.js";
import { touchDrag } from "./touchdrag.js";

const LISTY = new Set(["bullet", "number", "todo"]);
const SIZED = new Set(["paragraph", "h1", "h2", "h3", "bullet", "number", "todo", "toggle", "callout", "quote"]); // 글씨 크기를 바꿀 수 있는 블록
const FS = [["s", "작게"], ["m", "보통"], ["l", "크게"], ["xl", "아주 크게"]];
const WIDGET = new Set(["divider", "image", "table", "page", "database", "file", "bookmark", "embed", "equation", "columns", "column"]);
const COLISH = new Set(["columns", "column"]);
const nestOk = (b) => canNest(b) && !COLISH.has(b.type); // 들여쓰기(Tab)로 단 안에 넣지는 않아요
export const MENU = [
  ["paragraph", "Text", "Plain text", "T"],
  ["h1", "Heading 1", "Big section heading", "H1"],
  ["h2", "Heading 2", "Medium section heading", "H2"],
  ["h3", "Heading 3", "Small section heading", "H3"],
  ["bullet", "Bulleted list", "Simple bulleted list", "•"],
  ["number", "Numbered list", "List with numbering", "1."],
  ["todo", "To-do list", "Track tasks with a checkbox", "☐"],
  ["toggle", "Toggle list", "Hide content inside", "▸"],
  ["toggle_h2", "Toggle heading", "Heading that folds", "▸H"],
  ["callout", "Callout", "Make writing stand out", "💡"],
  ["quote", "Quote", "Capture a quote", "❝"],
  ["divider", "Divider", "Visually divide blocks", "—"],
  ["code", "Code", "Code snippet", "</>"],
  ["table", "Table", "Simple table", "▦"],
  ["image", "Image", "Embed an image by URL", "🖼"],
  ["upload_image", "Photo", "사진 올리기 (25MB 까지) · /사진", "📷", "사진 이미지 photo"],
  ["upload_file", "File", "파일 올리기 (PDF · 문서 · 아무 파일, 25MB 까지) · /파일", "📎", "파일 첨부 attach file upload"],
  ["bookmark", "Bookmark", "Link with a caption", "🔗"],
  ["equation", "Equation", "Block math", "∑"],
  ["columns2", "2 columns", "Side-by-side blocks", "▥"],
  ["columns3", "3 columns", "Three columns", "▥"],
  ["page", "Page", "Sub-page inside this page", "📄"],
  ["database", "Database", "Table and board views", "▤"],
];
const fmtSize = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(1) + " MB");
function fileIcon(mime = "", name = "") {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] || "").toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") return "📕";
  if (/^image\//.test(mime)) return "🖼";
  if (/^video\//.test(mime)) return "🎬";
  if (/^audio\//.test(mime)) return "🎵";
  if (/zip|compressed|tar|rar|7z/.test(mime) || /^(zip|rar|7z|gz|tgz|tar)$/.test(ext)) return "🗜";
  if (/sheet|excel|csv/.test(mime) || /^(xlsx?|csv|numbers)$/.test(ext)) return "📊";
  if (/presentation|powerpoint/.test(mime) || /^(pptx?|key)$/.test(ext)) return "📽";
  if (/word|document|rtf/.test(mime) || /^(docx?|hwpx?|pages|rtf)$/.test(ext)) return "📝";
  if (/^text\//.test(mime) || /^(txt|md|json|js|ts|py|html?|css|xml|yml|yaml)$/.test(ext)) return "📄";
  return "📎";
}
const PH = { paragraph: "Type '/' for commands", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", bullet: "List", number: "List", todo: "To-do", toggle: "Toggle", callout: "Callout", quote: "Quote" };

// toggles: which ones this viewer left open (per browser)
const OPEN_KEY = "trio-nb-open";
let openSet = null;
function opened() { if (!openSet) { try { openSet = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]")); } catch { openSet = new Set(); } } return openSet; }
function setOpen(id, v) {
  const s = opened(); if (v) s.add(id); else s.delete(id);
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s].slice(-3000))); } catch {}
}
const isFoldable = (b) => b.type === "toggle" || (/^h[123]$/.test(b.type) && b.props?.toggle);

// caret helpers (plain text nodes only — raw mode)
function caretOffset(el) {
  const s = getSelection(); if (!s.rangeCount || !el.contains(s.anchorNode)) return 0;
  const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setEnd(s.anchorNode, s.anchorOffset);
  return r.toString().length;
}
function setCaret(el, off) {
  el.focus();
  const s = getSelection(), r = document.createRange();
  let left = Math.max(0, off), node = null, prev = null;
  const inMk = (n) => !!n?.parentNode?.closest?.(".nb-mk");
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  // 숨긴 ** 기호 안에는 커서를 두지 않아요 (거기 치면 글자가 안 보여요)
  while (w.nextNode()) {
    const n = w.currentNode;
    if (left > n.length) { left -= n.length; prev = n; continue; }
    if (!inMk(n) || (left > 0 && left < n.length)) { node = n; break; }
    if (left === 0 && prev && !inMk(prev)) { node = prev; left = prev.length; break; }
    left = Math.max(0, left - n.length); prev = n;
  }
  if (!node && el.querySelector(".nb-mk")) { node = document.createTextNode("\u200B"); el.appendChild(node); left = 1; }
  if (node) r.setStart(node, left); else { r.selectNodeContents(el); r.collapse(false); }
  r.collapse(true); s.removeAllRanges(); s.addRange(r);
}
// 쓰는 중에도 마크다운이 바로 보여요(노션처럼): **굵게** *기울임* `코드` ~~취소선~~ — 기호는 숨기고 글자는 그대로 남겨서 저장은 마크다운 그대로
const MKS = ["**", "*", "`", "~~"], TAGS = ["strong", "em", "code", "s"];
function liveHtml(t) {
  const codes = [];
  let h = String(t || "").replace(/`([^`\n]+)`/g, (_, a) => { codes.push(a); return "\uE010" + (codes.length - 1) + "\uE011"; });
  h = h.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "\uE000$1\uE001")
    .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "\uE006$1\uE007")
    .replace(/(^|[^*\\])\*(?=[^\s*])([^*\n]*?[^\s*\\])\*(?!\*)/g, "$1\uE002$2\uE003");
  const mk = (i) => `<span class="nb-mk">${esc(MKS[i])}</span>`;
  return esc(h).replace(/[\uE000-\uE007]/g, (c) => { const k = c.charCodeAt(0) - 0xE000, i = k >> 1; return k & 1 ? `</${TAGS[i]}>${mk(i)}` : `${mk(i)}<${TAGS[i]}>`; })
    .replace(/\uE010(\d+)\uE011/g, (_, i) => `${mk(2)}<code>${esc(codes[+i])}</code>${mk(2)}`);
}
function paintLive(el, text, off) {
  const html = liveHtml(text);
  if (el.innerHTML === html) return;
  if (!el.childElementCount && html === esc(text)) return; // 꾸밀 게 없으면 손대지 않아요 (커서 · 되돌리기 그대로)
  el.innerHTML = html; setCaret(el, off);
}
const readText = (el) => { if (el.querySelector(".nb-mk") && !el.querySelector("br, div")) return el.textContent.replace(/\u200B/g, ""); let t = el.innerText.replace(/​/g, ""); if (t.endsWith("\n") && !el.textContent.endsWith("\n")) t = t.slice(0, -1); return t; };

const COLS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
const swatches = () => `<div class="nb-sw" role="group" aria-label="Text color">${COLS.map((c) => `<button type="button" data-col="${c}" data-kind="text" class="c-${c}" title="${c}">A</button>`).join("")}<button type="button" data-col="default" title="Default">A</button></div>`
  + `<div class="nb-sw" role="group" aria-label="Background">${COLS.map((c) => `<button type="button" data-col="${c}" data-kind="bg" title="${c} background" style="background:var(--hl-${c})"></button>`).join("")}</div>`;

export function createBlockEditor(host, opts) {
  const ro = !!opts.readOnly;
  let doc = opts.doc && Array.isArray(opts.doc.blocks) ? opts.doc : { v: 1, blocks: [] };
  if (!doc.blocks.length) doc.blocks.push(block("paragraph"));
  const root = document.createElement("div");
  root.className = "nb-doc" + (ro ? " ro" : "");
  if (!ro) root.tabIndex = -1;
  host.innerHTML = ""; host.appendChild(root);
  let menu = null, sug = null, dragId = null;
  const changed = () => { tidy(); record(); opts.onChange?.(doc); };

  // ---------- history (undo · redo) ----------
  // state = { json, pre, post } — pre: caret just before this step (inside the previous state), post: caret right after it
  const H = { past: [], future: [], cur: null, typing: false, at: 0, forceNew: false };
  let preCaret = null;
  const caretNow = () => {
    const a = document.activeElement;
    if (!a || !root.contains(a) || !a.classList?.contains("nb-text")) return null;
    const w = a.closest(".nb"); return w ? { id: w.dataset.id, off: caretOffset(a) } : null;
  };
  function record() {
    const json = JSON.stringify(doc);
    if (!H.cur) { H.cur = { json, pre: null, post: null }; return; }
    if (json === H.cur.json) return;
    const now = Date.now(), pre = preCaret || caretNow();
    // 같은 블록에서 쉬지 않고(600ms 안) 친 글자는 한 단계
    const merge = H.typing && H.cur.typing && !H.forceNew && now - H.at < 600 && H.cur.pre?.id && pre?.id === H.cur.pre.id && H.cur.block === pre.id;
    if (merge) H.cur.json = json;
    else { H.past.push(H.cur); if (H.past.length > 100) H.past.shift(); H.cur = { json, pre, post: null, typing: H.typing, block: pre?.id }; }
    H.future = []; H.at = now; H.forceNew = false; preCaret = null;
    const st = H.cur; queueMicrotask(() => { st.post = caretNow() || st.post; }); // render(focus) 가 끝난 뒤의 자리
  }
  // 글 칸에 초점이 없을 때(파일 · 위젯 블록을 넣은 뒤): 편집기 자체에 초점을 둬서 ⌘Z 가 화면 전체 되돌리기가 아니라 이 편집기로 오게
  function holdFocus() { if (!root.contains(document.activeElement)) root.focus({ preventScroll: true }); }
  function restore(st, caret) {
    closeMenu(); closeSug();
    doc = JSON.parse(st.json);
    if (!doc.blocks.length) doc.blocks.push(block("paragraph"));
    const ok = caret && find(caret.id) && flat().some((b) => b.id === caret.id);
    render(ok ? { id: caret.id, off: caret.off } : undefined);
    if (!ok) holdFocus();
    opts.onChange?.(doc); // 저장은 화면 쪽이 (다시 기록하지는 않아요)
  }
  function undo() {
    if (!H.past.length) return false;
    const cur = H.cur, prev = H.past.pop();
    cur.post = caretNow() || cur.post;
    H.future.push(cur); H.cur = prev; H.typing = false; H.forceNew = true;
    restore(prev, cur.pre || prev.post);
    return true;
  }
  function redo() {
    if (!H.future.length) return false;
    const next = H.future.pop();
    H.past.push(H.cur); H.cur = next; H.typing = false; H.forceNew = true;
    restore(next, next.post || next.pre);
    return true;
  }
  // 단 정리: 빈 단은 지우고, 단이 하나만 남으면 단 나누기를 풀어요
  function tidy(list = doc.blocks) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.type === "columns") {
        b.children = (b.children || []).filter((c) => c.children?.length);
        if (b.children.length < 2) { list.splice(i, 1, ...(b.children[0]?.children || [])); i--; continue; }
      }
      if (b.children?.length) tidy(b.children);
    }
    if (!doc.blocks.length) doc.blocks.push(block("paragraph"));
  }
  const newColumns = (n, first = []) => block("columns", "", {}, Array.from({ length: n }, (_, i) => block("column", "", {}, i < first.length ? [first[i]] : [block("paragraph")])));

  // ---------- tree helpers ----------
  function find(id, list = doc.blocks, parent = null) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.id === id) return { b, list, i, parent };
      const r = b.children?.length ? find(id, b.children, b) : null;
      if (r) return r;
    }
    return null;
  }
  // blocks in visual order (skipping closed toggles' children)
  function flat(list = doc.blocks, out = []) {
    for (const b of list) { out.push(b); if (b.children?.length && (!isFoldable(b) || opened().has(b.id))) flat(b.children, out); }
    return out;
  }
  const editable = (b) => !WIDGET.has(b.type);
  const elOf = (id) => root.querySelector(`.nb[data-id="${id}"] > .nb-row .nb-text`);

  // ---------- render ----------
  function render(focus) {
    root.innerHTML = "";
    root.appendChild(renderList(doc.blocks));
    if (focus) { const el = elOf(focus.id); if (el) setCaret(el, focus.off === "end" ? 1e9 : focus.off || 0); }
    paintMath(root);
  }
  function renderList(list) {
    const f = document.createDocumentFragment();
    let n = 0;
    for (const b of list) { n = b.type === "number" ? n + 1 : 0; f.appendChild(renderBlock(b, n)); }
    return f;
  }
  function renderBlock(b, num) {
    const wrap = document.createElement("div");
    const col = b.props?.color || "";
    wrap.className = "nb nb-" + b.type + (b.props?.toggle ? " nb-fold" : "") + (col ? (col.endsWith("_background") ? " nb-bg-" + col.slice(0, -11) : " nb-color-" + col) : "") + (b.props?.size ? " nb-fs-" + b.props.size : "");
    wrap.dataset.id = b.id; wrap.dataset.type = b.type;
    const row = document.createElement("div"); row.className = "nb-row";
    if (!ro) { const h = document.createElement("span"); h.className = "nb-handle"; h.draggable = true; h.title = "Drag to move · click for menu"; h.textContent = "⋮⋮"; row.appendChild(h); }
    const fold = isFoldable(b), open = fold && opened().has(b.id);
    if (fold) wrap.classList.toggle("open", open);
    // left marker
    let mark = null;
    if (b.type === "bullet") mark = `<span class="nb-mk">•</span>`;
    else if (b.type === "number") mark = `<span class="nb-mk nb-num">${num}.</span>`;
    else if (b.type === "todo") mark = `<input type="checkbox" class="nb-mk nb-check" ${b.props.checked ? "checked" : ""} ${ro ? "disabled" : ""} aria-label="Done">`;
    else if (fold) mark = `<button type="button" class="nb-mk nb-tg" aria-expanded="${open}" aria-label="Toggle"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M4 2.5 8.5 6 4 9.5z" fill="currentColor"/></svg></button>`;
    else if (b.type === "callout") mark = `<button type="button" class="nb-mk nb-icon" ${ro ? "disabled" : ""} aria-label="Icon">${esc(b.props.icon || "💡")}</button>`;
    if (mark) row.insertAdjacentHTML("beforeend", mark);
    if (b.type === "todo" && b.props.checked) wrap.classList.add("done");
    if (b.type === "columns") { // 단 나누기: 각 단은 .nb 가 아닌 .nb-col (드래그 표시가 단 자체를 겨누지 않게)
      const cols = document.createElement("div"); cols.className = "nb-body nb-cols"; cols.style.setProperty("--n", b.children.length);
      for (const c of b.children) {
        const cd = document.createElement("div"); cd.className = "nb-col"; cd.dataset.cid = c.id;
        cd.appendChild(renderList(c.children || []));
        if (!c.children?.length && !ro) cd.insertAdjacentHTML("beforeend", `<button type="button" class="nb-empty-kid" data-col="${c.id}">Click to add a block.</button>`);
        cols.appendChild(cd);
      }
      row.appendChild(cols); wrap.appendChild(row); return wrap;
    }
    row.appendChild(body(b));
    wrap.appendChild(row);
    if (b.children?.length || (fold && open)) {
      const kids = document.createElement("div"); kids.className = "nb-kids";
      if (!fold || open) {
        kids.appendChild(renderList(b.children || []));
        if (fold && !b.children?.length && !ro) kids.insertAdjacentHTML("beforeend", `<button type="button" class="nb-empty-kid">Empty toggle. Click to add a block.</button>`);
      }
      wrap.appendChild(kids);
    }
    return wrap;
  }
  function textEl(b, tag = "div") {
    const el = document.createElement(tag);
    el.className = "nb-text";
    if (/^<!--[\s\S]*-->$/.test(b.text.trim())) el.classList.add("nb-comment");
    el.dataset.ph = PH[b.type] || "";
    if (!ro) { el.contentEditable = "true"; el.spellcheck = true; }
    show(el, b);
    return el;
  }
  function show(el, b) { el.innerHTML = b.text ? (el.classList.contains("nb-comment") ? esc(b.text) : inlineWithMath(b.text, renderInline)) : ""; }
  function body(b) {
    const p = b.props || {};
    switch (b.type) {
      case "divider": return Object.assign(document.createElement("div"), { className: "nb-body", innerHTML: "<hr>" });
      case "code": {
        const box = document.createElement("div"); box.className = "nb-body nb-codebox";
        box.innerHTML = `<input class="nb-lang" value="${esc(p.lang || "")}" placeholder="plain text" aria-label="Language" ${ro ? "readonly" : ""}>`;
        const pre = document.createElement("pre"); pre.className = "nb-text nb-code"; pre.textContent = b.text;
        if (!ro) { pre.contentEditable = "true"; pre.spellcheck = false; }
        box.appendChild(pre); return box;
      }
      case "image": {
        const f = document.createElement("figure"); f.className = "nb-body nb-img";
        if (p.src) f.innerHTML = `<div class="nb-imgbox"${p.width ? ` style="width:${p.width}%"` : ""}><img src="${esc(p.src)}" alt="${esc(p.caption || "")}" loading="lazy">${ro ? "" : '<span class="nb-resize" title="끌어서 크기 조절" aria-hidden="true"></span>'}</div><figcaption ${ro ? "" : 'contenteditable="true"'} class="nb-cap" data-ph="Add a caption">${esc(p.caption || "")}</figcaption>`;
        else f.innerHTML = ro ? "" : `${opts.uploadImage || opts.uploadFile ? `<button type="button" class="btn sm nb-pick">이미지 올리기</button>` : ""}<input class="input nb-url" placeholder="${opts.uploadImage || opts.uploadFile ? "또는 이미지 주소를 붙여 넣고 Enter" : "Paste an image URL and press Enter"}" aria-label="Image URL">`;
        return f;
      }
      case "file": if (p.bytes) return fileCard(b);
      // falls through — Notion 에서 가져온 첨부(링크만)
      case "bookmark": case "embed": {
        const url = p.url || p.src || "", label = p.caption || p.name || url;
        const d = document.createElement("div"); d.className = "nb-body nb-bm";
        d.innerHTML = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${b.type === "file" ? "📎 " : "🔗 "}${esc(label)}</a><span class="faint">${esc(url.replace(/^https?:\/\//, "").slice(0, 60))}</span>`
          : (ro ? "" : `<input class="input nb-url" placeholder="Paste a link and press Enter" aria-label="Link">`);
        return d;
      }
      case "equation": {
        const box = document.createElement("div"); box.className = "nb-body nb-eqbox";
        const d = document.createElement("div"); d.className = "nb-eq" + (p.expr ? "" : " empty"); d.tabIndex = 0;
        if (p.expr) { d.dataset.expr = p.expr; d.textContent = p.expr; } else d.textContent = ro ? "" : "Click to add an equation";
        box.appendChild(d); return box;
      }
      case "table": return tableEl(b);
      case "page": case "database": {
        const d = document.createElement("div"); d.className = "nb-body " + (b.type === "page" ? "nb-page" : "nb-db");
        if (b.type === "page") d.innerHTML = `<a href="#/notes/${esc(p.note_id || "")}" class="nb-pagelink"><span>📄</span><b>${esc(p.title || "Untitled")}</b></a>`;
        else if (p.note_id) opts.mountDb?.(d, p.note_id, p.title);
        return d;
      }
      default: return textEl(b);
    }
  }
  // 노트에 올린 파일: 종류 아이콘 · 이름 · 크기 · 내려받기 (PDF 는 바로 아래 미리보기, 크게 보기 토글)
  function fileCard(b) {
    const p = b.props, pdf = p.mime === "application/pdf";
    const d = document.createElement("div"); d.className = "nb-body nb-file" + (p.open ? " open" : "");
    const dl = p.src + (p.src.includes("?") ? "&" : "?") + "dl=1";
    d.innerHTML = `<div class="nb-file-row"><span class="nb-file-ic" aria-hidden="true">${fileIcon(p.mime, p.name)}</span><span class="nb-file-meta"><b title="${esc(p.name || "")}">${esc(p.name || "file")}</b><small>${fmtSize(p.bytes)}${pdf ? " · PDF" : ""}</small></span>`
      + (pdf ? `<button type="button" class="btn sm nb-file-open" aria-expanded="${!!p.open}">${p.open ? "작게" : "크게 보기"}</button>` : "")
      + `<a class="btn sm nb-file-dl" href="${esc(dl)}" download="${esc(p.name || "")}">내려받기</a></div>`
      + (pdf ? `<iframe class="nb-file-pdf" src="${esc(p.src)}#view=FitH" title="${esc(p.name || "PDF")}" loading="lazy"></iframe>` : "");
    return d;
  }
  function tableEl(b) {
    const p = b.props; if (!p.rows?.length) p.rows = [["", ""], ["", ""]];
    const w = Math.max(...p.rows.map((r) => r.length));
    const box = document.createElement("div"); box.className = "nb-body nb-tablebox";
    const t = document.createElement("table"); t.className = "nb-table" + (p.header ? " has-head" : "");
    p.rows.forEach((r, ri) => {
      const tr = t.insertRow();
      for (let ci = 0; ci < w; ci++) {
        const td = tr.insertCell(); td.dataset.r = ri; td.dataset.c = ci;
        const txt = r[ci] || ""; td.innerHTML = renderInline(txt);
        if (!ro) td.contentEditable = "true";
      }
    });
    box.appendChild(t);
    if (!ro) box.insertAdjacentHTML("beforeend", `<div class="nb-tbtns"><button type="button" class="btn ghost sm" data-t="row">+ Row</button><button type="button" class="btn ghost sm" data-t="col">+ Column</button><button type="button" class="btn ghost sm" data-t="head">${p.header ? "No header" : "Header row"}</button></div>`);
    return box;
  }

  // ---------- structure edits ----------
  function insertAfter(id, nb, asChild = false) {
    const at = find(id);
    if (asChild) { at.b.children = [nb, ...(at.b.children || [])]; if (isFoldable(at.b)) setOpen(at.b.id, true); }
    else at.list.splice(at.i + 1, 0, nb);
    return nb;
  }
  function remove(id) { const at = find(id); if (at) at.list.splice(at.i, 1); if (!doc.blocks.length) doc.blocks.push(block("paragraph")); return at; }
  function convert(b, type) {
    let toggle = false;
    if (type === "toggle_h2") { type = "h2"; toggle = true; }
    const keep = b.text, color = b.props?.color;
    b.type = type;
    b.props = type === "todo" ? { checked: false } : type === "callout" ? { icon: "💡" } : type === "code" ? { lang: "" } : type === "table" ? { header: true, rows: [["", ""], ["", ""]] } : toggle ? { toggle: true } : {};
    if (WIDGET.has(type)) b.text = ""; else { b.text = keep; if (color && type !== "code") b.props.color = color; }
    if (b.children?.length && !canNest(b)) { const at = find(b.id); at.list.splice(at.i + 1, 0, ...b.children); b.children = []; }
    if (toggle || type === "toggle") setOpen(b.id, true);
  }
  function indent(id) {
    const at = find(id); if (!at || at.i === 0) return false;
    const prev = at.list[at.i - 1];
    if (!nestOk(prev)) return false;
    at.list.splice(at.i, 1);
    (prev.children ||= []).push(at.b);
    if (isFoldable(prev)) setOpen(prev.id, true);
    return true;
  }
  function outdent(id) {
    const at = find(id); if (!at || !at.parent || at.parent.type === "column") return false;
    const pa = find(at.parent.id);
    at.list.splice(at.i, 1);
    pa.list.splice(pa.i + 1, 0, at.b);
    return true;
  }

  // ---------- events ----------
  const blockOf = (el) => { const w = el?.closest?.(".nb"); return w ? find(w.dataset.id)?.b : null; };

  root.addEventListener("focusin", (e) => {
    if (e.target.closest?.(".db-host")) return;
    const el = e.target;
    if (el.classList?.contains("nb-text") && !el.classList.contains("nb-code")) {
      const b = blockOf(el);
      // plain text stays as is (caret stays where you clicked); marked-up text switches to raw markdown with the caret at the end
      if (b && el.dataset.raw !== "1") { el.dataset.raw = "1"; if (el.childElementCount || el.textContent !== b.text) { if (el.classList.contains("nb-comment")) el.textContent = b.text; else el.innerHTML = liveHtml(b.text); setCaret(el, b.text.length); } }
    }
    if (el.tagName === "TD" && !ro) { const b = blockOf(el); el.textContent = b.props.rows[+el.dataset.r]?.[+el.dataset.c] || ""; }
  });
  root.addEventListener("focusout", (e) => {
    if (e.target.closest?.(".db-host")) return;
    const el = e.target;
    if (el.classList?.contains("nb-text") && !el.classList.contains("nb-code")) { const b = blockOf(el); delete el.dataset.raw; if (b) { show(el, b); paintMath(el); } setTimeout(() => { const a = document.activeElement; if (!(a?.classList?.contains("nb-text") && root.contains(a))) closeSug(); }, 120); }
    if (el.tagName === "TD") { const b = blockOf(el); if (b) el.innerHTML = renderInline(b.props.rows[+el.dataset.r]?.[+el.dataset.c] || ""); }
  });
  root.addEventListener("mousedown", (e) => {
    if (e.target.closest?.(".db-host")) return;
    const a = e.target.closest("a");
    if (!a || !root.contains(a)) return;
    const txt = a.closest(".nb-text, td");
    if (txt && txt.dataset.raw === "1") return; // editing raw text
    if (a.dataset.wikilink) { e.preventDefault(); opts.onOpenTitle?.(a.dataset.wikilink); }
    else if (a.dataset.tag) { e.preventDefault(); opts.onOpenTag?.(a.dataset.tag); }
    else if (a.classList.contains("nb-pagelink")) { e.preventDefault(); const b = blockOf(a); if (b?.props.note_id) opts.onOpenNote?.(b.props.note_id); }
    else if (txt) { e.preventDefault(); window.open(a.href, "_blank", "noopener"); }
  });
  root.addEventListener("click", (e) => {
    if (e.target.closest?.(".db-host")) return;
    const a = e.target.closest("a"); if (a && (a.dataset.wikilink || a.dataset.tag || a.classList.contains("nb-pagelink"))) e.preventDefault();
    const tg = e.target.closest(".nb-tg");
    if (tg) { const b = blockOf(tg); setOpen(b.id, !opened().has(b.id)); render(); return; }
    if (ro) return;
    const ek = e.target.closest(".nb-empty-kid");
    if (ek?.dataset.col) { const c = find(ek.dataset.col)?.b; if (c) { const nb = block("paragraph"); c.children = [nb]; changed(); render({ id: nb.id }); } return; }
    if (ek) { const b = blockOf(ek); const nb = insertAfter(b.id, block("paragraph"), true); changed(); render({ id: nb.id }); return; }
    const ic = e.target.closest(".nb-icon");
    if (ic) { const b = blockOf(ic); const v = prompt("Callout icon (emoji)", b.props.icon || "💡"); if (v && v.trim()) { b.props.icon = [...v.trim()].slice(0, 2).join(""); changed(); render(); } return; }
    const tb = e.target.closest(".nb-tbtns button");
    if (tb) {
      const b = blockOf(tb), p = b.props, w = Math.max(...p.rows.map((r) => r.length));
      if (tb.dataset.t === "row") p.rows.push(Array(w).fill(""));
      if (tb.dataset.t === "col") p.rows.forEach((r) => { while (r.length < w) r.push(""); r.push(""); });
      if (tb.dataset.t === "head") p.header = !p.header;
      changed(); render(); return;
    }
    const eq = e.target.closest(".nb-eq");
    if (eq) { eqEdit(blockOf(eq)); return; }
    const hd = e.target.closest(".nb-handle");
    if (hd) { openBlockMenu(blockOf(hd), hd); return; }
    const pick = e.target.closest(".nb-pick");
    if (pick) { pickImages(blockOf(pick)); return; }
    const fo = e.target.closest(".nb-file-open");
    if (fo) { const b = blockOf(fo); if (b.props.open) delete b.props.open; else b.props.open = true; changed(); render(); return; }
    // clicking empty space below the last block → focus/add a paragraph
    if (e.target === root) {
      const last = doc.blocks.at(-1);
      if (last.type === "paragraph" && !last.text) render({ id: last.id });
      else { const nb = block("paragraph"); doc.blocks.push(nb); changed(); render({ id: nb.id }); }
    }
  });
  // 수식 블록: LaTeX 를 바로 아래 칸에 쓰면 위 미리보기가 따라 바뀌어요 (Enter · Esc · 밖 클릭 = 끝)
  function eqEdit(b) {
    const box = root.querySelector(`.nb[data-id="${b.id}"] .nb-eqbox`); if (!box) return;
    let ta = box.querySelector(".nb-eqsrc");
    if (!ta) {
      ta = document.createElement("textarea"); ta.className = "nb-eqsrc"; ta.rows = 2; ta.spellcheck = false; ta.placeholder = "E = mc^2"; ta.value = b.props.expr || ""; ta.setAttribute("aria-label", "Equation (LaTeX)");
      box.appendChild(ta);
      ta.addEventListener("blur", () => setTimeout(() => { if (ta.isConnected && document.activeElement !== ta) render(); }, 0));
    }
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  function eqPreview(b, ta) {
    const d = ta.closest(".nb-eqbox").querySelector(".nb-eq");
    b.props.expr = ta.value; changed();
    delete d.dataset.done; d.classList.toggle("empty", !ta.value.trim());
    if (ta.value.trim()) { d.dataset.expr = ta.value; d.textContent = ta.value; paintMath(d.parentNode); } else { delete d.dataset.expr; d.textContent = "Click to add an equation"; }
  }
  root.addEventListener("change", (e) => {
    if (e.target.closest?.(".db-host")) return;
    const t = e.target, b = blockOf(t); if (!b) return;
    if (t.classList.contains("nb-check")) { b.props.checked = t.checked; t.closest(".nb").classList.toggle("done", t.checked); changed(); }
    if (t.classList.contains("nb-lang")) { b.props.lang = t.value.trim().slice(0, 30); changed(); }
  });
  root.addEventListener("input", (e) => {
    if (e.target.closest?.(".db-host")) return;
    const el = e.target, b = blockOf(el); if (!b) return;
    if (el.classList.contains("nb-cap")) { b.props.caption = el.textContent.trim(); changed(); return; }
    if (el.tagName === "TD") { const r = +el.dataset.r, c = +el.dataset.c; while (b.props.rows[r].length <= c) b.props.rows[r].push(""); b.props.rows[r][c] = el.innerText.replace(/\n/g, " ").trim(); changed(); return; }
    if (el.classList.contains("nb-lang")) return;
    if (el.classList.contains("nb-eqsrc")) return eqPreview(b, el);
    if (!el.classList.contains("nb-text")) return;
    b.text = readText(el);
    H.typing = true;
    if (b.type === "paragraph" && !el.classList.contains("nb-code") && shortcut(b, el)) return;
    // 한글 조합 중(compositionstart~end)에는 바꾸지 않고, 조합이 끝나면 compositionend 에서 그려요
    if (!e.isComposing && !composing && !el.classList.contains("nb-code") && !el.classList.contains("nb-comment")) paintLive(el, b.text, caretOffset(el));
    changed(); H.typing = false;
    slashCheck(b, el);
    linkCheck(b, el);
  });
  let composing = false;
  root.addEventListener("compositionstart", () => { composing = true; });
  root.addEventListener("compositionend", (e) => {
    composing = false;
    const el = e.target; if (!el.classList?.contains("nb-text") || el.classList.contains("nb-code") || el.classList.contains("nb-comment")) return;
    const b = blockOf(el); if (!b) return;
    setTimeout(() => { if (document.activeElement === el) { b.text = readText(el); paintLive(el, b.text, caretOffset(el)); } }, 0);
  });
  // 바뀌기 직전 커서 자리 (되돌리면 여기로)
  root.addEventListener("keydown", (e) => {
    if (/^(Shift|Meta|Control|Alt|CapsLock)$/.test(e.key)) return;
    if (/^(Arrow|Home|End|Page)/.test(e.key)) { preCaret = null; H.forceNew = true; return; } // 커서를 옮기면 다음 글자는 새 단계
    preCaret = caretNow();
  }, true);
  root.addEventListener("beforeinput", () => { if (!preCaret) preCaret = caretNow(); }, true);
  root.addEventListener("mousedown", () => { preCaret = null; H.typing = false; H.forceNew = true; }, true);
  root.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".db-host")) return;
    if (ro) return;
    const el = e.target;
    { // ⌘Z · ⌘⇧Z · Ctrl+Y — 수식 · 주소 같은 작은 입력 칸은 브라우저 것 그대로
      const k = (e.key || "").toLowerCase(), mod = (e.metaKey || e.ctrlKey) && !e.altKey;
      const dir = mod && k === "z" ? (e.shiftKey ? "redo" : "undo") : mod && k === "y" && e.ctrlKey && !e.metaKey ? "redo" : null;
      if (dir && !/^(INPUT|TEXTAREA)$/.test(el.tagName) && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (dir === "undo") undo(); else redo(); return; }
    }
    if (el === root) return; // 편집기 자체에 초점 (파일을 넣은 뒤 · 되돌린 뒤): ⌘Z 만 받아요
    if (el.classList.contains("nb-url") && e.key === "Enter") {
      e.preventDefault(); const b = blockOf(el), v = el.value.trim(); if (!v) return;
      if (b.type === "image") b.props.src = v; else if (b.type === "file") b.props.src = v; else b.props.url = v;
      changed(); render(); return;
    }
    if (el.tagName === "TD" && e.key === "Enter") { e.preventDefault(); el.blur(); return; }
    if (el.classList.contains("nb-eqsrc")) { if ((e.key === "Enter" && !e.shiftKey && !e.isComposing) || e.key === "Escape") { e.preventDefault(); el.blur(); } return; }
    if (!el.classList?.contains("nb-text")) return;
    if (menu && menuKey(e)) return;
    if (sug && sugKey(e)) return;
    if (e.isComposing || e.keyCode === 229) return;
    const b = blockOf(el); if (!b) return;
    const off = caretOffset(el), sel = getSelection(), collapsed = sel.isCollapsed;
    if (b.type === "code") {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) { e.preventDefault(); const nb = insertAfter(b.id, block("paragraph")); changed(); render({ id: nb.id }); }
      else if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertText", false, "\n"); }
      else if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "  "); }
      return;
    }
    if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); document.execCommand("insertText", false, "\n"); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const full = readText(el), before = full.slice(0, off), after = full.slice(off);
      b.text = full;
      if ((LISTY.has(b.type) || b.type === "toggle" || b.type === "quote" || b.type === "callout") && !full && !b.children?.length) {
        if (find(b.id).parent && outdent(b.id)) { changed(); return render({ id: b.id }); }
        convert(b, "paragraph"); changed(); return render({ id: b.id });
      }
      const type = LISTY.has(b.type) ? b.type : "paragraph";
      if (off === 0 && full) { // Enter at the start: push an empty block above
        const at = find(b.id); at.list.splice(at.i, 0, block(type, "", type === "todo" ? { checked: false } : {})); changed(); return render({ id: b.id, off: 0 });
      }
      b.text = before;
      const nb = block(type, after, type === "todo" ? { checked: false } : {});
      const intoKids = !after && canNest(b) && (isFoldable(b) ? opened().has(b.id) : b.children?.length > 0);
      insertAfter(b.id, nb, intoKids);
      changed(); return render({ id: nb.id, off: 0 });
    }
    if (e.key === "Backspace" && collapsed && off === 0) {
      e.preventDefault();
      b.text = readText(el);
      if (b.type !== "paragraph") { convert(b, "paragraph"); changed(); return render({ id: b.id, off: 0 }); }
      const at = find(b.id);
      if (at.parent && at.i === at.list.length - 1 && outdent(b.id)) { changed(); return render({ id: b.id, off: 0 }); }
      const vis = flat(), idx = vis.indexOf(b);
      const prev = vis.slice(0, idx).reverse().find(() => true);
      if (!prev || COLISH.has(prev.type)) return; // 단의 첫 줄 · 단 바로 뒤: 단 구조는 지우지 않아요
      if (!editable(prev) || prev.type === "code") { if (!editable(prev)) { remove(prev.id); changed(); return render({ id: b.id, off: 0 }); } return; }
      const join = prev.text.length;
      prev.text += b.text;
      if (b.children?.length) (prev.children ||= []).push(...b.children);
      remove(b.id); changed(); return render({ id: prev.id, off: join });
    }
    if (e.key === "Tab") { e.preventDefault(); b.text = readText(el); if (e.shiftKey ? outdent(b.id) : indent(b.id)) { changed(); render({ id: b.id, off }); } return; }
    if (e.key === "ArrowUp" && off === 0 || e.key === "ArrowLeft" && off === 0 && collapsed) {
      const vis = flat().filter(editable), i = vis.indexOf(b); if (i > 0) { e.preventDefault(); const p = vis[i - 1], pe = elOf(p.id); if (pe) setCaret(pe, e.key === "ArrowUp" ? Math.min(off, 1e9) : 1e9); }
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowRight" && collapsed) && off >= readText(el).length) {
      const vis = flat().filter(editable), i = vis.indexOf(b); if (i >= 0 && i < vis.length - 1) { e.preventDefault(); const nx = elOf(vis[i + 1].id); if (nx) setCaret(nx, 0); }
    }
  });
  root.addEventListener("paste", (e) => {
    if (e.target.closest?.(".db-host")) return;
    if (ro) return;
    const imgs = imageFiles(e.clipboardData?.files);
    if (imgs.length) { e.preventDefault(); addImages(imgs, e.target.closest?.(".nb")?.dataset.id); return; }
    const el = e.target.closest?.(".nb-text, td, .nb-cap"); if (!el) return;
    const text = e.clipboardData?.getData("text/plain") || "";
    e.preventDefault();
    const b = blockOf(el);
    if (el.classList.contains("nb-text") && !el.classList.contains("nb-code") && /\n/.test(text.trim())) {
      const parsed = mdToBlocks(text).blocks; if (!parsed.length) return;
      const at = find(b.id);
      if (b.type === "paragraph" && !b.text) at.list.splice(at.i, 1, ...parsed); else at.list.splice(at.i + 1, 0, ...parsed);
      changed(); return render({ id: parsed.at(-1).id, off: "end" });
    }
    document.execCommand("insertText", false, el.tagName === "TD" ? text.replace(/\n/g, " ") : text);
  });

  // markdown shortcuts typed at the start of a plain paragraph
  function shortcut(b, el) {
    const t = b.text;
    const rules = [[/^#\s/, "h1"], [/^##\s/, "h2"], [/^###\s/, "h3"], [/^[-*+]\s/, "bullet"], [/^1[.)]\s/, "number"], [/^\[ ?\]\s/, "todo"], [/^\[x\]\s/i, "todo"], [/^>\s/, "quote"], [/^▸\s|^>>\s/, "toggle"], [/^```$/, "code"], [/^---$/, "divider"]];
    for (const [re, type] of rules) {
      const m = re.exec(t); if (!m) continue;
      record(); H.typing = false; H.forceNew = true; preCaret = caretNow(); // "- " 까지 친 상태를 먼저 남기고, 바뀐 것은 따로 한 단계
      const checked = /^\[x\]/i.test(t);
      b.text = t.slice(m[0].length);
      convert(b, type);
      if (type === "todo") b.props.checked = checked;
      if (type === "divider") { const nb = insertAfter(b.id, block("paragraph")); changed(); render({ id: nb.id }); return true; }
      changed(); render({ id: b.id, off: 0 }); void el; return true;
    }
    return false;
  }

  // ---------- "/" menu ----------
  let slashAt = -1, menuItems = [], menuSel = 0, menuFor = null, menuMode = "insert";
  function slashCheck(b, el) {
    const off = caretOffset(el), before = b.text.slice(0, off);
    const m = /(^|\s)\/([\w\u3131-\u318e\uac00-\ud7a3 ]{0,20})$/.exec(before); // 한글 명령(/파일 · /사진)도
    if (!m) { if (menuMode === "insert") closeMenu(); return; }
    slashAt = off - m[2].length - 1; menuFor = b; menuMode = "insert";
    openMenu(el, m[2].toLowerCase());
  }
  function openMenu(anchor, q) {
    menuItems = MENU.filter(([t]) => !opts.hide?.includes(t) && (!t.startsWith("upload_") || opts.uploadFile)).filter(([t, label, , , alias]) => !q || label.toLowerCase().includes(q.trim()) || t.includes(q.trim()) || (alias || "").includes(q.trim()));
    if (menuMode === "turn") menuItems = menuItems.filter(([t]) => !t.startsWith("upload_"));
    if (menuMode === "turn") menuItems = menuItems.filter(([t]) => !["page", "database", "columns2", "columns3"].includes(t));
    if (!menuItems.length) return closeMenu();
    menuSel = 0;
    if (!menu) {
      menu = document.createElement("div"); menu.className = "nb-menu"; menu.setAttribute("role", "listbox"); document.body.appendChild(menu);
      menu.addEventListener("mousedown", (e) => { e.preventDefault(); const it = e.target.closest("[data-i]"); if (it) { menuSel = +it.dataset.i; pickMenu(); } });
    }
    menu.innerHTML = `<div class="nb-menu-h">${menuMode === "turn" ? "Turn into" : "Blocks"}</div>` + menuItems.map(([t, label, hint, ic], i) => `<button type="button" role="option" data-i="${i}" data-type="${t}" aria-selected="${i === menuSel}"><span class="nb-menu-ic">${esc(ic)}</span><span><b>${esc(label)}</b><small>${esc(hint)}</small></span></button>`).join("");
    const r = anchor.getBoundingClientRect(), h = Math.min(360, menuItems.length * 46 + 30);
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - 270)) + "px";
    menu.style.top = (r.bottom + h + 8 > innerHeight && r.top > h ? r.top - h - 4 : r.bottom + 4) + "px";
  }
  function closeMenu() { if (menu) { menu.remove(); menu = null; } slashAt = -1; menuMode = "insert"; }
  function menuKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); menuSel = (menuSel + 1) % menuItems.length; hiMenu(); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); menuSel = (menuSel - 1 + menuItems.length) % menuItems.length; hiMenu(); return true; }
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); pickMenu(); return true; }
    if (e.key === "Escape") { e.preventDefault(); closeMenu(); return true; }
    return false;
  }
  function hiMenu() { menu.querySelectorAll("[data-i]").forEach((x) => { const on = +x.dataset.i === menuSel; x.setAttribute("aria-selected", on); if (on) x.scrollIntoView({ block: "nearest" }); }); }
  async function pickMenu() {
    const it = menuItems[menuSel], b = menuFor; if (!it || !b) return closeMenu();
    const type = it[0], mode = menuMode;
    if (mode === "insert" && slashAt >= 0) { const el = elOf(b.id), off = el ? caretOffset(el) : b.text.length; b.text = b.text.slice(0, slashAt) + b.text.slice(Math.max(off, slashAt + 1)); }
    closeMenu();
    let target = b;
    if (mode === "insert" && b.text.trim()) target = insertAfter(b.id, block("paragraph"));
    if (type === "columns2" || type === "columns3") {
      const cols = newColumns(type === "columns2" ? 2 : 3), at = find(target.id);
      at.list.splice(at.i, 1, cols); // target 은 늘 빈 줄 (글이 있으면 위에서 새 줄을 만들었어요)
      changed(); render({ id: cols.children[0].children[0].id }); return;
    }
    if (type === "upload_image" || type === "upload_file") { // 빈 줄은 그대로 두고 파일 고르기 → 올린 블록이 그 빈 줄 자리에
      changed(); render({ id: target.id, off: "end" });
      return pickFiles(target, type === "upload_image" ? "image/*" : "");
    }
    if (type === "page" || type === "database") {
      let note = null;
      try { note = await (type === "page" ? opts.onNewPage?.("Untitled") : opts.onNewDb?.("Untitled database")); } catch {}
      if (!note) { changed(); return render({ id: b.id, off: "end" }); }
      convert(target, type); target.props = { note_id: note.id, title: note.title };
      const nb = insertAfter(target.id, block("paragraph"));
      changed(); render({ id: nb.id }); return;
    }
    convert(target, type);
    if (WIDGET.has(type)) {
      const nb = type === "divider" ? insertAfter(target.id, block("paragraph")) : null;
      changed(); render(nb ? { id: nb.id } : null);
      if (type === "image" || type === "bookmark") root.querySelector(`.nb[data-id="${target.id}"] .nb-url`)?.focus();
      if (type === "table") root.querySelector(`.nb[data-id="${target.id}"] td`)?.focus();
      if (type === "equation") root.querySelector(`.nb[data-id="${target.id}"] .nb-eq`)?.click();
      return;
    }
    changed(); render({ id: target.id, off: "end" });
  }
  // ⋮⋮ click: delete · duplicate · turn into
  function openBlockMenu(b, anchor) {
    closeMenu();
    const m = document.createElement("div"); m.className = "nb-menu nb-bmenu"; document.body.appendChild(m); menu = m;
    m.innerHTML = `${COLISH.has(b.type) ? "" : `<button type="button" data-a="turn"><span class="nb-menu-ic">↻</span><span><b>Turn into</b></span></button>`}<button type="button" data-a="dup"><span class="nb-menu-ic">⧉</span><span><b>Duplicate</b></span></button><button type="button" data-a="del"><span class="nb-menu-ic">🗑</span><span><b>Delete</b></span></button>${editable(b) && b.type !== "code" ? `<div class="nb-menu-h">Color</div>${swatches()}` : ""}`;
    if (SIZED.has(b.type)) m.insertAdjacentHTML("beforeend", `<div class="nb-sizes" role="group" aria-label="글씨 크기">${FS.map(([k, t]) => `<button type="button" data-bsize="${k}" aria-pressed="${(b.props.size || "m") === k}">${t}</button>`).join("")}</div>`);
    const r = anchor.getBoundingClientRect(); m.style.left = Math.max(8, r.left) + "px"; m.style.top = r.bottom + 4 + "px";
    m.addEventListener("mousedown", (e) => {
      e.preventDefault(); const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
      if (a === "del") { closeMenu(); remove(b.id); changed(); render(); }
      if (a === "dup") { closeMenu(); const copy = JSON.parse(JSON.stringify(b)); const re = (x) => { x.id = block("paragraph").id; x.children?.forEach(re); }; re(copy); insertAfter(b.id, copy); changed(); render(); }
      if (a === "turn") { closeMenu(); menuFor = b; menuMode = "turn"; openMenu(anchor, ""); }
    });
    m.addEventListener("mousedown", (e) => {
      const bs = e.target.closest("[data-bsize]");
      if (bs) { if (bs.dataset.bsize === "m") delete b.props.size; else b.props.size = bs.dataset.bsize; closeMenu(); changed(); render(); return; }
      const sw = e.target.closest("[data-col]"); if (!sw) return;
      const c = sw.dataset.col, kind = sw.dataset.kind;
      if (c === "default") delete b.props.color; else b.props.color = kind === "bg" ? c + "_background" : c;
      closeMenu(); changed(); render();
    });
    setTimeout(() => addEventListener("mousedown", function off(ev) { if (!menu?.contains(ev.target)) { closeMenu(); removeEventListener("mousedown", off); } }), 0);
  }

  // ---------- selection toolbar: Bold / Italic / Code / Link / Color (wraps raw markdown, no syntax typing needed) ----------
  let tb = null, tbSel = null;
  function selRange(el) {
    const s = getSelection(); if (!s.rangeCount || s.isCollapsed) return null;
    const r = s.getRangeAt(0); if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    const a = document.createRange(); a.selectNodeContents(el); a.setEnd(r.startContainer, r.startOffset);
    const start = a.toString().length; return { start, end: start + r.toString().length };
  }
  function closeTb() { if (tb) { tb.remove(); tb = null; } tbSel = null; }
  const onSel = () => {
    if (ro) return;
    const s = getSelection(), n = s.anchorNode, el = (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.(".nb-text");
    if (!el || !root.contains(el) || el.classList.contains("nb-code") || el.dataset.raw !== "1" || s.isCollapsed) { if (!tb?.matches(":hover")) closeTb(); return; }
    const r = selRange(el); if (!r || r.end <= r.start) return closeTb();
    tbSel = { id: blockOf(el).id, ...r };
    if (!tb) {
      tb = document.createElement("div"); tb.className = "nb-tb"; document.body.appendChild(tb);
      tb.innerHTML = `<button type="button" data-f="b" title="Bold"><b>B</b></button><button type="button" data-f="i" title="Italic"><i>i</i></button><button type="button" data-f="s" title="Strike"><s>S</s></button><button type="button" data-f="code" title="Code">&lt;/&gt;</button><button type="button" data-f="link" title="Link">🔗</button><button type="button" data-f="color" title="Color">A▾</button>`;
      tb.insertAdjacentHTML("beforeend", `<span class="nb-tb-sep"></span>${FS.map(([k, t]) => `<button type="button" data-fs="${k}" title="글씨 크기: ${t}">${t}</button>`).join("")}`);
      tb.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const sw = e.target.closest("[data-col]");
        if (sw) return wrapSel(sw.dataset.col === "default" ? null : sw.dataset.kind === "bg" ? [`<mark class="bg-${sw.dataset.col}">`, "</mark>"] : [`<span class="c-${sw.dataset.col}">`, "</span>"]);
        const fs = e.target.closest("[data-fs]")?.dataset.fs;
        if (fs) return sizeSel(fs);
        const f = e.target.closest("[data-f]")?.dataset.f; if (!f) return;
        if (f === "color") { const open = tb.querySelector(".nb-sw"); if (open) open.remove(); else tb.insertAdjacentHTML("beforeend", swatches()); return; }
        if (f === "link") { const u = prompt("Link URL", "https://"); if (u && u.trim()) wrapSel(["[", "](" + u.trim() + ")"]); return; }
        wrapSel({ b: ["**", "**"], i: ["*", "*"], s: ["~~", "~~"], code: ["`", "`"] }[f]);
      });
    }
    const rect = s.getRangeAt(0).getBoundingClientRect();
    tb.style.left = Math.max(8, Math.min(rect.left, innerWidth - 240)) + "px";
    tb.style.top = Math.max(8, rect.top - 42) + "px";
  };
  function wrapSel(pair) {
    if (!tbSel) return;
    const at = find(tbSel.id); if (!at) return closeTb();
    const b = at.b, t = b.text; let mid = t.slice(tbSel.start, tbSel.end);
    if (!pair) mid = mid.replace(/<\/?(span|mark)[^>]*>/g, ""); // Default color: strip color tags
    const out = pair ? pair[0] + mid + pair[1] : mid;
    b.text = t.slice(0, tbSel.start) + out + t.slice(tbSel.end);
    const end = tbSel.start + out.length;
    closeTb(); changed(); render({ id: b.id, off: end });
  }
  // 글자 크기: <span class="fs-l">…</span> 로 감싸요 (보통 = 크기 표시만 지우기)
  function sizeSel(k) {
    if (!tbSel) return;
    const at = find(tbSel.id); if (!at) return closeTb();
    const b = at.b, t = b.text;
    let mid = t.slice(tbSel.start, tbSel.end);
    for (let i = 0; i < 5; i++) mid = mid.replace(/<span class="fs-(?:s|l|xl)">([\s\S]*?)<\/span>/g, "$1");
    const out = k === "m" ? mid : `<span class="fs-${k}">${mid}</span>`;
    b.text = t.slice(0, tbSel.start) + out + t.slice(tbSel.end);
    const end = tbSel.start + out.length;
    closeTb(); changed(); render({ id: b.id, off: end });
  }
  document.addEventListener("selectionchange", onSel);

  // ---------- 사진 · 파일 올리기: 붙여 넣기 · 끌어다 놓기 · '/사진' '/파일' · '이미지 올리기' 버튼 ----------
  // opts.uploadFile(file, { onProgress, signal }) → { src, name, size, mime, image } 가 있으면 무슨 파일이든 (노트),
  // 없으면 opts.uploadImage(file) → src 로 사진만 (일기). 올리는 동안의 줄(진행 · 취소)은 문서 밖이라 되돌리기 기록에 안 들어가요.
  // 다 올라간 블록 하나 = 되돌리기 한 단계 (⌘Z 로 빠져요. 파일은 서버에 남아서 ⌘⇧Z 로 다시 살아나요)
  function imageFiles(list) {
    const all = [...(list || [])];
    if (opts.uploadFile) return all;
    return opts.uploadImage ? all.filter((f) => /^image\//.test(f.type)) : [];
  }
  const MAX_UP = opts.maxFileSize || 0;
  function upRow(f) {
    const row = document.createElement("div"); row.className = "nb-up"; row.setAttribute("role", "status");
    row.innerHTML = `<span class="nb-up-name">${esc(f.name || "file")}</span><span class="nb-up-bar"><i></i></span><span class="nb-up-pc">0%</span><button type="button" class="btn sm nb-up-x">취소</button>`;
    root.appendChild(row); return row;
  }
  async function addImages(files, afterId, into = null) {
    let prev = afterId;
    for (const f of files) {
      if (MAX_UP && f.size > MAX_UP) { opts.onError?.(new Error(`'${f.name}' 은(는) 너무 커요 (한 개에 ${Math.round(MAX_UP / 1048576)}MB 까지).`)); continue; }
      let nb;
      if (opts.uploadFile) {
        const ac = new AbortController(), row = upRow(f), bar = row.querySelector("i"), pc = row.querySelector(".nb-up-pc");
        row.querySelector("button").onclick = () => ac.abort();
        try {
          const r = await opts.uploadFile(f, { signal: ac.signal, onProgress: (x) => { bar.style.width = Math.round(x * 100) + "%"; pc.textContent = Math.round(x * 100) + "%"; } });
          nb = r.image ? block("image", "", { src: r.src, caption: "" }) : block("file", "", { src: r.src, name: r.name, bytes: r.size, mime: r.mime });
        } catch (err) { if (err?.name !== "AbortError") opts.onError?.(err); continue; }
        finally { row.remove(); }
      } else {
        let src;
        try { src = await opts.uploadImage(f); } catch (err) { opts.onError?.(err); continue; }
        nb = block("image", "", { src, caption: "" });
      }
      const ph = into && find(into.id) ? into : null; into = null;
      if (ph && (ph.type === "image" && !ph.props.src || ph.type === "paragraph" && !ph.text)) { const at = find(ph.id); at.list.splice(at.i, 1, nb); }
      else if (prev && find(prev)) insertAfter(prev, nb); else doc.blocks.push(nb);
      H.typing = false; H.forceNew = true;
      prev = nb.id; changed(); render(); holdFocus();
    }
  }
  function pickFiles(b, accept = "") {
    const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; if (accept) inp.accept = accept;
    inp.onchange = () => addImages(imageFiles(inp.files), b.id, b);
    inp.click();
  }
  const pickImages = (b) => pickFiles(b, "image/*");
  // 이미지 크기: 오른쪽 아래 손잡이를 끌면 줄 너비의 % 로
  root.addEventListener("pointerdown", (e) => {
    const h = e.target.closest?.(".nb-resize"); if (!h || ro) return;
    e.preventDefault();
    const box = h.parentElement, full = box.parentElement.getBoundingClientRect().width, x0 = e.clientX, w0 = box.getBoundingClientRect().width, b = blockOf(h);
    const move = (ev) => { box.style.width = Math.max(10, Math.min(100, ((w0 + ev.clientX - x0) / full) * 100)) + "%"; };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      const w = Math.round(parseFloat(box.style.width));
      if (w >= 98) delete b.props.width; else b.props.width = w;
      changed();
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });

  // ---------- [[ autocomplete ----------
  // "[[" → page titles · "@" → pages, dates and reminders (mention menu)
  let sugOpts = [], sugSel = 0, sugAt = -1, sugFor = null, sugMode = "link";
  const kst = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  function linkCheck(b, el) {
    const off = caretOffset(el), before = b.text.slice(0, off), open = before.lastIndexOf("[[");
    const at = /(^|\s)@([^\s@\[\]]{0,30})$/.exec(before);
    if (open >= 0 && !before.slice(open).includes("]]") && !before.slice(open).includes("\n")) {
      sugMode = "link"; sugAt = open + 2;
      const q = before.slice(sugAt).toLowerCase();
      sugOpts = (opts.notes?.() || []).filter((t) => t.toLowerCase().includes(q)).slice(0, 8).map((t) => ({ t }));
      if (q && !sugOpts.some((o) => o.t.toLowerCase() === q)) sugOpts.push({ t: before.slice(sugAt), fresh: true });
    } else if (at) {
      sugMode = "at"; sugAt = off - at[2].length - 1;
      const q = at[2].toLowerCase();
      const dates = [["Today", kst(0)], ["Tomorrow", kst(1)], ["Next week", kst(7)]].map(([l, d]) => ({ label: `📅 ${l} · ${d}`, ins: "@" + d, key: l.toLowerCase() }));
      const rem = [["Remind me tomorrow 9:00", kst(1) + " 09:00"], ["Remind me today 18:00", kst(0) + " 18:00"]].map(([l, d]) => ({ label: `⏰ ${l}`, ins: "⏰ " + d, key: "remind " + l.toLowerCase() }));
      if (/^\d{4}-\d{2}-\d{2}$/.test(q)) dates.unshift({ label: "📅 " + q, ins: "@" + q, key: q }, { label: `⏰ Remind ${q} 9:00`, ins: `⏰ ${q} 09:00`, key: q });
      const pages = (opts.notes?.() || []).filter((t) => t.toLowerCase().includes(q)).slice(0, 6).map((t) => ({ label: "📄 " + t, ins: `[[${t}]]`, key: t.toLowerCase() }));
      const raw = at[2]; if (raw && !pages.some((x) => x.key === q)) pages.push({ label: "📄 Link to " + raw, ins: `[[${raw}]]`, key: q });
      sugOpts = [...pages, ...dates.filter((x) => !q || x.key.includes(q)), ...rem.filter((x) => !q || x.key.includes(q))].slice(0, 10);
    } else return closeSug();
    sugFor = b;
    if (!sugOpts.length) return closeSug();
    sugSel = 0;
    if (!sug) { sug = document.createElement("div"); sug.className = "suggest"; sug.setAttribute("role", "listbox"); document.body.appendChild(sug); sug.addEventListener("mousedown", (e) => { e.preventDefault(); const x = e.target.closest("[data-i]"); if (x) { sugSel = +x.dataset.i; pickSug(); } }); }
    const r = el.getBoundingClientRect(); sug.style.left = Math.min(r.left, innerWidth - 260) + "px"; sug.style.top = r.bottom + 4 + "px";
    drawSug();
  }
  function drawSug() { sug.innerHTML = sugOpts.map((o, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === sugSel}">${o.label ? esc(o.label) : (o.fresh ? "+ New page: " : "") + esc(o.t)}</button>`).join(""); }
  function closeSug() { if (sug) { sug.remove(); sug = null; } sugAt = -1; }
  function sugKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); sugSel = (sugSel + 1) % sugOpts.length; drawSug(); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); sugSel = (sugSel - 1 + sugOpts.length) % sugOpts.length; drawSug(); return true; }
    if ((e.key === "Enter" || e.key === "Tab") && !e.isComposing) { e.preventDefault(); pickSug(); return true; }
    if (e.key === "Escape") { e.preventDefault(); closeSug(); return true; }
    return false;
  }
  function pickSug() {
    const o = sugOpts[sugSel], b = sugFor; if (!o || !b) return closeSug();
    const el = elOf(b.id), off = el ? caretOffset(el) : b.text.length;
    let ins, after;
    if (sugMode === "at") { ins = o.ins + " "; after = b.text.slice(off); b.text = b.text.slice(0, sugAt) + ins + after; }
    else { after = b.text.slice(off).replace(/^[^\]\n]*\]\]/, ""); ins = o.t + "]]"; b.text = b.text.slice(0, sugAt) + ins + after; }
    const c = sugAt + ins.length;
    closeSug(); changed(); render({ id: b.id, off: c });
  }

  // ---------- drag to reorder ----------
  let marker = null;
  root.addEventListener("dragstart", (e) => {
    const h = e.target.closest?.(".nb-handle"); if (!h) return;
    const w = h.closest(".nb"); dragId = w.dataset.id;
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId);
    try { e.dataTransfer.setDragImage(w, 10, 10); } catch {}
    w.classList.add("dragging");
  });
  function showMarker(x, y, w) {
    if (!w || !root.contains(w) || w.dataset.id === dragId || w.closest(`.nb[data-id="${dragId}"]`)) return false;
    const row = w.querySelector(":scope > .nb-row"), r = row.getBoundingClientRect(), before = y < r.top + r.height / 2;
    if (!marker) { marker = document.createElement("div"); marker.className = "nb-drop"; }
    marker.dataset.target = w.dataset.id; marker.dataset.before = before ? "1" : "";
    const hr = root.getBoundingClientRect();
    // 토글 안으로: 제목 줄 아래쪽 반이나 그 아래(빈 토글 안내 · 펼친 자식 칸) — 예전엔 제목 줄만 재서 "뒤에 놓기"나 단 나누기가 됐어요
    const fold = isFoldable(find(w.dataset.id)?.b || {}), inRow = y >= r.top && y <= r.bottom;
    marker.dataset.inside = fold && !before && (!inRow || x > r.left + 40) ? "1" : "";
    // 블록 왼쪽 · 오른쪽 끝에 놓으면 단 나누기 (단 안이면 그 옆에 새 단, 3단까지) — 제목 줄 위에서만
    const edge = Math.min(48, r.width * 0.15), side = !inRow || marker.dataset.inside ? "" : x < r.left + edge ? "left" : x > r.right - edge ? "right" : "";
    marker.dataset.side = side && sideOk(w.dataset.id) ? side : "";
    marker.classList.toggle("side", !!marker.dataset.side);
    if (marker.dataset.inside) Object.assign(marker.style, { top: r.bottom - hr.top - 1 + "px", left: r.left + 28 - hr.left + "px", width: Math.max(40, r.width - 28) + "px", height: "" });
    else if (marker.dataset.side) Object.assign(marker.style, { top: r.top - hr.top + "px", left: (side === "left" ? r.left : r.right) - hr.left - 1 + "px", width: "3px", height: r.height + "px" });
    else Object.assign(marker.style, { top: (before ? r.top : r.bottom) - hr.top - 1 + "px", left: r.left - hr.left + "px", width: r.width + "px", height: "" });
    if (!marker.isConnected) root.appendChild(marker);
    return true;
  }
  // 단 안으로 옮길 때 규칙: 단 나누기를 단 안에 넣지 않기 · 단 블록 자체 옆에는 안 붙이기
  function sideOk(tid) {
    const src = find(dragId), dst = find(tid); if (!src || !dst || dst.b.type === "columns" || src.b.type === "columns") return false;
    if (dst.parent?.type !== "column") return true;
    const cols = find(dst.parent.id).parent; // 3단이면, 옮기는 블록이 같은 단 묶음에서 혼자 있던 단을 비울 때만 (그 단은 tidy 가 지워요)
    return src.b.type !== "columns" && (cols.children.length < MAX_COLS || (cols.children.includes(src.parent) && src.parent.children.length === 1));
  }
  function dropAtMarker() {
    if (!dragId || !marker?.dataset.target) return endDrag();
    const tid = marker.dataset.target, before = marker.dataset.before === "1", side = marker.dataset.side, inside = marker.dataset.inside === "1";
    const src = find(dragId);
    if (src && tid !== dragId && !(src.b.type === "columns" && find(tid)?.parent?.type === "column")) {
      src.list.splice(src.i, 1);
      const dst = find(tid);
      if (inside) { dst.b.children = [src.b, ...(dst.b.children || [])]; setOpen(dst.b.id, true); }
      else if (side && dst.parent?.type === "column") { // 이미 단 안: 그 단 옆에 새 단
        const col = find(dst.parent.id);
        col.list.splice(side === "left" ? col.i : col.i + 1, 0, block("column", "", {}, [src.b]));
      } else if (side) dst.list.splice(dst.i, 1, newColumns(2, side === "left" ? [src.b, dst.b] : [dst.b, src.b]));
      else dst.list.splice(before ? dst.i : dst.i + 1, 0, src.b);
      changed();
    }
    // 다시 그리기는 dragend 뒤에: drop 안에서 끌던 손잡이를 지우면 dragend 가 떨어진 노드에서 나서 정리가 안 되고 끌기 그림이 남아요
    endDrag(); setTimeout(() => render());
  }
  root.addEventListener("dragover", (e) => {
    if (!dragId) { if (!ro && (opts.uploadImage || opts.uploadFile) && e.dataTransfer?.types?.includes("Files")) e.preventDefault(); return; }
    if (showMarker(e.clientX, e.clientY, e.target.closest?.(".nb"))) e.preventDefault();
  });
  root.addEventListener("drop", (e) => {
    if (!dragId) { const imgs = ro ? [] : imageFiles(e.dataTransfer?.files); if (imgs.length) { e.preventDefault(); addImages(imgs, e.target.closest?.(".nb")?.dataset.id); } return; }
    if (!marker?.dataset.target) return; e.preventDefault(); dropAtMarker(); });
  if (!ro) touchDrag(root, ".nb-handle", {
    over: (x, y, h) => { dragId = h.closest(".nb").dataset.id; showMarker(x, y, document.elementFromPoint(x, y)?.closest?.(".nb")); },
    drop: (x, y, h) => { dragId = h.closest(".nb").dataset.id; dropAtMarker(); },
    end: () => { if (dragId) endDrag(); },
  });
  const endDrag = () => { dragId = null; marker?.remove(); marker = null; root.querySelectorAll(".dragging").forEach((x) => x.classList.remove("dragging")); };
  const docDragEnd = () => { if (dragId) endDrag(); };
  document.addEventListener("dragend", docDragEnd); // 손잡이가 다시 그려져 떨어져 있어도 정리
  root.addEventListener("dragend", endDrag);

  // ---------- 상자 선택 (Notion 처럼: 글 바깥 여백에서 끌면 파란 네모, 닿은 블록을 골라요) ----------
  // 고른 뒤: Delete · Backspace 로 지우기 (⌘Z 로 되살리기 — 문서 기록에 남아요) · Esc 로 풀기
  let picked = [], boxSt = null;
  const clearPick = () => { picked = []; root.querySelectorAll(".nb-picked").forEach((x) => x.classList.remove("nb-picked")); };
  const NOBOX = ".nb-text, td, input, textarea, button, select, a, .nb-handle, .db-host, .nb-menu, [contenteditable]";
  // 편집기 안 빈 곳, 또는 편집기 옆 여백(좌우 160px 안, 편집기 높이 안)에서 시작해요
  const onBoxDown = (e) => {
    if (!root.isConnected || !root.offsetParent) return;
    const r = root.getBoundingClientRect();
    const near = e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left - 160 && e.clientX <= r.right + 160;
    if (!root.contains(e.target) && (!near || e.target.closest?.("button, a, input, textarea, select, [contenteditable], .nb-menu, nav, header"))) return;
    if (ro || e.button !== 0 || e.target.closest?.(NOBOX)) { if (!e.target.closest?.(".nb-handle")) clearPick(); return; } // 글 안에서는 늘 하던 대로 글자 고르기
    clearPick(); e.preventDefault(); if (root.contains(document.activeElement)) document.activeElement.blur(); holdFocus(); // 글 칸 초점을 빼야 Delete 가 글자가 아니라 블록을 지워요
    boxSt = { x: e.clientX, y: e.clientY, el: null };
  };
  document.addEventListener("mousedown", onBoxDown);
  const onBoxMove = (e) => {
    if (!boxSt) return;
    const x1 = Math.min(boxSt.x, e.clientX), y1 = Math.min(boxSt.y, e.clientY), x2 = Math.max(boxSt.x, e.clientX), y2 = Math.max(boxSt.y, e.clientY);
    if (!boxSt.el && x2 - x1 + y2 - y1 < 6) return; // 그냥 누른 것
    if (!boxSt.el) { boxSt.el = document.createElement("div"); boxSt.el.className = "nb-box"; document.body.appendChild(boxSt.el); }
    Object.assign(boxSt.el.style, { left: x1 + "px", top: y1 + "px", width: x2 - x1 + "px", height: y2 - y1 + "px" });
    clearPick();
    for (const w of root.querySelectorAll(".nb")) {
      if (w.parentElement.closest(".nb-picked")) continue; // 부모를 고르면 자식은 따라와요
      const r = w.querySelector(":scope > .nb-row").getBoundingClientRect();
      if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) { w.classList.add("nb-picked"); picked.push(w.dataset.id); }
    }
  };
  const onBoxUp = () => { if (!boxSt) return; boxSt.el?.remove(); boxSt = null; };
  const onPickKey = (e) => {
    if (!picked.length) return;
    if (e.key === "Escape") { e.preventDefault(); clearPick(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !e.target.isContentEditable) {
      e.preventDefault();
      for (const id of picked) { const at = find(id); if (at) at.list.splice(at.i, 1); }
      clearPick(); changed(); render(); holdFocus();
    }
  };
  document.addEventListener("mousemove", onBoxMove); document.addEventListener("mouseup", onBoxUp); document.addEventListener("keydown", onPickKey);

  render();
  record();
  return {
    undo: () => (ro ? false : undo()),
    redo: () => (ro ? false : redo()),
    canUndo: () => H.past.length > 0,
    historySize: () => H.past.length + H.future.length,
    getDoc: () => doc,
    setDoc: (d) => { doc = d; if (!doc.blocks.length) doc.blocks.push(block("paragraph")); render(); H.typing = false; record(); },
    focus: (where) => { const vis = flat().filter(editable); const b = where === "end" ? vis.at(-1) : vis[0]; if (b) render({ id: b.id, off: where === "end" ? "end" : 0 }); },
    destroy: () => { closeMenu(); closeSug(); closeTb(); document.removeEventListener("selectionchange", onSel); document.removeEventListener("dragend", docDragEnd); document.removeEventListener("mousemove", onBoxMove); document.removeEventListener("mouseup", onBoxUp); document.removeEventListener("keydown", onPickKey); document.removeEventListener("mousedown", onBoxDown); host.innerHTML = ""; },
  };
}

// Notion-style block editor over { v: 1, blocks } (docs/blocks-schema.md).
// One contenteditable per text block: raw inline markdown while focused, rendered when not.
// Enter / Backspace / Tab / Shift-Tab, "/" menu, ⋮⋮ drag handle, markdown shortcuts, [[ autocomplete, toggles that remember open state.
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
  ["bookmark", "Bookmark", "Link with a caption", "🔗"],
  ["equation", "Equation", "Block math", "∑"],
  ["columns2", "2 columns", "Side-by-side blocks", "▥"],
  ["columns3", "3 columns", "Three columns", "▥"],
  ["page", "Page", "Sub-page inside this page", "📄"],
  ["database", "Database", "Table and board views", "▤"],
];
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
  host.innerHTML = ""; host.appendChild(root);
  let menu = null, sug = null, dragId = null;
  const changed = () => { tidy(); opts.onChange?.(doc); };
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
        else f.innerHTML = ro ? "" : `${opts.uploadImage ? `<button type="button" class="btn sm nb-pick">이미지 올리기</button>` : ""}<input class="input nb-url" placeholder="${opts.uploadImage ? "또는 이미지 주소를 붙여 넣고 Enter" : "Paste an image URL and press Enter"}" aria-label="Image URL">`;
        return f;
      }
      case "bookmark": case "embed": case "file": {
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
    if (b.type === "paragraph" && !el.classList.contains("nb-code") && shortcut(b, el)) return;
    // 한글 조합 중(compositionstart~end)에는 바꾸지 않고, 조합이 끝나면 compositionend 에서 그려요
    if (!e.isComposing && !composing && !el.classList.contains("nb-code") && !el.classList.contains("nb-comment")) paintLive(el, b.text, caretOffset(el));
    changed();
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
  root.addEventListener("keydown", (e) => {
    if (e.target.closest?.(".db-host")) return;
    if (ro) return;
    const el = e.target;
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
    const m = /(^|\s)\/([\w ]{0,20})$/.exec(before);
    if (!m) { if (menuMode === "insert") closeMenu(); return; }
    slashAt = off - m[2].length - 1; menuFor = b; menuMode = "insert";
    openMenu(el, m[2].toLowerCase());
  }
  function openMenu(anchor, q) {
    menuItems = MENU.filter(([t]) => !opts.hide?.includes(t)).filter(([t, label]) => !q || label.toLowerCase().includes(q.trim()) || t.includes(q.trim()));
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

  // ---------- 이미지 올리기 (opts.uploadImage(file) → src): 붙여 넣기 · 끌어다 놓기 · '이미지 올리기' 버튼 ----------
  function imageFiles(list) { return opts.uploadImage ? [...(list || [])].filter((f) => /^image\//.test(f.type)) : []; }
  async function addImages(files, afterId, into = null) {
    let prev = afterId;
    for (const f of files) {
      let src;
      try { src = await opts.uploadImage(f); } catch (err) { opts.onError?.(err); continue; }
      if (into) { into.props.src = src; prev = into.id; into = null; changed(); render(); continue; }
      const nb = block("image", "", { src, caption: "" });
      if (prev && find(prev)) insertAfter(prev, nb); else doc.blocks.push(nb);
      prev = nb.id; changed(); render();
    }
  }
  function pickImages(b) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
    inp.onchange = () => addImages(imageFiles(inp.files), b.id, b);
    inp.click();
  }
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
    // 블록 왼쪽 · 오른쪽 끝에 놓으면 단 나누기 (단 안이면 그 옆에 새 단, 3단까지)
    const edge = Math.min(48, r.width * 0.15), side = x < r.left + edge ? "left" : x > r.right - edge ? "right" : "";
    marker.dataset.side = side && sideOk(w.dataset.id) ? side : "";
    marker.classList.toggle("side", !!marker.dataset.side);
    if (marker.dataset.side) Object.assign(marker.style, { top: r.top - hr.top + "px", left: (side === "left" ? r.left : r.right) - hr.left - 1 + "px", width: "3px", height: r.height + "px" });
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
    const tid = marker.dataset.target, before = marker.dataset.before === "1", side = marker.dataset.side;
    const src = find(dragId);
    if (src && tid !== dragId && !(src.b.type === "columns" && find(tid)?.parent?.type === "column")) {
      src.list.splice(src.i, 1);
      const dst = find(tid);
      if (side && dst.parent?.type === "column") { // 이미 단 안: 그 단 옆에 새 단
        const col = find(dst.parent.id);
        col.list.splice(side === "left" ? col.i : col.i + 1, 0, block("column", "", {}, [src.b]));
      } else if (side) dst.list.splice(dst.i, 1, newColumns(2, side === "left" ? [src.b, dst.b] : [dst.b, src.b]));
      else dst.list.splice(before ? dst.i : dst.i + 1, 0, src.b);
      changed();
    }
    endDrag(); render();
  }
  root.addEventListener("dragover", (e) => {
    if (!dragId) { if (!ro && opts.uploadImage && e.dataTransfer?.types?.includes("Files")) e.preventDefault(); return; }
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
  root.addEventListener("dragend", endDrag);

  render();
  return {
    getDoc: () => doc,
    setDoc: (d) => { doc = d; if (!doc.blocks.length) doc.blocks.push(block("paragraph")); render(); },
    focus: (where) => { const vis = flat().filter(editable); const b = where === "end" ? vis.at(-1) : vis[0]; if (b) render({ id: b.id, off: where === "end" ? "end" : 0 }); },
    destroy: () => { closeMenu(); closeSug(); closeTb(); document.removeEventListener("selectionchange", onSel); host.innerHTML = ""; },
  };
}

// Notion-style block editor over { v: 1, blocks } (docs/blocks-schema.md).
// One contenteditable per text block: raw inline markdown while focused, rendered when not.
// Enter / Backspace / Tab / Shift-Tab, "/" menu, ⋮⋮ drag handle, markdown shortcuts, [[ autocomplete, toggles that remember open state.
import { renderInline } from "../md.js";
import { esc } from "../util.js";
import { block, canNest, mdToBlocks } from "./md.js";
import { touchDrag } from "./touchdrag.js";

const LISTY = new Set(["bullet", "number", "todo"]);
const WIDGET = new Set(["divider", "image", "table", "page", "database", "file", "bookmark", "embed", "equation"]);
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
  let left = Math.max(0, off), node = null;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; if (left <= n.length) { node = n; break; } left -= n.length; }
  if (node) r.setStart(node, left); else { r.selectNodeContents(el); r.collapse(false); }
  r.collapse(true); s.removeAllRanges(); s.addRange(r);
}
const readText = (el) => { let t = el.innerText.replace(/​/g, ""); if (t.endsWith("\n") && !el.textContent.endsWith("\n")) t = t.slice(0, -1); return t; };

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
  const changed = () => opts.onChange?.(doc);

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
    wrap.className = "nb nb-" + b.type + (b.props?.toggle ? " nb-fold" : "") + (col ? (col.endsWith("_background") ? " nb-bg-" + col.slice(0, -11) : " nb-color-" + col) : "");
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
    else if (fold) mark = `<button type="button" class="nb-mk nb-tg" aria-expanded="${open}" aria-label="Toggle">▸</button>`;
    else if (b.type === "callout") mark = `<button type="button" class="nb-mk nb-icon" ${ro ? "disabled" : ""} aria-label="Icon">${esc(b.props.icon || "💡")}</button>`;
    if (mark) row.insertAdjacentHTML("beforeend", mark);
    if (b.type === "todo" && b.props.checked) wrap.classList.add("done");
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
  function show(el, b) { el.innerHTML = b.text ? (el.classList.contains("nb-comment") ? esc(b.text) : renderInline(b.text)) : ""; }
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
        if (p.src) f.innerHTML = `<img src="${esc(p.src)}" alt="${esc(p.caption || "")}" loading="lazy"><figcaption ${ro ? "" : 'contenteditable="true"'} class="nb-cap" data-ph="Add a caption">${esc(p.caption || "")}</figcaption>`;
        else f.innerHTML = ro ? "" : `<input class="input nb-url" placeholder="Paste an image URL and press Enter" aria-label="Image URL">`;
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
        const d = document.createElement("div"); d.className = "nb-body nb-eq"; d.textContent = p.expr || (ro ? "" : "Click to add an equation"); d.tabIndex = 0; return d;
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
    if (!canNest(prev)) return false;
    at.list.splice(at.i, 1);
    (prev.children ||= []).push(at.b);
    if (isFoldable(prev)) setOpen(prev.id, true);
    return true;
  }
  function outdent(id) {
    const at = find(id); if (!at || !at.parent) return false;
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
      if (b && el.dataset.raw !== "1") { el.dataset.raw = "1"; if (el.childElementCount || el.textContent !== b.text) { el.textContent = b.text; setCaret(el, b.text.length); } }
    }
    if (el.tagName === "TD" && !ro) { const b = blockOf(el); el.textContent = b.props.rows[+el.dataset.r]?.[+el.dataset.c] || ""; }
  });
  root.addEventListener("focusout", (e) => {
    if (e.target.closest?.(".db-host")) return;
    const el = e.target;
    if (el.classList?.contains("nb-text") && !el.classList.contains("nb-code")) { const b = blockOf(el); delete el.dataset.raw; if (b) show(el, b); setTimeout(closeSug, 120); }
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
    if (eq) { const b = blockOf(eq); const v = prompt("Equation (LaTeX)", b.props.expr || ""); if (v !== null) { b.props.expr = v; changed(); render(); } return; }
    const hd = e.target.closest(".nb-handle");
    if (hd) { openBlockMenu(blockOf(hd), hd); return; }
    // clicking empty space below the last block → focus/add a paragraph
    if (e.target === root) {
      const last = doc.blocks.at(-1);
      if (last.type === "paragraph" && !last.text) render({ id: last.id });
      else { const nb = block("paragraph"); doc.blocks.push(nb); changed(); render({ id: nb.id }); }
    }
  });
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
    if (!el.classList.contains("nb-text")) return;
    b.text = readText(el);
    if (b.type === "paragraph" && !el.classList.contains("nb-code") && shortcut(b, el)) return;
    changed();
    slashCheck(b, el);
    linkCheck(b, el);
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
      if (!prev) return;
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
    menuItems = MENU.filter(([t, label]) => !q || label.toLowerCase().includes(q.trim()) || t.includes(q.trim()));
    if (menuMode === "turn") menuItems = menuItems.filter(([t]) => !["page", "database"].includes(t));
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
    m.innerHTML = `<button type="button" data-a="turn"><span class="nb-menu-ic">↻</span><span><b>Turn into</b></span></button><button type="button" data-a="dup"><span class="nb-menu-ic">⧉</span><span><b>Duplicate</b></span></button><button type="button" data-a="del"><span class="nb-menu-ic">🗑</span><span><b>Delete</b></span></button>${editable(b) && b.type !== "code" ? `<div class="nb-menu-h">Color</div>${swatches()}` : ""}`;
    const r = anchor.getBoundingClientRect(); m.style.left = Math.max(8, r.left) + "px"; m.style.top = r.bottom + 4 + "px";
    m.addEventListener("mousedown", (e) => {
      e.preventDefault(); const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
      if (a === "del") { closeMenu(); remove(b.id); changed(); render(); }
      if (a === "dup") { closeMenu(); const copy = JSON.parse(JSON.stringify(b)); const re = (x) => { x.id = block("paragraph").id; x.children?.forEach(re); }; re(copy); insertAfter(b.id, copy); changed(); render(); }
      if (a === "turn") { closeMenu(); menuFor = b; menuMode = "turn"; openMenu(anchor, ""); }
    });
    m.addEventListener("mousedown", (e) => {
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
      tb.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const sw = e.target.closest("[data-col]");
        if (sw) return wrapSel(sw.dataset.col === "default" ? null : sw.dataset.kind === "bg" ? [`<mark class="bg-${sw.dataset.col}">`, "</mark>"] : [`<span class="c-${sw.dataset.col}">`, "</span>"]);
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
  document.addEventListener("selectionchange", onSel);

  // ---------- [[ autocomplete ----------
  let sugOpts = [], sugSel = 0, sugAt = -1, sugFor = null;
  function linkCheck(b, el) {
    const off = caretOffset(el), before = b.text.slice(0, off), open = before.lastIndexOf("[[");
    if (open < 0 || before.slice(open).includes("]]") || before.slice(open).includes("\n")) return closeSug();
    sugAt = open + 2; sugFor = b;
    const q = before.slice(sugAt).toLowerCase();
    sugOpts = (opts.notes?.() || []).filter((t) => t.toLowerCase().includes(q)).slice(0, 8).map((t) => ({ t }));
    if (q && !sugOpts.some((o) => o.t.toLowerCase() === q)) sugOpts.push({ t: before.slice(sugAt), fresh: true });
    if (!sugOpts.length) return closeSug();
    sugSel = 0;
    if (!sug) { sug = document.createElement("div"); sug.className = "suggest"; sug.setAttribute("role", "listbox"); document.body.appendChild(sug); sug.addEventListener("mousedown", (e) => { e.preventDefault(); const x = e.target.closest("[data-i]"); if (x) { sugSel = +x.dataset.i; pickSug(); } }); }
    const r = el.getBoundingClientRect(); sug.style.left = Math.min(r.left, innerWidth - 260) + "px"; sug.style.top = r.bottom + 4 + "px";
    drawSug();
  }
  function drawSug() { sug.innerHTML = sugOpts.map((o, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === sugSel}">${o.fresh ? "+ New page: " : ""}${esc(o.t)}</button>`).join(""); }
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
    const after = b.text.slice(off).replace(/^[^\]\n]*\]\]/, "");
    b.text = b.text.slice(0, sugAt) + o.t + "]]" + after;
    const c = sugAt + o.t.length + 2;
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
    Object.assign(marker.style, { top: (before ? r.top : r.bottom) - hr.top - 1 + "px", left: r.left - hr.left + "px", width: r.width + "px" });
    if (!marker.isConnected) root.appendChild(marker);
    return true;
  }
  function dropAtMarker() {
    if (!dragId || !marker?.dataset.target) return endDrag();
    const tid = marker.dataset.target, before = marker.dataset.before === "1";
    const src = find(dragId);
    if (src && tid !== dragId) {
      src.list.splice(src.i, 1);
      const dst = find(tid);
      dst.list.splice(before ? dst.i : dst.i + 1, 0, src.b);
      changed();
    }
    endDrag(); render();
  }
  root.addEventListener("dragover", (e) => {
    if (!dragId) return;
    if (showMarker(e.clientX, e.clientY, e.target.closest?.(".nb"))) e.preventDefault();
  });
  root.addEventListener("drop", (e) => { if (!dragId || !marker?.dataset.target) return; e.preventDefault(); dropAtMarker(); });
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

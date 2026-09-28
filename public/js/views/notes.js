// 노트: 옵시디언처럼 [[위키링크]] · 백링크 · #태그 · 편집/분할/보기
import { api } from "../api.js";
import { $, esc, debounce, toast, initial, nowTime, ymd, parseYmd, DOW } from "../util.js";
import { icon } from "../icons.js";
import { renderMarkdown, outline } from "../md.js";

let live = null; // the mounted notes view, so route changes can swap notes without remounting

const getMode = () => { try { return localStorage.getItem("trio-ed-mode") || "split"; } catch { return "split"; } };
const setMode = (m) => { try { localStorage.setItem("trio-ed-mode", m); } catch {} };
const fmt = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export async function createNote(ctx, title, body = "") {
  let t = (title || "").replace(/[\[\]|#]/g, "").trim() || "제목 없음";
  for (let i = 1; i < 50; i++) {
    try {
      const { note } = await api.addNote({ title: i === 1 ? t : `${t} ${i}`, body });
      ctx.refreshSide();
      ctx.go("#/notes/" + note.id);
      return note;
    } catch (e) {
      if (e.status === 409 && title && i === 1) { ctx.go("#/notes/" + e.data.id); return null; } // 같은 제목이 있으면 그 노트로
      if (e.status !== 409) { toast(e.message, "err"); return null; }
    }
  }
}
export async function openByTitle(ctx, title) {
  try {
    const { id } = await api.resolve(title);
    if (id) ctx.go("#/notes/" + id);
    else await createNote(ctx, title, `# ${title}\n\n`);
  } catch (e) { toast(e.message, "err"); }
}
export async function openDaily(ctx, day) {
  const { id } = await api.resolve(day).catch(() => ({ id: null }));
  if (id) return ctx.go("#/notes/" + id);
  const d = parseYmd(day);
  await createNote(ctx, day, `# ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일\n\n## 배운 것\n- \n\n## 회고\n- 잘한 점: \n- 아쉬운 점: \n\n#데일리\n`);
}

export function update(r) { if (live) live.route(r); }

export function mount(root, ctx, r) {
  const S = { notes: [], filter: "", tag: null, cur: null, backlinks: [], tags: [], mode: getMode(), status: "" };

  root.innerHTML = `
    <div class="notes" id="notes">
      <aside class="note-list" aria-label="노트 목록">
        <div class="top">
          <div class="row" style="justify-content:space-between">
            <h1 class="h2">노트</h1>
            <span class="row" style="gap:2px">
              <button class="btn ghost sm" type="button" id="daily">오늘 노트</button>
              <button class="btn sm accent" type="button" id="new">${icon.plus(14)}새 노트</button>
            </span>
          </div>
          <input class="input" id="filter" placeholder="제목·내용으로 거르기" aria-label="노트 거르기">
          <div id="tagbar"></div>
        </div>
        <ul id="nl"></ul>
      </aside>
      <section class="editor" id="ed" aria-label="노트 편집"></section>
    </div>`;

  // ---------- list ----------
  function drawList() {
    const q = S.filter.toLowerCase();
    const list = S.notes.filter((n) => !q || n.title.toLowerCase().includes(q) || (n.snippet || "").toLowerCase().includes(q));
    $("#tagbar", root).innerHTML = S.tag ? `<span class="row" style="gap:6px"><span class="tag" aria-pressed="true">#${esc(S.tag)}</span><a class="linkbtn faint" href="#/notes" style="font-size:12px">태그 해제</a></span>` : "";
    $("#nl", root).innerHTML = list.length ? list.map((n) => {
      const u = ctx.user(n.user_id);
      return `<li><a href="#/notes/${n.id}" ${S.cur?.id === n.id ? 'aria-current="page"' : ""}>
        <span class="nt"><span class="dot" style="--c:${esc(u?.color || "#999")}"></span><span>${esc(n.title)}</span>${n.shared ? `<span class="faint" title="공유됨">${icon.share(12)}</span>` : ""}</span>
        <span class="ns">${esc((n.snippet || "").replace(/[#*>\-\[\]`]/g, "").replace(/\s+/g, " ").trim() || "빈 노트")}</span>
      </a></li>`;
    }).join("") : `<li class="empty" style="margin:8px">${S.notes.length ? "맞는 노트가 없어요" : "첫 노트를 만들어 보세요"}</li>`;
  }
  async function loadList() {
    try { S.notes = (await api.notes(S.tag)).notes; drawList(); } catch (e) { toast(e.message, "err"); }
  }

  // ---------- editor ----------
  const mine = () => S.cur && S.cur.user_id === ctx.me.id;
  function drawEmpty() {
    $("#notes", root).classList.remove("has-note");
    $("#ed", root).innerHTML = `
      <div class="ed-body"><div class="ed-inner" style="max-width:520px;padding-top:8vh">
        <span class="eyebrow">Vault</span>
        <h2 class="h1"><span class="serif" style="font-size:44px">Second brain</span><br>공부한 것을 연결해요</h2>
        <div class="md muted">
          <ul>
            <li><code>[[노트 제목]]</code> 으로 다른 노트를 연결해요. 없는 제목이면 누를 때 새로 만들어져요.</li>
            <li><code>#태그</code> 를 붙이면 왼쪽 사이드바에서 모아 볼 수 있어요.</li>
            <li>다른 노트가 이 노트를 가리키면 아래에 <b>백링크</b>로 보여요.</li>
            <li><kbd>${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd> 로 어디서든 찾고, 없는 제목은 바로 만들어요.</li>
            <li>공유를 켠 노트만 다른 두 사람이 볼 수 있어요.</li>
          </ul>
        </div>
        <div class="row"><button class="btn accent" type="button" id="empty-new">${icon.plus(15)}새 노트</button><button class="btn ghost" type="button" id="empty-daily">오늘 데일리 노트</button></div>
      </div></div>`;
    $("#empty-new", root).addEventListener("click", () => createNote(ctx, ""));
    $("#empty-daily", root).addEventListener("click", () => openDaily(ctx, ymd(new Date())));
  }

  function drawEditor() {
    const n = S.cur, own = mine(), u = ctx.user(n.user_id);
    const mode = own ? S.mode : "view";
    $("#notes", root).classList.add("has-note");
    $("#ed", root).innerHTML = `
      <div class="ed-bar">
        <a class="icon-btn sm" href="#/notes" aria-label="목록으로" id="ed-back">${icon.left(16)}</a>
        <span class="status" id="ed-status">${own ? esc(S.status || "수정 " + fmt(n.updated_at)) : `${esc(u?.display_name || "누군가")}의 노트 · 보기 전용`}</span>
        ${own ? `
        <div class="seg" role="tablist" aria-label="보기 방식">
          <button type="button" role="tab" data-mode="edit" aria-selected="${mode === "edit"}" title="편집">${icon.edit(14)}</button>
          <button type="button" role="tab" data-mode="split" aria-selected="${mode === "split"}" title="분할">${icon.split(14)}</button>
          <button type="button" role="tab" data-mode="view" aria-selected="${mode === "view"}" title="보기">${icon.eye(14)}</button>
        </div>
        <button class="btn ghost sm" type="button" id="ed-share" aria-pressed="${!!n.shared}">${n.shared ? icon.share(14) + "공유 중" : icon.lock(14) + "나만 보기"}</button>
        <button class="icon-btn sm danger" type="button" id="ed-del" aria-label="노트 삭제">${icon.trash(15)}</button>` : ""}
      </div>
      <div class="ed-body"><div class="ed-inner" style="${mode === "split" ? "max-width:1180px" : ""}">
        <input class="ed-title" id="ed-title" value="${esc(n.title)}" aria-label="노트 제목" ${own ? "" : "readonly"} maxlength="120">
        <div class="row faint" style="font-size:12px;gap:10px">
          <span class="row" style="gap:6px"><span class="av sm" style="--c:${esc(u?.color || "#999")}">${esc(initial(u?.display_name))}</span>${esc(u?.display_name || "")}</span>
          <span>${fmt(n.created_at)} 작성</span>
          <span id="ed-tags" class="row" style="gap:4px">${S.tags.map((t) => `<a class="tag" href="#/notes/tag/${encodeURIComponent(t)}">#${esc(t)}</a>`).join("")}</span>
        </div>
        <div class="${mode === "split" ? "ed-split" : ""}">
          ${mode !== "view" ? `<textarea class="ed-text" id="ed-text" spellcheck="false" placeholder="마크다운으로 쓰세요. [[ 를 치면 노트 제목이 떠요.">${esc(n.body)}</textarea>` : ""}
          ${mode !== "edit" ? `<article class="md" id="ed-md"></article>` : ""}
        </div>
        <div class="ed-meta">
          <div class="eyebrow">백링크 · ${S.backlinks.length}</div>
          <div class="backlinks" id="ed-back-list">${S.backlinks.length ? S.backlinks.map((b) => `<a href="#/notes/${b.id}"><b>${esc(b.title)}</b><span>${esc((b.snippet || "").replace(/\s+/g, " ").slice(0, 120))}</span></a>`).join("") : `<span class="faint" style="font-size:13px">아직 이 노트를 가리키는 노트가 없어요. 다른 노트에서 <code>[[${esc(n.title)}]]</code> 라고 써 보세요.</span>`}</div>
          <div id="ed-outline"></div>
        </div>
      </div></div>`;
    drawPreview();
    bindEditor();
  }

  function drawPreview() {
    const md = $("#ed-md", root), body = $("#ed-text", root)?.value ?? S.cur.body;
    if (md) {
      md.innerHTML = renderMarkdown(body || "_비어 있는 노트예요._");
      const titles = new Set(S.notes.map((n) => n.title.toLowerCase()));
      md.querySelectorAll("[data-wikilink]").forEach((a) => a.classList.toggle("missing", !titles.has(a.dataset.wikilink.toLowerCase())));
    }
    const ol = outline(body);
    const oe = $("#ed-outline", root);
    if (oe) oe.innerHTML = ol.length > 1 ? `<div class="eyebrow" style="margin:6px 0">개요</div><div style="display:grid;gap:3px;font-size:13px">${ol.map((h) => `<span class="muted" style="padding-left:${(h.level - 1) * 14}px">${esc(h.text)}</span>`).join("")}</div>` : "";
  }

  // ---------- saving ----------
  let chain = Promise.resolve();
  const setStatus = (t) => { S.status = t; const el = $("#ed-status", root); if (el) el.textContent = t; };
  const save = debounce(() => {
    if (!mine()) return;
    const id = S.cur.id, title = $("#ed-title", root)?.value.trim(), body = $("#ed-text", root)?.value;
    const patch = {};
    if (title && title !== S.cur.title) patch.title = title;
    if (body !== undefined && body !== S.cur.body) patch.body = body;
    if (!Object.keys(patch).length) return;
    chain = chain.then(async () => {
      try {
        const { note } = await api.saveNote(id, patch);
        if (S.cur?.id === id) { S.cur = note; setStatus("저장됨 " + nowTime()); }
        const li = S.notes.find((x) => x.id === id);
        if (li) { li.title = note.title; li.snippet = note.body.slice(0, 160); li.updated_at = note.updated_at; }
        drawList();
        if (patch.body !== undefined || patch.title) ctx.refreshSide();
      } catch (e) { setStatus("저장 실패"); toast(e.message, "err"); }
    });
  }, 650);

  function bindEditor() {
    const ta = $("#ed-text", root), title = $("#ed-title", root);
    $$m("[data-mode]").forEach((b) => b.addEventListener("click", () => { save.flush(); S.mode = b.dataset.mode; setMode(S.mode); if (ta) S.cur.body = ta.value; drawEditor(); }));
    const share = $("#ed-share", root);
    if (share) share.addEventListener("click", async () => {
      try { const { note } = await api.saveNote(S.cur.id, { shared: !S.cur.shared }); S.cur = note; toast(note.shared ? "다른 두 사람도 이 노트를 볼 수 있어요." : "이제 나만 볼 수 있어요."); const li = S.notes.find((x) => x.id === note.id); if (li) li.shared = note.shared; drawEditor(); drawList(); }
      catch (e) { toast(e.message, "err"); }
    });
    const del = $("#ed-del", root);
    if (del) del.addEventListener("click", () => {
      if (del.dataset.armed) {
        api.deleteNote(S.cur.id).then(() => { toast("노트를 지웠어요."); S.cur = null; ctx.refreshSide(); ctx.go("#/notes"); loadList(); }).catch((e) => toast(e.message, "err"));
      } else {
        del.dataset.armed = "1"; del.innerHTML = `<span style="font-size:12px;font-weight:600;padding:0 4px;white-space:nowrap">정말 지울까요?</span>`; del.style.width = "auto";
        setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.innerHTML = icon.trash(15); del.style.width = ""; } }, 3000);
      }
    });
    if (title && mine()) {
      title.addEventListener("input", () => { setStatus("입력 중…"); save(); });
      title.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); ta?.focus(); } });
    }
    if (ta) {
      ta.addEventListener("input", () => { setStatus("입력 중…"); save(); drawPreviewSoon(); suggest(ta); });
      ta.addEventListener("blur", () => { save.flush(); setTimeout(closeSuggest, 150); });
      ta.addEventListener("keydown", (e) => onSuggestKey(e, ta));
    }
    const md = $("#ed-md", root);
    if (md) md.addEventListener("click", (e) => {
      const w = e.target.closest("[data-wikilink]"), t = e.target.closest("[data-tag]");
      if (w) { e.preventDefault(); save.flush(); openByTitle(ctx, w.dataset.wikilink); }
      if (t) { e.preventDefault(); ctx.go("#/notes/tag/" + encodeURIComponent(t.dataset.tag)); }
    });
  }
  const $$m = (s) => [...root.querySelectorAll(s)];
  const drawPreviewSoon = debounce(drawPreview, 180);

  // ---------- [[ autocomplete ----------
  let box = null, opts = [], sel = 0, anchor = -1;
  function closeSuggest() { if (box) { box.remove(); box = null; } anchor = -1; }
  function suggest(ta) {
    const upto = ta.value.slice(0, ta.selectionStart);
    const open = upto.lastIndexOf("[[");
    if (open < 0 || upto.slice(open).includes("]]") || upto.slice(open).includes("\n")) return closeSuggest();
    anchor = open + 2;
    const q = upto.slice(anchor).toLowerCase();
    opts = S.notes.filter((n) => n.id !== S.cur.id && n.title.toLowerCase().includes(q)).slice(0, 8).map((n) => ({ t: n.title, c: ctx.user(n.user_id)?.color }));
    if (q && !opts.some((o) => o.t.toLowerCase() === q)) opts.push({ t: upto.slice(anchor), fresh: true });
    if (!opts.length) return closeSuggest();
    sel = 0;
    if (!box) { box = document.createElement("div"); box.className = "suggest"; box.setAttribute("role", "listbox"); document.body.appendChild(box); box.addEventListener("mousedown", (e) => { e.preventDefault(); const b = e.target.closest("[data-i]"); if (b) { sel = +b.dataset.i; pick(ta); } }); }
    const pos = caretXY(ta, ta.selectionStart);
    box.style.left = Math.min(pos.x, innerWidth - 260) + "px";
    box.style.top = pos.y + 22 + "px";
    drawSuggest();
  }
  function drawSuggest() {
    box.innerHTML = opts.map((o, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === sel}">${o.fresh ? icon.plus(13) + `새 노트: ${esc(o.t)}` : `<span class="dot" style="--c:${esc(o.c || "#999")}"></span>${esc(o.t)}`}</button>`).join("");
  }
  function pick(ta) {
    const o = opts[sel];
    if (!o || anchor < 0) return;
    const before = ta.value.slice(0, anchor), after = ta.value.slice(ta.selectionStart).replace(/^[^\]\n]*\]\]/, "");
    ta.value = before + o.t + "]]" + after;
    const c = before.length + o.t.length + 2;
    ta.setSelectionRange(c, c);
    closeSuggest();
    ta.dispatchEvent(new Event("input"));
  }
  function onSuggestKey(e, ta) {
    if (!box) return;
    if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % opts.length; drawSuggest(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + opts.length) % opts.length; drawSuggest(); }
    else if ((e.key === "Enter" || e.key === "Tab") && !e.isComposing) { e.preventDefault(); pick(ta); }
    else if (e.key === "Escape") { e.preventDefault(); closeSuggest(); }
  }
  // textarea caret position via a mirror element
  function caretXY(ta, idx) {
    const m = document.createElement("div"), cs = getComputedStyle(ta), r = ta.getBoundingClientRect();
    for (const p of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingLeft", "paddingRight", "borderLeftWidth", "borderTopWidth", "tabSize", "wordBreak", "overflowWrap"]) m.style[p] = cs[p];
    Object.assign(m.style, { position: "fixed", visibility: "hidden", whiteSpace: "pre-wrap", width: r.width + "px", left: r.left + "px", top: r.top + "px" });
    m.textContent = ta.value.slice(0, idx);
    const s = document.createElement("span"); s.textContent = "​"; m.appendChild(s);
    document.body.appendChild(m);
    const sr = s.getBoundingClientRect();
    m.remove();
    return { x: sr.left, y: sr.top - ta.scrollTop };
  }

  // ---------- routing ----------
  async function open(id) {
    save.flush();
    closeSuggest();
    if (!id) { S.cur = null; drawEmpty(); drawList(); return; }
    try {
      const { note, backlinks, tags } = await api.note(id);
      S.cur = note; S.backlinks = backlinks; S.tags = tags; S.status = "";
      drawEditor(); drawList();
      if (mine() && !note.body.trim()) setTimeout(() => ($("#ed-title", root).value.startsWith("제목 없음") ? $("#ed-title", root) : $("#ed-text", root))?.select?.(), 30);
    } catch (e) { toast(e.message, "err"); S.cur = null; drawEmpty(); }
  }
  function route(rr) {
    const tag = rr.tag || null;
    if (tag !== S.tag) { S.tag = tag; loadList(); }
    open(rr.id);
  }

  $("#new", root).addEventListener("click", () => createNote(ctx, ""));
  $("#daily", root).addEventListener("click", () => openDaily(ctx, ymd(new Date())));
  $("#filter", root).addEventListener("input", (e) => { S.filter = e.target.value.trim(); drawList(); });

  S.tag = r.tag || null;
  live = { route };
  loadList().then(() => open(r.id));

  return () => { save.flush(); closeSuggest(); live = null; };
}

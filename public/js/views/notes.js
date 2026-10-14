// 노트: 옵시디언처럼 [[위키링크]] · 백링크 · #태그 · 편집/분할/보기
import { keepDraft } from "../draft.js";
import { api } from "../api.js";
import { $, esc, debounce, toast, initial, nowTime, ymd, parseYmd, DOW, avatar } from "../util.js";
import { icon } from "../icons.js";
import { renderMarkdown, outline } from "../md.js";
import { createBlockEditor } from "../blocks/editor.js";
import { mdToBlocks, blocksToMd } from "../blocks/md.js";
import { mountDatabase, pill } from "../blocks/db.js";
import { mountAiPick, aiPrefs } from "../ai-pick.js";
import { attachImages } from "../imgattach.js";

let live = null; // the mounted notes view, so route changes can swap notes without remounting

const MODES = new Set(["block", "md", "view"]);
const getMode = () => { try { const m = localStorage.getItem("trio-ed-mode"); return MODES.has(m) ? m : "block"; } catch { return "block"; } };
const setMode = (m) => { try { localStorage.setItem("trio-ed-mode", m); } catch {} };
const getListOpen = () => { try { return localStorage.getItem("trio-nl") !== "0"; } catch { return true; } };
const setListOpen = (v) => { try { localStorage.setItem("trio-nl", v ? "1" : "0"); } catch {} };
const noteCache = new Map(); // id → { at, data } 방금 본 노트는 바로 띄우고 뒤에서 새로 받아요
// 목록·백링크 미리보기: AI 표시와 마크다운 기호를 걷어낸 글자만
const plain = (t) => (t || "").replace(/<!--[\s\S]*?(-->|$)/g, " ").replace(/<\/?[a-z][^>]*>/gi, "").replace(/[#*>\-\[\]`]/g, "").replace(/\s+/g, " ").trim();
// 백링크 미리보기에서 이 노트 제목을 형광펜으로
const hiTitle = (text, title) => { const t = esc(text), q = esc(title); const i = t.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? t : t.slice(0, i) + "<mark>" + t.slice(i, i + q.length) + "</mark>" + t.slice(i + q.length); };
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
  const S = { notes: [], filter: "", tag: null, cur: null, backlinks: [], tags: [], children: [], crumbs: [], mode: getMode(), status: "", listOpen: getListOpen() };
  let ED = null; // 블록 편집기

  root.innerHTML = `
    <div class="notes${S.listOpen ? "" : " list-hidden"}" id="notes">
      <aside class="note-list" aria-label="노트 목록">
        <div class="top">
          <div class="row" style="justify-content:space-between">
            <h1 class="sr-only">노트</h1>
            <nav class="seg nt-tabs" aria-label="Notes · Brain"><a href="#/notes" aria-current="page">Notes</a><a href="#/brain">Brain</a></nav>
            <span class="row" style="gap:2px">
              <button class="btn ghost sm" type="button" id="daily">Today</button>
              <button class="btn sm accent" type="button" id="new">${icon.plus(14)}New page</button>
            </span>
          </div>
          <div class="ai-bar" role="group" aria-label="AI">
            <button class="btn sm ai-btn" type="button" id="ai-organize" title="내 노트 전부에 주제·#태그·[[링크]]를 달고 주제별 목차를 만들어요">${icon.spark(14)}AI tidy</button>
            <button class="btn sm ai-btn" type="button" id="ai-make" title="주제를 적으면 서로 연결된 개념 노트를 만들어요">${icon.plus(14)}AI create</button>
            <button class="btn sm ai-btn" type="button" id="ai-page" title="이 페이지를 어디에 쓸지 적으면 AI 가 Notion 풍 페이지를 만들어요. 만든 뒤에도 대화로 계속 고쳐요">${icon.edit(14)}AI page</button>
          </div>
          <form class="ai-make ai-page-form" id="ai-page-form" hidden>
            <textarea class="input" id="ai-purpose" rows="2" maxlength="1000" placeholder="이 페이지를 어디에 쓸 건가요? 예: 10월 논문 스프린트 복습 일정 · 영어 섀도잉 기록장" aria-label="페이지 사용 목적"></textarea>
            <div class="row" style="justify-content:space-between;gap:8px">
              <label class="row faint" style="gap:6px;font-size:12.5px"><input type="checkbox" id="ai-hub"> 영어 + 논문 공부 허브로 (지금 수치 · 두 페이지 링크 포함)</label>
              <button class="btn sm accent" type="submit">페이지 만들기</button>
            </div>
          </form>
          <div id="nl-pick"></div>
          <form class="ai-make" id="ai-make-form" hidden>
            <input class="input" id="ai-topic" placeholder="주제 · 링크 · 사진(붙여넣기) 예: 삼각함수 기초" maxlength="500" aria-label="만들 노트 주제">
            <button class="icon-btn sm" type="button" id="ai-topic-img" aria-label="이미지 붙이기" title="교재 · 필기 사진으로 노트 만들기 (붙여넣기 · 끌어다 놓기도 돼요)">${icon.image(15)}</button>
            <button class="btn sm accent" type="submit">만들기</button>
            <div class="att-tray" id="ai-topic-att" hidden></div>
          </form>
          <input class="input" id="filter" placeholder="Filter by title or text" aria-label="Filter pages">
          <div id="tagbar"></div>
        </div>
        <ul id="nl"></ul>
      </aside>
      <section class="editor" id="ed" aria-label="노트 편집"></section>
    </div>`;

  // ---------- list ----------
  function drawList() {
    const q = S.filter.toLowerCase();
    // 데이터베이스 행은 그 데이터베이스 안에서만 보여요 (찾기에 글자를 넣으면 같이 나와요)
    const dbs = new Set(S.notes.filter((n) => n.kind === "database").map((n) => n.id));
    const list = S.notes.filter((n) => q ? n.title.toLowerCase().includes(q) || (n.snippet || "").toLowerCase().includes(q) : !dbs.has(n.parent_id));
    $("#tagbar", root).innerHTML = S.tag
      ? `<span class="row" style="gap:6px"><span class="tag" aria-pressed="true">#${esc(S.tag)}</span><a class="linkbtn faint" href="#/notes" style="font-size:12px">Clear tag</a></span>`
      : `<div class="tagcloud" style="padding:0">${(S.allTags || []).slice(0, 12).map((t) => `<a class="tag" href="#/notes/tag/${encodeURIComponent(t.tag)}">#${esc(t.tag)}</a>`).join("")}</div>`;
    $("#nl", root).innerHTML = list.length ? list.map((n) => {
      const u = ctx.user(n.user_id);
      return `<li><a href="#/notes/${n.id}" ${S.cur?.id === n.id ? 'aria-current="page"' : ""}>
        <span class="nt"><span class="dot" style="--c:${esc(u?.color || "#999")}"></span><span>${esc(n.title)}</span></span>
        <span class="ns">${esc(plain(n.snippet) || "Empty")}</span>
      </a></li>`;
    }).join("") : `<li class="empty" style="margin:8px">${S.notes.length ? "No match" : "Create your first page"}</li>`;
  }
  async function loadList() {
    try { const [{ notes }, { tags }] = await Promise.all([api.notes(S.tag), api.tags()]); S.notes = notes; S.allTags = tags; drawList(); } catch (e) { toast(e.message, "err"); }
  }

  // ---------- editor ----------
  const mine = () => S.cur && S.cur.user_id === ctx.me.id;
  function drawEmpty() {
    $("#notes", root).classList.remove("has-note");
    $("#ed", root).innerHTML = `
      <div class="ed-body"><div class="ed-inner" style="max-width:520px;padding-top:8vh">
        <span class="eyebrow">// Brain</span>
        <h2 class="h1 vault-title">Brain<br><span class="muted">Everything I learn, in one tree</span></h2>
        <div class="md muted">
          <ul>
            <li>Write like Notion. Type <code>/</code> for headings, lists, to-dos, code, pages and AI blocks.</li>
            <li><code>[[Page title]]</code> links pages. A missing title becomes a new page when you open it.</li>
            <li>Every page can hold pages. Put new pages under one of the five concepts in <a href="#/brain">Brain</a>.</li>
            <li><code>#tag</code> groups pages in the left panel. <b>Backlinks</b> show who points here.</li>
            <li><kbd>${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd> finds anything, or creates it.</li>
            <li>Pages are private. The other two only see charts.</li>
          </ul>
        </div>
        <div class="row"><button class="btn accent" type="button" id="empty-new">${icon.plus(15)}New page</button><button class="btn ghost" type="button" id="empty-daily">Today's daily page</button></div>
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
        <a class="icon-btn sm only-m" href="#/notes" aria-label="목록으로" id="ed-back">${icon.left(16)}</a>
        <button class="icon-btn sm only-d" type="button" id="ed-list" aria-label="${S.listOpen ? "찾기 패널 접기" : "찾기 패널 펴기"}" aria-expanded="${S.listOpen}" title="${S.listOpen ? "찾기 패널 접기" : "찾기 패널 펴기"}">${S.listOpen ? icon.left(15) : icon.right(15)}</button>
        <span class="status" id="ed-status">${own ? esc(S.status || "Edited " + fmt(n.updated_at)) : `${esc(u?.display_name || "누군가")}의 노트 · 보기 전용`}</span>
        ${own ? `
        <div class="seg" role="tablist" aria-label="보기 방식">
          <button type="button" role="tab" data-mode="block" aria-selected="${mode === "block"}" title="블록 편집">${icon.edit(14)}<span class="seg-l">Edit</span></button>
          <button type="button" role="tab" data-mode="md" aria-selected="${mode === "md"}" title="마크다운 원문">${icon.split(14)}<span class="seg-l">Markdown</span></button>
          <button type="button" role="tab" data-mode="view" aria-selected="${mode === "view"}" title="보기">${icon.eye(14)}<span class="seg-l">View</span></button>
        </div>
        <button class="btn ghost sm ai-btn" type="button" id="ed-ai" title="Add topic, #tags and [[links]] to this page">${icon.spark(14)}AI tidy</button>
        <button class="btn ghost sm ai-btn" type="button" id="ed-split-ai" title="이 노트를 개념 하나당 노트 하나로 쪼개 새로 만들어요">Split</button>
        <button class="icon-btn sm danger" type="button" id="ed-del" aria-label="노트 삭제">${icon.trash(15)}</button>` : ""}
      </div>
      ${own ? `<form class="ai-refine" id="ed-refine" title="AI 와 이 페이지를 같이 고쳐요"><span class="ai-refine-ic">${icon.spark(14)}</span><input class="input" id="ed-refine-in" maxlength="1000" placeholder="Ask AI: make this a table · add a review section · shorter" aria-label="AI 에게 고쳐 달라고 하기"><button class="btn sm accent" type="submit">Apply</button></form>` : ""}
      <div class="ed-body"><div class="ed-inner" style="${mode === "md" ? "max-width:1180px" : ""}">
        <nav class="crumbs" aria-label="Path"><a href="#/brain">Brain</a><span>›</span>${S.crumbs.map((c) => `<a href="#/notes/${c.id}">${esc(c.title)}</a><span>›</span>`).join("")}<b>${esc(n.title)}</b><a class="crumb-map" href="#/brain/${encodeURIComponent(S.children.length ? n.id : S.crumbs.at(-1)?.id || "")}" title="See this page in the Brain graph">◎ Map</a></nav>
        <input class="ed-title" id="ed-title" value="${esc(n.title)}" aria-label="노트 제목" ${own ? "" : "readonly"} maxlength="120">
        <div class="row faint" style="font-size:12px;gap:10px">
          <span class="row" style="gap:6px">${avatar({ ...(u || {}), color: u?.color || "#999" }, "sm")}${esc(u?.display_name || "")}</span>
          <span>Created ${fmt(n.created_at)}</span>
          ${S.backlinks.length ? `<a href="#ed-back-list" class="bl-count" id="bl-count">↙ ${S.backlinks.length} backlink${S.backlinks.length > 1 ? "s" : ""}</a>` : ""}
          <span id="ed-tags" class="row" style="gap:4px">${S.tags.map((t) => `<a class="tag" href="#/notes/tag/${encodeURIComponent(t)}">#${esc(t)}</a>`).join("")}</span>
        </div>
        ${n.props ? `<div class="nb-props" id="ed-props"></div>` : ""}
        ${mode === "block" || n.kind === "database" ? `<div id="ed-blocks"></div>` : `<div class="${mode === "md" ? "ed-split" : ""}">
          ${mode === "md" ? `<textarea class="ed-text" id="ed-text" spellcheck="false" placeholder="마크다운으로 쓰세요. [[ 를 치면 노트 제목이 떠요.">${esc(n.body)}</textarea>` : ""}
          <article class="md" id="ed-md"></article>
        </div>`}
        <div class="ed-meta">
          ${n.kind === "database" ? "" : `<div class="row" style="justify-content:space-between;align-items:center"><div class="eyebrow">Pages · ${S.children.length}</div>${own ? `<button class="btn ghost sm" type="button" id="ed-newpage">${icon.plus(13)}Page</button>` : ""}</div>
          <div class="pages" id="ed-pages">${S.children.length ? S.children.map((c) => `<a href="#/notes/${c.id}"><span class="pg-ic">📄</span><b>${esc(c.title)}</b></a>`).join("") : `<span class="faint" style="font-size:13px">Add pages inside this one to split it up.</span>`}</div>`}
          <div class="eyebrow" id="ed-back-h">${S.backlinks.length} backlink${S.backlinks.length === 1 ? "" : "s"}</div>
          <div class="backlinks" id="ed-back-list">${S.backlinks.length ? S.backlinks.map((b) => `<a href="#/notes/${b.id}"><b>📄 ${esc(b.title)}</b><span>${hiTitle(plain(b.snippet).slice(0, 150), n.title)}</span></a>`).join("") : `<span class="faint" style="font-size:13px">Nothing links here yet. Write <code>[[${esc(n.title)}]]</code> in another page.</span>`}</div>
          <div id="ed-outline"></div>
        </div>
      </div></div>`;
    if (mode === "block" || n.kind === "database") mountBlocks(own); else { drawPreview(); if (n.props) drawRowProps(); }
    bindEditor();
  }
  const parseJ = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
  let DBV = null, lastSaved = ""; // 데이터베이스 보기 · 마지막으로 저장한 블록 JSON
  function mountBlocks(own) {
    ED?.destroy(); DBV?.destroy(); DBV = null;
    const host = $("#ed-blocks", root);
    if (S.cur.kind === "database") { ED = null; DBV = mountDatabase(host, S.cur.id, { readOnly: !own, onOpen: (id) => ctx.go("#/notes/" + id) }); return; }
    // 예전 노트(blocks 가 없으면)는 마크다운 body 를 블록으로 바꿔서 열어요 — 저장하면 그때부터 블록 노트
    const doc = parseJ(S.cur.blocks) || mdToBlocks(S.cur.body);
    lastSaved = S.cur.blocks || JSON.stringify(doc);
    ED = createBlockEditor(host, {
      doc, readOnly: !own,
      notes: () => S.notes.filter((n) => n.id !== S.cur?.id).map((n) => n.title),
      onChange: () => { setStatus("입력 중…"); save(); drawOutlineSoon(); },
      onOpenTitle: (t) => { save.flush(); const hit = S.notes.find((n) => n.title.toLowerCase() === t.toLowerCase()); if (hit) ctx.go("#/notes/" + hit.id); else openByTitle(ctx, t); },
      onOpenNote: (id) => { save.flush(); ctx.go("#/notes/" + id); },
      onOpenTag: (t) => ctx.go("#/notes/tag/" + encodeURIComponent(t)),
      onNewPage: (title) => newPage(title, false, {}),
      onNewDb: (title) => newPage(title, false, { kind: "database" }),
      mountDb: (el, id) => mountDatabase(el, id, { inline: true, readOnly: !own, onOpen: (nid) => { save.flush(); ctx.go("#/notes/" + nid); } }),
    });
    drawOutline();
    if (S.cur.props) drawRowProps();
  }
  // 데이터베이스 행 페이지: 맨 위에 속성(상태 · 날짜 · 태그) 보여 주기
  async function drawRowProps() {
    const id = S.cur.id, props = parseJ(S.cur.props) || {}, box = $("#ed-props", root);
    if (!box || !S.cur.parent_id) return;
    try {
      const { note } = await api.note(S.cur.parent_id);
      const db = parseJ(note.db); if (!db || S.cur?.id !== id) return;
      // rollup · formula 는 데이터베이스 화면에서 계산해요 (여기선 숨김) · relation 은 개수만
      box.innerHTML = (props._tpl ? `<div class="nb-prop"><span class="faint">Template</span><span>⧉ starter blocks for new rows</span></div>` : "") + db.props.filter((p) => p.type !== "rollup" && p.type !== "formula").map((p) => {
        const v = props[p.key], o = (n) => p.options?.find((x) => x.name === n)?.color;
        const h = v === undefined ? '<span class="faint">Empty</span>' : p.type === "relation" ? `↗ ${v.length} linked` : p.type === "status" || p.type === "select" ? pill(v, o(v), p.type === "status") : p.type === "multi_select" ? v.map((x) => pill(x, o(x))).join("") : p.type === "checkbox" ? (v ? "✓" : "—") : esc(String(v));
        return `<div class="nb-prop"><span class="faint">${esc(p.name)}</span><span>${h}</span></div>`;
      }).join("") + `<a class="nb-prop-db faint" href="#/notes/${esc(note.id)}">▤ ${esc(note.title)}</a>`;
    } catch {}
  }
  async function newPage(title, go = true, extra = null) {
    if (!mine()) return null;
    save.flush(); await chain;
    const parent = S.cur;
    try {
      const { note } = await api.addNote(extra ? { title, parent_id: parent.id, unique_title: true, ...extra } : { title, parent_id: parent.id, body: `# ${title}\n\n` });
      S.children.push({ id: note.id, title: note.title, updated_at: note.updated_at });
      const pg = $("#ed-pages", root); if (pg) pg.innerHTML = S.children.map((c) => `<a href="#/notes/${c.id}"><span class="pg-ic">📄</span><b>${esc(c.title)}</b></a>`).join("");
      loadList(); ctx.refreshSide();
      if (go) ctx.go("#/notes/" + note.id);
      return note;
    } catch (e) {
      if (e.status === 409) { toast("같은 제목의 노트가 이미 있어요. 다른 제목으로 해 주세요.", "err"); return null; }
      toast(e.message, "err"); return null;
    }
  }
  function drawOutline() {
    const body = ED ? blocksToMd(ED.getDoc()) : ($("#ed-text", root)?.value ?? S.cur?.body ?? "");
    const ol = outline(body), oe = $("#ed-outline", root);
    if (oe) oe.innerHTML = ol.length > 1 ? `<div class="eyebrow" style="margin:6px 0">개요</div><div style="display:grid;gap:3px;font-size:13px">${ol.map((h) => `<span class="muted" style="padding-left:${(h.level - 1) * 14}px">${esc(h.text)}</span>`).join("")}</div>` : "";
  }
  const drawOutlineSoon = debounce(drawOutline, 400);

  function drawPreview() {
    const md = $("#ed-md", root), body = $("#ed-text", root)?.value ?? S.cur.body;
    if (md) {
      md.innerHTML = renderMarkdown(body || "_비어 있는 노트예요._");
      const titles = new Set(S.notes.map((n) => n.title.toLowerCase()));
      md.querySelectorAll("[data-wikilink]").forEach((a) => a.classList.toggle("missing", !titles.has(a.dataset.wikilink.toLowerCase())));
    }
    drawOutline();
  }

  // ---------- saving ----------
  let chain = Promise.resolve();
  const setStatus = (t) => { S.status = t; const el = $("#ed-status", root); if (el) el.textContent = t; };
  const save = debounce(() => {
    if (!mine()) return;
    const id = S.cur.id, title = $("#ed-title", root)?.value.trim();
    const patch = {};
    if (title && title !== S.cur.title) patch.title = title;
    if (ED && S.mode === "block") { const j = JSON.stringify(ED.getDoc()); if (j !== lastSaved) { patch.blocks = ED.getDoc(); lastSaved = j; } }
    else { const body = $("#ed-text", root)?.value; if (body !== undefined && body !== S.cur.body) patch.body = body; }
    if (!Object.keys(patch).length) return;
    chain = chain.then(async () => {
      try {
        // base_updated_at: 다른 탭 · 기기에서 먼저 고쳤으면 409 → 덮어쓰지 않고 새로 불러와요
        const { note } = await api.saveNote(id, { ...patch, base_updated_at: S.cur?.id === id ? S.cur.updated_at : undefined });
        if (S.cur?.id === id) { S.cur = note; setStatus("저장됨 " + nowTime()); }
        const c = noteCache.get(id); if (c) c.data = { ...c.data, note };
        const li = S.notes.find((x) => x.id === id);
        if (li) { li.title = note.title; li.snippet = note.body.slice(0, 160); li.updated_at = note.updated_at; }
        drawList();
        if (patch.body !== undefined || patch.blocks || patch.title) ctx.refreshSide();
      } catch (e) {
        if (e.status === 409 && e.data?.note) { toast("다른 곳에서 먼저 고친 노트라 새로 불러왔어요.", "err"); noteCache.delete(id); if (S.cur?.id === id) { S.cur = null; open(id); } return; }
        setStatus("저장 실패"); toast(e.message, "err");
      }
    });
  }, 650);

  function bindEditor() {
    $("#bl-count", root)?.addEventListener("click", (e) => { e.preventDefault(); $("#ed-back-h", root)?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    const ta = $("#ed-text", root), title = $("#ed-title", root);
    $$m("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      save.flush();
      if (ED && S.mode === "block") { S.cur.body = blocksToMd(ED.getDoc()); S.cur.blocks = JSON.stringify(ED.getDoc()); }
      else if (ta && ta.value !== (S.cur.body || "")) { S.cur.body = ta.value; S.cur.blocks = null; } // 마크다운에서 고쳤으면 블록은 다시 만들어요
      S.mode = b.dataset.mode; setMode(S.mode); ED?.destroy(); ED = null; DBV?.destroy(); DBV = null; drawEditor();
    }));
    const lt = $("#ed-list", root);
    if (lt) lt.addEventListener("click", () => { S.listOpen = !S.listOpen; setListOpen(S.listOpen); $("#notes", root).classList.toggle("list-hidden", !S.listOpen); lt.innerHTML = S.listOpen ? icon.left(15) : icon.right(15); lt.setAttribute("aria-expanded", String(S.listOpen)); lt.title = lt.ariaLabel = S.listOpen ? "찾기 패널 접기" : "찾기 패널 펴기"; });
    const np = $("#ed-newpage", root);
    if (np) np.addEventListener("click", () => { const t = prompt("새 페이지 제목", ""); if (t && t.trim()) newPage(t.trim().replace(/[\[\]|#]/g, "")); });
    const share = $("#ed-share", root);
    if (share) share.addEventListener("click", async () => {
      try { const { note } = await api.saveNote(S.cur.id, { shared: !S.cur.shared }); S.cur = note; toast(note.shared ? "다른 두 사람도 이 노트를 볼 수 있어요." : "이제 나만 볼 수 있어요."); const li = S.notes.find((x) => x.id === note.id); if (li) li.shared = note.shared; drawEditor(); drawList(); }
      catch (e) { toast(e.message, "err"); }
    });
    const aiOne = $("#ed-ai", root);
    if (aiOne) aiOne.addEventListener("click", () => aiRun(aiOne, "정리 중…", async () => {
      save.flush(); await chain;
      const id = S.cur.id, r = await api.organize(id, aiPrefs().model || undefined);
      toast(`주제 '${r.topics[0] || "?"}'로 정리했어요.`);
      ctx.refreshSide(); ctx.changed("notes"); await loadList(); if (S.cur?.id === id) await open(id);
    }));
    const refine = $("#ed-refine", root);
    if (refine) refine.addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = $("#ed-refine-in", root), instruction = inp.value.trim(); if (!instruction) return inp.focus();
      aiRun(refine.querySelector("button"), "고치는 중…", async () => {
        save.flush(); await chain;
        const id = S.cur.id, r = await api.aiPage({ note_id: id, instruction, model: aiPrefs().model || undefined });
        inp.value = ""; toast(r.reply || "고쳤어요."); ctx.changed("notes");
        await loadList(); if (S.cur?.id === id) await open(id);
      });
    });
    const aiSplit = $("#ed-split-ai", root);
    if (aiSplit) aiSplit.addEventListener("click", () => aiRun(aiSplit, "쪼개는 중…", async () => {
      save.flush(); await chain;
      const r = await api.generate({ note_id: S.cur.id, model: aiPrefs().model || undefined });
      afterGenerate(r);
    }));
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
    if (!id) { ED?.destroy(); ED = null; DBV?.destroy(); DBV = null; S.cur = null; drawEmpty(); drawList(); return; }
    const show = (d) => {
      const { note, backlinks, tags, children = [], crumbs = [] } = d;
      ED?.destroy(); ED = null; DBV?.destroy(); DBV = null;
      S.cur = note; S.backlinks = backlinks; S.tags = tags; S.children = children; S.crumbs = crumbs; S.status = "";
      drawEditor(); drawList();
    };
    const hit = noteCache.get(id);
    if (hit && S.cur?.id !== id) show(hit.data); // 본 적 있으면 먼저 띄우고
    try {
      const d = await api.note(id);
      noteCache.set(id, { at: Date.now(), data: d });
      if (location.hash !== "#/notes/" + id) return; // 그 사이 다른 데로 갔어요
      const same = hit && hit.data.note.updated_at === d.note.updated_at && hit.data.backlinks.length === d.backlinks.length && hit.data.children?.length === d.children?.length;
      if (!same || S.cur?.id !== id) show(d);
      if (mine() && !d.note.body.trim()) setTimeout(() => { const t = $("#ed-title", root); if (t?.value.startsWith("제목 없음")) t.select(); else if (ED) ED.focus("end"); else $("#ed-text", root)?.focus(); }, 30);
    } catch (e) { toast(e.message, "err"); S.cur = null; drawEmpty(); }
  }
  function route(rr) {
    const tag = rr.tag || null;
    if (tag !== S.tag) { S.tag = tag; loadList(); }
    open(rr.id);
  }

  // ---------- AI ----------
  async function aiRun(btn, busy, fn) {
    if (btn.disabled) return;
    const html = btn.innerHTML;
    btn.disabled = true; btn.classList.add("busy"); btn.innerHTML = `${icon.spark(14)}${busy}`;
    try { await fn(); } catch (e) { toast(e.message, "err"); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove("busy"); btn.innerHTML = html; } }
  }
  function afterGenerate(r) {
    const made = r.notes.filter((n) => n.created).length, grew = r.notes.length - made;
    toast(`'${r.topic}' 노트 ${made}개를 만들었어요${grew ? ` · ${grew}개는 기존 노트에 보탰어요` : ""}.`);
    ctx.refreshSide(); ctx.changed("notes");
    loadList().then(() => ctx.go("#/notes/" + (r.moc_id || r.notes[0]?.id || "")));
  }
  $("#ai-organize", root).addEventListener("click", (e) => aiRun(e.currentTarget, "정리 중…", async () => {
    save.flush(); await chain;
    const r = await api.organize(undefined, aiPrefs().model || undefined);
    toast(`노트 ${r.updated}개를 주제 ${r.topics.length}개(${r.topics.join(", ")})로 정리했어요.`);
    ctx.refreshSide(); ctx.changed("notes"); await loadList(); if (S.cur) await open(S.cur.id);
  }));
  $("#ai-make", root).addEventListener("click", () => { const f = $("#ai-make-form", root); f.hidden = !f.hidden; if (!f.hidden) $("#ai-topic", root).focus(); });
  $("#ai-make-form", root).addEventListener("submit", (e) => {
    e.preventDefault();
    const topic = $("#ai-topic", root).value.trim(), images = topicAtt.list();
    if (!topic && !images.length) return $("#ai-topic", root).focus();
    const btn = e.currentTarget.querySelector("button[type=submit]");
    aiRun(btn, images.length ? "사진 읽고 만드는 중…" : "찾아보고 만드는 중…", async () => { const p = aiPrefs(); const r = await api.generate({ topic, images, model: p.model || undefined, web: p.web }); $("#ai-topic", root).value = ""; topicDraft.clear(); topicAtt.clear(); $("#ai-make-form", root).hidden = true; afterGenerate(r); });
  });

  $("#ai-page", root).addEventListener("click", () => { const f = $("#ai-page-form", root); f.hidden = !f.hidden; $("#ai-make-form", root).hidden = true; if (!f.hidden) $("#ai-purpose", root).focus(); });
  $("#ai-page-form", root).addEventListener("submit", (e) => {
    e.preventDefault();
    const purpose = $("#ai-purpose", root).value.trim(), hub = $("#ai-hub", root).checked;
    if (!purpose && !hub) return $("#ai-purpose", root).focus();
    aiRun(e.currentTarget.querySelector("button[type=submit]"), "페이지 짜는 중…", async () => {
      const r = await api.aiPage({ purpose: purpose || "영어 공부와 논문 공부를 한 곳에서 보는 허브", hub, model: aiPrefs().model || undefined });
      $("#ai-purpose", root).value = ""; $("#ai-hub", root).checked = false; $("#ai-page-form", root).hidden = true;
      toast(`'${r.note.title}' 페이지를 만들었어요. 아래 AI 칸에 고칠 점을 적으면 계속 다듬어요.`);
      ctx.refreshSide(); ctx.changed("notes"); await loadList(); ctx.go("#/notes/" + r.note.id);
    });
  });
  mountAiPick($("#nl-pick", root));
  const topicDraft = keepDraft($("#ai-topic", root), "ai-topic");
  const topicAtt = attachImages({ tray: $("#ai-topic-att", root), button: $("#ai-topic-img", root), paste: [$("#ai-topic", root)], drop: [$("#ai-make-form", root)] });
  $("#new", root).addEventListener("click", () => createNote(ctx, ""));
  $("#daily", root).addEventListener("click", () => openDaily(ctx, ymd(new Date())));
  $("#filter", root).addEventListener("input", (e) => { S.filter = e.target.value.trim(); drawList(); });

  S.tag = r.tag || null;
  live = { route };
  loadList(); open(r.id);

  return () => { save.flush(); closeSuggest(); ED?.destroy(); ED = null; DBV?.destroy(); DBV = null; live = null; };
}

// "· 웹 검색 2 · 페이지 1 · 이미지 1" 처럼 AI 가 무엇을 찾아봤는지
function stepNote(steps) {
  if (!steps?.length) return "";
  const KO = { web_search: "웹 검색", read_page: "페이지", read_image: "이미지", search_notes: "노트 찾기", read_note: "노트" }, n = {};
  for (const s of steps) n[s.name] = (n[s.name] || 0) + 1;
  return " · " + Object.entries(n).map(([k, v]) => `${KO[k] || k} ${v}`).join(" · ");
}

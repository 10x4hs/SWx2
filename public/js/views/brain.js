// Brain (Obsidian) — 노트 + 공부를 한 나무로. 맨 위엔 큰 개념 5개만, 점을 두 번 누르면 그 안으로 (#/brain/<id>).
//   하위가 있는 점: 안으로 · 하위가 없는 노트: 노트 페이지 · 공부 점: 원래 공부 화면
// 마우스 (2026-10-22):
//   · 한 번 누르기 = 고르기 (테두리) · 고른 채 다른 점 누르기 = 둘을 연결 (본문에 [[제목]], ⌘Z 로 되돌리기) · 빈 곳 · Esc = 풀기
//   · 두 번 누르기 = 들어가기 (첫 번째 누르기는 고르기만 — 연결은 두 번 누르기 시간이 지나야 정해져서 두 번 누르기로는 연결이 안 생겨요)
//   · 만들기 · 고치기 · 지우기는 오른쪽 클릭만 (폰은 길게 누르기): 점 → 노트 메뉴 · 선 → 연결 끊기 · 빈 곳 → 여기에 새 노드
//   · ← 뒤로 = 들어오기 전 화면 (확대 · 위치 · 고른 점 그대로 — brain-nav.js) · 처음 한 번 3단계 안내 (사용법으로 다시)
// 관계 종류 (2026-10-24, rel.js · src/onto.js): 연결한 뒤 '어떤 관계예요?' 작은 창(칩 8개 · 기본 관련 · Esc = 관련) · 선 우클릭 '관계 바꾸기 ▸'
//   · 선 색 · 점선 = 관계 (설정 패널 '관계' 칸에 범례) · 머리줄 'AI 제안 N' → 제안함 (확정 · 다른 종류 · 거절) · 모두 ⌘Z
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { mountGraph } from "../graph/obsidian.js";
import { buildBrain, levelOf, CONCEPTS } from "../graph/brain-data.js";
import { openNoteMenu, bindNoteMenu, withoutGone, ask, recordCreate, linkNotes, unlinkNotes, holdGuard } from "../note-menu.js";
import { isOpen } from "../features.js";
import { openMenu } from "../ctxmenu.js";
import { undoScope } from "../undo.js";
import { back as brainBack, upHash, learnParents, syncDock, viewOf, keepView } from "../brain-nav.js";
import { relPop, setRelUndo, openInbox, closeRelPop, closeInbox, edgeStyle, LEGEND, relKo } from "../rel.js";
import { pairKey } from "../graph/brain-data.js";

let inst = null;
export function update(r) { inst?.update(r); }

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = MAC ? "⌘" : "Ctrl+";
const coarse = () => matchMedia("(pointer: coarse)").matches;
const low = (s) => String(s || "").trim().toLowerCase();
const INTRO = [
  { t: "우클릭으로 만들기 · 고치기 · 지우기", d: "빈 곳을 우클릭하면 새 노드, 노드를 우클릭하면 이름 바꾸기 · 하위 노드 · 옮기기 · 지우기가 나와요. 폰은 길게 눌러요." },
  { t: "노드를 누르고, 다른 노드를 누르면 연결", d: "한 번 누르면 골라져요(테두리). 그 상태로 다른 노드를 누르면 둘이 선으로 이어져요. 빈 곳이나 Esc 는 취소예요." },
  { t: "두 번 눌러 들어가기 · ← 뒤로 나오기", d: `노드를 두 번 누르면 안으로 들어가요. ← 뒤로는 보던 모습 그대로 돌아가요. 잘못했으면 ${MOD}Z 로 되돌려요.` },
];

export function mount(root, ctx, r) {
  let tree = null, raw = null, parents = new Map(), graph = null, drawnSig = "", drawnLevel, focus = r.id || null, alive = true, retried = null, spawn = {};
  const us = undoScope("brain"); // ⌘Z · ⌘⇧Z: 만들기 · 이름 · 옮기기 · 지우기 · 연결 · 끊기 (노트 화면과 같은 기록)
  const introKey = "trio-brain-intro:" + (ctx.me?.id || "");
  root.innerHTML = `
    <div class="brain">
      <header class="brain-bar">
        <div class="brain-path">
          <a class="btn ghost sm brain-back" href="#/brain" data-back hidden title="뒤로 — 들어오기 전 화면으로 (보던 모습 그대로)">← 뒤로</a>
          <nav class="brain-crumbs" aria-label="경로" data-crumbs></nav>
        </div>
        <div class="brain-actions">
          <button class="btn ghost sm brain-ai" type="button" data-inbox hidden title="AI 가 찾은 노트 사이 관계 — 확정 · 다른 종류 · 거절">AI 제안 <b data-inbox-n>0</b></button>
          <button class="btn ghost sm" type="button" data-help>사용법</button>
          <button class="icon-btn sm brain-more" type="button" data-more aria-label="더 보기" title="더 보기">⋯</button>
          <input type="file" accept=".json,application/json" data-import hidden>
        </div>
      </header>
      <div class="brain-body">
        <div class="brain-graph"><div class="brain-graph-in" data-graph><p class="og-loading">불러오는 중…</p></div><p class="brain-hint" data-hint aria-live="polite"></p></div>
        <aside class="brain-list" aria-label="이 층의 노드" data-list></aside>
      </div>
    </div>`;
  const hrefOf = (n) => n.href || (n.kids ? "#/brain/" + encodeURIComponent(n.id) : "#/notes/" + n.id);
  // 메뉴에 넘길 점: 나무(tree.N)의 종류(개념 · 공부 · 노트) + 받은 노트의 진짜 부모. 열기 = 두 번 누른 것과 같아요
  const pointOf = (id) => { const t = tree?.N.get(id); return t && { id, title: t.title, kind: t.kind, note: !!t.note, parent_id: parents.get(id) || null }; };
  const openNode = (id) => ctx.go(hrefOf({ id, href: tree.N.get(id)?.href, kids: tree.kids.get(id)?.length }));
  // 이 노트와 바로 이어진 노트들 (본문의 [[링크]] — 들어오는 것 · 나가는 것)
  function directLinks(id) {
    if (!raw || !tree) return [];
    const notes = withoutGone(raw.g.nodes || []), byId = new Map(notes.map((n) => [n.id, n])), byTitle = new Map();
    for (const n of notes) if (!byTitle.has(low(n.title))) byTitle.set(low(n.title), n);
    const me = byId.get(id); if (!me) return [];
    const out = new Map();
    for (const e of raw.g.edges || []) {
      if (e.src_id === id) { const d = byTitle.get(low(e.dst_title)); if (d && d.id !== id && !out.has(d.id)) out.set(d.id, { id: d.id, title: d.title, src: { id, title: me.title }, dst: { id: d.id, title: d.title } }); }
      else if (low(e.dst_title) === low(me.title)) { const s = byId.get(e.src_id); if (s && !out.has(s.id)) out.set(s.id, { id: s.id, title: s.title, src: { id: s.id, title: s.title }, dst: { id, title: me.title } }); }
    }
    return [...out.values()];
  }
  // 이 쌍의 관계 행 (그래프에 그리는 auto · confirmed 만)
  const relRow = (a, b) => tree?.relOf?.get(pairKey(a, b)) || null;
  const menu = { ctx, open: (p) => openNode(p.id), undo: us, stay: true, links: (n) => directLinks(n.id) };

  // ---------- 아래 한 줄 도움말 ----------
  const hintBase = () => (coarse()
    ? `길게 누르기: 만들기 · 고치기 · 지우기 · 두 번 누르기: 들어가기 · ${MOD}Z: 되돌리기`
    : `우클릭: 만들기 · 고치기 · 지우기 · 두 번 클릭: 들어가기 · ${MOD}Z: 되돌리기`);
  function hint(sel) {
    const el = $("[data-hint]", root); if (!el) return;
    el.classList.toggle("on", !!sel);
    el.innerHTML = sel ? `<b>${esc(sel.title)}</b> 골랐어요 — 다른 노드를 누르면 연결돼요 · Esc 취소` : esc(hintBase());
  }

  // ---------- 그리기 ----------
  function draw() {
    if (!alive) return;
    $("[data-back]", root).hidden = !focus;
    $("[data-back]", root).setAttribute("href", upHash(location.hash));
    if (!tree) return; // 아직 불러오는 중 — 맨 위로 바꾸지 않고 기다려요
    const L = levelOf(tree, focus);
    if (focus && !L.here) {
      // 막 만든 노드 · 아직 못 받은 노드: 한 번 더 받아 보고, 그래도 없으면 알려 줘요 (주소는 그대로)
      if (retried !== focus) { retried = focus; load(); return; }
      saveView(); graph?.(); graph = null; drawnSig = ""; drawnLevel = undefined;
      $("[data-crumbs]", root).innerHTML = `<a href="#/brain">Second Brain</a>`;
      $("[data-graph]", root).innerHTML = `<p class="og-loading">이 노드를 찾을 수 없어요. 지워졌거나 옮겨졌을 수 있어요. <a href="#/brain">맨 위로</a></p>`;
      $("[data-list]", root).innerHTML = "";
      return;
    }
    $("[data-crumbs]", root).innerHTML = [`<a href="#/brain">Second Brain</a>`, ...L.crumbs.map((c, i) => i === L.crumbs.length - 1 ? `<b>${esc(c.title)}</b>` : `<a href="#/brain/${encodeURIComponent(c.id)}">${esc(c.title)}</a>`)].join(`<i aria-hidden="true">›</i>`);
    $("[data-list]", root).innerHTML = L.items.length
      ? `<ul>${L.items.map((n) => `<li><a href="${esc(hrefOf(n))}" data-id="${esc(n.id)}"><i style="background:${L.types[n.type]?.color || "#9aa0a6"}"></i><span>${esc(n.title)}</span>${n.kids ? `<small>${n.kids}</small>` : n.href ? `<small>↗</small>` : ""}</a></li>`).join("")}</ul>`
      : `<p class="brain-empty">아직 아무것도 없어요.</p>`;
    const sig = JSON.stringify([L.data, L.types]);
    if (graph && drawnLevel === focus) { // 같은 층: 점 · 선만 바꿔요 (확대 · 위치 · 고른 점 그대로)
      if (sig !== drawnSig) { drawnSig = sig; graph.setData(L.data, L.types, spawn); spawn = {}; }
      return;
    }
    saveView(); graph?.(); drawnSig = sig; drawnLevel = focus;
    graph = mountGraph($("[data-graph]", root), {
      data: L.data, types: L.types, scope: "brain",
      empty: coarse() ? "여기를 길게 눌러서 첫 노드를 만들어요" : "여기를 우클릭해서 첫 노드를 만들어요",
      prefs: { ...(ctx.me.graph_prefs || {}), open: false },
      savePrefs: async (p) => { try { const res = await api.updateMe({ graph_prefs: { ...p, open: ctx.me.graph_prefs?.open } }); ctx.me.graph_prefs = res.user.graph_prefs; } catch {} },
      select: true, initial: viewOf(focus),
      onSelect: (n) => hint(n),
      onOpen: (n) => { saveView(); ctx.go(hrefOf(n)); },
      onConnect: (a, b) => connect(a, b),
      onMenu: (n, e) => { const p = pointOf(n.id); if (p) openNoteMenu(e, p, menu); },
      onEdgeMenu: (l, e) => edgeMenu(l, e),
      edgeStyle, legend: LEGEND,
      onBlankMenu: (e, w) => blankMenu(e, w),
    });
    hint(null);
    if (graph.selected()) hint(tree.N.get(graph.selected()));
  }
  function saveView() { if (graph && drawnLevel !== undefined) keepView(drawnLevel, graph.state()); }

  // 받아 둔 것(raw)으로 나무를 다시 — 지우는 중인 노트는 빼고 그 하위는 한 칸 위로 (지우기 · Undo 는 다시 받지 않고 이것만)
  function build() {
    if (!raw || !alive) return;
    const notes = withoutGone(raw.g.nodes || []);
    parents = new Map(notes.map((n) => [n.id, n.parent_id]));
    // 공부 기능이 없으면 우리 공부 화면 점(AI Books · 논문 · 영어 · 과목)은 빼요 — 내 노트만
    const study = isOpen(ctx, "study");
    tree = buildBrain({ notes, edges: raw.g.edges || [], rels: raw.g.rels || [], subjects: study ? (raw.pages.pages || []).filter((p) => p.place === "study") : [], study });
    const nIn = raw.g.rel_suggested || 0, ib = $("[data-inbox]", root);
    if (ib) { ib.hidden = !nIn; $("[data-inbox-n]", root).textContent = nIn; }
    learnParents(Object.fromEntries([...tree.N.values()].map((n) => [n.id, n.parent || null]))); syncDock(); // Dock 아이콘 = 한 칸 위
    draw();
  }
  let loadSeq = 0; // 여러 번 겹쳐 부르면(관계 확정 · 되돌리기가 빠르게 이어질 때) 마지막 답만 써요 — 늦게 온 옛 답이 새 답을 덮지 않게
  async function load() {
    const my = ++loadSeq;
    try {
      const [g, pages] = await Promise.all([api.graph(), api.pages().catch(() => ({ pages: [] }))]);
      if (!alive || my !== loadSeq) return;
      raw = { g, pages }; build();
    } catch (e) { if (alive && !tree) { graph?.(); graph = null; drawnSig = ""; drawnLevel = undefined; $("[data-graph]", root).innerHTML = `<p class="og-loading">불러오지 못했어요. ${esc(e.message || "")}</p>`; } }
  }
  bindNoteMenu($("[data-list]", root), "a[data-id]", (a) => pointOf(a.dataset.id), menu);

  // ---------- 연결 ----------
  async function connect(a, b) {
    const pa = pointOf(a.id), pb = pointOf(b.id);
    if (!pa?.note || !pb?.note || pa.kind === "study" || pb.kind === "study") { toast("공부 점 · 빈 묶음은 연결할 수 없어요. 노트끼리 연결해요."); graph?.select(b.id); return; }
    if (directLinks(a.id).some((l) => l.id === b.id) || relRow(a.id, b.id)) { graph?.select(b.id); return; } // 이미 이어져 있으면 그냥 고르기만 (실수로 끊기지 않게)
    graph?.select(null);
    const A = { id: a.id, title: pa.title }, B = { id: b.id, title: pb.title };
    if (await linkNotes(A, B, menu)) {
      raw?.g.edges.push({ src_id: a.id, dst_title: pb.title }); build(); // 바로 선이 보이게 (서버 답은 뒤따라 와요)
      toast(`'${pa.title}' – '${pb.title}' 연결했어요 · ${MOD}Z 되돌리기`);
      askRel(A, B, null, { fresh: true });
    }
  }
  // '어떤 관계예요?' — 새 연결이면 AI 짐작(Groq, 뒤에서)을 같이 물어요. 고르지 않고 닫으면 지금 그대로 (새 연결 = 관련)
  function askRel(A, B, row, { fresh = false, at = null } = {}) {
    const sa = graph?.screenOf(A.id), sb = graph?.screenOf(B.id), box = $("[data-graph]", root).getBoundingClientRect();
    const pt = at || (sa && sb ? { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 } : { x: box.left + box.width / 2, y: box.top + box.height / 2 });
    // 화살표 방향 그대로 보여 줘요 (from → 다른 점)
    const [S0, D0] = row && row.from === B.id ? [B, A] : [A, B];
    relPop({
      at: pt, a: S0, b: D0, current: row?.rel || "related", title: row ? "관계 바꾸기" : "어떤 관계예요?",
      guess: fresh ? api.guessRel(A.id, B.id).catch(() => null) : null,
      onPick: async ({ rel, src, dst, guess }) => {
        if (!row && rel === "related" && !guess) return; // 새 연결을 그냥 '관련' 으로 — 따로 적을 게 없어요
        if (row && row.rel === rel && row.from === src.id && row.status === "confirmed") return;
        const done = await setRelUndo({ undo: us, after: () => load() }, { src, dst, rel, guessLog: guess?.log_id || null });
        if (done) toast(`'${src.title}' —${relKo(rel)}→ '${dst.title}' · ${MOD}Z 되돌리기`);
      },
    });
  }
  function edgeMenu(l, e) {
    holdGuard(e);
    const direct = l.w >= 1 ? directLinks(l.s).filter((x) => x.id === l.t) : [];
    const row = l.rel ? { id: l.relId, rel: l.rel, from: l.from, status: l.status, origin: l.origin } : null;
    const pa = pointOf(l.s), pb = pointOf(l.t), notes = pa?.note && pb?.note && pa.kind === "note" && pb.kind === "note";
    const real = direct.length || row;
    openMenu(e, {
      title: `${l.sTitle} – ${l.tTitle}`,
      items: real
        ? [...(notes ? [{ k: "rel", label: "관계 바꾸기 ▸", hint: (row ? relKo(row.rel) : "관련") + (row?.status === "auto" ? " · AI 가 정함" : "") }] : []), { k: "cut", label: "연결 끊기", danger: true }]
        : l.w >= 1 ? [{ k: "in", label: "안쪽 노트끼리의 연결이에요", hint: "들어가서 끊어요" }] : [{ k: "weak", label: "제목이 비슷해서 그린 옅은 선이에요", hint: "연결이 아니에요" }],
      onPick: async (k) => {
        if (k === "in") return openNode(l.s);
        if (k === "rel") return askRel({ id: l.s, title: l.sTitle }, { id: l.t, title: l.tTitle }, row, { at: { x: e.clientX, y: e.clientY } });
        if (k !== "cut") return;
        await cut(l, direct, row);
      },
    });
  }
  // 연결 끊기: 본문의 [[링크]] + 관계 행을 같이 (되돌리기 한 번에 둘 다). AI 가 정한 관계는 거절로 남겨서 다시 제안하지 않아요
  async function cut(l, direct, row) {
    const bag = [], h2 = { ...menu, undo: { push: (x) => bag.push(x) } };
    for (const x of direct) await unlinkNotes(x.src, x.dst, h2);
    if (row) {
      try {
        if (row.origin === "ai" && row.id) {
          const r = await api.patchRel(row.id, { action: "reject" });
          bag.push({ undo: () => api.setRel(restoreOf(r.prev)), redo: () => api.setRel({ ...restoreOf(r.rel), status: "rejected" }) });
        } else {
          const r = await api.deleteRelPair(l.s, l.t);
          if (r.prev) bag.push({ undo: () => api.setRel(restoreOf(r.prev)), redo: () => api.deleteRelPair(l.s, l.t) });
        }
        if (!direct.length) toast(`'${l.sTitle}' – '${l.tTitle}' 연결을 끊었어요.`);
      } catch (err) { toast(err.message || "관계를 지우지 못했어요.", "err"); }
    }
    if (bag.length) us.push({ label: "연결 끊기", undo: async () => { for (const x of [...bag].reverse()) await x.undo(); load(); }, redo: async () => { for (const x of bag) await x.redo(); load(); } });
    load();
  }
  const restoreOf = (r) => ({ src_id: r.src_id, dst_id: r.dst_id, rel: r.rel, status: r.status, origin: r.origin, confidence: r.confidence, evidence: r.evidence, restore: true });
  // ---------- 빈 곳 우클릭: 여기에 새 노드 (누른 자리에 이름 칸) ----------
  function blankMenu(e, w) {
    holdGuard(e);
    const L = levelOf(tree, focus);
    openMenu(e, { title: L.here?.title || "Second Brain", items: [{ k: "new", label: "여기에 새 노드" }], onPick: (k) => k === "new" && newHere(e, w) });
  }
  // 맨 위(개념 5개)에서는 어느 개념 안에 둘지 고르게 해요 — 누른 자리에서 가장 가까운 개념이 먼저 골라져 있어요.
  // 맨 위에 그냥 두면 Unsorted 묶음으로 들어가 화면에서 사라지기 때문이에요.
  function newHere(e, w) {
    const L = levelOf(tree, focus), here = L.here;
    let pick = null;
    if (!focus) {
      const near = [...(L.data.nodes || [])].map((n) => n.id).filter((id) => tree.N.get(id)?.kind === "concept");
      const pos = graph?.state().pos || {};
      const best = near.map((id) => ({ id, d: pos[id] ? Math.hypot(pos[id][0] - w.x, pos[id][1] - w.y) : 1e9 })).sort((a, b) => a.d - b.d)[0];
      const opts = [...CONCEPTS.map((c) => c.title), "Unsorted"];
      const cur = best ? tree.N.get(best.id)?.title : "Unsorted";
      pick = { label: "어디에", value: opts.includes(cur) ? cur : "Unsorted", options: opts.map((t) => ({ v: t, label: t === "Unsorted" ? "Unsorted (분류 안 함)" : t })) };
    }
    if (here && !here.note && here.kind !== "concept") return toast("여기에는 노드를 만들 수 없어요.");
    ask({ head: "여기에 새 노드", sub: here?.title || "Second Brain", ok: "만들기", label: "새 노드 이름", at: { x: e.clientX, y: e.clientY }, pick, refocus: false }, async (title, where) => {
      try {
        let parent = here ? (here.note ? here.id : await conceptNote(here.title)) : null;
        if (!focus && where && where !== "Unsorted") parent = await conceptNote(where);
        const { note } = await api.addNote({ title, body: "", parent_id: parent });
        recordCreate(menu, note, "노드 만들기");
        if (graph && focus) spawn[note.id] = { x: w.x, y: w.y }; // 누른 자리에 나타나요
        raw?.g.nodes.push({ id: note.id, title: note.title, parent_id: note.parent_id }); build();
        ctx.refreshSide(); ctx.changed("notes", { note: { op: "create", id: note.id } });
        toast(focus ? `만들었어요 · ${MOD}Z 되돌리기` : `'${where || "Unsorted"}' 안에 만들었어요 · 두 번 눌러 들어가 봐요.`);
      } catch (err) { return err.status === 409 ? "같은 제목의 노트가 이미 있어요. 다른 이름으로 해 주세요." : err.message || "만들지 못했어요."; }
    });
  }
  // 개념(맨 위 묶음)이 아직 노트가 아니면 그 이름으로 맨 위 노트를 만들어요 (Unsorted 는 부모 없음)
  async function conceptNote(title) {
    if (low(title) === "unsorted") return null;
    const have = (raw?.g.nodes || []).find((n) => !n.parent_id && low(n.title) === low(title));
    if (have) return have.id;
    try { const { note } = await api.addNote({ title, body: "", parent_id: null }); raw?.g.nodes.push({ id: note.id, title: note.title, parent_id: null }); return note.id; }
    catch (e) { if (e.status === 409 && e.data?.id) return e.data.id; throw e; }
  }

  // ---------- 머리줄: ← 뒤로 · 사용법 · ⋯ ----------
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-back]")) { e.preventDefault(); saveView(); brainBack(upHash(location.hash), ctx.go); return; }
    if (e.target.closest("[data-help]")) { intro(0); return; }
    if (e.target.closest("[data-inbox]")) { openInbox(ctx, { undo: us, onChange: () => load() }); return; }
    const more = e.target.closest("[data-more]");
    if (more) {
      const L = tree ? levelOf(tree, focus) : null, r0 = more.getBoundingClientRect();
      openMenu({ clientX: r0.right - 230, clientY: r0.bottom + 6, preventDefault() {} }, {
        title: "더 보기",
        items: [
          ...(L?.here?.note ? [{ k: "page", label: "이 노트 페이지 열기" }] : []),
          { k: "graph", label: "전체 그래프 보기", hint: "모든 노트를 묶음으로" },
          { k: "inbox", label: "AI 제안함", hint: "AI 가 찾은 관계 · AI 가 정한 관계" },
          ...(focus ? [] : [{ k: "import", label: "가져오기 (JSON)", hint: "{ items: [{ title, body, parent_title }] }" }]),
          { k: "help", label: "사용법 다시 보기" },
        ],
        onPick: (k) => {
          if (k === "page") ctx.go("#/notes/" + L.here.id);
          else if (k === "graph") ctx.go("#/brain/graph");
          else if (k === "inbox") openInbox(ctx, { undo: us, onChange: () => load() });
          else if (k === "import") $("[data-import]", root).click();
          else if (k === "help") intro(0);
        },
      });
    }
  });
  // Esc = 고르기 풀기 (메뉴 · 작은 창 · 안내가 떠 있으면 그쪽이 먼저)
  const onKey = (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(".cm, .nm-back, .bi, .relpop, .relsheet")) return;
    if (graph?.selected()) { graph.select(null); hint(null); }
  };
  document.addEventListener("keydown", onKey);

  // ---------- 처음 한 번 3단계 안내 (사용법으로 다시) ----------
  function intro(i = 0) {
    root.querySelector(".bi")?.remove();
    const box = document.createElement("div");
    box.className = "bi"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "bi-t");
    const s = INTRO[i];
    box.innerHTML = `<div class="bi-card">
      <span class="bi-step">${i + 1} / ${INTRO.length}</span>
      <h2 id="bi-t">${esc(s.t)}</h2>
      <p>${esc(s.d)}</p>
      <div class="bi-dots" aria-hidden="true">${INTRO.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
      <div class="bi-btns"><button type="button" class="btn ghost sm" data-bi="skip">${i === INTRO.length - 1 ? "닫기" : "건너뛰기"}</button><button type="button" class="btn sm accent" data-bi="next">${i === INTRO.length - 1 ? "시작하기" : "다음"}</button></div>
    </div>`;
    const done = () => { try { localStorage.setItem(introKey, "1"); } catch {} box.remove(); document.removeEventListener("keydown", esc2, true); };
    const esc2 = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); done(); } };
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-bi]");
      if (!b) { if (ev.target === box) done(); return; }
      if (b.dataset.bi === "next" && i < INTRO.length - 1) { document.removeEventListener("keydown", esc2, true); intro(i + 1); }
      else done();
    });
    document.addEventListener("keydown", esc2, true);
    $(".brain", root).appendChild(box);
    box.querySelector('[data-bi="next"]').focus({ preventScroll: true });
  }
  let seen = false; try { seen = localStorage.getItem(introKey) === "1"; } catch {}
  if (!seen) intro(0);

  // Import: 부모가 먼저인 순서 그대로 40개씩 보내요. 같은 제목은 건너뛰니 중간에 끊겨도 다시 올리면 돼요
  root.addEventListener("change", async (e) => {
    const input = e.target.closest("[data-import]"); if (!input?.files?.[0]) return;
    let items;
    try { items = JSON.parse(await input.files[0].text()).items; if (!Array.isArray(items)) throw new Error("items 가 없어요"); }
    catch (err) { toast("가져올 수 있는 파일이 아니에요: " + (err.message || ""), "err"); input.value = ""; return; }
    const sum = { created: 0, moved: 0, kept: 0 };
    try {
      for (let i = 0; i < items.length; i += 40) {
        const r = await api.importNotes(items.slice(i, i + 40));
        sum.created += r.created; sum.moved += r.moved; sum.kept += r.kept;
        toast(`가져오는 중… ${Math.min(i + 40, items.length)} / ${items.length}`);
      }
      toast(`가져왔어요: 새로 ${sum.created} · 옮김 ${sum.moved} · 이미 있음 ${sum.kept}`);
    } catch (err) { toast(`${sum.created + sum.moved + sum.kept} / ${items.length} 에서 멈췄어요: ${err.message || ""} — 다시 올리면 이어서 해요.`, "err"); }
    input.value = ""; ctx.changed?.("notes"); load();
  });
  const onChanged = (e) => (e.detail?.note?.local ? build() : load());
  window.addEventListener("trio:changed", onChanged);
  addEventListener("pagehide", saveView);
  inst = { update: (nr) => { const next = nr.id || null; if (next !== focus) { saveView(); focus = next; } draw(); } };
  hint(null);
  load();
  return () => { closeRelPop(); closeInbox(); saveView(); alive = false; inst = null; graph?.(); us.dispose(); document.removeEventListener("keydown", onKey); removeEventListener("pagehide", saveView); window.removeEventListener("trio:changed", onChanged); };
}

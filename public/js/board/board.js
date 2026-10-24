// 할 일 보드 — 체크리스트의 '보드' 보기 (#/checklist, 위의 [보드 | 목록] 으로 바꿔요 · 사람마다 기억, 2026-10-24).
// 오늘만이 아니라 요즘(30일) 열린 할 일 · 마감일이나 칸이 있는 할 일 · 2주 안에 끝낸 할 일을 칸(할 일 · 진행 중 · 완료 · 내가 만든 칸)으로 봐요.
//   위: 제목 · 요약 · 숫자 칩(열린 일 · 이번 주 마감 · 늦은 일 · 이번 주 완료 — 누르면 그것만) · 필터(오늘/이번 주/전체 · 프로젝트 · 우선순위 · 찾기)
//   칸: 이름(두 번 눌러 바꾸기) · 개수 · + (그 칸에 바로 적기) · ⋯ (이름 · 옮기기 · 지우기) · 끝에 '칸 더하기'
//   카드: 프로젝트 색 태그 · 우선순위 깃발(1 긴급 빨강 · 2 높음 주황) · 이름 · 작은 할 일 막대 2/3 · 마감일(늦으면 빨강) · 메모 표시
//   끌기: 마우스 · 길게 누르기(터치) — 기울어진 채 따라오고, 놓으면 그 칸 그 자리. '완료' 칸 = 끝냄(done 1), 빼면 다시 열림
//   키보드: 카드에서 ← → = 옆 칸으로 · Alt+↑↓ = 칸 안에서 순서 · ↑↓ = 위아래 카드 · Enter = 자세히 · Delete = 지우기
//   되돌리기: 옮기기 · 고치기 · 더하기 · 지우기 · 작은 할 일 · 칸 바꾸기 모두 ⌘Z / ⌘⇧Z (서버에도 반대 요청, undo.js 의 "plan" 묶음)
import { api } from "../api.js";
import { $, $$, esc, toast, ymd, today, addDays } from "../util.js";
import { icon } from "../icons.js";
import { undoScope, resolveId } from "../undo.js";
import { recreatePlan } from "../plan-undo.js";
import { openMenu, openDrop, closeMenu } from "../ctxmenu.js";
import { boardDrag } from "./drag.js";
import { openSheet, PRIO_CHIPS } from "./sheet.js";
import * as M from "./model.js";

const DEF_COLS = [{ id: "todo", name: "할 일" }, { id: "doing", name: "진행 중" }, { id: "done", name: "완료" }];
const PRIO = Object.fromEntries(PRIO_CHIPS.map((c) => [c.k, c]));
const FLAG = `<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14V2.5M3.5 3h8l-1.6 3 1.6 3h-8" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const CAL = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></svg>`;
const NOTE = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 3.5h10M3 7h10M3 10.5h6"/></svg>`;
const TICK = `<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// 보드 | 목록 바꾸기 (checklist.js 도 같은 것을 그려요)
export const modeSeg = (cur) => `<div class="seg sm ck-mode" role="tablist" aria-label="보기">${[["board", "보드"], ["list", "목록"]].map(([k, l]) => `<button type="button" role="tab" data-mode="${k}" aria-selected="${cur === k}">${l}</button>`).join("")}</div>`;

// 체크하면 줄 긋고 아래로 미끄러지기 — 다시 그리기 전후 자리를 재서 움직여요 (FLIP)
export function flipList(box, redraw, sel = "[data-id]") {
  const before = new Map($$(sel, box).map((el) => [el.dataset.id, el.getBoundingClientRect().top]));
  redraw();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const el of $$(sel, box)) {
    const was = before.get(el.dataset.id); if (was == null) continue;
    const dy = was - el.getBoundingClientRect().top; if (Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 420, easing: "cubic-bezier(.22, 1, .36, 1)" });
  }
}

const prefKey = (ctx) => "trio.board." + (ctx.me?.id || "me");
const readPref = (ctx) => { try { return JSON.parse(localStorage.getItem(prefKey(ctx)) || "{}") || {}; } catch { return {}; } };
const savePref = (ctx, v) => { try { localStorage.setItem(prefKey(ctx), JSON.stringify(v)); } catch {} };

export function mountBoard(root, ctx) {
  const pref = readPref(ctx);
  const S = { list: null, cols: DEF_COLS, tags: {}, f: { range: ["today", "week", "all"].includes(pref.range) ? pref.range : "all", project: "", prio: "", q: "", kpi: "" }, adding: null, selfAt: 0, busy: false };
  const u = undoScope("plan");
  let sheet = null;
  root.innerHTML = `
    <div class="ck tb">
      <header class="gl-top">
        <span class="row" style="gap:8px"><button type="button" class="icon-btn back-btn" id="tb-back" aria-label="뒤로">${icon.left(18)}</button><span class="eyebrow">체크리스트</span></span>
        ${modeSeg("board")}
      </header>
      <section class="tb-head">
        <div><h1 class="gl-title tb-title">할 일 보드</h1><p class="tb-sum" id="tb-sum" aria-live="polite"></p></div>
        <button type="button" class="btn accent tb-new" id="tb-new">${icon.plus(15)}<span>새 할 일</span></button>
      </section>
      <div class="tb-kpis" id="tb-kpis" role="group" aria-label="요약 — 누르면 그것만 보여요"></div>
      <div class="tb-filters">
        <div class="seg sm tb-range" role="tablist" aria-label="기간">${[["today", "오늘"], ["week", "이번 주"], ["all", "전체"]].map(([k, l]) => `<button type="button" role="tab" data-range="${k}" aria-selected="${S.f.range === k}">${l}</button>`).join("")}</div>
        <button type="button" class="tb-fbtn" id="tb-fproj" aria-haspopup="listbox"></button>
        <button type="button" class="tb-fbtn" id="tb-fprio" aria-haspopup="listbox"></button>
        <label class="tb-search">${icon.search(14)}<input id="tb-q" type="search" placeholder="이름 · 프로젝트 · 메모로 찾기" aria-label="할 일 찾기" autocomplete="off"></label>
        <button type="button" class="btn sm ghost tb-clear" id="tb-clear" hidden>필터 지우기</button>
      </div>
      <div class="tb-board" id="tb-board" aria-label="할 일 보드"><p class="faint gl-load">불러오는 중…</p></div>
      <nav class="tb-tabs" id="tb-tabs" aria-label="칸 고르기"></nav>
      <p class="sr-only" id="tb-live" aria-live="assertive"></p>
    </div>`;
  const board = $("#tb-board", root), live = $("#tb-live", root);
  const say = (m) => { live.textContent = ""; setTimeout(() => { live.textContent = m; }, 30); };
  const ids = () => S.cols.map((c) => c.id);
  const colName = (id) => S.cols.find((c) => c.id === id)?.name || id;
  const eff = (p) => { const c = M.colOf(p, ids()); return c === "todo" ? null : c; }; // 서버에 보낼 칸 (할 일 = null)
  const byId = (id) => S.list?.find((x) => x.id === resolveId(id) || x.id === id);
  const projects = () => { const n = new Map(); for (const p of S.list || []) if (p.project) n.set(p.project, (n.get(p.project) || 0) + 1); return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k); };
  const visible = () => M.filterList(S.list || [], S.f);
  const inCol = (list, col) => list.filter((p) => M.colOf(p, ids()) === col).sort(M.byOrder);

  // ---------- 그리기 ----------
  function card(p, t) {
    const late = M.isLate(p, t), [d, n] = M.subProgress(p), pr = PRIO[p.priority], day = M.dayOf(p);
    const top = (p.project ? `<span class="tb-proj" style="--tc:var(--tb-${M.tagColor(p.project, S.tags)})">${esc(p.project)}</span>` : "") + (pr ? `<span class="tb-flag p-${p.priority}">${FLAG}${pr.label}</span>` : "");
    const meta = (p.due ? `<span class="tb-due${late ? " late" : ""}" title="마감일">${CAL}${late ? "늦음 · " : ""}${esc(M.dayLabel(p.due))}</span>` : day && day !== t ? `<span class="tb-day" title="하는 날">${esc(M.dayLabel(day))}</span>` : "")
      + (p.note ? `<span class="tb-noteic" title="메모 있음">${NOTE}</span>` : "");
    const label = [p.text, p.project && `프로젝트 ${p.project}`, pr && `우선순위 ${pr.label}`, p.due && `마감 ${M.dayLabel(p.due)}${late ? " 늦음" : ""}`, n && `작은 할 일 ${d}/${n}`].filter(Boolean).join(", ");
    return `<article class="tb-card${p.done ? " done" : ""}${late ? " late" : ""}" role="listitem" tabindex="0" data-id="${esc(p.id)}" aria-label="${esc(label)}">
      ${top ? `<div class="tb-card-top">${top}</div>` : ""}
      <div class="tb-card-main"><button type="button" class="tb-check" data-check="${esc(p.id)}" aria-pressed="${!!p.done}" aria-label="${p.done ? "끝냄 되돌리기" : "끝냄"}">${TICK}</button><p class="tb-text">${esc(p.text)}</p></div>
      ${n ? `<div class="tb-prog"><span class="tb-bar"><i style="--f:${(d / n) * 100}%"></i></span><span class="tb-subn">${d}/${n}</span></div>` : ""}
      ${meta ? `<div class="tb-meta">${meta}</div>` : ""}
    </article>`;
  }
  function drawHead() {
    const all = S.list || [], k = M.kpis(all), vis = visible();
    $("#tb-sum", root).innerHTML = S.list ? (k.projects ? `프로젝트 ${k.projects}개에 열린 일 <b>${k.open}</b>개` : `열린 일 <b>${k.open}</b>개`) + (vis.length !== all.length ? ` <span class="faint">· ${vis.length}개 보는 중</span>` : "") : "";
    $("#tb-kpis", root).innerHTML = [["open", "열린 일", k.open], ["dueWeek", "이번 주 마감", k.dueWeek], ["late", "늦은 일", k.late], ["doneWeek", "이번 주 완료", k.doneWeek]]
      .map(([key, l, n]) => `<button type="button" class="tb-kpi${key === "late" && n ? " warn" : ""}${S.f.kpi === key ? " on" : ""}" data-kpi="${key}" aria-pressed="${S.f.kpi === key}"><b>${n}</b><span>${l}</span></button>`).join("");
    $$("[data-range]", root).forEach((b) => b.setAttribute("aria-selected", String(S.f.range === b.dataset.range)));
    const fp = $("#tb-fproj", root), fr = $("#tb-fprio", root);
    fp.innerHTML = `<span>${S.f.project === "-" ? "프로젝트 없음" : S.f.project ? esc(S.f.project) : "모든 프로젝트"}</span>▾`; fp.classList.toggle("on", !!S.f.project);
    fr.innerHTML = `<span>${S.f.prio === "urgent" ? "긴급 · 높음" : S.f.prio === "-" ? "우선순위 없음" : PRIO[S.f.prio] ? `${PRIO[S.f.prio].n} ${PRIO[S.f.prio].label}` : "모든 우선순위"}</span>▾`; fr.classList.toggle("on", !!S.f.prio);
    $("#tb-clear", root).hidden = !(S.f.project || S.f.prio || S.f.q || S.f.kpi);
  }
  function drawBoard() {
    if (!S.list) return;
    const t = ymd(today()), vis = visible();
    const focused = board.contains(document.activeElement) ? document.activeElement.closest(".tb-card")?.dataset.id : null;
    const sl = board.scrollLeft;
    board.innerHTML = S.cols.map((c) => {
      const items = inCol(vis, c.id);
      return `<section class="tb-col" data-col="${esc(c.id)}" aria-label="${esc(c.name)} ${items.length}개">
        <header class="tb-col-h">
          <i class="tb-col-dot tb-k-${c.id === "todo" || c.id === "doing" || c.id === "done" ? c.id : "own"}"></i>
          <h2 class="tb-col-name" data-rename="${esc(c.id)}" title="두 번 눌러 이름 바꾸기">${esc(c.name)}</h2><span class="tb-count">${items.length}</span>
          <span class="tb-col-act"><button type="button" class="icon-btn sm" data-add="${esc(c.id)}" aria-label="${esc(c.name)}에 할 일 더하기" title="더하기">${icon.plus(15)}</button><button type="button" class="icon-btn sm tb-more" data-colmenu="${esc(c.id)}" aria-label="${esc(c.name)} 칸 메뉴" aria-haspopup="menu">⋯</button></span>
        </header>
        ${S.adding === c.id ? `<form class="tb-add" data-addform="${esc(c.id)}" autocomplete="off"><input class="input sm" name="text" maxlength="200" placeholder="할 일 · Enter (Esc 닫기)" aria-label="${esc(c.name)}에 더할 할 일"></form>` : ""}
        <div class="tb-body" role="list">${items.map((p) => card(p, t)).join("")}<p class="tb-empty">${c.id === "done" ? "끝낸 카드를 여기로 끌어 오세요" : "비어 있어요"}</p></div>
      </section>`;
    }).join("") + (S.cols.length < 8 ? `<button type="button" class="tb-addcol" data-addcol>${icon.plus(14)} 칸 더하기</button>` : "");
    board.scrollLeft = sl;
    $("#tb-tabs", root).innerHTML = S.cols.map((c) => `<button type="button" data-tab="${esc(c.id)}">${esc(c.name)} <b>${inCol(vis, c.id).length}</b></button>`).join("");
    markTab();
    if (focused) board.querySelector(`.tb-card[data-id="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    if (S.adding) { const inp = board.querySelector(`[data-addform] input`); if (inp && document.activeElement?.tagName !== "INPUT") inp.focus({ preventScroll: true }); }
  }
  function draw() { drawHead(); drawBoard(); if (sheet && !sheet.closed()) { const p = byId(sheet.id()); if (p) sheet.refresh(p, S.cols, S.tags); else sheet.close(); } }
  function markTab() {
    const cols = $$(".tb-col", board); if (!cols.length) return;
    const mid = board.scrollLeft + board.clientWidth / 2;
    let on = cols[0].dataset.col;
    for (const c of cols) if (c.offsetLeft <= mid) on = c.dataset.col;
    $$("[data-tab]", root).forEach((b) => b.setAttribute("aria-current", String(b.dataset.tab === on)));
  }

  // ---------- 서버 ----------
  const changed = () => { S.selfAt = Date.now(); ctx.changed?.("plans"); };
  function put(plan) { if (!plan) return; const i = S.list.findIndex((x) => x.id === plan.id); if (i >= 0) S.list[i] = plan; else S.list.push(plan); }
  async function remote(id, vals) { const { plan } = await api.updatePlan(resolveId(id), vals); put(plan); draw(); changed(); }
  function applyLocal(p, after) {
    for (const [k, v] of Object.entries(after)) p[k] = Array.isArray(v) ? v.map((x) => ({ ...x })) : v;
    if ("status" in after) { if (after.status === "done") { if (!p.done) p.done_at = Date.now(); p.done = 1; p.missed = 0; } else if (p.done) { p.done = 0; p.done_at = null; } }
  }
  const pickBefore = (p, after) => Object.fromEntries(Object.keys(after).map((k) => [k, k === "status" ? eff(p) : Array.isArray(p[k]) ? p[k].map((x) => ({ ...x })) : p[k] ?? null]));
  async function patch(p, after, label) {
    const before = pickBefore(p, after);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const snap = { ...p }; applyLocal(p, after); draw();
    try {
      const { plan } = await api.updatePlan(p.id, after); put(plan); draw(); changed();
      const id = plan.id;
      u.push({ label, undo: () => remote(id, before), redo: () => remote(id, after) });
    } catch (e) { Object.assign(p, snap); draw(); toast(e.message, "err"); }
  }
  // 칸 col 의 index 자리로 (보이는 카드 기준 앞 · 뒤 사이)
  function sortAt(p, col, index) {
    const arr = inCol(visible(), col).filter((x) => x.id !== p.id);
    return M.sortBetween(arr[index - 1]?.sort ?? null, arr[index]?.sort ?? null);
  }
  function move(p, col, index, how = "") {
    const after = { status: col === "todo" ? null : col, sort: sortAt(p, col, index) };
    const label = `‘${p.text.slice(0, 14)}’ → ${colName(col)}`;
    if (col !== M.colOf(p, ids())) say(`${p.text}, ${colName(col)} 칸으로 옮겼어요${how}`);
    return patch(p, after, label);
  }
  const toggleDone = (p) => move(p, p.done ? "todo" : "done", 0);

  async function add(col, text) {
    const all = inCol(S.list, col), top = all[0]?.sort ?? null;
    const b = { scope: "day", period: "D:" + ymd(today()), text: text.slice(0, 200), sort: M.sortBetween(null, top), ...(col !== "todo" ? { status: col } : {}), ...(S.f.project && S.f.project !== "-" ? { project: S.f.project } : {}) };
    try {
      const { plan } = await api.addPlan(b); S.list.push(plan); draw(); changed();
      let snap = { ...plan };
      u.push({
        label: "더하기",
        undo: async () => { const cur = byId(snap.id); if (cur) snap = { ...cur, status: eff(cur) }; await api.deletePlan(resolveId(snap.id)).catch((e) => { if (e.status !== 404) throw e; }); S.list = S.list.filter((x) => x.id !== resolveId(snap.id)); draw(); changed(); },
        redo: async () => { const np = await recreatePlan(snap); put(np); draw(); changed(); },
      });
      say(`${colName(col)} 칸에 ‘${plan.text}’ 를 더했어요`);
      return true;
    } catch (e) { toast(e.message, "err"); return false; }
  }
  async function del(p) {
    const snap = { ...p, status: eff(p) }, keep = S.list;
    S.list = S.list.filter((x) => x !== p); draw();
    try {
      await api.deletePlan(p.id); changed();
      u.push({
        label: "지우기",
        undo: async () => { const np = await recreatePlan(snap); put(np); draw(); changed(); },
        redo: async () => { await api.deletePlan(resolveId(snap.id)).catch((e) => { if (e.status !== 404) throw e; }); S.list = S.list.filter((x) => x.id !== resolveId(snap.id)); draw(); changed(); },
      });
      toast("지웠어요 · ⌘Z 로 되돌려요");
    } catch (e) { S.list = keep; draw(); toast(e.message, "err"); }
  }
  // 칸 설정 · 프로젝트 색 (지운 칸의 카드는 서버가 '할 일' 칸으로 옮기고, 되돌리면 원래 칸으로)
  async function saveBoard(next, label) {
    const prev = { cols: S.cols.map((c) => ({ ...c })), tags: { ...S.tags } };
    const nx = { cols: next.cols || prev.cols, tags: next.tags || prev.tags };
    const gone = prev.cols.filter((c) => !nx.cols.some((x) => x.id === c.id)).map((c) => c.id);
    const moved = (S.list || []).filter((p) => !p.done && gone.includes(p.status)).map((p) => ({ id: p.id, status: p.status }));
    const apply = (v, mv) => { S.cols = v.cols; S.tags = v.tags; for (const m of mv) { const p = byId(m.id); if (p) p.status = null; } draw(); };
    apply(nx, moved);
    try {
      await api.saveBoardCols(nx); changed();
      u.push({
        label,
        undo: async () => { await api.saveBoardCols(prev); S.cols = prev.cols; S.tags = prev.tags; for (const m of moved) await remote(m.id, { status: m.status }); draw(); changed(); },
        redo: async () => { await api.saveBoardCols(nx); apply(nx, moved); changed(); },
      });
    } catch (e) { S.cols = prev.cols; S.tags = prev.tags; for (const m of moved) { const p = byId(m.id); if (p) p.status = m.status; } draw(); toast(e.message, "err"); }
  }

  async function load() {
    const t = today();
    try {
      const [{ plans }, c] = await Promise.all([api.boardPlans(ymd(addDays(t, -30)), addDays(t, -14).getTime()), api.boardCols()]);
      S.list = plans || []; S.cols = c.cols?.length ? c.cols : DEF_COLS; S.tags = c.tags || {};
      draw();
    } catch (e) { board.innerHTML = `<p class="faint">${esc(e.message)}</p>`; }
  }

  // ---------- 자세히 ----------
  function openDetail(p) {
    sheet?.close();
    const id = p.id;
    sheet = openSheet({
      p, cols: S.cols, tags: S.tags, projects: projects(), colOf: (x) => M.colOf(x, ids()),
      on: {
        patch: (after, label) => { const cur = byId(id); if (cur) patch(cur, after, label); },
        move: (col) => { const cur = byId(id); if (cur) move(cur, col, 0); },
        del: () => { const cur = byId(id); if (cur) del(cur); },
        tag: (name, color) => saveBoard({ tags: { ...S.tags, [name]: color } }, "프로젝트 색"),
        close: () => { sheet = null; },
      },
    });
  }

  // ---------- 칸: 이름 바꾸기 · 더하기 · 옮기기 · 지우기 ----------
  function rename(colId) {
    const h = board.querySelector(`[data-rename="${CSS.escape(colId)}"]`); if (!h) return;
    const c = S.cols.find((x) => x.id === colId), inp = document.createElement("input");
    inp.className = "input sm tb-col-in"; inp.maxLength = 20; inp.value = c.name; inp.setAttribute("aria-label", "칸 이름");
    h.replaceWith(inp); inp.focus(); inp.select();
    let fin = false;
    const done = (save) => { if (fin) return; fin = true; const v = inp.value.trim(); if (save && v && v !== c.name) saveBoard({ cols: S.cols.map((x) => (x.id === colId ? { ...x, name: v } : x)) }, "칸 이름"); else drawBoard(); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); done(true); } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } });
    inp.addEventListener("blur", () => done(true));
  }
  function addCol() {
    const id = "c-" + Math.random().toString(36).slice(2, 8), cols = S.cols.slice(), at = cols.findIndex((c) => c.id === "done");
    cols.splice(at < 0 ? cols.length : at, 0, { id, name: "새 칸" });
    saveBoard({ cols }, "칸 더하기").then(() => rename(id));
  }
  function colMenu(e, colId) {
    const i = S.cols.findIndex((c) => c.id === colId), fixed = colId === "todo" || colId === "done";
    const r = e.target.closest("button").getBoundingClientRect();
    openMenu({ preventDefault() {}, clientX: r.left, clientY: r.bottom + 4 }, {
      title: colName(colId),
      items: [{ k: "rename", label: "이름 바꾸기" }, ...(i > 0 ? [{ k: "left", label: "왼쪽으로 옮기기" }] : []), ...(i < S.cols.length - 1 ? [{ k: "right", label: "오른쪽으로 옮기기" }] : []),
        ...(fixed ? [] : [{ sep: true }, { k: "del", label: "칸 지우기", hint: "카드는 '할 일' 칸으로", danger: true }])],
      onPick: (k) => {
        if (k === "rename") return rename(colId);
        if (k === "left" || k === "right") { const cols = S.cols.slice(), j = k === "left" ? i - 1 : i + 1; [cols[i], cols[j]] = [cols[j], cols[i]]; return saveBoard({ cols }, "칸 옮기기"); }
        if (k === "del") saveBoard({ cols: S.cols.filter((c) => c.id !== colId) }, "칸 지우기");
      },
    });
  }
  function cardMenu(e, p) {
    const cur = M.colOf(p, ids());
    openMenu(e, {
      title: p.text,
      items: [{ k: "open", label: "자세히" }, { k: "done", label: p.done ? "끝냄 되돌리기" : "끝냄" }, { sep: true },
        ...S.cols.filter((c) => c.id !== cur).map((c) => ({ k: "to:" + c.id, label: `→ ${c.name}` })), { sep: true }, { k: "del", label: "지우기", danger: true }],
      onPick: (k) => {
        if (k === "open") return openDetail(p);
        if (k === "done") return toggleDone(p);
        if (k === "del") return del(p);
        if (k.startsWith("to:")) move(p, k.slice(3), 0);
      },
    });
  }

  // ---------- 손 ----------
  const stopDrag = boardDrag(board, {
    scroller: () => board,
    onDrop: (id, col, index) => { const p = byId(id); if (p) move(p, col, index); else drawBoard(); },
    onCancel: () => drawBoard(),
  });
  root.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("#tb-back")) return window.trioBack?.();
    const ck = t.closest("[data-check]"); if (ck) { const p = byId(ck.dataset.check); if (p) toggleDone(p); return; }
    const ad = t.closest("[data-add]"); if (ad) { S.adding = S.adding === ad.dataset.add ? null : ad.dataset.add; drawBoard(); return; }
    if (t.closest("#tb-new")) { S.adding = "todo"; drawBoard(); board.querySelector(".tb-col")?.scrollIntoView({ block: "nearest", inline: "start", behavior: "smooth" }); return; }
    const cm = t.closest("[data-colmenu]"); if (cm) return colMenu(e, cm.dataset.colmenu);
    if (t.closest("[data-addcol]")) return addCol();
    const kp = t.closest("[data-kpi]"); if (kp) { S.f.kpi = S.f.kpi === kp.dataset.kpi ? "" : kp.dataset.kpi; return draw(); }
    const rg = t.closest("[data-range]"); if (rg) { S.f.range = rg.dataset.range; savePref(ctx, { ...readPref(ctx), range: S.f.range }); return draw(); }
    if (t.closest("#tb-clear")) { Object.assign(S.f, { project: "", prio: "", q: "", kpi: "" }); $("#tb-q", root).value = ""; return draw(); }
    const fp = t.closest("#tb-fproj");
    if (fp) return openDrop(fp, { label: "프로젝트", items: [{ v: "", label: "모든 프로젝트", on: !S.f.project }, ...projects().map((x) => ({ v: x, label: x, on: S.f.project === x })), { v: "-", label: "프로젝트 없음", on: S.f.project === "-" }], onPick: (v) => { S.f.project = v; draw(); } });
    const fr = t.closest("#tb-fprio");
    if (fr) return openDrop(fr, { label: "우선순위", items: [{ v: "", label: "모든 우선순위", on: !S.f.prio }, { v: "urgent", label: "긴급 · 높음", on: S.f.prio === "urgent" }, ...PRIO_CHIPS.map((c) => ({ v: c.k, p: c.k, label: `${c.n} ${c.label}`, on: S.f.prio === c.k })), { v: "-", label: "우선순위 없음", on: S.f.prio === "-" }], onPick: (v) => { S.f.prio = v; draw(); } });
    const tb = t.closest("[data-tab]"); if (tb) { const c = board.querySelector(`.tb-col[data-col="${CSS.escape(tb.dataset.tab)}"]`); if (c) board.scrollTo({ left: c.offsetLeft - board.offsetLeft - 12, behavior: "smooth" }); return; }
    const cd = t.closest(".tb-card"); if (cd && !t.closest("button, input, a")) { const p = byId(cd.dataset.id); if (p) openDetail(p); }
  });
  root.addEventListener("dblclick", (e) => { const h = e.target.closest("[data-rename]"); if (h) rename(h.dataset.rename); });
  root.addEventListener("contextmenu", (e) => { const cd = e.target.closest(".tb-card"); if (!cd) return; const p = byId(cd.dataset.id); if (p) cardMenu(e, p); });
  root.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-addform]"); if (!f) return;
    e.preventDefault();
    const inp = f.text, v = inp.value.trim(); if (!v || S.busy) return;
    S.busy = true;
    try { if (await add(f.dataset.addform, v)) { const n = board.querySelector("[data-addform] input"); if (n) { n.value = ""; n.focus(); } } } finally { S.busy = false; }
  });
  root.addEventListener("keydown", (e) => {
    if (e.target.closest("[data-addform]") && e.key === "Escape") { e.preventDefault(); S.adding = null; drawBoard(); return; }
    const cd = e.target.closest?.(".tb-card"); if (!cd || e.target !== cd || e.metaKey || e.ctrlKey) return;
    const p = byId(cd.dataset.id); if (!p) return;
    const col = M.colOf(p, ids()), ci = ids().indexOf(col), list = inCol(visible(), col), i = list.findIndex((x) => x.id === p.id);
    const k = e.key;
    if (k === "Enter" || k === " ") { e.preventDefault(); return openDetail(p); }
    if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault(); const nc = S.cols[ci + (k === "ArrowLeft" ? -1 : 1)]; if (!nc) return;
      return move(p, nc.id, 0, " (맨 위)");
    }
    if ((k === "ArrowUp" || k === "ArrowDown") && e.altKey) {
      e.preventDefault(); const j = i + (k === "ArrowUp" ? -1 : 1); if (j < 0 || j >= list.length) return;
      move(p, col, j); say(`${j + 1}번째로 옮겼어요`); return;
    }
    if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); const n = list[i + (k === "ArrowUp" ? -1 : 1)]; if (n) board.querySelector(`.tb-card[data-id="${CSS.escape(n.id)}"]`)?.focus(); return; }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); return del(p); }
  });
  let qT = 0;
  $("#tb-q", root).addEventListener("input", (e) => { clearTimeout(qT); qT = setTimeout(() => { S.f.q = e.target.value; draw(); }, 120); });
  board.addEventListener("scroll", () => markTab(), { passive: true });
  const onChanged = (e) => { if (e.detail?.kind === "plans" && !S.busy && !document.body.classList.contains("tb-dragging") && Date.now() - (S.selfAt || 0) > 1500) load(); };
  window.addEventListener("trio:changed", onChanged);

  load();
  return {
    reload: load,
    dispose() { stopDrag(); u.dispose(); sheet?.close(); closeMenu(); clearTimeout(qT); window.removeEventListener("trio:changed", onChanged); },
  };
}

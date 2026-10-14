// 노트 우클릭 메뉴 — Brain 그래프 점 · Brain 목록 · 노트 왼쪽 목록이 같이 써요.
//   여는 법: 오른쪽 클릭 · 폰은 0.5초 길게 누르기 · 목록 칸에 초점이 있으면 ContextMenu 키 / Shift+F10
//   Open · Rename · Edit · New sub-note · Move to… · Delete(바로 사라지고 5초 안에 Undo, 그 뒤에 서버에서 지워요)
//   개념 5개 · Unsorted 는 Open · New sub-note 만, 공부 점(s:*) · 노트가 아닌 개념 점은 Open 만.
//   바뀌면 ctx.changed("notes", { note: { op, id, local? } }) — local = 아직 서버에 안 간 것(지우기 대기 · 되돌리기)이라 다시 받지 말고 다시 그리기만
//   n(노트 점) = { id, title, parent_id, note: 진짜 노트면 true, kind?: "concept" | "study" }
import { api } from "./api.js";
import { esc, toast } from "./util.js";
import { openMenu } from "./ctxmenu.js";
import { CONCEPTS } from "./graph/brain-data.js";

const KEEP = new Set([...CONCEPTS.map((c) => c.title), "Unsorted"].map((t) => t.toLowerCase())); // 맨 위 개념: 지우기 · 이름 · 옮기기 없음
const UNDO_MS = 5000;

function roleOf(n) {
  if (!n.note || n.kind === "study" || n.id.startsWith("s:")) return "open";
  if (n.kind === "concept" || (!n.parent_id && KEEP.has(n.title.trim().toLowerCase()))) return "concept";
  return "note";
}
const ITEMS = {
  note: [{ k: "open", label: "Open" }, { k: "rename", label: "Rename" }, { k: "edit", label: "Edit" }, { k: "sub", label: "New sub-note" }, { k: "move", label: "Move to…" }, { sep: true }, { k: "del", label: "Delete", danger: true }],
  concept: [{ k: "open", label: "Open" }, { k: "sub", label: "New sub-note" }],
  open: [{ k: "open", label: "Open" }],
};

// h = { ctx, open(n), edit?(id), before?(), anchor? } — before: 열린 편집기에 저장 안 된 글을 먼저 보내요 (notes.js) · anchor: 닫으면 초점이 돌아갈 칸
export function openNoteMenu(e, n, h) {
  if (e.hold) ghost = true;
  openMenu(e, { title: n.title, items: ITEMS[roleOf(n)], back: h.anchor, onPick: async (k) => {
    if (k === "open") return h.open(n);
    try { await h.before?.(); } catch {}
    if (k === "rename") rename(n, h);
    else if (k === "edit") edit(n.id, h);
    else if (k === "sub") newSub(n, h);
    else if (k === "move") move(n, h);
    else if (k === "del") deleteWithUndo(n, h.ctx);
  } });
}

// 목록 칸(sel)마다 메뉴: 오른쪽 클릭 · 길게 누르기(10px 넘게 움직이면 스크롤이에요) · ContextMenu 키 / Shift+F10. nodeOf(칸) → n
export function bindNoteMenu(host, sel, nodeOf, h) {
  let t = 0, x0 = 0, y0 = 0, last = 0;
  const show = (e, el) => { const n = nodeOf(el); if (n) openNoteMenu(e, n, { ...h, anchor: el }); };
  host.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(sel); if (!el) return;
    if (performance.now() - last < 800) return e.preventDefault(); // 방금 키 · 길게 누르기로 띄웠는데 브라우저가 한 번 더 보냈어요
    if (t) { clearTimeout(t); t = 0; ghost = true; } // 안드로이드: 길게 누르기를 브라우저가 먼저 알렸어요
    show(e, el);
  });
  host.addEventListener("keydown", (e) => {
    if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
    const el = e.target.closest(sel); if (!el) return;
    e.preventDefault(); last = performance.now();
    const r = el.getBoundingClientRect();
    show({ preventDefault() {}, clientX: r.left + 16, clientY: r.bottom - 6 }, el);
  });
  // 폰(특히 iPhone)은 길게 눌러도 contextmenu 가 안 와서 직접 띄워요 (study.js 와 같은 0.5초)
  host.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") { last = 0; return; } // 진짜 오른쪽 클릭은 위 '방금 띄움' 막기에 걸리지 않게
    const el = e.target.closest(sel); if (!el) return;
    clearTimeout(t); x0 = e.clientX; y0 = e.clientY;
    t = setTimeout(() => { t = 0; last = performance.now(); show({ preventDefault() {}, clientX: x0, clientY: y0, hold: true }, el); }, 500);
  });
  host.addEventListener("pointermove", (e) => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) { clearTimeout(t); t = 0; } });
  for (const k of ["pointerup", "pointercancel"]) host.addEventListener(k, () => { clearTimeout(t); t = 0; });
}
// 길게 눌러 연 메뉴: 손가락을 떼며 따라오는 click 한 번은 버려요 (메뉴가 손가락 밑에 떠서 첫 줄이 눌리지 않게). 새로 누르면 풀려요
let ghost = false;
for (const k of ["pointerdown", "keydown"]) addEventListener(k, () => { ghost = false; }, true);
addEventListener("click", (e) => { if (ghost) { ghost = false; e.preventDefault(); e.stopPropagation(); } }, true);

// ---------- 작은 창 (팔레트 모양, 위쪽 가운데라 폰 키보드에 가리지 않아요). Esc · 바깥 누르기 = 닫기, 닫으면 초점은 연 자리로 ----------
function sheet(inner, back) {
  const wrap = document.createElement("div");
  wrap.className = "palette-back nm-back";
  wrap.innerHTML = inner;
  document.body.appendChild(wrap);
  const onKey = (e) => { if (e.key === "Escape" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); close(); } };
  const close = (refocus = true) => { if (!wrap.isConnected) return; wrap.remove(); document.removeEventListener("keydown", onKey, true); if (refocus && back?.isConnected) back.focus({ preventScroll: true }); };
  document.addEventListener("keydown", onKey, true);
  wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) close(); });
  return { el: wrap, close };
}
// 제목 하나 묻기: Enter = 저장 · Esc = 취소. submit(v) 가 글을 돌려주면 오류로 띄우고 창은 그대로
function ask({ head, sub, value = "", ok, label, back, refocus = true }, submit) {
  const s = sheet(`
    <form class="palette nm" role="dialog" aria-modal="true" aria-labelledby="nm-h">
      <div class="nm-head"><b id="nm-h">${esc(head)}</b><span>${esc(sub)}</span></div>
      <input name="t" maxlength="120" autocomplete="off" spellcheck="false" aria-label="${esc(label)}" value="${esc(value)}">
      <p class="nm-err" role="alert" hidden></p>
      <div class="foot"><span class="nm-k"><kbd>Enter</kbd> ${esc(ok)}</span><span class="nm-k"><kbd>Esc</kbd> Cancel</span><span class="nm-btns"><button class="btn ghost sm" type="button" data-x>Cancel</button><button class="btn sm accent" type="submit">${esc(ok)}</button></span></div>
    </form>`, back);
  const f = s.el.querySelector("form"), inp = f.elements.t, err = f.querySelector(".nm-err");
  f.querySelector("[data-x]").addEventListener("click", () => s.close());
  inp.addEventListener("input", () => { err.hidden = true; });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = inp.value.trim();
    if (!v || f.dataset.busy) return inp.focus();
    f.dataset.busy = "1";
    const msg = await submit(v).catch((x) => x.message || "다시 해 주세요.");
    delete f.dataset.busy;
    if (!msg) return s.close(refocus);
    err.textContent = msg; err.hidden = false; inp.focus(); inp.select();
  });
  inp.focus(); inp.select();
}

// ---------- 메뉴 항목 ----------
// Rename: 서버가 내 다른 노트의 [[옛 제목]] · [[옛 제목|별칭]] 도 새 제목으로 고쳐요 (relinked)
function rename(n, h) {
  ask({ head: "Rename", sub: n.title, value: n.title, ok: "Save", label: "새 이름", back: h.anchor }, async (v) => {
    if (v === n.title) return;
    try {
      const r = await api.saveNote(n.id, { title: v });
      const k = r.relinked?.length || 0;
      toast(k ? `이름을 바꿨어요 · 링크한 노트 ${k}개도 고쳤어요.` : "이름을 바꿨어요.");
      h.ctx.refreshSide();
      h.ctx.changed("notes", { note: { op: "rename", id: n.id, relinked: r.relinked || [] } });
    } catch (e) { return e.status === 409 ? "같은 제목의 노트가 이미 있어요." : e.message; }
  });
}
// Edit = 블록 편집으로 열기. 노트 화면이 떠 있으면 그쪽(h.edit)이, 아니면 보기 방식 칸(notes.js 의 trio-ed-mode)을 block 으로 두고 가요
function edit(id, h) {
  if (h.edit) return h.edit(id);
  try { localStorage.setItem("trio-ed-mode", "block"); } catch {}
  h.ctx.go("#/notes/" + id);
}
function newSub(n, h) {
  ask({ head: "New sub-note", sub: n.title, ok: "Create", label: "새 하위 노트 제목", back: h.anchor, refocus: false }, async (v) => {
    try {
      const { note } = await api.addNote({ title: v, body: "", parent_id: n.id });
      h.ctx.refreshSide();
      h.ctx.changed("notes", { note: { op: "create", id: note.id } });
      edit(note.id, h);
    } catch (e) { return e.status === 409 ? "같은 제목의 노트가 이미 있어요. 다른 제목으로 해 주세요." : e.message; }
  });
}
// Move to…: 내 노트 찾기 창. 나와 내 하위 전체(고리가 생겨요) · 데이터베이스는 빼고, 맨 위(부모 없음)도 골라요. 서버도 고리는 400 으로 막아요
async function move(n, h) {
  let notes;
  try { notes = (await api.notes()).notes; } catch (e) { return toast(e.message, "err"); }
  const kids = new Map(), byId = new Map(notes.map((x) => [x.id, x]));
  for (const x of notes) if (x.parent_id) { if (!kids.has(x.parent_id)) kids.set(x.parent_id, []); kids.get(x.parent_id).push(x.id); }
  const out = new Set([n.id]);
  for (const id of out) for (const k of kids.get(id) || []) out.add(k);
  const all = notes.filter((x) => !out.has(x.id) && x.kind !== "database" && !gone.has(x.id));
  const now = byId.get(n.id)?.parent_id ?? n.parent_id ?? null, TOP = { id: null, title: "Top level (no parent)" };
  const s = sheet(`
    <div class="palette nm nm-move" role="dialog" aria-modal="true" aria-labelledby="nm-h">
      <div class="nm-head"><b id="nm-h">Move to…</b><span>${esc(n.title)}</span></div>
      <input role="combobox" aria-expanded="true" aria-controls="nm-list" aria-label="옮길 곳 찾기" placeholder="Find a note" autocomplete="off" spellcheck="false">
      <p class="nm-err" role="alert" hidden></p>
      <ul id="nm-list" role="listbox" aria-label="옮길 곳"></ul>
      <div class="foot"><span class="nm-k"><kbd>↑</kbd> <kbd>↓</kbd> Choose</span><span class="nm-k"><kbd>Enter</kbd> Move</span><span><kbd>Esc</kbd> Cancel</span></div>
    </div>`, h.anchor);
  const inp = s.el.querySelector("input"), list = s.el.querySelector("ul"), err = s.el.querySelector(".nm-err");
  let opts = [], sel = 0, busy = false;
  const draw = () => {
    const q = inp.value.trim().toLowerCase(), hits = all.filter((x) => !q || x.title.toLowerCase().includes(q));
    opts = [...(!q || TOP.title.toLowerCase().includes(q) ? [TOP] : []), ...hits.slice(0, 100)];
    sel = Math.min(sel, Math.max(0, opts.length - 1));
    list.innerHTML = opts.map((o, i) => `<li><button type="button" role="option" id="nm-o${i}" data-i="${i}" aria-selected="${i === sel}"><span class="t">${esc(o.title)}</span><span class="s">${o.id === now ? "current" : esc(byId.get(o.parent_id)?.title || "")}</span></button></li>`).join("")
      + (hits.length > 100 ? `<li class="grp">+${hits.length - 100} more · type to narrow</li>` : "") + (opts.length ? "" : `<li class="grp">No match</li>`);
    if (opts.length) inp.setAttribute("aria-activedescendant", "nm-o" + sel); else inp.removeAttribute("aria-activedescendant");
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  const pick = async (o) => {
    if (!o || busy) return;
    if (o.id === now) return s.close();
    busy = true;
    try { await api.saveNote(n.id, { parent_id: o.id }); }
    catch (e) { busy = false; err.textContent = e.message; err.hidden = false; return; }
    s.close();
    toast(o.id ? `'${o.title}' 아래로 옮겼어요.` : "맨 위로 옮겼어요.");
    h.ctx.refreshSide();
    h.ctx.changed("notes", { note: { op: "move", id: n.id } });
  };
  inp.addEventListener("input", () => { sel = 0; err.hidden = true; draw(); });
  inp.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && opts.length) { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length; draw(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(opts[sel]); }
  });
  list.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) pick(opts[+b.dataset.i]); });
  draw(); inp.focus();
}

// ---------- Delete: 목록 · 그래프에서 바로 빠지고 5초 동안 Undo — 그동안 서버엔 아무것도 안 보내요 ----------
const gone = new Map(); // id → 부모 id: 지우는 중이거나 지운 노트 (다시 받은 목록에 아직 남아 있어도 빼고 그려요)
const wait = new Map(); // id → { t, el, ctx } 아직 서버에 안 보낸 지우기
export const isGone = (id) => gone.has(id);
// 지우는 중인 노트는 빼고, 그 하위는 서버가 할 것처럼 지운 노트의 부모 밑으로 한 칸 올려요 (Brain 나무가 끊기지 않게)
export function withoutGone(notes) {
  if (!gone.size) return notes;
  const up = (p) => { for (let i = 0; p && gone.has(p) && i < 40; i++) p = gone.get(p); return p || null; };
  return notes.filter((x) => !gone.has(x.id)).map((x) => (gone.has(x.parent_id) ? { ...x, parent_id: up(x.parent_id) } : x));
}
export function deleteWithUndo(n, ctx) {
  if (gone.has(n.id)) return;
  gone.set(n.id, n.parent_id || null);
  const el = document.createElement("div");
  el.className = "toast nm-undo"; el.setAttribute("role", "status");
  el.innerHTML = `<span>'${esc(n.title)}' 노트를 지웠어요.</span><button type="button" class="btn sm accent">Undo</button><i aria-hidden="true"></i>`;
  el.querySelector("button").addEventListener("click", () => undo(n.id));
  document.getElementById("toasts")?.appendChild(el);
  wait.set(n.id, { el, ctx, t: setTimeout(() => send(n.id), UNDO_MS) }); watch();
  ctx.changed("notes", { note: { op: "hide", id: n.id, local: true } });
}
function undo(id) {
  const w = wait.get(id); if (!w) return;
  clearTimeout(w.t); w.el.remove(); wait.delete(id); gone.delete(id); watch();
  w.ctx.changed("notes", { note: { op: "show", id, local: true } });
}
// 서버로: 보통은 api 로, 화면이 가려지거나 닫히는 중이면(leaving) keepalive 로 바로 — 주소 · 머리(x-trio)는 api.js 와 같아요
async function send(id, leaving = false) {
  const w = wait.get(id); if (!w) return;
  clearTimeout(w.t); w.el.remove(); wait.delete(id); watch();
  try {
    if (leaving) {
      const r = await fetch("/api/notes/" + encodeURIComponent(id), { method: "DELETE", keepalive: true, credentials: "include", headers: { "content-type": "application/json", "x-trio": "1" } });
      if (!r.ok && r.status !== 404) throw new Error((await r.json().catch(() => ({}))).error || "노트를 지우지 못했어요.");
    } else await api.deleteNote(id).catch((e) => { if (e.status !== 404) throw e; }); // 이미 없으면 지운 셈이에요
    w.ctx.refreshSide();
    w.ctx.changed("notes", { note: { op: "delete", id } });
  } catch (e) {
    gone.delete(id);
    toast(e.message || "노트를 지우지 못했어요.", "err");
    w.ctx.changed("notes", { note: { op: "show", id } });
  }
}
// 화면을 떠날 때 남은 지우기는 바로: 폰은 가려질 때(visibilitychange), 컴퓨터는 닫기 · 다른 주소 직전(beforeunload — 문서가 살아 있을 때 보내야
// bfcache 로 얼어도 요청이 나가요. 지울 게 남아 있을 때만 걸어서 bfcache 를 막지 않아요) · pagehide 는 마지막 그물
const leave = () => { for (const id of [...wait.keys()]) send(id, true); };
const watch = () => { if (wait.size) addEventListener("beforeunload", leave); else removeEventListener("beforeunload", leave); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") leave(); });
addEventListener("pagehide", leave);

// 노트 우클릭 메뉴 — Brain 그래프 점 · Brain 목록 · 노트 왼쪽 목록이 같이 써요.
//   여는 법: 오른쪽 클릭 · 폰은 0.5초 길게 누르기 · 목록 칸에 초점이 있으면 ContextMenu 키 / Shift+F10
//   열기 · 이름 바꾸기 · 편집 · 하위 노드 만들기 · 옮기기… · 연결 끊기 ▸ · 지우기(바로 사라지고 5초 안에 Undo, 그 뒤에 서버에서 지워요)
//   개념 5개 · Unsorted 는 열기 · 하위 노드 만들기만, 공부 점(s:*) · 노트가 아닌 개념 점은 열기만.
//   바뀌면 ctx.changed("notes", { note: { op, id, local? } }) — local = 아직 서버에 안 간 것(지우기 대기 · 되돌리기)이라 다시 받지 말고 다시 그리기만
//   n(노트 점) = { id, title, parent_id, note: 진짜 노트면 true, kind?: "concept" | "study" }
//   되돌리기(⌘Z · ⌘⇧Z, 2026-10-22): h.undo(undo.js 의 묶음)가 있으면 이름 · 만들기 · 옮기기 · 지우기 · 연결 · 연결 끊기를 기록해요.
//     서버에서 이미 지운 노트도 되살려요 — 같은 제목 · 글 · 블록 · 부모로 다시 만들고, 하위 노트를 다시 그 밑으로 (새 id 는 remap)
import { api } from "./api.js";
import { esc, toast } from "./util.js";
import { openMenu } from "./ctxmenu.js";
import { CONCEPTS } from "./graph/brain-data.js";
import { resolveId, remap } from "./undo.js";

const KEEP = new Set([...CONCEPTS.map((c) => c.title), "Unsorted"].map((t) => t.toLowerCase())); // 맨 위 개념: 지우기 · 이름 · 옮기기 없음
const UNDO_MS = 5000;

function roleOf(n) {
  if (!n.note || n.kind === "study" || n.id.startsWith("s:")) return "open";
  if (n.kind === "concept" || (!n.parent_id && KEEP.has(n.title.trim().toLowerCase()))) return "concept";
  return "note";
}
export const LABEL = { open: "열기", rename: "이름 바꾸기", edit: "편집", sub: "하위 노드 만들기", move: "옮기기…", unlink: "연결 끊기 ▸", del: "지우기" };
const it = (k, more) => ({ k, label: LABEL[k], ...more });
const ITEMS = {
  note: [it("open"), it("rename"), it("edit"), it("sub"), it("move"), { sep: true }, it("del", { danger: true })],
  concept: [it("open"), it("sub")],
  open: [it("open")],
};

// h = { ctx, open(n), edit?(id), before?(), anchor?, undo?, stay?, links?(n) → [{ id, title, src, dst }] }
//   before: 열린 편집기에 저장 안 된 글을 먼저 보내요 (notes.js) · anchor: 닫으면 초점이 돌아갈 칸
//   undo: 되돌리기 기록 · stay: 하위 노드를 만들어도 그 노트로 가지 않아요 (그래프) · links: '연결 끊기' 에 보일 연결
export function openNoteMenu(e, n, h) {
  if (e.hold) ghost = true;
  const at = { x: e.clientX, y: e.clientY };
  const linked = roleOf(n) === "note" ? h.links?.(n) || [] : [];
  const items = ITEMS[roleOf(n)].flatMap((x) => (x.k === "move" && linked.length ? [x, it("unlink")] : [x]));
  openMenu(e, { title: n.title, items, back: h.anchor, onPick: async (k) => {
    if (k === "open") return h.open(n);
    try { await h.before?.(); } catch {}
    if (k === "rename") rename(n, h, at);
    else if (k === "edit") edit(n.id, h);
    else if (k === "sub") newSub(n, h, at);
    else if (k === "move") move(n, h);
    else if (k === "unlink") setTimeout(() => openMenu({ clientX: at.x, clientY: at.y, preventDefault() {} }, {
      title: `연결 끊기 · ${n.title}`, back: h.anchor,
      items: linked.map((l, i) => ({ k: "l" + i, label: l.title })),
      onPick: (kk) => { const l = linked[+kk.slice(1)]; if (l) unlinkNotes(l.src, l.dst, h); },
    }), 0);
    else if (k === "del") deleteWithUndo(n, h.ctx, h.undo);
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
export const holdGuard = (e) => { if (e?.hold) ghost = true; }; // 다른 메뉴(그래프 빈 곳 · 선)도 같은 보호
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
//   at = { x, y } 가 있으면 그 자리(누른 곳)에 작은 칸으로 — 그래프 · 목록 우클릭 (화면 밖으로 나가지 않게)
//   pick = { label, value, options: [{ v, label }] } 이면 고르기 칸도 (submit(글, 고른 값))
export function ask({ head, sub, value = "", ok, label, back, refocus = true, at = null, pick = null }, submit) {
  const s = sheet(`
    <form class="palette nm" role="dialog" aria-modal="true" aria-labelledby="nm-h">
      <div class="nm-head"><b id="nm-h">${esc(head)}</b><span>${esc(sub)}</span></div>
      <input name="t" maxlength="120" autocomplete="off" spellcheck="false" aria-label="${esc(label)}" value="${esc(value)}">
      ${pick ? `<label class="nm-pick"><span>${esc(pick.label)}</span><select name="p">${pick.options.map((o) => `<option value="${esc(o.v)}"${o.v === pick.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>` : ""}
      <p class="nm-err" role="alert" hidden></p>
      <div class="foot"><span class="nm-k"><kbd>Enter</kbd> ${esc(ok)}</span><span class="nm-k"><kbd>Esc</kbd> 취소</span><span class="nm-btns"><button class="btn ghost sm" type="button" data-x>취소</button><button class="btn sm accent" type="submit">${esc(ok)}</button></span></div>
    </form>`, back);
  const f = s.el.querySelector("form"), inp = f.elements.t, err = f.querySelector(".nm-err");
  if (at && Number.isFinite(at.x) && innerWidth > 520) { // 폰은 위쪽 가운데 그대로 (키보드에 가리지 않게)
    s.el.classList.add("nm-pop-back"); f.classList.add("nm-pop");
    const w = Math.min(340, innerWidth - 16), hh = f.offsetHeight || 150;
    f.style.left = Math.max(8, Math.min(at.x - 18, innerWidth - w - 8)) + "px";
    f.style.top = Math.max(8, Math.min(at.y + 8, innerHeight - hh - 8)) + "px";
  }
  f.querySelector("[data-x]").addEventListener("click", () => s.close());
  inp.addEventListener("input", () => { err.hidden = true; });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = inp.value.trim();
    if (!v || f.dataset.busy) return inp.focus();
    f.dataset.busy = "1";
    const msg = await submit(v, f.elements.p?.value).catch((x) => x.message || "다시 해 주세요.");
    delete f.dataset.busy;
    if (!msg) return s.close(refocus);
    err.textContent = msg; err.hidden = false; inp.focus(); inp.select();
  });
  inp.focus(); inp.select();
}

// ---------- 메뉴 항목 ----------
// Rename: 서버가 내 다른 노트의 [[옛 제목]] · [[옛 제목|별칭]] 도 새 제목으로 고쳐요 (relinked)
const told = (h, op, id, more = {}) => { h.ctx.refreshSide(); h.ctx.changed("notes", { note: { op, id, ...more } }); };
async function setTitle(h, id, title) {
  const r = await api.saveNote(resolveId(id), { title });
  told(h, "rename", resolveId(id), { relinked: r.relinked || [] });
  return r;
}
function rename(n, h, at) {
  ask({ head: "이름 바꾸기", sub: n.title, value: n.title, ok: "저장", label: "새 이름", back: h.anchor, at }, async (v) => {
    if (v === n.title) return;
    try {
      const r = await setTitle(h, n.id, v);
      const k = r.relinked?.length || 0;
      toast(k ? `이름을 바꿨어요 · 링크한 노트 ${k}개도 고쳤어요.` : "이름을 바꿨어요.");
      h.undo?.push({ label: "이름 바꾸기", undo: () => setTitle(h, n.id, n.title), redo: () => setTitle(h, n.id, v) });
    } catch (e) { return e.status === 409 ? "같은 제목의 노트가 이미 있어요." : e.message; }
  });
}
// 새 노트 하나를 기록에: 되돌리면 지우고(그때 모습을 적어 두고), 다시 하면 그 모습 그대로 다시 만들어요
export function recordCreate(h, note, label = "노드 만들기") {
  let snap = { id: note.id, title: note.title, parent_id: note.parent_id || null, body: note.body || "", blocks: note.blocks || null, children: [] };
  h.undo?.push({
    label,
    undo: async () => { snap = await snapshot(resolveId(snap.id)) || snap; await api.deleteNote(resolveId(snap.id)).catch((e) => { if (e.status !== 404) throw e; }); told(h, "delete", resolveId(snap.id)); },
    redo: async () => { const id = await recreate(snap); told(h, "create", id, { restoredFrom: snap.id }); },
  });
}
// 지금 서버의 모습 (되살리기용): 글 · 블록 · 부모 · 바로 아래 하위 id
async function snapshot(id) {
  try { const d = await api.note(id); const n = d.note; return { id: n.id, title: n.title, parent_id: n.parent_id || null, body: n.body || "", blocks: n.blocks || null, kind: n.kind, db: n.db, children: (d.children || []).map((c) => c.id) }; }
  catch { return null; }
}
// 다시 만들기: 같은 제목 · 글(블록이면 블록) · 부모 → 하위를 다시 그 밑으로 → 옛 id 는 새 id 로 기억
async function recreate(s) {
  const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
  const b = { title: s.title, parent_id: s.parent_id ? resolveId(s.parent_id) : null };
  if (s.kind === "database") Object.assign(b, { kind: "database", db: parse(s.db) || undefined });
  else if (parse(s.blocks)) b.blocks = parse(s.blocks); else b.body = s.body || "";
  let note;
  try { ({ note } = await api.addNote(b)); }
  catch (e) {
    if (e.status === 404 && b.parent_id) { ({ note } = await api.addNote({ ...b, parent_id: null })); } // 부모가 없어졌으면 맨 위로
    else throw e.status === 409 ? new Error("같은 제목의 노트가 이미 있어서 되살리지 못했어요.") : e;
  }
  remap(s.id, note.id);
  for (const c of s.children || []) await api.saveNote(resolveId(c), { parent_id: note.id }).catch(() => {});
  return note.id;
}
// Edit = 블록 편집으로 열기. 노트 화면이 떠 있으면 그쪽(h.edit)이, 아니면 보기 방식 칸(notes.js 의 trio-ed-mode)을 block 으로 두고 가요
function edit(id, h) {
  if (h.edit) return h.edit(id);
  try { localStorage.setItem("trio-ed-mode", "block"); sessionStorage.setItem("trio-ed-pick", id); } catch {} // trio-ed-pick: 영상 노트도 보기 대신 편집으로 열게 (notes.js)
  h.ctx.go("#/notes/" + id);
}
function newSub(n, h, at) {
  ask({ head: "하위 노드 만들기", sub: n.title, ok: "만들기", label: "새 하위 노드 이름", back: h.anchor, refocus: !!h.stay, at }, async (v) => {
    try {
      const { note } = await api.addNote({ title: v, body: "", parent_id: resolveId(n.id) });
      recordCreate(h, note, "하위 노드 만들기");
      told(h, "create", note.id);
      if (h.stay) toast(`'${n.title}' 안에 만들었어요 · 두 번 눌러 들어가요.`);
      else edit(note.id, h);
    } catch (e) { return e.status === 409 ? "같은 제목의 노트가 이미 있어요. 다른 제목으로 해 주세요." : e.message; }
  });
}
// 그래프에서 연결 · 끊기 (서버가 본문 '## 연결' 아래 [[제목]] 줄을 넣고 빼요 — 블록 노트는 다음에 열 때 본문에서 블록을 다시 만들어요)
async function link(h, srcId, dstTitle) { const r = await api.linkNote(resolveId(srcId), dstTitle); told(h, "link", resolveId(srcId)); return r; }
async function unlink(h, srcId, dstTitle) { const r = await api.unlinkNote(resolveId(srcId), dstTitle); told(h, "unlink", resolveId(srcId)); return r; }
export async function linkNotes(a, b, h) {
  try {
    const r = await link(h, a.id, b.title);
    if (!r.added) { toast("이미 연결돼 있어요."); return false; }
    h.undo?.push({ label: "연결", undo: () => unlink(h, a.id, b.title), redo: () => link(h, a.id, b.title) });
    return true;
  } catch (e) { toast(e.message || "연결하지 못했어요.", "err"); return false; }
}
// src = { id, title } 노트에 적힌 [[dst.title]] 을 지워요
export async function unlinkNotes(src, dst, h) {
  try {
    const r = await unlink(h, src.id, dst.title);
    if (!r.removed) { toast("끊을 연결이 없어요 (안쪽 노트끼리의 연결이면 안으로 들어가서 끊어요)."); return false; }
    toast(`'${src.title}' – '${dst.title}' 연결을 끊었어요.`);
    h.undo?.push({ label: "연결 끊기", undo: () => link(h, src.id, dst.title), redo: () => unlink(h, src.id, dst.title) });
    return true;
  } catch (e) { toast(e.message || "연결을 끊지 못했어요.", "err"); return false; }
}
// Move to…: 내 노트 찾기 창. 나와 내 하위 전체(고리가 생겨요) · 데이터베이스는 빼고, 맨 위(부모 없음)도 골라요. 서버도 고리는 400 으로 막아요
async function setParent(h, id, parent) { await api.saveNote(resolveId(id), { parent_id: parent ? resolveId(parent) : null }); told(h, "move", resolveId(id)); }
async function move(n, h) {
  let notes;
  try { notes = (await api.notes()).notes; } catch (e) { return toast(e.message, "err"); }
  const kids = new Map(), byId = new Map(notes.map((x) => [x.id, x]));
  for (const x of notes) if (x.parent_id) { if (!kids.has(x.parent_id)) kids.set(x.parent_id, []); kids.get(x.parent_id).push(x.id); }
  const out = new Set([n.id]);
  for (const id of out) for (const k of kids.get(id) || []) out.add(k);
  const all = notes.filter((x) => !out.has(x.id) && x.kind !== "database" && !gone.has(x.id));
  const now = byId.get(n.id)?.parent_id ?? n.parent_id ?? null, TOP = { id: null, title: "맨 위 (부모 없음)" };
  const s = sheet(`
    <div class="palette nm nm-move" role="dialog" aria-modal="true" aria-labelledby="nm-h">
      <div class="nm-head"><b id="nm-h">옮기기</b><span>${esc(n.title)}</span></div>
      <input role="combobox" aria-expanded="true" aria-controls="nm-list" aria-label="옮길 곳 찾기" placeholder="옮길 곳 찾기" autocomplete="off" spellcheck="false">
      <p class="nm-err" role="alert" hidden></p>
      <ul id="nm-list" role="listbox" aria-label="옮길 곳"></ul>
      <div class="foot"><span class="nm-k"><kbd>↑</kbd> <kbd>↓</kbd> 고르기</span><span class="nm-k"><kbd>Enter</kbd> 옮기기</span><span><kbd>Esc</kbd> 취소</span></div>
    </div>`, h.anchor);
  const inp = s.el.querySelector("input"), list = s.el.querySelector("ul"), err = s.el.querySelector(".nm-err");
  let opts = [], sel = 0, busy = false;
  const draw = () => {
    const q = inp.value.trim().toLowerCase(), hits = all.filter((x) => !q || x.title.toLowerCase().includes(q));
    opts = [...(!q || TOP.title.toLowerCase().includes(q) ? [TOP] : []), ...hits.slice(0, 100)];
    sel = Math.min(sel, Math.max(0, opts.length - 1));
    list.innerHTML = opts.map((o, i) => `<li><button type="button" role="option" id="nm-o${i}" data-i="${i}" aria-selected="${i === sel}"><span class="t">${esc(o.title)}</span><span class="s">${o.id === now ? "지금 여기" : esc(byId.get(o.parent_id)?.title || "")}</span></button></li>`).join("")
      + (hits.length > 100 ? `<li class="grp">+${hits.length - 100}개 더 · 글자를 더 쳐서 좁혀요</li>` : "") + (opts.length ? "" : `<li class="grp">맞는 노트가 없어요</li>`);
    if (opts.length) inp.setAttribute("aria-activedescendant", "nm-o" + sel); else inp.removeAttribute("aria-activedescendant");
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  const pick = async (o) => {
    if (!o || busy) return;
    if (o.id === now) return s.close();
    busy = true;
    try { await setParent(h, n.id, o.id); }
    catch (e) { busy = false; err.textContent = e.message; err.hidden = false; return; }
    s.close();
    toast(o.id ? `'${o.title}' 아래로 옮겼어요.` : "맨 위로 옮겼어요.");
    h.undo?.push({ label: "옮기기", undo: () => setParent(h, n.id, now), redo: () => setParent(h, n.id, o.id) });
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
// scope(undo.js 묶음)가 있으면 ⌘Z 로도: 5초 안이면 그냥 취소, 서버에서 지운 뒤면 다시 만들어요 (같은 제목 · 글 · 부모 · 하위)
export function deleteWithUndo(n, ctx, scope = null) {
  if (gone.has(n.id)) return;
  gone.set(n.id, n.parent_id || null);
  const snap = scope ? snapshot(n.id) : null; // 지우기 전 모습 (서버에서 지운 뒤 되살릴 때)
  const el = document.createElement("div");
  el.className = "toast nm-undo"; el.setAttribute("role", "status");
  el.innerHTML = `<span>'${esc(n.title)}' 노트를 지웠어요.</span><button type="button" class="btn sm accent">되돌리기</button><i aria-hidden="true"></i>`;
  let entry = null;
  el.querySelector("button").addEventListener("click", () => { undo(n.id); if (entry) scope.forget(entry); });
  document.getElementById("toasts")?.appendChild(el);
  wait.set(n.id, { el, ctx, t: setTimeout(() => send(n.id), UNDO_MS) }); watch();
  ctx.changed("notes", { note: { op: "hide", id: n.id, local: true } });
  if (!scope) return;
  const h = { ctx };
  entry = {
    label: "노트 지우기",
    undo: async () => {
      if (wait.has(n.id)) return undo(n.id); // 아직 서버에 안 갔어요
      const s = await snap; if (!s) throw new Error("지운 노트를 되살릴 내용을 못 찾았어요.");
      const id = await recreate(s);
      told(h, "create", id, { restoredFrom: n.id });
    },
    redo: async () => {
      const id = resolveId(n.id);
      await api.deleteNote(id).catch((e) => { if (e.status !== 404) throw e; });
      told(h, "delete", id);
    },
  };
  scope.push(entry);
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

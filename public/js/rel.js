// 관계 종류 (2026-10-24) — Obsidian(#/brain) 의 선 색 · '어떤 관계예요?' 작은 창 · AI 제안함 · 새 노트 자리 칩. 서버는 src/onto.js
//   relPop({ at, a, b, current, guess, onPick, onClose })   두 점을 이은 뒤 · 선 우클릭 '관계 바꾸기' — 칩 8개(기본 관련) · ⇄ 방향 · AI 짐작이 빨리 오면 칩에 'AI' 표시
//                                                         Esc · 바깥 누르기 · 12초 = 닫기 (지금 관계 그대로 — 새 연결이면 '관련')
//   setRelUndo(h, { a, b, rel, swap, guessLog })           PUT /rels + 되돌리기 기록 (전 행이 있으면 그대로 돌려놓고, 없었으면 쌍으로 지워요)
//   openInbox(ctx, { undo, onChange })                     머리줄 'AI 제안 N' → 옆 시트: 제안(확정 · 다른 종류 · 거절) · AI 가 정함(확정 · 바꾸기 · 되돌리기)
//   sortChip(host, note, h)                                 맨 위(Unsorted) 노트: '‘AI & Dev’에 둘까요?' — 누를 때만 옮겨요 (⌘Z 되돌리기)
import { api } from "./api.js";
import { esc, toast } from "./util.js";

// 색은 옅게 · 점선으로도 구분 (색만으로 알아보지 않아도 되게). related 는 원래 선 그대로
export const RELS = [
  { k: "related", ko: "관련", color: null, dash: null },
  { k: "is_a", ko: "종류", color: "#60a5fa", dash: null, read: "의 한 종류" },
  { k: "part_of", ko: "부분", color: "#34d399", dash: null, read: "의 부분" },
  { k: "example_of", ko: "예시", color: "#f2b84b", dash: [5, 3], read: "의 예시" },
  { k: "causes", ko: "원인", color: "#f87171", dash: null, read: "의 원인" },
  { k: "contrasts_with", ko: "반대·비교", color: "#c084fc", dash: [2, 3], read: "와 반대·비교" },
  { k: "prerequisite_of", ko: "먼저 알아야 함", color: "#22d3ee", dash: [7, 3], read: "보다 먼저 알아야 함" },
  { k: "defined_by", ko: "정의", color: "#fb923c", dash: [1.5, 2.5], read: "로 정의돼요" },
];
export const REL_BY = Object.fromEntries(RELS.map((r) => [r.k, r]));
const SYM = new Set(["related", "contrasts_with"]);
export const relKo = (k) => REL_BY[k]?.ko || "관련";
/** 그래프 선 모양: 관계가 있는 선만 (관련 · 묶음 선은 원래대로) */
export function edgeStyle(l) {
  if (!l.rel || l.rel === "related") return null;
  const r = REL_BY[l.rel]; if (!r) return null;
  return { color: r.color, dash: r.dash, label: r.ko + (l.status === "auto" ? " · AI" : ""), arrow: !SYM.has(l.rel) };
}
export const LEGEND = RELS.filter((r) => r.color).map((r) => ({ label: r.ko, color: r.color, dash: r.dash }));

// ---------- 작은 창 ----------
let pop = null;
export function closeRelPop() { pop?.close(); }
export function relPop({ at, a, b, current = "related", guess = null, title = "어떤 관계예요?", onPick, onClose }) {
  closeRelPop();
  let src = a, dst = b, cur = current, done = false, guessed = null, timer = 0;
  const el = document.createElement("div");
  el.className = "relpop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", title);
  const draw = () => {
    el.innerHTML = `<div class="relpop-h"><b>${esc(title)}</b><button type="button" class="relpop-x" data-x aria-label="닫기 (지금 관계 그대로)">✕</button></div>
      <div class="relpop-dir"><span title="${esc(src.title)}">${esc(src.title)}</span><button type="button" data-swap title="방향 바꾸기" aria-label="방향 바꾸기">→ ⇄</button><span title="${esc(dst.title)}">${esc(dst.title)}</span></div>
      <div class="relpop-chips" role="group" aria-label="관계 종류">${RELS.map((r) => `<button type="button" data-rel="${r.k}" aria-pressed="${cur === r.k}" class="${guessed?.rel === r.k ? "ai" : ""}"${r.color ? ` style="--rc:${r.color}"` : ""}><i aria-hidden="true"></i>${esc(r.ko)}${guessed?.rel === r.k ? `<small>AI</small>` : ""}</button>`).join("")}</div>
      <p class="relpop-ai" ${guessed ? "" : "hidden"}>${guessed ? `AI 짐작: <b>${esc(relKo(guessed.rel))}</b> · 확신 ${Math.round(guessed.confidence * 100)}%${guessed.why ? ` — ${esc(guessed.why)}` : ""}` : ""}</p>`;
  };
  draw();
  document.body.appendChild(el);
  const place = () => {
    const r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    el.style.left = Math.max(8, Math.min(W - r.width - 8, at.x - r.width / 2)) + "px";
    el.style.top = Math.max(8, Math.min(H - r.height - 8, at.y + 18)) + "px";
  };
  place();
  const close = (picked = false) => {
    if (done) return; done = true; clearTimeout(timer);
    el.remove(); document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", outside, true);
    if (pop?.el === el) pop = null;
    if (!picked) onClose?.();
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => close(), 12000); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if ((e.metaKey || e.ctrlKey) && /^[zy]$/i.test(e.key)) close(); // 되돌리기(연결 취소)와 같이 닫아요 — 키는 그대로 undo.js 로
  };
  const outside = (e) => { if (!el.contains(e.target)) close(); };
  setTimeout(() => { if (done) return; document.addEventListener("pointerdown", outside, true); }, 0);
  document.addEventListener("keydown", onKey, true);
  el.addEventListener("pointerenter", () => clearTimeout(timer));
  el.addEventListener("pointerleave", arm);
  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-x]")) return close();
    if (e.target.closest("[data-swap]")) { [src, dst] = [dst, src]; draw(); place(); return; }
    const c = e.target.closest("[data-rel]"); if (!c) return;
    const rel = c.dataset.rel;
    close(true);
    onPick?.({ rel, src, dst, swapped: src.id !== a.id, guess: guessed });
  });
  arm();
  // AI 짐작: 늦게 오면 그냥 둬요 (고르는 걸 막지 않게)
  if (guess) guess.then((g) => {
    if (done || !g?.rel || (g.confidence ?? 0) < 0.66) return; // 3표 중 2표 이상일 때만 보여요 (흔들리는 짐작은 숨겨요)
    guessed = g;
    if (g.src_id === b.id && g.dst_id === a.id && !SYM.has(g.rel)) [src, dst] = [b, a]; // AI 는 반대 방향이 맞대요
    draw(); place();
  }).catch(() => {});
  pop = { el, close: () => close() };
  return pop;
}

// ---------- 정하기 + 되돌리기 ----------
const body = (row) => ({ src_id: row.src_id, dst_id: row.dst_id, rel: row.rel, status: row.status, origin: row.origin, confidence: row.confidence, evidence: row.evidence, restore: true });
/** h = { undo?, after?() } — after 는 서버 답 뒤 다시 그리기 */
export async function setRelUndo(h, { src, dst, rel, guessLog = null, label = null }) {
  try {
    const r = await api.setRel({ src_id: src.id, dst_id: dst.id, rel, guess_log: guessLog || undefined });
    const prev = r.prev;
    const redo = async () => { await api.setRel({ src_id: src.id, dst_id: dst.id, rel }); h.after?.(); };
    const undo = async () => { if (prev) await api.setRel(body(prev)); else await api.deleteRelPair(src.id, dst.id); h.after?.(); };
    h.undo?.push({ label: label || `관계 · ${relKo(rel)}`, undo, redo });
    h.after?.();
    return r.rel;
  } catch (e) { toast(e.message || "관계를 정하지 못했어요.", "err"); return null; }
}

// ---------- AI 제안함 (옆 시트) ----------
let sheet = null;
export function closeInbox() { sheet?.close(); }
export function openInbox(ctx, { undo = null, onChange = null, tab = "suggested" } = {}) {
  closeInbox();
  const el = document.createElement("aside");
  el.className = "relsheet"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "AI 제안함");
  let cur = tab, rows = [], counts = {};
  const changed = () => { onChange?.(); load(); };
  async function load() {
    try { const d = await api.rels(cur); rows = d.rels; counts = d.counts || {}; draw(); }
    catch (e) { el.querySelector(".rs-list").innerHTML = `<p class="faint">${esc(e.message || "불러오지 못했어요.")}</p>`; }
  }
  function draw() {
    const head = `<div class="rs-h"><b>AI 제안함</b><button type="button" class="relpop-x" data-close aria-label="닫기">✕</button></div>
      <p class="rs-sub">AI 가 내 노트 사이에서 찾은 관계예요. 노트 글은 바꾸지 않아요 — 확정하면 그래프에 선으로 보여요.</p>
      <nav class="rs-tabs" role="tablist"><button type="button" role="tab" data-tab="suggested" aria-selected="${cur === "suggested"}">제안 <b>${counts.suggested || 0}</b></button><button type="button" role="tab" data-tab="auto" aria-selected="${cur === "auto"}">AI 가 정함 <b>${counts.auto || 0}</b></button></nav>`;
    const item = (r) => {
      const st = REL_BY[r.rel] || REL_BY.related;
      return `<li data-id="${esc(r.id)}"><div class="rs-pair"><b>${esc(r.src_title)}</b> <span class="rs-rel"${st.color ? ` style="color:${st.color}"` : ""}>—${esc(st.ko)}→</span> <b>${esc(r.dst_title)}</b></div>
        <div class="rs-meta">${r.confidence != null ? `확신 ${Math.round(r.confidence * 100)}%` : ""}${r.evidence ? ` · ${esc(r.evidence)}` : ""}</div>
        <div class="rs-btns">${cur === "auto" ? `<button type="button" class="btn sm" data-act="ok">맞아요</button><button type="button" class="btn sm ghost" data-act="other">바꾸기</button><button type="button" class="btn sm ghost danger" data-act="no">되돌리기</button>`
          : `<button type="button" class="btn sm accent" data-act="ok">확정</button><button type="button" class="btn sm ghost" data-act="other">다른 종류</button><button type="button" class="btn sm ghost danger" data-act="no">거절</button>`}</div></li>`;
    };
    el.innerHTML = head + `<ul class="rs-list">${rows.length ? rows.map(item).join("") : `<p class="faint rs-empty">${cur === "auto" ? "AI 가 정한 관계가 없어요." : "새 제안이 없어요. 노트를 쓰면 AI 가 가끔 찾아 줘요."}</p>`}</ul>`;
  }
  async function act(id, kind, at) {
    const r = rows.find((x) => x.id === id); if (!r) return;
    const prev = { ...r };
    const restore = async () => { await api.setRel(body(prev)); changed(); };
    try {
      if (kind === "ok") {
        const res = await api.patchRel(id, { action: "confirm" });
        undo?.push({ label: "관계 확정", undo: restore, redo: async () => { await api.setRel({ ...body(res.rel), status: "confirmed" }); changed(); } });
        toast(`'${r.src_title}' —${relKo(r.rel)}→ '${r.dst_title}' 확정했어요`);
      } else if (kind === "no") {
        const res = await api.patchRel(id, { action: "reject" });
        undo?.push({ label: cur === "auto" ? "AI 관계 되돌리기" : "제안 거절", undo: restore, redo: async () => { await api.setRel({ ...body(res.rel), status: "rejected" }); changed(); } });
        toast(cur === "auto" ? "AI 가 정한 관계를 되돌렸어요. 다시 제안하지 않아요." : "거절했어요. 이 둘은 다시 제안하지 않아요.");
      } else if (kind === "other") {
        relPop({ at, a: { id: r.src_id, title: r.src_title }, b: { id: r.dst_id, title: r.dst_title }, current: r.rel, title: "다른 종류로", onPick: async ({ rel, swapped }) => {
          try {
            const res = await api.patchRel(id, { action: "confirm", rel, swap: swapped });
            undo?.push({ label: `관계 · ${relKo(rel)}`, undo: restore, redo: async () => { await api.setRel({ ...body(res.rel), status: "confirmed" }); changed(); } });
            toast(`${relKo(rel)}(으)로 확정했어요`); changed();
          } catch (e) { toast(e.message, "err"); }
        } });
        return;
      }
      changed();
    } catch (e) { toast(e.message || "처리하지 못했어요.", "err"); }
  }
  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return close();
    const t = e.target.closest("[data-tab]"); if (t) { cur = t.dataset.tab; load(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const r0 = b.getBoundingClientRect();
    act(b.closest("[data-id]").dataset.id, b.dataset.act, { x: r0.left + r0.width / 2, y: r0.bottom });
  });
  const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".relpop, .cm")) { e.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey);
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey); if (sheet?.el === el) sheet = null; };
  el.innerHTML = `<div class="rs-list"><p class="faint">불러오는 중…</p></div>`;
  document.body.appendChild(el);
  sheet = { el, close };
  load();
  return sheet;
}

// ---------- 새 노트 자리 칩 (맨 위 노트) ----------
const seenSort = new Map(); // 노트 id → 답 (같은 화면에서 다시 그려도 다시 묻지 않게)
/** h = { ctx, undo?, onMoved?(parentId) } */
export async function sortChip(host, note, h) {
  if (!host || !note || note.parent_id || note.kind === "database") return;
  const key = note.id + ":" + (note.updated_at || ""); // 글이 바뀌면 다시 물어요 (서버도 updated_at 뒤의 판정만 다시 써요)
  let d = seenSort.get(key);
  if (!d) { try { d = await api.sortSuggest(note.id); } catch { return; } seenSort.set(key, d); }
  if (!d.show || !host.isConnected) return;
  host.innerHTML = `<div class="sort-chip" role="group" aria-label="AI 자리 제안"><span class="sort-ai">AI</span><span>‘${esc(d.concept)}’에 둘까요?</span><button type="button" class="btn sm accent" data-sort-yes>옮기기</button><button type="button" class="btn sm ghost" data-sort-no>아니요</button></div>`;
  host.querySelector("[data-sort-no]").onclick = async () => {
    host.innerHTML = ""; d.show = false;
    api.sortOutcome(note.id, d.log_id, null).catch(() => {});
  };
  host.querySelector("[data-sort-yes]").onclick = async () => {
    try {
      let pid = d.concept_id;
      if (!pid) {
        try { pid = (await api.addNote({ title: d.concept, body: "", parent_id: null })).note.id; }
        catch (e) { if (e.status === 409 && e.data?.id) pid = e.data.id; else throw e; }
      }
      await api.saveNote(note.id, { parent_id: pid });
      api.sortOutcome(note.id, d.log_id, d.concept).catch(() => {});
      host.innerHTML = ""; d.show = false;
      const told = (op) => { h.ctx?.refreshSide?.(); h.ctx?.changed?.("notes", { note: { op, id: note.id } }); };
      h.undo?.push({ label: "자리 옮기기", undo: async () => { await api.saveNote(note.id, { parent_id: null }); told("move"); h.onMoved?.(null); }, redo: async () => { await api.saveNote(note.id, { parent_id: pid }); told("move"); h.onMoved?.(pid); } });
      told("move"); h.onMoved?.(pid);
      toast(`‘${d.concept}’ 안으로 옮겼어요`);
    } catch (e) { toast(e.message || "옮기지 못했어요.", "err"); }
  };
}

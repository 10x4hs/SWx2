// 되돌리기 · 다시 하기 — 계획 · 일기 · Obsidian(노트) 이 같이 써요 (2026-10-22).
//   ⌘Z / Ctrl+Z = 되돌리기 · ⌘⇧Z / Ctrl+Shift+Z / Ctrl+Y = 다시 하기
//   글 칸(input · textarea · 글 고치는 중인 칸)에서는 브라우저의 원래 되돌리기를 그대로 둬요. 블록 편집기는 자기 기록으로 따로 해요 (blocks/editor.js).
//
//   const u = undoScope("plan")            화면이 뜰 때 · 닫을 때 u.dispose()
//   u.push({ label, undo, redo })          undo · redo 는 서버에도 반대 요청을 보내는 async 함수 (실패하면 던지기)
//   undoScope("diary", { undo, redo })     직접 기록을 가진 곳(블록 편집기): 키만 넘겨줘요. 함수가 true 를 돌려주면 처리한 것
//   resolveId(id) · remap(old, new)        지운 걸 되살리면 새 id 가 생겨요 — 옛 id 로 적어 둔 기록도 새 것을 가리키게
//
// 기록은 이름(scope)마다 따로, 그 화면이 떠 있는 동안만 (최대 100개). 같은 이름의 화면끼리 옮겨 가면(Obsidian 그래프 ↔ 노트) 이어져요.
import { esc } from "./util.js";

const CAP = 100;
const books = new Map(); // 이름 → { past, future, refs, clearT }
const live = []; // 떠 있는 화면들 (마지막 = 키를 받는 곳)
const ids = new Map(); // 옛 id → 새 id
let chain = Promise.resolve();

function book(name) {
  if (!books.has(name)) books.set(name, { past: [], future: [], refs: 0, clearT: 0 });
  return books.get(name);
}
export const resolveId = (id) => { let cur = id; for (let i = 0; ids.has(cur) && i < 50; i++) cur = ids.get(cur); return cur; };
export function remap(oldId, newId) { const cur = resolveId(oldId); if (cur !== newId) ids.set(cur, newId); }

export function undoScope(name, adapter = null) {
  const b = book(name);
  b.refs++; clearTimeout(b.clearT);
  const h = { name, adapter };
  live.push(h);
  return {
    push: (entry) => push(name, entry),
    // 기록에서 빼기 (예: 지우기 토스트의 Undo 로 이미 되돌렸어요)
    forget: (entry) => { for (const list of [b.past, b.future]) { const i = list.indexOf(entry); if (i >= 0) list.splice(i, 1); } },
    size: () => b.past.length + b.future.length,
    dispose() {
      const i = live.indexOf(h); if (i < 0) return;
      live.splice(i, 1); b.refs--;
      // 같은 이름의 화면이 바로 이어서 뜨면(그래프 → 노트) 그대로, 아니면 비워요
      clearTimeout(b.clearT);
      b.clearT = setTimeout(() => { if (!b.refs) { b.past = []; b.future = []; } }, 0);
    },
  };
}
export function push(name, entry) {
  const b = book(name);
  b.past.push(entry); if (b.past.length > CAP) b.past.shift();
  b.future = [];
}
// api-fresh 가 화면을 다시 그리면 기록이 사라지니, 기록이 있으면 '손댄 화면' 으로 봐요 (app.js)
export const hasHistory = () => live.some((h) => (h.adapter ? h.adapter.size?.() > 0 : book(h.name).past.length + book(h.name).future.length > 0));

// ---------- 토스트: 하나를 계속 바꿔 써요 (여러 번 눌러도 쌓이지 않게) ----------
let tEl = null, tA = 0, tB = 0;
export function say(msg, kind = "") {
  const host = document.getElementById("toasts"); if (!host) return;
  if (!tEl || !tEl.isConnected) { tEl = document.createElement("div"); tEl.setAttribute("role", "status"); host.appendChild(tEl); }
  tEl.className = "toast undo-toast " + kind; tEl.innerHTML = esc(msg);
  clearTimeout(tA); clearTimeout(tB);
  const el = tEl;
  tA = setTimeout(() => el.classList.add("out"), 1800);
  tB = setTimeout(() => { el.remove(); if (tEl === el) tEl = null; }, 2200);
}

const active = () => live[live.length - 1] || null;
export function run(dir, name = active()?.name) {
  const h = [...live].reverse().find((x) => x.name === name);
  if (!h) return false;
  if (h.adapter) return !!h.adapter[dir]?.();
  const b = book(name), from = dir === "undo" ? b.past : b.future, to = dir === "undo" ? b.future : b.past;
  if (!from.length) { say(dir === "undo" ? "되돌릴 게 없어요" : "다시 할 게 없어요"); return true; }
  const e = from.pop();
  chain = chain.then(async () => {
    try {
      await e[dir]();
      to.push(e);
      say(`${dir === "undo" ? "되돌렸어요" : "다시 했어요"}${e.label ? " · " + e.label : ""}`);
    } catch (x) {
      from.push(e);
      say(x?.message || (dir === "undo" ? "되돌리지 못했어요." : "다시 하지 못했어요."), "err");
    }
  });
  return true;
}
export const settled = () => chain; // 자동 검사 · 순서가 필요한 곳

// 글 고치는 중이면 브라우저 것 그대로 — 빈 입력 칸(예: 계획을 넣은 뒤 바로 열린 다음 칸)은 되돌릴 글이 없으니 이 기록으로
const typing = (t) => !!t && (t.isContentEditable || (/^(INPUT|TEXTAREA)$/.test(t.tagName) && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(t.type || "") && t.value !== ""));
export function undoKey(e) {
  if (e.altKey || !(e.metaKey || e.ctrlKey)) return null;
  const k = (e.key || "").toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && e.ctrlKey && !e.metaKey && !e.shiftKey) return "redo";
  return null;
}
addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.isComposing) return;
  const dir = undoKey(e); if (!dir) return;
  if (typing(document.activeElement) || typing(e.target)) return;
  if (document.querySelector(".cm, .nm-back, .bi")) return; // 메뉴 · 작은 창이 떠 있으면 그쪽 먼저
  if (!active()) return;
  e.preventDefault();
  run(dir);
});

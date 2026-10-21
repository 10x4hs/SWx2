// Dock 폴더 (Discord 서버 폴더처럼): 아이콘 여러 개를 타일 하나로 묶어요. 눌러서 펼치면 그 자리에 아이콘이 나와요.
//   저장: users.dock_folders = { id: { name, items: ["nav:room", "page:…"] } } + dock_order 에 "folder:<id>" 자리 (PATCH /me · 계정이라 기기끼리 같아요)
//   펼침 상태만 브라우저마다 (localStorage · 못 쓰면 매번 접힌 채로)
//   예전 앱은 "folder:" 를 모르니 폴더 안 아이콘이 Dock 끝에 따로 보여요 — 그래도 안 깨져요
import { openMenu } from "./ctxmenu.js";

let ctx, save; // dock.js 가 initFolders 로 넘겨줘요 (dock.js 를 import 하면 customize.js 와 순환이라서요)
export function initFolders(deps) { ({ ctx, save } = deps); }

const OPEN_KEY = "dock-fold-open";
export function openSet() { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]")); } catch { return new Set(); } }
export function setOpen(id, on) { const s = openSet(); on ? s.add(id) : s.delete(id); try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s])); } catch {} }

const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 4)).slice(-10);
const clone = (f) => Object.fromEntries(Object.entries(f || {}).map(([id, x]) => [id, { name: x.name, items: [...x.items] }]));
export const folderOf = (key, folders = ctx.me.dock_folders) => Object.keys(folders || {}).find((id) => folders[id].items.includes(key)) || null;

// 정리: 빈 폴더는 빼고, 하나만 남은 폴더는 (방금 줄어든 거면) 풀어요. 순서에 없는 폴더는 끝에. 폴더 안 아이콘은 맨 위 순서에서 빼요
export function normalize(order, folders, old = {}) {
  order = [...order]; const seen = new Set();
  for (const id of Object.keys(folders)) {
    const f = folders[id]; f.items = f.items.filter((k) => !seen.has(k) && seen.add(k)).slice(0, 30);
    const at = order.indexOf("folder:" + id);
    const shrank = (old[id]?.items.length || 0) > f.items.length;
    if (!f.items.length || (f.items.length === 1 && shrank)) { // 폴더 풀기: 남은 아이콘이 그 자리로
      delete folders[id]; f.items.forEach((k) => seen.delete(k));
      if (at >= 0) order.splice(at, 1, ...f.items); else order.push(...f.items);
    } else if (at < 0) order.push("folder:" + id);
  }
  order = order.filter((k, i) => order.indexOf(k) === i && !seen.has(k) && (!k.startsWith("folder:") || folders[k.slice(7)]));
  return { order, folders };
}

// 끌어서 놓은 뒤 (dock-drag.js 의 snap + merge) → 저장할 모양. shown = 지금 Dock 에 그려진 아이콘들
export function fromDrop({ order, kids, merge }, shown) {
  const old = clone(ctx.me.dock_folders), folders = {};
  for (const id of Object.keys(old)) {
    // 화면에 없는 아이콘(숨긴 페이지 · 기간 지난 메뉴 등)은 원래 폴더에 그대로 둬요
    const hidden = old[id].items.filter((k) => !shown.has(k));
    folders[id] = { name: old[id].name, items: [...(kids[id] || []), ...hidden] };
  }
  if (merge) {
    const { drag, onto } = merge;
    order = order.filter((k) => k !== drag);
    for (const f of Object.values(folders)) f.items = f.items.filter((k) => k !== drag);
    if (onto.startsWith("folder:")) folders[onto.slice(7)]?.items.push(drag);
    else { const id = newId(); folders[id] = { name: "폴더", items: [onto, drag] }; order = order.map((k) => (k === onto ? "folder:" + id : k)); }
  }
  return normalize(order, folders, old);
}

// ---------- 메뉴 ----------
const at = (e) => ({ clientX: e.clientX, clientY: e.clientY, preventDefault() {} });
const curOrder = () => (ctx.me.dock_order?.length ? [...ctx.me.dock_order] : [...document.querySelectorAll("#dock-list > [data-dock]")].map((x) => x.dataset.dock)); // 순서를 저장한 적이 없으면 지금 보이는 순서
// 아이콘 메뉴(customize.js · dock.js 페이지 메뉴) 끝에 붙는 줄
export function folderItems(key) {
  if (!ctx?.me || !/^(nav|page):/.test(key || "") || !document.querySelector(`#dock-list [data-dock="${key}"]`)) return [];
  return [{ sep: true }, { k: "fold-in", label: "폴더에 넣기…" }, ...(folderOf(key) ? [{ k: "fold-out", label: "폴더에서 빼기" }] : [])];
}
export function folderPick(k, key, e) {
  const pos = at(e), old = ctx.me.dock_folders || {}, folders = clone(old), cur = folderOf(key);
  let order = curOrder();
  if (k === "fold-out" && cur) {
    folders[cur].items = folders[cur].items.filter((x) => x !== key);
    order = order.filter((x) => x !== key); const i = order.indexOf("folder:" + cur); order.splice(i < 0 ? order.length : i + 1, 0, key);
    return save(normalize(order, folders, old));
  }
  if (k !== "fold-in") return;
  const ids = Object.keys(folders).filter((id) => id !== cur);
  openMenu(pos, {
    title: "폴더에 넣기",
    items: [...ids.map((id) => ({ k: "f:" + id, label: folders[id].name })), ...(ids.length ? [{ sep: true }] : []), { k: "new", label: "새 폴더" }],
    onPick: (to) => {
      if (cur) folders[cur].items = folders[cur].items.filter((x) => x !== key);
      const wasAt = order.indexOf(key); order = order.filter((x) => x !== key);
      if (to === "new") { const id = newId(); folders[id] = { name: "폴더", items: [key] }; order.splice(wasAt < 0 ? order.length : wasAt, 0, "folder:" + id); } // 메뉴로 만든 새 폴더는 하나로 시작해요 (다음 아이콘을 여기로 넣어요)
      else folders[to.slice(2)].items.push(key);
      save(normalize(order, folders, old));
    },
  });
}
// 폴더 타일 메뉴: 이름 바꾸기 · 풀기
export function folderMenu(e, id) {
  const f = (ctx.me.dock_folders || {})[id]; if (!f) return;
  openMenu(e, {
    title: f.name,
    items: [{ k: "rename", label: "폴더 이름 바꾸기" }, { sep: true }, { k: "undo", label: "폴더 풀기" }],
    back: e.target?.closest?.("button") || null,
    onPick: (k) => {
      const folders = clone(ctx.me.dock_folders); const order = curOrder();
      if (k === "rename") {
        const name = (prompt("폴더 이름 (20자까지)", f.name) ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
        if (!name || name === f.name) return;
        folders[id].name = name;
      } else {
        const i = order.indexOf("folder:" + id); const items = folders[id].items; delete folders[id];
        if (i >= 0) order.splice(i, 1, ...items); else order.push(...items);
      }
      save(normalize(order, folders));
    },
  });
}

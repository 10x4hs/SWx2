// SWx2 — Dock: 대화방 안 읽은 배지 + 사용자 페이지 아이콘 · 메뉴 (app.js 에서 나눴어요).
import { api } from "./api.js";
import { $, $$, esc, ymd, today, toast, kstDay } from "./util.js";
import { appIcon } from "./icons.js";
import { openMenu } from "./ctxmenu.js";
import { openRename } from "./customize.js";
import { sortByOrder } from "./dock-drag.js";
import { isHidden, hidePage } from "./hidden-pages.js";
import { isOpen, NAV_FEATURE } from "./features.js";
import { navHref, onDockClick } from "./dock-memory.js";
import { initFolders, openSet, setOpen, fromDrop, folderItems, folderPick, folderMenu } from "./dock-folders.js";

// ctx · NAV · parseRoute · 지금 보는 화면(lastView)은 app.js 가 갖고 있어서 init 으로 받아요 (app.js 를 import 하면 순환이라서요)
let ctx, NAV, parseRoute, getLastView;
// 리스너 · 타이머는 app.js 에서 부르는 자리(= 예전 위치)에서 한 번만 걸어요
export function initDock(deps) {
  ({ ctx, NAV, parseRoute, getLastView } = deps);
  initFolders({ ctx, save: saveDock });
  setInterval(() => { if (ctx.me && document.visibilityState === "visible") refreshUnread(); }, 60_000);
  window.addEventListener("trio:changed", (e) => { if (e.detail?.kind === "room") refreshUnread(); });
  window.addEventListener("room-live", (e) => { if (e.detail?.from !== ctx.me?.id) refreshUnread(); }); // 새 메시지 → 배지 바로
  window.addEventListener("trio:changed", (e) => { if (e.detail?.kind === "pages") loadDockPages(); });
  document.addEventListener("contextmenu", (e) => { const a = e.target.closest("[data-page]"); if (a) pageMenu(e, a.dataset.page); const f = e.target.closest?.(".dock-fold-btn"); if (f) folderMenu(e, f.closest("[data-folder]").dataset.folder); });
  document.addEventListener("click", (e) => { const f = e.target.closest?.(".dock-fold-btn"); if (f) toggleFolder(f.closest("[data-folder]")); }); // 폴더: 누르면 펼치고 · 다시 누르면 접어요
  document.addEventListener("click", (e) => { const a = e.target.closest?.("a.rail-btn[data-nav]"); if (a) onDockClick(a); }, true); // 보던 곳으로 가는 길이면 스크롤도 같이
}

// until 이 지난 메뉴는 Dock 에서 빠져요 (한국 시간 기준) — 주소로 들어가면 결과는 볼 수 있어요
// when(me) 이 있는 메뉴는 그 사람에게만 (예: 일기 = 일기 모임)
const navLive = () => NAV.filter((n) => (!n.until || kstDay() <= n.until) && (!n.when || n.when(ctx.me)));

// 아이폰 Dock처럼 앱 아이콘만. 이름은 마우스를 올리면, 지금 화면은 옆에 점. data-dock = 순서를 기억하는 이름
const navItem = (n) => `<a class="rail-btn${isOpen(ctx, NAV_FEATURE[n.key]) ? "" : " locked"}" href="${navHref(n, ymd(today()))}" data-nav="${n.key}" data-dock="nav:${n.key}" draggable="false" aria-label="${n.label}" data-tip="${n.label}">${n.img ? `<span class="app-ic ic-img ic-${n.key}"><img src="${n.img}" alt="" draggable="false" decoding="async"></span>` : appIcon(n.icon || n.key)}${isOpen(ctx, NAV_FEATURE[n.key]) ? "" : `<span class="lock-badge" aria-label="잠김"><svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true"><rect x="0.5" y="4.2" width="8" height="5.3" rx="1.4" fill="currentColor"/><path d="M2.3 4.4V3a2.2 2.2 0 0 1 4.4 0v1.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></span>`}${n.badge ? `<span class="dock-ping" aria-hidden="true"></span><span class="dock-badge" id="${n.badge}" hidden></span>` : ""}</a>`;

// ---------- Dock 배지: 대화방 안 읽은 개수 ----------
// 로그인해 있으면 60초마다. 대화방이 열려 있을 땐 그 화면이 스스로 폴링하니 여기선 쉬어요.
export async function refreshUnread() {
  if (!ctx.me || !$("#room-badge")) return;
  if (getLastView() === "room") { $("#room-badge").hidden = true; ping(false); return; }
  try {
    const r = await api.roomUnread();
    const n = Number(r.total ?? r.unread) || 0; // 우리 셋 + 1:1 전부 합친 수
    unreadText = n ? (n > 9 ? "9+" : String(n)) : "";
    // 기다리는 사이 Dock 이 다시 그려졌을 수 있어요 (페이지 목록이 먼저 오면) — 그래서 지금 있는 배지를 다시 찾아요
    const el = $("#room-badge"); if (!el) return;
    el.textContent = unreadText || "0";
    el.hidden = n === 0;
    ping(n > 0);
  } catch {}
}

// ---------- Dock 사용자 페이지: 내 것 + 셋이 공유한 것. 길게 누르거나 오른쪽 클릭 → 수정 · 공개 · 순서 · 삭제 ----------
let dockPages = [];
export const getDockPages = () => dockPages; // 팔레트가 페이지 목록을 읽어요
// Dock 아이콘: 이모지 하나 또는 사이트 파비콘 주소
export const pageIcon = (ic) => /^https?:\/\//.test(ic || "") ? `<img class="page-fav" src="${esc(ic)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'page-emoji',textContent:'🔗'}))">` : `<span class="page-emoji">${esc(ic || "✨")}</span>`;
export async function loadDockPages() {
  try { dockPages = (await api.pages()).pages || []; } catch { dockPages = []; }
  drawDockPages();
}
function drawDockPages() { drawDock(); }
let unreadText = ""; // 다시 그려도 대화 배지가 사라지지 않게
export function drawDock() {
  const el = $("#dock-list"); if (!el || !ctx.me) return;
  const cur = parseRoute();
  const pageItem = (p) => `<a class="rail-btn rail-page${p.mine ? "" : " shared"}" href="#/p/${p.id}" data-nav="p:${p.id}" data-page="${p.id}" data-dock="page:${p.id}" draggable="false" aria-label="${esc(p.title)}" data-tip="${esc(p.title)}${p.mine ? "" : ` · ${esc(ctx.user(p.user_id)?.display_name || "")}`}"><span class="app-ic ic-page">${pageIcon(p.icon)}</span></a>`;
  const entries = [...navLive().map((n) => ({ key: "nav:" + n.key, html: navItem(n) })), ...dockPages.filter((p) => p.place !== "study" && !isHidden(p)).map((p) => ({ key: "page:" + p.id, html: pageItem(p) }))];
  el.innerHTML = sortByOrder(withFolders(entries), ctx.me.dock_order).map((x) => x.html).join("");
  $$("[data-nav]", el).forEach((a) => { if (a.dataset.nav === cur.nav) a.setAttribute("aria-current", "page"); });
  // 폴더 타일: 안 아이콘 4개까지 작게 (2x2). 접혀 있을 때 지금 화면이 안에 있으면 타일에 점 (CSS :has 라 화면을 옮겨도 따라가요)
  $$("[data-folder]", el).forEach((f) => {
    f.querySelector(".fold-grid").innerHTML = $$(".dock-fold-items .app-ic", f).slice(0, 4).map((ic) => `<span class="fold-mini">${ic.outerHTML}</span>`).join("");
  });
  const b = $("#room-badge"); if (b && unreadText) { b.textContent = unreadText; b.hidden = false; ping(true); }
}
// 폴더 묶기: 폴더 안 아이콘은 폴더 타일 하나로 (안 보이는 아이콘은 건너뛰어요 · 하나도 안 보이면 폴더도 안 그려요)
function withFolders(entries) {
  const folders = ctx.me.dock_folders || {}, byKey = new Map(entries.map((x) => [x.key, x])), inside = new Set(), open = openSet(), out = [];
  for (const [id, f] of Object.entries(folders)) {
    const kids = f.items.map((k) => byKey.get(k)).filter((x) => x && !inside.has(x.key));
    if (!kids.length) continue;
    kids.forEach((x) => inside.add(x.key));
    const on = open.has(id), name = esc(f.name);
    out.push({ key: "folder:" + id, html: `<div class="dock-folder${on ? " open" : ""}" data-dock="folder:${id}" data-folder="${id}"><button type="button" class="rail-btn dock-fold-btn" aria-expanded="${on}" aria-controls="dfi-${id}" aria-label="${name}" data-tip="${name}"><span class="app-ic fold-grid"></span><span class="dock-ping" aria-hidden="true"></span></button><div class="dock-fold-items" id="dfi-${id}" role="group" aria-label="${name}">${kids.map((x) => x.html).join("")}</div></div>` });
  }
  return [...entries.filter((x) => !inside.has(x.key)), ...out];
}
function toggleFolder(f) {
  const on = !f.classList.contains("open");
  f.classList.toggle("open", on); f.querySelector(".dock-fold-btn").setAttribute("aria-expanded", String(on));
  setOpen(f.dataset.folder, on);
}
// 저장 (끌어 놓기 · 폴더 메뉴): 화면부터 바꾸고, 실패하면 되돌려요
export async function saveDock({ order, folders }) {
  const prev = [ctx.me.dock_order, ctx.me.dock_folders];
  ctx.me.dock_order = order; ctx.me.dock_folders = folders; drawDock();
  try { const r = await api.updateMe({ dock_order: order, dock_folders: folders }); ctx.me.dock_order = r.user.dock_order; ctx.me.dock_folders = r.user.dock_folders; }
  catch (err) { [ctx.me.dock_order, ctx.me.dock_folders] = prev; drawDock(); toast(err.message || "Dock 을 저장하지 못했어요.", "err"); }
}
// dock-drag.js 의 onDrop: 끈 결과(+ 폴더 묶기) → 저장
export function dropDock(st) {
  const shown = new Set($$("#dock-list [data-dock]").map((x) => x.dataset.dock));
  return saveDock(fromDrop(st, shown));
}
// 새 메시지 표시: Message 아이콘 왼쪽에 주황 막대 (처음 켜질 때 한 번 반짝)
let pingOn = false; // 다시 그릴 때는 반짝이지 않게 (꺼져 있다가 켜질 때만)
function ping(on) {
  const a = $("#room-badge")?.closest(".rail-btn"); if (!a) return;
  a.classList.toggle("has-unread", on);
  a.closest("[data-folder]")?.querySelector(".dock-fold-btn").classList.toggle("has-unread", on); // 폴더 안이면 폴더 타일에도
  if (on && !pingOn) { a.classList.add("ping-new"); setTimeout(() => a.classList.remove("ping-new"), 1600); }
  pingOn = on;
}
export async function pageMenu(e, id) {
  const p = dockPages.find((x) => x.id === id); if (!p) return;
  openMenu(e, {
    title: `${p.icon} ${p.title}`,
    items: [...(p.mine ? [
      { k: "open", label: "열기" }, { k: "rename", label: "Rename & icon…" }, { k: "edit", label: "고치기 (AI · 코드 · 설정)" },
      { k: "share", label: p.shared ? "공개 끄기 (나만)" : "셋에게 공개 (친구는 보기만)" },
      { sep: true }, { k: "del", label: "삭제", danger: true },
    ] : [{ k: "open", label: "열기" }, { k: "rename", label: "Rename & icon…" }, { k: "copy", label: "내 페이지로 복사해서 고치기" }, { sep: true }, { k: "hide", label: "내 화면에서 숨기기" }]), ...folderItems("page:" + id)],
    onPick: async (k) => {
      if (k.startsWith("fold-")) return folderPick(k, "page:" + id, e);
      try {
        if (k === "open") ctx.go("#/p/" + id);
        else if (k === "rename") { openRename("page:" + id); return; } // 내 Dock 에서만 바뀌는 이름 · 아이콘 (페이지 자체 제목은 그대로)
        else if (k === "edit") { ctx.go("#/p/" + id); setTimeout(() => $("#up-edit")?.click(), 400); }
        else if (k === "share") { await api.updatePage(id, { shared: !p.shared }); toast(p.shared ? "이제 나만 봐요." : "셋의 Dock 에 떠요. 친구는 보기만 해요."); }
        else if (k === "hide") { await hidePage(p); if (location.hash === "#/p/" + id) ctx.go("#/"); return; }
        else if (k === "del") { if (!confirm(`'${p.title}' 페이지를 지울까요? 되돌릴 수 없어요.`)) return; await api.deletePage(id); toast("지웠어요."); if (location.hash === "#/p/" + id) ctx.go("#/"); }
        else if (k === "copy") { const full = (await api.page(id)).page; const r = await api.addPage({ title: `${full.title} 사본`, icon: full.icon, purpose: full.purpose, files: full.files, place: full.place }); toast("내 페이지로 복사했어요."); ctx.go((r.page.place === "study" ? "#/study/" : "#/p/") + r.page.id); }
        loadDockPages();
      } catch (err) { toast(err.message || "실패했어요."); }
    },
  });
}
// 폰에서 길게 누르기(끌기 · 메뉴)는 dock-drag.js 가 맡아요

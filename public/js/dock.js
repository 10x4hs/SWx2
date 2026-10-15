// Dsm-mafia — Dock: 대화방 안 읽은 배지 + 사용자 페이지 아이콘 · 메뉴 (app.js 에서 나눴어요).
import { api } from "./api.js";
import { $, $$, esc, ymd, today, toast, kstDay } from "./util.js";
import { appIcon } from "./icons.js";
import * as studyView from "./views/study.js";
import { openMenu } from "./ctxmenu.js";
import { openRename } from "./customize.js";
import { sortByOrder } from "./dock-drag.js";
import { isHidden, hidePage } from "./hidden-pages.js";

// ctx · NAV · parseRoute · 지금 보는 화면(lastView)은 app.js 가 갖고 있어서 init 으로 받아요 (app.js 를 import 하면 순환이라서요)
let ctx, NAV, parseRoute, getLastView;
// 리스너 · 타이머는 app.js 에서 부르는 자리(= 예전 위치)에서 한 번만 걸어요
export function initDock(deps) {
  ({ ctx, NAV, parseRoute, getLastView } = deps);
  setInterval(() => { if (ctx.me && document.visibilityState === "visible") refreshUnread(); }, 60_000);
  window.addEventListener("trio:changed", (e) => { if (e.detail?.kind === "room") refreshUnread(); });
  window.addEventListener("room-live", (e) => { if (e.detail?.from !== ctx.me?.id) refreshUnread(); }); // 새 메시지 → 배지 바로
  window.addEventListener("trio:changed", (e) => { if (e.detail?.kind === "pages") loadDockPages(); });
  document.addEventListener("contextmenu", (e) => { const a = e.target.closest("[data-page]"); if (a) pageMenu(e, a.dataset.page); });
}

// until 이 지난 메뉴는 Dock 에서 빠져요 (한국 시간 기준) — 주소로 들어가면 결과는 볼 수 있어요
// when(me) 이 있는 메뉴는 그 사람에게만 (예: 일기 = 일기 모임)
const navLive = () => NAV.filter((n) => (!n.until || kstDay() <= n.until) && (!n.when || n.when(ctx.me)));

// 아이폰 Dock처럼 앱 아이콘만. 이름은 마우스를 올리면, 지금 화면은 옆에 점. data-dock = 순서를 기억하는 이름
const navItem = (n) => `<a class="rail-btn" href="${n.key === "calendar" ? "#/calendar/" + ymd(today()) : n.key === "study" ? studyView.lastHash() : n.hash}" data-nav="${n.key}" data-dock="nav:${n.key}" draggable="false" aria-label="${n.label}" data-tip="${n.tip}">${appIcon(n.icon || n.key)}${n.badge ? `<span class="dock-badge" id="${n.badge}" hidden></span>` : ""}</a>`;

// ---------- Dock 배지: 대화방 안 읽은 개수 ----------
// 로그인해 있으면 60초마다. 대화방이 열려 있을 땐 그 화면이 스스로 폴링하니 여기선 쉬어요.
export async function refreshUnread() {
  const el = $("#room-badge");
  if (!ctx.me || !el) return;
  if (getLastView() === "room") { el.hidden = true; return; }
  try {
    const r = await api.roomUnread();
    const n = Number(r.total ?? r.unread) || 0; // 우리 셋 + 1:1 전부 합친 수
    el.textContent = n > 9 ? "9+" : String(n);
    el.hidden = n === 0;
    unreadText = n ? el.textContent : "";
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
  el.innerHTML = sortByOrder(entries, ctx.me.dock_order).map((x) => x.html).join("");
  $$("[data-nav]", el).forEach((a) => { if (a.dataset.nav === cur.nav) a.setAttribute("aria-current", "page"); });
  const b = $("#room-badge"); if (b && unreadText) { b.textContent = unreadText; b.hidden = false; }
}
export async function pageMenu(e, id) {
  const p = dockPages.find((x) => x.id === id); if (!p) return;
  openMenu(e, {
    title: `${p.icon} ${p.title}`,
    items: p.mine ? [
      { k: "open", label: "열기" }, { k: "rename", label: "Rename & icon…" }, { k: "edit", label: "고치기 (AI · 코드 · 설정)" },
      { k: "share", label: p.shared ? "공개 끄기 (나만)" : "셋에게 공개 (친구는 보기만)" },
      { sep: true }, { k: "del", label: "삭제", danger: true },
    ] : [{ k: "open", label: "열기" }, { k: "rename", label: "Rename & icon…" }, { k: "copy", label: "내 페이지로 복사해서 고치기" }, { sep: true }, { k: "hide", label: "내 화면에서 숨기기" }],
    onPick: async (k) => {
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

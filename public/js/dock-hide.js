// SWx2 — Dock 자동 숨김 (맥 Dock 처럼): 켜면 Dock 이 왼쪽으로 숨고, 마우스를 화면 왼쪽 끝에 대면 본문 위로 잠깐 나와요.
// 켜고 끄기: Dock 빈 곳 우클릭 · ⌥⌘D (Ctrl+Alt+D) · Settings. 이 기기에만 기억해요 (localStorage). 폰(아래 탭바)은 그대로예요.
// Dock 설정(나오는 범위 · 확대)도 여기서 같이 들고 있어요 — Settings 화면(views/settings.js)이 바꾸고 dock-magnify.js 가 읽어요.
import { openMenu } from "./ctxmenu.js";
import { toast } from "./util.js";

const KEY = "dock-autohide", PREFS = "dock-prefs";
// edge = 왼쪽 끝 감지 폭(px) · mag = 확대 켜기 · size = 최대 배율 · range = 양옆 몇 개까지 · speed = 1(부드럽게)~10(빠르게)
export const DOCK_DEFAULTS = { edge: 6, mag: true, size: 1.5, range: 2.5, speed: 6 };
let prefs = { ...DOCK_DEFAULTS };
try { prefs = { ...DOCK_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS) || "{}") }; } catch {}
export const dockPrefs = () => prefs;
export function setDockPrefs(p) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {}
  root.style.setProperty("--dock-edge", prefs.edge + "px");
  window.dispatchEvent(new CustomEvent("trio:dock-prefs", { detail: prefs }));
}
const root = document.documentElement;
const wide = matchMedia("(min-width: 861px)");
let hideT = 0;

export const isAutoHide = () => root.classList.contains("dock-autohide");
const rail = () => document.querySelector(".rail.dock");
// 메뉴 · 타이머 창이 열려 있거나 Dock 안에 초점이 있으면 숨기지 않아요
const busy = () => !!(document.querySelector("body > .cm") || rail()?.querySelector('[aria-expanded="true"]:not(.dock-fold-btn)') || rail()?.contains(document.activeElement) && document.activeElement.matches(":focus-visible"));

function peek() { clearTimeout(hideT); root.classList.add("dock-peek"); }
function unpeek(wait = 350) {
  clearTimeout(hideT);
  hideT = setTimeout(() => { if (rail()?.matches(":hover") || busy()) return unpeek(wait); root.classList.remove("dock-peek"); }, wait);
}

export function setAutoHide(on, say = true) {
  root.classList.toggle("dock-autohide", on);
  window.dispatchEvent(new CustomEvent("trio:dock-prefs", { detail: prefs }));
  root.classList.remove("dock-peek");
  try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch {}
  if (say) toast(on ? "Dock 을 숨겼어요. 화면 왼쪽 끝에 마우스를 대면 나와요." : "Dock 을 다시 늘 보이게 했어요.");
}
export const toggleAutoHide = () => setAutoHide(!isAutoHide());

export function initDockHide() {
  root.style.setProperty("--dock-edge", prefs.edge + "px");
  try { if (localStorage.getItem(KEY) === "1") root.classList.add("dock-autohide"); } catch {}
  // 왼쪽 끝 감지 띠 — 숨김이 켜져 있을 때만 CSS 로 보여요
  const edge = document.createElement("div");
  edge.className = "dock-edge"; edge.setAttribute("aria-hidden", "true");
  document.body.append(edge);
  edge.addEventListener("mouseenter", () => { if (isAutoHide() && wide.matches) peek(); });
  edge.addEventListener("mouseleave", () => { if (isAutoHide()) unpeek(); }); // Dock 으로 안 들어가고 떠나면 다시 숨어요 (Dock 위면 unpeek 이 기다려요)
  document.addEventListener("mouseover", (e) => { if (isAutoHide() && e.target.closest?.(".rail.dock")) peek(); });
  document.addEventListener("mouseout", (e) => { if (isAutoHide() && e.target.closest?.(".rail.dock") && !e.relatedTarget?.closest?.(".rail.dock, .dock-edge")) unpeek(); });
  // 키보드로 Dock 에 들어오면(Tab) 보여 주고, 나가면 숨겨요
  document.addEventListener("focusin", (e) => { if (isAutoHide() && e.target.closest?.(".rail.dock")) peek(); });
  document.addEventListener("focusout", (e) => { if (isAutoHide() && e.target.closest?.(".rail.dock")) unpeek(); });
  // 앱을 눌러 화면이 바뀌면 바로 들어가요
  window.addEventListener("hashchange", () => { if (isAutoHide() && !busy()) unpeek(120); });
  addEventListener("keydown", (e) => {
    if (e.code === "KeyD" && e.altKey && (e.metaKey || e.ctrlKey) && !e.shiftKey) { e.preventDefault(); toggleAutoHide(); }
  });
  // Dock 빈 곳 우클릭 (아이콘 · 페이지 · 폴더 위는 각자 메뉴가 있어요)
  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest(".rail.dock") || e.target.closest(".rail-btn, [data-page], [data-dock], [data-folder]")) return;
    openMenu(e, { title: "Dock", items: [{ k: "hide", label: isAutoHide() ? "Dock 늘 보이기" : "Dock 자동 숨기기 · ⌥⌘D" }], onPick: toggleAutoHide });
  });
}

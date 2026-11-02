// Settings — #/settings (내 메뉴 맨 아래 'Settings'). 맥 시스템 설정처럼 왼쪽 분류 · 오른쪽 항목.
//   Dock: 자동 숨김 · 확대(켜기 · 크기 · 범위 · 속도) — 이 기기에만 (dock-hide.js 의 dockPrefs), 바꾸면 옆 Dock 에 바로 보여요
//   계정 · 연결 · 관리: 예전 내 메뉴에 있던 것들 (프로필 · 비밀번호 · 로그아웃 · MCP · 페이지 API · 팀 · 관리자)
import { $, esc } from "../util.js";
import { icon } from "../icons.js";
import { dockPrefs, setDockPrefs, isAutoHide, setAutoHide, DOCK_DEFAULTS } from "../dock-hide.js";
import { openProfile } from "../profile-edit.js";
import { openPassword } from "../password.js";
import { openMcpPanel } from "../mcp-panel.js";
import { openApiPanel } from "../api-panel.js";

const TABS = [["dock", "Dock"], ["account", "계정"], ["connect", "연결"], ["manage", "관리"]];
const isMac = /Mac|iP(hone|ad)/.test(navigator.platform || navigator.userAgent);
const sw = (id, on) => `<input class="set-sw" type="checkbox" role="switch" id="${id}"${on ? " checked" : ""}>`;
const range = (id, min, max, step, v) => `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><output for="${id}" id="${id}-o"></output>`;
const row = (label, sub, ctl, forId) => `<div class="set-row"><label${forId ? ` for="${forId}"` : ""}>${label}${sub ? `<small>${sub}</small>` : ""}</label><div class="set-ctl">${ctl}</div></div>`;
const link = (k, label, sub = "", cls = "") => `<button type="button" class="set-link ${cls}" data-act="${k}"><span>${label}</span><small>${sub}</small>${cls ? "" : icon.right(14)}</button>`;

export function mount(root, ctx, r) {
  let tab = TABS.some(([k]) => k === r?.tab) ? r.tab : "dock";
  const admin = ctx.me?.role === "admin" && !ctx.me.impersonated_by;
  root.innerHTML = `<div class="set">
    <nav class="set-nav" aria-label="설정 분류"><b>Settings</b>${TABS.map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`).join("")}</nav>
    <div class="set-pane" id="set-pane"></div></div>`;
  const pane = $("#set-pane", root);

  function draw() {
    root.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.tab === tab)));
    const p = dockPrefs();
    if (tab === "dock") pane.innerHTML = `<h1>Dock</h1><p class="set-sub">이 기기에만 저장돼요. 바꾸면 왼쪽 Dock 에 바로 보여요.</p>
      <section class="set-group"><h2>자동 숨김</h2>
        ${row("Dock 자동 숨기기", `평소엔 숨고, 화면 왼쪽 끝에 마우스를 대면 나와요 · ${isMac ? "⌥⌘D" : "Ctrl+Alt+D"}`, sw("s-hide", isAutoHide()), "s-hide")}
      </section>
      <section class="set-group"><h2>확대</h2>
        ${row("마우스 대면 커지기", "맥 Dock 처럼 마우스에 가까운 아이콘일수록 커져요", sw("s-mag", p.mag), "s-mag")}
        ${row("최대 크기", "", range("s-size", 1.1, 2, 0.05, p.size), "s-size")}
        ${row("퍼지는 범위", "양옆 몇 개 아이콘까지 같이 커질지", range("s-range", 1, 5, 0.5, p.range), "s-range")}
        ${row("반응 속도", "느릴수록 더 부드럽게 따라와요", range("s-speed", 1, 10, 1, p.speed), "s-speed")}
      </section>
      <button type="button" class="set-reset" id="s-reset">기본값으로</button>`;
    else if (tab === "account") pane.innerHTML = `<h1>계정</h1><p class="set-sub">${esc(ctx.me.display_name)} · @${esc(ctx.me.username)}</p>
      <section class="set-group">${link("profile", "프로필 바꾸기", "이름 · 사진 · 소개")}${link("password", "비밀번호 바꾸기")}</section>
      <section class="set-group">${link("logout", "로그아웃", "", "danger")}</section>`;
    else if (tab === "connect") pane.innerHTML = `<h1>연결</h1><p class="set-sub">AI 에이전트와 바깥 프로그램이 내 기록을 쓰게 하는 연결이에요.</p>
      <section class="set-group">${link("mcp", "MCP 연결 (AI 에이전트)", "Claude · Codex 같은 에이전트")}${link("api", "페이지 API · 개인 키")}</section>`;
    else pane.innerHTML = `<h1>관리</h1><p class="set-sub">팀${admin ? "과 관리자 화면" : ""}이에요.</p>
      <section class="set-group">${link("teams", "팀", "초대 · 멤버")}${admin ? link("admin", "관리자", "관리자만 보여요") : ""}</section>`;
    paintOut();
  }
  const fmt = { "s-size": (v) => (+v).toFixed(2) + "×", "s-range": (v) => "±" + v + "개", "s-speed": (v) => v + "/10" };
  function paintOut() { for (const id in fmt) { const i = $("#" + id, root); if (i) $("#" + id + "-o", root).textContent = fmt[id](i.value); } }

  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; history.replaceState(null, "", "#/settings/" + tab); draw(); return; }
    if (e.target.closest("#s-reset")) { setDockPrefs(DOCK_DEFAULTS); draw(); return; }
    const a = e.target.closest("[data-act]")?.dataset.act; if (!a) return;
    if (a === "profile") openProfile(ctx);
    else if (a === "password") openPassword();
    else if (a === "mcp") openMcpPanel(ctx);
    else if (a === "api") openApiPanel(ctx);
    else if (a === "teams") location.hash = "#/teams";
    else if (a === "admin") location.hash = "#/admin";
    else if (a === "logout") window.dispatchEvent(new CustomEvent("trio:signout"));
  });
  root.addEventListener("input", (e) => {
    const id = e.target.id, v = +e.target.value;
    if (id === "s-size") setDockPrefs({ size: v });
    else if (id === "s-range") setDockPrefs({ range: v });
    else if (id === "s-speed") setDockPrefs({ speed: v });
    paintOut();
  });
  root.addEventListener("change", (e) => {
    if (e.target.id === "s-hide") setAutoHide(e.target.checked);
    else if (e.target.id === "s-mag") setDockPrefs({ mag: e.target.checked });
  });
  draw();
}

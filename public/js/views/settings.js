// Settings — #/settings/<분류> (내 메뉴 '설정'). 내 설정이 모두 여기 한 곳에 있어요 — 맥 시스템 설정처럼 왼쪽 분류 · 오른쪽 항목.
//   계정    프로필(창) · 비밀번호 · 상태 · 하루 계획표 공개 · 로그아웃 — 내 메뉴의 빠른 칸과 같은 값 (users.status · plans_open)
//   화면    화면 꾸미기(theme-panel.js 와 같은 칸, 계정) + Dock(자동 숨김 · 확대 — 이 기기에만, dock-hide.js)
//   AI      모델(users.ai_model) · 웹 먼저 찾기(prefs ai_web) — 앱 안의 고르기 칸(ai-pick.js)과 같은 값
//   공부    MBA · SW 하루 시간 · 영어 읽기 속도 · 집중 '직접' 분(prefs.js, 계정) · CIM 시험일(/apps/cim/state) · 뉴스 하루 기사 수(/news/prefs)
//   알림    이 기기 푸시 켜기 · 끄기 · 테스트 (구독은 기기마다 따로예요)
//   숨긴 페이지 · 연결(MCP · 페이지 API) · 관리(팀 · 관리자)
// 바꾸면 곧바로 저장돼요. 앱 안에서 바꿔도 같은 값이라 여기와 늘 같아요.
import { $, esc, toast } from "../util.js";
import { icon } from "../icons.js";
import { api } from "../api.js";
import { dockPrefs, setDockPrefs, isAutoHide, setAutoHide, DOCK_DEFAULTS } from "../dock-hide.js";
import { openProfile } from "../profile-edit.js";
import { openPassword } from "../password.js";
import { openMcpPanel } from "../mcp-panel.js";
import { openApiPanel } from "../api-panel.js";
import { mountThemeControls } from "../theme-panel.js";
import { mountAiPick, aiPrefs, setAiPrefs } from "../ai-pick.js";
import { getPref, setPref } from "../prefs.js";
import { statusPicker, statusText, nextStatus } from "../status.js";
import { unhidePage } from "../hidden-pages.js";
import { isOpen } from "../features.js";
import * as mba from "../mba/data.js";
import * as dev from "../dev/data.js";

const TABS = [["account", "계정"], ["screen", "화면"], ["ai", "AI"], ["study", "공부"], ["notify", "알림"], ["hidden", "숨긴 페이지"], ["connect", "연결"], ["manage", "관리"]];
const OLD = { dock: "screen" }; // 예전 주소 (#/settings/dock)
const isMac = /Mac|iP(hone|ad)/.test(navigator.platform || navigator.userAgent);
const sw = (id, on, dis) => `<input class="set-sw" type="checkbox" role="switch" id="${id}"${on ? " checked" : ""}${dis ? " disabled" : ""}>`;
const range = (id, min, max, step, v) => `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><output for="${id}" id="${id}-o"></output>`;
const row = (label, sub, ctl, forId) => `<div class="set-row"><label${forId ? ` for="${forId}"` : ""}>${label}${sub ? `<small>${sub}</small>` : ""}</label><div class="set-ctl">${ctl}</div></div>`;
const link = (k, label, sub = "", cls = "") => `<button type="button" class="set-link ${cls}" data-act="${k}"><span>${label}</span><small>${sub}</small>${cls ? "" : icon.right(14)}</button>`;
// 고르기 칸 (몇 개 중 하나) — data-pref 로 어느 값인지
const seg = (key, list, cur, label) => `<div class="seg set-seg" role="radiogroup" aria-label="${esc(label)}" data-pref="${key}">${list.map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === String(cur)}">${esc(l)}</button>`).join("")}</div>`;
const NEWS_Q = [3, 5, 7];
const pushOk = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function mount(root, ctx, r) {
  const want = OLD[r?.tab] || r?.tab;
  let tab = TABS.some(([k]) => k === want) ? want : "account";
  const admin = ctx.me?.role === "admin" && !ctx.me.impersonated_by;
  root.innerHTML = `<div class="set">
    <nav class="set-nav" aria-label="설정 분류"><b>설정</b>${TABS.map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`).join("")}</nav>
    <div class="set-pane" id="set-pane"></div></div>`;
  const pane = $("#set-pane", root);
  let unpane = null, alive = true;

  const accountHTML = () => {
    const me = ctx.me, open = me.plans_open !== false;
    return `<h1>계정</h1><p class="set-sub">${esc(me.display_name)} · @${esc(me.username)}</p>
      <section class="set-group">${link("profile", "프로필 바꾸기", "이름 · 사진 · 소개 · 하루 목표")}${link("password", "비밀번호 바꾸기")}</section>
      <section class="set-group"><h2>상태</h2><div class="set-block" id="s-status"><p class="set-now">${me.status ? `지금 <b>${esc(statusText(me.status))}</b>` : "상태 없음"}</p>${statusPicker(me.status)}</div></section>
      <section class="set-group"><h2>하루 계획표</h2>
        ${row("친구들에게 보이기", open ? "친구들이 내 하루 계획표를 볼 수 있어요" : "내 계획표는 나만 봐요", seg("plans_open", [["1", "공개"], ["0", "비공개"]], open ? "1" : "0", "하루 계획표 공개"))}
      </section>
      <section class="set-group">${link("logout", "로그아웃", "", "danger")}</section>`;
  };
  const screenHTML = () => {
    const p = dockPrefs();
    return `<h1>화면</h1><p class="set-sub">화면 꾸미기는 계정에 저장돼서 다른 기기도 같아요.</p>
      <section class="set-group set-thm" id="s-theme"></section>
      <div class="set-dock"><h2 class="set-h2">Dock</h2><p class="set-sub">Dock 은 기기마다 화면 크기가 달라서 <b>이 기기에만</b> 저장돼요. 바꾸면 왼쪽 Dock 에 바로 보여요.</p>
      <section class="set-group"><h2>자동 숨김</h2>
        ${row("Dock 자동 숨기기", `평소엔 숨고, 화면 왼쪽 끝에 마우스를 대면 나와요 · ${isMac ? "⌥⌘D" : "Ctrl+Alt+D"}`, sw("s-hide", isAutoHide()), "s-hide")}
      </section>
      <section class="set-group"><h2>확대</h2>
        ${row("마우스 대면 커지기", "맥 Dock 처럼 마우스에 가까운 아이콘일수록 커져요", sw("s-mag", p.mag), "s-mag")}
        ${row("최대 크기", "", range("s-size", 1.1, 2, 0.05, p.size), "s-size")}
        ${row("퍼지는 범위", "양옆 몇 개 아이콘까지 같이 커질지", range("s-range", 1, 5, 0.5, p.range), "s-range")}
        ${row("반응 속도", "느릴수록 더 부드럽게 따라와요", range("s-speed", 1, 10, 1, p.speed), "s-speed")}
      </section>
      <button type="button" class="set-reset" id="s-reset">Dock 기본값으로</button></div>`;
  };
  const aiHTML = () => `<h1>AI</h1><p class="set-sub">일정 AI 비서 · 노트 AI · 편집기 · 계획 AI 가 모두 같은 설정을 써요. 계정에 저장돼요.</p>
      <section class="set-group">
        ${row("AI 모델", "자정 AI 점수 · 주간 회고도 이 모델을 먼저 써요", `<span id="s-ai-model"></span>`)}
        ${row("웹 먼저 찾기", "켜면 질문마다 먼저 웹을 검색하고 답해요 (꺼도 AI 가 필요하면 스스로 찾아요)", sw("s-ai-web", aiPrefs().web), "s-ai-web")}
      </section>`;
  const studyHTML = () => {
    const rows = [];
    if (isOpen(ctx, "biz")) rows.push(row("MBA 하루 시간", "오늘의 순서 · 카드 수가 이 시간에 맞춰져요", seg("mba_min", mba.MINUTES.map((v) => [v, v + "분"]), mba.minutes(), "MBA 하루 시간")));
    if (isOpen(ctx, "dev")) rows.push(row("SW 하루 시간", "SW 교과서 하루 분량", seg("dev_min", dev.MINUTES.map((v) => [v, v + "분"]), dev.minutes(), "SW 하루 시간")));
    if (isOpen(ctx, "study")) rows.push(row("영어 읽기 속도", "🔊 듣기 · 따라 말하기의 목소리 빠르기", seg("en_rate", [[1, "보통"], [0.8, "천천히"]], getPref("en_rate", 1) === 0.8 ? 0.8 : 1, "영어 읽기 속도")));
    if (isOpen(ctx, "cim")) rows.push(row("CIM 시험일", "날짜에 맞춰 하루 분량이 정해져요", `<input class="input set-date" type="date" id="s-cim-exam" aria-label="CIM 시험일" disabled>`, "s-cim-exam"));
    if (isOpen(ctx, "news")) rows.push(row("뉴스 하루 기사 수", "Today's reading 에 나오는 기사 수 (1~30)", `<span class="set-news">${seg("news_q", NEWS_Q.map((v) => [v, v + "개"]), "", "뉴스 하루 기사 수")}<input class="input set-num" type="number" id="s-news-n" min="1" max="30" step="1" inputmode="numeric" aria-label="뉴스 하루 기사 수 직접 (1~30)" disabled></span>`));
    rows.push(row("집중 '직접' 시간", "타이머에서 '직접'을 누르면 처음 나오는 분 (1~240)", `<input class="input set-num" type="number" id="s-focus" min="1" max="240" step="1" inputmode="numeric" value="${esc(String(Math.round(+getPref("focus_min", 40)) || 40))}"><span class="set-unit">분</span>`, "s-focus"));
    return `<h1>공부</h1><p class="set-sub">공부 화면의 하루 분량이에요. 계정에 저장돼서 다른 기기에서도 같아요. 앱 안에서 바꿔도 여기와 같아요.</p>
      <section class="set-group">${rows.join("")}</section>`;
  };
  const notifyHTML = () => `<h1>알림</h1><p class="set-sub">앱이 닫혀 있어도 새 메시지 · 집중 시작 · 끝을 알려 드려요. 알림은 브라우저마다 따로 켜요.</p>
      <section class="set-group">
        ${row("이 기기에 알림 받기", `<span id="s-push-sub">확인하는 중…</span>`, sw("s-push", false, true), "s-push")}
        ${row("테스트 알림", "지금 한 번 보내 봐요", `<button type="button" class="btn ghost sm" id="s-push-test">보내기</button>`)}
      </section>`;
  const hiddenHTML = () => `<h1>숨긴 페이지</h1><p class="set-sub">친구가 공개한 페이지를 내 화면에서만 숨긴 것들이에요. 친구 쪽엔 아무 변화가 없어요.</p>
      <section class="set-group" id="s-hidden"><p class="set-empty">불러오는 중…</p></section>`;
  const connectHTML = () => `<h1>연결</h1><p class="set-sub">AI 에이전트와 바깥 프로그램이 내 기록을 쓰게 하는 연결이에요.</p>
      <section class="set-group">${link("mcp", "MCP 연결 (AI 에이전트)", "Claude · Codex 같은 에이전트")}${link("api", "페이지 API · 개인 키")}</section>`;
  const manageHTML = () => `<h1>관리</h1><p class="set-sub">팀${admin ? "과 관리자 화면" : ""}이에요.</p>
      <section class="set-group">${link("teams", "팀", "초대 · 멤버")}${admin ? link("admin", "관리자", "관리자만 보여요") : ""}</section>`;
  const HTML = { account: accountHTML, screen: screenHTML, ai: aiHTML, study: studyHTML, notify: notifyHTML, hidden: hiddenHTML, connect: connectHTML, manage: manageHTML };

  function draw() {
    unpane?.(); unpane = null;
    root.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.tab === tab)));
    pane.innerHTML = HTML[tab]();
    if (tab === "screen") unpane = mountThemeControls($("#s-theme", pane));
    if (tab === "ai") mountAiPick($("#s-ai-model", pane), { web: false });
    if (tab === "study") fillStudy();
    if (tab === "notify") fillPush();
    if (tab === "hidden") fillHidden();
    paintOut();
  }
  const fmt = { "s-size": (v) => (+v).toFixed(2) + "×", "s-range": (v) => "±" + v + "개", "s-speed": (v) => v + "/10" };
  function paintOut() { for (const id in fmt) { const i = $("#" + id, root); if (i) $("#" + id + "-o", root).textContent = fmt[id](i.value); } }
  const markSeg = (key, v) => pane.querySelectorAll(`[data-pref="${key}"] [data-v]`).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === String(v))));

  // 공부: 서버에서 받아야 하는 칸 (CIM 시험일 · 뉴스 기사 수)
  let cimStore = null;
  async function fillStudy() {
    const exam = $("#s-cim-exam", pane);
    if (exam) {
      try {
        cimStore = await import("../cim/store.js");
        const S = await cimStore.ready(ctx);
        if (!alive || !exam.isConnected) return;
        exam.value = S.exam || ""; exam.min = cimStore.today(); exam.disabled = false;
      } catch { /* 못 받으면 잠가 둬요 */ }
    }
    const n = $("#s-news-n", pane);
    if (n) {
      let q = null;
      try { const d = await api.newsLeaderboard(); q = (d.board || []).find((b) => b.user_id === ctx.me.id)?.quota || null; } catch {}
      if (!alive || !n.isConnected) return;
      const v = okQ(+q) ? +q : okQ(+localStorage.getItem("gn-quota")) ? +localStorage.getItem("gn-quota") : 5;
      n.value = v; n.disabled = false; markSeg("news_q", v);
    }
  }
  const okQ = (n) => Number.isInteger(n) && n >= 1 && n <= 30;
  async function setNews(v) {
    if (!okQ(v)) return toast("1~30 사이로 써 주세요.", "err");
    markSeg("news_q", v); const n = $("#s-news-n", pane); if (n) n.value = v;
    try { localStorage.setItem("gn-quota", String(v)); } catch {}
    try { await api.newsPrefs({ quota: v }); toast(`뉴스를 하루 ${v}개씩 읽어요.`); } catch (e) { toast(e.message, "err"); }
  }

  // 알림: 이 브라우저의 푸시 구독
  async function pushState() {
    if (!pushOk()) return { ok: false, why: "이 브라우저는 알림을 못 받아요." };
    if (Notification.permission === "denied") return { ok: false, why: "브라우저에서 알림이 막혀 있어요. 주소창 왼쪽 자물쇠 → 알림 → 허용." };
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    return { ok: true, on: !!sub && Notification.permission === "granted", reg, sub };
  }
  async function fillPush() {
    const s = await pushState(), box = $("#s-push", pane), sub = $("#s-push-sub", pane);
    if (!box || !alive) return;
    box.checked = !!s.on; box.disabled = !s.ok;
    sub.textContent = !s.ok ? s.why : s.on ? "켜져 있어요 · 끄면 이 기기로는 알림이 안 와요" : "꺼져 있어요";
  }
  async function togglePush(on) {
    try {
      if (on) {
        if ((await Notification.requestPermission()) !== "granted") { toast("브라우저에서 알림을 허용해 주어야 해요.", "err"); return; }
        await (await import("../auto-focus.js")).askPush();
        toast("이 기기로 알림이 와요.");
      } else {
        const s = await pushState();
        if (s.sub) { await api.pushUnsubscribe({ endpoint: s.sub.endpoint }).catch(() => {}); await s.sub.unsubscribe(); }
        toast("이 기기의 알림을 껐어요.");
      }
    } catch (e) { toast(e.message || "알림을 바꾸지 못했어요.", "err"); }
    fillPush();
  }
  async function testPush() {
    try {
      if (!("Notification" in window)) return toast("이 브라우저는 알림을 못 띄워요.", "err");
      if ((await Notification.requestPermission()) !== "granted") return toast("알림이 막혀 있어요. 주소창 왼쪽 자물쇠 → 알림 → 허용.", "err");
      const reg = await navigator.serviceWorker?.getRegistration();
      const opt = { body: "이렇게 새 메시지 · 집중 시작 · 끝을 알려 드려요", icon: "/icons/icon-192.png", tag: "swx2-test" };
      reg ? await reg.showNotification("SWx2 알림 테스트", opt) : new Notification("SWx2 알림 테스트", opt);
      toast("테스트 알림을 보냈어요.");
    } catch (e) { toast(e.message, "err"); }
  }

  // 숨긴 페이지
  async function fillHidden() {
    const box = $("#s-hidden", pane), ids = ctx.me.hidden_pages || [];
    if (!ids.length) { box.innerHTML = `<p class="set-empty">숨긴 페이지가 없어요. 친구 페이지를 우클릭 → '내 화면에서 숨기기'로 숨길 수 있어요.</p>`; return; }
    let pages = [];
    try { pages = (await api.pages()).pages || []; } catch {}
    if (!alive || !box.isConnected) return;
    const rows = ids.map((id) => pages.find((p) => p.id === id) || { id, title: "(지워진 페이지)" });
    box.innerHTML = rows.map((p) => `<div class="set-row"><label>${esc(p.icon || "✨")} ${esc(p.title)}<small>${p.place === "study" ? "공부 탭" : p.place ? "Dock" : ""}${p.user_id ? " · " + esc(ctx.user?.(p.user_id)?.display_name || "") : ""}</small></label><div class="set-ctl"><button type="button" class="btn ghost sm" data-unhide="${esc(p.id)}">다시 보이기</button></div></div>`).join("");
  }

  async function saveMe(patch, msg) {
    try {
      const r = await api.updateMe(patch);
      window.dispatchEvent(new CustomEvent("trio:me", { detail: { ...ctx.me, ...r.user } }));
      window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "status" } }));
      if (msg) toast(msg);
    } catch (x) { toast(x.message, "err"); }
  }

  let mine = false; // 여기서 바꾼 값이면 다시 그리지 않아요
  root.addEventListener("click", (e) => { mine = true; try { onClick(e); } finally { mine = false; } });
  root.addEventListener("change", (e) => { mine = true; try { onChange(e); } finally { mine = false; } });
  function onClick(e) {
    const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; history.replaceState(null, "", "#/settings/" + tab); draw(); return; }
    if (e.target.closest("#s-reset")) { setDockPrefs(DOCK_DEFAULTS); draw(); return; }
    if (e.target.closest("#s-push-test")) { testPush(); return; }
    const un = e.target.closest("[data-unhide]"); if (un) { un.disabled = true; unhidePage(un.dataset.unhide); return; }
    const st = e.target.closest("#s-status [data-st], #s-status [data-tool]"); if (st) { saveMe({ status: nextStatus(ctx.me.status, st) }); return; }
    const opt = e.target.closest("[data-pref] [data-v]");
    if (opt) {
      const key = opt.closest("[data-pref]").dataset.pref, v = opt.dataset.v;
      if (key === "plans_open") { const open = v === "1"; if (open !== (ctx.me.plans_open !== false)) saveMe({ plans_open: open }, open ? "이제 친구들이 내 하루 계획표를 볼 수 있어요." : "내 하루 계획표는 나만 봐요."); return; }
      if (key === "news_q") { setNews(+v); return; }
      if (key === "mba_min") mba.setMinutes(+v);
      else if (key === "dev_min") dev.setMinutes(+v);
      else if (key === "en_rate") setPref("en_rate", +v === 0.8 ? 0.8 : 1);
      markSeg(key, v); return;
    }
    const a = e.target.closest("[data-act]")?.dataset.act; if (!a) return;
    if (a === "profile") openProfile(ctx);
    else if (a === "password") openPassword();
    else if (a === "mcp") openMcpPanel(ctx);
    else if (a === "api") openApiPanel(ctx);
    else if (a === "teams") location.hash = "#/teams";
    else if (a === "admin") location.hash = "#/admin";
    else if (a === "logout") window.dispatchEvent(new CustomEvent("trio:signout"));
  }
  root.addEventListener("input", (e) => {
    const id = e.target.id, v = +e.target.value;
    if (id === "s-size") setDockPrefs({ size: v });
    else if (id === "s-range") setDockPrefs({ range: v });
    else if (id === "s-speed") setDockPrefs({ speed: v });
    paintOut();
  });
  function onChange(e) {
    const id = e.target.id;
    if (id === "s-hide") setAutoHide(e.target.checked);
    else if (id === "s-mag") setDockPrefs({ mag: e.target.checked });
    else if (id === "s-ai-web") setAiPrefs({ web: e.target.checked });
    else if (id === "s-push") togglePush(e.target.checked);
    else if (id === "s-news-n") setNews(Math.round(+e.target.value));
    else if (id === "s-focus") { const m = Math.round(+e.target.value); if (m >= 1 && m <= 240) setPref("focus_min", m); else { toast("1~240분 사이로 써 주세요.", "err"); e.target.value = Math.round(+getPref("focus_min", 40)) || 40; } }
    else if (id === "s-cim-exam" && cimStore && e.target.value) { const S = cimStore.st(); if (S) { S.exam = e.target.value; cimStore.save(); toast("CIM 시험일을 바꿨어요."); } }
  }
  // 다른 곳(내 메뉴 · 앱 안 · 다른 기기)에서 바뀌면 지금 분류를 다시 그려요 (입력 중인 칸이 있으면 그대로)
  const typing = () => pane.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) && document.activeElement.type !== "checkbox";
  const onMe = () => { if (["account", "hidden"].includes(tab)) draw(); };
  const onPrefs = () => { if (!mine && ["ai", "study"].includes(tab) && !typing()) draw(); };
  window.addEventListener("trio:me", onMe); window.addEventListener("trio:prefs", onPrefs);
  draw();
  return () => { alive = false; unpane?.(); window.removeEventListener("trio:me", onMe); window.removeEventListener("trio:prefs", onPrefs); };
}

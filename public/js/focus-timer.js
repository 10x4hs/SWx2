// SWx2 — 집중 타이머 (app.js 에서 나눴어요). 화면 맨 위 가운데의 "집중 섬"(Dynamic Island 모양)으로 보여요.
//   · 집중 중 · 일시정지 동안만 작은 검은 알약이 떠요: 진행 링 + "집중" + 남은 시간. 어느 화면에서나 보여요.
//   · 알약을 누르면(또는 Dock ⏱) 큰 카드로 펼쳐져요: +5분 · 일시정지(주황) · 멈추기(빨강). 바깥 클릭 · Esc 로 접혀요.
//   · 쉬고 있을 때 Dock ⏱ 를 누르면 같은 카드가 길이(15 · 25 · 50 · 90분) · 이름 칸 · 시작 버튼으로 펼쳐져요.
//   · 끝나면 잠깐 "끝" 알약을 보여 주고 사라져요. 스타일은 css/island.css.
// 펼침/접힘 = #timer 의 hidden 속성이에요. app.js 의 Dock ⏱ 버튼 · 바깥 클릭이 이 속성만 바꾸니까 그대로 써요
// (hidden 이어도 세션이 있으면 island.css 가 작은 알약으로 보여 줘요).
import { api } from "./api.js";
import { $, esc, ymd, today, nowTime, toast, pad } from "./util.js";
import { icon } from "./icons.js";

// ctx 는 app.js 가 갖고 있어서 init 으로 받아요. 할 일 ▶ 가 ctx.timer 로 부르니 여기서 붙여 줘요
let ctx;
export function initTimer(deps) {
  ({ ctx } = deps); ctx.timer = timer;
  document.addEventListener("keydown", (e) => { // Esc = 펼친 섬 접기 (다른 창이 Esc 를 먼저 썼으면 그대로 둬요)
    const el = $("#timer");
    if (e.key !== "Escape" || e.defaultPrevented || !el || el.hidden) return;
    e.preventDefault();
    collapse(el.contains(document.activeElement));
  });
  // 로그아웃하면 일시정지 중이던 세션도 끝내요 (app.js 는 도는 중일 때만 멈춰요)
  window.addEventListener("trio:signed-out", () => { if (timer.active) timer.stop(); });
  // 새로고침 · 다른 탭: 이 기기에 저장한 세션을 이어 받아요
  restore(load());
  window.addEventListener("storage", (e) => { if (e.key === SESS) restore(load(), true); });
}

// 세션을 이 기기(localStorage)에 남겨서 새로고침해도 · 다른 탭에서도 같은 집중이 보여요
const SESS = "focus-sess";
const load = () => { try { return JSON.parse(localStorage.getItem(SESS) || "null"); } catch { return null; } };
function save() {
  try {
    if (!timer.active) localStorage.removeItem(SESS);
    else localStorage.setItem(SESS, JSON.stringify({ total: timer.total, left: timer.left, end: timer.end, running: timer.running, label: timer.label, plan_id: timer.plan_id, preset: timer.preset }));
  } catch {}
}
let quiet = false; // 다른 탭에서 받은 걸 적용하는 중엔 다시 저장하지 않아요
function restore(x, fromOther = false) {
  quiet = true;
  try {
    if (!x) { if (fromOther && timer.active) { timer.running = false; timer.active = false; clearInterval(timer.t); timer.total = timer.left = timer.preset; timer.plan_id = null; timer.label = ""; renderTimer(); } return; }
    Object.assign(timer, { total: x.total, preset: x.preset || x.total, label: x.label || "", plan_id: x.plan_id || null });
    if (x.running) {
      const left = Math.round((x.end - Date.now()) / 1000);
      if (left <= 0) { timer.active = true; timer.left = 0; timer.end = x.end; timer.finish(); return; }
      timer.active = true; timer.left = left; timer.start();
    } else { clearInterval(timer.t); timer.running = false; timer.active = true; timer.left = x.left; renderTimer(); }
  } finally { quiet = false; }
}

const PRESETS = [15, 25, 50, 90];
// '직접' = 1~240분을 내가 쳐요. 마지막에 친 값은 이 기기에 기억해요
let customOpen = false;
const lastCustom = () => { try { return +localStorage.getItem("focus-custom-min") || 40; } catch { return 40; } };
const DONE_MS = 4000, FLASH_MS = 2200;
// 시작 · 일시정지 · 처음으로 · 끝 에서 "지금 공부 중" 상태를 서버에 알려요 (무엇을 하는지는 안 보내요).
const presence = (state, ends_at) => api.setPresence(state === "focus" ? { state, ends_at } : { state }).catch(() => {});
const clock = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

export const timer = {
  total: 25 * 60, left: 25 * 60, preset: 25 * 60, running: false, active: false, end: 0, t: null, label: "", plan_id: null,
  doneUntil: 0, doneMins: 0, flashUntil: 0,
  start(min) {
    if (min) { this.preset = this.total = this.left = min * 60; }
    if (this.left <= 0) this.left = this.total;
    const fresh = !this.active || !!min; // 처음 시작 · 길이를 새로 고른 시작 (↔ 일시정지에서 계속)
    this.running = true; this.active = true; this.doneUntil = 0;
    this.end = Date.now() + this.left * 1000;
    clearInterval(this.t);
    this.t = setInterval(() => {
      this.left = Math.max(0, Math.round((this.end - Date.now()) / 1000));
      if (this.left === 0) this.finish();
      this.paint();
    }, 250);
    if (!quiet) { presence("focus", this.end); save(); }
    if (fresh && !quiet) { this.flashUntil = Date.now() + FLASH_MS; setTimeout(() => renderTimer(), FLASH_MS + 20); }
    say(fresh ? `집중을 시작했어요. ${Math.ceil(this.left / 60)}분 남았어요.` : `다시 집중해요. ${Math.ceil(this.left / 60)}분 남았어요.`);
    renderTimer();
  },
  // 할 일 ▶: 그 할 일 이름 · id 로 시작 (끝나면 그 할 일에 집중 시간이 쌓여요)
  startFor(plan) {
    if (this.running) {
      toast(this.plan_id === plan.id ? "이미 이 할 일로 집중하고 있어요." : "집중 타이머가 이미 돌고 있어요. 멈추거나 끝난 뒤에 시작해요.");
      openTimer(); return;
    }
    this.label = String(plan.text || "").slice(0, 60);
    this.plan_id = plan.id;
    this.active = false; // 일시정지 중이던 세션은 새 할 일로 바꿔요
    this.total = this.left = this.preset;
    this.start(); // 섬이 "‘이름’ 집중 시작" 으로 잠깐 넓어져요 (예전 토스트 대신)
  },
  // +5분: 남은 시간 · 블록 길이를 같이 늘려요 (끝나면 늘린 만큼 기록돼요)
  addMinutes(n = 5) {
    if (!this.active) return;
    this.total += n * 60; this.left += n * 60;
    if (this.running) { this.end += n * 60 * 1000; presence("focus", this.end); }
    save();
    say(`${n}분 늘렸어요. ${Math.ceil(this.left / 60)}분 남았어요.`);
    renderTimer();
  },
  pause() { this.running = false; clearInterval(this.t); presence("idle"); save(); say("일시정지했어요."); renderTimer(); },
  reset() { this.pause(); this.left = this.total; save(); renderTimer(); },
  // 멈추기: 기록 없이 끝내요 (로그아웃할 때도 불려요)
  stop() {
    this.running = false; this.active = false; clearInterval(this.t); presence("idle");
    this.total = this.left = this.preset; this.plan_id = null; this.label = ""; this.flashUntil = 0; document.title = "SWx2";
    if (!quiet) save();
    renderTimer();
  },
  async finish() {
    clearInterval(this.t);
    // 탭이 여러 개면 한 탭만 기록해요: 저장된 세션을 먼저 지운 탭이 기록 담당
    const mine = (() => { try { const x = load(); if (!x) return false; localStorage.removeItem(SESS); return true; } catch { return true; } })();
    this.running = false; this.active = false;
    const mins = Math.round(this.total / 60);
    chime();
    document.title = "SWx2";
    presence("idle");
    this.doneUntil = Date.now() + DONE_MS; this.doneMins = mins; this.flashUntil = 0;
    collapse(false); // 펼쳐져 있었어도 "끝" 알약으로
    say(`집중 ${mins}분이 끝났어요.`);
    setTimeout(() => { if (this.doneUntil && Date.now() >= this.doneUntil - 50) leave(); }, DONE_MS);
    if (!mine) { this.total = this.left = this.preset; renderTimer(); return; }
    try {
      const b = { day: ymd(today()), at: nowTime(), text: `집중 ${mins}분${this.label ? " · " + this.label : ""}`, kind: "focus", mins };
      if (this.plan_id) b.plan_id = this.plan_id;
      await api.addLog(b);
      toast(this.plan_id ? `집중 ${mins}분 완료. ‘${this.label}’에 쌓였어요.` : `집중 ${mins}분 완료. 오늘 기록에 남겼어요.`);
      ctx.changed("logs");
    } catch (e) { toast(e.message, "err"); }
    this.total = this.left = this.preset;
    renderTimer();
  },
  // 1초에 4번: 숫자 · 링 · 탭 제목 · Dock 작은 숫자 (DOM 은 다시 만들지 않아요)
  paint() {
    const el = $("#timer");
    if (!el) return;
    const t = clock(this.left), frac = this.total ? 1 - this.left / this.total : 0;
    el.querySelectorAll(".isl-time, .isl-clock").forEach((n) => { n.textContent = t; });
    el.querySelectorAll(".isl-ring .prog").forEach((c) => { c.style.strokeDashoffset = String(RING_C * (1 - frac)); });
    document.title = this.running ? `${t} · 집중 중` : "SWx2";
    const mini = $("#timer-mini");
    if (mini) { mini.classList.toggle("on", this.running); mini.textContent = this.running ? t : ""; }
    const pill = el.querySelector(".isl-pill");
    if (pill && this.active) pill.setAttribute("aria-label", `집중 타이머 · ${this.running ? "" : "일시정지 · "}${Math.ceil(this.left / 60)}분 남음 · ${el.hidden ? "펼치기" : "접기"}`);
    // 화면 읽기 프로그램에는 1분에 한 번만 알려요 (매초 읽지 않게)
    const m = Math.ceil(this.left / 60);
    if (this.running && m !== this._m) { if (this._m != null && m > 0) say(`${m}분 남았어요.`, true); this._m = m; }
    if (!this.running) this._m = null;
  },
};

// ---------- 화면 ----------
const RING_R = 15, RING_C = 2 * Math.PI * RING_R;
const ring = (cls) => `<svg class="isl-ring ${cls}" viewBox="0 0 36 36" aria-hidden="true"><circle class="trk" cx="18" cy="18" r="${RING_R}"/><circle class="prog" cx="18" cy="18" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>`;
const stopIc = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor"/></svg>';
const downIc = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
const phase = () => timer.active ? (timer.running ? "run" : "pause") : timer.doneUntil > Date.now() ? "done" : "idle";

export function openTimer() { const pop = $("#timer"); if (pop) { pop.hidden = false; $("#timer-btn")?.setAttribute("aria-expanded", "true"); } }
// 접기 — refocus 면 키보드 사용자를 알약(없으면 Dock ⏱)으로 돌려보내요
function collapse(refocus) {
  const el = $("#timer");
  if (!el) return;
  el.hidden = true; $("#timer-btn")?.setAttribute("aria-expanded", "false");
  if (refocus) (phase() === "idle" ? $("#timer-btn") : el.querySelector(".isl-pill"))?.focus();
}
// 끝 알약을 부드럽게 내보낸 뒤 쉬는 상태로
function leave() {
  const el = $("#timer");
  if (!el || phase() === "run" || phase() === "pause") return;
  el.classList.add("leaving");
  setTimeout(() => { el.classList.remove("leaving"); timer.doneUntil = 0; renderTimer(); }, 260);
}
// 화면 읽기 프로그램용 한 줄 (role=status · polite)
function say(msg, quiet) {
  const sr = $("#timer .isl-sr");
  if (!sr) return;
  if (quiet && sr.textContent === msg) return;
  sr.textContent = msg;
}

// 알약은 끌어서 아무 데나 둘 수 있어요. 원래 자리(맨 위 가운데) 가까이 놓으면 자석처럼 착 붙어 돌아가요. 자리는 이 기기에 기억해요
const POS = "isl-pos", SNAP = 80;
function placeIsland(el, pos) {
  if (!pos) { el.style.left = el.style.top = ""; el.classList.remove("moved"); return; }
  const x = Math.max(40, Math.min(innerWidth - 40, pos.x * innerWidth)), y = Math.max(4, Math.min(innerHeight - 44, pos.y));
  el.style.left = x + "px"; el.style.top = y + "px"; el.classList.add("moved");
}
function dragIsland(el) {
  let saved = null; try { saved = JSON.parse(localStorage.getItem(POS) || "null"); } catch {}
  placeIsland(el, saved);
  addEventListener("resize", () => { try { placeIsland(el, JSON.parse(localStorage.getItem(POS) || "null")); } catch {} });
  const pill = el.querySelector(".isl-pill");
  let d = null;
  pill.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const r = el.getBoundingClientRect();
    d = { x0: e.clientX, y0: e.clientY, cx: r.left + r.width / 2, top: r.top, moved: false };
    pill.setPointerCapture?.(e.pointerId);
  });
  pill.addEventListener("pointermove", (e) => {
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true; el.classList.add("dragging", "moved");
    const x = d.cx + dx, y = d.top + dy;
    el.style.left = x + "px"; el.style.top = y + "px";
    const home = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--isl-top")) || 10;
    el.classList.toggle("near-home", Math.hypot(x - innerWidth / 2, y - home) < SNAP);
  });
  const up = () => {
    if (!d) return; const g = d; d = null;
    el.classList.remove("dragging");
    if (!g.moved) return;
    el._dragged = true; setTimeout(() => { el._dragged = false; }, 300);
    const snap = el.classList.contains("near-home"); el.classList.remove("near-home");
    const pos = snap ? null : { x: parseFloat(el.style.left) / innerWidth, y: parseFloat(el.style.top) };
    el.classList.add("snapping"); setTimeout(() => el.classList.remove("snapping"), 360);
    placeIsland(el, pos);
    try { pos ? localStorage.setItem(POS, JSON.stringify(pos)) : localStorage.removeItem(POS); } catch {}
  };
  pill.addEventListener("pointerup", up); pill.addEventListener("pointercancel", up);
}

// 껍데기(알약 · 카드 · 알림 줄)는 한 번만 만들고, 바뀔 때는 알약 내용 · 카드 내용만 다시 써요 — 열림 애니메이션이 다시 돌지 않게
function skeleton(el) {
  if (el.querySelector(".isl-pill")) return;
  el.className = "island";
  el.removeAttribute("aria-label");
  el.innerHTML = `
    <button class="isl-pill" type="button" aria-expanded="false" aria-controls="isl-card"></button>
    <div class="isl-card" id="isl-card" role="group" aria-label="집중 타이머"></div>
    <p class="isl-sr" role="status" aria-live="polite"></p>`;
  dragIsland(el);
  el.querySelector(".isl-pill").addEventListener("click", () => {
    if (el._dragged) { el._dragged = false; return; }
    if (phase() === "done") return;
    openTimer();
    el.querySelector("#tm-toggle, #tm-start")?.focus({ preventScroll: true });
  });
  // 펼침/접힘(= hidden)이 바뀌는 순간에만 짧은 애니메이션 class 를 붙여요 (app.js 가 바꿔도 여기서 알아요)
  let was = el.hidden;
  new MutationObserver(() => {
    if (el.hidden === was) return;
    was = el.hidden;
    el.classList.remove("opening", "closing");
    void el.offsetWidth;
    el.classList.add(el.hidden ? "closing" : "opening");
    clearTimeout(el._anim); el._anim = setTimeout(() => el.classList.remove("opening", "closing"), 420);
    el.querySelector(".isl-pill").setAttribute("aria-expanded", String(!el.hidden));
    timer.paint();
  }).observe(el, { attributes: true, attributeFilter: ["hidden"] });
}

export function renderTimer() {
  const el = $("#timer");
  if (!el) return;
  skeleton(el);
  const ph = phase(), wasLive = el.classList.contains("is-live");
  const live = ph !== "idle";
  el.dataset.phase = ph;
  el.classList.toggle("is-live", live);
  el.classList.toggle("running", timer.running);
  if (live && !wasLive) { el.classList.add("appearing"); setTimeout(() => el.classList.remove("appearing"), 420); }
  const flash = ph === "run" && timer.flashUntil > Date.now();
  el.classList.toggle("flash", flash);

  // 작은 알약
  const pill = el.querySelector(".isl-pill");
  if (ph === "done") {
    pill.innerHTML = `<span class="isl-ok" aria-hidden="true">${icon.check(14)}</span><span class="isl-msg">집중 ${timer.doneMins}분 끝 · 잘했어요</span>`;
    pill.setAttribute("aria-label", `집중 ${timer.doneMins}분이 끝났어요`);
  } else {
    const word = flash ? (timer.label ? `‘${esc(timer.label.length > 12 ? timer.label.slice(0, 12) + "…" : timer.label)}’ 집중 시작` : "집중 시작") : ph === "pause" ? "일시정지" : "집중";
    pill.innerHTML = `${ring("sm")}<span class="isl-word">${word}</span><span class="isl-time">00:00</span>`;
  }

  // 펼친 카드 — 키보드 포커스가 카드 안에 있었으면 다시 그 자리로
  const card = el.querySelector(".isl-card"), fid = card.contains(document.activeElement) ? document.activeElement.id : "";
  const blk = Math.round(timer.total / 60);
  const head = `<div class="isl-head">
      <span class="isl-title">${ph === "idle" || ph === "done" ? "집중 타이머" : `${ph === "pause" ? "일시정지" : "집중 세션"} · ${blk}분 블록`}</span>
      <button class="isl-x" type="button" id="tm-fold" aria-label="접기">${downIc}</button>
    </div>`;
  const labelIn = `<input class="isl-label" id="tm-label" placeholder="무엇에 집중할까요?" aria-label="무엇에 집중할까요?" value="${esc(timer.label)}" maxlength="60" autocomplete="off">`;
  const planLine = timer.plan_id ? `<p class="tm-plan">할 일에 쌓여요 · <button type="button" class="isl-link" id="tm-unlink">떼기</button></p>` : "";
  if (ph === "run" || ph === "pause") {
    card.innerHTML = `${head}
      ${labelIn}
      <div class="isl-big">${ring("lg")}<span class="isl-clock" aria-hidden="true">00:00</span></div>
      <div class="isl-acts">
        <button class="isl-btn plus" type="button" id="tm-plus">+5분</button>
        <span class="isl-gap"></span>
        <button class="isl-round amber" type="button" id="tm-toggle" aria-label="${timer.running ? "일시정지" : "계속하기"}">${timer.running ? icon.pause(18) : icon.play(18)}</button>
        <button class="isl-round red" type="button" id="tm-stop" aria-label="멈추기 (기록하지 않아요)">${stopIc}</button>
      </div>
      ${planLine}`;
  } else {
    card.innerHTML = `${head}
      <div class="isl-big idle"><span class="isl-clock" aria-hidden="true">00:00</span></div>
      <div class="isl-presets" role="group" aria-label="집중 시간">
        ${PRESETS.map((m) => `<button type="button" class="isl-chip" data-min="${m}" aria-pressed="${!customOpen && m * 60 === timer.total}">${m}분</button>`).join("")}
        <button type="button" class="isl-chip" id="tm-custom" aria-pressed="${customOpen || !PRESETS.includes(timer.total / 60)}">직접</button>
      </div>
      ${customOpen ? `<label class="isl-custom"><input type="number" id="tm-min" min="1" max="240" step="1" inputmode="numeric" value="${Math.round(timer.total / 60)}" aria-label="집중 시간 (분)"><span>분 · 1~240</span></label>` : ""}
      ${labelIn}
      ${planLine}
      <button class="isl-go" type="button" id="tm-start">${icon.play(16)}<span>${Math.round(timer.total / 60)}분 집중 시작</span></button>`;
  }
  timer.paint();
  if (fid) card.querySelector("#" + fid)?.focus({ preventScroll: true });

  card.querySelector("#tm-fold").addEventListener("click", () => collapse(true));
  card.querySelector("#tm-toggle")?.addEventListener("click", () => (timer.running ? timer.pause() : timer.start()));
  card.querySelector("#tm-plus")?.addEventListener("click", () => timer.addMinutes(5));
  card.querySelector("#tm-stop")?.addEventListener("click", () => {
    timer.stop(); collapse(false); $("#timer-btn")?.focus({ preventScroll: true });
    toast("집중을 멈췄어요. 이번 시간은 기록하지 않았어요.");
  });
  card.querySelector("#tm-start")?.addEventListener("click", () => { collapse(false); timer.start(); el.querySelector(".isl-pill")?.focus({ preventScroll: true }); });
  card.querySelectorAll(".isl-chip[data-min]").forEach((b) => b.addEventListener("click", () => {
    customOpen = false; timer.preset = timer.total = timer.left = +b.dataset.min * 60; renderTimer();
  }));
  card.querySelector("#tm-custom")?.addEventListener("click", () => {
    customOpen = true; const m = PRESETS.includes(timer.total / 60) ? lastCustom() : Math.round(timer.total / 60);
    timer.preset = timer.total = timer.left = m * 60; renderTimer();
    const i = card.querySelector("#tm-min"); i?.focus(); i?.select();
  });
  const minIn = card.querySelector("#tm-min");
  minIn?.addEventListener("input", () => { // 다시 그리지 않고 숫자 · 시작 버튼만 바꿔요 (치는 중에 칸이 날아가지 않게)
    const m = Math.round(+minIn.value); if (!(m >= 1 && m <= 240)) return;
    timer.preset = timer.total = timer.left = m * 60; timer.paint();
    const go = card.querySelector("#tm-start span"); if (go) go.textContent = `${m}분 집중 시작`;
    try { localStorage.setItem("focus-custom-min", String(m)); } catch {}
  });
  minIn?.addEventListener("keydown", (e) => { if (e.key === "Enter") card.querySelector("#tm-start")?.click(); });
  card.querySelector("#tm-label").addEventListener("input", (e) => { // 이름을 직접 바꾸면 할 일과의 연결은 풀어요
    timer.label = e.target.value.trim().slice(0, 60);
    if (timer.plan_id) { timer.plan_id = null; card.querySelector(".tm-plan")?.remove(); }
  });
  card.querySelector("#tm-label").addEventListener("keydown", (e) => { if (e.key === "Enter" && ph === "idle") card.querySelector("#tm-start")?.click(); });
  card.querySelector("#tm-unlink")?.addEventListener("click", (e) => { e.stopPropagation(); timer.plan_id = null; renderTimer(); });
}
function chime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, .18, .36].forEach((d, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(.0001, ac.currentTime + d);
      g.gain.exponentialRampToValueAtTime(.18, ac.currentTime + d + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d + .5);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + d); o.stop(ac.currentTime + d + .55);
    });
  } catch {}
}

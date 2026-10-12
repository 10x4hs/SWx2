// Dsm-mafia — 집중 타이머 (app.js 에서 나눴어요).
import { api } from "./api.js";
import { $, esc, ymd, today, nowTime, toast, pad } from "./util.js";
import { icon } from "./icons.js";

// ctx 는 app.js 가 갖고 있어서 init 으로 받아요. 할 일 ▶ 가 ctx.timer 로 부르니 여기서 붙여 줘요
let ctx;
export function initTimer(deps) { ({ ctx } = deps); ctx.timer = timer; }

// 시작 · 일시정지 · 처음으로 · 끝 에서 "지금 공부 중" 상태를 서버에 알려요 (무엇을 하는지는 안 보내요).
const presence = (state, ends_at) => api.setPresence(state === "focus" ? { state, ends_at } : { state }).catch(() => {});
export const timer = {
  total: 25 * 60, left: 25 * 60, running: false, t: null, label: "", plan_id: null,
  start(min) {
    if (min) { this.total = this.left = min * 60; }
    if (this.left <= 0) this.left = this.total;
    this.running = true;
    const end = Date.now() + this.left * 1000;
    clearInterval(this.t);
    this.t = setInterval(() => {
      this.left = Math.max(0, Math.round((end - Date.now()) / 1000));
      if (this.left === 0) this.finish();
      this.paint();
    }, 250);
    presence("focus", end);
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
    this.left = this.total;
    this.start();
    openTimer();
    toast(`‘${this.label}’ 집중 ${Math.round(this.total / 60)}분을 시작했어요.`);
  },
  pause() { this.running = false; clearInterval(this.t); presence("idle"); renderTimer(); },
  reset() { this.pause(); this.left = this.total; renderTimer(); },
  stop() { this.running = false; clearInterval(this.t); presence("idle"); this.left = this.total; this.plan_id = null; this.label = ""; document.title = "Dsm-mafia"; },
  async finish() {
    clearInterval(this.t);
    this.running = false;
    const mins = Math.round(this.total / 60);
    chime();
    document.title = "Dsm-mafia";
    presence("idle");
    try {
      const b = { day: ymd(today()), at: nowTime(), text: `집중 ${mins}분${this.label ? " · " + this.label : ""}`, kind: "focus", mins };
      if (this.plan_id) b.plan_id = this.plan_id;
      await api.addLog(b);
      toast(this.plan_id ? `집중 ${mins}분 완료. ‘${this.label}’에 쌓였어요.` : `집중 ${mins}분 완료. 오늘 기록에 남겼어요.`);
      ctx.changed("logs");
    } catch (e) { toast(e.message, "err"); }
    this.left = this.total;
    renderTimer();
  },
  paint() {
    const el = $("#timer .clock"), bar = $("#timer .bar > i");
    if (!el) return;
    const t = `${pad(Math.floor(this.left / 60))}:${pad(this.left % 60)}`;
    el.textContent = t;
    bar.style.width = `${(1 - this.left / this.total) * 100}%`;
    document.title = this.running ? `${t} · 집중 중` : "Dsm-mafia";
    const mini = $("#timer-mini");
    if (mini) { mini.classList.toggle("on", this.running); mini.textContent = this.running ? t : ""; }
  },
};
export function openTimer() { const pop = $("#timer"); if (pop) { pop.hidden = false; $("#timer-btn")?.setAttribute("aria-expanded", "true"); } }
export function renderTimer() {
  const el = $("#timer");
  if (!el) return;
  el.classList.toggle("running", timer.running);
  el.innerHTML = `
    <div class="eyebrow">집중 타이머</div>
    <div class="row" style="justify-content:space-between">
      <span class="clock">00:00</span>
      <span class="row" style="gap:2px">
        <button class="icon-btn sm" type="button" id="tm-toggle" aria-label="${timer.running ? "일시정지" : "시작"}">${timer.running ? icon.pause(15) : icon.play(15)}</button>
        <button class="icon-btn sm" type="button" id="tm-reset" aria-label="처음으로">${icon.reset(15)}</button>
      </span>
    </div>
    <div class="bar"><i style="width:0"></i></div>
    <div class="row">
      <select class="select" id="tm-len" aria-label="집중 시간" ${timer.running ? "disabled" : ""}>
        ${[15, 25, 50, 90].map((m) => `<option value="${m}" ${m * 60 === timer.total ? "selected" : ""}>${m}분</option>`).join("")}
      </select>
    </div>
    <input class="input" id="tm-label" placeholder="무엇에 집중할까요?" value="${esc(timer.label)}" style="padding:6px 10px;font-size:12.5px">
    ${timer.plan_id ? `<p class="tm-plan">할 일에 쌓여요 · <button type="button" class="linkbtn" id="tm-unlink">떼기</button></p>` : ""}`;
  timer.paint();
  $("#tm-toggle").addEventListener("click", () => (timer.running ? timer.pause() : timer.start()));
  $("#tm-reset").addEventListener("click", () => timer.reset());
  $("#tm-len").addEventListener("change", (e) => { timer.total = timer.left = +e.target.value * 60; timer.paint(); });
  $("#tm-label").addEventListener("input", (e) => { // 이름을 직접 바꾸면 할 일과의 연결은 풀어요
    timer.label = e.target.value.trim().slice(0, 60);
    if (timer.plan_id) { timer.plan_id = null; $("#timer .tm-plan")?.remove(); }
  });
  $("#tm-unlink")?.addEventListener("click", (e) => { e.stopPropagation(); timer.plan_id = null; renderTimer(); });
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

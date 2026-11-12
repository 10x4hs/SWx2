// SWx2 — 자동 집중: 계획을 우클릭해서 '◎ 자동 집중'을 켜 두면, 그 계획 시작 시각에 집중 타이머가 저절로 켜져요.
//   서버(RoomHub 알람)가 그 시각에 신호를 보내요: 앱이 열려 있으면 웹소켓(live.js → "focus-live"), 닫혀 있으면 푸시 → 서비스 워커 알림
//   열려 있을 때: 타이머 시작 + 오른쪽 위 배너(맥 알림처럼, 5초). 다른 집중이 돌고 있으면 '다음 집중 시간이에요' 배너만 (바꾸기 · 그대로)
//   같은 계획을 두 번 켜지 않게 탭끼리 localStorage 로 막아요 (af:<id>)
//   놓친 신호도 잡아요: 앱을 열 때 · 화면으로 돌아올 때 · 실시간 연결이 다시 붙을 때 '지금 시간 칸 안의 자동 집중'을 서버에 물어 남은 분만큼 켜요
//   다른 집중이 돌고 있으면 기다렸다가, 그 집중이 끝나는 대로 이어서 켜요 (focus-timer.js 의 "focus-idle")
import { api } from "./api.js";
import { esc, toast } from "./util.js";
import { timer } from "./focus-timer.js";

const SEEN = "af:", SHOW_MS = 5000;

// 처음 켤 때 이 기기 알림 허락 받기 (앱이 닫혀 있어도 오게). 이미 됐으면 아무것도 안 해요
export async function askPush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || Notification.permission === "denied") return;
    const key = (await api.pushKey()).key; if (!key) return;
    const reg = await navigator.serviceWorker.ready;
    if (Notification.permission === "granted" && await reg.pushManager.getSubscription()) return;
    if ((await Notification.requestPermission()) !== "granted") return toast("알림을 허용하면 앱이 닫혀 있어도 집중 시작을 알려 드려요.");
    const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (key.length % 4)) % 4));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
    await api.pushSubscribe(sub.toJSON());
  } catch {}
}

// 오른쪽 위 배너 (하나씩 쌓여요). actions = [[라벨, 할 일], ...]
function banner({ title, body, actions = [] }) {
  let wrap = document.getElementById("af-stack");
  if (!wrap) { wrap = document.createElement("div"); wrap.id = "af-stack"; wrap.setAttribute("aria-live", "polite"); document.body.append(wrap); }
  const b = document.createElement("div");
  b.className = "af-ban"; b.setAttribute("role", "status");
  b.innerHTML = `<div class="af-ic" aria-hidden="true">◎</div><div class="af-tx"><b>${esc(title)}</b><p>${esc(body)}</p>${actions.length ? `<div class="af-acts">${actions.map(([l], i) => `<button type="button" data-i="${i}">${esc(l)}</button>`).join("")}</div>` : ""}</div><small>지금</small><button type="button" class="af-x" aria-label="닫기">✕</button>`;
  wrap.prepend(b);
  let t = 0;
  const close = () => { clearTimeout(t); b.classList.add("out"); setTimeout(() => b.remove(), 260); };
  const arm = () => { clearTimeout(t); t = setTimeout(close, SHOW_MS); };
  b.addEventListener("mouseenter", () => clearTimeout(t)); b.addEventListener("mouseleave", arm);
  b.addEventListener("click", (e) => { const a = e.target.closest("[data-i]"); if (a) { actions[+a.dataset.i][1](); close(); } else if (e.target.closest(".af-x")) close(); });
  // 위로 밀면 닫혀요 (트랙패드 · 터치)
  let y0 = null;
  b.addEventListener("pointerdown", (e) => { y0 = e.clientY; });
  b.addEventListener("pointerup", (e) => { if (y0 != null && y0 - e.clientY > 30) close(); y0 = null; });
  b.addEventListener("wheel", (e) => { if (e.deltaY > 20) close(); }, { passive: true });
  requestAnimationFrame(() => b.classList.add("in"));
  arm();
}

// 시간 칸이 끝나는 시각(ms): 서버가 준 until (따라잡기) · 날짜(period)가 있으면 그 날 시작 시각 + mins (한국 시간) · 없으면 지금부터 mins
const atOf = (p) => (p.period && p.start ? Date.parse(`${p.period.slice(2)}T${p.start}:00+09:00`) : NaN);
const untilOf = (p) => p.until || (atOf(p) ? atOf(p) + p.mins * 60e3 : Date.now() + p.mins * 60e3);
const leftMins = (p) => Math.min(p.mins, Math.round((untilOf(p) - Date.now()) / 60e3));
const hhmm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const key = (p) => SEEN + p.id + ":" + p.start;
const seen = (p) => { try { return !!localStorage.getItem(key(p)); } catch { return false; } };
const mark = (p) => { try { localStorage.setItem(key(p), String(Date.now())); } catch {} };
let pending = null; // 지금 집중이 끝나면 켤 계획

function start(p) {
  const mins = Math.max(1, leftMins(p) || p.mins), late = mins < p.mins;
  timer.preset = mins * 60;
  timer.startFor({ id: p.id, text: p.text });
  banner({ title: "SWx2 · 집중 모드가 켜졌어요", body: `${p.text} · ${mins}분 (${hhmm(Date.now() + mins * 60e3)}까지)${late ? ` · ${p.start}부터라 남은 만큼` : ""}`, actions: [
    ["멈추기", () => { if (timer.plan_id === p.id) timer.stop(); }],
    ["+5분 뒤로", () => { if (timer.plan_id === p.id) timer.stop(); setTimeout(() => run(p, true), 5 * 60e3); toast("5분 뒤에 다시 켤게요."); }],
  ] });
}
// 탭이 여러 개면 지금 보고 있는 탭이 먼저 잡아요 (뒤에 숨은 탭은 잠깐 기다렸다가, 아무도 안 잡았을 때만)
function run(p, again = false) {
  if (!p?.id || !(p.mins > 0) || !p.start) return;
  if (!p.until) p = { ...p, until: untilOf(p) };
  if (!again && document.visibilityState !== "visible") return void setTimeout(() => claim(p), 1500);
  claim(p, again);
}
function claim(p, again = false) {
  if (!again && seen(p)) return;
  if (leftMins(p) < 1) return; // 시간 칸이 이미 끝났어요
  if (timer.running && timer.plan_id === p.id) return mark(p);
  if (timer.running) {
    if (pending?.id === p.id) return; // 이미 기다리는 중
    pending = p;
    banner({ title: "SWx2 · 다음 집중 시간이에요", body: `지금 '${timer.label || "집중"}'이 끝나면 '${p.text}' 집중을 바로 켤게요.`, actions: [["지금 바꾸기", () => { pending = null; mark(p); timer.stop(); start(p); }], ["건너뛰기", () => { if (pending?.id === p.id) pending = null; mark(p); }]] });
    return;
  }
  mark(p); start(p);
}
// 지금 집중이 끝났어요 → 기다리던 계획(아직 시간 칸 안이면), 없으면 서버에 한 번 더 물어봐요
function onIdle() {
  setTimeout(() => {
    if (timer.running) return;
    const p = pending; pending = null;
    if (p && leftMins(p) >= 1 && !seen(p)) { mark(p); start(p); } else catchUp(true);
  }, 900);
}
// 놓친 자동 집중 따라잡기: 지금 시간 칸 안에 있고 이 기기에서 아직 안 켠 것 중 가장 최근에 시작한 것
let lastAsk = 0;
async function catchUp(force = false) {
  if (document.visibilityState !== "visible" || (!force && Date.now() - lastAsk < 15e3)) return;
  lastAsk = Date.now();
  try {
    const { plans = [], now = Date.now() } = await api.focusOpen();
    const skew = Date.now() - now; // 기기 시계가 틀려도 서버 기준으로
    const p = plans.filter((x) => !seen(x) && x.id !== timer.plan_id).sort((a, b) => b.at - a.at)[0];
    if (p) run({ ...p, until: p.until + skew });
  } catch {}
}

export function initAutoFocus() {
  window.addEventListener("focus-live", (e) => run(e.detail?.plan));
  window.addEventListener("focus-idle", onIdle);
  window.addEventListener("live-state", (e) => { if (e.detail?.open) catchUp(); }); // 연결이 끊겼다 붙으면 그사이 신호를 놓쳤을 수 있어요
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") catchUp(); });
  setTimeout(() => catchUp(true), 2500); // 앱을 열었을 때
  // 서비스 워커: 푸시가 왔는데 앱 창이 보이는 중이면 알림 대신 여기로 넘겨요 · 알림을 눌러 연 창도 같은 길로
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "auto-focus") run(e.data.plan); });
  // 알림을 눌러 새로 연 창: /?af=<id>&m=<분>&s=<HH:MM>&t=<이름>
  const q = new URLSearchParams(location.search);
  if (q.get("af")) {
    const p = { id: q.get("af"), mins: +q.get("m"), start: q.get("s") || "", period: q.get("d") || "", text: q.get("t") || "집중" };
    history.replaceState(null, "", location.pathname + location.hash);
    setTimeout(() => run(p), 600);
  }
  // 오래된 '켬' 표시 정리 (이틀 지난 것)
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(SEEN) && Date.now() - +localStorage.getItem(k) > 2 * 864e5) localStorage.removeItem(k); } catch {}
}

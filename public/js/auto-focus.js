// SWx2 — 자동 집중: 계획을 우클릭해서 '◎ 자동 집중'을 켜 두면, 그 계획 시작 시각에 집중 타이머가 저절로 켜져요.
//   서버(RoomHub 알람)가 그 시각에 신호를 보내요: 앱이 열려 있으면 웹소켓(live.js → "focus-live"), 닫혀 있으면 푸시 → 서비스 워커 알림
//   열려 있을 때: 타이머 시작 + 오른쪽 위 배너(맥 알림처럼, 5초). 다른 집중이 돌고 있으면 '다음 집중 시간이에요' 배너만 (바꾸기 · 그대로)
//   같은 계획을 두 번 켜지 않게 탭끼리 localStorage 로 막아요 (af:<id>)
import { api } from "./api.js";
import { esc, toast } from "./util.js";
import { timer } from "./focus-timer.js";

const SEEN = "af:", SHOW_MS = 5000;
const end = (start, mins) => { const [h, m] = start.split(":").map(Number), t = h * 60 + m + mins; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

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

function start(p) {
  timer.preset = p.mins * 60;
  timer.startFor({ id: p.id, text: p.text });
  banner({ title: "SWx2 · 집중 모드가 켜졌어요", body: `${p.text} · ${p.mins}분 (${end(p.start, p.mins)}까지)`, actions: [
    ["멈추기", () => { if (timer.plan_id === p.id) timer.stop(); }],
    ["+5분 뒤로", () => { if (timer.plan_id === p.id) timer.stop(); setTimeout(() => run(p, true), 5 * 60e3); toast("5분 뒤에 다시 켤게요."); }],
  ] });
}
function run(p, again = false) {
  if (!p?.id || !(p.mins > 0) || !p.start) return;
  const k = SEEN + p.id + ":" + p.start;
  try { if (!again && localStorage.getItem(k)) return; localStorage.setItem(k, String(Date.now())); } catch {}
  if (timer.running && timer.plan_id !== p.id) {
    banner({ title: "SWx2 · 다음 집중 시간이에요", body: `지금 '${timer.label || "집중"}' 중이에요. ${p.text}(으)로 바꿀까요?`, actions: [["바꾸기", () => { timer.stop(); start(p); }], ["그대로", () => {}]] });
    return;
  }
  if (timer.running) return;
  start(p);
}

export function initAutoFocus() {
  window.addEventListener("focus-live", (e) => run(e.detail?.plan));
  // 서비스 워커: 푸시가 왔는데 앱 창이 보이는 중이면 알림 대신 여기로 넘겨요 · 알림을 눌러 연 창도 같은 길로
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "auto-focus") run(e.data.plan); });
  // 알림을 눌러 새로 연 창: /?af=<id>&m=<분>&s=<HH:MM>&t=<이름>
  const q = new URLSearchParams(location.search);
  if (q.get("af")) {
    const p = { id: q.get("af"), mins: +q.get("m"), start: q.get("s") || "", text: q.get("t") || "집중" };
    history.replaceState(null, "", location.pathname + location.hash);
    setTimeout(() => run(p), 600);
  }
  // 오래된 '켬' 표시 정리 (이틀 지난 것)
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(SEEN) && Date.now() - +localStorage.getItem(k) > 2 * 864e5) localStorage.removeItem(k); } catch {}
}

// 실시간 연결 — 앱 전체에 웹소켓 하나. 서버(RoomHub)가 "room" 신호를 보내면 window 에 "room-live" 이벤트를 쏴요.
// 대화방 화면은 그 방이면 바로 새 메시지를 받고, 도크 배지는 안 읽음 수를 다시 셉니다. 끊기면 1 → 2 → 4 … 30초 간격으로 다시 붙어요.
let ws = null, retry = 0, timer = 0, ping = 0, want = false;
export const live = { open: false };

function connect() {
  if (!want || ws) return;
  const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/room/ws";
  try { ws = new WebSocket(url); } catch { schedule(); return; }
  ws.onopen = () => { retry = 0; live.open = true; window.dispatchEvent(new CustomEvent("live-state", { detail: { open: true } })); clearInterval(ping); ping = setInterval(() => { try { ws?.send("ping"); } catch {} }, 25_000); };
  ws.onmessage = (e) => {
    if (e.data === "pong") return;
    let d; try { d = JSON.parse(e.data); } catch { return; }
    if (d.type === "room") window.dispatchEvent(new CustomEvent("room-live", { detail: d }));
    else if (d.type === "focus") window.dispatchEvent(new CustomEvent("focus-live", { detail: d })); // 자동 집중 시각 (auto-focus.js)
  };
  ws.onclose = () => { ws = null; live.open = false; clearInterval(ping); window.dispatchEvent(new CustomEvent("live-state", { detail: { open: false } })); schedule(); };
  ws.onerror = () => { try { ws?.close(); } catch {} };
}
function schedule() { if (!want) return; clearTimeout(timer); timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++)); }

export function startLive() { want = true; connect(); }
export function stopLive() { want = false; clearTimeout(timer); clearInterval(ping); try { ws?.close(); } catch {} ws = null; live.open = false; }
// 탭을 다시 보거나 네트워크가 돌아오면 바로 다시 붙어요
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && want && !ws) { retry = 0; connect(); } });
window.addEventListener("online", () => { if (want && !ws) { retry = 0; connect(); } });

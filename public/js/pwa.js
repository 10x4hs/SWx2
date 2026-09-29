// PWA glue: service worker 등록, 로그아웃 때 API 캐시 지우기, 오프라인 띠, 홈 화면에 추가 안내.
// 앱 코드와는 window 이벤트로만 이야기해요.
//   받는 것: "trio:signed-out"  → SW 에 {type:"clear-api"}
//   보내는 것: "trio:network" (detail: { online }) → 앱이 원하면 다시 불러오기에 써요

const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const CAN_SW = "serviceWorker" in navigator && (location.protocol === "https:" || LOCAL);
const THEME_BG = { dark: "#0F1012", light: "#EEEEF1" };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- service worker ----------
async function registerSW() {
  if (!CAN_SW) return;
  // 개발용 탈출구: localStorage["trio-no-sw"] = "1" 이면 SW·캐시를 걷어내요
  if (store.get("trio-no-sw") === "1") {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if (window.caches) for (const n of await caches.keys()) if (n.startsWith("dsm-")) await caches.delete(n);
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    // 오래 켜 둔 탭도 돌아올 때 새 버전을 확인해요 (새로고침은 강요하지 않아요)
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  } catch (err) {
    console.warn("[pwa] service worker registration failed", err);
  }
}
if (document.readyState === "complete") registerSW();
else window.addEventListener("load", registerSW, { once: true });

// ---------- sign-out → API 캐시 삭제 ----------
async function clearApiCache() {
  if (CAN_SW) {
    navigator.serviceWorker.controller?.postMessage({ type: "clear-api" });
    // controller 가 없어도(첫 방문 등) 캐시는 창에서 직접 지울 수 있어요
  }
  try {
    if (window.caches) for (const n of await caches.keys()) if (n.startsWith("dsm-api-")) await caches.delete(n);
  } catch {}
}
window.addEventListener("trio:signed-out", clearApiCache);

// ---------- 오프라인 띠 ----------
let bar = null;
let swOffline = false;
function ensureBar() {
  if (bar) return bar;
  bar = document.createElement("div");
  bar.className = "pwa-net";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.hidden = true;
  document.body.prepend(bar);
  return bar;
}
let hideTimer = 0;
let wasOffline = false;
function renderNet() {
  const offline = !navigator.onLine || swOffline;
  const el = ensureBar();
  clearTimeout(hideTimer);
  if (offline) {
    el.textContent = "오프라인이에요 · 마지막으로 본 내용을 보여줘요";
    el.dataset.state = "offline";
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("on"));
  } else if (wasOffline) {
    el.textContent = "다시 연결됐어요";
    el.dataset.state = "online";
    el.hidden = false;
    el.classList.add("on");
    hideTimer = setTimeout(() => { el.classList.remove("on"); hideTimer = setTimeout(() => { el.hidden = true; }, 400); }, 1800);
  } else {
    el.classList.remove("on");
    el.hidden = true;
  }
  if (offline !== wasOffline) window.dispatchEvent(new CustomEvent("trio:network", { detail: { online: !offline } }));
  wasOffline = offline;
}
window.addEventListener("online", () => { swOffline = false; renderNet(); });
window.addEventListener("offline", renderNet);
if (CAN_SW) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    const type = e.data && e.data.type;
    if (type === "updated") showUpdate();
    else if (type === "net-offline") { swOffline = true; renderNet(); }
    else if (type === "net-online") { swOffline = false; renderNet(); }
  });
}
if (!navigator.onLine) renderNet();

// ---------- theme-color 을 앱 테마(data-theme)에 맞추기 ----------
// 앱은 OS 설정과 상관없이 기본 다크라서, media 로 나눈 두 meta 를 실제 테마 색으로 덮어써요.
function syncThemeColor() {
  const c = THEME_BG[document.documentElement.dataset.theme === "light" ? "light" : "dark"];
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", c);
}
syncThemeColor();
new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// ---------- 홈 화면에 추가 안내 ----------
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const HINT_KEY = "trio-install-hint";
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

// 로그인 뒤 앱 화면(.shell)이 떠 있을 때만, 조금 기다렸다가 한 번
function whenSignedIn(fn, delay = 15000) {
  const t0 = Date.now();
  const tick = () => {
    if (document.querySelector(".shell") && Date.now() - t0 >= delay) fn();
    else setTimeout(tick, 2000);
  };
  setTimeout(tick, 2000);
}
function showHint({ text, action, onAction }) {
  if (document.querySelector(".pwa-hint")) return;
  const el = document.createElement("div");
  el.className = "pwa-hint";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "홈 화면에 추가");
  el.innerHTML = `<span class="pwa-hint-text"></span>${action ? '<button type="button" class="pwa-hint-go"></button>' : ""}<button type="button" class="pwa-hint-x" aria-label="닫기">&times;</button>`;
  el.querySelector(".pwa-hint-text").textContent = text;
  if (action) el.querySelector(".pwa-hint-go").textContent = action;
  const close = () => { el.classList.remove("on"); setTimeout(() => el.remove(), 300); };
  el.querySelector(".pwa-hint-x").addEventListener("click", () => { store.set(HINT_KEY, "dismissed"); close(); });
  el.querySelector(".pwa-hint-go")?.addEventListener("click", async () => { close(); await onAction?.(); });
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("on"));
  setTimeout(close, 14000);
}

if (!standalone && !store.get(HINT_KEY)) {
  // Android / 데스크톱 크롬: 브라우저 설치 창을 우리가 원하는 때에 띄워요
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    whenSignedIn(() => {
      if (!deferred || store.get(HINT_KEY)) return;
      store.set(HINT_KEY, "shown");
      showHint({
        text: "Dsm-mafia 를 앱처럼 쓸 수 있어요",
        action: "홈 화면에 추가",
        onAction: async () => { const d = deferred; deferred = null; d.prompt(); try { await d.userChoice; } catch {} },
      });
    });
  }, { once: true });
  window.addEventListener("appinstalled", () => { store.set(HINT_KEY, "installed"); document.querySelector(".pwa-hint")?.remove(); });

  // iOS Safari: 설치 API 가 없어서 방법만 한 번 알려줘요
  if (isIOSSafari) {
    whenSignedIn(() => {
      if (store.get(HINT_KEY)) return;
      store.set(HINT_KEY, "shown");
      showHint({ text: "공유 버튼 → ‘홈 화면에 추가’ 로 앱처럼 쓸 수 있어요" });
    });
  }
}

// ---------- 새 버전 알림 ----------
// 정적 파일은 "먼저 캐시, 뒤에서 새로 받기" 라서 배포 직후 첫 화면은 옛 파일이에요. 새 SW 가 켜지면 띠를 띄워 한 번 새로고침하게 해요.
let updShown = false;
function showUpdate() {
  if (updShown) return; updShown = true;
  const host = document.getElementById("toasts") || document.body;
  const el = document.createElement("div");
  el.className = "toast upd"; el.setAttribute("role", "status");
  el.innerHTML = `새 버전이 있어요. <button type="button" class="btn sm accent" style="margin-left:8px">새로 고침</button>`;
  el.querySelector("button").addEventListener("click", () => location.reload());
  host.appendChild(el);
}

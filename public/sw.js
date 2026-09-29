// Dsm-mafia service worker
// - 정적 파일: stale-while-revalidate (바로 캐시로 보여주고, 뒤에서 새로 받아 둬요)
// - 페이지(navigate): network-first, 3초 안에 안 오면 캐시된 "/" (SPA 라서 어느 주소든 index.html)
// - /api/* GET: network-first + 캐시 대체 (별도 캐시). /api/auth/*, GET 아닌 요청, ok 아닌 응답은 절대 저장 안 함
// - /english/data.json: network-first
// VERSION 은 deploy.sh 가 배포마다 새로 찍어요 → 새 SW 설치 → 옛 캐시 삭제 → 열린 탭에 "updated" 메시지.

const VERSION = "v20260929235642";
const STATIC_CACHE = `dsm-static-${VERSION}`;
const API_CACHE = `dsm-api-${VERSION}`;
const KEEP = new Set([STATIC_CACHE, API_CACHE]);

// 앱 껍데기만. 나머지 모듈·글꼴·사진은 쓰는 순간 캐시에 들어가요.
const SHELL = ["/styles.css", "/css/tokens.css", "/js/app.js", "/css/pwa.css", "/js/pwa.js", "/manifest.webmanifest", "/icons/icon-192.png"];
const NAV_TIMEOUT_MS = 3000;

// ---------- lifecycle ----------
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // "/" 는 꼭 필요 (오프라인 첫 화면). /index.html 은 307 → "/" 라서 같은 본문을 두 키에 넣어요.
    await putDocument(cache, await fetch("/", { cache: "reload" }));
    // 나머지는 하나가 없어져도 설치는 되게 (다른 작업으로 파일이 옮겨질 수 있어요)
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res);
      } catch {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("dsm-") && !KEEP.has(n)).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch {} }
    await self.clients.claim();
    // 열려 있는 탭에 "새 버전이에요" 라고 알려요 (새로고침은 페이지가 사용자에게 물어요)
    for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage({ type: "updated", version: VERSION });
  })());
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "clear-api") {
    event.waitUntil(caches.delete(API_CACHE).then(() => reply(event, { type: "api-cleared" })));
  }
});

// ---------- routing ----------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 다른 곳(CDN 등)은 손대지 않아요

  if (url.pathname.startsWith("/api/")) {
    // 로그인·로그아웃이 지나가면 이전 사람의 API 캐시는 바로 지워요 (pwa.js 의 clear-api 와 이중 안전장치)
    if (req.method === "POST" && (url.pathname === "/api/auth/logout" || url.pathname === "/api/auth/login" || url.pathname === "/api/auth/signup")) {
      event.waitUntil(caches.delete(API_CACHE));
    }
    if (req.method !== "GET" || url.pathname.startsWith("/api/auth/")) return; // 그대로 네트워크로
    event.respondWith(apiNetworkFirst(event));
    return;
  }

  if (req.method !== "GET" || req.headers.has("range")) return;
  if (url.pathname === "/sw.js") return;

  if (req.mode === "navigate") { event.respondWith(navigate(event)); return; }
  if (url.pathname === "/english/data.json") { event.respondWith(staticNetworkFirst(req)); return; }
  event.respondWith(staleWhileRevalidate(event));
});

// ---------- strategies ----------
async function apiNetworkFirst(event) {
  const req = event.request;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(API_CACHE).then((c) => c.put(req, copy)).catch(() => {}));
      setNet(true);
      return res;
    }
    if (res.status === 401) { event.waitUntil(caches.delete(API_CACHE)); return res; } // 세션 끝 → 남의 눈에 안 보이게
    if (res.status >= 500) {
      const cached = await matchApi(req);
      if (cached) { setNet(false); return cached; }
    }
    return res;
  } catch (err) {
    const cached = await matchApi(req);
    setNet(false);
    if (cached) return cached;
    throw err; // api.js 가 "서버에 연결할 수 없어요" 를 보여줘요
  }
}
async function matchApi(req) {
  const cache = await caches.open(API_CACHE);
  return cache.match(req, { ignoreVary: true });
}

async function navigate(event) {
  const cache = await caches.open(STATIC_CACHE);
  const network = (async () => {
    const res = (await event.preloadResponse) || (await fetch(event.request));
    const type = res.headers.get("content-type") || "";
    if (res.ok && type.includes("text/html")) await putDocument(cache, res.clone());
    return res;
  })();
  event.waitUntil(network.catch(() => {}));
  const cachedShell = () => cache.match("/");
  try {
    const res = await Promise.race([network, timeout(NAV_TIMEOUT_MS)]);
    if (res) return res;
    return (await cachedShell()) || (await network);
  } catch {
    const cached = await cachedShell();
    if (cached) return cached;
    return new Response("<!doctype html><meta charset=utf-8><title>Dsm-mafia</title><p style=\"font:15px system-ui;padding:24px\">오프라인이에요. 연결되면 다시 열어 주세요.", { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}

async function staleWhileRevalidate(event) {
  const req = event.request;
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(async (res) => {
    if (res.ok && res.type === "basic" && !res.redirected) await cache.put(req, res.clone());
    return res;
  });
  if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
  return network;
}

async function staticNetworkFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

// ---------- helpers ----------
// 리다이렉트 표시가 붙은 응답을 navigate 에 돌려주면 크롬이 막아서, 본문을 새 Response 로 옮겨 담아요.
async function putDocument(cache, res) {
  if (!res.ok) throw new Error("shell " + res.status);
  const body = await res.blob();
  const init = { status: 200, headers: { "content-type": res.headers.get("content-type") || "text/html; charset=utf-8" } };
  await cache.put("/", new Response(body, init));
  await cache.put("/index.html", new Response(body, init));
}
const timeout = (ms) => new Promise((r) => setTimeout(() => r(null), ms));

let netOk = null; // 모름 → SW 가 다시 켜진 뒤 첫 결과는 항상 알려요
// 네트워크 상태가 바뀔 때만 페이지에 알려요 (pwa.js 가 오프라인 띠를 켜고 꺼요)
async function setNet(ok) {
  if (ok === netOk) return;
  netOk = ok;
  const list = await self.clients.matchAll({ type: "window" });
  for (const c of list) c.postMessage({ type: ok ? "net-online" : "net-offline" });
}
function reply(event, msg) {
  if (event.ports && event.ports[0]) event.ports[0].postMessage(msg);
  else if (event.source) event.source.postMessage(msg);
}

// ---------- 푸시 알림 (대화방) ----------
// 서버는 내용 없이 깨우기만 보내요 → 여기서 /api/room/unread 를 읽어 "새 메시지 N개" 알림을 띄워요. 앱 창이 보이는 중이면 띄우지 않아요.
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === "visible" && w.focused)) { for (const w of wins) w.postMessage({ type: "room-ping" }); return; }
    let n = 0, rooms = {};
    try { const r = await fetch("/api/room/unread", { headers: { "x-trio": "1" }, credentials: "include" }); if (r.ok) { const j = await r.json(); n = j.unread || 0; rooms = j.rooms || {}; } } catch {}
    if (!n) return;
    const dm = Object.keys(rooms).filter((k) => k.startsWith("dm:") && rooms[k]).length;
    await self.registration.showNotification("Dsm-mafia 대화방", { body: `새 메시지 ${n}개${dm ? " · 1:1 메시지 포함" : ""}`, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "room", renotify: true, data: { url: "/#/room/chat" } });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/#/room";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if ("focus" in w) { await w.focus(); w.postMessage({ type: "open-room" }); return; } }
    await self.clients.openWindow(url);
  })());
});

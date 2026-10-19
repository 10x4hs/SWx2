// SWx2 service worker
// 배포본(VERSION 이 찍힌 SW): 한국 ↔ Cloudflare 길이 느린 날에도 바로 뜨게, 서버에 묻는 횟수를 줄여요.
// - 코드(js·css) · 앱 파일(json) · 첫 화면("/"): 캐시 먼저. 파일은 배포 때만 바뀌고, 배포하면 VERSION 이 바뀌어
//   새 SW 가 코드 전체(PRECACHE)를 한 벌로 받아 두고 → 옛 캐시 삭제 → 열린 탭에 "updated" (새로고침하면 새 버전)
// - 글꼴·사진: stale-while-revalidate
// - /api/* GET: network-first + 캐시 대체 (별도 캐시). 화면을 막 열 때 부른 GET(x-swr 머리말)은 받아 둔 답을 바로 주고
//   뒤에서 새로 받아요 → 내용이 다르면 열린 탭에 "api-fresh" (app.js 가 손대지 않은 화면이면 다시 그려요)
// - GET 아닌 /api 요청(저장 · 지우기)이 지나가면 API 캐시를 비워요 → 내가 바꾼 건 항상 새로 받아요
// - /api/auth/*, /api/diary*(일기 — 상대가 비공개로 바꾸면 바로 안 보여야 하고 남의 기기에 남으면 안 돼요), ok 아닌 응답은 절대 저장 안 함
// 개발(VERSION "dev", 로컬): 코드는 network-first 그대로 (고친 게 바로 보이게).

const VERSION = "dev"; // deploy.sh 가 배포마다 "v<시각>" 으로 찍어요
const PRECACHE = []; // deploy.sh 가 코드 파일 전체 목록을 찍어요 (node scripts/assets.mjs --list)
const DEV = VERSION === "dev";
const STATIC_CACHE = `dsm-static-${VERSION}`;
const API_CACHE = `dsm-api-${VERSION}`;
const KEEP = new Set([STATIC_CACHE, API_CACHE]);

// 앱 껍데기만. 나머지 모듈·글꼴·사진은 쓰는 순간 캐시에 들어가요.
const SHELL = ["/styles.css", "/css/tokens.css", "/js/app.js", "/css/pwa.css", "/js/pwa.js", "/manifest.webmanifest", "/icons/icon-192.png"];
const NAV_TIMEOUT_MS = 3000;
const SWR_FRESH_MS = 2000; // 받은 지 2초 안 된 API 답은 다시 묻지 않아요 (새 답으로 다시 그린 화면이 또 묻지 않게)
let gen = 0; // 저장이 지나갈 때마다 +1 → 그 전에 출발한 '뒤에서 새로 받기'는 캐시에 넣지 않아요

// ---------- lifecycle ----------
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // "/" 는 꼭 필요 (오프라인 첫 화면). /index.html 은 307 → "/" 라서 같은 본문을 두 키에 넣어요.
    await putDocument(cache, await fetch("/", { cache: "reload" }));
    // 나머지는 하나가 없어져도 설치는 되게 (다른 작업으로 파일이 옮겨질 수 있어요)
    await Promise.all([...new Set([...SHELL, ...PRECACHE])].map(async (url) => {
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
    // 배포본은 첫 화면을 캐시에서 바로 줘서, 화면을 열 때마다 서버에 "/" 를 미리 묻는 기능은 꺼요 (쓸데없는 왕복)
    if (self.registration.navigationPreload) { try { await (DEV ? self.registration.navigationPreload.enable() : self.registration.navigationPreload.disable()); } catch {} }
    await self.clients.claim();
    // 옛 버전 캐시가 있었을 때만(= 처음 설치가 아니라 업데이트) 열린 탭에 "새 버전" 이라고 알려요
    if (names.some((n) => n.startsWith("dsm-static-") && n !== STATIC_CACHE)) {
      for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage({ type: "updated", version: VERSION });
    }
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
    if (req.method !== "GET") { gen++; event.waitUntil(caches.delete(API_CACHE)); return; } // 저장 · 지우기 → 그대로 네트워크로, 캐시는 비워요
    if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/diary") || url.pathname.startsWith("/api/admin")) return; // 일기 · 관리자는 늘 서버에서 (저장 안 함)
    event.respondWith(req.headers.has("x-swr") ? apiCacheThenFresh(event) : apiNetworkFirst(event));
    return;
  }

  if (req.method !== "GET" || req.headers.has("range")) return;
  if (url.pathname === "/sw.js") return;

  if (req.mode === "navigate") { event.respondWith(navigate(event)); return; }
  // 코드 · 앱 파일: 배포본은 캐시 먼저(배포마다 새 SW 가 새로 받아요), 개발은 서버 먼저
  if (/\.(js|mjs|css|html|json|webmanifest)$/.test(url.pathname)) { event.respondWith(DEV || /^\/(px|pf)\/|^\/manifest\.webmanifest$/.test(url.pathname) ? staticNetworkFirst(req) : cacheFirst(event)); return; } // /px · /pf 는 서버가 그때그때 만드는 것
  event.respondWith(staleWhileRevalidate(event)); // 글꼴 · 사진 · 아이콘은 캐시 먼저
});

// ---------- strategies ----------
async function apiNetworkFirst(event) {
  const req = event.request;
  try {
    const g = gen, res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(putApi(req, copy, g));
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
// 화면을 막 열 때: 받아 둔 답을 바로 → 2초 넘게 묵었으면 뒤에서 새로 받아 비교 → 다르면 탭에 알려요
async function apiCacheThenFresh(event) {
  const req = event.request, cached = await matchApi(req);
  if (!cached) return apiNetworkFirst(event);
  const age = Date.now() - Number(cached.headers.get("x-sw-at") || 0);
  const before = age > SWR_FRESH_MS ? cached.clone() : null; // 화면에 넘기기 전에 떠 둬요 (넘긴 본문은 다시 못 읽어요)
  if (before) event.waitUntil((async () => {
    const g = gen;
    try {
      const res = await fetch(req);
      if (res.status === 401) { await caches.delete(API_CACHE); return tell({ type: "api-fresh", url: req.url, status: 401 }); }
      if (!res.ok) return;
      setNet(true);
      const [a, b] = await Promise.all([res.clone().text(), before.text()]);
      if (!(await putApi(req, res, g))) return;
      const same = (x) => x.replace(/"now":\d+,?/g, ""); // 서버 시각만 다른 건 같은 답
      if (same(a) !== same(b)) tell({ type: "api-fresh", url: req.url });
    } catch {}
  })());
  return cached;
}
// 받은 시각(x-sw-at)을 붙여 저장. 저장(gen)이 끼어들었으면 넣지 않아요
async function putApi(req, res, g) {
  if (g !== gen) return false;
  try {
    const h = new Headers(res.headers); h.set("x-sw-at", String(Date.now()));
    const body = await res.blob();
    if (g !== gen) return false;
    await (await caches.open(API_CACHE)).put(req, new Response(body, { status: res.status, statusText: res.statusText, headers: h }));
    return true;
  } catch { return false; }
}
async function tell(msg) { for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage(msg); }
async function matchApi(req) {
  const cache = await caches.open(API_CACHE);
  return cache.match(req, { ignoreVary: true });
}

async function navigate(event) {
  if (!DEV) { // 배포본: 첫 화면도 캐시 먼저 (새 배포는 새 SW 가 가져와요)
    const path = new URL(event.request.url).pathname;
    if (path === "/" || path === "/index.html") {
      const hit = await (await caches.open(STATIC_CACHE)).match("/");
      if (hit) return hit;
    }
  }
  // 앱은 해시 주소(#/…)라 앱 화면은 항상 "/" 예요. 그 밖의 HTML(논문 쉽게 읽기 · 노트 속 현황판 iframe · OAuth 화면)은
  // 네트워크로만 받아요. 예전에는 이것들까지 앱 첫 화면("/")으로 덮어 저장해서, 느린 접속에서 앱 대신 그 페이지가 떴어요.
  const path = new URL(event.request.url).pathname;
  if (path !== "/" && path !== "/index.html") {
    try { return (await event.preloadResponse) || (await fetch(event.request)); }
    catch { return new Response("<!doctype html><meta charset=utf-8><title>SWx2</title><p style=\"font:15px system-ui;padding:24px\">오프라인이에요. 연결되면 다시 열어 주세요.", { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }); }
  }
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
    return new Response("<!doctype html><meta charset=utf-8><title>SWx2</title><p style=\"font:15px system-ui;padding:24px\">오프라인이에요. 연결되면 다시 열어 주세요.", { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
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

async function cacheFirst(event) {
  const req = event.request, cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req, { ignoreSearch: false });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic" && !res.redirected) event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
  return res;
}

async function staticNetworkFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const res = await fetch(req, { cache: "no-cache" });
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
    // 데이터베이스 행 알림 (src/reminders.js): 크론이 보낸 깨우기면 여기서 무엇인지 읽어 띄워요
    try {
      const r = await fetch("/api/reminders/take", { method: "POST", headers: { "x-trio": "1" }, credentials: "include" });
      const list = r.ok ? (await r.json()).reminders || [] : [];
      for (const x of list) await self.registration.showNotification(`⏰ ${x.title}`, { body: [x.db_title, x.date, x.time].filter(Boolean).join(" · "), icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "remind-" + x.id, data: { url: "/#/notes/" + x.id } });
      if (list.length) return;
    } catch {}
    // 관리자: 방금 온 가입 신청 (관리자가 아니면 403 이라 건너뛰어요)
    try {
      const r = await fetch("/api/admin/pending", { headers: { "x-trio": "1" }, credentials: "include" });
      const j = r.ok ? await r.json() : null;
      if (j?.last && Date.now() - j.last.created_at < 120000) {
        await self.registration.showNotification("가입 신청이 왔어요", { body: `@${j.last.username} · 승인 대기 ${j.n}명`, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "signup", renotify: true, data: { url: "/#/admin" } });
        return;
      }
      if (j?.recent && Date.now() - j.recent.at < 120000) {
        await self.registration.showNotification(`${String(j.recent.by).toUpperCase()}가 @${j.recent.username} 를 승인했어요`, { body: "내 승인만 남았어요 · 관리자 화면에서 승인해요", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "approve", renotify: true, data: { url: "/#/admin" } });
        return;
      }
    } catch {}
    // 관리자: 방금 온 기능 사용 신청
    try {
      const r = await fetch("/api/admin/feature-requests", { headers: { "x-trio": "1" }, credentials: "include" });
      const j = r.ok ? await r.json() : null;
      const q = j?.requests?.[j.requests.length - 1];
      if (q && Date.now() - q.created_at < 120000) {
        await self.registration.showNotification("기능 사용 신청이 왔어요", { body: `@${q.username} · ${j.all?.[q.feature] || q.feature}`, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "feature", renotify: true, data: { url: "/#/admin" } });
        return;
      }
    } catch {}
    if (wins.some((w) => w.visibilityState === "visible" && w.focused)) { for (const w of wins) w.postMessage({ type: "room-ping" }); return; }
    // 뉴스: 내 메모에 친구가 반박 · 동의를 달았으면 그걸 먼저 알려요 (푸시는 내용 없이 깨우기만 해서 여기서 물어봐요)
    try {
      const r = await fetch("/api/news/inbox", { headers: { "x-trio": "1" }, credentials: "include" });
      const j = r.ok ? await r.json() : null;
      if (j?.n && j.last && Date.now() - j.last.created_at < 120000) {
        const what = j.last.ai ? "🤖 반박" : j.last.stance === "rebut" ? "반박" : "동의";
        await self.registration.showNotification(`${j.last.who}님이 내 메모에 ${what}했어요`, { body: String(j.last.body).slice(0, 140), icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "news", renotify: true, data: { url: "/#/news/item/" + j.last.item_id } });
        return;
      }
    } catch {}
    let n = 0, last = null;
    try { const r = await fetch("/api/room/unread", { headers: { "x-trio": "1" }, credentials: "include" }); if (r.ok) { const j = await r.json(); n = j.total ?? j.unread ?? 0; last = j.last || null; } } catch {}
    if (!n) return;
    // 1:1 방도 포함한 전체 안 읽음. 나를 @로 부르면 제목이 "○○님이 불렀어요"
    const title = last?.mention ? `${last.who}님이 불렀어요` : last ? `${last.who}${last.dm ? " · 1:1" : " · 우리 셋"}` : "SWx2 대화방";
    const body = last ? `${last.body}${n > 1 ? `  (안 읽은 메시지 ${n}개)` : ""}` : `새 메시지 ${n}개`;
    const url = last?.room?.startsWith("dm:") ? "/#/room/chat" : "/#/room/chat";
    await self.registration.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "room", renotify: true, requireInteraction: !!last?.mention, data: { url } });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/#/room";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if ("focus" in w) { await w.focus(); w.postMessage(url.includes("#/news") ? { type: "open-hash", hash: url.slice(url.indexOf("#")) } : url.includes("#/notes/") ? { type: "open-url", url } : { type: "open-room" }); return; } }
    await self.clients.openWindow(url);
  })());
});

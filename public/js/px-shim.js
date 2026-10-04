// 내장 브라우저(프록시) 페이지 안 shim — 서버(src/proxy.js)가 html 맨 앞에 끼워요. window.__px = { t: 토큰, u: 지금 보는 진짜 주소 }
// 하는 일: 사이트 JS 가 만드는 모든 요청·주소를 /px/<토큰>/<주소> 로 돌려요 (fetch · XHR · 동적으로 붙는 src/href · 링크 클릭 · pushState · open · Worker · sendBeacon).
// sandbox(allow-same-origin 없음) 라 localStorage · cookie 가 막혀 있어 메모리 저장소로 대신해요 (새로고침하면 사라져요).
(() => {
  const P = window.__px; if (!P || window.__pxReady) return; window.__pxReady = true;
  const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const SKIP = /^(data:|blob:|javascript:|mailto:|tel:|#|about:)/i;
  const abs = (v) => { try { return new URL(String(v), P.u).href; } catch { return null; } };
  const px = (v) => { const s = String(v ?? ""); if (!s || SKIP.test(s) || s.startsWith("/px/") || s.startsWith(location.origin + "/px/")) return s; const a = abs(s); return a ? `/px/${P.t}/${b64u(a)}` : s; };
  const pxSrcset = (v) => String(v).split(",").map((p) => { const [u, d] = p.trim().split(/\s+/, 2); return [px(u), d].filter(Boolean).join(" "); }).join(", ");
  const real = (v) => { // 프록시 주소 → 진짜 주소 (사이트 JS 가 자기 주소를 읽을 때)
    const m = /\/px\/[^/]+\/([^/?#]+)/.exec(String(v || "")); if (!m) return v;
    try { return decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (m[1].length % 4)) % 4)))); } catch { return v; }
  };

  // ---- 메모리 저장소 · 쿠키 (sandbox 라 진짜는 막혀요) ----
  const mem = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null), setItem: (k, v) => { m.set(String(k), String(v)); }, removeItem: (k) => { m.delete(String(k)); }, clear: () => m.clear() }; };
  for (const k of ["localStorage", "sessionStorage"]) { try { void window[k]; } catch { try { Object.defineProperty(window, k, { value: mem(), configurable: true }); } catch {} } }
  try { void document.cookie; } catch { const jar = new Map(); try { Object.defineProperty(Document.prototype, "cookie", { configurable: true, get: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "), set: (s) => { const [kv] = String(s).split(";"); const i = kv.indexOf("="); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); } }); } catch {} }
  try { if (!("serviceWorker" in navigator) || !navigator.serviceWorker) {} else navigator.serviceWorker.register = () => Promise.reject(new Error("프록시 안에서는 서비스 워커를 쓸 수 없어요.")); } catch {}

  // ---- 요청 ----
  const F = window.fetch.bind(window);
  window.fetch = (input, init) => { try { if (typeof input === "string" || input instanceof URL) input = px(String(input)); else if (input && input.url) input = new Request(px(input.url), input); } catch {} return F(input, init); };
  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...r) { return XO.call(this, m, px(u), ...r); };
  if (navigator.sendBeacon) { const SB = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, d) => SB(px(u), d); }
  const WO = window.open; window.open = (u, ...r) => WO.call(window, u ? px(u) : u, ...r);
  if (window.Worker) { const W = window.Worker; window.Worker = function (u, o) { return new W(px(u), o); }; window.Worker.prototype = W.prototype; }
  if (window.EventSource) { const ES = window.EventSource; window.EventSource = function (u, o) { return new ES(px(u), o); }; window.EventSource.prototype = ES.prototype; }
  // ---- 주소 (history) : 사이트가 /watch?v=… 로 바꾸면 우리 쪽도 따라가요 ----
  const H = history.pushState.bind(history), R = history.replaceState.bind(history);
  const nav = (fn) => (s, t, u) => { if (u != null) { const a = abs(u); if (a) { P.u = a; return fn(s, t, px(a)); } } return fn(s, t, u); };
  history.pushState = nav(H); history.replaceState = nav(R);
  // ---- 동적으로 붙는 src · href · srcset · style ----
  const ATTR = ["src", "href", "srcset", "poster", "action", "data-src", "formaction"];
  const fix = (el) => {
    if (!el || el.nodeType !== 1) return;
    for (const a of ATTR) { const v = el.getAttribute?.(a); if (v && !SKIP.test(v) && !v.startsWith("/px/")) { const n = a === "srcset" ? pxSrcset(v) : px(v); if (n !== v) el.setAttribute(a, n); } }
    if (el.tagName === "STYLE" && el.textContent?.includes("url(")) el.textContent = el.textContent.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${px(u)}${q})`);
  };
  const SA = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) { const k = String(n).toLowerCase(); if (ATTR.includes(k) && typeof v === "string") v = k === "srcset" ? pxSrcset(v) : px(v); return SA.call(this, n, v); };
  for (const [C, prop] of [[HTMLImageElement, "src"], [HTMLImageElement, "srcset"], [HTMLScriptElement, "src"], [HTMLLinkElement, "href"], [HTMLIFrameElement, "src"], [HTMLSourceElement, "src"], [HTMLSourceElement, "srcset"], [HTMLMediaElement, "src"], [HTMLVideoElement, "poster"], [HTMLAnchorElement, "href"], [HTMLFormElement, "action"], [HTMLEmbedElement, "src"], [HTMLTrackElement, "src"]]) {
    try { const d = Object.getOwnPropertyDescriptor(C.prototype, prop); if (!d?.set) continue;
      Object.defineProperty(C.prototype, prop, { configurable: true, enumerable: d.enumerable, get() { return C === HTMLAnchorElement ? real(d.get.call(this)) : d.get.call(this); }, set(v) { d.set.call(this, prop === "srcset" ? pxSrcset(v) : px(v)); } }); } catch {}
  }
  new MutationObserver((muts) => { for (const m of muts) { if (m.type === "attributes") fix(m.target); else m.addedNodes.forEach((n) => { fix(n); n.querySelectorAll?.("[src],[href],[srcset],[poster],[action],style").forEach(fix); }); } })
    .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ATTR });
  // ---- 링크 클릭 · 폼 ----
  addEventListener("click", (e) => { const a = e.target.closest?.("a[href]"); if (!a || e.defaultPrevented) return; const h = a.getAttribute("href"); if (!h || SKIP.test(h) || h.startsWith("/px/")) return; e.preventDefault(); const t = a.getAttribute("target"); if (t === "_blank") WO.call(window, px(h)); else location.href = px(h); }, true);
  addEventListener("submit", (e) => { const f = e.target; if (f?.action && !String(f.getAttribute("action") || "").startsWith("/px/")) f.action = px(f.getAttribute("action") || P.u); }, true);
  // ---- 부모(앱)에게 지금 주소 알려 주기 (주소줄 표시용) ----
  const tell = () => { try { parent.postMessage({ px: true, type: "nav", url: P.u, title: document.title }, "*"); } catch {} };
  addEventListener("DOMContentLoaded", tell); setInterval(() => { if (tell.last !== P.u + document.title) { tell.last = P.u + document.title; tell(); } }, 800);
  addEventListener("message", (e) => { const m = e.data; if (!m || !m.px) return; if (m.type === "go") location.href = px(m.url); if (m.type === "back") history.back(); if (m.type === "forward") history.forward(); if (m.type === "reload") location.reload(); });
})();

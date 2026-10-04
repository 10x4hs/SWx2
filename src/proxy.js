// 내장 브라우저(실험) — iframe 끼워 넣기를 막는 사이트(YouTube 등)를 Worker 가 대신 받아와 주소를 바꿔 보여 줘요.
//   GET /api/embed-check?url=   그 사이트가 끼워 넣기를 허용하는지(X-Frame-Options · CSP frame-ancestors) → 되면 직접, 막히면 프록시
//   GET /api/proxy-token        1시간짜리 HMAC 토큰 (프록시 iframe 은 sandbox 라 쿠키가 없어서 주소 안에 토큰을 넣어요)
//   GET /px/<token>/<base64url(주소)>   프록시 본체. html 은 HTMLRewriter 로 스트리밍 재작성 + shim 주입, css 는 url() 재작성, 나머지는 그대로
// 격리: 응답에 CSP sandbox(allow-same-origin 없음) → 외부 코드는 우리 쿠키 · 저장소에 못 닿아요. 쿠키는 전달하지 않아요(무상태 → 로그인은 안 돼요).
// 한계(사용자 고지): 구글 · 네이버 로그인 불가, 사이트마다 깨질 수 있음, 무료 요금제라 느릴 수 있음.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const TOKEN_TTL = 3600e3;
const ATTRS = ["href", "src", "srcset", "action", "poster", "data-src", "data-srcset", "formaction", "ping"];
const SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-downloads allow-presentation";

export const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4))));

async function hmac(env, data) {
  const secret = env.VAPID_PRIVATE_KEY || env.INVITE_CODE || "trio";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("px:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
export async function makeToken(env, userId) { const exp = Date.now() + TOKEN_TTL, body = `${userId}.${exp}`; return `${b64u(body)}.${await hmac(env, body)}`; }
async function checkToken(env, token) {
  const [b, sig] = String(token || "").split("."); if (!b || !sig) return null;
  let body; try { body = unb64u(b); } catch { return null; }
  if ((await hmac(env, body)) !== sig) return null;
  const exp = +body.split(".").pop(); return exp > Date.now() ? body : null;
}

// 사설망 · 자기 자신은 금지
function allowed(target, selfHost) {
  if (!/^https?:$/.test(target.protocol)) return false;
  const h = target.hostname.toLowerCase();
  if (h === selfHost || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return false;
  return true;
}
const px = (token, abs) => `/px/${token}/${b64u(abs)}`;
function rewriteUrl(raw, base, token) {
  const v = String(raw || "").trim();
  if (!v || /^(data:|blob:|javascript:|mailto:|tel:|#|about:)/i.test(v)) return raw;
  if (v.startsWith("/px/")) return raw;
  try { return px(token, new URL(v, base).href); } catch { return raw; }
}
const rewriteSrcset = (v, base, token) => String(v).split(",").map((part) => { const [u, d] = part.trim().split(/\s+/, 2); return [rewriteUrl(u, base, token), d].filter(Boolean).join(" "); }).join(", ");
const rewriteCss = (css, base, token) => css
  .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${rewriteUrl(u, base, token)}${q})`)
  .replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, u) => `@import ${q}${rewriteUrl(u, base, token)}${q}`);

const shimTag = (token, target) => `<script>window.__px=${JSON.stringify({ t: token, u: target })};</script><script src="/js/px-shim.js"></script>`;

export async function handleProxy(req, env, url) {
  const m = /^\/px\/([^/]+)\/([^/?#]+)/.exec(url.pathname);
  if (!m) return new Response("not found", { status: 404 });
  if (!(await checkToken(env, m[1]))) return new Response("프록시 토큰이 만료됐어요. 페이지를 다시 열어 주세요.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  const token = m[1];
  let target; try { target = new URL(unb64u(m[2])); } catch { return new Response("주소가 이상해요.", { status: 400 }); }
  // 프록시 뒤에 붙은 경로·쿼리(사이트 JS 가 상대 주소로 요청했을 때)는 대상 주소에 이어 붙여요
  const rest = url.pathname.slice(m[0].length);
  if (rest) target = new URL(rest + url.search, target); else if (url.search && !target.search) target.search = url.search;
  if (!allowed(target, url.hostname)) return new Response("이 주소는 열 수 없어요.", { status: 403 });

  const headers = new Headers({ "user-agent": UA, "accept": req.headers.get("accept") || "*/*", "accept-language": req.headers.get("accept-language") || "ko,en;q=0.8", "accept-encoding": "identity" });
  if (req.headers.get("content-type")) headers.set("content-type", req.headers.get("content-type"));
  if (req.headers.get("x-px-referer")) headers.set("referer", req.headers.get("x-px-referer"));
  let res;
  try { res = await fetch(target.href, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body, redirect: "manual", cf: { cacheTtl: 0 } }); }
  catch (e) { return new Response(`사이트에 연결하지 못했어요: ${e.message}`, { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } }); }

  const out = new Headers();
  const ct = res.headers.get("content-type") || "";
  for (const k of ["content-type", "content-disposition", "accept-ranges", "content-range", "last-modified", "etag"]) if (res.headers.get(k)) out.set(k, res.headers.get(k));
  out.set("cache-control", "no-store"); out.set("referrer-policy", "no-referrer"); out.set("x-px-url", target.href);
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    out.set("location", rewriteUrl(res.headers.get("location"), target.href, token));
    return new Response(null, { status: res.status, headers: out });
  }
  if (/text\/html/i.test(ct)) {
    out.set("content-security-policy", SANDBOX);
    const base = target.href;
    const attr = (name) => ({ element(el) { const v = el.getAttribute(name); if (v == null) return; el.setAttribute(name, name.endsWith("srcset") ? rewriteSrcset(v, base, token) : rewriteUrl(v, base, token)); } });
    let rw = new HTMLRewriter()
      .on("head", { element(el) { el.prepend(shimTag(token, base), { html: true }); } })
      .on("meta[http-equiv]", { element(el) { if (/content-security-policy|refresh/i.test(el.getAttribute("http-equiv") || "")) el.remove(); } })
      .on("base", { element(el) { el.remove(); } })
      .on("[integrity]", { element(el) { el.removeAttribute("integrity"); } })
      .on("[crossorigin]", { element(el) { el.removeAttribute("crossorigin"); } })
      .on("style", { text(t) { if (t.text) t.replace(rewriteCss(t.text, base, token)); } })
      .on("[style]", { element(el) { el.setAttribute("style", rewriteCss(el.getAttribute("style"), base, token)); } });
    for (const a of ATTRS) rw = rw.on(`[${a}]`, attr(a));
    // <body> 만 있고 <head> 가 없는 문서: body 앞에
    rw = rw.on("body", { element(el) { el.prepend(`<script>if(!window.__px){document.write(${JSON.stringify(shimTag(token, base))})}</script>`, { html: true }); } });
    return rw.transform(new Response(res.body, { status: res.status, headers: out }));
  }
  if (/text\/css/i.test(ct)) {
    const css = await res.text();
    return new Response(rewriteCss(css, target.href, token), { status: res.status, headers: out });
  }
  return new Response(res.body, { status: res.status, headers: out });
}

export function registerProxy(on, { json, fail }) {
  const cache = new Map();
  on("GET", "/embed-check", async ({ q, url, user }) => {
    let target; try { target = new URL(String(q.get("url") || "")); } catch { fail(400, "주소가 이상해요."); }
    if (!allowed(target, url.hostname)) fail(400, "이 주소는 열 수 없어요.");
    const key = target.origin + target.pathname;
    const hit = cache.get(key); if (hit && hit.at > Date.now() - 600e3) return json(hit.v);
    let v;
    try {
      const r = await fetch(target.href, { method: "GET", headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow", cf: { cacheTtl: 0 } });
      const xfo = (r.headers.get("x-frame-options") || "").toLowerCase();
      const csp = (r.headers.get("content-security-policy") || "") + " " + (r.headers.get("content-security-policy-report-only") ? "" : "");
      const fa = /frame-ancestors\s+([^;]+)/i.exec(r.headers.get("content-security-policy") || "");
      let blocked = /deny|sameorigin/.test(xfo), why = blocked ? `X-Frame-Options: ${xfo}` : "";
      if (fa) { const list = fa[1].trim(); const ok = list.includes("*") || list.includes(url.origin) || list.includes(url.hostname); if (!ok) { blocked = true; why = `CSP frame-ancestors ${list}`; } }
      v = { embeddable: !blocked, reason: why, final: r.url, status: r.status };
      void csp;
    } catch (e) { v = { embeddable: false, reason: "연결 실패: " + e.message, final: target.href, status: 0 }; }
    cache.set(key, { at: Date.now(), v });
    return json(v);
  });
  on("GET", "/proxy-token", async ({ env, user }) => json({ token: await makeToken(env, user.id), ttl: TOKEN_TTL }));
}

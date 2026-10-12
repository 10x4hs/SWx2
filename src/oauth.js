// OAuth 2.1 (MCP 인증 규격) — ChatGPT · claude.ai 커넥터처럼 OAuth 로만 붙는 앱을 위해.
//   /.well-known/oauth-protected-resource[/mcp]   이 MCP 서버를 지키는 인증 서버가 어디인지 (RFC 9728)
//   /.well-known/oauth-authorization-server        인증 서버 정보 (RFC 8414) · openid-configuration 도 같은 내용
//   POST /oauth/register                           클라이언트 스스로 등록 (RFC 7591)
//   GET/POST /oauth/authorize                      앱 계정으로 로그인 → "허용" (PKCE S256 필수)
//   POST /oauth/token                              authorization_code · refresh_token (갱신 토큰은 쓸 때마다 바꿔요)
// 코드 · 토큰 · 비밀값은 전부 SHA-256 만 저장해요. 토큰 하나 = 그 사람 계정 권한.

import { sha256, b64url } from "./lib/crypto.js";

const ACCESS_TTL = 3600e3;            // 1시간
const REFRESH_TTL = 30 * 864e5;       // 30일
const CODE_TTL = 5 * 60e3;            // 5분
const SCOPE = "mcp";

const rand = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const s256 = async (verifier) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version" };
const j = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra } });
const oerr = (error, error_description, status = 400) => j({ error, error_description }, status);

export const resourceMetadataUrl = (origin) => `${origin}/.well-known/oauth-protected-resource`;
// OAuth 클라이언트 이름 → 작업판에 남을 에이전트 이름 (chatgpt · claude …)
export const agentName = (name, id) => (String(name || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "oauth-" + String(id).slice(0, 6));

function asMeta(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
    service_documentation: `${origin}/#/papers`,
  };
}

// 등록한 주소와 글자 하나까지 같아야 해요. https 만 (개발용 localhost 는 http 허용)
const okRedirect = (u) => {
  try {
    const x = new URL(u);
    if (x.hash) return false;
    return x.protocol === "https:" || (x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname));
  } catch { return false; }
};

// deps: { sessionUser(req, env) → user|null, loginWith(env, req, username, password) → { user, cookie } | { error } }
export async function handleOAuth(req, env, url, deps) {
  const p = url.pathname, origin = url.origin;
  if (req.method === "OPTIONS" && (p.startsWith("/.well-known/") || p.startsWith("/oauth/"))) return new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } });

  if (p === "/.well-known/oauth-protected-resource" || p === "/.well-known/oauth-protected-resource/mcp") {
    return j({ resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ["header"], resource_name: "Dsm-mafia 공부 앱" });
  }
  if (p === "/.well-known/oauth-authorization-server" || p === "/.well-known/oauth-authorization-server/mcp" || p === "/.well-known/openid-configuration" || p === "/.well-known/openid-configuration/mcp") {
    return j(asMeta(origin));
  }
  if (p === "/oauth/register" && req.method === "POST") return register(req, env);
  if (p === "/oauth/authorize") return authorize(req, env, url, deps);
  if (p === "/oauth/token" && req.method === "POST") return token(req, env, url);
  if (p.startsWith("/oauth/") || p.startsWith("/.well-known/oauth") || p.startsWith("/.well-known/openid")) return oerr("not_found", "없는 주소예요.", 404);
  return null;
}

// ---------- 등록 ----------
async function register(req, env) {
  let b; try { b = await req.json(); } catch { return oerr("invalid_client_metadata", "JSON 으로 보내 주세요."); }
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u) => typeof u === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(okRedirect)) return oerr("invalid_redirect_uri", "redirect_uris 는 https 주소(개발용 localhost 는 http)여야 해요.");
  const method = ["none", "client_secret_post", "client_secret_basic"].includes(b.token_endpoint_auth_method) ? b.token_endpoint_auth_method : "client_secret_post";
  const id = "c_" + rand(16), secret = method === "none" ? null : rand(32), now = Date.now();
  const name = String(b.client_name || "MCP 앱").slice(0, 80);
  await env.DB.prepare("INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, secret ? await sha256(secret) : null, name, JSON.stringify(uris), now).run();
  return j({
    client_id: id, ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}), client_id_issued_at: Math.floor(now / 1000),
    client_name: name, redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: method, scope: SCOPE,
  }, 201);
}

// ---------- 로그인 · 허용 ----------
async function authorize(req, env, url, deps) {
  const form = req.method === "POST" ? Object.fromEntries(await req.formData()) : {};
  const q = (k) => String((req.method === "POST" ? form[k] : url.searchParams.get(k)) ?? "");
  const P = { client_id: q("client_id"), redirect_uri: q("redirect_uri"), state: q("state"), code_challenge: q("code_challenge"), code_challenge_method: q("code_challenge_method"), scope: q("scope"), resource: q("resource"), response_type: q("response_type") };
  const client = P.client_id ? await env.DB.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").bind(P.client_id).first() : null;
  if (!client) return page("연결할 수 없어요", `<p>등록되지 않은 앱이에요 (client_id). 그 앱에서 다시 연결해 주세요.</p>`, 400);
  const uris = JSON.parse(client.redirect_uris || "[]");
  if (!P.redirect_uri && uris.length === 1) P.redirect_uri = uris[0];
  if (!uris.includes(P.redirect_uri)) return page("연결할 수 없어요", `<p>앱이 보낸 돌아갈 주소가 등록된 주소와 달라요.</p>`, 400);
  // 여기부터는 돌아갈 주소가 믿을 만해서, 오류도 그 앱으로 돌려보내요
  const back = (params) => { const r = new URL(P.redirect_uri); for (const [k, v] of Object.entries(params)) if (v) r.searchParams.set(k, v); if (P.state) r.searchParams.set("state", P.state); return Response.redirect(r.toString(), 302); };
  if (P.response_type !== "code") return back({ error: "unsupported_response_type" });
  if (!P.code_challenge || P.code_challenge_method !== "S256") return back({ error: "invalid_request", error_description: "PKCE (code_challenge, S256) 가 필요해요." });
  if (P.resource && P.resource !== `${url.origin}/mcp` && P.resource !== url.origin && P.resource !== `${url.origin}/`) return back({ error: "invalid_target", error_description: "이 서버의 MCP 주소가 아니에요." });

  if (req.method === "POST") {
    // 같은 사이트에서 보낸 양식만 (다른 사이트가 몰래 "허용"을 누르게 하지 못하게)
    const o = req.headers.get("origin");
    if (o && o !== url.origin) return page("연결할 수 없어요", "<p>잘못된 요청이에요.</p>", 403);
    if (form.action === "deny") return back({ error: "access_denied" });
  }
  let user = await deps.sessionUser(req, env), setCookie = null, loginErr = "";
  if (req.method === "POST" && form.action === "login") {
    const r = await deps.loginWith(env, req, String(form.username || ""), String(form.password || ""));
    if (r.error) loginErr = r.error; else { user = r.user; setCookie = r.cookie; }
  }
  const hidden = Object.entries(P).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join("");
  if (!user) {
    return page(`${esc(client.client_name)} 연결`, `
      <p class="lead"><b>${esc(client.client_name)}</b> 이(가) Dsm-mafia 계정에 연결하려고 해요. 먼저 로그인해 주세요.</p>
      <form method="post" class="card">${hidden}<input type="hidden" name="action" value="login">
        <label>아이디<input name="username" autocomplete="username" required autofocus></label>
        <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
        ${loginErr ? `<p class="err">${esc(loginErr)}</p>` : ""}
        <button class="primary" type="submit">로그인</button>
      </form>`, loginErr ? 401 : 200);
  }
  if (user.must_change_pw) return page("먼저 비밀번호를 바꿔 주세요", `<p>앱(<a href="/">${esc(url.origin)}</a>)에서 첫 비밀번호를 바꾼 뒤 다시 연결해 주세요.</p>`, 403, setCookie);

  if (req.method === "POST" && form.action === "allow") {
    const code = rand(32);
    await env.DB.prepare("INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(await sha256(code), client.client_id, user.id, P.redirect_uri, P.code_challenge, SCOPE, Date.now() + CODE_TTL).run();
    return back({ code });
  }
  return page(`${esc(client.client_name)} 연결`, `
    <p class="lead"><b>${esc(client.client_name)}</b> 이(가) <b>${esc(user.display_name)} (@${esc(user.username)})</b> 계정으로 Dsm-mafia 를 쓰려고 해요.</p>
    <div class="card"><b>허용하면 할 수 있는 일</b><ul>
      <li>논문 스프린트 자료 읽기 · 내 진도 체크</li><li>내 노트 찾기 · 읽기 · 쓰기</li><li>내 계획 보기 · 넣기</li><li>에이전트 작업판 쓰기</li></ul>
      <p class="muted">언제든 앱의 프로필 메뉴 → <b>MCP 연결</b>에서 끊을 수 있어요. 돌아갈 곳: ${esc(new URL(P.redirect_uri).host)}</p></div>
    <form method="post" class="row">${hidden}
      <button name="action" value="deny" type="submit">거절</button>
      <button class="primary" name="action" value="allow" type="submit">허용</button>
    </form>`, 200, setCookie);
}

function page(title, inner, status = 200, setCookie = null) {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Dsm-mafia</title>
<style>
:root{color-scheme:dark;--ink:#F5F5F7;--ink2:rgba(245,245,247,.72);--line:rgba(255,255,255,.12);--bg:#141416;--card:rgba(255,255,255,.05)}
@media (prefers-color-scheme: light){:root{color-scheme:light;--ink:#1D1D1F;--ink2:#555;--line:rgba(0,0,0,.12);--bg:#F2F2F5;--card:#fff}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"SF Pro Text","Pretendard Variable","Apple SD Gothic Neo",system-ui,sans-serif;padding:20px}
main{width:min(420px,100%)}h1{font-size:22px;letter-spacing:-.02em;margin:0 0 6px}.brand{font-size:12px;color:var(--ink2);margin-bottom:18px}
.lead{margin:0 0 14px}.card{display:grid;gap:10px;padding:16px;border-radius:16px;background:var(--card);border:1px solid var(--line);margin-bottom:14px}
.card ul{margin:0;padding-left:18px}.muted{color:var(--ink2);font-size:13px;margin:0}
label{display:grid;gap:4px;font-size:13px;color:var(--ink2)}input{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:11px;padding:10px 12px}
button{font:600 14px/1 inherit;font-family:inherit;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
.primary{background:var(--ink);color:var(--bg);border-color:transparent}.row{display:flex;gap:8px;justify-content:flex-end}.err{color:#ff6b6b;margin:0;font-size:13px}a{color:inherit}
</style></head><body><main><div class="brand">Dsm-mafia · MCP 연결</div><h1>${title}</h1>${inner}</main></body></html>`;
  const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'; form-action 'self' https: http://localhost:* http://127.0.0.1:*", "referrer-policy": "same-origin" };
  if (setCookie) headers["set-cookie"] = setCookie;
  return new Response(html, { status, headers });
}

// ---------- 토큰 ----------
async function readForm(req) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) { try { return await req.json(); } catch { return {}; } }
  try { return Object.fromEntries(await req.formData()); } catch { return {}; }
}
async function clientAuth(req, env, b) {
  let id = b.client_id, secret = b.client_secret;
  const basic = (req.headers.get("authorization") || "").match(/^Basic\s+(.+)$/i);
  if (basic) { try { const [a, s] = atob(basic[1]).split(":"); id = decodeURIComponent(a); secret = decodeURIComponent(s || ""); } catch {} }
  const c = id ? await env.DB.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").bind(String(id)).first() : null;
  if (!c) return null;
  if (c.client_secret_hash && (!secret || (await sha256(String(secret))) !== c.client_secret_hash)) return null;
  return c;
}
async function issue(env, clientId, userId) {
  const access = rand(32), refresh = rand(32), now = Date.now();
  await env.DB.prepare("INSERT INTO oauth_tokens (access_hash, refresh_hash, client_id, user_id, scope, access_expires, refresh_expires, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(await sha256(access), await sha256(refresh), clientId, userId, SCOPE, now + ACCESS_TTL, now + REFRESH_TTL, now).run();
  return j({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: SCOPE });
}
async function token(req, env) {
  const b = await readForm(req);
  const c = await clientAuth(req, env, b);
  if (!c) return oerr("invalid_client", "앱 인증이 맞지 않아요.", 401);
  if (b.grant_type === "authorization_code") {
    const row = b.code ? await env.DB.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?").bind(await sha256(String(b.code))).first() : null;
    if (!row || row.client_id !== c.client_id) return oerr("invalid_grant", "코드가 맞지 않아요.");
    // 한 번만 쓸 수 있어요 — 두 번째로 오면 그 코드로 만든 토큰까지 거둬요 (가로챈 코드 재사용 막기)
    if (row.used) { await env.DB.prepare("DELETE FROM oauth_tokens WHERE client_id = ? AND user_id = ? AND created_at >= ?").bind(row.client_id, row.user_id, row.expires_at - CODE_TTL).run(); return oerr("invalid_grant", "이미 쓴 코드예요."); }
    await env.DB.prepare("UPDATE oauth_codes SET used = 1 WHERE code_hash = ?").bind(row.code_hash).run();
    if (row.expires_at < Date.now()) return oerr("invalid_grant", "코드가 만료됐어요. 다시 연결해 주세요.");
    if (b.redirect_uri && b.redirect_uri !== row.redirect_uri) return oerr("invalid_grant", "redirect_uri 가 달라요.");
    if (!b.code_verifier || (await s256(String(b.code_verifier))) !== row.code_challenge) return oerr("invalid_grant", "PKCE 확인(code_verifier)이 맞지 않아요.");
    await env.DB.prepare("DELETE FROM oauth_codes WHERE expires_at < ?").bind(Date.now() - 864e5).run();
    return issue(env, c.client_id, row.user_id);
  }
  if (b.grant_type === "refresh_token") {
    const row = b.refresh_token ? await env.DB.prepare("SELECT * FROM oauth_tokens WHERE refresh_hash = ?").bind(await sha256(String(b.refresh_token))).first() : null;
    if (!row || row.client_id !== c.client_id || row.refresh_expires < Date.now()) return oerr("invalid_grant", "갱신 토큰이 맞지 않거나 만료됐어요. 다시 연결해 주세요.");
    await env.DB.prepare("DELETE FROM oauth_tokens WHERE access_hash = ?").bind(row.access_hash).run(); // 갱신 토큰은 한 번만 (돌려 쓰기)
    return issue(env, c.client_id, row.user_id);
  }
  return oerr("unsupported_grant_type", "authorization_code 와 refresh_token 만 돼요.");
}

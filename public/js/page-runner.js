// 사용자 페이지 러너 — /pf/<id>/index.html 을 sandbox iframe 에 띄우고(allow-same-origin 없음 → 쿠키 · fetch("/api") 못 씀),
// 페이지 안 브리지(public/js/page-bridge.js)와 postMessage 로 이야기해요. 내 페이지는 앱 API 읽기·쓰기 전부, 남이 공유한 페이지는 GET 만.
// kind=url 페이지는 바깥 사이트를 그대로 iframe 으로 (브리지 없음).
import { api } from "./api.js";
import { toast, ymd, today, esc } from "./util.js";

const VARS = ["--bg", "--page-bg", "--paper", "--ink", "--ink-2", "--ink-3", "--line", "--line-2", "--glass", "--glass-3", "--hover", "--accent", "--accent-soft", "--font", "--c-blue", "--c-green", "--c-amber", "--c-rose", "--c-teal", "--c-purple", "--m0", "--m1", "--m2"];
function themeInfo() {
  const cs = getComputedStyle(document.documentElement), v = (k) => cs.getPropertyValue(k).trim();
  const dark = document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const cssVars = Object.fromEntries(VARS.map((k) => [k, v(k)]).filter(([, x]) => x));
  return { cssVars, theme: { dark, bg: v("--page-bg") || v("--bg"), ink: v("--ink"), ink2: v("--ink-2"), ink3: v("--ink-3"), line: v("--line"), accent: v("--accent"), blue: v("--c-blue"), green: v("--c-green"), amber: v("--c-amber"), rose: v("--c-rose"), teal: v("--c-teal"), font: v("--font") } };
}

export function mountRunner(host, ctx, page, { preview = null } = {}) {
  const readonly = page.user_id !== ctx.me.id;
  const f = document.createElement("iframe");
  f.className = "upage-frame"; f.title = page.title;
  if (page.kind === "url") return mountBrowser(host, ctx, page, f);
  f.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock");
  // sandbox iframe 안의 하위 요청(style.css · app.js …)에는 로그인 쿠키가 안 붙어요 → 페이지 파일 토큰을 주소에 넣어요(/pf/<id>/~<토큰>/)
  const load = (token) => {
    const dir = `/pf/${encodeURIComponent(page.id)}/${token ? `~${token}/` : ""}`;
    if (preview) { // 저장 없이 미리보기: 파일들을 srcdoc 으로 (상대 경로는 /pf/ 로 가도록 <base>)
      const base = `<base href="${location.origin}${dir}">`, tag = `<script src="/js/page-bridge.js"></script>`;
      let html = preview["index.html"] || "<p>index.html 이 없어요.</p>";
      // 미리보기에서는 같이 고친 css/js 도 바로 반영되게 인라인으로 끼워요
      for (const [path, content] of Object.entries(preview)) {
        if (/\.css$/i.test(path)) html = html.replace(new RegExp(`<link[^>]+href=["']\\.?/?${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i"), () => `<style data-f="${path}">${content.replace(/<\/style/gi, "<\\/style")}</style>`);
        if (/\.m?js$/i.test(path)) html = html.replace(new RegExp(`<script[^>]+src=["']\\.?/?${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>\\s*</script>`, "i"), () => `<script data-f="${path}">${content.replace(/<\/script/gi, "<\\/script")}</script>`);
      }
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + base + tag) : base + tag + html;
      f.srcdoc = html;
    } else f.src = `${dir}index.html?v=${page.updated_at || 0}`;
  };
  api.pageFileToken(page.id).then((r) => load(r.token), () => load(null));
  host.replaceChildren(f);

  // 사람별 서버 저장소 (예전 기기별 localStorage 값이 있으면 처음 한 번 옮겨요)
  const storeKey = `trio.page.${page.id}.store`;
  let stateP = null, saveT = null;
  const state = () => stateP || (stateP = api.pageState(page.id).then((r) => {
    let d = r.data || {};
    try { const old = JSON.parse(localStorage.getItem(storeKey) || "null"); if (old && !Object.keys(d).length) { d = old; api.savePageState(page.id, d).catch(() => {}); } localStorage.removeItem(storeKey); } catch {}
    return d;
  }).catch(() => ({})));
  const saveSoon = (d) => { clearTimeout(saveT); saveT = setTimeout(() => api.savePageState(page.id, d).catch((e) => toast(e.message)), 400); };
  const boot = () => {
    const { cssVars, theme } = themeInfo();
    f.contentWindow?.postMessage({ trio: true, type: "boot", me: { id: ctx.me.id, display_name: ctx.me.display_name, color: ctx.me.color }, users: ctx.users.map((u) => ({ id: u.id, display_name: u.display_name, color: u.color })), today: ymd(today()), readonly, theme, cssVars, page: { id: page.id, title: page.title } }, "*");
  };
  async function handle(m) {
    if (m.type === "api") {
      if (!/^\/[\w\-./?=&%:,+@]*$/.test(m.path) || m.path.startsWith("/auth") || m.path.startsWith("/pages")) throw new Error("이 주소는 페이지에서 못 써요.");
      if (readonly && m.method !== "GET") throw new Error("남이 공유한 페이지는 읽기만 할 수 있어요.");
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m.method)) throw new Error("모르는 method");
      return api.raw(m.method, m.path, m.body);
    }
    if (m.type === "go") { if (/^#\//.test(m.hash || "")) ctx.go(m.hash); return true; }
    if (m.type === "toast") { toast(String(m.text || "").slice(0, 200)); return true; }
    if (m.type === "store.get") return (await state())[String(m.key)] ?? null;
    if (m.type === "store.all") return await state();
    if (m.type === "store.set") { const s = await state(); if (m.value === null || m.value === undefined) delete s[String(m.key)]; else s[String(m.key)] = m.value; saveSoon(s); return true; }
    if (m.type === "others") { try { return (await api.pageStates(page.id)).states; } catch { return [{ user_id: ctx.me.id, display_name: ctx.me.display_name, color: ctx.me.color, data: await state() }]; } }
    throw new Error("모르는 요청");
  }
  const onMsg = async (e) => {
    if (e.source !== f.contentWindow) return;
    const m = e.data; if (!m || !m.trio) return;
    if (m.type === "hello") { boot(); return; }
    if (!m.id) return;
    try { f.contentWindow.postMessage({ trio: true, id: m.id, result: await handle(m) }, "*"); }
    catch (err) { f.contentWindow.postMessage({ trio: true, id: m.id, error: err.message || "실패했어요." }, "*"); }
  };
  const onChanged = (e) => f.contentWindow?.postMessage({ trio: true, type: "change", kind: e.detail?.kind || "" }, "*");
  window.addEventListener("message", onMsg);
  window.addEventListener("trio:changed", onChanged);
  return () => { window.removeEventListener("message", onMsg); window.removeEventListener("trio:changed", onChanged); f.remove(); };
}

// ---------- URL 페이지 = 내장 브라우저 ----------
// 1) 그 사이트가 iframe 을 허용하면 그대로(로그인도 돼요)  2) 막으면(YouTube 등) 우리 서버 프록시(/px/)로 — 실험: 로그인 안 됨 · 사이트마다 깨질 수 있음
const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
let tokenCache = null;
async function proxyToken() {
  if (tokenCache && tokenCache.exp > Date.now() + 60e3) return tokenCache.token;
  const r = await api.proxyToken(); tokenCache = { token: r.token, exp: Date.now() + (r.ttl || 3600e3) }; return r.token;
}
function mountBrowser(host, ctx, page, f) {
  let mode = "direct", cur = page.url, alive = true;
  host.innerHTML = `<div class="pxbar">
      <button class="icon-btn sm" type="button" data-px="back" title="뒤로">‹</button><button class="icon-btn sm" type="button" data-px="forward" title="앞으로">›</button><button class="icon-btn sm" type="button" data-px="reload" title="새로고침">⟳</button>
      <form class="px-addr" id="px-addr"><input class="input" id="px-url" value="${esc(page.url)}" spellcheck="false" aria-label="주소"></form>
      <span class="chip px-mode" id="px-mode">확인 중…</span>
    </div><div class="px-body"></div>`;
  const body = host.querySelector(".px-body"), modeEl = host.querySelector("#px-mode"), urlEl = host.querySelector("#px-url");
  const setMode = (m, why) => { mode = m; modeEl.textContent = m === "direct" ? "직접" : m === "proxy" ? "프록시 · 로그인 안 됨" : "막힘"; modeEl.className = `chip px-mode ${m}`; modeEl.title = why || (m === "proxy" ? "이 사이트는 끼워 넣기를 막아서 우리 서버가 대신 받아와요 (실험). 로그인은 안 되고 일부가 깨질 수 있어요." : ""); };
  async function load(url) {
    cur = url; urlEl.value = url; body.innerHTML = `<p class="faint" style="padding:16px">여는 중…</p>`;
    let check = { embeddable: true };
    try { check = await api.embedCheck(url); } catch (e) { check = { embeddable: false, reason: e.message }; }
    if (!alive) return;
    f.remove(); f.removeAttribute("sandbox"); f.removeAttribute("srcdoc");
    if (check.embeddable) {
      setMode("direct");
      f.setAttribute("allow", "fullscreen; clipboard-write; autoplay; picture-in-picture");
      f.referrerPolicy = "no-referrer"; f.src = url;
    } else {
      try {
        const t = await proxyToken();
        setMode("proxy", check.reason);
        f.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-downloads allow-presentation");
        f.setAttribute("allow", "fullscreen; autoplay; picture-in-picture");
        f.src = `/px/${t}/${b64u(check.final || url)}`;
      } catch (e) { setMode("blocked", e.message); body.innerHTML = `<div class="px-blocked"><p>이 사이트는 끼워 넣기를 막고, 프록시도 열지 못했어요.</p><a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">새 창으로 열기</a></div>`; return; }
    }
    body.replaceChildren(f);
  }
  host.querySelectorAll("[data-px]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.px;
    if (mode === "proxy") f.contentWindow?.postMessage({ px: true, type: k }, "*");
    else if (k === "reload") f.src = f.src; else try { k === "back" ? f.contentWindow.history.back() : f.contentWindow.history.forward(); } catch { toast("직접 띄운 사이트는 안에서 뒤로 가기를 눌러 주세요."); }
  }));
  host.querySelector("#px-addr").addEventListener("submit", (e) => { e.preventDefault(); let u = urlEl.value.trim(); if (!u) return; if (!/^https?:\/\//i.test(u)) u = /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) ? "https://" + u : "https://www.google.com/search?q=" + encodeURIComponent(u); load(u); });
  const onMsg = (e) => { if (e.source !== f.contentWindow) return; const m = e.data; if (m && m.px && m.type === "nav" && m.url) { cur = m.url; if (document.activeElement !== urlEl) urlEl.value = m.url; } };
  window.addEventListener("message", onMsg);
  load(page.url);
  return () => { alive = false; window.removeEventListener("message", onMsg); f.remove(); };
}

// 사용자 페이지 러너 — /pf/<id>/index.html 을 sandbox iframe 에 띄우고(allow-same-origin 없음 → 쿠키 · fetch("/api") 못 씀),
// 페이지 안 브리지(public/js/page-bridge.js)와 postMessage 로 이야기해요. 내 페이지는 앱 API 읽기·쓰기 전부, 남이 공유한 페이지는 GET 만.
// kind=url 페이지는 바깥 사이트를 그대로 iframe 으로 (브리지 없음).
import { api } from "./api.js";
import { toast, ymd, today } from "./util.js";

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
  if (page.kind === "url") { // 바깥 사이트: sandbox 없이 (로그인 · 스크립트가 필요한 사이트가 많아요)
    f.setAttribute("allow", "fullscreen; clipboard-write");
    f.referrerPolicy = "no-referrer";
    f.src = page.url;
    host.replaceChildren(f);
    return () => f.remove();
  }
  f.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock");
  if (preview) { // 저장 없이 미리보기: 파일들을 srcdoc 으로 (상대 경로는 /pf/ 로 가도록 <base>)
    const base = `<base href="${location.origin}/pf/${encodeURIComponent(page.id)}/">`, tag = `<script src="/js/page-bridge.js"></script>`;
    let html = preview["index.html"] || "<p>index.html 이 없어요.</p>";
    // 미리보기에서는 같이 고친 css/js 도 바로 반영되게 인라인으로 끼워요
    for (const [path, content] of Object.entries(preview)) {
      if (/\.css$/i.test(path)) html = html.replace(new RegExp(`<link[^>]+href=["']\\.?/?${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i"), () => `<style data-f="${path}">${content.replace(/<\/style/gi, "<\\/style")}</style>`);
      if (/\.m?js$/i.test(path)) html = html.replace(new RegExp(`<script[^>]+src=["']\\.?/?${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>\\s*</script>`, "i"), () => `<script data-f="${path}">${content.replace(/<\/script/gi, "<\\/script")}</script>`);
    }
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + base + tag) : base + tag + html;
    f.srcdoc = html;
  } else f.src = `/pf/${encodeURIComponent(page.id)}/index.html?v=${page.updated_at || 0}`;
  host.replaceChildren(f);

  const storeKey = `trio.page.${page.id}.store`;
  const store = () => { try { return JSON.parse(localStorage.getItem(storeKey) || "{}"); } catch { return {}; } };
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
    if (m.type === "store.get") return store()[String(m.key)] ?? null;
    if (m.type === "store.set") { const s = store(); s[String(m.key)] = m.value; try { localStorage.setItem(storeKey, JSON.stringify(s).slice(0, 200_000)); } catch {} return true; }
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

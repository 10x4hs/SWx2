// 사용자 페이지 러너 — 페이지 코드(HTML 한 파일)를 sandbox iframe 에 띄우고, postMessage 로 window.trio 브리지를 이어요.
// 규칙: 내 페이지는 앱 API 읽기·쓰기 전부, 남이 공유한 페이지는 GET 만 (readonly). 쿠키는 iframe 에 안 가요 (allow-same-origin 없음).
import { api } from "./api.js";
import { toast, ymd, today } from "./util.js";

const VARS = ["--bg", "--page-bg", "--paper", "--ink", "--ink-2", "--ink-3", "--line", "--line-2", "--glass", "--glass-3", "--hover", "--accent", "--accent-soft", "--font", "--c-blue", "--c-green", "--c-amber", "--c-rose", "--c-teal", "--c-purple", "--m0", "--m1", "--m2"];
function themeCss() {
  const cs = getComputedStyle(document.documentElement);
  const vals = VARS.map((v) => [v, cs.getPropertyValue(v).trim()]).filter(([, x]) => x);
  const dark = document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  return `:root{color-scheme:${dark ? "dark" : "light"};${vals.map(([k, v]) => `${k}:${v}`).join(";")}}
html,body{margin:0;background:transparent;color:var(--ink);font:15px/1.5 var(--font, system-ui);-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}button,input,select,textarea{font:inherit;color:inherit}a{color:var(--c-blue, #3b82f6)}`;
}

// iframe 안에서 도는 브리지 (문자열로 넣어요). 요청마다 id 를 붙여 부모와 주고받아요
const PRELUDE = `(() => {
  const pending = new Map(); let seq = 0; const listeners = new Set();
  const call = (type, payload) => new Promise((ok, no) => { const id = ++seq; pending.set(id, { ok, no }); parent.postMessage({ trio: true, id, type, ...payload }, "*"); });
  addEventListener("message", (e) => {
    const m = e.data; if (!m || !m.trio) return;
    if (m.type === "change") { listeners.forEach((f) => { try { f(m.kind); } catch {} }); return; }
    const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
    m.error ? p.no(new Error(m.error)) : p.ok(m.result);
  });
  const boot = JSON.parse(document.currentScript.dataset.boot);
  window.trio = {
    me: boot.me, users: boot.users, today: boot.today, readonly: boot.readonly, page: boot.page,
    api: (method, path, body) => call("api", { method: String(method || "GET").toUpperCase(), path: String(path || ""), body }),
    go: (hash) => call("go", { hash }), toast: (text) => call("toast", { text }),
    store: { get: (key) => call("store.get", { key }), set: (key, value) => call("store.set", { key, value }) },
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
  addEventListener("error", (e) => call("toast", { text: "페이지 오류: " + (e.message || "알 수 없음") }));
})();`;

export function mountRunner(host, ctx, page) {
  const readonly = page.user_id !== ctx.me.id;
  const boot = JSON.stringify({ me: { id: ctx.me.id, display_name: ctx.me.display_name, color: ctx.me.color }, users: ctx.users.map((u) => ({ id: u.id, display_name: u.display_name, color: u.color })), today: ymd(today()), readonly, page: { id: page.id, title: page.title } });
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${themeCss()}</style><script data-boot='${boot.replace(/</g, "\\u003c").replace(/&/g, "&amp;").replace(/'/g, "&#39;")}'>${PRELUDE}</script>`;
  let code = page.code || "<!doctype html><html><body><p>아직 코드가 없어요.</p></body></html>";
  code = /<head[^>]*>/i.test(code) ? code.replace(/<head[^>]*>/i, (m) => m + head) : /<html[^>]*>/i.test(code) ? code.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`) : `<!doctype html><html><head>${head}</head><body>${code}</body></html>`;

  const f = document.createElement("iframe");
  f.className = "upage-frame"; f.title = page.title;
  f.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups allow-downloads");
  f.srcdoc = code;
  host.replaceChildren(f);

  const storeKey = `trio.page.${page.id}.store`;
  const store = () => { try { return JSON.parse(localStorage.getItem(storeKey) || "{}"); } catch { return {}; } };
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
    const m = e.data; if (!m || !m.trio || !m.id) return;
    try { f.contentWindow.postMessage({ trio: true, id: m.id, result: await handle(m) }, "*"); }
    catch (err) { f.contentWindow.postMessage({ trio: true, id: m.id, error: err.message || "실패했어요." }, "*"); }
  };
  const onChanged = (e) => f.contentWindow?.postMessage({ trio: true, type: "change", kind: e.detail?.kind || "" }, "*");
  window.addEventListener("message", onMsg);
  window.addEventListener("trio:changed", onChanged);
  return () => { window.removeEventListener("message", onMsg); window.removeEventListener("trio:changed", onChanged); f.remove(); };
}

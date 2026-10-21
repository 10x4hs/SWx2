// Dock 사용자 페이지 브리지 — 서버가 페이지의 html 마다 끼워 넣어요(/pf/<id>/…). 부모(앱)와 postMessage 로 이야기해요.
// 페이지 코드에서는 window.trio 를 써요: await trio.ready; trio.api("GET", "/plans?periods=D:" + trio.today) …
(() => {
  if (window.trio) return;
  const pending = new Map(); let seq = 0; const changeFns = new Set(), readyFns = [];
  let ready = false, resolveReady;
  const readyP = new Promise((r) => { resolveReady = r; });
  const call = (type, payload) => new Promise((ok, no) => { const id = ++seq; pending.set(id, { ok, no }); parent.postMessage({ trio: true, id, type, ...payload }, "*"); });
  const trio = {
    ready: readyP, me: null, users: [], today: new Date().toISOString().slice(0, 10), readonly: true, theme: {}, page: null,
    api: (method, path, body) => call("api", { method: String(method || "GET").toUpperCase(), path: String(path || ""), body }),
    go: (hash) => call("go", { hash }), toast: (text) => call("toast", { text }),
    store: { get: (key) => call("store.get", { key }), set: (key, value) => call("store.set", { key, value }), all: () => call("store.all", {}) },
    others: () => call("others", {}),
    // 짧은 도우미 — 모두 trio.api 를 얇게 감싼 것 (남이 공유한 페이지에선 add · done 이 실패해요)
    plans: {
      day: async (ymd) => (await trio.api("GET", "/plans?periods=D:" + (ymd || trio.today))).plans,
      today: () => trio.plans.day(trio.today),
      range: async (from, to) => (await trio.api("GET", `/plans?days=${from}..${to}`)).plans.filter((p) => p.scope === "day").map((p) => ({ ...p, date: p.period.slice(2) })),
      add: async ({ text, start, mins, day, priority } = {}) => (await trio.api("POST", "/plans", { scope: "day", period: "D:" + (day || trio.today), text, ...(start ? { start } : {}), ...(mins ? { mins } : {}), ...(priority ? { priority } : {}) })).plan,
      done: async (id, done = true) => (await trio.api("PATCH", "/plans/" + encodeURIComponent(id), { done: !!done })).plan,
    },
    notes: {
      search: async (q) => (await trio.api("GET", "/search?q=" + encodeURIComponent(q || ""))).notes,
      get: async (id) => (await trio.api("GET", "/notes/" + encodeURIComponent(id))).note,
    },
    onChange: (fn) => { changeFns.add(fn); return () => changeFns.delete(fn); },
    onReady: (fn) => { if (ready) fn(trio); else readyFns.push(fn); },
  };
  window.trio = trio;
  addEventListener("message", (e) => {
    const m = e.data; if (!m || !m.trio) return;
    if (m.type === "boot") {
      Object.assign(trio, { me: m.me, users: m.users, today: m.today, readonly: !!m.readonly, theme: m.theme || {}, page: m.page });
      // 앱 테마 색을 CSS 변수로도 (페이지가 안 정했을 때만)
      try { const cs = getComputedStyle(document.documentElement); for (const [k, v] of Object.entries(m.cssVars || {})) if (!cs.getPropertyValue(k).trim()) document.documentElement.style.setProperty(k, v); } catch {}
      if (!ready) { ready = true; resolveReady(trio); readyFns.splice(0).forEach((f) => { try { f(trio); } catch (err) { console.error(err); } }); }
      return;
    }
    if (m.type === "change") { changeFns.forEach((f) => { try { f(m.kind); } catch {} }); return; }
    const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
    m.error ? p.no(new Error(m.error)) : p.ok(m.result);
  });
  addEventListener("error", (e) => { try { call("toast", { text: "페이지 오류: " + (e.message || "알 수 없음") }); } catch {} });
  const hello = () => parent.postMessage({ trio: true, type: "hello" }, "*");
  hello(); // 부모가 boot 로 답해요. 혹시 놓치면 한 번 더
  setTimeout(() => { if (!ready) hello(); }, 400);
})();

// 페이지 API 안내 + 개인 API 키 (프로필 메뉴 · 새 페이지 화면 · 페이지 코드 탭에서 열어요)
// [페이지 안에서] Dock 페이지가 window.trio 로 쓰는 도우미 · 앱 API · 복사해서 쓰는 예제
// [바깥 사이트에서] 개인 API 키 만들기 · 목록 · 지우기 (최대 5개, 키는 만들 때 한 번만 보여요) + /api/v1 읽기 전용 REST 설명
// 같은 창 모양(.mcp-*)을 그대로 써요
import { api } from "./api.js";
import { esc, toast } from "./util.js";
import { icon } from "./icons.js";

const fmt = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "아직 안 씀");

const HELPERS = [
  ["await trio.plans.today()", "오늘 하루 계획 [{ id, text, start, mins, done, missed, priority, focus_mins }]"],
  ["await trio.plans.day(\"2026-10-21\")", "그날 계획"],
  ["await trio.plans.range(from, to)", "그 사이 날마다 계획 (62일까지, 항목마다 date)"],
  ["await trio.plans.add({ text, start, mins, day })", "계획 하나 추가 (start \"HH:MM\" · mins 분 · day 기본 오늘)"],
  ["await trio.plans.done(id, true)", "끝냄 표시 (false 면 되돌려요)"],
  ["await trio.notes.search(\"검색어\")", "내 노트 찾기 [{ id, title, snippet }]"],
  ["await trio.notes.get(id)", "노트 하나 { title, body(마크다운) … }"],
  ["trio.me · trio.today · trio.users", "나 · 오늘 날짜(한국) · 같은 팀 사람들"],
  ["trio.store.get(k) / set(k, v)", "이 페이지의 사람별 저장소 (어느 기기에서나 같아요)"],
  ["trio.api(method, path, body)", "아래 앱 API 를 그대로 (도우미에 없는 것)"],
];
const ROUTES = [
  "GET /plans?periods=D:YYYY-MM-DD,W:YYYY-Wnn,M:YYYY-MM",
  "GET /plans?days=YYYY-MM-DD..YYYY-MM-DD",
  "POST /plans { scope:\"day\", period:\"D:…\", text, start?, mins?, priority? }",
  "PATCH /plans/:id { done?, missed?, text?, start?, mins? } · DELETE /plans/:id",
  "GET /summary?periods=… · GET /plans/heatmap?from=&to=",
  "GET /notes · GET /notes/:id · GET /search?q= · POST /notes { title, body }",
  "GET /english/day?day= · GET /logs/focus?from=&to= · GET /users · GET /me",
];
const EX_PAGE = `<!doctype html>
<h1>오늘 계획</h1>
<ul id="list"><li>불러오는 중…</li></ul>
<script>
  trio.onReady(async () => {
    const plans = await trio.plans.today();
    document.getElementById("list").innerHTML = plans.length
      ? plans.map((p) => \`<li>\${p.done ? "✅" : "⬜"} \${p.start || ""} \${p.text}</li>\`).join("")
      : "<li>오늘 계획이 없어요</li>";
  });
</script>`;
const EX_ADD = `const p = await trio.plans.add({ text: "영어 단어 30개", start: "21:00", mins: 30 });
await trio.plans.done(p.id); // 끝냄 표시`;
const exFetch = (base, key) => `const res = await fetch("${base}/plans/today", {
  headers: { Authorization: "Bearer ${key || "swx2_…내 키…"}" },
});
const { date, plans } = await res.json();
console.log(date, plans.map((p) => p.text));`;
const exCurl = (base, key) => `curl -H "Authorization: Bearer ${key || "swx2_…"}" ${base}/plans/today`;

export function openApiPanel(ctx, tab = "page") {
  if (document.querySelector(".apip-back")) return;
  const prevFocus = document.activeElement;
  const back = document.createElement("div");
  back.className = "palette-back pw-back mcp-back apip-back";
  back.innerHTML = `
    <section class="pw-dialog glass mcp-dialog" role="dialog" aria-modal="true" aria-labelledby="apip-title">
      <div class="pw-head"><h2 id="apip-title">페이지 API 안내</h2><button class="icon-btn sm" type="button" data-close aria-label="닫기">${icon.x(16)}</button></div>
      <nav class="seg apip-tabs" role="tablist"><button type="button" role="tab" data-tab="page">페이지 안에서 (window.trio)</button><button type="button" role="tab" data-tab="keys">바깥 사이트 (개인 API 키)</button></nav>
      <div class="mcp-body" id="apip-body"></div>
    </section>`;
  document.body.append(back);
  const body = back.querySelector("#apip-body");
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) close(); });
  back.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; draw(); }));

  let info = null, fresh = null; // fresh = 방금 만든 키 (창을 닫으면 다시 못 봐요)
  const snip = (k, v) => `<div class="mcp-snip"><div class="mcp-snip-k">${esc(k)}<button class="btn ghost sm" type="button" data-copy>복사</button></div><pre>${esc(v)}</pre></div>`;
  const bindCopy = () => body.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.closest(".mcp-snip").querySelector("pre").textContent); b.textContent = "복사됨"; setTimeout(() => (b.textContent = "복사"), 1500); } catch { toast("복사하지 못했어요. 글자를 직접 골라 복사해 주세요.", "err"); }
  }));

  function drawPage() {
    body.innerHTML = `
      <p class="pw-help">Dock 페이지(내가 만드는 화면) 안에서는 <code>window.trio</code> 로 앱 데이터를 써요. 로그인은 따로 필요 없어요. 남이 공유한 페이지는 읽기만 돼요.</p>
      <h3 class="mcp-h">짧은 도우미</h3>
      <ul class="mcp-list apip-list">${HELPERS.map(([c, d]) => `<li><code>${esc(c)}</code><span class="faint">${esc(d)}</span></li>`).join("")}</ul>
      ${snip("예제 · 오늘 계획 보여 주기 (index.html 하나)", EX_PAGE)}
      ${snip("예제 · 계획 추가하고 끝냄 표시", EX_ADD)}
      <details class="mcp-tools"><summary>trio.api 로 부르는 앱 API (주소에서 /api 는 빼요)</summary><ul>${ROUTES.map((r) => `<li><code>${esc(r)}</code></li>`).join("")}</ul></details>
      <p class="faint mcp-note">AI 로 페이지를 만들 때도 이 도우미를 알고 있어요. "오늘 계획을 카드로 보여 줘" 처럼 적어 보세요.</p>`;
    bindCopy();
  }
  function drawKeys() {
    if (!info) { body.innerHTML = `<p class="faint">불러오는 중…</p>`; return; }
    const base = info.base;
    body.innerHTML = `
      <p class="pw-help">내가 따로 만든 웹사이트(블로그 · 포트폴리오 · 작은 대시보드)에서 <b>내 계획</b>을 읽어 갈 수 있어요. 키는 읽기만 되고, 어느 사이트에서나 불러요(CORS).
        키는 내 계정 열쇠라 공개 저장소 · 남의 브라우저에 그대로 두지 말고, 되도록 내 서버에서 불러 주세요.</p>
      ${fresh ? `<div class="mcp-fresh" role="status"><b>'${esc(fresh.key.name)}' 키를 만들었어요 — 지금만 보여요.</b> 창을 닫기 전에 복사해 두세요. 잃어버리면 지우고 새로 만들면 돼요.
          ${snip("키", fresh.secret)}${snip("curl", exCurl(base, fresh.secret))}</div>` : ""}
      <h3 class="mcp-h">개인 API 키 <span class="faint">(${info.keys.length}/${info.max})</span></h3>
      ${info.keys.length ? `<ul class="mcp-list">${info.keys.map((k) => `<li><span class="mcp-name">${esc(k.name)}</span><span class="faint"><code>${esc(k.prefix)}…</code> · 만든 날 ${esc(fmt(k.created_at))} · 마지막 사용 ${esc(fmt(k.last_used_at))}</span>
          <button class="btn ghost sm mcp-revoke" type="button" data-revoke="${esc(k.id)}" data-label="${esc(k.name)}">지우기</button></li>`).join("")}</ul>` : `<p class="faint">아직 키가 없어요.</p>`}
      <form class="mcp-new" id="apip-new"><input class="input" name="name" placeholder="키 이름 (예: 내 블로그)" maxlength="30" autocomplete="off" required ${info.keys.length >= info.max ? "disabled" : ""}>
        <button class="btn accent sm" type="submit" ${info.keys.length >= info.max ? "disabled" : ""}>${icon.plus(14)} 키 만들기</button></form>
      <h3 class="mcp-h">쓸 수 있는 주소 (GET 만 · 키마다 1분에 60번)</h3>
      <ul class="mcp-list apip-list">
        <li><code>GET ${esc(base)}/me</code><span class="faint">{ user: { id, username, display_name, color } }</span></li>
        <li><code>GET ${esc(base)}/plans/today</code><span class="faint">{ date, plans: [{ id, date, text, start, mins, done, missed, priority, focus_mins }] } — 한국 날짜</span></li>
        <li><code>GET ${esc(base)}/plans?from=2026-10-01&amp;to=2026-10-31</code><span class="faint">{ from, to, plans: […] } — 하루 계획만, 62일까지</span></li>
      </ul>
      ${snip("예제 · 바깥 사이트에서 fetch", exFetch(base, null))}
      <p class="faint mcp-note">헤더는 <code>Authorization: Bearer 키</code>. 키가 없거나 지워졌으면 401, 너무 자주 부르면 429 예요. 이 키로는 앱의 다른 기능은 못 써요.</p>`;
    bindCopy();
    body.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`'${b.dataset.label}' 키를 지울까요? 이 키를 쓰는 사이트는 바로 못 불러요.`)) return;
      try { await api.apiKeyRevoke(b.dataset.revoke); if (fresh?.key.id === b.dataset.revoke) fresh = null; await load(); toast("지웠어요."); } catch (e) { toast(e.message, "err"); }
    }));
    body.querySelector("#apip-new").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = e.currentTarget.name.value.trim(); if (!name) return;
      try { fresh = await api.apiKeyCreate(name); await load(); } catch (err) { toast(err.message, "err"); }
    });
  }
  async function load() {
    try { info = await api.apiKeys(); if (tab === "keys") drawKeys(); }
    catch (e) { if (tab === "keys") body.innerHTML = `<p class="pw-err">${esc(e.message || "불러오지 못했어요.")}</p>`; }
  }
  function draw() {
    back.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    if (tab === "keys") { drawKeys(); if (!info) load(); } else drawPage();
  }
  draw();
  void ctx;
}

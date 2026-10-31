// Psychology — 설득 · 수사학 Dock 앱 (잠금 기능 "psy")
//   #/psy 지도(분야 7칸 · 점 = 카드) · #/psy/t/<분야> 카드 목록 · #/psy/c/<카드> LEARN(1 몰랐어 · 2 헷갈려 · 3 알아)
//   #/psy/today 오늘 세션(복습 → 새 3장 → 퀴즈 6 → 말싸움 제안) · #/psy/quiz 섞어서 퀴즈 · #/psy/spar[/<상황>] AI 말싸움
//   #/psy/v[/<영상>] 영상 · #/psy/library[/<책>] 서재 · "/" 찾기
//   내용은 psy/data.js(public/psy/*.json) · 기록은 psy/store.js(사람별 서버 저장) · 모양은 css/psy.css
import { load, data } from "../psy/data.js";
import { ready } from "../psy/store.js";
import * as S from "../psy/screens.js";
import { esc, toast } from "../util.js";

const viewOf = (r) => ({ t: "track", c: "card", today: "run", quiz: "run", spar: "spar", v: "videos", library: "library" })[r.tab] || "map";
let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  root.innerHTML = `<div class="ps">
    <header class="ps-top ps-mono">
      <a class="ps-brand" href="#/psy">PSYCHOLOGY</a>
      <span class="ps-crumb" id="ps-crumb"></span>
      <span class="ps-grow"></span>
      <span class="ps-stats" id="ps-stats" aria-live="polite"></span>
      <span class="ps-right" id="ps-right"></span>
      <button type="button" class="ps-hbtn" id="ps-findbtn">/ 찾기</button>
      <a class="ps-go" id="ps-go" href="#/psy/today"></a>
    </header>
    <div class="ps-prog" aria-hidden="true"><i id="ps-prog"></i></div>
    <div class="ps-body" id="ps-body"><p class="ps-wait">불러오는 중…</p></div>
    <div class="ps-find" id="ps-find" hidden><div class="ps-find-box" role="dialog" aria-label="카드 찾기">
      <label><span class="ps-vh">카드 찾기</span><input type="search" id="ps-q" placeholder="기법 이름 · 영어 · 한 줄 설명" autocomplete="off" spellcheck="false"></label>
      <ol id="ps-res"></ol></div></div>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const body = $("#ps-body"), line = $("#ps-prog"), find = $("#ps-find"), q = $("#ps-q"), res = $("#ps-res");
  let stop = null, cur = r, gen = 0, keyFn = null, sel = 0;
  const env = {
    me: ctx.me,
    crumb: (html) => { $("#ps-crumb").innerHTML = html || "/ MAP"; },
    right: (t) => { $("#ps-right").textContent = t || ""; },
    line: (k) => { line.style.transform = `scaleX(${Math.max(0, Math.min(1, k || 0))})`; },
    keys: (fn) => { keyFn = fn; return () => { if (keyFn === fn) keyFn = null; }; },
    top: () => (root.closest(".main") || document.scrollingElement)?.scrollTo?.({ top: 0 }),
    toast: (m) => toast(m, "err"),
    remount: () => show(cur, true),
  };
  function stats() {
    if (!data()) return;
    const c = S.counts(), n = S.todayCount();
    $("#ps-stats").innerHTML = `CARDS <b>${c.cards}</b> · KNOWN <b>${String(c.known).padStart(3, "0")}</b> · DUE <b class="ps-acc">${c.due.length}</b>`;
    const go = $("#ps-go");
    go.textContent = n ? `오늘 ${n}장 시작 →` : "퀴즈 →";
    go.href = n ? "#/psy/today" : "#/psy/quiz/new";
  }
  async function show(nr, force = false) {
    cur = nr;
    const v = viewOf(nr), g = ++gen;
    try { await Promise.all([load(), ready(ctx.me)]); }
    catch (e) { if (g === gen) body.innerHTML = `<p class="ps-wait">${esc(e.message || "불러오지 못했어요.")}</p>`; return; }
    if (g !== gen || !root.isConnected) return;
    stop?.(); stop = null; keyFn = null;
    root.querySelector(".ps").dataset.v = v;
    env.crumb(); env.right(""); env.line(0);
    const host = document.createElement("div");
    host.className = "ps-v ps-v-" + v;
    body.replaceChildren(host);
    stats();
    stop = S[v](host, nr, env) || null;
    if (!force || v !== "spar") env.top();
  }
  // ── 찾기 ──
  const results = () => {
    const t = q.value.trim().toLowerCase(), D = data();
    const hits = !t ? [] : D.cards.filter((c) => [c.ko, c.en, c.line, c.id].some((x) => String(x || "").toLowerCase().includes(t))).slice(0, 30);
    sel = Math.min(sel, Math.max(0, hits.length - 1));
    res.innerHTML = hits.map((c, i) => `<li><a href="#/psy/c/${esc(c.id)}"${i === sel ? ' aria-current="true"' : ""}><b>${esc(c.ko)}</b><span class="ps-k">${esc(c.en)}</span></a></li>`).join("") || (t ? `<li class="ps-sub">없어요</li>` : "");
  };
  const openFind = () => { if (!data()) return; find.hidden = false; q.value = ""; sel = 0; results(); q.focus(); };
  const closeFind = () => { find.hidden = true; };
  const onClick = (e) => {
    if (e.target.closest("#ps-findbtn")) { openFind(); return; }
    if (e.target === find || e.target.closest("#ps-res a")) closeFind();
  };
  const onKey = (e) => {
    if (!find.hidden) {
      if (e.key === "Escape") { e.preventDefault(); closeFind(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel + (e.key === "ArrowDown" ? 1 : -1)); results(); }
      else if (e.key === "Enter") { const a = res.querySelector('[aria-current="true"]'); if (a) { e.preventDefault(); closeFind(); location.hash = a.getAttribute("href"); } }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === "/") { e.preventDefault(); openFind(); return; }
    keyFn?.(e);
  };
  q.addEventListener("input", () => { sel = 0; results(); });
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  window.addEventListener("psy:state", stats);
  inst = { update: (nr) => { closeFind(); show(nr); } };
  show(r);
  return () => {
    gen++; stop?.(); stop = null; inst = null;
    root.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); window.removeEventListener("psy:state", stats);
  };
}

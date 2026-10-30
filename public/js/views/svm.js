// Silicon Valley Mafia — 관리자(HSK · GYK)만 보는 Curtis Yarvin 글 · 사상 모음 (Dock 앱)
//   2026-10-30 v3 "하이테크 책": #/svm 서재(책장 4권 · 무엇이 궁금하세요? · 개념 × 장) · #/svm/v/<묶음> 그 권의 차례
//   #/svm/read/<글>[/sum | orig | brief] 글 읽기 · #/svm/people[/<인물>] 인물 지도 · #/svm/glossary[/<개념>] · videos · more · counter 부록
//   옛 주소: #/svm/s/<묶음 | p:인물 | unread> · #/svm/graph[/p:인물] → 새 주소로
//   어둡게가 기본, 머리줄 [DAY] 로 밝게 (이 앱에서만 · localStorage svm-day) — 앱 테마와 따로예요
//   내용은 서버(/api/svm/data, 관리자만)에서 · 기록은 svm/store.js · 모양은 css/svm.css
import { load, data } from "../svm/model.js";
import { ready, st } from "../svm/store.js";
import { mountShelf } from "../svm/shelf.js";
import { mountVolume } from "../svm/volume.js";
import { mountReader } from "../svm/reader.js";
import { mountPeople } from "../svm/graph.js";
import { mountAppendix } from "../svm/appendix.js";
import { esc } from "../util.js";

const APX = ["glossary", "videos", "more", "counter"];
const viewOf = (r) => (r.tab === "read" && r.id ? "read" : r.tab === "v" && r.id ? "vol" : r.tab === "people" ? "people" : APX.includes(r.tab) ? "apx" : "shelf");
const MOUNT = { shelf: mountShelf, vol: mountVolume, read: mountReader, people: mountPeople, apx: mountAppendix };
// 옛 주소 → 새 주소 (없으면 null)
function redirect(r) {
  if (r.tab === "graph") return r.id?.startsWith("p:") ? "#/svm/people/" + r.id.slice(2) : "#/svm/people";
  if (r.tab === "s") return r.id?.startsWith("p:") ? "#/svm/people/" + r.id.slice(2) : ["intro", "core", "gray", "lineage"].includes(r.id) ? "#/svm/v/" + r.id : "#/svm";
  return null;
}
const DAY = "svm-day";
const isDay = () => { try { return localStorage.getItem(DAY) === "1"; } catch { return false; } };

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  root.innerHTML = `<div class="sv"${isDay() ? " data-day" : ""}>
    <header class="sv-top">
      <a class="sv-brand" href="#/svm">Silicon Valley Mafia</a>
      <span class="sv-crumb sv-mono" id="sv-crumb"></span>
      <span class="sv-grow"></span>
      <span class="sv-stats sv-mono" id="sv-stats" aria-live="polite"></span>
      <label class="sv-find" id="sv-findbox"><span class="sv-vh">걸러 보기</span><input type="search" id="sv-q" placeholder="걸러 보기" autocomplete="off" spellcheck="false"><kbd class="sv-mono" aria-hidden="true">/</kbd></label>
      <button type="button" class="sv-hbtn sv-mono sv-wide" id="sv-findbtn">/ 찾기</button>
      <button type="button" class="sv-hbtn sv-mono" id="sv-day" aria-pressed="${isDay()}">${isDay() ? "NIGHT" : "DAY"}</button>
    </header>
    <div class="sv-line" aria-hidden="true"><i id="sv-line"></i></div>
    <div class="sv-body" id="sv-body"><p class="sv-wait">불러오는 중…</p></div>
  </div>`;
  const sv = root.querySelector(".sv"), body = root.querySelector("#sv-body"), q = root.querySelector("#sv-q"), line = root.querySelector("#sv-line");
  let view = null, vname = null, cur = r, gen = 0, wantFocus = false;
  const env = {
    me: ctx.me,
    crumb: (html) => { root.querySelector("#sv-crumb").innerHTML = html || `<a href="#/svm">/ LIBRARY</a>`; },
    line: (k) => { line.style.transform = `scaleX(${Math.max(0, Math.min(1, k || 0))})`; },
    stats,
    q: () => q.value.trim().toLowerCase(),
    scroller: () => root.closest(".main") || document.scrollingElement,
  };
  // CH 15 · READ 03 · LEFT 62MIN
  function stats() {
    const D = data(), S = st();
    if (!D) return;
    const read = D.essays.filter((e) => S?.read?.[e.id]).length, left = D.essays.filter((e) => !S?.read?.[e.id]).reduce((n, e) => n + e.mins, 0);
    root.querySelector("#sv-stats").innerHTML = `<span>CH <b>${D.essays.length}</b></span><span>READ <b>${String(read).padStart(2, "0")}</b></span><span class="sv-wide">LEFT <b>${left}</b>MIN</span>`;
  }

  async function show(nr, force = false) {
    const to = redirect(nr);
    if (to) { location.replace(to); return; }
    cur = nr;
    const v = viewOf(nr), g = ++gen;
    sv.dataset.v = v;
    try { await Promise.all([load(), ready(ctx.me)]); }
    catch (e) { if (g === gen) body.innerHTML = `<p class="sv-wait">${esc(e.status === 404 ? "관리자만 볼 수 있어요." : e.message || "불러오지 못했어요.")} <button type="button" class="sv-link" data-reload>다시</button></p>`; return; }
    if (g !== gen || !root.isConnected) return;
    stats();
    if (!force && view && v === vname && view.update?.(nr)) return; // 같은 화면 안 작은 이동 (다른 권 · 다른 글 · 다른 인물)
    view?.stop?.(); view = null; vname = v;
    env.crumb(); env.line(0);
    const host = document.createElement("div");
    host.className = "sv-v sv-v-" + v;
    body.replaceChildren(host);
    view = MOUNT[v](host, nr, env) || {};
    if (!force) env.scroller()?.scrollTo?.({ top: 0 });
    if (wantFocus && v === "shelf") { wantFocus = false; requestAnimationFrame(() => view.focus?.()); }
  }
  // 찾기: 서재는 QUERY 칸 · 부록은 머리줄 걸러 보기 · 그 밖은 서재로 가서 QUERY
  const find = () => { if (vname === "shelf") view.focus?.(); else if (vname === "apx") q.focus(); else { wantFocus = true; location.hash = "#/svm"; } };
  const onClick = (e) => {
    if (e.target.closest("[data-reload]")) location.reload();
    if (e.target.closest("#sv-findbtn")) find();
    if (e.target.closest("#sv-day")) {
      const day = !sv.hasAttribute("data-day");
      try { localStorage.setItem(DAY, day ? "1" : "0"); } catch {}
      sv.toggleAttribute("data-day", day);
      const b = root.querySelector("#sv-day"); b.textContent = day ? "NIGHT" : "DAY"; b.setAttribute("aria-pressed", String(day));
      if (vname === "people") show(cur, true); // 캔버스 색은 그릴 때 읽어요
    }
  };
  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === "/") { e.preventDefault(); find(); }
  };
  const onFilter = () => { if (vname === "apx") view?.find?.(); };
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  q.addEventListener("input", onFilter);
  window.addEventListener("svm:read", stats);
  inst = { update: (nr) => show(nr) };
  show(r);
  return () => {
    gen++; view?.stop?.(); view = null; inst = null;
    root.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); window.removeEventListener("svm:read", stats);
  };
}

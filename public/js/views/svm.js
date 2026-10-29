// Silicon Valley Mafia — 관리자(HSK · GYK)만 보는 Curtis Yarvin 글 · 사상 모음 (Dock 앱 · 2026-10-30 승인 시안)
//   #/svm 서재 · #/svm/s/<묶음 | p:인물 | unread> 걸러 보기 · #/svm/more 더 읽을 거리 · #/svm/videos 영상 · #/svm/glossary[/<개념>] 개념 사전
//   #/svm/read/<글>[/sum | orig | brief] 글 읽기 (요약 + 인용 · 원문 + 번역 · 요약만) · #/svm/graph[/<점 id> | people] 지식그래프
//   내용은 서버(/api/svm/data, 관리자만)에서 · 기록은 svm/store.js · 밝게/어둡게는 앱 테마를 따라요 (css/svm.css)
import { load, data } from "../svm/model.js";
import { ready, st } from "../svm/store.js";
import { mountLibrary } from "../svm/library.js";
import { mountReader } from "../svm/reader.js";
import { mountGraphView } from "../svm/graph.js";
import { esc } from "../util.js";

const viewOf = (r) => (r.tab === "read" && r.id ? "read" : r.tab === "graph" ? "graph" : "lib");
const MOUNT = { lib: mountLibrary, read: mountReader, graph: mountGraphView };

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  root.innerHTML = `<div class="sv">
    <header class="sv-top">
      <a class="sv-brand" href="#/svm">Silicon Valley Mafia</a>
      <span class="sv-crumb" id="sv-crumb"><a href="#/svm">/ YARVIN</a></span>
      <span class="sv-chip sv-mono sv-wide">ADMIN · HSK GYK</span>
      <nav class="sv-switch" aria-label="보기"><a href="#/svm" data-sw="lib">목록</a><a href="#/svm/graph" data-sw="graph">그래프</a></nav>
      <span class="sv-grow"></span>
      <span class="sv-stats sv-mono" id="sv-stats" aria-live="polite"></span>
      <label class="sv-find" id="sv-find"><span class="sv-vh">글 찾기</span><input type="search" id="sv-q" placeholder="찾기" autocomplete="off" spellcheck="false"><kbd class="sv-mono" aria-hidden="true">/</kbd></label>
    </header>
    <div class="sv-line" aria-hidden="true"><i id="sv-line"></i></div>
    <div class="sv-body" id="sv-body"><p class="sv-wait">불러오는 중…</p></div>
  </div>`;
  const sv = root.querySelector(".sv"), body = root.querySelector("#sv-body"), q = root.querySelector("#sv-q"), line = root.querySelector("#sv-line");
  let view = null, vname = null, gen = 0;
  const env = {
    me: ctx.me,
    crumb: (html) => { root.querySelector("#sv-crumb").innerHTML = html || `<a href="#/svm">/ YARVIN</a>`; },
    line: (k) => { line.style.transform = `scaleX(${Math.max(0, Math.min(1, k || 0))})`; },
    stats,
    q: () => q.value.trim().toLowerCase(),
    scroller: () => root.closest(".main") || document.scrollingElement,
  };
  // 글 15 · 읽음 03 · 영상 08 · 남은 요약 94분
  function stats() {
    const D = data(), S = st();
    if (!D) return;
    const read = D.essays.filter((e) => S?.read?.[e.id]).length, left = D.essays.filter((e) => !S?.read?.[e.id]).reduce((n, e) => n + e.mins, 0);
    root.querySelector("#sv-stats").innerHTML = `<span>글 <b>${D.essays.length}</b></span><span>읽음 <b>${String(read).padStart(2, "0")}</b></span><span class="sv-wide">영상 <b>${String(D.videos.length).padStart(2, "0")}</b></span><span class="sv-wide">남은 요약 <b>${left}</b>분</span>`;
  }

  async function show(nr) {
    const v = viewOf(nr), g = ++gen;
    sv.dataset.v = v;
    root.querySelectorAll("[data-sw]").forEach((a) => (a.dataset.sw === (v === "graph" ? "graph" : "lib") ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    try { await Promise.all([load(), ready(ctx.me)]); }
    catch (e) { if (g === gen) body.innerHTML = `<p class="sv-wait">${esc(e.status === 404 ? "관리자만 볼 수 있어요." : e.message || "불러오지 못했어요.")} <button type="button" class="sv-link" data-reload>다시</button></p>`; return; }
    if (g !== gen || !root.isConnected) return;
    stats();
    if (view && v === vname && view.update?.(nr)) return; // 같은 화면 안 작은 이동 (걸러 보기 · 다른 글 · 다른 점)
    view?.stop?.(); view = null; vname = v;
    env.crumb(); env.line(0);
    const host = document.createElement("div");
    host.className = "sv-v sv-v-" + v;
    body.replaceChildren(host);
    view = MOUNT[v](host, nr, env) || {};
    env.scroller()?.scrollTo?.({ top: 0 });
  }
  const onClick = (e) => { if (e.target.closest("[data-reload]")) location.reload(); };
  // '/' = 찾기 칸 · 찾기는 목록 화면이 걸러요
  const onKey = (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
    if (vname !== "lib") return;
    e.preventDefault(); q.focus();
  };
  const onFind = () => { if (vname === "lib") view?.find?.(env.q()); else if (q.value) location.hash = "#/svm"; };
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  q.addEventListener("input", onFind);
  window.addEventListener("svm:read", stats);
  inst = { update: (nr) => show(nr) };
  show(r);
  return () => {
    gen++; view?.stop?.(); view = null; inst = null;
    root.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); window.removeEventListener("svm:read", stats);
  };
}

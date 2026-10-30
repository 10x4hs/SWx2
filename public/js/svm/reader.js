// 글 읽기(승인 시안 B) — 왼쪽: 이 글 목차 · META / 가운데: 글 / 오른쪽: 개념 · 연결된 글
//   읽는 방식 셋 (1 · 2 · 3): 요약 + 인용(sum) · 원문 + 번역(orig) · 요약만(brief) — 고른 방식은 기록에 남아 다음 글에도
//   원문 + 번역: 서버가 원문 사이트에서 그때그때 읽은 단락(/api/svm/source) → 보이는 곳부터 4단락씩 번역(/api/svm/translate, 첫 묶음은 2단락 · 두 묶음까지 같이)
//     번역은 이 기기에만 잠깐 둬요 (localStorage, 글 12편까지) — 서버에는 원문도 번역도 남지 않아요
//   J/K 다음 · 앞 단락 · ←/→ 다음 · 앞 글 · 읽은 곳(%)은 스크롤로, '다 읽었어요'는 직접
import { data, linkTerms, personName, pad2, volColor } from "./model.js";
import { st, setRead, setPos, setPref, isRead } from "./store.js";
import { videoCard, play } from "./appendix.js";
import { api } from "../api.js";
import { esc, toast } from "../util.js";

const MODES = [["sum", "요약 + 인용"], ["orig", "원문 + 번역"], ["brief", "요약만"]];
const host_ = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const FIRST = 2, BATCH = 4, BATCH_CHARS = 3500, LANES = 2; // 첫 묶음은 작게(빨리 보이게) · 그다음 4단락씩 · 두 묶음까지 같이 (AI 한 번에 10초 남짓이라)

// 번역 사본 (이 기기, 글 · 편마다) — 오래된 것부터 지워 12개까지
const TR = "svm-tr:", TR_MAX = 12;
function trGet(id, part) { try { return JSON.parse(localStorage.getItem(`${TR}${id}:${part}`) || "null")?.ko || {}; } catch { return {}; } }
function trPut(id, part, ko) {
  try {
    localStorage.setItem(`${TR}${id}:${part}`, JSON.stringify({ at: Date.now(), ko }));
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(TR));
    if (keys.length > TR_MAX) keys.map((k) => [k, JSON.parse(localStorage.getItem(k) || "{}").at || 0]).sort((a, b) => a[1] - b[1]).slice(0, keys.length - TR_MAX).forEach(([k]) => localStorage.removeItem(k));
  } catch {}
}

export function mountReader(host, r, env) {
  const D = data();
  let e = null, mode = "sum", alive = true, src = null, part = 0, used = new Set(), io = null, lanes = 0, sGen = 0, tried = new Set(); // tried = 이번에 이미 번역을 부탁한 단락 (실패해도 저절로 다시 부르지 않게 — "다시"를 누를 때만)
  const tip = document.createElement("div");
  tip.className = "sv-tip"; tip.hidden = true; tip.setAttribute("role", "tooltip");

  function open(nr) {
    e = D.E.get(nr.id);
    if (!e) { host.innerHTML = `<p class="sv-wait">없는 글이에요. <a class="sv-link" href="#/svm">서재로</a></p>`; return; }
    const S = st();
    mode = MODES.some(([k]) => k === nr.sub) ? nr.sub : MODES.some(([k]) => k === S?.mode) ? S.mode : "sum";
    if (S && S.last !== e.id) setPref("last", e.id);
    src = null; part = 0; used = new Set();
    draw();
  }

  const order = () => D.essays, idx = () => order().indexOf(e);
  const near = (k) => order()[idx() + k] || null;
  const glossHtml = () => {
    const cs = (e.concepts || []).map((c) => D.C.get(c)).filter(Boolean);
    const rel = (e.related || []).map((id) => D.E.get(id)).filter(Boolean);
    const people = [...new Set([e.author, ...(e.people || [])])].filter((p) => p && D.P.has(p));
    return `<span class="sv-label sv-mono">GLOSSARY · 이 글의 개념</span>
      ${cs.map((c) => `<a class="sv-gi" id="sv-g-${esc(c.id)}" href="#/svm/glossary/${esc(c.id)}"><b>${esc(c.name)} <span class="sv-mono">${esc(c.en || "")}</span></b><span>${esc(c.short || "")}</span></a>`).join("") || `<p class="sv-cap">—</p>`}
      ${rel.length ? `<div class="sv-gi"><b>연결된 장</b>${rel.map((x) => `<a class="sv-mono" href="#/svm/read/${esc(x.id)}">→ CH ${pad2(x.no)} ${esc((x.ko || x.title).length > 20 ? (x.ko || x.title).slice(0, 19) + "…" : x.ko || x.title)}</a>`).join("")}</div>` : ""}
      ${people.length ? `<div class="sv-gi"><b>이 글의 인물</b>${people.map((p) => `<a class="sv-mono" href="#/svm/people/${esc(p)}">→ ${esc(personName(p))}</a>`).join("")}</div>` : ""}`;
  };
  const tocItems = () => mode === "orig" ? [["src", "원문"]] : mode === "brief" ? [["core", "한 줄 핵심"], ["claims", "주요 논지"]]
    : [["core", "한 줄 핵심"], ["claims", "주요 논지"], ...(e.quotes?.length ? [["quotes", "원문 인용"]] : []), ...(e.sv?.text ? [["sv", "실리콘밸리 연결"]] : []), ...(e.critiques?.length ? [["counter", "주요 비판"]] : []), ...(e.vids.length ? [["video", `영상 ${e.vids.length}`]] : [])];

  function bodyHtml() {
    used = new Set();
    const claims = `<section class="sv-sec" id="sv-claims" data-k><h2 class="sv-h sv-mono">CLAIMS · 주요 논지</h2>${(e.claims || []).map((c, i) => `<div class="sv-claim" data-k><span class="sv-mono">C${i + 1}</span><p>${linkTerms(c, used)}</p></div>`).join("")}${e.note ? `<p class="sv-enote">※ ${esc(e.note)}</p>` : ""}</section>`;
    if (mode === "brief") return claims;
    if (mode === "orig") return `<section class="sv-sec" id="sv-src" data-k>
        ${(e.sources || []).length > 1 ? `<div class="sv-parts" role="group" aria-label="편">${e.sources.map((s, i) => `<button type="button" class="sv-mono" data-part="${i}" aria-pressed="${i === part}" title="${esc(s.label || "")}">${pad2(i + 1)}</button>`).join("")}</div>` : ""}
        <div id="sv-orig"><p class="sv-wait">원문을 불러오는 중…</p></div></section>`;
    const S = st();
    return claims
      + (e.quotes?.length ? `<section class="sv-sec" id="sv-quotes" data-k><h2 class="sv-h sv-mono">QUOTES · 원문 인용</h2>${e.quotes.map((x, i) => `<figure class="sv-quote" data-k><span class="sv-mono">Q${i + 1}</span><div><blockquote lang="en">“${esc(x.en)}”</blockquote><figcaption>${esc(x.ko || "")}${x.where ? ` <span class="sv-mono">${esc(x.where)}</span>` : ""}${x.url ? ` <a class="sv-mono" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">¶ 원문 위치 ↗</a>` : ""}</figcaption></div></figure>`).join("")}</section>` : "")
      + (e.sv?.text ? `<section class="sv-sec sv-svbox" id="sv-sv" data-k><h2 class="sv-h sv-mono">SV LINK · 왜 실리콘밸리가 읽나</h2>
          ${(e.people || []).length ? `<div class="sv-chips">${e.people.map((p) => `<a class="sv-pchip" href="#/svm/people/${esc(p)}">${esc(personName(p))}</a>`).join("")}</div>` : ""}
          <p>${linkTerms(e.sv.text, used)}</p>${(e.sv.refs || []).length ? `<p class="sv-refs sv-mono">${e.sv.refs.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.label || host_(x.url))} ↗</a>`).join(" · ")}</p>` : ""}</section>` : "")
      + (e.critiques?.length ? `<details class="sv-sec sv-counter" id="sv-counter" data-k${S?.crit === 0 ? "" : " open"}><summary class="sv-h sv-mono">COUNTER · 주요 비판 <span>(${S?.crit === 0 ? "펼치기" : "접기"})</span></summary>
          ${e.critiques.map((c) => `<div class="sv-crit"><p>${linkTerms(c.text, used)}</p><p class="sv-refs sv-mono">${esc(c.by || "")}${c.url ? ` · <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.label || host_(c.url))} ↗</a>` : c.label ? ` · ${esc(c.label)}` : ""}</p></div>`).join("")}</details>` : "")
      + (e.vids.length ? `<section class="sv-sec" id="sv-video" data-k><h2 class="sv-h sv-mono">VIDEO · 관련 영상</h2><div class="sv-vgrid two">${e.vids.map(videoCard).join("")}</div></section>` : "");
  }

  function draw() {
    io?.disconnect(); io = null; sGen++; // 방식 · 글이 바뀌면 원문 + 번역의 지켜보기 · 남은 번역 답은 버려요
    const prev = near(-1), next = near(1);
    const sec = D.sections.find((s) => s.id === e.section);
    env.crumb(`<a href="#/svm">/ LIBRARY</a> <a class="sv-wide" href="#/svm/v/${esc(e.section)}" style="color:${volColor(e.section)}">/ VOL.${esc(sec?.no || "")} ${esc(sec?.name || "")}</a> <span>/ CH ${pad2(e.no)}</span>`);
    host.innerHTML = `<div class="sv-read" data-mode="${mode}">
      <aside class="sv-toc" aria-label="이 글 안에서">
        <span class="sv-label sv-mono">ON THIS PAGE</span>
        <nav class="sv-tocl">${tocItems().map(([k, l]) => `<a href="#sv-${k}" data-to="sv-${k}">${esc(l)}</a>`).join("")}</nav>
        <div class="sv-meta sv-mono"><span class="sv-label">META</span><span>SRC  ${esc(e.venue || "")}</span><span>YEAR ${esc(e.year || "")}</span><span>BY   ${esc(personName(e.author))}</span>${e.words ? `<span>LEN  원문 ${Number(e.words).toLocaleString("ko-KR")}단어</span>` : ""}<span>SUM  ${pad2(e.mins)}m</span></div>
      </aside>
      <article class="sv-art" id="sv-art">
        <header class="sv-ahead" id="sv-core" data-k style="--vc:${volColor(e.section)}">
          <span class="sv-chno sv-mono"><b>CH ${pad2(e.no)}</b> · VOL.${esc(sec?.no || "")} ${esc(sec?.name || "")}</span>
          <div class="sv-tags">${(e.concepts || []).map((c, i) => `<a class="sv-tag sv-mono${i ? "" : " on"}" href="#/svm/glossary/${esc(c)}">${esc(D.C.get(c)?.en || c.toUpperCase())}</a>`).join("")}</div>
          <h1>${esc(e.title)}</h1>
          ${e.ko ? `<p class="sv-ko">${esc(e.ko)}</p>` : ""}
          <p class="sv-core">${linkTerms(e.core || "", used)}</p>
        </header>
        <div class="sv-modes" role="tablist" aria-label="읽는 방식">${MODES.map(([k, l], i) => `<button type="button" role="tab" data-mode="${k}" aria-selected="${k === mode}">${l} <span class="sv-mono">${i + 1}</span></button>`).join("")}</div>
        <div class="sv-mbody" id="sv-mbody">${bodyHtml()}</div>
        <footer class="sv-afoot">
          <button type="button" class="sv-done" data-done aria-pressed="${isRead(e.id)}">${isRead(e.id) ? "읽었어요 ✓ · 취소" : "다 읽었어요 ✓"}</button>
          ${e.sources?.[0]?.url ? `<a class="sv-mono" href="${esc(e.sources[part]?.url || e.sources[0].url)}" target="_blank" rel="noopener noreferrer" data-srclink>SOURCE ↗</a>` : ""}
          <span class="sv-grow"></span>
          ${prev ? `<a class="sv-mono sv-prev sv-wide" href="#/svm/read/${esc(prev.id)}">← CH ${pad2(prev.no)}</a>` : ""}
          ${next ? `<a class="sv-next" href="#/svm/read/${esc(next.id)}"><span class="sv-mono">CH ${pad2(next.no)}</span> ${esc((next.ko || next.title).length > 24 ? (next.ko || next.title).slice(0, 23) + "…" : next.ko || next.title)} →</a>` : `<a class="sv-next" href="#/svm">LIBRARY →</a>`}
        </footer>
      </article>
      <aside class="sv-gloss" aria-label="개념">${glossHtml()}</aside>
    </div>`;
    host.appendChild(tip);
    if (mode === "orig") loadSource();
    track();
  }

  // ---------- 원문 + 번역 ----------
  async function loadSource() {
    const g = ++sGen, box = host.querySelector("#sv-orig");
    io?.disconnect(); io = null; tried = new Set();
    if (!e.sources?.length) { box.innerHTML = `<p class="sv-wait">이 글은 원문 주소가 없어요.</p>`; return; }
    box.innerHTML = `<p class="sv-wait">원문을 불러오는 중…</p>`;
    try { src = await api.svmSource(e.id, part); }
    catch (err) { if (g === sGen && alive) box.innerHTML = `<p class="sv-wait">${esc(err.message || "원문을 못 불러왔어요.")} <button type="button" class="sv-link" data-retry>다시</button> <a class="sv-link" href="${esc(e.sources[part]?.url || "")}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a></p>`; return; }
    if (g !== sGen || !alive) return;
    const ko = trGet(e.id, part);
    box.innerHTML = `<div class="sv-srch sv-mono"><span>${esc(src.label || "")}</span><span>${esc(host_(src.url))} · 단락 ${src.blocks.length} · <b id="sv-trc">번역 ${Object.keys(ko).length}/${src.blocks.length}</b></span><a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a></div>
      ${src.partial ? `<p class="sv-note">유료 구독 글이라 앞부분만 공개돼 있어요. 나머지는 '원문 열기'로 읽어 주세요.</p>` : ""}
      <div class="sv-paras">${src.blocks.map((b, i) => `<div class="sv-para" data-i="${i}" data-kind="${esc(b.k)}"${b.k === "h" ? " data-k" : ""}><p class="sv-en" lang="en">${esc(b.t)}</p><p class="sv-kr" data-ko="${i}">${ko[i] ? esc(ko[i]) : `<span class="sv-pend">번역 대기</span>`}</p></div>`).join("")}</div>`;
    const link = host.querySelector("[data-srclink]"); if (link) link.href = src.url;
    io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) translateNext(); }, { rootMargin: "600px 0px" });
    box.querySelectorAll(".sv-para").forEach((el) => io.observe(el));
  }
  // 보이는 곳부터: 아직 번역 안 된 단락 4개(3,500자까지)씩, 첫 묶음은 2개 · 두 묶음까지 같이
  async function translateNext() {
    if (lanes >= LANES || !src || !alive) return;
    const ko = trGet(e.id, part), box = host.querySelector("#sv-orig");
    if (!box || mode !== "orig") return;
    const view = env.scroller(), top = view?.getBoundingClientRect?.().top || 0, h = innerHeight;
    const els = [...box.querySelectorAll(".sv-para")];
    const todo = (i) => !ko[i] && !tried.has(i);
    const first = els.findIndex((el, i) => todo(i) && el.getBoundingClientRect().bottom > top - 600 && el.getBoundingClientRect().top < h + 600);
    if (first < 0) return;
    const ids = []; let n = 0;
    const size = Object.keys(ko).length || tried.size ? BATCH : FIRST;
    for (let i = first; i < src.blocks.length && ids.length < size; i++) { if (!todo(i)) continue; const t = src.blocks[i].t; if (n + t.length > BATCH_CHARS && ids.length) break; ids.push(i); n += Math.min(t.length, 3000); }
    if (!ids.length) return;
    lanes++; ids.forEach((i) => tried.add(i));
    const g = sGen, p = part;
    if (size === BATCH) queueMicrotask(translateNext); // 다음 묶음도 바로 (두 갈래까지)
    ids.forEach((i) => { const el = box.querySelector(`[data-ko="${i}"]`); if (el) el.innerHTML = `<span class="sv-pend">번역 중…</span>`; });
    try {
      const r = await api.svmTranslate(e.id, ids.map((i) => src.blocks[i].t.slice(0, 3000)));
      if (g !== sGen || !alive) return;
      const cur = trGet(e.id, p);
      ids.forEach((i, j) => { if (r.ko?.[j]) cur[i] = r.ko[j]; const el = box.querySelector(`[data-ko="${i}"]`); if (el) el.innerHTML = r.ko?.[j] ? esc(r.ko[j]) : `<button type="button" class="sv-link" data-tr-again>번역 못 했어요 · 다시</button>`; });
      trPut(e.id, p, cur);
      const c = host.querySelector("#sv-trc"); if (c) c.textContent = `번역 ${Object.keys(cur).length}/${src.blocks.length}`;
    } catch (err) {
      ids.forEach((i) => { const el = box.querySelector(`[data-ko="${i}"]`); if (el) el.innerHTML = `<button type="button" class="sv-link" data-tr-again>${esc(err.status === 429 ? "오늘 AI 를 다 썼어요" : "번역 못 했어요 · 다시")}</button>`; });
      if (err.status === 429) toast(err.message, "err");
      return;
    } finally { lanes = Math.max(0, lanes - 1); }
    if (alive && g === sGen) setTimeout(translateNext, 200);
  }

  // ---------- 읽은 곳 · 윗줄 · 목차 ----------
  let raf = 0;
  function track(ev) {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!alive || !e) return;
      const art = host.querySelector("#sv-art"); if (!art) return;
      const r = art.getBoundingClientRect(), k = Math.max(0, Math.min(1, (innerHeight - r.top) / Math.max(1, r.height)));
      env.line(k);
      if (ev && mode === "sum") setPos(e.id, k * 100); // 읽은 곳은 '요약 + 인용'을 실제로 내려 읽을 때만 (짧은 화면은 열자마자 끝까지 보여서)
      const secs = [...host.querySelectorAll(".sv-mbody > [id], #sv-core")];
      let on = secs[0]?.id;
      for (const s of secs) if (s.getBoundingClientRect().top < innerHeight * 0.35) on = s.id;
      host.querySelectorAll("[data-to]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.to === on));
    });
  }
  const sc = env.scroller(); sc?.addEventListener("scroll", track, { passive: true });

  // ---------- 누르기 · 키 ----------
  const go = (m) => { if (m === mode) return; mode = m; setPref("mode", m); history.replaceState(history.state, "", `#/svm/read/${e.id}/${m}`); draw(); };
  const onClick = (ev) => {
    const t = ev.target;
    const mb = t.closest("[data-mode]"); if (mb && mb.closest(".sv-modes")) return go(mb.dataset.mode);
    if (t.closest("[data-done]")) { const on = !isRead(e.id); setRead(e.id, on); window.dispatchEvent(new CustomEvent("svm:read")); const b = t.closest("[data-done]"); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "읽었어요 ✓ · 취소" : "다 읽었어요 ✓"; if (on) toast("다 읽은 글로 표시했어요."); return; }
    const pb = t.closest("[data-part]"); if (pb) { part = Number(pb.dataset.part); host.querySelectorAll("[data-part]").forEach((b) => b.setAttribute("aria-pressed", String(b === pb))); loadSource(); return; }
    if (t.closest("[data-retry]")) return loadSource();
    if (t.closest("[data-tr-again]")) { const ko = trGet(e.id, part); tried = new Set([...tried].filter((i) => ko[i])); translateNext(); return; }
    const pl = t.closest("[data-play]"); if (pl) return play(pl);
    const to = t.closest("[data-to]"); if (to) { ev.preventDefault(); host.querySelector("#" + to.dataset.to)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const term = t.closest(".sv-term"); if (term) { showTip(term); host.querySelector(`#sv-g-${CSS.escape(term.dataset.c)}`)?.classList.add("on"); }
  };
  const onToggle = (ev) => { if (ev.target.id === "sv-counter") { setPref("crit", ev.target.open ? 1 : 0); const s = ev.target.querySelector("summary span"); if (s) s.textContent = ev.target.open ? "(접기)" : "(펼치기)"; } };
  function showTip(el) {
    const c = D.C.get(el.dataset.c); if (!c) return;
    tip.innerHTML = `<b>${esc(c.name)} <span class="sv-mono">${esc(c.en || "")}</span></b><span>${esc(c.short || "")}</span>`;
    tip.hidden = false;
    const r = el.getBoundingClientRect(), hr = host.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(hr.width - 288, r.left - hr.left)) + "px";
    tip.style.top = r.bottom - hr.top + 8 + "px";
  }
  const onOver = (ev) => { const term = ev.target.closest?.(".sv-term"); if (term) showTip(term); else if (!ev.target.closest?.(".sv-tip")) tip.hidden = true; };
  const onFocus = (ev) => { const term = ev.target.closest?.(".sv-term"); if (term) showTip(term); };
  const onKey = (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.target?.closest?.("input, textarea, select, [contenteditable]")) return;
    const k = ev.key;
    if (k === "1" || k === "2" || k === "3") { go(MODES[Number(k) - 1][0]); return; }
    if (k === "ArrowRight" || k === "ArrowLeft") { const x = near(k === "ArrowRight" ? 1 : -1); if (x) location.hash = `#/svm/read/${x.id}`; return; }
    if (k === "j" || k === "k") {
      const marks = [...host.querySelectorAll("[data-k]")], y = innerHeight * 0.18;
      const tops = marks.map((m) => m.getBoundingClientRect().top);
      const i = k === "j" ? tops.findIndex((t) => t > y + 4) : tops.map((t, j) => [t, j]).filter(([t]) => t < y - 4).pop()?.[1] ?? -1;
      if (i >= 0) marks[i].scrollIntoView({ behavior: "smooth", block: "start" });
      if (k === "j" && mode === "orig") translateNext();
      return;
    }
    if (k === "Escape") tip.hidden = true;
  };
  host.addEventListener("click", onClick);
  host.addEventListener("toggle", onToggle, true);
  host.addEventListener("mouseover", onOver);
  host.addEventListener("focusin", onFocus);
  document.addEventListener("keydown", onKey);
  open(r);
  return {
    update(nr) { if (nr.id === e?.id && (nr.sub || mode) === mode) return true; open(nr); env.scroller()?.scrollTo?.({ top: 0 }); return true; },
    stop() { alive = false; sGen++; io?.disconnect(); cancelAnimationFrame(raf); sc?.removeEventListener("scroll", track); host.removeEventListener("click", onClick); host.removeEventListener("toggle", onToggle, true); host.removeEventListener("mouseover", onOver); host.removeEventListener("focusin", onFocus); document.removeEventListener("keydown", onKey); },
  };
}

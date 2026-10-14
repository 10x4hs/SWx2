// 경영 마이크로디그리 — 용어 · 헷갈리는 쌍 · 프레임워크 · 스킬 (#/mba/words[/pairs|frameworks|skills])
import { $, $$, esc } from "../util.js";
import { words, kit } from "./data.js";
import { NAV } from "./home.js";

const TABS = [["", "용어"], ["pairs", "헷갈리는 쌍"], ["frameworks", "프레임워크"], ["skills", "스킬 · 15분 연습"]];
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

export function mountWords(host, ctx, sub) {
  let alive = true, q = "", area = "";
  const tab = TABS.some(([k]) => k === (sub || "")) ? sub || "" : "";
  host.innerHTML = `<p class="mb-loading">불러오는 중…</p>`;
  (async () => {
    const [w, k] = await Promise.all([words(), kit().catch(() => ({ frameworks: [], skills: [] }))]);
    if (!alive) return;
    const terms = w.terms || [], areas = [...new Set(terms.map((t) => t.area).filter(Boolean))];
    const termHtml = () => {
      const nq = norm(q), list = terms.filter((t) => (!area || t.area === area) && (!nq || norm(t.term + t.en + t.easy + (t.related || []).join("")).includes(nq)));
      return list.length ? list.map((t) => `<li class="mb-term" id="t-${esc(norm(t.term))}"><div class="mb-term-h"><b>${esc(t.term)}</b>${t.en ? `<span class="mb-mono dim">${esc(t.en)}</span>` : ""}<span class="mb-k dim">${esc(t.area || "")}</span></div>
        <p>${esc(t.easy)}</p>${t.example ? `<p class="ex">${esc(t.example)}</p>` : ""}${t.note ? `<p class="note">${esc(t.note)}</p>` : ""}${t.check ? `<p class="note">확인 필요: ${esc(t.check === true ? "" : t.check)}</p>` : ""}
        ${t.related?.length ? `<p class="rel">${t.related.map((r) => `<button type="button" class="mb-chip sm" data-rel="${esc(r)}">${esc(r)}</button>`).join("")}</p>` : ""}</li>`).join("") : `<li class="mb-empty">‘${esc(q)}’ 와 맞는 용어가 없어요.</li>`;
    };
    const body = () => {
      if (tab === "pairs") return `<ul class="mb-pairs">${(w.pairs || []).map((p) => `<li><div class="mb-pair-h"><b>${esc(p.a)}</b><span class="mb-k dim">vs</span><b>${esc(p.b)}</b><span class="mb-k dim">${esc(p.area || "")}</span></div><p>${esc(p.diff)}</p>${p.example ? `<p class="ex">${esc(p.example)}</p>` : ""}</li>`).join("")}</ul>`;
      if (tab === "frameworks") return `<div class="mb-tw"><table class="mb-table"><thead><tr><th scope="col">프레임워크</th><th scope="col">언제 쓰나</th><th scope="col">한 문장</th><th scope="col">한계</th></tr></thead><tbody>${(k.frameworks || []).map((f) => `<tr><th scope="row"><b>${esc(f.name)}</b>${f.en ? `<span class="mb-mono dim">${esc(f.en)}</span>` : ""}</th><td>${esc(f.when)}</td><td>${esc(f.one)}</td><td class="dim">${esc(f.limit)}</td></tr>`).join("")}</tbody></table></div>`;
      if (tab === "skills") return `<ol class="mb-skills">${(k.skills || []).map((s, n) => `<li><span class="mb-mono dim">${String(n + 1).padStart(2, "0")}</span><div><b>${esc(s.name)}</b><p>${esc(s.why || "")}</p>${s.task?.length ? `<ol class="mb-task">${s.task.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : ""}${s.check ? `<p class="ex"><span class="mb-k">확인</span> ${esc(s.check)}</p>` : ""}${s.mistake ? `<p class="note"><span class="mb-k">흔한 실수</span> ${esc(s.mistake)}</p>` : ""}</div></li>`).join("")}</ol>`;
      return `<div class="mb-search"><label class="mb-k" for="mb-q">찾기</label><input id="mb-q" class="mb-in" type="search" placeholder="예: 공헌이익, EBITDA, BATNA" autocomplete="off"></div>
        <div class="mb-areas" role="group" aria-label="영역"><button type="button" class="mb-chip on" data-area="" aria-pressed="true">전체 ${terms.length}</button>${areas.map((a) => `<button type="button" class="mb-chip" data-area="${esc(a)}" aria-pressed="false">${esc(a)}</button>`).join("")}</div>
        <ul class="mb-terms" id="mb-terms">${termHtml()}</ul>`;
    };
    host.innerHTML = `<div class="mb-page mb-wordspage">
      <header class="mb-bar"><a class="mb-back" href="#/mba" aria-label="모듈 지도로"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9 2 4 7l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a><span class="mb-mono dim">GLOSSARY</span><span class="mb-k">용어 ${terms.length} · 쌍 ${(w.pairs || []).length} · 프레임워크 ${(k.frameworks || []).length} · 스킬 ${(k.skills || []).length}</span></header>
      <div class="mb-wrap">${NAV("words")}
        <h1 class="mb-h1">용어 · 프레임워크 · 스킬</h1>
        <nav class="mb-tabs" aria-label="종류">${TABS.map(([key, t]) => `<a class="${key === tab ? "on" : ""}" href="#/mba/words${key ? "/" + key : ""}"${key === tab ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
        <div id="mb-wbody">${body()}</div>
        <p class="mb-foot">정의는 교과서 · 공식 자료와 대조했지만 출처가 하나뿐인 항목도 있어요. ‘확인 필요’가 붙은 건 원문을 한 번 더 보세요.</p>
      </div></div>`;
    if (!tab) {
      const list = $("#mb-terms", host);
      $("#mb-q", host).addEventListener("input", (e) => { q = e.target.value; list.innerHTML = termHtml(); });
      host.addEventListener("click", (e) => {
        const a = e.target.closest("[data-area]");
        if (a) { area = a.dataset.area; $$("[data-area]", host).forEach((b) => { const on = b.dataset.area === area; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); list.innerHTML = termHtml(); return; }
        const r = e.target.closest("[data-rel]");
        if (r) { q = r.dataset.rel; area = ""; $("#mb-q", host).value = q; $$("[data-area]", host).forEach((b) => { const on = b.dataset.area === ""; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); list.innerHTML = termHtml(); $("#mb-q", host).scrollIntoView({ block: "center" }); }
      });
    }
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">용어를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; };
}

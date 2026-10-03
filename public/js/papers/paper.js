// 논문 공부 페이지 (#/papers/<id>)
// 한눈에 → 그림 → 핵심 아이디어 → 결과 → 우리 파이프라인 → 영상 → 용어 → [읽기 완료] → 퀴즈 → 3분 설명(AI 채점) → 한 줄 정리 → AI 튜터 → 원문
import { $, $$, esc, initial, toast, avatar } from "../util.js";
import { api } from "../api.js";
import { icon } from "../icons.js";
import { renderMarkdown } from "../md.js";
import { chatMarkup, mountChat } from "./chat.js";
import { loadTerms, annotate, mountTermCard } from "./terms.js";
import { loadIndex, loadContent, loadDeep, loadDiagram, onProgress, refreshProgress, setCheck, sendQuiz, getProgress, stageOf, stageVar, paperMeta, dayOfPaper, stepsDone, rich, paras, STEP_KEYS } from "./data.js";

const STEP_LABEL = { read: "읽기", quiz: "퀴즈", explain: "3분 설명" };
const SECTIONS = [
  ["glance", "한눈에"], ["figs", "그림"], ["idea", "핵심 아이디어"], ["results", "결과"], ["role", "우리 파이프라인"],
  ["deep", "자세히 읽기"], ["videos", "영상"], ["terms", "용어"], ["quiz", "퀴즈"], ["explain", "3분 설명"], ["notes", "한 줄 정리"], ["tutor", "AI 튜터"], ["source", "원문"],
];

export function mountPaper(root, ctx, id) {
  let alive = true, idx = null, c = null, prog = getProgress();
  let quizPicks = [], chat = [], timer = null;
  root.innerHTML = `<div class="view pp-view pp-paper"><p class="faint">자료 불러오는 중…</p></div>`;
  const view = root.firstElementChild;
  const me = () => prog?.members.find((m) => m.user_id === ctx.me.id);
  const colorOf = (uid, i) => ctx.user?.(uid)?.color || `var(--m${i % 3})`;
  const ended = () => !!prog?.ended;

  function stepPills() {
    const m = me();
    return STEP_KEYS.map((k) => {
      const on = !!m?.checks?.[id]?.[k], sc = m?.checks?.[id]?.[k + "_score"];
      return `<a class="pp-pill ${on ? "on" : ""}" href="#pp-${k === "read" ? "glance" : k}" data-jump="${k === "read" ? "glance" : k}">${on ? icon.check(13) : `<i></i>`}${STEP_LABEL[k]}${sc != null && k !== "read" ? ` <span class="num">${k === "quiz" ? sc + "/5" : sc}</span>` : ""}</a>`;
    }).join("");
  }
  function friends() {
    if (!prog) return "";
    return prog.members.map((m, i) => {
      const n = stepsDone(m, id);
      return `<span class="pp-friend" title="${esc(m.name)} · ${n}/3"><span class="av sm ${n === 3 ? "full" : n ? "part" : "none"}" style="--c:${colorOf(m.user_id, i)}">${esc(initial(m.name))}</span><span class="num faint">${n}/3</span></span>`;
    }).join("");
  }
  function paintStatus() {
    const s = $("#pp-status", view);
    if (s) s.innerHTML = `<span class="pp-pills">${stepPills()}</span><span class="pp-friends">${friends()}</span>`;
    const rd = $("#pp-read-btn", view);
    if (rd) {
      const on = !!me()?.checks?.[id]?.read;
      rd.classList.toggle("on", on);
      rd.innerHTML = on ? `${icon.check(16)} 다 읽었어요 <span class="faint">· 다시 누르면 취소</span>` : `다 읽었어요 — 읽기 체크`;
      rd.disabled = ended();
    }
    const ex = $("#pp-ex-manual", view);
    if (ex) { const on = !!me()?.checks?.[id]?.explain; ex.textContent = on ? "✓ 3분 설명 체크됨 (다시 누르면 취소)" : "AI 없이 직접 체크 — 소리 내어 3분 설명했어요"; ex.classList.toggle("on", on); ex.disabled = ended(); }
    paintNotes();
  }

  // ---------- 섹션 ----------
  const sec = (key, title, inner, extra = "") => `<section class="pp-sec ${extra}" id="pp-${key}" data-sec="${key}"><h2 class="pp-h2">${esc(title)}</h2>${inner}</section>`;

  function glance() {
    return sec("glance", "한눈에", `
      <a class="pp-easy" href="/papers/easy?p=${esc(id)}" data-easy>
        <span class="pp-easy-k">처음이라면 여기부터</span><b>쉽게 읽기 <small>중3 ~ 고1 눈높이 · 15분</small></b>
        <span class="pp-easy-d">어려운 말은 그 자리에서 풀고, 움직이는 그림으로 원리를 보여 줘요.</span><span class="pp-easy-go" aria-hidden="true">→</span></a>
      <p class="pp-lead">${rich(c.one_line)}</p>
      <div class="pp-callout analogy"><span class="pp-callout-k">쉽게 말하면</span>${paras(String(c.analogy || "").replace(/^\s*쉽게 말하면\s*[—–:,-]?\s*/, ""))}</div>
      <h3 class="pp-h3">무엇이 문제였나</h3>${paras(c.problem)}`);
  }
  function figs() {
    const f = (c.figures || []).map((x, i) => `<figure class="pp-fig"><button type="button" class="pp-fig-btn" data-zoom="${i}" aria-label="크게 보기"><img loading="lazy" src="/papers/fig/${id}/${esc(x.src)}" alt="${esc(x.caption)}"></button>
      <figcaption>${rich(x.caption)}${x.page ? ` <span class="faint">· 원문 ${x.page}쪽</span>` : ""}</figcaption></figure>`).join("");
    return sec("figs", "그림으로 보기", `
      ${c.diagram ? `<figure class="pp-fig pp-dg-wrap"><div class="pp-dg-box" id="pp-dg"><p class="faint">그림 그리는 중…</p></div><figcaption><span class="pp-tag">우리말 그림</span> ${rich(c.diagram.caption)}</figcaption></figure>` : ""}
      <div class="pp-figs">${f}</div>`);
  }
  function idea() {
    return sec("idea", "핵심 아이디어", `<ol class="pp-ideas">${(c.idea || []).map((x) => `<li><b>${rich(x.title)}</b>${paras(x.body)}</li>`).join("")}</ol>`);
  }
  function results() {
    return sec("results", "논문이 보여 준 결과", `<div class="pp-stats">${(c.results || []).map((r) => `<div class="pp-stat"><span class="pp-stat-v num">${esc(r.value)}</span><span class="pp-stat-l">${esc(r.label)}</span>${r.note ? `<span class="pp-stat-n faint">${esc(r.note)}</span>` : ""}</div>`).join("")}</div>`);
  }
  function role() {
    const st = stageOf(idx, c.stage || paperMeta(idx, id).stage);
    return sec("role", "우리 파이프라인에서", `
      <div class="pp-callout role" style="--st:${stageVar(st.color)}"><span class="pp-callout-k"><i class="pp-st-dot"></i>${st.n}번 칸 · ${esc(st.label)}</span>${paras(c.pipeline_role)}</div>
      ${(c.caveats || []).length ? `<h3 class="pp-h3">조심할 점</h3><ul class="pp-caveats">${c.caveats.map((x) => `<li>${rich(x)}</li>`).join("")}</ul>` : ""}`);
  }
  // 자세히 읽기: 원문 절마다 깊은 해설 (content/<id>.deep.json — 없으면 '준비 중')
  function deepSec() {
    return sec("deep", "자세히 읽기", `<div id="pp-deep"><p class="faint">깊은 해설 불러오는 중…</p></div>`);
  }
  function paintDeep(d) {
    const box = $("#pp-deep", view); if (!box) return;
    if (!d) { box.innerHTML = `<p class="faint">이 논문의 깊은 해설은 아직 만드는 중이에요. 조금 뒤에 새로 고침 해 보세요.</p>`; return; }
    const secs = d.sections || [];
    const li = (arr, cls = "") => (arr && arr.length ? `<ul class="${cls}">${arr.map((x) => `<li>${renderMarkdown(String(x))}</li>`).join("")}</ul>` : "");
    box.innerHTML = `
      <div class="pp-deep-top"><span class="chip">읽는 데 ${esc(d.reading_minutes || 20)}분</span><span class="faint">원문 절 순서 그대로 · 어떻게 작동하고 왜 그렇게 만들었는지</span>
        <span class="grow"></span><button type="button" class="btn ghost sm" id="pp-deep-all">모두 펼치기</button></div>
      <nav class="pp-deep-nav">${secs.map((x, i) => `<a href="#pp-deep-${esc(x.id)}" data-jump="deep-${esc(x.id)}"><span class="num">${i + 1}</span>${esc(x.title.replace(/^\d+(\.\d+)*\.?\s*/, ""))}</a>`).join("")}</nav>
      ${secs.map((x, i) => `<details class="pp-deep-sec" id="pp-deep-${esc(x.id)}" data-sec="deep-${esc(x.id)}" ${i === 0 ? "open" : ""}>
        <summary><span class="pp-deep-n num">${i + 1}</span><span class="pp-deep-t"><b>${esc(x.title)}</b><span class="faint">${esc(x.summary || "")}</span></span>${x.source ? `<span class="pp-deep-src faint">${esc(x.source)}</span>` : ""}</summary>
        <div class="pp-deep-body md">
          ${renderMarkdown(x.body || "")}
          ${x.how_it_works?.length ? `<div class="pp-deep-box how"><span class="pp-callout-k">어떻게 작동하나 — 순서대로</span><ol>${x.how_it_works.map((h) => `<li>${renderMarkdown(String(h))}</li>`).join("")}</ol></div>` : ""}
          ${x.why ? `<div class="pp-deep-box why"><span class="pp-callout-k">왜 이렇게 설계했나</span>${renderMarkdown(x.why)}</div>` : ""}
          ${x.tables?.length ? `<div class="pp-deep-tables">${x.tables.map((t) => `<div class="pp-deep-table"><b>${esc(t.name)}</b><span class="faint">${esc(t.compares || "")}</span><p>${renderMarkdown(t.takeaway || "")}</p>${t.numbers ? `<p class="num pp-deep-nums">${esc(t.numbers)}</p>` : ""}</div>`).join("")}</div>` : ""}
          ${x.pitfalls?.length ? `<div class="pp-deep-box pit"><span class="pp-callout-k">흔한 오해</span>${li(x.pitfalls)}</div>` : ""}
          ${x.check ? `<div class="pp-deep-check"><span class="pp-callout-k">스스로 확인</span>${renderMarkdown(x.check)}<button type="button" class="chip pp-ask-this" data-ask-deep="${esc(x.title)}">AI에게 이 절 더 묻기</button></div>` : ""}
        </div>
      </details>`).join("")}
      ${d.walkthrough ? `<section class="pp-deep-walk"><h3 class="pp-h3">처음부터 끝까지 따라가기 (숫자 예시)</h3><div class="md">${renderMarkdown(d.walkthrough)}</div></section>` : ""}
      ${d.faq?.length ? `<section class="pp-deep-faq"><h3 class="pp-h3">자주 묻는 질문</h3>${d.faq.map((f) => `<details><summary>${esc(f.q)}</summary><div class="md">${renderMarkdown(f.a)}</div></details>`).join("")}</section>` : ""}
      ${d.connections ? `<section><h3 class="pp-h3">다른 논문 · 우리 파이프라인과의 관계</h3><div class="md">${renderMarkdown(d.connections)}</div></section>` : ""}`;
    $("#pp-deep-all", box).addEventListener("click", (e) => { const all = $$(".pp-deep-sec", box), open = all.some((x) => !x.open); all.forEach((x) => { x.open = open; }); e.currentTarget.textContent = open ? "모두 접기" : "모두 펼치기"; });
    $$("[data-ask-deep]", box).forEach((b) => b.addEventListener("click", () => {
      const ta = chatInput();
      if (!ta) return; ta.value = `'${b.dataset.askDeep}' 절을 더 쉽게, 예시를 들어 설명해 줘`; ta.focus(); ta.dispatchEvent(new Event("input"));
    }));
    // 목차 점프가 접힌 절을 가리키면 펼쳐요
    box.addEventListener("click", (e) => { const j = e.target.closest("[data-jump^='deep-']"); if (!j) return; const d2 = $("#pp-" + j.dataset.jump, view); if (d2) d2.open = true; });
  }
  function videos() {
    const v = c.videos || [];
    if (!v.length) return sec("videos", "영상", `<p class="faint">이 논문 영상은 아직 없어요.</p>`);
    return sec("videos", "영상으로 보기", `<div class="pp-vids">${v.map((x) => `
      <div class="pp-vid">
        <button type="button" class="pp-vid-frame" data-yt="${esc(x.youtube)}" aria-label="${esc(x.title)} 재생">
          <img loading="lazy" src="https://i.ytimg.com/vi/${esc(x.youtube)}/hqdefault.jpg" alt=""><span class="pp-vid-play">${icon.play(22)}</span>
          ${x.minutes ? `<span class="pp-vid-len num">${esc(x.minutes)}분</span>` : ""}</button>
        <div class="pp-vid-meta"><b>${esc(x.title)}</b><span class="faint">${esc(x.channel || "")} · ${x.lang === "ko" ? "한국어" : "영어"}</span>${x.note ? `<span class="muted">${esc(x.note)}</span>` : ""}
          <a class="faint pp-ext" href="https://www.youtube.com/watch?v=${esc(x.youtube)}" target="_blank" rel="noopener">유튜브에서 열기 ${icon.external(12)}</a></div>
      </div>`).join("")}</div>`);
  }
  // 용어는 본문에서 바로(점선 밑줄 → 설명 카드). 여기는 한 번에 훑어보는 목록만, 접어서
  function terms() {
    return sec("terms", "용어 모아 보기", `<p class="faint pp-terms-hint">본문의 <span class="pp-term demo">점선 밑줄</span>에 마우스를 올리거나 누르면 그 자리에서 설명이 떠요.</p>
      <details class="pp-terms-all" data-noterm><summary>이 논문 용어 <span class="num" id="pp-terms-n">${(c.glossary || []).length}</span>개 모두 보기</summary>
        <dl class="pp-terms" id="pp-terms-list">${(c.glossary || []).map((g) => `<div><dt>${esc(g.term)}</dt><dd>${rich(g.easy)}</dd></div>`).join("")}</dl></details>
      <button type="button" class="pp-bigcheck" id="pp-read-btn">다 읽었어요 — 읽기 체크</button>`);
  }
  // 사전이 오면: 절마다 첫 등장에 밑줄 + 모아 보기 목록 채우기
  let dict = null, stopCard = null;
  const pageSeen = new Set(); // 공통 용어는 페이지에서 처음 한 번만
  const termsP = () => (termsP.p ||= loadTerms(id, c?.glossary || []).then((d) => (dict = d)));
  function applyTerms(scopeRoot) {
    termsP().then((d) => {
      if (!alive || !d?.rx) return;
      const box = scopeRoot || view;
      // 자세히 읽기의 절은 따로, 나머지 섹션은 섹션마다
      $$(".pp-sec", box).forEach((x) => { if (x.id !== "pp-deep" && x.id !== "pp-terms" && x.id !== "pp-tutor" && x.id !== "pp-quiz") annotate(x, d, new Set(), pageSeen); });
      $$(".pp-deep-sec", box).forEach((x) => annotate($(".pp-deep-body", x), d, new Set(), pageSeen));
      if (!scopeRoot) {
        const own = [...d.entries.values()].filter((e) => e.scope === "이 논문");
        const list = $("#pp-terms-list", view);
        if (list && own.length) { list.innerHTML = own.map((e) => `<div><dt>${esc(e.term)}</dt><dd>${esc(e.easy)}</dd></div>`).join(""); $("#pp-terms-n", view).textContent = own.length; }
      }
    });
  }
  // 옆 칸(넓은 화면)이 보이면 거기, 아니면 아래 튜터 칸
  const chatInput = () => { const mini = $(".pp-mini-ai .ppc-in", view); return mini && mini.offsetParent !== null ? mini : $("#pp-tutor .ppc-in", view); };
  function askAbout(term) {
    const ta = chatInput();
    if (!ta) return;
    ta.value = `'${term}' 이(가) 이 논문에서 정확히 뭐예요? 쉬운 예시로 설명해 주세요.`;
    if (ta.closest(".pp-mini-ai")?.offsetParent == null) $("#pp-tutor", view)?.scrollIntoView({ block: "start" });
    ta.focus(); ta.dispatchEvent(new Event("input"));
  }
  function quiz() {
    const qs = c.quiz || [];
    return sec("quiz", `퀴즈 · ${qs.length}문제`, `
      <p class="faint">4개 이상 맞히면 퀴즈 칸이 자동으로 채워져요. 고르면 바로 정답과 이유가 보여요.</p>
      <ol class="pp-quiz" id="pp-quiz">${qs.map((q, i) => `
        <li class="pp-q" data-q="${i}"><p class="pp-q-t">${rich(q.q)}</p>
          <div class="pp-opts">${q.choices.map((ch, j) => `<button type="button" class="pp-opt" data-q="${i}" data-o="${j}"><span class="pp-opt-k">${"ABCD"[j]}</span>${rich(ch)}</button>`).join("")}</div>
          <p class="pp-why" hidden></p></li>`).join("")}</ol>
      <div class="pp-quiz-foot" id="pp-quiz-foot"></div>`);
  }
  function explain() {
    return sec("explain", "3분 설명", `
      <p class="muted">친구에게 말하듯 내 말로 써 보세요(또는 소리 내어 말한 걸 받아 적기). <b>문제 → 아이디어 → 결과 → 우리 파이프라인</b> 순서면 돼요.</p>
      <div class="pp-kw">${(c.keywords_3min || []).map((k) => `<span class="chip" data-kw="${esc(k)}">${esc(k)}</span>`).join("")}</div>
      <div class="pp-ex-box">
        <textarea class="textarea pp-ex-text" id="pp-ex-text" rows="8" placeholder="이 논문은 ○○ 문제를 풀려고 했어요. 핵심은 …"></textarea>
        <div class="pp-ex-bar">
          <button type="button" class="btn ghost sm" id="pp-ex-timer">3:00 타이머</button>
          <span class="faint num" id="pp-ex-count">0자</span>
          <span class="grow"></span>
          <button type="button" class="btn accent sm" id="pp-ex-go">${icon.spark(14)} AI 채점</button>
        </div>
      </div>
      <div id="pp-ex-result"></div>
      <button type="button" class="pp-linkbtn" id="pp-ex-manual"></button>
      <details class="pp-script"><summary>모범 대본 보기 <span class="faint">(먼저 직접 해 보고 열어요)</span></summary>${paras(c.script_3min)}</details>`);
  }
  function notes() {
    return sec("notes", "한 줄 정리", `<p class="faint">내가 이해한 걸 한 줄로. 셋이 서로 봐요.</p><div id="pp-notes"></div>`);
  }
  function tutor() { return sec("tutor", "AI 튜터", chatMarkup("full")); }
  function source() {
    const L = c.links || {}, meta = paperMeta(idx, id);
    const btn = (href, label) => (href ? `<a class="btn ghost sm" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} ${icon.external(12)}</a>` : "");
    return sec("source", "원문", `<div class="row">${btn(L.pdf || L.arxiv, "영어 원문 PDF")}${meta.ko_pdf ? btn(`/papers/pdf/${meta.ko_pdf}`, "한국어 번역 PDF") : ""}${btn(L.arxiv, "arXiv")}${btn(L.code, "공식 코드")}</div>
      <p class="faint">번역은 비공식 번역이에요. 숫자·그림은 영어 원문으로 확인해요.</p>`);
  }

  // ---------- 그리기 ----------
  function paint() {
    const meta = paperMeta(idx, id);
    if (!meta) { view.innerHTML = `<section class="panel"><h2 class="h2">없는 논문이에요</h2><a class="btn ghost sm" href="#/papers">현황판으로</a></section>`; return; }
    const st = stageOf(idx, meta.stage), day = dayOfPaper(idx, id);
    const order = idx.days.flatMap((d) => d.papers), at = order.indexOf(id);
    const prev = order[at - 1], next = order[at + 1];
    const headHtml = `<header class="pp-phead" style="--st:${stageVar(st.color)}">
      <div class="pp-phead-top"><button type="button" class="icon-btn back-btn" id="pp-back" aria-label="뒤로">${icon.left(18)}</button>
        <span class="eyebrow">${esc(day?.label || "")} · ${at + 1}/16 · ${esc(meta.field)}</span></div>
      <h1 class="pp-title">${esc(meta.title)} <span class="faint num">${meta.year}</span></h1>
      ${c?.full_title ? `<p class="pp-full faint">${esc(c.full_title)}${c.venue ? ` · ${esc(c.venue)}` : ""}</p>` : ""}
      <div class="pp-status" id="pp-status"></div>
    </header>`;
    if (!c) {
      view.innerHTML = headHtml + `<section class="panel pp-wait"><h2 class="h2">자료를 만드는 중이에요</h2><p class="muted">조금 뒤에 새로 고침 해 보세요. 그동안 원문으로 먼저 봐도 돼요.</p>${meta.ko_pdf ? `<a class="btn ghost sm" href="/papers/pdf/${meta.ko_pdf}" target="_blank" rel="noopener">한국어 번역 PDF</a>` : ""}</section>`;
      bindHead(); paintStatus(); return;
    }
    view.innerHTML = headHtml + `
      <div class="pp-layout">
        <article class="pp-article">${glance()}${figs()}${idea()}${results()}${role()}${deepSec()}${videos()}${terms()}${quiz()}${explain()}${notes()}${tutor()}${source()}
          <nav class="pp-next">${prev ? `<a href="#/papers/${prev}" class="pp-nav prev"><span class="faint">‹ 이전</span><b>${esc(paperMeta(idx, prev).title)}</b></a>` : "<span></span>"}
            ${next ? `<a href="#/papers/${next}" class="pp-nav next"><span class="faint">다음 ›</span><b>${esc(paperMeta(idx, next).title)}</b></a>` : `<a href="#/papers" class="pp-nav next"><span class="faint">끝</span><b>현황판으로</b></a>`}</nav>
        </article>
        <aside class="pp-side">
          <nav class="pp-toc" aria-label="목차">${SECTIONS.map(([k, l]) => `<a href="#pp-${k}" data-jump="${k}">${l}</a>`).join("")}</nav>
          <div class="pp-mini-ai">
            ${chatMarkup("mini")}
          </div>
        </aside>
      </div>
      <button type="button" class="pp-fab" id="pp-fab" data-jump="tutor" aria-label="AI 튜터로">${icon.spark(18)}</button>`;
    bindHead(); bindBody(); paintStatus();
    stopCard?.(); stopCard = mountTermCard(view, () => dict, askAbout);
    applyTerms();
    loadDeep(id).then((d) => { if (!alive) return; paintDeep(d); applyTerms($("#pp-deep", view)); });
    if (c.diagram) loadDiagram(id, c.diagram.src).then((svg) => { const box = $("#pp-dg", view); if (box) box.innerHTML = svg || `<p class="faint">그림을 못 불러왔어요.</p>`; });
    spy();
  }

  function bindHead() {
    $("#pp-back", view)?.addEventListener("click", () => window.trioBack?.());
    view.addEventListener("click", (e) => {
      const j = e.target.closest("[data-jump]");
      if (!j) return;
      e.preventDefault();
      $(`#pp-${j.dataset.jump}`, view)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  }

  function bindBody() {
    // 그림 크게 보기
    $$("[data-zoom]", view).forEach((b) => b.addEventListener("click", () => lightbox(+b.dataset.zoom)));
    // 영상: 누르면 그 자리에서 재생
    $$("[data-yt]", view).forEach((b) => b.addEventListener("click", () => {
      const f = document.createElement("iframe");
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1&rel=0`;
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true; f.title = "영상";
      f.className = "pp-vid-frame"; b.replaceWith(f);
    }));
    // 읽기 체크
    $("#pp-read-btn", view).addEventListener("click", async (e) => {
      const on = !!me()?.checks?.[id]?.read;
      e.currentTarget.disabled = true;
      try { await setCheck(id, "read", !on); if (!on) toast("읽기 체크! 이제 퀴즈를 풀어 봐요."); }
      catch (err) { toast(err.message, "err"); }
      finally { e.currentTarget.disabled = ended(); }
    });
    bindQuiz(); bindExplain(); bindTutor();
  }

  // ---------- 퀴즈 ----------
  function bindQuiz() {
    quizPicks = new Array((c.quiz || []).length).fill(null);
    $("#pp-quiz", view).addEventListener("click", (e) => {
      const b = e.target.closest(".pp-opt");
      if (!b) return;
      const qi = +b.dataset.q, oi = +b.dataset.o;
      if (quizPicks[qi] != null) return;
      quizPicks[qi] = oi;
      const q = c.quiz[qi], li = b.closest(".pp-q");
      $$(".pp-opt", li).forEach((x) => { x.disabled = true; const j = +x.dataset.o; if (j === q.answer) x.classList.add("right"); else if (j === oi) x.classList.add("wrong"); });
      li.classList.add(oi === q.answer ? "ok" : "no");
      const why = $(".pp-why", li); why.hidden = false; why.innerHTML = `<b>${oi === q.answer ? "정답!" : `정답은 ${"ABCD"[q.answer]}`}</b> ${rich(q.why)}`;
      quizFoot();
    });
    quizFoot();
  }
  async function quizFoot() {
    const foot = $("#pp-quiz-foot", view), n = quizPicks.filter((x) => x != null).length, total = quizPicks.length;
    const right = quizPicks.reduce((s, x, i) => s + (x === c.quiz[i].answer ? 1 : 0), 0);
    const best = me()?.checks?.[id]?.quiz_score;
    if (n < total) { foot.innerHTML = `<span class="faint num">${n}/${total} 풀었어요${best != null ? ` · 지난 최고 ${best}/5` : ""}</span>`; return; }
    const pass = right >= 4;
    foot.innerHTML = `<div class="pp-quiz-score ${pass ? "pass" : ""}"><b class="num">${right}/${total}</b><span>${pass ? "통과! 퀴즈 칸을 채웠어요." : "4개부터 통과예요. 틀린 문제 이유를 읽고 다시 풀어 봐요."}</span><button type="button" class="btn ghost sm" id="pp-quiz-again">다시 풀기</button></div>`;
    $("#pp-quiz-again", foot).addEventListener("click", () => { $("#pp-quiz", view).outerHTML = quiz().match(/<ol class="pp-quiz"[\s\S]*<\/ol>/)[0]; bindQuiz(); });
    if (ended()) return;
    try { await sendQuiz(id, right); } catch (e) { toast(e.message, "err"); }
  }

  // ---------- 3분 설명 ----------
  function bindExplain() {
    const ta = $("#pp-ex-text", view), count = $("#pp-ex-count", view);
    const kws = $$("[data-kw]", view);
    const draftKey = `trio-pp-ex-${id}`;
    try { ta.value = localStorage.getItem(draftKey) || ""; } catch {}
    const upd = () => {
      count.textContent = `${ta.value.trim().length}자`;
      const t = ta.value.toLowerCase();
      kws.forEach((k) => k.classList.toggle("good", t.includes(k.dataset.kw.toLowerCase())));
      try { localStorage.setItem(draftKey, ta.value); } catch {}
    };
    ta.addEventListener("input", upd); upd();
    $("#pp-ex-timer", view).addEventListener("click", (e) => {
      const b = e.currentTarget;
      if (timer) { clearInterval(timer); timer = null; b.textContent = "3:00 타이머"; return; }
      let left = 180;
      const tick = () => { b.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} · 멈추기`; if (left-- <= 0) { clearInterval(timer); timer = null; b.textContent = "시간 끝! 다시"; toast("3분 끝! 어디까지 말했는지 적어 보세요."); } };
      tick(); timer = setInterval(tick, 1000);
    });
    $("#pp-ex-go", view).addEventListener("click", async (e) => {
      const b = e.currentTarget, text = ta.value.trim();
      if (text.length < 60) { toast("60자 이상 써 주세요. 네 부분(문제·아이디어·결과·우리에게)을 한두 문장씩이면 충분해요."); return; }
      if (ended()) { toast("스프린트가 끝나서 채점은 닫혔어요."); return; }
      b.disabled = true; b.innerHTML = `${icon.spark(14)} 채점 중…`;
      $("#pp-ex-result", view).innerHTML = `<div class="pp-ex-card busy"><span class="faint">AI 가 읽고 있어요…</span></div>`;
      try {
        const r = await api.paperExplain(id, text);
        $("#pp-ex-result", view).innerHTML = `<div class="pp-ex-card ${r.passed ? "pass" : ""}">
          <div class="pp-ex-score"><b class="num">${r.score}</b><span>${r.passed ? "통과 — 3분 설명 칸을 채웠어요" : `${r.need}점부터 통과예요`}</span></div>
          ${r.good.length ? `<div><span class="pp-callout-k">잘했어요</span><ul>${r.good.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
          ${r.missing.length ? `<div><span class="pp-callout-k">빠졌거나 틀렸어요</span><ul>${r.missing.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
          ${r.tip ? `<p class="muted"><b>한 문장 더:</b> ${esc(r.tip)}</p>` : ""}</div>`;
        await refreshProgress();
      } catch (err) {
        $("#pp-ex-result", view).innerHTML = "";
        toast((err.message || "AI 채점을 못 했어요.") + " 직접 체크해도 돼요.", "err");
      } finally { b.disabled = false; b.innerHTML = `${icon.spark(14)} AI 채점`; }
    });
    $("#pp-ex-manual", view).addEventListener("click", async () => {
      const on = !!me()?.checks?.[id]?.explain;
      if (!on && !confirm("정말 소리 내어 3분 안에 설명할 수 있었나요?\n(문제 → 아이디어 → 결과 → 우리 파이프라인)")) return;
      try { await setCheck(id, "explain", !on); } catch (e) { toast(e.message, "err"); }
    });
  }

  // ---------- 한 줄 정리 ----------
  let notesDirty = false;
  function paintNotes() {
    const box = $("#pp-notes", view);
    if (!box || !prog || notesDirty) return;
    const mine = me()?.notes?.[id] || "";
    const others = prog.members.map((m, i) => ({ m, i })).filter(({ m }) => m.user_id !== ctx.me.id);
    box.innerHTML = `
      <form class="pp-note-me" id="pp-note-form">${avatar(ctx.me, "sm")}
        <input class="input" id="pp-note-in" maxlength="300" placeholder="예: NMS 를 없애려고 학습 때만 상자 여러 개로 가르친다" value="${esc(mine)}" ${ended() ? "disabled" : ""}>
        <button class="btn ghost sm" type="submit" ${ended() ? "disabled" : ""}>저장</button></form>
      ${others.map(({ m, i }) => `<div class="pp-note">${avatar({ ...(ctx.user?.(m.user_id) || {}), display_name: m.name, color: colorOf(m.user_id, i) }, "sm")}${m.notes?.[id] ? `<span>${esc(m.notes[id])}</span>` : `<span class="faint">${esc(m.name)} — 아직 안 썼어요</span>`}</div>`).join("")}`;
    const inp = $("#pp-note-in", box);
    inp.addEventListener("input", () => { notesDirty = true; });
    $("#pp-note-form", box).addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api.paperNote(id, inp.value); notesDirty = false; toast("한 줄 정리를 저장했어요."); refreshProgress(); }
      catch (err) { toast(err.message, "err"); }
    });
  }

  // ---------- AI 튜터 (papers/chat.js) ----------
  let stopChat = null;
  function bindTutor() { stopChat?.(); stopChat = mountChat(view, id, $(".pp-article", view), (bub) => { if (dict?.rx) annotate(bub, dict); }); }

  // ---------- 그림 크게 보기 ----------
  function lightbox(start) {
    const figsList = c.figures || [];
    let i = start;
    const back = document.createElement("div");
    back.className = "pp-lb"; back.setAttribute("role", "dialog"); back.setAttribute("aria-modal", "true");
    const draw = () => {
      const f = figsList[i];
      back.innerHTML = `<figure><img src="/papers/fig/${id}/${esc(f.src)}" alt="${esc(f.caption)}"><figcaption>${rich(f.caption)} <span class="faint num">${i + 1}/${figsList.length}</span></figcaption></figure>
        <button type="button" class="icon-btn pp-lb-x" aria-label="닫기">${icon.x(20)}</button>
        ${figsList.length > 1 ? `<button type="button" class="icon-btn pp-lb-p" aria-label="이전">${icon.left(22)}</button><button type="button" class="icon-btn pp-lb-n" aria-label="다음">${icon.right(22)}</button>` : ""}`;
    };
    const close = () => { back.remove(); document.removeEventListener("keydown", key); };
    const key = (e) => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") { i = (i + 1) % figsList.length; draw(); } if (e.key === "ArrowLeft") { i = (i - 1 + figsList.length) % figsList.length; draw(); } };
    back.addEventListener("click", (e) => {
      if (e.target.closest(".pp-lb-p")) { i = (i - 1 + figsList.length) % figsList.length; draw(); return; }
      if (e.target.closest(".pp-lb-n")) { i = (i + 1) % figsList.length; draw(); return; }
      if (e.target.closest(".pp-lb-x") || e.target === back) close();
    });
    document.addEventListener("keydown", key);
    draw(); document.body.append(back);
  }

  // ---------- 목차 따라가기 ----------
  let io = null;
  function spy() {
    const links = $$(".pp-toc a", view);
    io = new IntersectionObserver((ents) => {
      ents.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.dataset.jump === en.target.dataset.sec)); });
    }, { root: root.closest(".main"), rootMargin: "-20% 0px -70% 0px" });
    $$(".pp-sec", view).forEach((s) => io.observe(s));
  }

  const off = onProgress((p) => { prog = p; if (idx) paintStatus(); });
  Promise.all([loadIndex(), loadContent(id)]).then(([x, content]) => { if (!alive) return; idx = x; c = content; paint(); });
  if (!prog) refreshProgress().catch(() => {});
  return () => { alive = false; off(); io?.disconnect(); if (timer) clearInterval(timer); stopChat?.(); stopCard?.(); };
}

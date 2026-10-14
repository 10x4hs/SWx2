// 경영 마이크로디그리 — 모듈 한 개(카드 목록) · 카드 한 장(떠올리기 → 생각 → 그림 → 예시 → 적용 → 퀴즈) + 오른쪽 AI 튜터
import { $, $$, esc, toast } from "../util.js";
import { api, streamMbaAsk } from "../api.js";
import { chatMarkup, mountChat } from "../papers/chat.js";
import { index, moduleDoc, state, progressOf } from "./data.js";
import { renderVisual } from "./charts.js";

const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const back = (href, label) => `<a class="mb-back" href="${href}" aria-label="${esc(label)}"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9 2 4 7l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`;

// ---------- 모듈 한 개 ----------
export function mountModule(host, ctx, id) {
  let alive = true;
  host.innerHTML = `<p class="mb-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st] = await Promise.all([index(), state()]);
    const m = idx.modules.find((x) => x.id === id);
    if (!alive) return;
    if (!m) { host.innerHTML = `<p class="mb-err">없는 모듈이에요. <a href="#/mba">모듈 지도로</a></p>`; return; }
    const read = new Map((st.items || []).filter((x) => x.module === id).map((x) => [x.card, x]));
    const due = new Set((st.due || []).filter((x) => x.module === id).map((x) => x.card));
    const p = progressOf(m, st), next = m.cards.find((c) => !read.has(c.id)) || m.cards[0];
    const i = idx.modules.indexOf(m), prevM = idx.modules[i - 1], nextM = idx.modules[i + 1];
    host.innerHTML = `<div class="mb-page">
      <header class="mb-bar">${back("#/mba", "모듈 지도로")}<span class="mb-mono dim">MODULE ${esc(m.no)}</span><span class="mb-k">${esc(m.phase)} 단계</span><span class="mb-sp"></span><span class="mb-k dim">9개교 중 필수 ${esc(m.schools)}</span></header>
      <section class="mb-mhead"><span class="mb-mono dim">${esc(m.no)} / 12</span><h1>${esc(m.title)}</h1><p>${esc(m.what || m.sub)}</p>
        <div class="mb-mstat"><span class="mb-prog big"><i style="width:${p.total ? Math.round(p.read / p.total * 100) : 0}%"></i></span><span class="mb-k">카드 ${p.read}/${p.total}</span><a class="mb-btn" href="#/mba/${esc(m.id)}/${esc(next.id)}">${p.read ? "이어서" : "시작"} · ${esc(next.title)}</a></div></section>
      <ol class="mb-cards">${m.cards.map((c, k) => { const r = read.get(c.id); return `<li><a href="#/mba/${esc(m.id)}/${esc(c.id)}"><span class="mb-mono ${r ? "acc" : "dim"}">${r ? "✓" : String(k + 1).padStart(2, "0")}</span><b>${esc(c.title)}</b><span class="mb-k dim">${due.has(c.id) ? "오늘 복습" : r ? `복습 ${r.stage}단계` : `${c.min}분`}</span></a></li>`; }).join("")}</ol>
      <nav class="mb-mnav">${prevM ? `<a class="mb-btn ghost" href="#/mba/${esc(prevM.id)}">← ${esc(prevM.no)} ${esc(prevM.title)}</a>` : "<span></span>"}${nextM ? `<a class="mb-btn ghost" href="#/mba/${esc(nextM.id)}">${esc(nextM.no)} ${esc(nextM.title)} →</a>` : ""}</nav>
    </div>`;
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">모듈을 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; };
}

// ---------- 카드 한 장 ----------
const QUICK = ["더 쉽게, 비유로 다시", "숫자 예시 하나 더", "확인 퀴즈 하나 내 줘", "내 일에는 어떻게 써요?", "헷갈리기 쉬운 점은?"];
export function mountCard(host, ctx, modId, cardId) {
  let alive = true, stops = [], deep = store.get("mb-deep") === "on";
  const t0 = Date.now();
  host.innerHTML = `<p class="mb-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, doc, st] = await Promise.all([index(), moduleDoc(modId), state()]);
    if (!alive) return;
    const m = idx.modules.find((x) => x.id === modId), k = doc.cards.findIndex((c) => c.id === cardId), c = doc.cards[k];
    if (!m || !c) { host.innerHTML = `<p class="mb-err">없는 카드예요. <a href="#/mba/${esc(modId)}">모듈로</a></p>`; return; }
    const read = new Set((st.items || []).filter((x) => x.module === modId).map((x) => x.card));
    const dueN = (st.due || []).length;
    const prev = doc.cards[k - 1], next = doc.cards[k + 1], nextM = idx.modules[idx.modules.indexOf(m) + 1];
    const vis = renderVisual(c.visual);
    let n = 0; const sec = (label) => `<span class="mb-lbl"><span class="mb-mono">${String(++n).padStart(2, "0")}</span>${label}</span>`;
    const quiz = (c.quiz || []).map((q, qi) => `<div class="mb-q" data-q="${qi}"><p class="mb-q-t">${md(q.q)}</p><div class="mb-q-c">${q.choices.map((ch, ci) => `<button type="button" class="mb-choice" data-ci="${ci}">${md(ch)}</button>`).join("")}</div><p class="mb-q-why" hidden></p></div>`).join("");
    const applyKey = `mb-apply-${modId}-${cardId}`;
    host.innerHTML = `<div class="mb-page mb-cardpage">
      <header class="mb-bar">${back(`#/mba/${esc(modId)}`, "모듈로")}<span class="mb-mono dim">MODULE ${esc(m.no)}</span><span class="mb-k">${esc(m.title)}</span><span class="mb-mono">CARD ${String(k + 1).padStart(2, "0")} / ${String(doc.cards.length).padStart(2, "0")}</span><span class="mb-sp"></span>
        <button type="button" class="mb-btn ghost sm" id="mb-ai-t" aria-pressed="true" aria-controls="mb-ai">AI 튜터</button></header>
      <div class="mb-cols">
        <nav class="mb-outline" aria-label="이 모듈의 카드"><span class="mb-lbl"><span class="mb-mono">${esc(m.no)}</span>${esc(m.title)}</span>
          <ol>${doc.cards.map((x, i) => `<li class="${x.id === cardId ? "now" : read.has(x.id) ? "done" : ""}"><a href="#/mba/${esc(modId)}/${esc(x.id)}"${x.id === cardId ? ' aria-current="page"' : ""}><span class="mb-mono">${read.has(x.id) && x.id !== cardId ? "✓" : String(i + 1).padStart(2, "0")}</span><span>${esc(x.title)}</span></a></li>`).join("")}</ol>
          ${dueN ? `<a class="mb-due" href="#/mba/today"><span class="mb-mono acc">REVIEW</span><span>복습 ${dueN}장이 기다려요</span></a>` : ""}
        </nav>
        <main class="mb-read" id="mb-read">
          <span class="mb-k dim">읽기 ${c.min}분</span>
          <h1>${md(c.title)}</h1>
          ${c.recall ? `<section class="mb-blk recall">${sec("먼저 떠올리기")}<h2>${md(c.recall.q)}</h2><div class="mb-row"><button type="button" class="mb-btn ghost" id="mb-reveal" aria-expanded="false">떠올렸어요 · 답 보기</button><span class="mb-k dim">틀려도 괜찮아요 — 떠올리려 애쓴 것만으로 남아요</span></div><p class="mb-answer" id="mb-answer" hidden>${md(c.recall.a)}</p></section>` : ""}
          <section class="mb-blk">${sec("한 가지 생각")}${(c.idea || []).map((p) => `<p class="mb-p">${md(p)}</p>`).join("")}</section>
          ${vis ? `<section class="mb-blk mb-vis" id="mb-vis">${sec("그림")}${vis.html}${c.visual.caption ? `<p class="mb-cap">${md(c.visual.caption)}</p>` : ""}</section>` : ""}
          ${c.example ? `<section class="mb-blk">${sec("숫자 예시")}<p class="mb-p">${md(c.example)}</p></section>` : ""}
          ${c.apply ? `<section class="mb-blk">${sec("내 일에 적용하기")}<label class="mb-h2" for="mb-apply">${md(c.apply.q)}</label><textarea id="mb-apply" class="mb-ta" rows="3" placeholder="${esc(c.apply.ph || "")}">${esc(store.get(applyKey) || "")}</textarea><span class="mb-k dim">이 기기에만 저장돼요</span></section>` : ""}
          ${quiz ? `<section class="mb-blk">${sec("확인")}${quiz}</section>` : ""}
          ${c.words?.length ? `<section class="mb-blk">${sec("낱말")}<dl class="mb-words">${c.words.map((w) => `<div><dt>${esc(w.term)}${w.en ? `<span class="mb-mono dim">${esc(w.en)}</span>` : ""}</dt><dd>${md(w.easy)}</dd></div>`).join("")}</dl></section>` : ""}
          ${c.sources?.length ? `<p class="mb-src-l"><span class="mb-mono dim">SOURCES</span> ${c.sources.map(esc).join(" · ")}</p>` : ""}
          <div class="mb-endbar">${prev ? `<a class="mb-btn ghost" href="#/mba/${esc(modId)}/${esc(prev.id)}">이전 카드</a>` : "<span></span>"}
            <button type="button" class="mb-btn" id="mb-done">${read.has(cardId) ? "다시 읽었어요" : "다 읽었어요"}</button>
            ${next ? `<a class="mb-btn ghost" href="#/mba/${esc(modId)}/${esc(next.id)}">다음 · ${esc(next.title)}</a>` : nextM ? `<a class="mb-btn ghost" href="#/mba/${esc(nextM.id)}">다음 모듈 · ${esc(nextM.title)}</a>` : `<a class="mb-btn ghost" href="#/mba">모듈 지도로</a>`}</div>
        </main>
        <aside class="mb-ai" id="mb-ai" aria-label="AI 튜터">
          <div class="mb-ai-head"><span class="mb-dot"></span><b>AI 튜터</b><span class="mb-k dim">이 카드${vis?.context ? "와 그림의 지금 값" : ""}을 보고 답해요</span>
            <button type="button" class="mb-sw" id="mb-deep" aria-pressed="${deep}"><i></i><span>${deep ? "깊게" : "쉽게"}</span></button></div>
          ${chatMarkup("full", { quick: QUICK, sub: "경영 마이크로디그리", empty: "이 카드에서 막히는 걸 바로 물어봐요. 본문 글자를 긁으면 그 문장으로 물어볼 수 있어요.", ph: "예: 공헌이익이 왜 중요해요?" })}
        </aside>
      </div>
      <button type="button" class="mb-ai-fab" id="mb-ai-fab" aria-controls="mb-ai" aria-expanded="false">AI에게 묻기</button>
    </div>`;
    const page = $(".mb-cardpage", host), aiBox = $("#mb-ai", host);
    // 그림 연결 (이익 지도 슬라이더 · 병목 버튼)
    if (vis?.wire) { const s = vis.wire($("#mb-vis", host)); if (s) stops.push(s); }
    // AI 튜터
    const chatOpts = { level: deep ? "deep" : "easy", quick: QUICK, stream: (id, msgs, ev, sig, level) => streamMbaAsk(modId, cardId, msgs, ev, sig, level, vis?.context ? vis.context() : "") };
    stops.push(mountChat(aiBox, `mba-${modId}-${cardId}`, $("#mb-read", host), null, chatOpts) || null);
    $("#mb-deep", host).addEventListener("click", (e) => {
      deep = !deep; store.set("mb-deep", deep ? "on" : "off"); chatOpts.level = deep ? "deep" : "easy";
      const b = e.currentTarget; b.setAttribute("aria-pressed", deep); b.querySelector("span").textContent = deep ? "깊게" : "쉽게";
    });
    const setAi = (on) => { page.classList.toggle("ai-off", !on); page.classList.toggle("ai-on", on); $("#mb-ai-t", host).setAttribute("aria-pressed", on); $("#mb-ai-fab", host).setAttribute("aria-expanded", on); };
    $("#mb-ai-t", host).addEventListener("click", () => setAi(page.classList.contains("ai-off")));
    $("#mb-ai-fab", host).addEventListener("click", () => setAi(!page.classList.contains("ai-on")));
    if (matchMedia("(max-width: 1100px)").matches) setAi(false);
    // 떠올리기
    $("#mb-reveal", host)?.addEventListener("click", (e) => { const a = $("#mb-answer", host), open = a.hidden; a.hidden = !open; e.currentTarget.textContent = open ? "답 접기" : "떠올렸어요 · 답 보기"; e.currentTarget.setAttribute("aria-expanded", open); });
    // 적용 (이 기기에만)
    $("#mb-apply", host)?.addEventListener("input", (e) => store.set(applyKey, e.target.value.slice(0, 1000)));
    // 퀴즈
    const answered = new Map();
    host.addEventListener("click", (e) => {
      const b = e.target.closest(".mb-choice"); if (!b) return;
      const box = b.closest(".mb-q"), qi = Number(box.dataset.q), q = c.quiz[qi], ci = Number(b.dataset.ci);
      if (answered.has(qi)) return;
      answered.set(qi, ci === q.answer);
      $$(".mb-choice", box).forEach((x) => { x.disabled = true; const i = Number(x.dataset.ci); x.classList.toggle("right", i === q.answer); x.classList.toggle("wrong", i === ci && ci !== q.answer); });
      const why = $(".mb-q-why", box); why.hidden = false; why.innerHTML = `<b>${ci === q.answer ? "맞아요." : "다시 볼까요."}</b> ${md(q.why)}`;
    });
    // 다 읽었어요 → 읽음 기록 + 오늘 공부한 분
    $("#mb-done", host).addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const total = (c.quiz || []).length, got = [...answered.values()].filter(Boolean).length;
      const mins = Math.max(1, Math.min(30, Math.round((Date.now() - t0) / 60000)));
      try {
        await api.mbaRead(modId, cardId, answered.size === total && total ? got : undefined, answered.size === total && total ? total : undefined);
        await api.mbaDay(mins);
        b.textContent = "기록했어요"; toast(`읽음으로 기록했어요 · 내일 복습에 나와요${answered.size === total && total ? ` · 퀴즈 ${got}/${total}` : ""}`);
        if (next) setTimeout(() => { if (alive) location.hash = `#/mba/${modId}/${next.id}`; }, 700);
      } catch (x) { b.disabled = false; toast(x.message || "기록하지 못했어요.", "err"); }
    });
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">카드를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; stops.forEach((f) => { try { f?.(); } catch {} }); };
}

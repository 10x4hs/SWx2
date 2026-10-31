// Psychology 화면들 — mount(host, r, env) → 정리 함수(있으면)
//   map(지도) · track(분야 목록) · card(LEARN) · run(오늘 세션 · 퀴즈) · spar(말싸움 연습) · videos · library
import { esc } from "../util.js";
import { api } from "../api.js";
import { data, studyOrder, trackOf, bookOf } from "./data.js";
import { st, rate, known, seen, isDue, box, quizDone, sparDone } from "./store.js";
import { cardHTML, dots, link, links, dialog, mastery, quizFor, quizable, shuffle } from "./ui.js";

const pad = (n) => String(n).padStart(2, "0");
export function counts() {
  const D = data(), ids = D.cards.filter((c) => c.track !== "library").map((c) => c.id), now = Date.now();
  const due = ids.filter((id) => isDue(id, now));
  return { cards: ids.length, known: ids.filter(known).length, due };
}
// 오늘 할 장 수 = 복습(최대 20) + 새 카드 3
const NEW_PER_DAY = 3, QUIZ_PER_DAY = 6;
const newCards = (n) => studyOrder().filter((id) => !seen(id)).slice(0, n);
export const todayCount = () => Math.min(20, counts().due.length) + newCards(NEW_PER_DAY).length;

// ── MAP ──
export function map(host, r, env) {
  const D = data();
  env.crumb("/ MAP");
  host.innerHTML = `<div class="ps-map">
    ${D.tracks.map((t) => { const k = t.order.filter(known).length; return `<a class="ps-tile" href="#/psy/${t.id === "library" ? "library" : "t/" + esc(t.id)}">
      <span class="ps-k">${esc(t.no)} · ${esc(t.en)}</span>
      <span class="ps-tile-ko">${esc(t.ko)}</span>
      <span class="ps-dots">${dots(t.order)}</span>
      <span class="ps-k">${t.order.length} · 익힘 ${t.order.length ? Math.round((k / t.order.length) * 100) : 0}%</span>
    </a>`; }).join("")}
    <div class="ps-tile ps-legend">
      <span class="ps-k">LEGEND</span>
      <span>● 점 하나 = 기법 한 장</span>
      <span><b class="ps-acc">●</b> 익힌 기법 · ● 아직</span>
      <span>오늘 복습할 카드는 지도 위에서 깜빡여요</span>
      <span class="ps-legend-go"><a href="#/psy/quiz">QUIZ</a> · <a href="#/psy/spar">SPAR</a> · <a href="#/psy/v">VIDEO</a></span>
    </div>
  </div>`;
}

// ── 분야 목록 ──
export function track(host, r, env) {
  const t = trackOf(r.id);
  if (!t) { location.replace("#/psy"); return; }
  env.crumb(`/ ${esc(t.no)} ${esc(t.ko)}`);
  const D = data(), k = t.order.filter(known).length;
  host.innerHTML = `<div class="ps-list">
    <header class="ps-list-h"><span class="ps-k">${esc(t.no)} · ${esc(t.en)}</span><h1>${esc(t.ko)}</h1><span class="ps-k">${t.order.length} CARDS · KNOWN ${k}</span><span class="ps-dots">${dots(t.order)}</span></header>
    <ol>${t.order.map((id, i) => { const c = D.byId[id]; return `<li><a href="#/psy/c/${esc(id)}" class="${known(id) ? "on" : ""}${isDue(id) ? " due" : ""}">
      <span class="ps-k">${pad(i + 1)}</span><span class="ps-li-ko">${esc(c.ko)}<small>${esc(c.line)}</small></span><span class="ps-k ps-li-m">${mastery(id)}</span></a></li>`; }).join("")}</ol>
  </div>`;
}

// ── LEARN 카드 한 장 ──
export function card(host, r, env) {
  const D = data(), c = D.byId[r.id];
  if (!c) { location.replace("#/psy"); return; }
  const t = trackOf(c.track), i = t ? t.order.indexOf(c.id) : -1;
  env.crumb(t ? `/ <a href="#/psy/t/${esc(t.id)}">${esc(t.no)} ${esc(t.ko)}</a> / ${pad(i + 1)}` : "/ CARD");
  env.right(mastery(c.id));
  if (t) env.line((i + 1) / t.order.length);
  host.innerHTML = cardHTML(c);
  const go = (g) => { rate(c.id, g); const nx = t?.order[i + 1]; location.hash = nx ? "#/psy/c/" + nx : t ? "#/psy/t/" + t.id : "#/psy"; };
  host.addEventListener("click", (e) => { const b = e.target.closest("[data-rate]"); if (b) go(+b.dataset.rate); });
  return env.keys((e) => { if ("123".includes(e.key)) { e.preventDefault(); go(+e.key); } });
}

// ── 오늘 세션 · 퀴즈: 단계(step)를 하나씩 ──
//   today: 복습할 카드 → 새 카드 3 → 섞은 퀴즈 6 → 말싸움 제안 · quiz: 퀴즈 6
let session = null; // { kind, steps, i, right, at }
function build(kind) {
  const quiz = shuffle(quizable()).slice(0, QUIZ_PER_DAY).map((c) => ({ k: "quiz", id: c.id }));
  if (kind === "quiz") return quiz;
  const due = counts().due.slice(0, 20).map((id) => ({ k: "card", id, due: 1 }));
  return [...due, ...newCards(NEW_PER_DAY).map((id) => ({ k: "card", id })), ...quiz, { k: "spar" }];
}
export function run(host, r, env) {
  const kind = r.tab === "quiz" ? "quiz" : "today";
  const fresh = new Date().toDateString();
  if (!session || session.kind !== kind || session.at !== fresh || session.i >= session.steps.length || r.id === "new") session = { kind, steps: build(kind), i: 0, right: 0, at: fresh };
  const S = session;
  let picked = null, opts = [];
  const draw = () => {
    const s = S.steps[S.i], qn = S.steps.filter((x) => x.k === "quiz"), qi = qn.indexOf(s);
    env.crumb(kind === "quiz" ? "/ QUIZ · 섞어서" : "/ TODAY");
    env.line(S.i / S.steps.length);
    env.right(s?.k === "quiz" ? `Q ${qi + 1} / ${qn.length} · ✓ ${S.right}` : `TODAY ${Math.min(S.i + 1, S.steps.length)} / ${S.steps.length}`);
    if (!s) {
      host.innerHTML = `<div class="ps-done"><span class="ps-k ps-acc">DONE</span><h1>${kind === "quiz" ? `${S.right} / ${qn.length} 맞혔어요` : "오늘 공부 끝!"}</h1>
        <p><a class="ps-btn ps-primary" href="#/psy">지도로</a> <a class="ps-btn" href="#/psy/quiz/new">퀴즈 한 판 더</a></p></div>`;
      env.line(1);
      return;
    }
    if (s.k === "card") { host.innerHTML = `${s.due ? `<p class="ps-k ps-tag">REVIEW</p>` : `<p class="ps-k ps-tag">NEW</p>`}${cardHTML(data().byId[s.id])}`; return; }
    if (s.k === "spar") {
      host.innerHTML = `<div class="ps-done"><span class="ps-k ps-acc">OPTIONAL · SPAR</span><h1>배운 걸 대화에서 써 볼까요?</h1><p>AI 상대와 3~5턴 말싸움을 해요. 내가 쓴 기법과 놓친 기회를 옆에서 알려 줘요.</p>
        <p><a class="ps-btn ps-primary" href="#/psy/spar">말싸움 연습</a> <button type="button" class="ps-btn" data-next>건너뛰기</button></p></div>`;
      return;
    }
    const c = data().byId[s.id];
    opts = quizFor(c); picked = null;
    host.innerHTML = `<div class="ps-quiz">
      <span class="ps-k ps-acc">이 대화에 쓰인 기법은?</span>
      <div class="ps-q">${dialog(c.example)}</div>
      <div class="ps-opts">${opts.map((id, n) => `<button type="button" data-opt="${n}"><i>${n + 1}</i>${esc(data().byId[id].ko)}</button>`).join("")}</div>
      <div class="ps-why" id="ps-why" aria-live="polite"></div>
    </div>`;
  };
  const pick = (n) => {
    const s = S.steps[S.i];
    if (s?.k !== "quiz" || picked !== null || !opts[n]) return;
    picked = n;
    const c = data().byId[s.id], ok = opts[n] === c.id;
    if (ok) S.right++;
    quizDone(ok);
    host.querySelectorAll("[data-opt]").forEach((b, k) => { b.disabled = true; if (opts[k] === c.id) b.classList.add("right"); else if (k === n) b.classList.add("wrong"); });
    host.querySelector("#ps-why").innerHTML = `<p>${ok ? "맞아요" : "아쉬워요"} — 정답: <b class="ps-acc">${esc(c.ko)}</b>. ${esc(c.line)}${c.counter ? ` 막는 법: ${esc(c.counter)}` : ""}</p>
      <p class="ps-chips">${link(c.id)}</p><button type="button" class="ps-btn ps-primary" data-next>다음 <i>↵</i></button>`;
    env.right(`Q ${S.steps.filter((x) => x.k === "quiz").indexOf(s) + 1} / ${S.steps.filter((x) => x.k === "quiz").length} · ✓ ${S.right}`);
    host.querySelector("[data-next]").focus();
  };
  const next = () => { S.i++; draw(); env.top(); };
  host.addEventListener("click", (e) => {
    const r = e.target.closest("[data-rate]"); if (r) { rate(S.steps[S.i].id, +r.dataset.rate); next(); return; }
    const o = e.target.closest("[data-opt]"); if (o) { pick(+o.dataset.opt); return; }
    if (e.target.closest("[data-next]")) next();
  });
  draw();
  return env.keys((e) => {
    const s = S.steps[S.i];
    if (s?.k === "card" && "123".includes(e.key)) { e.preventDefault(); rate(s.id, +e.key); next(); }
    else if (s?.k === "quiz" && picked === null && "1234".includes(e.key)) { e.preventDefault(); pick(+e.key - 1); }
    else if (s?.k === "quiz" && picked !== null && e.key === "Enter" && !e.target.closest?.("button")) { e.preventDefault(); next(); }
  });
}

// ── SPAR 말싸움 연습 ──
const sparApi = (body) => (api.psySpar ? api.psySpar(body) : fetch("/api/apps/psy/spar", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-trio": "1" }, body: JSON.stringify(body) }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || "AI 가 답하지 못했어요."), { status: r.status }); return j; }));
const MAX_TURNS = 5;
export function spar(host, r, env) {
  const D = data(), sc = D.scenarios.find((s) => s.id === r.id);
  if (!sc) {
    env.crumb("/ SPAR · 상황 고르기");
    const past = st()?.spar || [];
    host.innerHTML = `<div class="ps-list"><header class="ps-list-h"><span class="ps-k">USE</span><h1>어떤 상황에서 연습할까요?</h1><span class="ps-k">AI 상대와 ${MAX_TURNS}턴 · 기법을 쓰면 점수가 올라요</span></header>
      <div class="ps-scn">${D.scenarios.map((s) => { const best = Math.max(-1, ...past.filter((p) => p.scenario === s.id).map((p) => p.score)); return `<a class="ps-tile" href="#/psy/spar/${esc(s.id)}"><span class="ps-k">${esc(s.role)}</span><span class="ps-tile-ko">${esc(s.title)}</span><span class="ps-sub">목표: ${esc(s.goal)}</span><span class="ps-k">${best >= 0 ? "BEST " + best : "NEW"}</span></a>`; }).join("")}</div></div>`;
    return;
  }
  env.crumb(`/ SPAR · ${esc(sc.title)} · 상대: ${esc(sc.role)}`);
  const turns = [{ who: "ai", text: sc.opener, moves: [] }];
  let score = null, mine = [], theirs = [], missed = null, busy = false, saved = false;
  const myN = () => turns.filter((t) => t.who === "me").length;
  const tags = (ids, cls) => (ids?.length ? `<span class="ps-k ${cls}">${ids.map((id) => esc(D.byId[id]?.ko || id)).join(" · ")}</span>` : "");
  host.innerHTML = `<div class="ps-spar">
    <section class="ps-chat"><div class="ps-msgs" id="ps-msgs" aria-live="polite"></div>
      <form class="ps-send" id="ps-send"><label class="ps-grow"><span class="ps-vh">내 답</span><input type="text" id="ps-in" maxlength="600" placeholder="반박을 써 보세요" autocomplete="off"></label><button type="submit" class="ps-btn ps-primary">보내기</button></form></section>
    <aside class="ps-panel" id="ps-panel"></aside></div>`;
  const msgs = host.querySelector("#ps-msgs"), input = host.querySelector("#ps-in"), panel = host.querySelector("#ps-panel");
  const draw = () => {
    env.right(`TURN ${Math.min(myN() + 1, MAX_TURNS)} / ${MAX_TURNS}`);
    env.line(myN() / MAX_TURNS);
    msgs.innerHTML = turns.map((t) => `<div class="ps-msg ${t.who}"><span class="ps-k">${t.who === "ai" ? "AI" : "나"}</span><p>${esc(t.text)}</p>${t.who === "ai" ? tags(t.moves, "ps-ai") : t.moves?.length ? `<span class="ps-k ps-acc">${t.moves.map((id) => esc(D.byId[id]?.ko || id)).join(" · ")} →</span>` : ""}</div>`).join("") + (busy ? `<div class="ps-msg ai"><span class="ps-k">AI</span><p class="ps-wait">…</p></div>` : "");
    msgs.lastElementChild?.scrollIntoView?.({ block: "nearest" });
    panel.innerHTML = `<span class="ps-k">LIVE SCORE</span><span class="ps-score">${score ?? "—"}</span>
      <div><b class="ps-acc">내가 쓴 기법</b><p class="ps-chips">${links(mine) || "아직 없어요"}</p></div>
      <div><b class="ps-ai">상대가 쓴 기법</b><p class="ps-chips">${links(theirs) || "—"}</p></div>
      <div><b>놓친 기회</b><p>${missed?.text ? esc(missed.text) + " " + link(missed.card) : "—"}</p></div>
      ${myN() >= MAX_TURNS ? `<p><a class="ps-btn ps-primary" href="#/psy/spar/${esc(sc.id)}" data-again>다시</a> <a class="ps-btn" href="#/psy/spar">다른 상황</a></p>` : ""}`;
    const end = myN() >= MAX_TURNS;
    input.disabled = busy || end; input.placeholder = end ? "끝났어요 — 옆 점수를 보세요" : "반박을 써 보세요";
  };
  const send = async (text) => {
    if (busy || !text || myN() >= MAX_TURNS) return;
    turns.push({ who: "me", text, moves: [] });
    busy = true; input.value = ""; draw();
    try {
      const j = await sparApi({ scenario: sc.id, turns: turns.map(({ who, text }) => ({ who, text })) });
      turns[turns.length - 1].moves = (j.my_moves || []).filter((id) => D.byId[id]);
      turns.push({ who: "ai", text: j.reply || "…", moves: (j.ai_moves || []).filter((id) => D.byId[id]) });
      for (const id of turns.at(-1).moves) if (!theirs.includes(id)) theirs.push(id);
      for (const id of turns.at(-2).moves) if (!mine.includes(id)) mine.push(id);
      if (Number.isFinite(+j.score)) score = Math.max(0, Math.min(100, Math.round(+j.score)));
      missed = j.missed?.text ? j.missed : missed;
    } catch (e) {
      turns.pop(); input.value = text;
      env.toast(e.status === 429 ? "오늘 말싸움 횟수를 다 썼어요. 내일 다시!" : e.message || "AI 가 답하지 못했어요.");
    }
    busy = false; draw();
    if (myN() >= MAX_TURNS && score != null && !saved) { saved = true; sparDone(sc.id, score); }
    if (!input.disabled) input.focus();
  };
  host.querySelector("#ps-send").addEventListener("submit", (e) => { e.preventDefault(); send(input.value.trim()); });
  host.addEventListener("click", (e) => { if (e.target.closest("[data-again]")) { e.preventDefault(); env.remount(); } });
  draw();
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

// ── 영상 ──
export function videos(host, r, env) {
  const D = data();
  env.crumb("/ VIDEO");
  const one = r.id && D.vById[r.id];
  const row = (v, open) => `<article class="ps-vid${open ? " open" : ""}" id="v-${esc(v.id)}">
    <div class="ps-vframe" data-yt="${esc(v.id)}">${open ? `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?rel=0" title="${esc(v.title)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>` : `<button type="button" class="ps-play" aria-label="${esc(v.title)} 재생"><img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt="" loading="lazy"><span>▶</span></button>`}</div>
    <div class="ps-vtext"><span class="ps-k">${esc(v.channel || "")} · ${esc((v.lang || "").toUpperCase())}${v.mins ? ` · ${v.mins}MIN` : ""}${v.kind ? ` · ${esc(v.kind)}` : ""}</span>
      <h2>${esc(v.title)}</h2><p>${esc(v.why || "")}</p><p class="ps-chips">${links(v.covers)}</p></div></article>`;
  host.innerHTML = `<div class="ps-list"><header class="ps-list-h"><span class="ps-k">${D.videos.length} VIDEOS</span><h1>영상으로 보기</h1></header>
    ${one ? row(one, true) : ""}${D.videos.filter((v) => v !== one).map((v) => row(v, false)).join("")}</div>`;
  host.addEventListener("click", (e) => {
    const b = e.target.closest(".ps-play"); if (!b) return;
    const f = b.closest("[data-yt]"), id = f.dataset.yt, v = D.vById[id];
    f.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&autoplay=1" title="${esc(v?.title || "")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    f.closest(".ps-vid").classList.add("open");
  });
}

// ── 서재 ──
export function library(host, r, env) {
  const D = data(), b = r.id && bookOf(r.id);
  if (b) {
    env.crumb(`/ <a href="#/psy/library">LIBRARY</a> / ${esc(b.ko)}`);
    const cs = (b.cards || []).map((id) => D.byId[id]).filter(Boolean);
    host.innerHTML = `<div class="ps-list"><header class="ps-list-h"><span class="ps-k">${esc(b.en)} · ${esc(b.author)} · ${esc(b.year)}</span><h1>${esc(b.ko)}</h1><p class="ps-sub">${esc(b.why || "")}</p></header>
      <ol>${cs.map((c, i) => `<li><div class="ps-prin"><span class="ps-k">${pad(i + 1)}</span><span class="ps-li-ko"><a href="#/psy/c/${esc(c.id)}">${esc(c.ko)}</a><small>${esc(c.line)}</small></span><span class="ps-chips">${links(c.related)}</span></div></li>`).join("") || `<li class="ps-sub">원칙 카드를 준비 중이에요.</li>`}</ol></div>`;
    return;
  }
  env.crumb("/ LIBRARY · 서재");
  const shelves = [...new Set(D.books.map((x) => x.shelf || ""))];
  host.innerHTML = `<div class="ps-list"><header class="ps-list-h"><span class="ps-k">${D.books.length} BOOKS</span><h1>서재</h1><p class="ps-sub">책의 원칙 카드가 기법 카드로 이어져요.</p></header>
    ${shelves.map((s) => `<section class="ps-shelf"><span class="ps-k">${esc((trackOf(s)?.en || s || "ETC").toUpperCase())}</span><div class="ps-books">${D.books.filter((x) => (x.shelf || "") === s).map((x) => `<a class="ps-book" href="#/psy/library/${esc(x.id)}"><span class="ps-k">${esc(x.en)}</span><b>${esc(x.ko)}</b><span class="ps-k">${esc(x.author)} · ${esc(x.year)}</span></a>`).join("")}</div></section>`).join("")}</div>`;
}

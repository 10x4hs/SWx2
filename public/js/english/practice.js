// 영어 · 연습 — 카드 묶음(덱) 8개 + 스몰토크 대본.
// 옵시디언 규칙 "답 가리고 먼저 떠올린다": 한국어(뜻)만 보고 먼저 말해 본 뒤 → 영어 보기 → 몰랐어요/알았어요 (Leitner 상자).
import { api } from "../api.js";
import { $, $$, esc, toast } from "../util.js";
import { icon } from "../icons.js";
import { position, taskFor, sentenceRange, weekPatterns, todayKey } from "./data.js";
import { speak, stopSpeaking, canSpeak, canListen, listen, overlap, getRate, setRate, speakerIcon, micIcon } from "./speech.js";

const MAX = 20; // 한 번에 보는 카드 수
const dueKey = (d) => (d == null ? null : typeof d === "number" ? new Date(d).toISOString().slice(0, 10) : String(d).slice(0, 10));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 자료 → 카드 { id, front, sub, back, extra[], say, target }
const C = {
  s: (s) => ({ id: `s:${s.n}`, front: s.ko, sub: `생존 문장 ${s.n}${s.group ? " · " + s.group : ""}`, back: s.en, extra: [], say: s.en }),
  p: (p) => ({ id: `p:${p.id}`, front: p.meaning, sub: `패턴 ${p.id}${p.group ? " · " + p.group : ""}`, back: p.pattern, extra: p.example ? [["예문", p.example]] : [], say: p.example || p.pattern, target: p.example || p.pattern }),
  f: (f) => ({ id: `f:${f.id}`, front: f.ko, sub: f.when ? `언제: ${f.when}` : "시간 벌기", back: f.en, extra: [], say: f.en }),
  r: (r) => ({ id: `r:${r.id}`, front: r.ko, sub: r.when ? `언제: ${r.when}` : "압박 표현", back: r.en, extra: [["효과", r.effect], ["왜", r.why]].filter((e) => e[1]), extraKo: true, say: r.en }),
  x: (x) => ({ id: `x:${x.id}`, front: x.expr, frontEn: true, sub: "진짜 뜻은? 들리는 대로가 아닐 수 있어요", back: x.means, backKo: true, extra: [["이렇게 들리지만", x.sounds], ...(x.reply ? [["이렇게 받아요", x.reply]] : [])].filter((e) => e[1]), say: x.reply || x.expr, target: x.reply || x.expr }),
  ph: (p) => ({ id: `ph:${p.id}`, front: p.ko, sub: `내가 막힌 표현${p.day ? " · " + String(p.day).slice(5).replace("-", ".") : ""}`, back: p.en || "(아직 영어를 안 적었어요)", extra: p.chunk ? [["덩어리", p.chunk]] : [], say: p.en || "" }),
};

export function mountPractice(el, { data, deck: startDeck }) {
  const tk = todayKey(), pos = position(data, tk);
  const S = { cards: new Map(), phrases: [], loaded: false, failed: false, sess: null, talk: 0, hideA: false, talkPlaying: false };
  let alive = true, stopRec = null;

  function decks() {
    const todayNums = sentenceRange(taskFor(data, tk));
    const w2 = data.stage2_weeks.find((w) => w.from <= tk && tk <= w.to);
    const wp = weekPatterns(data, w2 ? +w2.week : pos.week);
    return [
      { key: "today", name: "오늘의 생존 문장", cards: todayNums.map((n) => data.sentences.find((s) => +s.n === n)).filter(Boolean).map(C.s), empty: "오늘은 새 생존 문장이 없어요." },
      { key: "s60", name: `생존 문장 ${data.sentences.length || 60}`, cards: data.sentences.map(C.s) },
      { key: "week", name: "이번 주 패턴", cards: wp.list.map(C.p), empty: wp.next ? `패턴은 ${wp.next}주차부터 나와요.` : "이번 주 패턴이 없어요." },
      { key: "p91", name: `기초 패턴 ${data.patterns.length || 91}`, cards: data.patterns.map(C.p) },
      { key: "fill", name: "시간 벌기", cards: data.fillers.map(C.f), hint: "말이 막힐 때 입을 계속 여는 표현" },
      { key: "press", name: "압박 표현", cards: data.pressure.map(C.r), hint: "못 알아들었을 때 · 되물을 때" },
      { key: "ff", name: "헷갈리는 표현", cards: data.false_friends.map(C.x), hint: "영어를 보고 진짜 뜻 떠올리기" },
      { key: "mine", name: "내가 막힌 표현", cards: S.phrases.map(C.ph), empty: "오늘 탭이나 막힌 표현 탭에서 넣어 봐요." },
    ];
  }
  const isDue = (id) => { const c = S.cards.get(id); return !c || !c.due || dueKey(c.due) <= tk; };
  const dueOf = (cards) => cards.filter((c) => isDue(c.id));

  // ---------- 덱 목록 ----------
  function drawHome() {
    const ds = decks();
    el.innerHTML = `
      <section class="panel" aria-labelledby="en-decks-t">
        <div class="panel-head"><h2 class="h2" id="en-decks-t">카드로 떠올리기</h2><span class="faint en-status">${S.failed ? "복습 기록을 못 불러왔어요 · 모든 카드를 새 카드로 보여줘요" : S.loaded ? "답 가리고 먼저 떠올린다" : "복습 기록 불러오는 중…"}</span></div>
        <div class="en-decks">${ds.map((d) => {
          const due = dueOf(d.cards).length, n = d.cards.length;
          return `<button type="button" class="en-deck" data-deck="${d.key}" ${n ? "" : "disabled"}>
            <b>${esc(d.name)}</b>
            <span class="s">${n ? `${n}장${d.hint ? " · " + esc(d.hint) : ""}` : esc(d.empty || "카드가 없어요")}</span>
            ${n ? `<span class="due${due ? "" : " none"}">${due ? `복습할 카드 ${due}` : "오늘 복습 끝"}</span>` : ""}
          </button>`;
        }).join("")}</div>
        <p class="en-help">카드를 누르면 복습할 카드부터 최대 ${MAX}장. 다 끝낸 묶음은 섞어서 다시 볼 수 있어요. 키보드: <kbd>Space</kbd> 영어 보기 · <kbd>1</kbd> 몰랐어요 · <kbd>2</kbd> 알았어요</p>
      </section>
      <section class="panel en-talk" id="en-talk" aria-labelledby="en-talk-t"></section>`;
    drawTalk();
  }

  // ---------- 카드 한 판 ----------
  function start(key, all = false) {
    const d = decks().find((x) => x.key === key);
    if (!d || !d.cards.length) return;
    let q = dueOf(d.cards);
    q.sort((a, b) => (dueKey(S.cards.get(a.id)?.due) || "0").localeCompare(dueKey(S.cards.get(b.id)?.due) || "0"));
    if (all || !q.length) { if (!all) toast("복습할 카드가 없어서 전부 섞어서 보여줘요."); q = shuffle(d.cards); }
    S.sess = { deck: d, queue: q.slice(0, MAX), i: 0, shown: false, good: 0, again: 0, retried: new Set(), said: null, listening: false };
    drawCard();
  }
  function drawCard() {
    stopRec?.(); stopRec = null;
    const s = S.sess, c = s.queue[s.i];
    if (!c) return drawDone();
    const info = S.cards.get(c.id);
    const meta = info ? `상자 ${info.box ?? 1} · ${info.reps ?? 0}번 봄` : "처음 보는 카드";
    const rate = getRate();
    el.innerHTML = `
      <section class="panel en-fc" aria-label="${esc(s.deck.name)} 카드">
        <div class="panel-head">
          <button class="btn ghost sm" type="button" data-back>${icon.left(14)}덱으로</button>
          <span class="faint">${esc(s.deck.name)} · ${s.i + 1} / ${s.queue.length}</span>
        </div>
        <div class="en-prog" aria-hidden="true"><i style="width:${(s.i / s.queue.length) * 100}%"></i></div>
        <div class="en-card" aria-live="polite">
          <p class="sub">${esc(c.sub || "")}</p>
          <p class="front"${c.frontEn ? ' lang="en"' : ""}>${esc(c.front)}</p>
          ${s.shown ? `
            <div class="back">
              <p class="en"${c.backKo ? "" : ' lang="en"'}>${esc(c.back)}</p>
              ${c.extra.map(([k, v]) => `<p class="ex"><span>${esc(k)}</span><b${c.extraKo || /[ㄱ-힣]/.test(v) ? "" : ' lang="en"'}>${esc(v)}</b></p>`).join("")}
              <div class="row en-voice">
                ${canSpeak() && c.say ? `<button class="btn ghost sm" type="button" data-say>${speakerIcon(15)}듣기</button>
                  <div class="seg sm" role="radiogroup" aria-label="읽는 빠르기">${[0.8, 1].map((r) => `<button type="button" role="radio" aria-checked="${r === rate}" data-rate="${r}">${r === 1 ? "1.0" : r}배</button>`).join("")}</div>` : ""}
                ${canListen() && (c.target || c.say) ? `<button class="btn ghost sm" type="button" data-listen aria-pressed="${s.listening}">${s.listening ? `<span class="stop-sq"></span>멈추기` : `${micIcon(15)}따라 말하기`}</button>` : ""}
              </div>
              ${s.said != null ? `<p class="en-said"><span>들린 말</span><b lang="en">${esc(s.said || "…")}</b>${!s.listening && s.said ? `<em>맞은 단어 ${overlap(c.target || c.say, s.said)}%</em>` : ""}</p>` : ""}
            </div>` : `<p class="en-hint">먼저 입으로 말해 보세요. 그다음 영어를 확인해요.</p>`}
          <p class="meta">${esc(meta)}</p>
        </div>
        <div class="en-fc-act">${s.shown
          ? `<button class="btn ghost" type="button" data-res="again">몰랐어요 <kbd>1</kbd></button><button class="btn accent" type="button" data-res="good">알았어요 <kbd>2</kbd></button>`
          : `<button class="btn accent" type="button" data-reveal>${c.backKo ? "뜻 보기" : "영어 보기"} <kbd>Space</kbd></button>`}</div>
      </section>`;
  }
  function drawDone() {
    const s = S.sess;
    el.innerHTML = `
      <section class="panel en-fc" aria-label="끝">
        <div class="en-card done">
          <p class="front">한 판 끝!</p>
          <p class="sub">알았어요 ${s.good} · 몰랐어요 ${s.again}${s.again ? " — 몰랐던 카드는 내일 다시 나와요" : ""}</p>
        </div>
        <div class="en-fc-act">
          <button class="btn ghost" type="button" data-back>${icon.left(14)}덱으로</button>
          <button class="btn accent" type="button" data-again-deck>한 번 더 (섞어서)</button>
        </div>
      </section>`;
  }
  function reveal() { const s = S.sess; if (!s || s.shown || !s.queue[s.i]) return; s.shown = true; drawCard(); const c = s.queue[s.i]; if (c.say && canSpeak()) speak(c.say); }
  async function answer(result) {
    const s = S.sess, c = s?.queue[s.i];
    if (!c || !s.shown) return;
    stopSpeaking();
    if (result === "good") s.good++; else { s.again++; if (!s.retried.has(c.id)) { s.retried.add(c.id); s.queue.push(c); } } // 몰랐던 카드는 이번 판 끝에 한 번 더
    s.i++; s.shown = false; s.said = null; s.listening = false;
    drawCard();
    try {
      const r = await api.reviewCard({ card_id: c.id, result, today: tk });
      if (r?.card) S.cards.set(c.id, r.card);
    } catch (e) { if (alive) toast(e.message, "err"); }
  }
  function toggleListen() {
    const s = S.sess, c = s?.queue[s.i];
    if (!c) return;
    if (s.listening) { stopRec?.(); return; }
    stopSpeaking();
    s.listening = true; s.said = ""; drawCard();
    stopRec = listen({
      onText: (t) => { if (S.sess !== s) return; s.said = t; const b = $(".en-said b", el); if (b) b.textContent = t || "…"; },
      onEnd: () => { if (S.sess !== s || !alive) return; s.listening = false; stopRec = null; drawCard(); },
      onError: (m) => { toast(m, "err"); },
    });
  }

  // ---------- 스몰토크 대본 ----------
  function drawTalk() {
    const box = $("#en-talk", el);
    if (!box) return;
    const list = data.smalltalk;
    if (!list.length) { box.innerHTML = `<div class="panel-head"><h2 class="h2" id="en-talk-t">스몰토크 대본</h2></div><p class="empty">대본이 자료에 없어요.</p>`; return; }
    const t = list[Math.min(S.talk, list.length - 1)];
    box.innerHTML = `
      <div class="panel-head">
        <h2 class="h2" id="en-talk-t">스몰토크 대본</h2>
        <div class="row">
          <label class="switch"><input type="checkbox" id="en-hideA" ${S.hideA ? "checked" : ""}><span></span>내 역할(A) 가리기</label>
          ${canSpeak() ? `<button class="btn ghost sm" type="button" data-talkplay>${S.talkPlaying ? `<span class="stop-sq"></span>멈추기` : `${icon.play(12)}처음부터 듣기`}</button>` : ""}
        </div>
      </div>
      <div class="en-chips" role="tablist" aria-label="대본 고르기">${list.map((x, i) => `<button type="button" role="tab" class="chip${i === S.talk ? " on" : ""}" aria-selected="${i === S.talk}" data-talk="${i}">${esc(x.title)}</button>`).join("")}</div>
      <ol class="en-lines${S.hideA ? " hide-a" : ""}">${(t.lines || []).map((l, i) => `
        <li class="${t.kind !== "dialog" || String(l.who).toUpperCase() === "A" ? "mine" : "other"}${String(l.who || "").length > 1 ? " long" : ""}" data-line="${i}">
          <span class="who">${esc(l.who)}</span>
          <div class="tx"><b lang="en" tabindex="0">${esc(l.en)}</b><span>${esc(l.ko)}</span></div>
          ${canSpeak() ? `<button class="icon-btn sm" type="button" data-sayline="${i}" aria-label="이 줄 듣기">${speakerIcon()}</button>` : ""}
        </li>`).join("")}</ol>
      <p class="en-help">${S.hideA ? "내 줄은 한국어만 보여요. 먼저 영어로 말해 보고, 줄을 누르면 영어가 보여요." : t.kind === "dialog" ? "B(상대) 줄을 듣고, A(나) 줄을 소리 내어 따라 해요." : "한 줄씩 듣고 소리 내어 따라 해요."}</p>`;
  }
  async function playTalk() {
    if (S.talkPlaying) { S.talkPlaying = false; stopSpeaking(); drawTalk(); return; }
    const t = data.smalltalk[S.talk];
    S.talkPlaying = true; drawTalk();
    const me = S.talk;
    for (let i = 0; i < (t.lines || []).length; i++) {
      if (!alive || !S.talkPlaying || S.talk !== me) break;
      $$(".en-lines li", el).forEach((li) => li.classList.toggle("playing", +li.dataset.line === i));
      await speak(t.lines[i].en);
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!alive) return;
    S.talkPlaying = false; $$(".en-lines li", el).forEach((li) => li.classList.remove("playing"));
    drawTalk();
  }

  // ---------- 이벤트 ----------
  el.addEventListener("click", (e) => {
    const dk = e.target.closest("[data-deck]");
    if (dk) { start(dk.dataset.deck); return; }
    if (e.target.closest("[data-back]")) { stopSpeaking(); stopRec?.(); S.sess = null; drawHome(); return; }
    if (e.target.closest("[data-again-deck]")) { start(S.sess.deck.key, true); return; }
    if (e.target.closest("[data-reveal]")) { reveal(); return; }
    const res = e.target.closest("[data-res]");
    if (res) { answer(res.dataset.res); return; }
    if (e.target.closest("[data-say]")) { const c = S.sess?.queue[S.sess.i]; if (c) speak(c.say); return; }
    const rt = e.target.closest("[data-rate]");
    if (rt) { setRate(+rt.dataset.rate); $$("[data-rate]", el).forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.rate === getRate()))); const c = S.sess?.queue[S.sess.i]; if (c) speak(c.say); return; }
    if (e.target.closest("[data-listen]")) { toggleListen(); return; }
    const tb = e.target.closest("[data-talk]");
    if (tb) { S.talk = +tb.dataset.talk; S.talkPlaying = false; stopSpeaking(); drawTalk(); return; }
    if (e.target.closest("[data-talkplay]")) { playTalk(); return; }
    const sl = e.target.closest("[data-sayline]");
    if (sl) { const l = data.smalltalk[S.talk].lines[+sl.dataset.sayline]; speak(l.en); sl.closest("li").classList.add("shown"); return; }
    const line = e.target.closest(".en-lines.hide-a li.mine");
    if (line) line.classList.toggle("shown");
  });
  el.addEventListener("change", (e) => { if (e.target.id === "en-hideA") { S.hideA = e.target.checked; drawTalk(); } });
  const onKey = (e) => {
    if (!S.sess || !el.isConnected || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    if (e.key === " ") {
      if (a && a.tagName === "BUTTON") return; // 버튼에 초점이 있으면 그 버튼을 눌러요
      if (!S.sess.shown && S.sess.queue[S.sess.i]) { e.preventDefault(); reveal(); } }
    else if (e.key === "1") { e.preventDefault(); answer("again"); }
    else if (e.key === "2") { e.preventDefault(); answer("good"); }
  };
  document.addEventListener("keydown", onKey);

  drawHome();
  Promise.allSettled([api.cards(), api.phrases()]).then(([c, p]) => {
    if (!alive) return;
    if (c.status === "fulfilled") { S.cards = new Map((c.value.cards || []).map((x) => [x.card_id, x])); S.loaded = true; }
    else { S.failed = true; toast(c.reason?.message || "복습 기록을 불러오지 못했어요.", "err"); }
    if (p.status === "fulfilled") S.phrases = p.value.phrases || [];
    if (startDeck && decks().some((d) => d.key === startDeck && d.cards.length)) start(startDeck);
    else if (!S.sess) drawHome();
  });

  return () => { alive = false; stopRec?.(); stopSpeaking(); document.removeEventListener("keydown", onKey); };
}

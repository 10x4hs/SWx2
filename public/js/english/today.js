// 영어 · 오늘 — 블록 링 + 블록별 시간(스톱워치 · +5/+10 · 직접 입력) + 오늘 과제 + 하루 점검. 자동 저장.
import { api } from "../api.js";
import { $, $$, esc, debounce, nowTime, toast, parseYmd, addDays, ymd, DOW } from "../util.js";
import { icon } from "../icons.js";
import { renderMarkdown } from "../md.js";
import { position, targetsFor, taskFor, sentenceRange, sprintLabel, todayKey, store } from "./data.js";
import { blockRing } from "./charts.js";
import { speak, stopSpeaking, canSpeak, speakerIcon } from "./speech.js";

const SW_KEY = "trio-en-sw"; // 켜 둔 스톱워치 { day, block, at }
const MOODS = ["좋음", "보통", "나쁨"];
const blank = () => ({ blocks: {}, checks: [], newwords: 0, mistakes: 0, mood: null, sentence: "", note: "" });
const intOr0 = (v) => Math.max(0, Math.min(999, Math.round(+v || 0)));
const dayLabel = (k) => { const d = parseYmd(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`; };

export function mountToday(el, { data, day: initDay }) {
  const tk = todayKey();
  let sw = store.get(SW_KEY);
  if (sw && (Date.now() - sw.at > 6 * 3600e3 || !sw.block)) { sw = null; store.set(SW_KEY, null); } // 6시간 넘게 켜 둔 건 버려요
  const S = { day: initDay && initDay <= tk ? initDay : sw?.day || tk, rec: blank(), loaded: false, failed: false, seq: 0 };
  let alive = true, tick = null;

  el.innerHTML = `
    <div class="en-today">
      <div class="stack">
        <section class="panel en-blocks" aria-labelledby="en-day-t">
          <div class="panel-head">
            <div class="pager">
              <button class="icon-btn sm" type="button" data-shift="-1" aria-label="전날">${icon.left(16)}</button>
              <h2 class="h2" id="en-day-t"></h2>
              <button class="icon-btn sm" type="button" data-shift="1" aria-label="다음날">${icon.right(16)}</button>
            </div>
            <span class="faint en-status" id="en-status" aria-live="polite">불러오는 중…</span>
          </div>
          <div class="en-chart" id="en-ring"></div>
          <div class="en-rows" id="en-rows"></div>
          <p class="en-help">스톱워치로 재거나 +5 · +10 을 누르거나 분을 직접 적어요. 소리와 말하기는 <b>입 연 시간</b>으로 따로 세요.</p>
        </section>
        <section class="panel" aria-labelledby="en-check-t">
          <div class="panel-head"><h2 class="h2" id="en-check-t">하루 점검</h2></div>
          <ul class="en-checks" id="en-checks"></ul>
          <div class="en-nums">
            <label><span>새 단어</span><input class="input" type="number" min="0" max="999" inputmode="numeric" id="en-newwords"></label>
            <label><span>틀린 수</span><input class="input" type="number" min="0" max="999" inputmode="numeric" id="en-mistakes"></label>
            <div class="en-mood"><span>컨디션</span><div class="seg" role="radiogroup" aria-label="컨디션" id="en-mood">
              ${MOODS.map((m) => `<button type="button" role="radio" aria-checked="false" data-mood="${m}">${m}</button>`).join("")}</div></div>
          </div>
          <label class="en-field"><span>오늘의 한 문장</span><input class="input" id="en-sentence" maxlength="300" placeholder="오늘 입으로 만든 영어 문장 하나" lang="en"></label>
          <label class="en-field"><span>메모</span><textarea class="input en-note" id="en-note" rows="3" maxlength="2000" placeholder="잘된 것, 막힌 것, 내일 할 것"></textarea></label>
        </section>
      </div>
      <div class="stack">
        <section class="panel en-task" id="en-task" aria-label="오늘 할 일"></section>
        <section class="panel" aria-labelledby="en-qp-t">
          <div class="panel-head"><h2 class="h2" id="en-qp-t">막힌 표현 추가</h2><a class="btn ghost sm" href="#/english/phrases">모두 보기</a></div>
          <form class="en-qp" id="en-qp">
            <input class="input" name="ko" maxlength="200" placeholder="하고 싶었던 말 (한국어)" required>
            <input class="input" name="en" maxlength="300" placeholder="영어로는? (몰라도 비워 둬요)" lang="en">
            <button class="btn accent" type="submit">${icon.plus(14)}넣기</button>
          </form>
          <p class="en-help">말하다 막힌 표현을 적어 두면 연습 탭의 <b>내가 막힌 표현</b> 카드가 돼요.</p>
        </section>
      </div>
    </div>`;

  const status = (t) => { const s = $("#en-status", el); if (s) s.textContent = t; };

  // ---------- 그리기 ----------
  const liveMin = (k) => (sw && sw.day === S.day && sw.block === k ? Math.floor((Date.now() - sw.at) / 60000) : 0);
  function blocks() {
    return targetsFor(data, S.day).map((b) => ({ ...b, actual: intOr0(S.rec.blocks[b.key]), live: liveMin(b.key) }));
  }
  function drawRing() {
    const box = $("#en-ring", el);
    if (!box) return;
    const bs = blocks();
    box.innerHTML = bs.length ? blockRing(bs, box.clientWidth || 360) : `<p class="empty">이 날의 블록 목표가 자료에 없어요.</p>`;
  }
  function swText(k) {
    if (!(sw && sw.day === S.day && sw.block === k)) return `${icon.play(13)}재기`;
    const s = Math.floor((Date.now() - sw.at) / 1000);
    return `<span class="stop-sq"></span>${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function drawRows() {
    const bs = blocks();
    $("#en-rows", el).innerHTML = bs.map((b) => `
      <div class="en-block${liveMin(b.key) || (sw && sw.day === S.day && sw.block === b.key) ? " running" : ""}" data-block="${b.key}" style="--c:${b.color}">
        <i class="key" aria-hidden="true"></i>
        <div class="nm"><b>${esc(b.n)} ${esc(b.name)}</b><span>목표 ${b.target}분${b.actual >= b.target ? " · 다 채움" : ""}</span></div>
        <div class="ctl">
          <button class="btn ghost sm" type="button" data-add="5" aria-label="${esc(b.name)} 5분 더하기">+5</button>
          <button class="btn ghost sm" type="button" data-add="10" aria-label="${esc(b.name)} 10분 더하기">+10</button>
          <label class="en-min"><input class="input" type="number" min="0" max="999" inputmode="numeric" value="${b.actual}" data-min aria-label="${esc(b.name)} 분"><span>분</span></label>
          <button class="btn sm en-sw${sw && sw.day === S.day && sw.block === b.key ? "" : " ghost"}" type="button" data-sw aria-pressed="${sw && sw.day === S.day && sw.block === b.key}" aria-label="${esc(b.name)} 스톱워치">${swText(b.key)}</button>
        </div>
      </div>`).join("");
  }
  function drawHead() {
    $("#en-day-t", el).textContent = S.day === tk ? `오늘 · ${dayLabel(S.day)}` : dayLabel(S.day);
    $('[data-shift="1"]', el).disabled = S.day >= tk;
    $('[data-shift="-1"]', el).disabled = !!data.program.start && S.day <= data.program.start;
  }
  function drawChecks() {
    const list = data.daily_checks;
    $("#en-checks", el).innerHTML = list.length
      ? list.map((c, i) => `<li><label><input type="checkbox" class="en-ck" data-ck="${i}" ${S.rec.checks[i] ? "checked" : ""}><span>${esc(c)}</span></label></li>`).join("")
      : `<li class="faint">점검 항목이 자료에 없어요.</li>`;
  }
  function drawFields() {
    $("#en-newwords", el).value = S.rec.newwords || "";
    $("#en-mistakes", el).value = S.rec.mistakes || "";
    $("#en-sentence", el).value = S.rec.sentence || "";
    $("#en-note", el).value = S.rec.note || "";
    $$("[data-mood]", el).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mood === S.rec.mood)));
  }
  function drawTask() {
    const box = $("#en-task", el), pos = position(data, S.day), task = taskFor(data, S.day);
    const note = pos.sprint && data.stage_notes[pos.sprint.id];
    const noteHtml = note ? `<details class="en-note-md"><summary>${esc(sprintLabel(pos.sprint))} 단계 안내</summary><div class="md">${renderMarkdown(note)}</div></details>` : "";
    if (!task) {
      box.innerHTML = `<div class="panel-head"><h2 class="h2">오늘 할 일</h2></div><p class="empty">${pos.before ? "아직 프로그램 시작 전이에요." : "이 날은 따로 정해진 과제가 없어요. 아래 단계 안내를 따라요."}</p>${noteHtml}`;
      return;
    }
    if (task.kind === "day") {
      const nums = sentenceRange(task), list = nums.map((n) => data.sentences.find((s) => +s.n === n)).filter(Boolean);
      box.innerHTML = `
        <div class="panel-head"><h2 class="h2">오늘 할 일</h2><span class="faint">W${esc(task.week)} · Day ${esc(task.day)}</span></div>
        ${task.week_title ? `<p class="en-wt">${esc(task.week_title)}</p>` : ""}
        ${task.task ? `<div class="en-block-task"><span class="en-tag">② 소리</span><div class="md">${renderMarkdown(String(task.task))}</div></div>` : ""}
        ${list.length ? `
          <div class="panel-head en-sh"><h3>${esc(task.sentences_label || "오늘의 생존 문장")}</h3>
            <div class="row">${canSpeak() ? `<button class="btn ghost sm" type="button" data-playall>${icon.play(12)}모두 듣기</button>` : ""}<a class="btn ghost sm" href="#/english/practice/today">카드로 외우기</a></div></div>
          <ol class="en-sents">${list.map((s) => sentLi(s)).join("")}</ol>
          <p class="en-help">답 가리고 먼저 떠올린다 — 한국어를 보고 영어를 입으로 먼저 말해 본 뒤 들어 봐요.</p>` : ""}
        ${noteHtml}`;
    } else {
      const pats = Array.isArray(task.patterns)
        ? task.patterns.map((id) => data.patterns.find((p) => p.id === id)).filter(Boolean).map((p) => `${p.pattern} — ${p.meaning}`).join("\n")
        : task.patterns;
      const row = (label, v) => (v ? `<div class="en-block-task"><span class="en-tag">${label}</span><div class="md">${renderMarkdown(Array.isArray(v) ? v.join("\n") : String(v))}</div></div>` : "");
      box.innerHTML = `
        <div class="panel-head"><h2 class="h2">이번 주 할 일</h2><span class="faint">W${esc(task.week)}${task.from ? ` · ${esc(task.from.slice(5).replace("-", "."))}–${esc(String(task.to || "").slice(5).replace("-", "."))}` : ""}</span></div>
        ${row("④ 패턴", pats)}${row("② 입력", task.input)}${row("③ 말하기", task.speaking)}${row("① Anki", task.anki)}
        <div class="row"><a class="btn ghost sm" href="#/english/practice/week">이번 주 패턴 카드</a></div>
        ${noteHtml}`;
    }
  }
  const sentLi = (s) => `<li><span class="n">${esc(s.n)}</span><div class="tx"><b lang="en">${esc(s.en)}</b><span>${esc(s.ko)}</span></div>
    ${canSpeak() ? `<button class="icon-btn sm en-say" type="button" data-say="${esc(s.en)}" aria-label="듣기: ${esc(s.en)}">${speakerIcon()}</button>` : ""}</li>`;

  function drawAll() { drawHead(); drawRows(); drawRing(); drawChecks(); drawFields(); drawTask(); }

  // ---------- 불러오기 · 저장 ----------
  async function load() {
    const my = ++S.seq;
    S.loaded = false; S.failed = false; S.dirty = false; S.rec = blank();
    drawAll(); status("불러오는 중…");
    try {
      const { day } = await api.englishDay(S.day);
      if (!alive || my !== S.seq) return;
      if (day) S.rec = { ...blank(), ...day, blocks: { ...(day.blocks || {}) }, checks: Array.isArray(day.checks) ? day.checks : [] };
      S.loaded = true;
      status(day ? `저장됨${day.updated_at ? " " + hhmm(day.updated_at) : ""}` : "아직 기록이 없어요");
      drawAll();
    } catch (e) {
      if (!alive || my !== S.seq) return;
      S.failed = true;
      status("기록을 불러오지 못했어요 · 다시 시도하려면 날짜를 눌러요");
      toast(e.message, "err");
    }
  }
  const hhmm = (t) => { const d = new Date(typeof t === "number" ? t : String(t).replace(" ", "T")); return isNaN(d) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

  let chain = Promise.resolve();
  const save = debounce(() => {
    if (!S.loaded || !S.dirty) return;
    S.dirty = false;
    const r = S.rec, payload = {
      day: S.day, blocks: Object.fromEntries(Object.entries(r.blocks).map(([k, v]) => [k, intOr0(v)])),
      checks: data.daily_checks.map((_, i) => !!r.checks[i]), newwords: intOr0(r.newwords), mistakes: intOr0(r.mistakes),
      mood: r.mood || null, sentence: String(r.sentence || "").slice(0, 300), note: String(r.note || "").slice(0, 2000),
    };
    chain = chain.then(async () => {
      try { await api.saveEnglishDay(payload); if (alive && payload.day === S.day) status("저장됨 " + nowTime()); }
      catch (e) { if (alive) status("저장하지 못했어요"); toast(e.message, "err"); }
    });
  }, 800);
  const changed = () => { if (!S.loaded) { toast(S.failed ? "기록을 불러오지 못해서 저장할 수 없어요." : "불러오는 중이에요.", "err"); return false; } S.dirty = true; status("입력 중…"); save(); return true; };

  // ---------- 스톱워치 ----------
  function stopSw(commit = true) {
    if (!sw) return;
    const m = Math.round((Date.now() - sw.at) / 60000), b = sw.block, d = sw.day;
    sw = null; store.set(SW_KEY, null);
    if (commit && d === S.day) {
      if (m >= 1) { S.rec.blocks[b] = intOr0(S.rec.blocks[b]) + m; changed(); toast(`${m}분을 더했어요.`); }
      else toast("1분이 안 돼서 더하지 않았어요.");
    }
  }
  function startTick() {
    clearInterval(tick);
    let n = 0;
    tick = setInterval(() => {
      if (!sw || sw.day !== S.day) return;
      const btn = $(`[data-block="${sw.block}"] [data-sw]`, el);
      if (btn) btn.innerHTML = swText(sw.block);
      if (++n % 15 === 0) drawRing();
    }, 1000);
  }

  // ---------- 이벤트 ----------
  el.addEventListener("click", (e) => {
    const sh = e.target.closest("[data-shift]");
    if (sh) { save.flush(); const nd = ymd(addDays(parseYmd(S.day), +sh.dataset.shift)); if (nd <= tk && !(data.program.start && nd < data.program.start && nd < S.day)) { S.day = nd; load(); } return; }
    if (e.target.closest("#en-day-t") && S.failed) { load(); return; }
    const row = e.target.closest("[data-block]");
    if (row && e.target.closest("[data-add]")) {
      const k = row.dataset.block;
      S.rec.blocks[k] = intOr0(S.rec.blocks[k]) + +e.target.closest("[data-add]").dataset.add;
      if (changed()) { drawRows(); drawRing(); }
      return;
    }
    if (row && e.target.closest("[data-sw]")) {
      if (!S.loaded) { changed(); return; }
      const k = row.dataset.block, was = sw && sw.block === k && sw.day === S.day;
      stopSw(true);
      if (!was) { sw = { day: S.day, block: k, at: Date.now() }; store.set(SW_KEY, sw); }
      drawRows(); drawRing();
      return;
    }
    const mb = e.target.closest("[data-mood]");
    if (mb) { S.rec.mood = S.rec.mood === mb.dataset.mood ? null : mb.dataset.mood; if (changed()) drawFields(); return; }
    const say = e.target.closest("[data-say]");
    if (say) { speak(say.dataset.say); return; }
    if (e.target.closest("[data-playall]")) {
      const btns = $$(".en-sents [data-say]", el);
      (async () => { for (const b of btns) { if (!alive) return; b.closest("li").classList.add("playing"); await speak(b.dataset.say); b.closest("li").classList.remove("playing"); await new Promise((r) => setTimeout(r, 450)); } })();
    }
  });
  el.addEventListener("change", (e) => {
    const inp = e.target.closest("[data-min]");
    if (inp) { const k = inp.closest("[data-block]").dataset.block; S.rec.blocks[k] = intOr0(inp.value); if (changed()) { drawRows(); drawRing(); } return; }
    const ck = e.target.closest("[data-ck]");
    if (ck) { S.rec.checks[+ck.dataset.ck] = ck.checked; if (!changed()) ck.checked = !ck.checked; }
  });
  el.addEventListener("input", (e) => {
    const id = e.target.id;
    const map = { "en-newwords": "newwords", "en-mistakes": "mistakes", "en-sentence": "sentence", "en-note": "note" };
    if (map[id]) { S.rec[map[id]] = id === "en-newwords" || id === "en-mistakes" ? intOr0(e.target.value) : e.target.value; changed(); }
  });
  $("#en-qp", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, ko = f.ko.value.trim(), en = f.en.value.trim();
    if (!ko) return;
    const b = f.querySelector("button"); b.disabled = true;
    try { await api.addPhrase({ day: S.day, ko, en, chunk: "" }); f.reset(); toast("막힌 표현에 넣었어요."); }
    catch (ex) { toast(ex.message, "err"); }
    finally { b.disabled = false; }
  });

  // 폭이 바뀌면 링을 다시 (1:1 로 그려서)
  const ro = new ResizeObserver(debounce(() => alive && drawRing(), 120));
  ro.observe($("#en-ring", el));

  load();
  startTick();
  return () => { alive = false; save.flush(); clearInterval(tick); ro.disconnect(); stopSpeaking(); };
}

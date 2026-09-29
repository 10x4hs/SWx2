// 영어 · 진도 — 누적 시간 링(650시간) + 숫자 + 잔디(프로그램 전체) + 최근 14일 막대 + 다음 점검.
import { api } from "../api.js";
import { $, esc, toast, parseYmd, addDays, ymd, debounce, DOW } from "../util.js";
import { position, targetsFor, dayRange, diffDays, todayKey, mins, hours1 } from "./data.js";
import { progressRing, bars14, level } from "./charts.js";

export function mountProgress(el, { data }) {
  const tk = todayKey(), P = data.program, pos = position(data, tk);
  const goalMin = (P.goal_hours || 650) * 60;
  const S = { days: new Map(), loaded: false };
  let alive = true;

  el.innerHTML = `
    <section class="panel en-prog-top" aria-label="누적 시간">
      <div class="en-chart" id="en-pring"></div>
      <dl class="en-stats" id="en-stats"></dl>
    </section>
    <section class="panel grass-panel" aria-labelledby="en-heat-t">
      <div class="panel-head"><h2 class="h2" id="en-heat-t">날마다 공부한 시간</h2><span class="faint" id="en-heat-s"></span></div>
      <div class="grass-scroll"><div class="grass en-grass" id="en-grass"></div></div>
      <div class="grass-legend"><span><i></i>안 한 날</span><span>1시간 미만 <i class="on l1"></i><i class="on l2"></i><i class="on l3"></i><i class="on l4"></i> 3시간 이상</span><span><i class="today"></i>오늘</span></div>
    </section>
    <div class="en-two">
      <section class="panel" aria-labelledby="en-bars-t">
        <div class="panel-head"><h2 class="h2" id="en-bars-t">최근 14일</h2>
          <span class="en-key"><i style="--c:var(--c-teal)"></i>입 연 시간 <i style="--c:var(--c-blue)"></i>나머지</span></div>
        <div class="en-chart" id="en-bars"></div>
      </section>
      <section class="panel" aria-labelledby="en-cp-t">
        <div class="panel-head"><h2 class="h2" id="en-cp-t">다음 점검</h2></div>
        <ol class="en-cps" id="en-cps"></ol>
      </section>
    </div>`;

  function stats() {
    const range = dayRange(data).filter((d) => d <= tk);
    const E = range.length;
    let total = 0, spoken = 0, words = 0, rec = 0;
    for (const d of range) { const x = S.days.get(d); if (!x) continue; total += x.minutes || 0; spoken += x.spoken || 0; words += x.newwords || 0; if ((x.minutes || 0) > 0) rec++; }
    let streak = 0, d = parseYmd(tk);
    if (!(S.days.get(tk)?.minutes > 0)) d = addDays(d, -1);
    while (S.days.get(ymd(d))?.minutes > 0) { streak++; d = addDays(d, -1); }
    const hour = new Date().getHours() / 24;
    const elapsed = pos.before ? 0 : pos.after ? 1 : Math.min(1, (pos.n - 1 + hour) / P.days);
    return { E, total, spoken, words, rec, streak, elapsed };
  }
  // 바깥 = 전체 목표 · 안쪽 = 이번 단계(스프린트) 목표 시간
  function rings(st) {
    const out = [{ label: "전체", done: st.total, goal: goalMin, elapsed: st.elapsed, color: "var(--c-teal)" }];
    const sp = pos.sprint;
    if (sp && +sp.hours > 0 && sp.from && sp.to) {
      let done = 0;
      for (const [k, x] of S.days) if (k >= sp.from && k <= sp.to && k <= tk) done += x.minutes || 0;
      const len = diffDays(sp.from, sp.to) + 1, gone = Math.max(0, Math.min(len, diffDays(sp.from, tk) + new Date().getHours() / 24));
      out.push({ label: sp.id, done, goal: +sp.hours * 60, elapsed: gone / len, color: "var(--c-amber)" });
    }
    return out;
  }
  function ringHtml(st, W) {
    const rs = rings(st);
    return progressRing(rs, W) + `<p class="en-ring-key">${rs.map((x, i) => `<span><i style="--c:${x.color}"></i>${i ? "안쪽" : "바깥"} = ${esc(x.label === "전체" ? "전체" : `이번 단계 ${x.label}`)} ${Math.round(x.goal / 60)}시간</span>`).join("")}<span>옅은 색 = 지난 날만큼의 몫</span></p>`;
  }
  function draw() {
    const st = stats(), box = $("#en-pring", el);
    box.innerHTML = ringHtml(st, box.clientWidth || 320);
    const left = P.end ? diffDays(tk, P.end) : null;
    const perDay = Math.round(goalMin / (P.days || 182));
    const pace = Math.round(goalMin * st.elapsed) - st.total;
    const cell = (label, value, sub = "") => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd>${sub ? `<span>${esc(sub)}</span>` : ""}</div>`;
    $("#en-stats", el).innerHTML = [
      cell("남은 날", pos.before ? `시작 D-${diffDays(tk, P.start)}` : left == null ? "—" : left > 0 ? `D-${left}` : left === 0 ? "D-day" : "끝", P.end ? `${P.end.replace(/-/g, ".")} 까지` : ""),
      cell("누적 시간", `${hours1(st.total)}시간`, pace > 0 && S.loaded ? `지난 날 몫보다 ${mins(pace)} 적어요` : S.loaded ? "지난 날 몫만큼 채웠어요" : ""),
      cell("입 연 시간", st.total ? `${Math.round((st.spoken / st.total) * 100)}%` : "—", st.total ? `${mins(st.spoken)} · 소리 + 말하기` : "소리 + 말하기"),
      cell("연속 기록", `${st.streak}일`, st.streak ? "오늘도 이어 가요" : "오늘 시작해요"),
      cell("기록한 날", st.E ? `${Math.round((st.rec / st.E) * 100)}%` : "—", `${st.rec} / ${st.E}일`),
      cell("신규 단어", `${st.words}개`),
      cell("하루 평균", st.E ? mins(st.total / st.E) : "—", `목표 ${mins(perDay)}`),
    ].join("");
    drawGrass(); drawBars(); drawCps();
  }
  function drawGrass() {
    const range = dayRange(data);
    if (!range.length) { $("#en-grass", el).innerHTML = `<p class="empty">프로그램 기간이 자료에 없어요.</p>`; return; }
    const first = parseYmd(range[0]), last = parseYmd(range[range.length - 1]);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const weeks = Math.ceil(((last - start) / 864e5 + 1) / 7);
    let months = "", cells = "", lastM = -1, lastW = -1, n = 0;
    for (let w = 0; w < weeks; w++) {
      const mon = addDays(start, w * 7), ref = mon < first ? first : mon, m = ref.getMonth();
      const room = w - lastW >= 3 || lastW < 0; // 달 이름이 앞 이름과 겹치지 않게
      months += `<span style="grid-column:${w + 2}">${m !== lastM && room ? `${m + 1}월` : ""}</span>`;
      if (m !== lastM && room) lastW = w;
      if (room || m === lastM) lastM = m;
      for (let d = 0; d < 7; d++) {
        const day = addDays(mon, d), k = ymd(day);
        if (day < first || day > last) { cells += `<span class="g out" style="grid-column:${w + 2};grid-row:${d + 2}"></span>`; continue; }
        const x = S.days.get(k), m2 = x?.minutes || 0;
        const cls = [m2 > 0 ? `on l${level(m2)}` : "", k === tk ? "today" : "", k > tk ? "future" : ""].filter(Boolean).join(" ");
        const tip = `${day.getMonth() + 1}월 ${day.getDate()}일 ${DOW[day.getDay()]} · ${m2 ? mins(m2) : "기록 없음"}`;
        if (m2 > 0) n++;
        cells += k > tk ? `<span class="g ${cls}" style="grid-column:${w + 2};grid-row:${d + 2}" title="${esc(tip)}"></span>`
          : `<a class="g ${cls}" href="#/english/today/${k}" style="grid-column:${w + 2};grid-row:${d + 2}" title="${esc(tip)}" aria-label="${esc(tip)}"></a>`;
      }
    }
    const dows = ["월", "", "수", "", "금", "", "일"].map((l, i) => `<span class="dw" style="grid-row:${i + 2}">${l}</span>`).join("");
    const g = $("#en-grass", el);
    const avail = (g.closest(".grass-scroll")?.clientWidth || 600) - 26;
    g.style.setProperty("--cell", `${Math.max(14, Math.min(24, Math.floor(avail / weeks) - 4))}px`);
    g.style.gridTemplateColumns = `18px repeat(${weeks}, var(--cell))`;
    g.innerHTML = `<span class="mh"></span>${months}${dows}${cells}`;
    requestAnimationFrame(() => { const t = $(".g.today", g), sc = g.closest(".grass-scroll"); if (t && sc && !sc.dataset.moved) { sc.dataset.moved = "1"; sc.scrollLeft = Math.max(0, t.offsetLeft - sc.clientWidth / 3); } }); // 좁은 화면에선 오늘이 보이게
    $("#en-heat-s", el).textContent = S.loaded ? `${n}일 기록 · 칸을 누르면 그날 기록으로` : "불러오는 중…";
  }
  function drawBars() {
    const box = $("#en-bars", el), t = parseYmd(tk), list = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(t, -i), k = ymd(d), x = S.days.get(k) || {};
      const sp = x.spoken || 0, tot = x.minutes || 0;
      list.push({ day: k, label: `${d.getDate()}`, spoken: sp, other: Math.max(0, tot - sp), today: k === tk });
    }
    const goal = targetsFor(data, tk).reduce((s, b) => s + b.target, 0);
    box.innerHTML = bars14(list, goal, box.clientWidth || 520);
  }
  function drawCps() {
    const next = data.checkpoints.filter((c) => c.date && c.date >= tk).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    $("#en-cps", el).innerHTML = next.length ? next.map((c) => {
      const d = diffDays(tk, c.date);
      return `<li><span class="dd">${d === 0 ? "오늘" : `D-${d}`}</span>
        <div><b>${esc(c.test || c.id)}</b><span>${esc(c.date.replace(/-/g, "."))}${c.span ? ` · ${esc(c.span)}` : ""}</span>${c.pass ? `<span class="pass">통과: ${esc(c.pass)}</span>` : ""}</div></li>`;
    }).join("") : `<li class="empty">남은 점검이 없어요.</li>`;
  }

  draw();
  const from = P.start && P.start < ymd(addDays(parseYmd(tk), -13)) ? P.start : ymd(addDays(parseYmd(tk), -13));
  api.englishDays(from, P.end && P.end < tk ? P.end : tk).then(({ days }) => {
    if (!alive) return;
    S.days = new Map((days || []).map((x) => [x.day, x])); S.loaded = true; draw();
  }).catch((e) => { if (!alive) return; toast(e.message, "err"); $("#en-heat-s", el).textContent = "기록을 불러오지 못했어요"; });

  const ro = new ResizeObserver(debounce(() => { if (alive) { const b = $("#en-pring", el); b.innerHTML = ringHtml(stats(), b.clientWidth || 320); drawBars(); drawGrass(); } }, 120));
  ro.observe(el);
  return () => { alive = false; ro.disconnect(); };
}

// 홈: 내 링 차트 하나(누르면 그 기간 계획으로) + 오늘·올해 남은 시간 + 서로의 현황
import { api } from "../api.js";
import { $, esc, ymd, today, periodKey, elapsed, dayScore, pct, pace, initial, toMin, nowTime, toast, DOW, MON_EN, hm, daysInYear, dayOfYear } from "../util.js";
import { rings, bindRings, swatch, timebar, toneVar, RING } from "../chart.js";
import { icon } from "../icons.js";

const greet = (h) => (h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

export function mount(root, ctx) {
  const t = today();
  const K = { year: periodKey("year", t), month: periodKey("month", t), week: periodKey("week", t), day: periodKey("day", t) };
  const HREF = { year: "#/plans/year", month: "#/plans/month", week: "#/plans/week", day: "#/today" };
  const left = daysInYear(t.getFullYear()) - dayOfYear(t);

  root.innerHTML = `
    <div class="view home">
      <header class="vhead">
        <div class="title">
          <span class="eyebrow">${MON_EN[t.getMonth()].slice(0, 3)} ${t.getDate()} · ${DOW[t.getDay()]}요일 · ${K.week.slice(7)}</span>
          <h1 class="home-hi"><span class="serif">${greet(new Date().getHours())},</span> ${esc(ctx.me.display_name)}</h1>
        </div>
        <a class="btn" href="#/today">${icon.plus(15)}오늘 계획 세우기</a>
      </header>
      <section class="hero-chart" aria-label="내 진행 차트">
        <div class="hc-left">
          <div class="hc-chart" id="me-chart"><div class="rings-skel"></div></div>
          <div class="hc-time" id="me-time"></div>
        </div>
        <div class="hc-side">
          <div class="hc-legend" id="me-legend"></div>
          <div class="hc-goals" id="me-goals"></div>
          <p class="hc-hint">링이나 줄을 누르면 그 기간의 계획으로 들어가요 · 링의 홈은 지금까지 흘러간 시간이에요</p>
        </div>
      </section>
      <section class="mates-sec" aria-labelledby="h-mates">
        <div class="panel-head"><h2 class="h2" id="h-mates">서로의 현황</h2><span class="faint" style="font-size:13px">누르면 그 사람의 하루를 볼 수 있어요</span></div>
        <div class="mates-row" id="mates"></div>
      </section>
    </div>`;
  bindRings(root, ctx.go);

  const rate = (rows, uid, key) => { const r = rows.find((x) => x.user_id === uid && x.period === key); return r && r.total ? { v: r.done / r.total, done: r.done, total: r.total } : { v: 0, done: 0, total: 0 }; };
  const segs = (goals) => goals.map((g, i) => ({ tone: toneVar(g.color, i), done: !!g.done, title: g.text }));

  function nowBlock(plans) {
    const m = toMin(nowTime());
    const timed = plans.filter((p) => p.start).sort((a, b) => toMin(a.start) - toMin(b.start));
    const cur = timed.find((p) => toMin(p.start) <= m && m < toMin(p.start) + (p.mins || 30));
    if (cur) return { tag: "지금", p: cur };
    const next = timed.find((p) => toMin(p.start) > m && !p.done);
    return next ? { tag: "다음", p: next } : null;
  }

  let first = true;
  async function load() {
    try {
      const now = new Date(), dayPassed = (now.getHours() * 60 + now.getMinutes()) / 1440;
      const { rows } = await api.summary(Object.values(K));
      const per = await Promise.all(ctx.users.map(async (u) => {
        const [p, l] = await Promise.all([api.plans([K.day, K.year], u.id), api.logs(ymd(t), u.id)]);
        return { u, day: p.plans.filter((x) => x.period === K.day), year: p.plans.filter((x) => x.period === K.year), logs: l.logs };
      }));
      const chartFor = (x, uid) => {
        const s = dayScore(x.day, x.u.day_goal);
        return {
          s,
          items: [
            { key: "year", value: rate(rows, uid, K.year).v, time: elapsed(K.year), segments: segs(x.year), href: HREF.year, mark: `D-${left}`, title: `올해 목표 ${x.year.filter((g) => g.done).length}/${x.year.length} · 올해 ${left}일 남음` },
            { key: "month", value: rate(rows, uid, K.month).v, time: elapsed(K.month), href: HREF.month, title: `이번 달 ${pct(rate(rows, uid, K.month).v)}% 완료` },
            { key: "week", value: rate(rows, uid, K.week).v, time: elapsed(K.week), href: HREF.week, title: `이번 주 ${pct(rate(rows, uid, K.week).v)}% 완료` },
            { key: "day", value: s.exec, time: dayPassed, href: HREF.day, mark: nowTime(), title: `오늘 실행 ${pct(s.exec)}% · 지금 ${nowTime()}` },
          ],
        };
      };

      // ---- me ----
      const mine = per.find((x) => x.u.id === ctx.me.id) || { u: ctx.me, day: [], year: [], logs: [] };
      const { s: sc, items } = chartFor(mine, ctx.me.id);
      const size = Math.min(380, Math.max(260, Math.round(innerWidth * 0.27)));
      $("#me-chart", root).innerHTML = rings(items, { size, stroke: Math.round(size * 0.058), gap: Math.round(size * 0.026), big: sc.score ?? "–", small: "오늘 점수", animate: first, marks: true, label: "올해·이번 달·이번 주·오늘" });
      $("#me-time", root).innerHTML =
        timebar("오늘", dayPassed, `${nowTime()} · ${pct(dayPassed)}% 지남`) +
        timebar("올해", elapsed(K.year), `D-${left} · ${pct(elapsed(K.year))}% 지남`);

      const goals = mine.day.filter((p) => !p.start), timed = mine.day.filter((p) => p.start);
      const R = { month: rate(rows, ctx.me.id, K.month), week: rate(rows, ctx.me.id, K.week) };
      const yDone = mine.year.filter((g) => g.done).length, yv = mine.year.length ? yDone / mine.year.length : 0;
      const row = (key, v, sub, time, total) => {
        const pc = pace(v, time, total);
        return `<a class="lg-row" href="${HREF[key]}">
          ${swatch(key)}
          <span class="lg-name"><b>${RING[key].label}</b><span>${sub}</span></span>
          <span class="lg-val">${pct(v)}<small>%</small></span>
          <span class="chip ${pc.cls}">${pc.text}</span>
          <span class="lg-go">${icon.right(16)}</span>
        </a>`;
      };
      $("#me-legend", root).innerHTML = [
        row("year", yv, mine.year.length ? `목표 ${yDone}/${mine.year.length} 이룸 · D-${left}` : "올해 목표를 세워 보세요", elapsed(K.year), mine.year.length),
        row("month", R.month.v, R.month.total ? `${R.month.done}/${R.month.total} 완료 · 이달 ${pct(elapsed(K.month))}% 지남` : "이번 달 체크리스트가 비어 있어요", elapsed(K.month), R.month.total),
        row("week", R.week.v, R.week.total ? `${R.week.done}/${R.week.total} 완료 · 이번 주 ${pct(elapsed(K.week))}% 지남` : "이번 주 체크리스트가 비어 있어요", elapsed(K.week), R.week.total),
        row("day", sc.exec, mine.day.length ? `시간표 ${timed.filter((p) => p.done).length}/${timed.length} · 목표 ${goals.filter((p) => p.done).length}/${goals.length}` : "오늘 목표와 시간표를 적어 보세요", dayPassed, mine.day.length),
      ].join("");
      $("#me-goals", root).innerHTML = mine.year.length ? `
        <span class="eyebrow">올해 목표 · 링의 바깥 칸</span>
        <div class="goal-chips">${mine.year.map((g, i) => `<a class="goal-chip${g.done ? " done" : ""}" href="#/plans/year"><i style="background:${toneVar(g.color, i)}"></i>${esc(g.text)}</a>`).join("")}</div>` : "";

      // ---- mates ----
      const others = per.filter((x) => x.u.id !== ctx.me.id);
      $("#mates", root).innerHTML = others.length ? others.map((x) => {
        const { u, logs, day } = x, { s, items: it } = chartFor(x, u.id);
        it.forEach((i) => delete i.href);
        const nb = nowBlock(day), last = logs[logs.length - 1];
        const focus = logs.filter((l) => l.kind === "focus").reduce((n, l) => n + (l.mins || 0), 0);
        return `<a class="mate-card" href="#/u/${u.id}/today/${ymd(t)}" style="--me:${esc(u.color)}">
          <div class="mc-top"><span class="av" style="--c:${esc(u.color)}">${esc(initial(u.display_name))}</span><b>${esc(u.display_name)}</b><span class="faint">@${esc(u.username)}</span></div>
          <div class="mc-body">
            ${rings(it, { size: 150, stroke: 9, gap: 5, big: s.score ?? "–", small: "오늘", animate: first, label: `${u.display_name}의 진행` })}
            <dl class="mc-facts">
              <div><dt>올해 목표</dt><dd>${x.year.length ? `${x.year.filter((g) => g.done).length}/${x.year.length}` : "–"}</dd></div>
              <div><dt>이번 달</dt><dd>${pct(it[1].value)}%</dd></div>
              <div><dt>이번 주</dt><dd>${pct(it[2].value)}%</dd></div>
              <div><dt>오늘</dt><dd>${s.count ? `${s.doneCount}/${s.count}` : "–"}</dd></div>
              <div><dt>집중</dt><dd>${focus ? hm(focus) : "–"}</dd></div>
            </dl>
          </div>
          <div class="mc-now">${nb ? `<span class="chip ${nb.tag === "지금" ? "good" : ""}">${nb.tag} ${esc(nb.p.start)}</span><span>${esc(nb.p.text)}</span>` : `<span class="faint">${day.length ? "오늘 시간표를 다 지나왔어요" : "아직 오늘 계획이 없어요"}</span>`}</div>
          ${last ? `<div class="mc-log"><time>${esc(last.at)}</time>${esc(last.text)}</div>` : ""}
        </a>`;
      }).join("") : `<p class="empty">다른 멤버가 아직 없어요.</p>`;
      first = false;
    } catch (e) { toast(e.message, "err"); }
  }
  load();
  const tick = setInterval(load, 60_000);
  const onChanged = () => load();
  window.addEventListener("trio:changed", onChanged);
  return () => { clearInterval(tick); window.removeEventListener("trio:changed", onChanged); };
}

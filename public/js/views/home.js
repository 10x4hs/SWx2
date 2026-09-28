// 홈 — 한 화면에 3D 링 하나. 모서리에 작은 HUD, 아래에 사람 전환.
// 링을 누르면 카메라가 다가가며 그 기간의 계획으로 들어가요. WebGL이 없으면 SVG 링으로 대신해요.
import { api } from "../api.js";
import { $, $$, esc, ymd, today, periodKey, elapsed, dayScore, pct, nowTime, toast, pad, daysInYear, dayOfYear, initial } from "../util.js";
import { rings as svgRings, bindRings, toneVar, RING } from "../chart.js";
import { scramble } from "../fx.js";

const greet = (h) => (h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
const resolve = (el, v) => { const m = /^var\((--[\w-]+)\)$/.exec(v || ""); return m ? cssVar(el, m[1]) : v; };

export function mount(root, ctx) {
  const t = today();
  const K = { year: periodKey("year", t), month: periodKey("month", t), week: periodKey("week", t), day: periodKey("day", t) };
  const left = daysInYear(t.getFullYear()) - dayOfYear(t);
  const HREF = { year: "#/plans/year", month: "#/plans/month", week: "#/plans/week", day: "#/today" };
  const S = { who: ctx.me.id, data: null, three: null, hover: null };

  root.innerHTML = `
    <div class="stage" id="stage">
      <div class="stage-gl" id="gl"></div>
      <div class="hud-layer">
        <div class="hud-tl">
          <span class="eyebrow">Study Trio // ${t.getFullYear()}.${pad(t.getMonth() + 1)}.${pad(t.getDate())} · ${K.week.slice(7)}</span>
          <h1 class="stage-hi" id="hi"><span class="serif">${greet(new Date().getHours())},</span> <b></b></h1>
        </div>
        <div class="hud-tr mono" id="clock"></div>
        <div class="stage-center" aria-live="polite"><b id="score">–</b><span id="score-cap">TODAY SCORE</span></div>
        <div class="hud-bl" id="legend"></div>
        <div class="hud-bc" id="focus-line"></div>
        <div class="hud-br">
          <div class="who-switch" role="tablist" aria-label="누구의 현황을 볼까요">
            ${ctx.users.map((u) => `<button type="button" role="tab" data-who="${u.id}" style="--c:${esc(u.color)}"><span class="av sm" style="--c:${esc(u.color)}">${esc(initial(u.display_name))}</span>${esc(u.username.toUpperCase())}</button>`).join("")}
          </div>
        </div>
      </div>
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
    </div>`;

  const stage = $("#stage", root), gl = $("#gl", root);
  const rate = (rows, uid, key) => { const r = rows.find((x) => x.user_id === uid && x.period === key); return r && r.total ? { v: r.done / r.total, done: r.done, total: r.total } : { v: 0, done: 0, total: 0 }; };

  function info(key) {
    const d = S.data; if (!d) return "";
    return {
      year: d.year.length ? `올해 목표 ${d.yDone}/${d.year.length} 이룸 · D-${left}` : `올해 목표가 없어요 · D-${left}`,
      month: `이번 달 ${d.R.month.done}/${d.R.month.total} 완료 · 이달 ${pct(elapsed(K.month))}% 지남`,
      week: `이번 주 ${d.R.week.done}/${d.R.week.total} 완료 · ${pct(elapsed(K.week))}% 지남`,
      day: `오늘 ${d.sc.doneCount}/${d.sc.count} 실행 · 하루 ${pct(d.dayPassed)}% 지남`,
    }[key];
  }
  function drawFocusLine() {
    const mine = S.who === ctx.me.id, key = S.hover;
    $("#focus-line", root).innerHTML = key
      ? `<span class="fl-key">${RING[key].label}</span><span>${esc(info(key))}</span><span class="fl-go">${mine ? "눌러서 계획 →" : "눌러서 하루 보기 →"}</span>`
      : `<span class="faint">${mine ? "링을 눌러 그 기간의 계획으로 들어가요" : "다른 사람의 링이에요 · 누르면 그 사람의 하루를 봐요"}</span>`;
  }

  async function load(assemble) {
    try {
      const u = ctx.user(S.who) || ctx.me;
      const now = new Date(), dayPassed = (now.getHours() * 60 + now.getMinutes()) / 1440;
      const [{ rows }, { plans }] = await Promise.all([api.summary([K.year, K.month, K.week, K.day]), api.plans([K.day, K.year], u.id)]);
      const day = plans.filter((p) => p.period === K.day), year = plans.filter((p) => p.period === K.year);
      const sc = dayScore(day, u.day_goal);
      const R = { month: rate(rows, u.id, K.month), week: rate(rows, u.id, K.week) };
      const yDone = year.filter((g) => g.done).length;
      S.data = { u, day, year, sc, R, yDone, dayPassed };

      $("#hi b", root).textContent = u.display_name;
      scramble($("#score", root), String(sc.score ?? "–"));
      $("#score-cap", root).textContent = S.who === ctx.me.id ? "TODAY SCORE" : `${u.username.toUpperCase()} · TODAY`;
      $("#clock", root).innerHTML = `<span>NOW ${nowTime()}</span><span>DAY ${pct(dayPassed)}%</span><span>D-${left}</span>`;
      $$("[data-who]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.who === S.who)));

      const items = [
        { key: "year", value: year.length ? yDone / year.length : 0, time: elapsed(K.year), segments: year.map((g, i) => ({ tone: toneVar(g.color, i), done: !!g.done, title: g.text })) },
        { key: "month", value: R.month.v, time: elapsed(K.month) },
        { key: "week", value: R.week.v, time: elapsed(K.week) },
        { key: "day", value: sc.exec, time: dayPassed },
      ];
      const target = (key) => (S.who === ctx.me.id ? HREF[key] : `#/u/${u.id}/today/${ymd(t)}`);
      $("#legend", root).innerHTML = items.map((it) => `<a class="lg" href="${target(it.key)}" data-lg="${it.key}"><i style="background:${RING[it.key].tone}"></i><span>${RING[it.key].label}</span><b>${pct(it.value)}</b></a>`).join("");

      if (S.three) {
        S.three.set(items.map((it) => ({
          key: it.key, value: it.value, time: it.time, n: RING[it.key].segs,
          color: resolve(stage, RING[it.key].tone),
          segments: it.segments?.length ? it.segments.map((sg) => ({ color: resolve(stage, sg.tone), done: sg.done })) : null,
        })), { assemble });
      } else {
        gl.innerHTML = `<div class="svg-fallback">${svgRings(items.map((it) => ({ ...it, href: target(it.key), mark: it.key === "year" ? `D-${left}` : null })), { size: 440, stroke: 22, gap: 9, marks: true, animate: assemble })}</div>`;
      }
      drawFocusLine();
    } catch (e) { toast(e.message, "err"); }
  }

  function applyTheme() {
    if (!S.three) return;
    S.three.theme({ fogColor: cssVar(stage, "--stage-fog"), dustColor: cssVar(stage, "--stage-dust"), stageColor: cssVar(stage, "--stage-line"), glassColor: cssVar(stage, "--stage-glass"), glassOpacity: parseFloat(cssVar(stage, "--stage-glass-a")) || 0.16 });
    if (S.data) load(false);
  }

  // WebGL 장면은 필요할 때만 불러와요
  (async () => {
    let ok = false;
    try {
      const mod = await import("../three/ring3d.js");
      if (mod.supportsWebGL() && root.isConnected) {
        S.three = mod.mountRing3D(gl, {
          onHover: (key) => { S.hover = key; drawFocusLine(); $$("[data-lg]", root).forEach((a) => a.classList.toggle("on", a.dataset.lg === key)); },
          onPick: (key) => ctx.go(S.who === ctx.me.id ? HREF[key] : `#/u/${S.who}/today/${ymd(t)}`),
        });
        ok = true;
      }
    } catch (e) { console.warn("3D 장면을 불러오지 못해 평면 차트로 보여줘요", e); }
    if (!ok) bindRings(root, ctx.go);
    applyTheme();
    load(true);
  })();

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-who]");
    if (b && b.dataset.who !== S.who) { S.who = b.dataset.who; S.hover = null; load(true); }
  });
  root.addEventListener("mouseover", (e) => { const a = e.target.closest("[data-lg]"); if (a && a.dataset.lg !== S.hover) { S.hover = a.dataset.lg; drawFocusLine(); } });

  const mo = new MutationObserver(applyTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", applyTheme);
  const tick = setInterval(() => load(false), 60_000);
  const onChanged = () => load(false);
  window.addEventListener("trio:changed", onChanged);
  return () => { clearInterval(tick); mo.disconnect(); mq.removeEventListener("change", applyTheme); window.removeEventListener("trio:changed", onChanged); S.three?.destroy(); S.three = null; };
}

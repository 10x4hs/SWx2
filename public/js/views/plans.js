// 계획: 연간 · 월간 · 주간 체크리스트 + 히트맵 / 달력 / 주간 보드
import { api } from "../api.js";
import {
  $, esc, pad, ymd, today, addDays, periodKey, periodStart, shiftPeriod, periodLabel, elapsed, pace, pct, ring, toast, DOW,
} from "../util.js";
import { icon } from "../icons.js";
import { rings, toneVar, TONES } from "../chart.js";

const SCOPES = [
  { key: "year", label: "연간" },
  { key: "month", label: "월간" },
  { key: "week", label: "주간" },
];
const NAME = { year: "올해", month: "이번 달", week: "이번 주" };
const PREV = { year: "작년", month: "지난달", week: "지난주" };
const NEXT = { year: "내년", month: "다음 달", week: "다음 주" };
const HINT = { year: "예: 정보처리기사 최종 합격", month: "예: 기출 5회분 풀기", week: "예: 강의 3강까지 듣고 정리" };

function toKey(scope, raw) {
  const pre = { year: "Y:", month: "M:", week: "W:" }[scope];
  if (raw) return pre + raw;
  return periodKey(scope, today());
}

export function mount(root, ctx, r) {
  const scope = SCOPES.some((s) => s.key === r.scope) ? r.scope : "month";
  const key = toKey(scope, r.key);
  const cur = periodKey(scope, today());
  const start = periodStart(key);
  const time = elapsed(key);
  const S = { items: [], prevUndone: 0 };
  const href = (k) => `#/plans/${scope}/${k.slice(2)}`;

  root.innerHTML = `
    <div class="view">
      <header class="vhead">
        <div class="title">
          <span class="eyebrow">Plans · ${key === cur ? NAME[scope] : key < cur ? "지난 기간" : "미리 계획"}</span>
          <h1 class="h1">${esc(periodLabel(key))}</h1>
        </div>
        <div class="row">
          <nav class="seg" aria-label="계획 단위">
            ${SCOPES.map((s) => `<a href="#/plans/${s.key}" ${s.key === scope ? 'aria-current="page"' : ""}>${s.label}</a>`).join("")}
            <a href="#/today">하루</a>
          </nav>
          <div class="pager">
            <a class="icon-btn" href="${href(shiftPeriod(key, -1))}" aria-label="${PREV[scope]}">${icon.left()}</a>
            <a class="btn ghost sm" href="${href(cur)}">${NAME[scope]}</a>
            <a class="icon-btn" href="${href(shiftPeriod(key, 1))}" aria-label="${NEXT[scope]}">${icon.right()}</a>
          </div>
        </div>
      </header>
      <div id="carry"></div>
      <div class="grid-2">
        <section class="panel" aria-labelledby="h-list">
          <div class="panel-head"><h2 class="h2" id="h-list">${scope === "year" ? "올해의 목표" : scope === "month" ? "한 달 체크리스트" : "한 주 체크리스트"}</h2><span id="pace"></span></div>
          <div class="plan-top" id="top"></div>
          <ul class="todos" id="list"></ul>
          <form class="addrow" id="add" autocomplete="off">
            <input class="input" id="add-text" maxlength="200" placeholder="${HINT[scope]}" aria-label="계획 추가">
            <button class="btn" type="submit">${icon.plus(15)}추가</button>
          </form>
        </section>
        <section class="panel" aria-labelledby="h-side" id="side"></section>
      </div>
    </div>`;

  // ---------- checklist ----------
  function drawList() {
    const done = S.items.filter((p) => p.done).length, total = S.items.length, rate = total ? done / total : 0;
    const pc = pace(rate, time, total);
    $("#pace", root).innerHTML = `<span class="chip ${pc.cls}">${pc.text}</span>`;
    $("#top", root).innerHTML = `
      ${rings([{ key: scope, value: rate, time, segments: scope === "year" ? S.items.map((p, i) => ({ tone: toneVar(p.color, i), done: !!p.done, title: p.text })) : null }], { size: 164, stroke: 14, big: pct(rate) + "%", small: `기간 ${pct(time)}% 지남`, label: `완료 ${pct(rate)}%, 기간 ${pct(time)}% 경과` })}
      <div class="facts">
        <div class="big">${done}<span> / ${total}개 완료</span></div>
        <div class="meter"><span>완료</span><div class="bar"><i style="width:${pct(rate)}%"></i></div><em>${pct(rate)}%</em></div>
        <div class="meter"><span>시간</span><div class="bar time"><i style="width:${pct(time)}%"></i></div><em>${pct(time)}%</em></div>
      </div>`;
    $("#list", root).innerHTML = total ? S.items.map((p, i) => `
      <li class="todo ${p.done ? "done" : ""}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 완료">
        ${scope === "year" ? `<button class="tone-btn" type="button" data-tone="${esc(p.id)}" style="--t:${toneVar(p.color, i)}" aria-label="${esc(p.text)} 차트 색 고르기" title="차트 색 고르기"></button>` : ""}
        <span class="txt" data-edit="${esc(p.id)}">${esc(p.text)}</span>
        <span class="acts">
          <button class="icon-btn sm" type="button" data-later="${esc(p.id)}" aria-label="${NEXT[scope]}로 미루기" title="${NEXT[scope]}로 미루기">${icon.later(14)}</button>
          <button class="icon-btn sm danger" type="button" data-del="${esc(p.id)}" aria-label="삭제">${icon.x(14)}</button>
        </span>
      </li>`).join("") : `<li class="empty">${key < cur ? "이 기간에는 계획이 없었어요." : "첫 계획을 적어 보세요. 더블클릭하면 고칠 수 있어요."}</li>`;
  }
  function drawCarry() {
    const el = $("#carry", root);
    el.innerHTML = S.prevUndone && key === cur ? `<div class="banner"><p>${PREV[scope]} 못 끝낸 계획이 <b>${S.prevUndone}개</b> 있어요.</p>
      <button class="btn sm" type="button" id="carry-btn">${NAME[scope]}로 가져오기</button></div>` : "";
    const b = $("#carry-btn", el);
    if (b) b.addEventListener("click", async () => {
      try { const { moved } = await api.carry(scope, shiftPeriod(key, -1), key); toast(`${moved}개를 가져왔어요.`); S.prevUndone = 0; drawCarry(); loadList(); }
      catch (e) { toast(e.message, "err"); }
    });
  }
  async function loadList() {
    try {
      const [{ plans }, prev] = await Promise.all([api.plans([key]), api.plans([shiftPeriod(key, -1)])]);
      S.items = plans; S.prevUndone = prev.plans.filter((p) => !p.done).length;
      drawList(); drawCarry();
    } catch (e) { toast(e.message, "err"); }
  }

  // ---------- side panel ----------
  async function drawSide() {
    const side = $("#side", root);
    const y = start.getFullYear();
    if (scope === "year") {
      const months = Array.from({ length: 12 }, (_, m) => `M:${y}-${pad(m + 1)}`);
      const [{ days }, { plans }] = await Promise.all([api.heatmap(y), api.plans(months)]);
      const byDay = new Map(days.map((d) => [d.period.slice(2), d]));
      const t = today();
      let rows = "";
      for (let m = 0; m < 12; m++) {
        const dim = new Date(y, m + 1, 0).getDate();
        let cells = "";
        for (let d = 1; d <= 31; d++) {
          if (d > dim) { cells += `<span class="d x"></span>`; continue; }
          const date = new Date(y, m, d), k = ymd(date), rec = byDay.get(k);
          let cls = date > t ? "future" : "";
          if (rec && rec.total) { const v = rec.done / rec.total; cls = v === 0 ? "" : v < .34 ? "l1" : v < .67 ? "l2" : v < 1 ? "l3" : "l4"; }
          if (k === ymd(t)) cls += " today";
          const tip = `${m + 1}월 ${d}일${rec ? ` · ${rec.done}/${rec.total} 완료` : ""}`;
          cells += `<a class="d ${cls}" href="#/today/${k}" title="${tip}" aria-label="${tip}"></a>`;
        }
        rows += `<div class="heat-row"><span>${m + 1}월</span>${cells}</div>`;
      }
      const activeDays = days.filter((d) => d.done > 0).length;
      const monthBars = months.map((mk, i) => {
        const list = plans.filter((p) => p.period === mk), done = list.filter((p) => p.done).length;
        return `<a class="meter" href="#/plans/month/${mk.slice(2)}" style="text-decoration:none"><span>${i + 1}월</span><div class="bar"><i style="width:${list.length ? pct(done / list.length) : 0}%"></i></div><em>${list.length ? `${done}/${list.length}` : "–"}</em></a>`;
      }).join("");
      side.innerHTML = `
        <div class="panel-head"><h2 class="h2" id="h-side">${y}년 하루하루</h2><span class="faint" style="font-size:12.5px">해낸 날 ${activeDays}일</span></div>
        <div class="heat" role="group" aria-label="${y}년 하루별 완료 히트맵">${rows}</div>
        <div class="heat-legend">적음 <i style="background:var(--track)"></i><i class="l1" style="background:color-mix(in srgb,var(--me) 28%,var(--track))"></i><i style="background:color-mix(in srgb,var(--me) 52%,var(--track))"></i><i style="background:color-mix(in srgb,var(--me) 76%,var(--track))"></i><i style="background:var(--me)"></i> 모두 완료</div>
        <div class="eyebrow" style="margin-top:6px">월별 체크리스트</div>
        <div style="display:grid;gap:8px">${monthBars}</div>`;
    } else if (scope === "month") {
      const { days } = await api.heatmap(y);
      const byDay = new Map(days.map((d) => [d.period.slice(2), d]));
      const dim = new Date(y, start.getMonth() + 1, 0).getDate();
      const lead = (start.getDay() + 6) % 7;
      const t = today();
      let cells = ["월", "화", "수", "목", "금", "토", "일"].map((d) => `<span class="dow">${d}</span>`).join("");
      for (let i = 0; i < lead; i++) cells += `<span class="cell pad"></span>`;
      for (let d = 1; d <= dim; d++) {
        const date = new Date(y, start.getMonth(), d), k = ymd(date), rec = byDay.get(k);
        const cls = [k === ymd(t) ? "today" : "", date < t ? "past" : ""].join(" ");
        cells += `<a class="cell ${cls}" href="#/today/${k}" style="text-decoration:none" aria-label="${start.getMonth() + 1}월 ${d}일${rec ? `, ${rec.done}/${rec.total} 완료` : ""}">
          <span class="n">${d}</span>
          ${rec ? `<span class="bar b"><i style="width:${pct(rec.done / rec.total)}%"></i></span><span class="c">${rec.done}/${rec.total}</span>` : ""}
        </a>`;
      }
      side.innerHTML = `
        <div class="panel-head"><h2 class="h2" id="h-side">달력</h2><span class="faint" style="font-size:12.5px">날짜를 누르면 그날 시간표로 가요</span></div>
        <div class="cal">${cells}</div>`;
    } else {
      const dayKeys = Array.from({ length: 7 }, (_, i) => "D:" + ymd(addDays(start, i)));
      const { plans } = await api.plans(dayKeys);
      const t = ymd(today());
      side.innerHTML = `
        <div class="panel-head"><h2 class="h2" id="h-side">요일별 계획</h2><span class="faint" style="font-size:12.5px">요일을 눌러 시간표 짜기</span></div>
        <div class="weekcols">${dayKeys.map((dk, i) => {
          const list = plans.filter((p) => p.period === dk), d = addDays(start, i), k = dk.slice(2);
          return `<a class="weekcol ${k === t ? "today" : ""}" href="#/today/${k}" style="text-decoration:none">
            <span class="d">${DOW[d.getDay()]}</span><span class="n">${d.getMonth() + 1}.${d.getDate()}</span>
            ${list.length ? `<span class="bar"><i style="width:${pct(list.filter((p) => p.done).length / list.length)}%"></i></span>` : ""}
            <ul>${list.slice(0, 5).map((p) => `<li class="${p.done ? "done" : ""}">${p.start ? esc(p.start) + " " : ""}${esc(p.text)}</li>`).join("")}${list.length > 5 ? `<li class="faint">+${list.length - 5}개</li>` : ""}</ul>
          </a>`;
        }).join("")}</div>`;
    }
  }

  // ---------- actions ----------
  root.addEventListener("change", async (e) => {
    const t = e.target.closest("[data-toggle]");
    if (!t) return;
    const p = S.items.find((x) => x.id === t.dataset.toggle);
    p.done = t.checked ? 1 : 0; drawList();
    try { await api.updatePlan(p.id, { done: t.checked }); } catch (ex) { p.done = t.checked ? 0 : 1; drawList(); toast(ex.message, "err"); }
  });
  // 올해 목표 색 고르기 (무채색 톤)
  let pop = null;
  const closePop = () => { pop?.remove(); pop = null; };
  root.addEventListener("click", async (e) => {
    const tb = e.target.closest("[data-tone]");
    if (tb) {
      e.stopPropagation();
      if (pop && pop.dataset.for === tb.dataset.tone) return closePop();
      closePop();
      const p = S.items.find((x) => x.id === tb.dataset.tone);
      pop = document.createElement("div");
      pop.className = "tone-pop"; pop.dataset.for = p.id; pop.setAttribute("role", "listbox"); pop.setAttribute("aria-label", "차트 색");
      pop.innerHTML = TONES.map((t) => `<button type="button" role="option" data-pick="${t.key}" aria-selected="${p.color === t.key}"><i style="background:var(--t-${t.key})"></i>${t.name}</button>`).join("");
      tb.after(pop);
      pop.querySelector('[aria-selected="true"], button')?.focus();
      return;
    }
    const pick = e.target.closest("[data-pick]");
    if (pick && pop) {
      const p = S.items.find((x) => x.id === pop.dataset.for), key = pick.dataset.pick;
      closePop();
      try { await api.updatePlan(p.id, { color: key }); p.color = key; drawList(); } catch (ex) { toast(ex.message, "err"); }
      return;
    }
    if (pop && !e.target.closest(".tone-pop")) closePop();
    const del = e.target.closest("[data-del]"), later = e.target.closest("[data-later]");
    const id = del?.dataset.del || later?.dataset.later;
    if (!id) return;
    try {
      if (del) await api.deletePlan(id);
      else { await api.updatePlan(id, { period: shiftPeriod(key, 1) }); toast(`${NEXT[scope]}로 미뤘어요.`); }
      S.items = S.items.filter((p) => p.id !== id); drawList();
    } catch (ex) { toast(ex.message, "err"); }
  });
  root.addEventListener("dblclick", (e) => {
    const el = e.target.closest("[data-edit]");
    if (!el) return;
    const old = el.textContent;
    el.contentEditable = "true"; el.focus(); document.getSelection().selectAllChildren(el);
    const done = async (commit) => {
      el.contentEditable = "false"; el.onkeydown = el.onblur = null;
      const v = el.textContent.trim();
      if (!commit || !v || v === old) { el.textContent = old; return; }
      try { await api.updatePlan(el.dataset.edit, { text: v }); S.items.find((p) => p.id === el.dataset.edit).text = v; }
      catch (ex) { el.textContent = old; toast(ex.message, "err"); }
    };
    el.onkeydown = (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); done(true); } if (ev.key === "Escape") done(false); };
    el.onblur = () => done(true);
  });
  $("#add", root).addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#add-text", root), text = input.value.trim();
    if (!text) return input.focus();
    try { const { plan } = await api.addPlan({ scope, period: key, text }); S.items.push(plan); input.value = ""; drawList(); }
    catch (ex) { toast(ex.message, "err"); }
  });

  loadList();
  drawSide().catch((e) => toast(e.message, "err"));
}

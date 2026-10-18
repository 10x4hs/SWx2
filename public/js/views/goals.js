// 목표 — 이번 주 · 이번 달 · 올해를 각각 한 페이지로. 홈 링 차트를 누르면 여기로 와요.
// 주소: #/goals/week · #/goals/month · #/goals/year (뒤에 기간 키를 붙이면 그 기간: #/goals/week/2026-W41)
// 한 화면에 하나만: 큰 제목 · 진행 막대 한 줄 · 목표 목록 · 맨 아래 입력 한 줄. 체크 · 우선순위 · 두 번 눌러 고치기 · 지우기.
import { api } from "../api.js";
import { $, esc, toast, today, ymd, periodKey, periodStart, periodEnd, shiftPeriod, elapsed, pct, addDays } from "../util.js";
import { icon } from "../icons.js";
import { PRIO_RANK, prioSelect, prioPill, openPrioDrop } from "../prio.js";
import { mountCommand } from "../ai-command.js";
import { openMenu, closeMenu } from "../ctxmenu.js";

const SCOPES = [{ k: "week", label: "이번 주", short: "주" }, { k: "month", label: "이번 달", short: "월" }, { k: "year", label: "올해", short: "년" }];
const RANK = PRIO_RANK;
const md = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
const keyFrom = (scope, raw) => {
  const pre = { week: "W", month: "M", year: "Y" }[scope];
  if (raw && new RegExp(`^${pre}:`).test(raw)) return raw;
  if (raw && /^[\dW-]+$/.test(raw)) return `${pre}:${raw}`;
  return periodKey(scope, today());
};

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  const S = { scope: SCOPES.some((x) => x.k === r.scope) ? r.scope : "week", key: null, list: null, busy: false };
  S.key = keyFrom(S.scope, r.key);
  root.innerHTML = `
    <div class="gl">
      <header class="gl-top">
        <button type="button" class="icon-btn back-btn" id="gl-back" aria-label="뒤로">${icon.left(18)}</button>
        <nav class="seg" role="tablist" aria-label="기간">${SCOPES.map((x) => `<a role="tab" data-scope="${x.k}" href="#/goals/${x.k}">${x.short}</a>`).join("")}</nav>
        <div class="gl-nav">
          <a class="icon-btn sm" id="gl-prev" aria-label="이전">${icon.left(16)}</a>
          <a class="btn sm ghost" id="gl-now">지금</a>
          <a class="icon-btn sm" id="gl-next" aria-label="다음">${icon.right(16)}</a>
        </div>
      </header>
      <section class="gl-head">
        <span class="eyebrow" id="gl-eye">목표</span>
        <h1 class="gl-title" id="gl-title"></h1>
        <p class="gl-range faint" id="gl-range"></p>
        <div class="gl-prog" id="gl-prog" aria-live="polite"></div>
      </section>
      <div id="gl-ai"></div>
      <ul class="gl-list" id="gl-list"><li class="faint gl-load">불러오는 중…</li></ul>
      <form class="gl-add" id="gl-add" autocomplete="off">
        <input class="input" name="text" maxlength="200" placeholder="목표 추가 · Enter" aria-label="목표 추가">
        ${prioSelect("priority", "", "select sm")}
      </form>
    </div>`;

  const titleOf = () => {
    const s = periodStart(S.key), now = periodKey(S.scope, today()) === S.key;
    if (S.scope === "year") return { eye: now ? "올해 목표" : "목표", title: `${s.getFullYear()}년`, range: `1월 1일 – 12월 31일` };
    if (S.scope === "month") return { eye: now ? "이번 달 목표" : "목표", title: `${s.getMonth() + 1}월`, range: `${s.getFullYear()}년 ${s.getMonth() + 1}월 1일 – ${md(addDays(periodEnd(S.key), -1))}` };
    const e = addDays(periodEnd(S.key), -1), w = S.key.split("-W")[1];
    return { eye: now ? "이번 주 목표" : "목표", title: `${+w}주차`, range: `${md(s)} – ${md(e)}` };
  };
  function drawHead() {
    const t = titleOf();
    $("#gl-eye", root).textContent = t.eye; $("#gl-title", root).textContent = t.title; $("#gl-range", root).textContent = t.range;
    root.querySelectorAll("[data-scope]").forEach((a) => a.setAttribute("aria-selected", String(a.dataset.scope === S.scope)));
    $("#gl-prev", root).href = `#/goals/${S.scope}/${shiftPeriod(S.key, -1).slice(2)}`;
    $("#gl-next", root).href = `#/goals/${S.scope}/${shiftPeriod(S.key, 1).slice(2)}`;
    $("#gl-now", root).href = `#/goals/${S.scope}`;
    $("#gl-now", root).hidden = periodKey(S.scope, today()) === S.key;
    document.title = `${t.eye} · SWx2`;
  }
  function drawProg() {
    const box = $("#gl-prog", root); if (!S.list) { box.innerHTML = ""; return; }
    const n = S.list.length, d = S.list.filter((p) => p.done).length, t = elapsed(S.key);
    const v = n ? d / n : 0, ahead = Math.round((v - t) * 100);
    box.innerHTML = `<div class="gp-bar" style="--v:${(v * 100).toFixed(1)}%;--t:${(t * 100).toFixed(1)}%"><i></i><b title="기간 ${pct(t)}% 지남"></b></div>
      <div class="gp-txt"><span><b>${d}</b> / ${n} 이룸</span><span class="faint">기간 ${pct(t)}% 지남</span>${n ? `<span class="${ahead >= 0 ? "up" : "down"}">${ahead >= 0 ? `${ahead}%p 앞섬` : `${-ahead}%p 밀림`}</span>` : ""}</div>`;
  }
  function drawList() {
    const ul = $("#gl-list", root); if (!S.list) return;
    const list = S.list.slice().sort((a, b) => (a.done - b.done) || (RANK[b.priority] || 0) - (RANK[a.priority] || 0) || (a.sort || 0) - (b.sort || 0));
    ul.innerHTML = list.length ? list.map((p) => `
      <li class="gl-item${p.done ? " done" : ""}" data-id="${esc(p.id)}" data-p="${p.priority || ""}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 이룸">
        <span class="gl-text" data-edit="${esc(p.id)}" title="두 번 눌러 고치기">${esc(p.text)}</span>
        ${prioPill(p)}
        <button type="button" class="icon-btn sm gl-del" data-del="${esc(p.id)}" aria-label="지우기">${icon.x(14)}</button>
      </li>`).join("") : `<li class="gl-empty"><p>아직 목표가 없어요.</p><p class="faint">아래에 적고 Enter. 홈 링이 목표 수만큼 칸으로 나뉘어요.</p></li>`;
    drawProg();
  }
  async function load() {
    const key = S.key;
    S.list = null; drawHead(); drawProg(); $("#gl-list", root).innerHTML = `<li class="faint gl-load">불러오는 중…</li>`;
    try { const { plans } = await api.plans([key]); if (key !== S.key) return; S.list = plans || []; drawList(); }
    catch (e) { toast(e.message, "err"); }
  }
  const changed = () => ctx.changed?.("plans");

  root.addEventListener("change", async (e) => {
    const t = e.target.closest("[data-toggle]"); if (!t || !S.list) return;
    const p = S.list.find((x) => x.id === t.dataset.toggle); if (!p) return;
    const v = t.checked; p.done = v ? 1 : 0; drawList();
    try { await api.updatePlan(p.id, { done: v }); changed(); } catch (err) { p.done = v ? 0 : 1; drawList(); toast(err.message, "err"); }
  });
  root.addEventListener("click", async (e) => {
    const pr = e.target.closest("[data-prio]");
    if (pr) { // 아래로 펼쳐지는 1~5순위 고르기
      const p = S.list.find((x) => x.id === pr.dataset.prio); if (!p) return;
      openPrioDrop(pr, p.priority || "", async (v) => {
        const nx = v || null, old = p.priority; if (nx === (old || null)) return;
        p.priority = nx; drawList();
        try { await api.updatePlan(p.id, { priority: nx }); changed(); } catch (err) { p.priority = old; drawList(); toast(err.message, "err"); }
      });
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      const id = del.dataset.del, keep = S.list; S.list = S.list.filter((x) => x.id !== id); drawList();
      try { await api.deletePlan(id); changed(); } catch (err) { S.list = keep; drawList(); toast(err.message, "err"); }
    }
  });
  root.addEventListener("dblclick", (e) => {
    const t = e.target.closest("[data-edit]"); if (!t) return;
    const p = S.list.find((x) => x.id === t.dataset.edit); if (!p) return;
    const inp = document.createElement("input"); inp.className = "input gl-edit"; inp.value = p.text; inp.maxLength = 200;
    t.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const finish = async (save) => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (save && v && v !== p.text) { const old = p.text; p.text = v; drawList(); try { await api.updatePlan(p.id, { text: v }); changed(); } catch (err) { p.text = old; drawList(); toast(err.message, "err"); } }
      else drawList();
    };
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) finish(true); if (ev.key === "Escape") finish(false); });
    inp.addEventListener("blur", () => finish(true));
  });
  $("#gl-add", root).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, text = f.text.value.trim(), priority = f.priority.value || null;
    if (!text || S.busy || !S.list) return f.text.focus();
    S.busy = true;
    try { const { plan } = await api.addPlan({ scope: S.scope, period: S.key, text, ...(priority ? { priority } : {}) }); S.list.push(plan); f.text.value = ""; drawList(); changed(); }
    catch (err) { toast(err.message, "err"); }
    finally { S.busy = false; f.text.focus(); }
  });

  $("#gl-back", root).addEventListener("click", () => window.trioBack?.());
  // 우클릭 → 이름 고치기 · 이룸 · 우선순위 · 삭제
  root.addEventListener("contextmenu", (e) => {
    const li = e.target.closest(".gl-item"); if (!li || !S.list) return;
    const p = S.list.find((x) => x.id === li.dataset.id); if (!p) return;
    openMenu(e, { title: p.text, items: [{ k: "edit", label: "이름 고치기" }, { k: "done", label: p.done ? "이룸 되돌리기" : "이룸" }, { k: "prio", prio: p.priority || "" }, { sep: true }, { k: "del", label: "삭제", danger: true }],
      onPick: async (k, v) => {
        if (k === "edit") { li.querySelector("[data-edit]")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); return; }
        if (k === "done") { const old = p.done; p.done = p.done ? 0 : 1; drawList(); try { await api.updatePlan(p.id, { done: !!p.done }); changed(); } catch (err) { p.done = old; drawList(); toast(err.message, "err"); } return; }
        if (k === "prio") { const old = p.priority; p.priority = v || null; drawList(); try { await api.updatePlan(p.id, { priority: p.priority }); changed(); } catch (err) { p.priority = old; drawList(); toast(err.message, "err"); } return; }
        if (k === "del") { const keep = S.list; S.list = S.list.filter((x) => x.id !== p.id); drawList(); try { await api.deletePlan(p.id); changed(); } catch (err) { S.list = keep; drawList(); toast(err.message, "err"); } }
      } });
  });
  // AI: 이 기간 목표로 알아들어요 ("SQL 조인 끝내기 넣어 줘" · "이번 달 목표 4개 짜 줘" · "다 끝낸 거 체크해 줘")
  const HINTS = { week: ["이번 주 목표 3개 짜 줘", "SQL 조인 끝내기 넣어 줘 (중요)", "끝낸 목표 체크해 줘"], month: ["이번 달 목표 4개 추천해 줘", "자격증 1회독 넣어 줘 (급해)", "끝낸 목표 체크해 줘"], year: ["올해 목표 3개 짜 줘", "정보처리기사 합격 넣어 줘", "끝낸 목표 체크해 줘"] };
  const stopAi = mountCommand($("#gl-ai", root), { hints: HINTS[S.scope], day: () => ymd(periodStart(S.key)), page: () => ({ scope: S.scope, period: S.key }), onDone: () => load() });
  inst = { update(rr) { const sc = SCOPES.some((x) => x.k === rr.scope) ? rr.scope : "week"; const k = keyFrom(sc, rr.key); if (sc !== S.scope || k !== S.key) { S.scope = sc; S.key = k; load(); } } };
  load();
  setTimeout(() => $("#gl-add input", root)?.focus(), 80);
  return () => { inst = null; stopAi?.(); closeMenu(); };
}

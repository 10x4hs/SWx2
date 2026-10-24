// 체크리스트 — 시간 없이 "해야 할 일"만 (시간 정해진 일정은 캘린더의 하루 계획표에서, 둘은 따로예요). 주소: #/checklist[/YYYY-MM-DD] (없으면 오늘). 홈의 '오늘' 링을 누르면 여기로 와요.
// 위: 날짜 · 우선순위 색 도넛 차트. 가운데: 목록(체크 · 우선순위 1~5 · 예상 시간 · 두 번 눌러 고치기 · 지우기). 아래: 입력 한 줄 + 우선순위 · 시간 고르기(여러 줄 붙여넣기 = 여러 개).
// 우선순위 · 시간 알약을 누르면 아래로 펼쳐져서 골라요. 예상 시간은 그날 점수의 '계획 시간'에도 들어가요.
import { api } from "../api.js";
import { $, esc, toast, ymd, parseYmd, addDays, today, DOW, hm, toMin, nowTime } from "../util.js";
import { icon } from "../icons.js";
import { missBtn } from "./day.js";
import { PRIO_RANK as RANK, prioSelect, prioPill, openPrioDrop, hoursSelect, hoursPill, openHoursDrop, parseMins, sumMins, MINS_HINT } from "../prio.js";
import { prioDonut, prioLegend } from "../charts/prio.js";
import { keepDraft } from "../draft.js";
import { mountCommand } from "../ai-command.js";
import { openMenu, closeMenu } from "../ctxmenu.js";
import { mountBoard, modeSeg, flipList } from "../board/board.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const rel = (d) => { const t = ymd(today()); if (d === t) return "오늘"; if (d === ymd(addDays(today(), 1))) return "내일"; if (d === ymd(addDays(today(), -1))) return "어제"; return ""; };

let inst = null, outer = null;
export function update(r) { outer?.update(r); }

// [보드 | 목록] — 고른 보기는 사람마다 기억해요 (localStorage). 주소에 날짜가 있으면(#/checklist/2026-10-20) 그날 목록으로 열어요.
const modeKey = (ctx) => "trio.ck.mode." + (ctx.me?.id || "me");
const readMode = (ctx) => { try { return localStorage.getItem(modeKey(ctx)) === "board" ? "board" : "list"; } catch { return "list"; } };
export function mount(root, ctx, r) {
  let stop = null, mode = null;
  const show = (m, rr = r) => {
    if (m === mode) return;
    stop?.(); closeMenu(); mode = m;
    const sub = document.createElement("div"); sub.className = "ck-host"; root.replaceChildren(sub); // 보기마다 새 칸 — 손 이벤트가 쌓이지 않게
    if (m === "board") { const b = mountBoard(sub, ctx); stop = () => b.dispose(); }
    else stop = mountList(sub, ctx, rr);
  };
  const onMode = (e) => {
    const b = e.target.closest("[data-mode]"); if (!b || !root.contains(b)) return;
    const m = b.dataset.mode; try { localStorage.setItem(modeKey(ctx), m); } catch {}
    if (m === "list" && mode === "board") r = { ...r, day: null }; // 보드에서 목록으로 = 오늘
    show(m);
  };
  root.addEventListener("click", onMode);
  show(DAY_RE.test(r.day || "") ? "list" : readMode(ctx));
  outer = { update(rr) { r = rr; if (DAY_RE.test(rr.day || "") && mode === "board") return show("list", rr); if (mode === "list") inst?.update(rr); } };
  return () => { root.removeEventListener("click", onMode); stop?.(); outer = null; };
}

function mountList(root, ctx, r) {
  const S = { day: DAY_RE.test(r.day || "") ? r.day : ymd(today()), list: null, busy: false };
  root.innerHTML = `
    <div class="ck">
      <header class="gl-top">
        <span class="row" style="gap:8px"><button type="button" class="icon-btn back-btn" id="ck-back" aria-label="뒤로">${icon.left(18)}</button><span class="eyebrow">체크리스트</span>${modeSeg("list")}</span>
        <div class="gl-nav">
          <a class="icon-btn sm" id="ck-prev" aria-label="전날">${icon.left(16)}</a>
          <a class="btn sm ghost" id="ck-now">오늘</a>
          <a class="icon-btn sm" id="ck-next" aria-label="다음날">${icon.right(16)}</a>
          <a class="icon-btn sm" id="ck-cal" aria-label="캘린더에서 보기" title="캘린더에서 보기">${icon.calendar(15)}</a>
        </div>
      </header>
      <section class="ck-head">
        <div class="ck-when"><span class="ck-rel" id="ck-rel"></span><h1 class="gl-title" id="ck-title"></h1><p class="ck-sum" id="ck-sum" aria-live="polite"></p></div>
        <div class="ck-chart"><div id="ck-donut"></div><div class="ck-legend" id="ck-legend"></div></div>
      </section>
      <div id="ck-ai"></div>
      <ul class="gl-list" id="ck-list"><li class="faint gl-load">불러오는 중…</li></ul>
      <form class="gl-add ck-add" id="ck-add" autocomplete="off">
        <input class="input" name="text" maxlength="200" placeholder="해야 할 일 · Enter (여러 줄 붙여넣기 가능)" aria-label="할 일 추가">
        ${prioSelect("priority", "", "select sm")}
        ${hoursSelect("mins", null, "select sm")}<input class="input ck-mins-in" name="mins_text" placeholder="${MINS_HINT}" aria-label="예상 시간 직접 입력" autocomplete="off" inputmode="decimal" hidden>
        <button type="submit" class="ck-submit" tabindex="-1" aria-hidden="true">추가</button>
      </form>
    </div>`;
  const form = $("#ck-add", root), draft = keepDraft(form.text, "checklist");

  function drawHead() {
    const d = parseYmd(S.day);
    $("#ck-rel", root).textContent = rel(S.day);
    $("#ck-title", root).textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
    $("#ck-prev", root).href = "#/checklist/" + ymd(addDays(d, -1));
    $("#ck-next", root).href = "#/checklist/" + ymd(addDays(d, 1));
    $("#ck-now", root).href = "#/checklist"; $("#ck-now", root).hidden = S.day === ymd(today());
    $("#ck-cal", root).href = "#/calendar/" + S.day;
  }
  // 위쪽 합계: 예상 시간을 모두 더해서 (끝낸 몫 · 남은 몫 · 시간 안 적은 할 일 수)
  function drawSum() {
    const el = $("#ck-sum", root), items = S.list || [];
    const total = sumMins(items), done = sumMins(items.filter((p) => p.done)), noTime = items.filter((p) => !p.mins).length;
    if (!items.length) { el.innerHTML = ""; return; }
    if (!total) { el.innerHTML = `<span class="faint">예상 시간을 고르면 여기에 합계가 떠요</span>`; return; }
    el.innerHTML = `<b class="ck-sum-t">총 ${esc(hm(total))}</b><span class="ck-sum-d">${done ? `끝냄 ${esc(hm(done))}` : "아직 끝낸 시간 없음"}</span>${total - done ? `<span class="ck-sum-l">남음 ${esc(hm(total - done))}</span>` : `<span class="ck-sum-l ok">다 끝냈어요</span>`}${noTime ? `<span class="faint">시간 없는 할 일 ${noTime}개</span>` : ""}`;
  }
  function drawChart() {
    drawSum();
    const items = S.list || [];
    $("#ck-donut", root).innerHTML = prioDonut(items, { size: 188, time: true });
    $("#ck-legend", root).innerHTML = items.length ? prioLegend(items) + `<p class="faint ck-tip">진한 색 = 끝낸 몫 · 1순위가 가장 급해요 · 알약을 누르면 펼쳐져요</p>` : `<p class="faint ck-tip">할 일을 적고 우선순위(1~5)와 예상 시간을 고르면 색으로 쌓여요.</p>`;
  }
  // 못함 표시 켜기/끄기 — 켜면 끝냄은 꺼져요
  async function setMissed(p, on) {
    const old = { done: p.done, missed: p.missed };
    p.missed = on ? 1 : 0; if (on) p.done = 0; drawList();
    try { await api.updatePlan(p.id, { missed: on }); changed(); } catch (err) { Object.assign(p, old); drawList(); toast(err.message, "err"); }
  }
  function drawList() {
    const ul = $("#ck-list", root); if (!S.list) return;
    const nowM = S.day === ymd(today()) ? toMin(nowTime()) : -1;
    const list = S.list.slice().sort((a, b) => (a.done - b.done) || (RANK[b.priority] || 0) - (RANK[a.priority] || 0) || (a.sort || 0) - (b.sort || 0));
    ul.innerHTML = list.length ? list.map((p) => {
      const late = false;
      return `<li class="gl-item${p.done ? " done" : ""}${p.missed ? " fail" : ""}${late ? " late" : ""}" data-id="${esc(p.id)}" data-p="${p.priority || ""}">
        <input type="checkbox" class="check" data-toggle="${esc(p.id)}" ${p.done ? "checked" : ""} aria-label="${esc(p.text)} 끝냄">${missBtn(p)}
        <span class="gl-text" data-edit="${esc(p.id)}" title="두 번 눌러 고치기">${esc(p.text)}</span>
        ${prioPill(p)}${hoursPill(p)}
        <button type="button" class="icon-btn sm gl-del" data-del="${esc(p.id)}" aria-label="지우기">${icon.x(14)}</button>
      </li>`;
    }).join("") : `<li class="gl-empty"><p>${S.day >= ymd(today()) ? "해야 할 일을 적어 보세요." : "이날은 할 일이 없었어요."}</p><p class="faint">시간이 정해진 일정은 캘린더의 하루 계획표에 적어요.</p></li>`;
    drawChart();
  }
  async function load() {
    const day = S.day; S.list = null; drawHead(); $("#ck-list", root).innerHTML = `<li class="faint gl-load">불러오는 중…</li>`;
    try { const { plans } = await api.plans(["D:" + day]); if (day !== S.day) return; S.list = (plans || []).filter((p) => !p.start); drawList(); } // 시간 있는 일정은 하루 계획표 쪽
    catch (e) { toast(e.message, "err"); }
  }
  const changed = () => { S.selfAt = Date.now(); ctx.changed?.("plans"); };
  async function addMany(texts) {
    const priority = form.priority.value || null;
    let mins = +form.mins.value || null;
    if (form.mins.value === "custom") { // 직접 적은 시간
      const t = form.mins_text.value.trim();
      if (t) { mins = parseMins(t); if (mins === null) { toast(`시간을 못 읽었어요. ${MINS_HINT}`, "err"); form.mins_text.focus(); form.mins_text.select(); return 0; } }
    }
    let n = 0;
    for (const [i, raw] of texts.entries()) {
      const text = raw.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, "").trim(); if (!text) continue; // "- 할 일" · "1. 할 일" · "[ ] 할 일" 도 받아요
      try { const { plan } = await api.addPlan({ scope: "day", period: "D:" + S.day, text: text.slice(0, 200), ...(priority ? { priority } : {}), ...(mins ? { mins } : {}) }); S.list.push(plan); n++; }
      catch (e) { toast(e.message, "err"); break; }
    }
    if (n) { drawList(); changed(); if (n > 1) toast(`${n}개를 넣었어요.`); form.priority.value = ""; form.mins.value = ""; minsMode(false); } // 우선순위 · 시간은 한 번 쓰고 비워요 (다음 일에 딸려 가지 않게)
    return n;
  }

  // 시간 고르기에서 "직접 입력…" 을 고르면 그 자리에 입력칸이 열려요. Esc · 빈 채로 나가면 다시 고르기로
  function minsMode(custom) { form.mins.hidden = custom; form.mins_text.hidden = !custom; if (!custom) form.mins_text.value = ""; }
  form.mins.addEventListener("change", () => { if (form.mins.value === "custom") { minsMode(true); form.mins_text.focus(); } });
  form.mins_text.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); form.mins.value = ""; minsMode(false); form.mins.focus(); } });
  form.mins_text.addEventListener("blur", () => { if (!form.mins_text.value.trim()) { form.mins.value = ""; minsMode(false); } });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = form.text.value.trim(); if (!text || S.busy || !S.list) return form.text.focus();
    S.busy = true;
    try { if (await addMany([text])) { form.text.value = ""; draft.clear(); } }
    finally { S.busy = false; form.text.focus(); }
  });
  form.text.addEventListener("paste", async (e) => {
    const t = e.clipboardData?.getData("text/plain") || ""; if (!/\n/.test(t.trim())) return;
    e.preventDefault(); if (S.busy || !S.list) return;
    S.busy = true; try { await addMany(t.split(/\r?\n/)); form.text.value = ""; draft.clear(); } finally { S.busy = false; }
  });
  root.addEventListener("change", async (e) => {
    const t = e.target.closest("[data-toggle]"); if (!t || !S.list) return;
    const p = S.list.find((x) => x.id === t.dataset.toggle); if (!p) return;
    const v = t.checked, wm = p.missed; p.done = v ? 1 : 0; if (v) p.missed = 0; flipList($("#ck-list", root), drawList); // 체크하면 줄 긋고 아래로 미끄러져요
    try { await api.updatePlan(p.id, { done: v }); changed(); } catch (err) { p.done = v ? 0 : 1; p.missed = wm; drawList(); toast(err.message, "err"); }
  });
  root.addEventListener("click", async (e) => {
    const mb = e.target.closest("[data-miss]");
    if (mb && S.list) { const p = S.list.find((x) => x.id === mb.dataset.miss); if (p) setMissed(p, !p.missed); return; }
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
    const hb = e.target.closest("[data-hours]");
    if (hb) { // 예상 시간 고르기
      const p = S.list.find((x) => x.id === hb.dataset.hours); if (!p) return;
      openHoursDrop(hb, p.mins || null, async (m) => {
        const old = p.mins; if (m === (old || null)) return;
        p.mins = m; drawList();
        try { await api.updatePlan(p.id, { mins: m }); changed(); } catch (err) { p.mins = old; drawList(); toast(err.message, "err"); }
      });
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) { const id = del.dataset.del, keep = S.list; S.list = S.list.filter((x) => x.id !== id); drawList(); try { await api.deletePlan(id); changed(); } catch (err) { S.list = keep; drawList(); toast(err.message, "err"); } }
  });
  root.addEventListener("dblclick", (e) => {
    const t = e.target.closest("[data-edit]"); if (!t) return;
    const p = S.list.find((x) => x.id === t.dataset.edit); if (!p) return;
    const inp = document.createElement("input"); inp.className = "input gl-edit"; inp.value = p.text; inp.maxLength = 200;
    t.replaceWith(inp); inp.focus(); inp.select();
    let fin = false;
    const finish = async (save) => {
      if (fin) return; fin = true; const v = inp.value.trim();
      if (save && v && v !== p.text) { const old = p.text; p.text = v; drawList(); try { await api.updatePlan(p.id, { text: v }); changed(); } catch (err) { p.text = old; drawList(); toast(err.message, "err"); } }
      else drawList();
    };
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) finish(true); if (ev.key === "Escape") finish(false); });
    inp.addEventListener("blur", () => finish(true));
  });
  // 우클릭 → 편집 · 끝냄 · 우선순위 · 내일로 · 삭제
  root.addEventListener("contextmenu", (e) => {
    const li = e.target.closest(".gl-item"); if (!li || !S.list) return;
    const p = S.list.find((x) => x.id === li.dataset.id); if (!p) return;
    openMenu(e, { title: p.text, items: [{ k: "edit", label: "이름 고치기" }, { k: "done", label: p.done ? "끝냄 되돌리기" : "끝냄" }, { k: "miss", label: p.missed ? "못함 되돌리기" : "못함", danger: !p.missed }, { k: "prio", prio: p.priority || "" }, { sep: true }, { k: "later", label: "내일로 미루기" }, { k: "del", label: "삭제", danger: true }],
      onPick: async (k, v) => {
        if (k === "edit") { li.querySelector("[data-edit]")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); return; }
        if (k === "done") { const old = p.done, wm = p.missed; p.done = p.done ? 0 : 1; if (p.done) p.missed = 0; drawList(); try { await api.updatePlan(p.id, { done: !!p.done }); changed(); } catch (err) { p.done = old; p.missed = wm; drawList(); toast(err.message, "err"); } return; }
        if (k === "miss") return setMissed(p, !p.missed);
        if (k === "prio") { const old = p.priority; p.priority = v || null; drawList(); try { await api.updatePlan(p.id, { priority: p.priority }); changed(); } catch (err) { p.priority = old; drawList(); toast(err.message, "err"); } return; }
        if (k === "later") { try { await api.updatePlan(p.id, { period: "D:" + ymd(addDays(parseYmd(S.day), 1)) }); S.list = S.list.filter((x) => x.id !== p.id); drawList(); changed(); toast("내일로 미뤘어요."); } catch (err) { toast(err.message, "err"); } return; }
        if (k === "del") { const keep = S.list; S.list = S.list.filter((x) => x.id !== p.id); drawList(); try { await api.deletePlan(p.id); changed(); } catch (err) { S.list = keep; drawList(); toast(err.message, "err"); } }
      } });
  });
  const onChanged = (e) => { if (e.detail?.kind === "plans" && !S.busy && Date.now() - (S.selfAt || 0) > 1500) load(); }; // AI 비서 등 다른 곳에서 바꾸면 다시 (내가 방금 바꾼 건 빼고)
  window.addEventListener("trio:changed", onChanged);

  $("#ck-back", root).addEventListener("click", () => window.trioBack?.());
  // AI: 이날 할 일로 알아들어요 ("오늘 할 일 5개 짜 줘" · "9시 반에 영어 수업" · "끝난 거 체크해 줘")
  const stopAi = mountCommand($("#ck-ai", root), { hints: ["해야 할 일 5개 짜 줘 (시험 공부 위주)", "단어 50개 외우기 급해로 넣어 줘", "메일 답장 · 방 청소 넣어 줘", "끝난 거 체크해 줘"], day: () => S.day, onDone: () => { S.selfAt = 0; load(); } });
  inst = { update(rr) { const d = DAY_RE.test(rr.day || "") ? rr.day : ymd(today()); if (d !== S.day) { S.day = d; load(); } } };
  load();
  setTimeout(() => form.text.focus(), 80);
  return () => { inst = null; stopAi?.(); closeMenu(); window.removeEventListener("trio:changed", onChanged); };
}

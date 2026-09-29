// 계획 AI — 유리 구슬 아래에서 대화로 오늘·이번 주·이번 달 계획을 짜고, 제안된 항목을 한 번에 계획에 넣어요.
// 서버 POST /ai/plan 이 도구(내 노트 찾기·읽기, 웹 검색)를 쓰는 AI 를 돌려요. 대화는 이 화면 안에서만(저장 안 함).
import { api } from "../api.js";
import { $, esc, toast, ymd, today, nowTime, periodKey, planHash } from "../util.js";
import { icon } from "../icons.js";
import { renderMarkdown } from "../md.js";
import { mountAiPick, aiPrefs, stepsHTML } from "../ai-pick.js";

const SCOPES = [["day", "오늘"], ["week", "이번 주"], ["month", "이번 달"]];
const STARTERS = {
  day: ["오늘 저녁 3시간 있는데 뭐부터 할까?", "오늘 계획을 시간표로 짜 줘", "내 노트 중 복습할 것 골라서 오늘 계획에 넣어 줘"],
  week: ["이번 주 공부 계획 짜 줘. 평일 저녁 2시간, 주말 4시간 가능해", "시험이 다음 주야. 이번 주 복습 계획 세워 줘", "지난 주에 못 한 것 포함해서 이번 주 계획 정리해 줘"],
  month: ["이번 달 목표 3개로 정리하고 주별로 나눠 줘", "이번 달에 [[SQL]] 노트 시리즈 끝내는 계획 세워 줘", "자격증 준비 한 달 계획 만들어 줘"],
};

export function mount(root, ctx, r) {
  const SAVE = "trio-planner";
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVE) || "null"); } catch { return null; } })();
  const S = { scope: ["day", "week", "month"].includes(r.scope) ? r.scope : saved?.scope || "week", msgs: Array.isArray(saved?.msgs) ? saved.msgs.filter((m) => !m.pending) : [], busy: false, plan: null, model: "" };
  // 다른 화면에 갔다 와도 대화가 남게 (이 기기에만)
  const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify({ scope: S.scope, msgs: S.msgs.filter((m) => !m.pending).slice(-30) })); } catch {} };
  root.innerHTML = `
    <div class="pl" id="pl">
      <header class="pl-top">
        <a class="icon-btn sm" href="#/ai" aria-label="AI 튜터로">${icon.left(16)}</a>
        <button type="button" class="btn sm ghost" id="pl-new" title="대화를 비우고 새로">${icon.plus(14)}새 대화</button>
        <div class="seg" role="tablist" aria-label="어느 기간">${SCOPES.map(([k, l]) => `<button type="button" role="tab" data-scope="${k}" aria-selected="${k === S.scope}">${l}</button>`).join("")}</div>
        <div id="pl-pick"></div>
      </header>
      <div class="pl-body" id="pl-body">
        <div class="pl-inner" id="pl-inner"></div>
      </div>
      <form class="pl-compose" id="pl-form">
        <div class="pl-box glass">
          <textarea id="pl-q" rows="1" maxlength="4000" placeholder="무엇을 계획할까요? 시간·목표·시험일을 적어 주면 더 정확해요" aria-label="계획 요청"></textarea>
          <button class="send" type="submit" id="pl-send" aria-label="보내기">${icon.arrowRight(18)}</button>
        </div>
        <p class="composer-hint"><kbd>Enter</kbd> 보내기 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 줄바꿈 · 제안된 계획은 눌러서 한 번에 넣어요</p>
      </form>
    </div>`;
  const inner = $("#pl-inner", root), body = $("#pl-body", root), q = $("#pl-q", root);
  mountAiPick($("#pl-pick", root));

  function hero() {
    const l = SCOPES.find(([k]) => k === S.scope)[1];
    return `<div class="pl-hero">
      <div class="orb" aria-hidden="true"><div class="orb-glass"></div><div class="orb-ic">${icon.plans(30)}</div><div class="orb-shadow"></div></div>
      <h1 class="pl-title">${l} 계획, 같이 짜요</h1>
      <p class="muted">${esc(ctx.me.display_name)}님의 노트와 계획을 보고 제안해요. 시간이 얼마나 있는지, 목표가 뭔지 말해 주세요.</p>
      <div class="pl-starters">${STARTERS[S.scope].map((s) => `<button type="button" class="glass" data-starter="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    </div>`;
  }
  function planCard(plan, idx) {
    const l = SCOPES.find(([k]) => k === plan.scope)[1];
    return `<div class="pl-plan glass" data-plan="${idx}">
      <div class="pl-plan-h"><b>${icon.plans(14)} ${l} 계획 제안 · ${plan.items.length}개</b><span class="faint">체크를 풀면 빼요</span></div>
      <ul>${plan.items.map((it, i) => `<li><label><input type="checkbox" checked data-item="${i}"><span>${esc(it.text)}</span>${it.start ? `<em>${esc(it.start)}</em>` : ""}${it.mins ? `<em>${it.mins}분</em>` : ""}</label></li>`).join("")}</ul>
      <div class="row" style="justify-content:flex-end;gap:6px"><button type="button" class="btn sm accent" data-add="${idx}">${icon.plus(14)}${l} 계획에 넣기</button></div>
    </div>`;
  }
  function draw() {
    if (!S.msgs.length) { inner.innerHTML = hero(); return; }
    inner.innerHTML = S.msgs.map((m, i) => m.role === "user"
      ? `<div class="ask"><div class="bubble glass">${esc(m.content)}</div></div>`
      : `<article class="pl-ans glass ${m.pending ? "live" : ""}">
          <header><span class="orb mini" aria-hidden="true"><span class="orb-glass"></span></span><span class="chip">${esc(m.model || "AI")}</span>${m.pending ? `<span class="faint">${esc(m.status || "생각하는 중…")}</span>` : ""}</header>
          ${stepsHTML(m.steps)}
          ${m.error ? `<p class="ans-err">${esc(m.error)}</p>` : ""}
          ${m.content ? `<div class="md">${renderMarkdown(m.content)}</div>` : m.pending ? `<p class="typing"><span></span><span></span><span></span></p>` : ""}
          ${m.plan && !m.added ? planCard(m.plan, i) : m.added ? `<p class="faint pl-added">✓ ${m.added}개를 계획에 넣었어요 · <a href="${planHash({ scope: m.plan.scope, period: periodKey(m.plan.scope, today()) })}">보러 가기</a></p>` : ""}
        </article>`).join("");
  }
  const toBottom = () => { body.scrollTop = body.scrollHeight; };

  async function send(text) {
    text = text.trim(); if (!text || S.busy) return;
    S.busy = true; $("#pl-send", root).disabled = true;
    S.msgs.push({ role: "user", content: text });
    const ans = { role: "assistant", content: "", pending: true, steps: [], model: "" };
    S.msgs.push(ans); q.value = ""; autosize(); draw(); toBottom();
    const t = today(), pref = aiPrefs();
    try {
      const r = await api.planAi({
        messages: S.msgs.filter((m) => !m.pending && (m.role === "user" || m.content)).map((m) => ({ role: m.role, content: m.content })),
        scope: S.scope, model: pref.model || undefined, web: pref.web,
        periods: { day: periodKey("day", t), week: periodKey("week", t), month: periodKey("month", t), year: periodKey("year", t) }, day: ymd(t), time: nowTime(),
      });
      Object.assign(ans, { content: r.text, model: r.model, steps: r.steps || [], plan: r.plan, pending: false, changed: !!r.changed });
    } catch (e) { Object.assign(ans, { error: e.message, pending: false }); }
    finally { S.busy = false; $("#pl-send", root).disabled = false; persist(); draw(); toBottom(); if (ans.changed) window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "plans" } })); }
  }
  async function addPlan(i) {
    const m = S.msgs[i]; if (!m?.plan) return;
    const card = inner.querySelector(`[data-plan="${i}"]`);
    const picked = m.plan.items.filter((_, j) => card.querySelector(`[data-item="${j}"]`)?.checked);
    if (!picked.length) return toast("넣을 항목을 하나 이상 체크해 주세요.", "err");
    const period = periodKey(m.plan.scope, today());
    card.querySelector("[data-add]").disabled = true;
    let n = 0;
    for (const it of picked) {
      try { await api.addPlan({ scope: m.plan.scope, period, text: it.text, ...(m.plan.scope === "day" && it.start ? { start: it.start } : {}), ...(m.plan.scope === "day" && it.mins ? { mins: it.mins } : {}) }); n++; }
      catch (e) { toast(e.message, "err"); }
    }
    m.added = n; persist(); ctx.changed?.("plans"); ctx.refreshSide?.(); toast(`${n}개를 ${SCOPES.find(([k]) => k === m.plan.scope)[1]} 계획에 넣었어요.`); draw();
  }
  const autosize = () => { q.style.height = "auto"; q.style.height = Math.min(200, q.scrollHeight) + "px"; };

  root.addEventListener("click", (e) => {
    const st = e.target.closest("[data-starter]"); if (st) return send(st.dataset.starter);
    const sc = e.target.closest("[data-scope]"); if (sc) { S.scope = sc.dataset.scope; root.querySelectorAll("[data-scope]").forEach((b) => b.setAttribute("aria-selected", String(b === sc))); history.replaceState(null, "", "#/planner/" + S.scope); persist(); if (!S.msgs.length) draw(); return; }
    const ad = e.target.closest("[data-add]"); if (ad) return addPlan(+ad.dataset.add);
    if (e.target.closest("#pl-new")) { if (S.busy) return; S.msgs = []; persist(); draw(); q.focus(); return; }
  });
  $("#pl-form", root).addEventListener("submit", (e) => { e.preventDefault(); send(q.value); });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(q.value); } });
  q.addEventListener("input", autosize);
  draw(); toBottom();
  return () => {};
}

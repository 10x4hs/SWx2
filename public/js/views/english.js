// 영어 — 옵시디언 ENGLISH-OS 6개월 프리토킹 프로그램을 앱 안에서.
// 탭 다섯: 오늘(블록 링 · 시간 기록) · 연습(카드 · 스몰토크) · AI 대화(프롬프트) · 진도(누적 링 · 잔디) · 막힌 표현.
// 주소: #/english/<탭>[/<날짜 또는 덱>]. 마지막으로 본 탭은 브라우저에 기억해요.
import { $, esc } from "../util.js";
import { loadData, position, sprintLabel, todayKey, diffDays, store } from "../english/data.js";
import { mountToday } from "../english/today.js";
import { mountPractice } from "../english/practice.js";
import { mountPrompts } from "../english/prompts.js";
import { mountProgress } from "../english/progress.js";
import { mountPhrases } from "../english/phrases.js";

const TAB_KEY = "trio-en-tab";
const TABS = [
  { key: "today", label: "오늘" },
  { key: "practice", label: "연습" },
  { key: "ai", label: "AI 대화" },
  { key: "progress", label: "진도" },
  { key: "phrases", label: "막힌 표현" },
];
const NEEDS_DATA = new Set(["today", "practice", "ai", "progress"]);
const tabOf = (t) => (TABS.some((x) => x.key === t) ? t : null);

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let tab = tabOf(r.tab) || tabOf(store.get(TAB_KEY)) || "today";
  let arg = r.day || null, data = null, failed = null, stop = null, alive = true;
  if (!r.tab) history.replaceState(null, "", "#/english/" + tab);

  root.innerHTML = `
    <div class="view en-view">
      <header class="vhead">
        <div class="title">
          <span class="eyebrow">영어 · 6개월 프리토킹</span>
          <h1 class="h1" id="en-h1">영어</h1>
          <p class="en-sub" id="en-sub"></p>
        </div>
        <nav class="seg en-tabs" role="tablist" aria-label="영어 탭">
          ${TABS.map((t) => `<a role="tab" href="#/english/${t.key}" data-tab="${t.key}">${t.label}</a>`).join("")}
        </nav>
      </header>
      <div class="en-body" id="en-body"></div>
    </div>`;
  const body = $("#en-body", root);

  function head() {
    if (!data) return;
    const tk = todayKey(), pos = position(data, tk), P = data.program;
    $("#en-h1", root).textContent = pos.before ? `시작까지 D-${diffDays(tk, P.start)}` : pos.after ? "프로그램 끝" : `Day ${pos.n} / ${P.days}`;
    const bits = [sprintLabel(pos.sprint), pos.week ? `W${pos.week}` : "", P.end && !pos.after ? `끝까지 ${diffDays(tk, P.end)}일` : ""].filter(Boolean);
    $("#en-sub", root).textContent = bits.join(" · ");
  }
  function paintTabs() {
    root.querySelectorAll("[data-tab]").forEach((a) => {
      if (a.dataset.tab === tab) { a.setAttribute("aria-current", "page"); a.setAttribute("aria-selected", "true"); }
      else { a.removeAttribute("aria-current"); a.setAttribute("aria-selected", "false"); }
    });
  }
  function show() {
    stop?.(); stop = null;
    paintTabs();
    store.set(TAB_KEY, tab);
    body.replaceChildren();
    const el = document.createElement("div");
    el.className = "en-pane pane-" + tab;
    body.append(el);
    if (NEEDS_DATA.has(tab) && !data) {
      el.innerHTML = failed
        ? `<section class="panel en-missing"><h2 class="h2">영어 자료를 아직 못 불러왔어요</h2>
            <p class="muted">옵시디언 ENGLISH-OS 에서 자료 파일(<code>public/english/data.json</code>)을 만들어야 해요. 터미널에서 <code>npm run english:sync</code> 를 돌린 뒤 다시 시도해 주세요.</p>
            <div class="row"><button class="btn accent sm" type="button" id="en-retry">다시 시도</button><a class="btn ghost sm" href="#/english/phrases">막힌 표현은 지금도 쓸 수 있어요</a></div></section>`
        : `<p class="faint en-loading">영어 자료 불러오는 중…</p>`;
      $("#en-retry", el)?.addEventListener("click", () => boot(true));
      return;
    }
    const env = { ctx, data, go: ctx.go };
    if (tab === "today") stop = mountToday(el, { ...env, day: /^\d{4}-\d{2}-\d{2}$/.test(arg || "") ? arg : null });
    else if (tab === "practice") stop = mountPractice(el, { ...env, deck: arg });
    else if (tab === "ai") stop = mountPrompts(el, env);
    else if (tab === "progress") stop = mountProgress(el, env);
    else stop = mountPhrases(el, env);
  }
  async function boot(force = false) {
    failed = null;
    if (NEEDS_DATA.has(tab)) show();
    try { data = await loadData(force); }
    catch (e) { failed = e; }
    if (!alive) return;
    head();
    if (NEEDS_DATA.has(tab) || force) show();
  }

  inst = {
    update(nr) {
      const t = tabOf(nr.tab) || tab;
      if (!nr.tab) history.replaceState(null, "", "#/english/" + t);
      if (t === tab && (nr.day || null) === arg) return;
      tab = t; arg = nr.day || null;
      show();
      root.closest(".main")?.scrollTo?.({ top: 0 });
    },
  };
  if (!NEEDS_DATA.has(tab)) show();
  boot();
  return () => { alive = false; stop?.(); inst = null; };
}

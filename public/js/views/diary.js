// 일기 페이지 — 캘린더 안의 하루 한 편. 주소: #/calendar/diary/<YYYY-MM-DD> (날짜가 없으면 오늘).
// 가운데는 큰 편집기(기분 + 글, 자동 저장, 본인만 봄), 옆에는 그날 끝낸 일과 지난 일기 목록.
import { api } from "../api.js";
import { $, esc, ymd, parseYmd, addDays, today, DOW, toast } from "../util.js";
import { icon } from "../icons.js";
import { mountDiary, MOODS } from "../diary.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const longDate = (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
const shortDate = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let day = DAY_RE.test(r.day || "") ? r.day : ymd(today());
  let stopEditor = null;
  root.innerHTML = `
    <div class="dy">
      <header class="dy-top">
        <a class="icon-btn sm" id="dy-back" aria-label="캘린더로">${icon.left(16)}</a>
        <div class="dy-when"><span class="eyebrow">일기</span><h1 class="dy-date" id="dy-date"></h1></div>
        <div class="pager">
          <a class="icon-btn sm" id="dy-prev" aria-label="전날 일기">${icon.left(16)}</a>
          <a class="btn sm ghost" id="dy-today">오늘</a>
          <a class="icon-btn sm" id="dy-next" aria-label="다음날 일기">${icon.right(16)}</a>
        </div>
      </header>
      <div class="dy-cols">
        <section class="dy-paper glass" aria-label="일기 쓰기"><div id="dy-editor"></div></section>
        <aside class="dy-side">
          <section class="dy-card glass"><h2>이날 계획</h2><ul class="dy-done" id="dy-done"><li class="faint">불러오는 중…</li></ul></section>
          <section class="dy-card glass"><h2>지난 일기</h2><ul class="dy-list" id="dy-list"><li class="faint">불러오는 중…</li></ul></section>
        </aside>
      </div>
    </div>`;

  async function loadList() {
    try {
      const { entries } = await api.diaries();
      $("#dy-list", root).innerHTML = entries.length ? entries.slice(0, 30).map((e) => {
        const m = MOODS.find((x) => x.v === e.mood);
        return `<li><a href="#/calendar/diary/${e.day}" ${e.day === day ? 'aria-current="page"' : ""}><b>${esc(shortDate(e.day))}</b>${m ? `<span class="chip">${esc(m.label)}</span>` : ""}<span class="sn">${esc((e.snippet || "").replace(/\s+/g, " ").slice(0, 70)) || "기분만 남김"}</span></a></li>`;
      }).join("") : `<li class="faint">아직 쓴 일기가 없어요. 오늘 첫 일기를 남겨 보세요.</li>`;
    } catch (e) { toast(e.message, "err"); }
  }
  async function loadDone() {
    try {
      const { plans } = await api.plans(["D:" + day]);
      const list = (plans || []).slice().sort((a, b) => (a.start || "99").localeCompare(b.start || "99"));
      $("#dy-done", root).innerHTML = list.length ? list.map((p) => `<li class="${p.done ? "on" : ""}"><span class="ck">${p.done ? "✓" : ""}</span>${p.start ? `<em>${esc(p.start)}</em>` : ""}<span>${esc(p.text)}</span></li>`).join("")
        : `<li class="faint">이날 적어 둔 계획이 없어요.</li>`;
    } catch { $("#dy-done", root).innerHTML = `<li class="faint">불러오지 못했어요.</li>`; }
  }
  function open(d) {
    stopEditor?.();
    day = d;
    const dt = parseYmd(day);
    $("#dy-date", root).textContent = longDate(dt);
    $("#dy-back", root).href = "#/calendar/" + day;
    $("#dy-prev", root).href = "#/calendar/diary/" + ymd(addDays(dt, -1));
    $("#dy-next", root).href = "#/calendar/diary/" + ymd(addDays(dt, 1));
    $("#dy-today", root).href = "#/calendar/diary/" + ymd(today());
    $("#dy-next", root).toggleAttribute("aria-disabled", day >= ymd(today()));
    stopEditor = mountDiary($("#dy-editor", root), day, { rows: 18, onSaved: () => { loadList(); ctx.changed?.("diary"); } });
    loadDone(); loadList();
    setTimeout(() => root.querySelector(".diary-text")?.focus(), 60);
  }
  inst = { update(rr) { const d = DAY_RE.test(rr.day || "") ? rr.day : ymd(today()); if (d !== day) open(d); } };
  open(day);
  return () => { stopEditor?.(); inst = null; };
}

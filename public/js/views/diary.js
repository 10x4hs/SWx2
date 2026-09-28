// 일기장: 한 해를 잔디처럼. 일기를 쓴 날은 칸이 채워지고, 칸을 누르면 그날 일기를 써요.
import { api } from "../api.js";
import { $, $$, esc, ymd, today, parseYmd, addDays, pad, toast } from "../util.js";
import { icon } from "../icons.js";
import { mountDiary } from "../diary.js";

const num = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

export function mount(root, ctx, r) {
  const t = today();
  const sel = r.day ? parseYmd(r.day) : t;
  const year = sel.getFullYear();
  let stop = null, written = new Set();

  root.innerHTML = `
    <div class="view diary-view">
      <header class="vhead">
        <div class="title">
          <span class="eyebrow">Diary</span>
          <h1 class="h1 mono-date">${year}</h1>
        </div>
        <div class="row">
          <span class="faint" id="d-stats" style="font-size:13px"></span>
          <div class="pager">
            <a class="icon-btn" href="#/diary/${year - 1}-12-31" aria-label="${year - 1}">${icon.left()}</a>
            <a class="btn ghost sm" href="#/diary">${t.getFullYear()}</a>
            <a class="icon-btn" href="#/diary/${year + 1}-01-01" aria-label="${year + 1}">${icon.right()}</a>
          </div>
        </div>
      </header>
      <section class="panel grass-panel" aria-label="${year} 일기 잔디">
        <div class="grass-scroll"><div class="grass" id="grass"></div></div>
        <div class="grass-legend"><span><i></i>안 쓴 날</span><span><i class="on"></i>쓴 날</span><span><i class="today"></i>오늘</span></div>
      </section>
      <section class="panel diary-sheet" aria-labelledby="d-date">
        <div class="panel-head">
          <h2 class="d-date" id="d-date">${num(sel)}</h2>
          <div class="pager">
            <a class="icon-btn sm" href="#/diary/${ymd(addDays(sel, -1))}" aria-label="전날">${icon.left(16)}</a>
            <a class="icon-btn sm" href="#/diary/${ymd(addDays(sel, 1))}" aria-label="다음날">${icon.right(16)}</a>
          </div>
        </div>
        <div id="editor"></div>
        <p class="faint" style="font-size:12.5px;margin:0">${icon.lock(13)} 일기는 나만 볼 수 있어요. 다른 두 사람에게도, AI에게도 보내지 않아요.</p>
      </section>
    </div>`;

  function drawGrass() {
    // 첫 주는 1월 1일이 든 주의 월요일부터
    const jan1 = new Date(year, 0, 1), start = addDays(jan1, -((jan1.getDay() + 6) % 7));
    const end = new Date(year, 11, 31);
    const weeks = Math.ceil(((end - start) / 864e5 + 1) / 7);
    let months = "", cells = "", lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const monday = addDays(start, w * 7);
      const m = (monday.getFullYear() < year ? jan1 : monday).getMonth();
      months += `<span style="grid-column:${w + 2}">${m !== lastMonth && monday <= end ? m + 1 : ""}</span>`;
      if (m !== lastMonth) lastMonth = m;
      for (let d = 0; d < 7; d++) {
        const day = addDays(monday, d), k = ymd(day);
        if (day.getFullYear() !== year) { cells += `<span class="g out" style="grid-column:${w + 2};grid-row:${d + 2}"></span>`; continue; }
        const cls = [written.has(k) ? "on" : "", k === ymd(t) ? "today" : "", k === ymd(sel) ? "sel" : "", day > t ? "future" : ""].filter(Boolean).join(" ");
        cells += `<a class="g ${cls}" href="#/diary/${k}" style="grid-column:${w + 2};grid-row:${d + 2}" title="${num(day)}${written.has(k) ? " · 씀" : ""}" aria-label="${num(day)}${written.has(k) ? ", 일기 있음" : ""}"></a>`;
      }
    }
    const dows = ["1", "", "3", "", "5", "", "7"].map((l, i) => `<span class="dw" style="grid-row:${i + 2}">${l}</span>`).join("");
    $("#grass", root).style.gridTemplateColumns = `16px repeat(${weeks}, var(--cell))`;
    $("#grass", root).innerHTML = `<span class="mh"></span>${months}${dows}${cells}`;
  }
  function stats() {
    let streak = 0, d = t;
    if (!written.has(ymd(d))) d = addDays(d, -1);
    while (written.has(ymd(d))) { streak++; d = addDays(d, -1); }
    $("#d-stats", root).textContent = `${written.size}일 기록${streak > 1 ? ` · 연속 ${streak}일` : ""}`;
  }
  async function load() {
    try {
      const { days } = await api.diaryDays(year);
      written = new Set(days.filter((x) => x.len > 0 || x.mood).map((x) => x.day));
      drawGrass(); stats();
    } catch (e) { toast(e.message, "err"); }
  }

  drawGrass();
  stop = mountDiary($("#editor", root), ymd(sel), {
    rows: 12,
    onSaved: (d) => { const k = ymd(sel); if (d) written.add(k); else written.delete(k); drawGrass(); stats(); },
  });
  load();
  // 고른 날이 보이도록 잔디를 옮겨요
  requestAnimationFrame(() => { const s = $(".g.sel", root), sc = $(".grass-scroll", root); if (s && sc) sc.scrollLeft = Math.max(0, s.offsetLeft - sc.clientWidth / 2); });
  if (r.day) setTimeout(() => $("#editor textarea", root)?.focus({ preventScroll: true }), 60);
  return () => stop?.();
}

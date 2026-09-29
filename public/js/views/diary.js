// 일기장: 한 해를 잔디처럼. 탭 두 개 — 일기(쓴 날이 채워짐) · 기록(그날 계획·실행을 얼려 둔 사본, 점수만큼 진하게).
// 기록은 직접 저장하거나, 자정이 지나면 서버가 자동으로 저장해요. 둘 다 나만 봐요.
import { api } from "../api.js";
import { $, $$, esc, ymd, today, parseYmd, addDays, pad, toast } from "../util.js";
import { icon } from "../icons.js";
import { mountDiary } from "../diary.js";

const num = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

export function mount(root, ctx, r) {
  const t = today();
  const sel = r.day ? parseYmd(r.day) : t;
  const year = sel.getFullYear();
  const tab = r.tab === "rec" ? "rec" : "diary";
  const base = tab === "rec" ? "#/records/" : "#/diary/";
  let stop = null, written = new Set(), size = new Map(); // size: 일기 = 글자 수, 기록 = 점수 (잔디 진하기)

  root.innerHTML = `
    <div class="view diary-view">
      <header class="vhead">
        <div class="title">
          <span class="eyebrow">${tab === "rec" ? "하루 기록" : "일기"}</span>
          <h1 class="h1 mono-date">${year}</h1>
        </div>
        <div class="seg d-tabs" role="tablist" aria-label="일기 · 기록">
          <a role="tab" href="#/diary/${ymd(sel)}" ${tab === "diary" ? 'aria-current="page"' : ""}>${icon.diary(14)} 일기</a>
          <a role="tab" href="#/records/${ymd(sel)}" ${tab === "rec" ? 'aria-current="page"' : ""}>${icon.today(14)} 기록</a>
        </div>
        <div class="row">
          <span class="faint" id="d-stats" style="font-size:13px"></span>
          <div class="pager">
            <a class="icon-btn" href="${base}${year - 1}-12-31" aria-label="${year - 1}">${icon.left()}</a>
            <a class="btn ghost sm" href="${base}${ymd(t)}">${t.getFullYear()}</a>
            <a class="icon-btn" href="${base}${year + 1}-01-01" aria-label="${year + 1}">${icon.right()}</a>
          </div>
        </div>
      </header>
      <section class="panel grass-panel" aria-label="${year} ${tab === "rec" ? "기록" : "일기"} 잔디">
        <div class="grass-scroll"><div class="grass" id="grass"></div></div>
        <div class="grass-legend">${tab === "rec"
          ? `<span><i></i>기록 없음</span><span>점수 낮음 <i class="on l1"></i><i class="on l2"></i><i class="on l3"></i><i class="on l4"></i> 높음</span><span><i class="today"></i>오늘</span>`
          : `<span><i></i>안 쓴 날</span><span>적게 <i class="on l1"></i><i class="on l2"></i><i class="on l3"></i><i class="on l4"></i> 많이</span><span><i class="today"></i>오늘</span>`}</div>
      </section>
      <section class="panel diary-sheet" aria-labelledby="d-date">
        <div class="panel-head">
          <h2 class="d-date" id="d-date">${num(sel)}</h2>
          <div class="pager">
            <a class="icon-btn sm" href="${base}${ymd(addDays(sel, -1))}" aria-label="전날">${icon.left(16)}</a>
            <a class="icon-btn sm" href="${base}${ymd(addDays(sel, 1))}" aria-label="다음날">${icon.right(16)}</a>
          </div>
        </div>
        <div id="editor"></div>
        <p class="faint" style="font-size:12.5px;margin:0">${icon.lock(13)} ${tab === "rec" ? "기록은 나만 볼 수 있어요. 자정이 지나면 그날 계획과 실행이 자동으로 저장돼요." : "일기는 나만 볼 수 있어요. 다른 두 사람에게도, AI에게도 보내지 않아요."}</p>
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
        const len = size.get(k) || 0, lv = tab === "rec" ? (len >= 80 ? 4 : len >= 55 ? 3 : len >= 30 ? 2 : 1) : len >= 700 ? 4 : len >= 300 ? 3 : len >= 100 ? 2 : 1;
        const cls = [written.has(k) ? `on l${lv}` : "", k === ymd(t) ? "today" : "", k === ymd(sel) ? "sel" : "", day > t ? "future" : ""].filter(Boolean).join(" ");
        const tipTxt = written.has(k) ? (tab === "rec" ? ` · ${size.get(k) ?? "–"}점` : " · 씀") : "";
        cells += `<a class="g ${cls}" href="${base}${k}" style="grid-column:${w + 2};grid-row:${d + 2}" title="${num(day)}${tipTxt}" aria-label="${num(day)}${tipTxt}"></a>`;
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
    $("#d-stats", root).textContent = `${written.size}일 ${tab === "rec" ? "저장" : "기록"}${streak > 1 ? ` · 연속 ${streak}일` : ""}`;
  }
  async function load() {
    try {
      if (tab === "rec") {
        const { days } = await api.recordDays(year);
        written = new Set(days.map((x) => x.day));
        size = new Map(days.map((x) => [x.day, x.score ?? 0]));
      } else {
        const { days } = await api.diaryDays(year);
        written = new Set(days.filter((x) => x.len > 0 || x.mood).map((x) => x.day));
        size = new Map(days.map((x) => [x.day, x.len || 0]));
      }
      drawGrass(); stats();
    } catch (e) { toast(e.message, "err"); }
  }

  drawGrass();
  if (tab === "rec") { drawRecord(); load(); return () => {}; }
  stop = mountDiary($("#editor", root), ymd(sel), {
    rows: 12,
    onSaved: (d) => { const k = ymd(sel); if (d) { written.add(k); size.set(k, (d.body || "").length); } else { written.delete(k); size.delete(k); } drawGrass(); stats(); },
  });
  load();
  // 고른 날이 보이도록 잔디를 옮겨요
  scrollToSel();
  if (r.day) setTimeout(() => $("#editor textarea", root)?.focus({ preventScroll: true }), 60);
  return () => stop?.();

  function scrollToSel() { requestAnimationFrame(() => { const s = $(".g.sel", root), sc = $(".grass-scroll", root); if (s && sc) sc.scrollLeft = Math.max(0, s.offsetLeft - sc.clientWidth / 2); }); }

  // ---------- 기록 탭: 그날 계획·실행을 얼려 둔 사본 ----------
  async function drawRecord() {
    scrollToSel();
    const el = $("#editor", root), k = ymd(sel), future = sel > t;
    el.innerHTML = `<p class="faint">불러오는 중…</p>`;
    let rec = null;
    try { rec = (await api.record(k)).record; } catch (e) { toast(e.message, "err"); }
    const saveBtn = future ? "" : `<button class="btn sm ${rec ? "ghost" : "accent"}" type="button" id="rec-save">${rec ? "지금 상태로 다시 저장" : "지금 저장"}</button>`;
    if (!rec) {
      el.innerHTML = `<div class="rec-empty"><b>${future ? "아직 오지 않은 날이에요" : "저장된 기록이 없어요"}</b>
        <p>${future ? "그날이 지나면 계획과 실행이 자동으로 저장돼요." : k === ymd(t) ? "오늘 계획과 실행 기록을 지금 저장해 둘 수 있어요. 저장하지 않아도 자정이 지나면 자동으로 저장돼요." : "그날 세운 계획이나 실행 기록이 있으면 지금 저장할 수 있어요."}</p>${saveBtn}</div>`;
    } else {
      const d = rec.data, hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m || 0}분`);
      const saved = new Date(rec.saved_at);
      el.innerHTML = `
        <div class="rec-head">
          <div class="rec-score"><b>${rec.score ?? "–"}</b><span>점</span></div>
          <dl class="rec-facts">
            <div><dt>끝낸 할 일</dt><dd>${rec.done}/${rec.total}</dd></div>
            <div><dt>계획한 시간</dt><dd>${hm(d.planned)}</dd></div>
            <div><dt>끝낸 시간</dt><dd>${hm(d.doneMins)}</dd></div>
            <div><dt>집중</dt><dd>${hm(d.focus)}</dd></div>
          </dl>
          <div class="rec-meta"><span class="chip">${rec.auto ? "자정 자동 저장" : "직접 저장"}</span><span class="faint">${saved.getMonth() + 1}월 ${saved.getDate()}일 ${String(saved.getHours()).padStart(2, "0")}:${String(saved.getMinutes()).padStart(2, "0")}</span>${saveBtn}</div>
        </div>
        <div class="rec-cols">
          <section><h3>그날 세운 계획</h3>${d.plans.length ? `<ul class="rec-plans">${d.plans.map((p) => `<li class="${p.done ? "done" : ""}"><span class="ck" aria-label="${p.done ? "끝냄" : "못 함"}">${p.done ? "✓" : ""}</span><span class="tm">${p.start ? esc(p.start) : "—"}</span><span class="tx">${esc(p.text)}</span>${p.mins ? `<span class="mn">${hm(p.mins)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="faint">계획이 없었어요.</p>`}</section>
          <section><h3>실행 기록</h3>${d.logs.length ? `<ol class="rec-logs">${d.logs.map((l) => `<li><span class="tm">${esc(l.at)}</span><span class="tx">${esc(l.text)}</span></li>`).join("")}</ol>` : `<p class="faint">남긴 기록이 없어요.</p>`}</section>
        </div>`;
    }
    $("#rec-save", root)?.addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await api.saveRecord(k); toast("그날 기록을 저장했어요."); await load(); await drawRecord(); }
      catch (ex) { toast(ex.message, "err"); b.disabled = false; }
    });
  }
}

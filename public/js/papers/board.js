// 논문 현황판 (#/papers): 오늘 할 논문 · 우리 셋 진도 · 5일 지도 · 파이프라인 지도 · 옵시디언에 넣기
import { $, esc, initial, toast, avatar } from "../util.js";
import { api } from "../api.js";
import { icon } from "../icons.js";
import { loadIndex, onProgress, refreshProgress, kstToday, dayDiff, stageOf, stageVar, paperMeta, stepsDone, paperDone, memberStats, STEP_KEYS } from "./data.js";

const STEP_LABEL = { read: "읽기", quiz: "퀴즈", explain: "3분 설명" };

export function mountBoard(root, ctx) {
  let idx = null, prog = null, alive = true;
  root.innerHTML = `<div class="view pp-view pp-board"><p class="faint">논문 목록 불러오는 중…</p></div>`;
  const view = root.firstElementChild;

  const colorOf = (id, i) => ctx.user?.(id)?.color || `var(--m${i % 3})`;
  const meRow = () => prog?.members.find((m) => m.user_id === ctx.me.id);

  function stepDots(m, id, size = "") {
    return `<span class="pp-steps ${size}" aria-label="${stepsDone(m, id)}/3 단계">${STEP_KEYS.map((k) => `<i class="${m?.checks?.[id]?.[k] ? "on" : ""}" title="${STEP_LABEL[k]}"></i>`).join("")}</span>`;
  }
  function whoDone(id) {
    return `<span class="pp-who">${prog.members.map((m, i) => {
      const n = stepsDone(m, id);
      return avatar({ ...(ctx.user?.(m.user_id) || {}), display_name: m.name, color: colorOf(m.user_id, i) }, `sm ${n === 3 ? "full" : n ? "part" : "none"}`, `${m.name} · ${n}/3`);
    }).join("")}</span>`;
  }
  function paperCard(p, { big = false, late = false } = {}) {
    const st = stageOf(idx, p.stage), me = meRow(), n = stepsDone(me, p.id);
    return `<a class="pp-card ${big ? "big" : ""} ${n === 3 ? "done" : ""} ${late && n < 3 ? "late" : ""}" href="#/papers/${p.id}" style="--st:${stageVar(st.color)}">
      <span class="pp-card-top"><span class="pp-stage"><i></i>${esc(st.short)}</span><span class="faint num">${p.year}</span></span>
      <b class="pp-card-title">${esc(p.title)}</b>
      ${big ? `<span class="pp-card-field faint">${esc(p.field)}</span>` : ""}
      <span class="pp-card-foot">${stepDots(me, p.id, big ? "lg" : "")}${whoDone(p.id)}</span>
      ${late && n < 3 ? `<span class="pp-late">밀림</span>` : ""}
    </a>`;
  }

  function head(today) {
    const d = dayDiff(today, idx.until), ended = prog?.ended || today > idx.until, before = today < idx.start;
    const todayRow = idx.days.find((x) => x.day === today);
    const big = ended ? "스프린트 끝" : before ? `시작까지 D-${dayDiff(today, idx.start)}` : d === 0 ? "오늘이 마지막 날" : `D-${d}`;
    const sub = ended ? "10월 1일 ~ 5일 · 결과만 볼 수 있어요" : todayRow ? `${todayRow.label} · ${todayRow.theme}` : "";
    return `<header class="vhead pp-head">
      <div class="title">
        <span class="eyebrow">논문 스프린트 · 10.1 – 10.5 · 16편</span>
        <h1 class="h1 pp-h1">${esc(big)}</h1>
        <p class="pp-sub muted">${esc(sub)}</p>
      </div>
      <div class="row pp-head-act">
        <a class="btn ghost sm" href="#/papers/easy" title="중3~고1 눈높이 · 움직이는 그림으로">${icon.spark(15)}쉽게 읽기 16편</a>
        <button class="btn ghost sm" type="button" id="pp-note">${icon.notes(15)}노트에서 보기</button>
        <button class="btn ghost sm" type="button" id="pp-obs" title="진짜 옵시디언 앱에 넣을 .md 파일">${icon.download(15)}옵시디언 파일</button>
        ${todayRow && !ended ? (() => { const next = todayRow.papers.find((id) => !paperDone(meRow(), id)) || todayRow.papers[0]; return `<a class="btn accent sm" href="#/papers/${next}">오늘 공부 시작 ›</a>`; })() : ""}
      </div>
    </header>
    <p class="pp-goal"><span class="faint">끝났다는 기준</span> ${esc(idx.goal)}</p>`;
  }

  function todayPanel(today) {
    const row = idx.days.find((x) => x.day === today);
    if (!row) {
      const next = idx.days.find((x) => x.day > today);
      return `<section class="panel pp-today"><div class="panel-head"><h2 class="h2">오늘</h2></div>
        <p class="muted">${next ? `다음 공부는 ${esc(next.label)} — ${esc(next.theme)}` : "5일 일정이 다 지났어요. 아래 지도에서 결과를 봐요."}</p></section>`;
    }
    const me = meRow(), done = row.papers.filter((id) => paperDone(me, id)).length;
    return `<section class="panel pp-today">
      <div class="panel-head"><h2 class="h2">오늘 <span class="faint num">${done}/${row.papers.length}편</span></h2><span class="chip">${esc(row.label)}</span></div>
      <div class="pp-today-grid">${row.papers.map((id) => paperCard(paperMeta(idx, id), { big: true })).join("")}</div>
      <p class="faint pp-legend"><span class="pp-steps"><i class="on"></i><i class="on"></i><i></i></span> 읽기 · 퀴즈 · 3분 설명 — 셋 다 채우면 그 논문 끝</p>
    </section>`;
  }

  function teamPanel(today) {
    const rows = prog.members.map((m, i) => {
      const s = memberStats(idx, m, today), c = colorOf(m.user_id, i);
      const cells = idx.days.map((d) => `<span class="pp-strip-day ${d.day === today ? "today" : ""}">${d.papers.map((id) => {
        const n = stepsDone(m, id);
        return `<i class="n${n}" title="${esc(paperMeta(idx, id).title)} · ${n}/3"></i>`;
      }).join("")}</span>`).join("");
      return `<div class="pp-mem" style="--c:${c}">
        ${avatar({ ...(ctx.user?.(m.user_id) || {}), display_name: m.name, color: c }, "")}
        <span class="pp-mem-main">
          <span class="pp-mem-top"><b>${esc(m.name)}${m.user_id === ctx.me.id ? ` <span class="faint">(나)</span>` : ""}</b>
            <span class="num"><b>${Math.round(s.pct * 100)}%</b> <span class="faint">${s.papersDone}/16편</span></span></span>
          <span class="pp-strip" aria-label="${esc(m.name)} ${s.done}/${s.total}칸">${cells}</span>
          <span class="pp-mem-foot faint">${s.todayTotal ? `오늘 ${s.todayDone}/${s.todayTotal}편` : ""}${s.behind ? ` · <span class="pp-behind">밀린 칸 ${s.behind}</span>` : s.due ? " · 일정대로" : ""}</span>
        </span>
      </div>`;
    }).join("");
    return `<section class="panel pp-team">
      <div class="panel-head"><h2 class="h2">우리 셋</h2><span class="faint">칸 하나 = 논문 하나 · 진할수록 많이 함</span></div>
      <div class="pp-mems">${rows}</div>
    </section>`;
  }

  function mapPanel(today) {
    return `<section class="panel pp-map">
      <div class="panel-head"><h2 class="h2">5일 지도</h2><span class="faint">누르면 그 논문 공부 페이지</span></div>
      <div class="pp-days">${idx.days.map((d) => `
        <div class="pp-day ${d.day === today ? "today" : d.day < today ? "past" : ""}">
          <div class="pp-day-head"><b>${esc(d.label)}</b><span class="faint">${esc(d.theme)}</span></div>
          ${d.papers.map((id) => paperCard(paperMeta(idx, id), { late: d.day < today })).join("")}
        </div>`).join("")}</div>
    </section>`;
  }

  function pipePanel() {
    const me = meRow();
    return `<section class="panel pp-pipe">
      <div class="panel-head"><h2 class="h2">우리 파이프라인 지도</h2><span class="faint">16편이 전부 여기 한 줄에 들어가요</span></div>
      <ol class="pp-flow">${idx.stages.map((s) => {
        const ps = idx.papers.filter((p) => p.stage === s.n);
        return `<li class="pp-node" style="--st:${stageVar(s.color)}">
          <span class="pp-node-n num">${s.n}</span>
          <b>${esc(s.label)}</b>
          <span class="pp-node-why faint">${esc(s.why)}</span>
          <span class="pp-node-papers">${ps.map((p) => `<a href="#/papers/${p.id}" class="pp-mini ${paperDone(me, p.id) ? "done" : ""}">${esc(p.title)}</a>`).join("")}</span>
        </li>`;
      }).join("")}</ol>
      <p class="faint pp-pipe-note">RGB + 열화상 카메라 → … → Rockchip NPU 보드에서 실시간. 논문을 설명할 때 "몇 번 칸 논문이에요"로 시작하면 쉬워요.</p>
    </section>`;
  }

  function paint() {
    if (!alive || !idx) return;
    const today = prog?.today || kstToday();
    if (!prog) { view.innerHTML = head(today) + `<p class="faint">진도 불러오는 중…</p>`; bind(); return; }
    view.innerHTML = head(today) + `<div class="pp-top">${todayPanel(today)}${teamPanel(today)}</div>` + mapPanel(today) + pipePanel();
    bind();
  }
  function bind() {
    $("#pp-obs", view)?.addEventListener("click", obsidian);
    $("#pp-note", view)?.addEventListener("click", async () => {
      try {
        const r = await api.resolve("📄 논문 공부");
        if (r.id) ctx.go("#/notes/" + r.id);
        else toast("노트에 '📄 논문 공부' 페이지가 아직 없어요.", "err");
      } catch (e) { toast(e.message, "err"); }
    });
  }

  async function obsidian() {
    const ok = confirm("진짜 옵시디언 앱에 넣을 현황 노트(.md)를 받아요. (앱 노트에는 이미 '📄 논문 공부' 가 있어요)\n\n· 받은 파일을 옵시디언 볼트 폴더에 끌어 넣으면 끝\n· 새로 받으면 예전에 받은 노트의 판은 더 이상 안 열려요\n\n받을까요?");
    if (!ok) return;
    try {
      const r = await api.papersObsidian();
      const blob = new Blob([r.markdown], { type: "text/markdown;charset=utf-8" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: r.filename });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("받았어요. 옵시디언 볼트에 넣고 읽기 모드(⌘E)로 열어 보세요.");
    } catch (e) { toast(e.message || "노트를 만들지 못했어요.", "err"); }
  }

  const off = onProgress((p) => { prog = p; paint(); });
  loadIndex().then((x) => { idx = x; paint(); }).catch(() => { view.innerHTML = `<section class="panel"><h2 class="h2">논문 목록을 못 불러왔어요</h2><p class="muted">새로 고침 해 보세요.</p></section>`; });
  refreshProgress().catch((e) => toast(e.message || "진도를 못 불러왔어요.", "err"));
  // 친구가 체크하면 보이게: 화면이 보일 때 30초마다
  const t = setInterval(() => { if (!document.hidden) refreshProgress().catch(() => {}); }, 30000);
  return () => { alive = false; off(); clearInterval(t); };
}

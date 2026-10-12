// Dsm-mafia — 명령 팔레트 (Cmd/Ctrl+K · app.js 에서 나눴어요).
import { api } from "./api.js";
import { $, esc, debounce, ymd, today, planHash } from "./util.js";
import * as notesView from "./views/notes.js";
import { getDockPages } from "./dock.js";
import { timer } from "./focus-timer.js";

// ctx 는 app.js 가 갖고 있어서 init 으로 받아요. 단축키 리스너도 여기서 한 번만 걸어요
let ctx;
export function initPalette(deps) {
  ({ ctx } = deps);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
  });
}

let paletteOpen = false;
export function openPalette() {
  if (paletteOpen || !ctx.me || document.querySelector(".pw-back.force")) return;
  paletteOpen = true;
  const prevFocus = document.activeElement;
  const back = document.createElement("div");
  back.className = "palette-back";
  back.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="검색과 명령">
      <input id="pal-input" placeholder="노트, 계획, 명령 검색… 없으면 새 노트로 만들어요" autocomplete="off" aria-controls="pal-list">
      <ul id="pal-list" role="listbox"></ul>
      <div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> 이동</span><span><kbd>Enter</kbd> 열기</span><span><kbd>Esc</kbd> 닫기</span></div>
    </div>`;
  document.body.appendChild(back);
  const input = $("#pal-input", back), list = $("#pal-list", back);
  let items = [], sel = 0, seq = 0;

  const commands = () => [
    { grp: "이동", t: "홈", s: "차트 · 서로의 현황", run: () => ctx.go("#/") },
    { grp: "이동", t: "오늘 페이지", s: "캘린더 · 할 일 · 시간표 · 일기", run: () => ctx.go("#/calendar/" + ymd(today())) },
    { grp: "이동", t: "일기 쓰기", s: "캘린더 · 오늘의 일기", run: () => { ctx.go("#/calendar/" + ymd(today())); setTimeout(() => $("#dp-diary textarea")?.focus(), 400); } },
    { grp: "이동", t: "내일 계획 세우기", s: ymd(new Date(Date.now() + 864e5)), run: () => ctx.go("#/calendar/" + ymd(new Date(Date.now() + 864e5))) },
    { grp: "이동", t: "한 해 잔디", s: "캘린더 · 연 · 일기 | 기록", run: () => ctx.go("#/calendar/year") },
    { grp: "이동", t: "오늘 체크리스트", s: "할 일 적기 · 우선순위 차트", run: () => ctx.go("#/checklist") },
    { grp: "이동", t: "업데이트 기록", s: "무엇이 언제 바뀌었나", run: () => ctx.go("#/updates") },
    { grp: "이동", t: "쉽게 읽기 (논문 16편)", s: "중3~고1 눈높이 · AI 튜터 · 복습", run: () => ctx.go("#/papers/easy") },
    { grp: "이동", t: "섞어서 복습 (쉽게 읽기)", s: "오늘 복습할 차례", run: () => ctx.go("#/papers/easy/review") },
    { grp: "이동", t: "이번 주 목표", s: "목표 · 주", run: () => ctx.go("#/goals/week") },
    { grp: "이동", t: "이번 달 목표", s: "목표 · 월", run: () => ctx.go("#/goals/month") },
    { grp: "이동", t: "올해 목표", s: "목표 · 년", run: () => ctx.go("#/goals/year") },
    { grp: "이동", t: "그래프 보기", s: "노트 · 그래프 탭", run: () => ctx.go("#/graph") },
    { grp: "이동", t: "계획 AI", s: "대화로 이번 주 계획 짜기", run: () => ctx.go("#/planner") },
    { grp: "이동", t: "오늘 일기 쓰기", s: "캘린더 · 일기", run: () => ctx.go("#/calendar/diary/" + ymd(today())) },
    { grp: "이동", t: "우리 셋 주간 회고", s: "홈 · 5쪽", run: () => { try { localStorage.setItem("trio-home-page", "4"); } catch {} ctx.go("#/"); } },
    { grp: "명령", t: "오늘 데일리 노트 열기", s: ymd(today()), run: () => notesView.openDaily(ctx, ymd(today())) },
    { grp: "명령", t: "새 노트", s: "빈 노트", run: () => notesView.createNote(ctx, "") },
    { grp: "명령", t: "AI에게 묻기", s: "Gemini · MiMo", run: () => ctx.go("#/ai") },
    { grp: "명령", t: "Dock 페이지 추가", s: "하고 싶은 걸 적으면 AI 가 화면을 짜요", run: () => ctx.go("#/p/new") },
    { grp: "명령", t: "과목 탭 추가", s: "공부 안에 수학 · 코딩 · 자격증 … AI 가 페이지를 짜요", run: () => ctx.go("#/study/new") },
    ...getDockPages().map((p) => ({ grp: p.place === "study" ? "과목" : "페이지", t: `${/^https?:/.test(p.icon) ? "" : p.icon + " "}${p.title}`, s: p.mine ? (p.shared ? "내 것 · 공개" : "내 것") : `${ctx.user(p.user_id)?.display_name || ""} 의 것`, run: () => ctx.go((p.place === "study" ? "#/study/" : "#/p/") + p.id) })),
    { grp: "이동", t: "대화방", s: "셋이 같이 · @마피아", run: () => ctx.go("#/room/chat") },
    { grp: "이동", t: "창고", s: "책 · 링크 · 영상", run: () => ctx.go("#/room/library") },
    { grp: "명령", t: "집중 타이머 시작", s: "25분", run: () => timer.start(25) },
  ];
  const draw = () => {
    let grp = "";
    list.innerHTML = items.map((it, i) => {
      const head = it.grp !== grp ? `<li class="grp" role="presentation">${esc((grp = it.grp))}</li>` : "";
      return `${head}<li role="presentation"><button type="button" role="option" data-i="${i}" aria-selected="${i === sel}">${it.ic || ""}<span class="t">${esc(it.t)}</span><span class="s">${esc(it.s || "")}</span></button></li>`;
    }).join("") || `<li class="grp">결과가 없어요</li>`;
    const cur = list.querySelector('[aria-selected="true"]');
    if (cur) cur.scrollIntoView({ block: "nearest" });
  };
  const search = debounce(async (q) => {
    const my = ++seq;
    const cmds = commands().filter((c) => !q || (c.t + c.s).toLowerCase().includes(q.toLowerCase()));
    let found = { notes: [], plans: [] };
    if (q) { try { found = await api.search(q); } catch {} }
    if (my !== seq) return;
    const scopeName = { year: "올해", month: "월간", week: "주간", day: "하루" };
    items = [
      ...found.notes.map((n) => ({ grp: "노트", t: n.title, s: (n.snippet || "").replace(/\s+/g, " "), ic: `<span class="dot" style="--c:${esc(ctx.user(n.user_id)?.color || "#999")}"></span>`, run: () => ctx.go("#/notes/" + n.id) })),
      ...found.plans.map((p) => ({ grp: "내 계획", t: p.text, s: `${scopeName[p.scope]} · ${p.period.slice(2)}${p.done ? " · 완료" : ""}`, run: () => ctx.go(planHash(p)) })),
      ...cmds,
      ...(q && !found.notes.some((n) => n.title.toLowerCase() === q.toLowerCase()) ? [{ grp: "만들기", t: `새 노트: ${q}`, s: "Enter로 만들기", run: () => notesView.createNote(ctx, q) }] : []),
    ];
    sel = 0;
    draw();
  }, 120);
  const close = () => { paletteOpen = false; back.remove(); document.removeEventListener("keydown", onKey, true); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
  const runSel = () => { const it = items[sel]; if (it) { close(); it.run(); } };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); runSel(); }
  };
  document.addEventListener("keydown", onKey, true);
  input.addEventListener("input", () => search(input.value.trim()));
  list.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { sel = +b.dataset.i; runSel(); } });
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  search.flush("");
  input.focus();
}

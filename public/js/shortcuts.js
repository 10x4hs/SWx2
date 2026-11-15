// 단축키 목록 (2026-11) — ? 를 누르거나(글 쓰는 중이 아닐 때) 프로필 메뉴의 '단축키'로 열어요.
//   코드에 실제로 있는 키만 적어요. 키를 더하거나 빼면 여기도 같이 고쳐 주세요:
//   palette.js(⌘K) · undo.js(⌘Z · ⌘⇧Z · Ctrl+Y) · dock-hide.js(⌥⌘D) · row-more.js(⋯) · note-menu.js(Shift+F10)
//   views/day.js(⌘A · Delete · Esc) · plan-clip.js(⌘C · ⌘V) · blocks/editor.js(/ · ⌘↵) · views/news.js(j k [ ] s r f) · views/psy.js(/)
//   창은 기본 <dialog> (showModal) — 바깥은 못 누르고 Tab 은 창 안에서만 돌아요. Esc · 닫기 · 바깥 누르기로 닫히고, 초점은 연 자리로 돌아가요.
import { esc } from "./util.js";

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const M = MAC ? "⌘" : "Ctrl", SH = MAC ? "⇧" : "Shift", OPT = MAC ? "⌥" : "Alt";
const k = (...keys) => `<span class="ks-k">${keys.map((x) => `<kbd>${esc(x)}</kbd>`).join("")}</span>`; // 한 조합은 줄바꿈 없이
const or = (...ks) => ks.join(`<span class="ks-or">또는</span>`);

const GROUPS = () => [
  ["어디서나", [
    [k(M, "K"), "찾기 · 바로 가기 (명령 팔레트)"],
    [k(M, "Z"), "되돌리기 — 계획 · 일기 · 노트"],
    [or(k(M, SH, "Z"), ...(MAC ? [] : [k("Ctrl", "Y")])), "다시 하기"],
    [k(OPT, M, "D"), "Dock 자동 숨기기 켜기 · 끄기"],
    [k("?"), "이 단축키 목록"],
    [k("Esc"), "메뉴 · 작은 창 닫기"],
    [`<span class="ks-more" aria-hidden="true">⋯</span><span class="ks-or">또는</span><span class="ks-w">우클릭</span>`, "칸 메뉴 (폰은 ⋯ 를 누르거나 길게 눌러요)"],
  ]],
  ["하루 계획표", [
    [k(M, "A"), "이날 시각 있는 계획 모두 고르기"],
    [or(k(M, "C"), k(M, "V")), "고른 계획 복사 · 붙여넣기"],
    [k("Delete"), "고른 계획 지우기"],
    [k("Esc"), "고른 것 풀기"],
    [or(k("Enter"), k(SH, "Enter")), "할 일 칸: 저장 · 줄바꿈"],
    [or(k("Tab"), k(SH, "Tab")), "할 일 칸: 들여쓰기 · 내어쓰기"],
  ]],
  ["노트 · Brain", [
    [k("/"), "노트 본문: 블록 고르기 (제목 · 목록 · 할 일 …)"],
    [k(M, "Enter"), "노트 본문: 아래에 새 블록"],
    [k(SH, "F10"), "노트 · Brain 목록 칸에서 메뉴"],
    [`<span class="ks-w">두 번 클릭</span>`, "Brain 노드 안으로 들어가기"],
  ]],
  ["News", [
    [or(k("j"), k("k")), "다음 · 이전 기사"],
    [or(k("["), k("]")), "이전 · 다음 호"],
    [or(k("s"), k("r")), "별표 · 읽음 표시"],
    [k("f"), "기사 크게 보기"],
    [k("Esc"), "기사 닫기"],
  ]],
  ["공부 화면", [
    [or(k("←"), k("→")), "카드 · 그림 앞뒤로"],
    [k("/"), "Psychology 에서 찾기"],
  ]],
];

let dlg = null, back = null;
function build() {
  const d = document.createElement("dialog");
  d.className = "ks"; d.setAttribute("aria-labelledby", "ks-h");
  d.innerHTML = `
    <header class="ks-head"><h2 id="ks-h">단축키</h2><button type="button" class="icon-btn sm ks-x" data-ks-close aria-label="닫기">✕</button></header>
    <div class="ks-body" tabindex="0" aria-label="단축키 목록 (위아래 화살표로 넘겨요)">${GROUPS().map(([t, rows]) => `
      <section class="ks-g"><h3>${esc(t)}</h3><dl>${rows.map(([keys, what]) => `<div class="ks-r"><dt>${keys}</dt><dd>${esc(what)}</dd></div>`).join("")}</dl></section>`).join("")}
    </div>`;
  d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-ks-close]")) d.close(); }); // 바깥(어두운 곳) · 닫기
  // 키는 창 안에서만: Tab 은 [닫기 ↔ 목록] 사이를 돌고, Esc 는 창만 닫아요 (뒤 화면의 Esc — News '뒤로' 같은 것 — 까지 가지 않게)
  d.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); return; }
    if (e.key !== "Tab") return;
    const f = [...d.querySelectorAll("button, [tabindex='0']")], i = f.indexOf(document.activeElement);
    e.preventDefault(); e.stopPropagation();
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  });
  d.addEventListener("close", () => { const b = back; back = null; if (b?.isConnected) b.focus({ preventScroll: true }); });
  document.body.appendChild(d);
  return d;
}

export function openShortcuts(from = document.activeElement) {
  dlg = dlg?.isConnected ? dlg : build();
  if (dlg.open) return;
  back = from && from !== document.body ? from : null;
  dlg.showModal();
  dlg.querySelector("[data-ks-close]").focus();
}

const typing = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
addEventListener("keydown", (e) => {
  if (e.key !== "?" || e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (typing(e.target) || typing(document.activeElement)) return;
  if (document.querySelector("dialog[open], .cm, .palette-back")) return; // 다른 창 · 메뉴가 떠 있으면 그쪽 먼저
  e.preventDefault();
  openShortcuts();
});
// 프로필 메뉴의 '단축키' — 메뉴를 닫고, 닫으면 초점은 프로필 버튼으로
document.addEventListener("click", (e) => {
  if (!e.target.closest?.("[data-shortcuts]")) return;
  const m = document.getElementById("me-menu"), b = document.getElementById("me-btn");
  if (m) m.hidden = true; b?.setAttribute("aria-expanded", "false");
  openShortcuts(b);
});

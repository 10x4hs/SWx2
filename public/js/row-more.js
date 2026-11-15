// ⋯ 버튼 — 오른쪽 클릭 · 길게 누르기에만 숨어 있던 칸 메뉴를 눈에 보이게 (2026-11).
//   누르면 그 칸에 contextmenu 를 보내요 → 화면마다 이미 있는 메뉴 코드가 그대로 떠요 (메뉴를 새로 만들지 않아요).
//   moreBtn(이름)        — 칸 안에 넣는 버튼. 각 화면의 contextmenu 처리가 e.target.closest(칸) 으로 칸을 찾아요
//   moreBtn(이름, "a")   — 칸 옆(같은 부모)에 두는 버튼. 링크(<a>) 안엔 버튼을 넣을 수 없어서 형제 a 로 보내요
//   보이기: 컴퓨터는 칸에 올리거나 초점이 오면 · 폰(좁은 화면 · 터치)은 늘 (css/actions.css)
//   메뉴가 뜨면 버튼에 aria-expanded, Esc 로 닫으면 초점이 버튼으로 돌아와요 (ctxmenu.js 가 e.rowMore 를 봐요)
//   data-dblkey: 두 번 눌러 고치는 칸에 초점 + Enter · F2 = 두 번 누르기 (아래)
import { esc } from "./util.js";

export const moreBtn = (label, to = "") =>
  `<button type="button" class="row-more" data-rowmore="${esc(to)}" aria-haspopup="menu" aria-label="${esc(label)} 메뉴" title="메뉴 · 우클릭과 같아요">⋯</button>`;

export function openMoreFor(b) {
  const to = b.dataset.rowmore;
  const t = to ? b.parentElement?.querySelector(`:scope > ${to}`) : b;
  if (!t) return;
  const r = b.getBoundingClientRect();
  const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left, clientY: r.bottom + 4 });
  ev.rowMore = b;
  t.dispatchEvent(ev);
}

// 창(window)에서 먼저 받아요 — 칸의 click(열기 · 고르기) · pointerdown(끌기 · 길게 누르기)까지 내려가지 않게
addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-rowmore]"); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  openMoreFor(b);
}, true);
addEventListener("pointerdown", (e) => { if (e.target.closest?.("[data-rowmore]")) e.stopPropagation(); }, true);

// 두 번 눌러야만 되던 것(이름 고치기 등)에 키보드 길: data-dblkey 칸에 초점이 있을 때 Enter · F2 = 두 번 누르기
//   창(window) capture 에서 받아 막아요 — 그래야 dblclick 이 새로 건 '고치는 중 Enter = 저장' 이 같은 Enter 를 또 받지 않아요
addEventListener("keydown", (e) => {
  if ((e.key !== "Enter" && e.key !== "F2") || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  const t = e.target; if (!t?.matches?.("[data-dblkey]") || t.isContentEditable) return;
  e.preventDefault(); e.stopPropagation();
  const r = t.getBoundingClientRect();
  t.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + r.height / 2 }));
}, true);

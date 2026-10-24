// '화면 꾸미기' 창 (프로필 메뉴에서 열어요) — 고르는 즉시 앱 전체가 바뀌고, 계정에 저장돼 다른 기기도 같아요 (theme.js)
// 테마 · 배경화면 · 강조 색 · 유리는 라디오 묶음(화살표로 옮기면 바로 골라져요), 투명도 줄이기는 스위치. 같은 창 모양(.pw-dialog)을 써요.
import { icon } from "./icons.js";
import { esc } from "./util.js";
import { WALLS, ACCENTS, THEMES, getPrefs, setPrefs, reset, systemSolid, flush } from "./theme.js";

const GLASS = [["clear", "맑게"], ["tinted", "색 입힘"]];
const radios = (name, list, cur, cls, inner = (k, label) => `<span>${esc(label)}</span>`) =>
  list.map(([k, label]) => `<button type="button" role="radio" class="${cls}" data-v="${k}" aria-checked="${k === cur}" tabindex="${k === cur ? 0 : -1}" aria-label="${esc(label)}">${inner(k, label)}</button>`).join("");

export function openThemePanel() {
  if (document.querySelector(".thm-back")) return;
  const prevFocus = document.activeElement;
  const p = getPrefs();
  const back = document.createElement("div");
  back.className = "palette-back pw-back thm-back";
  back.innerHTML = `
    <section class="pw-dialog glass thm-dialog" role="dialog" aria-modal="true" aria-labelledby="thm-title">
      <div class="pw-head"><h2 id="thm-title">화면 꾸미기</h2><button class="icon-btn sm" type="button" data-close aria-label="닫기">${icon.x(16)}</button></div>
      <div class="thm-preview" aria-hidden="true">
        <div class="thm-pv-wall" data-wp="${p.wall}"></div>
        <div class="thm-pv-card">
          <b>오늘 할 일</b>
          <span class="thm-pv-row"><i class="thm-pv-check on"></i>영어 단어 30개</span>
          <span class="thm-pv-row"><i class="thm-pv-check"></i>논문 한 편 읽기</span>
          <span class="thm-pv-foot"><i class="thm-pv-toggle"></i><span class="thm-pv-btn">저장</span></span>
        </div>
      </div>
      <div class="thm-scroll">
        <section class="thm-sec">
          <h3 id="thm-h-theme">테마</h3>
          <div class="seg thm-seg" role="radiogroup" aria-labelledby="thm-h-theme" data-group="theme">${radios("theme", THEMES, p.theme, "")}</div>
          <p class="thm-hint">자동은 기기 설정(밝게 · 어둡게)을 따라가요.</p>
        </section>
        <section class="thm-sec">
          <h3 id="thm-h-wall">배경화면</h3>
          <div class="thm-walls" role="radiogroup" aria-labelledby="thm-h-wall" data-group="wall">${radios("wall", WALLS, p.wall, "thm-wall", (k, label) => `<i class="thm-sw" data-wp="${k}"></i><span>${esc(label)}</span>`)}</div>
          <p class="thm-hint">고른 배경이 유리 너머로 비쳐서 앱 전체 색이 은은하게 바뀌어요.</p>
        </section>
        <section class="thm-sec">
          <h3 id="thm-h-accent">강조 색</h3>
          <div class="thm-accents" role="radiogroup" aria-labelledby="thm-h-accent" data-group="accent">${radios("accent", ACCENTS, p.accent, "thm-ac", (k, label) => `<i class="thm-dot" data-ac="${k}"></i><span>${esc(label)}</span>`)}</div>
          <p class="thm-hint">버튼 · 스위치 · 체크 · 선택한 글자 색이 바로 바뀌어요.</p>
        </section>
        <section class="thm-sec">
          <h3 id="thm-h-glass">유리</h3>
          <div class="seg thm-seg" role="radiogroup" aria-labelledby="thm-h-glass" data-group="glass">${radios("glass", GLASS, p.glass, "")}</div>
          <p class="thm-hint" id="thm-glass-hint"></p>
        </section>
        <section class="thm-sec thm-solid">
          <label class="switch thm-switch"><input type="checkbox" role="switch" id="thm-solid" ${p.solid ? "checked" : ""} aria-describedby="thm-solid-hint"><span></span><b>투명도 줄이기</b></label>
          <p class="thm-hint" id="thm-solid-hint"></p>
        </section>
      </div>
      <div class="pw-foot thm-foot"><span class="thm-sync" id="thm-sync" role="status" aria-live="polite">모든 기기에 저장돼요</span><button class="btn ghost" type="button" id="thm-reset">기본으로</button><button class="btn accent" type="button" data-close>완료</button></div>
    </section>`;
  document.body.append(back);
  const dlg = back.querySelector(".thm-dialog");

  const paint = () => {
    const c = getPrefs();
    for (const g of ["theme", "wall", "accent", "glass"]) {
      back.querySelectorAll(`[data-group="${g}"] [data-v]`).forEach((b) => { const on = b.dataset.v === c[g]; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
    }
    back.querySelector(".thm-pv-wall").dataset.wp = c.wall;
    const solid = back.querySelector("#thm-solid"), sys = systemSolid();
    solid.checked = c.solid || sys; solid.disabled = sys && !c.solid;
    back.querySelector("#thm-solid-hint").textContent = sys && !c.solid ? "기기 설정에서 투명도 줄이기가 켜져 있어서 늘 불투명하게 보여요." : "흐림 없이 불투명한 판으로 보여요. 글자가 더 또렷해져요.";
    back.querySelector("#thm-glass-hint").textContent = c.solid || sys ? "투명도 줄이기가 켜져 있으면 유리 대신 불투명한 판이에요." : c.glass === "clear" ? "맑게: 배경화면이 더 많이 비쳐 보여요." : "색 입힘: 판이 조금 더 짙어서 글자가 잘 읽혀요.";
  };
  paint();

  // 라디오 묶음: 누르기 · 화살표(옮기면 바로 골라져요) · Home/End
  back.querySelectorAll("[role=radiogroup]").forEach((grp) => {
    const g = grp.dataset.group, items = () => [...grp.querySelectorAll("[role=radio]")];
    const pick = (b, focus) => { setPrefs({ [g]: b.dataset.v }); paint(); if (focus) b.focus(); };
    grp.addEventListener("click", (e) => { const b = e.target.closest("[role=radio]"); if (b) pick(b, false); });
    grp.addEventListener("keydown", (e) => {
      const list = items(), i = list.indexOf(document.activeElement); if (i < 0) return;
      const cols = g === "wall" ? Math.round(grp.clientWidth / (list[0].offsetWidth || 1)) || 1 : 1;
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      let j = null;
      if (step) j = (i + step + list.length) % list.length; else if (e.key === "Home") j = 0; else if (e.key === "End") j = list.length - 1;
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); pick(list[i], true); return; }
      if (j == null) return;
      e.preventDefault(); pick(list[j], true);
    });
  });
  back.querySelector("#thm-solid").addEventListener("change", (e) => { setPrefs({ solid: e.target.checked }); paint(); });
  back.querySelector("#thm-reset").addEventListener("click", () => { reset(); paint(); });

  const sync = back.querySelector("#thm-sync");
  const onSync = (e) => { sync.textContent = { saving: "저장하는 중…", saved: "모든 기기에 저장했어요", offline: "이 기기에 두었어요 · 연결되면 다시 보낼게요" }[e.detail.s] || ""; };
  const onUi = () => paint(); // 다른 탭 · 기기 설정이 바뀌어도 창이 따라가요
  window.addEventListener("trio:ui-sync", onSync); window.addEventListener("trio:ui", onUi);

  const close = () => {
    back.remove(); document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("trio:ui-sync", onSync); window.removeEventListener("trio:ui", onUi);
    flush(); prevFocus?.focus?.();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return; // 창 안에서만 돌아요
    const f = [...dlg.querySelectorAll("button:not([disabled]):not([tabindex='-1']), input:not([disabled])")].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", onKey, true);
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) close(); });
  back.querySelector('[data-group="theme"] [aria-checked="true"]')?.focus();
}

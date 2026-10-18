// SWx2 — 비밀번호 바꾸기 대화상자 (app.js 에서 나눴어요).
import { api } from "./api.js";
import { $, esc, toast } from "./util.js";
import { icon } from "./icons.js";

// 로그아웃(showAuth) · 막혀 있던 화면 이어 열기(resume)는 app.js 가 갖고 있어서 init 으로 받아요 (app.js 를 import 하면 순환이라서요)
let ctx, showAuth, resume;
export function initPassword(deps) { ({ ctx, showAuth, resume } = deps); }

// ---------- 비밀번호 바꾸기 (내 것만, 지금 비밀번호 확인) ----------
// force = 스터디장이 정해 준 비밀번호 그대로일 때: 닫기 · Esc · 바깥 누르기 없이, 취소 대신 로그아웃만.
export function openPassword({ force = false } = {}) {
  const open = document.querySelector(".pw-back");
  if (open) { if (force && !open.dataset.force) { open.remove(); } else return; }
  const prevFocus = document.activeElement;
  const back = document.createElement("div");
  back.className = "palette-back pw-back" + (force ? " force" : "");
  if (force) back.dataset.force = "1";
  back.innerHTML = `
    <form class="pw-dialog glass" role="dialog" aria-modal="true" aria-labelledby="pw-title" aria-describedby="pw-help" autocomplete="on" novalidate>
      <input type="text" name="username" value="${esc(ctx.me.username)}" autocomplete="username" hidden>
      <div class="pw-head"><h2 id="pw-title">${force ? "먼저 비밀번호를 바꿔 주세요" : "비밀번호 바꾸기"}</h2>${force ? "" : `<button class="icon-btn sm" type="button" data-close aria-label="닫기">${icon.x(16)}</button>`}</div>
      <p class="pw-help" id="pw-help">${force
        ? `지금 비밀번호는 스터디장이 정해 준 거예요. <b>@${esc(ctx.me.username)}</b> 계정을 쓰려면 나만 아는 새 비밀번호로 먼저 바꿔야 해요.`
        : `@${esc(ctx.me.username)} 계정의 비밀번호예요. 바꾸면 다른 기기에서는 다시 로그인해야 해요.`}</p>
      <label class="pw-field"><span>${force ? "스터디장이 알려 준 비밀번호" : "지금 비밀번호"}</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
      <label class="pw-field"><span>새 비밀번호 <small>8자 이상</small></span><input class="input" type="password" name="next" autocomplete="new-password" minlength="8" required></label>
      <label class="pw-field"><span>새 비밀번호 한 번 더</span><input class="input" type="password" name="again" autocomplete="new-password" minlength="8" required></label>
      <label class="pw-show"><input type="checkbox" data-show> 입력한 글자 보기</label>
      <p class="pw-err" role="alert" aria-live="assertive"></p>
      <div class="pw-foot">${force
        ? `<button class="btn ghost" type="button" data-logout>${icon.logout(15)}로그아웃</button>`
        : `<button class="btn ghost" type="button" data-close>취소</button>`}<button class="btn accent" type="submit">바꾸기</button></div>
    </form>`;
  document.body.appendChild(back);
  const f = $(".pw-dialog", back), err = $(".pw-err", back), submit = f.querySelector('[type="submit"]');
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); if (!force) prevFocus?.focus?.(); };
  const onKey = (e) => {
    if (!back.isConnected) { document.removeEventListener("keydown", onKey, true); return; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!force) close(); }
    if (e.key === "Tab") { // 대화상자 안에서만 돌기
      const els = [...f.querySelectorAll("input:not([hidden]), button")];
      const i = els.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); els.at(-1).focus(); }
      else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0].focus(); }
    }
  };
  document.addEventListener("keydown", onKey, true);
  back.addEventListener("mousedown", (e) => { if (e.target === back && !force) close(); });
  f.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  f.querySelector("[data-logout]")?.addEventListener("click", async () => { close(); await api.logout().catch(() => {}); showAuth(); });
  f.querySelector("[data-show]").addEventListener("change", (e) => f.querySelectorAll('input[type="password"], input[data-pw]').forEach((i) => { i.dataset.pw = "1"; i.type = e.target.checked ? "text" : "password"; }));
  f.addEventListener("input", () => { err.textContent = ""; });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cur = f.current.value, next = f.next.value, again = f.again.value;
    const bad = !cur ? ["지금 비밀번호를 입력해 주세요.", f.current]
      : next.length < 8 ? ["새 비밀번호는 8자 이상이어야 해요.", f.next]
      : next !== again ? ["새 비밀번호 두 칸이 서로 달라요.", f.again]
      : next === cur ? ["지금과 다른 비밀번호로 정해 주세요.", f.next] : null;
    if (bad) { err.textContent = bad[0]; bad[1].focus(); return; }
    submit.disabled = true; submit.textContent = "바꾸는 중…";
    try {
      const r = await api.changePassword(cur, next);
      close();
      toast(r.signed_out ? `비밀번호를 바꿨어요. 다른 기기 ${r.signed_out}곳은 로그아웃됐어요.` : "비밀번호를 바꿨어요.");
      if (ctx.me?.must_change_pw) { ctx.me.must_change_pw = false; resume(); } // 막혀 있던 화면을 이어서 열어요
    } catch (x) {
      err.textContent = x.message || "비밀번호를 바꾸지 못했어요.";
      (x.status === 403 ? f.current : f.next).focus();
      if (x.status === 403) f.current.select();
    } finally { if (submit.isConnected) { submit.disabled = false; submit.textContent = "바꾸기"; } }
  });
  f.current.focus();
}

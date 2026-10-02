// 프로필 바꾸기 — 이름 · 한 줄 소개(셋이 봐요) · 하루 공부 목표. 로그인 아이디(@)는 못 바꿔요.
import { api } from "./api.js";
import { esc, initial, toast, hm, avatar } from "./util.js";

// 고른 사진을 가운데 정사각형으로 잘라 256px JPEG data URL 로 (약 20KB). 서버는 이 모양만 받아요
async function squareThumb(file, side = 256) {
  if (!/^image\//.test(file.type)) throw new Error("이미지 파일만 올릴 수 있어요 (jpg · png · webp · heic 는 안 돼요).");
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch {
    const url = URL.createObjectURL(file);
    try { bmp = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; }); }
    catch { throw new Error("이 이미지 형식은 읽을 수 없어요. (jpg · png · webp)"); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const w = bmp.width, h = bmp.height, k = Math.min(w, h), sx = (w - k) / 2, sy = (h - k) / 2;
  const c = document.createElement("canvas"); c.width = c.height = side;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, side, side);
  g.imageSmoothingQuality = "high"; g.drawImage(bmp, sx, sy, k, k, 0, 0, side, side);
  let q = 0.86, out = c.toDataURL("image/jpeg", q);
  while (out.length > 60_000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); } // 서버 한도(80KB) 안으로
  return out;
}
import { icon } from "./icons.js";

export function openProfile(ctx) {
  if (document.querySelector(".prof-back")) return;
  const me = ctx.me, prevFocus = document.activeElement;
  const back = document.createElement("div");
  back.className = "palette-back pw-back prof-back";
  back.innerHTML = `
    <form class="pw-dialog glass prof-dialog" role="dialog" aria-modal="true" aria-labelledby="prof-title" novalidate>
      <div class="pw-head"><h2 id="prof-title">프로필 바꾸기</h2><button class="icon-btn sm" type="button" data-close aria-label="닫기">${icon.x(16)}</button></div>
      <div class="prof-card">
        <button type="button" class="prof-pick" id="prof-pick" title="사진 바꾸기" aria-label="프로필 사진 바꾸기"><span id="prof-av-wrap">${avatar(me, "lg prof-av")}</span><span class="prof-cam" aria-hidden="true">${icon.image(13)}</span></button>
        <input type="file" id="prof-file" accept="image/*" hidden>
        <span class="prof-id"><b id="prof-name-pv">${esc(me.display_name)}</b><small>@${esc(me.username)}</small><span class="prof-bio-pv" id="prof-bio-pv">${esc(me.bio || "")}</span>
          <span class="prof-pic-acts"><button type="button" class="pad-retry-like" id="prof-pic-change">사진 ${me.avatar ? "바꾸기" : "올리기"}</button>${me.avatar ? `<button type="button" class="pad-retry-like" id="prof-pic-rm">사진 지우기</button>` : ""}</span></span>
      </div>
      <label class="pw-field"><span>이름 <small><span id="prof-n-c">${me.display_name.length}</span>/12</small></span>
        <input class="input" name="display_name" maxlength="12" required value="${esc(me.display_name)}" autocomplete="nickname"></label>
      <label class="pw-field"><span>한 줄 소개 <small>셋이 봐요 · <span id="prof-b-c">${(me.bio || "").length}</span>/40</small></span>
        <input class="input" name="bio" maxlength="40" value="${esc(me.bio || "")}" placeholder="예: 10월까지 논문 16편 · 영어 650시간" autocomplete="off"></label>
      <label class="pw-field"><span>하루 공부 목표 <small id="prof-goal-v">${esc(hm(me.day_goal || 240))}</small></span>
        <input class="prof-range" type="range" name="day_goal" min="30" max="960" step="30" value="${esc(me.day_goal || 240)}" aria-label="하루 공부 목표 (분)"></label>
      <p class="pw-help prof-note">로그인 아이디 <b>@${esc(me.username)}</b> 는 바꿀 수 없어요. 프로필 색은 셋이 겹치지 않게 앱이 정해요.</p>
      <p class="pw-err" role="alert" aria-live="assertive"></p>
      <div class="pw-foot"><button class="btn ghost" type="button" data-close>취소</button><button class="btn accent" type="submit">저장</button></div>
    </form>`;
  document.body.append(back);
  const f = back.querySelector("form"), err = back.querySelector(".pw-err");
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) close(); });
  // 사진: undefined = 그대로 · null = 지우기 · "data:…" = 새 사진
  let avatarNext;
  const drawAv = () => { const u = { ...me, display_name: f.display_name.value.trim() || me.display_name, avatar: avatarNext === undefined ? me.avatar : avatarNext }; back.querySelector("#prof-av-wrap").innerHTML = avatar(u, "lg prof-av"); };
  const pick = () => back.querySelector("#prof-file").click();
  back.querySelector("#prof-pick").addEventListener("click", pick);
  back.querySelector("#prof-pic-change").addEventListener("click", pick);
  back.querySelector("#prof-pic-rm")?.addEventListener("click", () => { avatarNext = null; drawAv(); back.querySelector("#prof-pic-rm").remove(); });
  back.querySelector("#prof-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try { avatarNext = await squareThumb(file); drawAv(); err.textContent = ""; }
    catch (x) { err.textContent = x.message; }
  });
  // 쓰는 대로 위 카드에 미리 보여요
  f.display_name.addEventListener("input", () => {
    const v = f.display_name.value.trim();
    drawAv();
    back.querySelector("#prof-name-pv").textContent = v || me.display_name;
    back.querySelector("#prof-n-c").textContent = f.display_name.value.length;
  });
  f.bio.addEventListener("input", () => { back.querySelector("#prof-bio-pv").textContent = f.bio.value.trim(); back.querySelector("#prof-b-c").textContent = f.bio.value.length; });
  f.day_goal.addEventListener("input", () => { back.querySelector("#prof-goal-v").textContent = hm(+f.day_goal.value); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const display_name = f.display_name.value.trim();
    if (!display_name) { err.textContent = "이름을 적어 주세요."; f.display_name.focus(); return; }
    const btn = f.querySelector("[type=submit]");
    btn.disabled = true; err.textContent = "";
    try {
      const r = await api.updateMe({ display_name, bio: f.bio.value, day_goal: +f.day_goal.value, ...(avatarNext !== undefined ? { avatar: avatarNext } : {}) });
      window.dispatchEvent(new CustomEvent("trio:me", { detail: { ...me, ...r.user } }));
      window.dispatchEvent(new CustomEvent("trio:changed")); // 홈 인사말 · 사람 고르기도 새 이름으로
      toast("프로필을 바꿨어요.");
      close();
    } catch (x) { err.textContent = x.message || "저장하지 못했어요."; btn.disabled = false; }
  });
  setTimeout(() => f.display_name.focus(), 30);
}

// 영어 · 막힌 표현 — 말하다 막힌 표현을 모아 두는 곳 (한국어 → 영어 → 덩어리). 연습 탭 "내가 막힌 표현" 카드가 돼요.
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { icon } from "../icons.js";
import { todayKey } from "./data.js";
import { speak, canSpeak, speakerIcon } from "./speech.js";

export function mountPhrases(el) {
  const S = { list: [], loaded: false, failed: false };
  let alive = true;
  el.innerHTML = `
    <section class="panel" aria-labelledby="en-ph-t">
      <div class="panel-head"><h2 class="h2" id="en-ph-t">막힌 표현 넣기</h2></div>
      <form class="en-phform" id="en-phform">
        <label><span>날짜</span><input class="input" type="date" name="day" value="${todayKey()}" max="${todayKey()}" required></label>
        <label><span>하고 싶었던 말</span><input class="input" name="ko" maxlength="200" placeholder="예: 그건 좀 애매해" required></label>
        <label><span>영어로</span><input class="input" name="en" maxlength="300" placeholder="예: It's kind of hard to say." lang="en"></label>
        <label><span>덩어리 (외울 부분)</span><input class="input" name="chunk" maxlength="120" placeholder="예: kind of hard to say" lang="en"></label>
        <button class="btn accent" type="submit">${icon.plus(14)}넣기</button>
      </form>
      <p class="en-help">옵시디언과 맞추려면 <code>npm run english:sync</code> 를 돌려요.</p>
    </section>
    <section class="panel" aria-labelledby="en-phl-t">
      <div class="panel-head"><h2 class="h2" id="en-phl-t">모은 표현</h2><span class="faint" id="en-ph-n"></span></div>
      <div id="en-phlist"><p class="faint">불러오는 중…</p></div>
    </section>`;

  function draw() {
    const box = $("#en-phlist", el);
    $("#en-ph-n", el).textContent = S.loaded ? `${S.list.length}개` : "";
    if (S.failed) { box.innerHTML = `<div class="empty">표현을 불러오지 못했어요. <button class="btn ghost sm" type="button" data-retry>다시 시도</button></div>`; return; }
    if (!S.loaded) return;
    if (!S.list.length) { box.innerHTML = `<p class="empty">아직 모은 표현이 없어요. 말하다 막히면 위에 적어 두세요.</p>`; return; }
    box.innerHTML = `<ul class="en-phl">${S.list.map((p) => `
      <li>
        <span class="d">${esc(String(p.day || "").slice(5).replace("-", "."))}</span>
        <div class="tx">
          <span class="ko">${esc(p.ko)}</span>
          <b lang="en">${p.en ? esc(p.en) : `<em class="faint">영어 아직</em>`}</b>
          ${p.chunk ? `<span class="ck" lang="en">${esc(p.chunk)}</span>` : ""}
        </div>
        ${canSpeak() && p.en ? `<button class="icon-btn sm" type="button" data-say="${esc(p.en)}" aria-label="듣기">${speakerIcon()}</button>` : "<span></span>"}
        <button class="icon-btn sm danger" type="button" data-del="${esc(p.id)}" aria-label="지우기">${icon.trash(14)}</button>
      </li>`).join("")}</ul>`;
  }
  async function load() {
    S.failed = false; draw();
    try {
      const { phrases } = await api.phrases();
      if (!alive) return;
      S.list = (phrases || []).slice().sort((a, b) => String(b.day).localeCompare(String(a.day)) || (b.id > a.id ? 1 : -1));
      S.loaded = true;
    } catch (e) { if (!alive) return; S.failed = true; toast(e.message, "err"); }
    draw();
  }

  $("#en-phform", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, b = f.querySelector("button[type=submit]");
    const body = { day: f.day.value || todayKey(), ko: f.ko.value.trim(), en: f.en.value.trim(), chunk: f.chunk.value.trim() };
    if (!body.ko) return;
    b.disabled = true;
    try { await api.addPhrase(body); f.ko.value = f.en.value = f.chunk.value = ""; f.ko.focus(); toast("넣었어요."); await load(); }
    catch (ex) { toast(ex.message, "err"); }
    finally { b.disabled = false; }
  });
  el.addEventListener("click", async (e) => {
    if (e.target.closest("[data-retry]")) { load(); return; }
    const s = e.target.closest("[data-say]");
    if (s) { speak(s.dataset.say); return; }
    const del = e.target.closest("[data-del]");
    if (del) {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.classList.add("armed"); setTimeout(() => { delete del.dataset.armed; del.classList.remove("armed"); }, 2500); toast("한 번 더 누르면 지워요."); return; }
      try { await api.deletePhrase(del.dataset.del); S.list = S.list.filter((p) => String(p.id) !== del.dataset.del); draw(); toast("지웠어요."); }
      catch (ex) { toast(ex.message, "err"); }
    }
  });

  load();
  return () => { alive = false; };
}

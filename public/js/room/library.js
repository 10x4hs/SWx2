// 창고 탭: 책 · 링크 · 영상 카드 격자. 셋의 표시 점, 내 표시 토글, 한 줄 메모, 대화로 보내기, 영상은 카드에서 재생.
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { icon } from "../icons.js";
import { mountCompose } from "./compose.js";
import { thumbHTML, kindIcon, KIND_LABEL, MARK_LABEL, nextMark, domainOf, ago, armDelete, avatar, VIDEO_ID, isHttps } from "./shared.js";

const FILTERS = [["", "전체"], ["book", "책"], ["link", "링크"], ["video", "영상"]];

// env: { ctx, onShared() }
export function mountLibrary(el, env) {
  const { ctx } = env;
  const S = { items: [], kind: "", q: "", loaded: false, loading: false, playing: new Set(), pendingFocus: null };

  el.innerHTML = `
    <div class="rm-lib">
      <div id="lib-compose"></div>
      <div class="rm-lib-bar">
        <nav class="seg rm-filters" aria-label="종류">${FILTERS.map(([k, l]) => `<button type="button" data-kind="${k}" aria-selected="${k === ""}">${l}</button>`).join("")}</nav>
        <input class="input rm-search" id="lib-q" placeholder="제목 · 저자 · 메모 찾기" aria-label="창고 찾기">
        <span class="faint rm-count" id="lib-count"></span>
      </div>
      <div class="rm-grid" id="lib-grid"><p class="faint">불러오는 중…</p></div>
    </div>`;
  const grid = $("#lib-grid", el);

  const compose = mountCompose($("#lib-compose", el), {
    onSaved(item, shared) { S.items = [item, ...S.items.filter((x) => x.id !== item.id)]; render(); focusItem(item.id); if (shared) env.onShared?.(); },
    onDuplicate(item) { if (!S.items.some((x) => x.id === item.id)) S.items.unshift(item); render(); focusItem(item.id); },
  });

  // ---------- 그리기 ----------
  const shown = () => {
    const q = S.q.toLowerCase();
    return S.items.filter((it) => (!S.kind || it.kind === S.kind) && (!q || [it.title, it.author, it.description, ...(it.marks || []).map((m) => m.note)].some((s) => String(s || "").toLowerCase().includes(q))));
  };
  const markDot = (m) => `<i class="rm-dot s-${m?.state || "none"}"></i>`;
  function cardHTML(it) {
    const mine = it.added_by === ctx.me.id;
    const my = it.my || null;
    const L = MARK_LABEL[it.kind] || MARK_LABEL.link;
    const marks = ctx.users.map((u) => {
      const m = (it.marks || []).find((x) => x.user_id === u.id);
      const t = `${u.display_name}: ${m?.state ? L[m.state] : "표시 없음"}${m?.note ? ` — ${m.note}` : ""}`;
      return `<span class="rm-mark" title="${esc(t)}">${markDot(m)}<small>${esc(String(u.display_name || "?")[0] || "?")}</small></span>`;
    }).join("");
    const playing = S.playing.has(it.id) && it.kind === "video" && VIDEO_ID.test(it.video_id || "");
    const media = playing
      ? `<iframe class="rm-embed" src="https://www.youtube-nocookie.com/embed/${esc(it.video_id)}?autoplay=1" title="${esc(it.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe>`
      : it.kind === "video" && VIDEO_ID.test(it.video_id || "")
        ? `<button type="button" class="rm-th rm-play" data-play="${esc(it.id)}" aria-label="영상 재생">${thumbHTML(it.thumb, "", "video", "rm-th-img")}<span class="rm-play-ic">${icon.play(22)}</span></button>`
        : `<div class="rm-th k-${esc(it.kind)}${isHttps(it.thumb) ? " has-img" : ""}">${thumbHTML(it.thumb, "", it.kind, "rm-th-img")}</div>`;
    const sub = it.author || (it.url ? domainOf(it.url) : "");
    const notes = (it.marks || []).filter((m) => m.note && m.user_id !== ctx.me.id).map((m) => `<p class="rm-note-o"><b>${esc(ctx.user(m.user_id)?.display_name || "?")}</b> ${esc(m.note)}</p>`).join("");
    return `<article class="rm-card k-${esc(it.kind)}${playing ? " playing" : ""}" data-id="${esc(it.id)}">
      ${media}
      <div class="rm-card-b">
        <div class="rm-card-k">${kindIcon(it.kind, 14)}<span>${esc(KIND_LABEL[it.kind] || it.kind)}</span><span class="faint">· ${esc(ago(it.created_at))}</span>
          <span class="rm-card-by" title="${esc(ctx.user(it.added_by)?.display_name || "나간 사람")}가 넣었어요">${avatar(ctx.user(it.added_by), "sm")}</span></div>
        <h3 class="rm-card-t">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>` : esc(it.title)}</h3>
        ${sub ? `<p class="rm-card-s">${esc(sub)}</p>` : ""}
        <div class="rm-marks" aria-label="셋의 표시">${marks}</div>
        <div class="rm-card-act">
          <button type="button" class="chip rm-my s-${my?.state || "none"}" data-mark="${esc(it.id)}" title="누르면 다음 표시로 바뀌어요">${markDot(my)}${esc(my?.state ? L[my.state] : "표시하기")}</button>
          <button type="button" class="icon-btn sm" data-share="${esc(it.id)}" aria-label="대화로 보내기" title="대화로 보내기">${icon.share(14)}</button>
          ${mine ? `<button type="button" class="icon-btn sm danger" data-del="${esc(it.id)}" aria-label="지우기" title="지우기">${icon.trash(14)}</button>` : ""}
        </div>
        <input class="input bare rm-note" data-note="${esc(it.id)}" value="${esc(my?.note || "")}" placeholder="한 줄 메모 (셋이 봐요)" maxlength="140" aria-label="내 한 줄 메모">
        ${notes}
      </div>
    </article>`;
  }
  function render() {
    const arr = shown();
    $("#lib-count", el).textContent = S.loaded ? `${arr.length}개` : "";
    el.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.kind === S.kind)));
    if (!S.loaded) return;
    grid.innerHTML = arr.length ? arr.map(cardHTML).join("")
      : `<div class="rm-empty"><p><b>${S.items.length ? "찾는 게 없어요." : "창고가 비어 있어요."}</b><br>${S.items.length ? "다른 말로 찾아보거나 종류를 바꿔 보세요." : "위 칸에 URL 이나 책 제목을 넣어 첫 항목을 만들어 보세요."}</p></div>`;
    if (S.pendingFocus) { const id = S.pendingFocus; S.pendingFocus = null; focusItem(id); }
  }
  function focusItem(id) {
    const card = grid.querySelector(`.rm-card[data-id="${CSS.escape(String(id))}"]`);
    if (!card) { if (S.items.some((x) => x.id === id) && (S.kind || S.q)) { S.kind = ""; S.q = ""; $("#lib-q", el).value = ""; S.pendingFocus = id; render(); } return; }
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    card.classList.add("hi"); setTimeout(() => card.classList.remove("hi"), 2200);
  }

  async function load() {
    S.loading = true;
    try { const { items } = await api.library(); S.items = items || []; S.loaded = true; S.loading = false; render(); }
    catch (e) { S.loading = false; grid.innerHTML = `<p class="faint">${esc(e.message || "불러오지 못했어요.")} <button type="button" class="linkbtn" id="lib-retry">다시 시도</button></p>`; }
  }
  const upd = (id, fn) => { const it = S.items.find((x) => x.id === id); if (it) fn(it); };
  function applyMark(it, mark) {
    it.my = mark && (mark.state || mark.note) ? mark : null;
    it.marks = (it.marks || []).filter((m) => m.user_id !== ctx.me.id);
    if (it.my) it.marks.push({ user_id: ctx.me.id, ...it.my });
  }

  // ---------- 조작 ----------
  el.addEventListener("click", async (e) => {
    const k = e.target.closest("[data-kind]"); if (k) { S.kind = k.dataset.kind; render(); return; }
    if (e.target.closest("#lib-retry")) return load();
    const t = e.target.closest("[data-play],[data-mark],[data-share],[data-del]");
    if (!t) return;
    if (t.dataset.play) { S.playing.add(t.dataset.play); render(); return; }
    if (t.dataset.mark) {
      const id = t.dataset.mark, it = S.items.find((x) => x.id === id); if (!it) return;
      const state = nextMark(it.my?.state);
      t.disabled = true;
      try { const { mark } = await api.markLibrary(id, { state, note: it.my?.note || "" }); upd(id, (x) => applyMark(x, mark || { state, note: it.my?.note || "" })); render(); }
      catch (x) { toast(x.message || "표시하지 못했어요.", "err"); t.disabled = false; }
      return;
    }
    if (t.dataset.share) {
      t.disabled = true;
      try { await api.shareLibrary(t.dataset.share); toast("대화에 보냈어요."); env.onShared?.(); }
      catch (x) { toast(x.message || "보내지 못했어요.", "err"); }
      finally { t.disabled = false; }
      return;
    }
    if (t.dataset.del) armDelete(t, async () => {
      try { await api.deleteLibrary(t.dataset.del); S.items = S.items.filter((x) => x.id !== t.dataset.del); render(); toast("창고에서 뺐어요."); }
      catch (x) { toast(x.message || "지우지 못했어요.", "err"); }
    });
  });
  // 한 줄 메모: 포커스가 나가면 저장
  el.addEventListener("focusout", async (e) => {
    const inp = e.target.closest("[data-note]"); if (!inp) return;
    const id = inp.dataset.note, it = S.items.find((x) => x.id === id); if (!it) return;
    const note = inp.value.trim();
    if (note === (it.my?.note || "")) return;
    try { const { mark } = await api.markLibrary(id, { state: it.my?.state || null, note }); upd(id, (x) => applyMark(x, mark || { state: it.my?.state || null, note })); render(); }
    catch (x) { toast(x.message || "메모를 저장하지 못했어요.", "err"); }
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-note]") && !e.isComposing) e.target.blur(); });
  $("#lib-q", el).addEventListener("input", (e) => { S.q = e.target.value.trim(); render(); });

  load();
  return {
    stop() {},
    refresh: load,
    // 불러오는 중이면 다 그린 뒤에 하이라이트 (그리기가 하이라이트를 지우지 않게)
    focusItem(id) { if (S.loaded && !S.loading) focusItem(id); else S.pendingFocus = id; },
    addUrl(url) { compose.prefill(url); el.scrollIntoView?.({ block: "start" }); },
  };
}

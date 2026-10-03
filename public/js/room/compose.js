// 창고 넣기: URL 이나 제목 한 줄 → 미리보기(종류 자동) → 제목·저자 고치고 저장(+ 대화에도 알리기)
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { isHttp, thumbHTML, KIND_LABEL, kindIcon, domainOf } from "./shared.js";

// env: { onSaved(item, shared), onDuplicate(item) }
export function mountCompose(el, env) {
  const S = { preview: null, candidates: [], busy: false, open: false };

  el.innerHTML = `
    <form class="rm-cmp" id="rm-cmp" autocomplete="off">
      <div class="rm-cmp-row">
        <input class="input" id="cmp-q" placeholder="URL 이나 책 제목을 붙여 넣어요 — 유튜브는 영상, 책은 표지·저자를 찾아 줘요" aria-label="URL 또는 제목">
        <button class="btn sm" type="submit" id="cmp-go">미리보기</button>
      </div>
      <div class="rm-cmp-body" id="cmp-body" hidden></div>
    </form>`;
  const q = $("#cmp-q", el), body = $("#cmp-body", el), go = $("#cmp-go", el);

  const guess = (s) => isHttp(s) ? (/youtu\.?be/.test(s) ? "video" : "link") : "book";

  function drawPreview() {
    const p = S.preview;
    if (!p) { body.hidden = true; body.innerHTML = ""; S.open = false; return; }
    S.open = true; body.hidden = false;
    const cands = S.candidates.length > 1 ? `
      <div class="rm-cands" role="radiogroup" aria-label="책 후보">
        ${S.candidates.map((c, i) => `<button type="button" class="rm-cand${c === p ? " on" : ""}" role="radio" aria-checked="${c === p}" data-cand="${i}">
          ${thumbHTML(c.thumb, "", "book", "rm-cand-th")}<span><b>${esc(c.title)}</b><small>${esc(c.author || "")}</small></span></button>`).join("")}
      </div>` : "";
    body.innerHTML = `
      ${cands}
      <div class="rm-pv">
        <div class="rm-pv-th">${thumbHTML(p.thumb, "", p.kind, "rm-pv-img")}</div>
        <div class="rm-pv-f">
          <div class="rm-pv-kind">${kindIcon(p.kind, 15)}<span>${esc(KIND_LABEL[p.kind] || p.kind)}</span>${p.url ? `<span class="faint">· ${esc(domainOf(p.url))}</span>` : ""}</div>
          <label class="rm-field"><span>제목</span><input class="input" id="pv-title" value="${esc(p.title || "")}" maxlength="200" required></label>
          <label class="rm-field"><span>${p.kind === "video" ? "채널" : "저자 · 출처"}</span><input class="input" id="pv-author" value="${esc(p.author || "")}" maxlength="120"></label>
          ${p.description ? `<p class="rm-pv-desc">${esc(String(p.description).slice(0, 220))}</p>` : ""}
          <div class="rm-pv-foot">
            <label class="rm-check"><input type="checkbox" id="pv-share" checked> 대화에도 알리기</label>
            <span class="row" style="gap:6px">
              <button type="button" class="btn ghost sm" id="pv-cancel">취소</button>
              <button type="button" class="btn accent sm" id="pv-save">저장</button>
            </span>
          </div>
        </div>
      </div>`;
    $("#pv-title", body).focus();
  }

  async function preview() {
    const s = q.value.trim();
    if (!s || S.busy) return;
    S.busy = true; go.disabled = true; go.textContent = "찾는 중…";
    const payload = isHttp(s) ? { url: s } : { title: s };
    try {
      const r = await api.libraryPreview(payload);
      S.candidates = Array.isArray(r.candidates) ? r.candidates.slice(0, 3).map((c) => ({ kind: "book", ...c })) : [];
      S.preview = S.candidates.length ? { ...r, ...S.candidates[0], candidates: undefined } : { ...r, kind: r.kind || guess(s) };
      if (!S.preview.title) S.preview.title = isHttp(s) ? "" : s;
      if (!S.preview.url && isHttp(s)) S.preview.url = s;
      if (r.warning) toast(r.warning); // 예: "책을 못 찾았어요. 제목만으로 저장할 수 있어요."
    } catch (e) {
      // 채우기에 실패해도 제목만 있으면 저장할 수 있게 빈 카드로 열어요
      toast(e.message || "미리보기를 못 만들었어요. 제목을 직접 적어 저장할 수 있어요.", "err");
      S.candidates = [];
      S.preview = { kind: guess(s), url: isHttp(s) ? s : null, title: isHttp(s) ? "" : s };
    } finally { S.busy = false; go.disabled = false; go.textContent = "미리보기"; }
    drawPreview();
  }

  async function save() {
    const p = S.preview; if (!p || S.busy) return;
    const title = $("#pv-title", body).value.trim(), author = $("#pv-author", body).value.trim();
    if (!title) { toast("제목을 적어 주세요.", "err"); $("#pv-title", body).focus(); return; }
    const share = $("#pv-share", body).checked;
    const b = { kind: p.kind, title, share };
    if (p.url) b.url = p.url;
    if (author) b.author = author;
    if (p.thumb) b.thumb = p.thumb;
    if (p.description) b.description = p.description;
    if (p.isbn) b.isbn = p.isbn;
    S.busy = true; $("#pv-save", body).disabled = true;
    try {
      const { item } = await api.addLibrary(b);
      toast(share ? "창고에 넣고 대화에도 알렸어요." : "창고에 넣었어요.");
      S.preview = null; S.candidates = []; q.value = ""; drawPreview();
      env.onSaved(item, share);
    } catch (e) {
      if (e.status === 409 && e.data?.item) { toast("이미 있어요."); S.preview = null; q.value = ""; drawPreview(); env.onDuplicate(e.data.item); }
      else toast(e.message || "저장하지 못했어요.", "err");
    } finally { S.busy = false; }
  }

  $("#rm-cmp", el).addEventListener("submit", (e) => { e.preventDefault(); preview(); });
  body.addEventListener("click", (e) => {
    const c = e.target.closest("[data-cand]");
    if (c) { S.preview = { ...S.preview, ...S.candidates[+c.dataset.cand] }; drawPreview(); return; }
    if (e.target.closest("#pv-cancel")) { S.preview = null; S.candidates = []; drawPreview(); q.focus(); }
    if (e.target.closest("#pv-save")) save();
  });
  body.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input:not([type=checkbox])") && !e.isComposing) { e.preventDefault(); save(); } });

  return {
    // 대화의 "창고에 넣기" 가 URL 을 넘겨요
    prefill(url) { q.value = url || ""; q.focus(); if (url) preview(); },
    focus() { q.focus(); },
  };
}

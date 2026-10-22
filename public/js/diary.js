// 일기 편집기 — 일기 페이지 · 캘린더에서 써요. 자동 저장, 기본은 본인만 봄.
// 새 일기는 노트와 같은 Notion 블록 편집기(/ 메뉴 · 글씨 크기 · 사진 붙여 넣기). 예전에 글로만 쓴 일기는 예전 글 상자 그대로.
// share = 함께 보는 사람 이름(일기 모임일 때만): 공개 · 비공개 스위치가 생겨요. 새 일기는 기본 공개, 있던 일기는 저장된 그대로.
import { api } from "./api.js";
import { esc, debounce, nowTime, toast } from "./util.js";
import { createBlockEditor } from "./blocks/editor.js";
import { undoScope } from "./undo.js";

export const MOODS = [ // 기분은 UI라서 무채색 (색은 차트에만)
  { v: 5, label: "최고", color: "var(--t-ink)" },
  { v: 4, label: "좋음", color: "var(--t-graphite)" },
  { v: 3, label: "보통", color: "var(--t-steel)" },
  { v: 2, label: "지침", color: "var(--t-silver)" },
  { v: 1, label: "힘듦", color: "var(--t-sand)" },
];

const PROMPTS = ["오늘 가장 기억에 남는 순간은?", "오늘 배운 것 한 가지", "내일의 나에게 한마디", "오늘 나를 힘들게 한 것과 버티게 한 것"];
const DOC_SIZES = ["s", "m", "l", "xl"]; // 일기 전체 글씨 크기 (m = 보통, 저장 안 함)
const HIDE = ["page", "database"]; // 일기에는 하위 페이지 · 데이터베이스를 안 넣어요
const parseJ = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };

// 사진은 긴 변 1600px 로 줄여서 올려요 (gif 는 움직임이 있어서 그대로)
const MAX_SIDE = 1600;
export async function shrinkImage(file) {
  if (file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 1.5e6) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const type = file.type === "image/png" && file.size < 3e6 ? "image/png" : "image/jpeg";
    return await new Promise((ok) => c.toBlob((b) => ok(b || file), type, 0.86));
  } catch { return file; }
}
export async function uploadDiaryImage(file) {
  const { src } = await api.diaryImage(await shrinkImage(file));
  return src;
}

export function mountDiary(el, day, { onSaved, rows = 7, share = "" } = {}) {
  const S = { mood: null, loaded: false, shared: !!share, mode: null, doc: null, size: "m" };
  let ta = null, ed = null;
  el.innerHTML = `
    <div class="diary">
      <div class="diary-top">
        <div class="moods" role="radiogroup" aria-label="오늘 기분">
          ${MOODS.map((m) => `<button type="button" class="mood" role="radio" aria-checked="false" data-mood="${m.v}" style="--mc:${m.color}"><i></i>${m.label}</button>`).join("")}
        </div>
        <div class="diary-size" hidden role="group" aria-label="일기 글씨 크기"><button type="button" class="icon-btn sm" data-size="-1" title="글씨 작게">가-</button><button type="button" class="icon-btn sm" data-size="1" title="글씨 크게">가+</button></div>
      </div>
      <div class="diary-body"><p class="faint">불러오는 중…</p></div>
      <div class="diary-foot"><span class="faint mono" data-status>불러오는 중…</span>${share ? `<button type="button" class="diary-share" data-share aria-pressed="true"></button>` : ""}<span class="faint" data-count></span></div>
    </div>`;
  const bodyEl = el.querySelector(".diary-body"), status = el.querySelector("[data-status]"), count = el.querySelector("[data-count]"), sizeBox = el.querySelector(".diary-size");
  const drawMood = () => el.querySelectorAll("[data-mood]").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.mood === S.mood)));
  const plain = () => (S.mode === "text" ? ta.value : (S.doc?.blocks || []).map(function t(b) { return [b.text || "", ...(b.children || []).map(t)].join(" "); }).join(" ").replace(/<[^>]+>/g, "").trim());
  const drawCount = () => { const n = plain().length; count.textContent = n ? `${n.toLocaleString()}자` : ""; };
  const hasContent = () => (S.mode === "text" ? !!ta.value.trim() : (S.doc?.blocks || []).some((b) => b.text?.trim() || b.type !== "paragraph" || b.children?.length));
  const shareBtn = el.querySelector("[data-share]");
  // ⌘Z · ⌘⇧Z: 편집기 안에서는 편집기가 직접, 바깥(빈 곳을 누른 뒤)에서도 같은 기록으로 (undo.js)
  const us = undoScope("diary", { undo: () => !!ed?.undo(), redo: () => !!ed?.redo(), size: () => ed?.historySize?.() || 0 });
  const drawShare = () => { if (!shareBtn) return; shareBtn.setAttribute("aria-pressed", String(S.shared)); shareBtn.innerHTML = S.shared ? `<i></i>공개 · ${esc(share)}도 봐요` : `<i></i>비공개 · 나만 봐요`; shareBtn.title = S.shared ? "누르면 비공개 — 상대에겐 자물쇠만 보여요" : "누르면 공개"; };
  const drawSize = () => {
    const host = bodyEl.querySelector(".diary-doc"); if (!host) return;
    DOC_SIZES.forEach((k) => host.classList.toggle("nb-doc-" + k, k === S.size && k !== "m"));
    sizeBox.querySelector('[data-size="-1"]').disabled = S.size === "s";
    sizeBox.querySelector('[data-size="1"]').disabled = S.size === "xl";
  };

  let chain = Promise.resolve();
  const save = debounce(() => {
    if (!S.loaded) return;
    const payload = { day, mood: S.mood };
    if (S.mode === "text") payload.body = ta.value;
    else payload.blocks = { ...S.doc, ...(S.size !== "m" ? { size: S.size } : { size: undefined }) };
    if (share) payload.shared = S.shared;
    chain = chain.then(async () => {
      try { const { diary } = await api.saveDiary(payload); status.textContent = diary ? "저장됨 " + nowTime() : "비어 있음"; onSaved?.(diary); }
      catch (e) { status.textContent = "저장 실패"; toast(e.message, "err"); }
    });
  }, 700);
  const touched = () => { status.textContent = "입력 중…"; drawCount(); save(); };

  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-share]")) {
      S.shared = !S.shared; drawShare();
      if (S.loaded && (hasContent() || S.mood)) { status.textContent = "입력 중…"; save(); save.flush(); }
      return;
    }
    const sz = e.target.closest("[data-size]");
    if (sz) { S.size = DOC_SIZES[Math.max(0, Math.min(3, DOC_SIZES.indexOf(S.size) + +sz.dataset.size))]; drawSize(); touched(); return; }
    const b = e.target.closest("[data-mood]");
    if (!b) return;
    const v = +b.dataset.mood;
    S.mood = S.mood === v ? null : v;
    drawMood(); status.textContent = "입력 중…"; save();
  });

  // 예전 일기(글만): 글 상자
  function mountText(body) {
    S.mode = "text";
    bodyEl.innerHTML = `<textarea class="diary-text" id="diary-text-${day}" rows="${rows}" placeholder="${esc(PROMPTS[new Date(day).getDate() % PROMPTS.length])}" aria-label="일기"></textarea>`;
    ta = bodyEl.querySelector("textarea"); ta.value = body;
    ta.addEventListener("input", touched);
    ta.addEventListener("blur", () => save.flush());
  }
  // 새 일기 · 블록 일기: Notion 편집기
  function mountBlocks(doc) {
    S.mode = "blocks"; S.doc = doc; S.size = DOC_SIZES.includes(doc.size) ? doc.size : "m";
    sizeBox.hidden = false;
    bodyEl.innerHTML = `<div class="diary-doc nb-root-host" aria-label="일기"></div>`;
    const host = bodyEl.querySelector(".diary-doc");
    ed = createBlockEditor(host, {
      doc, hide: HIDE, notes: () => [],
      uploadImage: async (f) => { status.textContent = "사진 올리는 중…"; const src = await uploadDiaryImage(f); status.textContent = "입력 중…"; return src; },
      onError: (err) => { status.textContent = "사진을 올리지 못했어요"; toast(err.message || "사진을 올리지 못했어요.", "err"); },
      onChange: (d) => { S.doc = d; touched(); },
    });
    host.addEventListener("focusout", () => save.flush());
    drawSize();
  }

  api.diary(day).then(({ diary }) => {
    S.loaded = true;
    if (diary) { S.mood = diary.mood; if (share) S.shared = !!diary.shared; status.textContent = "저장됨"; }
    else status.textContent = share ? "새 일기는 기본 공개예요" : "나만 볼 수 있어요";
    const doc = parseJ(diary?.blocks);
    if (!doc && diary?.body?.trim()) mountText(diary.body);
    else mountBlocks(doc || { v: 1, blocks: [] });
    drawMood(); drawCount(); drawShare();
  }).catch((e) => { status.textContent = "불러오지 못했어요"; toast(e.message, "err"); });

  return () => { save.flush(); us.dispose(); ed?.destroy(); };
}

// 읽기 전용(상대의 공개 일기): 블록이면 편집기와 같은 모양, 아니면 글 그대로
export function renderDiaryRead(host, diary) {
  const doc = parseJ(diary.blocks);
  if (!doc) { host.innerHTML = `<div class="dr-body">${esc(diary.body || "")}</div>`; return () => {}; }
  host.innerHTML = `<div class="diary-doc${DOC_SIZES.includes(doc.size) && doc.size !== "m" ? " nb-doc-" + doc.size : ""}"></div>`;
  const ed = createBlockEditor(host.firstElementChild, { doc, readOnly: true, notes: () => [] });
  return () => ed.destroy();
}

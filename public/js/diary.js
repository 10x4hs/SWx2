// 일기 편집기 — 일기 페이지에서 써요. 자동 저장, 기본은 본인만 봄.
// share = 함께 보는 사람 이름(일기 모임일 때만): 공개 · 비공개 스위치가 생겨요. 새 일기는 기본 공개, 있던 일기는 저장된 그대로.
import { api } from "./api.js";
import { $, esc, debounce, nowTime, toast } from "./util.js";

export const MOODS = [ // 기분은 UI라서 무채색 (색은 차트에만)
  { v: 5, label: "최고", color: "var(--t-ink)" },
  { v: 4, label: "좋음", color: "var(--t-graphite)" },
  { v: 3, label: "보통", color: "var(--t-steel)" },
  { v: 2, label: "지침", color: "var(--t-silver)" },
  { v: 1, label: "힘듦", color: "var(--t-sand)" },
];

const PROMPTS = ["오늘 가장 기억에 남는 순간은?", "오늘 배운 것 한 가지", "내일의 나에게 한마디", "오늘 나를 힘들게 한 것과 버티게 한 것"];

export function mountDiary(el, day, { onSaved, rows = 7, share = "" } = {}) {
  const S = { mood: null, body: "", loaded: false, shared: !!share };
  el.innerHTML = `
    <div class="diary">
      <div class="moods" role="radiogroup" aria-label="오늘 기분">
        ${MOODS.map((m) => `<button type="button" class="mood" role="radio" aria-checked="false" data-mood="${m.v}" style="--mc:${m.color}"><i></i>${m.label}</button>`).join("")}
      </div>
      <textarea class="diary-text" id="diary-text-${day}" rows="${rows}" placeholder="${esc(PROMPTS[new Date(day).getDate() % PROMPTS.length])}" aria-label="일기"></textarea>
      <div class="diary-foot"><span class="faint mono" data-status>불러오는 중…</span>${share ? `<button type="button" class="diary-share" data-share aria-pressed="true"></button>` : ""}<span class="faint" data-count></span></div>
    </div>`;
  const ta = el.querySelector("textarea"), status = el.querySelector("[data-status]"), count = el.querySelector("[data-count]");
  const drawMood = () => el.querySelectorAll("[data-mood]").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.mood === S.mood)));
  const drawCount = () => { count.textContent = ta.value.length ? `${ta.value.length.toLocaleString()}자` : ""; };
  const shareBtn = el.querySelector("[data-share]");
  const drawShare = () => { if (!shareBtn) return; shareBtn.setAttribute("aria-pressed", String(S.shared)); shareBtn.innerHTML = S.shared ? `<i></i>공개 · ${esc(share)}도 봐요` : `<i></i>비공개 · 나만 봐요`; shareBtn.title = S.shared ? "누르면 비공개 — 상대에겐 자물쇠만 보여요" : "누르면 공개"; };

  let chain = Promise.resolve();
  const save = debounce(() => {
    if (!S.loaded) return;
    const payload = share ? { day, mood: S.mood, body: ta.value, shared: S.shared } : { day, mood: S.mood, body: ta.value };
    chain = chain.then(async () => {
      try { const { diary } = await api.saveDiary(payload); status.textContent = diary ? "저장됨 " + nowTime() : "비어 있음"; onSaved?.(diary); }
      catch (e) { status.textContent = "저장 실패"; toast(e.message, "err"); }
    });
  }, 700);

  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-share]")) {
      S.shared = !S.shared; drawShare();
      if (S.loaded && (ta.value.trim() || S.mood)) { status.textContent = "입력 중…"; save(); save.flush(); }
      return;
    }
    const b = e.target.closest("[data-mood]");
    if (!b) return;
    const v = +b.dataset.mood;
    S.mood = S.mood === v ? null : v;
    drawMood(); status.textContent = "입력 중…"; save();
  });
  ta.addEventListener("input", () => { status.textContent = "입력 중…"; drawCount(); save(); });
  ta.addEventListener("blur", () => save.flush());

  api.diary(day).then(({ diary }) => {
    S.loaded = true;
    if (diary) { S.mood = diary.mood; ta.value = diary.body; if (share) S.shared = !!diary.shared; status.textContent = "저장됨"; }
    else status.textContent = share ? "새 일기는 기본 공개예요" : "나만 볼 수 있어요";
    drawMood(); drawCount(); drawShare();
  }).catch((e) => { status.textContent = "불러오지 못했어요"; toast(e.message, "err"); });

  return () => save.flush();
}

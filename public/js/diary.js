// 일기 편집기 — 오늘 화면과 일기장에서 같이 써요. 자동 저장, 본인만 봄.
import { api } from "./api.js";
import { $, esc, debounce, nowTime, toast } from "./util.js";

export const MOODS = [
  { v: 5, label: "최고", color: "var(--t-ink)" },
  { v: 4, label: "좋음", color: "var(--t-graphite)" },
  { v: 3, label: "보통", color: "var(--t-steel)" },
  { v: 2, label: "지침", color: "var(--t-silver)" },
  { v: 1, label: "힘듦", color: "var(--t-sand)" },
];
export const moodOf = (v) => MOODS.find((m) => m.v === v);

const PROMPTS = ["오늘 가장 기억에 남는 순간은?", "오늘 배운 것 한 가지", "내일의 나에게 한마디", "오늘 나를 힘들게 한 것과 버티게 한 것"];

export function mountDiary(el, day, { onSaved, rows = 7 } = {}) {
  const S = { mood: null, body: "", loaded: false };
  el.innerHTML = `
    <div class="diary">
      <div class="moods" role="radiogroup" aria-label="오늘 기분">
        ${MOODS.map((m) => `<button type="button" class="mood" role="radio" aria-checked="false" data-mood="${m.v}" style="--mc:${m.color}"><i></i>${m.label}</button>`).join("")}
      </div>
      <textarea class="diary-text" id="diary-text-${day}" rows="${rows}" placeholder="${esc(PROMPTS[new Date(day).getDate() % PROMPTS.length])}" aria-label="일기"></textarea>
      <div class="diary-foot"><span class="faint mono" data-status>불러오는 중…</span><span class="faint" data-count></span></div>
    </div>`;
  const ta = el.querySelector("textarea"), status = el.querySelector("[data-status]"), count = el.querySelector("[data-count]");
  const drawMood = () => el.querySelectorAll("[data-mood]").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.mood === S.mood)));
  const drawCount = () => { count.textContent = ta.value.length ? `${ta.value.length.toLocaleString()}자` : ""; };

  let chain = Promise.resolve();
  const save = debounce(() => {
    if (!S.loaded) return;
    const payload = { day, mood: S.mood, body: ta.value };
    chain = chain.then(async () => {
      try { const { diary } = await api.saveDiary(payload); status.textContent = diary ? "저장됨 " + nowTime() : "비어 있음"; onSaved?.(diary); }
      catch (e) { status.textContent = "저장 실패"; toast(e.message, "err"); }
    });
  }, 700);

  el.addEventListener("click", (e) => {
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
    if (diary) { S.mood = diary.mood; ta.value = diary.body; status.textContent = "저장됨"; } else status.textContent = "나만 볼 수 있어요";
    drawMood(); drawCount();
  }).catch((e) => { status.textContent = "불러오지 못했어요"; toast(e.message, "err"); });

  return () => save.flush();
}

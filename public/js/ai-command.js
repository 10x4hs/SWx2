// AI 비서 입력창 — "9시 반에 영어 수업 등록해 줘" 라고 쓰면 그날 계획에 바로 넣어요. 고치기·옮기기·지우기·끝냄 표시도 돼요.
// mountCommand(host, { day: () => "YYYY-MM-DD", onDone(changed) }) — 캘린더 그날 판 · 홈 등 어디에나 붙일 수 있어요.
import { keepDraft } from "./draft.js";
import { api } from "./api.js";
import { esc, toast, ymd, today, nowTime } from "./util.js";
import { icon } from "./icons.js";
import { aiPrefs, stepsHTML } from "./ai-pick.js";

const HINTS_DAY = ["9시 반에 영어 수업 등록해 줘", "내일 오후 3시에 수학 2시간 넣어 줘", "영어 수업 10시로 옮겨 줘", "오늘 할 일로 단어 50개 외우기", "끝난 건 끝냄으로 표시해 줘"];

export function mountCommand(host, opts = {}) {
  const HINTS = opts.hints || HINTS_DAY;
  let history = [], busy = false, hintI = 0;
  host.classList.add("aic");
  host.innerHTML = `
    <form class="aic-box" autocomplete="off">
      <span class="aic-orb" aria-hidden="true"></span>
      <input class="aic-in" maxlength="500" aria-label="AI 비서에게 시키기" placeholder="AI에게 시키기 · 예: ${esc(HINTS[0])}">
      <button class="aic-go" type="submit" aria-label="실행">${icon.arrowRight(15)}</button>
    </form>
    <div class="aic-out" hidden aria-live="polite"></div>`;
  const form = host.querySelector("form"), input = host.querySelector(".aic-in"), out = host.querySelector(".aic-out");
  const draft = keepDraft(input, "aic");
  const rot = setInterval(() => { if (document.activeElement !== input && !input.value) { hintI = (hintI + 1) % HINTS.length; input.placeholder = "AI에게 시키기 · 예: " + HINTS[hintI]; } }, 4000);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text || busy) return;
    busy = true; host.classList.add("busy"); out.hidden = false;
    out.innerHTML = `<p class="aic-q">${esc(text)}</p><p class="aic-a faint">${icon.spark(12)} 하는 중…</p>`;
    input.value = ""; draft.clear();
    try {
      const p = aiPrefs();
      const ctxPage = opts.page ? opts.page() : {}; // 목표 페이지: { scope: "week", period: "W:2026-W40" }
      const r = await api.aiCommand({ text, day: opts.day ? opts.day() : ymd(today()), today: ymd(today()), time: nowTime(), model: p.model || undefined, web: p.web, history, ...ctxPage });
      history = [...history, { role: "user", content: text }, { role: "assistant", content: r.text }].slice(-8);
      out.innerHTML = `<p class="aic-q">${esc(text)}</p><p class="aic-a">${r.changed ? "✓ " : ""}${esc(r.text)}</p>${stepsHTML(r.steps?.filter((s) => s.ok === false))}<p class="aic-m faint">${esc(r.model || "")}</p>`;
      if (r.changed) { window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "plans" } })); opts.onDone?.(true); }
      if (r.question) input.focus();
    } catch (err) { out.innerHTML = `<p class="aic-q">${esc(text)}</p><p class="aic-a ans-err">${esc(err.message)}</p>`; toast(err.message, "err"); }
    finally { busy = false; host.classList.remove("busy"); }
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { out.hidden = true; input.blur(); } });
  return () => clearInterval(rot);
}

// AI 비서 입력창 — "9시 반에 영어 수업 등록해 줘" 라고 쓰면 그날 계획에 바로 넣어요. 고치기·옮기기·지우기·끝냄 표시도 돼요.
// mountCommand(host, { day: () => "YYYY-MM-DD", onDone(changed) }) — 캘린더 그날 판 · 홈 등 어디에나 붙일 수 있어요.
import { keepDraft } from "./draft.js";
import { api } from "./api.js";
import { esc, toast, ymd, today, nowTime } from "./util.js";
import { icon } from "./icons.js";
import { aiPrefs, stepsHTML, mountAiPick, whoAnswered, modelName } from "./ai-pick.js";
import { attachImages } from "./imgattach.js";

const WRITE = new Set(["add_plan", "update_plan", "delete_plan"]);

const HINTS_DAY = ["9시 반에 영어 수업 등록해 줘", "내일 오후 3시에 수학 2시간 넣어 줘", "영어 수업 10시로 옮겨 줘", "오늘 할 일로 단어 50개 외우기", "끝난 건 끝냄으로 표시해 줘"];

export function mountCommand(host, opts = {}) {
  const HINTS = opts.hints || HINTS_DAY;
  let history = [], busy = false, hintI = 0;
  host.classList.add("aic");
  host.innerHTML = `
    <form class="aic-box" autocomplete="off">
      <span class="aic-orb" aria-hidden="true"></span>
      <button class="aic-img" type="button" aria-label="이미지 붙이기" title="이미지 붙이기 · 시간표 · 공지 사진을 넣으면 일정으로 옮겨요 (붙여넣기 · 끌어다 놓기도 돼요)">${icon.image(15)}</button>
      <input class="aic-in" maxlength="500" aria-label="AI 비서에게 시키기" placeholder="AI에게 시키기 · 예: ${esc(HINTS[0])}">
      <button class="aic-go" type="submit" aria-label="실행">${icon.arrowRight(15)}</button>
    </form>
    <div class="att-tray aic-att" hidden></div>
    <div class="aic-pick"></div>
    <div class="aic-out" hidden aria-live="polite"></div>`;
  mountAiPick(host.querySelector(".aic-pick"), { label: "AI 모델" }); // 지금 어떤 모델로 하는지 보이고, 여기서 바로 바꿔요
  const form = host.querySelector("form"), input = host.querySelector(".aic-in"), out = host.querySelector(".aic-out");
  const draft = keepDraft(input, "aic");
  const att = attachImages({ tray: host.querySelector(".aic-att"), button: host.querySelector(".aic-img"), paste: [input], drop: [host] });
  const rot = setInterval(() => { if (document.activeElement !== input && !input.value) { hintI = (hintI + 1) % HINTS.length; input.placeholder = "AI에게 시키기 · 예: " + HINTS[hintI]; } }, 4000);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim(), images = att.list(); if ((!text && !images.length) || busy) return;
    const shown = text || `이미지 ${images.length}장`;
    busy = true; host.classList.add("busy"); out.hidden = false;
    out.innerHTML = `<p class="aic-q">${esc(shown)}</p><p class="aic-a faint">${icon.spark(12)} ${images.length ? "이미지 읽는 중…" : "하는 중… 필요하면 웹도 찾아봐요"}</p>`;
    input.value = ""; draft.clear(); att.clear();
    try {
      const p = aiPrefs();
      const ctxPage = opts.page ? opts.page() : {}; // 목표 페이지: { scope: "week", period: "W:2026-W40" }
      const r = await api.aiCommand({ text, images, day: opts.day ? opts.day() : ymd(today()), today: ymd(today()), time: nowTime(), model: p.model || undefined, web: p.web, history, ...ctxPage });
      history = [...history, { role: "user", content: shown }, { role: "assistant", content: r.text }].slice(-8);
      // 찾아본 것(웹 · 링크 · 이미지 · 노트)과 못 한 것만 칩으로 — 넣은 계획은 답 글에 이미 있어요
      out.innerHTML = `<p class="aic-q">${esc(shown)}</p><p class="aic-a">${r.changed ? "✓ " : ""}${linkify(r.text)}</p>${stepsHTML(r.steps?.filter((s) => !WRITE.has(s.name) || s.ok === false))}<p class="aic-m faint" data-used></p>`;
      whoAnswered(r.model).then(async (w) => { const el = out.querySelector("[data-used]"); if (!el || !w) return; const want = p.model; el.textContent = `답한 모델 · ${w.label}${want && w.pick && w.pick !== want ? ` (고른 ${await modelName(want)} 이 막혀서 대신 답했어요)` : ""}`; });
      if (r.changed) { window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "plans" } })); opts.onDone?.(true); }
      if (r.question) input.focus();
    } catch (err) { out.innerHTML = `<p class="aic-q">${esc(shown)}</p><p class="aic-a ans-err">${esc(err.message)}</p>`; toast(err.message, "err"); }
    finally { busy = false; host.classList.remove("busy"); }
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { out.hidden = true; input.blur(); } });
  return () => clearInterval(rot);
}

// 답 속 링크(출처)는 눌러서 열 수 있게
const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<>"')]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, "").slice(0, 48)}</a>`);

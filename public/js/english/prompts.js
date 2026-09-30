// 영어 · AI 대화 — 옵시디언의 AI 대화 프롬프트 11개. 지금 단계에 맞는 것부터.
// "AI 튜터로 시작" → sessionStorage 에 프롬프트를 두고 #/ai 새 대화로 (ai.js 가 읽고 지워요).
import { esc, toast } from "../util.js";
import { renderMarkdown } from "../md.js";
import { position, todayKey } from "./data.js";

export const PREFILL_KEY = "trio-ai-prefill";

export function mountPrompts(el, { data, go }) {
  const pos = position(data, todayKey()), sid = pos.sprint?.id;
  const now = (p) => Array.isArray(p.sprints) && sid && p.sprints.includes(sid);
  const list = data.prompts.map((p, i) => ({ ...p, i, now: now(p) })).sort((a, b) => (b.now - a.now) || (a.i - b.i));

  el.innerHTML = `
    <section class="panel" aria-labelledby="en-ai-t">
      <div class="panel-head"><h2 class="h2" id="en-ai-t">AI와 영어로 대화하기</h2>${sid ? `<span class="faint">지금 단계 · ${esc(pos.sprint.id)} ${esc(pos.sprint.name || "")}</span>` : ""}</div>
      <div class="banner en-voice-note"><p>음성으로 하려면 휴대폰 AI 앱의 <b>음성 모드</b>를 권장해요. 여기서는 프롬프트를 복사하거나 AI 튜터에서 글로 바로 시작할 수 있어요.</p></div>
      ${list.length ? `<div class="en-prompts">${list.map((p) => `
        <article class="en-prompt${p.now ? " now" : ""}">
          <header>
            ${p.mark ? `<span class="mk" aria-hidden="true">${esc(p.mark)}</span>` : ""}
            <h3>${esc(p.title)}</h3>
            ${p.now ? `<span class="chip good">지금 단계</span>` : ""}
          </header>
          ${p.when || p.note ? `<p class="when">${esc(p.when || "")}${p.note ? `<b>${p.when ? " · " : ""}${esc(p.note)}</b>` : ""}</p>` : ""}
          ${p.intro ? `<div class="md intro">${renderMarkdown(String(p.intro))}</div>` : ""}
          <details><summary>프롬프트 보기</summary><pre lang="en">${esc(p.text)}</pre></details>
          <footer>
            <button class="btn ghost sm" type="button" data-copy="${p.i}">복사</button>
            <button class="btn accent sm" type="button" data-start="${p.i}">AI 튜터로 시작</button>
          </footer>
        </article>`).join("")}</div>` : `<p class="empty">프롬프트가 자료에 없어요.</p>`}
    </section>`;

  el.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-copy]");
    if (c) {
      const p = data.prompts[+c.dataset.copy];
      try { await navigator.clipboard.writeText(p.text); toast("프롬프트를 복사했어요."); } catch { toast("복사하지 못했어요. 프롬프트 보기에서 직접 골라 복사해 주세요.", "err"); }
      return;
    }
    const s = e.target.closest("[data-start]");
    if (s) {
      const p = data.prompts[+s.dataset.start];
      try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ text: p.text, model: "groq" })); } catch { toast("브라우저가 막아서 넘길 수 없어요. 복사해서 붙여 주세요.", "err"); return; }
      go("#/ai");
    }
  });
  return () => {};
}

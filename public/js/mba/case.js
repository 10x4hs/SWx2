// 경영 마이크로디그리 — 케이스 한 개: 상황 → 데이터 → 질문(내 답 먼저 → 힌트 → 모범 답안) → 가져갈 것 + 오른쪽 AI 케이스 코치
// 코치는 답을 바로 주지 않고 질문과 힌트로 끌어내요. 내가 적은 답은 이 기기에만 남고, 코치에게 물을 때 같이 보내요.
import { $, esc, toast } from "../util.js";
import { api, streamMbaAsk } from "../api.js";
import { chatMarkup, mountChat } from "../papers/chat.js";
import { index, moduleDoc, state, doneSet } from "./data.js";
import { md, store, back, meter } from "./ui.js";

const QUICK = ["어디서부터 생각해야 해요?", "힌트 하나만 더", "내 답을 평가해 줘", "계산을 같이 해 줘", "반대 입장이라면?"];
export function mountCase(host, ctx, modId, caseId) {
  let alive = true, stops = [], deep = store.get("mb-deep") === "on";
  const take = meter(90);
  host.innerHTML = `<p class="mb-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, doc, st] = await Promise.all([index(), moduleDoc(modId), state()]);
    if (!alive) return;
    const m = idx.modules.find((x) => x.id === modId), list = doc.cases || [], k = list.findIndex((x) => x.id === caseId), cs = list[k];
    if (!m || !cs) { host.innerHTML = `<p class="mb-err">없는 케이스예요. <a href="#/mba/${esc(modId)}">모듈로</a></p>`; return; }
    let done = doneSet(st).has(modId + "/" + caseId);
    const key = (i) => `mb-case-${modId}-${caseId}-${i}`, qs = cs.questions || [];
    let n = 0; const sec = (label) => `<span class="mb-lbl"><span class="mb-mono">${String(++n).padStart(2, "0")}</span>${label}</span>`;
    const short = (s) => { const t = String(s).replace(/\*\*/g, ""); return t.length > 34 ? t.slice(0, 33) + "…" : t; };
    const endBar = () => done
      ? `<button type="button" class="mb-btn ghost sm" id="mb-case-undo">기록 지우기</button><button type="button" class="mb-btn" id="mb-case-done">다시 풀었어요 · 시간 기록</button>`
      : `<span></span><button type="button" class="mb-btn" id="mb-case-done">케이스 끝</button>`;
    host.innerHTML = `<div class="mb-page mb-cardpage mb-casepage">
      <header class="mb-bar">${back(`#/mba/${esc(modId)}`, "모듈로")}<span class="mb-mono dim">MODULE ${esc(m.no)}</span><span class="mb-k">${esc(m.title)} · ${cs.day || 1}일차</span><span class="mb-mono">CASE ${k + 1} / ${list.length}</span><span class="mb-sp"></span>
        <button type="button" class="mb-btn ghost sm" id="mb-ai-t" aria-pressed="true" aria-controls="mb-ai">AI 코치</button></header>
      <div class="mb-cols">
        <nav class="mb-outline" aria-label="케이스 순서"><span class="mb-lbl"><span class="mb-mono">CASE</span>순서</span>
          <ol><li><a href="#/mba/${esc(modId)}/case/${esc(caseId)}" data-jump="mb-c-story"><span class="mb-mono">01</span><span>상황</span></a></li>
            ${cs.data ? `<li><a href="#/mba/${esc(modId)}/case/${esc(caseId)}" data-jump="mb-c-data"><span class="mb-mono">02</span><span>데이터</span></a></li>` : ""}
            ${qs.map((q, i) => `<li><a href="#/mba/${esc(modId)}/case/${esc(caseId)}" data-jump="mb-c-q${i}"><span class="mb-mono">Q${i + 1}</span><span>${esc(short(q.q))}</span></a></li>`).join("")}
            ${cs.takeaways?.length ? `<li><a href="#/mba/${esc(modId)}/case/${esc(caseId)}" data-jump="mb-c-take"><span class="mb-mono">✓</span><span>가져갈 것</span></a></li>` : ""}</ol>
        </nav>
        <main class="mb-read" id="mb-read">
          <span class="mb-k dim">케이스 · ${cs.min}분 · 답을 먼저 적고, 그다음에 힌트와 모범 답안</span>
          <h1>${md(cs.title)}</h1>
          <section class="mb-blk" id="mb-c-story">${sec("상황")}${(cs.story || []).map((p) => `<p class="mb-p">${md(p)}</p>`).join("")}</section>
          ${cs.data ? `<section class="mb-blk" id="mb-c-data">${sec("데이터")}<div class="mbc-tw"><table class="mbc-table mb-ctable"><thead><tr>${cs.data.cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${cs.data.rows.map((r) => `<tr>${r.map((v, j) => (j ? `<td>${esc(v)}</td>` : `<th scope="row">${esc(v)}</th>`)).join("")}</tr>`).join("")}</tbody></table></div>${cs.data.note ? `<p class="mb-cap">${md(cs.data.note)}</p>` : ""}</section>` : ""}
          ${qs.map((q, i) => `<section class="mb-blk mb-cq" id="mb-c-q${i}">${sec(`질문 ${i + 1}`)}<h2>${md(q.q)}</h2>
            <textarea class="mb-ta" rows="4" data-ans="${i}" aria-label="질문 ${i + 1} 내 답" placeholder="내 답을 먼저 적어요. 숫자는 계산 과정까지.">${esc(store.get(key(i)) || "")}</textarea>
            <div class="mb-row">${q.hint ? `<button type="button" class="mb-btn ghost sm" data-hint="${i}" aria-expanded="false">힌트</button>` : ""}<button type="button" class="mb-btn ghost sm" data-model="${i}" aria-expanded="false">모범 답안 보기</button><span class="mb-k dim" data-nudge="${i}" hidden>한 줄이라도 내 답을 먼저 적으면 훨씬 오래 남아요. 그래도 보려면 한 번 더 눌러요.</span></div>
            ${q.hint ? `<p class="mb-hint-t" data-hint-t="${i}" hidden><span class="mb-k acc">힌트</span> ${md(q.hint)}</p>` : ""}
            <div class="mb-model" data-model-t="${i}" hidden><span class="mb-k acc">좋은 답의 모양</span>${(q.answer || []).map((p) => `<p>${md(p)}</p>`).join("")}</div></section>`).join("")}
          ${cs.takeaways?.length ? `<section class="mb-blk" id="mb-c-take">${sec("가져갈 것")}<ul class="mb-take">${cs.takeaways.map((t) => `<li>${md(t)}</li>`).join("")}</ul></section>` : ""}
          ${cs.sources?.length ? `<p class="mb-src-l"><span class="mb-mono dim">SOURCES</span> ${cs.sources.map(esc).join(" · ")}</p>` : ""}
          <div class="mb-endbar" id="mb-case-end">${endBar()}</div>
        </main>
        <aside class="mb-ai" id="mb-ai" aria-label="AI 케이스 코치">
          <div class="mb-ai-head"><span class="mb-dot"></span><b>AI 케이스 코치</b><span class="mb-k dim">답 대신 질문과 힌트로 도와요 · 내가 적은 답을 같이 봐요</span>
            <button type="button" class="mb-sw" id="mb-deep" aria-pressed="${deep}"><i></i><span>${deep ? "깊게" : "쉽게"}</span></button></div>
          ${chatMarkup("full", { quick: QUICK, sub: "케이스 코치", empty: "막히는 질문을 말해 주면 생각할 실마리부터 줘요. 답을 적은 뒤 '내 답을 평가해 줘'를 눌러 봐요.", ph: "예: 질문 1, 어디서부터 봐야 해요?" })}
        </aside>
      </div>
      <button type="button" class="mb-ai-fab" id="mb-ai-fab" aria-controls="mb-ai" aria-expanded="false">코치에게 묻기</button>
    </div>`;
    const page = $(".mb-casepage", host), aiBox = $("#mb-ai", host);
    // 코치: 내가 적은 답을 같이 보내요
    const mine = () => qs.map((q, i) => { const v = (store.get(key(i)) || "").trim(); return v ? `질문 ${i + 1}: ${v}` : ""; }).filter(Boolean).join(" / ");
    const chatOpts = { level: deep ? "deep" : "easy", quick: QUICK, stream: (id, msgs, ev, sig, level) => streamMbaAsk(modId, caseId, msgs, ev, sig, level, mine()) };
    stops.push(mountChat(aiBox, `mba-${modId}-${caseId}`, $("#mb-read", host), null, chatOpts) || null);
    $("#mb-deep", host).addEventListener("click", (e) => {
      deep = !deep; store.set("mb-deep", deep ? "on" : "off"); chatOpts.level = deep ? "deep" : "easy";
      const b = e.currentTarget; b.setAttribute("aria-pressed", deep); b.querySelector("span").textContent = deep ? "깊게" : "쉽게";
    });
    const setAi = (on) => { page.classList.toggle("ai-off", !on); page.classList.toggle("ai-on", on); $("#mb-ai-t", host).setAttribute("aria-pressed", on); $("#mb-ai-fab", host).setAttribute("aria-expanded", on); };
    $("#mb-ai-t", host).addEventListener("click", () => setAi(page.classList.contains("ai-off")));
    $("#mb-ai-fab", host).addEventListener("click", () => setAi(!page.classList.contains("ai-on")));
    if (matchMedia("(max-width: 1100px)").matches) setAi(false);
    // 내 답 (이 기기에만)
    host.addEventListener("input", (e) => { const t = e.target.closest("[data-ans]"); if (t) store.set(key(t.dataset.ans), t.value.slice(0, 2000)); });
    const nudged = new Set();
    host.addEventListener("click", async (e) => {
      const go = e.target.closest("[data-jump]");
      if (go) { e.preventDefault(); $("#" + go.dataset.jump, host)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); return; }
      const h = e.target.closest("[data-hint]");
      if (h) { const t = $(`[data-hint-t="${h.dataset.hint}"]`, host), open = t.hidden; t.hidden = !open; h.setAttribute("aria-expanded", open); h.textContent = open ? "힌트 접기" : "힌트"; return; }
      const a = e.target.closest("[data-model]");
      if (a) {
        const i = a.dataset.model, t = $(`[data-model-t="${i}"]`, host), open = t.hidden, ta = $(`[data-ans="${i}"]`, host);
        if (open && !ta.value.trim() && !nudged.has(i)) { nudged.add(i); $(`[data-nudge="${i}"]`, host).hidden = false; ta.focus(); return; }
        $(`[data-nudge="${i}"]`, host).hidden = true; t.hidden = !open; a.setAttribute("aria-expanded", open); a.textContent = open ? "모범 답안 접기" : "모범 답안 보기"; return;
      }
      const d = e.target.closest("#mb-case-done, #mb-case-undo"); if (!d) return;
      d.disabled = true;
      try {
        if (d.id === "mb-case-undo") { await api.mbaDone(modId, caseId, "case", undefined, undefined, false); done = false; toast("케이스 기록을 지웠어요"); }
        else { await api.mbaDone(modId, caseId, "case"); const mins = take(); if (mins) await api.mbaDay(mins); done = true; toast(`케이스를 끝낸 걸로 기록했어요${mins ? ` · ${mins}분` : ""}`); }
        $("#mb-case-end", host).innerHTML = endBar();
      } catch (x) { d.disabled = false; toast(x.message || "기록하지 못했어요.", "err"); }
    });
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">케이스를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; stops.forEach((f) => { try { f?.(); } catch {} }); };
}

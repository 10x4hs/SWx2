// 경영 마이크로디그리 — 오늘: 먼저 떠올리기 · 지난 카드 다시 꺼내기(간격 복습) → 새 개념 한 장 → 내일 한 줄
import { $, esc, toast } from "../util.js";
import { api } from "../api.js";
import { index, moduleDoc, state, minutes, STEPS, split, nextCard } from "./data.js";

const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const LIMIT = { 15: 6, 25: 10, 40: 16 }; // 하루 복습 카드 수 (분에 맞춰)

export function mountToday(host, ctx) {
  let alive = true, timer = 0;
  const t0 = Date.now(), mins = minutes(), s = split(mins);
  host.innerHTML = `<p class="mb-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st] = await Promise.all([index(), state()]);
    if (!alive) return;
    const due = (st.due || []).slice(0, LIMIT[mins] || 10);
    const docs = Object.fromEntries(await Promise.all([...new Set(due.map((d) => d.module))].map(async (id) => [id, await moduleDoc(id).catch(() => null)])));
    // 카드마다 문제 하나 (복습 단계에 따라 돌아가며)
    const deck = due.map((d) => {
      const c = docs[d.module]?.cards?.find((x) => x.id === d.card); if (!c?.quiz?.length) return null;
      const q = c.quiz[(d.stage - 1) % c.quiz.length], m = idx.modules.find((x) => x.id === d.module);
      return { module: d.module, card: d.card, title: c.title, mod: m?.title || "", q };
    }).filter(Boolean);
    const nx = nextCard(idx, st);
    const yesterday = [...(st.days || [])].reverse().find((d) => d.day < st.today && d.plan);
    const todayRow = (st.days || []).find((d) => d.day === st.today);
    host.innerHTML = `<div class="mb-page mb-todaypage">
      <header class="mb-bar"><a class="mb-back" href="#/mba" aria-label="모듈 지도로"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9 2 4 7l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a><span class="mb-mono dim">TODAY</span><span class="mb-k">${esc(st.today || "")}</span><span class="mb-sp"></span><span class="mb-k" id="mb-clock">0분 / ${mins}분</span></header>
      <div class="mb-today-wrap">
        <section class="mb-thead"><span class="mb-mono dim">DAILY · ${mins} MIN</span><h1>오늘의 ${mins}분</h1>
          ${yesterday ? `<p class="mb-plan-y"><span class="mb-k dim">어제 정한 한 줄</span> ${esc(yesterday.plan)}</p>` : ""}
          <ol class="mb-tsteps">${STEPS.map((x, i) => `<li><span class="mb-mono dim">0${i + 1}</span><b>${x.name}</b><span class="mb-min">${s[i]}<small>분</small></span></li>`).join("")}</ol></section>

        <section class="mb-blk" id="mb-rv">
          <span class="mb-lbl"><span class="mb-mono">01–02</span>먼저 떠올리기 · 지난 카드 다시 꺼내기</span>
          ${deck.length ? `<div id="mb-deck"></div>` : `<p class="mb-p">오늘 다시 꺼낼 카드가 없어요. ${st.items?.length ? "어제 읽은 카드는 내일부터 나와요." : "첫 카드를 읽으면 내일부터 복습이 시작돼요."}</p>`}
        </section>

        <section class="mb-blk">
          <span class="mb-lbl"><span class="mb-mono">03–04</span>새 개념 한 가지 · 내 일에 적용</span>
          ${nx ? `<a class="mb-next" href="#/mba/${esc(nx.module.id)}/${esc(nx.card.id)}"><span class="mb-k dim">${esc(nx.module.no)} ${esc(nx.module.title)} · ${nx.card.min}분</span><b>${esc(nx.card.title)}</b><span class="mb-btn">읽으러 가기</span></a>` : `<p class="mb-p">모든 카드를 읽었어요. 이제는 복습과 캡스톤 보고서만 남았어요.</p>`}
        </section>

        <section class="mb-blk">
          <span class="mb-lbl"><span class="mb-mono">05</span>내일 한 줄</span>
          <label class="mb-h2" for="mb-plan">내일 언제, 어디서 할까요? “만약 ~하면, 그때 ~한다” 한 줄로.</label>
          <div class="mb-row"><input id="mb-plan" class="mb-in" maxlength="140" placeholder="예) 내일 아침 지하철에 타면, 그때 오늘 카드 퀴즈를 푼다" value="${esc(todayRow?.plan || "")}"><button type="button" class="mb-btn" id="mb-plan-save">저장</button></div>
        </section>

        <div class="mb-endbar"><a class="mb-btn ghost" href="#/mba">모듈 지도</a><button type="button" class="mb-btn" id="mb-end">오늘 끝 · 시간 기록</button></div>
      </div>
    </div>`;
    // 시계 (몇 분째인지만 — 재촉하지 않아요)
    const tick = () => { const n = Math.floor((Date.now() - t0) / 60000), e = $("#mb-clock", host); if (e) e.textContent = `${n}분 / ${mins}분`; };
    timer = setInterval(tick, 15000);
    // 복습 덱: 한 문제씩
    if (deck.length) {
      const results = new Map(); let i = 0;
      const box = $("#mb-deck", host);
      const draw = () => {
        if (i >= deck.length) {
          const list = [...results.entries()].map(([k, ok]) => { const [module, card] = k.split("/"); return { module, card, correct: ok ? 1 : 0, total: 1 }; });
          const got = list.filter((r) => r.correct).length;
          box.innerHTML = `<p class="mb-p"><b>${got} / ${list.length}</b> 맞혔어요. 맞힌 카드는 다음 간격(3 → 7 → 21 → 60일)으로, 틀린 카드는 한 단계 뒤로 가서 내일 다시 나와요.</p>`;
          api.mbaReview(list).catch((x) => toast(x.message || "복습 결과를 저장하지 못했어요.", "err"));
          return;
        }
        const d = deck[i];
        box.innerHTML = `<div class="mb-q"><span class="mb-k dim">${i + 1} / ${deck.length} · ${esc(d.mod)} — ${esc(d.title)}</span><p class="mb-q-t">${md(d.q.q)}</p><div class="mb-q-c">${d.q.choices.map((ch, ci) => `<button type="button" class="mb-choice" data-ci="${ci}">${md(ch)}</button>`).join("")}</div><p class="mb-q-why" hidden></p><button type="button" class="mb-btn ghost" data-next hidden>다음</button></div>`;
      };
      box.addEventListener("click", (e) => {
        const nb = e.target.closest("[data-next]"); if (nb) { i++; draw(); return; }
        const b = e.target.closest(".mb-choice"); if (!b || b.disabled) return;
        const d = deck[i], ci = Number(b.dataset.ci), ok = ci === d.q.answer;
        results.set(d.module + "/" + d.card, ok);
        box.querySelectorAll(".mb-choice").forEach((x) => { x.disabled = true; const k = Number(x.dataset.ci); x.classList.toggle("right", k === d.q.answer); x.classList.toggle("wrong", k === ci && !ok); });
        const why = box.querySelector(".mb-q-why"); why.hidden = false; why.innerHTML = `<b>${ok ? "맞아요." : "다시 볼까요."}</b> ${md(d.q.why)}`;
        box.querySelector("[data-next]").hidden = false;
      });
      draw();
    }
    $("#mb-plan-save", host).addEventListener("click", async () => {
      const v = $("#mb-plan", host).value.trim(); if (!v) return $("#mb-plan", host).focus();
      try { await api.mbaDay(0, v); toast("내일 한 줄을 저장했어요"); } catch (x) { toast(x.message || "저장하지 못했어요.", "err"); }
    });
    $("#mb-end", host).addEventListener("click", async (e) => {
      const n = Math.max(1, Math.min(240, Math.round((Date.now() - t0) / 60000)));
      e.currentTarget.disabled = true;
      try { await api.mbaDay(n); toast(`오늘 ${n}분을 기록했어요`); location.hash = "#/mba"; } catch (x) { e.currentTarget.disabled = false; toast(x.message || "기록하지 못했어요.", "err"); }
    });
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">오늘 화면을 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; clearInterval(timer); };
}

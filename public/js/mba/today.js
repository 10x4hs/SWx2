// 경영 마이크로디그리 — 오늘(하루 1~2시간): 먼저 떠올리기 → 지난 카드 다시 꺼내기(간격 복습) → 새 카드 N장 → 케이스 · 연습문제 → 내일 한 줄
import { $, esc, toast } from "../util.js";
import { api } from "../api.js";
import { index, moduleDoc, state, minutes, steps, split, nextCards, position, reviewLimit, cardsPerDay, doneSet } from "./data.js";
import { md, store, back, meter, hm } from "./ui.js";

const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const kday = (d) => { const [, m, dd] = d.split("-").map(Number); return `${m}월 ${dd}일`; };

export function mountToday(host, ctx) {
  let alive = true, timer = 0;
  const t0 = Date.now(), take = meter(60), mins = minutes(), s = split(mins), lim = reviewLimit(mins), N = cardsPerDay(mins);
  host.innerHTML = `<p class="mb-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st] = await Promise.all([index(), state()]);
    if (!alive) return;
    const today = st.today || kst(Date.now()), due = (st.due || []).slice(0, lim), pos = position(idx, st), cur = pos.module;
    const ids = [...new Set([...due.map((d) => d.module), cur.id])];
    const docs = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await moduleDoc(id).catch(() => null)])));
    if (!alive) return;
    // 복습 덱: 카드마다 문제 하나 (복습 단계에 따라 돌아가며)
    const deck = due.map((d) => {
      const c = docs[d.module]?.cards?.find((x) => x.id === d.card); if (!c?.quiz?.length) return null;
      const q = c.quiz[(d.stage - 1) % c.quiz.length], m = idx.modules.find((x) => x.id === d.module);
      return { module: d.module, card: d.card, title: c.title, mod: m?.title || "", q };
    }).filter(Boolean);
    // 떠올리기 단서: 오늘 전에 마지막으로 공부한 날 읽은 카드
    const items = st.items || [], before = items.filter((x) => kst(x.read_at) < today);
    const lastDay = before.reduce((a, x) => (kst(x.read_at) > a ? kst(x.read_at) : a), "");
    const cue = before.filter((x) => kst(x.read_at) === lastDay).map((x) => docs[x.module]?.cards?.find((c) => c.id === x.card)?.title || idx.modules.find((m) => m.id === x.module)?.cards.find((c) => c.id === x.card)?.title).filter(Boolean);
    // 새 카드: 오늘 읽은 것 + 남은 만큼
    const readToday = items.filter((x) => kst(x.read_at) === today).map((x) => { const m = idx.modules.find((y) => y.id === x.module); return m && { module: m, card: m.cards.find((c) => c.id === x.card), done: true }; }).filter((x) => x?.card);
    const fresh = [...readToday.slice(0, N), ...nextCards(idx, st, Math.max(0, N - readToday.length))];
    // 적용: 지금 모듈 · 지금 날의 문제, 아직 안 끝낸 케이스, 그날 강의
    const done = doneSet(st), probs = (cur.problems || []).filter((p) => p.day === pos.day), left = probs.filter((p) => !done.has(cur.id + "/" + p.id)).length;
    const kase = (cur.cases || []).find((k) => (k.day || 1) <= pos.day && !done.has(cur.id + "/" + k.id));
    const lecs = (docs[cur.id]?.lectures || []).filter((l) => l.day === pos.day);
    const yesterday = [...(st.days || [])].reverse().find((d) => d.day < today && d.plan);
    const todayRow = (st.days || []).find((d) => d.day === today), before0 = todayRow?.minutes || 0;
    const recallKey = `mb-recall-${today}`;
    host.innerHTML = `<div class="mb-page mb-todaypage">
      <header class="mb-bar">${back("#/mba", "모듈 지도로")}<span class="mb-mono dim">TODAY</span><span class="mb-k">${esc(kday(today))}</span><span class="mb-sp"></span><span class="mb-k" id="mb-clock"></span></header>
      <div class="mb-today-wrap">
        <section class="mb-thead"><span class="mb-mono dim">DAILY · ${mins} MIN</span><h1>오늘의 ${hm(mins)}</h1>
          <p class="mb-pos">${pos.done ? "모든 카드를 읽었어요 — 복습과 캡스톤 보고서만 남았어요" : `지금 <b>${esc(cur.no)} ${esc(cur.title)}</b> · 10일 중 ${pos.day}일차`}</p>
          ${yesterday ? `<p class="mb-plan-y"><span class="mb-k dim">어제 정한 한 줄</span> ${esc(yesterday.plan)}</p>` : ""}
          <ol class="mb-tsteps">${steps(mins).map((x, i) => `<li><span class="mb-mono dim">0${i + 1}</span><b>${x.name}</b><span class="mb-min">${s[i]}<small>분</small></span></li>`).join("")}</ol></section>

        <section class="mb-blk" id="mb-recall">
          <span class="mb-lbl"><span class="mb-mono">01</span>먼저 떠올리기 · ${s[0]}분</span>
          <label class="mb-h2" for="mb-recall-t">${lastDay ? `${esc(kday(lastDay))}에 배운 것을, 아무것도 보지 말고 적어 봐요.` : "경영에 대해 지금 아는 것을 아무것도 보지 말고 적어 봐요."}</label>
          <textarea id="mb-recall-t" class="mb-ta" rows="4" placeholder="낱말 몇 개, 그림, 공식 — 떠오르는 대로. 틀려도 괜찮아요.">${esc(store.get(recallKey) || "")}</textarea>
          <div class="mb-row"><button type="button" class="mb-btn ghost" id="mb-recall-ok" aria-expanded="false">다 적었어요 · 맞춰 보기</button><span class="mb-k dim">이 기기에만 저장돼요</span></div>
          <div class="mb-answer" id="mb-cue" hidden>${cue.length ? `<span class="mb-k dim">${esc(kday(lastDay))}에 읽은 카드</span><ul class="mb-cue">${cue.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>빠진 것이 있으면 그 카드를 복습 덱에서 만나요.` : "아직 읽은 카드가 없어요. 오늘 첫 카드부터 시작해요."}</div>
        </section>

        <section class="mb-blk" id="mb-rv">
          <span class="mb-lbl"><span class="mb-mono">02</span>지난 카드 다시 꺼내기 · ${s[1]}분${(st.due || []).length > lim ? ` · 오늘은 ${lim}장까지 (밀린 카드 ${(st.due || []).length - lim}장은 내일)` : ""}</span>
          ${deck.length ? `<div id="mb-deck"></div>` : `<p class="mb-p">오늘 다시 꺼낼 카드가 없어요. ${items.length ? "어제 읽은 카드는 내일부터 나와요." : "첫 카드를 읽으면 내일부터 복습이 시작돼요."}</p>`}
        </section>

        <section class="mb-blk">
          <span class="mb-lbl"><span class="mb-mono">03</span>새 카드 ${N}장 · ${s[2]}분</span>
          ${fresh.length ? `<ol class="mb-nexts">${fresh.map((x, i) => `<li><a class="mb-it${x.done ? " done" : ""}" href="#/mba/${esc(x.module.id)}/${esc(x.card.id)}"><span class="mb-it-k ${x.done ? "acc" : ""}">${x.done ? "✓ 읽음" : String(i + 1).padStart(2, "0")}</span><b>${esc(x.card.title)}</b><span class="mb-k dim">${esc(x.module.no)} ${esc(x.module.title)} · ${x.card.min}분</span></a></li>`).join("")}</ol>
            ${readToday.length >= N ? `<p class="mb-k dim">오늘 몫을 다 읽었어요. 더 읽어도 되지만, 복습이 늘어나는 만큼 내일이 무거워져요.</p>` : ""}` : `<p class="mb-p">모든 카드를 읽었어요. 이제는 복습과 캡스톤 보고서만 남았어요.</p>`}
        </section>

        <section class="mb-blk">
          <span class="mb-lbl"><span class="mb-mono">04</span>케이스 · 연습문제 · ${s[3]}분</span>
          <ul class="mb-nexts">
            ${probs.length ? `<li><a class="mb-it" href="#/mba/${esc(cur.id)}/practice/${pos.day}"><span class="mb-it-k ${left ? "" : "acc"}">${left ? "문제" : "✓ 문제"}</span><b>${esc(cur.title)} ${pos.day}일차 연습문제 ${probs.length}개</b><span class="mb-k dim">${left ? `남은 ${left}개` : "다 풀었어요"}</span></a></li>` : ""}
            ${kase ? `<li><a class="mb-it case" href="#/mba/${esc(cur.id)}/case/${esc(kase.id)}"><span class="mb-it-k">케이스</span><b>${esc(kase.title)}</b><span class="mb-k dim">${kase.min}분 · 이틀에 나눠 해도 돼요</span></a></li>` : ""}
            ${lecs.map((l) => `<li><a class="mb-it lec" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><span class="mb-it-k">강의 · 선택</span><b>${esc(l.title)}</b><span class="mb-k dim">${esc(l.provider || "")} · ${l.min}분${l.lang === "en" ? " · 영어" : ""}</span></a></li>`).join("")}
          </ul>
          ${!probs.length && !kase && !lecs.length ? `<p class="mb-p">오늘은 따로 풀 문제가 없어요. 오늘 읽은 카드의 '내 일에 적용하기'를 한 번 더 써 봐요.</p>` : ""}
        </section>

        <section class="mb-blk">
          <span class="mb-lbl"><span class="mb-mono">05</span>내일 한 줄 · ${s[4]}분</span>
          <label class="mb-h2" for="mb-plan">내일 언제, 어디서 할까요? “만약 ~하면, 그때 ~한다” 한 줄로.</label>
          <div class="mb-row"><input id="mb-plan" class="mb-in" maxlength="140" placeholder="예) 내일 저녁 8시에 책상에 앉으면, 그때 복습 덱부터 연다" value="${esc(todayRow?.plan || "")}"><button type="button" class="mb-btn" id="mb-plan-save">저장</button></div>
        </section>

        <div class="mb-endbar"><a class="mb-btn ghost" href="#/mba">모듈 지도</a><button type="button" class="mb-btn" id="mb-end">오늘 끝 · 이 화면 시간 기록</button></div>
      </div>
    </div>`;
    // 시계: 오늘 이미 기록된 분 + 이 화면에 있는 분 (재촉하지 않아요)
    let saved = before0;
    const tick = () => { const e = $("#mb-clock", host); if (e) e.textContent = `오늘 ${saved + Math.floor((Date.now() - t0) / 60000)}분 / ${mins}분`; };
    tick(); timer = setInterval(tick, 15000);
    const record = async () => { const n = take(); if (!n) return 0; await api.mbaDay(n); return n; };
    // 떠올리기
    $("#mb-recall-t", host).addEventListener("input", (e) => store.set(recallKey, e.target.value.slice(0, 2000)));
    $("#mb-recall-ok", host).addEventListener("click", (e) => { const c = $("#mb-cue", host), open = c.hidden; c.hidden = !open; e.currentTarget.setAttribute("aria-expanded", open); e.currentTarget.textContent = open ? "접기" : "다 적었어요 · 맞춰 보기"; });
    // 복습 덱: 한 문제씩
    if (deck.length) {
      const results = new Map(); let i = 0;
      const box = $("#mb-deck", host);
      const draw = () => {
        if (i >= deck.length) {
          const list = [...results.entries()].map(([k, ok]) => { const [module, card] = k.split("/"); return { module, card, correct: ok ? 1 : 0, total: 1 }; });
          const got = list.filter((r) => r.correct).length;
          box.innerHTML = `<p class="mb-p"><b>${got} / ${list.length}</b> 맞혔어요. 맞힌 카드는 다음 간격(3 → 7 → 21 → 60일)으로, 틀린 카드는 한 단계 뒤로 가서 내일 다시 나와요.</p>`;
          api.mbaReview(list).then(() => record()).catch((x) => toast(x.message || "복습 결과를 저장하지 못했어요.", "err"));
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
      const b = e.currentTarget; b.disabled = true;
      try { const n = await record(); saved += n; toast(n ? `이 화면에서 보낸 ${n}분을 기록했어요` : "기록할 시간이 없어요 (카드 · 케이스 · 문제 시간은 그 화면에서 이미 쌓였어요)"); location.hash = "#/mba"; }
      catch (x) { b.disabled = false; toast(x.message || "기록하지 못했어요.", "err"); }
    });
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">오늘 화면을 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; clearInterval(timer); };
}

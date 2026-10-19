// 오늘: 떠올리기 → 복습(간격이 된 카드마다 문제 하나) → 새 카드 → 사례 · 회의실 → 내일 한 줄
//   맨 위 단계 막대(지금 어디쯤인지) + 아래 고정 띠에 지금 할 일 하나(안 읽은 새 카드 → 회의실 → 사례 → 오늘 끝)
import { $, $$, esc, toast } from "../util.js";
import { index, moduleDoc, state, minutes, split, steps, nextCards, position, reviewLimit, cardsPerDay, doneSet, readSet, kst, kday, md, meter, topbar, nextBar, C, cApi } from "./data.js";

export function mountToday(host, ctx) {
  let alive = true;
  const take = meter(60), mins = minutes(), S = split(mins), P = steps(mins), N = cardsPerDay(mins);
  host.innerHTML = `${topbar("today", "", [{ t: "오늘" }])}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st] = await Promise.all([index(), state()]);
    if (!alive) return;
    const today = st.today || kst(Date.now()), due = (st.due || []).slice(0, reviewLimit(mins)), pos = position(idx, st), cur = pos.module;
    const ids = [...new Set([...due.map((d) => d.module), cur.id])];
    const docs = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await moduleDoc(id).catch(() => null)])));
    if (!alive) return;
    const deck = due.map((d) => { const c = docs[d.module]?.cards.find((x) => x.id === d.card); if (!c?.quiz?.length) return null; return { ...d, title: c.title, q: c.quiz[(d.stage - 1) % c.quiz.length] }; }).filter(Boolean);
    const items = st.items || [], before = items.filter((x) => kst(x.read_at) < today), last = before.reduce((a, x) => (kst(x.read_at) > a ? kst(x.read_at) : a), "");
    const cue = before.filter((x) => kst(x.read_at) === last).map((x) => idx.modules.find((m) => m.id === x.module)?.cards.find((c) => c.id === x.card)?.title).filter(Boolean);
    const read = readSet(st), readToday = items.filter((x) => kst(x.read_at) === today).map((x) => { const m = idx.modules.find((y) => y.id === x.module); return m && { module: m, card: m.cards.find((c) => c.id === x.card) }; }).filter((x) => x?.card);
    const fresh = [...readToday.slice(0, N), ...nextCards(idx, st, Math.max(0, N - readToday.length))];
    const done = doneSet(st), probs = cur.problems.filter((p) => p.day === pos.day), left = probs.filter((p) => !done.has(cur.id + "/" + p.id)).length;
    const kase = cur.cases.find((k) => (k.day || 4) <= pos.day && !done.has(cur.id + "/" + k.id));
    const yesterday = [...(st.days || [])].reverse().find((d) => d.day < today && d.plan), todayRow = (st.days || []).find((d) => d.day === today);
    const firstNew = fresh.find((x) => !read.has(x.module.id + "/" + x.card.id));
    const now = firstNew ? { href: `${C.base}/${firstNew.module.id}/${firstNew.card.id}`, label: `새 카드 읽기 · ${firstNew.module.no}-${firstNew.card.id.slice(1)}`, sub: firstNew.card.title, step: 2 }
      : left ? { href: `${C.base}/${cur.id}/practice/${pos.day}`, label: "회의실 풀기", sub: probs.map((p) => p.title).join(" · "), step: 3 }
      : kase ? { href: `${C.base}/${cur.id}/case/${kase.id}`, label: "사례 읽기", sub: kase.title, step: 3 }
      : { href: "#t-4", label: "오늘 끝 · 한 줄 남기기", sub: "내일 무엇부터 할지 적고 기록해요", step: 4 };
    const stepState = (i) => (i < now.step ? "done" : i === now.step ? "now" : "next");
    const head = (i, extra = "") => `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><div><span class="m acc">0${i + 1} · ${S[i]}분</span><h2 style="margin-top:6px">${esc(P[i].name)}</h2></div>${extra}</div><p class="kr dim" style="font-size:14px;line-height:1.7;margin:8px 0 16px">${esc(P[i].why)} (${esc(P[i].src)})</p>`;
    host.innerHTML = `${topbar("today", "", [{ t: "오늘" }])}
      <div class="dv-wrap" style="max-width:920px;padding-top:36px;display:flex;flex-direction:column;gap:20px">
        <div><div class="m">오늘 · ${kday(today)} · ${mins}분${todayRow?.minutes ? ` · 지금까지 ${todayRow.minutes}분` : ""}</div><h1 style="margin-top:10px">${cur.no}주차 ${esc(cur.title)} · ${pos.day}일째</h1>${yesterday ? `<p class="kr" style="font-size:16px;color:var(--dv-sub);margin:10px 0 0">어제 적은 한 줄: “${esc(yesterday.plan)}”</p>` : ""}</div>
        <ol class="bk-steps" aria-label="오늘 순서">${P.map((p, i) => `<li class="${stepState(i)}"><a href="#t-${i}"><span class="m">0${i + 1} · ${S[i]}분</span><b>${esc(p.name)}</b></a></li>`).join("")}</ol>
        <section class="dv-panel" id="t-0">${head(0)}${cue.length ? `<p class="kr" style="margin:0 0 10px">지난번에 읽은 카드: ${cue.slice(0, 5).map((t) => `<b>${esc(t)}</b>`).join(" · ")}</p><p class="kr dim" style="margin:0 0 10px">제목만 보고, 무엇이었는지 아래에 적어 봐요.</p>` : `<p class="kr" style="margin:0 0 10px">아직 읽은 카드가 없어요. 오늘은 바로 새 카드로 가요.</p>`}<textarea class="dv-plan-in" aria-label="떠올린 내용" placeholder="생각나는 대로 적어요 (이 기기에만 남아요)" id="dv-cue"></textarea></section>
        <section class="dv-panel" id="t-1">${head(1, `<span class="m">${deck.length}장</span>`)}<div id="dv-deck">${deck.length ? deck.map((d, i) => `<div class="dv-rv" data-i="${i}" style="padding:16px 0;border-top:1px solid var(--dv-line)"><div class="m">${esc(d.title)} · ${d.stage}단계</div><p class="kr" style="font-size:16px;line-height:1.7;margin:6px 0 10px">${md(d.q.q)}</p><div style="display:flex;flex-direction:column;gap:8px">${d.q.options.map((o, j) => `<button class="dv-mopt" data-o="${j}" style="padding:12px 14px"><span class="m">${"ABCD"[j]}</span><span>${md(o)}</span></button>`).join("")}</div><p class="kr dim" hidden data-why style="margin:10px 0 0;font-size:14px;line-height:1.7"></p></div>`).join("") : `<p class="kr dim" style="margin:0">오늘 복습할 카드가 없어요.</p>`}</div>${deck.length ? `<button class="dv-btn" id="dv-rv-save" style="margin-top:14px" disabled>복습 결과 저장</button>` : ""}</section>
        <section class="dv-panel" id="t-2">${head(2)}${fresh.length ? fresh.map((x) => `<a class="dv-row" href="${C.base}/${x.module.id}/${x.card.id}"><span class="m acc">${x.module.no}-${x.card.id.slice(1)}</span><span style="font-size:16px">${esc(x.card.title)}</span><span class="m">${read.has(x.module.id + "/" + x.card.id) ? "읽음" : "새 카드"}</span></a>`).join("") : `<p class="kr dim">모든 카드를 읽었어요.</p>`}</section>
        <section class="dv-panel" id="t-3">${head(3)}<a class="dv-row" href="${C.base}/${cur.id}/practice/${pos.day}"><span class="m acc">회의실</span><span>${probs.map((p) => esc(p.title)).join(" · ")}</span><span class="m">${probs.length - left}/${probs.length}</span></a>${kase ? `<a class="dv-row" href="${C.base}/${cur.id}/case/${kase.id}"><span class="m acc">사례</span><span>${esc(kase.title)}</span><span class="m">열기</span></a>` : ""}</section>
        <section class="dv-panel" id="t-4">${head(4)}<input class="dv-plan-in" id="dv-plan" maxlength="140" aria-label="내일 한 줄" placeholder="예: 내일 아침 지하철에서 07주차 복습 먼저" value="${esc(todayRow?.plan || "")}"><button class="dv-btn" id="dv-end" style="margin-top:12px">오늘 끝 · 기록하기</button></section>
      </div>
      ${nextBar({ href: now.href, label: now.label, sub: now.sub })}`;
    const cueKey = `dv-cue-${today}`; try { $("#dv-cue", host).value = localStorage.getItem(cueKey) || ""; } catch {}
    $("#dv-cue", host).addEventListener("input", (e) => { try { localStorage.setItem(cueKey, e.target.value.slice(0, 1500)); } catch {} });
    const results = new Map();
    $$(".dv-rv", host).forEach((box) => box.addEventListener("click", (e) => {
      const b = e.target.closest(".dv-mopt"), i = Number(box.dataset.i); if (!b || results.has(i)) return;
      const d = deck[i], j = Number(b.dataset.o), ok = j === d.q.answer; results.set(i, ok);
      $$(".dv-mopt", box).forEach((x, k) => { x.disabled = true; if (k === d.q.answer) x.classList.add("pick"); });
      const w = box.querySelector("[data-why]"); w.hidden = false; w.innerHTML = `<b>${ok ? "맞아요." : "다시 볼까요."}</b> ${md(d.q.why || "")}`;
      const sv = $("#dv-rv-save", host); if (sv) sv.disabled = false;
    }));
    $("#dv-rv-save", host)?.addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await cApi.review([...results].map(([i, ok]) => ({ module: deck[i].module, card: deck[i].card, correct: ok ? 1 : 0, total: 1 }))); b.textContent = "저장했어요"; toast("복습을 저장했어요 · 맞힌 카드는 간격이 늘어나요"); }
      catch (x) { b.disabled = false; toast(x.message || "저장하지 못했어요.", "err"); }
    });
    $("#dv-end", host).addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await cApi.day(take(), $("#dv-plan", host).value.trim()); b.textContent = "기록했어요"; toast("오늘 공부를 기록했어요"); }
      catch (x) { b.disabled = false; toast(x.message || "기록하지 못했어요.", "err"); }
    });
  })().catch(() => { if (alive) host.innerHTML = `${topbar("today", "", [{ t: "오늘" }])}<p class="dv-err">불러오지 못했어요.</p>`; });
  return () => { alive = false; const m = take(); if (m) cApi.day(m).catch(() => {}); };
}

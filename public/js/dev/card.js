// 카드 한 장 = 책의 한 쪽: 읽기 칸 하나(핵심 → 생각 → 흐름 그림 → 코드 읽기 → 회의에서 들리는 말 → 질문 · 내 앱 → 더 자세히 → 떠올리기 · 퀴즈 · 출처).
//   위 띠에 이 장의 쪽 진도, 아래 고정 띠에 [다 읽었어요 → 다음 카드] 하나. AI 튜터는 오른쪽 아래 버튼으로 접어 둬요. 다음 쪽으로 넘길 땐 책장처럼 넘어가요.
import { $, $$, esc, toast } from "../util.js";
import { streamCourseAsk } from "../api.js";
import { chatMarkup, mountChat } from "../papers/chat.js";
import { index, moduleDoc, state, readSet, md, srcList, meter, topbar, nextBar, C, cApi } from "./data.js";

export function mountCard(host, ctx, modId, cardId) {
  let alive = true;
  const stops = [], take = meter(30);
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st, doc] = await Promise.all([index(), state(), moduleDoc(modId)]);
    if (!alive) return;
    const m = idx.modules.find((x) => x.id === modId), ci = doc.cards.findIndex((x) => x.id === cardId), c = doc.cards[ci];
    if (!m || !c) { host.innerHTML = `${topbar("")}<p class="dv-err">없는 카드예요. <a href="${C.base}/${esc(modId)}">이 모듈로</a></p>`; return; }
    const read = readSet(st), prev = doc.cards[ci - 1], next = doc.cards[ci + 1], nextM = idx.modules[idx.modules.indexOf(m) + 1];
    const nRead = doc.cards.filter((x) => read.has(modId + "/" + x.id)).length, wasRead = read.has(modId + "/" + cardId);
    const go = next ? { href: `${C.base}/${modId}/${next.id}`, sub: `다음 · ${next.title}` } : { href: `${C.base}/${modId}`, sub: "이 장의 마지막 카드 · 모듈로 돌아가요" };
    let deep = false;
    host.innerHTML = `${topbar("", "", [{ t: `${m.no} ${m.short || m.title}`, href: `${C.base}/${m.id}` }, { t: `카드 ${ci + 1} / ${doc.cards.length}` }])}
      <div class="bk-progress" role="progressbar" aria-label="이 장에서 읽은 카드" aria-valuemin="0" aria-valuemax="${doc.cards.length}" aria-valuenow="${nRead}"><i style="width:${Math.round((nRead / doc.cards.length) * 100)}%"></i><b style="left:${Math.round((ci / doc.cards.length) * 100)}%;width:${Math.max(1, Math.round(100 / doc.cards.length))}%"></b></div>
      <div class="bk">
        <article class="dv-paper bk-page bk-read" id="dv-read">
          <p class="m bk-meta">${m.no} ${esc(m.title)} · ${c.day}일째 · 카드 ${ci + 1} / ${doc.cards.length} · ${wasRead ? "읽음 ✓" : `이 장에서 ${doc.cards.length - nRead}장 남음`}</p>
          <h1>${esc(c.title)}</h1>
          <p class="bk-lead">${md(c.lead)}</p>
          ${c.idea.map((p) => `<p>${md(p)}</p>`).join("")}
          ${c.steps?.length ? `<div class="dv-steps" role="list" aria-label="흐름">${c.steps.map((s) => `<div class="dv-step" role="listitem"><b>${esc(s.k)}</b>${md(s.t)}</div>`).join("")}</div>` : ""}
          ${c.code ? `<h2>코드로 보면 · 읽는 법만</h2><pre class="dv-code">${esc(c.code.text)}</pre><p>${md(c.code.read)}</p>` : ""}
          ${c.hear?.length ? `<h2>회의에서 이렇게 들려요</h2><ul class="bk-hear">${c.hear.map((h) => `<li>“${md(String(h).replace(/^["“”']+|["“”']+$/g, ""))}”</li>`).join("")}</ul>` : ""}
          ${c.ask?.length || c.mine ? `<div class="bk-notes">${c.ask?.length ? `<div class="bk-note"><p class="m">${C.role}가 할 질문</p><ol>${c.ask.map((a) => `<li>${esc(a)}</li>`).join("")}</ol></div>` : ""}${c.mine ? `<div class="bk-note"><p class="m">내 앱에서는? · SWx2</p><p>${md(c.mine)}</p></div>` : ""}</div>` : ""}
          ${c.deep?.length ? `<h2>더 자세히</h2><div id="dv-deep" hidden>${c.deep.map((p) => `<p>${md(p)}</p>`).join("")}</div><button class="dv-pbtn" id="dv-deep-b" aria-expanded="false" aria-controls="dv-deep">더 자세히 펼치기</button>` : ""}
          <section class="bk-check" aria-labelledby="bk-check-h">
            <h2 id="bk-check-h">떠올리기</h2>
            <p class="bk-hint">위를 보지 않고 한두 줄로 적어요. 꺼내 보는 연습이 다시 읽기보다 오래 남아요 (Roediger &amp; Karpicke, 2006).</p>
            <p><b>${md(c.recall.q)}</b></p>
            <textarea class="dv-plan-in" id="dv-recall" aria-label="떠올리기 답" placeholder="보지 않고 한두 줄로 적어 보세요"></textarea>
            <div class="bk-row-acts"><button class="dv-pbtn" id="dv-recall-b" aria-expanded="false">적었어요 · 답 보기</button></div>
            <p id="dv-recall-a" class="bk-answer" hidden><b>답</b> ${md(c.recall.a)}</p>
            ${c.quiz?.length ? `<h2>확인 문제</h2>${c.quiz.map((q, qi) => `<div class="dv-qz" data-q="${qi}"><p><b>${qi + 1}.</b> ${md(q.q)}</p><div class="dv-quiz">${q.options.map((o, oi) => `<button class="dv-opt" data-o="${oi}"><span class="m">${"ABCD"[oi]}</span><span>${md(o)}</span></button>`).join("")}</div><p class="dv-why" hidden></p></div>`).join("")}` : ""}
          </section>
          <footer class="bk-src"><p class="m">출처 · 2026-10-15 확인</p><p class="dv-src">${srcList(c.sources)}</p></footer>
        </article>
      </div>
      <aside class="bk-ai sw-ui" id="bk-ai" hidden aria-label="AI 튜터">
        <div class="bk-ai-h"><span class="m">AI 튜터 · ${esc(C.tutor)}</span><span class="bk-ai-r"><button class="dv-chip" id="dv-lv" aria-pressed="false">쉽게</button><button class="dv-chip" id="bk-ai-x" aria-label="닫기">닫기</button></span></div>
        <div class="dv-panel" id="dv-ai">${chatMarkup("full", { quick: C.quickCard, sub: C.tutor, empty: "이 카드에서 막히는 걸 물어봐요. 본문을 긁으면 그 문장으로 물어볼 수 있어요.", ph: C.ph })}</div>
      </aside>
      ${nextBar({ id: "dv-done", label: wasRead ? "다시 읽었어요" : "다 읽었어요", sub: go.sub, back: `<span class="bk-left">${prev ? `<a class="bk-back" href="${C.base}/${modId}/${prev.id}">← 이전</a>` : `<a class="bk-back" href="${C.base}/${modId}">← 모듈</a>`}<button type="button" class="bk-ai-btn" id="bk-ai-open" aria-expanded="false" aria-controls="bk-ai">AI 튜터</button></span>` })}`;
    const opts = { level: "easy", quick: C.quickCard, stream: (id, msgs, ev, sig, level) => streamCourseAsk(C.key, modId, cardId, msgs, ev, sig, level, "") };
    stops.push(mountChat($("#dv-ai", host), `${C.key}-${modId}-${cardId}`, $("#dv-read", host), null, opts) || null);
    const ai = $("#bk-ai", host), aiBtn = $("#bk-ai-open", host);
    const setAi = (open) => { ai.hidden = !open; aiBtn.setAttribute("aria-expanded", open); host.classList.toggle("bk-ai-on", open); if (open) ai.querySelector("textarea, input")?.focus(); };
    aiBtn.addEventListener("click", () => setAi(ai.hidden));
    $("#bk-ai-x", host).addEventListener("click", () => setAi(false));
    $("#dv-lv", host).addEventListener("click", (e) => { deep = !deep; opts.level = deep ? "deep" : "easy"; e.currentTarget.setAttribute("aria-pressed", deep); e.currentTarget.textContent = deep ? "깊게" : "쉽게"; });
    $("#dv-deep-b", host)?.addEventListener("click", (e) => { const d = $("#dv-deep", host), open = d.hidden; d.hidden = !open; e.currentTarget.setAttribute("aria-expanded", open); e.currentTarget.textContent = open ? "접기" : "더 자세히 펼치기"; });
    $("#dv-recall-b", host).addEventListener("click", (e) => { const a = $("#dv-recall-a", host), open = a.hidden; a.hidden = !open; e.currentTarget.setAttribute("aria-expanded", open); e.currentTarget.textContent = open ? "답 접기" : "적었어요 · 답 보기"; });
    const answered = new Map();
    $$(".dv-qz", host).forEach((box) => box.addEventListener("click", (e) => {
      const b = e.target.closest(".dv-opt"), qi = Number(box.dataset.q); if (!b || answered.has(qi)) return;
      const q = c.quiz[qi], oi = Number(b.dataset.o); answered.set(qi, oi === q.answer);
      $$(".dv-opt", box).forEach((x) => { x.disabled = true; const k = Number(x.dataset.o); x.classList.toggle("ok", k === q.answer); x.classList.toggle("no", k === oi && oi !== q.answer); });
      const w = $(".dv-why", box); w.hidden = false; w.innerHTML = `<b>${oi === q.answer ? "맞아요." : "다시 볼까요."}</b> ${md(q.why)}`;
    }));
    // 다 읽었어요: 기록하고 → 책장 넘기듯 다음 쪽으로
    $("#dv-done", host).addEventListener("click", async (e) => {
      const b = e.currentTarget, t = b.querySelector(".bk-go-t"); b.disabled = true;
      const total = (c.quiz || []).length, got = [...answered.values()].filter(Boolean).length, all = total && answered.size === total;
      try {
        await cApi.read(modId, cardId, all ? got : undefined, all ? total : undefined);
        const mins = take(); if (mins) await cApi.day(mins);
        t.textContent = "기록했어요"; toast(`읽음으로 기록했어요 · 내일 복습에 나와요${all ? ` · 퀴즈 ${got}/${total}` : ""}`);
        setTimeout(() => { if (!alive) return; $("#dv-read", host)?.classList.add("bk-turn"); setTimeout(() => { if (alive) location.hash = go.href; }, 260); }, 450);
      } catch (x) { b.disabled = false; toast(x.message || "기록하지 못했어요.", "err"); }
    });
    if (!next && nextM) $(".bk-go-s", host) && ($(".bk-go-s", host).textContent = `이 장의 마지막 카드 · 다음 장은 ${nextM.no} ${nextM.title}`);
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">카드를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; stops.forEach((f) => { try { f?.(); } catch {} }); };
}

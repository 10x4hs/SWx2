// 개발 흐름 — 카드 한 장: 종이 위 글(핵심 → 생각 → 흐름 그림 → 코드 읽기 → 회의에서 들리는 말 → 더 자세히 → 떠올리기 · 퀴즈) + 옆 칸(대표의 질문 · 내 앱에서는? · AI 튜터)
import { $, $$, esc, toast } from "../util.js";
import { streamCourseAsk } from "../api.js";
import { chatMarkup, mountChat } from "../papers/chat.js";
import { index, moduleDoc, state, readSet, md, srcList, meter, topbar, C, cApi } from "./data.js";


export function mountCard(host, ctx, modId, cardId) {
  let alive = true;
  const stops = [], take = meter(30);
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st, doc] = await Promise.all([index(), state(), moduleDoc(modId)]);
    if (!alive) return;
    const m = idx.modules.find((x) => x.id === modId), ci = doc.cards.findIndex((x) => x.id === cardId), c = doc.cards[ci];
    if (!m || !c) { host.innerHTML = `${topbar("")}<p class="dv-err">없는 카드예요. <a href="${C.base}/${esc(modId)}">이 주로</a></p>`; return; }
    const read = readSet(st), prev = doc.cards[ci - 1], next = doc.cards[ci + 1], nextM = idx.modules[idx.modules.indexOf(m) + 1];
    let deep = false;
    host.innerHTML = `${topbar("")}
      <div class="dv-wrap" style="padding-top:28px"><div class="dv-lay">
        <article class="dv-paper" id="dv-read">
          <div class="m"><a href="${C.base}/${m.id}" style="color:inherit">${m.no} ${esc(m.title)}</a> · ${c.day}일째 · 카드 ${ci + 1}/${doc.cards.length}</div>
          <h1 style="font-size:clamp(28px,3.4vw,36px);line-height:1.25;margin:12px 0 16px;color:var(--dv-pink)">${esc(c.title)}</h1>
          <p style="font-size:19px;line-height:1.75;color:var(--dv-pink)"><b>${md(c.lead)}</b></p>
          ${c.idea.map((p) => `<p>${md(p)}</p>`).join("")}
          ${c.steps?.length ? `<div class="dv-steps" role="list" aria-label="흐름">${c.steps.map((s) => `<div class="dv-step" role="listitem"><b>${esc(s.k)}</b>${md(s.t)}</div>`).join("")}</div>` : ""}
          ${c.code ? `<h2>코드로 보면 · 읽는 법만</h2><pre class="dv-code">${esc(c.code.text)}</pre><p style="margin-top:12px">${md(c.code.read)}</p>` : ""}
          ${c.hear?.length ? `<h2>회의에서 이렇게 들려요</h2><ul>${c.hear.map((h) => `<li>“${md(String(h).replace(/^["“”']+|["“”']+$/g, ""))}”</li>`).join("")}</ul>` : ""}
          ${c.deep?.length ? `<h2>더 자세히</h2><div id="dv-deep" hidden>${c.deep.map((p) => `<p>${md(p)}</p>`).join("")}</div><button class="dv-pbtn" id="dv-deep-b" aria-expanded="false" aria-controls="dv-deep">더 자세히 펼치기</button>` : ""}
          <h2>떠올리기</h2>
          <p>${md(c.recall.q)}</p>
          <textarea class="dv-plan-in" style="background:#FCFBF8;color:var(--dv-pink);border-color:#CFCBC0" id="dv-recall" aria-label="떠올리기 답" placeholder="보지 않고 한두 줄로 적어 보세요"></textarea>
          <div style="margin-top:10px"><button class="dv-pbtn" id="dv-recall-b" aria-expanded="false">적었어요 · 답 보기</button></div>
          <p id="dv-recall-a" hidden style="margin-top:12px"><b>답:</b> ${md(c.recall.a)}</p>
          ${c.quiz?.length ? `<h2>확인 문제</h2>${c.quiz.map((q, qi) => `<div class="dv-qz" data-q="${qi}"><p style="margin:0 0 6px"><b>${qi + 1}.</b> ${md(q.q)}</p><div class="dv-quiz">${q.options.map((o, oi) => `<button class="dv-opt" data-o="${oi}"><span class="m">${"ABCD"[oi]}</span><span>${md(o)}</span></button>`).join("")}</div><p class="dv-why" hidden style="margin-top:-6px"></p></div>`).join("")}` : ""}
          <div style="margin-top:36px;padding-top:18px;border-top:1px solid var(--dv-pline)"><div class="m">출처 · 2026-10-15 확인</div><p class="dv-src" style="margin:8px 0 0">${srcList(c.sources)}</p></div>
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:28px">
            ${prev ? `<a class="dv-pbtn" style="display:inline-flex;align-items:center;text-decoration:none" href="${C.base}/${modId}/${prev.id}">이전 카드</a>` : "<span></span>"}
            <button class="dv-btn" id="dv-done">${read.has(modId + "/" + cardId) ? "다시 읽었어요" : "다 읽었어요"}</button>
          </div>
        </article>
        <aside class="dv-side">
          ${c.ask?.length ? `<div class="dv-panel"><div class="m acc">${C.role}가 할 질문</div><p>${c.ask.map((a, i) => `${"①②③④"[i] || "·"} ${esc(a)}`).join("<br>")}</p></div>` : ""}
          ${c.mine ? `<div class="dv-panel"><div class="m">내 앱에서는? · SWx2</div><p>${md(c.mine)}</p></div>` : ""}
          <div class="dv-panel"><div class="m">왜 이렇게 배우나</div><p>읽고 나서 보지 않고 떠올려 적어요. 꺼내 보는 연습이 다시 읽기보다 오래 남아요 (Roediger &amp; Karpicke, 2006).</p></div>
          <div class="dv-panel" id="dv-ai" aria-label="AI 튜터" style="padding:16px">
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:8px"><span class="m">답 수준</span><button class="dv-chip" id="dv-lv" aria-pressed="false" style="height:36px;padding:0 12px">쉽게</button></div>
            ${chatMarkup("full", { quick: C.quickCard, sub: C.tutor, empty: "이 카드에서 막히는 걸 물어봐요. 본문을 긁으면 그 문장으로 물어볼 수 있어요.", ph: C.ph })}
          </div>
          ${next ? `<a class="dv-btn ghost" href="${C.base}/${modId}/${next.id}">다음 · ${esc(next.title)}</a>` : nextM ? `<a class="dv-btn ghost" href="${C.base}/${nextM.id}">다음 주 · ${esc(nextM.title)}</a>` : `<a class="dv-btn ghost" href="${C.base}">지도로</a>`}
        </aside>
      </div></div>`;
    const opts = { level: "easy", quick: C.quickCard, stream: (id, msgs, ev, sig, level) => streamCourseAsk(C.key, modId, cardId, msgs, ev, sig, level, "") };
    stops.push(mountChat($("#dv-ai", host), `${C.key}-${modId}-${cardId}`, $("#dv-read", host), null, opts) || null);
    $("#dv-lv", host).addEventListener("click", (e) => { deep = !deep; opts.level = deep ? "deep" : "easy"; e.currentTarget.setAttribute("aria-pressed", deep); e.currentTarget.textContent = deep ? "깊게" : "쉽게"; });
    $("#dv-deep-b", host)?.addEventListener("click", (e) => { const d = $("#dv-deep", host), open = d.hidden; d.hidden = !open; e.currentTarget.setAttribute("aria-expanded", open); e.currentTarget.textContent = open ? "접기" : "더 자세히 펼치기"; });
    $("#dv-recall-b", host).addEventListener("click", (e) => { const a = $("#dv-recall-a", host), open = a.hidden; a.hidden = !open; e.currentTarget.setAttribute("aria-expanded", open); e.currentTarget.textContent = open ? "답 접기" : "적었어요 · 답 보기"; });
    const answered = new Map();
    $$(".dv-qz", host).forEach((box) => box.addEventListener("click", (e) => {
      const b = e.target.closest(".dv-opt"), qi = Number(box.dataset.q); if (!b || answered.has(qi)) return;
      const q = c.quiz[qi], oi = Number(b.dataset.o); answered.set(qi, oi === q.answer);
      $$(".dv-opt", box).forEach((x) => { x.disabled = true; const i = Number(x.dataset.o); x.classList.toggle("ok", i === q.answer); x.classList.toggle("no", i === oi && oi !== q.answer); });
      const w = $(".dv-why", box); w.hidden = false; w.innerHTML = `<b>${oi === q.answer ? "맞아요." : "다시 볼까요."}</b> ${md(q.why)}`;
    }));
    $("#dv-done", host).addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const total = (c.quiz || []).length, got = [...answered.values()].filter(Boolean).length, all = total && answered.size === total;
      try {
        await cApi.read(modId, cardId, all ? got : undefined, all ? total : undefined);
        const mins = take(); if (mins) await cApi.day(mins);
        b.textContent = "기록했어요"; toast(`읽음으로 기록했어요 · 내일 복습에 나와요${all ? ` · 퀴즈 ${got}/${total}` : ""}`);
        if (next) setTimeout(() => { if (alive) location.hash = `${C.base}/${modId}/${next.id}`; }, 700);
      } catch (x) { b.disabled = false; toast(x.message || "기록하지 못했어요.", "err"); }
    });
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">카드를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; stops.forEach((f) => { try { f?.(); } catch {} }); };
}

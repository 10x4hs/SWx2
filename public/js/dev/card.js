// 카드 한 장 = 교과서 한 쪽: 핵심 → 생각(어려운 곳 바로 아래에 '그림 N-M' · 영상) → 흐름 → 코드 읽기 → 회의에서 들리는 말 → 질문 · 내 앱 → 더 자세히 → 떠올리기 · 퀴즈 · 출처.
//   위 띠에 이 장의 쪽 진도, 아래 고정 띠에 [다 읽었어요 → 다음 카드] 하나. AI 튜터는 오른쪽 서랍 — 왼쪽 가장자리를 끌거나 [작게 · 보통 · 크게]로 크기를 바꿔요(기억해요).
//   튜터가 답 안에 [[그림:id]] 를 쓰면 그 자리에 같은 그림이 떠요.
import { $, $$, esc, toast } from "../util.js";
import { streamCourseAsk } from "../api.js";
import { chatMarkup, mountChat, drawerMarkup, mountDrawer } from "../tutor.js";
import { index, moduleDoc, state, readSet, md, srcList, meter, topbar, nextBar, C, cApi } from "./data.js";
import { loadMap, moduleFigs, slotHtml, figTokens, figRefs } from "../figs/catalog.js";
import { mountSlots, mountFigure } from "../figs/player.js";

export function mountCard(host, ctx, modId, cardId) {
  let alive = true;
  const stops = [], take = meter(30);
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st, doc, map] = await Promise.all([index(), state(), moduleDoc(modId), loadMap().catch(() => ({}))]);
    if (!alive) return;
    const m = idx.modules.find((x) => x.id === modId), ci = doc.cards.findIndex((x) => x.id === cardId), c = doc.cards[ci];
    if (!m || !c) { host.innerHTML = `${topbar("")}<p class="dv-err">없는 카드예요. <a href="${C.base}/${esc(modId)}">이 모듈로</a></p>`; return; }
    const read = readSet(st), prev = doc.cards[ci - 1], next = doc.cards[ci + 1], nextM = idx.modules[idx.modules.indexOf(m) + 1];
    const nRead = doc.cards.filter((x) => read.has(modId + "/" + x.id)).length, wasRead = read.has(modId + "/" + cardId);
    const go = next ? { href: `${C.base}/${modId}/${next.id}`, sub: `다음 · ${next.title}` } : { href: `${C.base}/${modId}`, sub: "이 장의 마지막 카드 · 모듈로 돌아가요" };
    // 이 모듈의 그림(번호) · 이 카드에 붙은 그림 자리
    const figs = moduleFigs(map, C.key, m), here = figs.filter((p) => p.card === cardId);
    const at = (k) => here.filter((p) => String(p.after ?? "end") === String(k)).map((p) => slotHtml(p, { key: `${C.key}/${modId}/${cardId}#${here.indexOf(p)}` })).join(""); // key: 돌아오면 보던 단계 그대로
    const byId = figRefs(figs, cardId); // 튜터가 부르는 그림: 이 카드에 있으면 이 카드의 것
    host.innerHTML = `${topbar("", "", [{ t: `${m.no} ${m.short || m.title}`, href: `${C.base}/${m.id}` }, { t: `카드 ${ci + 1} / ${doc.cards.length}` }])}
      <div class="bk-progress" role="progressbar" aria-label="이 장에서 읽은 카드" aria-valuemin="0" aria-valuemax="${doc.cards.length}" aria-valuenow="${nRead}"><i style="width:${Math.round((nRead / doc.cards.length) * 100)}%"></i><b style="left:${Math.round((ci / doc.cards.length) * 100)}%;width:${Math.max(1, Math.round(100 / doc.cards.length))}%"></b></div>
      <div class="bk">
        <article class="dv-paper bk-page bk-read" id="dv-read">
          <p class="bk-meta">${m.no} ${esc(m.title)} · ${c.day}일째 · 카드 ${ci + 1} / ${doc.cards.length} · ${wasRead ? "읽음 ✓" : `이 장에서 ${doc.cards.length - nRead}장 남음`}</p>
          <h1>${esc(c.title)}</h1>
          <p class="bk-lead"><span class="hl">${md(c.lead)}</span></p>
          ${at("lead")}
          ${c.idea.map((p, i) => `<p>${md(p)}</p>${at(i)}`).join("")}
          ${c.steps?.length ? `<div class="dv-steps" role="list" aria-label="흐름">${c.steps.map((s) => `<div class="dv-step" role="listitem"><b>${esc(s.k)}</b>${md(s.t)}</div>`).join("")}</div>${at("steps")}` : ""}
          ${c.code ? `<h2>코드로 보면 · 읽는 법만</h2><pre class="dv-code">${esc(c.code.text)}</pre><p>${md(c.code.read)}</p>${at("code")}` : ""}
          ${c.hear?.length ? `<h2>회의에서 이렇게 들려요</h2><ul class="bk-hear">${c.hear.map((h) => `<li>“${md(String(h).replace(/^["“”']+|["“”']+$/g, ""))}”</li>`).join("")}</ul>` : ""}
          ${c.ask?.length || c.mine ? `<div class="bk-notes">${c.ask?.length ? `<div class="bk-note"><p class="bk-note-h">${C.role}가 할 질문</p><ol>${c.ask.map((a) => `<li>${esc(a)}</li>`).join("")}</ol></div>` : ""}${c.mine ? `<div class="bk-note"><p class="bk-note-h">내 앱에서는? · SWx2</p><p>${md(c.mine)}</p></div>` : ""}</div>` : ""}
          ${c.deep?.length ? `<h2>더 자세히</h2><div id="dv-deep" hidden>${c.deep.map((p) => `<p>${md(p)}</p>`).join("")}</div><button class="dv-pbtn" id="dv-deep-b" aria-expanded="false" aria-controls="dv-deep">더 자세히 펼치기</button>` : ""}
          ${at("end")}
          <section class="bk-check" aria-labelledby="bk-check-h">
            <h2 id="bk-check-h">떠올리기</h2>
            <p class="bk-hint">위를 보지 않고 한두 줄로 적어요. 꺼내 보는 연습이 다시 읽기보다 오래 남아요 (Roediger &amp; Karpicke, 2006).</p>
            <p><b>${md(c.recall.q)}</b></p>
            <textarea class="dv-plan-in" id="dv-recall" aria-label="떠올리기 답" placeholder="보지 않고 한두 줄로 적어 보세요"></textarea>
            <div class="bk-row-acts"><button class="dv-pbtn" id="dv-recall-b" aria-expanded="false">적었어요 · 답 보기</button></div>
            <p id="dv-recall-a" class="bk-answer" hidden><b>답</b> ${md(c.recall.a)}</p>
            ${c.quiz?.length ? `<h2>확인 문제</h2>${c.quiz.map((q, qi) => `<div class="dv-qz" data-q="${qi}"><p><b>${qi + 1}.</b> ${md(q.q)}</p><div class="dv-quiz">${q.options.map((o, oi) => `<button class="dv-opt" data-o="${oi}"><span class="dv-opt-k">${"ABCD"[oi]}</span><span>${md(o)}</span></button>`).join("")}</div><p class="dv-why" hidden></p></div>`).join("")}` : ""}
          </section>
          <footer class="bk-src"><p class="bk-src-h">출처 · 2026-10-15 확인</p><p class="dv-src">${srcList(c.sources)}</p></footer>
        </article>
      </div>
      ${drawerMarkup({ id: "bk-ai", title: `AI 튜터 · ${C.tutor}`, level: true, body: chatMarkup("full", { quick: C.quickCard, sub: `지금 카드 · ${c.title}`, empty: "이 카드에서 막히는 걸 물어봐요. 본문을 긁으면 그 문장으로 물어볼 수 있어요. ‘그림으로 보여 줘’ 하면 그림을 띄워 줘요.", ph: C.ph }) })}
      ${nextBar({ id: "dv-done", label: wasRead ? "다시 읽었어요" : "다 읽었어요", sub: go.sub, back: `<span class="bk-left">${prev ? `<a class="bk-back" href="${C.base}/${modId}/${prev.id}">← 이전</a>` : `<a class="bk-back" href="${C.base}/${modId}">← 모듈</a>`}<button type="button" class="bk-ai-btn" id="bk-ai-open" aria-expanded="false" aria-controls="bk-ai">AI 튜터</button></span>` })}`;
    const top = $(".dv-top", host), bar = $(".bk-progress", host); if (top && bar) top.appendChild(bar); // 쪽 진도 선은 위 띠 맨 아래에 (띠가 두 줄이 돼도 딱 붙게)
    stops.push(mountSlots($("#dv-read", host)));
    // 튜터 답의 [[그림:id]] — 받는 동안은 칩, 다 받으면 그 자리에 진짜 그림
    const decorate = (bub) => bub.querySelectorAll(".fig-chip").forEach((chip) => {
      const p = byId.get(chip.dataset.figref); if (!p) return;
      const slot = document.createElement("div"); slot.className = "fig-slot compact"; chip.replaceWith(slot);
      mountFigure(slot, { id: p.fig, no: p.no, title: p.title, opts: p.opts || {}, compact: true });
    });
    const opts = { level: "easy", quick: C.quickCard, post: (html) => figTokens(html, byId), stream: (id, msgs, ev, sig, level) => streamCourseAsk(C.key, modId, cardId, msgs, ev, sig, level, "") };
    stops.push(mountChat($("#bk-ai", host), `${C.key}-${modId}-${cardId}`, $("#dv-read", host), decorate, opts));
    stops.push(mountDrawer(host, $("#bk-ai", host), { opener: "#bk-ai-open", sizeKey: "sw-ai-size", openKey: "sw-ai-open", onLevel: (lv) => { opts.level = lv; } }));
    $("#dv-deep-b", host)?.addEventListener("click", (e) => { const d = $("#dv-deep", host), open = d.hidden; d.hidden = !open; e.currentTarget.setAttribute("aria-expanded", open); e.currentTarget.textContent = open ? "접기" : "더 자세히 펼치기"; });
    $("#dv-recall-b", host).addEventListener("click", (e) => { const a = $("#dv-recall-a", host), open = a.hidden; a.hidden = !open; e.currentTarget.setAttribute("aria-expanded", open); e.currentTarget.textContent = open ? "답 접기" : "적었어요 · 답 보기"; });
    const answered = new Map();
    $$(".dv-qz", host).forEach((box) => box.addEventListener("click", (e) => {
      const b = e.target.closest(".dv-opt"), qi = Number(box.dataset.q); if (!b || answered.has(qi)) return;
      const q = c.quiz[qi], oi = Number(b.dataset.o); answered.set(qi, oi === q.answer);
      $$(".dv-opt", box).forEach((x) => { x.disabled = true; const k = Number(x.dataset.o); x.classList.toggle("ok", k === q.answer); x.classList.toggle("no", k === oi && oi !== q.answer); });
      const w = $(".dv-why", box); w.hidden = false; w.innerHTML = `<b>${oi === q.answer ? "맞아요." : "다시 볼까요."}</b> ${md(q.why)}`;
    }));
    // 다 읽었어요: 기록하고 → 다음 쪽으로
    $("#dv-done", host).addEventListener("click", async (e) => {
      const b = e.currentTarget, t = b.querySelector(".bk-go-t"); b.disabled = true;
      const total = (c.quiz || []).length, got = [...answered.values()].filter(Boolean).length, all = total && answered.size === total;
      try {
        await cApi.read(modId, cardId, all ? got : undefined, all ? total : undefined);
        const mins = take(); if (mins) await cApi.day(mins);
        t.textContent = "기록했어요"; toast(`읽음으로 기록했어요 · 내일 복습에 나와요${all ? ` · 퀴즈 ${got}/${total}` : ""}`);
        setTimeout(() => { if (alive) location.hash = go.href; }, 450);
      } catch (x) { b.disabled = false; toast(x.message || "기록하지 못했어요.", "err"); }
    });
    if (!next && nextM) $(".bk-go-s", host) && ($(".bk-go-s", host).textContent = `이 장의 마지막 카드 · 다음 장은 ${nextM.no} ${nextM.title}`);
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">카드를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; stops.forEach((f) => { try { f?.(); } catch {} }); };
}

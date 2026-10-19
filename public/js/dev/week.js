// 개발 흐름 — 한 주(모듈) 화면: 큰 번호 · 이번 주 질문 · 두런의 장면 · 5일 계획(카드 4장씩) · 사례 · 회의실 · 강의 · 금요일에 쓸 것
import { esc } from "../util.js";
import { index, moduleDoc, state, readSet, doneSet, progressOf, topbar, md, C, cApi } from "./data.js";

export function mountWeek(host, ctx, id) {
  let alive = true, day = 0;
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st] = await Promise.all([index(), state()]);
    const m = idx.modules.find((x) => x.id === id);
    if (!m) { host.innerHTML = `${topbar("")}<p class="dv-err">없는 주예요. <a href="${C.base}">지도로</a></p>`; return; }
    const doc = await moduleDoc(id);
    if (!alive) return;
    let read = readSet(st), done = doneSet(st);
    const has = (s, x) => s.has(id + "/" + x);
    // 처음 열면 아직 안 읽은 카드가 있는 날
    day = Math.max(0, (m.cards.find((c) => !has(read, c.id))?.day || 1) - 1);
    const i = idx.modules.indexOf(m), prev = idx.modules[i - 1], next = idx.modules[i + 1];
    function draw() {
      const p = progressOf(m, { items: [...read].map((k) => ({ module: k.split("/")[0], card: k.split("/")[1] })), done: [...done].map((k) => ({ module: k.split("/")[0], item: k.split("/")[1] })) });
      const cards = doc.cards.filter((c) => c.day === day + 1), probs = doc.problems.filter((q) => q.day === day + 1);
      const dayDone = (d) => doc.cards.filter((c) => c.day === d).every((c) => has(read, c.id));
      host.innerHTML = `${topbar("")}
        <section class="dv-wrap" style="padding-top:40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:36px;align-items:end">
          <div><div class="dv-week-no">${m.no}</div><h1 style="margin:18px 0 10px">${esc(m.title)}</h1><p class="kr" style="font-size:20px;line-height:1.6;margin:0">이번 주 질문 — <b class="acc">“${esc(m.q)}”</b></p></div>
          <div class="dv-panel" style="display:flex;flex-direction:column;gap:12px"><div class="m">이번 주 진도</div>
            <div style="display:flex;gap:28px;flex-wrap:wrap">${[["카드", p.cards, p.nCards], ["사례", p.cases, p.nCases], ["회의실", p.probs, p.nProbs]].map(([l, a, b]) => `<span style="font:600 32px var(--dv-lat)">${a}<span class="m"> / ${b} ${l}</span></span>`).join("")}</div>
            <div class="m">이번 주 문서 · ${esc(m.doc)}</div>
            <a class="dv-btn" style="align-self:flex-start;margin-top:4px" href="${C.base}/ask/${id}">AI에게 이번 주 묻기</a></div>
        </section>
        <section class="dv-wrap" style="padding-top:48px"><div class="dv-paper" style="max-width:860px">
          <div class="m">${esc(C.scene(Number(m.no), doc.story.size))}</div>
          <h2 style="margin:10px 0 14px;font-size:28px">${esc(doc.story.title)}</h2>
          ${doc.story.body.map((b) => `<p>${md(b)}</p>`).join("")}
          ${doc.goals?.length ? `<div class="m" style="margin-top:22px">이번 주가 끝나면</div><ul>${doc.goals.map((g) => `<li>${md(g)}</li>`).join("")}</ul>` : ""}
          <p class="m" style="margin:0">왜 이야기부터? 장면에 붙은 개념은 나중에 꺼내기 쉬워요 (맥락 단서)</p>
        </div></section>
        <section class="dv-wrap" style="padding-top:48px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(520px,100%),1fr));gap:16px;align-items:start">
          <div class="dv-panel"><div class="m">5일 계획 · 하루 새 카드 4장 · 회의실 3문제</div>
            <div class="dv-days" role="group" aria-label="날">${[1, 2, 3, 4, 5].map((d) => `<button class="dv-day${d === day + 1 ? " on" : dayDone(d) ? " done" : ""}" data-day="${d - 1}" aria-pressed="${d === day + 1}"><span>${d}일</span><span class="m">${dayDone(d) ? "끝" : ""}</span></button>`).join("")}</div>
            ${cards.map((c) => `<a class="dv-row" href="${C.base}/${id}/${c.id}"><span class="m acc">${m.no}-${c.id.slice(1)}</span><span style="font-size:16px;line-height:1.5">${esc(c.title)}</span><span class="m">${has(read, c.id) ? "읽음" : "새 카드"}</span></a>`).join("")}
            <a class="dv-row" href="${C.base}/${id}/practice/${day + 1}"><span class="m acc">회의실</span><span style="font-size:16px;line-height:1.5">${probs.map((q) => esc(q.title)).join(" · ")}</span><span class="m">${probs.filter((q) => has(done, q.id)).length}/${probs.length}</span></a>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="dv-panel"><div class="m">사례 ${doc.cases.length}</div>${doc.cases.map((k) => `<a class="dv-row" style="grid-template-columns:1fr auto" href="${C.base}/${id}/case/${k.id}"><span>${esc(k.title)}</span><span class="m">${has(done, k.id) ? "끝" : `${k.day || 4}일째`}</span></a>`).join("")}</div>
            <div class="dv-panel"><div class="m">공식 무료 강의 · 자료</div>${doc.lectures.map((l) => `<div class="dv-row" style="grid-template-columns:1fr auto auto"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}${l.min ? ` <span class="dim">· ${l.min}분</span>` : ""}${l.lang ? ` <span class="dim">· ${esc(l.lang)}</span>` : ""}</a><span class="dim kr" style="font-size:13px">${esc(l.what || "")}</span><button class="dv-chip" data-lec="${esc(l.id)}" aria-pressed="${has(done, l.id)}" style="height:36px;padding:0 12px${has(done, l.id) ? ";border-color:var(--dv-acc);color:var(--dv-acc)" : ""}">${has(done, l.id) ? "봤어요" : "본 걸로"}</button></div>`).join("")}</div>
          </div>
        </section>
        ${doc.write ? `<section class="dv-wrap" style="padding-top:48px"><div class="dv-panel"><div class="m acc">${esc(doc.write.title || "금요일에 쓸 것")}</div><p class="kr" style="font-size:16px;line-height:1.75;margin:10px 0 0">${md(doc.write.task)}</p>${doc.write.template?.length ? `<ol class="kr" style="color:var(--dv-ink2);line-height:1.8;margin:10px 0 0;padding-left:22px">${doc.write.template.map((t) => `<li>${md(t)}</li>`).join("")}</ol>` : ""}</div></section>` : ""}
        <nav class="dv-wrap" style="padding-top:48px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap" aria-label="다른 주">
          ${prev ? `<a class="dv-btn ghost" href="${C.base}/${prev.id}">← ${prev.no} ${esc(prev.title)}</a>` : "<span></span>"}
          ${next ? `<a class="dv-btn ghost" href="${C.base}/${next.id}">${next.no} ${esc(next.title)} →</a>` : ""}
        </nav>`;
      host.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { day = Number(b.dataset.day); draw(); }));
      host.querySelectorAll("[data-lec]").forEach((b) => b.addEventListener("click", async () => {
        const lid = b.dataset.lec, on = has(done, lid), l = doc.lectures.find((x) => x.id === lid);
        b.disabled = true;
        try {
          const s = await cApi.done(id, lid, "lecture", null, null, !on);
          if (!on && l?.min) cApi.day(Math.min(240, l.min)).catch(() => {});
          done = doneSet(s); read = readSet(s); if (alive) draw();
        } catch { b.disabled = false; }
      }));
    }
    draw();
  })().catch(() => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">불러오지 못했어요. 새로 고침해 주세요.</p>`; });
  return () => { alive = false; };
}

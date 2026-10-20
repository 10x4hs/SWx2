// 한 모듈 = 책의 한 장(chapter): 표지(번호 · 제목 · 이번 주 질문 · 진도) → 지금 할 일 하나 → 5일 계획(카드 · 회의실) → 이번 주 이야기(접힘)
//   → 사례 · 자료 → 금요일에 쓸 것 → 앞뒤 모듈. 아래 고정 띠에는 늘 '지금 할 일' 하나만 (nextInModule).
import { esc } from "../util.js";
import { index, moduleDoc, state, readSet, doneSet, progressOf, topbar, nextBar, nextInModule, md, C, cApi } from "./data.js";

export function mountWeek(host, ctx, id) {
  let alive = true, day = 0;
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st] = await Promise.all([index(), state()]);
    const m = idx.modules.find((x) => x.id === id);
    if (!m) { host.innerHTML = `${topbar("")}<p class="dv-err">없는 모듈이에요. <a href="${C.base}">지도로</a></p>`; return; }
    const doc = await moduleDoc(id);
    if (!alive) return;
    let read = readSet(st), done = doneSet(st);
    const has = (s, x) => s.has(id + "/" + x);
    day = Math.max(0, (m.cards.find((c) => !has(read, c.id))?.day || 1) - 1); // 처음 열면 아직 안 읽은 카드가 있는 날
    const i = idx.modules.indexOf(m), prev = idx.modules[i - 1], next = idx.modules[i + 1];
    function draw() {
      const p = progressOf(m, { items: [...read].map((k) => ({ module: k.split("/")[0], card: k.split("/")[1] })), done: [...done].map((k) => ({ module: k.split("/")[0], item: k.split("/")[1] })) });
      const cards = doc.cards.filter((c) => c.day === day + 1), probs = doc.problems.filter((q) => q.day === day + 1);
      const dayDone = (d) => doc.cards.filter((c) => c.day === d).every((c) => has(read, c.id));
      const now = nextInModule(m, doc, read, done, C.base, next);
      const meter = (l, a, b) => `<div><span>${l}</span><b>${a}<small> / ${b}</small></b><i style="--p:${b ? Math.round((a / b) * 100) : 0}%"></i></div>`;
      host.innerHTML = `${topbar("", "", [{ t: `${m.no} ${m.title}` }])}
        <div class="bk bk-page">
          <header class="bk-cover">
            <p class="bk-kicker"><span class="dv-week-no">${m.no}</span>장 · ${esc(C.name)} · 5일</p>
            <h1>${esc(m.title)}</h1>
            <p class="bk-q">이번 주 질문 — “${esc(m.q)}”</p>
            <div class="bk-meter">${meter("카드", p.cards, p.nCards)}${meter("사례", p.cases, p.nCases)}${meter("회의실", p.probs, p.nProbs)}</div>
          </header>

          <section class="bk-now dv-panel" aria-labelledby="bk-now-h">
            <p class="m">지금 할 일</p>
            <h2 id="bk-now-h">${esc(now.label)}</h2>
            <p class="bk-now-sub">${esc(now.sub)}</p>
            <div class="bk-now-acts"><a class="dv-btn ghost" href="${now.href}">시작하기 →</a><a class="dv-btn ghost" href="${C.base}/ask/${id}">AI에게 이번 주 묻기</a></div>
          </section>

          <section class="dv-panel bk-days" aria-labelledby="bk-days-h">
            <div class="bk-sec-h"><h2 id="bk-days-h">5일 계획</h2><span class="m">하루 새 카드 · 회의실</span></div>
            <div class="dv-days" role="group" aria-label="날">${[1, 2, 3, 4, 5].map((d) => `<button class="dv-day${d === day + 1 ? " on" : dayDone(d) ? " done" : ""}" data-day="${d - 1}" aria-pressed="${d === day + 1}"><span>${d}일</span><span class="m">${dayDone(d) ? "끝" : ""}</span></button>`).join("")}</div>
            ${cards.map((c) => `<a class="dv-row" href="${C.base}/${id}/${c.id}"><span class="m acc">${m.no}-${c.id.slice(1)}</span><span class="kr">${esc(c.title)}</span><span class="m ${has(read, c.id) ? "bk-ok" : ""}">${has(read, c.id) ? "읽음 ✓" : "새 카드"}</span></a>`).join("")}
            ${probs.length ? `<a class="dv-row" href="${C.base}/${id}/practice/${day + 1}"><span class="m acc">회의실</span><span class="kr">${probs.map((q) => esc(q.title)).join(" · ")}</span><span class="m">${probs.filter((q) => has(done, q.id)).length}/${probs.length}</span></a>` : ""}
          </section>

          <details class="bk-story"${p.cards ? "" : " open"}>
            <summary><span class="m">${esc(C.scene(Number(m.no), doc.story.size))}</span><span class="bk-story-t">이번 주 이야기 · ${esc(doc.story.title)}</span></summary>
            <div class="dv-paper"><h2>${esc(doc.story.title)}</h2>
              ${doc.story.body.map((b) => `<p>${md(b)}</p>`).join("")}
              ${doc.goals?.length ? `<p class="m">이번 주가 끝나면</p><ul>${doc.goals.map((g) => `<li>${md(g)}</li>`).join("")}</ul>` : ""}
            </div>
          </details>

          ${doc.cases.length ? `<section class="bk-sec" aria-labelledby="bk-case-h"><div class="bk-sec-h"><h2 id="bk-case-h">사례 ${doc.cases.length}</h2><span class="m">실제로 있었던 일</span></div>
            <div class="dv-panel">${doc.cases.map((k) => `<a class="dv-row bk-row2" href="${C.base}/${id}/case/${k.id}"><span class="kr">${esc(k.title)}</span><span class="m ${has(done, k.id) ? "bk-ok" : ""}">${has(done, k.id) ? "끝 ✓" : `${k.day || 4}일째`}</span></a>`).join("")}</div></section>` : ""}

          ${doc.lectures.length ? `<section class="bk-sec" aria-labelledby="bk-lec-h"><div class="bk-sec-h"><h2 id="bk-lec-h">더 보기 · 공식 무료 자료</h2><span class="m">선택</span></div>
            <ul class="bk-lecs">${doc.lectures.map((l) => `<li><div><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a><p class="kr">${esc(l.what || "")}</p><span class="m">${[l.min ? `${l.min}분` : "", l.lang || ""].filter(Boolean).join(" · ")}</span></div><button class="dv-chip" data-lec="${esc(l.id)}" aria-pressed="${has(done, l.id)}">${has(done, l.id) ? "봤어요 ✓" : "본 걸로"}</button></li>`).join("")}</ul></section>` : ""}

          ${doc.write ? `<section class="bk-sec"><div class="dv-panel"><p class="m acc">${esc(doc.write.title || "금요일에 쓸 것")}</p><p class="kr bk-write">${md(doc.write.task)}</p>${doc.write.template?.length ? `<ol class="kr bk-tpl">${doc.write.template.map((t) => `<li>${md(t)}</li>`).join("")}</ol>` : ""}</div></section>` : ""}

          <nav class="bk-pager" aria-label="다른 모듈">
            ${prev ? `<a href="${C.base}/${prev.id}"><span class="m">이전 장</span>${prev.no} ${esc(prev.title)}</a>` : "<span></span>"}
            ${next ? `<a href="${C.base}/${next.id}" class="r"><span class="m">다음 장</span>${next.no} ${esc(next.title)}</a>` : ""}
          </nav>
        </div>
        ${nextBar({ href: now.href, label: now.label, sub: now.sub })}`;
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

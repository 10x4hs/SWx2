// 개발 흐름 홈 — 3D 흐름 고리(12주 정거장) · 지금 정거장 · 오늘 · 학습 설계 · 현황판 · 두런의 12장면 · 12모듈
import { esc } from "../util.js";
import { index, state, minutes, setMinutes, MINUTES, split, steps, cardsPerDay, nextCards, position, progressOf, loopProgress, metrics, kday, WHY, topbar } from "./data.js";
import { mountLoop } from "./loop3d.js";

const COLORS = ["#FFE14D", "rgba(255,225,77,.55)", "#EEEFF1", "rgba(238,239,241,.5)", "rgba(238,239,241,.26)"];

export function mountHome(host, ctx) {
  let alive = true, loop = null, hover = -1, pick = -1, idx = null, st = null, mins = minutes(), lostTries = 0;
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    [idx, st] = await Promise.all([index(), state()]);
    if (!alive) return;
    draw();
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">불러오지 못했어요. 새로 고침해 주세요. ${esc(e?.message || "")}</p>`; });

  const stateOf = (i, pos) => (progressOf(idx.modules[i], st).ratio >= 0.999 ? "done" : i === pos.i ? "now" : i < pos.i ? "done" : "next");

  function hud(pos) {
    const i = hover >= 0 ? hover : pick >= 0 ? pick : pos.i, m = idx.modules[i], p = progressOf(m, st), s = stateOf(i, pos);
    const label = hover >= 0 ? "가리킨 정거장" : i === pos.i ? "지금 정거장" : "고른 정거장";
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span class="m">${label}</span><span class="m"${s !== "next" ? ' style="color:var(--dv-acc)"' : ""}>${s === "done" ? "끝냄" : s === "now" ? "진행 중" : "아직"}</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;margin-top:14px"><span class="dv-hud-no">${m.no}</span><h3 style="font-size:22px">${esc(m.title)}</h3></div>
      <p class="kr" style="font-size:16px;line-height:1.6;margin:12px 0 0">“${esc(m.q)}”</p>
      <dl class="dv-kv"><dt>이번 주 문서</dt><dd>${esc(m.doc)}</dd><dt>배우는 것</dt><dd>${esc(m.sub)}</dd><dt>진도</dt><dd>카드 ${p.cards}/${p.nCards} · 사례 ${p.cases}/${p.nCases} · 회의실 ${p.probs}/${p.nProbs}</dd></dl>
      <a class="dv-btn ghost" style="margin-top:16px" href="#/dev/${m.id}">이 주 열기</a>`;
  }

  // 오늘 · 현황판: 하루 시간을 바꾸면 이 두 칸만 다시 그려요 (3D 고리는 그대로 둬요)
  function todaySec() {
    const M = metrics(idx, st, mins), S = split(mins), N = cardsPerDay(mins), plan = steps(mins), fresh = nextCards(idx, st, N), due = (st.due || []).length;
    return `<section class="dv-wrap dv-sec" id="dv-today-sec" aria-labelledby="dv-today-h">
        <div class="dv-sec-h"><div><div class="m">오늘 · ${kday(M.today)}</div><h2 id="dv-today-h">오늘은 ${mins}분, 새 카드 ${N}장${due ? ` · 복습 ${due}장` : ""}</h2></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap" role="group" aria-label="하루 공부 시간">${MINUTES.map((n) => `<button class="dv-chip${n === mins ? " on" : ""}" data-min="${n}" aria-pressed="${n === mins}">${n}분</button>`).join("")}</div></div>
        <div class="dv-grid">
          <div class="dv-panel"><div class="m">하루 순서</div>
            <div class="dv-bar" aria-hidden="true">${S.map((n, i) => `<div style="flex:${n} 1 0%;background:${COLORS[i]}"></div>`).join("")}</div>
            <ol class="dv-plan">${plan.map((p, i) => `<li><span class="m" style="padding-top:3px">0${i + 1}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.why)} <span class="dim">(${esc(p.src)})</span></p></div><span style="justify-self:end;font:600 16px var(--dv-lat)">${S[i]}분</span></li>`).join("")}</ol>
          </div>
          <div class="dv-panel" style="display:flex;flex-direction:column;gap:14px"><div class="m">오늘 볼 카드</div>
            <div>${fresh.length ? fresh.map((x) => `<a class="dv-row" href="#/dev/${x.module.id}/${x.card.id}"><span class="m acc">${x.module.no}-${x.card.id.slice(1)}</span><span style="font-size:16px;line-height:1.5">${esc(x.card.title)}</span><span class="m">새 카드</span></a>`).join("") : `<p class="kr dim">카드를 모두 읽었어요. 마지막 과제로 가요.</p>`}</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="dv-btn" href="#/dev/today">${mins}분 시작</a><a class="dv-btn ghost" href="#/dev/ask">AI에게 묻기</a></div></div>
        </div>
      </section>`;
  }
  function dashSec(pos) {
    const M = metrics(idx, st, mins), cur = idx.modules[pos.i];
    return `<section class="dv-wrap dv-sec" id="dv-dash-sec" aria-labelledby="dv-dash-h">
        <div class="dv-sec-h"><div><div class="m">현황판</div><h2 id="dv-dash-h">${M.got.cards ? `${cur.no}주차 · 전체 ${Math.round(M.ratio * 100)}%` : "첫 카드부터 시작해요"}</h2></div></div>
        <div class="dv-grid">
          <div class="dv-panel" style="display:flex;align-items:center;gap:22px;min-height:180px">
            <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="전체 진도 ${Math.round(M.ratio * 100)}%"><circle cx="64" cy="64" r="54" fill="none" stroke="rgba(205,207,212,.14)" stroke-width="10"/><circle cx="64" cy="64" r="54" fill="none" stroke="#FFE14D" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(339.3 * M.ratio).toFixed(1)} 339.3" transform="rotate(-90 64 64)"/><text x="64" y="71" text-anchor="middle" fill="#EEEFF1" style="font:600 26px Geist,sans-serif">${Math.round(M.ratio * 100)}%</text></svg>
            <div style="display:flex;flex-direction:column;gap:6px"><span class="dv-big" style="font-size:30px">${M.got.cards}<span class="dim" style="font-size:18px"> / ${M.tot.cards}</span></span><span class="kr dim" style="font-size:14px">카드 · 사례 ${M.got.cases}/${M.tot.cases} · 회의실 ${M.got.probs}/${M.tot.probs}</span></div></div>
          <div class="dv-panel"><div class="m">12주 · 지나온 길</div><div class="dv-weeks" style="margin-top:16px">${M.per.map((p, i) => `<div title="${i + 1}주 ${esc(idx.modules[i].title)} ${Math.round(p.ratio * 100)}%" style="background:linear-gradient(to top,#FFE14D ${Math.round(p.ratio * 100)}%,rgba(205,207,212,.1) ${Math.round(p.ratio * 100)}%)"></div>`).join("")}</div>
            <div style="display:flex;justify-content:space-between;margin-top:10px" class="m"><span>1주</span><span>12주</span></div></div>
          <div class="dv-panel"><div class="m">복습 예보 · 앞으로 7일</div><div class="dv-fore" style="margin-top:12px">${M.fc.map((d, i) => `<div><span style="font-size:13px">${d.n}</span><i style="height:${4 + Math.min(70, d.n * 7)}px"></i><span class="m">${i ? "일월화수목금토"[new Date(d.day + "T00:00:00Z").getUTCDay()] : "오늘"}</span></div>`).join("")}</div></div>
          <div class="dv-panel"><div class="m">떠올리기 · 회의실 정답률</div><span class="dv-big" style="display:block;margin-top:14px">${M.acc == null ? "—" : Math.round(M.acc * 100) + "%"}</span><p class="kr dim" style="font-size:14px;line-height:1.6;margin:10px 0 0">${M.asked ? `지금까지 ${M.asked}문항 · 틀린 카드는 복습에 먼저 나와요.` : "카드 퀴즈와 회의실 문제를 풀면 여기에 쌓여요."}</p></div>
          <div class="dv-panel"><div class="m">끝나는 날 · 예상</div><span class="dv-big" style="display:block;margin-top:14px">${kday(M.finish)}</span><p class="kr dim" style="font-size:14px;line-height:1.6;margin:10px 0 0">하루 ${mins}분, 주 5일 기준 · 남은 카드 ${M.left}장${M.streak ? ` · 연속 ${M.streak}일` : ""}</p></div>
        </div>
      </section>`;
  }
  function bindChips(pos) {
    host.querySelectorAll("[data-min]").forEach((b) => b.addEventListener("click", () => {
      mins = Number(b.dataset.min); setMinutes(mins);
      host.querySelector("#dv-today-sec").outerHTML = todaySec();
      host.querySelector("#dv-dash-sec").outerHTML = dashSec(pos);
      const cta = host.querySelector("#dv-cta"); if (cta) cta.textContent = `오늘 공부 · ${mins}분`;
      bindChips(pos);
    }));
  }

  function draw() {
    const pos = position(idx, st), cur = idx.modules[pos.i];
    host.innerHTML = `${topbar("")}
      <section class="dv-hero" aria-label="12주 흐름 지도">
        <div class="dv-lede"><div class="dv-lede-col">
          <div class="dv-disp">Dev flow</div>
          <h1 style="margin-top:14px">software</h1>
          <p class="dv-sub">코드는 짜지 않아요. 아이디어가 문서가 되고, 화면과 서버가 되고, 고객에게 닿고, 고장 나고, 다시 좋아지는 흐름을 12주 동안 따라가요.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:26px"><a class="dv-btn" id="dv-cta" href="#/dev/today">오늘 공부 · ${mins}분</a><a class="dv-btn ghost" href="#/dev/${cur.id}">${cur.no}주차 이어서</a></div>
          <div class="dv-hud" id="dv-hud">${hud(pos)}</div>
        </div></div>
        <div class="dv-stage">
          <canvas id="dv-canvas" aria-hidden="true"></canvas>
          <div class="dv-lobe m" data-lobe="0">만들기 전 · 01–06</div><div class="dv-lobe m" data-lobe="1">만들고 운영 · 07–12</div>
          ${idx.modules.map((m, i) => `<button class="dv-st ${stateOf(i, pos)}" data-st="${i}" aria-label="${m.no} ${esc(m.title)} 열기"><b>${m.no}</b><span>${esc(m.short)}</span></button>`).join("")}
          <div class="dv-legend m"><span><i class="dv-dot" style="background:var(--dv-acc)"></i>끝냄</span><span><i class="dv-dot" style="box-shadow:inset 0 0 0 2px #fff"></i>지금</span><span><i class="dv-dot" style="box-shadow:inset 0 0 0 1.5px #777"></i>아직</span><span>마우스를 대면 흩어져요 · 끌어서 둘러보기</span></div>
        </div>
      </section>

      ${todaySec()}

      <section class="dv-wrap dv-sec" aria-labelledby="dv-why-h">
        <div class="dv-sec-h"><div><div class="m">학습 설계 · 뇌과학 · 인지심리학</div><h2 id="dv-why-h">Why</h2><p>화면의 순서와 장치는 학습 연구에서 효과가 확인된 방법으로 짰어요. 장치마다 한 줄 근거를 붙여 둬요.</p></div></div>
        <div class="dv-grid dv-why">${WHY.map(([t, d, s]) => `<div class="dv-panel"><h3>${esc(t)}</h3><p>${esc(d)}</p><p class="src">${esc(s)}</p></div>`).join("")}</div>
      </section>

      ${dashSec(pos)}

      <section class="dv-wrap dv-sec" aria-labelledby="dv-story-h">
        <div class="dv-sec-h"><div><div class="m">가상 회사 · 두런</div><h2 id="dv-story-h">3명에서 50명까지, 한 회사의 12장면</h2><p>회의 · 강의 녹음을 AI가 요약하고 할 일을 뽑아 주는 스타트업이에요. 주마다 이 회사가 겪는 일을 먼저 읽고, 그 일을 풀어 주는 카드를 공부해요.</p></div></div>
        <div class="dv-story">${idx.modules.map((m, i) => `<a class="dv-panel dv-ev${i === pos.i ? " now" : ""}" href="#/dev/${m.id}"><div style="display:flex;justify-content:space-between"><span class="m acc">W${m.no}</span><span class="m">직원 ${m.story.size}명</span></div><h3>${esc(m.story.title)}</h3><p>${esc(m.q)}</p><span class="dv-tag" style="align-self:flex-start;margin-top:auto">${esc(m.doc)}</span></a>`).join("")}</div>
      </section>

      <section class="dv-wrap dv-sec" aria-labelledby="dv-mods-h">
        <div class="dv-sec-h"><div><div class="m">12개 모듈 · 주마다 질문 하나</div><h2 id="dv-mods-h">대표가 회의에서 듣게 될 12가지 질문</h2></div></div>
        <div class="dv-mods">${idx.modules.map((m, i) => { const s = stateOf(i, pos), p = progressOf(m, st); return `<a class="dv-mod" data-mod="${i}" href="#/dev/${m.id}"><span class="m acc" style="font-size:13px">${m.no}</span><span class="kr" style="font-weight:600;font-size:18px">${esc(m.title)}</span><span class="q">“${esc(m.q)}”</span><span class="kr" style="font-size:14px;color:var(--dv-ink2)">${esc(m.doc)}</span><span class="m" style="justify-self:end${s !== "next" ? ";color:var(--dv-acc)" : ""}">${s === "done" ? "끝" : s === "now" ? `진행 ${Math.round(p.ratio * 100)}%` : "아직"}</span></a>`; }).join("")}</div>
      </section>

      <footer class="dv-wrap dv-sec dv-grid">
        <div class="dv-panel"><div class="m">자료 원칙</div><h3 style="margin-top:12px">표준 · 공식 문서 · 원저자 · 공식 장애 보고서만 써요</h3><p class="kr dim" style="font-size:15px;line-height:1.7">IETF RFC, ISO/IEEE 표준, Google SRE 책, Scrum Guide, 정부 조사 결과 같은 원문을 먼저 봐요. 카드마다 출처와 날짜를 붙였어요.</p></div>
        <div class="dv-panel"><div class="m">마지막 과제 · 12주차</div><h3 style="margin-top:12px">내 서비스의 PRD · ERD · 구조도 한 장 · 출시 계획</h3><p class="kr dim" style="font-size:15px;line-height:1.7">12주 동안 두런의 문서를 읽었다면, 마지막 주에는 내 서비스로 같은 문서를 써요. AI는 고쳐 주지 않고 질문만 해요.</p></div>
      </footer>`;

    bindChips(pos);
    const setHover = (i) => { hover = i; host.querySelector("#dv-hud").innerHTML = hud(pos); host.querySelectorAll("[data-st]").forEach((b) => b.classList.toggle("on", Number(b.dataset.st) === (hover >= 0 ? hover : pick))); host.querySelectorAll("[data-mod]").forEach((r) => r.classList.toggle("on", Number(r.dataset.mod) === hover)); };
    host.querySelectorAll("[data-st]").forEach((b) => {
      const i = Number(b.dataset.st);
      b.addEventListener("mouseenter", () => { setHover(i); loop?.highlight(i); });
      b.addEventListener("focus", () => { setHover(i); loop?.highlight(i); });
      b.addEventListener("mouseleave", () => { setHover(-1); loop?.highlight(-1); });
      b.addEventListener("blur", () => { setHover(-1); loop?.highlight(-1); });
      b.addEventListener("click", () => { location.hash = "#/dev/" + idx.modules[i].id; }); // 이름표를 누르면 바로 그 주로
    });
    host.querySelectorAll("[data-mod]").forEach((r) => { const i = Number(r.dataset.mod); r.addEventListener("mouseenter", () => { setHover(i); loop?.highlight(i); }); r.addEventListener("mouseleave", () => { setHover(-1); loop?.highlight(-1); }); });
    mount3d(pos, setHover);
  }

  // 3D 고리 붙이기. 브라우저가 그래픽 문맥(WebGL)을 잃고 되살리지 않으면 새 캔버스로 다시 붙여요 (최대 3번)
  function mount3d(pos, setHover) {
    let canvas = host.querySelector("#dv-canvas");
    if (!canvas) return;
    if (lostTries) { const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh); canvas = fresh; }
    mountLoop(canvas, {
      stations: idx.modules.map((m, i) => ({ no: m.no, state: stateOf(i, pos) })),
      progress: loopProgress(idx, st),
      labels: [...host.querySelectorAll("[data-st]")], lobes: [...host.querySelectorAll("[data-lobe]")],
      onHover: (i) => setHover(i), onPick: (i) => { location.hash = "#/dev/" + idx.modules[i].id; },
      onLost: () => { if (!alive || lostTries >= 3) return; lostTries++; loop?.destroy(); loop = null; mount3d(pos, setHover); },
    }).then((l) => { if (!alive || !canvas.isConnected) { l?.destroy(); return; } loop = l; if (!l) host.querySelectorAll("[data-st],[data-lobe]").forEach((e) => (e.style.display = "none")); });
  }
  return () => { alive = false; loop?.destroy(); loop = null; };
}

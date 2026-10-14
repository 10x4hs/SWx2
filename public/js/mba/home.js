// 경영 마이크로디그리 — 홈: 모듈 지도(WebGL) · 오늘 카드 · 하루 순서 · 복습 간격 · 12개 모듈
import { $, $$, esc } from "../util.js";
import { index, state, minutes, setMinutes, STEPS, split, nextCard, progressOf } from "./data.js";
import { mountMap } from "./map.js";

export const NAV = (cur) => `<nav class="mb-nav" aria-label="경영 마이크로디그리">${[["map", "#/mba", "모듈 지도"], ["today", "#/mba/today", "오늘"], ["company", "#/mba/company", "회사 세우기"], ["words", "#/mba/words", "용어"]]
  .map(([k, h, t]) => `<a class="mb-pill ${k === cur ? "on" : ""}" href="${h}"${k === cur ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;

// 복습 간격 그림 (모양만 보여주는 정적 그림)
const SPACING = `<svg class="mbc" viewBox="0 0 1200 360" role="img" aria-label="복습할 때마다 기억 곡선이 다시 올라가고 다음 하락이 완만해지는 그림. 복습 시점은 1, 3, 7, 21, 60일">
  <g class="k-gd"><line x1="60" y1="40" x2="1180" y2="40"/><line x1="60" y1="130" x2="1180" y2="130"/><line x1="60" y1="220" x2="1180" y2="220"/><line x1="60" y1="310" x2="1180" y2="310"/></g>
  <path class="k-iso" d="M60 40 C 100 120, 120 200, 1180 300"/>
  <path class="k-acc-line" fill="none" d="M60 40 C 80 90, 100 120, 130 132 L130 44 C 170 80, 200 104, 250 112 L250 46 C 320 72, 380 88, 430 94 L430 48 C 560 66, 700 76, 780 80 L780 50 C 940 60, 1080 66, 1180 70"/>
  <circle class="k-dot" cx="130" cy="44" r="5"/><circle class="k-dot" cx="250" cy="46" r="5"/><circle class="k-dot" cx="430" cy="48" r="5"/><circle class="k-dot" cx="780" cy="50" r="5"/>
  <g class="k-tk"><text x="60" y="340">0</text><text x="118" y="340">1일</text><text x="238" y="340">3일</text><text x="418" y="340">7일</text><text x="764" y="340">21일</text><text x="1140" y="340">60일</text></g>
  <text class="k-lb dim" x="980" y="292">복습 안 하면</text><text class="k-al" x="64" y="28">기억</text></svg>`;

export function mountHome(host, ctx) {
  let alive = true, stopMap = null, mins = minutes();
  host.innerHTML = `<div class="mb-home"><section class="mb-hero"><p class="mb-loading">불러오는 중…</p></section></div>`;
  (async () => {
    const [idx, st] = await Promise.all([index(), state()]);
    if (!alive) return;
    const mods = idx.modules, nx = nextCard(idx, st), due = st.due || [];
    const week = (st.days || []).filter((d) => d.minutes > 0 && d.day >= addDay(st.today, -6)).length;
    const tiles = mods.map((m) => { const p = progressOf(m, st); return { no: m.no, title: m.title, sub: m.sub, phase: m.phase, progress: p.total ? p.read / p.total : 0 }; });
    const picked = (i) => {
      const m = mods[i], p = progressOf(m, st), box = $("#mb-pick", host);
      box.hidden = false;
      box.innerHTML = `<div class="mb-pick-top"><span class="mb-mono acc">MODULE ${esc(m.no)}</span><span class="mb-k dim">${esc(m.phase)}</span></div>
        <h2>${esc(m.title)}</h2><p>${esc(m.what || m.sub)}</p>
        <div class="mb-pick-foot"><span class="mb-k dim">카드 ${p.read}/${p.total} · 9개교 중 필수 ${esc(m.schools)}</span><a class="mb-btn" href="#/mba/${esc(m.id)}">열기</a></div>`;
    };
    const stepsHtml = () => { const s = split(mins); return STEPS.map((x, i) => `<li><span class="mb-mono dim">0${i + 1}</span><div><b>${x.name}</b><p>${x.why}</p><span class="mb-src">${x.src}</span></div><span class="mb-min">${s[i]}<small>분</small></span></li>`).join(""); };
    const bar = () => { const s = split(mins), tones = ["acc", "acc2", "ink", "mid", "low"]; return s.map((v, i) => `<i class="${tones[i]}" style="flex:${v}"></i>`).join(""); };
    const chips = () => [15, 25, 40].map((v) => `<button type="button" class="mb-chip ${v === mins ? "on" : ""}" data-min="${v}" aria-pressed="${v === mins}">${v}분</button>`).join("");
    host.innerHTML = `<div class="mb-home">
      <section class="mb-hero" aria-label="12개 모듈 지도 — 끌어서 둘러보고 눌러서 골라요">
        <canvas class="mb-map" id="mb-map" aria-hidden="true"></canvas>
        <div class="mb-vign" aria-hidden="true"></div>
        <div class="mb-fallback" id="mb-fallback" hidden><ul>${mods.map((m) => `<li><a href="#/mba/${esc(m.id)}"><span class="mb-mono dim">${esc(m.no)}</span><b>${esc(m.title)}</b><span>${esc(m.sub)}</span></a></li>`).join("")}</ul></div>
        <div class="mb-hud top">
          <div class="mb-brand"><svg width="32" height="32" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" stroke="currentColor" stroke-width="1.5"/><path d="M9 23V11l8 7 8-7v12" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><div><span class="mb-mono dim">MICRO DEGREE</span><b>경영</b></div></div>
          <p class="mb-state">MBA 9개교가 공통으로 가르치는 것만 골랐어요.<br>하루 ${mins}분, 12개 모듈.</p>
          <div class="mb-hud-r"><span class="mb-k dim">최근 7일 중 <b>${week}일</b></span><a class="mb-btn" href="#/mba/today">오늘 시작</a></div>
        </div>
        <div class="mb-pick" id="mb-pick" hidden></div>
        <div class="mb-hud bottom">
          <span class="mb-k dim mb-hint">끌어서 둘러보기 · 눌러서 고르기</span>
          ${NAV("map")}
          <div class="mb-today">
            <div class="mb-today-top"><span class="mb-mono">TODAY</span><span class="mb-k">${due.length ? `복습 ${due.length}장` : "복습 없음"}</span></div>
            <div class="mb-today-min" id="mb-tmin">${mins}<small>분</small></div>
            <div class="mb-today-bar" id="mb-tbar" aria-hidden="true">${bar()}</div>
            <div class="mb-today-next">${nx ? `다음 · <a href="#/mba/${esc(nx.module.id)}/${esc(nx.card.id)}">${esc(nx.card.title)}</a>` : "모든 카드를 읽었어요 — 복습만 남았어요"}</div>
            <div class="mb-chips" role="group" aria-label="하루 공부 시간">${chips()}</div>
          </div>
        </div>
      </section>

      <section class="mb-sec mb-proto">
        <div class="mb-sec-l"><span class="mb-mono dim">01 — DAILY PROTOCOL</span><h2>하루 <span id="mb-pmin">${mins}</span>분,<br>순서가 전부예요.</h2>
          <p>읽기 전에 먼저 꺼내 보고, 어제 것을 다시 꺼내고, 그다음에 새 개념 하나만. 학습과학에서 근거가 가장 단단한 두 가지(인출 · 간격)를 하루 안에 넣은 순서예요.</p></div>
        <div class="mb-sec-r"><ol class="mb-steps" id="mb-steps">${stepsHtml()}</ol>
          <p class="mb-foot">분 배분 비율 자체를 검증한 연구는 없어요. 순서와 구성은 근거, 숫자는 제안이에요.</p></div>
      </section>

      <section class="mb-sec mb-space">
        <div class="mb-sec-head"><div><span class="mb-mono dim">02 — SPACING</span><h2>잊을 때쯤, 다시 꺼내기</h2></div>
          <p>복습할 때마다 곡선이 덜 가팔라져요. 간격은 기억하고 싶은 기간에 맞춰 늘려요. 너무 이른 복습의 손해가 늦은 복습보다 커요.</p></div>
        <figure class="mb-fig">${SPACING}<figcaption>모양을 보여주는 그림이에요(실측 곡선 아님). 1 · 3 · 7 · 21 · 60일은 Cepeda 2008의 ‘목표 기간 대비 간격 비율’에 맞춘 제안이에요.</figcaption></figure>
      </section>

      <section class="mb-sec mb-curr">
        <div class="mb-sec-head"><div><span class="mb-mono dim">03 — CURRICULUM</span><h2>12개 모듈, 이 순서로</h2></div>
          <p>도구 → 기능 → 통합 → 실행. INSEAD · Yale · HBS가 필수 과목을 배치하는 순서를 따랐어요.</p></div>
        <div class="mb-tw"><table class="mb-table"><thead><tr><th scope="col">No.</th><th scope="col">모듈</th><th scope="col">핵심</th><th scope="col">단계</th><th scope="col">진도</th><th scope="col">9개교 중 필수</th></tr></thead>
          <tbody>${mods.map((m) => { const p = progressOf(m, st); return `<tr><td class="mb-mono dim">${esc(m.no)}</td><td><a href="#/mba/${esc(m.id)}"><b>${esc(m.title)}</b></a></td><td class="dim">${esc(m.sub)}</td><td class="mb-k dim">${esc(m.phase)}</td><td><span class="mb-prog"><i style="width:${p.total ? Math.round(p.read / p.total * 100) : 0}%"></i></span><span class="mb-mono dim">${p.read}/${p.total}</span></td><td class="mb-mono ${/^9\/9/.test(m.schools) ? "acc" : "dim"}">${esc(m.schools)}</td></tr>`; }).join("")}</tbody></table></div>
        <p class="mb-foot">확인한 9개교: HBS · Stanford · Wharton · MIT Sloan · INSEAD · Booth · Columbia · LBS · Yale (2025-26 공식 커리큘럼 기준, Columbia 일부 2차 출처). 입문 수준의 지도예요. 케이스 토론 · 동기 · 네트워크는 혼자 대체하기 어려워요.</p>
      </section>

      <section class="mb-sec mb-more">
        <a class="mb-tile" href="#/mba/company"><span class="mb-lbl"><span class="mb-mono">KOREA</span>주식회사</span><b>회사 세우기, 열두 칸</b><span>기관 · 서류 · 비용 · 기한 · 법 조문, 설립 세금 계산기</span></a>
        <a class="mb-tile" href="#/mba/words"><span class="mb-mono dim">GLOSSARY</span><b>용어 · 프레임워크 · 스킬</b><span>경영 · 경제 용어, 헷갈리는 쌍, 15분 연습</span></a>
      </section>
    </div>`;
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-min]"); if (!b) return;
      mins = Number(b.dataset.min); setMinutes(mins);
      $$("[data-min]", host).forEach((x) => { const on = Number(x.dataset.min) === mins; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
      $("#mb-tmin", host).innerHTML = `${mins}<small>분</small>`; $("#mb-tbar", host).innerHTML = bar(); $("#mb-pmin", host).textContent = mins; $("#mb-steps", host).innerHTML = stepsHtml();
      const s = $(".mb-state", host); if (s) s.innerHTML = `MBA 9개교가 공통으로 가르치는 것만 골랐어요.<br>하루 ${mins}분, 12개 모듈.`;
    });
    stopMap = await mountMap($("#mb-map", host), tiles, picked);
    if (!alive) { stopMap?.(); return; }
    if (!stopMap) { $("#mb-map", host).hidden = true; $("#mb-fallback", host).hidden = false; host.querySelector(".mb-hero").classList.add("flat"); }
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">경영 마이크로디그리를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; stopMap?.(); };
}
function addDay(d, n) { if (!d) return ""; return new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }

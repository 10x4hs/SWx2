// 경영 마이크로디그리 — 홈: 모듈 지도(WebGL) · 내 학습 현황판 · 하루 순서 · 복습 간격 · 12개 모듈 (24주)
import { $, $$, esc } from "../util.js";
import { index, state, minutes, setMinutes, MINUTES, steps, split, nextCard, progressOf, position, metrics, reviewLimit, cardsPerDay } from "./data.js";
import { mountMap } from "./map.js";
import { hm, weeksOf } from "./ui.js";

export const NAV = (cur) => `<nav class="mb-nav" aria-label="경영 마이크로디그리">${[["map", "#/mba", "모듈 지도"], ["today", "#/mba/today", "오늘"], ["company", "#/mba/company", "회사 세우기"], ["words", "#/mba/words", "용어"]]
  .map(([k, h, t]) => `<a class="mb-pill ${k === cur ? "on" : ""}" href="${h}"${k === cur ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;

const DOW = "일월화수목금토", dow = (d) => DOW[new Date(d + "T00:00:00Z").getUTCDay()];
const kdate = (d, today) => { const [y, m, dd] = d.split("-").map(Number); return `${String(y) !== today.slice(0, 4) ? y + "년 " : ""}${m}월 ${dd}일`; };
const pct = (x) => Math.round(x * 100);

// 복습 간격 그림 (모양만 보여주는 정적 그림)
const SPACING = `<svg class="mbc" viewBox="0 0 1200 360" role="img" aria-label="복습할 때마다 기억 곡선이 다시 올라가고 다음 하락이 완만해지는 그림. 복습 시점은 1, 3, 7, 21, 60일">
  <g class="k-gd"><line x1="60" y1="40" x2="1180" y2="40"/><line x1="60" y1="130" x2="1180" y2="130"/><line x1="60" y1="220" x2="1180" y2="220"/><line x1="60" y1="310" x2="1180" y2="310"/></g>
  <path class="k-iso" d="M60 40 C 100 120, 120 200, 1180 300"/>
  <path class="k-acc-line" fill="none" d="M60 40 C 80 90, 100 120, 130 132 L130 44 C 170 80, 200 104, 250 112 L250 46 C 320 72, 380 88, 430 94 L430 48 C 560 66, 700 76, 780 80 L780 50 C 940 60, 1080 66, 1180 70"/>
  <circle class="k-dot" cx="130" cy="44" r="5"/><circle class="k-dot" cx="250" cy="46" r="5"/><circle class="k-dot" cx="430" cy="48" r="5"/><circle class="k-dot" cx="780" cy="50" r="5"/>
  <g class="k-tk"><text x="60" y="340">0</text><text x="118" y="340">1일</text><text x="238" y="340">3일</text><text x="418" y="340">7일</text><text x="764" y="340">21일</text><text x="1140" y="340">60일</text></g>
  <text class="k-lb dim" x="980" y="292">복습 안 하면</text><text class="k-al" x="64" y="28">기억</text></svg>`;

// ---------- 내 학습 현황판 (전부 멈춰 있는 그림) ----------
function ring(r) {
  const C = 2 * Math.PI * 52, v = Math.max(0, Math.min(1, r));
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="mbd-tr"/>${v > 0 ? `<circle cx="60" cy="60" r="52" class="mbd-pr" stroke-dasharray="${(C * v).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>` : ""}</svg>`;
}
function bars(list, max, goal) {
  if (list.some((b) => b.top != null)) max *= 1.3; // 막대 위 숫자 자리
  return `<div class="mbd-plot"${goal != null ? ` style="--goal:${(goal / max * 100).toFixed(1)}%"` : ""}>${list.map((b) => `<div class="mbd-col${b.now ? " now" : ""}" title="${esc(b.title)}">${b.top != null ? `<span>${b.top}</span>` : ""}<i style="height:${(b.v / max * 100).toFixed(1)}%"></i></div>`).join("")}${goal != null ? `<em class="mbd-goal" aria-hidden="true"></em>` : ""}</div>
    <div class="mbd-x">${list.map((b) => `<span class="${b.now ? "now" : ""}">${b.x}</span>`).join("")}</div>`;
}
export function dashHtml(idx, st, mins) {
  const M = metrics(idx, st, mins), pos = position(idx, st), cur = pos.module;
  const wmax = Math.max(mins, ...M.week.map((d) => d.min)), fmax = Math.max(4, ...M.fc.map((d) => d.n));
  const lvl = (v) => (v < 0 ? "f" : !v ? "l0" : v < mins / 3 ? "l1" : v < mins * 2 / 3 ? "l2" : v < mins ? "l3" : "l4");
  const cnt = [["카드", M.got.cards, M.tot.cards], ["케이스", M.got.cases, M.tot.cases], ["연습문제", M.got.probs, M.tot.probs], ["강의 (선택)", M.got.lecs, M.tot.lecs]];
  return `
    <div class="mbd mbd-ring">
      <span class="mb-lbl">전체 진도</span>
      <div class="mbd-ringbox">${ring(M.ratio)}<b>${pct(M.ratio)}<small>%</small></b></div>
      <dl class="mbd-cnt">${cnt.map(([k, a, b]) => `<div><dt>${k}</dt><dd>${a}<small>/${b}</small></dd></div>`).join("")}</dl>
      <a class="mbd-now" href="#/mba/${esc(cur.id)}">${pos.done ? "모든 카드를 읽었어요 — 복습과 캡스톤만 남았어요" : `지금 <b>${esc(cur.no)} ${esc(cur.title)}</b> · 10일 중 ${pos.day}일차`}</a>
    </div>
    <div class="mbd mbd-week">
      <span class="mb-lbl">이번 주 공부</span>
      <p class="mbd-big">${M.weekMin}<small>분 / 목표 ${M.goal}분 (주 5일)</small></p>
      ${bars(M.week.map((d) => ({ v: d.min, x: dow(d.day), now: d.day === M.today, title: `${d.day} · ${d.min}분` })), wmax, mins)}
      <p class="mbd-note">가로선 = 하루 목표 ${mins}분 · 끝낸 카드 · 케이스 · 문제의 시간이 쌓여요</p>
    </div>
    <div class="mbd mbd-fc">
      <span class="mb-lbl">복습 예보</span>
      <p class="mbd-big">${M.fc[0].n}<small>장 오늘${M.fc[0].n > reviewLimit(mins) ? ` · 하루 ${reviewLimit(mins)}장까지` : ""}</small></p>
      ${bars(M.fc.map((d, i) => ({ v: d.n, top: d.n || "", x: i === 0 ? "오늘" : i === 1 ? "내일" : dow(d.day), now: i === 0, title: `${d.day} · ${d.n}장` })), fmax)}
      <p class="mbd-note">오늘 칸에는 밀린 카드도 들어 있어요</p>
    </div>
    <div class="mbd mbd-fin">
      <div><span class="mb-lbl">다 끝나는 날 (예상)</span>
        <p class="mbd-big">${M.finish ? kdate(M.finish, M.today) : "—"}</p>
        <p class="mbd-note">${M.left ? `남은 카드 ${M.left}장 · 하루 ${M.pace.toFixed(1)}장 ${M.paceFrom === "recent" ? "(최근 14일 평균)" : `(계획: 주 5일 × ${cardsPerDay(mins)}장)`}` : "모든 카드를 읽었어요"}</p></div>
      <div><span class="mb-lbl">정답률</span>
        <p class="mbd-big">${M.acc == null ? "—" : `${pct(M.acc)}<small>%</small>`}</p>
        <p class="mbd-note">${M.asked ? `퀴즈 · 연습문제 ${M.asked}개 (마지막 시도 기준)` : "아직 푼 문제가 없어요"}</p></div>
    </div>
    <div class="mbd mbd-heat">
      <div class="mbd-h"><span class="mb-lbl">24주 기록</span><span class="mb-k dim">공부한 날 <b>${M.studiedDays}</b>일 · 연속 <b>${M.streak}</b>일</span></div>
      <div class="mbd-grid" role="img" aria-label="최근 24주 동안 공부한 날 ${M.studiedDays}일, 연속 ${M.streak}일">${M.heat.map((h) => `<i class="${lvl(h.min)}"${h.min >= 0 ? ` title="${h.day} · ${h.min}분"` : ""}></i>`).join("")}</div>
      <div class="mbd-leg"><span>24주 전</span><span class="mbd-sc">적게 <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> 목표 ${mins}분 이상</span><span>이번 주</span></div>
      <div class="mbd-wk"><div class="mbd-h"><span class="mb-k dim">주마다 공부한 분</span><span class="mb-k dim">가로선 = 주 목표 ${M.goal}분</span></div>
        ${bars(M.weeks.map((v, i) => ({ v, x: i === 0 ? "24주 전" : i === 23 ? "이번 주" : "", now: i === 23, title: `${24 - i === 1 ? "이번 주" : `${24 - i - 1}주 전`} · ${v}분` })), Math.max(M.goal, ...M.weeks), M.goal)}</div>
    </div>
    <div class="mbd mbd-mods">
      <div class="mbd-h"><span class="mb-lbl">모듈 12개 · 24주</span><span class="mb-k dim">카드 · 케이스 · 문제를 합친 진도</span></div>
      <ol>${M.per.map(({ m, p }, i) => `<li class="${!pos.done && m.id === cur.id ? "now" : ""}"><a href="#/mba/${esc(m.id)}"><span class="mb-mono dim">${esc(m.no)}</span><b>${esc(m.title)}</b><span class="mb-k dim">${weeksOf(i)}</span><span class="mbd-mb"><i style="width:${pct(p.ratio)}%"></i></span><span class="mb-mono">${pct(p.ratio)}%</span></a></li>`).join("")}</ol>
    </div>`;
}

export function mountHome(host, ctx) {
  let alive = true, stopMap = null, mins = minutes();
  host.innerHTML = `<div class="mb-home"><section class="mb-hero"><p class="mb-loading">불러오는 중…</p></section></div>`;
  (async () => {
    const [idx, st] = await Promise.all([index(), state()]);
    if (!alive) return;
    const mods = idx.modules, nx = nextCard(idx, st), due = st.due || [];
    const week = (st.days || []).filter((d) => d.minutes > 0 && d.day >= addDay(st.today, -6)).length;
    const tiles = mods.map((m, i) => { const p = progressOf(m, st); return { id: m.id, no: m.no, title: m.title, sub: m.sub, phase: m.phase, weeks: weeksOf(i), progress: p.ratio, count: `카드 ${p.cards}/${p.total}` }; });
    const picked = (i) => {
      const m = mods[i], p = progressOf(m, st), box = $("#mb-pick", host);
      box.hidden = false;
      box.innerHTML = `<div class="mb-pick-top"><span class="mb-mono acc">MODULE ${esc(m.no)}</span><span class="mb-k dim">${esc(m.phase)} · ${weeksOf(i)}</span></div>
        <h2>${esc(m.title)}</h2><p>${esc(m.what || m.sub)}</p>
        <div class="mb-pick-prog"><span class="mb-prog big"><i style="width:${pct(p.ratio)}%"></i></span><span class="mb-mono">${pct(p.ratio)}%</span></div>
        <div class="mb-pick-foot"><span class="mb-k dim">카드 ${p.cards}/${p.total} · 케이스 ${p.cases}/${p.nCases} · 문제 ${p.probs}/${p.nProbs}</span><a class="mb-btn" href="#/mba/${esc(m.id)}">열기</a></div>`;
    };
    const stepsHtml = () => { const s = split(mins); return steps(mins).map((x, i) => `<li><span class="mb-mono dim">0${i + 1}</span><div><b>${x.name}</b><p>${x.why}</p><span class="mb-src">${x.src}</span></div><span class="mb-min">${s[i]}<small>분</small></span></li>`).join(""); };
    const bar = () => { const s = split(mins), tones = ["acc", "acc2", "ink", "mid", "low"]; return s.map((v, i) => `<i class="${tones[i]}" style="flex:${v}"></i>`).join(""); };
    const chips = () => MINUTES.map((v) => `<button type="button" class="mb-chip ${v === mins ? "on" : ""}" data-min="${v}" aria-pressed="${v === mins}">${v}분</button>`).join("");
    const stateTxt = () => `MBA 9개교가 공통으로 가르치는 것만 골랐어요.<br>하루 ${hm(mins)} · 24주 · 12개 모듈.`;
    const dueTxt = () => (due.length ? `복습 ${Math.min(due.length, reviewLimit(mins))}장` : "복습 없음");
    host.innerHTML = `<div class="mb-home">
      <section class="mb-hero" aria-label="12개 모듈 지도 — 끌어서 둘러보고 눌러서 골라요">
        <canvas class="mb-map" id="mb-map" aria-hidden="true"></canvas>
        <div class="mb-vign" aria-hidden="true"></div>
        <div class="mb-fallback" id="mb-fallback" hidden><ul>${mods.map((m, i) => `<li><a href="#/mba/${esc(m.id)}"><span class="mb-mono dim">${esc(m.no)} · ${weeksOf(i)}</span><b>${esc(m.title)}</b><span>${esc(m.sub)}</span><span class="mb-prog"><i style="width:${pct(tiles[i].progress)}%"></i></span></a></li>`).join("")}</ul></div>
        <div class="mb-hud top">
          <div class="mb-brand"><svg width="32" height="32" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" stroke="currentColor" stroke-width="1.5"/><path d="M9 23V11l8 7 8-7v12" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><div><span class="mb-mono dim">MICRO DEGREE</span><b>경영</b></div></div>
          <p class="mb-state" id="mb-state">${stateTxt()}</p>
          <div class="mb-hud-r"><span class="mb-k dim">최근 7일 중 <b>${week}일</b></span><a class="mb-btn" href="#/mba/today">오늘 시작</a></div>
        </div>
        <div class="mb-pick" id="mb-pick" hidden></div>
        <div class="mb-hud bottom">
          <span class="mb-k dim mb-hint">끌어서 둘러보기 · 눌러서 고르기</span>
          ${NAV("map")}
          <div class="mb-today">
            <div class="mb-today-top"><span class="mb-mono">TODAY</span><span class="mb-k" id="mb-tdue">${dueTxt()}</span></div>
            <div class="mb-today-min" id="mb-tmin">${mins}<small>분</small></div>
            <div class="mb-today-bar" id="mb-tbar" aria-hidden="true">${bar()}</div>
            <div class="mb-today-next">${nx ? `다음 · <a href="#/mba/${esc(nx.module.id)}/${esc(nx.card.id)}">${esc(nx.card.title)}</a>` : "모든 카드를 읽었어요 — 복습만 남았어요"}</div>
            <div class="mb-chips" role="group" aria-label="하루 공부 시간">${chips()}</div>
          </div>
        </div>
      </section>

      <section class="mb-sec mb-dashsec" aria-labelledby="mb-dash-h">
        <div class="mb-sec-head"><div><span class="mb-mono dim">00 — PROGRESS</span><h2 id="mb-dash-h">지금 어디쯤인지,<br>한 장으로</h2></div>
          <p>얼마나 왔는지, 이번 주에 얼마나 했는지, 내일 복습이 몇 장인지, 언제 끝나는지. 기록은 이 계정에만 남아요.</p></div>
        <div class="mbd-wrap" id="mb-dash">${dashHtml(idx, st, mins)}</div>
      </section>

      <section class="mb-sec mb-proto">
        <div class="mb-sec-l"><span class="mb-mono dim">01 — DAILY PROTOCOL</span><h2>하루 <span id="mb-pmin">${mins}</span>분,<br>순서가 전부예요.</h2>
          <p>읽기 전에 먼저 꺼내 보고, 지난 카드를 다시 꺼내고, 그다음에 새 카드. 마지막엔 케이스와 문제로 직접 써 봐요. 학습과학에서 근거가 가장 단단한 두 가지(인출 · 간격)를 하루 안에 넣은 순서예요.</p></div>
        <div class="mb-sec-r"><ol class="mb-steps" id="mb-steps">${stepsHtml()}</ol>
          <p class="mb-foot">분 배분 비율 자체를 검증한 연구는 없어요. 순서와 구성은 근거, 숫자는 제안이에요. 50분쯤마다 5분 쉬어요.</p></div>
      </section>

      <section class="mb-sec mb-space">
        <div class="mb-sec-head"><div><span class="mb-mono dim">02 — SPACING</span><h2>잊을 때쯤, 다시 꺼내기</h2></div>
          <p>복습할 때마다 곡선이 덜 가팔라져요. 간격은 기억하고 싶은 기간에 맞춰 늘려요. 너무 이른 복습의 손해가 늦은 복습보다 커요.</p></div>
        <figure class="mb-fig">${SPACING}<figcaption>모양을 보여주는 그림이에요(실측 곡선 아님). 1 · 3 · 7 · 21 · 60일은 Cepeda 2008의 ‘목표 기간 대비 간격 비율’에 맞춘 제안이에요.</figcaption></figure>
      </section>

      <section class="mb-sec mb-curr">
        <div class="mb-sec-head"><div><span class="mb-mono dim">03 — CURRICULUM</span><h2>24주, 12개 모듈</h2></div>
          <p>모듈마다 2주(공부하는 날 10일) · 카드 30장 · 케이스 2개 · 연습문제 약 20개. 도구 → 기능 → 통합 → 실행, INSEAD · Yale · HBS가 필수 과목을 배치하는 순서를 따랐어요.</p></div>
        <div class="mb-tw"><table class="mb-table"><thead><tr><th scope="col">No.</th><th scope="col">모듈</th><th scope="col">핵심</th><th scope="col">주</th><th scope="col">진도</th><th scope="col">9개교 중 필수</th></tr></thead>
          <tbody>${mods.map((m, i) => { const p = progressOf(m, st); return `<tr><td class="mb-mono dim">${esc(m.no)}</td><td><a href="#/mba/${esc(m.id)}"><b>${esc(m.title)}</b></a></td><td class="dim">${esc(m.sub)}</td><td class="mb-k dim">${weeksOf(i)}</td><td><span class="mb-prog"><i style="width:${pct(p.ratio)}%"></i></span><span class="mb-mono dim">${p.cards}/${p.total}</span></td><td class="mb-mono ${/^9\/9/.test(m.schools) ? "acc" : "dim"}">${esc(m.schools)}</td></tr>`; }).join("")}</tbody></table></div>
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
      $("#mb-state", host).innerHTML = stateTxt(); $("#mb-tdue", host).textContent = dueTxt(); $("#mb-dash", host).innerHTML = dashHtml(idx, st, mins);
    });
    stopMap = await mountMap($("#mb-map", host), tiles, picked);
    if (!alive) { stopMap?.(); return; }
    if (!stopMap) { $("#mb-map", host).hidden = true; $("#mb-fallback", host).hidden = false; host.querySelector(".mb-hero").classList.add("flat"); }
  })().catch((e) => { if (alive) host.innerHTML = `<p class="mb-err">경영 마이크로디그리를 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; stopMap?.(); };
}
function addDay(d, n) { if (!d) return ""; return new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }

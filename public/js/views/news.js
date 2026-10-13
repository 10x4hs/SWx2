// 뉴스 — 하루 한 호. 세 화면: 오늘(#/news · #/news/<YYYY-MM-DD>) · 세계(#/news/world) · 회사(#/news/co/<key>) · 기사 시트(#/news/item/<id>)
// 생김새: 큰 대문자 제목 + 모노 라벨(시각 · 나라 · 좌표) + 빨간 네모 표시 하나. 시안: claude.ai/artifact/D9FijRKwtmDSjmcrxKsSpD
// 오늘: 헤드라인 → 분야(전체 · AI · 지정학 · 기술 · 경제) → [내가 구독한 회사 기사] → 기사 목록(시각 · 나라 | 제목 → 요약 → 분야 · 매체).
// 세계: 진짜 국경 지구본(world-atlas 50m, public/vendor/world) 위에 기사가 나온 나라를 모두 찍고, 오른쪽에 나라별 기사.
// 회사: 사람마다 구독한 회사가 탭으로 떠요. 키보드: j/k 다음·이전 기사 · [ ] 어제·내일 · s 별표 · Esc 닫기.
import { api } from "../api.js";
import { esc, toast } from "../util.js";
import { icon } from "../icons.js";

const SECTIONS = [["all", "전체"], ["ai", "AI"], ["geopolitics", "지정학"], ["tech", "기술"], ["economy", "경제"]];
const SEC_KO = Object.fromEntries(SECTIONS);
const kstDay = (t = Date.now()) => new Date(t + 9 * 36e5).toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayKo = (d) => { const x = new Date(d + "T12:00:00+09:00"); return `${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일 ${WEEK[x.getUTCDay()]}요일`; };
const dayShort = (d) => { const x = new Date(d + "T12:00:00+09:00"); return `${x.getUTCMonth() + 1}.${x.getUTCDate()}`; };
const dayTab = (d) => `${dayShort(d)} ${WEEK[new Date(d + "T12:00:00+09:00").getUTCDay()]}`;
const hhmm = (t) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
// 올라온 때: 오늘이면 시각만, 다른 날이면 날짜까지, 원문에 날짜가 없으면 그렇다고 적어요
const when = (it) => (it.dated === 0 ? "날짜 미상" : kstDay(it.published_at) === kstDay() ? hhmm(it.published_at) : `${dayShort(kstDay(it.published_at))} ${hhmm(it.published_at)}`);
const strip = (s) => String(s || "").replace(/[\s.。…]+$/g, "").trim();
const sentences = (s) => String(s || "").split(/(?<=[.!?다요])\s+(?=\S)/).map((x) => x.trim()).filter(Boolean);
const titleOf = (it) => it.title_ko || it.one_liner || it.title;
const isKo = (s) => /[가-힣]/.test(s || "");
const geoOf = (it) => (Array.isArray(it.geo) ? it.geo : []).filter((c) => /^[A-Z]{2}$/.test(c));
let regionKo; try { regionKo = new Intl.DisplayNames(["ko"], { type: "region" }); } catch { regionKo = null; }
const countryKo = (c) => (c === "BE" ? "EU · 벨기에" : regionKo?.of(c) || c);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

let inst = null;
export function update(r) { inst?.route(r); }

export function mount(root, ctx, r) {
  root.innerHTML = `
    <div class="gn" id="gn">
      <main class="gn-scroll" id="gn-scroll" tabindex="-1">
        <header class="gn-bar">
          <nav class="gn-views" aria-label="뉴스 화면"><a href="#/news" data-view="today">오늘</a><a href="#/news/world" data-view="world">세계</a><a href="#/news/co" data-view="co">회사</a></nav>
          <div class="gn-daynav">
            <a class="gn-nav" id="gn-prev" href="#" aria-label="어제">←</a>
            <button class="gn-date" id="gn-date" type="button" aria-haspopup="dialog" aria-expanded="false"><span id="gn-date-t">오늘</span></button>
            <a class="gn-nav" id="gn-next" href="#" aria-label="내일">→</a>
            <span class="gn-clock"><i>KST</i> <b id="gn-clk"></b></span>
          </div>
        </header>
        <div class="gn-cal" id="gn-cal" hidden role="dialog" aria-label="지난 60일"></div>
        <div class="gn-page" id="gn-page"><p class="gn-soft">불러오는 중…</p></div>
      </main>
    </div>`;
  const portal = document.createElement("div");
  portal.className = "gn gn-portal";
  portal.innerHTML = `<div class="gn-scrim" id="gn-scrim" hidden></div><aside class="gn-sheet" id="gn-sheet" aria-label="기사" hidden></aside>`;
  document.body.append(portal);
  const $ = (s) => root.querySelector(s);
  const page = $("#gn-page"), sheet = portal.querySelector("#gn-sheet"), gn = portal, cal = $("#gn-cal"), scrim = portal.querySelector("#gn-scrim");
  let alive = true, ed = null, list = [], editions = [], cur = null, sec = store.get("gn-sec") || "all", starred = false, view = "today";
  let companies = null, coKey = store.get("gn-co") || null, coData = null, worldDays = +(store.get("gn-wd") || 1), worldData = null, worldSel = null;
  const user = (id) => ctx.user(id) || { display_name: "?", color: "var(--m0)" };
  const items = new Map();
  const mine = (it) => ({ read: !!it.readers?.includes(ctx.me.id), star: !!it.stars?.includes(ctx.me.id), others: (it.readers || []).filter((u) => u !== ctx.me.id) });
  const avs = (ids) => ids.map((id) => { const u = user(id); return `<i class="gn-av" style="--c:${u.color}" title="${esc(u.display_name)}">${esc((u.display_name || "?")[0])}</i>`; }).join("");
  const clk = () => { const el = $("#gn-clk"); if (el) el.textContent = new Date(Date.now() + 9 * 36e5).toISOString().slice(11, 19); };
  clk(); const clkT = setInterval(clk, 1000);

  // ---------- 달력 ----------
  async function loadEditions() {
    try { const d = await api.newsEditions(); editions = [...(d.editions || []), ...(d.pending || []).map((p) => ({ day: p.day, items: p.items, status: "pending" }))]; } catch { editions = []; }
  }
  function drawCal() {
    const by = new Map(editions.map((e) => [e.day, e])), today = kstDay(), days = [];
    for (let i = 59; i >= 0; i--) days.push(kstDay(Date.now() - i * 864e5));
    const lead = new Date(days[0] + "T12:00:00+09:00").getUTCDay();
    cal.innerHTML = `<div class="gn-cal-h">지난 60일 <small>진할수록 기사가 많아요</small></div><div class="gn-cal-g">${WEEK.map((w) => `<b>${w}</b>`).join("")}${"<i></i>".repeat(lead)}${days.map((d) => {
      const n = by.get(d)?.items || 0, l = !n ? 0 : n < 6 ? 1 : n < 15 ? 2 : 3;
      return `<a href="#/news/${d}" class="gn-cd l${l}${d === today ? " today" : ""}${ed?.day === d ? " on" : ""}" title="${dayKo(d)}${n ? ` · ${n}편` : ""}">${+d.slice(8)}</a>`;
    }).join("")}</div>`;
  }
  const toggleCal = (open = cal.hidden) => { if (open) drawCal(); cal.hidden = !open; $("#gn-date").setAttribute("aria-expanded", open); };
  const setView = (v) => { view = v; root.querySelectorAll("[data-view]").forEach((a) => a.setAttribute("aria-current", a.dataset.view === v ? "page" : "false")); $(".gn-daynav").classList.toggle("off", v !== "today"); };

  // ---------- 오늘 ----------
  async function loadEdition(day) {
    page.innerHTML = `<p class="gn-soft">불러오는 중…</p>`;
    try { ed = await api.newsEdition(day === kstDay() ? "today" : day); }
    catch (e) { if (alive) page.innerHTML = `<p class="gn-soft">${esc(e.message)}</p>`; return; }
    if (!alive) return;
    items.clear();
    for (const it of [...(ed.front || []).map((f) => f.item), ...SECTIONS.slice(1).flatMap(([k]) => ed.sections?.[k] || []), ...(ed.late || [])]) if (it && !items.has(it.id)) items.set(it.id, it);
    $("#gn-date-t").textContent = day === kstDay() ? `오늘 ${dayTab(day)}` : dayTab(day);
    const nav = (el, d) => { el.href = d ? "#/news/" + d : "#"; el.classList.toggle("off", !d); };
    nav($("#gn-prev"), ed.prev); nav($("#gn-next"), ed.next);
  }
  const secItems = (k) => {
    const all = k === "all" ? [...items.values()] : (ed.sections?.[k] || []).map((it) => items.get(it.id) || it);
    return all.filter((it) => !starred || mine(it).star).sort((a, b) => b.published_at - a.published_at);
  };
  const myCos = () => new Set((companies || []).filter((c) => c.mine).map((c) => c.key));
  const coName = (k) => (companies || []).find((c) => c.key === k)?.name || k;
  function row(it) {
    const m = mine(it), t = titleOf(it);
    const sub = sentences(it.summary).filter((s) => strip(s) !== strip(t)).join(" ");
    const g = geoOf(it);
    return `<li class="gn-item${m.read ? " read" : ""}${cur === it.id ? " on" : ""}" data-id="${it.id}">
      <a class="gn-item-a" href="#/news/item/${it.id}">
        <span class="gn-when"><b>${esc(when(it))}</b>${g.length ? `<span>${g.slice(0, 2).join(" · ")}</span>` : ""}</span>
        <span class="gn-body">
          <span class="gn-t"${isKo(t) ? "" : ' lang="en"'}>${m.read ? "" : `<i class="gn-dot" aria-label="안 읽음"></i>`}${esc(t)}</span>
          ${sub ? `<span class="gn-s">${esc(sub)}</span>` : ""}
          <span class="gn-meta">${it.section ? `<span>${SEC_KO[it.section] || ""}</span>` : ""}<span>${esc(it.feed)}</span>${(it.co || []).slice(0, 2).map((k) => `<span class="gn-co">${esc(coName(k))}</span>`).join("")}</span>
          ${it.comments || it.disputed || m.others.length ? `<span class="gn-foot">${it.comments ? `<span class="gn-pill">메모 ${it.comments}</span>` : ""}${it.disputed ? `<span class="gn-pill hot">의견 갈림</span>` : ""}<span class="gn-avs">${avs(m.others)}</span></span>` : ""}
        </span>
      </a>
      <button class="gn-star${m.star ? " on" : ""}" type="button" data-star="${it.id}" aria-pressed="${m.star}" aria-label="별표">${starSvg()}</button>
    </li>`;
  }
  function draw() {
    if (view !== "today" || !ed) return;
    const total = items.size, unread = [...items.values()].filter((it) => !mine(it).read).length;
    const mc = myCos();
    const picked = !starred && sec === "all" && mc.size ? secItems("all").filter((it) => (it.co || []).some((k) => mc.has(k))) : [];
    const pickedIds = new Set(picked.map((it) => it.id));
    const shown = secItems(sec).filter((it) => !pickedIds.has(it.id));
    list = [...picked, ...shown].map((it) => it.id);
    const lead = (ed.front || []).find((f) => f.item);
    const head = ed.headline || (lead ? titleOf(lead.item) : "오늘 들어온 소식");
    const counts = Object.fromEntries(SECTIONS.map(([k]) => [k, k === "all" ? total : (ed.sections?.[k] || []).length]));
    const status = ed.status === "closed" ? "마감" : ed.status === "draft" ? "아침판" : "밤 11:10 마감";
    page.innerHTML = `
      <section class="gn-hero">
        <h1 class="gn-h1">${esc(head)}</h1>
      </section>
      <nav class="gn-seg" role="tablist" aria-label="분야">${SECTIONS.map(([k, l], i) => `${i ? "<span>/</span>" : ""}<button type="button" role="tab" data-sec="${k}" aria-selected="${sec === k}">${l} <small>${counts[k]}</small></button>`).join("")}<span>/</span><button type="button" class="gn-seg-star" data-starred aria-pressed="${starred}">★ 별표</button></nav>
      <div class="gn-cols">
        <aside class="gn-side">
          <p class="gn-kicker"><span>${esc(status)}</span><span>${total}편</span><b>${unread ? `안 읽음 ${unread}` : "다 읽음"}</b></p>
          ${ed.lede ? `<p class="gn-lede">${esc(ed.lede)}</p>` : lead?.why ? `<p class="gn-lede">${esc(lead.why)}</p>` : ""}
          ${(ed.threads || []).length ? `<p class="gn-lab">오늘의 흐름</p><ul class="gn-threads">${ed.threads.map((t) => `<li><b>${esc(t.title)}</b><span>${esc(t.move || "")}</span></li>`).join("")}</ul>` : ""}
          ${mc.size ? `<p class="gn-lab">구독한 회사</p><p class="gn-cos">${[...mc].map((k) => `<a href="#/news/co/${k}">${esc(coName(k))}</a>`).join("")}</p>` : `<p class="gn-lab">구독한 회사</p><p class="gn-cos"><a href="#/news/co">회사 구독하기 →</a></p>`}
        </aside>
        <div class="gn-main">
          ${picked.length ? `<p class="gn-lab gn-lab-list">구독한 회사 소식</p><ul class="gn-list">${picked.map(row).join("")}</ul><p class="gn-lab gn-lab-list">${SEC_KO[sec]} 기사</p>` : ""}
          ${shown.length ? `<ul class="gn-list">${shown.map(row).join("")}</ul>` : picked.length ? "" : `<p class="gn-empty">${starred ? "별표한 기사가 없어요." : sec === "ai" ? "아직 AI 기사가 없어요. 매시 10분에 새로 모아요." : "아직 기사가 없어요."}</p>`}
          <footer class="gn-end">${unread ? `안 읽은 기사 ${unread}편` : "여기까지예요"}${ed.prev ? ` · <a href="#/news/${ed.prev}">${dayKo(ed.prev)}</a>` : ""}</footer>
        </div>
      </div>`;
  }

  // ---------- 세계 ----------
  let geoLib = null;
  const loadScript = (src) => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("지도 파일을 못 불러왔어요.")); document.head.append(s); });
  async function loadGeo() {
    if (geoLib) return geoLib;
    for (const f of ["d3-array.min.js", "d3-geo.min.js", "topojson-client.min.js"]) await loadScript("/vendor/world/" + f);
    const [topo, iso] = await Promise.all([fetch("/vendor/world/countries-50m.json").then((r) => r.json()), fetch("/vendor/world/iso.json").then((r) => r.json())]);
    const fc = window.topojson.feature(topo, topo.objects.countries);
    const borders = window.topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    const byCode = new Map();
    for (const f of fc.features) { const c = iso[String(f.id).padStart(3, "0")]; if (c) { f.properties.code = c; byCode.set(c, f); } }
    return (geoLib = { d3: window.d3, land: fc, borders, byCode });
  }
  async function drawWorld() {
    page.innerHTML = `<section class="gn-hero"><h1 class="gn-h1">기사가 나온 곳</h1></section><p class="gn-soft">지도를 펴는 중…</p>`;
    let g;
    try { [g, worldData] = await Promise.all([loadGeo(), api.newsWorld(worldDays)]); } catch (e) { if (alive) page.innerHTML = `<p class="gn-soft">${esc(e.message)}</p>`; return; }
    if (!alive || view !== "world") return;
    for (const it of worldData.items || []) if (!items.has(it.id)) items.set(it.id, it);
    const by = new Map();
    for (const it of worldData.items || []) for (const c of geoOf(it)) { if (!by.has(c)) by.set(c, []); by.get(c).push(it); }
    const ranked = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
    if (!worldSel || !by.has(worldSel)) worldSel = ranked[0]?.[0] || null;
    const DAYS = [[1, "오늘"], [7, "7일"], [30, "30일"]];
    page.innerHTML = `
      <section class="gn-hero gn-hero-world">
        <h1 class="gn-h1">기사가<br>나온 곳</h1>
        <p class="gn-seg gn-seg-plain">${DAYS.map(([d, l], i) => `${i ? "<span>/</span>" : ""}<button type="button" data-wd="${d}" aria-pressed="${worldDays === d}">${l}</button>`).join("")}<span class="gn-lab-inline">${by.size}개 나라 · ${(worldData.items || []).length}편</span></p>
      </section>
      <div class="gn-world">
        <div class="gn-globe-box">
          <div class="gn-globe"><canvas id="gn-globe" aria-label="기사가 나온 나라를 표시한 지구본. 끌어서 돌리고 나라를 눌러요"></canvas><i class="gn-corner a"></i><i class="gn-corner b"></i></div>
          <p class="gn-coord"><span>LAT <b id="gn-lat"></b></span><span>LON <b id="gn-lon"></b></span><span>끌어서 돌리기 · 나라 누르기</span></p>
        </div>
        <div class="gn-country" id="gn-country"></div>
      </div>
      <p class="gn-lab">모든 나라</p>
      <div class="gn-ranks" id="gn-ranks">${ranked.map(([c, its]) => `<button type="button" data-cc="${c}" aria-pressed="${c === worldSel}"><span>${c}</span><span>${esc(countryKo(c))}</span><span>${its.length}</span></button>`).join("") || `<p class="gn-soft">이 기간에는 나라 표시가 붙은 기사가 없어요.</p>`}</div>`;
    const cv = page.querySelector("#gn-globe"), cx = cv.getContext("2d"), d3 = g.d3;
    const css = (n) => getComputedStyle(page).getPropertyValue(n).trim();
    const counts = new Map(ranked.map(([c, its]) => [c, its.length])), max = Math.max(1, ...counts.values());
    const cent = (c) => (c === "BE" ? [4.4, 50.8] : g.byCode.has(c) ? d3.geoCentroid(g.byCode.get(c)) : null);
    let rot = [0, -25], W = 0, proj, path, raf = 0;
    const size = () => { const box = cv.parentElement.getBoundingClientRect(); W = Math.round(box.width); const dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = W * dpr; cv.style.height = W + "px"; cx.setTransform(dpr, 0, 0, dpr, 0, 0); proj = d3.geoOrthographic().scale(W / 2 - 4).translate([W / 2, W / 2]).clipAngle(90).precision(.4); path = d3.geoPath(proj, cx); };
    const focus = (c) => { const p = cent(c); if (p) rot = [-p[0], -p[1] * .8]; };
    if (worldSel) focus(worldSel);
    const paint = () => {
      raf = 0; proj.rotate(rot); cx.clearRect(0, 0, W, W);
      const bg = css("--g-bg"), land = css("--g-land"), line = css("--g-line"), ink = css("--g-ink"), mute = css("--g-ink3"), red = css("--g-red");
      cx.beginPath(); path({ type: "Sphere" }); cx.fillStyle = bg; cx.fill();
      cx.beginPath(); path(d3.geoGraticule10()); cx.strokeStyle = line; cx.lineWidth = .7; cx.stroke();
      cx.beginPath(); path(g.land); cx.fillStyle = land; cx.fill();
      for (const [c, n] of counts) { const f = g.byCode.get(c); if (!f) continue; cx.beginPath(); path(f); cx.fillStyle = `color-mix(in srgb, ${red} ${Math.round(12 + 38 * n / max)}%, ${land})`; cx.fill(); }
      cx.beginPath(); path(g.borders); cx.strokeStyle = mute; cx.lineWidth = .5; cx.stroke();
      if (worldSel && g.byCode.get(worldSel)) { cx.beginPath(); path(g.byCode.get(worldSel)); cx.strokeStyle = ink; cx.lineWidth = 1.5; cx.stroke(); }
      cx.beginPath(); path({ type: "Sphere" }); cx.strokeStyle = mute; cx.lineWidth = 1; cx.stroke();
      cx.font = `500 ${W < 420 ? 10 : 11}px "Geist Mono", ui-monospace, monospace`; cx.textBaseline = "middle";
      const center = [-rot[0], -rot[1]];
      for (const [c, n] of counts) {
        const p = cent(c); if (!p || d3.geoDistance(p, center) > 1.5) continue;
        const [x, y] = proj(p), s = 6 + 10 * Math.sqrt(n / max);
        cx.fillStyle = red; cx.fillRect(x - s / 2, y - s / 2, s, s);
        if (c === worldSel) { cx.strokeStyle = ink; cx.lineWidth = 1.5; cx.strokeRect(x - s / 2 - 4, y - s / 2 - 4, s + 8, s + 8); }
        cx.fillStyle = ink; cx.fillText(`${c} ${n}`, x + s / 2 + 5, y);
      }
      const lat = -rot[1], lon = ((-rot[0] + 540) % 360) - 180;
      page.querySelector("#gn-lat").textContent = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
      page.querySelector("#gn-lon").textContent = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const showCountry = () => {
      const box = page.querySelector("#gn-country"), its = (by.get(worldSel) || []).slice().sort((a, b) => b.published_at - a.published_at);
      box.innerHTML = worldSel ? `<p class="gn-lab">고른 나라</p><h2 class="gn-cn">${esc(countryKo(worldSel))}</h2><p class="gn-lab">${worldSel} · ${its.length}편</p><ul class="gn-list gn-list-tight">${its.map(row).join("")}</ul>` : `<p class="gn-soft">나라를 눌러 보세요.</p>`;
      page.querySelectorAll("#gn-ranks [data-cc]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cc === worldSel));
      list = its.map((it) => it.id);
    };
    size(); paint(); showCountry();
    let drag = null, spin = 0;
    cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, r: rot.slice(), moved: false }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 3) drag.moved = true; const k = 180 / W; rot = [drag.r[0] + dx * k, Math.max(-85, Math.min(85, drag.r[1] - dy * k))]; ask(); };
    cv.onpointerup = (e) => {
      const moved = drag?.moved; drag = null; if (moved) return;
      const b = cv.getBoundingClientRect(), p = proj.invert([e.clientX - b.left, e.clientY - b.top]); if (!p) return;
      const hit = [...counts.keys()].find((c) => g.byCode.get(c) && d3.geoContains(g.byCode.get(c), p));
      if (hit) { worldSel = hit; showCountry(); ask(); }
    };
    const onPick = (c) => { worldSel = c; const from = rot.slice(), p = cent(c); if (!p) { showCountry(); ask(); return; } const to = [-p[0], -p[1] * .8], t0 = performance.now(); cancelAnimationFrame(spin);
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const step = (t) => { const k = reduce ? 1 : Math.min(1, (t - t0) / 600), e2 = 1 - Math.pow(1 - k, 3); const dl = ((to[0] - from[0] + 540) % 360) - 180; rot = [from[0] + dl * e2, from[1] + (to[1] - from[1]) * e2]; paint(); if (k < 1) spin = requestAnimationFrame(step); };
      spin = requestAnimationFrame(step); showCountry(); };
    page.querySelector("#gn-ranks").onclick = (e) => { const b = e.target.closest("[data-cc]"); if (b) onPick(b.dataset.cc); };
    const ro = new ResizeObserver(() => { const w = Math.round(cv.parentElement.getBoundingClientRect().width); if (w && w !== W) { size(); paint(); } });
    ro.observe(cv.parentElement);
    worldCleanup = () => { ro.disconnect(); cancelAnimationFrame(spin); cancelAnimationFrame(raf); };
  }
  let worldCleanup = null;

  // ---------- 회사 ----------
  async function loadCompanies(force) {
    if (companies && !force) return companies;
    try { companies = (await api.newsCompanies()).companies || []; } catch { companies = companies || []; }
    return companies;
  }
  async function drawCo(key) {
    await loadCompanies();
    if (!alive || view !== "co") return;
    const mineList = companies.filter((c) => c.mine);
    coKey = key || (coKey && companies.some((c) => c.key === coKey) ? coKey : mineList[0]?.key || companies[0]?.key);
    if (!coKey) { page.innerHTML = `<p class="gn-soft">회사 목록을 못 불러왔어요.</p>`; return; }
    store.set("gn-co", coKey);
    const c = companies.find((x) => x.key === coKey);
    const tabs = [...mineList, ...(c.mine ? [] : [c])];
    page.innerHTML = `
      <nav class="gn-cotabs" role="tablist" aria-label="구독한 회사">${tabs.map((x) => `<a role="tab" href="#/news/co/${x.key}" aria-selected="${x.key === coKey}">${esc(x.name)}${x.today ? ` <small>${x.today}</small>` : ""}</a>`).join("")}<button type="button" class="gn-coadd" data-coadd aria-expanded="false">+ 회사</button></nav>
      <div class="gn-copick" id="gn-copick" hidden>${companies.map((x) => `<button type="button" data-cosub="${x.key}" aria-pressed="${!!x.mine}">${x.mine ? "✓ " : "+ "}${esc(x.name)}</button>`).join("")}</div>
      <div class="gn-cols">
        <aside class="gn-side">
          <p class="gn-kicker"><span>${c.mine ? "구독 중" : "구독 안 함"}</span><span id="gn-co-n">…</span></p>
          <h1 class="gn-h1 gn-coname">${esc(c.name)}</h1>
          <button type="button" class="gn-sub${c.mine ? " on" : ""}" data-cosub="${c.key}" aria-pressed="${!!c.mine}">${c.mine ? "구독 중 · 끊기" : "구독하기"}</button>
          <p class="gn-note">구독하면 이 회사 기사가 오늘판 맨 위에 먼저 떠요.${(c.subs || []).filter((u) => u !== ctx.me.id).length ? ` 같이 구독: ${(c.subs || []).filter((u) => u !== ctx.me.id).map((u) => esc(user(u).display_name)).join(", ")}` : ""}</p>
        </aside>
        <div class="gn-main" id="gn-co-list"><p class="gn-soft">불러오는 중…</p></div>
      </div>`;
    try { coData = await api.newsCompany(coKey); } catch (e) { if (alive) page.querySelector("#gn-co-list").innerHTML = `<p class="gn-soft">${esc(e.message)}</p>`; return; }
    if (!alive || view !== "co" || coData.company?.key !== coKey) return;
    for (const it of coData.items || []) items.set(it.id, { ...items.get(it.id), ...it });
    const its = (coData.items || []).map((it) => items.get(it.id));
    list = its.map((it) => it.id);
    page.querySelector("#gn-co-n").textContent = `최근 14일 ${its.length}편`;
    page.querySelector("#gn-co-list").innerHTML = its.length ? `<ul class="gn-list">${its.map(row).join("")}</ul>` : `<p class="gn-empty">최근 14일 동안 이 회사 기사가 없어요.</p>`;
  }
  async function toggleSub(key) {
    const c = companies.find((x) => x.key === key); if (!c) return;
    const on = !c.mine; c.mine = on; c.subs = on ? [...(c.subs || []), ctx.me.id] : (c.subs || []).filter((u) => u !== ctx.me.id);
    try { await api.newsCompanySub(key, on); toast(on ? `${c.name} 구독했어요.` : `${c.name} 구독을 끊었어요.`); } catch (err) { c.mine = !on; toast(err.message, "err"); }
    if (view === "co") drawCo(key);
  }

  // ---------- 기사 시트 ----------
  async function openItem(id) {
    cur = id;
    page.querySelectorAll("[data-id]").forEach((el) => el.classList.toggle("on", el.dataset.id === id));
    sheet.hidden = false; scrim.hidden = false; requestAnimationFrame(() => gn.classList.add("sheet-on"));
    const known = items.get(id);
    sheet.innerHTML = `<div class="gn-sh">${sheetHead()}<p class="gn-soft">여는 중…</p></div>`;
    let d;
    try { d = await api.newsItem(id); } catch (e) { sheet.innerHTML = `<div class="gn-sh">${sheetHead()}<p class="gn-soft">${esc(e.message)}</p></div>`; return; }
    if (!alive || cur !== id) return;
    const it = { ...known, ...d.item, summary: known?.summary || d.item.summary, title_ko: known?.title_ko || d.item.title_ko };
    const t = titleOf(it), sum = sentences(it.summary).filter((s) => strip(s) !== strip(t));
    const star = () => (it.stars || []).includes(ctx.me.id);
    sheet.innerHTML = `<div class="gn-sh">
      ${sheetHead()}
      <span class="gn-meta"><span>${esc(it.feed)}</span><span>${it.dated === 0 ? "날짜 미상" : `${dayShort(kstDay(it.published_at))} ${hhmm(it.published_at)} 올라옴`}</span>${it.section ? `<span class="gn-tag">${SEC_KO[it.section] || ""}</span>` : ""}</span>
      <h2 class="gn-sh-t">${esc(t)}</h2>
      ${t !== it.title ? `<p class="gn-sh-orig" lang="en">${esc(it.title)}</p>` : ""}
      ${sum.length ? `<section class="gn-card"><h3>요약</h3><ul>${sum.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : `<section class="gn-card"><p class="gn-soft">요약을 만드는 중이에요.</p></section>`}
      <div class="gn-acts">
        <button class="gn-btn${star() ? " on" : ""}" type="button" id="gn-sh-star" aria-pressed="${star()}">${starSvg()}<span>${star() ? "별표함" : "별표"}</span></button>
        <button class="gn-btn" type="button" id="gn-sh-deep">${d.deep ? "더 읽기 ✓" : "더 읽기"}</button>
        <a class="gn-btn" href="${esc(it.url)}" target="_blank" rel="noopener">원문 ${icon.external(13)}</a>
        <span class="gn-avs" title="읽은 친구">${avs((it.readers || []).filter((u) => u !== ctx.me.id))}</span>
      </div>
      <section class="gn-card" id="gn-deep"${d.deep ? "" : " hidden"}></section>
      <section class="gn-talk"><h3>토론 <small id="gn-talk-n"></small></h3>
        <form class="gn-compose" id="gn-compose"><textarea name="b" rows="2" maxlength="2000" placeholder="메모 남기기"></textarea><button class="gn-btn pri" type="submit">남기기</button></form>
        <div id="gn-talk"></div>
      </section>
    </div>`;
    const paintDeep = (deep) => { const el = sheet.querySelector("#gn-deep"); el.hidden = false; el.innerHTML = `<h3>더 읽기</h3><ul>${(deep.summary || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>${deep.why ? `<p class="gn-why">왜 중요한가 — ${esc(deep.why)}</p>` : ""}`; };
    if (d.deep) paintDeep(d.deep);
    sheet.querySelector("#gn-sh-deep").addEventListener("click", async (e) => {
      if (d.deep) return; const b = e.currentTarget; b.disabled = true; b.textContent = "읽는 중…";
      try { const r2 = await api.newsDeep(id); d.deep = r2.deep || r2; paintDeep(d.deep); b.textContent = "더 읽기 ✓"; }
      catch (err) { toast(err.message, "err"); b.disabled = false; b.textContent = "더 읽기"; }
    });
    sheet.querySelector("#gn-sh-star").addEventListener("click", () => toggleStar(id));
    talk(id, d.comments || []);
    if (!(it.readers || []).includes(ctx.me.id)) api.newsMark(id, { read: true }).then(() => { const k = items.get(id); if (k) { k.readers = [...(k.readers || []), ctx.me.id]; repaint(id); } }).catch(() => {});
    sheet.scrollTop = 0;
  }
  const sheetHead = () => `<div class="gn-sh-top"><span class="gn-grab" aria-hidden="true"></span><button class="gn-x" type="button" data-close aria-label="닫기">${icon.x(16)}</button></div>`;
  function closeSheet() {
    cur = null; gn.classList.remove("sheet-on"); scrim.hidden = true;
    setTimeout(() => { if (!cur) sheet.hidden = true; }, 220);
    page.querySelectorAll(".on[data-id]").forEach((el) => el.classList.remove("on"));
  }
  function repaint(id) {
    const it = items.get(id); if (!it) return;
    page.querySelectorAll(`li.gn-item[data-id="${id}"]`).forEach((el) => { const tmp = document.createElement("ul"); tmp.innerHTML = row(it); el.replaceWith(tmp.firstElementChild); });
    const k = page.querySelector(".gn-kicker b"); const n = [...items.values()].filter((x) => !mine(x).read).length;
    if (k) k.textContent = n ? `안 읽음 ${n}` : "다 읽음";
  }
  async function toggleStar(id) {
    const it = items.get(id) || { stars: [] }, on = !(it.stars || []).includes(ctx.me.id);
    it.stars = on ? [...(it.stars || []), ctx.me.id] : (it.stars || []).filter((u) => u !== ctx.me.id);
    repaint(id);
    const b = sheet.querySelector("#gn-sh-star"); if (b && cur === id) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.querySelector("span").textContent = on ? "별표함" : "별표"; }
    try { await api.newsMark(id, { flagged: on }); } catch (err) { toast(err.message, "err"); }
  }

  // ---------- 토론 ----------
  function talk(itemId, comments) {
    let all = comments.slice();
    const box = sheet.querySelector("#gn-talk");
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 6e4)); return m < 60 ? m + "분 전" : m < 2880 ? Math.round(m / 60) + "시간 전" : Math.round(m / 1440) + "일 전"; };
    const KIND = { memo: "메모", rebut: "반박", agree: "동의" };
    const head = (c, ai) => { const u = user(c.user_id); return ai ? `<i class="gn-av ai">AI</i><b>AI 반박</b><span>${esc(u.display_name)} 요청 · ${ago(c.created_at)}</span>` : `<i class="gn-av" style="--c:${u.color}">${esc((u.display_name || "?")[0])}</i><b>${esc(u.display_name)}</b><span>${KIND[c.stance] || ""} · ${ago(c.created_at)}</span>`; };
    const del = (c) => (c.user_id === ctx.me.id && !c.ai ? `<button class="gn-del" data-del="${c.id}" type="button" aria-label="지우기">${icon.trash(13)}</button>` : "");
    const body = (s) => esc(s).replace(/\n?^&gt; (.+)$\n?/gm, "<q>$1</q>").replace(/\n/g, "<br>");
    const paint = () => {
      const memos = all.filter((c) => !c.parent_id);
      sheet.querySelector("#gn-talk-n").textContent = all.length ? `${all.length}${all.some((c) => c.stance === "rebut") ? " · 의견 갈림" : ""}` : "";
      box.innerHTML = memos.map((m) => {
        const kids = all.filter((c) => c.parent_id === m.id), hasAi = kids.some((k) => k.ai);
        return `<article class="gn-memo" data-id="${m.id}"><header>${head(m)}${del(m)}</header><p>${body(m.body)}</p>
          <div class="gn-memo-acts"><button type="button" class="gn-chip r" data-reply="rebut">반박</button><button type="button" class="gn-chip g" data-reply="agree">동의</button>${hasAi ? "" : `<button type="button" class="gn-chip" data-ai="${m.id}">AI 반박 받기</button>`}</div>
          ${kids.map((k) => `<div class="gn-reply ${k.stance}${k.ai ? " ai" : ""}"><header>${head(k, k.ai)}${del(k)}</header><p>${body(k.body)}</p></div>`).join("")}</article>`;
      }).join("") || `<p class="gn-soft">아직 메모가 없어요.</p>`;
    };
    const sync = () => { const it = items.get(itemId); if (!it) return; it.comments = all.length; it.disputed = all.some((c) => c.stance === "rebut"); repaint(itemId); };
    paint();
    sheet.querySelector("#gn-compose").addEventListener("submit", async (e) => {
      e.preventDefault(); const ta = e.target.b, b = ta.value.trim(); if (!b) return; ta.disabled = true;
      try { const { comment } = await api.newsComment(itemId, { body: b }); all.push(comment); ta.value = ""; paint(); sync(); } catch (err) { toast(err.message, "err"); }
      ta.disabled = false;
    });
    box.addEventListener("click", async (e) => {
      const memo = e.target.closest(".gn-memo"), rep = e.target.closest("[data-reply]");
      if (rep && memo) {
        memo.querySelector(".gn-rform")?.remove();
        const stance = rep.dataset.reply;
        memo.insertAdjacentHTML("beforeend", `<form class="gn-rform ${stance}"><textarea rows="2" maxlength="2000" placeholder="${stance === "rebut" ? "어디가 틀렸나요?" : "어디가 맞나요?"}"></textarea><button class="gn-btn" type="submit">${stance === "rebut" ? "반박하기" : "동의하기"}</button></form>`);
        const f = memo.querySelector(".gn-rform"); f.querySelector("textarea").focus();
        f.addEventListener("submit", async (ev) => {
          ev.preventDefault(); const b = f.querySelector("textarea").value.trim(); if (!b) return;
          try { const { comment } = await api.newsComment(itemId, { body: b, stance, parent_id: memo.dataset.id }); all.push(comment); paint(); sync(); } catch (err) { toast(err.message, "err"); }
        });
        return;
      }
      const ai = e.target.closest("[data-ai]");
      if (ai) { ai.disabled = true; ai.textContent = "기사 읽는 중…"; try { const { comment } = await api.newsAiRebut(ai.dataset.ai); all.push(comment); paint(); sync(); } catch (err) { toast(err.message, "err"); ai.disabled = false; ai.textContent = "AI 반박 받기"; } return; }
      const d = e.target.closest("[data-del]");
      if (d) { try { await api.newsDelComment(d.dataset.del); all = all.filter((c) => c.id !== d.dataset.del && c.parent_id !== d.dataset.del); paint(); sync(); } catch (err) { toast(err.message, "err"); } }
    });
  }

  // ---------- 이벤트 ----------
  const backHash = () => (view === "world" ? "#/news/world" : view === "co" ? "#/news/co/" + coKey : ed && ed.day !== kstDay() ? "#/news/" + ed.day : "#/news");
  const back = () => ctx.go(backHash());
  const onClick = (e) => {
    const s = e.target.closest("[data-star]"); if (s) { e.preventDefault(); toggleStar(s.dataset.star); return; }
    if (e.target.closest("[data-close]") || e.target === scrim) { e.preventDefault(); back(); return; }
    const b = e.target.closest("[data-sec]"); if (b) { sec = b.dataset.sec; store.set("gn-sec", sec); draw(); return; }
    if (e.target.closest("[data-starred]")) { starred = !starred; draw(); return; }
    const wd = e.target.closest("[data-wd]"); if (wd) { worldDays = +wd.dataset.wd; store.set("gn-wd", worldDays); worldCleanup?.(); drawWorld(); return; }
    const sub = e.target.closest("[data-cosub]"); if (sub) { toggleSub(sub.dataset.cosub); return; }
    const add = e.target.closest("[data-coadd]"); if (add) { const p = page.querySelector("#gn-copick"); p.hidden = !p.hidden; add.setAttribute("aria-expanded", !p.hidden); return; }
    if (e.target.closest("#gn-date")) { toggleCal(); return; }
    if (e.target.closest(".gn-nav.off")) { e.preventDefault(); return; }
    if (!cal.hidden && !e.target.closest("#gn-cal")) toggleCal(false);
  };
  root.addEventListener("click", onClick);
  portal.addEventListener("click", onClick);
  const onKey = (e) => {
    if (e.target.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = cur ? list.indexOf(cur) : -1;
    if (e.key === "j" || e.key === "k") { const n = list[e.key === "j" ? i + 1 : Math.max(0, i - 1)]; if (n) { e.preventDefault(); ctx.go("#/news/item/" + n); } }
    else if (e.key === "[" && ed?.prev && view === "today") ctx.go("#/news/" + ed.prev);
    else if (e.key === "]" && ed?.next && view === "today") ctx.go("#/news/" + ed.next);
    else if (e.key === "s" && cur) toggleStar(cur);
    else if (e.key === "Escape") { if (!cal.hidden) toggleCal(false); else if (cur) back(); }
  };
  document.addEventListener("keydown", onKey);

  async function route(rr) {
    toggleCal(false);
    if (rr.sub === "item" && rr.id) {
      if (!items.size) { setView("today"); await loadEdition(store.get("gn-day") || kstDay()); draw(); }
      openItem(rr.id); return;
    }
    if (cur) closeSheet();
    const next = rr.sub === "world" ? "world" : rr.sub === "co" ? "co" : "today";
    const changed = next !== view;
    if (changed) worldCleanup?.(), (worldCleanup = null);
    setView(next);
    if (next === "world") { if (changed || !page.querySelector("#gn-globe")) drawWorld(); }
    else if (next === "co") { await loadCompanies(); drawCo(rr.id); }
    else {
      const day = rr.day && DAY_RE.test(rr.day) ? rr.day : kstDay();
      store.set("gn-day", day);
      if (!ed || ed.day !== day) await loadEdition(day);
      else if (changed) for (const it of [...(ed.front || []).map((f) => f.item), ...SECTIONS.slice(1).flatMap(([k]) => ed.sections?.[k] || [])]) if (it && !items.has(it.id)) items.set(it.id, it);
      draw();
      if (changed) $("#gn-scroll").scrollTop = 0;
    }
  }
  inst = { route };
  loadEditions();
  // 구독한 회사가 있을 때만 다시 그려요 — 없으면 화면이 그대로라 누르던 기사가 바뀌지 않게
  loadCompanies().then(() => { if (view === "today" && myCos().size && !cur) draw(); });
  route(r);
  api.newsSeen?.().catch(() => {});
  return () => { alive = false; inst = null; clearInterval(clkT); worldCleanup?.(); document.removeEventListener("keydown", onKey); portal.remove(); };
}

function starSvg() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.6l-5.1 2.6 1-5.6-4.1-4 5.7-.8z" fill="currentColor"/></svg>`;
}

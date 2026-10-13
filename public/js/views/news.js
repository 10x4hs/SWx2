// 뉴스 — 하루 한 호. 세 화면: 오늘(#/news · #/news/<YYYY-MM-DD>) · 세계(#/news/world) · 회사(#/news/co/<key>) · 기사 시트(#/news/item/<id>)
// 생김새: 큰 대문자 제목 + 모노 라벨(시각 · 나라 · 좌표) + 빨간 네모 표시 하나. 시안: claude.ai/artifact/D9FijRKwtmDSjmcrxKsSpD
// 오늘: 헤드라인 → 분야(전체 · AI · 지정학 · 기술 · 경제) → [내가 구독한 회사 기사] → 기사 목록(시각 · 나라 | 제목 → 요약 → 분야 · 매체).
// 세계: 진짜 국경 지구본(world-atlas 50m, public/vendor/world) 위에 기사가 나온 나라를 모두 찍고, 오른쪽에 나라별 기사.
// 회사: 사람마다 구독한 회사가 탭으로 떠요. 키보드: j/k 다음·이전 기사 · [ ] 어제·내일 · s 별표 · Esc 닫기.
import { api } from "../api.js";
import { esc, toast } from "../util.js";
import { icon } from "../icons.js";

const SECTIONS = [["all", "All"], ["ai", "AI"], ["geopolitics", "Geopolitics"], ["tech", "Tech"], ["economy", "Economy"]];
const SEC_KO = Object.fromEntries(SECTIONS);
const kstDay = (t = Date.now()) => new Date(t + 9 * 36e5).toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayKo = (d) => { const x = new Date(d + "T12:00:00+09:00"); return `${WEEK[x.getUTCDay()]}, ${MON[x.getUTCMonth()]} ${x.getUTCDate()}`; };
const dayShort = (d) => { const x = new Date(d + "T12:00:00+09:00"); return `${x.getUTCMonth() + 1}.${x.getUTCDate()}`; };
const dayTab = (d) => `${dayShort(d)} ${WEEK[new Date(d + "T12:00:00+09:00").getUTCDay()]}`;
const hhmm = (t) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
// 올라온 때: 오늘이면 시각만, 다른 날이면 날짜까지, 원문에 날짜가 없으면 그렇다고 적어요
const when = (it) => (it.dated === 0 ? "No date" : kstDay(it.published_at) === kstDay() ? hhmm(it.published_at) : `${dayShort(kstDay(it.published_at))} ${hhmm(it.published_at)}`);
const strip = (s) => String(s || "").replace(/[\s.。…]+$/g, "").trim();
const sentences = (s) => String(s || "").split(/(?<=[.!?다요])\s+(?=\S)/).map((x) => x.trim()).filter(Boolean);
const titleOf = (it) => String(it.title_ko || it.one_liner || it.title || "").replace(/^\s*[(\[]번역[)\]]\s*/, ""); // AI 가 붙인 "(번역)" 표시는 빼요
const isKo = (s) => /[가-힣]/.test(s || "");
const geoOf = (it) => (Array.isArray(it.geo) ? it.geo : []).filter((c) => /^[A-Z]{2}$/.test(c));
let regionKo; try { regionKo = new Intl.DisplayNames(["en"], { type: "region" }); } catch { regionKo = null; }
const countryKo = (c) => (c === "BE" ? "EU (Brussels)" : regionKo?.of(c) || c);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// 제호 양옆 세계 시계 (Semafor 처럼) — 우리가 기사로 자주 보는 도시
const CLOCKS = [["D.C.", "America/New_York"], ["Brussels", "Europe/Brussels"], ["Kyiv", "Europe/Kyiv"], ["Beijing", "Asia/Shanghai"], ["Taipei", "Asia/Taipei"], ["Seoul", "Asia/Seoul"]];
const clockHtml = ([name, tz]) => `<span class="gn-ck" data-tz="${tz}" title="${name}"><small>${name}</small><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10.5"/><line class="h" x1="12" y1="12" x2="12" y2="7"/><line class="m" x1="12" y1="12" x2="12" y2="4"/></svg><b class="t"></b></span>`;
function tickClocks(root) {
  const now = new Date();
  root.querySelectorAll(".gn-ck").forEach((el) => {
    const [h, m] = now.toLocaleTimeString("en-GB", { timeZone: el.dataset.tz, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
    el.querySelector(".h").setAttribute("transform", `rotate(${(h % 12) * 30 + m / 2} 12 12)`);
    el.querySelector(".m").setAttribute("transform", `rotate(${m * 6} 12 12)`);
    el.querySelector(".t").textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });
}

let inst = null;
export function update(r) { inst?.route(r); }

export function mount(root, ctx, r) {
  root.innerHTML = `
    <div class="gn" id="gn">
      <main class="gn-scroll" id="gn-scroll" tabindex="-1">
        <header class="gn-mast">
          <div class="gn-mast-l"><span id="gn-today"></span></div>
          <div class="gn-mast-c">
            <p class="gn-tagline">The daily paper for the three of us</p>
            <div class="gn-mast-row">
              <span class="gn-clocks" data-side="l">${CLOCKS.slice(0, 3).map(clockHtml).join("")}</span>
              <a class="gn-wordmark" href="#/news">DSM MAFIA</a>
              <span class="gn-clocks" data-side="r">${CLOCKS.slice(3).map(clockHtml).join("")}</span>
            </div>
          </div>
          <div class="gn-mast-r"><span class="gn-clock"><i>KST</i> <b id="gn-clk"></b></span></div>
        </header>
        <div class="gn-bar">
          <nav class="gn-views" aria-label="News sections"><a href="#/news" data-view="today">Today</a><a href="#/news/world" data-view="world">World</a><a href="#/news/history" data-view="history">History</a><a href="#/news/co" data-view="co">Following</a><a href="#/news/library" data-view="library">My Library</a><a href="#/news/board" data-view="board">Leaderboard</a><a href="#/news/talk" data-view="talk">Comments <i class="gn-badge" id="gn-talk-badge" hidden></i></a></nav>
          <div class="gn-daynav">
            <a class="gn-nav" id="gn-prev" href="#" aria-label="Previous day">←</a>
            <button class="gn-date" id="gn-date" type="button" aria-haspopup="dialog" aria-expanded="false"><span id="gn-date-t">Today</span></button>
            <a class="gn-nav" id="gn-next" href="#" aria-label="Next day">→</a>
          </div>
        </div>
        <div class="gn-cal" id="gn-cal" hidden role="dialog" aria-label="Last 60 days"></div>
        <div class="gn-page" id="gn-page"><p class="gn-soft">Loading…</p></div>
      </main>
    </div>`;
  const portal = document.createElement("div");
  portal.className = "gn gn-portal";
  portal.innerHTML = `<div class="gn-scrim" id="gn-scrim" hidden></div><aside class="gn-sheet" id="gn-sheet" aria-label="Article" hidden></aside>`;
  document.body.append(portal);
  const $ = (s) => root.querySelector(s);
  const page = $("#gn-page"), sheet = portal.querySelector("#gn-sheet"), gn = portal, cal = $("#gn-cal"), scrim = portal.querySelector("#gn-scrim");
  let alive = true, ed = null, list = [], editions = [], cur = null, sec = store.get("gn-sec") || "all", starred = false, view = "today";
  let companies = null, coKey = store.get("gn-co") || null, coData = null, worldDays = +(store.get("gn-wd") || 1), worldData = null, worldSel = null;
  const user = (id) => ctx.user(id) || { display_name: "?", color: "var(--m0)" };
  const items = new Map();
  const mine = (it) => ({ read: !!it.readers?.includes(ctx.me.id), star: !!it.stars?.includes(ctx.me.id), others: (it.readers || []).filter((u) => u !== ctx.me.id) });
  const avs = (ids) => ids.map((id) => { const u = user(id); return `<i class="gn-av" style="--c:${u.color}" title="${esc(u.display_name)}">${esc((u.display_name || "?")[0])}</i>`; }).join("");
  const clk = () => {
    const el = $("#gn-clk"); if (el) el.textContent = new Date(Date.now() + 9 * 36e5).toISOString().slice(11, 19);
    const t = $("#gn-today"); if (t) t.textContent = `${dayKo(kstDay())}`;
    if (new Date().getSeconds() === 0 || !root.dataset.ticked) { tickClocks(root); root.dataset.ticked = "1"; }
  };
  clk(); const clkT = setInterval(clk, 1000);

  // ---------- 달력 ----------
  async function loadEditions() {
    try { const d = await api.newsEditions(); editions = [...(d.editions || []), ...(d.pending || []).map((p) => ({ day: p.day, items: p.items, status: "pending" }))]; } catch { editions = []; }
  }
  function drawCal() {
    const by = new Map(editions.map((e) => [e.day, e])), today = kstDay(), days = [];
    for (let i = 59; i >= 0; i--) days.push(kstDay(Date.now() - i * 864e5));
    const lead = new Date(days[0] + "T12:00:00+09:00").getUTCDay();
    cal.innerHTML = `<div class="gn-cal-h">Last 60 days <small>darker = more stories</small></div><div class="gn-cal-g">${WEEK.map((w) => `<b>${w}</b>`).join("")}${"<i></i>".repeat(lead)}${days.map((d) => {
      const n = by.get(d)?.items || 0, l = !n ? 0 : n < 6 ? 1 : n < 15 ? 2 : 3;
      return `<a href="#/news/${d}" class="gn-cd l${l}${d === today ? " today" : ""}${ed?.day === d ? " on" : ""}" title="${dayKo(d)}${n ? ` · ${n} stories` : ""}">${+d.slice(8)}</a>`;
    }).join("")}</div>`;
  }
  const toggleCal = (open = cal.hidden) => { if (open) drawCal(); cal.hidden = !open; $("#gn-date").setAttribute("aria-expanded", open); };
  const setView = (v) => { view = v; root.querySelectorAll("[data-view]").forEach((a) => a.setAttribute("aria-current", a.dataset.view === v ? "page" : "false")); $(".gn-daynav").classList.toggle("off", v !== "today"); };

  // ---------- 오늘 ----------
  async function loadEdition(day) {
    page.innerHTML = `<p class="gn-soft">Loading…</p>`;
    try { ed = await api.newsEdition(day === kstDay() ? "today" : day); }
    catch (e) { if (alive) page.innerHTML = `<p class="gn-soft">${esc(e.message)}</p>`; return; }
    if (!alive) return;
    items.clear();
    for (const it of [...(ed.front || []).map((f) => f.item), ...SECTIONS.slice(1).flatMap(([k]) => ed.sections?.[k] || []), ...(ed.late || [])]) if (it && !items.has(it.id)) items.set(it.id, it);
    $("#gn-date-t").textContent = day === kstDay() ? `Today · ${dayTab(day)}` : dayTab(day);
    const nav = (el, d) => { el.href = d ? "#/news/" + d : "#"; el.classList.toggle("off", !d); };
    nav($("#gn-prev"), ed.prev); nav($("#gn-next"), ed.next);
  }
  const secItems = (k) => {
    const all = k === "all" ? [...items.values()] : (ed.sections?.[k] || []).map((it) => items.get(it.id) || it);
    return all.filter((it) => !starred || mine(it).star).sort((a, b) => b.published_at - a.published_at);
  };
  const myCos = () => new Set((companies || []).filter((c) => c.mine).map((c) => c.key));
  const coName = (k) => (companies || []).find((c) => c.key === k)?.name || k;
  function row(it, num) {
    const m = mine(it), t = titleOf(it);
    const sub = sentences(it.summary).filter((s) => strip(s) !== strip(t)).join(" ");
    const g = geoOf(it);
    return `<li class="gn-item${m.read ? " read" : ""}${cur === it.id ? " on" : ""}" data-id="${it.id}">
      <a class="gn-item-a" href="#/news/item/${it.id}">
        <span class="gn-when">${num ? `<em class="gn-num${m.read ? " ok" : ""}">${m.read ? "✓" : num}</em>` : ""}<b>${esc(when(it))}</b>${g.length ? `<span>${g.slice(0, 2).join(" · ")}</span>` : ""}</span>
        <span class="gn-body">
          <span class="gn-t"${isKo(t) ? "" : ' lang="en"'}>${m.read ? "" : `<i class="gn-dot" aria-label="Unread"></i>`}${esc(t)}</span>
          ${sub ? `<span class="gn-s">${esc(sub)}</span>` : ""}
          <span class="gn-meta">${it.section ? `<span>${SEC_KO[it.section] || ""}</span>` : ""}<span>${esc(it.feed)}</span>${(it.co || []).slice(0, 2).map((k) => `<span class="gn-co">${esc(coName(k))}</span>`).join("")}</span>
          ${it.comments || it.disputed || m.others.length ? `<span class="gn-foot">${it.comments ? `<span class="gn-pill">${it.comments} comment${it.comments > 1 ? "s" : ""}</span>` : ""}${it.disputed ? `<span class="gn-pill hot">Disputed</span>` : ""}<span class="gn-avs">${avs(m.others)}</span></span>` : ""}
        </span>
      </a>
      <button class="gn-readbtn${m.read ? " on" : ""}" type="button" data-read="${it.id}" aria-pressed="${m.read}" aria-label="${m.read ? "Mark as unread" : "Mark as read"}" title="${m.read ? "Read · tap to undo" : "Mark as read"}">✓</button>
      <button class="gn-star${m.star ? " on" : ""}" type="button" data-star="${it.id}" aria-pressed="${m.star}" aria-label="Save">${starSvg()}</button>
    </li>`;
  }
  // 오늘 읽을 몫(할당량): 1면 → 분야마다 하나씩 → 최신 순으로 N편을 정해 줘요. N 은 사람마다(이 기기) 3 · 5 · 7
  const QUOTAS = [3, 5, 7];
  const quotaN = () => { const n = +((board && board.mine?.quota) || store.get("gn-quota") || 5); return QUOTAS.includes(n) ? n : 5; };
  // ---------- 읽기 대결 ----------
  let board = null, boardT = 0;
  async function loadBoard() {
    try { const d = await api.newsLeaderboard(); board = { ...d, mine: (d.board || []).find((b) => b.user_id === ctx.me.id) || null }; } catch { board = board || null; }
    return board;
  }
  const refreshBoard = () => { clearTimeout(boardT); boardT = setTimeout(async () => { await loadBoard(); if (view === "today") { const sc = $("#gn-scroll"), y = sc.scrollTop; draw(); sc.scrollTop = y; } else if (view === "board") drawBoard(); }, 600); };
  const rivals = () => (board?.board || []).map((b) => ({ ...b, u: user(b.user_id), me: b.user_id === ctx.me.id }));
  function raceHtml() {
    const rs = rivals(); if (!rs.length) return "";
    return `<div class="gn-race" aria-label="Today's race">${rs.map((r) => { const pct = Math.min(100, Math.round((r.today / r.quota) * 100)); return `<div class="gn-race-r${r.me ? " me" : ""}">
      <span class="gn-race-n"><i class="gn-av" style="--c:${r.u.color}">${esc((r.u.display_name || "?")[0])}</i>${esc(r.me ? "You" : r.u.display_name)}</span>
      <span class="gn-race-b"><i style="width:${pct}%"></i></span>
      <span class="gn-race-v" title="Read today / daily goal">${r.today}/${r.quota} read${r.streak ? ` <b title="Days in a row">🔥${r.streak}</b>` : ""}</span></div>`; }).join("")}<a class="gn-race-more" href="#/news/board">Leaderboard →</a></div>`;
  }
  function drawBoard() {
    if (!board) { page.innerHTML = `<section class="gn-hero"><h1 class="gn-h1 gn-h1-sec">Leaderboard</h1></section><p class="gn-soft">Loading…</p>`; loadBoard().then(() => view === "board" && drawBoard()); return; }
    const rs = rivals(), medal = ["🥇", "🥈", "🥉"];
    page.innerHTML = `
      <section class="gn-hero"><h1 class="gn-h1 gn-h1-sec">Leaderboard</h1><p class="gn-lab gn-talk-sub">Ranked by stories read this week (since Monday, KST) · 🔥 = days in a row hitting your daily goal</p></section>
      <div class="gn-feed">
        <ol class="gn-board">${rs.map((r, i) => `<li class="${r.me ? "me" : ""}">
          <span class="gn-board-rank">${medal[i] || i + 1}</span>
          <span class="gn-board-who"><i class="gn-av" style="--c:${r.u.color}">${esc((r.u.display_name || "?")[0])}</i><b>${esc(r.u.display_name)}${r.me ? " <small>(you)</small>" : ""}</b></span>
          <span class="gn-board-big"><b>${r.week}</b><small>this week</small></span>
          <span class="gn-board-stats">
            <span><b>${r.today}/${r.quota}</b><small>today</small></span>
            <span><b>${r.streak ? "🔥" + r.streak : "0"}</b><small>streak</small></span>
            <span><b>${r.best}</b><small>best day</small></span>
            <span><b>${r.total}</b><small>all time</small></span>
          </span></li>`).join("") || `<li class="gn-soft">No reads yet. Open a story to get on the board.</li>`}</ol>
        <p class="gn-lab">Your daily goal</p>
        <div class="gn-quota-n gn-quota-n-l" role="group" aria-label="Stories per day">${QUOTAS.map((q) => `<button type="button" data-quota="${q}" aria-pressed="${q === quotaN()}">${q}</button>`).join("")}</div>
        <div id="gn-usage"></div>
      </div>`;
    usageHtml().then((h) => { const el = page.querySelector("#gn-usage"); if (el && view === "board") el.innerHTML = h; });
  }
  function quotaPicks() {
    const n = quotaN(), out = [], seen = new Set();
    const add = (it) => { if (it && !seen.has(it.id) && out.length < n) { seen.add(it.id); out.push(items.get(it.id) || it); } };
    for (const f of ed.front || []) add(f.item);
    for (const [k] of SECTIONS.slice(1)) add((ed.sections?.[k] || []).slice().sort((x, y) => y.published_at - x.published_at)[0]);
    for (const it of [...items.values()].sort((x, y) => y.published_at - x.published_at)) add(it);
    return out;
  }
  function draw() {
    if (view !== "today" || !ed) return;
    const total = items.size, unread = [...items.values()].filter((it) => !mine(it).read).length;
    const mc = myCos();
    const quota = !starred && sec === "all" ? quotaPicks() : [];
    const done = quota.filter((it) => mine(it).read).length;
    const qIds = new Set(quota.map((it) => it.id));
    const picked = []; // Today 에는 회사 소식을 따로 띄우지 않아요 (Following 탭에서 봐요)
    const used = new Set([...qIds, ...picked.map((it) => it.id)]);
    const shown = secItems(sec).filter((it) => !used.has(it.id));
    list = [...quota, ...picked, ...shown].map((it) => it.id);
    const lead = (ed.front || []).find((f) => f.item);
    const head = ed.headline || (lead ? titleOf(lead.item) : "Today's stories");
    const counts = Object.fromEntries(SECTIONS.map(([k]) => [k, k === "all" ? total : (ed.sections?.[k] || []).length]));
    const status = ed.status === "closed" ? "Final edition" : ed.status === "draft" ? "Morning edition" : "Closes 11:10 PM";
    const pct = quota.length ? Math.round((done / quota.length) * 100) : 0;
    page.innerHTML = `
      <section class="gn-hero">
        <p class="gn-kicker gn-kicker-c"><span>${esc(status)}</span><span>${total} stories</span><b>${unread ? `${unread} unread` : "All read"}</b></p>
        <h1 class="gn-h1">${esc(head)}</h1>
        ${ed.lede ? `<p class="gn-lede">${esc(ed.lede)}</p>` : lead?.why ? `<p class="gn-lede">${esc(lead.why)}</p>` : ""}
      </section>
      <nav class="gn-seg" role="tablist" aria-label="Sections">${SECTIONS.map(([k, l]) => `<button type="button" role="tab" data-sec="${k}" aria-selected="${sec === k}">${l} <small>${counts[k]}</small></button>`).join("")}<button type="button" class="gn-seg-star" data-starred aria-pressed="${starred}">★ Saved</button></nav>
      <div class="gn-feed">
        ${quota.length ? `<section class="gn-quota${done >= quota.length ? " done" : ""}">
          <header class="gn-quota-h">
            <div><h2>Today's reading</h2><p>${done >= quota.length ? "Done for today. Nice work." : `Read these ${quota.length} today · ${done} of ${quota.length} done`}</p></div>
            <div class="gn-quota-n" role="group" aria-label="Stories per day">${QUOTAS.map((q) => `<button type="button" data-quota="${q}" aria-pressed="${q === quotaN()}">${q}</button>`).join("")}</div>
          </header>
          <div class="gn-bar-p" role="progressbar" aria-valuemin="0" aria-valuemax="${quota.length}" aria-valuenow="${done}"><i style="width:${pct}%"></i></div>
          ${raceHtml()}
          <ul class="gn-list gn-list-quota">${quota.map((it, i) => row(it, i + 1)).join("")}</ul>
        </section>` : ""}
        ${picked.length ? `<h2 class="gn-sec-h">From companies you follow</h2><ul class="gn-list">${picked.map((it) => row(it)).join("")}</ul>` : ""}
        ${quota.length || picked.length ? `<h2 class="gn-sec-h">${sec === "all" ? "More stories" : SEC_KO[sec]}</h2>` : ""}
        ${shown.length ? `<ul class="gn-list">${shown.map((it) => row(it)).join("")}</ul>` : `<p class="gn-empty">${starred ? "No saved stories yet." : sec === "ai" ? "No AI stories yet. New ones arrive at :10 every hour." : "No more stories."}</p>`}
        ${(ed.threads || []).length ? `<h2 class="gn-sec-h">Developing stories</h2><ul class="gn-threads">${ed.threads.map((t) => `<li><b>${esc(t.title)}</b><span>${esc(t.move || "")}</span></li>`).join("")}</ul>` : ""}
        <footer class="gn-end">${unread ? `${unread} unread` : "You're all caught up"}${ed.prev ? ` · <a href="#/news/${ed.prev}">${dayKo(ed.prev)}</a>` : ""}</footer>
      </div>`;
  }


  // ---------- 세계 ----------
  let geoLib = null;
  const loadScript = (src) => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Couldn't load the map.")); document.head.append(s); });
  async function loadGeo() {
    if (geoLib) return geoLib;
    for (const f of ["d3-array.min.js", "d3-geo.min.js", "topojson-client.min.js"]) await loadScript("/vendor/world/" + f);
    const [topo, lo, iso] = await Promise.all(["countries-50m.json", "countries-110m.json", "iso.json"].map((f) => fetch("/vendor/world/" + f).then((r) => r.json())));
    const fc = window.topojson.feature(topo, topo.objects.countries);
    const borders = window.topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    const byCode = new Map();
    for (const f of fc.features) { const c = iso[String(f.id).padStart(3, "0")]; if (c) { f.properties.code = c; byCode.set(c, f); } }
    // 끄는 동안엔 가벼운 110m 지도로 그리고, 멈추면 자세한 50m 로 다시 그려요 (렉 방지)
    const lfc = window.topojson.feature(lo, lo.objects.countries), lowBy = new Map();
    for (const f of lfc.features) { const c = iso[String(f.id).padStart(3, "0")]; if (c) lowBy.set(c, f); }
    return (geoLib = { d3: window.d3, land: fc, borders, byCode, low: { land: lfc, borders: window.topojson.mesh(lo, lo.objects.countries, (a, b) => a !== b), byCode: lowBy } });
  }
  async function drawWorld() {
    page.innerHTML = `<section class="gn-hero"><h1 class="gn-h1 gn-h1-sec">World</h1></section><p class="gn-soft">Loading map…</p>`;
    let g;
    try { [g, worldData] = await Promise.all([loadGeo(), api.newsWorld(worldDays)]); } catch (e) { if (alive) page.innerHTML = `<p class="gn-soft">${esc(e.message)}</p>`; return; }
    if (!alive || view !== "world") return;
    for (const it of worldData.items || []) if (!items.has(it.id)) items.set(it.id, it);
    const by = new Map();
    for (const it of worldData.items || []) for (const c of geoOf(it)) { if (!by.has(c)) by.set(c, []); by.get(c).push(it); }
    const ranked = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
    if (!worldSel || !by.has(worldSel)) worldSel = ranked[0]?.[0] || null;
    const DAYS = [[1, "Today"], [7, "7 days"], [30, "30 days"]];
    page.innerHTML = `
      <section class="gn-hero gn-hero-world">
        <h1 class="gn-h1 gn-h1-sec">World</h1>
        <p class="gn-seg gn-seg-plain">${DAYS.map(([d, l], i) => `${i ? "<span>/</span>" : ""}<button type="button" data-wd="${d}" aria-pressed="${worldDays === d}">${l}</button>`).join("")}<span class="gn-lab-inline">${by.size} countries · ${(worldData.items || []).length} stories</span></p>
      </section>
      <div class="gn-world">
        <div class="gn-globe-box">
          <div class="gn-globe"><canvas id="gn-globe" aria-label="Globe of countries in the news. Drag to rotate, tap a country."></canvas><i class="gn-corner a"></i><i class="gn-corner b"></i></div>
          <p class="gn-coord"><span>LAT <b id="gn-lat"></b></span><span>LON <b id="gn-lon"></b></span><span>Drag to rotate · tap a country</span></p>
        </div>
        <div class="gn-country" id="gn-country"></div>
      </div>
      <p class="gn-lab">All countries</p>
      <div class="gn-ranks" id="gn-ranks">${ranked.map(([c, its]) => `<button type="button" data-cc="${c}" aria-pressed="${c === worldSel}"><span>${c}</span><span>${esc(countryKo(c))}</span><span>${its.length}</span></button>`).join("") || `<p class="gn-soft">No stories with a country in this range.</p>`}</div>`;
    const cv = page.querySelector("#gn-globe"), cx = cv.getContext("2d"), d3 = g.d3;
    const css = (n) => getComputedStyle(page).getPropertyValue(n).trim();
    const counts = new Map(ranked.map(([c, its]) => [c, its.length])), max = Math.max(1, ...counts.values());
    const cent = (c) => (c === "BE" ? [4.4, 50.8] : g.byCode.has(c) ? d3.geoCentroid(g.byCode.get(c)) : null);
    let rot = [0, -25], W = 0, proj, path, raf = 0;
    const size = () => { const box = cv.parentElement.getBoundingClientRect(); W = Math.round(box.width); const dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = W * dpr; cv.style.height = W + "px"; cx.setTransform(dpr, 0, 0, dpr, 0, 0); proj = d3.geoOrthographic().scale(W / 2 - 4).translate([W / 2, W / 2]).clipAngle(90).precision(.4); path = d3.geoPath(proj, cx); };
    const focus = (c) => { const p = cent(c); if (p) rot = [-p[0], -p[1] * .8]; };
    if (worldSel) focus(worldSel);
    const C = { bg: css("--g-bg"), land: css("--g-land"), line: css("--g-line"), ink: css("--g-ink"), mute: css("--g-ink3"), red: css("--g-red") };
    const fillOf = new Map([...counts].map(([c, n]) => [c, `color-mix(in srgb, ${C.red} ${Math.round(14 + 40 * n / max)}%, ${C.land})`]));
    const grat = d3.geoGraticule10();
    let lowRes = false;
    const paint = () => {
      raf = 0; proj.rotate(rot); cx.clearRect(0, 0, W, W);
      const { bg, land, line, ink, mute, red } = C, G = lowRes ? g.low : g;
      cx.beginPath(); path({ type: "Sphere" }); cx.fillStyle = bg; cx.fill();
      cx.beginPath(); path(grat); cx.strokeStyle = line; cx.lineWidth = .7; cx.stroke();
      cx.beginPath(); path(G.land); cx.fillStyle = land; cx.fill();
      for (const c of counts.keys()) { const f = G.byCode.get(c); if (!f) continue; cx.beginPath(); path(f); cx.fillStyle = fillOf.get(c); cx.fill(); }
      cx.beginPath(); path(G.borders); cx.strokeStyle = mute; cx.lineWidth = .5; cx.stroke();
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
      box.innerHTML = worldSel ? `<p class="gn-lab">Selected</p><h2 class="gn-cn">${esc(countryKo(worldSel))}</h2><p class="gn-lab">${worldSel} · ${its.length} stories</p><ul class="gn-list gn-list-tight">${its.map((it) => row(it)).join("")}</ul>` : `<p class="gn-soft">Tap a country.</p>`;
      page.querySelectorAll("#gn-ranks [data-cc]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cc === worldSel));
      list = its.map((it) => it.id);
    };
    size(); paint(); showCountry();
    let drag = null, spin = 0;
    cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, r: rot.slice(), moved: false }; lowRes = true; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 3) drag.moved = true; const k = 180 / W; rot = [drag.r[0] + dx * k, Math.max(-85, Math.min(85, drag.r[1] - dy * k))]; ask(); };
    cv.onpointerup = (e) => {
      const moved = drag?.moved; drag = null; lowRes = false; ask(); if (moved) return;
      const b = cv.getBoundingClientRect(), p = proj.invert([e.clientX - b.left, e.clientY - b.top]); if (!p) return;
      const hit = [...counts.keys()].find((c) => g.byCode.get(c) && d3.geoContains(g.byCode.get(c), p));
      if (hit) { worldSel = hit; showCountry(); ask(); }
    };
    const onPick = (c) => { worldSel = c; const from = rot.slice(), p = cent(c); if (!p) { showCountry(); ask(); return; } const to = [-p[0], -p[1] * .8], t0 = performance.now(); cancelAnimationFrame(spin);
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const step = (t) => { const k = reduce ? 1 : Math.min(1, (t - t0) / 600), e2 = 1 - Math.pow(1 - k, 3); const dl = ((to[0] - from[0] + 540) % 360) - 180; rot = [from[0] + dl * e2, from[1] + (to[1] - from[1]) * e2]; lowRes = k < 1; paint(); if (k < 1) spin = requestAnimationFrame(step); };
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
    coKey = key && companies.some((c) => c.key === key) ? key : coKey && companies.some((c) => c.key === coKey) ? coKey : mineList[0]?.key || companies[0]?.key;
    if (!coKey) { page.innerHTML = `<p class="gn-soft">Couldn't load companies.</p>`; return; }
    store.set("gn-co", coKey);
    const c = companies.find((x) => x.key === coKey);
    const tabs = [...mineList, ...(c.mine ? [] : [c])];
    page.innerHTML = `
      <nav class="gn-cotabs" role="tablist" aria-label="Companies you follow">${tabs.map((x) => `<a role="tab" href="#/news/co/${x.key}" aria-selected="${x.key === coKey}">${esc(x.name)}${x.today ? ` <small>${x.today}</small>` : ""}</a>`).join("")}<button type="button" class="gn-coadd" data-coadd aria-expanded="false">Manage follows</button></nav>
      <div class="gn-copick" id="gn-copick" hidden>${["company", "topic"].map((kind) => { const xs = companies.filter((x) => (x.kind || "company") === kind); return xs.length ? `<div class="gn-copick-g"><p class="gn-lab">${kind === "topic" ? "Topics" : "Companies"}</p><div class="gn-copick-l">${xs.map((x) => `<span class="gn-copick-i${x.mine ? " on" : ""}"><a href="#/news/co/${x.key}">${esc(x.name)}</a><button type="button" data-cosub="${x.key}" aria-pressed="${!!x.mine}">${x.mine ? "Unfollow" : "Follow"}</button></span>`).join("")}</div></div>` : ""; }).join("")}</div>
      <div class="gn-cols">
        <aside class="gn-side">
          <p class="gn-kicker"><span>${c.mine ? "Following" : "Not following"}</span><span id="gn-co-n">…</span></p>
          <h1 class="gn-h1 gn-coname">${esc(c.name)}</h1>
          <button type="button" class="gn-sub${c.mine ? " on" : ""}" data-cosub="${c.key}" aria-pressed="${!!c.mine}">${c.mine ? "Unfollow" : "Follow"}</button>
          <p class="gn-note">${c.mine ? "You follow this. Its stories collect here." : "Follow to collect its stories here."}${(c.subs || []).filter((u) => u !== ctx.me.id).length ? ` Also following: ${(c.subs || []).filter((u) => u !== ctx.me.id).map((u) => esc(user(u).display_name)).join(", ")}` : ""}</p>
        </aside>
        <div class="gn-main" id="gn-co-list"><p class="gn-soft">Loading…</p></div>
      </div>`;
    try { coData = await api.newsCompany(coKey); } catch (e) { if (alive) page.querySelector("#gn-co-list").innerHTML = `<p class="gn-soft">${esc(e.message)}</p>`; return; }
    if (!alive || view !== "co" || coData.company?.key !== coKey) return;
    for (const it of coData.items || []) items.set(it.id, { ...items.get(it.id), ...it });
    const its = (coData.items || []).map((it) => items.get(it.id));
    list = its.map((it) => it.id);
    page.querySelector("#gn-co-n").textContent = `${its.length} stories · last 14 days`;
    page.querySelector("#gn-co-list").innerHTML = its.length ? `<ul class="gn-list">${its.map((it) => row(it)).join("")}</ul>` : `<p class="gn-empty">No stories about this company in the last 14 days.</p>`;
  }
  async function toggleSub(key) {
    const c = companies.find((x) => x.key === key); if (!c) return;
    const on = !c.mine; c.mine = on; c.subs = on ? [...(c.subs || []), ctx.me.id] : (c.subs || []).filter((u) => u !== ctx.me.id);
    try { await api.newsCompanySub(key, on); toast(on ? `Following ${c.name}.` : `Unfollowed ${c.name}.`); } catch (err) { c.mine = !on; toast(err.message, "err"); }
    if (view === "co") { const open = !page.querySelector("#gn-copick")?.hidden; await drawCo(coKey); if (open) { const p = page.querySelector("#gn-copick"); if (p) p.hidden = false; } }
  }

  // ---------- 기사 시트 ----------
  async function openItem(id) {
    cur = id;
    page.querySelectorAll("[data-id]").forEach((el) => el.classList.toggle("on", el.dataset.id === id));
    sheet.hidden = false; scrim.hidden = false; void sheet.offsetWidth; gn.classList.add("sheet-on"); // 한 번 배치한 뒤 바로 켜야 미끄러짐이 보이고, 다음 프레임을 기다리다 늦게 켜지는 일도 없어요
    const known = items.get(id);
    sheet.innerHTML = `<div class="gn-sh">${sheetHead()}<p class="gn-soft">Opening…</p></div>`;
    let d;
    try { d = await api.newsItem(id); } catch (e) { sheet.innerHTML = `<div class="gn-sh">${sheetHead()}<p class="gn-soft">${esc(e.message)}</p></div>`; return; }
    if (!alive || cur !== id) return;
    const it = { ...known, ...d.item, summary: known?.summary || d.item.summary, title_ko: known?.title_ko || d.item.title_ko };
    const t = titleOf(it), sum = sentences(it.summary).filter((s) => strip(s) !== strip(t));
    const star = () => (it.stars || []).includes(ctx.me.id);
    sheet.innerHTML = `<div class="gn-sh">
      ${sheetHead()}
      <span class="gn-meta"><span>${esc(it.feed)}</span><span>${it.dated === 0 ? "No date" : `Published ${dayShort(kstDay(it.published_at))} ${hhmm(it.published_at)} KST`}</span>${it.section ? `<span class="gn-tag">${SEC_KO[it.section] || ""}</span>` : ""}</span>
      <h2 class="gn-sh-t">${esc(t)}</h2>
      ${t !== it.title ? `<p class="gn-sh-orig" lang="en">${esc(it.title)}</p>` : ""}
      ${sum.length ? `<section class="gn-card"><h3>Summary</h3><ul>${sum.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : `<section class="gn-card" id="gn-sum"><p class="gn-soft">Writing a summary…</p></section>`}
      <div class="gn-acts">
        <button class="gn-btn gn-readbtn-l${mine(it).read ? " on" : ""}" type="button" id="gn-sh-read" aria-pressed="${mine(it).read}">${mine(it).read ? "✓ Read" : "Mark as read"}</button>
        <button class="gn-btn${star() ? " on" : ""}" type="button" id="gn-sh-star" aria-pressed="${star()}">${starSvg()}<span>${star() ? "Saved" : "Save"}</span></button>
        <button class="gn-btn" type="button" id="gn-sh-deep">${d.deep ? "Deep dive ✓" : "Deep dive"}</button>
        <a class="gn-btn" href="${esc(it.url)}" target="_blank" rel="noopener">Original ${icon.external(13)}</a>
        <span class="gn-avs" title="Read by">${avs((it.readers || []).filter((u) => u !== ctx.me.id))}</span>
      </div>
      ${d.body ? `<details class="gn-card gn-full"><summary>Full text <small>from the outlet's feed</small></summary><div class="gn-full-b">${esc(d.body).replace(/\n+/g, "<br><br>")}</div></details>` : ""}
      <section class="gn-card" id="gn-deep"${d.deep ? "" : " hidden"}></section>
      <section class="gn-talk"><h3>Comments <small id="gn-talk-n"></small></h3>
        <form class="gn-compose" id="gn-compose"><textarea name="b" rows="2" maxlength="2000" placeholder="Add a comment"></textarea><button class="gn-btn pri" type="submit">Post</button></form>
        <div id="gn-talk"></div>
      </section>
    </div>`;
    const paintDeep = (deep) => { const el = sheet.querySelector("#gn-deep"); el.hidden = false; el.innerHTML = `<h3>Deep dive</h3><ul>${(deep.summary || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>${deep.why ? `<p class="gn-why">Why it matters — ${esc(deep.why)}</p>` : ""}`; };
    if (d.deep) paintDeep(d.deep);
    sheet.querySelector("#gn-sh-deep").addEventListener("click", async (e) => {
      if (d.deep) return; const b = e.currentTarget; b.disabled = true; b.textContent = "Reading…";
      try { const r2 = await api.newsDeep(id); d.deep = r2.deep || r2; paintDeep(d.deep); b.textContent = "Deep dive ✓"; }
      catch (err) { toast(err.message, "err"); b.disabled = false; b.textContent = "Deep dive"; }
    });
    sheet.querySelector("#gn-sh-star").addEventListener("click", () => toggleStar(id));
    sheet.querySelector("#gn-sh-read").addEventListener("click", () => toggleRead(id));
    // 아직 요약이 없으면 이 기사 하나만 바로 요약해요 (매시 정각 차례를 기다리지 않게)
    if (!sum.length) api.newsSummarize(id).then((r2) => {
      if (!alive || cur !== id || !r2?.item?.summary) return;
      const k = items.get(id); if (k) Object.assign(k, r2.item);
      const lines = sentences(r2.item.summary).filter((x) => strip(x) !== strip(t));
      const box = sheet.querySelector("#gn-sum"); if (box) box.innerHTML = `<h3>Summary</h3><ul>${lines.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      repaint(id);
    }).catch(() => { const box = sheet.querySelector("#gn-sum"); if (box) box.innerHTML = `<p class="gn-soft">Couldn't write a summary right now. Open the original for the full story.</p>`; });
    talk(id, d.comments || []);
    // 읽음은 자동으로 찍지 않아요 — 다 읽고 나서 직접 "Mark as read" 를 눌러요 (읽기 대결 점수가 정직하게)
    sheet.scrollTop = 0;
  }
  const sheetHead = () => `<div class="gn-sh-top"><span class="gn-grab" aria-hidden="true"></span><button class="gn-x" type="button" data-close aria-label="Close">${icon.x(16)}</button></div>`;
  function closeSheet() {
    cur = null; gn.classList.remove("sheet-on"); scrim.hidden = true;
    setTimeout(() => { if (!cur) sheet.hidden = true; }, 220);
    page.querySelectorAll(".on[data-id]").forEach((el) => el.classList.remove("on"));
  }
  function repaint(id) {
    const it = items.get(id); if (!it) return;
    if (view === "today") { const sc = $("#gn-scroll"), y = sc.scrollTop; draw(); sc.scrollTop = y; return; } // 오늘 읽을 몫 진행 막대 · 번호까지 같이 바뀌게
    page.querySelectorAll(`li.gn-item[data-id="${id}"]`).forEach((el) => { const tmp = document.createElement("ul"); tmp.innerHTML = row(it); el.replaceWith(tmp.firstElementChild); });
    const k = page.querySelector(".gn-kicker b"); const n = [...items.values()].filter((x) => !mine(x).read).length;
    if (k) k.textContent = n ? `${n} unread` : "All read";
  }
  async function toggleRead(id) {
    const it = items.get(id) || { readers: [] }, on = !(it.readers || []).includes(ctx.me.id);
    it.readers = on ? [...(it.readers || []), ctx.me.id] : (it.readers || []).filter((u) => u !== ctx.me.id);
    if (items.has(id)) items.set(id, it);
    const b = sheet.querySelector("#gn-sh-read"); if (b && cur === id) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.textContent = on ? "✓ Read" : "Mark as read"; }
    repaint(id);
    try { await api.newsMark(id, { read: on }); refreshBoard(); } catch (err) { toast(err.message, "err"); }
  }
  async function toggleStar(id) {
    const it = items.get(id) || { stars: [] }, on = !(it.stars || []).includes(ctx.me.id);
    it.stars = on ? [...(it.stars || []), ctx.me.id] : (it.stars || []).filter((u) => u !== ctx.me.id);
    repaint(id);
    const b = sheet.querySelector("#gn-sh-star"); if (b && cur === id) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.querySelector("span").textContent = on ? "Saved" : "Save"; }
    try { await api.newsMark(id, { flagged: on }); } catch (err) { toast(err.message, "err"); }
  }

  // ---------- 토론 ----------
  function talk(itemId, comments) {
    let all = comments.slice();
    const box = sheet.querySelector("#gn-talk");
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 6e4)); return m < 60 ? m + "m ago" : m < 2880 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"; };
    const KIND = { memo: "Comment", rebut: "Disagrees", agree: "Agrees" };
    const head = (c, ai) => { const u = user(c.user_id); return ai ? `<i class="gn-av ai">AI</i><b>AI counterpoint</b><span>asked by ${esc(u.display_name)} · ${ago(c.created_at)}</span>` : `<i class="gn-av" style="--c:${u.color}">${esc((u.display_name || "?")[0])}</i><b>${esc(u.display_name)}</b><span>${KIND[c.stance] || ""} · ${ago(c.created_at)}</span>`; };
    const del = (c) => (c.user_id === ctx.me.id && !c.ai ? `<button class="gn-del" data-del="${c.id}" type="button" aria-label="Delete">${icon.trash(13)}</button>` : "");
    const body = (s) => esc(s).replace(/\n?^&gt; (.+)$\n?/gm, "<q>$1</q>").replace(/\n/g, "<br>");
    const paint = () => {
      const memos = all.filter((c) => !c.parent_id);
      sheet.querySelector("#gn-talk-n").textContent = all.length ? `${all.length}${all.some((c) => c.stance === "rebut") ? " · Disputed" : ""}` : "";
      box.innerHTML = memos.map((m) => {
        const kids = all.filter((c) => c.parent_id === m.id), hasAi = kids.some((k) => k.ai);
        return `<article class="gn-memo" data-id="${m.id}"><header>${head(m)}${del(m)}</header><p>${body(m.body)}</p>
          <div class="gn-memo-acts"><button type="button" class="gn-chip r" data-reply="rebut">Disagree</button><button type="button" class="gn-chip g" data-reply="agree">Agree</button>${hasAi ? "" : `<button type="button" class="gn-chip" data-ai="${m.id}">Get AI counterpoint</button>`}</div>
          ${kids.map((k) => `<div class="gn-reply ${k.stance}${k.ai ? " ai" : ""}"><header>${head(k, k.ai)}${del(k)}</header><p>${body(k.body)}</p></div>`).join("")}</article>`;
      }).join("") || `<p class="gn-soft">No comments yet.</p>`;
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
        memo.insertAdjacentHTML("beforeend", `<form class="gn-rform ${stance}"><textarea rows="2" maxlength="2000" placeholder="${stance === "rebut" ? "What's wrong with it?" : "What's right about it?"}"></textarea><button class="gn-btn" type="submit">${stance === "rebut" ? "Disagree" : "Agree"}</button></form>`);
        const f = memo.querySelector(".gn-rform"); f.querySelector("textarea").focus();
        f.addEventListener("submit", async (ev) => {
          ev.preventDefault(); const b = f.querySelector("textarea").value.trim(); if (!b) return;
          try { const { comment } = await api.newsComment(itemId, { body: b, stance, parent_id: memo.dataset.id }); all.push(comment); paint(); sync(); } catch (err) { toast(err.message, "err"); }
        });
        return;
      }
      const ai = e.target.closest("[data-ai]");
      if (ai) { ai.disabled = true; ai.textContent = "Reading the article…"; try { const { comment } = await api.newsAiRebut(ai.dataset.ai); all.push(comment); paint(); sync(); } catch (err) { toast(err.message, "err"); ai.disabled = false; ai.textContent = "Get AI counterpoint"; } return; }
      const d = e.target.closest("[data-del]");
      if (d) { try { await api.newsDelComment(d.dataset.del); all = all.filter((c) => c.id !== d.dataset.del && c.parent_id !== d.dataset.del); paint(); sync(); } catch (err) { toast(err.message, "err"); } }
    });
  }

  // ---------- 댓글 모아 보기 (#/news/talk) — 친구들이 어느 기사에 무슨 말을 남겼는지 한곳에 ----------
  const TALK_KIND = { memo: "commented", rebut: "disagreed", agree: "agreed" };
  const talkSeen = () => +(store.get("gn-talk-seen") || 0);
  async function loadTalk() { try { return (await api.newsRecentComments(50)).comments || []; } catch { return null; } }
  function paintBadge(list) {
    const b = $("#gn-talk-badge"); if (!b || !list) return;
    const n = list.filter((c) => c.user_id !== ctx.me.id && c.created_at > talkSeen()).length;
    b.hidden = !n; b.textContent = n;
  }
  async function drawTalk() {
    page.innerHTML = `<section class="gn-hero"><h1 class="gn-h1 gn-h1-sec">Comments</h1></section><p class="gn-soft">Loading…</p>`;
    const list = await loadTalk();
    if (!alive || view !== "talk") return;
    if (!list) { page.innerHTML = `<p class="gn-soft">Couldn't load comments.</p>`; return; }
    const seen = talkSeen();
    store.set("gn-talk-seen", Date.now()); paintBadge([]);
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 6e4)); return m < 60 ? m + "m ago" : m < 2880 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"; };
    page.innerHTML = `
      <section class="gn-hero"><h1 class="gn-h1 gn-h1-sec">Comments</h1><p class="gn-lab gn-talk-sub">Every comment, disagreement and AI counterpoint · newest first</p></section>
      <ul class="gn-talklist">${list.map((c) => { const u = user(c.user_id); return `<li class="${c.user_id !== ctx.me.id && c.created_at > seen ? "new" : ""}">
        <a href="#/news/item/${c.item_id}">
          <span class="gn-talk-who">${c.ai ? `<i class="gn-av ai">AI</i><b>AI counterpoint</b>` : `<i class="gn-av" style="--c:${u.color}">${esc((u.display_name || "?")[0])}</i><b>${esc(u.display_name)}</b>`}<span class="gn-talk-kind ${c.stance || "memo"}">${c.ai ? "replied" : TALK_KIND[c.stance] || "commented"}</span><span>${ago(c.created_at)}</span></span>
          <span class="gn-talk-body">${esc(c.body).slice(0, 400)}</span>
          <span class="gn-talk-on">on <u>${esc(c.item_title || "a story")}</u></span>
        </a></li>`; }).join("") || `<li class="gn-soft">No comments yet. Open any story and add the first one.</li>`}</ul>`;
  }

  // ---------- 내 서재 (#/news/library/starred|read) — 별표한 기사 · 읽은 기사, 날짜와 상관없이 전부 ----------
  let libKind = "starred";
  async function drawLibrary(kind) {
    libKind = kind === "read" ? "read" : "starred";
    const head = `<section class="gn-hero"><h1 class="gn-h1 gn-h1-sec">My Library</h1></section>
      <nav class="gn-seg" role="tablist" aria-label="Library"><a role="tab" class="gn-segl" href="#/news/library/starred" aria-selected="${libKind === "starred"}">★ Starred</a><a role="tab" class="gn-segl" href="#/news/library/read" aria-selected="${libKind === "read"}">✓ Read</a></nav>`;
    page.innerHTML = head + `<p class="gn-soft gn-feed">Loading…</p>`;
    let d; try { d = await api.newsLibrary(libKind); } catch (e) { if (alive) page.innerHTML = head + `<p class="gn-soft gn-feed">${esc(e.message)}</p>`; return; }
    if (!alive || view !== "library" || d.kind !== libKind) return;
    for (const it of d.items || []) items.set(it.id, { ...items.get(it.id), ...it });
    const its = (d.items || []).map((it) => items.get(it.id));
    list = its.map((it) => it.id);
    const groups = new Map();
    for (const it of its) { const k = kstDay(it.marked_at || it.published_at); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    page.innerHTML = head + `<div class="gn-feed">
      <p class="gn-lab gn-talk-sub">${its.length} ${libKind === "read" ? "stories you marked as read" : "starred stories"} · grouped by the day you ${libKind === "read" ? "read" : "starred"} them</p>
      ${its.length ? [...groups].map(([day, g]) => `<h2 class="gn-sec-h">${day === kstDay() ? "Today" : dayKo(day)} <small>${g.length}</small></h2><ul class="gn-list">${g.map((it) => row(it)).join("")}</ul>`).join("")
        : `<p class="gn-empty">${libKind === "read" ? "Nothing here yet. Tap ✓ on a story when you've finished it." : "Nothing here yet. Tap ★ on a story to keep it here."}</p>`}
    </div>`;
  }

  // ---------- 지난 기사 (#/news/history) — 날짜별로 거슬러 올라가며 읽고, 검색도 해요 ----------
  let hist = { days: [], next: null, q: "" };
  async function drawHistory(more) {
    if (!more) hist = { days: [], next: null, q: hist.q };
    const head = `<section class="gn-hero"><h1 class="gn-h1 gn-h1-sec">History</h1></section>
      <form class="gn-search gn-feed" id="gn-hsearch" role="search"><input id="gn-hq" type="search" placeholder="Search past stories (title or summary)" value="${esc(hist.q)}" autocomplete="off"><button type="submit">Search</button></form>`;
    if (!more) page.innerHTML = head + `<p class="gn-soft gn-feed">Loading…</p>`;
    let d;
    try { d = hist.q ? await api.newsSearch(hist.q) : await api.newsHistory(hist.next); } catch (e) { if (alive) page.innerHTML = head + `<p class="gn-soft gn-feed">${esc(e.message)}</p>`; return; }
    if (!alive || view !== "history") return;
    if (hist.q) { hist.days = [{ day: "results", items: d.items || [] }]; hist.next = null; }
    else { hist.days.push(...(d.days || [])); hist.next = d.next_before || null; }
    for (const g of hist.days) for (const it of g.items) items.set(it.id, { ...items.get(it.id), ...it });
    list = hist.days.flatMap((g) => g.items.map((it) => it.id));
    const y = $("#gn-scroll").scrollTop;
    page.innerHTML = head + `<div class="gn-feed">
      ${hist.q ? `<p class="gn-lab gn-talk-sub">${(d.items || []).length} results for “${esc(hist.q)}” · <a href="#" data-hclear>Clear</a></p>` : ""}
      ${hist.days.map((g) => `<h2 class="gn-sec-h">${g.day === "results" ? "Results" : g.day === kstDay() ? "Today" : dayKo(g.day)} <small>${g.items.length}</small>${g.day !== "results" ? ` <a class="gn-sec-a" href="#/news/${g.day}">Open that day's paper →</a>` : ""}</h2><ul class="gn-list">${g.items.map((it) => row(items.get(it.id))).join("")}</ul>`).join("") || `<p class="gn-empty">No stories found.</p>`}
      ${hist.next ? `<button type="button" class="gn-more" data-hmore>Load older days</button>` : ""}
    </div>`;
    if (more) $("#gn-scroll").scrollTop = y;
    page.querySelector("#gn-hsearch").addEventListener("submit", (e) => { e.preventDefault(); hist.q = page.querySelector("#gn-hq").value.trim(); if (hist.q && hist.q.length < 2) return toast("Type at least 2 characters."); drawHistory(); });
  }

  // ---------- AI 토큰 사용량 (Leaderboard 아래) ----------
  async function usageHtml() {
    let u; try { u = await api.newsUsage(30); } catch { return ""; }
    const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n || 0));
    const days = (u.days || []).slice().sort((a, b) => (a.day < b.day ? -1 : 1));
    const max = Math.max(1, ...days.map((d) => d.in_tokens + d.out_tokens));
    const t = u.total || {}, td = u.today || {};
    return `<h2 class="gn-sec-h">AI usage <small>last 30 days</small></h2>
      <div class="gn-usage">
        <div class="gn-usage-k"><span><b>${fmt((td.in_tokens || 0) + (td.out_tokens || 0))}</b><small>tokens today · ${td.calls || 0} calls</small></span><span><b>${fmt((t.in_tokens || 0) + (t.out_tokens || 0))}</b><small>tokens · 30 days</small></span><span><b>${fmt(t.in_tokens)}</b><small>input</small></span><span><b>${fmt(t.out_tokens)}</b><small>output</small></span></div>
        <div class="gn-usage-bars" aria-label="Tokens per day">${days.map((d) => `<i style="height:${Math.max(2, Math.round(((d.in_tokens + d.out_tokens) / max) * 100))}%" title="${d.day}: ${fmt(d.in_tokens + d.out_tokens)} tokens, ${d.calls} calls"></i>`).join("")}</div>
        <table class="gn-usage-t"><thead><tr><th>What</th><th>Calls</th><th>Input</th><th>Output</th></tr></thead><tbody>${(u.by_feature || []).map((f) => `<tr><td>${esc(f.feature)}</td><td>${f.calls}</td><td>${fmt(f.in_tokens)}</td><td>${fmt(f.out_tokens)}</td></tr>`).join("")}</tbody></table>
        <table class="gn-usage-t"><thead><tr><th>Model</th><th>Calls</th><th>Input</th><th>Output</th></tr></thead><tbody>${(u.by_provider || []).map((f) => `<tr><td>${esc(f.provider || "?")} · ${esc(f.model || "")}</td><td>${f.calls}</td><td>${fmt(f.in_tokens)}</td><td>${fmt(f.out_tokens)}</td></tr>`).join("")}</tbody></table>
        <p class="gn-note">Counted from each provider's own usage numbers. Rows marked estimated (when a provider doesn't report usage) are approximated from text length.</p>
      </div>`;
  }

  // ---------- 이벤트 ----------
  const backHash = () => (view === "history" ? "#/news/history" : view === "library" ? "#/news/library/" + libKind : view === "board" ? "#/news/board" : view === "talk" ? "#/news/talk" : view === "world" ? "#/news/world" : view === "co" ? "#/news/co/" + coKey : ed && ed.day !== kstDay() ? "#/news/" + ed.day : "#/news");
  const back = () => ctx.go(backHash());
  const onClick = (e) => {
    const s = e.target.closest("[data-star]"); if (s) { e.preventDefault(); toggleStar(s.dataset.star); return; }
    if (e.target.closest("[data-hmore]")) { drawHistory(true); return; }
    if (e.target.closest("[data-hclear]")) { e.preventDefault(); hist.q = ""; drawHistory(); return; }
    const rd = e.target.closest("[data-read]"); if (rd) { e.preventDefault(); toggleRead(rd.dataset.read); return; }
    if (e.target.closest("[data-close]") || e.target === scrim) { e.preventDefault(); back(); return; }
    const b = e.target.closest("[data-sec]"); if (b) { sec = b.dataset.sec; store.set("gn-sec", sec); draw(); return; }
    if (e.target.closest("[data-starred]")) { starred = !starred; draw(); return; }
    const q = e.target.closest("[data-quota]"); if (q) { store.set("gn-quota", q.dataset.quota); if (board?.mine) board.mine.quota = +q.dataset.quota; api.newsPrefs({ quota: +q.dataset.quota }).then(refreshBoard).catch((err) => toast(err.message, "err")); view === "board" ? drawBoard() : draw(); return; }
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
    else if (e.key === "r" && cur) toggleRead(cur);
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
    const next = rr.sub === "world" ? "world" : rr.sub === "co" ? "co" : rr.sub === "talk" ? "talk" : rr.sub === "board" ? "board" : rr.sub === "library" ? "library" : rr.sub === "history" ? "history" : "today";
    const changed = next !== view;
    if (changed) worldCleanup?.(), (worldCleanup = null);
    setView(next);
    if (next === "world") { if (changed || !page.querySelector("#gn-globe")) drawWorld(); }
    else if (next === "co") { await loadCompanies(); drawCo(rr.id); }
    else if (next === "talk") drawTalk();
    else if (next === "board") drawBoard();
    else if (next === "library") drawLibrary(rr.id);
    else if (next === "history") { if (changed || !hist.days.length) drawHistory(); }
    else {
      const day = rr.day && DAY_RE.test(rr.day) ? rr.day : kstDay();
      store.set("gn-day", day);
      // 대결 막대도 첫 화면에 같이 그려요 — 나중에 다시 그리면 누르던 기사가 바뀌어요 (최대 1.5초만 기다려요)
      const fresh = !ed || ed.day !== day;
      await Promise.all([fresh ? loadEdition(day) : null, board ? null : Promise.race([loadBoard(), new Promise((r) => setTimeout(r, 1500))])]);
      if (!fresh && changed) for (const it of [...(ed.front || []).map((f) => f.item), ...SECTIONS.slice(1).flatMap(([k]) => ed.sections?.[k] || [])]) if (it && !items.has(it.id)) items.set(it.id, it);
      draw();
      if (changed) $("#gn-scroll").scrollTop = 0;
    }
  }
  inst = { route };
  loadEditions();
  loadTalk().then(paintBadge);
  // 구독한 회사가 있을 때만 다시 그려요 — 없으면 화면이 그대로라 누르던 기사가 바뀌지 않게
  loadCompanies().then(() => { if (view === "today" && myCos().size && !cur) draw(); });
  route(r);
  api.newsSeen?.().catch(() => {});
  return () => { alive = false; inst = null; clearInterval(clkT); worldCleanup?.(); document.removeEventListener("keydown", onKey); portal.remove(); };
}

function starSvg() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.6l-5.1 2.6 1-5.6-4.1-4 5.7-.8z" fill="currentColor"/></svg>`;
}

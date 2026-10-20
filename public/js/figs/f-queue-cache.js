// 그림: 큐는 “접수했어요”, 캐시는 “아까 그거요” (Dev Flow 05 아키텍처 — 카드 8)
//   opts.mode = "cache"(기본) | "queue"
//   cache: 요청은 캐시부터 봐요 → 없으면(놓침) DB 에서 읽어 캐시에 한 부 → 다음엔 적중. 바뀐 데이터는 지워야 해요. 마지막은 '두는 시간' 다이얼로 직접.
//   queue: 녹음을 올리면 바로 “접수됐어요” → 큐에 줄 서고 → 워커가 같은 속도로 하나씩 → 끝나면 알림. 몰릴 때 · 넘칠 때를 직접.
//   흐름은 kit.loop 로 돌고(화면 밖이면 멈춤), 움직임 줄이기를 켠 사람에겐 같은 계산을 앞당겨 한 장면으로 보여 줘요.
import { svg, el, set, g, text, line, circle, rect, path, arrowHead, ease, reduced, loop, slider, readout, rng, C } from "./kit.js";

const WW = 560, NW = 420, H = 330; // 넓은 칸 · 좁은 칸(폰 · 튜터, f.narrow) 너비 — 좁으면 viewBox 를 줄여 글씨가 커 보여요

// ---------- 작은 도구 (이 그림 안에서만) ----------
const tw = (s, size) => { let w = 0; for (const ch of String(s)) w += /[㄰-㆏가-힯]/.test(ch) ? 1 : /[\s.,:·'|!()]/.test(ch) ? 0.32 : /[A-Z0-9mw#?]/.test(ch) ? 0.64 : 0.56; return w * size; };
const dStr = (pts) => "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L");
const segLen = (pts) => pts.slice(1).reduce((n, p, k) => n + Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]), 0);
function pointAt(pts, d) {
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l || k === pts.length - 1) { const t = l ? Math.min(1, d / l) : 1; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    d -= l;
  }
  return pts[pts.length - 1];
}
function pill(parent, str, color, o = {}) {
  const size = o.size || 14, h = size + 10, gg = g(parent);
  const r = rect(gg, 0, 0, 10, h, { r: h / 2, fill: o.fill || C.bg, stroke: color, sw: 1.4 });
  const t = text(gg, 0, 0, str, { size, anchor: "middle", weight: 600, fill: o.ink || color });
  const api = { g: gg, at(x, y) { const w = tw(t.textContent, size) + 18; set(r, { x: x - w / 2, y: y - h / 2, width: w }); set(t, { x, y: y + 0.5 }); return api; }, label(v) { t.textContent = v; return api; } };
  return api;
}
function motion(stage) {
  let run = 0;
  return {
    begin() { return ++run; },
    alive: (tk) => tk === run,
    mv(ms, fn, ok) {
      return new Promise((done) => {
        if (!ok()) { done(false); return; }
        if (!ms || reduced()) { fn(1); done(true); return; }
        const t0 = performance.now();
        const tick = (now) => {
          if (!ok() || !stage.isConnected) { done(false); return; }
          const t = Math.min(1, (now - t0) / ms); fn(ease.inOut(t));
          if (t < 1) requestAnimationFrame(tick); else done(true);
        };
        requestAnimationFrame(tick);
      });
    },
  };
}
function phone(parent, x, y, s = 1, label) {
  const gg = g(parent);
  rect(gg, x - 17 * s, y - 28 * s, 34 * s, 56 * s, { r: 7 * s, fill: C.bg, stroke: C.ink, sw: 1.6 });
  rect(gg, x - 12 * s, y - 21 * s, 24 * s, 37 * s, { r: 3, fill: C.soft });
  line(gg, x - 6 * s, y + 21.5 * s, x + 6 * s, y + 21.5 * s, { color: C.ink, width: 1.6 });
  if (label) text(gg, x, y + 28 * s + 18, label, { size: 15, anchor: "middle", weight: 600 });
  return gg;
}

// =====================================================================
// 캐시
// =====================================================================
const CACHE = [
  "처음 ‘회의 #12’를 찾으면 캐시에 없어요(놓침). 멀리 있는 DB 에서 읽고, 돌아오는 길에 캐시에 한 부 넣어 둬요.",
  "같은 ‘회의 #12’를 또 찾으면 캐시에 있어요(적중). DB 까지 안 가고 바로 답해서 훨씬 빨라요 — “아까 그거요”.",
  "DB 에서 회의 #12 제목을 고쳤어요(v2). 그런데 캐시는 옛 값(v1)을 들고 있어서, 고친 게 안 보여요.",
  "그래서 데이터가 바뀌면 캐시의 한 부를 지워요. 다음 요청은 놓침이 되어 DB 에서 새 값(v2)을 가져와요.",
  "이제 직접 ‘두는 시간’을 바꿔 보세요. 길게 두면 적중이 늘지만, 바뀐 데이터가 늦게 보여요.",
];
const KEYS = ["#12", "#7", "#3", "#9"], WEIGHT = [0.42, 0.28, 0.18, 0.12];
const SPEED = 0.26, CHECK = 160, READ = 320; // 점 속도(px/ms) · 캐시 확인 · DB 읽기 (그림 속 시간)
function mountCache(stage, f) {
  // 자리 (좁은 칸이면 가로를 줄여요)
  const nar = !!f.narrow, W = nar ? NW : WW;
  const AX = nar ? 32 : 46, LY = 118, LQ = LY - 7, LA = LY + 7; // 앱 · 가운데 줄 · 가는 줄 · 오는 줄
  const CX0 = nar ? 76 : 112, CX1 = nar ? 206 : 262, DX0 = nar ? 288 : 392, DX1 = nar ? 412 : 532, BY0 = 38, BY1 = 198;
  const SEG = {
    q1: [[AX + 18, LQ], [CX0, LQ]], a1: [[CX0, LA], [AX + 18, LA]],
    q2: [[CX1, LQ], [DX0, LQ]], a2: [[DX0, LA], [CX1, LA]],
  };
  const T_HIT = (segLen(SEG.q1) * 2) / SPEED + CHECK, T_MISS = T_HIT + (segLen(SEG.q2) * 2) / SPEED + READ;
  const LX0 = nar ? 14 : 24, BAR0 = nar ? 84 : 104, BARW = nar ? 262 : 380, ROW0 = 248, ROWH = 22;
  const s = svg(stage, W, H, "앱, 캐시, DB 사이를 오가는 요청");
  const M = motion(stage);
  const baseG = g(s), slotG = g(s), dbG = g(s), routeG = g(s), tagG = g(s), barG = g(s), pktG = g(s);
  // 관
  for (const [a, b] of [[AX + 18, CX0], [CX1, DX0]]) el(baseG, "line", { x1: a, y1: LY, x2: b, y2: LY, stroke: C.soft, "stroke-width": 26 });
  phone(baseG, AX, LY, 1, "앱");
  // 캐시 상자
  const cacheFrame = rect(baseG, CX0, BY0, CX1 - CX0, BY1 - BY0, { r: 10, fill: C.bg, stroke: C.line, sw: 1.5 });
  text(baseG, (CX0 + CX1) / 2, BY0 + 20, "캐시", { size: 16, anchor: "middle", weight: 700 });
  text(baseG, (CX0 + CX1) / 2, BY0 + 40, "빠른 창고 · 잠깐", { size: 14, anchor: "middle", fill: C.sub });
  // DB 원통
  const dcx = (DX0 + DX1) / 2, drx = (DX1 - DX0) / 2, dry = 10, dtop = BY0 + 10, dbot = BY1 - 8;
  const dbBody = path(baseG, `M${DX0},${dtop} A${drx},${dry} 0 0 0 ${DX1},${dtop} L${DX1},${dbot} A${drx},${dry} 0 0 1 ${DX0},${dbot} Z`, { stroke: C.line, width: 1.5, fill: C.bg });
  el(baseG, "ellipse", { cx: dcx, cy: dtop, rx: drx, ry: dry, fill: C.bg, stroke: C.line, "stroke-width": 1.5 });
  text(baseG, dcx, dtop + 28, "DB", { size: 16, anchor: "middle", weight: 700 });
  text(baseG, dcx, dtop + 48, nar ? "원래 저장소" : "원래 저장소 · 멀리", { size: 14, anchor: "middle", fill: C.sub });
  // 응답 시간 막대 머리
  text(baseG, LX0, ROW0 - 26, "응답까지 걸린 시간", { size: 14, weight: 700, fill: C.sub });
  text(baseG, LX0 + 130, ROW0 - 26, "(그림 속 거리로 잰 예시)", { size: 14, fill: C.mute });

  const ro = readout(f.controls());
  let lastRo = "";
  const roSet = (h) => { if (h !== lastRo) { lastRo = h; ro.set(h); } }; // 글이 바뀔 때만 (화면 읽기 프로그램이 매 장면 읽지 않게)
  let ttl = 6, done = -1, stopLoop = null;
  const dial = slider(f.controls(), { label: "캐시에 두는 시간", min: 1, max: 20, step: 1, value: ttl, fmt: (v) => `${v}초` }, (v) => {
    ttl = v;
    if (f.step() !== CACHE.length - 1) f.goto(CACHE.length - 1); else if (reduced()) { live.reset(); live.fast(24000); live.draw(); }
  });

  // ---- 그리기: 캐시 칸 · DB 줄 · 막대 ----
  const SLOT_Y = (k) => BY0 + 60 + k * 24;
  function drawSlots(entries, o = {}) {
    slotG.replaceChildren();
    for (let k = 0; k < 4; k++) {
      const e = entries[k], y = SLOT_Y(k);
      if (!e) { el(slotG, "rect", { x: CX0 + 12, y, width: CX1 - CX0 - 24, height: 20, rx: 4, fill: "none", stroke: C.grid, "stroke-width": 1.2, "stroke-dasharray": "3 3" }); continue; }
      const hot = o.hot === e.key, stale = o.stale && e.ver < (o.db?.[e.key] || e.ver);
      rect(slotG, CX0 + 12, y, CX1 - CX0 - 24, 20, { r: 4, fill: hot ? (o.hotColor === "no" ? C.bSoft : C.cSoft) : C.soft, stroke: hot ? (o.hotColor === "no" ? C.b : C.c) : null, sw: 1.4 });
      text(slotG, CX0 + 22, y + 10.5, `회의 ${e.key}`, { size: 14, weight: 600 });
      text(slotG, CX1 - 22, y + 10.5, `v${e.ver}`, { size: 14, anchor: "end", weight: 700, fill: stale ? C.no : C.sub });
      if (o.ttl && e.left != null) line(slotG, CX0 + 14, y + 19, CX0 + 14 + (CX1 - CX0 - 28) * Math.max(0, e.left), y + 19, { color: C.a, width: 2 });
    }
  }
  function drawDb(db, o = {}) {
    dbG.replaceChildren();
    KEYS.forEach((k, n) => {
      const y = dtop + 74 + n * 20, hot = o.hot === k;
      text(dbG, dcx - 34, y, `회의 ${k}`, { size: 14, weight: hot ? 700 : 500, fill: hot ? C.ink : C.sub });
      text(dbG, dcx + 40, y, `v${db[k]}`, { size: 14, anchor: "end", weight: 700, fill: o.changed === k ? C.b : hot ? C.ink : C.sub });
    });
  }
  function drawBars(rows) {
    barG.replaceChildren();
    rows.slice(-4).forEach((r, k) => {
      const y = ROW0 + k * ROWH, len = (BARW * r.t) / T_MISS, col = r.hit ? C.c : C.b;
      text(barG, LX0, y, `회의 ${r.key}`, { size: 14, fill: C.sub });
      rect(barG, BAR0, y - 6, Math.max(4, len), 12, { r: 3, fill: col });
      text(barG, BAR0 + len + 8, y, r.hit ? (r.stale ? "적중 · 옛 값!" : "적중") : "놓침", { size: 14, weight: 700, fill: r.stale ? C.no : col });
    });
  }
  const tagAt = (x, y, str, color) => pill(tagG, str, color).at(x, y);
  function frame(color) { set(cacheFrame, { stroke: color || C.line, "stroke-width": color ? 2.4 : 1.5 }); }
  function dbFrame(color) { set(dbBody, { stroke: color || C.line, "stroke-width": color ? 2.4 : 1.5 }); }

  // ---- 이야기 단계 (0~3): 요청 하나씩 ----
  async function leg(seg, color, label, ok, animate) {
    if (!ok()) return false;
    const pts = SEG[seg], L = segLen(pts);
    const p = path(routeG, dStr(pts), { stroke: color, width: 2.4 });
    p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`;
    const pk = g(pktG), dot = circle(pk, 0, 0, 7, { fill: color, stroke: C.bg, sw: 2 }), tag = pill(pk, label, color);
    const place = (t) => { const [x, y] = pointAt(pts, L * t); set(dot, { cx: x, cy: y }); tag.at(x, y - 22); p.style.strokeDashoffset = `${L * (1 - t)}`; };
    const r = await M.mv(animate ? L / SPEED : 0, place, ok);
    pk.remove();
    if (r) p.setAttribute("marker-end", arrowHead(s, color)); else p.remove(); // 멈췄으면 그리던 것도 치워요
    return r;
  }
  // st = { cache: [{key, ver}], db: {key: ver}, bars: [] } — 요청 하나를 보내요
  async function ask(st, key, ok, animate) {
    const wait = (ms) => M.mv(animate ? ms : 0, () => {}, ok);
    if (!(await leg("q1", C.a, `회의 ${key}`, ok, animate))) return false;
    const e = st.cache.find((x) => x.key === key);
    if (e) {
      const stale = e.ver < st.db[key];
      frame(C.c); drawSlots(st.cache, { hot: key, db: st.db, stale: true });
      tagAt((CX0 + CX1) / 2, BY0 - 14, "✓ 적중", C.c);
      if (!(await wait(CHECK))) return false;
      if (!(await leg("a1", stale ? C.no : C.c, stale ? `v${e.ver} 옛 값` : `v${e.ver}`, ok, animate))) return false;
      st.bars.push({ key, hit: true, stale, t: T_HIT });
    } else {
      frame(C.b); tagAt((CX0 + CX1) / 2, BY0 - 14, "✗ 놓침", C.b);
      if (!(await wait(CHECK))) return false;
      if (!(await leg("q2", C.a, `회의 ${key}`, ok, animate))) return false;
      dbFrame(C.a); drawDb(st.db, { hot: key });
      if (!(await wait(READ))) return false;
      if (!(await leg("a2", C.c, `v${st.db[key]}`, ok, animate))) return false;
      st.cache.unshift({ key, ver: st.db[key] }); st.cache.length = Math.min(st.cache.length, 4);
      drawSlots(st.cache, { hot: key, db: st.db });
      tagAt((CX1 + DX0) / 2, LY - 34, "캐시에 한 부", C.c);
      if (!(await leg("a1", C.c, `v${st.db[key]}`, ok, animate))) return false;
      st.bars.push({ key, hit: false, t: T_MISS });
    }
    drawBars(st.bars);
    return true;
  }
  // 단계 i 를 시작할 때의 모습 (앞 단계들이 남긴 것)
  function before(i) {
    const db = { "#12": 1, "#7": 1, "#3": 1, "#9": 1 };
    if (i === 0) return { cache: [], db, bars: [] };
    if (i === 1) return { cache: [{ key: "#12", ver: 1 }], db, bars: [{ key: "#12", hit: false, t: T_MISS }] };
    if (i === 2) return { cache: [{ key: "#12", ver: 1 }], db, bars: [{ key: "#12", hit: false, t: T_MISS }, { key: "#12", hit: true, t: T_HIT }] };
    return { cache: [{ key: "#12", ver: 1 }], db: { ...db, "#12": 2 }, bars: [{ key: "#12", hit: false, t: T_MISS }, { key: "#12", hit: true, t: T_HIT }, { key: "#12", hit: true, stale: true, t: T_HIT }] };
  }

  // ---- 직접 해 보기 (4): 요청이 계속 들어와요 ----
  const live = (() => {
    let r, now, nextReq, nextUpd, cache, db, reqs, stats, bars, flash;
    function reset() {
      r = rng(7); now = 0; nextReq = 0; nextUpd = 4200; cache = []; db = { "#12": 1, "#7": 1, "#3": 1, "#9": 1 };
      reqs = []; stats = { n: 0, hit: 0, miss: 0, stale: 0 }; bars = []; flash = null;
    }
    const pickKey = () => { let x = r(); for (let k = 0; k < KEYS.length; k++) { x -= WEIGHT[k]; if (x <= 0) return KEYS[k]; } return KEYS[0]; };
    // 요청 하나 = 지나갈 구간 목록. 캐시에 닿는 순간 적중/놓침을 정해요
    function spawn() { reqs.push({ key: pickKey(), legs: ["q1"], d: 0, wait: 0, t0: now, hit: null, color: C.a }); }
    function step(dt) {
      now += dt;
      if (now >= nextReq) { spawn(); nextReq += 700; }
      if (now >= nextUpd) { const k = KEYS[Math.floor(r() * KEYS.length)]; db[k]++; flash = { k, until: now + 1200 }; nextUpd += 5200; }
      cache = cache.filter((e) => now - e.born < ttl * 1000);
      for (const q of reqs) {
        if (q.wait > 0) { q.wait -= dt; continue; }
        const seg = q.legs[0]; if (!seg) continue;
        q.d += SPEED * dt;
        const L = segLen(SEG[seg]);
        if (q.d < L) continue;
        q.d = 0; q.legs.shift();
        if (seg === "q1") {
          const e = cache.find((x) => x.key === q.key);
          q.wait = CHECK;
          if (e) { q.hit = true; q.stale = e.ver < db[q.key]; q.color = q.stale ? C.no : C.c; q.legs = ["a1"]; }
          else { q.hit = false; q.legs = ["q2"]; }
        } else if (seg === "q2") { q.wait = READ; q.legs = ["a2"]; q.color = C.c; }
        else if (seg === "a2") { cache = cache.filter((x) => x.key !== q.key); cache.unshift({ key: q.key, ver: db[q.key], born: now }); cache.length = Math.min(cache.length, 4); q.legs = ["a1"]; }
        else if (seg === "a1") {
          q.done = true; stats.n++; if (q.hit) stats.hit++; else stats.miss++; if (q.stale) stats.stale++;
          bars.push({ key: q.key, hit: q.hit, stale: q.stale, t: q.hit ? T_HIT : T_MISS }); if (bars.length > 4) bars.shift();
        }
      }
      reqs = reqs.filter((q) => !q.done);
    }
    function fast(ms) { for (let t = 0; t < ms; t += 16) step(16); }
    function draw() {
      pktG.replaceChildren();
      for (const q of reqs) {
        const seg = q.legs[0]; if (!seg) continue;
        const [x, y] = pointAt(SEG[seg], q.d);
        circle(pktG, x, y, 6, { fill: seg === "q1" || seg === "q2" ? C.a : q.color, stroke: C.bg, sw: 1.5 });
      }
      drawSlots(cache.map((e) => ({ ...e, left: 1 - (now - e.born) / (ttl * 1000) })), { ttl: true, db, stale: true });
      drawDb(db, { changed: flash && now < flash.until ? flash.k : null });
      drawBars(bars);
      const rate = stats.n ? Math.round((stats.hit / stats.n) * 100) : 0;
      roSet(`<div>요청 <b>${stats.n}</b> · <span class="c">적중 ${stats.hit}</span> · <span class="b">놓침 ${stats.miss}</span> · 적중률 <b>${rate}%</b></div><div>옛 값을 준 적중 <b class="${stats.stale ? "b" : ""}">${stats.stale}</b>번 <span class="dim">— DB 는 몇 초마다 한 줄씩 바뀌어요. 캐시에 오래 둘수록 옛 값이 오래 남아요.</span></div>`);
    }
    return { reset, step, fast, draw };
  })();

  function clearAll() {
    routeG.replaceChildren(); tagG.replaceChildren(); pktG.replaceChildren();
    frame(null); dbFrame(null);
  }
  async function go(i, animate) {
    if (i === done && animate && i !== CACHE.length - 1) return;
    stopLoop?.(); stopLoop = null;
    const tk = M.begin(), ok = () => M.alive(tk) && f.step() === i;
    done = -1; clearAll(); lastRo = "";
    if (i === CACHE.length - 1) {
      dial.set(ttl);
      live.reset();
      if (!animate || reduced()) { live.fast(24000); live.draw(); }
      else { live.draw(); stopLoop = loop(stage, (dt) => { live.step(dt); live.draw(); }); }
      done = i; return;
    }
    const st = before(i);
    drawSlots(st.cache, { db: st.db, stale: true }); drawDb(st.db); drawBars(st.bars);
    if (i === 0) ro.set(`<div><span class="b">놓침</span>: 캐시 → DB 까지 다녀와요. 돌아오는 길에 캐시에 <b>한 부</b> 넣어 둬요.</div><div class="dim">캐시 = 데이터의 일부를, 보통 잠깐, 저장하는 고속 저장 계층</div>`);
    if (i === 1) ro.set(`<div><span class="c">적중</span>: 캐시가 바로 답해요. DB 까지 안 가요.</div><div class="dim">같은 요청에 원래 저장소보다 빨리 답해요.</div>`);
    if (i === 2) {
      ro.set(`<div>DB: 회의 #12 <b>v1 → v2</b> · 캐시: 아직 v1 → <span class="b">옛 값</span></div><div class="dim">“캐시 때문에 수정한 게 안 보여요.”</div>`);
      dbFrame(C.b); st.db["#12"] = 2;
      if (animate) { drawDb({ ...st.db, "#12": 1 }); if (!(await M.mv(500, () => {}, ok))) return; }
      drawDb(st.db, { changed: "#12" }); tagAt(dcx, BY0 - 14, "제목 고침 → v2", C.b);
      drawSlots(st.cache, { db: st.db, stale: true });
      if (animate && !(await M.mv(900, () => {}, ok))) return;
      tagG.replaceChildren(); dbFrame(null);
    }
    if (i === 3) {
      ro.set(`<div>바뀌면 캐시에서 <b>지우기</b> → 다음 요청은 <span class="b">놓침</span> → DB 에서 <b>v2</b></div><div class="dim">정할 것: 무엇을, 얼마나 오래 두고, 바뀌면 어떻게 지우나</div>`);
      drawSlots(st.cache, { hot: "#12", hotColor: "no", db: st.db, stale: true });
      tagAt((CX0 + CX1) / 2, BY0 - 14, "회의 #12 지움", C.b);
      if (animate && !(await M.mv(900, () => {}, ok))) return;
      st.cache = []; drawSlots(st.cache); tagG.replaceChildren();
    }
    if (!(await ask(st, "#12", ok, animate))) return;
    done = i;
  }
  return { go, destroy() { M.begin(); stopLoop?.(); } };
}

// =====================================================================
// 큐
// =====================================================================
const QUEUE = [
  "녹음을 올리면 서버는 변환을 기다리지 않고 바로 “접수됐어요” 라고 답해요.",
  "음성 변환 · 요약 작업은 큐(대기열)에 줄을 서요. 서버는 벌써 다음 요청을 받을 수 있어요.",
  "워커가 큐 앞에서 하나씩 꺼내 처리하고, 끝나면 사용자에게 알려 줘요.",
  "회의가 끝나는 시간엔 녹음이 한꺼번에 몰려요. 모두 바로 “접수됐어요”를 받고, 워커는 늘 같은 속도로 처리해요.",
  "이제 직접 ‘올라오는 양’을 바꿔 보세요. 처리 속도보다 많으면 큐가 계속 길어져요 — 아무도 안 보면 적체가 쌓여요.",
];
const WORK = 1300, BIN = WORK, NB = 20; // 워커가 한 건 처리하는 시간(그림 속) · 막대 한 칸
const TOK = 20, GAP = 3; // 큐 칸 크기

function mountQueue(stage, f) {
  // 자리 (좁은 칸이면 가로를 줄여요)
  const nar = !!f.narrow, W = nar ? NW : WW;
  const UX = nar ? 32 : 44, UY = 96, SV = nar ? [66, 150] : [98, 196], QX = nar ? [172, 314] : [228, 418], QY = 96, WK = nar ? [334, 412] : [446, 536];
  const UPQ = [[UX + 18, UY - 7], [SV[0], UY - 7]], UPA = [[SV[0], UY + 7], [UX + 18, UY + 7]];
  const NOTE = [[(WK[0] + WK[1]) / 2, UY + 34], [(WK[0] + WK[1]) / 2, UY + 58], [UX, UY + 58], [UX, UY + 30]];
  const CAP = Math.floor((QX[1] - QX[0] - 12) / (TOK + GAP)); // 보이는 칸 수
  const slotX = (k) => QX[1] - 6 - TOK / 2 - k * (TOK + GAP); // 0 = 맨 앞(워커 쪽)
  const CH = nar ? { x0: 48, x1: 410, y0: 214, y1: 300 } : { x0: 64, x1: 534, y0: 214, y1: 300 };
  const s = svg(stage, W, H, "사용자, 서버, 큐, 워커 사이를 오가는 녹음 작업");
  const M = motion(stage);
  const baseG = g(s), tokG = g(s), routeG = g(s), chartG = g(s), tagG = g(s), pktG = g(s);
  // 관 · 알림 길
  el(baseG, "line", { x1: UX + 18, y1: UY, x2: SV[0], y2: UY, stroke: C.soft, "stroke-width": 26 });
  el(baseG, "line", { x1: SV[1], y1: QY, x2: QX[0], y2: QY, stroke: C.soft, "stroke-width": 10 });
  el(baseG, "line", { x1: QX[1], y1: QY, x2: WK[0], y2: QY, stroke: C.soft, "stroke-width": 10 });
  path(baseG, dStr(NOTE), { stroke: C.grid, width: 1.4, dash: "4 4" });
  text(baseG, (UX + WK[0]) / 2 + 30, UY + 74, "끝나면 알림", { size: 14, anchor: "middle", fill: C.mute });
  // 사용자들 (폰 셋)
  phone(baseG, UX + 10, UY - 8, 0.8); phone(baseG, UX + 5, UY - 4, 0.9);
  phone(baseG, UX, UY, 1);
  text(baseG, UX, UY - 48, "사용자들", { size: 15, anchor: "middle", weight: 600 });
  // 서버 · 큐 · 워커
  const srvF = rect(baseG, SV[0], UY - 34, SV[1] - SV[0], 68, { r: 8, fill: C.bg, stroke: C.line, sw: 1.5 });
  text(baseG, (SV[0] + SV[1]) / 2, UY - 10, "서버", { size: 16, anchor: "middle", weight: 700 });
  text(baseG, (SV[0] + SV[1]) / 2, UY + 12, "접수 창구", { size: 14, anchor: "middle", fill: C.sub });
  rect(baseG, QX[0], QY - 20, QX[1] - QX[0], 40, { r: 8, fill: C.soft, stroke: C.line, sw: 1.5 });
  text(baseG, (QX[0] + QX[1]) / 2, QY - 36, "큐 · 줄 선 작업", { size: 15, anchor: "middle", weight: 700 });
  text(baseG, QX[1] - 4, QY + 34, "앞 →", { size: 14, anchor: "end", fill: C.mute });
  const wkF = rect(baseG, WK[0], UY - 34, WK[1] - WK[0], 68, { r: 8, fill: C.bg, stroke: C.line, sw: 1.5 });
  text(baseG, (WK[0] + WK[1]) / 2, UY - 14, "워커", { size: 16, anchor: "middle", weight: 700 });
  text(baseG, (WK[0] + WK[1]) / 2, UY + 6, "변환 · 요약", { size: 14, anchor: "middle", fill: C.sub });
  rect(baseG, WK[0] + 12, UY + 18, WK[1] - WK[0] - 24, 7, { r: 3.5, fill: C.soft });
  const prog = rect(baseG, WK[0] + 12, UY + 18, 0, 7, { r: 3.5, fill: C.c });
  const more = text(baseG, QX[0] + 8, QY + 34, "", { size: 14, weight: 700, fill: C.b });
  // 막대 그림 (들어온 일 · 처리한 일)
  const chartBase = g(s);
  text(chartBase, 24, 194, "작업 수", { size: 14, weight: 700, fill: C.sub });
  const lg = nar ? 72 : 92;
  rect(chartBase, lg, 188, 11, 11, { r: 2, fill: C.a }); text(chartBase, lg + 16, 194, "들어온 일", { size: 14, fill: C.sub });
  rect(chartBase, lg + 84, 188, 11, 11, { r: 2, fill: C.c }); text(chartBase, lg + 100, 194, "처리한 일", { size: 14, fill: C.sub });
  line(chartBase, CH.x0, CH.y1, CH.x1, CH.y1, { color: C.line, width: 1.2 });
  text(chartBase, CH.x1, CH.y1 + 16, "시간 →", { size: 14, anchor: "end", fill: C.mute });
  const UNIT = (CH.y1 - CH.y0) / 8;
  line(chartBase, CH.x0, CH.y1 - UNIT, CH.x1, CH.y1 - UNIT, { color: C.c, width: 1.2, dash: "4 4" });
  text(chartBase, CH.x0 - 6, CH.y1 - UNIT, "1", { size: 14, anchor: "end", fill: C.c });
  text(chartBase, CH.x0 - 6, CH.y0 + 4, "8", { size: 14, anchor: "end", fill: C.mute });
  text(chartBase, nar ? 240 : 300, 194, nar ? "점선 = 워커 처리 속도" : "점선 = 워커가 한 칸에 처리하는 양", { size: 14, fill: C.mute });

  const ro = readout(f.controls());
  let lastRo = "";
  const roSet = (h) => { if (h !== lastRo) { lastRo = h; ro.set(h); } }; // 글이 바뀔 때만
  let rate = 1.4, done = -1, stopLoop = null;
  const dial = slider(f.controls(), { label: "올라오는 양", min: 0.4, max: 2, step: 0.1, value: rate, fmt: (v) => `${Math.round(v * 100)}%` }, (v) => { // 100% = 워커가 처리하는 속도
    rate = v;
    if (f.step() !== QUEUE.length - 1) f.goto(QUEUE.length - 1); else if (reduced()) { sim.reset(4); sim.fast(26000); sim.draw(); }
  });

  // ---- 공통 그리기 ----
  function token(parent, x, y, n, color, o = {}) {
    const gg = g(parent);
    rect(gg, x - TOK / 2, y - 13, TOK, 26, { r: 4, fill: o.soft ? C.aSoft : C.bg, stroke: color, sw: 1.6 });
    if (n != null) text(gg, x, y + 1, String(n), { size: 14, anchor: "middle", weight: 700, fill: color });
    return gg;
  }
  const tagAt = (x, y, str, color, o) => pill(tagG, str, color, o).at(x, y);
  function frames(srv, wk) { set(srvF, { stroke: srv || C.line, "stroke-width": srv ? 2.4 : 1.5 }); set(wkF, { stroke: wk || C.line, "stroke-width": wk ? 2.4 : 1.5 }); }
  function drawChart(arr, comp) {
    chartG.replaceChildren();
    const bw = (CH.x1 - CH.x0) / NB;
    for (let k = 0; k < NB; k++) {
      const a = arr[k] || 0, c = comp[k] || 0, x = CH.x0 + k * bw + 2;
      if (a) rect(chartG, x, CH.y1 - Math.min(8, a) * UNIT, bw / 2 - 2, Math.min(8, a) * UNIT, { r: 1.5, fill: C.a });
      if (c) rect(chartG, x + bw / 2 - 1, CH.y1 - Math.min(8, c) * UNIT, bw / 2 - 2, Math.min(8, c) * UNIT, { r: 1.5, fill: C.c });
    }
  }

  // ---- 흐름 계산 (3 · 4 단계) — 그리지 않고도 앞당겨 돌릴 수 있게 따로 ----
  const sim = (() => {
    let r, now, jobs, queue, worker, pk, arr, comp, nextArr, burstLeft, mode, seq, stats;
    function reset(step) {
      r = rng(5); now = 0; jobs = []; queue = []; worker = null; pk = []; arr = []; comp = []; seq = 0;
      mode = step; burstLeft = step === 3 ? 8 : 0; nextArr = step === 3 ? 0 : 200; stats = { got: 0, ok: 0 };
    }
    const bin = () => Math.floor(now / BIN);
    function arrive() {
      const id = ++seq;
      pk.push({ pts: UPQ, d: 0, color: C.a, then: () => {
        stats.got++;
        pk.push({ pts: UPA, d: 0, color: C.c });
        const j = { id, x: SV[1], y: QY }; jobs.push(j); queue.push(j);
      } });
      arr[bin()] = (arr[bin()] || 0) + 1;
    }
    function step(dt) {
      now += dt;
      if (mode === 3) { while (burstLeft > 0 && now >= nextArr) { arrive(); burstLeft--; nextArr += 70; } }
      else if (now >= nextArr) { arrive(); nextArr += (WORK / rate) * (0.35 + r() * 1.3); }
      // 워커: 비었으면 맨 앞 작업을 꺼내요
      if (!worker && queue.length) { const j = queue.shift(); worker = { j, t: 0 }; }
      if (worker) {
        worker.t += dt / WORK;
        if (worker.t >= 1) {
          comp[bin()] = (comp[bin()] || 0) + 1; stats.ok++;
          jobs = jobs.filter((x) => x !== worker.j); worker = null;
          pk.push({ pts: NOTE, d: 0, color: C.c, fast: 1.6 });
        }
      }
      // 작업 칸은 제자리로 스르르
      queue.forEach((j, k) => { const tx = slotX(Math.min(k, CAP - 1)); j.x += (tx - j.x) * Math.min(1, dt / 120); j.y = QY; });
      if (worker) { const tx = WK[0] + 8; worker.j.x += (tx - worker.j.x) * Math.min(1, dt / 120); }
      for (const p of pk) { p.d += SPEED * (p.fast || 1) * dt; if (p.d >= segLen(p.pts) && !p.end) { p.end = true; p.then?.(); } }
      pk = pk.filter((p) => !p.end);
    }
    function fast(ms) { for (let t = 0; t < ms; t += 16) step(16); }
    function draw() {
      tokG.replaceChildren(); pktG.replaceChildren();
      queue.slice(0, CAP).forEach((j) => token(tokG, j.x, j.y, null, C.a, { soft: 1 }));
      more.textContent = queue.length > CAP ? `+${queue.length - CAP}` : "";
      if (worker && worker.j.x < WK[0] - 6) token(tokG, worker.j.x, worker.j.y, null, C.a, { soft: 1 }); // 워커에 닿으면 안으로 들어가요
      set(prog, { width: (WK[1] - WK[0] - 24) * (worker ? Math.min(1, worker.t) : 0) });
      frames(null, worker ? C.a : null);
      for (const p of pk) { const [x, y] = pointAt(p.pts, p.d); circle(pktG, x, y, 6, { fill: p.color, stroke: C.bg, sw: 1.5 }); }
      const b = bin(), from = Math.max(0, b - NB + 1);
      drawChart(Array.from({ length: NB }, (_, k) => arr[from + k]), Array.from({ length: NB }, (_, k) => comp[from + k]));
      const wait = queue.length;
      const growing = mode === 4 && rate > 1.05;
      roSet(mode === 3
        ? `<div>한꺼번에 올라온 녹음 <b>8</b>개 → <span class="c">“접수됐어요”</span> <b>${stats.got}</b>명 즉시 · 큐에서 기다리는 일 <b>${wait}</b>개 · 처리 완료 <b class="c">${stats.ok}</b>개</div><div class="dim">들어온 일(파랑)은 한 칸에 몰리고, 처리한 일(초록)은 점선 높이로 고르게 나와요.</div>`
        : `<div>올라오는 양 = 처리 속도의 <b>${Math.round(rate * 100)}%</b> · 큐에서 기다리는 일 <b class="${growing ? "b" : ""}">${wait}</b>개 · 처리 완료 <b class="c">${stats.ok}</b>개</div><div class="dim">${growing ? "처리보다 많이 들어와서 큐가 계속 길어져요. 큐 길이를 누군가 지켜봐야 해요(“적체 2만 건, 아무도 안 봤어요”)." : "처리 속도보다 적게 들어오면 큐는 잠깐 길어졌다가 다시 비어요."}</div>`);
    }
    return { reset, step, fast, draw };
  })();

  // ---- 이야기 단계 (0~2): 녹음 하나 ----
  async function leg(pts, color, label, ok, animate, k = 1) {
    if (!ok()) return false;
    const L = segLen(pts);
    const p = path(routeG, dStr(pts), { stroke: color, width: 2.4 });
    p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`;
    const pkG = g(pktG), dot = circle(pkG, 0, 0, 7, { fill: color, stroke: C.bg, sw: 2 }), tag = label ? pill(pkG, label, color) : null;
    const place = (t) => { const [x, y] = pointAt(pts, L * t); set(dot, { cx: x, cy: y }); tag?.at(x, y - 22); p.style.strokeDashoffset = `${L * (1 - t)}`; };
    const res = await M.mv(animate ? (L / SPEED) * k : 0, place, ok);
    pkG.remove();
    if (res) p.setAttribute("marker-end", arrowHead(s, color)); else p.remove();
    return res;
  }
  function clearAll() {
    tokG.replaceChildren(); routeG.replaceChildren(); tagG.replaceChildren(); pktG.replaceChildren();
    frames(null, null); set(prog, { width: 0 }); more.textContent = ""; drawChart([], []);
  }
  async function go(i, animate) {
    if (i === done && animate && i < 3) return;
    stopLoop?.(); stopLoop = null;
    const tk = M.begin(), ok = () => M.alive(tk) && f.step() === i;
    done = -1; clearAll(); lastRo = "";
    chartBase.style.opacity = i >= 3 ? "1" : "0.4"; // 막대 그림은 몰릴 때(4단계)부터 써요
    if (i >= 3) {
      if (i === 4) dial.set(rate);
      sim.reset(i);
      if (!animate || reduced()) { sim.fast(i === 3 ? 4200 : 26000); sim.draw(); }
      else { sim.draw(); stopLoop = loop(stage, (dt) => { sim.step(dt); sim.draw(); }); }
      done = i; return;
    }
    const wait = (ms) => M.mv(animate ? ms : 0, () => {}, ok);
    if (i === 0) {
      ro.set(`<div>올리기 → 서버가 바로 <span class="c">“접수됐어요”</span> <span class="dim">(변환이 끝날 때까지 기다리지 않아요)</span></div>`);
      if (!(await leg(UPQ, C.a, "녹음", ok, animate, 2.2))) return;
      frames(C.a, null);
      if (!(await wait(250))) return;
      if (!(await leg(UPA, C.c, "접수됐어요", ok, animate, 2.2))) return;
      token(tokG, SV[1] - 14, QY - 34, 1, C.a, { soft: 1 });
      tagAt((SV[0] + SV[1]) / 2, 58, "변환 작업 1건", C.a);
    } else if (i === 1) {
      ro.set(`<div>큐에서 기다리는 일 <b>1</b>개 <span class="dim">— 작업을 묶어 두고 앱과 떼어 놓아요(비동기)</span></div>`);
      const tok = token(tokG, 0, 0, 1, C.a, { soft: 1 });
      const from = [SV[1] - 14, QY - 34], to = [slotX(0), QY];
      const ok2 = await M.mv(animate ? 1100 : 0, (t) => set(tok, { transform: `translate(${(from[0] + (to[0] - from[0]) * t).toFixed(1)},${(from[1] + (to[1] - from[1]) * t).toFixed(1)})` }), ok);
      if (!ok2) return;
      tagAt((QX[0] + QX[1]) / 2 - 30, QY + 38, "줄 서서 기다려요", C.a);
    } else if (i === 2) {
      ro.set(`<div>워커가 하나씩 꺼내 처리 → 끝나면 <span class="c">알림</span>: “회의 요약이 준비됐어요”</div>`);
      const tok = token(tokG, 0, 0, 1, C.a, { soft: 1 });
      const from = [slotX(0), QY], to = [WK[0] - 2, QY];
      if (!(await M.mv(animate ? 700 : 0, (t) => set(tok, { transform: `translate(${(from[0] + (to[0] - from[0]) * t).toFixed(1)},${(from[1] + (to[1] - from[1]) * t).toFixed(1)})` }), ok))) return;
      tok.remove(); frames(null, C.a);
      if (!(await M.mv(animate ? WORK : 0, (t) => set(prog, { width: (WK[1] - WK[0] - 24) * t }), ok))) return;
      frames(null, C.c);
      if (!(await leg(NOTE, C.c, "요약 완료", ok, animate, 0.7))) return;
    }
    done = i;
  }
  return { go, destroy() { M.begin(); stopLoop?.(); } };
}

export default {
  aspect: H / WW,
  aspectNarrow: H / NW,
  steps: (o) => (o.mode === "queue" ? QUEUE : CACHE),
  mount(stage, f) { return f.opts.mode === "queue" ? mountQueue(stage, f) : mountCache(stage, f); },
};

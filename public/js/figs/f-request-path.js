// 그림: 앱을 열면 생기는 일 — 요청 하나가 DNS → TLS → CDN 엣지 → 앱 서버 → DB 를 지나 돌아오는 길 (Dev Flow 05 아키텍처 — 카드 1 · 2)
//   파란 점 = 가는 요청, 초록 점 = 돌아오는 응답. CDN 창고에 있으면(적중) 엣지에서 바로 돌아오고, 없으면(놓침) 앱 서버 · DB 까지 가요.
//   opts.mode = "path"(기본 · 카드 1) | "http"(카드 2 — 요청 하나하나는 서로를 기억 못 해서, 로그인 상태는 쿠키로 실어 날라요)
//   걸리는 시간(ms) 숫자는 카드에 없어서 쓰지 않아요. 대신 요청이 지나간 구간 수를 세어 보여 줘요.
import { svg, el, set, g, text, line, circle, rect, path, arrowHead, ease, reduced, show, choice, readout, C } from "./kit.js";

const WW = 560, NW = 420, H = 306; // 넓은 칸 · 좁은 칸(폰 · 튜터, f.narrow) 너비

// ---------- 작은 도구 (이 그림 안에서만) ----------
// 글자 폭 어림 (한글 1em · 영문 0.58em) — 알약 이름표 크기를 맞춰요
const tw = (s, size) => { let w = 0; for (const ch of String(s)) w += /[㄰-㆏가-힯]/.test(ch) ? 1 : /[\s.,:·'|!()]/.test(ch) ? 0.32 : /[A-Z0-9mw?]/.test(ch) ? 0.64 : 0.56; return w * size; };
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
// 선 p0→p1 을 옆으로 off 만큼 민 선 (가는 길 · 오는 길 두 줄)
function lane(p0, p1, off) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
  return [[p0[0] + nx * off, p0[1] + ny * off], [p1[0] + nx * off, p1[1] + ny * off]];
}
// 알약 모양 이름표
function pill(parent, str, color, o = {}) {
  const size = o.size || 14, h = size + 10, gg = g(parent);
  const r = rect(gg, 0, 0, 10, h, { r: h / 2, fill: o.fill || C.bg, stroke: color, sw: 1.4 });
  const t = text(gg, 0, 0, str, { size, anchor: "middle", weight: 600, fill: o.ink || color });
  const api = {
    g: gg,
    at(x, y) { const w = tw(t.textContent, size) + 18; set(r, { x: x - w / 2, y: y - h / 2, width: w }); set(t, { x, y: y + 0.5 }); return api; },
    label(v) { t.textContent = v; return api; },
  };
  return api;
}
// 움직임: ms 동안 fn(0→1). 그사이 다른 단계로 넘어가면 바로 멈추고 false (새 단계가 처음부터 다시 그려요)
function motion(stage) {
  let run = 0;
  return {
    begin() { return ++run; },
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
    alive: (tk) => tk === run,
  };
}

// ---------- 카드 1: 요청의 길 ----------
const PATH = [
  { cap: "앱을 열면 폰은 먼저 DNS 에 물어요. “doran.app 의 IP 주소는요?” 이름을 주소로 바꿔 줘요." },
  { cap: "주소를 알면 가까운 CDN 엣지와 암호화 연결(TLS)을 맺어요. 자물쇠가 걸린 길에서는 오가는 내용을 중간에서 못 읽어요." },
  { cap: "요청(파란 점)은 먼저 CDN 엣지에 닿아요. 찾는 파일이 창고에 있으면(적중) 엣지가 바로 돌려줘요(초록 점). 서버까지 안 가요." },
  { cap: "회의 목록처럼 창고에 없는 것은(놓침) 멀리 있는 앱 서버까지 가요. 앱 코드가 DB 를 읽어 응답을 만들고, 같은 길로 돌아와요." },
  { cap: "칸 하나하나가 업체이고 비용이고 장애 지점이에요. 인증서 하나만 만료돼도 앱이 안 열려요." },
  { cap: "이제 직접 골라 보내 보세요. 적중 · 놓침 · 인증서 만료일 때 요청이 어디까지 가는지 비교해 보세요." },
];

// 자리 (가운데 줄 Y). 폰 ↔ CDN 은 가깝고, CDN ↔ 앱 서버는 멀어요
const Y = 200;
const PIPE = 24, OFF = 6; // 관 굵기 · 가는 길/오는 길 간격
// 넓은 칸 · 좁은 칸 자리
const GEO = {
  wide: {
    W: WW, P: { phone: [52, Y], dns: [80, 62], cdn: [176, Y], srv: [378, Y], db: [500, Y] }, box: { dns: 120, cdn: 104, srv: 100 }, dbrx: 35,
    ends: { dns: [[52, 168], [52, 90]], cdn: [[70, Y], [124, Y]], srv: [[228, Y], [328, Y]], db: [[428, Y], [465, Y]] },
    div: 274, zone: [140, 416], LX: 97, ip: 212, cert: 70, marks: [[140, 36], [97, Y - 60], [228, 167], [428, 167], [535, 172]],
  },
  narrow: {
    W: NW, P: { phone: [40, Y], dns: [66, 62], cdn: [128, Y], srv: [292, Y], db: [386, Y] }, box: { dns: 104, cdn: 84, srv: 80 }, dbrx: 28,
    ends: { dns: [[40, 168], [40, 90]], cdn: [[58, Y], [86, Y]], srv: [[170, Y], [252, Y]], db: [[332, Y], [358, Y]] },
    div: 211, zone: [105, 318], LX: 72, ip: 186, cert: 64, marks: [[118, 36], [72, Y - 60], [170, 167], [332, 167], [406, 170]],
  },
};

function mountPath(stage, f) {
  const G = f.narrow ? GEO.narrow : GEO.wide, { W, P } = G;
  const s = svg(stage, W, H, "폰에서 DNS, CDN 엣지, 앱 서버, DB 로 이어지는 요청의 길");
  const M = motion(stage);
  const baseG = g(s), pipeG = g(s), nodeG = g(s), routeG = g(s), markG = g(s), tagG = g(s), pktG = g(s);

  // 바탕: 사용자 가까이 | 멀리
  line(baseG, G.div, 26, G.div, 272, { color: C.grid, width: 1.2, dash: "4 5" });
  text(baseG, G.zone[0], 288, "사용자 가까이", { size: 14, anchor: "middle", fill: C.mute });
  text(baseG, G.zone[1], 288, "멀리 · 서버가 있는 지역", { size: 14, anchor: "middle", fill: C.mute });

  // 관(연결) — 굵은 옅은 선. 가는 길(위) · 오는 길(아래) 두 줄이 그 안을 지나요
  const ends = G.ends; // dns: 폰 위 → DNS 아래 · cdn · srv · db: 왼쪽 칸 → 오른쪽 칸
  for (const [a, b] of Object.values(ends)) el(pipeG, "line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: C.soft, "stroke-width": PIPE, "stroke-linecap": "butt" });
  // TLS: 폰 ↔ CDN 관 테두리 + 자물쇠
  const tlsG = g(pipeG);
  line(tlsG, ends.cdn[0][0], Y - PIPE / 2, ends.cdn[1][0], Y - PIPE / 2, { color: C.ink, width: 1.6 });
  line(tlsG, ends.cdn[0][0], Y + PIPE / 2, ends.cdn[1][0], Y + PIPE / 2, { color: C.ink, width: 1.6 });
  const lock = g(tlsG);
  const LX = G.LX, LY = Y - 30;
  const lockBody = rect(lock, LX - 8, LY - 4, 16, 12, { r: 2.5, fill: C.ink });
  const lockArc = path(lock, `M${LX - 5},${LY - 4} v-4 a5,5 0 0 1 10,0 v4`, { stroke: C.ink, width: 2 });
  const lockX = g(tlsG); // 만료 표시
  path(lockX, `M${LX - 11},${LY - 15} l22,26 M${LX + 11},${LY - 15} l-22,26`, { stroke: C.no, width: 2.6 });

  // 칸들
  const nodes = {};
  // 폰
  const ph = g(nodeG);
  const phBody = rect(ph, P.phone[0] - 18, Y - 30, 36, 60, { r: 7, fill: C.bg, stroke: C.ink, sw: 1.6 });
  rect(ph, P.phone[0] - 13, Y - 23, 26, 40, { r: 3, fill: C.soft });
  line(ph, P.phone[0] - 6, Y + 23, P.phone[0] + 6, Y + 23, { color: C.ink, width: 1.6 });
  text(ph, P.phone[0], Y + 50, "내 폰", { size: 15, anchor: "middle", weight: 600 });
  nodes.phone = { frame: phBody };
  function boxNode(key, cx, cy, w, h, title, sub) {
    const gg = g(nodeG);
    const fr = rect(gg, cx - w / 2, cy - h / 2, w, h, { r: 8, fill: C.bg, stroke: C.line, sw: 1.5 });
    text(gg, cx, cy - (sub ? 10 : 0), title, { size: 16, anchor: "middle", weight: 700 });
    if (sub) text(gg, cx, cy + 12, sub, { size: 14, anchor: "middle", fill: C.sub });
    nodes[key] = { frame: fr, g: gg };
  }
  boxNode("dns", P.dns[0], P.dns[1], G.box.dns, 52, "DNS", "이름 → IP");
  boxNode("cdn", P.cdn[0], Y, G.box.cdn, 66, "CDN 엣지", "가까운 창고");
  boxNode("srv", P.srv[0], Y, G.box.srv, 66, "앱 서버", "원본");
  // DB 원통
  {
    const gg = g(nodeG), cx = P.db[0], rx = G.dbrx, ry = 8, top = Y - 26, bot = Y + 26;
    const body = path(gg, `M${cx - rx},${top} A${rx},${ry} 0 0 0 ${cx + rx},${top} L${cx + rx},${bot} A${rx},${ry} 0 0 1 ${cx - rx},${bot} Z`, { stroke: C.line, width: 1.5, fill: C.bg });
    const rim = el(gg, "ellipse", { cx, cy: top, rx, ry, fill: C.bg, stroke: C.line, "stroke-width": 1.5 });
    text(gg, cx, Y + 2, "DB", { size: 16, anchor: "middle", weight: 700 });
    text(gg, cx, Y + 21, "데이터", { size: 14, anchor: "middle", fill: C.sub });
    nodes.db = { frame: body, rim };
  }
  const lit = (key, color) => { const n = nodes[key]; set(n.frame, { stroke: color || (key === "phone" ? C.ink : C.line), "stroke-width": color ? 2.4 : key === "phone" ? 1.6 : 1.5 }); if (n.rim) set(n.rim, { stroke: color || C.line, "stroke-width": color ? 2.4 : 1.5 }); };

  // 길 조각: 가는 길(q) · 오는 길(a)
  const SEG = {};
  for (const [k, [a, b]] of Object.entries(ends)) { SEG["q-" + k] = lane(a, b, k === "dns" ? OFF : -OFF); SEG["a-" + k] = lane(b, a, k === "dns" ? OFF : -OFF); }
  // 오는 길은 반대 방향이라 lane 의 '옆'이 반대 → 결과적으로 두 줄이 갈라져요
  const NAME = { phone: "폰", dns: "DNS", cdn: "CDN 엣지", srv: "앱 서버", db: "DB" };

  // 장애 지점 번호 ①~⑤
  const MARKS = G.marks.map(([x, y], k) => [x, y, "①②③④⑤"[k]]);
  const marks = MARKS.map(([x, y, t]) => { const gg = g(markG); circle(gg, x, y, 12, { fill: C.bg, stroke: C.no, sw: 1.6 }); text(gg, x, y + 1, t, { size: 14, anchor: "middle", weight: 700, fill: C.no }); return gg; });

  const ro = readout(f.controls());
  let pick = "miss", done = -1;
  const pickSeg = choice(f.controls(), [["hit", "적중"], ["miss", "놓침"], ["cert", "인증서 만료"]], pick, (k) => {
    pick = k;
    if (f.step() !== PATH.length - 1) f.goto(PATH.length - 1); else go(PATH.length - 1, true);
  }, "보낼 요청 고르기");

  const legend = `<span class="a">파란 점</span> 가는 요청 · <span class="c">초록 점</span> 돌아오는 응답`;
  function reset(i) {
    routeG.replaceChildren(); tagG.replaceChildren(); pktG.replaceChildren();
    for (const k of Object.keys(nodes)) lit(k, null);
    show(tlsG, i >= 1, 0); show(lockX, false, 0);
    set(lockBody, { fill: C.ink }); set(lockArc, { stroke: C.ink });
    marks.forEach((m) => show(m, false, 0));
  }
  // 한 구간: 길을 그리며 점이 지나가요
  async function leg(seg, color, label, ms, ok) {
    if (!ok()) return false;
    const pts = SEG[seg], L = segLen(pts);
    const p = path(routeG, dStr(pts), { stroke: color, width: 2.4 });
    p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`;
    const pk = g(pktG), dot = circle(pk, 0, 0, 7, { fill: color, stroke: C.bg, sw: 2 }), tag = pill(pk, label, color);
    const place = (t) => { const [x, y] = pointAt(pts, L * t); set(dot, { cx: x, cy: y }); tag.at(x, y - 22); p.style.strokeDashoffset = `${L * (1 - t)}`; };
    const r = await M.mv(ms, place, ok);
    pk.remove();
    if (r) p.setAttribute("marker-end", arrowHead(s, color)); else p.remove(); // 멈췄으면 그리던 것도 치워요
    return r;
  }
  const tagAt = (x, y, str, color) => pill(tagG, str, color).at(x, y);
  // 요청 하나를 보내요: kind = dns | hit | miss | cert
  async function send(kind, animate, ok) {
    const sp = animate ? 1 : 0, t = (ms) => ms * sp;
    if (kind === "dns") {
      lit("dns", C.a);
      if (!(await leg("q-dns", C.a, "doran.app ?", t(900), ok))) return false;
      tagAt(G.ip, 62, "IP 주소 찾음", C.c);
      return leg("a-dns", C.c, "IP 주소", t(900), ok);
    }
    if (kind === "cert") {
      if (!ok()) return false;
      const pts = SEG["q-cdn"], pk = g(pktG), dot = circle(pk, 0, 0, 7, { fill: C.a, stroke: C.bg, sw: 2 });
      set(dot, { cx: pts[0][0], cy: pts[0][1] });
      const r = await M.mv(t(700), (u) => { const [x, y] = pointAt(pts, 16 * u); set(dot, { cx: x, cy: y }); }, ok);
      if (!r) { pk.remove(); return false; }
      show(lockX, true, sp ? 200 : 0); set(lockBody, { fill: C.no }); set(lockArc, { stroke: C.no });
      tagAt(LX + G.cert, LY - 30, "인증서 만료", C.no);
      return true;
    }
    const what = kind === "hit" ? ["로고 파일", "파일"] : ["회의 목록", "회의 목록"];
    if (!(await leg("q-cdn", C.a, what[0], t(500), ok))) return false;
    lit("cdn", kind === "hit" ? C.c : C.b);
    tagAt(P.cdn[0], 148, kind === "hit" ? "✓ 창고에 있음" : "✗ 창고에 없음", kind === "hit" ? C.c : C.b);
    if (kind === "hit") { if (!(await M.mv(t(350), () => {}, ok))) return false; return leg("a-cdn", C.c, what[1], t(500), ok); }
    if (!(await leg("q-srv", C.a, what[0], t(1100), ok))) return false;
    lit("srv", C.a); tagAt(P.srv[0], 148, "앱 코드 실행", C.a);
    if (!(await leg("q-db", C.a, "읽기", t(550), ok))) return false;
    lit("db", C.a); tagAt(P.db[0], 148, "읽기", C.a);
    if (!(await M.mv(t(300), () => {}, ok))) return false;
    if (!(await leg("a-db", C.c, "데이터", t(550), ok))) return false;
    if (!(await leg("a-srv", C.c, "응답", t(1100), ok))) return false;
    return leg("a-cdn", C.c, "응답", t(500), ok);
  }
  const ROUTE = { hit: ["phone", "cdn", "phone"], miss: ["phone", "cdn", "srv", "db", "srv", "cdn", "phone"] };
  const routeText = (k) => `간 길: ${ROUTE[k].map((n) => NAME[n]).join(" → ")} · <b>${ROUTE[k].length - 1}구간</b> ${k === "hit" ? `<span class="c">적중</span>` : `<span class="b">놓침</span>`}`;
  const failLine = `<span class="dim">흔한 장애: 만료된 인증서 · DNS 변경 실수 · 옛 파일을 주는 CDN · 유일한 병목인 DB · 먼 엣지로 잘못 가는 트래픽</span>`;

  async function go(i, animate) {
    if (i === done && animate && i !== PATH.length - 1) return;
    const tk = M.begin(), ok = () => M.alive(tk) && f.step() === i;
    done = -1; reset(i);
    if (i === 0) {
      ro.set(`<div>${legend}</div><div>DNS: <b>doran.app</b> → IP 주소 <span class="dim">(이름을 주소로 바꾸는 분산 시스템)</span></div>`);
      if (!(await send("dns", animate, ok))) return;
    } else if (i === 1) {
      ro.set(`<div>TLS 암호화 연결: 폰 ↔ CDN 엣지 <span class="dim">(인증서가 있어야 맺어져요)</span></div><div>${legend}</div>`);
      show(tlsG, true, 0);
      if (animate) { tlsG.style.opacity = "0"; if (!(await M.mv(700, (u) => (tlsG.style.opacity = String(u)), ok))) return; }
    } else if (i === 2) {
      ro.set(`<div>${routeText("hit")}</div><div>${legend}</div>`);
      if (!(await send("hit", animate, ok))) return;
    } else if (i === 3) {
      ro.set(`<div>${routeText("miss")}</div><div>${legend}</div>`);
      if (!(await send("miss", animate, ok))) return;
    } else if (i === 4) {
      ro.set(`<div>① 도메인 · DNS &nbsp;② 인증서 &nbsp;③ CDN &nbsp;④ 앱 서버 &nbsp;⑤ DB — 칸마다 <b>업체 · 비용 · 장애 지점</b></div><div>${failLine}</div><div><span class="dim">내 앱(SWx2): 엣지 = Cloudflare Workers · 데이터 = D1 · 파일 = R2</span></div>`);
      for (const m of marks) { show(m, true, animate ? 220 : 0); if (animate && !(await M.mv(260, () => {}, ok))) return; }
      if (!(await send("cert", animate, ok))) return;
    } else {
      pickSeg.set(pick);
      ro.set(pick === "cert" ? `<div>간 길: 폰 → <b class="b">✗</b> 인증서가 만료돼서 암호화 연결을 못 맺어요. 앱이 안 열려요.</div><div>${failLine}</div>` : `<div>${routeText(pick)}</div><div>${legend}</div>`);
      if (!(await send(pick, animate, ok))) return;
    }
    done = i;
  }
  return { go, destroy() { M.begin(); } };
}

// ---------- 카드 2: 기억 못 하는 HTTP ----------
const HTTP = [
  { cap: "HTTP 는 클라이언트(브라우저 · 앱)가 묻고 서버가 답하는 약속이에요. 로그인 요청을 보내면 서버가 답해요." },
  { cap: "그런데 요청 하나하나는 서로를 기억하지 않아요. 다음 요청 ‘내 회의 목록’이 오면 서버는 “누구세요?” 해요." },
  { cap: "그래서 로그인 응답에 세션 쿠키(주황)를 실어 줘요. 브라우저는 쿠키를 보관했다가 요청마다 붙여 보내요." },
  { cap: "쿠키를 본 서버는 “서연 님이네요” 하고 알아봐요. 기억은 HTTP 가 아니라 쿠키와 세션이 해 줘요." },
];

function mountHttp(stage, f) {
  const nar = !!f.narrow, W = nar ? NW : WW;
  const s = svg(stage, W, H, "브라우저와 서버가 요청과 응답을 주고받는 그림");
  const M = motion(stage);
  // 자리 (좁은 칸이면 가로를 줄이고, 편지 두 줄 사이를 조금 더 벌려요)
  const PX = nar ? 46 : 66, SX = nar ? 330 : 458, SW = nar ? 150 : 164, CY = 104, QY = CY - (nar ? 16 : 13), AY = CY + (nar ? 18 : 15), X0 = nar ? 76 : 96, X1 = nar ? 246 : 366;
  const JX = nar ? 4 : PX - 52, JW = nar ? 96 : 104, LOGX = nar ? 170 : 300, LOGR = nar ? 410 : 540;
  const base = g(s), letG = g(s), tagG = g(s);
  // 길 (요청은 위 줄 →, 응답은 아래 줄 ←)
  el(base, "line", { x1: X0, y1: CY + 1, x2: X1, y2: CY + 1, stroke: C.soft, "stroke-width": 50 });
  text(base, X0 + 80, nar ? CY + 44 : CY - 42, "요청 →   ← 응답", { size: 14, anchor: "middle", fill: C.mute });
  // 브라우저(폰)
  rect(base, PX - 18, CY - 30, 36, 60, { r: 7, fill: C.bg, stroke: C.ink, sw: 1.6 });
  rect(base, PX - 13, CY - 23, 26, 40, { r: 3, fill: C.soft });
  line(base, PX - 6, CY + 23, PX + 6, CY + 23, { color: C.ink, width: 1.6 });
  text(base, PX, CY + 50, "브라우저 · 앱", { size: 15, anchor: "middle", weight: 600 });
  text(base, PX, CY + 69, "클라이언트", { size: 14, anchor: "middle", fill: C.sub });
  // 쿠키 보관함 (브라우저 안)
  el(base, "rect", { x: JX, y: CY + 92, width: JW, height: 56, rx: 8, fill: "none", stroke: C.line, "stroke-width": 1.4, "stroke-dasharray": "4 4" });
  text(base, JX + JW / 2, CY + 106, "쿠키 보관함", { size: 14, anchor: "middle", fill: C.sub });
  // 서버
  const srvFrame = rect(base, SX - SW / 2, CY - 50, SW, 100, { r: 10, fill: C.bg, stroke: C.line, sw: 1.5 });
  text(base, SX, CY - 24, "서버", { size: 17, anchor: "middle", weight: 700 });
  const mem = text(base, SX, CY + 6, "", { size: 14, anchor: "middle", fill: C.sub });
  const mem2 = text(base, SX, CY + 27, "", { size: 14, anchor: "middle", fill: C.sub });
  // 요청 기록 (오른쪽 아래) — 요청마다 한 줄, 서로 이어지지 않아요
  const logG = g(s);

  const ro = readout(f.controls());
  let done = -1;
  // 편지(요청 · 응답) 한 장 — 쿠키를 실으면 옆에 주황 쿠키 칸이 붙어요
  function letter(str, color, cookie) {
    const gg = g(letG), w = Math.max(92, tw(str, 14) + 26), h = 30;
    rect(gg, -w / 2, -h / 2, w, h, { r: 6, fill: C.bg, stroke: color, sw: 1.8 });
    text(gg, 0, 1, str, { size: 14, anchor: "middle", weight: 600, fill: color });
    if (cookie) pill(gg, "쿠키", C.b, { fill: C.bSoft }).at(0, -h / 2 - 12);
    return { g: gg, w, at(x, y) { set(gg, { transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` }); } };
  }
  const cookieInJar = () => pill(tagG, "세션 쿠키", C.b, { fill: C.bSoft }).at(JX + JW / 2, CY + 128);
  const say = (str, color) => pill(tagG, str, color, { size: 15 }).at(SX, CY - 76);
  const memo = (a, b, color) => { mem.textContent = a; mem2.textContent = b || ""; set(mem, { fill: color || C.sub }); set(mem2, { fill: color || C.sub }); };
  // 요청 기록: 지금까지 보낸 요청들 (단계마다 다시 그려요)
  const LOG = [["1", "로그인", "OK", C.c], ["2", "내 회의 목록", "누구세요?", C.no], ["3", "로그인", "OK + 쿠키", C.c], ["4", "내 회의 목록 + 쿠키", "회의 목록", C.c]];
  function drawLog(upto) {
    logG.replaceChildren();
    text(logG, LOGX, CY + 96, "보낸 요청", { size: 14, weight: 700, fill: C.sub });
    LOG.slice(0, upto + 1).forEach(([n, q, a, col], k) => {
      const y = CY + 118 + k * 21;
      text(logG, LOGX, y, `${n}. ${q}`, { size: 14, fill: k === upto ? C.ink : C.mute });
      text(logG, LOGR, y, a, { size: 14, anchor: "end", weight: 600, fill: k === upto ? col : C.mute });
    });
  }
  function reset(i) {
    letG.replaceChildren(); tagG.replaceChildren();
    set(srvFrame, { stroke: C.line, "stroke-width": 1.5 });
    memo("요청을 하나씩", "따로 처리해요");
    if (i >= 3) cookieInJar();
    drawLog(i);
  }
  async function trip(q, a, o, animate, ok) {
    const sp = animate ? 1 : 0;
    const L1 = letter(q, C.a, o.cookie), w1 = L1.w / 2;
    if (!(await M.mv(1100 * sp, (u) => L1.at(X0 + w1 + (X1 - w1 - X0 - w1) * u, QY), ok))) return false;
    set(srvFrame, { stroke: o.who ? C.c : o.ask ? C.no : C.a, "stroke-width": 2.4 });
    if (o.who) { memo("쿠키 → 세션 →", "서연 님", C.c); say("서연 님이네요", C.c); }
    else if (o.ask) { memo("앞의 요청은", "기억에 없어요", C.no); say("누구세요?", C.no); }
    else if (o.setCookie) memo("로그인 확인 →", "세션 만들기", C.a); // 기억은 세션이 해요 (HTTP 는 그대로 기억 못 함)
    else memo("아이디 · 비밀번호", "확인", C.a);
    if (!(await M.mv(600 * sp, () => {}, ok))) return false;
    L1.g.style.opacity = "0.3";
    const L2 = letter(a, o.ask ? C.no : C.c, o.setCookie), w2 = L2.w / 2;
    if (!(await M.mv(1100 * sp, (u) => L2.at(X1 - w2 - (X1 - w2 - X0 - w2) * u, AY), ok))) return false;
    if (o.setCookie) cookieInJar();
    if (!o.who && !o.ask && !o.setCookie) { set(srvFrame, { stroke: C.line, "stroke-width": 1.5 }); memo("응답하고 나면", "다 잊어요"); }
    return true;
  }
  async function go(i, animate) {
    if (i === done && animate) return;
    const tk = M.begin(), ok = () => M.alive(tk) && f.step() === i;
    done = -1; reset(i);
    const Q = `<span class="a">요청</span>`, A = `<span class="c">응답</span>`;
    if (i === 0) {
      ro.set(`<div>${Q} 로그인 (아이디 · 비밀번호) → ${A} 로그인 OK</div><div class="dim">요청 하나에 응답 하나 — 클라이언트-서버 프로토콜이에요.</div>`);
      if (!(await trip("로그인", "로그인 OK", {}, animate, ok))) return;
    } else if (i === 1) {
      ro.set(`<div>${Q} 내 회의 목록 → 서버: <b>“누구세요?”</b></div><div class="dim">요청마다 따로 서요(stateless). 방금 로그인한 요청을 기억 못 해요.</div>`);
      if (!(await trip("내 회의 목록", "로그인 필요", { ask: 1 }, animate, ok))) return;
    } else if (i === 2) {
      ro.set(`<div>${A} 로그인 OK + <span class="b">세션 쿠키</span> → 브라우저가 보관해요</div><div><span class="dim">내 앱(SWx2)의 세션 쿠키 설정:</span> HttpOnly · SameSite=Lax · Secure</div>`);
      if (!(await trip("로그인", "로그인 OK", { setCookie: 1 }, animate, ok))) return;
    } else {
      ro.set(`<div>${Q} 내 회의 목록 + <span class="b">쿠키</span> → 서버: 서연 님 → ${A} 회의 목록</div><div class="dim">“상태는 없지만 세션이 없는 건 아니다(stateless, but not sessionless)” — MDN</div>`);
      if (!(await trip("내 회의 목록", "회의 목록", { cookie: 1, who: 1 }, animate, ok))) return;
    }
    done = i;
  }
  return { go, destroy() { M.begin(); } };
}

export default {
  aspect: H / WW,
  aspectNarrow: H / NW,
  steps: (o) => (o.mode === "http" ? HTTP : PATH).map((x) => x.cap),
  mount(stage, f) { return f.opts.mode === "http" ? mountHttp(stage, f) : mountPath(stage, f); },
};

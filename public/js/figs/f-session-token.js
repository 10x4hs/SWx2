// 그림: 세션과 토큰 — 로그인 상태를 서버가 기억하나(세션), 손에 쥔 서명된 표로 증명하나(토큰) (Dev Flow 07 로그인 · 권한 · 보안 — 카드 2)
//   세션: 서버의 세션 표(번호 → 사람) + 쿠키엔 의미 없는 번호만 → 요청마다 표에서 찾고, 로그아웃은 줄 지우기 = 바로 끝.
//   토큰(JWT): 서버가 정보(sub · exp)를 담아 서명 → 요청마다 서명만 확인(표 없음) → 만료 전에는 취소가 어려워요(차단 목록이 필요).
//   읽기 칸의 JWT 는 진짜로 만들어요(HS256 · WebCrypto). 시각(10:00 · 10:05 · 10:30)은 예시예요.
import { svg, el, set, g, text, line, circle, rect, path, arrowHead, ease, reduced, readout, rng, C } from "./kit.js";

const WW = 560, NW = 420, H = 330; // 넓은 칸 · 좁은 칸(폰 · 튜터, f.narrow) 너비

// ---------- 작은 도구 (이 그림 안에서만) ----------
const tw = (s, size) => { let w = 0; for (const ch of String(s)) w += /[㄰-㆏가-힯]/.test(ch) ? 1 : /[\s.,:·'|!()]/.test(ch) ? 0.32 : /[A-Z0-9mw#?…]/.test(ch) ? 0.64 : 0.56; return w * size; };
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
  if (o.dash) r.setAttribute("stroke-dasharray", "4 3");
  const t = text(gg, 0, 0, str, { size, anchor: "middle", weight: 600, fill: o.ink || color, mono: o.mono });
  const api = { g: gg, at(x, y) { const w = tw(t.textContent, size) * (o.mono ? 1.05 : 1) + 18; set(r, { x: x - w / 2, y: y - h / 2, width: w }); set(t, { x, y: y + 0.5 }); return api; } };
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
// 진짜 JWT (HS256) — 보여 주기용 비밀 열쇠로 서명해요
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uText = (s) => b64u(new TextEncoder().encode(s));
async function makeJwt(payload) {
  const head = b64uText(JSON.stringify({ alg: "HS256", typ: "JWT" })), body = b64uText(JSON.stringify(payload));
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("doran-demo-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`)));
    return { head, body, sig: b64u(sig) };
  } catch { return { head, body, sig: "" }; }
}

const STEPS = [
  "세션: 로그인하면 서버가 세션 표에 한 줄(번호 → 서연)을 적어요. 브라우저에는 의미 없는 번호만 주황 쿠키로 줘요.",
  "다음 요청부터는 쿠키의 번호를 세션 표에서 찾아서 ‘서연’인 걸 알아요.",
  "폰을 잃어버렸다면? ‘모든 기기에서 로그아웃’을 누르면 서버가 표에서 서연의 줄(브라우저 · 폰)을 모두 지워요. 잃어버린 폰이 자기 쿠키로 와도 바로 막혀요.",
  "토큰(JWT): 서버가 ‘서연 · 10:30 만료’ 같은 정보를 담고 서명해서 보라 토큰으로 줘요. 서버는 아무것도 적어 두지 않아요.",
  "요청이 오면 서버는 표를 찾지 않고 서명만 확인해요. 서명이 맞으면 통과예요.",
  "그래서 만료 전에는 취소하기 어려워요. 로그아웃해도 잃어버린 폰이 받아 둔 토큰은 10:30 까지 통과해요 — 막으려면 차단 목록이 필요해요.",
];

export default {
  aspect: H / WW,
  aspectNarrow: H / NW,
  steps: STEPS,
  async mount(stage, f) {
    // 자리 (좁은 칸이면 가로를 줄여요)
    const nar = !!f.narrow, W = nar ? NW : WW;
    const BX = nar ? 48 : 64, BW = nar ? 38 : 44, BY = 74, LQ = BY - 7, LA = BY + 7; // 브라우저 · 길
    const SX0 = nar ? 168 : 236, SX1 = nar ? 272 : 352, SY0 = BY - 40, SY1 = BY + 40, TX0 = nar ? 290 : 392, TX1 = nar ? 414 : 548;
    const Q = [[BX + BW + 2, LQ], [SX0, LQ]], A = [[SX0, LA], [BX + BW + 2, LA]];
    const LOOK = [[SX1, BY], [TX0, BY]];
    const PH = nar ? [132, 172] : [182, 172]; // 잃어버린 폰
    const LQ2 = [[PH[0] - 4, PH[1] - 24], [SX0 + 14, SY1]], LA2 = [[SX0 + 30, SY1], [PH[0] + 10, PH[1] - 24]];
    const TL = nar ? { x0: 84, x1: 392, top: 236, r1: 262, r2: 292, lx: 12 } : { x0: 120, x1: 500, top: 236, r1: 262, r2: 292, lx: 24 }; // 시간 줄 (10:00 → 10:30, 시각은 예시)
    const tx = (min) => TL.x0 + ((TL.x1 - TL.x0) * min) / 30;
    const HX = nar ? 54 : BX; // 브라우저가 들고 있는 것(쿠키)의 가운데
    const s = svg(stage, W, H, "브라우저, 서버, 세션 표 사이에서 로그인 상태를 증명하는 두 가지 방법");
    const M = motion(stage);
    const r = rng(3), hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("");
    const SID = hex(4), OTHERS = [[hex(4), "지훈"], [hex(4), "도윤"]], PID = hex(4); // PID = 서연이 폰으로 로그인한 세션
    const EXP = Date.UTC(2026, 9, 20, 1, 30) / 1000; // 2026-10-20 10:30 (한국 시각) — 예시
    const jwt = await makeJwt({ sub: "서연", exp: EXP });

    const baseG = g(s), tableG = g(s), heldG = g(s), lostG = g(s), routeG = g(s), tlG = g(s), tagG = g(s), pktG = g(s);
    // 관
    el(baseG, "line", { x1: BX + BW + 2, y1: BY, x2: SX0, y2: BY, stroke: C.soft, "stroke-width": 26 });
    // 브라우저 창
    rect(baseG, BX - BW, BY - 30, BW * 2, 60, { r: 7, fill: C.bg, stroke: C.ink, sw: 1.6 });
    line(baseG, BX - BW, BY - 17, BX + BW, BY - 17, { color: C.ink, width: 1.2 });
    [0, 1, 2].forEach((k) => circle(baseG, BX - BW + 8 + k * 7, BY - 23.5, 2, { fill: C.ink }));
    text(baseG, BX, BY + 6, "두런", { size: 14, anchor: "middle", fill: C.sub });
    text(baseG, BX, BY + 47, "브라우저", { size: 15, anchor: "middle", weight: 600 });
    // 서버
    const srvF = rect(baseG, SX0, SY0, SX1 - SX0, SY1 - SY0, { r: 9, fill: C.bg, stroke: C.line, sw: 1.5 });
    text(baseG, (SX0 + SX1) / 2, BY - 20, "서버", { size: 16, anchor: "middle", weight: 700 });
    const st1 = text(baseG, (SX0 + SX1) / 2, BY + 6, "", { size: 14, anchor: "middle", weight: 600, fill: C.sub });
    const st2 = text(baseG, (SX0 + SX1) / 2, BY + 25, "", { size: 14, anchor: "middle", fill: C.sub });
    const status = (a, b, color) => { st1.textContent = a || ""; st2.textContent = b || ""; set(st1, { fill: color || C.sub }); set(st2, { fill: color || C.sub }); };
    const srvLit = (color) => set(srvF, { stroke: color || C.line, "stroke-width": color ? 2.4 : 1.5 });

    const ro = readout(f.controls());
    let done = -1;

    // ---- 세션 표 / 토큰 쪽 '서버가 기억하는 것' ----
    function drawTable(kind, o = {}) {
      tableG.replaceChildren();
      if (kind === "session") {
        rect(tableG, TX0, 20, TX1 - TX0, 168, { r: 9, fill: C.bg, stroke: o.lit ? C.ink : C.line, sw: o.lit ? 2 : 1.5 });
        text(tableG, (TX0 + TX1) / 2, 40, "세션 표", { size: 16, anchor: "middle", weight: 700 });
        text(tableG, (TX0 + TX1) / 2, 60, "서버가 기억해요", { size: 14, anchor: "middle", fill: C.sub });
        line(tableG, TX0 + 10, 74, TX1 - 10, 74, { color: C.grid });
        text(tableG, TX0 + 16, 88, "번호", { size: 14, fill: C.mute }); text(tableG, TX1 - 16, 88, "사람", { size: 14, anchor: "end", fill: C.mute });
        // 기기마다 줄이 하나씩 — 브라우저(SID) · 폰(PID)
        const rows = [...OTHERS.map(([id, who]) => ({ id, who })), ...(o.mine === false ? [] : [{ id: SID, who: "서연", me: 1 }]), ...(o.phone && o.mine !== false ? [{ id: PID, who: nar ? "서연 폰" : "서연 · 폰", me: 1 }] : [])];
        rows.forEach((row, k) => {
          const y = 110 + k * 22;
          if (row.me) rect(tableG, TX0 + 8, y - 11, TX1 - TX0 - 16, 22, { r: 4, fill: o.hot === "no" ? C.bSoft : o.hot ? C.cSoft : C.soft, stroke: o.hot === "no" ? C.b : null, sw: 1.4 });
          text(tableG, TX0 + 16, y, `${row.id}…`, { size: 14, mono: true, fill: row.me ? C.ink : C.mute, weight: row.me ? 700 : 500 });
          text(tableG, TX1 - 16, y, row.who, { size: 14, anchor: "end", fill: row.me ? C.ink : C.mute, weight: row.me ? 700 : 500 });
        });
        if (o.gone) text(tableG, (TX0 + TX1) / 2, 162, nar ? "서연 줄 모두 지움" : "서연의 줄을 모두 지웠어요", { size: 14, anchor: "middle", weight: 600, fill: C.b });
      } else {
        el(tableG, "rect", { x: TX0, y: 20, width: TX1 - TX0, height: 168, rx: 9, fill: "none", stroke: C.line, "stroke-width": 1.4, "stroke-dasharray": "5 4" });
        text(tableG, (TX0 + TX1) / 2, 40, nar ? "기억하는 것" : "서버가 기억하는 것", { size: 15, anchor: "middle", weight: 700, fill: C.sub });
        if (o.deny) {
          rect(tableG, TX0 + 10, 62, TX1 - TX0 - 20, 112, { r: 7, fill: C.bg, stroke: C.no, sw: 1.6 });
          text(tableG, (TX0 + TX1) / 2, 84, "차단 목록", { size: 15, anchor: "middle", weight: 700, fill: C.no });
          text(tableG, (TX0 + TX1) / 2, 110, `토큰 …${jwt.sig.slice(-6) || "서명"}`, { size: 14, anchor: "middle", mono: true });
          text(tableG, (TX0 + TX1) / 2, 136, "있으면 막아요", { size: 14, anchor: "middle", fill: C.sub });
          text(tableG, (TX0 + TX1) / 2, 157, nar ? "= 다시 기억" : "= 다시 기억해야 해요", { size: 14, anchor: "middle", fill: C.sub });
        } else {
          text(tableG, (TX0 + TX1) / 2, 98, "없음", { size: 16, anchor: "middle", weight: 700, fill: C.mute });
          text(tableG, (TX0 + TX1) / 2, 124, "표를 안 찾아요", { size: 14, anchor: "middle", fill: C.mute });
          text(tableG, (TX0 + TX1) / 2, 148, nar ? "열쇠 하나만" : "서명 열쇠만 있어요", { size: 14, anchor: "middle", fill: C.mute });
        }
      }
    }
    // ---- 브라우저가 들고 있는 것 (쿠키 · 토큰) ----
    function tokenCard(parent, x0, y0, o = {}) {
      const gg = g(parent), w = nar ? 104 : 116, h = 66;
      const fr = rect(gg, x0, y0, w, h, { r: 7, fill: C.dSoft, stroke: C.d, sw: 1.6 });
      if (o.gone) { fr.setAttribute("stroke-dasharray", "4 3"); gg.style.opacity = "0.4"; }
      text(gg, x0 + 10, y0 + 16, "토큰 (JWT)", { size: 14, weight: 700, fill: C.d });
      text(gg, x0 + 10, y0 + 36, "sub: 서연", { size: 14, mono: true, fill: C.ink });
      text(gg, x0 + 10, y0 + 55, "exp: 10:30", { size: 14, mono: true, fill: C.ink });
      return gg;
    }
    function drawHeld(kind, o = {}) {
      heldG.replaceChildren();
      if (kind === "cookie") {
        const p = pill(heldG, `쿠키 ${SID}…`, C.b, { fill: C.bSoft }).at(HX, BY + 76);
        if (o.gone) p.g.style.opacity = "0.4";
        if (o.note) text(heldG, HX, BY + 102, nar ? "뜻 없는 번호" : "번호뿐, 뜻은 없어요", { size: 14, anchor: "middle", fill: C.sub });
      }
      if (kind === "token") tokenCard(heldG, nar ? 6 : BX - 58, BY + 62, o);
    }
    // ---- 잃어버린 폰 (폰으로 로그인할 때 받은 쿠키 · 토큰을 아직 들고 있어요) ----
    function drawLost(kind) {
      lostG.replaceChildren();
      if (!kind) return;
      const [x, y] = PH, sc = 0.8;
      rect(lostG, x - 14 * sc, y - 26 * sc, 28 * sc, 52 * sc, { r: 6 * sc, fill: C.bg, stroke: C.no, sw: 1.6 });
      rect(lostG, x - 10 * sc, y - 20 * sc, 20 * sc, 34 * sc, { r: 2, fill: C.soft });
      text(lostG, x, y + 38, "잃어버린 폰", { size: 14, anchor: "middle", weight: 600, fill: C.no });
      if (kind === "cookie") pill(lostG, `쿠키 ${PID}…`, C.b, { fill: C.bSoft }).at(x + 78, y + 2);
      else pill(lostG, "폰의 토큰", C.d, { fill: C.dSoft }).at(x + 74, y + 2);
    }
    // ---- 시간 줄: 로그아웃한 뒤에도 통과하나? (단계마다 한 칸씩 채워요) ----
    function drawTimeline(i) {
      tlG.replaceChildren();
      const marks = [[0, "10:00", true], [5, "10:05 로그아웃", i >= 2], [30, "10:30 만료", i >= 3]];
      marks.forEach(([m, l, on]) => {
        if (!on) return;
        line(tlG, tx(m), TL.top + 8, tx(m), TL.r2 + 12, { color: C.grid, width: 1.2, dash: "3 3" });
        const end = nar && m === 30; // 좁은 칸: 오른쪽 끝 글자가 넘치지 않게
        text(tlG, m === 5 ? tx(m) - 18 : end ? W - 6 : tx(m), TL.top, l, { size: 14, anchor: m === 5 ? "start" : end ? "end" : "middle", fill: C.mute });
      });
      const row = (y, name, color, on, after) => {
        text(tlG, TL.lx, y, name, { size: 15, weight: 700, fill: color });
        rect(tlG, tx(0), y - 7, tx(5) - tx(0), 14, { r: 3, fill: C.c });
        text(tlG, (tx(0) + tx(5)) / 2, y + 0.5, "로그인", { size: 14, anchor: "middle", weight: 700, fill: C.bg });
        if (on) after();
      };
      row(TL.r1, "세션", C.b, i >= 2, () => text(tlG, tx(5) + 10, TL.r1 + 0.5, "로그아웃하면 바로 막혀요", { size: 14, weight: 700, fill: C.ink }));
      if (i >= 3) row(TL.r2, "토큰", C.d, i >= 5, () => {
        rect(tlG, tx(5), TL.r2 - 7, tx(30) - tx(5), 14, { r: 3, fill: C.no });
        text(tlG, (tx(5) + tx(30)) / 2, TL.r2 + 0.5, "로그아웃해도 통과", { size: 14, anchor: "middle", weight: 700, fill: C.bg });
        text(tlG, tx(30) + 8, TL.r2 + 0.5, "✗", { size: 15, weight: 700, fill: C.ink });
      });
    }

    // ---- 움직임 ----
    async function leg(pts, color, label, ok, animate, o = {}) {
      if (!ok()) return false;
      const L = segLen(pts);
      const p = path(routeG, dStr(pts), { stroke: color, width: 2.4 });
      p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`;
      const pk = g(pktG), dot = circle(pk, 0, 0, 7, { fill: color, stroke: C.bg, sw: 2 });
      const tag = label ? pill(pk, label, o.tagColor || color, o.tagFill ? { fill: o.tagFill } : {}) : null;
      const place = (t) => { const [x, y] = pointAt(pts, L * t); set(dot, { cx: x, cy: y }); tag?.at(x + (o.dx || 0), y - 22); p.style.strokeDashoffset = `${L * (1 - t)}`; };
      const res = await M.mv(animate ? L / (o.speed || 0.2) : 0, place, ok);
      pk.remove();
      if (res) p.setAttribute("marker-end", arrowHead(s, color)); else p.remove();
      return res;
    }
    const tagAt = (x, y, str, color, o) => pill(tagG, str, color, o).at(x, y);
    function reset(i) { routeG.replaceChildren(); tagG.replaceChildren(); pktG.replaceChildren(); srvLit(null); status(""); drawLost(null); drawTimeline(i); }

    const jwtHtml = () => jwt.sig
      ? `<span style="word-break:break-all"><span class="b">${jwt.head}</span>.<span class="d">${jwt.body}</span>.<span class="a">${jwt.sig}</span></span>`
      : `<span class="b">header</span>.<span class="d">payload</span>.<span class="a">서명</span>`;

    async function go(i, animate) {
      if (i === done && animate) return;
      const tk = M.begin(), ok = () => M.alive(tk) && f.step() === i;
      const wait = (ms) => M.mv(animate ? ms : 0, () => {}, ok);
      done = -1; reset(i);
      if (i <= 2) {
        drawTable("session", { mine: i > 0 }); drawHeld(i > 0 ? "cookie" : null);
        if (i === 0) {
          ro.set(`<div>세션 표에 한 줄: <b>${SID}…</b> → 서연 · 브라우저는 <span class="b">쿠키</span>로 번호만 받아요</div><div class="dim">내 앱(SWx2)도 서버 세션이에요: 쿠키에 HttpOnly · SameSite=Lax · Secure</div>`);
          if (!(await leg(Q, C.a, "로그인", ok, animate))) return;
          srvLit(C.a); status("세션 표에", "한 줄 적기", C.a);
          if (!(await leg(LOOK, C.ink, null, ok, animate, { speed: 0.15 }))) return;
          drawTable("session", { hot: 1 });
          if (!(await wait(400))) return;
          if (!(await leg(A, C.c, `쿠키 ${SID}…`, ok, animate, { tagColor: C.b, tagFill: C.bSoft }))) return;
          drawHeld("cookie", { note: 1 });
        } else if (i === 1) {
          ro.set(`<div><span class="b">쿠키</span>의 번호 <b>${SID}…</b> → 세션 표에서 찾기 → <b>서연</b> <span class="c">✓</span></div><div class="dim">요청마다 표를 한 번씩 찾아요. 그래서 ‘서버가 상태를 기억한다’고 해요.</div>`);
          if (!(await leg(Q, C.a, "회의 목록 + 쿠키", ok, animate))) return;
          srvLit(C.a); status("표에서 찾기", "", C.a);
          if (!(await leg(LOOK, C.ink, null, ok, animate, { speed: 0.15 }))) return;
          drawTable("session", { hot: 1, lit: 1 }); status("서연 님 ✓", "", C.c); srvLit(C.c);
          if (!(await wait(400))) return;
          if (!(await leg(A, C.c, "회의 목록", ok, animate))) return;
        } else {
          ro.set(`<div>모든 기기에서 로그아웃 · 계정 정지 = 표에서 서연의 <b>줄을 모두 지우기</b> → 폰의 쿠키(${PID}…)로 와도 <b>✗ 막혀요</b></div><div class="dim">기기마다 세션 번호가 따로예요. 줄만 지우면 바로 끝나요. (아래 시각은 예시)</div>`);
          drawLost("cookie"); drawHeld("cookie");
          drawTable("session", { phone: 1, hot: 1 });
          if (!(await wait(900))) return;
          drawTable("session", { phone: 1, hot: "no" }); drawHeld("cookie", { gone: 1 });
          tagAt((TX0 + TX1) / 2, 204, nar ? "모든 기기 로그아웃" : "모든 기기에서 로그아웃", C.b);
          if (!(await wait(1000))) return;
          drawTable("session", { mine: false, gone: 1 }); tagG.replaceChildren();
          if (!(await leg(LQ2, C.a, null, ok, animate, { speed: 0.12 }))) return;
          srvLit(C.no); status("표에서 찾기", "", C.a);
          if (!(await leg(LOOK, C.ink, null, ok, animate, { speed: 0.15 }))) return;
          status("없는 번호", "✗ 막음", C.no);
          if (!(await wait(300))) return;
          if (!(await leg(LA2, C.no, "누구세요?", ok, animate, { speed: 0.12, dx: 18 }))) return;
        }
      } else {
        drawTable("token"); drawHeld(i > 3 ? "token" : null);
        if (i === 3) {
          ro.set(`<div>진짜 JWT: ${jwtHtml()}</div><div class="dim"><span class="b">머리</span> . <span class="d">담은 정보</span>(sub = 누구, exp = 만료 시각 10:30 을 초로 적은 수) . <span class="a">서명</span> — 서버의 비밀 열쇠로 만들어요</div>`);
          if (!(await leg(Q, C.a, "로그인", ok, animate))) return;
          srvLit(C.d); status("정보 담고", "서명하기", C.d);
          if (!(await wait(700))) return;
          if (!(await leg(A, C.c, "토큰", ok, animate, { tagColor: C.d, tagFill: C.dSoft }))) return;
          drawHeld("token");
        } else if (i === 4) {
          ro.set(`<div><span class="d">토큰</span>의 서명 확인 <span class="c">✓</span> → 통과 · 표는 안 찾아요</div><div class="dim">서버는 사람마다 기억하지 않고, 서명 열쇠 하나만 가지고 있어요.</div>`);
          if (!(await leg(Q, C.a, "회의 목록 + 토큰", ok, animate))) return;
          srvLit(C.d); status("서명 확인", "", C.d);
          if (!(await wait(600))) return;
          status("서명 맞음 ✓", "서연 님", C.c); srvLit(C.c);
          if (!(await wait(300))) return;
          if (!(await leg(A, C.c, "회의 목록", ok, animate))) return;
        } else {
          ro.set(`<div>로그아웃해도 잃어버린 폰이 받아 둔 <span class="d">토큰</span>은 서명이 맞아서 <b>10:30 까지 통과</b> · 막으려면 <span class="b">차단 목록</span>(서버가 다시 기억)</div><div class="dim">OWASP JWT 치트시트: JWT 를 ‘상태 없는 세션’으로 쓰는 건 권하지 않아요(frowned upon). 시각은 예시예요.</div>`);
          drawLost("token"); drawHeld("token", { gone: 1 });
          if (!(await wait(700))) return;
          if (!(await leg(LQ2, C.no, null, ok, animate, { speed: 0.12 }))) return;
          srvLit(C.no); status("서명 맞음 ✓", "막을 방법 없음", C.no);
          if (!(await wait(500))) return;
          if (!(await leg(LA2, C.no, "회의 목록", ok, animate, { speed: 0.12, dx: 18 }))) return;
          if (!(await wait(700))) return;
          drawTable("token", { deny: true });
        }
      }
      done = i;
    }
    return { go, destroy() { M.begin(); } };
  },
};

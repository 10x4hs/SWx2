// 그림: 배포 전략 — 요청(점)이 사용자에게서 길잡이를 지나 버전으로 흘러가요 (Dev Flow 10 테스트와 배포 — 카드 10 · 11 · 12 · 14)
//   opts.mode = "bluegreen"(카드 10 · 14: 똑같은 환경 두 벌, 길잡이를 한 번에 돌리고 · 한 번에 되돌리기)
//             | "canary"(카드 11: 직원 → 1% → 10% → 100%, 오류율 감시판 · 멈춤 기준(2배)을 넘으면 멈추고 되돌리기)
//             | "flag"(카드 12: 새 코드는 배포했지만 스위치는 꺼짐 → 한 집단에만 켜기 → 비상 스위치)
//   칸 하나 = 사용자 한 명(그 사람이 보는 버전 색). 점 = 요청: 길잡이까지는 회색, 지나면 가는 곳의 색. 점은 kit.loop 로 흘러요(화면 밖이면 멈춤).
//   색: 파란 = 지금 버전(v1 · 옛 화면) · 초록 = 새 버전(v2 · 새 화면) · 빨강 = 오류
import { svg, g, el, text, line, circle, rect, path, loop, choice, readout, anim, show, rng, lerp, clamp, reduced, C } from "./kit.js";

const BG = {
  steps: [
    { cap: "똑같이 생긴 운영 환경이 두 벌 있어요. 지금은 길잡이(라우터)가 모든 요청을 파란 블루(v1)로 보내요.", live: "blue", green: "idle" },
    { cap: "새 버전 v2 를 초록 그린 쪽에 배포해요. 서버엔 올라갔지만 아직 아무도 못 봐요 — 배포는 했지만 출시 전이에요.", live: "blue", green: "deploy" },
    { cap: "길잡이만 그린 쪽으로 돌려요. 모든 요청(100%)이 한 번에 새 버전으로 가요. 이게 출시예요.", live: "green", green: "v2", flip: 1 },
    { cap: "문제가 생기면 길잡이를 다시 블루로 돌려요. 옛 환경이 그대로 있어서 되돌리기도 똑같이 빨라요.", live: "blue", green: "bad", back: 1 },
    { cap: "약점도 있어요. 환경이 두 벌이라 비용이 들고, 두 환경이 같은 DB 를 쓰면 스키마 변경을 양쪽에 맞춰야 해요.", live: "blue", green: "v2", weak: 1 },
    { cap: "이제 직접 길잡이를 눌러 보세요. 요청이 한 번에 넘어가고, 되돌리기도 한 번이에요.", user: 1 },
  ],
};
const CN_STAGES = [{ k: "직원", p: 0 }, { k: "1%", p: 0.01 }, { k: "10%", p: 0.1 }, { k: "100%", p: 1 }];
const CN = {
  steps: [
    { cap: "새 버전(초록)을 먼저 사내 직원에게만 보내요. 사용자는 모두 지금 버전(파란)을 써요. 아래 감시판이 새 버전의 오류율을 재요.", stage: 0 },
    { cap: "아주 작은 사용자 집단(1%)으로 넓혀요. 멈출 기준(빨간 선)은 미리 숫자로 정해 뒀어요: 오류율이 지금 버전의 두 배.", stage: 1 },
    { cap: "정해진 시간 동안 지켜보고 숫자가 괜찮으면 10% 로 넓혀요.", stage: 2 },
    { cap: "끝까지 괜찮으면 전체(100%)에 출시해요.", stage: 3 },
    { cap: "다른 날: 1% 에서 오류율이 두 배를 넘었어요. 정해 둔 기준대로 바로 멈추고 되돌려요. 피해는 1% 에서 끝나요.", stage: 1, bug: 1 },
    { cap: "이제 직접 해 보세요. 단계를 고르고 새 버전에 버그를 넣어 보면, 버그가 몇 명에게 닿는지 보여요.", user: 1 },
  ],
};
const FG = {
  steps: [
    { cap: "새 화면 코드를 배포했어요. 코드 안에 새 화면과 옛 화면이 둘 다 있지만, 스위치가 꺼져 있어서 모두 옛 화면(파란)을 봐요.", on: [0, 0, 0] },
    { cap: "스위치를 두런 직원에게만 켜요. 다시 배포하지 않고 설정만 바꿨는데, 직원은 새 화면(초록)을 봐요.", on: [1, 0, 0] },
    { cap: "버그는 팀원이 많은 워크스페이스에서만 생겨요. 그 집단만 꺼 둔 채로 나머지에게 켤 수 있어요.", on: [1, 1, 0] },
    { cap: "새 화면에 문제가 보이면 스위치만 꺼요. 되돌리거나 고쳐서 다시 내는 것보다 훨씬 빨라요(비상 스위치).", on: [0, 0, 0], kill: 1 },
    { cap: "이제 직접 스위치를 눌러 보세요. 집단마다 따로 켜고 끌 수 있어요.", user: 1 },
  ],
};
const MODES = { bluegreen: BG, canary: CN, flag: FG };
const HINT = { bluegreen: "마지막 단계에서 길잡이를 눌러 보세요", canary: "마지막 단계에서 단계와 버그를 골라 보세요", flag: "마지막 단계에서 스위치를 눌러 보세요" };

const W0 = 580, H0 = 380, WN = 380, HN = 494;
const SPEED = 0.25; // 점 속도 (단위/ms)

// 칸 격자: 왼쪽 위 (ox, oy) 부터 cols 칸씩
function grid(parent, ox, oy, cols, count, cell, gap, extra = {}) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const x = ox + (k % cols) * (cell + gap), y = oy + Math.floor(k / cols) * (cell + gap);
    out.push({ el: rect(parent, x, y, cell, cell, { r: 2, fill: C.a }), x: x + cell / 2, y: y + cell / 2, cell, ...extra });
  }
  return out;
}
// DB 원통
function cylinder(parent, cx, cy, w, h, label) {
  const gg = g(parent), rx = w / 2, ry = 7;
  el(gg, "path", { d: `M${cx - rx},${cy - h / 2 + ry} v${h - 2 * ry} a${rx},${ry} 0 0 0 ${w},0 v${-(h - 2 * ry)}`, fill: C.bg, stroke: C.sub, "stroke-width": 1.6 });
  el(gg, "ellipse", { cx, cy: cy - h / 2 + ry, rx, ry, fill: C.soft, stroke: C.sub, "stroke-width": 1.6 });
  text(gg, cx, cy + 5, label, { size: 14, weight: 600, anchor: "middle", fill: C.ink });
  return gg;
}

export default {
  aspect: H0 / W0,
  aspectNarrow: HN / WN,
  steps: (o) => (MODES[o.mode] || BG).steps.map((s) => s.cap),
  hint: "마지막 단계에서 직접 해 볼 수 있어요",
  mount(stage, f) {
    const mode = MODES[f.opts.mode] ? f.opts.mode : "bluegreen", M = MODES[mode], STEPS = M.steps, LAST = STEPS.length - 1;
    const nar = !!f.narrow, W = nar ? WN : W0, H = nar ? HN : H0;
    const s = svg(stage, W, H, { bluegreen: "블루그린 배포: 사용자 요청이 길잡이를 지나 블루 또는 그린 환경으로 가요", canary: "카나리 배포: 새 버전 비율을 단계적으로 넓히며 오류율을 지켜봐요", flag: "기능 플래그: 집단마다 스위치로 새 화면과 옛 화면을 골라요" }[mode]);
    f.figure.querySelector(".fig-hint")?.replaceChildren(HINT[mode]);
    const backG = g(s), laneG = g(s), boxG = g(s), cellG = g(s), dotG = g(s), fxG = g(s), topG = g(s);
    const ro = readout(f.controls());
    const rnd = rng(7);
    let cells = [], lanes = {}, routerAt = () => [0, 0], route = () => null, isErr = () => false;
    let gen = 0; // 단계가 바뀌면 진행 중이던 순서(타이머)를 버려요
    const later = (my, ms, fn) => new Promise((ok) => setTimeout(() => { if (my === gen) fn(); ok(); }, reduced() ? 0 : ms));
    const fade = (on) => cells.forEach((c) => (c.el.style.transition = on && !reduced() ? "fill .35s ease, stroke .35s ease" : "none"));

    // ---------- 흐르는 점 ----------
    const dots = [], pool = [], fx = [];
    function spawn() {
      if (!cells.length) return;
      const c = cells[Math.floor(rnd() * cells.length)];
      const e = pool.pop() || circle(dotG, 0, 0, 3.6, { fill: C.sub });
      e.style.display = ""; e.style.fill = C.sub; e.style.opacity = "0.9";
      const b = routerAt(c);
      dots.push({ e, c, pts: [[c.x, c.y], b], lane: null, d: 0, len: Math.hypot(b[0] - c.x, b[1] - c.y) });
    }
    function flash(x, y) {
      const p = path(fxG, `M${x - 5},${y - 5} L${x + 5},${y + 5} M${x + 5},${y - 5} L${x - 5},${y + 5}`, { stroke: C.no, width: 2.6 });
      fx.push({ p, t: 0 });
    }
    function stepDots(dt) {
      for (let k = dots.length - 1; k >= 0; k--) {
        const d = dots[k]; d.d += dt * SPEED;
        if (!d.lane && d.d >= d.len) { // 길잡이에 닿았어요: 어디로 갈지 정해요
          const id = route(d.c), L = id && lanes[id];
          if (!L) { d.e.style.display = "none"; pool.push(d.e); dots.splice(k, 1); continue; }
          d.lane = id; d.err = isErr(d.c, id); d.e.style.fill = L.color;
          const last = d.pts[d.pts.length - 1];
          d.pts = [last, ...L.pts.slice(1)]; d.d -= d.len;
          d.len = 0; for (let q = 1; q < d.pts.length; q++) d.len += Math.hypot(d.pts[q][0] - d.pts[q - 1][0], d.pts[q][1] - d.pts[q - 1][1]);
        }
        if (d.lane && d.d >= d.len) { // 도착
          const end = d.pts[d.pts.length - 1];
          if (d.err) flash(end[0] + 4, end[1]);
          d.e.style.display = "none"; pool.push(d.e); dots.splice(k, 1); continue;
        }
        // 지금 자리
        let rem = d.d, p = d.pts[0];
        for (let q = 1; q < d.pts.length; q++) {
          const a = d.pts[q - 1], b = d.pts[q], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (rem <= sl) { p = [lerp(a[0], b[0], sl ? rem / sl : 1), lerp(a[1], b[1], sl ? rem / sl : 1)]; break; }
          rem -= sl; p = b;
        }
        d.e.setAttribute("cx", p[0]); d.e.setAttribute("cy", p[1]);
      }
      for (let k = fx.length - 1; k >= 0; k--) { const x = fx[k]; x.t += dt; x.p.style.opacity = String(clamp(1 - x.t / 700, 0, 1)); if (x.t > 700) { x.p.remove(); fx.splice(k, 1); } }
    }
    let acc = 0;
    // 움직임 줄이기를 켠 사람에게는 새 점을 보내지 않아요 (길 색 · 칸 색만으로도 읽혀요)
    loop(stage, (dt) => { if (!reduced()) { acc += dt; const every = mode === "canary" ? 55 : 85; while (acc > every) { acc -= every; spawn(); } } stepDots(dt); });

    // 상자: 테두리 색 · 제목 · 두 줄
    function envBox(x, y, w, h, color, title) {
      const gg = g(boxG);
      const r = rect(gg, x, y, w, h, { r: 8, fill: C.bg, stroke: color, sw: 2 });
      const t = text(gg, x + 12, y + 20, title, { size: 17, weight: 700, fill: color });
      const l1 = text(gg, x + 12, y + 44, "", { size: 15, weight: 600, fill: C.ink });
      const l2 = text(gg, x + 12, y + 66, "", { size: 14, weight: 500, fill: C.sub });
      return { g: gg, r, t, l1, l2, x, y, w, h, color };
    }

    let api;
    if (mode === "bluegreen") api = blueGreen();
    else if (mode === "canary") api = canary();
    else api = flags();
    api.render(0, false);
    return { go: (i, animate) => api.render(i, animate) };

    // ================= 블루그린 =================
    function blueGreen() {
      const L = nar
        ? { ux: 41, uy: 46, cols: 20, ul: [190, 28], R: [190, 190], blue: [16, 282, 166, 92], green: [198, 282, 166, 92], db: [190, 446, 92, 44] }
        : { ux: 20, uy: 120, cols: 10, ul: [93, 102], R: [268, 190], blue: [372, 40, 190, 96], green: [372, 244, 190, 96], db: [467, 190, 74, 46] };
      text(topG, L.ul[0], L.ul[1], "사용자", { size: 15, weight: 700, anchor: "middle", fill: C.ink });
      cells = grid(cellG, L.ux, L.uy, L.cols, 100, 12, 3);
      const B = envBox(...L.blue, C.a, "블루"), G = envBox(...L.green, C.c, "그린");
      const bIn = nar ? [B.x + B.w / 2, B.y] : [B.x, B.y + B.h / 2], gIn = nar ? [G.x + G.w / 2, G.y] : [G.x, G.y + G.h / 2];
      lanes = { blue: { pts: [L.R, bIn], color: C.a }, green: { pts: [L.R, gIn], color: C.c } };
      const laneE = { blue: line(laneG, ...L.R, ...bIn, { width: 3 }), green: line(laneG, ...L.R, ...gIn, { width: 3 }) };
      // DB (두 환경이 같이 써요)
      const dbG = g(boxG);
      const [dx, dy, dw, dh] = L.db;
      const dbL1 = nar ? line(dbG, B.x + B.w / 2, B.y + B.h, dx - dw / 2 + 8, dy - 6, { color: C.line, width: 1.5 }) : line(dbG, dx, B.y + B.h, dx, dy - dh / 2, { color: C.line, width: 1.5 });
      const dbL2 = nar ? line(dbG, G.x + G.w / 2, G.y + G.h, dx + dw / 2 - 8, dy - 6, { color: C.line, width: 1.5 }) : line(dbG, dx, dy + dh / 2, dx, G.y, { color: C.line, width: 1.5 });
      const db = cylinder(dbG, dx, dy, dw, dh, "같은 DB");
      const weakT = text(topG, nar ? dx : dx, nar ? dy + dh / 2 + 16 : dy + dh / 2 + 16, "스키마 변경은 양쪽에 맞게", { size: 14, weight: 700, fill: C.b, anchor: "middle", cls: "halo" });
      // 두 상자 모두 '운영 환경' 한 벌씩 — 약점 단계에서 주황(비용)
      const costB = text(topG, B.x + B.w - 10, B.y + 20, "운영 환경 1", { size: 14, weight: 600, fill: C.sub, anchor: "end" });
      const costG = text(topG, G.x + G.w - 10, G.y + 20, "운영 환경 2", { size: 14, weight: 600, fill: C.sub, anchor: "end" });
      // 배포 막대 (그린 상자 안)
      const barBg = rect(boxG, G.x + 12, G.y + G.h - 18, G.w - 24, 6, { r: 3, fill: C.soft });
      const bar = rect(boxG, G.x + 12, G.y + G.h - 18, 0, 6, { r: 3, fill: C.c });
      // 길잡이: 동그라미 + 바늘 (가리키는 쪽으로 요청이 가요)
      const [rx, ry] = L.R;
      const knob = g(topG, { tabindex: "0", role: "button", "aria-label": "길잡이 돌리기 — 누르면 블루와 그린을 바꿔요" });
      circle(knob, rx, ry, 25, { fill: C.bg, stroke: C.ink, sw: 2 });
      const needle = line(knob, rx, ry, rx + 18, ry, { color: C.ink, width: 3.2 });
      circle(knob, rx, ry, 4.5, { fill: C.ink });
      if (nar) text(topG, rx + 34, ry, "길잡이", { size: 15, weight: 700, fill: C.ink }); else text(topG, rx, ry + 42, "길잡이", { size: 15, weight: 700, anchor: "middle", fill: C.ink });
      knob.style.cursor = "pointer";
      const angTo = (p) => Math.atan2(p[1] - ry, p[0] - rx);
      const st = { live: "blue", ang: angTo(bIn), userLive: "green" };
      const seg = choice(f.controls(), [["blue", "블루 v1 로"], ["green", "그린 v2 로"]], "blue", (k) => { st.userLive = k; toLast(); }, "길잡이가 보내는 곳");
      const toggle = () => { st.userLive = st.live === "blue" ? "green" : "blue"; toLast(); };
      knob.addEventListener("click", toggle);
      knob.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      function toLast() { if (f.step() !== LAST) f.goto(LAST); else render(LAST, true); }

      routerAt = () => L.R;
      route = () => st.live;
      isErr = (c, id) => id === "green" && st.bad;
      function setLive(live, animate) {
        st.live = live; fade(animate);
        cells.forEach((c) => (c.el.style.fill = live === "blue" ? C.a : C.c));
        for (const k of ["blue", "green"]) {
          const on = k === live, e = laneE[k];
          e.style.stroke = on ? lanes[k].color : C.line; e.setAttribute("stroke-width", on ? 3.2 : 1.6); e.setAttribute("stroke-dasharray", on ? "" : "5 5");
        }
        const to = angTo(live === "blue" ? bIn : gIn), from = st.ang;
        return anim(animate ? 380 : 0, (t) => { st.ang = lerp(from, to, t); needle.setAttribute("x2", rx + 18 * Math.cos(st.ang)); needle.setAttribute("y2", ry + 18 * Math.sin(st.ang)); });
      }
      function greenState(k, p = 1) {
        st.bad = k === "bad";
        G.l1.textContent = { idle: "비어 있음 (대기)", deploy: p < 1 ? "v2 배포 중…" : "v2 · 새 버전", v2: "v2 · 새 버전", bad: "v2 · 문제 발견" }[k];
        G.l1.style.fill = k === "bad" ? C.no : C.ink;
        barBg.style.display = bar.style.display = k === "deploy" ? "" : "none";
        bar.setAttribute("width", (G.w - 24) * p);
      }
      function texts(live, gk) {
        B.l1.textContent = "v1 · 지금 버전";
        const bOn = live === "blue";
        B.l2.textContent = bOn ? "요청 100% 받는 중" : "그대로 대기 (되돌릴 곳)";
        G.l2.textContent = !bOn ? "요청 100% 받는 중" : gk === "idle" ? "" : gk === "bad" ? "길잡이를 돌려서 사용자 0%" : "사용자는 아직 못 봐요";
        const pct = (k) => (k === live ? 100 : 0);
        const dep = gk === "idle" ? "v2 아직 없음" : gk === "deploy" ? "v2 를 그린에 배포" : "v2 배포됨";
        const weak = STEPS[st.i]?.weak ? `<div><b class="b">약점</b> ① 비용: 운영 환경을 두 벌 유지해요 · ② DB: 두 환경이 같은 DB 를 쓰면 스키마 변경이 양쪽과 맞아야 해요 <span class="dim">(늘리기 → 줄이기와 같이 써요)</span></div>` : "";
        ro.set(`<div>길잡이 → <span class="a">블루 v1 ${pct("blue")}%</span> · <span class="c">그린 v2 ${pct("green")}%</span></div><div>${dep} · 출시: <b>${live === "green" ? "v2 (모두에게)" : "아직 v1"}</b>${gk === "bad" ? ` <span class="dim">— 길잡이 한 번으로 되돌렸어요</span>` : ""}</div>${weak}`);
      }
      async function render(i, animate) {
        const S = STEPS[i], my = ++gen;
        st.i = i;
        const live = S.user ? st.userLive : S.live, gk = S.user ? "v2" : S.green;
        seg.set(live);
        show(weakT, !!S.weak, animate ? 300 : 0);
        for (const t of [costB, costG]) { t.style.fill = S.weak ? C.b : C.sub; t.setAttribute("font-weight", S.weak ? 700 : 600); }
        db.querySelectorAll("path, ellipse").forEach((e) => (e.style.stroke = S.weak ? C.b : C.sub));
        [dbL1, dbL2].forEach((e) => (e.style.stroke = S.weak ? C.b : C.line));
        if (!animate) { greenState(gk); texts(live, gk); return setLive(live, false); }
        if (S.green === "deploy") { // 그린에 v2 를 올려요 (요청은 여전히 블루로)
          setLive("blue", false); texts("blue", "deploy"); greenState("deploy", 0);
          await anim(1100, (t) => { if (my === gen) greenState("deploy", t); });
          if (my === gen) { greenState("deploy", 1); texts("blue", "v2"); }
          return;
        }
        if (S.back) { // 그린으로 나가 있다가 → 오류 → 블루로 되돌려요
          greenState("v2"); texts("green", "v2"); await setLive("green", false); st.bad = true; G.l1.textContent = "v2 · 오류가 나요"; G.l1.style.fill = C.no;
          await later(my, 1500, () => { greenState("bad"); texts("blue", "bad"); setLive("blue", true); });
          return;
        }
        greenState(gk); texts(live, gk);
        return setLive(live, true);
      }
      return { render };
    }

    // ================= 카나리 =================
    function canary() {
      const L = nar
        ? { ex: 41, ey: 34, el: [41, 22], ux: 41, uy: 72, cols: 20, ul: [41, 60], R: [190, 186], v1: [16, 232, 166, 84], v2: [198, 232, 166, 84], mon: { x0: 122, x1: 366, y0: 372, y1: 432, lx: 14, ty: 352, by: 450 } }
        : { ex: 20, ey: 40, el: [20, 26], ux: 20, uy: 84, cols: 10, ul: [20, 70], R: [252, 146], v1: [362, 26, 200, 86], v2: [362, 168, 200, 86], mon: { x0: 132, x1: 562, y0: 290, y1: 348, lx: 20, ty: 270, by: 366 } };
      text(topG, ...L.el, "직원", { size: 15, weight: 700, fill: C.ink });
      text(topG, ...L.ul, "사용자 100명", { size: 15, weight: 700, fill: C.ink });
      const emp = grid(cellG, L.ex, L.ey, 10, 10, 12, 3, { emp: true });
      const users = grid(cellG, L.ux, L.uy, L.cols, 100, 12, 3, { emp: false });
      cells = [...emp, ...users];
      const order = users.map((_, k) => k); // 한 줄로 세워서 앞에서부터 받아요 (1% 의 한 명은 10% 안에도 있어요)
      for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
      order.forEach((k, r) => (users[k].rank = r));
      const V1 = envBox(...L.v1, C.a, "v1 · 지금 버전"), V2 = envBox(...L.v2, C.c, "v2 · 새 버전");
      const in1 = nar ? [V1.x + V1.w / 2, V1.y] : [V1.x, V1.y + V1.h / 2], in2 = nar ? [V2.x + V2.w / 2, V2.y] : [V2.x, V2.y + V2.h / 2];
      lanes = { v1: { pts: [L.R, in1], color: C.a }, v2: { pts: [L.R, in2], color: C.c } };
      const l1 = line(laneG, ...L.R, ...in1, { width: 3 }), l2 = line(laneG, ...L.R, ...in2, { width: 3 });
      l1.style.stroke = C.a; l2.style.stroke = C.c;
      const mid = (a, b, k = 0.55) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
      const p1 = mid(L.R, in1), p2 = mid(L.R, in2);
      const t1 = text(topG, p1[0] + (nar ? -6 : 0), p1[1] + (nar ? 0 : -12), "", { size: 15, weight: 700, fill: C.a, anchor: nar ? "end" : "middle", cls: "halo" });
      const t2 = text(topG, p2[0] + (nar ? 6 : 0), p2[1] + (nar ? 0 : 14), "", { size: 15, weight: 700, fill: C.c, anchor: nar ? "start" : "middle", cls: "halo" });
      const [rx, ry] = L.R;
      circle(topG, rx, ry, 22, { fill: C.bg, stroke: C.ink, sw: 2 });
      path(topG, `M${rx - 11},${ry} L${rx - 2},${ry} L${rx + 9},${ry - 8} M${rx - 2},${ry} L${rx + 9},${ry + 8}`, { stroke: C.ink, width: 2.4 });
      if (nar) text(topG, rx - 32, ry, "길잡이", { size: 15, weight: 700, fill: C.ink, anchor: "end" }); else text(topG, rx, ry + 38, "길잡이", { size: 15, weight: 700, fill: C.ink, anchor: "middle" });

      // 감시판: 새 버전 오류율 (단계마다 한 칸 · 지켜보는 시간)
      const m = L.mon, mg = g(boxG), bw = (m.x1 - m.x0) / 4, yv = (v) => m.y1 - ((m.y1 - m.y0) * v) / 3; // v: 지금 버전 오류율의 몇 배
      text(mg, m.lx, m.ty, "감시판 · 새 버전(초록)의 오류율", { size: 14, weight: 700, fill: C.ink });
      const bands = CN_STAGES.map((S, b) => {
        const r = rect(mg, m.x0 + b * bw + 1, m.y0 - 6, bw - 2, m.y1 - m.y0 + 6, { r: 3, fill: C.soft });
        const t = text(mg, m.x0 + b * bw + bw / 2, m.by, S.k, { size: 14, weight: 600, fill: C.sub, anchor: "middle" });
        return { r, t };
      });
      line(mg, m.x0, m.y1, m.x1, m.y1, { color: C.line, width: 1.2 });
      line(mg, m.x0, yv(1), m.x1, yv(1), { color: C.a, width: 1.4, dash: "5 4" }); // 지금 버전 오류율
      line(mg, m.x0, yv(2), m.x1, yv(2), { color: C.no, width: 1.6, dash: "6 4" }); // 멈춤 기준 = 2배
      text(mg, m.x0 - 8, yv(1), "지금 버전", { size: 14, weight: 600, fill: C.a, anchor: "end" });
      text(mg, m.x0 - 8, yv(2), "멈춤 기준 2배", { size: 14, weight: 700, fill: C.no, anchor: "end" });
      const gl = path(mg, "", { stroke: C.c, width: 2.4 });
      const stopG = g(mg), stopC = circle(stopG, 0, 0, 6, { fill: C.no, stroke: C.bg, sw: 2 }), stopT = text(stopG, 0, 0, "멈춤 → 되돌림", { size: 14, weight: 700, fill: C.no, cls: "halo" });
      const cancelT = text(mg, 0, (yv(1) + yv(2)) / 2, "취소", { size: 14, weight: 600, fill: C.mute, anchor: "middle" });
      // 오류율 자료 (같은 씨앗 → 늘 같은 모양)
      const NB = 22, r2 = rng(5), ok = CN_STAGES.map(() => Array.from({ length: NB + 1 }, () => 0.86 + 0.3 * r2()));
      const spike = Array.from({ length: NB + 1 }, (_, k) => 0.95 + 1.75 * clamp(k / (NB * 0.62), 0, 1) ** 1.3 + 0.08 * r2());
      const cross = spike.findIndex((v) => v >= 2); // 기준을 넘는 칸
      function monitor(stg, bug, frac) { // frac: 마지막 칸을 얼마나 그렸나 (0→1)
        let d = "";
        for (let b = 0; b <= stg; b++) {
          const data = bug && b === stg ? spike : ok[b], upto = b < stg ? NB : Math.round(NB * frac), stopAt = bug && b === stg ? Math.min(upto, cross) : upto;
          for (let k = 0; k <= stopAt; k++) d += `${d ? "L" : "M"}${m.x0 + b * bw + (bw * k) / NB},${yv(Math.min(2.9, data[k]))} `;
        }
        gl.setAttribute("d", d);
        const stopped = bug && Math.round(NB * frac) >= cross;
        show(stopG, stopped, 200);
        if (stopped) {
          const x = m.x0 + stg * bw + (bw * cross) / NB, y = yv(spike[cross]);
          stopC.setAttribute("cx", x); stopC.setAttribute("cy", y);
          const right = stg === 0; // 보통은 왼쪽(지나온 칸 위) — 첫 칸이면 오른쪽
          stopT.setAttribute("x", right ? x + 10 : x - 10); stopT.setAttribute("y", y - 12); stopT.setAttribute("text-anchor", right ? "start" : "end");
        }
        bands.forEach((B, b) => {
          B.r.style.fill = b === stg ? (stopped ? C.bSoft : C.cSoft) : b < stg ? C.soft : C.bg;
          B.r.style.stroke = b > stg ? C.grid : "none";
          B.t.style.fill = b === stg ? C.ink : b < stg ? C.sub : C.mute;
          B.t.setAttribute("font-weight", b === stg ? 700 : 500);
        });
        show(cancelT, stopped && stg < 3, 200);
        if (stopped && stg < 3) cancelT.setAttribute("x", m.x0 + (stg + 1) * bw + ((3 - stg) * bw) / 2);
        return stopped;
      }
      const st = { stg: 0, bug: false, rolled: false, userStg: 2, userBug: false };
      const onV2 = (c) => !st.rolled && (c.emp || c.rank < Math.round(CN_STAGES[st.stg].p * 100));
      routerAt = () => L.R;
      route = (c) => (onV2(c) ? "v2" : "v1");
      isErr = (c, id) => id === "v2" && st.bug && !st.rolled;
      const segS = choice(f.controls(), CN_STAGES.map((S, b) => [String(b), S.k]), "2", (k) => { st.userStg = Number(k); toLast(); }, "카나리 단계");
      const segB = choice(f.controls(), [["ok", "새 버전 정상"], ["bug", "버그 넣기"]], "ok", (k) => { st.userBug = k === "bug"; toLast(); }, "새 버전 상태");
      function toLast() { if (f.step() !== LAST) f.goto(LAST); else render(LAST, true); }
      function paint(hit) {
        cells.forEach((c) => {
          c.el.style.fill = onV2(c) ? C.c : C.a;
          c.el.style.stroke = hit && hit(c) ? C.no : "none"; c.el.style.strokeWidth = "2.4px";
        });
        const p = CN_STAGES[st.stg].p, share = st.rolled ? 0 : st.stg === 0 ? "직원만" : `${Math.round(p * 100)}%`;
        t2.textContent = st.rolled ? "0%" : share; t1.textContent = st.rolled ? "100%" : st.stg === 0 ? "사용자 100%" : p >= 1 ? "0%" : `${100 - Math.round(p * 100)}%`;
        const w2 = st.rolled ? 1.4 : st.stg === 0 ? 2 : 1.6 + 4.4 * p, w1 = st.rolled ? 5.5 : 1.6 + 4.4 * (1 - p);
        l1.setAttribute("stroke-width", w1); l2.setAttribute("stroke-width", w2);
        l2.setAttribute("stroke-dasharray", st.rolled ? "5 5" : ""); l2.style.stroke = st.rolled ? C.line : C.c;
        V1.l1.textContent = st.rolled ? "모든 요청을 받아요" : st.stg === 3 ? "요청 없음" : "나머지 요청";
        V2.l1.textContent = st.rolled ? "되돌림 (요청 없음)" : st.bug ? "오류가 늘어요" : st.stg === 3 ? "전체 출시" : "지켜보는 중";
        V2.l1.style.fill = st.bug ? C.no : C.ink;
        V1.l2.textContent = ""; V2.l2.textContent = st.rolled ? "" : st.stg === 0 ? "직원에게만" : `사용자 ${Math.round(p * 100)}% + 직원`;
      }
      function texts(stopped) {
        const S = CN_STAGES[st.stg], who = st.stg === 0 ? "직원" : `직원 + 사용자 ${Math.round(S.p * 100)}%`;
        const rows = [`<div>새 버전(<span class="c">초록</span>)을 받은 사람: <b>${who}</b> · 지금 버전(<span class="a">파란</span>): ${st.stg === 0 ? "사용자 100%" : `사용자 ${100 - Math.round(S.p * 100)}%`}</div>`];
        if (st.bug && stopped) rows.push(`<div>오류율이 멈춤 기준(지금 버전의 <b>2배</b>)을 넘었어요 → <b>멈추고 되돌림</b> · 그때 새 버전을 쓰던 사람(빨간 테두리): <b class="b">${who}</b>${st.stg < 3 ? ` <span class="dim">— 나머지 사용자 ${100 - Math.round(S.p * 100)}% 는 버그를 못 봤어요</span>` : ` <span class="dim">— 모두가 버그를 봤어요</span>`}</div>`);
        else if (st.bug) rows.push(`<div>오류율이 오르고 있어요…</div>`);
        else rows.push(`<div>오류율이 멈춤 기준(2배) 아래 ✓ → ${st.stg < 3 ? "다음 단계로 넓혀도 돼요" : "전체 출시 끝"}</div>`);
        ro.set(rows.join(""));
      }
      async function render(i, animate) {
        const S = STEPS[i], my = ++gen;
        st.stg = S.user ? st.userStg : S.stage; st.bug = S.user ? st.userBug : !!S.bug; st.rolled = false;
        segS.set(String(st.stg)); segB.set(st.bug ? "bug" : "ok");
        fade(animate); paint(); texts(false);
        if (!animate) {
          const stopped = monitor(st.stg, st.bug, 1);
          if (st.bug) { const was = (c) => c.emp || c.rank < Math.round(CN_STAGES[st.stg].p * 100); st.rolled = true; paint(was); }
          texts(stopped); return;
        }
        // 마지막 칸(지금 단계)을 지켜보는 시간만큼 그려요. 버그면 기준을 넘는 순간 멈추고 되돌려요
        let rolled = false;
        await anim(st.bug ? 2200 : 1300, (t) => {
          if (my !== gen) return;
          const stopped = monitor(st.stg, st.bug, t);
          if (stopped && !rolled) {
            rolled = true;
            const was = (c) => c.emp || c.rank < Math.round(CN_STAGES[st.stg].p * 100);
            setTimeout(() => { if (my !== gen) return; st.rolled = true; paint(was); texts(true); }, reduced() ? 0 : 450);
          }
        }, (t) => t);
        if (my === gen && !st.bug) texts(false);
      }
      return { render };
    }

    // ================= 기능 플래그 =================
    function flags() {
      const NAMES = nar ? ["두런 직원", "팀원 적은 곳", "팀원 많은 곳"] : ["두런 직원 (22명)", "팀원이 적은 워크스페이스", "팀원이 많은 워크스페이스"];
      const groups = [[], [], []];
      // 칸 배치: 직원 22명 · 작은 팀 4명 × 5 · 큰 팀 24명 × 2
      if (!nar) {
        groups[0] = grid(cellG, 20, 46, 11, 22, 11, 3, { gi: 0 });
        for (let t = 0; t < 5; t++) groups[1].push(...grid(cellG, 20 + t * 32, 132, 2, 4, 11, 3, { gi: 1 }));
        for (let t = 0; t < 2; t++) groups[2].push(...grid(cellG, 20 + t * 90, 232, 6, 24, 11, 3, { gi: 2 }));
      } else {
        groups[0] = grid(cellG, 18, 40, 6, 22, 12, 3, { gi: 0 });
        for (let t = 0; t < 5; t++) groups[1].push(...grid(cellG, 138 + (t % 3) * 36, 40 + Math.floor(t / 3) * 36, 2, 4, 12, 3, { gi: 1 }));
        for (let t = 0; t < 2; t++) groups[2].push(...grid(cellG, 278, 40 + t * 56, 6, 24, 10, 2, { gi: 2 }));
      }
      cells = groups.flat();
      const labelAt = nar ? [[61, 22], [190, 22], [313, 22]] : [[20, 30], [20, 116], [20, 216]];
      NAMES.forEach((n, k) => text(topG, ...labelAt[k], n, { size: nar ? 14 : 15, weight: 700, fill: C.ink, anchor: nar ? "middle" : "start" }));
      // 스위치 (집단마다 하나)
      const swAt = nar ? [[61, 176], [190, 176], [313, 176]] : [[232, 62], [232, 146], [232, 270]];
      const SV = nar ? { x: 14, y: 222, w: 352, h: 262 } : { x: 300, y: 22, w: 262, h: 318 };
      rect(backG, SV.x, SV.y, SV.w, SV.h, { r: 10, fill: C.soft, stroke: C.line, sw: 1.6 }); // 길이 상자 안까지 보이게 맨 아래에
      const ty = nar ? SV.y + SV.h - 50 : SV.y + 22; // 좁은 판: 길이 위에서 내려오니 제목은 아래에
      text(backG, SV.x + 14, ty, "운영 서버 · 새 코드 배포됨", { size: 15, weight: 700, fill: C.ink });
      text(backG, SV.x + 14, ty + 22, "flags.on('new-assign-view')", { size: 13, weight: 500, fill: C.sub, mono: true });
      const NB = nar ? { neu: [30, 292, 152, 84], old: [198, 292, 152, 84] } : { neu: [384, 98, 160, 84], old: [384, 232, 160, 84] };
      const NEW = envBox(...NB.neu, C.c, "새 배정 화면"), OLD = envBox(...NB.old, C.a, "옛 배정 화면");
      NEW.l1.textContent = "showNewView()"; OLD.l1.textContent = "showOldView()";
      for (const X of [NEW, OLD]) { X.l1.setAttribute("font-family", "var(--fg-mono)"); X.l1.setAttribute("font-size", 13); X.l1.style.fill = C.sub; }
      const inNew = nar ? [NEW.x + NEW.w / 2, NEW.y] : [NEW.x, NEW.y + NEW.h / 2], inOld = nar ? [OLD.x + OLD.w / 2, OLD.y] : [OLD.x, OLD.y + OLD.h / 2];
      lanes = {}; const laneE = {};
      swAt.forEach((p, k) => {
        const from = nar ? [p[0], p[1] + 12] : [p[0] + 22, p[1]];
        for (const [b, to, color] of [["neu", inNew, C.c], ["old", inOld, C.a]]) {
          lanes[`${k}${b}`] = { pts: [p, from, to], color };
          laneE[`${k}${b}`] = line(laneG, ...from, ...to, { width: 2.4 });
        }
      });
      const st = { on: [0, 0, 0], user: [1, 1, 0], err: false, killed: false };
      const sws = swAt.map((p, k) => {
        const gg = g(topG, { tabindex: "0", role: "switch", "aria-label": `${NAMES[k]} 스위치` });
        gg.style.cursor = "pointer";
        // 손가락으로 누르기 쉽게 보이지 않는 넓은 칸
        if (nar) rect(gg, p[0] - 30, p[1] - 20, 100, 40, { r: 0, fill: "transparent" }); else rect(gg, p[0] - 32, p[1] - 20, 64, 58, { r: 0, fill: "transparent" });
        const body = rect(gg, p[0] - 22, p[1] - 12, 44, 24, { r: 12, fill: C.soft, stroke: C.line, sw: 1.5 });
        const kn = circle(gg, p[0] - 10, p[1], 8.5, { fill: C.bg, stroke: C.sub, sw: 1.5 });
        const t = nar ? text(gg, p[0] + 28, p[1], "", { size: 14, weight: 700, fill: C.sub }) : text(gg, p[0], p[1] + 26, "", { size: 14, weight: 700, anchor: "middle", fill: C.sub });
        const flip = () => { st.user[k] = st.on[k] ? 0 : 1; if (f.step() !== LAST) { st.user = st.on.slice(); st.user[k] = st.on[k] ? 0 : 1; f.goto(LAST); } else render(LAST, true); };
        gg.addEventListener("click", flip);
        gg.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
        return { gg, body, kn, t, p };
      });
      routerAt = (c) => swAt[c.gi];
      route = (c) => `${c.gi}${st.on[c.gi] ? "neu" : "old"}`;
      isErr = (c, id) => st.err && id.endsWith("neu");
      function paint(animate) {
        fade(animate);
        cells.forEach((c) => (c.el.style.fill = st.on[c.gi] ? C.c : C.a));
        sws.forEach((S, k) => {
          const on = !!st.on[k];
          S.body.style.fill = on ? C.c : C.soft; S.body.style.stroke = on ? C.c : C.line;
          S.kn.style.transition = reduced() || !animate ? "none" : "transform .25s ease";
          S.kn.style.transform = on ? "translateX(20px)" : "translateX(0)";
          S.kn.style.stroke = on ? C.c : C.sub;
          S.t.textContent = on ? "켜짐" : "꺼짐"; S.t.style.fill = on ? C.c : C.sub;
          S.gg.setAttribute("aria-checked", String(on));
          for (const b of ["neu", "old"]) {
            const e = laneE[`${k}${b}`], act = (b === "neu") === on;
            e.style.stroke = act ? (b === "neu" ? C.c : C.a) : C.grid; e.setAttribute("stroke-width", act ? 2.6 : 1.2); e.setAttribute("stroke-dasharray", act ? "" : "4 5");
          }
        });
        const onN = st.on.reduce((a, b) => a + b, 0);
        NEW.l2.textContent = st.err ? "오류가 나요" : st.killed ? "스위치로 꺼 둠" : onN ? `${st.on.map((v, k) => (v ? NAMES[k].replace(/ \(.*\)/, "") : "")).filter(Boolean).length}개 집단이 봐요` : "아무도 안 봐요";
        NEW.l2.style.fill = st.err ? C.no : C.sub;
        OLD.l2.textContent = onN === 3 ? "아무도 안 봐요" : onN ? "나머지가 봐요" : "모두가 봐요";
        const who = st.on.map((v, k) => (v ? NAMES[k].replace(/ \(.*\)/, "") : null)).filter(Boolean);
        ro.set(`<div><span style="font-family:var(--fg-mono)">if (flags.on('new-assign-view', workspace))</span> → <span class="c">새 화면</span>, 아니면 <span class="a">옛 화면</span></div><div>배포: <b>완료</b> (재배포 없음) · 켜진 집단: <b>${who.length ? who.join(" · ") : "없음"}</b>${st.err ? ` <span class="dim">— 스위치만 끄면 바로 옛 화면</span>` : st.killed ? ` <span class="dim">— 스위치만 껐어요. 되돌리기 배포는 없어요</span>` : ""}</div>`);
      }
      async function render(i, animate) {
        const S = STEPS[i], my = ++gen;
        st.err = false; st.killed = false;
        if (S.kill && animate) { // 켜 둔 채로 오류가 보이다가 → 스위치를 모두 꺼요
          st.on = [1, 1, 0]; st.err = true; paint(false);
          await later(my, 1500, () => { st.on = [0, 0, 0]; st.err = false; st.killed = true; paint(true); });
          return;
        }
        st.killed = !!S.kill;
        st.on = (S.user ? st.user : S.on).slice();
        paint(animate);
      }
      return { render };
    }
  },
};

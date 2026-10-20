// 그림: 확장 → 이동 → 축소 — 서비스를 멈추지 않고 컬럼 이름 바꾸기 (Dev Flow 06 데이터 c10 · 10 테스트와 배포 c09)
//   카드의 예: 녹음 테이블의 '파일 경로' 컬럼 이름을 바꾸기. 위: 같이 도는 앱 두 버전(왼쪽 = 옛 버전 · 오른쪽 = 새로 배포 중), 아래: 녹음 테이블.
//   선 = 앱이 그 컬럼을 읽거나 쓰는 길(파란 = 옛 컬럼 '파일 경로' · 초록 = 새 컬럼 '새 이름'), 점 = 실제로 오가는 요청(kit.loop).
//   단계마다 두 버전이 모두 ✓ 인지 보여 줘요 — 그래서 멈추는 시간이 없어요. opts.mode = "release" 면 늘리기 → 옮기기 → 줄이기 (c09 말)
import { svg, g, text, line, circle, rect, path, loop, readout, anim, show, reduced, lerp, clamp, C } from "./kit.js";

const WORDS = { data: ["확장", "이동", "축소"], release: ["늘리기", "옮기기", "줄이기"] };
// 앱: v · 읽는 컬럼(r) · 쓰는 컬럼(w). 컬럼: old = 파일 경로 · neu = 새 이름
const V1 = { v: "v1", r: "old", w: ["old"] }, V2 = { v: "v2", r: "old", w: ["old", "neu"] }, V3 = { v: "v3", r: "neu", w: ["old", "neu"] }, V4 = { v: "v4", r: "neu", w: ["neu"] };
const STEPS = (w) => [
  { cap: "한 번에 이름을 바꾸면? 배포되는 몇 분 동안 옛 앱(v1)은 사라진 ‘파일 경로’ 컬럼을 찾다가 오류가 나요.", ph: -1, L: { ...V1, err: 1 }, R: { v: "v2", r: "old", w: ["old"] }, rename: 1, rows: 4 },
  { cap: `${w[0]}: 새 이름의 컬럼(초록)을 더해요. 옛 컬럼은 그대로라서 옛 앱 v1 은 하던 대로 읽고 써요.`, ph: 0, L: V1, R: null, neu: 1, rows: 4 },
  { cap: "새 앱 v2 는 두 컬럼에 같이 써요(읽기는 아직 옛 컬럼). 배포 중에 v1 과 v2 가 함께 돌아도 둘 다 괜찮아요.", ph: 1, L: V1, R: V2, neu: 1, rows: 6, fill: [5] },
  { cap: "모두 v2 로 바뀌면, 예전 행의 값을 새 컬럼에 복사해요. 이제 새 컬럼도 모든 행이 찼어요.", ph: 1, L: null, R: V2, neu: 1, rows: 6, fill: "all", copy: 1 },
  { cap: "새 앱 v3 는 새 컬럼을 읽어요. v2 와 v3 가 같이 돌아도, 두 컬럼 값이 같아서 둘 다 괜찮아요.", ph: 1, L: V2, R: V3, neu: 1, rows: 6, fill: "all", slide: 1 },
  { cap: `${w[2]}: v4 는 새 컬럼만 써요. 아무도 옛 컬럼을 안 읽고 안 쓰는 걸 확인한 뒤에야 지워요.`, ph: 2, L: null, R: V4, neu: 1, rows: 6, fill: "all", drop: 1, prevL: V3 },
];

export default {
  aspect: 380 / 580,
  aspectNarrow: 384 / 380,
  steps: (o) => STEPS(WORDS[o.mode] || WORDS.data).map((s) => s.cap),
  hint: "점 = 앱이 컬럼을 읽고 쓰는 요청",
  mount(stage, f) {
    const words = WORDS[f.opts.mode] || WORDS.data, SP = STEPS(words);
    const nar = !!f.narrow, W = nar ? 380 : 580, H = nar ? 384 : 380;
    const s = svg(stage, W, H, "앱 두 버전과 녹음 테이블의 컬럼 — 확장, 이동, 축소");
    // 배치
    const L = nar
      ? { ph: [92, 190, 288], phY: 18, app: { L: [10, 40, 176, 70], R: [194, 40, 176, 70] }, tx: 36, cols: { id: [36, 44], old: [80, 132], neu: [212, 132] }, hy: 186, rh: 24 }
      : { ph: [180, 290, 400], phY: 20, app: { L: [24, 46, 216, 68], R: [340, 46, 216, 68] }, tx: 96, cols: { id: [96, 44], tit: [140, 92], old: [232, 126], neu: [358, 126] }, hy: 190, rh: 25 };
    const conG = g(s), tabG = g(s), appG = g(s), dotG = g(s), topG = g(s);

    // ---- 단계 띠 (확장 · 이동 · 축소) ----
    const pills = words.map((w, k) => {
      const gg = g(topG), x = L.ph[k];
      const r = rect(gg, x - 46, L.phY - 13, 92, 26, { r: 13, fill: C.bg, stroke: C.line, sw: 1.4 });
      const t = text(gg, x, L.phY, `${k + 1} · ${w}`, { size: 14, weight: 700, anchor: "middle", fill: C.sub });
      return { r, t };
    });
    const once = text(topG, W / 2, L.phY, "한 번에 바꾸면?", { size: 15, weight: 700, anchor: "middle", fill: C.no });

    // ---- 녹음 테이블 ----
    const C0 = L.cols, ROWS = 6, hy = L.hy, rh = L.rh;
    const colX = (k) => C0[k][0], colW = (k) => C0[k][1];
    const tLeft = colX("id"), tRight = colX("neu") + colW("neu");
    text(tabG, tLeft, hy - 14, "녹음 테이블", { size: 14, weight: 700, fill: C.sub, base: "auto" });
    const frame = rect(tabG, tLeft, hy, tRight - tLeft, 28 + ROWS * rh, { r: 6, fill: C.bg, stroke: C.line, sw: 1.2 });
    rect(tabG, tLeft, hy, tRight - tLeft, 28, { r: 6, fill: C.soft });
    text(tabG, colX("id") + colW("id") / 2, hy + 14, "id", { size: 14, weight: 600, anchor: "middle", fill: C.sub });
    if (C0.tit) text(tabG, colX("tit") + 10, hy + 14, "제목", { size: 14, weight: 600, fill: C.sub });
    const rowY = (k) => hy + 28 + k * rh + rh / 2;
    const rowG = [...Array(ROWS)].map((_, k) => {
      const gg = g(tabG);
      line(gg, tLeft, hy + 28 + k * rh, tRight, hy + 28 + k * rh, { color: C.grid });
      text(gg, colX("id") + colW("id") / 2, rowY(k), String(k + 1), { size: 14, weight: 500, anchor: "middle", fill: C.sub, cls: "tab" });
      if (C0.tit) rect(gg, colX("tit") + 10, rowY(k) - 4, [52, 66, 44, 60, 50, 58][k], 8, { r: 4, fill: C.line });
      return gg;
    });
    // 컬럼 두 개: 머리 + 칸(값 = 막대)
    function column(k, color, soft, name) {
      const gg = g(tabG), x = colX(k), w = colW(k);
      const bg = rect(gg, x + 3, hy + 3, w - 6, 28 + ROWS * rh - 6, { r: 5, fill: soft });
      const head = text(gg, x + 10, hy + 14, name, { size: 15, weight: 700, fill: color });
      const cells = [...Array(ROWS)].map((_, r) => rect(gg, x + 10, rowY(r) - 4, [70, 58, 76, 64, 72, 60][r] * (w / 126), 8, { r: 4, fill: color }));
      const strike = line(gg, x + 6, hy + 14, x + w - 8, hy + 14, { color: C.no, width: 2.2 });
      strike.style.opacity = "0";
      return { gg, bg, head, cells, strike, x, w, color };
    }
    const OLD = column("old", C.a, C.aSoft, "파일 경로"), NEU = column("neu", C.c, C.cSoft, "새 이름");
    const copyG = g(tabG);
    // 복사 표시: 두 컬럼 사이 경계 한가운데 (옛 → 새)
    const cbx = NEU.x, cby = hy + 28 + 3 * rh;
    circle(copyG, cbx, cby, 13, { fill: C.c, stroke: C.bg, sw: 2 });
    path(copyG, `M${cbx - 6},${cby} L${cbx + 5},${cby} M${cbx + 1},${cby - 4} L${cbx + 5},${cby} L${cbx + 1},${cby + 4}`, { stroke: C.bg, width: 2.2 });
    text(copyG, cbx, cby - 24, "복사", { size: 14, weight: 700, anchor: "middle", fill: C.c, cls: "halo" });
    const goneT = text(tabG, OLD.x + OLD.w / 2, hy + 28 + ROWS * rh / 2, "지웠어요", { size: 15, weight: 700, anchor: "middle", fill: C.no, cls: "halo" });

    // ---- 앱 두 칸 ----
    function appBox(slot) {
      const [x, y, w, h] = L.app[slot], gg = g(appG);
      const r = rect(gg, x, y, w, h, { r: 8, fill: C.bg, stroke: C.ink, sw: 1.6 });
      const t = text(gg, x + 12, y + 20, "", { size: nar ? 15 : 16, weight: 700, fill: C.ink });
      const ok = text(gg, x + w - 12, y + 20, "", { size: nar ? 14 : 15, weight: 700, anchor: "end", fill: C.ok });
      const r1 = text(gg, x + 12, y + 42, "", { size: nar ? 13 : 14, weight: 500, fill: C.sub });
      const r2 = text(gg, x + 12, y + (nar ? 59 : 60), "", { size: nar ? 13 : 14, weight: 500, fill: C.sub });
      return { gg, r, t, ok, r1, r2, x, y, w, h, slot };
    }
    const A = { L: appBox("L"), R: appBox("R") };
    // 길 (앱 → 컬럼 머리)
    const anchorApp = (slot, col) => { const b = A[slot]; return [b.x + b.w * (col === "old" ? 0.36 : 0.64), b.y + b.h]; };
    const anchorCol = (slot, col, rename) => { const c = rename ? OLD : col === "old" ? OLD : NEU; return [c.x + c.w * (slot === "L" ? 0.32 : 0.68), hy]; };
    const cons = {};
    for (const slot of ["L", "R"]) for (const col of ["old", "neu"]) {
      const e = line(conG, 0, 0, 0, 0, { width: 2.2 });
      const lab = text(topG, 0, 0, "", { size: 14, weight: 700, anchor: "middle", fill: C.ink, cls: "halo" });
      cons[slot + col] = { e, lab, slot, col, on: false, mode: "", a: [0, 0], b: [0, 0], err: false };
    }

    // ---- 요청 점 ----
    const dots = [], fx = [];
    loop(stage, (dt) => {
      Object.values(cons).forEach((c, k) => {
        if (!c.on) return;
        c.t = (c.t ?? k * 330) + dt;
        if (c.t > 1500 && !reduced()) { c.t = 0; const up = c.mode === "읽음" || (c.mode === "읽고 씀" && (c.flip = !c.flip)); dots.push({ c, d: 0, up: up && !c.err, e: circle(dotG, 0, 0, 3.8, { fill: c.err ? C.no : c.col === "old" ? C.a : C.c }) }); }
      });
      for (let k = dots.length - 1; k >= 0; k--) {
        const D = dots[k]; D.d += dt / 700;
        if (!D.c.on || D.d >= 1) {
          if (D.c.on && D.c.err) { const [x, y] = D.c.b; fx.push({ p: path(dotG, `M${x - 6},${y - 12} L${x + 6},${y} M${x + 6},${y - 12} L${x - 6},${y}`, { stroke: C.no, width: 2.6 }), t: 0 }); }
          D.e.remove(); dots.splice(k, 1); continue;
        }
        const [a, b] = D.up ? [D.c.b, D.c.a] : [D.c.a, D.c.b];
        D.e.setAttribute("cx", lerp(a[0], b[0], D.d)); D.e.setAttribute("cy", lerp(a[1], b[1], D.d));
      }
      for (let k = fx.length - 1; k >= 0; k--) { const x = fx[k]; x.t += dt; x.p.style.opacity = String(clamp(1 - x.t / 600, 0, 1)); if (x.t > 600) { x.p.remove(); fx.splice(k, 1); } }
    });

    // ---- 그리기 ----
    const ro = readout(f.controls());
    const name = (col) => (col === "old" ? "파일 경로" : "새 이름");
    function setApp(slot, a, o = {}) {
      const B = A[slot];
      if (!a) { show(B.gg, false, o.ms ?? 0); return; }
      show(B.gg, true, o.ms ?? 0);
      B.t.textContent = `${slot === "L" ? "옛 앱" : "새 앱"} ${a.v}`;
      B.ok.textContent = a.err ? "✕ 오류" : "✓ 동작"; B.ok.style.fill = a.err ? C.no : C.ok;
      B.r.style.stroke = a.err ? C.no : C.ink;
      const rename = o.rename;
      B.r1.textContent = rename && slot === "L" ? "읽기 · 쓰기: 파일 경로" : rename ? "읽기 · 쓰기: 새 이름" : `읽기: ${name(a.r)}`;
      B.r2.textContent = rename ? "" : `쓰기: ${a.w.map(name).join(" + ")}`;
    }
    function setCons(S, alpha = 1) {
      for (const c of Object.values(cons)) {
        const a = S[c.slot], rename = !!S.rename;
        let on = false, mode = "";
        if (a) {
          if (rename) { on = c.col === "old"; mode = c.slot === "L" ? "‘파일 경로’?" : "읽고 씀"; }
          else { const r = a.r === c.col, w = a.w.includes(c.col); on = r || w; mode = r && w ? "읽고 씀" : r ? "읽음" : "씀"; }
        }
        c.on = on && alpha > 0; c.mode = mode; c.err = !!(a && a.err && rename);
        c.a = anchorApp(c.slot, c.col); c.b = anchorCol(c.slot, c.col, rename);
        const color = c.err ? C.no : rename ? C.c : c.col === "old" ? C.a : C.c;
        c.e.setAttribute("x1", c.a[0]); c.e.setAttribute("y1", c.a[1]); c.e.setAttribute("x2", c.b[0]); c.e.setAttribute("y2", c.b[1]);
        c.e.style.stroke = color; c.e.setAttribute("stroke-dasharray", c.err ? "5 4" : "");
        c.e.style.opacity = on ? String(alpha) : "0";
        const m = [lerp(c.a[0], c.b[0], 0.3), lerp(c.a[1], c.b[1], 0.3) + 4];
        c.lab.setAttribute("x", m[0]); c.lab.setAttribute("y", m[1]); c.lab.textContent = on ? mode : ""; c.lab.style.fill = color; c.lab.style.opacity = String(alpha);
      }
    }
    function table(S, fillUpTo = 99) {
      // 몇 행? · 새 컬럼 칸은 어디까지 찼나?
      rowG.forEach((gg, k) => (gg.style.opacity = k < S.rows ? "1" : "0"));
      OLD.cells.forEach((c, k) => (c.style.opacity = k < S.rows ? "1" : "0"));
      NEU.cells.forEach((c, k) => (c.style.opacity = k < S.rows && (S.fill === "all" ? k < fillUpTo : (S.fill || []).includes(k)) ? "1" : "0"));
      // 이름 바꾸기 단계: 옛 컬럼 자리가 '새 이름'으로 · 두 번째 칸은 없음
      OLD.head.textContent = S.rename ? "새 이름" : "파일 경로"; OLD.head.style.fill = S.rename ? C.c : C.a;
      OLD.bg.style.fill = S.rename ? C.cSoft : C.aSoft; OLD.cells.forEach((c) => (c.style.fill = S.rename ? C.c : C.a));
      show(NEU.gg, !!S.neu && !S.rename, 0);
      OLD.strike.style.opacity = "0"; show(goneT, false, 0); OLD.gg.style.opacity = "1";
      show(copyG, !!S.copy, 0);
    }
    function phase(S) {
      pills.forEach((P, k) => { const on = k === S.ph; P.r.style.fill = on ? C.ink : C.bg; P.r.style.stroke = on ? C.ink : C.line; P.t.style.fill = on ? C.bg : k < S.ph ? C.ink : C.sub; });
      pills.forEach((P) => { P.r.parentNode.style.opacity = S.ph < 0 ? "0" : "1"; });
      show(once, S.ph < 0, 0);
    }
    function readoutFor(S, done = true) {
      const row = (a, slot) => {
        if (!a) return "";
        const ok = a.err ? `<b style="color:var(--fg-no)">✕ 오류</b>` : `<b style="color:var(--fg-ok)">✓</b>`;
        const cls = (c) => (c === "old" ? "a" : "c");
        const what = S.rename ? (slot === "L" ? `‘<span class="a">파일 경로</span>’를 찾음 (이미 없음)` : `‘<span class="c">새 이름</span>’을 읽고 씀`) : `읽기 <span class="${cls(a.r)}">${name(a.r)}</span> · 쓰기 ${a.w.map((c) => `<span class="${cls(c)}">${name(c)}</span>`).join(" + ")}`;
        return `${slot === "L" ? "옛 앱" : "새 앱"} ${a.v}: ${what} ${ok}`;
      };
      const apps = [row(S.L, "L"), row(S.R, "R")].filter(Boolean).join(" &nbsp;·&nbsp; ");
      const tail = S.rename ? `배포 중 몇 분 동안 <b>오류</b> — 그래서 나눠서 해요`
        : S.copy ? (done ? `예전 행 ${S.rows}개 복사 끝 → 두 컬럼 값이 같아요 · 서비스는 계속 돌아요` : `예전 행을 복사하는 중…`)
        : S.drop ? (done ? `옛 컬럼 ‘파일 경로’를 지웠어요 · 이름 바꾸기 끝 · 멈춘 시간 없음` : `아무도 ‘파일 경로’를 안 쓰는지 확인 중…`)
        : S.rows > 4 && S.R?.v === "v2" ? `5행은 v1 이 써서 옛 컬럼에만, 6행은 v2 가 써서 두 컬럼에 다 있어요 → 그래서 다음에 복사해요`
        : `같이 도는 버전이 모두 ✓ → 멈추는 시간 없이 다음 걸음으로`;
      ro.set(`${apps ? `<div>${apps}</div>` : ""}<div>${tail}</div>`);
    }

    let gen = 0;
    const later = (my, ms) => new Promise((ok) => setTimeout(() => ok(my === gen), reduced() ? 0 : ms));
    async function render(i, animate) {
      const S = SP[i], my = ++gen;
      phase(S);
      A.R.gg.removeAttribute("transform");
      if (!animate) { // 끝 모습
        table(S); setApp("L", S.L, { rename: S.rename }); setApp("R", S.R, { rename: S.rename }); setCons(S);
        if (S.drop) { OLD.gg.style.opacity = "0.25"; OLD.strike.style.opacity = "1"; show(goneT, true, 0); }
        readoutFor(S); return;
      }
      if (S.rename) { // 한 번에 이름 바꾸기 → 옛 앱이 터져요
        const pre = { ...S, L: { ...V1 }, R: null, rename: 0, neu: 0 };
        table(pre); setApp("L", V1); setApp("R", null); setCons(pre); readoutFor(pre);
        if (!(await later(my, 700))) return;
        table(S); setApp("R", S.R, { rename: 1, ms: 300 }); setApp("L", { ...V1 }, { rename: 1 }); setCons({ ...S, L: { ...V1, err: 0 } });
        if (!(await later(my, 900))) return;
        setApp("L", S.L, { rename: 1 }); setCons(S); readoutFor(S); return;
      }
      if (S.slide) { // v2 가 '옛 앱' 자리로 옮겨 가고, 새 앱 v3 가 들어와요
        table(S); setApp("L", null); setApp("R", V2); setCons({ ...S, L: null, R: V2 });
        const dx = A.L.x - A.R.x;
        await anim(650, (t) => { if (my === gen) A.R.gg.setAttribute("transform", `translate(${dx * t},0)`); });
        if (my !== gen) return;
        A.R.gg.removeAttribute("transform"); setApp("L", V2); setApp("R", V3, { ms: 350 }); setCons(S); readoutFor(S); return;
      }
      if (S.copy) { // v1 이 사라지고 → 예전 행을 한 칸씩 복사
        table({ ...S, fill: [5], copy: 0 }); setApp("L", null, { ms: 300 }); setApp("R", S.R); setCons(S); readoutFor(S, false);
        show(copyG, true, 300);
        for (let k = 0; k <= S.rows; k++) {
          NEU.cells.forEach((c, r) => (c.style.opacity = r < S.rows && (r < k || r === 5) ? "1" : "0"));
          if (!(await later(my, 260))) return;
        }
        readoutFor(S); return;
      }
      if (S.drop) { // v4 가 들어오고 → v3 가 빠지고 → 아무도 안 쓰는 옛 컬럼을 지워요
        table(S); setApp("L", S.prevL); setApp("R", S.R, { ms: 300 }); setCons({ ...S, L: S.prevL }); readoutFor(S, false);
        if (!(await later(my, 900))) return;
        setApp("L", null, { ms: 300 }); setCons(S);
        if (!(await later(my, 500))) return;
        OLD.strike.style.opacity = "1";
        await anim(500, (t) => { if (my === gen) OLD.gg.style.opacity = String(1 - 0.75 * t); });
        if (my !== gen) return;
        show(goneT, true, 250); readoutFor(S); return;
      }
      // 확장 · 양쪽 쓰기: 새 것이 나타나요
      const prevRows = S.rows > 4 ? 4 : S.rows;
      table({ ...S, rows: prevRows, fill: [] });
      if (S.neu && i === 1) { NEU.gg.style.opacity = "0"; show(NEU.gg, true, 450); }
      setApp("L", S.L); setApp("R", S.R, { ms: 350 }); setCons(S); readoutFor(S);
      if (S.rows > prevRows) { // v1 이 쓴 행(옛 컬럼만) → v2 가 쓴 행(두 컬럼 다)
        if (!(await later(my, 700))) return;
        rowG[4].style.opacity = "1"; OLD.cells[4].style.opacity = "1";
        if (!(await later(my, 600))) return;
        rowG[5].style.opacity = "1"; OLD.cells[5].style.opacity = "1"; NEU.cells[5].style.opacity = "1";
      }
    }
    render(0, false);
    return { go: (i, animate) => render(i, animate) };
  },
};

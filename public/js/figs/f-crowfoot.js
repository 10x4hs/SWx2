// 그림: 까마귀 발 표기 — 선 끝 모양이 "몇 개"를 말해요 (Dev Flow 06 데이터 — 카드 2)
//   상자 둘(개체)을 잇는 선. 끝마다 바깥 기호 = 최대(| 하나 · 갈래 여러 개), 안쪽 기호 = 최소(○ 0개도 돼요 · | 꼭 하나 이상).
//   읽을 때는 맞은편 끝을 봐요: "한 팀은 회의가 0개 이상" = 회의 쪽 끝. 예시 행(아래 표)이 그 규칙을 그대로 보여 줘요.
//   카드의 예: 팀 하나 — 회의 여러 개, 회의 — 녹음(하나? 여러 개?), N:N 이면 중간 테이블. 아래 단추로 1:1 · 1:N · N:N 과 '0개도 되나'를 골라요.
import { svg, g, text, line, circle, rect, choice, readout, anim, set, C } from "./kit.js";

// 예시 데이터 (그림용 행)
const EX = {
  team: { L: "팀", R: "회의", lCols: ["id", "이름"], rCols: ["id", "제목", "팀_id"], lRows: [[1, "영업"], [2, "개발"], [3, "디자인"]], rRows: [[11, "주간 회의", 1], [12, "고객 미팅", 1], [13, "회고", 2]], max: "n" },
  rec1: { L: "회의", R: "녹음", lCols: ["id", "제목"], rCols: ["id", "회의_id"], lRows: [[11, "주간 회의"], [12, "고객 미팅"], [13, "회고"]], rRows: [[101, 11], [102, 13]], max: "1" },
  recN: { L: "회의", R: "녹음", lCols: ["id", "제목"], rCols: ["id", "회의_id"], lRows: [[11, "주간 회의"], [12, "고객 미팅"], [13, "회고"]], rRows: [[101, 11], [102, 11], [103, 13]], max: "n" },
  nn: { L: "회의", R: "사람", M: "참석", lCols: ["id", "제목"], rCols: ["이름"], mCols: ["회의_id", "사람"], lRows: [[11, "주간 회의"], [12, "고객 미팅"]], rRows: [["서연"], ["도윤"], ["지훈"]], mRows: [[11, "서연"], [11, "도윤"], [12, "도윤"]], max: "n" },
};
// 단계: ex = 예시, mins = 안쪽 기호를 그릴까, min = 많은 쪽의 최소 ("0" | "1")
const STEPS = [
  { cap: "선 끝 모양을 읽어요. 한 줄(|)은 '하나', 갈래(까마귀 발)는 '여러 개'예요. 팀 하나 — 회의 여러 개: 갈래는 '여러 개'인 회의 쪽에 붙어요.", ex: "team", mins: 0, min: "0" },
  { cap: "안쪽 기호는 '최소'예요. ○ 는 0개도 돼요, | 는 꼭 하나 이상. 맞은편 끝을 읽어요: 한 팀은 회의가 0개 이상(파랑), 한 회의는 팀이 꼭 하나(주황).", ex: "team", mins: 1, min: "0" },
  { cap: "회의 — 녹음: 회의마다 녹음이 하나뿐이면 녹음 쪽 끝도 한 줄이에요(1:1). 한 회의는 녹음이 0개 또는 1개.", ex: "rec1", mins: 1, min: "0" },
  { cap: "녹음을 여러 개 허용하면 녹음 쪽 끝이 갈래로 바뀌어요(1:N). 선 하나가 화면과 요금을 바꾸는 제품 결정이에요.", ex: "recN", mins: 1, min: "0" },
  { cap: "N:N — 사람 한 명이 여러 회의에, 회의 하나에 여러 사람이 와요. 이럴 땐 중간 테이블(참석)을 두고 1:N 두 개로 풀어요.", ex: "nn", mins: 1, min: "0" },
  { cap: "이제 직접 골라 보세요. 관계(1:1 · 1:N · N:N)와 '0개도 되나'를 바꾸면 선 끝 기호와 예시 행이 같이 바뀌어요.", ex: null, mins: 1, free: 1 },
];
const REL_KEYS = [["1", "1:1"], ["n", "1:N"], ["nn", "N:N"]];
const relOf = (ex) => (ex === "rec1" ? "1" : ex === "nn" ? "nn" : "n");
// 고른 관계 → 예시: 1:1 은 회의 — 녹음, 1:N 은 (녹음을 보던 중이면) 회의 — 녹음 여러 개, 아니면 팀 — 회의
const exOf = (rel, curEx) => (rel === "1" ? "rec1" : rel === "nn" ? "nn" : curEx === "rec1" || curEx === "recN" ? "recN" : "team");

export default {
  aspect: 360 / 600,
  aspectNarrow: 330 / 380,
  steps: STEPS.map((s) => s.cap),
  hint: "아래 단추로 관계를 바꿔 보세요",
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 600, H = nar ? 330 : 360;
    const s = svg(stage, W, H, "두 개체 상자를 잇는 선 끝의 까마귀 발 기호와 예시 행");
    // 배치
    // 표: x · 칸 너비들 (넓은 판 / 좁은 판)
    const Lw = nar
      ? { box: { L: [16, 22, 116, 46], R: [248, 22, 116, 46], M: [132, 98, 116, 40], L3: [16, 22, 104, 46], R3: [260, 22, 104, 46] }, ry: 216, rh: 26, fs: 14, read: [16, 104, 132],
          tl: { x: 16, w: [28, 66] }, note: 114, link: [176, 206], tr: { x: 210, wTeam: [34, 80, 40], wRec: [44, 70] },
          nnY: 236, nnLab: [190, 166], nn: { l: { x: 16, w: [28, 78] }, m: { x: 150, w: [52, 46] }, r: { x: 296, w: [44] }, l2m: [124, 146], m2r: [250, 292], note: 344 } }
      : { box: { L: [40, 30, 150, 50], R: [410, 30, 150, 50], M: [225, 118, 150, 44], L3: [20, 30, 130, 50], R3: [450, 30, 130, 50] }, ry: 226, rh: 28, fs: 15, read: [300, 120, 150],
          tl: { x: 40, w: [44, 110] }, note: 200, link: [270, 376], tr: { x: 380, wTeam: [48, 92, 44], wRec: [56, 80] },
          nnY: 226, nnLab: [300, 20], nn: { l: { x: 20, w: [40, 92] }, m: { x: 225, w: [70, 70] }, r: { x: 470, w: [60] }, l2m: [156, 221], m2r: [369, 466], note: 536 } };
    const lineG = g(s), symG = g(s), boxG = g(s), lblG = g(s), tblG = g(s), linkG = g(s);
    const ro = readout(f.controls());
    let cur = { ex: "team", mins: 0, min: "0" }, stepNow = 0, userRel = null, userMin = null;
    const relPick = choice(f.controls(), REL_KEYS, "n", (k) => { userRel = k; if (stepNow !== STEPS.length - 1) f.goto(STEPS.length - 1); else draw(freeState()); }, "관계 고르기");
    const minPick = choice(f.controls(), [["0", "0개도 돼요 (○)"], ["1", "꼭 1개 이상 (|)"]], "0", (k) => { userMin = k; if (stepNow !== STEPS.length - 1) f.goto(STEPS.length - 1); else draw(freeState()); }, "많은 쪽의 최소");
    const freeState = () => ({ ex: userRel ? exOf(userRel, cur.ex) : cur.ex, mins: 1, min: userMin ?? cur.min });

    // 상자 하나 (개체)
    function box(x, y, w, h, label, o = {}) {
      const gg = g(boxG);
      rect(gg, x, y, w, h, { r: 8, fill: o.fill || C.bg, stroke: o.stroke || C.ink, sw: 2 });
      text(gg, x + w / 2, y + h / 2 + (o.sub ? -8 : 0), label, { size: 17, weight: 700, anchor: "middle" });
      if (o.sub) text(gg, x + w / 2, y + h / 2 + 12, o.sub, { size: 14, weight: 600, anchor: "middle", fill: C.sub });
      return gg;
    }
    // 선 끝 기호: E = 상자에 닿는 점, u = 상자에서 선 쪽으로 향하는 단위 벡터. max: "1" | "n", min: "0" | "1" | null
    function ends(E, u, max, min, color) {
      const n = [-u[1], u[0]], P = (d, k = 0) => [E[0] + u[0] * d + n[0] * k, E[1] + u[1] * d + n[1] * k];
      const bar = (d) => line(symG, ...P(d, -11), ...P(d, 11), { color, width: 2.6 });
      if (max === "n") { const tip = P(20); [-12, 0, 12].forEach((k) => line(symG, ...tip, ...P(0, k), { color, width: 2.6 })); }
      else bar(10);
      if (min === "1") bar(max === "n" ? 28 : 20);
      else if (min === "0") { const c = circle(symG, ...P(max === "n" ? 32 : 26), 7, { fill: C.bg, stroke: color, sw: 2.6 }); }
    }
    // 작은 표 (예시 행) → 행 y 위치들. ws = 칸 너비들, note = 행 끝에 붙는 말 (x 자리)
    function table(x, y, cols, rows, ws, o = {}) {
      const gg = g(tblG), rh = Lw.rh, w = ws.reduce((a, b) => a + b, 0), xs = ws.map((_, j) => x + ws.slice(0, j).reduce((a, b) => a + b, 0));
      text(gg, x, y - 22, o.title || "", { size: 14, weight: 700, fill: C.sub });
      cols.forEach((c, j) => text(gg, xs[j] + 4, y - 2, c, { size: 14, weight: 600, fill: C.mute }));
      line(gg, x, y + 6, x + w, y + 6, { color: C.line });
      const ys = rows.map((r, i) => {
        const yy = y + 6 + rh / 2 + i * rh + 2;
        const bad = o.bad?.(r);
        if (bad) rect(gg, x - 2, yy - rh / 2 + 1, w + 4, rh - 2, { r: 4, fill: C.bSoft });
        r.forEach((v, j) => text(gg, xs[j] + 4, yy, String(v), { size: Lw.fs, weight: j === 0 ? 700 : 500, fill: bad ? C.no : C.ink }));
        if (o.note?.(r)) text(gg, o.noteX, yy, o.note(r), { size: 14, weight: 700, fill: bad ? C.no : C.c, cls: "fg-t halo" });
        return yy;
      });
      return ys;
    }
    const clear = () => [lineG, symG, boxG, lblG, tblG, linkG].forEach((x) => x.replaceChildren());

    function draw(st) {
      cur = { ...st };
      clear();
      const ex = EX[st.ex], A = C.a, B = C.b;
      relPick.set(relOf(st.ex)); minPick.set(st.min);
      if (st.ex !== "nn") {
        const [lx, ly, lw, lh] = Lw.box.L, [rx, ry2, rw, rh] = Lw.box.R, y = ly + lh / 2;
        box(lx, ly, lw, lh, ex.L); box(rx, ry2, rw, rh, ex.R);
        line(lineG, lx + lw, y, rx, y, { color: C.ink, width: 2.2 });
        // 왼쪽 끝(부모 쪽): 꼭 하나 · 오른쪽 끝(많은 쪽): ex.max + 최소
        ends([lx + lw, y], [1, 0], "1", st.mins ? "1" : null, B);
        ends([rx, y], [-1, 0], ex.max, st.mins ? st.min : null, A);
        // 읽는 말 (맞은편 끝을 읽어요)
        const many = ex.max === "n", rWord = `${st.min === "1" ? "1개 이상" : "0개 이상"}`.replace("0개 이상", many ? "0개 이상" : "0개 또는 1개").replace("1개 이상", many ? "1개 이상" : "꼭 1개");
        const rRead = st.mins ? `한 ${ex.L}${josa(ex.L, "은는")} ${ex.R}${josa(ex.R, "이가")} ${rWord}` : `한 ${ex.L} — ${ex.R} ${many ? "여러 개" : "하나"}`;
        const lRead = st.mins ? `한 ${ex.R}${josa(ex.R, "은는")} ${ex.L}${josa(ex.L, "이가")} 꼭 하나` : `한 ${ex.R} — ${ex.L} 하나`;
        const [tx, ty1, ty2] = Lw.read;
        text(lblG, nar ? tx : tx, ty1, `→ ${rRead}`, { size: 15, weight: 700, fill: A, anchor: nar ? "start" : "middle", cls: "fg-t halo" });
        text(lblG, nar ? tx : tx, ty2, `← ${lRead}`, { size: 15, weight: 700, fill: B, anchor: nar ? "start" : "middle", cls: "fg-t halo" });
        // 예시 행 + 연결선 (외래 키)
        const lCount = (id) => ex.rRows.filter((r) => r[r.length - 1] === id).length;
        const badL = (r) => st.mins && (st.min === "1" ? lCount(r[0]) === 0 : false) || (!many && lCount(r[0]) > 1);
        const lys = table(Lw.tl.x, Lw.ry, ex.lCols, ex.lRows, Lw.tl.w, { title: `${ex.L} 표`, bad: badL, note: (r) => (st.mins ? `${ex.R} ${lCount(r[0])}개` : ""), noteX: Lw.note });
        const rys = table(Lw.tr.x, Lw.ry, ex.rCols, ex.rRows, ex.rCols.length === 3 ? Lw.tr.wTeam : Lw.tr.wRec, { title: `${ex.R} 표` });
        // 외래 키 연결선: 많은 쪽 행 → 그 행이 가리키는 부모 행
        ex.rRows.forEach((r, i) => { const li = ex.lRows.findIndex((q) => q[0] === r[r.length - 1]); if (li < 0) return; const [x1, x2] = st.mins ? Lw.link : [Lw.note - 6, Lw.link[1]]; line(linkG, x1, lys[li], x2, rys[i], { color: A, width: 1.4 }); circle(linkG, x2, rys[i], 3, { fill: A }); });
      } else {
        // N:N — 중간 테이블로 1:N 두 개
        const [lx, ly, lw, lh] = Lw.box.L3, [rx, ry2, rw, rh] = Lw.box.R3, [mx, my, mw, mh] = Lw.box.M;
        box(lx, ly, lw, lh, ex.L); box(rx, ry2, rw, rh, ex.R); box(mx, my, mw, mh, ex.M, { sub: nar ? null : "중간 테이블", fill: C.soft });
        const ml = [mx, my + mh / 2], mr = [mx + mw, my + mh / 2], lb = [lx + lw / 2, ly + lh], rb = [rx + rw / 2, ry2 + rh];
        // 왼쪽 상자 아래 → 중간 왼쪽, 오른쪽 상자 아래 → 중간 오른쪽 (꺾인 선)
        const elbow = (a, b) => { line(lineG, a[0], a[1], a[0], b[1], { color: C.ink, width: 2.2 }); line(lineG, a[0], b[1], b[0], b[1], { color: C.ink, width: 2.2 }); };
        elbow(lb, ml); elbow(rb, mr);
        ends(lb, [0, 1], "1", "1", B); ends(rb, [0, 1], "1", "1", B);
        ends(ml, [-1, 0], "n", st.min, A); ends(mr, [1, 0], "n", st.min, A);
        const mc = (k, v) => ex.mRows.filter((r) => r[k] === v).length;
        text(lblG, ...Lw.nnLab, nar ? "한 회의 ↔ 사람 여러 명" : "→ 한 회의에 사람 여러 명 · 한 사람이 회의 여러 개", { size: 15, weight: 700, fill: A, anchor: "middle", cls: "fg-t halo" });
        const ty = Lw.nnY, T = Lw.nn;
        const lys = table(T.l.x, ty, ex.lCols, ex.lRows, T.l.w, { title: "회의 표", bad: (r) => st.min === "1" && mc(0, r[0]) === 0 });
        const mys = table(T.m.x, ty, ex.mCols, ex.mRows, T.m.w, { title: nar ? "참석 표" : "참석 표 (중간)" });
        const rys = table(T.r.x, ty, ex.rCols, ex.rRows, T.r.w, { title: "사람 표", bad: (r) => st.min === "1" && mc(1, r[0]) === 0, note: (r) => `${mc(1, r[0])}개`, noteX: T.note });
        ex.mRows.forEach((r, i) => {
          const li = ex.lRows.findIndex((q) => q[0] === r[0]), ri = ex.rRows.findIndex((q) => q[0] === r[1]);
          line(linkG, T.l2m[0], lys[li], T.l2m[1], mys[i], { color: A, width: 1.3 });
          line(linkG, T.m2r[0], mys[i], T.m2r[1], rys[ri], { color: A, width: 1.3 });
        });
      }
      ro.set(readHtml(st));
    }
    function josa(w, pair) { const c = w.charCodeAt(w.length - 1) - 0xac00; const has = c >= 0 && c % 28 !== 0; return pair === "은는" ? (has ? "은" : "는") : (has ? "이" : "가"); }
    function readHtml(st) {
      const ex = EX[st.ex];
      if (st.ex === "nn") {
        const zero = ex.rRows.filter((r) => !ex.mRows.some((m) => m[1] === r[0])).map((r) => r[0]);
        return `<div><span class="a">회의 ─< 참석 >─ 사람</span> — 갈래가 둘 다 중간 테이블(참석) 쪽에 붙어요</div><div>참석(회의_id, 사람) 한 행 = "이 사람이 이 회의에 왔다" · 회의 11 은 ${ex.mRows.filter((m) => m[0] === 11).length}명, 도윤은 회의 ${ex.mRows.filter((m) => m[1] === "도윤").length}개</div>` +
          (st.min === "1" ? `<div><span class="b">꼭 1개 이상</span>으로 고르면 참석이 없는 ${zero.join(" · ")}${josa(zero[0] || "가", "은는")} 규칙 위반이에요(빨간 행).</div>` : `<div class="dim">○ = 0개도 돼요 — 참석이 없는 ${zero.join(" · ")}도 괜찮아요.</div>`);
      }
      const many = ex.max === "n";
      const lc = (id) => ex.rRows.filter((r) => r[r.length - 1] === id).length;
      const zeros = ex.lRows.filter((r) => lc(r[0]) === 0).map((r) => r[0]);
      const rows = [];
      if (!st.mins) rows.push(`<div>${ex.L} 쪽 끝 = <span class="b">한 줄(하나)</span> · ${ex.R} 쪽 끝 = <span class="a">${many ? "갈래(여러 개)" : "한 줄(하나)"}</span></div><div class="dim">예: ${ex.L} ${ex.lRows[0][0]} 에는 ${ex.R}${josa(ex.R, "이가")} ${lc(ex.lRows[0][0])}개 있어요.</div>`);
      else {
        rows.push(`<div><span class="a">${ex.R} 쪽 끝 ${st.min === "1" ? "|" : "○"}${many ? "<" : "|"}</span> → 한 ${ex.L}${josa(ex.L, "은는")} ${ex.R}${josa(ex.R, "이가")} <b>${many ? (st.min === "1" ? "1개 이상" : "0개 이상") : st.min === "1" ? "꼭 1개" : "0개 또는 1개"}</b></div>`);
        rows.push(`<div><span class="b">${ex.L} 쪽 끝 ||</span> → 한 ${ex.R}${josa(ex.R, "은는")} ${ex.L}${josa(ex.L, "이가")} <b>꼭 하나</b> <span class="dim">(${ex.R} 표의 ${ex.rCols[ex.rCols.length - 1]} 가 비면 안 돼요)</span></div>`);
        if (st.min === "1" && zeros.length) rows.push(`<div><span class="b">꼭 1개 이상</span>이면 ${ex.R}${josa(ex.R, "이가")} 없는 ${ex.L} ${zeros.join(" · ")}${josa(String(zeros[0]), "은는")} 규칙 위반이에요(빨간 행).</div>`);
        else if (zeros.length) rows.push(`<div class="dim">○ = 0개도 돼요 — ${ex.L} ${zeros.join(" · ")} 처럼 ${ex.R}${josa(ex.R, "이가")} 없어도 괜찮아요.</div>`);
        if (st.ex === "rec1" || st.ex === "recN") rows.push(`<div class="dim">회의에 녹음이 하나뿐인지, 여러 개도 되는지 — 이 선 하나로 화면과 요금이 달라져요.</div>`);
      }
      return rows.join("");
    }
    return {
      async go(i, animate) {
        stepNow = i;
        const st = STEPS[i];
        if (st.free) { draw(freeState()); return; }
        userRel = null; userMin = null;
        if (animate) { symG.style.opacity = "0"; draw({ ex: st.ex, mins: st.mins, min: st.min }); await anim(350, (t) => (symG.style.opacity = String(t))); symG.style.opacity = ""; return; }
        draw({ ex: st.ex, mins: st.mins, min: st.min });
      },
    };
  },
};

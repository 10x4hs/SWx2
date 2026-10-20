// 그림: 관계형 JOIN vs 그래프 따라가기 (Vector & Graph 06 — 카드 2 · 8)
//   같은 회의 기록(attend 14행)을 왼쪽은 표, 오른쪽은 그래프로 담고 '민재 → 참석한 회의 → 같이 참석한 사람 → 그 사람들의 회의'를 한 홉씩 따라가요.
//   표: 홉마다 attend 를 또 JOIN 하고, 찾을 값마다 인덱스를 다시 타요 (보라 눈금 = 인덱스에서 비교한 횟수 ≈ log₂N).
//   그래프: 시작점(민재)만 인덱스로 찾고, 그다음은 노드가 가진 선(포인터)을 그대로 따라가요 — 만난 선 수만큼만 일해요.
//   opts.mode = "join"(카드 2, 기본 — 끝에 WITH RECURSIVE) | "adj"(카드 8 — 끝에 표 크기 N 다이얼). 수는 모두 아래 데이터에서 계산해요.
import { svg, g, text, line, circle, rect, readout, slider, anim, set, C } from "./kit.js";

// 판 배치 — 넓으면 왼쪽 표 · 오른쪽 그래프, 좁으면(폰) 위 표 · 아래 그래프 (글자가 작아지지 않게)
const WIDE = {
  W: 600, H: 400, sep: [272, 12, 272, 390], tL: [20, 22], tR: [290, 22], barL: [20, 48, 254], barR: [290, 48, 524],
  row: (i) => ({ x0: 20, y: 114 + i * 19.5, w: 200, p: 50, m: 148, d: 214 }), heads: 1,
  POS: { 민재: [318, 196], A: [398, 118], B: [398, 196], C: [398, 274], 지호: [478, 104], 서윤: [478, 164], 하린: [478, 224], 도윤: [478, 284], E: [558, 104], D: [558, 194], 수아: [376, 364], F: [438, 364], 준우: [500, 364], G: [562, 364] },
  hop: [398, 478, 558, 316], start: [318, 228], rest: [290, 338, "닿지 않은 기록 — 따라가지 않아요"],
};
const NARROW = {
  W: 380, H: 626, sep: [16, 258, 364, 258], tL: [16, 20], tR: [16, 282], barL: [16, 46, 364], barR: [16, 308, 364],
  row: (i) => ({ x0: 16 + Math.floor(i / 7) * 186, y: 112 + (i % 7) * 21, w: 118, p: 30, m: 86, d: 132 }), heads: 0,
  POS: { 민재: [46, 450], A: [130, 380], B: [130, 450], C: [130, 520], 지호: [228, 364], 서윤: [228, 420], 하린: [228, 476], 도윤: [228, 532], E: [332, 364], D: [332, 448], 수아: [200, 604], F: [254, 604], 준우: [308, 604], G: [360, 604] },
  hop: [130, 228, 332, 568], start: [46, 482], rest: [16, 604, "닿지 않은 기록"],
};
// attend(person_id, meeting_id) — 한 행 = 그래프의 선 하나
const ROWS = [["민재", "A"], ["민재", "B"], ["민재", "C"], ["서윤", "A"], ["서윤", "B"], ["서윤", "D"], ["지호", "A"], ["지호", "E"], ["하린", "B"], ["하린", "D"], ["도윤", "C"], ["수아", "F"], ["준우", "F"], ["준우", "G"]];
const isMeet = (k) => k.length === 1;
const HOP = [C.ink, C.a, C.b, C.c], HOP_SOFT = [C.soft, C.aSoft, C.bSoft, C.cSoft], CLS = ["", "a", "b", "c"];
const NS = [[14, "14행 (그림)"], [100, "100행"], [1e3, "1천 행"], [1e4, "1만 행"], [1e5, "10만 행"], [1e6, "100만 행"], [1e7, "1천만 행"], [1e8, "1억 행"], [1e9, "10억 행"]];
const depthOf = (n) => Math.ceil(Math.log2(n)); // 인덱스 한 번 찾을 때 비교 횟수 (이진 탐색 모형)
const sleep = (ms) => anim(ms, () => {});
const NONE = "var(--fg-none, transparent)"; // 투명도 CSS 변수로 — kit.set 은 var() 색을 style 로 넣어서, 한 번 칠한 뒤엔 이것으로 지워야 해요

// 너비 우선으로 한 홉씩: 찾을 값(표는 값마다 인덱스 탐색 한 번) · 읽은 행(= 그래프에서 만난 선) · 새로 닿은 곳
function bfs(start, n) {
  const seen = new Set([start]), out = [];
  let front = [start];
  for (let h = 1; h <= n; h++) {
    const keys = front.slice(), reads = [], next = [];
    for (const k of keys) ROWS.forEach((r, i) => {
      if (r[0] !== k && r[1] !== k) return;
      reads.push([k, i]);
      const o = r[0] === k ? r[1] : r[0];
      if (!seen.has(o)) { seen.add(o); next.push(o); }
    });
    out.push({ keys, reads, next });
    front = next;
  }
  return out;
}

const STEPS = {
  join: [
    { cap: "같은 회의 기록을 두 가지로 담았어요. 왼쪽은 attend 표, 오른쪽은 사람(●)과 회의(■)를 이은 그래프예요. 노란 칠처럼 표의 한 행이 그래프의 선 하나예요.", h: 0 },
    { cap: "1홉 · 민재가 참석한 회의(파랑): 표는 attend 에서 민재 행을 인덱스로 찾아요. 그래프도 민재를 인덱스로 찾고, 선 3개를 따라가요.", h: 1 },
    { cap: "2홉 · 그 회의의 다른 참석자(주황): 표는 attend 를 한 번 더 JOIN 하고 회의마다 인덱스를 다시 찾아요. 그래프는 회의의 선을 따라갈 뿐이에요.", h: 2 },
    { cap: "3홉 · 그 사람들이 간 회의(초록): JOIN 이 또 붙어요. 찾을 값이 늘수록 표는 인덱스를 더 자주 타서 보라 눈금이 빨리 쌓여요.", h: 3 },
    { cap: "몇 단계인지 모르면(가변 길이) SQL 은 WITH RECURSIVE(재귀 CTE)가 필요해요. 그래프 질의는 '선 따라가기'를 한 줄로 써요.", h: 3, end: 1 },
  ],
  adj: [
    { cap: "시작점 찾기 = 인덱스, 따라가기 = 포인터예요. 인덱스 눈금 하나가 비교 한 번 — 행이 N개면 한 번 찾을 때 약 log₂N번 비교해요(14행 → 4번).", h: 0 },
    { cap: "1홉: 둘 다 '민재'를 인덱스로 한 번 찾아요. 그다음 그래프는 민재가 가진 포인터(파란 선)로 회의 3개에 바로 가요.", h: 1 },
    { cap: "2홉: 표는 회의 3개마다 인덱스를 또 찾아요. 그래프는 회의에서 나가는 선(주황)을 따라갈 뿐이에요.", h: 2 },
    { cap: "3홉까지 한 일이에요. 그래프는 만난 선 수만큼만 일하고, 표는 이웃을 찾을 때마다 인덱스 비용이 붙어요.", h: 3 },
    { cap: "이제 직접 표 크기 N 을 바꿔 보세요. 표의 인덱스 탐색은 데이터가 클수록 조금씩 길어지지만(로그 크기), 포인터 따라가기는 그대로예요.", h: 3, free: 1 },
  ],
};

export default {
  aspect: WIDE.H / WIDE.W,
  aspectNarrow: NARROW.H / NARROW.W,
  steps: (o) => (STEPS[o.mode] || STEPS.join).map((s) => s.cap),
  hint: "한 홉씩 넘겨 보세요",
  mount(stage, f) {
    const mode = STEPS[f.opts.mode] ? f.opts.mode : "join", steps = STEPS[mode];
    const HOPS = bfs("민재", 3), L = f.narrow ? NARROW : WIDE, POS = L.POS;
    const s = svg(stage, L.W, L.H, "attend 표와 같은 기록의 그래프를 나란히 놓고, 민재에서 한 홉씩 따라가는 그림");
    let nIdx = 0, stepNow = 0;
    const N = () => NS[nIdx][0];
    const mono = (e) => { e.style.fontFamily = "var(--pp-mono)"; return e; };

    // 두 칸 + 제목
    line(s, ...L.sep, { color: C.grid });
    const titleL = text(s, ...L.tL, "표 · attend 14행", { size: 16, weight: 700 });
    text(s, ...L.tR, "그래프 · 같은 기록", { size: 16, weight: 700 });

    // 인덱스 눈금 (보라) — 한 번 찾을 때 비교 횟수만큼 켜져요
    function idxBar([x0, y0, cx]) {
      const gg = g(s);
      text(gg, x0, y0, "인덱스", { size: 14, fill: C.sub, weight: 600 });
      const ticks = []; for (let i = 0; i < 30; i++) ticks.push(rect(gg, x0 + 52 + i * 6, y0 - 7, 4, 14, { r: 1, fill: C.grid }));
      const key = text(gg, x0, y0 + 24, "", { size: 14, weight: 700 });
      const cnt = text(gg, cx, y0 + 24, "", { size: 14, anchor: "end", weight: 700, fill: C.d, cls: "fg-t tab" });
      return { ticks, key, cnt, n: 0 };
    }
    const BL = idxBar(L.barL), BR = idxBar(L.barR);
    function ticksTo(bar, lit, depth) { bar.ticks.forEach((t, i) => { t.style.display = i < depth ? "" : "none"; set(t, { fill: i < lit ? C.d : C.grid }); }); }

    // 표 (attend)
    const T = g(s);
    let readLbl;
    if (L.heads) {
      mono(text(T, 70, 94, "person_id", { size: 14, anchor: "middle", fill: C.mute }));
      mono(text(T, 168, 94, "meeting_id", { size: 14, anchor: "middle", fill: C.mute }));
      line(T, 20, 104, 220, 104, { color: C.line });
      readLbl = text(T, 240, 94, "읽음", { size: 14, anchor: "middle", fill: C.mute });
    } else {
      mono(text(T, 16, 90, "(person_id, meeting_id)", { size: 14, fill: C.mute }));
      readLbl = text(T, 364, 90, "● = 읽음", { size: 14, anchor: "end", fill: C.mute });
    }
    const rowE = ROWS.map(([p, m], i) => {
      const q = L.row(i), y = q.y;
      const bg = rect(T, q.x0, y - 9.5, q.w, 19, { r: 3, fill: NONE });
      const tp = text(T, q.x0 + q.p, y, p, { size: 14, anchor: "middle" });
      const tm = text(T, q.x0 + q.m, y, m, { size: 15, anchor: "middle", weight: 700 });
      const dots = [0, 1].map((k) => circle(T, q.x0 + q.d + k * 11, y, 4, { fill: NONE }));
      return { bg, tp, tm, dots, y };
    });

    // 그래프
    const G = g(s);
    const hiE = line(G, ...POS["민재"], ...POS.A, { color: C.hi, width: 9 }); // 0단계 형광펜: 한 행 = 선 하나
    const edgeE = ROWS.map(([p, m]) => line(G, ...POS[p], ...POS[m], { color: C.line, width: 1.6 }));
    const nodeE = {};
    for (const [k, [x, y]] of Object.entries(POS)) {
      const gg = g(G);
      // 밑칠(불투명 바탕) 위에 색칠 — 밤 모드의 옅은 색은 반투명이라 선이 비치지 않게
      if (isMeet(k)) rect(gg, x - 15, y - 15, 30, 30, { r: 5, fill: C.bg }); else circle(gg, x, y, 17, { fill: C.bg });
      const shape = isMeet(k) ? rect(gg, x - 15, y - 15, 30, 30, { r: 5, fill: C.bg, stroke: C.line, sw: 1.6 }) : circle(gg, x, y, 17, { fill: C.bg, stroke: C.line, sw: 1.6 });
      const t = text(gg, x, y + 0.5, k, { size: isMeet(k) ? 15 : 14, anchor: "middle", weight: 700 });
      nodeE[k] = { shape, t };
    }
    const hopLbl = [1, 2, 3].map((h) => text(G, L.hop[h - 1], L.hop[3], `${h}홉`, { size: 14, anchor: "middle", weight: 700, fill: HOP[h] }));
    const startLbl = text(G, ...L.start, "시작", { size: 14, anchor: "middle", weight: 600, fill: C.sub });
    const restLbl = text(G, ...L.rest, { size: 14, fill: C.mute });
    const flyG = g(s);

    const ro = readout(f.controls());
    const dial = mode === "adj" ? slider(f.controls(), { label: "표 크기 N", min: 0, max: NS.length - 1, step: 1, value: 0, fmt: (v) => NS[v][1] }, (v) => { nIdx = v; if (stepNow !== steps.length - 1) f.goto(steps.length - 1); else paint(steps[stepNow]); }) : null;

    // 한 단계의 완성된 모습 (몇 홉까지 했나)
    function paint(st) {
      const h = st.h, depth = depthOf(N());
      flyG.replaceChildren();
      titleL.textContent = `표 · attend ${nIdx ? NS[nIdx][1] : "14행"}`;
      // 몇 번째 홉에서 처음 닿았나 / 처음 읽었나
      const nodeHop = { 민재: h >= 1 ? 0 : -1 }, edgeHop = new Array(ROWS.length).fill(-1), reads = ROWS.map(() => []);
      HOPS.slice(0, h).forEach((hp, k) => {
        hp.next.forEach((n) => (nodeHop[n] = k + 1));
        hp.reads.forEach(([, i]) => { if (edgeHop[i] < 0) edgeHop[i] = k + 1; reads[i].push(k + 1); });
      });
      edgeE.forEach((e, i) => set(e, { stroke: edgeHop[i] > 0 ? HOP[edgeHop[i]] : C.line, "stroke-width": edgeHop[i] > 0 ? 2.6 : 1.6 }));
      for (const [k, n] of Object.entries(nodeE)) {
        const hk = nodeHop[k] ?? -1;
        set(n.shape, { fill: hk > 0 ? HOP_SOFT[hk] : C.bg, stroke: hk > 0 ? HOP[hk] : hk === 0 ? C.ink : C.line, "stroke-width": hk >= 0 ? 2.4 : 1.6 });
        set(n.t, { fill: h === 3 && hk < 0 ? C.mute : C.ink });
      }
      rowE.forEach((r, i) => {
        const last = reads[i].length && reads[i][reads[i].length - 1] === h;
        set(r.bg, { fill: h === 0 && i === 0 && mode === "join" ? C.hi : last ? HOP_SOFT[h] : NONE });
        r.dots.forEach((d, j) => set(d, { fill: reads[i][j] ? HOP[reads[i][j]] : NONE }));
        set(r.tp, { fill: h === 3 && !reads[i].length ? C.mute : C.ink }); set(r.tm, { fill: h === 3 && !reads[i].length ? C.mute : C.ink });
      });
      hiE.style.display = h === 0 && mode === "join" ? "" : "none";
      readLbl.style.display = h ? "" : "none";
      hopLbl.forEach((t, k) => (t.style.display = k < h ? "" : "none"));
      startLbl.style.display = h ? "" : "none";
      restLbl.style.display = h === 3 ? "" : "none";
      // 인덱스 눈금 · 횟수
      const L = HOPS.slice(0, h).reduce((a, hp) => a + hp.keys.length, 0), R = HOPS.slice(0, h).reduce((a, hp) => a + hp.reads.length, 0);
      ticksTo(BL, L ? depth : 0, depth); ticksTo(BR, h ? depth : 0, depth);
      // 쉬는 동안: 한 번 찾을 때 드는 비교 횟수
      BL.key.textContent = `한 번에 비교 ${depth}번`; BR.key.textContent = h ? "시작점만 찾아요" : `한 번에 비교 ${depth}번`;
      set(BL.key, { fill: C.sub }); set(BR.key, { fill: C.sub });
      BL.cnt.textContent = L ? `탐색 ${L}번` : ""; BR.cnt.textContent = h ? "탐색 1번" : "";
      BL.n = L; BR.n = h ? 1 : 0;
      ro.set(readHtml(st, h, L, R, depth));
    }

    function readHtml(st, h, L, R, depth) {
      if (!h) return `<div>attend 한 행 = 그래프의 선 하나 · 행 ${ROWS.length}개 = 선 ${ROWS.length}개</div><div class="dim">질문: 민재와 같이 회의한 사람, 그리고 그 사람들이 간 회의는?</div>`;
      const rows = [];
      if (mode === "join") {
        if (st.end) {
          rows.push(`<div style="font:500 13px/1.6 var(--pp-mono);white-space:pre;overflow-x:auto;padding:8px 10px;background:var(--pp-code);border-radius:6px"><span class="dim">-- SQL: 몇 홉인지 모르면</span>\nWITH RECURSIVE … <span class="dim">-- 닿은 곳을 되풀이해 넓혀요</span>\n<span class="dim">-- 그래프(Cypher): 1~3홉을 한 줄로</span>\nMATCH (:Person {name:'민재'})\n      -[:ATTENDED*1..3]-(x)\nRETURN DISTINCT x</div>`);
        } else {
          const sel = ["", "a.meeting_id", "b.person_id", "c.meeting_id"][h];
          const lines = [[0, `SELECT DISTINCT ${sel}`], [1, "FROM attend a"]];
          if (h >= 2) lines.push([2, "JOIN attend b"], [2, "  ON a.meeting_id = b.meeting_id"]);
          if (h >= 3) lines.push([3, "JOIN attend c"], [3, "  ON b.person_id = c.person_id"]);
          lines.push([0, "WHERE a.person_id = '민재'"]);
          if (h >= 2) lines.push([0, "  AND b.person_id <> '민재'"]);
          const body = lines.map(([k, t], i) => `${k ? `<span class="${CLS[k]}">` : ""}${t.replace(/</g, "&lt;").replace(/>/g, "&gt;")}${i === lines.length - 1 ? ";" : ""}${k ? "</span>" : ""}`).join("\n");
          rows.push(`<div style="font:500 13px/1.6 var(--pp-mono);white-space:pre;overflow-x:auto;padding:8px 10px;background:var(--pp-code);border-radius:6px">${body}</div>`);
          if (h >= 2) rows.push(`<div class="dim">이름까지 보려고 people · meetings 표를 이으면(people–attend–meetings–attend–people) JOIN 이 더 붙어요.</div>`);
        }
      }
      rows.push(`<div><b>표</b> · attend 를 <b>${h}</b>번 씀 (JOIN <b>${h - 1}</b>개) · 인덱스 탐색 <span class="d">${L}번</span> · 읽은 행 <b>${R}</b></div>`);
      rows.push(`<div><b>그래프</b> · 인덱스 탐색 <span class="d">1번</span> (시작점 민재) · 따라간 선 <b>${R}</b>개</div>`);
      if (mode === "adj" && h >= 3) {
        const tw = L * depth + R, gw = depth + R;
        rows.push(`<div>한 일 ≈ 비교 + 읽기 · <b>표</b> ${L}×${depth} + ${R} = <b>${tw}</b> · <b>그래프</b> ${depth} + ${R} = <b>${gw}</b> <span class="dim">(N = ${NS[nIdx][1]}, 한 번 찾을 때 비교 ≈ log₂N = ${depth}번)</span></div>`);
        if (st.free) rows.push(`<div class="dim">실제 속도는 제품마다 저장 방식이 달라서 벤치마크로 확인해요.</div>`);
      }
      return rows.join("");
    }

    // 한 홉 움직이기: 왼쪽은 찾을 값마다 인덱스 → 행, 오른쪽은 노드마다 선을 따라 점이 흘러가요
    async function playHop(h) {
      const hp = HOPS[h - 1], depth = depthOf(N());
      const search = async (bar, key, color) => {
        bar.key.textContent = `찾는 값 ${key}`; set(bar.key, { fill: color });
        await anim(depth * 70, (t) => ticksTo(bar, Math.round(t * depth), depth), (t) => t);
        bar.n++; bar.cnt.textContent = `탐색 ${bar.n}번`;
      };
      const table = (async () => {
        for (const k of hp.keys) {
          await search(BL, k, HOP[h]);
          const mine = hp.reads.filter(([kk]) => kk === k).map(([, i]) => i);
          mine.forEach((i) => { const r = rowE[i]; set(r.bg, { fill: HOP_SOFT[h] }); const d = r.dots.find((x) => x.style.fill.includes("--fg-none")); if (d) set(d, { fill: HOP[h] }); });
          await sleep(220);
        }
        BL.key.textContent = "";
      })();
      const graph = (async () => {
        if (h === 1) { await search(BR, "민재", C.ink); set(nodeE["민재"].shape, { stroke: C.ink, "stroke-width": 2.4 }); startLbl.style.display = ""; }
        BR.key.textContent = "";
        for (const k of hp.keys) {
          const mine = hp.reads.filter(([kk]) => kk === k).map(([, i]) => i);
          const flies = mine.map((i) => { const o = ROWS[i][0] === k ? ROWS[i][1] : ROWS[i][0]; return { i, a: POS[k], b: POS[o], d: circle(flyG, ...POS[k], 4.5, { fill: HOP[h] }) }; });
          await anim(360, (t) => flies.forEach((x) => set(x.d, { cx: x.a[0] + (x.b[0] - x.a[0]) * t, cy: x.a[1] + (x.b[1] - x.a[1]) * t })));
          flies.forEach((x) => { x.d.remove(); if (edgeE[x.i].style.stroke === C.line) set(edgeE[x.i], { stroke: HOP[h], "stroke-width": 2.6 }); });
          hp.next.forEach((n) => { if (flies.some((x) => (ROWS[x.i][0] === n || ROWS[x.i][1] === n))) set(nodeE[n].shape, { fill: HOP_SOFT[h], stroke: HOP[h], "stroke-width": 2.4 }); });
          await sleep(90);
        }
      })();
      await Promise.all([table, graph]);
    }

    return {
      async go(i, animate) {
        stepNow = i;
        const st = steps[i], prev = steps[i - 1];
        // 앞 단계보다 한 홉 더 갈 때만 움직여요 (나머지는 바로 완성된 모습)
        if (animate && st.h > 0 && prev && prev.h === st.h - 1) {
          paint({ ...prev, end: 0, free: 0 });
          { const H_ = HOPS.slice(0, st.h); ro.set(readHtml(st, st.h, H_.reduce((a, hp) => a + hp.keys.length, 0), H_.reduce((a, hp) => a + hp.reads.length, 0), depthOf(N()))); } // 설명과 같은 단계의 SQL
          hopLbl[st.h - 1].style.display = "";
          await playHop(st.h);
        }
        paint(st);
      },
    };
  },
};

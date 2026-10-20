// 그림: 커밋 · 브랜치 · 병합, 그리고 브랜치 전략 셋 (Dev Flow 09 Repo와 코드 리뷰 — 카드 2 · 3)
//   opts.mode = "basics"(기본 · 카드 2): main 에 커밋 → feat/share-link 브랜치 → 커밋 → PR → 병합 커밋, 그리고 리베이스와 비교.
//   opts.mode = "flows"(카드 3): 같은 한 주(예시)를 GitHub flow · GitFlow · 트렁크 기반으로 그려 보고 '얼마나 자주 합치나'를 세어 봐요.
//   점 = 커밋(저장된 한 장면). 줄 = 브랜치. 합친 횟수는 그림의 점을 세어서 계산해요.
import { svg, el, set, g, text, line, circle, rect, path, ease, reduced, readout, C } from "./kit.js";

const WW = 560, NW = 420, H = 280; // 넓은 칸 · 좁은 칸(폰 · 튜터, f.narrow) 너비
const CLIP = () => "fgclip" + Math.random().toString(36).slice(2, 8);

// ---------- 기본: 커밋 · 브랜치 · 병합 ----------
const BASICS = [
  "커밋은 저장된 한 장면이에요. main 줄기(파랑)에 장면이 차례로 쌓여요.",
  "브랜치는 main 에서 갈라져 나온 평행한 작업 줄기(주황)예요. main 을 흐트러뜨리지 않고 일해요.",
  "브랜치에 ‘회의 요약 공유 링크’ 커밋(D)을 쌓아요. 그사이 main 에도 도윤의 수정(F)이 들어와요.",
  "브랜치를 올리고(push) GitHub 에서 PR, 즉 “합쳐 주세요” 제안을 열어요. 리뷰를 반영한 커밋(E)까지 쌓고 승인을 받아요.",
  "병합(merge)하면 두 줄기를 합친 새 장면, 병합 커밋(M)이 main 에 생겨요.",
  "리베이스는 커밋을 다시 놓아 이력을 한 줄로 만들어요. 깔끔하지만 이력을 고쳐 쓰니, 남들이 이미 가져간 커밋에는 하지 마세요.",
];
const BL = { main: 78, feat: 176 };
const BN = [
  { id: "A", lane: "main", x: 120, label: "로그인", step: 0 },
  { id: "B", lane: "main", x: 190, label: "녹음", step: 0 },
  { id: "C", lane: "main", x: 260, label: "요약", step: 0 },
  { id: "D", lane: "feat", x: 330, label: "공유 링크", step: 2 },
  { id: "F", lane: "main", x: 390, label: "도윤 수정", step: 2 },
  { id: "E", lane: "feat", x: 450, label: "리뷰 반영", step: 3 },
  { id: "M", lane: "main", x: 515, label: "병합 커밋", step: 4, merge: 1 },
];
const BE = [["A", "B"], ["B", "C"], ["C", "D"], ["C", "F"], ["D", "E"], ["F", "M"], ["E", "M"]];
// 리베이스(6단계): D · E 를 F 뒤에 다시 놓아요 (D′ · E′ 는 새 커밋)
const RN = [
  { id: "A", lane: "main", x: 120, label: "로그인" }, { id: "B", lane: "main", x: 190, label: "녹음" }, { id: "C", lane: "main", x: 260, label: "요약" },
  { id: "F", lane: "main", x: 390, label: "도윤 수정" },
  { id: "D2", lane: "main", x: 455, name: "D′", color: "b" }, { id: "E2", lane: "main", x: 520, name: "E′", color: "b" },
];
const RE = [["A", "B"], ["B", "C"], ["C", "F"], ["F", "D2"], ["D2", "E2"]];

// ---------- 전략 셋: 같은 한 주(예시) ----------
const FLOWS = [
  "GitHub flow: main 에서 짧은 브랜치를 따서 커밋 → PR → 리뷰 → 병합 → 브랜치 삭제. 가볍고 브랜치 기반인 흐름이에요.",
  "GitFlow: 오래가는 develop 과 release 브랜치를 둬요(급한 수정은 hotfix). 버전을 여러 개 지원하는 제품에는 여전히 맞을 수 있어요.",
  "트렁크 기반: 모두 하나의 줄기(trunk)에 최소 하루 한 번 합쳐요. 미완성 기능은 기능 플래그로 숨겨요.",
  "브랜치 전략은 ‘얼마나 자주 합치나’를 정해요. 웹 · SaaS 스타트업은 GitHub flow 나 트렁크 기반이 기본이에요.",
];
const DAYS = ["월", "화", "수", "목", "금"];
// 노드: [id, lane, day, frac, opts] · 줄: [from, to]
function githubFlow() {
  const lanes = { main: { y: 96, name: "main", color: "a" }, br: { y: 168, name: "기능 브랜치", color: "b" } };
  const n = [["m0", "main", 0, 0.06], ["s1", "br", 0, 0.4], ["s2", "br", 1, 0.15], ["mA", "main", 1, 0.55, { merge: 1, pr: 1 }],
    ["q1", "br", 2, 0.2], ["q2", "br", 2, 0.75], ["q3", "br", 3, 0.25], ["mB", "main", 3, 0.6, { merge: 1, pr: 1 }],
    ["f1", "br", 4, 0.2], ["mC", "main", 4, 0.55, { merge: 1, pr: 1 }]];
  const e = [["m0", "mA"], ["mA", "mB"], ["mB", "mC"], ["m0", "s1"], ["s1", "s2"], ["s2", "mA"], ["mA", "q1"], ["q1", "q2"], ["q2", "q3"], ["q3", "mB"], ["mB", "f1"], ["f1", "mC"]];
  const tags = [["s1", "share-link"], ["q1", "search"], ["f1", "fix"]];
  return { lanes, n, e, tags, trunk: "main", long: ["main"] };
}
function gitFlow() {
  const lanes = { main: { y: 62, name: "main", color: "a" }, hot: { y: 104, name: "hotfix", color: "no" }, rel: { y: 146, name: "release", color: "d" }, dev: { y: 188, name: "develop", color: "c" }, feat: { y: 230, name: "feature", color: "b" } };
  const n = [["M0", "main", 0, 0.04, { tag: "v1.0" }], ["D0", "dev", 0, 0.14], ["D1", "dev", 0, 0.55], ["F1", "feat", 0, 0.8],
    ["H1", "hot", 1, 0.25], ["MH", "main", 1, 0.55, { merge: 1, tag: "v1.0.1" }], ["DH", "dev", 1, 0.75, { merge: 1 }], ["F2", "feat", 1, 0.45],
    ["F3", "feat", 2, 0.15], ["DF", "dev", 2, 0.45, { merge: 1 }], ["R0", "rel", 2, 0.75], ["R1", "rel", 3, 0.5],
    ["MR", "main", 4, 0.55, { merge: 1, tag: "v1.1" }], ["DR", "dev", 4, 0.8, { merge: 1 }]];
  const e = [["M0", "MH"], ["MH", "MR"], ["M0", "D0"], ["D0", "D1"], ["D1", "DH"], ["DH", "DF"], ["DF", "DR"], ["M0", "H1"], ["H1", "MH"], ["H1", "DH"],
    ["D1", "F1"], ["F1", "F2"], ["F2", "F3"], ["F3", "DF"], ["DF", "R0"], ["R0", "R1"], ["R1", "MR"], ["R1", "DR"]];
  return { lanes, n, e, tags: [], trunk: "main", long: ["main", "develop"] };
}
function trunkBased() {
  const lanes = { main: { y: 110, name: "trunk", color: "a" }, br: { y: 162, name: "짧은 브랜치", color: "b" } };
  const n = [["t0", "main", 0, 0.04]], e = [];
  let prev = "t0";
  for (let d = 0; d < 5; d++) for (let k = 0; k < 2; k++) {
    const b = `b${d}${k}`, m = `t${d}${k}`, f0 = 0.14 + k * 0.44;
    n.push([b, "br", d, f0 + 0.08], [m, "main", d, f0 + 0.26, { merge: 1, flag: d === 2 && k === 1 }]);
    e.push([prev, b], [b, m], [prev, m]); prev = m;
  }
  return { lanes, n, e, tags: [], trunk: "main", long: ["trunk"] };
}
const PLANS = [githubFlow(), gitFlow(), trunkBased()];
const mergesInto = (p) => p.n.filter((x) => x[1] === p.trunk && x[4]?.merge).length;

export default {
  aspect: H / WW,
  aspectNarrow: H / NW,
  steps: (o) => (o.mode === "flows" ? FLOWS : BASICS),
  mount(stage, f) {
    const flows = f.opts.mode === "flows", nar = !!f.narrow, W = nar ? NW : WW;
    // 좁은 칸: 커밋 사이를 좁히고(기본), 요일 칸을 좁혀요(전략 셋)
    const BXS = nar ? { A: 92, B: 146, C: 200, D: 252, F: 292, E: 340, M: 392, D2: 342, E2: 392 } : null;
    const bn = BN.map((n) => ({ ...n, x: BXS?.[n.id] ?? n.x, label: nar && n.id === "M" ? "병합" : n.label }));
    const rn = RN.map((n) => ({ ...n, x: BXS?.[n.id] ?? n.x }));
    const X0 = nar ? 84 : 108, DW = nar ? 66 : 86, LBX = nar ? 8 : 16;
    const dx = (d, fr) => X0 + (d + fr) * DW;
    const s = svg(stage, W, H, flows ? "같은 한 주를 세 가지 브랜치 전략으로 그린 커밋 그림" : "main 줄기와 기능 브랜치의 커밋, 병합, 리베이스");
    const ro = readout(f.controls());
    let done = -1, run = 0;
    const mv = (ms, fn, ok) => new Promise((res) => {
      if (!ok()) { res(false); return; }
      if (!ms || reduced()) { fn(1); res(true); return; }
      const t0 = performance.now();
      const tick = (now) => { if (!ok() || !stage.isConnected) { res(false); return; } const t = Math.min(1, (now - t0) / ms); fn(ease.inOut(t)); if (t < 1) requestAnimationFrame(tick); else res(true); };
      requestAnimationFrame(tick);
    });
    const col = (k) => C[k] || C.ink;
    const curve = (x1, y1, x2, y2) => (y1 === y2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${x1 + (x2 - x1) * 0.55},${y1} ${x2 - (x2 - x1) * 0.55},${y2} ${x2},${y2}`);
    const M = (h) => `<span style="font-family:var(--fg-mono);font-size:13.5px">${h}</span>`;

    if (!flows) {
      const laneG = g(s), edgeG = g(s), nodeG = g(s), tagG = g(s);
      const laneName = (y, str, color) => text(laneG, 18, y, str, { size: nar ? 14 : 15, weight: 700, fill: color, mono: true });
      function node(parent, x, y, name, color, o = {}) {
        const gg = g(parent);
        circle(gg, x, y, o.merge ? 14 : 12, { fill: o.merge ? C.aSoft : C.bg, stroke: color, sw: 2.6 });
        if (o.ghost) gg.style.opacity = "0.35";
        text(gg, x, y + 0.5, name, { size: 14, anchor: "middle", weight: 700, fill: color });
        if (o.label) text(gg, x, y + 31, o.label, { size: 14, anchor: "middle", fill: C.sub, cls: "fg-t halo" });
        return gg;
      }
      function edge(parent, a, b, color, o = {}) {
        const p = path(parent, curve(a[0], a[1], b[0], b[1]), { stroke: color, width: 3, dash: o.dash });
        if (o.ghost) p.style.opacity = "0.35";
        return p;
      }
      const pos = (list) => Object.fromEntries(list.map((n) => [n.id, [n.x, BL[n.lane]]]));
      const laneCol = (n) => (n.color ? col(n.color) : n.lane === "main" ? C.a : C.b);
      async function grow(p, ok, animate, ms = 450) {
        const L = p.getTotalLength();
        p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`;
        const r = await mv(animate ? ms : 0, (u) => (p.style.strokeDashoffset = `${L * (1 - u)}`), ok);
        if (r) { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; }
        return r;
      }
      async function pop(gg, ok, animate) {
        return mv(animate ? 260 : 0, (u) => (gg.style.opacity = String(u)), ok);
      }
      function prBox(state) {
        const gg = g(tagG), x0 = nar ? 196 : 316, y0 = 222, w = nar ? 212 : 210, h = 32;
        rect(gg, x0, y0, w, h, { r: 8, fill: C.bg, stroke: state === "merged" ? C.d : C.line, sw: 1.6 });
        text(gg, x0 + 12, y0 + h / 2 + 0.5, "PR: 합쳐 주세요", { size: 14, weight: 700 });
        const st = { review: ["리뷰 중", C.b], ok: ["승인 ✓", C.c], merged: ["병합됨", C.d] }[state];
        text(gg, x0 + w - 12, y0 + h / 2 + 0.5, st[0], { size: 14, anchor: "end", weight: 700, fill: st[1] });
        return gg;
      }
      const READ = [
        `<div>커밋 = 저장된 한 장면(스냅샷) · Git 은 거의 모든 작업을 내 컴퓨터(로컬)에서 해요</div><div class="dim">A 로그인 → B 녹음 올리기 → C 요약 화면 (예시)</div>`,
        `<div>${M("git switch -c feat/share-link")}</div><div class="dim">새 브랜치를 만들어 옮겨 가요. main 은 그대로예요.</div>`,
        `<div>${M('git commit -m "feat: 회의 요약 공유 링크"')}</div><div class="dim">그사이 main 에는 도윤의 수정(F)이 들어왔어요.</div>`,
        `<div>${M("git push origin feat/share-link")} → GitHub 에서 PR</div><div class="dim">리뷰 의견을 반영한 커밋(E)까지 같은 PR 에 쌓여요.</div>`,
        `<div>병합 커밋 <b>M</b> = 부모가 둘(<span class="a">F</span> 와 <span class="b">E</span>) · 이제 main 에 공유 링크가 들어 있어요</div><div class="dim">F 와 D 가 같은 줄을 고쳤다면 여기서 충돌(conflict)이 나요 — “같은 줄을 둘이 고쳤어요.”</div>`,
        `<div>리베이스: <span class="b">D · E</span> 를 F 뒤에 다시 놓아 <span class="b">D′ · E′</span>(새 커밋) → 이력이 한 줄</div><div class="dim">“공유 브랜치에 리베이스하지 마세요.” 남이 가져간 D · E 와 내 D′ · E′ 가 어긋나요.</div>`,
      ];
      async function go(i, animate) {
        if (i === done && animate) return;
        const tk = ++run, ok = () => tk === run && f.step() === i;
        done = -1;
        laneG.replaceChildren(); edgeG.replaceChildren(); nodeG.replaceChildren(); tagG.replaceChildren();
        ro.set(READ[i]);
        laneName(BL.main, "main", C.a);
        if (i >= 1) laneName(BL.feat, "feat/share-link", C.b).style.opacity = i === 5 ? "0.4" : "1";
        text(laneG, 18, 24, "시간 →", { size: 14, fill: C.mute });
        if (i === 5) {
          // 리베이스: 원래 D · E 는 흐리게, D′ · E′ 를 main 줄 위에
          const P = { ...pos(bn), ...pos(rn) };
          [["C", "D"], ["D", "E"]].forEach(([a, b]) => edge(edgeG, P[a], P[b], C.b, { ghost: 1, dash: "6 5" }));
          node(nodeG, P.D[0], P.D[1], "D", C.b, { ghost: 1, label: "원래 D" });
          node(nodeG, P.E[0], P.E[1], "E", C.b, { ghost: 1, label: "원래 E" });
          const fresh = [];
          for (const [a, b] of RE) {
            const p = edge(edgeG, P[a], P[b], b === "D2" || b === "E2" ? C.b : C.a);
            if (b === "D2" || b === "E2") fresh.push(p);
          }
          const nodes = rn.map((n) => ({ n, gg: node(nodeG, P[n.id][0], P[n.id][1], n.name || n.id, laneCol(n), { label: n.label }) }));
          const moved = nodes.filter((x) => x.n.name);
          const arcs = [["D", "D2"], ["E", "E2"]].map(([a, b]) => path(edgeG, `M${P[a][0]},${P[a][1] - 14} C${P[a][0]},${P[a][1] - 60} ${P[b][0] - 40},${P[b][1] + 50} ${P[b][0] - 8},${P[b][1] + 14}`, { stroke: C.b, width: 1.6, dash: "4 4" }));
          const lab = text(tagG, nar ? 350 : 487, 40, "다시 놓은 새 커밋", { size: 14, anchor: "middle", weight: 700, fill: C.b });
          if (animate) {
            moved.forEach((x) => (x.gg.style.opacity = "0")); fresh.forEach((p) => (p.style.opacity = "0")); arcs.forEach((a) => (a.style.opacity = "0")); lab.style.opacity = "0";
            for (let k = 0; k < 2; k++) {
              arcs[k].style.opacity = "1";
              if (!(await grow(arcs[k], ok, animate, 500))) return;
              fresh[k].style.opacity = "1";
              if (!(await pop(moved[k].gg, ok, animate))) return;
            }
            if (!(await pop(lab, ok, animate))) return;
          }
          done = i; return;
        }
        const P = pos(bn);
        // 가지 치기 미리보기 (2단계): C 에서 아래로 갈라져요
        if (i === 1) {
          const p = path(edgeG, curve(P.C[0], P.C[1], P.C[0] + 58, BL.feat), { stroke: C.b, width: 3, dash: "6 5" });
          const t = text(tagG, P.C[0] + 70, BL.feat, nar ? "← 여기서 갈라져요" : "← 여기서 갈라져요 (아직 커밋 없음)", { size: 14, fill: C.b, weight: 600 });
          if (animate) { t.style.opacity = "0"; if (!(await grow(p, ok, animate, 600))) return; if (!(await pop(t, ok, animate))) return; }
        }
        const items = [];
        for (const [a, b] of BE) {
          const na = bn.find((n) => n.id === a), nb = bn.find((n) => n.id === b);
          if (nb.step > i) continue;
          const p = edge(edgeG, P[a], P[b], nb.lane === "feat" ? C.b : na.lane === "feat" && nb.merge ? C.b : C.a);
          items.push({ step: nb.step, x: nb.x, kind: "e", el: p });
        }
        for (const n of bn) {
          if (n.step > i) continue;
          const gg = node(nodeG, P[n.id][0], P[n.id][1], n.id, laneCol(n), { label: n.label, merge: n.merge });
          items.push({ step: n.step, x: n.x, kind: "n", el: gg });
        }
        if (i === 3) prBox("review"); if (i === 4) prBox("merged");
        // 이번 단계에 새로 생긴 것만 순서대로 그려요
        const fresh = items.filter((it) => it.step === i).sort((a, b) => a.x - b.x || (a.kind === "e" ? -1 : 1));
        if (animate) fresh.forEach((it) => (it.el.style.opacity = "0"));
        for (const it of fresh) {
          if (it.kind === "e") it.el.style.opacity = "1";
          if (it.kind === "e") { if (!(await grow(it.el, ok, animate))) return; }
          else if (!(await pop(it.el, ok, animate))) return;
        }
        if (i === 3) { if (animate && !(await mv(500, () => {}, ok))) return; tagG.replaceChildren(); prBox("ok"); }
        done = i;
      }
      return { go, destroy() { run++; } };
    }

    // ---------- 전략 셋 ----------
    const axisG = g(s), clipId = CLIP();
    const defs = el(s, "defs");
    const cp = el(defs, "clipPath", { id: clipId });
    const clipR = el(cp, "rect", { x: 0, y: 0, width: W, height: H });
    const labG = g(s), graphG = g(s, { "clip-path": `url(#${clipId})` }), nowL = line(s, 0, 36, 0, H - 14, { color: C.mute, width: 1.2, dash: "3 4" });
    nowL.style.opacity = "0";
    // 요일 칸 (예시 한 주)
    text(axisG, LBX, 22, "예시 한 주", { size: 14, weight: 600, fill: C.mute });
    DAYS.forEach((d, k) => {
      text(axisG, dx(k, 0.5), 22, d, { size: 15, anchor: "middle", weight: 700, fill: C.sub });
      line(axisG, dx(k, 0), 34, dx(k, 0), H - 16, { color: C.grid, width: 1, dash: "2 4" });
    });
    line(axisG, dx(5, 0), 34, dx(5, 0), H - 16, { color: C.grid, width: 1, dash: "2 4" });

    function drawPlan(p) {
      graphG.replaceChildren(); labG.replaceChildren();
      const lane = (id) => p.lanes[id];
      for (const [, L] of Object.entries(p.lanes)) {
        line(labG, X0 - 4, L.y, dx(5, 0), L.y, { color: C.grid, width: 1 });
        text(labG, LBX, L.y, L.name, { size: 14, weight: 700, fill: col(L.color), mono: /^[a-z]/.test(L.name) });
      }
      const at = Object.fromEntries(p.n.map(([id, ln, d, fr, o]) => [id, { x: dx(d, fr), y: lane(ln).y, ln, o: o || {} }]));
      for (const [a, b] of p.e) {
        const A = at[a], B = at[b], color = col(lane(B.y === A.y ? A.ln : B.ln === p.trunk ? A.ln : B.ln).color);
        path(graphG, curve(A.x, A.y, B.x, B.y), { stroke: color, width: 2.6 });
      }
      for (const { x, y, ln, o } of Object.values(at)) {
        const color = col(lane(ln).color);
        circle(graphG, x, y, o.merge ? 7.5 : 6, { fill: o.merge ? color : C.bg, stroke: color, sw: 2.2 });
        if (o.tag) { const w = o.tag.length * 8.6 + 14; rect(graphG, x - w / 2, y - 30, w, 20, { r: 10, fill: C.aSoft, stroke: C.a, sw: 1.2 }); text(graphG, x, y - 19.5, o.tag, { size: 14, anchor: "middle", weight: 700, fill: C.a, mono: true }); }
        if (o.flag) {
          path(graphG, `M${x},${y - 10} L${x},${y - 34} M${x},${y - 34} L${x + 14},${y - 29} L${x},${y - 24}`, { stroke: C.d, width: 2, fill: C.dSoft });
          text(graphG, x + 18, y - 30, "기능 플래그: 꺼 둠", { size: 14, weight: 700, fill: C.d, cls: "fg-t halo" });
        }
      }
      for (const [id, name] of p.tags) { const A = at[id]; text(graphG, A.x - 4, A.y + 22, name, { size: 14, fill: C.b, mono: true }); }
    }
    function drawCompare() {
      graphG.replaceChildren(); labG.replaceChildren();
      const rows = [["GitHub flow", PLANS[0]], ["GitFlow", PLANS[1]], ["트렁크 기반", PLANS[2]]];
      rows.forEach(([name, p], k) => {
        const y = 78 + k * 64;
        if (nar) { // 좁은 칸: 이름은 줄 위에, 오래 사는 줄기 수는 오른쪽 끝에
          text(labG, LBX, y - 18, name, { size: 15, weight: 700 });
          text(labG, dx(5, 0), y - 18, `오래 사는 줄기 ${p.long.length}개`, { size: 14, anchor: "end", fill: C.sub });
        } else {
          text(labG, 16, y - 8, name, { size: 15, weight: 700 });
          text(labG, 16, y + 12, `오래 사는 줄기 ${p.long.length}개`, { size: 14, fill: C.sub });
        }
        line(graphG, X0, y, dx(5, 0), y, { color: C.a, width: 2.6 });
        const ms = p.n.filter((x) => x[1] === p.trunk && x[4]?.merge);
        for (const [, , d, fr] of ms) circle(graphG, dx(d, fr), y, 7, { fill: C.a, stroke: C.bg, sw: 2 });
      });
      circle(labG, X0 + 6, 262, 6, { fill: C.a });
      text(labG, X0 + 18, 262, "= main(trunk)에 합친 때", { size: 14, fill: C.sub });
    }
    const counts = PLANS.map(mergesInto);
    const READF = [
      `<div>main 에 합친 횟수 <b>${counts[0]}</b>번 · 브랜치는 하루 이틀 살다가 병합 뒤 지워요</div><div class="dim">내 앱(SWx2)도 GitHub flow 에 가까워요: 기능 브랜치 → PR → 사람 승인 → main 병합</div>`,
      `<div>오래 사는 줄기 <b>2</b>개(main · develop) · main 에는 출시(release · hotfix) 때만 <b>${counts[1]}</b>번 합쳐요</div><div class="dim">만든 Driessen 도 2020년에 “지속적 전달을 한다면 GitHub flow 같은 더 단순한 흐름을 쓰라”고 덧붙였어요.</div>`,
      `<div>trunk 에 합친 횟수 <b>${counts[2]}</b>번 · 브랜치는 몇 시간만 살아요 · 미완성 기능은 플래그로 숨겨요</div><div class="dim">DORA: 활성 브랜치 3개 이하, 하루 한 번 이상 trunk 병합, 코드 동결 없는 팀이 전달 · 운영 성과가 좋아요.</div>`,
      `<div>main(trunk)에 합친 횟수 — GitHub flow <b>${counts[0]}</b> · GitFlow <b>${counts[1]}</b> · 트렁크 기반 <b>${counts[2]}</b> <span class="dim">(예시 한 주)</span></div><div class="dim">“GitFlow 가 전문적인 방식이죠?” — 원작자가 웹앱에는 아니라고 했어요. 우리 제품이 버전을 여러 개 지원해야 하나요?</div>`,
    ];
    async function go(i, animate) {
      if (i === done && animate) return;
      const tk = ++run, ok = () => tk === run && f.step() === i;
      done = -1; ro.set(READF[i]);
      if (i < 3) drawPlan(PLANS[i]); else drawCompare();
      axisG.style.opacity = "1";
      const x1 = dx(5, 0) + 8;
      const sweep = (u) => { const x = X0 - 8 + (x1 - X0 + 8) * u; set(clipR, { width: x }); set(nowL, { x1: x, x2: x }); nowL.style.opacity = u > 0 && u < 1 ? "1" : "0"; };
      const r = await mv(animate ? 2200 : 0, sweep, ok);
      if (!r) return;
      set(clipR, { width: W }); nowL.style.opacity = "0";
      done = i;
    }
    return { go, destroy() { run++; } };
  },
};

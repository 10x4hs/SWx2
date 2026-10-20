// 그림: TransE — 머리 + 관계 ≈ 꼬리 (Vector & Graph 07 — 카드 19)
//   엔티티 = 평면 위 점, 관계 '담당' = 이동 화살표 r. 카드의 예: 민재=[1,0], 담당=[0,1] → 검색프로젝트≈[1,1].
//   진짜 트리플은 h + r 이 t 에 닿고(점수 ‖h + r − t‖ 작게), 가짜 트리플은 멀어요. 질의 (서윤, 담당, ?) 는 h + r 에서 가장 가까운 점.
//   1:N(민재가 프로젝트 둘)은 h + r 이 한 점이라 둘 다 가까울 수 없어요. 마지막 단계에서 r 화살표 끝을 끌면(키보드도) 점수가 바로 바뀌어요.
//   다른 엔티티 자리는 그림용 값이에요 (학습된 벡터라고 치고). 점수 · 가까운 점은 모두 코드에서 계산해요.
import { svg, g, text, line, circle, path, arrowHead, drag, readout, tween, set, C, num as fmt } from "./kit.js";

const ENT = { 민재: [1, 0], 검색프로젝트: [1, 1], 서윤: [3, 0.3], 프로젝트X: [3.15, 1.2], 회의A: [2.2, 2.4], "봄 프로젝트": [-0.4, 1.4] };
const HEADS = ["민재", "서윤"];
const R0 = [0, 1]; // 담당 (카드)
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearest = (p, skip = []) => Object.keys(ENT).filter((k) => !skip.includes(k)).sort((x, y) => dist(ENT[x], p) - dist(ENT[y], p))[0];

const STEPS = [
  { cap: "TransE 는 엔티티를 점(벡터)으로 둬요. 카드의 예: 민재 = [1, 0], 검색프로젝트 = [1, 1].", show: { r: 0 } },
  { cap: "관계 '담당'은 이동 화살표 r = [0, 1] 이에요(주황). 민재 + 담당 = [1, 1] 이 검색프로젝트에 닿아요 — 진짜 트리플은 점수 ‖h + r − t‖ 가 작아요.", show: { r: 1, true1: 1 } },
  { cap: "가짜 트리플은 꼬리를 무작위로 바꾼 거예요. (민재, 담당, 회의A) 는 h + r 에서 멀어서 점수가 커요(빨간 점선). 학습은 이 차이를 벌려요.", show: { r: 1, true1: 1, fake: 1 } },
  { cap: "질의 (서윤, 담당, ?): 서윤에서 같은 화살표 r 을 따라간 곳 근처를 찾아요. 가장 가까운 점 프로젝트X 가 답 후보예요(초록 고리).", show: { r: 1, true1: 1, query: 1 } },
  { cap: "약점은 1:N 이에요. 민재가 봄 프로젝트도 담당하면, h + r 은 한 점이라 두 프로젝트 모두에 가까울 수 없어요. 둘이 한 자리로 몰려야 해요.", show: { r: 1, true1: 1, oneN: 1 } },
  { cap: "이제 직접 주황 화살표 끝을 끌어 보세요. r 이 바뀌면 모든 트리플의 점수와 질의 답이 같이 바뀌어요.", show: { r: 1, true1: 1, query: 1, free: 1 } },
];

export default {
  aspect: 360 / 600,
  aspectNarrow: 300 / 380,
  steps: STEPS.map((s) => s.cap),
  hint: "마지막 단계에서 주황 화살표 끝을 끌어 보세요",
  mount(stage, f) {
    const nar = !!f.narrow;
    // 좌표 → 판: 넓으면 1칸 = 82, 좁으면 1칸 = 64 (같은 범위를 더 크게)
    const W = nar ? 380 : 600, H = nar ? 300 : 360, S = nar ? 64 : 82, OX = nar ? 82 : 150, OY = nar ? 242 : 302;
    const BX = [-1, nar ? 4.5 : 5.2], BY = [-0.55, 3.1];
    const px = (v) => [OX + v[0] * S, OY - v[1] * S];
    const s = svg(stage, W, H, "엔티티를 점으로, 관계 '담당'을 이동 화살표로 그린 TransE 평면");
    // 모눈
    const grid = g(s);
    for (let x = Math.ceil(BX[0]); x <= BX[1]; x++) line(grid, ...px([x, BY[0]]), ...px([x, BY[1]]), { color: x ? C.grid : C.line, width: x ? 1 : 1.4 });
    for (let y = Math.ceil(BY[0]); y <= BY[1]; y++) line(grid, ...px([BX[0], y]), ...px([BX[1], y]), { color: y ? C.grid : C.line, width: y ? 1 : 1.4 });
    for (let x = Math.ceil(BX[0]); x <= Math.floor(BX[1]); x++) if (x) text(grid, px([x, 0])[0], OY + 15, String(x).replace("-", "−"), { size: 13, anchor: "middle", fill: C.mute });
    for (let y = 1; y <= 3; y++) text(grid, OX - 8, px([0, y])[1], String(y), { size: 13, anchor: "end", fill: C.mute });

    const fakeG = g(s), oneG = g(s), qG = g(s);
    // r 화살표: 머리마다 하나 (같은 벡터)
    const rArrows = {};
    for (const h of [...HEADS]) {
      const l = line(s, 0, 0, 0, 0, { color: C.b, width: 3 }); l.setAttribute("marker-end", arrowHead(s, C.b));
      rArrows[h] = l;
    }
    const rLbl = text(s, 0, 0, "r = 담당", { size: 15, weight: 700, fill: C.b, cls: "fg-t halo" });
    // h + r 이 닿는 곳 (빈 동그라미)
    const land = {};
    for (const h of HEADS) land[h] = circle(s, 0, 0, 9, { fill: "none", stroke: C.b, sw: 2 });
    // 엔티티 점 + 이름
    const entE = {};
    for (const [k, v] of Object.entries(ENT)) {
      const [x, y] = px(v), isHead = HEADS.includes(k);
      const c = circle(s, x, y, 6.5, { fill: isHead ? C.a : C.ink, stroke: C.bg, sw: 2 });
      const below = k === "민재" || k === "서윤";
      const t = text(s, x + (k === "봄 프로젝트" ? 0 : 10), y + (below ? 18 : -14), k, { size: 15, weight: 700, fill: isHead ? C.a : C.ink, anchor: k === "봄 프로젝트" ? "middle" : "start", cls: "fg-t halo" });
      entE[k] = { c, t };
    }
    // 가짜 트리플 · 1:N · 질의
    const fakeL = line(fakeG, 0, 0, 0, 0, { color: C.no, width: 2, dash: "5 4" }), fakeT = text(fakeG, 0, 0, "", { size: 15, weight: 700, fill: C.no, cls: "fg-t halo" });
    const oneL = line(oneG, 0, 0, 0, 0, { color: C.no, width: 2, dash: "5 4" }), oneT = text(oneG, 0, 0, "", { size: 15, weight: 700, fill: C.no, cls: "fg-t halo" });
    const qRing = circle(qG, 0, 0, 16, { fill: "none", stroke: C.c, sw: 3 }), qL = line(qG, 0, 0, 0, 0, { color: C.c, width: 2, dash: "4 3" });
    const qT = text(qG, 0, 0, "?", { size: 17, weight: 700, fill: C.b, cls: "fg-t halo" });
    // 끄는 손잡이 (민재의 r 끝)
    const hit = circle(s, 0, 0, 18, { fill: "transparent" }), knob = circle(s, 0, 0, 6, { fill: C.b, stroke: C.bg, sw: 2 });
    knob.style.pointerEvents = "none"; // 눌림은 아래의 넓은 손잡이(hit)가 받아요
    const ro = readout(f.controls());
    const st = { r: R0.slice(), on: STEPS[0].show };

    const fmtV = (v) => `[${fmt(v[0], 2)}, ${fmt(v[1], 2)}]`;
    function draw() {
      const { r, on } = st;
      for (const h of HEADS) {
        const a = px(ENT[h]), b = px(add(ENT[h], r)), L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = L > 10 ? (L - 7) / L : 0;
        const vis = on.r && (h === "민재" || on.query);
        set(rArrows[h], { x1: a[0], y1: a[1], x2: a[0] + (b[0] - a[0]) * k, y2: a[1] + (b[1] - a[1]) * k }); rArrows[h].style.display = vis ? "" : "none";
        set(land[h], { cx: b[0], cy: b[1] }); land[h].style.display = vis ? "" : "none";
      }
      const m = px(ENT.민재), tip = px(add(ENT.민재, r));
      set(rLbl, { x: (m[0] + tip[0]) / 2 - 12, y: (m[1] + tip[1]) / 2, "text-anchor": "end" }); rLbl.style.display = on.r ? "" : "none";
      set(hit, { cx: tip[0], cy: tip[1] }); set(knob, { cx: tip[0], cy: tip[1] });
      hit.style.display = knob.style.display = on.free ? "" : "none";
      hit.setAttribute("aria-valuetext", `r = ${fmtV(r)}`);
      // 가짜 트리플: 민재 + r → 회의A
      const hm = add(ENT.민재, r), fa = px(ENT.회의A);
      set(fakeL, { x1: tip[0], y1: tip[1], x2: fa[0], y2: fa[1] }); set(fakeT, { x: (tip[0] + fa[0]) / 2 + 10, y: (tip[1] + fa[1]) / 2 + 4 }); fakeT.textContent = fmt(dist(hm, ENT.회의A), 2);
      fakeG.style.display = on.fake ? "" : "none";
      // 1:N: 민재 + r → 봄 프로젝트
      const bp = px(ENT["봄 프로젝트"]);
      set(oneL, { x1: tip[0], y1: tip[1], x2: bp[0], y2: bp[1] }); set(oneT, { x: (tip[0] + bp[0]) / 2, y: (tip[1] + bp[1]) / 2 - 12, "text-anchor": "middle" }); oneT.textContent = fmt(dist(hm, ENT["봄 프로젝트"]), 2);
      oneG.style.display = on.oneN ? "" : "none";
      // 질의: 서윤 + r 에서 가장 가까운 점
      const hs = add(ENT.서윤, r), ans = nearest(hs, ["서윤"]), q = px(hs), A = px(ENT[ans]);
      set(qRing, { cx: A[0], cy: A[1] }); set(qL, { x1: q[0], y1: q[1], x2: A[0], y2: A[1] }); set(qT, { x: q[0] - 14, y: q[1] - 2, "text-anchor": "end" });
      qG.style.display = on.query ? "" : "none";
      // 강조: 진짜 트리플의 꼬리
      for (const [k, e] of Object.entries(entE)) {
        const hot = (on.true1 && k === "검색프로젝트") || (on.query && k === ans) || (on.oneN && k === "봄 프로젝트") || (on.fake && k === "회의A");
        set(e.c, { r: hot ? 7.5 : 6.5 });
        set(e.t, { fill: HEADS.includes(k) ? C.a : on.r && !hot && k !== "민재" ? C.sub : C.ink });
      }
      // 계산 칸
      const sc = (h, t) => dist(add(ENT[h], r), ENT[t]);
      const rowT = (h, t, cls) => `(${h}, 담당, ${t}) 점수 = ‖${fmtV(ENT[h])} + ${fmtV(r)} − ${fmtV(ENT[t])}‖ = <b${cls ? ` class="${cls}"` : ""}>${fmt(sc(h, t), 2)}</b>`;
      const rows = [];
      if (!on.r) rows.push(`<div>${Object.entries(ENT).map(([k, v]) => `${HEADS.includes(k) ? `<span class="a">${k}</span>` : k} ${fmtV(v)}`).join(" · ")}</div><div class="dim">민재 · 검색프로젝트는 카드의 예, 나머지 자리는 학습된 벡터라고 친 그림용 값이에요.</div>`);
      else {
        rows.push(`<div><span class="b">r</span> = 담당 = ${fmtV(r)}${on.free ? "" : " <span class=\"dim\">(카드의 예)</span>"} · 민재 + r = ${fmtV(hm)}</div>`);
        rows.push(`<div>진짜 ${rowT("민재", "검색프로젝트", "c")}</div>`);
        if (on.fake) rows.push(`<div>가짜 ${rowT("민재", "회의A", "b")} <span class="dim">— 클수록 '그럴듯하지 않다'</span></div>`);
        if (on.oneN) rows.push(`<div>1:N ${rowT("민재", "봄 프로젝트", "b")} <span class="dim">— 같은 h + r 로는 둘 다 0 이 될 수 없어요</span></div>`);
        if (on.query) {
          const order = Object.keys(ENT).filter((k) => k !== "서윤").sort((x, y) => dist(ENT[x], hs) - dist(ENT[y], hs));
          rows.push(`<div>질의 (서윤, 담당, ?) · 서윤 + r = ${fmtV(hs)} → 가까운 순: ${order.slice(0, 3).map((k, i) => `${i ? "" : "<b class=\"c\">"}${k} ${fmt(dist(ENT[k], hs), 2)}${i ? "" : "</b>"}`).join(" · ")}</div>`);
        }
      }
      ro.set(rows.join(""));
    }
    // 끌기: r 의 끝 (0.05 칸씩 붙어요)
    const snap = (v) => Math.round(v * 20) / 20;
    drag(s, hit, (x, y) => {
      const p = [snap((x - OX) / S - ENT.민재[0]), snap((OY - y) / S - ENT.민재[1])];
      const v = [Math.max(-1.6, Math.min(3, p[0])), Math.max(-0.6, Math.min(3, p[1]))];
      if (v[0] === st.r[0] && v[1] === st.r[1]) return;
      st.r = v; draw();
    }, { get: () => px(add(ENT.민재, st.r)), step: S / 10, label: "관계 화살표 r 의 끝 — 화살표 키로 움직여요" });
    draw();
    return {
      async go(i, animate) {
        const on = STEPS[i].show; st.on = on;
        if (on.free) { draw(); return; }
        // 단계로 넘어오면 r 을 카드의 [0, 1] 로 되돌려요 (끌어 본 뒤에도)
        const cur = { x: st.r[0], y: st.r[1] };
        await tween(cur, { x: R0[0], y: R0[1] }, animate && (cur.x !== R0[0] || cur.y !== R0[1]) ? 500 : 0, (o) => { st.r = [o.x, o.y]; draw(); });
        st.r = R0.slice();
        // 화살표가 처음 나올 때: 민재에서 자라나요
        if (animate && on.r && !STEPS[i - 1]?.show.r) { const g0 = { t: 0 }; await tween(g0, { t: 1 }, 600, (o) => { st.r = [R0[0] * o.t, R0[1] * o.t]; draw(); }); st.r = R0.slice(); }
        draw();
      },
    };
  },
};

// 그림: 벡터 = 공간 속의 점 (Vector & Graph 01 — 카드 1 · 12) · 3D
//   숫자 1개 [0.2] 는 선 위의 점, 2개 [0.2, 0.9] 는 평면 위의 점, 3개 [0.2, 0.9, 0.1] 은 공간 속의 점이에요.
//   글(노트)도 점이 되고 뜻이 비슷하면 가까이 모여요(예시 데이터). 검색어도 점이 되고, 가장 가까운 점 3개가 결과예요 — 거리는 직접 계산해요.
//   단계마다 정해 둔 시점으로 보여 줘요(끌어서 돌리기는 덤). 아래 단추로 검색어를 바꿔 볼 수 있어요.
//   opts.mode = "clip" — 사진(네모)과 글(동그라미)이 한 공간에: 학습하면 짝끼리 가까워지고, 글로 사진을 찾아요 (카드 12).
import { scene3d } from "./three-kit.js";
import { readout, choice, tween, fmt, clamp, lerp } from "./kit.js";

const K = 2.6; // 숫자 1 = 3D 길이 2.6
const P0 = [0.2, 0.9, 0.1]; // 카드의 숫자 줄
const CIRC = ["①", "②", "③"];
const KQ = { base: 3, clip: 2 }; // 검색 결과로 이을 개수
// 예시 데이터: 노트 9개 = 점 9개 (세 주제). side = 이름표를 점의 어느 쪽에
const NOTES = [
  { t: "지난주 회의록", v: P0, c: "a", side: "l" },
  { t: "수요일 미팅 메모", v: [0.34, 0.74, 0.12], c: "a", side: "r" },
  { t: "주간 회의 안건", v: [0.1, 0.62, 0.3], c: "a", side: "l" },
  { t: "강아지 산책", v: [0.86, 0.36, 0.14], c: "c", side: "r" },
  { t: "고양이 사료", v: [0.78, 0.24, 0.34], c: "c", side: "r" },
  { t: "동물병원 예약", v: [0.94, 0.1, 0.12], c: "c", side: "r", edge: 1 }, // edge: 폰에서 번호가 붙으면 이름표를 왼쪽으로 (오른쪽 끝이라)
  { t: "서버 배포 순서", v: [0.38, 0.46, 0.9], c: "d", side: "l" },
  { t: "배포 실패 로그", v: [0.26, 0.24, 0.8], c: "d", side: "l" },
  { t: "롤백 방법", v: [0.4, 0.08, 0.92], c: "d", side: "l" },
];
const QUERIES = [
  { k: "meet", t: "지난주 회의 그거", v: [0.36, 0.92, 0.12], side: "r" },
  { k: "pet", t: "강아지 밥 주기", v: [0.8, 0.42, 0.2], side: "t" },
  { k: "dep", t: "배포가 실패했어요", v: [0.3, 0.16, 0.74], side: "r" },
];
// CLIP 예시: 사진(네모) 3장과 설명 글(동그라미) 3개. pre = 학습 전 자리, v = 학습 후 자리
const CLIP = [
  { t: "사진: 화이트보드", img: 1, c: "a", pre: [0.85, 0.9, 0.5], v: [0.22, 0.8, 0.24], side: "l", pside: "r" },
  { t: "“whiteboard with diagram”", img: 0, c: "a", pre: [0.15, 0.15, 0.55], v: [0.34, 0.88, 0.14], side: "r", pside: "l" },
  { t: "사진: 강아지", img: 1, c: "c", pre: [0.1, 0.75, 0.75], v: [0.84, 0.34, 0.16], side: "r", pside: "l" },
  { t: "“a photo of a dog”", img: 0, c: "c", pre: [0.6, 0.55, 0.05], v: [0.9, 0.2, 0.32], side: "r", pside: "r" },
  { t: "사진: 커피", img: 1, c: "d", pre: [0.55, 0.1, 0.1], v: [0.34, 0.2, 0.86], side: "l", pside: "r" },
  { t: "“a cup of coffee”", img: 0, c: "d", pre: [0.3, 0.6, 0.95], v: [0.2, 0.42, 0.94], side: "l", pside: "l" },
];
const CLIP_Q = { t: "아키텍처 그림", v: [0.1, 0.6, 0.36], side: "l" };

// 단계마다 정해 둔 시점 (yaw · pitch · 거리 · 바라보는 곳)
const VIEW = {
  line: { yaw: 0, pitch: 0, dist: 4.6, f: [0.58, 0, 0], nar: 1.5 },
  plane: { yaw: 0, pitch: 0, dist: 6.2, f: [0.52, 0.5, 0] },
  space: { yaw: 0.62, pitch: 0.36, dist: 7.4, f: [0.46, 0.44, 0.46] },
  cloud: { yaw: 0.6, pitch: 0.3, dist: 7.6, f: [0.52, 0.48, 0.5] },
};
const BASE = [
  { cap: "숫자 하나는 선 위의 점 하나예요. [0.2] 는 0 에서 오른쪽으로 0.2 만큼 간 자리의 파란 점이에요.", view: "line", ax: [1, 0, 0], p: [0.2, 0, 0], lab: "[0.2]", gd: 1, tick: 1 },
  { cap: "숫자가 두 개면 평면 위의 점이에요. [0.2, 0.9] 는 오른쪽으로 0.2, 위로 0.9 간 자리예요.", view: "plane", ax: [1, 1, 0], p: [0.2, 0.9, 0], lab: "[0.2, 0.9]", gd: 1, tick: 1, xy: 1 },
  { cap: "숫자 세 개 [0.2, 0.9, 0.1] 은 3차원 공간의 점이에요. 숫자가 1,536개면 1,536차원 — 그릴 수 없을 뿐 계산은 같아요.", view: "space", ax: [1, 1, 1], p: P0, lab: "[0.2, 0.9, 0.1]", gd: 1, tick: 1, floor: 1 },
  { cap: "임베딩 모델은 글 하나를 이런 점 하나로 바꿔요. 뜻이 비슷한 노트끼리 가까이 모여요 (예시 데이터).", view: "cloud", ax: [1, 1, 1], p: P0, notes: 1, floor: 1 },
  { cap: "검색어 '지난주 회의 그거'도 같은 모델로 주황 점이 돼요. 가장 가까운 점 3개가 검색 결과예요 — 단어가 다른 '수요일 미팅 메모'도 찾아요.", view: "cloud", ax: [1, 1, 1], p: P0, notes: 1, floor: 1, q: "meet" },
  { cap: "이제 직접 검색어를 골라 보세요. 주황 점이 옮겨 가면 가장 가까운 3개(결과)도 바뀌어요.", view: "cloud", ax: [1, 1, 1], p: P0, notes: 1, floor: 1, q: "free" },
];
const CLIPS = [
  { cap: "CLIP 은 사진(네모)은 그림 모델로, 글(동그라미)은 글 모델로 숫자 줄을 만들어요. 학습 전에는 짝(같은 색)이 흩어져 있어요.", view: "cloud", train: 0 },
  { cap: "(그림, 글) 짝 4억 개로 '이 그림에 맞는 글은 어느 것?'을 맞히게 학습해요. 맞는 짝은 가까워지도록 숫자가 고쳐져요.", view: "cloud", train: 1 },
  { cap: "그래서 'whiteboard with diagram' 글과 화이트보드 사진이 바로 옆에 와요. 그림과 글이 한 공간을 같이 써요.", view: "cloud", train: 1, pair: 1 },
  { cap: "검색어 '아키텍처 그림'도 글 모델로 주황 점이 돼요. 가장 가까운 사진이 화이트보드 사진이라서, 글로 사진을 찾을 수 있어요.", view: "cloud", train: 1, q: 1 },
];

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const vfmt = (v) => `[${v.map((x) => fmt(x, 2)).join(", ")}]`;
const ANCH = (sd, o = 11) => ({ r: `translate(calc(50% + ${o}px), 0)`, l: `translate(calc(-50% - ${o}px), 0)`, t: `translate(0, calc(-50% - ${o}px))`, b: `translate(0, calc(50% + ${o}px))` }[sd] || "none");

export default {
  aspect: 0.72,
  aspectNarrow: 1.05,
  steps: (o) => (o.mode === "clip" ? CLIPS : BASE).map((s) => s.cap),
  hint: "끌어서 돌려 볼 수도 있어요",
  async mount(stage, f) {
    const clip = f.opts.mode === "clip", nar = !!f.narrow, steps = clip ? CLIPS : BASE;
    const v0 = VIEW[steps[0].view];
    const S = await scene3d(stage, { yaw: v0.yaw, pitch: v0.pitch, dist: v0.dist, fov: 36, label: clip ? "사진과 글이 같이 놓인 3차원 벡터 공간 — 끌거나 화살표 키로 돌려요" : "숫자 줄이 점이 되는 3차원 벡터 공간 — 끌거나 화살표 키로 돌려요" });
    const T = S.THREE, root = S.root;
    const col = {};
    const NAMES = { ink: "--fg-ink", sub: "--fg-sub", mute: "--fg-mute", line: "--fg-line", grid: "--fg-grid", a: "--fg-a", b: "--fg-b", c: "--fg-c", d: "--fg-d" };
    const readCols = () => { for (const [k, v] of Object.entries(NAMES)) col[k] = S.color(v); };
    readCols();
    const mats = []; // [material, 색 이름] — 밤/종이가 바뀌면 다시 칠해요
    const mat = (name, o = {}) => { const m = new T.MeshBasicMaterial({ color: col[name], ...o }); mats.push([m, name]); return m; };
    const lmat = (name, o = {}) => { const m = (o.dash ? new T.LineDashedMaterial({ color: col[name], dashSize: 0.07, gapSize: 0.06, transparent: true }) : new T.LineBasicMaterial({ color: col[name], transparent: true })); mats.push([m, name]); return m; };
    const V3 = (v) => new T.Vector3(v[0] * K, v[1] * K, v[2] * K);

    // 이름표 (HTML) — 점의 오른쪽/왼쪽/위/아래에 붙여요 (폰에서 긴 영어 글은 두 줄로)
    function tag(cls, side = "r", small = false, off = 11, wrap = false) {
      const L = S.label("", cls);
      Object.assign(L.el.style, { background: "none", padding: "0" });
      if (small || nar) L.el.style.fontSize = small ? "11.5px" : "12px";
      let key = "";
      const o = {
        el: L.el, side,
        at(v) { L.set(v[0] * K, v[1] * K, v[2] * K); return o; },
        html(h, sd = o.side) { if (key === h + sd) return o; key = h + sd; L.text(`<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:color-mix(in srgb, var(--fg-bg) 86%, transparent);transform:${ANCH(sd, off)}${wrap ? ";white-space:normal;width:max-content;max-width:92px;text-align:center;line-height:1.25" : ""}">${h}</span>`); return o; },
        show(on) { L.show(!!on); return o; },
        dim(k) { L.el.style.opacity = String(k); return o; },
      };
      return o;
    }
    // 두 점 사이 선 (점선 가능) — 위치가 바뀌면 다시 계산
    function seg(name, dash = false) {
      const geo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
      const m = lmat(name, { dash }), ln = new T.Line(geo, m);
      root.add(ln);
      return {
        set(a, b, op) {
          const p = geo.attributes.position; p.setXYZ(0, a[0] * K, a[1] * K, a[2] * K); p.setXYZ(1, b[0] * K, b[1] * K, b[2] * K); p.needsUpdate = true;
          geo.computeBoundingSphere(); if (dash) ln.computeLineDistances();
          m.opacity = op; ln.visible = op > 0.01;
        },
      };
    }
    // 굵은 선 (가는 원기둥) — 검색어에서 결과까지
    const cylGeo = new T.CylinderGeometry(1, 1, 1, 8);
    function rod(name, r = 0.016) {
      const mm = mat(name, { transparent: true }), m = new T.Mesh(cylGeo, mm); m.visible = false; root.add(m);
      const up = new T.Vector3(0, 1, 0);
      return {
        op(o) { mm.opacity = o; },
        set(a, b, t) {
          const A = V3(a), B = V3(b), E = A.clone().lerp(B, t), len = A.distanceTo(E);
          m.visible = len > 0.01; if (!m.visible) return;
          m.position.copy(A).add(E).multiplyScalar(0.5); m.scale.set(r, len, r);
          m.quaternion.setFromUnitVectors(up, E.clone().sub(A).normalize());
        },
      };
    }

    // 축 3개 (원기둥 + 원뿔) · 0.1 마다 눈금 · 축 이름
    const AXL = 1.12;
    const axes = [0, 1, 2].map((dir) => {
      const grp = new T.Group(), len = AXL * K;
      const cyl = new T.Mesh(cylGeo, mat("sub")); cyl.scale.set(0.014, len, 0.014); cyl.position.y = len / 2;
      const cone = new T.Mesh(new T.ConeGeometry(0.055, 0.17, 14), mat("sub")); cone.position.y = len + 0.08;
      grp.add(cyl, cone);
      const ticks = new T.Group();
      for (let k = 1; k <= 10; k++) { const big = k % 5 === 0, tk = new T.Mesh(cylGeo, mat(big ? "sub" : "line")); tk.scale.set(0.01, big ? 0.13 : 0.08, 0.01); tk.rotation.z = Math.PI / 2; tk.position.y = (k / 10) * K; ticks.add(tk); }
      grp.add(ticks);
      if (dir === 0) grp.rotation.z = -Math.PI / 2; // +y → +x
      if (dir === 2) grp.rotation.x = Math.PI / 2; // +y → +z
      root.add(grp);
      const tip = [0, 0, 0]; tip[dir] = AXL + 0.12;
      const name = tag("sub", dir === 1 ? "t" : "b", true).at(tip).html(`${dir + 1}번 칸`, dir === 1 ? "t" : "b");
      const tl = [0.5, 1].map((v) => { const p = [0, 0, 0]; p[dir] = v; return tag("sub", dir === 1 ? "l" : "b", true).at(p).html(fmt(v, 1), dir === 1 ? "l" : "b"); });
      return { grp, ticks, name, tl };
    });
    const zeroT = tag("sub", "b", true).at([0, 0, 0]).html("0", "b");

    // 모눈: 바닥(1번 · 3번 칸) · 앞판(1번 · 2번 칸)
    function grid(plane) {
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const t = (k / 4) * K;
        if (plane === "floor") pts.push(t, 0, 0, t, 0, K, 0, 0, t, K, 0, t);
        else pts.push(t, 0, 0, t, K, 0, 0, t, 0, K, t, 0);
      }
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
      const ls = new T.LineSegments(geo, lmat("line")); root.add(ls); return ls;
    }
    const floorG = grid("floor"), xyG = grid("xy");

    // 점들
    const sph = new T.SphereGeometry(1, 20, 14);
    const R = 0.075;
    function dot(name, r = R) { const m = new T.Mesh(sph, mat(name)); m.scale.setScalar(r); root.add(m); return m; }
    function square(name, s = 0.17) { const sm = new T.SpriteMaterial({ color: col[name] }); mats.push([sm, name]); const sp = new T.Sprite(sm); sp.scale.set(s, s, 1); sp.userData.s = s; root.add(sp); return sp; }

    const items = (clip ? CLIP : NOTES).map((n) => ({ ...n, mesh: n.img ? square(n.c) : dot(n.c), drop: seg("sub", true), lab: tag(n.c, n.side, false, n.img ? 15 : 11, nar && n.t.length > 14) }));
    const P = clip ? null : items[0];
    // 길잡이: 0 에서 출발해 1번 칸만큼 오른쪽 → 3번 칸만큼 앞 → 2번 칸만큼 위 (숫자 하나 = 방향 하나)
    const legs = [0, 1, 2].map(() => rod("a", 0.021));
    const legT = [tag("a", "b"), tag("a", "l"), tag("a", "r")];
    // 검색어 점 + 결과까지 선
    const qMesh = dot("b", 0.09), qLab = tag("b", "t");
    const rods = [0, 1, 2].map(() => rod("b"));
    const pairRod = clip ? rod("a", 0.013) : null, pairT = clip ? tag("a", "c") : null;

    // 아래 칸: (마지막 단계) 검색어 고르기 + 계산
    const ctl = f.controls();
    let freeQ = "meet";
    const pick = clip ? null : choice(ctl, QUERIES.map((q) => [q.k, q.t]), "meet", (k) => { freeQ = k; if (f.step() !== steps.length - 1) f.goto(steps.length - 1); else run(f.step(), true); }, "검색어 고르기");
    const ro = readout(ctl);

    // 지금 모습 (숫자만) — tween 으로 옮겨요
    const st = { ax0: 1, ax1: 0, ax2: 0, px: 0.2, py: 0, pz: 0, gd: 1, floor: 0, xy: 0, tick: 1, notes: 0, train: 0, pair: 0, q: 0, qx: 0, qy: 0, qz: 0, ln: 0, fx: v0.f[0], fy: v0.f[1], fz: v0.f[2] };
    let cur = steps[0];

    const qOf = (s) => (clip ? (s.q ? CLIP_Q : null) : s.q ? QUERIES.find((q) => q.k === (s.q === "free" ? freeQ : s.q)) : null);
    const posOf = (it, train) => (clip ? it.pre.map((x, k) => lerp(x, it.v[k], train)) : it.v);
    function nearest(q, train) {
      return items.map((it, i) => ({ i, d: d3(q, posOf(it, train)) })).sort((a, b) => a.d - b.d);
    }

    function apply() {
      root.position.set(-st.fx * K, -st.fy * K, -st.fz * K);
      axes.forEach((A, k) => {
        const s = st["ax" + k]; A.grp.visible = s > 0.01; A.grp.scale.y = Math.max(0.001, s);
        A.name.show(s > 0.6); A.tl.forEach((t) => t.show(s > 0.6 && st.tick > 0.5));
      });
      zeroT.show(st.tick > 0.5 && st.ax2 < 0.5);
      floorG.material.opacity = 0.75 * st.floor; floorG.visible = st.floor > 0.01;
      xyG.material.opacity = 0.75 * st.xy; xyG.visible = st.xy > 0.01;
      // 점들
      const q = [st.qx, st.qy, st.qz], near = st.q > 0.01 ? nearest(q, st.train).slice(0, clip ? KQ.clip : KQ.base) : [];
      const rank = new Map(near.map((n, k) => [n.i, k]));
      items.forEach((it, i) => {
        const main = it === P;
        const v = main ? [st.px, st.py, st.pz] : posOf(it, st.train);
        const a = main ? 1 : clip ? 1 : clamp(st.notes * 1.7 - (i - 1) * 0.08, 0, 1);
        const p = V3(v); it.mesh.position.copy(p);
        if (it.img) it.mesh.scale.set(it.mesh.userData.s * a, it.mesh.userData.s * a, 1); else it.mesh.scale.setScalar(R * a);
        it.mesh.visible = a > 0.01;
        it.drop.set(v, [v[0], 0, v[2]], (main ? st.notes : a * (clip ? 1 : st.notes)) * 0.55 * st.floor);
        const named = main ? true : a > 0.6;
        it.lab.at(v).show(named && (main ? st.ax0 > 0.5 : true));
        const r = rank.get(i);
        if (main && !clip && st.notes < 0.5) it.lab.html(cur.lab || vfmt(P0), st.ax2 > 0.5 ? "r" : "t");
        else if (r != null && st.ln > 0.5) it.lab.html(`${CIRC[r]} ${it.t}`, nar && it.edge ? "l" : it.side);
        else it.lab.html(it.t, clip && st.train < 0.5 ? it.pside : it.side);
        it.lab.dim(st.ln > 0.5 && r == null ? 0.45 : 1);
        it.lab.el.style.fontWeight = r != null && st.ln > 0.5 ? "700" : "";
      });
      // 길잡이 (카드의 숫자)
      if (P) {
        const p = [st.px, st.py, st.pz];
        const c = [[0, 0, 0], [p[0], 0, 0], [p[0], 0, p[2]], p], len = [p[0], p[2], p[1]];
        legs.forEach((lg, k) => lg.set(c[k], c[k + 1], st.gd > 0.01 && len[k] > 0.004 ? 1 : 0));
        legs.forEach((lg) => lg.op(st.gd));
        legT.forEach((t, k) => t.at(c[k].map((x, j) => (x + c[k + 1][j]) / 2)).html(fmt(len[k], 2), k === 0 && st.ax2 > 0.5 ? "t" : k === 1 ? "b" : t.side).show(st.gd > 0.5 && len[k] > 0.03));
      }
      // 검색어 · 결과까지 선
      qMesh.visible = st.q > 0.01; qMesh.scale.setScalar(0.09 * st.q); qMesh.position.copy(V3(q));
      const qq = qOf(cur);
      // 폰(좁은 칸)에서는 '검색어' 만 — 글은 아래 계산 칸과 단추에 있어요
      qLab.at(q).show(st.q > 0.6).html(qq ? (nar && !clip ? "검색어" : `검색어 “${qq.t}”`) : "", qq?.side || "t");
      rods.forEach((rd, k) => { const n = near[k]; if (!n) { rd.set(q, q, 0); return; } rd.set(q, posOf(items[n.i], st.train), clamp(st.ln * 1.3 - k * 0.15, 0, 1)); });
      // CLIP: 화이트보드 짝 사이 선
      if (clip) {
        const a = posOf(items[0], st.train), b = posOf(items[1], st.train);
        pairRod.set(a, b, st.pair); pairT.at(a.map((x, k) => (x + b[k]) / 2)).html(`거리 ${fmt(d3(a, b), 2)}`, "t").show(st.pair > 0.6);
      }
      S.render();
    }

    function target(s) {
      const v = VIEW[s.view], q = qOf(s);
      const ax = s.ax || [1, 1, 1];
      const t = { ax0: ax[0], ax1: ax[1], ax2: ax[2], gd: s.gd || 0, floor: clip ? 1 : s.floor || 0, xy: s.xy || 0, tick: s.tick || 0, notes: s.notes || 0, train: s.train || 0, pair: s.pair || 0, q: q ? 1 : 0, ln: q ? 1 : 0, fx: v.f[0], fy: v.f[1], fz: v.f[2] };
      if (P) { t.px = s.p[0]; t.py = s.p[1]; t.pz = s.p[2]; }
      if (q) { t.qx = q.v[0]; t.qy = q.v[1]; t.qz = q.v[2]; }
      return t;
    }
    function say(s) {
      const q = qOf(s);
      if (clip) {
        if (s.q) {
          const nn = nearest(q.v, 1).slice(0, KQ.clip);
          ro.set(`<div>검색어 <span class="b">“${q.t}”</span> ${vfmt(q.v)} 에서 가까운 순서:</div><div>${nn.map((n, k) => `${CIRC[k]} <span class="${items[n.i].c}">${items[n.i].t}</span> <b>${fmt(n.d, 2)}</b>`).join(" · ")}</div><div class="dim">거리 = √(칸마다 차이² 의 합) · 예시 데이터</div>`);
        } else if (s.pair) {
          const wb = items[0].v, d = (i) => fmt(d3(wb, items[i].v), 2);
          ro.set(`<div><span class="a">사진: 화이트보드</span> ↔ <span class="a">“whiteboard with diagram”</span> 거리 <b>${d(1)}</b></div><div>↔ <span class="c">“a photo of a dog”</span> ${d(3)} · ↔ <span class="d">“a cup of coffee”</span> ${d(5)} <span class="dim">(짝이 아닌 글은 멀어요)</span></div>`);
        } else {
          const pd = (tr) => { let a = 0, b = 0, na = 0, nb = 0; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { const dd = d3(posOf(items[i], tr), posOf(items[j], tr)); if (items[i].c === items[j].c) { a += dd; na++; } else { b += dd; nb++; } } return [a / na, b / nb]; };
          const [pa, pb] = pd(s.train);
          ro.set(`<div>■ 사진 3장 · ● 글 3개 <span class="dim">(예시 · 같은 색 = 짝)</span></div><div>${s.train ? "학습 후" : "학습 전"}: 짝 사이 평균 거리 <b>${fmt(pa, 2)}</b> · 짝이 아닌 것 사이 <b>${fmt(pb, 2)}</b></div>`);
        }
        return;
      }
      if (q) {
        const nn = nearest(q.v, 1), best = items[nn[0].i].v, dd = q.v.map((x, k) => Math.abs(x - best[k]));
        const other = nn.find((n) => items[n.i].c !== items[nn[0].i].c);
        ro.set(`<div>검색어 <span class="b">“${q.t}”</span> = ${vfmt(q.v)} 에서 가까운 순서:</div>`
          + `<div>${nn.slice(0, 3).map((n, k) => `${CIRC[k]} <span class="${items[n.i].c}">${items[n.i].t}</span> <b>${fmt(n.d, 2)}</b>`).join(" · ")}</div>`
          + `<div class="dim">${CIRC[0]} 거리 = √(${dd.map((x) => `${fmt(x, 2)}²`).join(" + ")}) = ${fmt(nn[0].d, 2)} · 다른 주제 중 가장 가까운 '${items[other.i].t}'는 ${fmt(other.d, 2)}</div>`);
        return;
      }
      if (s.notes) { ro.set(`<div>예시 데이터 · 노트 9개 = 점 9개</div><div><span class="a">파란</span> 회의 노트 · <span class="c">초록</span> 반려동물 노트 · <span class="d">보라</span> 배포 노트</div>`); return; }
      const n = s.lab.split(",").length, dirs = ["오른쪽으로", "위로", "앞으로"];
      ro.set(`<div><span class="a">${s.lab}</span> · 숫자 ${n}개 = ${n}차원 → ${["선 위의", "평면 위의", "공간 속의"][n - 1]} 점</div><div class="dim">${P0.slice(0, n).map((x, k) => `${k + 1}번 칸: ${dirs[k]} ${fmt(x, 2)}`).join(" · ")}</div>`);
    }

    let chain = Promise.resolve(), nowI = -1;
    function run(i, animate) {
      chain = chain.then(async () => {
        const s = steps[i], same = i === nowI; cur = s; nowI = i;
        if (pick) { pick.el.style.display = i === steps.length - 1 ? "" : "none"; pick.set(freeQ); }
        say(s);
        const v = VIEW[s.view], to = target(s), view = { yaw: v.yaw, pitch: v.pitch, dist: v.dist * (nar ? v.nar || 1.3 : 1), ty: 0 };
        if (!animate) { Object.assign(st, to); Object.assign(S.view, view); apply(); return; }
        // 검색어가 처음 나올 땐 그 자리에서 커지고, 선은 그다음에 그려요
        if (to.q && st.q < 0.01) { st.qx = to.qx; st.qy = to.qy; st.qz = to.qz; }
        const ln = to.ln; if (to.q && st.ln < 0.01) to.ln = 0;
        // 같은 단계에서 검색어만 바꾸면 돌려 둔 시점은 그대로 둬요
        await Promise.all([tween(st, to, 900, apply), same ? null : S.tweenView(view, 900)]);
        if (ln && st.ln < ln) await tween(st, { ln }, 700, apply);
        apply();
      });
      return chain;
    }
    S.onTheme(() => { readCols(); for (const [m, name] of mats) m.color = col[name]; apply(); });
    return {
      go: (i, animate) => run(i, animate),
      destroy() { S.destroy(); },
    };
  },
};

// 그림: 온톨로지 층 — 흩어진 데이터 원천 위에 '객체' 층을 깔고, 그 위에서 앱 · AI · 사람이 일해요 (3D · 끌어서 돌려 봐요)
//   아래 판: ERP · EMR · 센서 · 엑셀 · API (상자). 가운데 판: 온톨로지 객체(환자 · 의사 · 진료 · 약 · 병상)와 링크.
//   위 판: 병상 대시보드 · AI 에이전트 · 간호사/의사. 단계마다 원천 → 객체(매핑), 객체 → 앱(사용) 선이 올라가요.
//   층이 쌓인 구조가 핵심이라 3D 예요. WebGL 이 안 되면 같은 내용을 평면(세 띠)으로 그려요.
import { scene3d } from "./three-kit.js";
import { svg, g, el, text, rect, anim, readout, C } from "./kit.js";

const GAP = 2.3;
const SRC = [["ERP", -2.3, -1.2], ["EMR", -0.2, -1.7], ["센서", 2.3, -0.9], ["엑셀", -1.6, 1.5], ["API", 1.4, 1.6]];
const OBJ = [["환자", -1.3, -0.4], ["의사", -1.8, 1.3], ["진료", 0.4, -1.0], ["약", 1.6, 0.1], ["병상", 0.6, 1.4]];
const APP = [["병상 대시보드", -1.7, 0.2], ["AI 에이전트", 0.9, -0.9], ["간호사 · 의사", 1.4, 1.3]];
const LINK = [["의사", "진료"], ["진료", "환자"], ["진료", "약"], ["환자", "병상"]];
const MAP = [["EMR", "환자"], ["EMR", "진료"], ["ERP", "의사"], ["ERP", "약"], ["API", "약"], ["센서", "병상"], ["엑셀", "병상"]];
const USE = [["병상", "병상 대시보드"], ["환자", "병상 대시보드"], ["환자", "AI 에이전트"], ["약", "AI 에이전트"], ["진료", "AI 에이전트"], ["병상", "AI 에이전트"], ["환자", "간호사 · 의사"], ["병상", "간호사 · 의사"]];
const HOT = { map: ["센서", "병상"], use: ["병상", "AI 에이전트"] };
const STEPS = [
  "아래 판: 병원 데이터는 흩어져 있어요. ERP(인사 · 구매), EMR(진료 기록), 센서(병상), 엑셀, 외부 API — 형식도 이름도 제각각이에요.",
  "가운데 판: 온톨로지 층. 현실의 '것'(환자 · 의사 · 진료 · 약 · 병상)을 객체로 정하고, 그 사이를 이름 붙은 링크로 이어요.",
  "원천에서 객체로 선이 올라가요(매핑). EMR 의 행은 환자 · 진료 객체가 되고, 센서 · 엑셀은 병상 객체 하나로 모여요.",
  "위 판: 앱 · AI 에이전트 · 사람은 표가 아니라 객체를 보고 일해요. 같은 '병상' 객체를 대시보드도, AI 도, 간호사도 같이 써요.",
  "한 길만 따라가 봐요: 센서 → 병상 → AI 에이전트. AI 가 '빈 병상?'을 물으면 센서 표 열 이름을 몰라도 병상 객체로 답해요. 원천이 바뀌어도 위는 그대로예요.",
];
const READ = [
  `<div>원천 <b>5개</b> — <span class="dim">앱마다 이 표들을 각자 이어 붙이면 연결이 앱 수 × 원천 수만큼 늘어요</span></div>`,
  `<div>객체 <b>5개</b> · 링크 <b>4개</b> — <span class="dim">병원이 쓰는 말(명사)과 관계를 한 번만 정해요</span></div>`,
  `<div>매핑 선 <b>${MAP.length}개</b> — <span class="dim">원천 → 객체 연결은 한 곳(온톨로지)에서만 관리해요</span></div>`,
  `<div>사용 선 <b>${USE.length}개</b> — <span class="dim">위쪽은 객체만 알면 돼요 (원천을 몰라도)</span></div>`,
  `<div><span class="b">센서 → 병상 → AI 에이전트</span> — <span class="dim">원천을 바꿔도 매핑만 고치면 앱 · AI 는 그대로예요</span></div>`,
];

export default {
  aspect: 0.66,
  aspectNarrow: 1.2,
  steps: STEPS,
  hint: "끌어서 돌려 보세요",
  async mount(stage, f) {
    const ro = readout(f.controls());
    let S = null;
    try { S = await scene3d(stage, { yaw: -0.5, pitch: 0.42, dist: f.narrow ? 13 : 12, ty: GAP, label: "데이터 원천 · 온톨로지 · 앱 세 층 — 끌거나 화살표 키로 돌려요" }); }
    catch (e) { stage.querySelector(".fg-3d")?.remove(); return flat(stage, f, ro); }
    const T = S.THREE, root = S.root, col = {};
    const paint = () => { for (const [k, v] of Object.entries({ ink: "--fg-ink", sub: "--fg-sub", line: "--fg-line", soft: "--fg-soft", grid: "--fg-grid", a: "--fg-a", b: "--fg-b", c: "--fg-c", d: "--fg-d", mute: "--fg-mute" })) col[k] = S.color(v); };
    paint();
    const pos = {};
    const planes = [0, 1, 2].map((l) => {
      const grp = new T.Group(); root.add(grp);
      const geo = new T.PlaneGeometry(6.4, 4.8);
      const pl = new T.Mesh(geo, new T.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, side: T.DoubleSide })); pl.rotation.x = -Math.PI / 2; pl.position.y = l * GAP - 0.01; grp.add(pl);
      const ed = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({})); ed.rotation.x = -Math.PI / 2; ed.position.y = l * GAP - 0.01; grp.add(ed);
      const tag = S.label((f.narrow ? ["원천", "온톨로지", "앱 · AI"] : ["데이터 원천", "온톨로지 층 (객체 · 링크)", "앱 · AI · 사람"])[l], "sub"); tag.set(-3.2, l * GAP + 0.05, -2.4);
      return { grp, pl, ed, tag };
    });
    const mk = (list, l, kind) => list.map(([n, x, z]) => {
      const geo = kind === "obj" ? new T.SphereGeometry(0.2, 18, 12) : new T.BoxGeometry(kind === "src" ? 0.62 : 0.5, kind === "src" ? 0.3 : 0.24, kind === "src" ? 0.42 : 0.5);
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ transparent: true }));
      const y = l * GAP + (kind === "obj" ? 0.2 : kind === "src" ? 0.15 : 0.12);
      m.position.set(x, y, z); planes[l].grp.add(m);
      pos[n] = new T.Vector3(x, y, z);
      const tag = S.label(n, kind === "obj" ? "a" : kind === "app" ? "c" : ""); tag.set(x, y + 0.42, z);
      return { n, m, tag, kind };
    });
    const nodes = [...mk(SRC, 0, "src"), ...mk(OBJ, 1, "obj"), ...mk(APP, 2, "app")];
    const seg = (pairs) => {
      const p = []; pairs.forEach(([a, b]) => { p.push(pos[a].x, pos[a].y, pos[a].z, pos[b].x, pos[b].y, pos[b].z); });
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
      const ls = new T.LineSegments(geo, new T.LineBasicMaterial({ transparent: true })); root.add(ls); return ls;
    };
    const links = seg(LINK), maps = seg(MAP.filter((p) => p.join() !== HOT.map.join())), uses = seg(USE.filter((p) => p.join() !== HOT.use.join()));
    const hotMap = seg([HOT.map]), hotUse = seg([HOT.use]);
    // 굵은 길 (마지막 단계): 가는 원기둥
    const cyl = (a, b) => { const len = a.distanceTo(b), m = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, len, 8), new T.MeshBasicMaterial({})); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()); root.add(m); return m; };
    const hotPath = [cyl(pos[HOT.map[0]], pos[HOT.map[1]]), cyl(pos[HOT.use[0]], pos[HOT.use[1]])];
    let stepNow = 0;
    function apply(i, k = 1) {
      // k: 이번 단계에 새로 나타나는 것의 비율 (0 → 1)
      planes.forEach((P, l) => { P.pl.material.color = col.soft; P.ed.material.color = col.line; });
      planes[1].grp.visible = i >= 1; planes[1].tag.show(i >= 1);
      planes[2].grp.visible = i >= 3; planes[2].tag.show(i >= 3);
      const focus = i === 4, inPath = (n) => n === "센서" || n === "병상" || n === "AI 에이전트";
      for (const nd of nodes) {
        const lv = nd.kind === "src" ? 0 : nd.kind === "obj" ? 1 : 2;
        const on = lv === 0 || (lv === 1 && i >= 1) || (lv === 2 && i >= 3);
        nd.tag.show(on && (!focus || inPath(nd.n) || nd.kind !== "src"));
        nd.m.material.color = nd.kind === "obj" ? col.a : nd.kind === "app" ? col.c : col.sub;
        const fresh = (lv === 1 && i === 1) || (lv === 2 && i === 3);
        nd.m.material.opacity = (focus && !inPath(nd.n) ? 0.25 : 1) * (fresh ? k : 1);
        nd.tag.el.style.opacity = String((focus && !inPath(nd.n) ? 0.4 : 1) * (fresh ? k : 1));
      }
      links.visible = i >= 1; links.material.color = col.ink; links.material.opacity = (focus ? 0.25 : 0.9) * (i === 1 ? k : 1);
      maps.visible = hotMap.visible = i >= 2; maps.material.color = hotMap.material.color = col.mute;
      maps.material.opacity = (focus ? 0.15 : 0.85) * (i === 2 ? k : 1); hotMap.material.opacity = 0.85 * (i === 2 ? k : 1);
      uses.visible = hotUse.visible = i >= 3; uses.material.color = hotUse.material.color = col.c;
      uses.material.opacity = (focus ? 0.15 : 0.85) * (i === 3 ? k : 1); hotUse.material.opacity = 0.85 * (i === 3 ? k : 1);
      hotPath.forEach((m) => { m.visible = focus; m.material.color = col.b; });
      S.render();
    }
    S.onTheme(() => { paint(); apply(stepNow); });
    return {
      async go(i, animate) {
        stepNow = i;
        const v = i === 0 ? { pitch: 0.75, ty: 0, dist: f.narrow ? 10.5 : 10 } : i <= 2 ? { pitch: 0.45, ty: GAP * 0.5, dist: f.narrow ? 12 : 11.5 } : { pitch: 0.32, ty: GAP, dist: f.narrow ? 13.5 : 13 };
        ro.set(READ[i]);
        if (!animate) { await S.tweenView(v, 0); apply(i); return; }
        apply(i, 0);
        await Promise.all([S.tweenView(v, 700), anim(700, (t) => apply(i, t))]);
      },
      destroy() { S.destroy(); },
    };
  },
};

// WebGL 이 없을 때: 같은 세 층을 평면 띠로
function flat(stage, f, ro) {
  const nar = !!f.narrow, W = nar ? 380 : 640, H = nar ? 400 : 400;
  const s = svg(stage, W, H, "데이터 원천 · 온톨로지 · 앱 세 층 (평면 그림)");
  const root = g(s), band = [H - 70, H / 2, 70];
  function draw(i) {
    root.replaceChildren();
    const P = {};
    const row = (list, l) => [...list].sort((a, b) => a[1] - b[1]).forEach(([n], k) => (P[n] = [W * (k + 0.5) / list.length, band[l]])); // 왼쪽→오른쪽 순서만 지키고 고르게
    row(SRC, 0); row(OBJ, 1); row(APP, 2);
    ["데이터 원천", "온톨로지 층", "앱 · AI · 사람"].forEach((t, l) => {
      if ((l === 1 && i < 1) || (l === 2 && i < 3)) return;
      rect(root, 8, band[l] - 34, W - 16, 68, { r: 10, fill: C.soft, stroke: C.grid, sw: 1 });
      text(root, 16, band[l] - 22, t, { size: 12, weight: 700, fill: C.sub });
    });
    const ln = (a, b, color, w = 1.4) => el(root, "line", { x1: P[a][0], y1: P[a][1], x2: P[b][0], y2: P[b][1], stroke: color, "stroke-width": w });
    if (i >= 1) LINK.forEach(([a, b]) => ln(a, b, C.ink));
    if (i >= 2) MAP.forEach(([a, b]) => ln(a, b, i === 4 && [a, b].join() === HOT.map.join() ? C.b : C.mute, i === 4 && [a, b].join() === HOT.map.join() ? 3 : 1.2));
    if (i >= 3) USE.forEach(([a, b]) => ln(a, b, i === 4 && [a, b].join() === HOT.use.join() ? C.b : C.c, i === 4 && [a, b].join() === HOT.use.join() ? 3 : 1.2));
    const lab = (n, l, fill, stroke) => { const w = [...n].length * 13 + 14; rect(root, P[n][0] - w / 2, P[n][1] - 12, w, 24, { r: l === 1 ? 12 : 4, fill, stroke, sw: 1.4 }); text(root, P[n][0], P[n][1], n, { size: 12.5, anchor: "middle", weight: 700 }); };
    SRC.forEach(([n]) => lab(n, 0, C.bg, C.line));
    if (i >= 1) OBJ.forEach(([n]) => lab(n, 1, C.aSoft, C.a));
    if (i >= 3) APP.forEach(([n]) => lab(n, 2, C.cSoft, C.c));
  }
  return { go(i, animate) { ro.set(READ[i]); draw(i); if (animate) { root.style.opacity = "0"; return anim(350, (t) => (root.style.opacity = String(t))).then(() => (root.style.opacity = "")); } } };
}

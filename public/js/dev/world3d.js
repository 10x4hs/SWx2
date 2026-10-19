// SW 공간의 3D 세계 — 화면을 옮겨도 하나만 깔려 있고 모드만 바꿔요 (activetheory.net/work 처럼). 화면 뒤 칸(.sw-bg)에 붙어요.
//   courses: 과정마다 큰 유리 판 + 판 안에 떠 있는 추상 3D 엠블럼 (V&G = 점구름 + 그래프 선 · Dev Flow = 흐르는 ∞ 고리)
//   modules: 그 과정의 모듈 유리 패널이 입자 이중나선 둘레를 나선으로 돌아요 — 스크롤하면 카메라가 내려가요
//   inside : 책 안쪽 — 패널은 사라지고, 어둡고 느린 나선만 읽는 유리 화면 뒤에서 흘러요
//   dive() : 앞의 판 속으로 다가가며 어두워져요 → 다음 화면은 그 안에서 시작해 뒤로 물러나며 밝아져요 (들어간 느낌)
//   createWorld(root, { scroller }) → { show(kind, items, opts), inside(opts), dive(), goTo(i), reveal(), destroy() } | null (WebGL 없음)
let threeP = null;
export function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!threeP) threeP = new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = "/vendor/three.min.js"; s.async = true;
    s.onload = () => (window.THREE ? ok(window.THREE) : no(new Error("three"))); s.onerror = () => { threeP = null; no(new Error("three")); };
    document.head.appendChild(s);
  });
  return threeP;
}
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
// 판 배치: 반지름 · 판 사이 각도 · 판 사이 높이 · 판 크기
export const LAYOUT = { courses: { R: 7.4, A: 1.3, Y: 4.8, W: 5.6, H: 3.5, zoom: 17.5, offX: -2.1 }, modules: { R: 6.6, A: 0.82, Y: 3.1, W: 4.3, H: 2.7, zoom: 15.2, offX: -0.6 } };
// 과정 색: 입자 세 가지 + 판 색 두 가지
export const PALETTE = {
  home: ["#ff5fd2", "#9b7bff", "#46e0d0"],
  vg: ["#46e0d0", "#7b6bff", "#9fe9ff"],
  dev: ["#ff5fa8", "#ffb24b", "#b9a6ff"],
};

const PV = `attribute vec4 seed; attribute float pal; uniform float uTime, uPix, uSize, uDim; uniform vec3 uP0, uP1, uP2; varying vec3 vC; varying float vA;
void main() { vec3 p = position; float a = uTime * 0.12 * (0.6 + seed.x * 0.8); float c = cos(a), s = sin(a);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p += vec3(sin(uTime * 0.4 + seed.y * 30.0), cos(uTime * 0.33 + seed.z * 30.0), sin(uTime * 0.27 + seed.w * 30.0)) * 0.12;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.3 + seed.x * 0.9) * uPix / -mv.z;
  vC = pal < 0.5 ? uP0 : pal < 1.5 ? uP1 : pal < 2.5 ? uP2 : vec3(1.0); vA = (0.35 + 0.65 * seed.y) * uDim; }`;
const PF = `varying vec3 vC; varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (0.55 + a * 0.6), a * vA * 0.9); }`;
// 엠블럼 입자 (판 안): 흐르는 고리는 셰이더가 t 를 돌려요
const EV = `attribute vec4 seed; uniform float uTime, uPix, uSize, uFlow, uOp; uniform vec3 uA, uB; varying vec3 vC; varying float vA;
void main() { vec3 p = position;
  if (uFlow > 0.5) { float t = seed.x * 6.2831 + uTime * (0.25 + seed.y * 0.2); float s = sin(t), q = 1.0 + s * s; p = vec3(1.9 * cos(t) / q, 1.9 * s * cos(t) / q, sin(t * 2.0) * 0.35) + (seed.yzw - 0.5) * 0.18; }
  else p += vec3(sin(uTime * 0.6 + seed.y * 20.0), cos(uTime * 0.5 + seed.z * 20.0), sin(uTime * 0.4 + seed.w * 20.0)) * 0.04;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.4 + seed.x) * uPix / -mv.z; vC = mix(uA, uB, seed.z); vA = (0.45 + 0.55 * seed.w) * uOp; }`;
const EF = `varying vec3 vC; varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (0.7 + a), a * vA); }`;
const GV = `varying vec2 vUv; varying vec3 vN, vV; void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// 유리 판: 둥근 모서리 · 빛나는 테두리 · 비스듬한 반사광 · 프레넬 · (커서) 색 갈라짐. uHas = 0 이면 그림 없이 맑은 유리
const GF = (W, H) => `uniform sampler2D map; uniform float uTime, uHover, uActive, uOp, uBack, uHas; uniform vec3 uTint, uTint2; varying vec2 vUv; varying vec3 vN, vV;
float sdR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() { vec2 p = (vUv - 0.5) * vec2(${W.toFixed(2)}, ${H.toFixed(2)}); float d = sdR(p, vec2(${(W / 2).toFixed(2)}, ${(H / 2).toFixed(2)}), 0.28); if (d > 0.0) discard;
  float rim = smoothstep(-0.07, 0.0, d), fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  if (uBack > 0.5) { gl_FragColor = vec4(mix(uTint, uTint2, vUv.x) * 0.07 + rim * uTint * 0.4, (0.22 + rim * 0.35) * uOp); return; }
  float sheen = smoothstep(0.18, 0.0, abs(vUv.x * 0.8 + vUv.y - 1.05 - sin(uTime * 0.25) * 0.35)) * 0.16;
  vec3 c; float a;
  if (uHas > 0.5) {
    float band = 0.5 * step(0.96, fract(sin(floor(uTime * 9.0) * 12.9898 + floor(vUv.y * 24.0)) * 43758.5)) * uHover;
    vec2 uv = vUv + vec2(sin(vUv.y * 60.0 + uTime * 10.0) * 0.0025 * uHover + band * 0.03, 0.0);
    float g = 0.0012 + uHover * 0.005; vec4 tx = texture2D(map, uv);
    c = vec3(texture2D(map, uv + vec2(g, 0.0)).r, tx.g, texture2D(map, uv - vec2(g, 0.0)).b);
    c = c * (0.72 + uActive * 0.28) + uTint * 0.08; a = 0.28 + tx.a * 0.62;
  } else { c = mix(uTint, uTint2, vUv.x + vUv.y * 0.3) * (0.06 + uActive * 0.05); a = 0.1 + uActive * 0.06 + uHover * 0.05; }
  c += rim * vec3(0.85, 0.92, 1.0) * (0.55 + uActive * 0.45) + fr * uTint * 0.5 + sheen;
  gl_FragColor = vec4(c, (a + rim * 0.28) * uOp); }`;
const QV = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT = `uniform sampler2D t; varying vec2 vUv; void main() { vec3 c = texture2D(t, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(c * smoothstep(0.45, 0.95, l), 1.0); }`;
const BLUR = `uniform sampler2D t; uniform vec2 uDir; varying vec2 vUv; void main() { vec3 c = texture2D(t, vUv).rgb * 0.227;
  c += (texture2D(t, vUv + uDir * 1.385).rgb + texture2D(t, vUv - uDir * 1.385).rgb) * 0.316; c += (texture2D(t, vUv + uDir * 3.231).rgb + texture2D(t, vUv - uDir * 3.231).rgb) * 0.07; gl_FragColor = vec4(c, 1.0); }`;
const COMP = `uniform sampler2D tScene, tBloom; uniform vec2 uRes; uniform float uTime, uFade, uCA; uniform vec3 uHazeA, uHazeB; varying vec2 vUv;
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() { vec2 uv = vUv, d = uv - 0.5; float r = length(d); vec2 off = d * uCA * r;
  vec3 c = vec3(texture2D(tScene, uv + off).r, texture2D(tScene, uv).g, texture2D(tScene, uv - off).b) + texture2D(tBloom, uv).rgb * 0.9;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  c += uHazeA * smoothstep(0.9, 0.0, length((uv - vec2(0.0, 0.05)) * asp)) * 0.32;
  c += uHazeB * smoothstep(0.85, 0.0, length((uv - vec2(1.0, 1.0)) * asp)) * 0.22;
  c *= mix(1.0, smoothstep(0.95, 0.25, r), 0.75);
  c = 1.0 - exp(-c * 1.15);
  c += (rnd(uv * uRes + fract(uTime) * 91.7) - 0.5) * 0.035;
  gl_FragColor = vec4(c * uFade, 1.0); }`;

// 모듈 판 그림: 큰 번호 + 짧은 영어 이름 + 과정 라벨만 (긴 글은 화면 글자로 따로 보여요)
function paintModule(it, W = 1024, H = 640) {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d"), [a, b] = it.tint;
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "rgba(7,11,22,.35)"); bg.addColorStop(1, "rgba(13,18,34,.55)"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let sd = (it.no * 9301 + it.label.length * 49297) % 233280; const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < 6; k++) { const x = rnd() * W, y = rnd() * H, r = 140 + rnd() * 260, rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, (k % 2 ? a : b) + "77"); rg.addColorStop(1, "transparent"); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
  g.globalAlpha = 0.06; g.strokeStyle = "#fff";
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.globalAlpha = 1;
  const mono = (sz) => `${sz}px "Share Tech Mono", "Geist Mono", ui-monospace, monospace`;
  g.textBaseline = "top"; g.fillStyle = "rgba(235,240,255,.62)"; g.font = mono(26); g.fillText(it.label.toUpperCase(), 60, 54);
  g.textAlign = "right"; g.fillText(`${String(it.no).padStart(2, "0")} / ${String(it.of).padStart(2, "0")}`, W - 60, 54); g.textAlign = "left";
  g.font = mono(150); g.fillStyle = "rgba(244,247,255,.92)"; g.shadowColor = a; g.shadowBlur = 30; g.fillText(String(it.no).padStart(2, "0"), 56, H / 2 - 120);
  let size = 72; g.font = mono(size); while (g.measureText(it.title).width > W - 120 && size > 40) { size -= 4; g.font = mono(size); }
  g.shadowBlur = 18; g.fillText(it.title, 60, H - 90 - size); g.shadowBlur = 0;
  return cv;
}

export async function createWorld(root, { scroller }) {
  let THREE; try { THREE = await loadThree(); } catch { return null; }
  if (!root.isConnected) return null;
  const canvas = document.createElement("canvas"); canvas.className = "sw-canvas"; canvas.setAttribute("aria-hidden", "true"); root.prepend(canvas);
  let Rn; try { Rn = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" }); } catch { canvas.remove(); return null; }
  const phone = matchMedia("(max-width: 720px)").matches, dpr = Math.min(phone ? 1.4 : 1.6, devicePixelRatio || 1);
  Rn.setPixelRatio(1); Rn.setClearColor(0x05070f, 1);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(phone ? 50 : 38, 1, 0.1, 220);
  const L = (x, y, k) => x + (y - x) * k, col = (h) => new THREE.Color(h), ease = (k, dt) => (REDUCED ? 1 : 1 - Math.pow(k, dt));

  // ---------- 기둥: 입자 이중나선 + 가로대 + 둘레 먼지 (모든 모드가 같이 써요)
  const NP = phone ? 16000 : 32000, top = 10, bottom = -130, HH = top - bottom;
  const pos = new Float32Array(NP * 3), pal = new Float32Array(NP), seed = new Float32Array(NP * 4);
  for (let i = 0; i < NP; i++) {
    const k = Math.random(); let x, y, z, c;
    if (k < 0.62) { const t = Math.random(), strand = Math.random() < 0.5 ? 0 : Math.PI, ang = t * HH * 0.55 + strand, rr = 2.4 + (Math.random() - 0.5) * 1.3;
      y = top - t * HH; x = Math.cos(ang) * rr + (Math.random() - 0.5) * 0.25; z = Math.sin(ang) * rr + (Math.random() - 0.5) * 0.25; c = Math.random() < 0.15 ? 3 : (Math.floor(t * 40) + (strand ? 1 : 0)) % 3; }
    else if (k < 0.8) { const t = Math.random(), ang = t * HH * 0.55, u = Math.random() * 2 - 1; y = top - t * HH; x = Math.cos(ang) * 2.4 * u; z = Math.sin(ang) * 2.4 * u; c = 2; }
    else { const ang = Math.random() * Math.PI * 2, rr = 2.5 + Math.random() * 9; y = top - Math.random() * HH; x = Math.cos(ang) * rr; z = Math.sin(ang) * rr; c = Math.floor(Math.random() * 2); }
    pos.set([x, y, z], i * 3); pal[i] = c; seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); pg.setAttribute("pal", new THREE.BufferAttribute(pal, 1)); pg.setAttribute("seed", new THREE.BufferAttribute(seed, 4));
  const pu = { uTime: { value: 0 }, uPix: { value: dpr }, uSize: { value: phone ? 54 : 64 }, uDim: { value: 1 }, uP0: { value: col(PALETTE.home[0]) }, uP1: { value: col(PALETTE.home[1]) }, uP2: { value: col(PALETTE.home[2]) } };
  const helix = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: pu, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  helix.frustumCulled = false; scene.add(helix);
  const tint = { a: col(PALETTE.home[0]), b: col(PALETTE.home[1]), c: col(PALETTE.home[2]) };
  const setTint = (k) => { const p = PALETTE[k] || PALETTE.home; tint.a = col(p[0]); tint.b = col(p[1]); tint.c = col(p[2]); };

  // ---------- 판 묶음 (courses · modules). 바뀔 때 옛 묶음은 흐려지며 사라지고 새 묶음이 나타나요
  const world = new THREE.Group(); scene.add(world);
  let set = null, old = null;
  function emblem(kind, a, b) {
    const n = kind === "loop" ? 900 : 700, P = new Float32Array(n * 3), S = new Float32Array(n * 4);
    const centers = Array.from({ length: 5 }, () => new THREE.Vector3((Math.random() - 0.5) * 3.0, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.0));
    for (let i = 0; i < n; i++) {
      const c = centers[i % 5], gx = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.45;
      P.set(kind === "loop" ? [0, 0, 0] : [c.x + gx(), c.y + gx() * 0.8, c.z + gx() * 0.7], i * 3); S.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("seed", new THREE.BufferAttribute(S, 4));
    const u = { uTime: { value: 0 }, uPix: { value: dpr }, uSize: { value: phone ? 34 : 40 }, uFlow: { value: kind === "loop" ? 1 : 0 }, uOp: { value: 1 }, uA: { value: col(a) }, uB: { value: col(b) } };
    const grp = new THREE.Group(), pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: EV, fragmentShader: EF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; grp.add(pts);
    if (kind !== "loop") { // 그래프 선: 점 몇 개를 가장 가까운 둘과 이어요
      const L2 = [];
      for (let i = 0; i < 110; i++) { const a0 = (i * 37) % n, p0 = new THREE.Vector3().fromArray(P, a0 * 3), near = [];
        for (let j = 0; j < n; j++) { if (j === a0) continue; const d = p0.distanceToSquared(new THREE.Vector3().fromArray(P, j * 3)); near.push([d, j]); }
        near.sort((x, y) => x[0] - y[0]); for (const [, j] of near.slice(0, 2)) L2.push(...P.slice(a0 * 3, a0 * 3 + 3), ...P.slice(j * 3, j * 3 + 3)); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(L2), 3));
      const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: col(a), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      grp.add(lines); grp.userData.lines = lines;
    }
    grp.userData.u = u; return grp;
  }
  function makeSet(kind, items, opts) {
    const Lo = LAYOUT[kind], grp = new THREE.Group(), geo = new THREE.PlaneGeometry(Lo.W, Lo.H, 1, 1), frag = GF(Lo.W, Lo.H);
    const panels = items.map((it, i) => {
      const tex = kind === "modules" ? new THREE.CanvasTexture(paintModule(it)) : null; if (tex) { tex.anisotropy = 4; tex.minFilter = THREE.LinearFilter; }
      const mk = (back) => new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uTime: { value: 0 }, uHover: { value: 0 }, uActive: { value: 0 }, uOp: { value: 0 }, uBack: { value: back ? 1 : 0 }, uHas: { value: tex ? 1 : 0 }, uTint: { value: col(it.tint[0]) }, uTint2: { value: col(it.tint[1]) } },
        vertexShader: GV, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const g = new THREE.Group(), front = new THREE.Mesh(geo, mk(false)), back = new THREE.Mesh(geo, mk(true));
      back.position.z = kind === "courses" ? -0.7 : -0.16; back.scale.set(1.02, 1.03, 1); g.add(back, front);
      let em = null; if (kind === "courses") { em = emblem(it.emblem, it.tint[0], it.tint[1]); em.position.z = -0.35; g.add(em); }
      const a = i * Lo.A; g.position.set(Math.sin(a) * Lo.R, -i * Lo.Y, Math.cos(a) * Lo.R); g.rotation.y = a;
      g.userData = { i, a, front, back, em, hover: 0, active: 0, tilt: (i % 2 ? -1 : 1) * 0.05 }; front.userData.i = i;
      grp.add(g); return g;
    });
    world.add(grp);
    // 글꼴이 늦게 오면 판 그림을 한 번 더 그려요 (처음엔 대체 글꼴로 그려졌을 수 있어서)
    if (kind === "modules" && document.fonts && !document.fonts.check('48px "Share Tech Mono"')) document.fonts.load('48px "Share Tech Mono"').then(() => { panels.forEach((g, i) => { const tx = g.userData.front.material.uniforms.map.value; if (tx) { tx.image = paintModule(items[i]); tx.needsUpdate = true; } }); }).catch(() => {});
    return { kind, Lo, grp, panels, items, op: 0, opTo: 1, ...opts };
  }
  function dropSet(s) { if (!s) return; s.opTo = 0; s.dying = true; old?.dying && disposeSet(old); old = s; }
  function disposeSet(s) { world.remove(s.grp); s.grp.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.uniforms?.map?.value?.dispose(); o.material.dispose(); } }); if (old === s) old = null; }

  // ---------- 후처리
  const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  const rtS = rt(4, 4), rtA = rt(4, 4), rtB = rt(4, 4);
  const post = new THREE.Scene(), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); post.add(quad);
  const mBright = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: QV, fragmentShader: BRIGHT });
  const mBlur = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: QV, fragmentShader: BLUR });
  const cU = { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uFade: { value: REDUCED ? 1 : 0 }, uCA: { value: 0.002 }, uHazeA: { value: col("#6b38bf") }, uHazeB: { value: col("#1a737f") } };
  const mComp = new THREE.ShaderMaterial({ uniforms: cU, vertexShader: QV, fragmentShader: COMP });
  const pass = (m, target) => { quad.material = m; Rn.setRenderTarget(target); Rn.render(post, ortho); };

  // ---------- 크기 · 입력 · 스크롤
  let w = 1, h = 1;
  function size() {
    const r = root.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    Rn.setSize(W, H, false); canvas.style.width = "100%"; canvas.style.height = "100%";
    cam.aspect = w / h; cam.updateProjectionMatrix();
    rtS.setSize(W, H); rtA.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2)); rtB.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2)); cU.uRes.value.set(W, H);
    if (REDUCED) frame();
  }
  const ro = new ResizeObserver(size); ro.observe(root);
  const trackTop = (tr) => tr.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const progressNow = () => { const tr = set?.track; if (!tr || !tr.isConnected) return set ? set.prog || 0 : 0; const max = Math.max(1, tr.offsetHeight - scroller.clientHeight); return Math.max(0, Math.min(1, (scroller.scrollTop - trackTop(tr)) / max)) * (set.items.length - 1); };
  let prog = 0, progTo = 0, active = -1, mode = "inside", pageY = 0;
  const onScroll = () => { if (mode === "inside") pageY = scroller.scrollTop; else progTo = progressNow(); if (REDUCED) { prog = progTo; frame(); } };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, in: false }, ray = new THREE.Raycaster(), mv = new THREE.Vector2();
  let hovered = -1;
  const pick = () => { if (!mouse.in || !set || mode === "inside" || set.op < 0.6) return -1; mv.set(mouse.x, mouse.y); ray.setFromCamera(mv, cam); const hit = ray.intersectObjects(set.panels.map((g) => g.userData.front))[0]; return hit ? hit.object.userData.i : -1; };
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect(); mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    // 위에 화면 글자(버튼 · 카드)가 있으면 3D 를 고르지 않아요
    const top = document.elementFromPoint(e.clientX, e.clientY);
    mouse.in = e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right && !top?.closest?.("a, button, input, textarea, .sw-ui");
    if (REDUCED) { hovered = pick(); root.classList.toggle("sw-hot", hovered >= 0); }
  };
  const onClick = (e) => { if (mode === "inside" || !set) return; const top = document.elementFromPoint(e.clientX, e.clientY); if (top?.closest?.("a, button, input, textarea, .sw-ui")) return; onMove(e); const i = pick(); if (i >= 0) set.onPick?.(set.items[i], i); };
  window.addEventListener("pointermove", onMove, { passive: true }); window.addEventListener("click", onClick);

  // ---------- 그리기
  let raf = 0, last = performance.now(), t = 0, alive = true, camY = 0, camZ = 40, camX = 0, fade = 1, fadeTo = 1, dive = 0, diveTo = 0, revealed = REDUCED;
  function frame(now) {
    now = now || performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const Lo = set ? set.Lo : LAYOUT.modules;
    if (mode !== "inside") prog = L(prog, progTo, ease(0.02, dt));
    mouse.sx = L(mouse.sx, mouse.in ? mouse.x : mouse.sx * 0.98, ease(0.2, dt)); mouse.sy = L(mouse.sy, mouse.in ? mouse.y : mouse.sy * 0.98, ease(0.2, dt));
    pu.uTime.value = REDUCED ? 0 : t; cU.uTime.value = t;
    pu.uP0.value.lerp(tint.a, ease(0.1, dt)); pu.uP1.value.lerp(tint.b, ease(0.1, dt)); pu.uP2.value.lerp(tint.c, ease(0.1, dt));
    pu.uDim.value = L(pu.uDim.value, mode === "inside" ? 0.55 : 1, ease(0.1, dt));
    dive = L(dive, diveTo, ease(dive < diveTo ? 0.0005 : 0.06, dt));
    fade = L(fade, revealed ? fadeTo * (1 - dive * 0.6) : 0, ease(0.05, dt)); cU.uFade.value = fade;
    cU.uCA.value = 0.002 + dive * 0.012;
    // 카메라: 고른 판이 앞으로 오게 기둥을 돌리고, 그 높이로 내려가요. 안쪽에선 천천히 떠다녀요
    const zoom = (mode === "inside" ? 12 : Lo.zoom) + (phone ? 2.5 : 0), offX = mode === "inside" ? Math.sin(t * 0.05) * 1.2 : phone ? 0 : Lo.offX;
    if (mode !== "inside") camY = L(camY, -prog * Lo.Y + 0.25, ease(0.03, dt));
    world.rotation.y = -prog * Lo.A; helix.rotation.y = -prog * Lo.A * 0.6 + (mode === "inside" ? t * 0.02 + pageY * 0.0006 : 0);
    const zTo = L(zoom, Lo.R + 0.9, dive);
    camZ = L(camZ, zTo, ease(dive > 0.01 ? 0.003 : 0.02, dt)); camX = L(camX, offX, ease(0.03, dt));
    const yIn = mode === "inside" ? -pageY * 0.0025 : phone ? (mode === "courses" ? -2.2 : -1.5) : 0; // 폰: 판을 화면 위쪽으로 (아래 글자 칸과 겹치지 않게)
    cam.position.set(camX + mouse.sx * 0.9 * (1 - dive), camY + yIn + mouse.sy * 0.45 * (1 - dive), camZ);
    cam.lookAt(camX, camY + yIn - 0.1, 0);
    // 판 묶음
    for (const s of [old, set]) {
      if (!s) continue;
      s.op = L(s.op, s.opTo * (mode === "inside" && s === set ? 0 : 1), ease(s.dying ? 0.004 : 0.01, dt));
      if (s.dying && s.op < 0.01) { disposeSet(s); continue; }
      const ai = Math.round(prog);
      if (s === set && mode !== "inside" && ai !== active) { active = ai; s.onActive?.(s.items[ai], ai); }
      for (const g of s.panels) {
        const u = g.userData, f = u.front.material.uniforms, b = u.back.material.uniforms;
        u.hover = L(u.hover, s === set && u.i === hovered ? 1 : 0, ease(0.004, dt)); u.active = L(u.active, s === set && u.i === active ? 1 : 0, ease(0.01, dt));
        const dist = Math.abs(u.i - prog), op = Math.max(0.1, 1 - Math.max(0, dist - 1.2) * 0.35) * s.op;
        f.uTime.value = t; f.uHover.value = u.hover; f.uActive.value = u.active; f.uOp.value = op; b.uOp.value = op;
        if (u.em) { u.em.userData.u.uTime.value = t; u.em.userData.u.uOp.value = op; if (u.em.userData.lines) u.em.userData.lines.material.opacity = 0.35 * op; u.em.rotation.y = REDUCED ? 0.4 : Math.sin(t * 0.3 + u.i) * 0.5 + mouse.sx * 0.3 * u.hover; u.em.rotation.x = mouse.sy * -0.15 * u.hover; }
        g.scale.setScalar((0.86 + u.active * 0.14 + u.hover * 0.03) * (s.dying ? 1 + (1 - s.op) * 0.25 : 1));
        g.rotation.x = u.tilt + (u.i === hovered ? -mouse.sy * 0.18 : 0) * u.hover + (REDUCED ? 0 : Math.sin(t * 0.5 + u.i) * 0.015);
        g.rotation.y = u.a + (u.i === hovered ? mouse.sx * 0.22 : 0) * u.hover;
        g.position.y = -u.i * s.Lo.Y + (REDUCED ? 0 : Math.sin(t * 0.6 + u.i * 1.7) * 0.06);
      }
    }
    if (!REDUCED) { const hv = pick(); if (hv !== hovered) { hovered = hv; root.classList.toggle("sw-hot", hovered >= 0); } }
    Rn.setRenderTarget(rtS); Rn.render(scene, cam);
    mBright.uniforms.t.value = rtS.texture; pass(mBright, rtA);
    for (let i = 0; i < 2; i++) { mBlur.uniforms.t.value = rtA.texture; mBlur.uniforms.uDir.value.set(1.4 / rtA.width, 0); pass(mBlur, rtB); mBlur.uniforms.t.value = rtB.texture; mBlur.uniforms.uDir.value.set(0, 1.4 / rtA.height); pass(mBlur, rtA); }
    cU.tScene.value = rtS.texture; cU.tBloom.value = rtA.texture; pass(mComp, null);
    if (alive && !REDUCED && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const vis = () => { if (!document.hidden && alive && !REDUCED) { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", vis);
  size(); if (REDUCED) frame(); else raf = requestAnimationFrame(frame);
  canvas.__panels = () => (set && mode !== "inside" ? set.panels.length : 0);

  return {
    // 판 묶음 보이기: kind = "courses" | "modules" · items · { track, onPick, onActive, tint, start }
    show(kind, items, opts = {}) {
      const same = set && set.kind === kind && set.items.length === items.length && set.items.every((x, i) => x.href === items[i].href);
      mode = kind; diveTo = 0; fadeTo = 1; setTint(opts.tint || "home");
      if (!same) { dropSet(set); set = makeSet(kind, items, opts); } else Object.assign(set, opts, { opTo: 1, dying: false });
      prog = progTo = Math.max(0, Math.min(items.length - 1, opts.start ?? progressNow())); active = -1;
      camY = -prog * LAYOUT[kind].Y + 0.25;
      if (REDUCED) frame();
    },
    // 책 안쪽: 판은 사라지고 나선만 어둡게 흘러요
    inside(opts = {}) { mode = "inside"; diveTo = 0; fadeTo = 0.9; setTint(opts.tint || "home"); pageY = scroller.scrollTop; if (REDUCED) frame(); },
    // 앞의 판 속으로 → 0.7초 뒤 resolve (그때 화면을 바꾸면 그 안에서 시작해요)
    dive() { if (REDUCED || mode === "inside") return Promise.resolve(); diveTo = 1; return new Promise((ok) => setTimeout(ok, 700)); },
    goTo(i) { const tr = set?.track; if (!tr) return; const n = set.items.length, max = Math.max(1, tr.offsetHeight - scroller.clientHeight); scroller.scrollTo({ top: trackTop(tr) + (Math.max(0, Math.min(n - 1, i)) / Math.max(1, n - 1)) * max, behavior: REDUCED ? "auto" : "smooth" }); },
    reveal() { revealed = true; },
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); scroller.removeEventListener("scroll", onScroll); window.removeEventListener("pointermove", onMove); window.removeEventListener("click", onClick); document.removeEventListener("visibilitychange", vis);
      [rtS, rtA, rtB].forEach((r) => r.dispose()); [mBright, mBlur, mComp].forEach((m) => m.dispose());
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.uniforms?.map?.value?.dispose(); o.material.dispose(); } }); Rn.dispose(); canvas.remove();
    },
  };
}

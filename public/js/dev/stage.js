// SW 공간의 장면 v2 — activetheory.net 을 따라 만든 WebGL(three.js r128). 화면 뒤에 하나만 깔리고, 화면을 옮겨도 모드만 바꿔요.
//   그리는 순서: 장면 → 밝은 곳만 뽑아 흐림(블룸) → 합성(색수차 · 구석 안개 빛 · 바닥 안개 · 비네트 · 필름 노이즈 · 톤 매핑)
//   장면 안: 케이블에 매달린 크롬 S 로고(진자 — 커서로 치면 흔들려요) · 모양을 바꾸는 입자(비 · 점구름 · ∞ 고리, 바뀔 때 터졌다 모여요)
//            · 바닥 먼지와 빛망울 · 커서를 따라오는 빛 꼬리와 불꽃 · (vg) 카드 160장 점구름과 이웃 5장 선
//   모드: sw(로고 + 과정 모양) · vg(카드 점구름) · dev(먼지만, 개발 흐름 홈의 고리가 위에 따로) · dim(공부 화면 뒤 — 어둡고 느리게)
//   createStage(root) → { mode(name, opts), focus(i), reveal(), destroy() } | null — WebGL 이 없으면 null (화면은 장면 없이도 다 읽혀요)
//   움직임 줄이기면 한 장만 그리고 멈춰요 (꼬리 · 진자 · 터짐 없음).
let threeP = null;
function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!threeP) threeP = new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = "/vendor/three.min.js"; s.async = true;
    s.onload = () => (window.THREE ? ok(window.THREE) : no(new Error("three"))); s.onerror = () => { threeP = null; no(new Error("three")); };
    document.head.appendChild(s);
  });
  return threeP;
}
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const MOD_COLORS = ["#7FDBFF", "#8CF5C4", "#C9F27B", "#FFD36B", "#FF9E7A", "#F58BD0", "#B79CFF", "#8FA8FF"];
// 과정마다: 입자 색 셋 · 안개 빛 색 · 안개 위치(화면 비율) · 입자 모양
const LOOK = {
  vg: { c: ["#6FE3FF", "#9BB8FF", "#E8FBFF"], fog: "#1E8C9C", fogPos: [0.0, 0.95], shape: "cloud" },
  dev: { c: ["#FFD34D", "#9BE07A", "#FFF3C4"], fog: "#8A6A12", fogPos: [1.0, 0.95], shape: "loop" },
  sw: { c: ["#C8E86B", "#5FD6C0", "#FFFFFF"], fog: "#1F7F86", fogPos: [0.0, 0.95], shape: "rain" },
};

// ---------- 셰이더
const PV = `attribute vec4 aA, aB; attribute vec4 seed; uniform float uTime, uMix, uBurst, uSize, uPix, uMouseOn, uScroll, uFlow, uWarp, uVelK; uniform vec2 uVel; uniform vec3 uMouse, uC1, uC2, uC3; uniform vec3 uMod[8];
varying vec3 vC; varying float vA;
vec3 colOf(float w) { if (w >= 1.5) { int k = int(w - 2.0 + 0.5); vec3 m = uMod[0]; for (int i = 0; i < 8; i++) if (i == k) m = uMod[i]; return m; } return mix(mix(uC1, uC2, seed.z), uC3, step(0.93, seed.x)); }
void main() {
  float e = uMix * uMix * (3.0 - 2.0 * uMix);
  vec3 p = mix(aA.xyz, aB.xyz, e);
  float fall = mix(step(0.5, aA.w) * step(aA.w, 1.5), step(0.5, aB.w) * step(aB.w, 1.5), e);
  // 비 줄기: 위에서 아래로 흘러요 (모양이 비일 때만)
  p.y = mix(p.y, mod(p.y - uTime * (0.6 + seed.y * 1.4) + 30.0, 16.0) - 6.0, fall);
  float t = uTime * 0.25;
  p += vec3(sin(t * (1.0 + seed.x * 2.0) + p.y * 0.7), cos(t * (1.0 + seed.z * 2.0) + p.x * 0.5), sin(t + seed.w * 9.0)) * 0.08 * (1.0 + 3.0 * (1.0 - step(1.5, aB.w)) * (1.0 - fall));
  // 유체: 장면 전체가 느린 소용돌이로 흘러요 (값싼 의사 컬 노이즈)
  vec3 fq = p * 0.18 + seed.xyz * 0.3; float tf = uTime * 0.18;
  p += vec3(sin(fq.y * 2.1 + tf) + sin(fq.z * 1.7 - tf * 1.3), sin(fq.z * 1.9 + tf * 0.9) + sin(fq.x * 2.3 + tf), sin(fq.x * 1.5 - tf) + sin(fq.y * 1.3 + tf * 1.1)) * uFlow * (0.18 + seed.w * 0.32);
  // 터짐: 모양이 바뀌는 동안 바깥으로 흩어졌다 모여요
  vec3 dir = normalize(seed.xyz - 0.5 + 1e-4);
  p += dir * uBurst * (2.5 + seed.y * 5.0);
  // 커서가 밀어내요
  vec3 d = p - uMouse; float r2 = dot(d.xy, d.xy);
  p.xy += normalize(d.xy + 1e-4) * uMouseOn * 1.3 * exp(-r2 * 0.6);
  // 커서를 빨리 움직이면: 그 둘레가 소용돌이치고, 움직인 쪽으로 끌려가요
  p.xy += normalize(vec2(-d.y, d.x) + 1e-4) * uVelK * 1.8 * exp(-r2 * 0.22) + uVel * 0.4 * exp(-r2 * 0.3);
  // 워프: 스크롤 · 들어가기 때 입자가 카메라 쪽으로 쏟아져요
  p.z += uWarp * (3.0 + seed.y * 15.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float bok = step(0.965, seed.w);
  gl_PointSize = uSize * (0.35 + seed.x) * (1.0 + bok * 4.0) * uPix / -mv.z;
  vC = mix(colOf(aA.w), colOf(aB.w), e);
  vA = (0.35 + 0.65 * seed.y) * (0.65 + 0.35 * sin(uTime * (0.6 + seed.z) + seed.x * 40.0)) * (bok > 0.5 ? 0.18 : 1.0) * (1.0 + uBurst * 0.8 + uWarp * 0.6); }`;
const PF = `uniform float uOpacity; varying vec3 vC; varying float vA;
void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (1.0 + a), a * a * vA * uOpacity); }`;
// 크롬: 가짜 스튜디오 환경(띠 조명 · 안개 색)을 반사 + 가장자리 무지개 박막
const CHV = `varying vec3 vN, vV, vW; void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }`;
const CHF = `uniform float uTime, uOpacity; uniform vec3 uFog, uTint; varying vec3 vN, vV, vW;
vec3 env(vec3 r) { vec3 c = mix(vec3(0.015, 0.02, 0.03), vec3(0.32, 0.4, 0.45), smoothstep(-0.3, 1.0, r.y));
  c += vec3(1.0) * pow(smoothstep(0.75, 1.0, sin(r.x * 4.0 + r.y * 2.0 + uTime * 0.25) * 0.5 + 0.5), 3.0) * 1.4;
  c += uFog * 2.2 * smoothstep(0.1, 1.0, -r.x * 0.8 + r.y * 0.3); c += uTint * 0.6 * smoothstep(0.4, 1.0, r.x); return c; }
void main() { vec3 n = normalize(vN), v = normalize(vV), r = reflect(-v, n); float f = pow(1.0 - abs(dot(n, v)), 2.5);
  vec3 iri = 0.5 + 0.5 * cos(6.2831 * (f * 1.6 + vec3(0.0, 0.33, 0.67) + uTime * 0.04));
  vec3 c = env(r) * (0.45 + 0.55 * f) + iri * f * 1.1; gl_FragColor = vec4(c, uOpacity); }`;
const CV = `attribute float aSize, aGroup, aIdx; attribute vec3 aColor; uniform float uPix, uFocus, uTime, uHover; varying vec3 vC; varying float vA;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  float on = uFocus < 0.0 || abs(aGroup - uFocus) < 0.5 ? 1.0 : 0.18, hv = abs(aIdx - uHover) < 0.5 ? 1.9 : 1.0;
  gl_PointSize = aSize * hv * uPix / -mv.z * (0.9 + 0.1 * sin(uTime * 1.3 + position.x * 3.0)); vC = aColor; vA = on; }`;
const CF = `varying vec3 vC; varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard;
  float core = smoothstep(0.14, 0.0, d), halo = pow(smoothstep(0.5, 0.0, d), 2.2) * 0.6; gl_FragColor = vec4(vC * (1.0 + core), (core + halo) * vA); }`;
const SPV = `attribute float aLife, aSize; uniform float uPix; varying float vL; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPix * aLife / -mv.z; vL = aLife; }`;
const SPF = `uniform vec3 uColor; varying float vL; void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(mix(uColor, vec3(1.0), a * 0.7), a * a * vL); }`;
const QV = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT = `uniform sampler2D t; varying vec2 vUv; void main() { vec3 c = texture2D(t, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(c * smoothstep(0.35, 0.9, l), 1.0); }`;
const BLUR = `uniform sampler2D t; uniform vec2 uDir; varying vec2 vUv; void main() { vec3 c = texture2D(t, vUv).rgb * 0.227;
  c += (texture2D(t, vUv + uDir * 1.385).rgb + texture2D(t, vUv - uDir * 1.385).rgb) * 0.316; c += (texture2D(t, vUv + uDir * 3.231).rgb + texture2D(t, vUv - uDir * 3.231).rgb) * 0.07; gl_FragColor = vec4(c, 1.0); }`;
const COMP = `uniform sampler2D tScene, tBloom; uniform vec2 uRes, uFogPos; uniform float uTime, uBloom, uCA, uGrain, uExp, uFogK; uniform vec3 uFog; varying vec2 vUv;
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() { vec2 uv = vUv, d = uv - 0.5; float r = length(d); vec2 off = d * uCA * r;
  vec3 c = vec3(texture2D(tScene, uv + off).r, texture2D(tScene, uv).g, texture2D(tScene, uv - off).b);
  c += texture2D(tBloom, uv).rgb * uBloom;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0); float fl = smoothstep(1.25, 0.0, length((uv - uFogPos) * asp));
  c += uFog * (fl * fl * 0.9 + smoothstep(0.32, 0.0, uv.y) * 0.22) * uFogK;
  c *= mix(1.0, smoothstep(0.98, 0.2, r), 0.8);
  c = 1.0 - exp(-c * uExp);
  c += (rnd(uv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
  gl_FragColor = vec4(c, 1.0); }`;

export async function createStage(root) {
  let THREE; try { THREE = await loadThree(); } catch { return null; }
  if (!root.isConnected) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "sw-canvas"; canvas.setAttribute("aria-hidden", "true");
  root.prepend(canvas);
  let R; try { R = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" }); } catch { canvas.remove(); return null; }
  const phone = matchMedia("(max-width: 720px)").matches, dpr = Math.min(phone ? 1.5 : 1.6, devicePixelRatio || 1);
  R.setPixelRatio(1); R.setClearColor(0x04060a, 1); R.autoClear = true;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  cam.position.set(0, 0, 18);
  const col = (h) => new THREE.Color(h), L = (a, b, k) => a + (b - a) * k;
  const mods = MOD_COLORS.map(col);

  // ---------- 모양 만들기 (점 N 개, xyz + w: 0 그냥 · 1 비 줄기 · 2.. 모듈 색)
  const N = phone ? 7000 : 15000;
  let sd = 3; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const SPREAD = phone ? 0.55 : 1;
  const centers = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; return new THREE.Vector3(Math.cos(a) * (phone ? 3.4 : 5.4) + (phone ? 0 : 2.8), Math.sin(a) * (phone ? 3.3 : 4.1) + (phone ? 3.2 : 0.2), Math.sin(a * 2) * 1.8); });
  const SHAPES = {
    rain() { const a = new Float32Array(N * 4); for (let i = 0; i < N; i++) { const k = rnd(); let x, y, z, w = 0;
      if (k < 0.55) { x = (rnd() - 0.5) * 34 * SPREAD; y = -6 + Math.abs(gauss()) * 1.1; z = (rnd() - 0.5) * 14 - 2; } // 바닥 먼지
      else if (k < 0.8) { x = gauss() * 0.9 + (rnd() < 0.5 ? -0.4 : 0.6); y = rnd() * 16 - 6; z = gauss() * 0.8; w = 1; } // 로고 둘레로 떨어지는 줄기
      else { x = (rnd() - 0.5) * 30 * SPREAD; y = (rnd() - 0.5) * 18; z = (rnd() - 0.5) * 16 - 3; } // 공기 중
      a.set([x, y, z, w], i * 4); } return a; },
    cloud(scale = 1, off = 0) { const a = new Float32Array(N * 4); for (let i = 0; i < N; i++) { const g = i % 8, c = centers[g], s = (i < N * 0.15 ? 2.4 : 1.05) * scale;
      a.set([(c.x - off) * scale + gauss() * s * 0.8, c.y * scale + gauss() * s * 0.6, c.z * scale + gauss() * s * 0.8, 2 + g], i * 4); } return a; },
    loop() { const a = new Float32Array(N * 4); for (let i = 0; i < N; i++) { const t = rnd() * Math.PI * 2, s = Math.sin(t), q = 1 + s * s, A = phone ? 3.6 : 6.4;
      const x = (A * Math.cos(t)) / q, y = (A * s * Math.cos(t)) / q, j = 0.28 + Math.abs(gauss()) * 0.12, ang = rnd() * Math.PI * 2;
      a.set([x + Math.cos(ang) * j * 0.4, y * 0.9 + Math.sin(ang) * j - (phone ? -1.5 : 0.3), Math.sin(t * 2) * 1.6 + Math.cos(ang) * j, i % 9 === 0 ? 0 : 2 + (Math.floor(((t / (Math.PI * 2)) * 12)) % 8)], i * 4); } return a; },
    sphere() { const a = new Float32Array(N * 4); for (let i = 0; i < N; i++) { const v = new THREE.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(14 + rnd() * 10); a.set([v.x, v.y, v.z, 0], i * 4); } return a; },
  };
  const shapeCache = {}, shapeOf = (k) => (shapeCache[k] ||= k === "cloudS" ? SHAPES.cloud(0.42, 2.8) : SHAPES[k]());
  const seeds = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) seeds[i] = rnd();
  const pg = new THREE.BufferGeometry();
  const aA = new THREE.BufferAttribute(shapeOf("sphere").slice(), 4), aB = new THREE.BufferAttribute(shapeOf("rain").slice(), 4);
  pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3)); pg.setAttribute("aA", aA); pg.setAttribute("aB", aB); pg.setAttribute("seed", new THREE.BufferAttribute(seeds, 4));
  pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
  const pu = { uTime: { value: 0 }, uMix: { value: 1 }, uBurst: { value: 0 }, uSize: { value: phone ? 70 : 85 }, uPix: { value: dpr }, uMouseOn: { value: 0 }, uScroll: { value: 0 }, uOpacity: { value: 1 }, uFlow: { value: REDUCED ? 0 : 1 }, uWarp: { value: 0 }, uVelK: { value: 0 }, uVel: { value: new THREE.Vector2() },
    uMouse: { value: new THREE.Vector3() }, uC1: { value: col(LOOK.sw.c[0]) }, uC2: { value: col(LOOK.sw.c[1]) }, uC3: { value: col(LOOK.sw.c[2]) }, uMod: { value: mods } };
  const pts = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: pu, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; scene.add(pts);
  let morph = { t: 1, dur: 1.8 }, shapeNow = "rain";
  function toShape(k, burst = true) {
    if (k === shapeNow && morph.t >= 1) return;
    aA.array.set(aB.array); aB.array.set(shapeOf(k)); aA.needsUpdate = aB.needsUpdate = true;
    shapeNow = k; morph = { t: REDUCED ? 1 : 0, dur: burst ? 1.9 : 1.2, burst };
  }

  // ---------- 매달린 크롬 S 로고 + 케이블 (진자)
  const chU = { uTime: { value: 0 }, uOpacity: { value: 1 }, uFog: { value: col(LOOK.sw.fog) }, uTint: { value: col(LOOK.sw.c[0]) } };
  const chrome = new THREE.ShaderMaterial({ uniforms: chU, vertexShader: CHV, fragmentShader: CHF, transparent: true });
  const logo = new THREE.Group();
  logo.add(new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 32, 160), chrome));
  const S = new THREE.CatmullRomCurve3([[0.5, 0.55], [0.05, 0.72], [-0.45, 0.5], [-0.35, 0.12], [0.35, -0.1], [0.48, -0.48], [0.0, -0.72], [-0.5, -0.55]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  logo.add(new THREE.Mesh(new THREE.TubeGeometry(S, 120, 0.1, 16, false), chrome));
  const capG = new THREE.SphereGeometry(0.1, 16, 12); [S.getPoint(0), S.getPoint(1)].forEach((p) => { const m = new THREE.Mesh(capG, chrome); m.position.copy(p); logo.add(m); });
  scene.add(logo);
  const cableMat = chrome;
  let cableTop = null, cableLoop = null;
  const pend = { th: 0.0, w: 0, len: phone ? 5.8 : 8.2, anchor: new THREE.Vector3(0, 9.6, 0), base: new THREE.Vector3(0, 1.0, 0) };
  function rebuildCables() {
    const p = logo.position, top = new THREE.Vector3(p.x, p.y + 1.25, p.z), a = pend.anchor;
    const mid = a.clone().lerp(top, 0.5); mid.x += Math.sin(pend.th) * 0.25;
    const g1 = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, top), 24, 0.035, 6, false);
    // 아래로 늘어진 8자 케이블
    const b = new THREE.Vector3(p.x, p.y - 1.25, p.z), sw = Math.sin(pend.th) * 0.6, pts8 = [];
    for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2, s = Math.sin(t), q = 1 + s * s; pts8.push(new THREE.Vector3(b.x + (1.25 * Math.cos(t) * s) / q * 1.3 - sw * (i / 40), b.y - 2.4 * (1 - Math.cos(t)) / 2 - Math.abs(Math.sin(t)) * 0.4, b.z + (Math.sin(t) * 0.5))); }
    const g2 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts8, true), 80, 0.035, 6, true);
    if (!cableTop) { cableTop = new THREE.Mesh(g1, cableMat); cableLoop = new THREE.Mesh(g2, cableMat); scene.add(cableTop, cableLoop); }
    else { cableTop.geometry.dispose(); cableTop.geometry = g1; cableLoop.geometry.dispose(); cableLoop.geometry = g2; }
  }

  // ---------- 커서 빛 꼬리 + 불꽃
  const TN = 36, SN = 160, tPos = new Float32Array((TN + SN) * 3), tLife = new Float32Array(TN + SN), tSize = new Float32Array(TN + SN), sparks = [];
  for (let i = 0; i < TN; i++) { tSize[i] = 70 * (1 - i / TN) + 8; tLife[i] = 0; }
  for (let i = 0; i < SN; i++) { sparks.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }); tSize[TN + i] = 26; }
  const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.BufferAttribute(tPos, 3)); tg.setAttribute("aLife", new THREE.BufferAttribute(tLife, 1)); tg.setAttribute("aSize", new THREE.BufferAttribute(tSize, 1));
  const tU = { uPix: { value: dpr }, uColor: { value: col("#9FEFFF") } };
  const trail = new THREE.Points(tg, new THREE.ShaderMaterial({ uniforms: tU, vertexShader: SPV, fragmentShader: SPF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  trail.frustumCulled = false; scene.add(trail);
  const chain = Array.from({ length: TN }, () => new THREE.Vector3());

  // ---------- 카드 점구름 (vg 모드에서만)
  let cloud = null;
  function buildCloud(modules) {
    if (cloud) return cloud;
    const items = [];
    modules.forEach((m, gi) => m.cards.forEach((c, ci) => items.push({ g: gi, c: ci, p: centers[gi % 8].clone().add(new THREE.Vector3(gauss() * 0.7, gauss() * 0.7, gauss() * 0.7)) })));
    const n = items.length, P = new Float32Array(n * 3), Sz = new Float32Array(n), Cc = new Float32Array(n * 3), G = new Float32Array(n), I = new Float32Array(n);
    items.forEach((it, i) => { P.set([it.p.x, it.p.y, it.p.z], i * 3); Sz[i] = phone ? 300 : 360; const k = mods[it.g % 8]; Cc.set([k.r, k.g, k.b], i * 3); G[i] = it.g; I[i] = i; });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("aSize", new THREE.BufferAttribute(Sz, 1)); g.setAttribute("aColor", new THREE.BufferAttribute(Cc, 3)); g.setAttribute("aGroup", new THREE.BufferAttribute(G, 1)); g.setAttribute("aIdx", new THREE.BufferAttribute(I, 1));
    const cu = { uPix: { value: dpr }, uFocus: { value: -1 }, uTime: { value: 0 }, uHover: { value: -1 } };
    const mesh = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: cu, vertexShader: CV, fragmentShader: CF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...centers, centers[0]]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 }));
    const kg = new THREE.BufferGeometry(); kg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
    const knn = new THREE.LineSegments(kg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); knn.visible = false;
    const grp = new THREE.Group(); grp.add(path, mesh, knn); scene.add(grp);
    return (cloud = { grp, mesh, knn, items, cu });
  }

  // ---------- 후처리
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), post = new THREE.Scene(); post.add(quad);
  const ty = R.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const mk = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: ty, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  let rtS = mk(2, 2), rtA = mk(2, 2), rtB = mk(2, 2);
  const mBright = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: QV, fragmentShader: BRIGHT });
  const mBlur = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: QV, fragmentShader: BLUR });
  const cU = { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uFogPos: { value: new THREE.Vector2(...LOOK.sw.fogPos) }, uTime: { value: 0 }, uBloom: { value: 1.25 }, uCA: { value: 0.012 }, uGrain: { value: 0.045 }, uExp: { value: 1.25 }, uFogK: { value: 1 }, uFog: { value: col(LOOK.sw.fog) } };
  const mComp = new THREE.ShaderMaterial({ uniforms: cU, vertexShader: QV, fragmentShader: COMP });
  const pass = (mat, target) => { quad.material = mat; R.setRenderTarget(target); R.render(post, ortho); };

  // ---------- 크기 · 입력
  let w = 1, h = 1;
  function size() {
    const r = root.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    R.setSize(W, H, false); canvas.style.width = "100%"; canvas.style.height = "100%";
    cam.aspect = w / h; cam.updateProjectionMatrix();
    rtS.setSize(W, H); rtA.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2)); rtB.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
    cU.uRes.value.set(W, H);
  }
  const ro = new ResizeObserver(() => { size(); if (REDUCED) frame(); }); ro.observe(root);
  const scroller = root.closest(".main") || window;
  const onScroll = () => { pu.uScroll.value = (scroller.scrollTop || 0) / 900; };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, on: 0, onTo: 0, px: -1, py: -1, w: new THREE.Vector3(), pw: new THREE.Vector3(), vel: 0 };
  const onMove = (e) => { const r = canvas.getBoundingClientRect(); mouse.px = e.clientX - r.left; mouse.py = e.clientY - r.top; mouse.x = (mouse.px / r.width) * 2 - 1; mouse.y = -(mouse.py / r.height) * 2 + 1; mouse.onTo = 1; if (REDUCED && mode === "vg") { setHover(pickNear()); frame(); } };
  const onLeave = (e) => { if (e && e.pointerType && e.pointerType !== "mouse") return; mouse.onTo = 0; mouse.px = -1; setHover(-1); };
  window.addEventListener("pointermove", onMove, { passive: true }); document.addEventListener("pointerleave", onLeave);

  // ---------- vg: 커서 가까운 카드 → 이웃 5장
  let mode = "sw", opts = {}, hovered = -1, focusI = -1, armed = -1;
  const v = new THREE.Vector3();
  function pickNear() {
    if (!cloud || mode !== "vg" || mouse.px < 0 || cur.cloud < 0.5) return -1;
    let best = -1, bd = 30 * 30; const m = cloud.grp.matrixWorld;
    cloud.items.forEach((it, i) => { if (focusI >= 0 && it.g !== focusI) return; v.copy(it.p).applyMatrix4(m).project(cam); const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h, d = (x - mouse.px) ** 2 + (y - mouse.py) ** 2; if (d < bd && v.z < 1) { bd = d; best = i; } });
    return best;
  }
  function setHover(i) {
    if (i === hovered) return; hovered = i;
    if (!cloud) return;
    cloud.cu.uHover.value = i;
    if (i < 0) { cloud.knn.visible = false; opts.onHover?.(null); canvas.style.cursor = ""; return; }
    const me = cloud.items[i], near = cloud.items.map((it, j) => [j, it.p.distanceToSquared(me.p)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 5);
    const arr = cloud.knn.geometry.attributes.position.array;
    near.forEach(([j], k) => { arr.set([me.p.x, me.p.y, me.p.z], k * 6); const q = cloud.items[j].p; arr.set([q.x, q.y, q.z], k * 6 + 3); });
    cloud.knn.geometry.attributes.position.needsUpdate = true; cloud.knn.visible = true; canvas.style.cursor = "pointer";
    v.copy(me.p).applyMatrix4(cloud.grp.matrixWorld).project(cam);
    opts.onHover?.({ module: me.g, card: me.c, near: near.map(([j]) => ({ module: cloud.items[j].g, card: cloud.items[j].c })), x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h });
  }
  const onDown = (e) => { onMove(e); if (e.pointerType === "mouse" || mode !== "vg") return; const was = hovered; setHover(pickNear()); armed = hovered >= 0 && hovered === was ? hovered : -1; };
  const onClick = (e) => { if (hovered < 0 || !cloud || mode !== "vg") return; if (e.pointerType && e.pointerType !== "mouse" && armed !== hovered) return; const it = cloud.items[hovered]; opts.onPick?.(it.g, it.c); };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("click", onClick);

  // ---------- 상태 · 그리기
  let target = { logo: 1, op: 1, cloud: 0, speed: 1, exp: 1.25, fogK: 1, bloom: 1.25 }, cur = { ...target, logo: 0 };
  const look = new THREE.Vector3(), lookTo = new THREE.Vector3(); let camZ = 18, camZTo = 18;
  const tint = { a: col(LOOK.sw.c[0]), b: col(LOOK.sw.c[1]), c: col(LOOK.sw.c[2]), fog: col(LOOK.sw.fog), fogPos: new THREE.Vector2(...LOOK.sw.fogPos) };
  function look_(k) { const p = LOOK[k] || LOOK.sw; tint.a = col(p.c[0]); tint.b = col(p.c[1]); tint.c = col(p.c[2]); tint.fog = col(p.fog); tint.fogPos.set(...p.fogPos); }
  let raf = 0, last = performance.now(), t = 0, alive = true, visible = true;
  const fx = { warp: 0, lastScroll: 0, dive: 0, ca: 0, shake: 0, onDive: null };
  function frame(now) {
    now = now || performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const k = REDUCED ? 1 : 1 - Math.pow(0.03, dt);
    for (const key in target) cur[key] = L(cur[key], target[key], k);
    t += dt * cur.speed;
    pu.uTime.value = t; chU.uTime.value = t; cU.uTime.value = now / 1000;
    // 모양 바꾸기 + 터짐
    if (morph.t < 1) { morph.t = Math.min(1, morph.t + dt / morph.dur); }
    pu.uMix.value = morph.t; pu.uBurst.value = morph.burst && !REDUCED ? Math.sin(Math.PI * morph.t) ** 2 * 0.9 : 0;
    // 커서 (화면 → 장면 z=0 평면)
    mouse.sx = L(mouse.sx, mouse.x, k * 0.5); mouse.sy = L(mouse.sy, mouse.y, k * 0.5); mouse.on = L(mouse.on, mouse.onTo, k);
    v.set(mouse.x, mouse.y, 0.5).unproject(cam).sub(cam.position).normalize();
    mouse.pw.copy(mouse.w); mouse.w.copy(cam.position).addScaledVector(v, -cam.position.z / v.z);
    mouse.vel = L(mouse.vel, mouse.w.distanceTo(mouse.pw) / Math.max(dt, 1e-3), 0.3);
    pu.uMouse.value.copy(mouse.w); pu.uMouseOn.value = REDUCED ? 0 : mouse.on;
    if (!REDUCED) {
      const vx = (mouse.w.x - mouse.pw.x) / Math.max(dt, 1e-3), vy = (mouse.w.y - mouse.pw.y) / Math.max(dt, 1e-3);
      pu.uVel.value.lerp(new THREE.Vector2(Math.max(-6, Math.min(6, vx * 0.15)), Math.max(-6, Math.min(6, vy * 0.15))), 0.2);
      pu.uVelK.value = L(pu.uVelK.value, mouse.on * Math.min(1, mouse.vel / 9), 0.15);
      // 스크롤 속도 → 워프, 들어가기(dive) → 크게
      const sc = pu.uScroll.value, sv = Math.abs(sc - fx.lastScroll) / Math.max(dt, 1e-3); fx.lastScroll = sc;
      fx.warp = L(fx.warp, Math.min(0.9, sv * 0.35) + fx.dive * 1.4, 0.12);
      pu.uWarp.value = fx.warp;
      fx.ca = L(fx.ca, 0, 0.06); fx.shake = L(fx.shake, 0, 0.05);
      cU.uCA.value = 0.012 + fx.ca * 0.05 + fx.warp * 0.03;
      if (fx.dive > 0) fx.dive = Math.min(1, fx.dive + dt / 0.9);
    }
    // 색 · 안개
    pu.uC1.value.lerp(tint.a, k); pu.uC2.value.lerp(tint.b, k); pu.uC3.value.lerp(tint.c, k);
    cU.uFog.value.lerp(tint.fog, k); chU.uFog.value.lerp(tint.fog, k); chU.uTint.value.lerp(tint.a, k); tU.uColor.value.lerp(tint.a, k); cU.uFogPos.value.lerp(tint.fogPos, k * 0.6);
    pu.uOpacity.value = cur.op; cU.uExp.value = cur.exp; cU.uFogK.value = cur.fogK; cU.uBloom.value = cur.bloom;
    // 진자: 커서가 로고를 스치면 그 속도만큼 밀어요
    if (!REDUCED) {
      const near = mouse.on > 0.5 && mouse.w.distanceTo(logo.position) < 2.2;
      if (near) pend.w += (mouse.w.x - mouse.pw.x) * 0.9;
      pend.w += (-pend.th * 9 - pend.w * 1.4) * dt; pend.th += pend.w * dt; pend.th = Math.max(-0.5, Math.min(0.5, pend.th));
    }
    logo.position.set(pend.anchor.x + Math.sin(pend.th) * pend.len, pend.anchor.y - Math.cos(pend.th) * pend.len + (REDUCED ? 0 : Math.sin(t * 0.7) * 0.08), 0);
    logo.position.y -= (1 - cur.logo) * 14; // 숨을 때는 아래로 빠져요
    logo.rotation.z = -pend.th * 0.8; logo.rotation.y = REDUCED ? 0.35 : Math.sin(t * 0.35) * 0.6 + mouse.sx * 0.35; logo.rotation.x = REDUCED ? 0 : mouse.sy * -0.2;
    chU.uOpacity.value = Math.min(1, cur.logo * 1.2);
    logo.visible = cur.logo > 0.02;
    if (logo.visible) { rebuildCables(); cableTop.visible = cableLoop.visible = true; cableTop.position.y = cableLoop.position.y = 0; } else if (cableTop) cableTop.visible = cableLoop.visible = false;
    // 꼬리 · 불꽃
    if (!REDUCED) {
      chain[0].lerp(mouse.w, 0.6); for (let i = 1; i < TN; i++) chain[i].lerp(chain[i - 1], 0.45);
      const on = mouse.on * Math.min(1, mouse.vel / 6);
      for (let i = 0; i < TN; i++) { tPos.set([chain[i].x, chain[i].y, 0.5], i * 3); tLife[i] = L(tLife[i], on * (1 - i / TN), 0.25); }
      if (mouse.vel > 4 && mouse.on > 0.5) for (let n = 0; n < 3; n++) { const s = sparks.find((x) => x.life <= 0); if (!s) break; s.p.copy(mouse.w); s.v.set((Math.random() - 0.5) * 3, (Math.random() - 0.2) * 3, (Math.random() - 0.5) * 2).addScaledVector(mouse.w.clone().sub(mouse.pw), 8); s.life = 1; }
      sparks.forEach((s, i) => { if (s.life > 0) { s.life -= dt * 1.4; s.v.y -= dt * 2.5; s.p.addScaledVector(s.v, dt); } tPos.set([s.p.x, s.p.y, s.p.z + 0.5], (TN + i) * 3); tLife[TN + i] = Math.max(0, s.life); });
      tg.attributes.position.needsUpdate = true; tg.attributes.aLife.needsUpdate = true;
    }
    trail.visible = !REDUCED;
    // 점구름
    if (cloud) { cloud.grp.visible = cur.cloud > 0.01; cloud.mesh.material.opacity = cur.cloud; cloud.cu.uTime.value = t; cloud.grp.rotation.y = REDUCED ? 0 : Math.sin(t * 0.06) * 0.22 + mouse.sx * 0.1; cloud.grp.rotation.x = REDUCED ? 0 : mouse.sy * -0.06; cloud.grp.updateMatrixWorld(); }
    pts.rotation.y = REDUCED || shapeNow === "rain" ? 0 : (cloud?.grp.rotation.y || 0);
    // 카메라: 커서 쪽으로 살짝 기울고, 고른 무리로 날아가요
    camZ = L(camZ, camZTo, k * 0.6); look.lerp(lookTo, k * 0.6);
    // 스크롤하면 카메라가 장면 속으로 날아 들어가요 (화면 한 장 = 9만큼) · 들어가기는 로고로 돌진
    const fly = REDUCED ? 0 : Math.min(1.6, pu.uScroll.value) * 7, dv = REDUCED ? 0 : fx.dive * fx.dive;
    const sh = REDUCED ? 0 : fx.shake, jx = (Math.sin(t * 47) + Math.sin(t * 31)) * 0.18 * sh, jy = (Math.cos(t * 43) + Math.sin(t * 29)) * 0.14 * sh;
    const tx = L(look.x, logo.position.x, dv), ty = L(look.y - pu.uScroll.value * 1.2, logo.position.y, dv);
    cam.position.set(tx + (REDUCED ? 0 : mouse.sx * 1.1) + jx, ty + (REDUCED ? 0 : mouse.sy * 0.6) + jy, Math.max(1.2, camZ - fly - dv * (camZ - 1.5)));
    cam.lookAt(tx, ty, 0); cam.rotation.z += REDUCED ? 0 : mouse.sx * -0.03 + pu.uScroll.value * 0.05;
    cU.uExp.value = cur.exp * (1 + dv * 6);
    if (mode === "vg" && !REDUCED && mouse.px >= 0) setHover(pickNear());
    // 그리기: 장면 → 블룸 → 합성
    R.setRenderTarget(rtS); R.render(scene, cam);
    mBright.uniforms.t.value = rtS.texture; pass(mBright, rtA);
    for (let i = 0; i < 2; i++) { mBlur.uniforms.t.value = rtA.texture; mBlur.uniforms.uDir.value.set(1.4 / rtA.width, 0); pass(mBlur, rtB); mBlur.uniforms.t.value = rtB.texture; mBlur.uniforms.uDir.value.set(0, 1.4 / rtA.height); pass(mBlur, rtA); }
    cU.tScene.value = rtS.texture; cU.tBloom.value = rtA.texture; pass(mComp, null);
    if (alive && visible && !REDUCED) raf = requestAnimationFrame(frame);
  }
  const vis = () => { const was = visible; visible = !document.hidden; if (visible && !was && alive && !REDUCED) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", vis);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); cancelAnimationFrame(raf); canvas.style.display = "none"; });

  function focusCloud() {
    if (cloud) cloud.cu.uFocus.value = focusI;
    if (focusI >= 0) { lookTo.copy(centers[focusI]).multiplyScalar(0.9); camZTo = 10.5; } else { lookTo.set(0, 0, 0); camZTo = phone ? 21 : 18; }
    if (REDUCED) { look.copy(lookTo); camZ = camZTo; }
  }
  const api = {
    mode(name, o = {}) {
      mode = name; opts = o; setHover(-1); root.dataset.stage = name; fx.dive = 0;
      if (name === "vg") { buildCloud(o.modules || []); look_("vg"); toShape("cloud"); target = { logo: 0, op: 0.4, cloud: 1, speed: 1, exp: 1.2, fogK: 0.9, bloom: 1.1 }; focusI = o.focus ?? -1; focusCloud(); }
      else {
        focusI = -1; if (cloud) cloud.cu.uFocus.value = -1; lookTo.set(0, 0, 0); camZTo = phone ? 21 : 18;
        if (name === "sw") { const k = o.accent || "sw"; look_(k); toShape(k === "vg" ? "cloudS" : k === "dev" ? "loop" : "rain"); target = { logo: 1, op: 1, cloud: 0, speed: 1, exp: 1.25, fogK: 1, bloom: 1.25 }; }
        else if (name === "dev") { look_("dev"); toShape("rain"); target = { logo: 0, op: 0.55, cloud: 0, speed: 0.8, exp: 1.1, fogK: 0.8, bloom: 1 }; }
        else { look_(o.accent || "sw"); toShape("rain", false); target = { logo: 0, op: 0.4, cloud: 0, speed: 0.4, exp: 0.8, fogK: 0.7, bloom: 0.8 }; }
      }
      if (REDUCED) { Object.assign(cur, target); look.copy(lookTo); camZ = camZTo; frame(); }
    },
    // 들어가기: 카메라가 로고로 돌진하며 빛으로 번져요. 0.75초 뒤 resolve (그때 화면을 바꾸면 돼요)
    dive() { if (REDUCED) return Promise.resolve(); fx.dive = 0.001; fx.ca = 1; return new Promise((ok) => setTimeout(ok, 750)); },
    // 과정 넘김: 순간 색번짐 + 카메라 흔들림 (모양 바뀜 · 터짐은 mode 가 해요)
    kick() { if (REDUCED) return; fx.ca = 1; fx.shake = 1; },
    focus(i) { focusI = i; if (mode === "vg") focusCloud(); if (REDUCED) frame(); },
    accent(k) { look_(k); if (REDUCED) frame(); },
    // 시작 연출이 끝날 때: 멀리 흩어진 입자가 한꺼번에 모여요
    reveal() { if (REDUCED) return; aA.array.set(shapeOf("sphere")); aA.needsUpdate = true; morph = { t: 0, dur: 2.2, burst: false }; cur.logo = 0; },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); scroller.removeEventListener("scroll", onScroll); window.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); document.removeEventListener("visibilitychange", vis); canvas.removeEventListener("click", onClick); canvas.removeEventListener("pointerdown", onDown);
      [rtS, rtA, rtB].forEach((r) => r.dispose()); [mBright, mBlur, mComp].forEach((m) => m.dispose()); scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); R.dispose(); canvas.remove(); },
  };
  size(); morph = { t: REDUCED ? 1 : 0, dur: 2.2, burst: false }; // 처음 열 때도 흩어진 입자가 모여요
  if (REDUCED) frame(); else raf = requestAnimationFrame(frame);
  return api;
}

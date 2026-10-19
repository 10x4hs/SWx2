// SW 공간의 장면 — 화면 뒤에 하나만 깔리는 WebGL(three.js r128). 화면을 옮겨도 그대로 두고 모드만 바꿔요.
//   sw  : 유리 고리 + 커서 · 스크롤에 반응하는 입자 (과정마다 색이 바뀌어요)
//   vg  : 카드 160장의 임베딩 점구름 — 모듈마다 색 무리, 커서에 가까운 카드와 그 이웃 5개를 선으로(벡터 검색처럼), 누르면 그 카드로
//   dev : 입자만 (개발 흐름 홈의 3D 고리가 위에 따로 있어요)
//   dim : 공부 화면 뒤 — 느리고 흐리게
//   createStage(root) → { mode(name, opts), focus(i), destroy() } | null (WebGL 이 없으면 null — 화면은 장면 없이도 다 읽혀요)
//   움직임 줄이기면 장면을 한 장 그리고 멈춰요.
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
const PAL = { // 입자 색 세 개 + 고리 색조
  vg: { c: ["#7FDBFF", "#B79CFF", "#E8F7FF"], hue: 0.55 },
  dev: { c: ["#FFE14D", "#FFB347", "#FFF6CC"], hue: 0.12 },
  sw: { c: ["#7FDBFF", "#9DF5C8", "#FFFFFF"], hue: 0.45 },
};
export const MOD_COLORS = ["#7FDBFF", "#8CF5C4", "#C9F27B", "#FFD36B", "#FF9E7A", "#F58BD0", "#B79CFF", "#8FA8FF"];

const PV = `attribute vec3 seed; uniform float uTime, uScroll, uSize, uPix, uMouseOn; uniform vec3 uMouse, uC1, uC2, uC3; varying float vA, vB; varying vec3 vC;
void main(){ vec3 p = position; float t = uTime * 0.08;
  p.x += sin(t * (1.0 + seed.x * 3.0) + position.y * 0.6) * 0.45;
  p.z += cos(t * (1.0 + seed.z * 3.0) + position.x * 0.5) * 0.45;
  p.y = mod(position.y + uTime * 0.12 * (0.25 + seed.y) + uScroll * 4.0 + 12.0, 24.0) - 12.0;
  vec2 d = p.xy - uMouse.xy; float r2 = dot(d, d);
  p.xy += normalize(d + 1e-4) * uMouseOn * 1.8 * exp(-r2 * 0.45);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float bok = step(0.95, seed.y); gl_PointSize = uSize * (0.35 + seed.x) * (1.0 + bok * 3.5) * uPix / -mv.z; vB = bok;
  vA = (0.25 + 0.75 * seed.y) * (0.6 + 0.4 * sin(uTime * (0.5 + seed.z) + seed.x * 40.0));
  vC = mix(mix(uC1, uC2, seed.z), uC3, step(0.94, seed.x)); }`;
const PF = `uniform float uOpacity; varying float vA, vB; varying vec3 vC;
void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.05, d), a = mix(core * core * 1.1, smoothstep(0.5, 0.2, d) * 0.22, vB); gl_FragColor = vec4(vC * (1.0 + core * 0.4), a * vA * uOpacity); }`;
const GV = `varying vec3 vN, vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const GF = `uniform float uHue, uTime, uOpacity; uniform vec3 uTint; varying vec3 vN, vV;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  vec3 iri = 0.5 + 0.5 * cos(6.2831 * (f * 1.1 + uHue + uTime * 0.02 + vec3(0.0, 0.33, 0.67)));
  float spec = pow(max(dot(reflect(-normalize(vV), normalize(vN)), normalize(vec3(0.4, 0.8, 0.6))), 0.0), 40.0);
  vec3 glass = mix(uTint * 0.18, vec3(0.92, 0.97, 1.0), smoothstep(0.15, 0.95, f)) + iri * pow(f, 1.5) * 0.55;
  gl_FragColor = vec4(glass + spec * 1.5, (0.05 + 0.9 * pow(f, 1.3) + spec) * uOpacity); }`;
const CV = `attribute float aSize; attribute vec3 aColor; attribute float aGroup; attribute float aIdx; uniform float uPix, uFocus, uTime, uHover; varying vec3 vC; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  float on = uFocus < 0.0 || abs(aGroup - uFocus) < 0.5 ? 1.0 : 0.22;
  float hv = abs(aIdx - uHover) < 0.5 ? 1.8 : 1.0;
  gl_PointSize = aSize * hv * uPix / -mv.z * (0.9 + 0.1 * sin(uTime + position.x * 3.0));
  vC = aColor; vA = on; }`;
const CF = `varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard;
  float core = smoothstep(0.16, 0.0, d), halo = pow(smoothstep(0.5, 0.0, d), 2.0) * 0.55; gl_FragColor = vec4(vC + core * 0.6, (core + halo) * vA); }`;

export async function createStage(root) {
  let THREE; try { THREE = await loadThree(); } catch { return null; }
  if (!root.isConnected) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "sw-canvas"; canvas.setAttribute("aria-hidden", "true");
  root.prepend(canvas);
  let R; try { R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }); } catch { canvas.remove(); return null; }
  const phone = matchMedia("(max-width: 720px)").matches, dpr = Math.min(phone ? 1.5 : 1.75, devicePixelRatio || 1);
  R.setPixelRatio(dpr); R.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  cam.position.set(0, 0, 16);
  const col = (h) => new THREE.Color(h);

  // ---- 입자
  const N = phone ? 3500 : 8000, pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 34; pos[i * 3 + 1] = (Math.random() - 0.5) * 24; pos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 2; seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random(); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); pg.setAttribute("seed", new THREE.BufferAttribute(seed, 3));
  const pu = { uTime: { value: 0 }, uScroll: { value: 0 }, uSize: { value: phone ? 110 : 140 }, uPix: { value: dpr }, uMouseOn: { value: 0 }, uMouse: { value: new THREE.Vector3() }, uOpacity: { value: 1 },
    uC1: { value: col(PAL.sw.c[0]) }, uC2: { value: col(PAL.sw.c[1]) }, uC3: { value: col(PAL.sw.c[2]) } };
  const pts = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: pu, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(pts);

  // ---- 유리 고리 (바깥 · 안쪽이 반대로 돌아요)
  const gu = { uHue: { value: PAL.sw.hue }, uTime: { value: 0 }, uOpacity: { value: 1 }, uTint: { value: col(PAL.sw.c[0]) } };
  const gm = new THREE.ShaderMaterial({ uniforms: gu, vertexShader: GV, fragmentShader: GF, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Group();
  const glowT = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(.35, "rgba(255,255,255,.14)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0x7fdbff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  glow.scale.set(11, 11, 1);
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.3, 64, 200), gm), r2 = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.36, 40, 120), gm);
  r2.rotation.x = Math.PI / 2; ring.add(glow, r1, r2); scene.add(ring);

  // ---- 임베딩 점구름 (vg 모드에서 만들어요)
  let cloud = null;
  function buildCloud(modules) {
    if (cloud) return cloud;
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const items = [], centers = modules.map((m, i) => { const a = (i / modules.length) * Math.PI * 2 - Math.PI / 2; return new THREE.Vector3(Math.cos(a) * (phone ? 3.4 : 5.6) + (phone ? 0 : 3.2), Math.sin(a) * (phone ? 3.2 : 3.8) + (phone ? 3.6 : 0), Math.sin(a * 2) * 1.6); }); // 컴퓨터에선 오른쪽(왼쪽은 글 자리)
    modules.forEach((m, gi) => m.cards.forEach((c, ci) => { const p = centers[gi].clone().add(new THREE.Vector3(gauss() * 0.75, gauss() * 0.75, gauss() * 0.75)); items.push({ g: gi, c: ci, p }); }));
    const n = items.length, P = new Float32Array(n * 3), S = new Float32Array(n), Cc = new Float32Array(n * 3), G = new Float32Array(n), I = new Float32Array(n);
    items.forEach((it, i) => { P.set([it.p.x, it.p.y, it.p.z], i * 3); S[i] = phone ? 300 : 380; const k = col(MOD_COLORS[it.g % 8]); Cc.set([k.r, k.g, k.b], i * 3); G[i] = it.g; I[i] = i; });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("aSize", new THREE.BufferAttribute(S, 1)); g.setAttribute("aColor", new THREE.BufferAttribute(Cc, 3)); g.setAttribute("aGroup", new THREE.BufferAttribute(G, 1)); g.setAttribute("aIdx", new THREE.BufferAttribute(I, 1));
    const cu = { uPix: { value: dpr }, uFocus: { value: -1 }, uTime: { value: 0 }, uHover: { value: -1 } };
    const mesh = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: cu, vertexShader: CV, fragmentShader: CF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    // 과정 순서대로 무리 중심을 잇는 길 + 이웃 선 (커서가 가리킨 카드 → 가까운 5장)
    const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...centers, centers[0]]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 }));
    const kg = new THREE.BufferGeometry(); kg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
    const knn = new THREE.LineSegments(kg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    knn.visible = false;
    const grp = new THREE.Group(); grp.add(path, mesh, knn); scene.add(grp);
    cloud = { grp, mesh, knn, items, centers, cu };
    return cloud;
  }

  // ---- 상태
  let mode = "sw", opts = {}, target = { op: 1, ring: 1, cloud: 0, speed: 1 }, cur = { op: 1, ring: 1, cloud: 0, speed: 1 };
  let focusI = -1, look = new THREE.Vector3(), lookTo = new THREE.Vector3(), camZ = 16, camZTo = 16, hovered = -1;
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, on: 0, onTo: 0, px: -1, py: -1 };
  const tint = { a: col(PAL.sw.c[0]), b: col(PAL.sw.c[1]), c: col(PAL.sw.c[2]), hue: PAL.sw.hue };
  function palette(k) { const p = PAL[k] || PAL.sw; tint.a = col(p.c[0]); tint.b = col(p.c[1]); tint.c = col(p.c[2]); tint.hue = p.hue; }

  let w = 0, h = 0;
  function size() { const r = root.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height); R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  const ro = new ResizeObserver(() => { size(); if (REDUCED) frame(0); }); ro.observe(root);
  const scroller = root.closest(".main") || window;
  const onScroll = () => { pu.uScroll.value = (scroller.scrollTop || 0) / 900; if (REDUCED) frame(0); };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  const onMove = (e) => { const r = canvas.getBoundingClientRect(); mouse.px = e.clientX - r.left; mouse.py = e.clientY - r.top; mouse.x = (mouse.px / r.width) * 2 - 1; mouse.y = -(mouse.py / r.height) * 2 + 1; mouse.onTo = 1; if (REDUCED && mode === "vg") { setHover(pickNear()); frame(0); } };
  const onLeave = (e) => { if (e && e.pointerType && e.pointerType !== "mouse") return; mouse.onTo = 0; mouse.px = -1; setHover(-1); };
  window.addEventListener("pointermove", onMove, { passive: true }); document.addEventListener("pointerleave", onLeave);

  // vg: 커서에 가장 가까운 카드(화면 위 28px 안) → 그 카드와 3D 공간에서 가까운 5장을 선으로
  const v = new THREE.Vector3();
  function pickNear() {
    if (!cloud || mode !== "vg" || mouse.px < 0 || cur.cloud < 0.5) return -1;
    let best = -1, bd = 28 * 28;
    cloud.items.forEach((it, i) => { if (focusI >= 0 && it.g !== focusI) return; v.copy(it.p).project(cam); const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h, d = (x - mouse.px) ** 2 + (y - mouse.py) ** 2; if (d < bd && v.z < 1) { bd = d; best = i; } });
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
    v.copy(me.p).project(cam);
    opts.onHover?.({ module: me.g, card: me.c, near: near.map(([j]) => ({ module: cloud.items[j].g, card: cloud.items[j].c })), x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h });
  }
  // 터치: 한 번 누르면 그 카드와 이웃이 보이고, 같은 카드를 한 번 더 누르면 열려요. 마우스는 바로 열려요
  let armed = -1;
  const onDown = (e) => { onMove(e); if (e.pointerType === "mouse" || mode !== "vg") return; const was = hovered; setHover(pickNear()); armed = hovered >= 0 && hovered === was ? hovered : -1; };
  const onClick = (e) => { if (hovered < 0 || !cloud || mode !== "vg") return; if (e.pointerType && e.pointerType !== "mouse" && armed !== hovered) return; const it = cloud.items[hovered]; opts.onPick?.(it.g, it.c); };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("click", onClick);

  // ---- 그리기
  let raf = 0, last = performance.now(), t = 0, alive = true, visible = true;
  const L = (a, b, k) => a + (b - a) * k;
  function frame(now) {
    const dt = Math.min(0.05, ((now || performance.now()) - last) / 1000); last = now || performance.now();
    const k = REDUCED ? 1 : 1 - Math.pow(0.02, dt);
    for (const key in target) cur[key] = L(cur[key], target[key], k);
    t += dt * cur.speed; pu.uTime.value = t; gu.uTime.value = t;
    mouse.sx = L(mouse.sx, mouse.x, k * 0.6); mouse.sy = L(mouse.sy, mouse.y, k * 0.6); mouse.on = L(mouse.on, mouse.onTo, k);
    v.set(mouse.sx, mouse.sy, 0.5).unproject(cam).sub(cam.position).normalize();
    const dist = -cam.position.z / v.z; pu.uMouse.value.copy(cam.position).addScaledVector(v, dist); pu.uMouseOn.value = REDUCED ? 0 : mouse.on;
    glow.material.color.lerp(tint.a, k); gu.uTint.value.lerp(tint.a, k); glow.material.opacity = 0.5 * cur.ring;
    pu.uC1.value.lerp(tint.a, k); pu.uC2.value.lerp(tint.b, k); pu.uC3.value.lerp(tint.c, k); gu.uHue.value = L(gu.uHue.value, tint.hue, k);
    pu.uOpacity.value = cur.op; gu.uOpacity.value = cur.ring; ring.visible = cur.ring > 0.01;
    if (!REDUCED) { r1.rotation.x = 0.35 + mouse.sy * 0.35 + t * 0.05; r1.rotation.y = t * 0.22 + mouse.sx * 0.5; r2.rotation.y = -t * 0.35; r2.rotation.z = t * 0.12; ring.position.y = Math.sin(t * 0.6) * 0.15; }
    if (cloud) { cloud.grp.visible = cur.cloud > 0.01; cloud.mesh.material.opacity = cur.cloud; cloud.cu.uTime.value = t; cloud.grp.rotation.y = REDUCED ? 0 : Math.sin(t * 0.05) * 0.25 + mouse.sx * 0.12; cloud.grp.rotation.x = REDUCED ? 0 : mouse.sy * -0.08; }
    camZ = L(camZ, camZTo, k * 0.7); look.lerp(lookTo, k * 0.7);
    cam.position.set(look.x + (REDUCED ? 0 : mouse.sx * 0.8), look.y + (REDUCED ? 0 : mouse.sy * 0.5), camZ); cam.lookAt(look);
    if (mode === "vg" && !REDUCED) setHover(pickNear());
    R.render(scene, cam);
    if (alive && visible && !REDUCED) raf = requestAnimationFrame(frame);
  }
  const vis = () => { const was = visible; visible = !document.hidden; if (visible && !was && alive && !REDUCED) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", vis);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); cancelAnimationFrame(raf); canvas.style.display = "none"; });

  function focusCloud() {
    if (!cloud) return;
    cloud.cu.uFocus.value = focusI;
    if (focusI >= 0) { const c = cloud.centers[focusI]; lookTo.copy(c).multiplyScalar(0.85); camZTo = 9.5; } else { lookTo.set(0, 0, 0); camZTo = phone ? 19 : 16; }
    if (REDUCED) { look.copy(lookTo); camZ = camZTo; }
  }
  const api = {
    mode(name, o = {}) {
      mode = name; opts = o; setHover(-1);
      root.dataset.stage = name;
      if (name === "vg") { buildCloud(o.modules || []); palette("vg"); target = { op: 0.28, ring: 0, cloud: 1, speed: 1 }; focusI = o.focus ?? -1; focusCloud(); }
      else { focusI = -1; lookTo.set(0, 0, 0); camZTo = 16; if (cloud) cloud.cu.uFocus.value = -1;
        if (name === "sw") { palette(o.accent || "sw"); target = { op: 1, ring: 1, cloud: 0, speed: 1 }; }
        else if (name === "dev") { palette("dev"); target = { op: 0.45, ring: 0, cloud: 0, speed: 0.8 }; }
        else { palette(o.accent || "sw"); target = { op: 0.35, ring: 0, cloud: 0, speed: 0.35 }; } }
      if (REDUCED) { Object.assign(cur, target); look.copy(lookTo); camZ = camZTo; frame(0); }
    },
    focus(i) { focusI = i; if (mode === "vg") focusCloud(); if (REDUCED) frame(0); },
    accent(k) { palette(k); if (REDUCED) frame(0); },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); scroller.removeEventListener("scroll", onScroll); window.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); document.removeEventListener("visibilitychange", vis); canvas.removeEventListener("click", onClick); canvas.removeEventListener("pointerdown", onDown); R.dispose(); scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); canvas.remove(); },
  };
  size(); raf = requestAnimationFrame(frame);
  if (REDUCED) frame(0);
  return api;
}

// SW 홈 3D 갤러리 — activetheory.net/work 처럼: 가운데 입자 이중나선 기둥, 그 둘레를 나선으로 도는 두꺼운 유리 패널(모듈마다 하나).
//   스크롤하면 카메라가 천천히 내려가며 기둥이 돌아 다음 패널이 앞으로 와요. 패널에 커서를 대면 기울고 살짝 깨져요(글리치), 누르면 그 모듈로.
//   그리는 순서: 장면 → 밝은 곳만 흐림(블룸) → 합성(구석 보라 · 청록 안개 · 비네트 · 필름 노이즈)
//   createGallery(host, { items, scroller, track, onPick, onActive }) → { goTo(i), destroy() } | null (WebGL 없음)
//   items: [{ course, no, of, title, ko, sub, tint:[a,b], href }]
import { loadThree } from "./stage.js";

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const STEP_A = 0.82;   // 패널 사이 각도 (라디안)
export const STEP_Y = 3.1;    // 패널 사이 높이
const R = 6.6, PW = 4.3, PH = 2.7;

const PV = `attribute vec4 seed; attribute vec3 tint; uniform float uTime, uPix, uSize; uniform vec3 uMouse; varying vec3 vC; varying float vA;
void main() { vec3 p = position; float a = uTime * 0.12 * (0.6 + seed.x * 0.8); float c = cos(a), s = sin(a);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p += vec3(sin(uTime * 0.4 + seed.y * 30.0), cos(uTime * 0.33 + seed.z * 30.0), sin(uTime * 0.27 + seed.w * 30.0)) * 0.12;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.3 + seed.x * 0.9) * uPix / -mv.z; vC = tint; vA = 0.35 + 0.65 * seed.y; }`;
const PF = `varying vec3 vC; varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (0.55 + a * 0.6), a * vA * 0.9); }`;
const GV = `varying vec2 vUv; varying vec3 vN, vV; void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// 유리 패널: 둥근 모서리 · 빛나는 테두리 · 비스듬한 반사광 · 프레넬 · (커서) 색 갈라짐 + 줄 흔들림
const GF = `uniform sampler2D map; uniform float uTime, uHover, uActive, uOp, uBack; uniform vec3 uTint; varying vec2 vUv; varying vec3 vN, vV;
float sdR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() { vec2 p = (vUv - 0.5) * vec2(${PW.toFixed(2)}, ${PH.toFixed(2)}); float d = sdR(p, vec2(${(PW / 2).toFixed(2)}, ${(PH / 2).toFixed(2)}), 0.26); if (d > 0.0) discard;
  float rim = smoothstep(-0.07, 0.0, d), fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  if (uBack > 0.5) { gl_FragColor = vec4(uTint * 0.05 + rim * uTint * 0.4, (0.18 + rim * 0.35) * uOp); return; }
  float band = 0.5 * step(0.96, fract(sin(floor(uTime * 9.0) * 12.9898 + floor(vUv.y * 24.0)) * 43758.5)) * uHover;
  vec2 uv = vUv + vec2(sin(vUv.y * 60.0 + uTime * 10.0) * 0.0025 * uHover + band * 0.03, 0.0);
  float g = 0.0012 + uHover * 0.005;
  vec4 tx = texture2D(map, uv);
  vec3 c = vec3(texture2D(map, uv + vec2(g, 0.0)).r, tx.g, texture2D(map, uv - vec2(g, 0.0)).b);
  float sheen = smoothstep(0.18, 0.0, abs(vUv.x * 0.8 + vUv.y - 1.05 - sin(uTime * 0.25) * 0.35)) * 0.16;
  c = c * (0.72 + uActive * 0.28) + uTint * 0.08 + rim * vec3(0.85, 0.92, 1.0) * (0.55 + uActive * 0.45) + fr * uTint * 0.5 + sheen;
  gl_FragColor = vec4(c, (0.28 + tx.a * 0.62 + rim * 0.25) * uOp); }`;
const QV = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT = `uniform sampler2D t; varying vec2 vUv; void main() { vec3 c = texture2D(t, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(c * smoothstep(0.45, 0.95, l), 1.0); }`;
const BLUR = `uniform sampler2D t; uniform vec2 uDir; varying vec2 vUv; void main() { vec3 c = texture2D(t, vUv).rgb * 0.227;
  c += (texture2D(t, vUv + uDir * 1.385).rgb + texture2D(t, vUv - uDir * 1.385).rgb) * 0.316; c += (texture2D(t, vUv + uDir * 3.231).rgb + texture2D(t, vUv - uDir * 3.231).rgb) * 0.07; gl_FragColor = vec4(c, 1.0); }`;
const COMP = `uniform sampler2D tScene, tBloom; uniform vec2 uRes; uniform float uTime, uFade; varying vec2 vUv;
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() { vec2 uv = vUv, d = uv - 0.5; float r = length(d);
  vec3 c = texture2D(tScene, uv).rgb + texture2D(tBloom, uv).rgb * 0.9;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  c += vec3(0.42, 0.22, 0.75) * smoothstep(0.9, 0.0, length((uv - vec2(0.0, 0.05)) * asp)) * 0.32;
  c += vec3(0.1, 0.45, 0.5) * smoothstep(0.85, 0.0, length((uv - vec2(1.0, 1.0)) * asp)) * 0.22;
  c *= mix(1.0, smoothstep(0.95, 0.25, r), 0.75);
  c = 1.0 - exp(-c * 1.15);
  c += (rnd(uv * uRes + fract(uTime) * 91.7) - 0.5) * 0.035;
  gl_FragColor = vec4(c * uFade, 1.0); }`;

// 패널 그림 (캔버스): 과정 색 빛망울 + 격자 + 번호 · 영어 제목(크게) · 한국어 제목 · 키워드
function paint(it, W = 1024, H = 640) {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const [a, b] = it.tint;
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "rgba(7,11,22,.35)"); bg.addColorStop(1, "rgba(13,18,34,.55)"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  let sd = (it.no * 9301 + it.course.length * 49297) % 233280; const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < 7; k++) {
    const x = rnd() * W, y = rnd() * H, r = 120 + rnd() * 260, rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, (k % 2 ? a : b) + "88"); rg.addColorStop(1, "transparent"); g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }
  g.globalAlpha = 0.07; g.strokeStyle = "#ffffff"; g.lineWidth = 1;
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.globalAlpha = 0.18; for (let y = 0; y < H; y += 3) { g.fillStyle = "#000"; g.fillRect(0, y, W, 1); }
  g.globalAlpha = 1;
  const mono = (sz) => `${sz}px "Share Tech Mono", "Geist Mono", ui-monospace, monospace`;
  g.fillStyle = "rgba(235,240,255,.7)"; g.font = mono(24); g.textBaseline = "top";
  g.fillText(`${String(it.no).padStart(2, "0")} / ${String(it.of).padStart(2, "0")}   —   ${it.course.toUpperCase()}`, 56, 50);
  // 영어 제목: 크게, 빛나게, 길면 줄여서
  let size = 104; g.font = mono(size);
  while (g.measureText(it.title).width > W - 112 && size > 56) { size -= 4; g.font = mono(size); }
  g.shadowColor = a; g.shadowBlur = 28; g.fillStyle = "#f4f7ff";
  g.textBaseline = "middle"; g.textAlign = "center"; g.fillText(it.title, W / 2, H / 2 - 22);
  g.shadowBlur = 0;
  g.font = `500 38px "Pretendard Variable", Pretendard, system-ui, sans-serif`; g.fillStyle = "rgba(240,244,255,.88)";
  g.fillText(it.ko, W / 2, H / 2 + 62);
  g.textAlign = "left"; g.textBaseline = "alphabetic"; g.font = `400 22px "Pretendard Variable", Pretendard, system-ui, sans-serif`; g.fillStyle = "rgba(235,240,255,.55)";
  g.fillText(it.sub.length > 46 ? it.sub.slice(0, 45) + "…" : it.sub, 56, H - 52);
  g.font = mono(22); g.textAlign = "right"; g.fillText("ENTER ->", W - 56, H - 52);
  return cv;
}

export async function createGallery(host, { items, scroller, track, onPick, onActive }) {
  let THREE; try { THREE = await loadThree(); } catch { return null; }
  if (!host.isConnected) return null;
  try { await Promise.race([Promise.all([document.fonts.load('48px "Share Tech Mono"'), document.fonts.load('500 38px "Pretendard Variable"', "가")]), new Promise((r) => setTimeout(r, 2500))]); } catch {}
  if (!host.isConnected) return null;
  const canvas = document.createElement("canvas"); canvas.className = "sg-canvas"; canvas.setAttribute("aria-hidden", "true"); host.prepend(canvas);
  let Rn; try { Rn = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" }); } catch { canvas.remove(); return null; }
  const phone = matchMedia("(max-width: 720px)").matches, dpr = Math.min(phone ? 1.4 : 1.6, devicePixelRatio || 1);
  Rn.setPixelRatio(1); Rn.setClearColor(0x05070f, 1);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(phone ? 50 : 38, 1, 0.1, 200);
  const n = items.length, depth = (n - 1) * STEP_Y;
  const L = (x, y, k) => x + (y - x) * k, col = (h) => new THREE.Color(h);

  // ---------- 기둥: 입자 이중나선 + 가로대(그래프 선) + 둘레 먼지
  const NP = phone ? 8000 : 20000;
  const pos = new Float32Array(NP * 3), tint = new Float32Array(NP * 3), seed = new Float32Array(NP * 4);
  const PAL = ["#ff5fd2", "#9b7bff", "#46e0d0", "#ffffff"].map(col);
  const top = 7, bottom = -depth - 7, H = top - bottom;
  for (let i = 0; i < NP; i++) {
    const k = Math.random(); let x, y, z, c;
    if (k < 0.62) { const t = Math.random(), strand = Math.random() < 0.5 ? 0 : Math.PI, ang = t * H * 0.55 + strand, rr = 2.4 + (Math.random() - 0.5) * 1.3;
      y = top - t * H; x = Math.cos(ang) * rr + (Math.random() - 0.5) * 0.25; z = Math.sin(ang) * rr + (Math.random() - 0.5) * 0.25; c = PAL[(Math.floor(t * 6) + (strand ? 1 : 0)) % 3].clone().lerp(PAL[3], Math.random() * 0.25); }
    else if (k < 0.8) { const t = Math.random(), ang = t * H * 0.55, u = Math.random() * 2 - 1;
      y = top - t * H; x = Math.cos(ang) * 2.4 * u; z = Math.sin(ang) * 2.4 * u; c = PAL[2].clone().lerp(PAL[3], 0.4); }
    else { const ang = Math.random() * Math.PI * 2, rr = 2.5 + Math.random() * 9; y = top - Math.random() * H; x = Math.cos(ang) * rr; z = Math.sin(ang) * rr; c = PAL[Math.floor(Math.random() * 2)].clone().multiplyScalar(0.7); }
    pos.set([x, y, z], i * 3); tint.set([c.r, c.g, c.b], i * 3); seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); pg.setAttribute("tint", new THREE.BufferAttribute(tint, 3)); pg.setAttribute("seed", new THREE.BufferAttribute(seed, 4));
  const pu = { uTime: { value: 0 }, uPix: { value: dpr }, uSize: { value: phone ? 54 : 64 }, uMouse: { value: new THREE.Vector3() } };
  const pts = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: pu, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; scene.add(pts);

  // ---------- 패널: 앞(그림 · 유리) + 뒤(두께처럼 보이는 어두운 판)
  const world = new THREE.Group(); scene.add(world);
  const geo = new THREE.PlaneGeometry(PW, PH, 1, 1);
  const panels = items.map((it, i) => {
    const tex = new THREE.CanvasTexture(paint(it)); tex.anisotropy = 4; tex.minFilter = THREE.LinearFilter;
    const mk = (back) => new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uTime: { value: 0 }, uHover: { value: 0 }, uActive: { value: 0 }, uOp: { value: 1 }, uBack: { value: back ? 1 : 0 }, uTint: { value: col(it.tint[0]) } },
      vertexShader: GV, fragmentShader: GF, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.Group(), front = new THREE.Mesh(geo, mk(false)), back = new THREE.Mesh(geo, mk(true));
    back.position.z = -0.16; back.scale.set(1.02, 1.03, 1); g.add(back, front);
    const a = i * STEP_A; g.position.set(Math.sin(a) * R, -i * STEP_Y, Math.cos(a) * R); g.rotation.y = a; g.userData = { i, a, front, back, hover: 0, active: 0, tilt: (i % 2 ? -1 : 1) * 0.06 };
    front.userData.i = i; world.add(g); return g;
  });

  // ---------- 후처리
  const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  const rtS = rt(4, 4), rtA = rt(4, 4), rtB = rt(4, 4);
  const post = new THREE.Scene(), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); post.add(quad);
  const mBright = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: QV, fragmentShader: BRIGHT });
  const mBlur = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: QV, fragmentShader: BLUR });
  const cU = { tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uFade: { value: REDUCED ? 1 : 0 } };
  const mComp = new THREE.ShaderMaterial({ uniforms: cU, vertexShader: QV, fragmentShader: COMP });
  const pass = (m, target) => { quad.material = m; Rn.setRenderTarget(target); Rn.render(post, ortho); };

  // ---------- 크기 · 입력 · 스크롤
  let w = 1, h = 1;
  function size() {
    const r = host.getBoundingClientRect(); w = Math.max(1, r.width); h = Math.max(1, r.height);
    const W = Math.round(w * dpr), Hh = Math.round(h * dpr);
    Rn.setSize(W, Hh, false); canvas.style.width = "100%"; canvas.style.height = "100%";
    cam.aspect = w / h; cam.updateProjectionMatrix();
    rtS.setSize(W, Hh); rtA.setSize(Math.max(1, W >> 2), Math.max(1, Hh >> 2)); rtB.setSize(Math.max(1, W >> 2), Math.max(1, Hh >> 2)); cU.uRes.value.set(W, Hh);
    if (REDUCED) frame();
  }
  const ro = new ResizeObserver(size); ro.observe(host);
  const trackTop = () => track.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const progressNow = () => { const max = Math.max(1, track.offsetHeight - scroller.clientHeight); return Math.max(0, Math.min(1, (scroller.scrollTop - trackTop()) / max)) * (n - 1); };
  let prog = progressNow(), progTo = prog, active = -1;
  const onScroll = () => { progTo = progressNow(); if (REDUCED) { prog = progTo; frame(); } };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, in: false }, ray = new THREE.Raycaster(), mv = new THREE.Vector2();
  let hovered = -1;
  const pick = () => { if (!mouse.in) return -1; mv.set(mouse.x, mouse.y); ray.setFromCamera(mv, cam); const hit = ray.intersectObjects(panels.map((g) => g.userData.front))[0]; return hit ? hit.object.userData.i : -1; };
  const onMove = (e) => { const r = canvas.getBoundingClientRect(); mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1; mouse.in = e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right; if (REDUCED) { hovered = pick(); canvas.style.cursor = hovered >= 0 ? "pointer" : ""; } };
  const onLeave = () => { mouse.in = false; };
  const onClick = (e) => { if (e.target !== canvas) return; mouse.in = true; onMove(e); const i = pick(); if (i >= 0) onPick?.(items[i], i); };
  window.addEventListener("pointermove", onMove, { passive: true }); canvas.addEventListener("pointerleave", onLeave); canvas.addEventListener("click", onClick);

  // ---------- 그리기
  let raf = 0, last = performance.now(), t = 0, alive = true, fadeTo = 1, camY = 2, leaving = 0;
  function frame(now) {
    now = now || performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const k = REDUCED ? 1 : 1 - Math.pow(0.0009, dt); // 부드러운 따라가기
    prog = L(prog, progTo, REDUCED ? 1 : 1 - Math.pow(0.02, dt));
    mouse.sx = L(mouse.sx, mouse.in ? mouse.x : 0, k * 0.15); mouse.sy = L(mouse.sy, mouse.in ? mouse.y : 0, k * 0.15);
    pu.uTime.value = REDUCED ? 0 : t; cU.uTime.value = t;
    cU.uFade.value = L(cU.uFade.value, fadeTo * (1 - leaving * 0.85), REDUCED ? 1 : 1 - Math.pow(0.05, dt));
    // 기둥이 돌아 지금 패널이 앞으로, 카메라는 내려가요
    world.rotation.y = -prog * STEP_A;
    camY = L(camY, -prog * STEP_Y + 0.25, REDUCED ? 1 : 1 - Math.pow(0.03, dt));
    const zoom = phone ? 17.5 : 15.2;
    cam.position.set(mouse.sx * 0.9 + (phone ? 0 : -0.6), camY + mouse.sy * 0.45, zoom - leaving * 6);
    cam.lookAt(phone ? 0 : -0.6, camY - 0.1, 0);
    pts.rotation.y = -prog * STEP_A * 0.6;
    const ai = Math.round(prog); if (ai !== active) { active = ai; onActive?.(items[ai], ai); }
    if (!REDUCED) { hovered = pick(); canvas.style.cursor = hovered >= 0 ? "pointer" : ""; }
    for (const g of panels) {
      const u = g.userData, f = u.front.material.uniforms, b = u.back.material.uniforms;
      u.hover = L(u.hover, u.i === hovered ? 1 : 0, REDUCED ? 1 : 1 - Math.pow(0.004, dt));
      u.active = L(u.active, u.i === active ? 1 : 0, REDUCED ? 1 : 1 - Math.pow(0.01, dt));
      const dist = Math.abs(u.i - prog);
      f.uTime.value = t; f.uHover.value = u.hover; f.uActive.value = u.active; b.uTime.value = t;
      const op = Math.max(0.12, 1 - Math.max(0, dist - 1.2) * 0.35); f.uOp.value = op; b.uOp.value = op;
      g.scale.setScalar(0.86 + u.active * 0.14 + u.hover * 0.03);
      g.rotation.x = u.tilt + (u.i === hovered ? -mouse.sy * 0.18 : 0) * u.hover + Math.sin(t * 0.5 + u.i) * 0.015;
      g.rotation.z = (u.i === hovered ? mouse.sx * -0.05 : 0) * u.hover;
      g.rotation.y = u.a + (u.i === hovered ? mouse.sx * 0.22 : 0) * u.hover;
      g.position.y = -u.i * STEP_Y + Math.sin(t * 0.6 + u.i * 1.7) * 0.06;
    }
    Rn.setRenderTarget(rtS); Rn.render(scene, cam);
    mBright.uniforms.t.value = rtS.texture; pass(mBright, rtA);
    for (let i = 0; i < 2; i++) { mBlur.uniforms.t.value = rtA.texture; mBlur.uniforms.uDir.value.set(1.4 / rtA.width, 0); pass(mBlur, rtB); mBlur.uniforms.t.value = rtB.texture; mBlur.uniforms.uDir.value.set(0, 1.4 / rtA.height); pass(mBlur, rtA); }
    cU.tScene.value = rtS.texture; cU.tBloom.value = rtA.texture; pass(mComp, null);
    if (alive && !REDUCED && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const vis = () => { if (!document.hidden && alive && !REDUCED) { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", vis);
  size(); if (REDUCED) frame(); else raf = requestAnimationFrame(frame);
  return {
    // 패널 i 로 스크롤 (부드럽게)
    goTo(i) { const max = Math.max(1, track.offsetHeight - scroller.clientHeight); scroller.scrollTo({ top: trackTop() + (Math.max(0, Math.min(n - 1, i)) / Math.max(1, n - 1)) * max, behavior: REDUCED ? "auto" : "smooth" }); },
    // 들어가기: 카메라가 앞으로 다가가며 어두워져요 → 0.7초 뒤 resolve
    leave() { if (REDUCED) return Promise.resolve(); const t0 = performance.now(); const step = () => { leaving = Math.min(1, (performance.now() - t0) / 700); if (leaving < 1 && alive) requestAnimationFrame(step); }; step(); return new Promise((ok) => setTimeout(ok, 700)); },
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); scroller.removeEventListener("scroll", onScroll); window.removeEventListener("pointermove", onMove); document.removeEventListener("visibilitychange", vis);
      [rtS, rtA, rtB].forEach((r) => r.dispose()); [mBright, mBlur, mComp].forEach((m) => m.dispose());
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.uniforms?.map?.value?.dispose(); o.material.dispose(); } }); Rn.dispose(); canvas.remove();
    },
  };
}

// 경영 마이크로디그리 — 홈의 모듈 지도. 안쪽으로 휜 무한 격자 (WebGL, three.js r128 을 이 화면에서만 불러와요).
// 내용 설명이 아니라 길 찾기용이에요. 끌 때만 움직이고(관성), 가만히 두면 멈춰 있어요. 눌러서 모듈을 골라요.
// WebGL 이 없거나 three 를 못 불러오면 null 을 돌려줘요 → home.js 가 평범한 목록을 보여줘요.
const ACCENT = "#D6FF4A";
let threeP = null;
function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!threeP) threeP = new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = "/vendor/three.min.js"; s.async = true;
    s.onload = () => (window.THREE ? ok(window.THREE) : no(new Error("three")));
    s.onerror = () => { threeP = null; no(new Error("three")); };
    document.head.append(s);
  });
  return threeP;
}
function hasGL() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl") || c.getContext("experimental-webgl")); } catch { return false; } }

const KO = '"Pretendard Variable", "Pretendard", system-ui, sans-serif', MONO = '"Geist Mono", ui-monospace, monospace', LAT = '"Geist", "Pretendard Variable", sans-serif';
function fontsReady(tiles) {
  if (!document.fonts?.load) return Promise.resolve();
  const text = tiles.map((t) => t.title + t.sub).join("");
  return Promise.all([document.fonts.load(`700 40px ${KO}`, text), document.fonts.load(`400 20px ${KO}`, text), document.fonts.load(`500 16px ${MONO}`, "0123456789/"), document.fonts.load(`700 40px ${LAT}`, "0123456789")]).catch(() => {});
}
function wrap(g, text, x, y, maxW, lh) {
  const chars = [...String(text)], lines = []; let line = "";
  for (const ch of chars) { const t = line + ch; if (g.measureText(t).width > maxW && line) { lines.push(line); line = ch; } else line = t; }
  lines.push(line);
  const y0 = y - (lines.length - 1) * lh; lines.forEach((l, j) => g.fillText(l, x, y0 + j * lh));
}
function tileTexture(THREE, t, hot) {
  const W = 640, H = 760, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#0A0B0D"; g.fillRect(0, 0, W, H);
  g.strokeStyle = hot ? "rgba(214,255,74,.9)" : "rgba(255,255,255,.14)"; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  g.fillStyle = "rgba(255,255,255,.55)"; g.font = `500 22px ${MONO}`; g.fillText(t.no, 40, 64);
  g.font = `500 24px ${KO}`; g.textAlign = "right"; g.fillText(t.phase, W - 40, 64); g.textAlign = "left";
  g.strokeStyle = "rgba(255,255,255,.09)"; g.lineWidth = 2; g.font = `700 300px ${LAT}`; g.strokeText(t.no, 30, 420);
  g.fillStyle = "#F4F4F2"; g.font = `700 58px ${KO}`; wrap(g, t.title, 40, 560, W - 80, 68);
  g.fillStyle = "rgba(255,255,255,.62)"; g.font = `400 26px ${KO}`; wrap(g, t.sub, 40, 650, W - 80, 34);
  g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(40, 708, W - 80, 4);
  g.fillStyle = ACCENT; g.fillRect(40, 708, (W - 80) * Math.max(0, Math.min(1, t.progress || 0)), 4);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; return tex;
}

// tiles: [{ no, title, sub, phase, progress }] · onPick(i)
export async function mountMap(canvas, tiles, onPick) {
  if (!hasGL() || !tiles.length) return null;
  let THREE;
  try { THREE = await loadThree(); } catch { return null; }
  if (!canvas.isConnected) return null;
  const cols = 4, TW = 1.6, TH = 1.9, GAP = 0.14, CW = TW + GAP, CH = TH + GAP;
  const rows = Math.ceil(tiles.length / cols), REP = 3, spanX = cols * CW, spanY = rows * CH;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return null; }
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 7.2);
  const uCurve = { value: 0.085 };
  const vert = `uniform float uCurve; varying vec2 vUv; varying float vFade;
    void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); float r2 = wp.x*wp.x*0.85 + wp.y*wp.y; wp.z -= uCurve * r2;
      vFade = clamp(1.0 - r2/70.0, 0.0, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const frag = `uniform sampler2D map; uniform float uHot; varying vec2 vUv; varying float vFade;
    void main(){ vec4 c = texture2D(map, vUv); c.rgb *= mix(0.55, 1.0, vFade) + uHot*0.15; c.a = vFade; gl_FragColor = c; }`;
  const geo = new THREE.PlaneGeometry(TW, TH, 24, 24), meshes = [];
  let cold = tiles.map((t) => tileTexture(THREE, t, false)), hotT = tiles.map((t) => tileTexture(THREE, t, true));
  for (let ry = 0; ry < REP; ry++) for (let rx = 0; rx < REP; rx++) tiles.forEach((t, i) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uCurve, map: { value: cold[i] }, uHot: { value: 0 } }, vertexShader: vert, fragmentShader: frag, transparent: true }));
    m.userData = { i, bx: (i % cols) * CW + rx * spanX, by: -Math.floor(i / cols) * CH - ry * spanY };
    scene.add(m); meshes.push(m);
  });
  const off = { x: -spanX - CW / 2, y: spanY }, vel = { x: 0, y: 0 }; // 처음엔 01 · 02 가 가운데에 오게
  const layout = () => {
    const wx = spanX * REP, wy = spanY * REP;
    for (const m of meshes) {
      let x = m.userData.bx + off.x, y = m.userData.by + off.y;
      x = ((x + wx / 2) % wx + wx) % wx - wx / 2; y = ((y + wy / 2) % wy + wy) % wy - wy / 2;
      m.position.set(x, y, 0);
    }
  };
  let dirty = true;
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let drag = null, moved = 0, hot = null;
  const pick = (e) => { const r = canvas.getBoundingClientRect(); ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1; ray.setFromCamera(ptr, camera); const h = ray.intersectObjects(meshes)[0]; return h ? h.object : null; };
  const setHot = (m) => {
    if (hot === m) return;
    if (hot) { hot.material.uniforms.map.value = cold[hot.userData.i]; hot.material.uniforms.uHot.value = 0; }
    hot = m; canvas.style.cursor = m ? "pointer" : "grab";
    if (m) { m.material.uniforms.map.value = hotT[m.userData.i]; m.material.uniforms.uHot.value = 1; }
    dirty = true;
  };
  const scale = () => 7.2 / (canvas.clientHeight || 600) * 0.82;
  const down = (e) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; vel.x = vel.y = 0; canvas.setPointerCapture?.(e.pointerId); canvas.style.cursor = "grabbing"; };
  const move = (e) => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y, s = scale(); drag = { x: e.clientX, y: e.clientY }; moved += Math.abs(dx) + Math.abs(dy); off.x += dx * s; off.y -= dy * s; vel.x = dx * s; vel.y = -dy * s; layout(); dirty = true; }
    else if (e.pointerType === "mouse") setHot(pick(e));
  };
  const up = (e) => { const was = drag; drag = null; canvas.style.cursor = "grab"; if (was && moved < 6) { const m = pick(e); if (m) onPick(m.userData.i); } };
  const leave = () => setHot(null);
  const wheel = (e) => { if (!e.ctrlKey && Math.abs(e.deltaX) < Math.abs(e.deltaY) && !e.shiftKey) return; e.preventDefault(); off.x -= (e.deltaX || e.deltaY) * 0.004; layout(); dirty = true; }; // 세로 휠은 페이지 스크롤에 양보, 가로(또는 Shift)만 격자를 옮겨요
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointerleave", leave); canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.style.cursor = "grab"; canvas.style.touchAction = "pan-y";
  const fit = () => { const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; };
  const ro = new ResizeObserver(fit); ro.observe(canvas); fit();
  // 화면에 안 보이면 그리지 않아요
  let visible = true; const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; }); io.observe(canvas);
  let raf = 0, alive = true;
  const tick = () => {
    if (!alive) return;
    if (!drag && (Math.abs(vel.x) + Math.abs(vel.y) > 0.0002)) { off.x += vel.x; off.y += vel.y; vel.x *= 0.92; vel.y *= 0.92; layout(); dirty = true; }
    if (dirty && visible) { renderer.render(scene, camera); dirty = false; }
    raf = requestAnimationFrame(tick);
  };
  fontsReady(tiles).then(() => {
    if (!alive) return;
    cold.forEach((t) => t.dispose()); hotT.forEach((t) => t.dispose());
    cold = tiles.map((t) => tileTexture(THREE, t, false)); hotT = tiles.map((t) => tileTexture(THREE, t, true));
    for (const m of meshes) m.material.uniforms.map.value = (m === hot ? hotT : cold)[m.userData.i];
    dirty = true;
  });
  layout(); raf = requestAnimationFrame(tick);
  return () => {
    alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointerleave", leave); canvas.removeEventListener("wheel", wheel);
    cold.forEach((t) => t.dispose()); hotT.forEach((t) => t.dispose()); geo.dispose(); meshes.forEach((m) => m.material.dispose()); renderer.dispose();
  };
}

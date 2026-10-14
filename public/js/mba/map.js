// 경영 마이크로디그리 — 홈의 모듈 지도. 안쪽으로 휜 무한 격자 (WebGL, three.js r128 을 이 화면에서만 불러와요).
// 길 찾기용 첫 화면이라 움직임이 있어요: 처음 들어오면 판들이 날아와 자리 잡고, 천천히 흐르고, 마우스를 따라 살짝 기울어요.
// 판마다 모듈 주제를 나타내는 그림(회계 = 재무제표 세 장, 데이터 = 점 분포 …)과 진도만큼 빛나는 테두리가 있어요.
// 끌면 움직이고(관성), 눌러서 모듈을 골라요. 움직임 줄이기 설정이면 흐름 · 기울기 · 날아오기를 끄고 멈춰 있어요.
// WebGL 이 없거나 three 를 못 불러오면 null 을 돌려줘요 → home.js 가 평범한 목록을 보여줘요.
const ACC = "#D6FF4A";
const REDUCED = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  const text = tiles.map((t) => t.title + t.sub + t.phase).join("");
  return Promise.all([document.fonts.load(`700 40px ${KO}`, text), document.fonts.load(`400 20px ${KO}`, text), document.fonts.load(`500 16px ${MONO}`, "0123456789/%"), document.fonts.load(`700 40px ${LAT}`, "0123456789")]).catch(() => {});
}
function wrap(g, text, x, y, maxW, lh) {
  const lines = []; let line = "";
  for (const ch of [...String(text)]) { const t = line + ch; if (g.measureText(t).width > maxW && line) { lines.push(line); line = ch; } else line = t; }
  lines.push(line);
  const y0 = y - (lines.length - 1) * lh; lines.forEach((l, j) => g.fillText(l, x, y0 + j * lh));
}

// ---------- 모듈 그림 (판 위쪽 그림 칸: x 40~600, y 96~396) ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function art(g, id) {
  const L = "rgba(255,255,255,.55)", D = "rgba(255,255,255,.18)", X0 = 60, X1 = 580, Y0 = 110, Y1 = 380, W = X1 - X0, H = Y1 - Y0;
  g.save(); g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
  const line = (pts, c = L, w = 3) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const dot = (x, y, r, c = ACC) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const box = (x, y, w, h, c = L) => { g.strokeStyle = c; g.lineWidth = 3; g.strokeRect(x, y, w, h); };
  if (id === "accounting") { // 재무제표 세 장 → 화살표
    [[X0, 150], [X0 + 190, 150], [X0 + 380, 150]].forEach(([x, y], i) => { box(x, y, 140, 190, i === 2 ? ACC : L); for (let k = 0; k < 5; k++) line([[x + 20, y + 36 + k * 30], [x + (k === 4 ? 70 : 120), y + 36 + k * 30]], k === 4 ? ACC : D, 3); });
    line([[X0 + 150, 245], [X0 + 182, 245]], ACC); line([[X0 + 340, 245], [X0 + 372, 245]], ACC);
  } else if (id === "data") { // 점 분포 + 회귀선
    const r = rng(7); for (let i = 0; i < 46; i++) { const x = X0 + r() * W, t = (x - X0) / W, y = Y1 - (t * 0.75 + 0.1) * H + (r() - 0.5) * 120; dot(x, Math.max(Y0, Math.min(Y1, y)), 5, i % 9 ? "rgba(255,255,255,.6)" : ACC); }
    line([[X0, Y1 - 0.1 * H], [X1, Y1 - 0.85 * H]], ACC, 4);
  } else if (id === "economics") { // 수요 · 공급
    line([[X0, Y0 + 10], [X1, Y1 - 10]], L, 4); line([[X0, Y1 - 10], [X1, Y0 + 10]], ACC, 4); dot((X0 + X1) / 2, (Y0 + Y1) / 2, 11, "#fff");
    line([[(X0 + X1) / 2, (Y0 + Y1) / 2], [(X0 + X1) / 2, Y1]], D, 2); line([[X0, (Y0 + Y1) / 2], [(X0 + X1) / 2, (Y0 + Y1) / 2]], D, 2);
  } else if (id === "finance") { // 복리 막대
    const n = 12, bw = W / n; for (let i = 0; i < n; i++) { const h = 30 + Math.pow(1.22, i) * 22; g.fillStyle = i === n - 1 ? ACC : "rgba(255,255,255," + (0.18 + i * 0.03) + ")"; g.fillRect(X0 + i * bw + 6, Y1 - Math.min(H, h), bw - 12, Math.min(H, h)); }
  } else if (id === "marketing") { // 퍼널
    [1, 0.72, 0.46, 0.26].forEach((w, i) => { const y = Y0 + 10 + i * 66, ww = W * w; g.fillStyle = i === 3 ? ACC : "rgba(255,255,255," + (0.5 - i * 0.1) + ")"; g.fillRect(X0 + (W - ww) / 2, y, ww, 50); });
  } else if (id === "operations") { // 흐름과 병목
    const xs = [X0, X0 + 135, X0 + 270, X0 + 405]; xs.forEach((x, i) => { box(x, i === 2 ? 210 : 175, 110, i === 2 ? 70 : 140, i === 2 ? ACC : L); if (i < 3) line([[x + 114, 245], [x + 131, 245]], D, 3); });
    for (let k = 0; k < 6; k++) dot(X0 + 250 - k * 18, 300 + (k % 2) * 16, 6, "rgba(255,255,255,.55)");
  } else if (id === "people") { // 연결망
    const r = rng(11), P = []; for (let i = 0; i < 9; i++) P.push([X0 + 40 + r() * (W - 80), Y0 + 20 + r() * (H - 40)]);
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if ((i + j) % 3 === 0) line([P[i], P[j]], D, 2);
    P.forEach(([x, y], i) => dot(x, y, i === 4 ? 14 : 9, i === 4 ? ACC : "rgba(255,255,255,.7)"));
  } else if (id === "strategy") { // 다섯 힘
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2 + 6, R = 120, pts = []; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    line([...pts, pts[0]], L, 3); pts.forEach((p) => { line([[cx, cy], p], D, 2); dot(p[0], p[1], 9, "rgba(255,255,255,.75)"); }); dot(cx, cy, 14);
  } else if (id === "leadership") { // ZOPA: 두 범위가 겹치는 곳
    line([[X0, 190], [X0 + 340, 190]], L, 10); line([[X0 + 200, 280], [X1, 280]], "rgba(255,255,255,.35)", 10);
    g.fillStyle = "rgba(214,255,74,.25)"; g.fillRect(X0 + 200, 160, 140, 150); line([[X0 + 200, 150], [X0 + 200, 320]], ACC, 3); line([[X0 + 340, 150], [X0 + 340, 320]], ACC, 3);
  } else if (id === "ethics-law") { // 저울
    const cx = (X0 + X1) / 2; line([[cx, 130], [cx, 360]], L, 4); line([[cx - 170, 170], [cx + 170, 150]], L, 4); line([[cx - 110, 360], [cx + 110, 360]], L, 4);
    [[cx - 170, 170], [cx + 170, 150]].forEach(([x, y], i) => { line([[x, y], [x - 50, y + 90], [x + 50, y + 90], [x, y]], i ? ACC : D, 3); });
  } else if (id === "startup") { // J 곡선 + 지분 막대
    const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([X0 + t * (W - 120), Y1 - (t < 0.35 ? 30 - t * 40 : 16 + Math.pow((t - 0.35) / 0.65, 2.2) * (H - 30))]); }
    line(pts, ACC, 4); dot(pts[40][0], pts[40][1], 10, "#fff");
    [[0.5, 0.3, 0.2]].forEach((parts) => { let y = Y1; parts.forEach((p, i) => { const h = p * 200; g.fillStyle = i ? "rgba(255,255,255," + (0.45 - i * 0.15) + ")" : ACC; g.fillRect(X1 - 70, y - h, 60, h - 4); y -= h; }); });
  } else { // capstone: 보고서 + 돋보기
    box(X0 + 60, 120, 260, 250, L); for (let k = 0; k < 7; k++) line([[X0 + 90, 160 + k * 28], [X0 + (k % 3 === 2 ? 210 : 290), 160 + k * 28]], D, 3);
    g.strokeStyle = ACC; g.lineWidth = 6; g.beginPath(); g.arc(X0 + 330, 250, 70, 0, Math.PI * 2); g.stroke(); line([[X0 + 380, 300], [X0 + 450, 370]], ACC, 10);
  }
  g.restore();
}
function tileTexture(THREE, t, hot) {
  const W = 640, H = 760, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#0A0B0D"; g.fillRect(0, 0, W, H);
  // 그림 칸 바탕 (아주 옅은 격자)
  g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1; for (let x = 40; x <= 600; x += 40) { g.beginPath(); g.moveTo(x, 96); g.lineTo(x, 396); g.stroke(); } for (let y = 96; y <= 396; y += 40) { g.beginPath(); g.moveTo(40, y); g.lineTo(600, y); g.stroke(); }
  art(g, t.id);
  g.strokeStyle = hot ? "rgba(214,255,74,.95)" : "rgba(255,255,255,.14)"; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  g.fillStyle = "rgba(255,255,255,.6)"; g.font = `500 22px ${MONO}`; g.fillText(t.no, 40, 62);
  g.font = `500 24px ${KO}`; g.textAlign = "right"; g.fillText(t.phase + (t.weeks ? " · " + t.weeks : ""), W - 40, 62); g.textAlign = "left";
  g.fillStyle = "#F4F4F2"; g.font = `700 56px ${KO}`; wrap(g, t.title, 40, 500, W - 80, 64);
  g.fillStyle = "rgba(255,255,255,.62)"; g.font = `400 25px ${KO}`; wrap(g, t.sub, 40, 590, W - 80, 33);
  const p = Math.max(0, Math.min(1, t.progress || 0));
  g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(40, 680, W - 80, 6);
  g.fillStyle = ACC; g.fillRect(40, 680, (W - 80) * p, 6);
  g.fillStyle = p > 0 ? ACC : "rgba(255,255,255,.45)"; g.font = `500 22px ${MONO}`; g.fillText(Math.round(p * 100) + "%", 40, 726);
  g.fillStyle = "rgba(255,255,255,.45)"; g.textAlign = "right"; g.fillText(t.count || "", W - 40, 726); g.textAlign = "left";
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; return tex;
}

// tiles: [{ id, no, title, sub, phase, weeks, progress, count }] · onPick(i)
export async function mountMap(canvas, tiles, onPick) {
  if (!hasGL() || !tiles.length) return null;
  let THREE;
  try { THREE = await loadThree(); } catch { return null; }
  if (!canvas.isConnected) return null;
  const still = REDUCED();
  const cols = 4, TW = 1.6, TH = 1.9, GAP = 0.14, CW = TW + GAP, CH = TH + GAP;
  const rows = Math.ceil(tiles.length / cols), REP = 3, spanX = cols * CW, spanY = rows * CH;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return null; }
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const CAMZ = 7.2; camera.position.set(0, 0, still ? CAMZ : 11.5);
  const uCurve = { value: still ? 0.085 : 0.2 };
  const vert = `uniform float uCurve; uniform float uIntro; uniform float uHot; varying vec2 vUv; varying float vFade;
    void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); float r2 = wp.x*wp.x*0.85 + wp.y*wp.y; wp.z -= uCurve * r2;
      wp.z += uHot * 0.22 - (1.0 - uIntro) * 5.0; vFade = clamp(1.0 - r2/70.0, 0.0, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const frag = `uniform sampler2D map; uniform float uHot; uniform float uIntro; uniform float uProg; varying vec2 vUv; varying float vFade;
    void main(){ vec4 c = texture2D(map, vUv); c.rgb *= mix(0.55, 1.0, vFade) + uHot*0.12;
      float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)); float rim = smoothstep(0.035, 0.0, e) * uProg;
      c.rgb += vec3(0.84, 1.0, 0.29) * rim * 0.75; c.a = vFade * uIntro; gl_FragColor = c; }`;
  const geo = new THREE.PlaneGeometry(TW, TH, 24, 24), meshes = [];
  let cold = tiles.map((t) => tileTexture(THREE, t, false)), hotT = tiles.map((t) => tileTexture(THREE, t, true));
  for (let ry = 0; ry < REP; ry++) for (let rx = 0; rx < REP; rx++) tiles.forEach((t, i) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uCurve, map: { value: cold[i] }, uHot: { value: 0 }, uIntro: { value: still ? 1 : 0 }, uProg: { value: Math.max(0, Math.min(1, t.progress || 0)) } }, vertexShader: vert, fragmentShader: frag, transparent: true }));
    m.userData = { i, bx: (i % cols) * CW + rx * spanX, by: -Math.floor(i / cols) * CH - ry * spanY, delay: 0 };
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
  layout();
  for (const m of meshes) m.userData.delay = Math.hypot(m.position.x, m.position.y) * 0.07; // 가운데부터 바깥으로 날아와요
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let drag = null, moved = 0, hot = null;
  const pick = (e) => { const r = canvas.getBoundingClientRect(); ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1; ray.setFromCamera(ptr, camera); const h = ray.intersectObjects(meshes)[0]; return h ? h.object : null; };
  const setHot = (m) => {
    if (hot === m) return;
    if (hot) { hot.material.uniforms.map.value = cold[hot.userData.i]; hot.material.uniforms.uHot.value = 0; }
    hot = m; canvas.style.cursor = m ? "pointer" : "grab";
    if (m) { m.material.uniforms.map.value = hotT[m.userData.i]; m.material.uniforms.uHot.value = 1; }
  };
  const scale = () => CAMZ / (canvas.clientHeight || 600) * 0.82;
  const down = (e) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; vel.x = vel.y = 0; canvas.setPointerCapture?.(e.pointerId); canvas.style.cursor = "grabbing"; };
  const move = (e) => {
    const r = canvas.getBoundingClientRect(); tilt.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; tilt.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y, s = scale(); drag = { x: e.clientX, y: e.clientY }; moved += Math.abs(dx) + Math.abs(dy); off.x += dx * s; off.y -= dy * s; vel.x = dx * s; vel.y = -dy * s; layout(); }
    else if (e.pointerType === "mouse") setHot(pick(e));
  };
  const up = (e) => { const was = drag; drag = null; canvas.style.cursor = "grab"; if (was && moved < 6) { const m = pick(e); if (m) onPick(m.userData.i); } };
  const leave = () => { setHot(null); tilt.tx = tilt.ty = 0; };
  const wheel = (e) => { if (!e.ctrlKey && Math.abs(e.deltaX) < Math.abs(e.deltaY) && !e.shiftKey) return; e.preventDefault(); off.x -= (e.deltaX || e.deltaY) * 0.004; layout(); };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointerleave", leave); canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.style.cursor = "grab"; canvas.style.touchAction = "pan-y";
  const fit = () => { const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(fit); ro.observe(canvas); fit();
  let visible = true; const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; }); io.observe(canvas);
  let raf = 0, alive = true, last = performance.now(); const t0 = last;
  const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
  const tick = (now) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (visible && !document.hidden) {
      const t = (now - t0) / 1000;
      if (!still) {
        // 날아오기 (1.4초) → 휘어짐 · 카메라가 제자리로
        const k = ease(t / 1.4); camera.position.z = 11.5 + (CAMZ - 11.5) * k; uCurve.value = 0.2 + (0.085 - 0.2) * k;
        for (const m of meshes) m.material.uniforms.uIntro.value = ease((t - m.userData.delay) / 0.9);
        // 천천히 흐름 (끌거나 판 위에 있으면 멈춰요)
        if (!drag && !hot && t > 1.2) off.x += 0.07 * dt;
        // 마우스 따라 기울기
        tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 4); tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 4);
        camera.position.x = tilt.x * 0.9; camera.position.y = -tilt.y * 0.6; camera.lookAt(0, 0, 0);
      }
      if (!drag && (Math.abs(vel.x) + Math.abs(vel.y) > 0.0002)) { off.x += vel.x; off.y += vel.y; vel.x *= 0.92; vel.y *= 0.92; }
      layout();
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);
  };
  fontsReady(tiles).then(() => {
    if (!alive) return;
    cold.forEach((t) => t.dispose()); hotT.forEach((t) => t.dispose());
    cold = tiles.map((t) => tileTexture(THREE, t, false)); hotT = tiles.map((t) => tileTexture(THREE, t, true));
    for (const m of meshes) m.material.uniforms.map.value = (m === hot ? hotT : cold)[m.userData.i];
  });
  raf = requestAnimationFrame(tick);
  return () => {
    alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointerleave", leave); canvas.removeEventListener("wheel", wheel);
    cold.forEach((t) => t.dispose()); hotT.forEach((t) => t.dispose()); geo.dispose(); meshes.forEach((m) => m.material.dispose()); renderer.dispose();
  };
}

// Second Brain (aianykey 레퍼런스) — 노트가 태그별 성운처럼 모여 빛나는 3D 입자 그래프.
import * as THREE from "three";

const VERT = `
  attribute float size; attribute vec3 color; varying vec3 vColor; varying float vFade;
  uniform float uScale;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFade = clamp(1.0 - (-mv.z - 8.0) / 30.0, 0.25, 1.0);
    gl_PointSize = size * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  varying vec3 vColor; varying float vFade; uniform float uAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 1.7);
    gl_FragColor = vec4(vColor, a * uAlpha * vFade);
  }`;

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export function mountBrain3D(el, { onPick, onHover, onFrame } = {}) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "brain-canvas";
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  let dist = 26; camera.position.set(0, 0, dist);
  const world = new THREE.Group(); scene.add(world);

  const mkMat = (alpha) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uAlpha: { value: alpha }, uScale: { value: 300 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const nodeMat = mkMat(1.25), dustMat = mkMat(0.8);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false });
  const hiMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  let nodePts, dustPts, lines, hiLines, nodes = [], clusters = [], adj = new Map();

  function build(data) {
    [nodePts, dustPts, lines, hiLines].forEach((o) => { if (o) { o.geometry.dispose(); world.remove(o); } });
    nodes = data.nodes; clusters = data.clusters;
    // 태그 무리의 중심을 구 위에 고르게 (피보나치 구)
    const R = 7 + Math.sqrt(clusters.length) * 1.2;
    clusters.forEach((c, i) => {
      const y = 1 - (i + 0.5) / clusters.length * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      c.pos = new THREE.Vector3(Math.cos(th) * r * R, y * R * 0.75, Math.sin(th) * r * R);
      if (clusters.length === 1) c.pos.set(0, 0, 0);
    });
    const byCluster = new Map(clusters.map((c) => [c.key, c]));
    nodes.forEach((n) => {
      const c = byCluster.get(n.cluster), spread = 1.6 + Math.sqrt(c.count) * 0.55;
      n.pos = c.pos.clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(spread));
    });
    // 노드
    const np = new Float32Array(nodes.length * 3), nc = new Float32Array(nodes.length * 3), ns = new Float32Array(nodes.length);
    nodes.forEach((n, i) => {
      np.set([n.pos.x, n.pos.y, n.pos.z], i * 3);
      const col = new THREE.Color(n.color); nc.set([col.r, col.g, col.b], i * 3);
      ns[i] = n.ghost ? 1.6 : 3 + Math.sqrt(n.deg) * 1.4;
    });
    const ng = new THREE.BufferGeometry();
    ng.setAttribute("position", new THREE.BufferAttribute(np, 3)); ng.setAttribute("color", new THREE.BufferAttribute(nc, 3)); ng.setAttribute("size", new THREE.BufferAttribute(ns, 1));
    nodePts = new THREE.Points(ng, nodeMat); world.add(nodePts);
    // 성운 먼지: 노드마다 작은 입자 구름
    const per = Math.max(24, Math.min(90, Math.floor(6000 / Math.max(1, nodes.length))));
    const total = nodes.length * per + clusters.length * 160;
    const dp = new Float32Array(total * 3), dc = new Float32Array(total * 3), ds = new Float32Array(total);
    let j = 0;
    const put = (p, col, s) => { dp.set([p.x, p.y, p.z], j * 3); dc.set([col.r, col.g, col.b], j * 3); ds[j] = s; j++; };
    nodes.forEach((n) => { const col = new THREE.Color(n.color).multiplyScalar(0.55); for (let k = 0; k < per; k++) put(n.pos.clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(0.55 + Math.random() * 0.5)), col, 0.35 + Math.random() * 0.5); });
    clusters.forEach((c) => { const col = new THREE.Color(0xbfc4cc).multiplyScalar(0.35); const sp = 2 + Math.sqrt(c.count) * 0.7; for (let k = 0; k < 160; k++) put(c.pos.clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(sp)), col, 0.3 + Math.random() * 0.4); });
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3)); dg.setAttribute("color", new THREE.BufferAttribute(dc, 3)); dg.setAttribute("size", new THREE.BufferAttribute(ds, 1));
    dustPts = new THREE.Points(dg, dustMat); world.add(dustPts);
    // 링크
    adj = new Map(nodes.map((n) => [n, new Set()]));
    const lp = [];
    for (const [a, b] of data.links) { lp.push(a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z); adj.get(a).add(b); adj.get(b).add(a); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    lines = new THREE.LineSegments(lg, lineMat); world.add(lines);
    hiLines = new THREE.LineSegments(new THREE.BufferGeometry(), hiMat); world.add(hiLines);
  }

  // ---------- interaction: 드래그 회전, 휠 확대, 가까운 노드 고르기 ----------
  const rot = { x: 0.25, y: 0, vx: 0, vy: 0 }; let drag = null, hover = null, mouse = null;
  const dom = renderer.domElement;
  dom.addEventListener("pointerdown", (e) => { dom.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: false }; });
  dom.addEventListener("pointermove", (e) => {
    const r = dom.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    rot.vy = dx * 0.004; rot.vx = dy * 0.004; drag.x = e.clientX; drag.y = e.clientY;
  });
  dom.addEventListener("pointerup", () => { if (drag && !drag.moved && hover) onPick?.(hover); drag = null; });
  dom.addEventListener("pointerleave", () => { mouse = null; });
  dom.addEventListener("wheel", (e) => { e.preventDefault(); dist = Math.max(10, Math.min(60, dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });

  const v = new THREE.Vector3();
  function project(p) { v.copy(p).applyMatrix4(world.matrixWorld).project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, z: v.z }; }
  function pickNear() {
    if (!mouse || drag?.moved) return null;
    let best = null, bd = 16;
    for (const n of nodes) { const s = project(n.pos); if (s.z > 1) continue; const d = Math.hypot(s.x - mouse.x, s.y - mouse.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function highlight(n) {
    const lp = [];
    if (n) for (const m of adj.get(n) || []) lp.push(n.pos.x, n.pos.y, n.pos.z, m.pos.x, m.pos.y, m.pos.z);
    hiLines.geometry.dispose();
    hiLines.geometry = new THREE.BufferGeometry(); hiLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
  }

  let W = 1, H = 1;
  function resize() { W = el.clientWidth || 1; H = el.clientHeight || 1; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); nodeMat.uniforms.uScale.value = dustMat.uniforms.uScale.value = H * 0.9; }
  const ro = new ResizeObserver(resize); ro.observe(el); resize();

  let raf = 0, alive = true; const clock = new THREE.Clock();
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const t = clock.getElapsedTime();
    if (!drag) { rot.vy += ((reduce ? 0 : 0.0016) - rot.vy) * 0.02; rot.vx *= 0.94; }
    rot.y += rot.vy; rot.x = Math.max(-1.2, Math.min(1.2, rot.x + rot.vx));
    world.rotation.set(rot.x, rot.y, 0);
    camera.position.z += (dist - camera.position.z) * 0.1;
    nodeMat.uniforms.uAlpha.value = 0.9 + Math.sin(t * 2.1) * 0.08; // 은은한 깜빡임
    world.updateMatrixWorld();
    const h = pickNear();
    if (h !== hover) { hover = h; dom.style.cursor = h ? "pointer" : "grab"; highlight(h); lineMat.opacity = h ? 0.08 : 0.24; onHover?.(h); }
    onFrame?.(project, hover);
    renderer.render(scene, camera);
  }
  frame();

  return {
    build,
    focus(c) { if (!c) return; const target = Math.atan2(c.pos.x, c.pos.z); rot.y = -target; rot.x = Math.atan2(c.pos.y, 12) * 0.6; dist = 16; },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); [nodePts, dustPts, lines, hiLines].forEach((o) => o?.geometry.dispose()); [nodeMat, dustMat, lineMat, hiMat].forEach((m) => m.dispose()); renderer.dispose(); dom.remove(); },
  };
}

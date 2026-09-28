// 3D 링 장면 (IGLOO 레퍼런스) — 안개 속에 떠 있는 점토 블록 링 4개.
// 채운 칸 = 점토(무광 + 코팅), 빈 칸 = 굴절하는 유리, 크롬 구슬 = 흘러간 시간.
// 들어올 때와 사람을 바꿀 때 조각들이 날아와 링으로 조립돼요. 링을 누르면 onPick(key).
import * as THREE from "three";
import { RoomEnvironment } from "/vendor/three/RoomEnvironment.js";

export function supportsWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const LAYOUT = [ // 바깥 → 안쪽: 반지름, 폭, 두께
  { r: 3.05, w: 0.50, d: 0.56 },
  { r: 2.36, w: 0.42, d: 0.46 },
  { r: 1.76, w: 0.36, d: 0.38 },
  { r: 1.24, w: 0.30, d: 0.30 },
];
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function sectorGeometry(r0, r1, th0, th1, depth) {
  // th: 12시에서 시계 방향 라디안 → three 각도(3시에서 반시계)
  const a0 = Math.PI / 2 - th1, a1 = Math.PI / 2 - th0;
  const bevel = Math.min(0.07, (r1 - r0) * 0.22);
  const s = new THREE.Shape();
  s.absarc(0, 0, r1 - bevel, a0, a1, false);
  s.absarc(0, 0, r0 + bevel, a1, a0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4,
    curveSegments: Math.max(6, Math.ceil((th1 - th0) * 18)),
  });
  g.translate(0, 0, -depth / 2 + bevel);
  return g;
}

export function mountRing3D(el, { onPick, onHover } = {}) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // 무채색 톤을 그대로 지켜요
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  el.appendChild(renderer.domElement);
  renderer.domElement.className = "ring3d-canvas";

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const fog = new THREE.Fog(0xeeeeef, 21, 38); // 링(거리 19)은 선명하게, 먼지와 무대만 안개 속으로
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const camHome = new THREE.Vector3(0, 0.4, 19), camTarget = camHome.clone();
  camera.position.copy(camHome);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x77777f, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(4.5, 7, 9); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(-6, 3, -5); scene.add(rim);

  // IGLOO 무대: 그림자 받는 바닥 + 가는 발광 고리 두 개
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.ShadowMaterial({ opacity: 0.14 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -3.75; ground.receiveShadow = true; scene.add(ground);
  const stage = new THREE.Group(); stage.position.y = -3.7; scene.add(stage);
  const stageMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: true });
  [3.4, 4.1].forEach((r, i) => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012 + i * 0.004, 8, 160), stageMat); t.rotation.x = Math.PI / 2; stage.add(t); });

  // 떠다니는 먼지 입자
  const N = 420, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = (Math.random() - 0.5) * 10; pos[i * 3 + 2] = (Math.random() - 0.5) * 8 - 1; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dustMat = new THREE.PointsMaterial({ size: 0.028, color: 0x777780, transparent: true, opacity: 0.45, depthWrite: false });
  const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);

  const root = new THREE.Group(); scene.add(root);
  let ringGroups = [], parts = [], born = 0, hovered = -1, pick = null;
  // 빈 칸: 흐린 반투명 유리 (채운 점토와 한눈에 구분되게)
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false, side: THREE.DoubleSide });
  const chromeMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.07, envMapIntensity: 1.6 });
  const clayCache = new Map();
  const clay = (hex) => {
    if (!clayCache.has(hex)) clayCache.set(hex, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: 0.58, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.45 }));
    return clayCache.get(hex);
  };

  function clear() {
    for (const g of ringGroups) { g.traverse((o) => { if (o.geometry && o.geometry !== beadGeo) o.geometry.dispose(); }); root.remove(g); }
    ringGroups = []; parts = [];
  }
  const beadGeo = new THREE.SphereGeometry(1, 32, 16);

  /** rings: [{ key, value, time, color, segments?: [{color, done}] }] 바깥 → 안쪽 */
  function set(rings, { assemble = true } = {}) {
    clear();
    rings.forEach((ring, i) => {
      const L = LAYOUT[i], g = new THREE.Group(); g.userData = { i, key: ring.key, lift: 0 };
      const segs = ring.segments && ring.segments.length ? ring.segments : null;
      const n = segs ? segs.length : ring.n;
      const span = (Math.PI * 2) / n, gap = Math.min(span * 0.22, 0.09 + (0.5 - L.w) * 0.1);
      const filled = segs ? 0 : clamp01(ring.value) * n;
      for (let k = 0; k < n; k++) {
        const th0 = k * span + gap / 2, th1 = (k + 1) * span - gap / 2;
        const pieces = [];
        if (segs) pieces.push([th0, th1, segs[k].done ? clay(segs[k].color) : glassMat]);
        else {
          const f = clamp01(filled - k);
          if (f >= 0.999) pieces.push([th0, th1, clay(ring.color)]);
          else if (f <= 0.001) pieces.push([th0, th1, glassMat]);
          else { const mid = th0 + (th1 - th0) * f; pieces.push([th0, mid, clay(ring.color)], [mid + 0.012, th1, glassMat]); }
        }
        for (const [a, b, mat] of pieces) {
          if (b - a < 0.02) continue;
          const m = new THREE.Mesh(sectorGeometry(L.r - L.w / 2, L.r + L.w / 2, a, b, L.d), mat);
          m.castShadow = mat !== glassMat; m.receiveShadow = true; m.userData.ring = i;
          const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.8 + 0.2).normalize().multiplyScalar(4 + Math.random() * 5);
          parts.push({ m, from: dir, rot: new THREE.Euler((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3), delay: i * 0.1 + k * 0.035 + Math.random() * 0.08 });
          g.add(m);
        }
      }
      if (ring.time != null) {
        const th = clamp01(ring.time) * Math.PI * 2, a = Math.PI / 2 - th;
        const b = new THREE.Mesh(beadGeo, chromeMat);
        const br = Math.max(0.1, L.w * 0.3);
        b.scale.setScalar(br); b.position.set(Math.cos(a) * L.r, Math.sin(a) * L.r, L.d / 2 + br * 0.9);
        b.castShadow = true; b.userData.ring = i;
        parts.push({ m: b, from: new THREE.Vector3(0, 0, 6), rot: new THREE.Euler(), delay: 0.9 + i * 0.08, base: b.position.clone() });
        g.add(b);
      }
      root.add(g); ringGroups.push(g);
    });
    born = performance.now() / 1000;
    if (!assemble || reduce) born = -1e9;
  }

  function theme({ fogColor, dustColor, stageColor, glassColor, glassOpacity }) {
    fog.color.set(fogColor); dustMat.color.set(dustColor); stageMat.color.set(stageColor);
    if (glassColor) glassMat.color.set(glassColor);
    if (glassOpacity) glassMat.opacity = glassOpacity;
  }

  // ---------- interaction ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(9, 9), look = { x: 0, y: 0 };
  const onMove = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    look.x = ptr.x; look.y = ptr.y;
  };
  const onLeave = () => { ptr.set(9, 9); look.x = look.y = 0; };
  const onClick = () => { if (hovered >= 0 && onPick) { pick = { i: hovered, t: performance.now() / 1000 }; } };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerleave", onLeave);
  renderer.domElement.addEventListener("click", onClick);

  function resize() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 좁은 화면에서는 뒤로 물러나 링 전체가 보이게
    camHome.z = w / h < 1 ? 19 / Math.max(0.55, w / h) * 0.85 : 19;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(el); resize();

  // ---------- loop ----------
  let raf = 0, alive = true;
  const clock = new THREE.Clock();
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const t = clock.getElapsedTime(), now = performance.now() / 1000;

    // 조립 애니메이션
    for (const p of parts) {
      const k = easeOut(clamp01((now - born - p.delay) / 1.15));
      if (p.base) p.m.position.copy(p.base).addScaledVector(p.from, 1 - k);
      else p.m.position.copy(p.from).multiplyScalar(1 - k);
      p.m.rotation.set(p.rot.x * (1 - k), p.rot.y * (1 - k), p.rot.z * (1 - k));
      const s = 0.6 + 0.4 * k; if (!p.base) p.m.scale.setScalar(s);
    }

    // 호버: 가리킨 링이 앞으로 살짝 나와요
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(root.children, true)[0];
    const hi = hit ? hit.object.userData.ring ?? -1 : -1;
    if (hi !== hovered) { hovered = hi; renderer.domElement.style.cursor = hi >= 0 ? "pointer" : ""; onHover?.(hi >= 0 ? ringGroups[hi].userData.key : null); }
    for (const g of ringGroups) {
      const target = g.userData.i === hovered ? 0.42 : 0;
      g.userData.lift += (target - g.userData.lift) * 0.12;
      g.position.z = g.userData.lift;
    }

    // 떠 있는 느낌 + 시선 따라 기울기
    const m = reduce ? 0 : 1;
    root.rotation.x += ((-0.14 - look.y * 0.14) * 1 - root.rotation.x) * 0.06;
    root.rotation.y += ((look.x * 0.22) - root.rotation.y) * 0.06;
    root.position.y = Math.sin(t * 0.7) * 0.07 * m;
    stage.rotation.y = t * 0.05 * m;
    dust.rotation.y = t * 0.012 * m;
    dust.position.y = Math.sin(t * 0.2) * 0.2 * m;

    // 누르면 카메라가 그 링으로 다가간 뒤 이동
    if (pick) {
      const k = clamp01((now - pick.t) / 0.55);
      camTarget.set(camHome.x, camHome.y, camHome.z - 6.5 * easeOut(k));
      if (k >= 1) { const key = ringGroups[pick.i]?.userData.key; pick = null; onPick?.(key); }
    } else camTarget.copy(camHome);
    camera.position.lerp(camTarget, 0.18);
    camera.lookAt(0, 0.1, 0);
    renderer.render(scene, camera);
  }
  frame();

  const api = {
    set, theme,
    // 테스트·디버그용: 화면 좌표에서 어느 링이 맞는지
    probe(cx, cy) {
      const r = renderer.domElement.getBoundingClientRect();
      const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, camera);
      const h = ray.intersectObjects(root.children, true)[0];
      return { ring: h ? h.object.userData.ring : null, groups: ringGroups.length, meshes: root.children.reduce((n, g) => n + g.children.length, 0), cam: camera.position.toArray().map((x) => +x.toFixed(2)) };
    },
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); clear();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener("click", onClick);
      [dustGeo, beadGeo, ground.geometry].forEach((g) => g.dispose());
      stage.children.forEach((c) => c.geometry.dispose());
      [glassMat, chromeMat, dustMat, stageMat, ...clayCache.values()].forEach((mm) => mm.dispose());
      pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
  renderer.domElement._ring3d = api;
  return api;
}

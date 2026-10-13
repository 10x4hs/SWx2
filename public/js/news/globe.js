// 뉴스 Signal Map 의 지구본 — three.js 를 CDN 에서 필요할 때만 불러요 (뉴스 화면을 열 때만).
// 육지는 world-atlas 의 110m 육지 모양을 캔버스에 그려 점으로 찍어요 (텍스처 없이 가볍게).
// 밖으로 내주는 것: createGlobe(el, opts) → { setData, focus, project, highlight, resize, destroy }
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
const TOPO_URL = "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
const LAND_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json";

// 나라 코드 → [위도, 경도] (대략 무게중심)
export const CENTROID = {
  US: [39, -98], CN: [35, 104], TW: [23.7, 121], RU: [58, 60], UA: [49, 31], JP: [36.5, 138.5], KR: [36.3, 127.9], KP: [40, 127],
  IN: [22, 79], IR: [32.5, 54], IL: [31.4, 35], SA: [24, 45], AE: [24, 54.3], TR: [39, 35], DE: [51, 10.4], FR: [46.5, 2.5],
  GB: [53, -1.5], BE: [50.8, 4.4], PL: [52, 19.4], NL: [52.2, 5.3], AU: [-25, 134], BR: [-10, -52], MX: [23.5, -102], CA: [57, -101],
  SG: [1.35, 103.8], VN: [16, 107.8], PH: [12.5, 122], ID: [-2.5, 118], PK: [30, 70], EG: [26.5, 30], ZA: [-29, 24.5], NG: [9.5, 8],
  SY: [35, 38.5], IQ: [33, 43.7], KZ: [48, 67], IT: [42.8, 12.5], ES: [40.3, -3.7], SE: [62, 15], FI: [64, 26], NO: [61, 9], CH: [46.8, 8.2],
  AT: [47.6, 14], CZ: [49.8, 15.5], HU: [47.1, 19.4], RO: [45.9, 25], GR: [39, 22], BY: [53.7, 28], GE: [42.2, 43.5], AM: [40.2, 45],
  AZ: [40.3, 47.7], AF: [33.8, 66], BD: [23.8, 90.3], MM: [21, 96], TH: [15, 101], MY: [3.8, 102], NZ: [-41.5, 172.5], AR: [-35, -65],
  CL: [-33, -71], CO: [4, -73], VE: [7, -66], CU: [21.6, -79], ET: [9, 39.5], KE: [0.2, 37.9], SD: [15.5, 30], LY: [27, 17], DZ: [28, 2.6],
  MA: [32, -6], QA: [25.3, 51.2], KW: [29.3, 47.6], YE: [15.6, 48], OM: [21, 57], JO: [31.2, 36.5], LB: [33.9, 35.9], PS: [31.9, 35.2],
};

export async function createGlobe(el, { reduced = false, onPick = () => {}, onHover = () => {} } = {}) {
  const [THREE, topo, land] = await Promise.all([
    import(THREE_URL),
    import(TOPO_URL),
    fetch(LAND_URL).then((r) => r.json()),
  ]);
  const css = getComputedStyle(el);
  const C = { accent: css.getPropertyValue("--nw-accent").trim() || "#5ef0ff", hot: css.getPropertyValue("--nw-hot").trim() || "#ff5d5d", dot: css.getPropertyValue("--nw-land").trim() || "#3d5266" };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.6);
  const world = new THREE.Group();
  scene.add(world);

  // 바다 구 + 가장자리 빛(대기)
  world.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), new THREE.MeshBasicMaterial({ color: 0x070b11 })));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.14, 64, 64), new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(C.accent) } },
    vertexShader: "varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); v = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader: "uniform vec3 c; varying vec3 n; varying vec3 v; void main(){ float f = pow(max(0., .66 - dot(n, vec3(0., 0., 1.))), 4.); gl_FragColor = vec4(c, 1.) * f * 1.1; }",
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(glow);

  // 육지 점: 육지 모양을 가로 2:1 캔버스에 그리고 격자마다 칠해졌는지 봐요
  const W = 720, H = 360, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff";
  const geo = topo.feature(land, land.objects.land);
  for (const f of geo.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      g.beginPath();
      for (const ring of poly) ring.forEach(([lng, lat], i) => { const x = (lng + 180) / 360 * W, y = (90 - lat) / 180 * H; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.fill("evenodd");
    }
  }
  const px = g.getImageData(0, 0, W, H).data;
  const pts = [];
  for (let lat = -84; lat <= 84; lat += 1.15) {
    const ring = Math.max(1, Math.round(Math.cos(lat * Math.PI / 180) * 310));
    for (let k = 0; k < ring; k++) {
      const lng = -180 + (k / ring) * 360;
      const x = Math.floor((lng + 180) / 360 * W), y = Math.floor((90 - lat) / 180 * H);
      if (px[(y * W + x) * 4] > 128) { const v = vec(lat, lng, 1.002); pts.push(v.x, v.y, v.z); }
    }
  }
  const landGeo = new THREE.BufferGeometry();
  landGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  world.add(new THREE.Points(landGeo, new THREE.PointsMaterial({ color: new THREE.Color(C.dot), size: 0.012, sizeAttenuation: true, transparent: true, opacity: 1 })));

  function vec(lat, lng, r = 1) {
    const phi = (90 - lat) * Math.PI / 180, th = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
  }

  // ---------- 신호 점 · 줄기 호 ----------
  const layer = new THREE.Group();
  world.add(layer);
  let spots = [], arcs = [], pickables = [], hi = null;
  const ringGeo = new THREE.RingGeometry(0.012, 0.0145, 40), coreGeo = new THREE.CircleGeometry(0.008, 20);

  function setData({ spots: S = [], arcs: A = [] }) {
    layer.clear();
    spots = []; arcs = []; pickables = [];
    for (const s of S) {
      const ll = CENTROID[s.code]; if (!ll) continue;
      const p = vec(ll[0], ll[1], 1.004), color = new THREE.Color(s.disputed ? C.hot : C.accent);
      const grp = new THREE.Group();
      grp.position.copy(p); grp.lookAt(p.clone().multiplyScalar(2));
      const scale = 1 + Math.min(1, Math.log2(1 + s.n) * 0.35);
      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
      core.scale.setScalar(scale);
      const rings = [0, 0.5].map((ph) => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); m.userData.ph = ph; grp.add(m); return m; });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.035 * scale, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.rotation.x = Math.PI / 2; beam.position.z = 0.0175 * scale;
      grp.add(core, beam);
      // 고르기 쉽게 보이지 않는 큰 원
      const hit = new THREE.Mesh(new THREE.CircleGeometry(0.05 * scale, 12), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData = { kind: "spot", code: s.code }; grp.add(hit); pickables.push(hit);
      grp.userData = { code: s.code, rings, core, scale };
      layer.add(grp); spots.push(grp);
    }
    for (const a of A) {
      const codes = a.codes.filter((c) => CENTROID[c]);
      for (let i = 0; i < codes.length - 1; i++) {
        const p0 = vec(...CENTROID[codes[i]], 1.004), p1 = vec(...CENTROID[codes[i + 1]], 1.004);
        const mid = p0.clone().add(p1).multiplyScalar(0.5), d = p0.distanceTo(p1);
        mid.setLength(1 + 0.04 + d * 0.2);
        const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.accent), transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false });
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0032, 6, false), mat);
        tube.userData = { kind: "arc", id: a.id };
        const fat = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.02, 5, false), new THREE.MeshBasicMaterial({ visible: false }));
        fat.userData = { kind: "arc", id: a.id };
        const comet = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending }));
        layer.add(tube, fat, comet); pickables.push(fat);
        arcs.push({ id: a.id, tube, comet, curve, off: Math.random() });
      }
    }
  }

  function highlight(sel) { hi = sel; } // { code } | { thread } | null

  // ---------- 돌리기 · 끌기 · 고르기 ----------
  let rotY = -3.3, rotX = 0.42, velY = reduced ? 0 : 0.0016, target = null, drag = null, idleAt = 0;
  world.rotation.set(rotX, rotY, 0);
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const cvs = renderer.domElement;
  const pick = (e) => {
    const r = cvs.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (!hit) return null;
    // 지구 뒤편은 무시
    const n = hit.point.clone().normalize(), toCam = camera.position.clone().sub(hit.point).normalize();
    return n.dot(toCam) > 0.05 ? hit.object.userData : null;
  };
  cvs.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cvs.setPointerCapture(e.pointerId); });
  cvs.addEventListener("pointermove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      rotY += dx * 0.006; rotX = Math.max(-1.1, Math.min(1.1, rotX + dy * 0.004)); target = null; idleAt = performance.now();
      return;
    }
    const u = pick(e); cvs.style.cursor = u ? "pointer" : "grab"; onHover(u);
  });
  cvs.addEventListener("pointerup", (e) => { const d = drag; drag = null; if (d && d.moved < 6) { const u = pick(e); if (u) onPick(u); } });
  cvs.addEventListener("pointerleave", () => onHover(null));

  function focus(code) {
    const ll = CENTROID[code]; if (!ll) return;
    // 그 나라가 카메라(+z) 쪽으로 오도록
    let ty = Math.PI / 2 - (ll[1] + 180) * Math.PI / 180;
    while (ty - rotY > Math.PI) ty -= Math.PI * 2;
    while (rotY - ty > Math.PI) ty += Math.PI * 2;
    target = { y: ty, x: Math.max(-1, Math.min(1, ll[0] * Math.PI / 180 * 0.85)) };
    idleAt = performance.now();
  }

  /** 나라 → 화면 좌표 (인트로 글자가 날아갈 곳). 뒤편이면 visible=false */
  function project(code) {
    const ll = CENTROID[code]; if (!ll) return null;
    const p = vec(ll[0], ll[1], 1.01).applyMatrix4(world.matrixWorld);
    const vis = p.clone().normalize().dot(camera.position.clone().sub(p).normalize()) > 0;
    const s = p.clone().project(camera), r = cvs.getBoundingClientRect();
    return { x: r.left + (s.x + 1) / 2 * r.width, y: r.top + (1 - s.y) / 2 * r.height, visible: vis };
  }

  function resize() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    cvs.style.width = w + "px"; cvs.style.height = h + "px";
    camera.aspect = w / h;
    camera.position.z = w / h < 0.9 ? 3.6 / Math.max(0.55, w / h) * 0.9 : 3.6;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(el); resize();

  let raf = 0, alive = true, t0 = performance.now();
  const tick = (now) => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    const t = (now - t0) / 1000;
    if (target) {
      rotY += (target.y - rotY) * 0.07; rotX += (target.x - rotX) * 0.07;
      if (Math.abs(target.y - rotY) < 0.002 && Math.abs(target.x - rotX) < 0.002) target = null;
    } else if (!drag && now - idleAt > 2500) rotY += velY;
    world.rotation.set(rotX, rotY, 0);
    for (const s of spots) {
      const on = hi && hi.code === s.userData.code, k = on ? 1.8 : 1;
      s.userData.core.scale.setScalar(s.userData.scale * k);
      for (const m of s.userData.rings) {
        const p = reduced ? 0.4 : (t * 0.8 + m.userData.ph) % 1;
        m.scale.setScalar(s.userData.scale * k * (1 + p * 1.8));
        m.material.opacity = (1 - p) * (on ? 1 : 0.75);
      }
    }
    for (const a of arcs) {
      const on = hi && hi.thread === a.id;
      a.tube.material.opacity = on ? 0.95 : hi ? 0.12 : 0.38;
      const p = reduced ? 0.5 : (t * 0.35 + a.off) % 1;
      a.comet.position.copy(a.curve.getPoint(p));
      a.comet.material.opacity = on || !hi ? Math.sin(p * Math.PI) : 0.1;
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    setData, focus, project, highlight, resize,
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); cvs.remove(); },
  };
}

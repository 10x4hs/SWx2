// 개발 흐름 홈의 3D 흐름 고리 — 각진(로우폴리) ∞ 고리를 홀로그램 점 껍질로 감싸고 12개 정거장을 놓아요.
//   마우스를 대면 그 둘레 점들이 흩어졌다가 천천히 제자리로 돌아오고(점마다 세기가 달라요), 가리킨 정거장은 커지며 돌아요 (three.js r128, /vendor/three.min.js 를 처음 열 때 받아요)
//   mountLoop(canvas, { stations, progress, labels, lobes, onHover, onPick, onLost }) → { highlight(i), destroy() } | null
//   onLost: 브라우저가 그래픽 문맥을 잃고 1.5초 안에 되살리지 않을 때 (홈이 새 캔버스로 다시 붙여요)
//   움직임 줄이기 설정이면 날아오기 · 흐르는 점 · 맥박 · 흔들림을 끄고 멈춘 그림만 그려요. 공부 내용 그림은 전부 2D (여긴 길 찾기용).
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
export async function mountLoop(canvas, opts) {
  let THREE; try { THREE = await loadThree(); } catch { return null; }
  if (!canvas.isConnected) return null;
  const api = loop(canvas, opts);
  return api.ok ? api : null;
}
var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var CYAN = 0xffe14d;

  function hasGL() {
    try { var c = document.createElement("canvas"); return !!(c.getContext("webgl") || c.getContext("experimental-webgl")); } catch (e) { return false; }
  }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }
  function dotTexture() {
    var S = 64, c = document.createElement("canvas"); c.width = c.height = S;
    var g = c.getContext("2d"), r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,240,170,.55)"); r.addColorStop(1, "rgba(255,225,77,0)");
    g.fillStyle = r; g.fillRect(0, 0, S, S); return new THREE.CanvasTexture(c);
  }
  function ringTexture() {
    var S = 192, c = document.createElement("canvas"); c.width = c.height = S;
    var g = c.getContext("2d"); g.beginPath(); g.arc(S / 2, S / 2, 80, 0, Math.PI * 2);
    g.strokeStyle = "rgba(255,225,77,1)"; g.lineWidth = 4; g.stroke(); return new THREE.CanvasTexture(c);
  }

  function loop(canvas, opts) {
    var noop = { ok: false, highlight: function () {}, destroy: function () {} };
    if (!window.THREE || !hasGL()) return noop;
    opts = opts || {};
    var st = opts.stations || [], labels = opts.labels || [], lobes = opts.lobes || [];
    var onHover = opts.onHover || function () {}, onPick = opts.onPick || function () {};
    var A = 4.4, FLOOR = -1.05, mats = [], geos = [], texs = [];

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x141518, 14, 30);
    var camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    function add(o) { scene.add(o); return o; }
    function glowMat(opacity) {
      var m = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false });
      mats.push(m); return m;
    }
    function tube(cv, segs, r, closed) { var g = new THREE.TubeGeometry(cv, segs, r, 8, closed); geos.push(g); return g; }

    // 1) ∞ 고리: 가운데(출시)에서 출발 → 왼쪽 고리(만들기 전) → 가운데 → 오른쪽 고리(만들고 운영)
    //    두 줄이 엇갈리는 가운데는 위아래로 살짝 띄워서 겹치지 않게 해요
    var raw = [];
    for (var i = 0; i < 480; i++) {
      var t = Math.PI / 2 + (i / 480) * Math.PI * 2, s = Math.sin(t), c = Math.cos(t), d = 1 + s * s;
      raw.push(new THREE.Vector3(A * c / d, 0.24 * s, (A * s * c / d) * 1.3));
    }
    var curve = new THREE.CatmullRomCurve3(raw, true, "centripetal");
    // 각진(로우폴리) 고리: 6각 단면 + 면마다 다른 밝기 (flatShading)
    add(new THREE.AmbientLight(0xffffff, 0.35));
    var key = add(new THREE.DirectionalLight(0xffffff, 1.0)); key.position.set(-4, 8, 6);
    var rim = add(new THREE.DirectionalLight(0xffffff, 0.45)); rim.position.set(6, 2, -6);
    function polyMat(color) { var m = new THREE.MeshLambertMaterial({ color: color, flatShading: true }); mats.push(m); return m; }
    var tg = new THREE.TubeGeometry(curve, 140, 0.11, 5, true); geos.push(tg);
    add(new THREE.Mesh(tg, polyMat(0x3a3d42)));


    // 2-1) 홀로그램 점 껍질: 고리 둘레에 점을 고르게 뿌려요 (후처리 없이 그려서 깜빡이지 않아요). 끝낸 길은 노랑, 가리킨 정거장 근처는 밝게
    var SEG = 900, RAD = 6, fr = curve.computeFrenetFrames(SEG, true), shN = SEG * RAD;
    var shPos = new Float32Array(shN * 3), shCol = new Float32Array(shN * 3), shU = new Float32Array(shN);
    for (var si = 0; si < SEG; si++) for (var ri = 0; ri < RAD; ri++) {
      var su = si / SEG, ang = (ri / RAD) * Math.PI * 2 + (si % 2) * (Math.PI / RAD), cp = curve.getPointAt(su), nn = fr.normals[si], bb = fr.binormals[si], rr = 0.2, n3 = (si * RAD + ri) * 3;
      shPos[n3] = cp.x + rr * (Math.cos(ang) * nn.x + Math.sin(ang) * bb.x); shPos[n3 + 1] = cp.y + rr * (Math.cos(ang) * nn.y + Math.sin(ang) * bb.y); shPos[n3 + 2] = cp.z + rr * (Math.cos(ang) * nn.z + Math.sin(ang) * bb.z);
      shU[si * RAD + ri] = su;
    }
    var shSeed = new Float32Array(shN); for (var sk = 0; sk < shN; sk++) shSeed[sk] = Math.random();
    var shG = new THREE.BufferGeometry(); shG.setAttribute("position", new THREE.BufferAttribute(shPos, 3)); shG.setAttribute("tint", new THREE.BufferAttribute(shCol, 3)); shG.setAttribute("seed", new THREE.BufferAttribute(shSeed, 1)); geos.push(shG);
    // 흩어지기: 화면에서 마우스와 가까운 점일수록 마우스 반대쪽으로 밀리고(점마다 0.3~1배), 앞뒤로도 조금 튀어요. 세기(uPower)는 마우스 속도에 따라 커졌다가 천천히 0으로
    var SU = { uMouse: { value: new THREE.Vector2(9, 9) }, uPower: { value: 0 }, uAspect: { value: 1 }, uTan: { value: Math.tan(18 * Math.PI / 180) }, uTime: { value: 0 }, uSize: { value: 0.058 }, uScale: { value: 400 } };
    var shM = new THREE.ShaderMaterial({
      uniforms: SU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: [
        "attribute vec3 tint; attribute float seed;",
        "uniform vec2 uMouse; uniform float uPower, uAspect, uTan, uTime, uSize, uScale;",
        "varying vec3 vTint; varying float vHit;",
        "void main() {",
        "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
        "  vec4 cp = projectionMatrix * mv;",
        "  vec2 s = cp.xy / cp.w; s.x *= uAspect;",
        "  vec2 d = s - uMouse; float dist = length(d);",
        "  float hit = uPower * (1.0 - smoothstep(0.0, 0.38, dist));",
        "  vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0, 1.0);",
        "  float wob = 0.85 + 0.15 * sin(uTime * 2.4 + seed * 6.2832);",
        "  float push = hit * (0.06 + 0.3 * seed) * wob;",
        "  mv.xy += dir * push * uTan * (-mv.z);",
        "  mv.z += hit * (seed - 0.35) * 1.8;",
        "  vHit = hit; vTint = tint;",
        "  gl_Position = projectionMatrix * mv;",
        "  gl_PointSize = uSize * (uScale / -mv.z) * (1.0 + hit * 1.1);",
        "}"].join("\n"),
      fragmentShader: [
        "varying vec3 vTint; varying float vHit;",
        "void main() {",
        "  vec2 c = gl_PointCoord - 0.5; float r = length(c);",
        "  if (r > 0.5) discard;",
        "  float a = (1.0 - smoothstep(0.18, 0.5, r)) * 0.95;",
        "  gl_FragColor = vec4(mix(vTint, vec3(1.0, 0.97, 0.86), min(1.0, vHit * 0.75)), a);",
        "}"].join("\n"),
    }); mats.push(shM);
    add(new THREE.Points(shG, shM));
    // 2) 정거장 자리: 고리마다 6개를 길이 기준으로 고르게
    var F = [0.1, 0.26, 0.42, 0.58, 0.74, 0.9], U = [];
    F.forEach(function (f) { U.push(f * 0.5); }); F.forEach(function (f) { U.push(0.5 + f * 0.5); });
    var P = U.map(function (u) { return curve.getPointAt(u); });

    // 3) 끝낸 길: 진도만큼 밝고 굵게
    var prog = Math.max(0, Math.min(12, opts.progress || 0));
    function uAt(p) {
      if (p <= 0) return 0; if (p >= 12) return 1;
      var k = Math.floor(p), f = p - k, u0 = k === 0 ? 0 : U[k - 1], u1 = U[k];
      return u0 + (u1 - u0) * f;
    }
    var uDone = uAt(prog);
    if (uDone > 0.002) {
      var dp = [], K = Math.max(8, Math.round(uDone * 320));
      for (var k = 0; k <= K; k++) dp.push(curve.getPointAt((k / K) * uDone));
      var doneCurve = new THREE.CatmullRomCurve3(dp, false, "centripetal");
      var dg = new THREE.TubeGeometry(doneCurve, Math.max(12, Math.round(K / 2)), 0.135, 5, false); geos.push(dg);
      add(new THREE.Mesh(dg, polyMat(CYAN)));
    }


    function paintShell(hotI) {
      var yl = new THREE.Color(CYAN), gr = new THREE.Color(0x6d7178), wh = new THREE.Color(0xffffff), c = new THREE.Color(), hu = hotI >= 0 ? U[hotI] : -1;
      for (var k2 = 0; k2 < shN; k2++) {
        var u2 = shU[k2]; c.copy(u2 <= uDone ? yl : gr);
        if (hu >= 0) { var du = Math.abs(u2 - hu); du = Math.min(du, 1 - du); if (du < 0.04) c.lerp(wh, 1 - du / 0.04); }
        shCol[k2 * 3] = c.r; shCol[k2 * 3 + 1] = c.g; shCol[k2 * 3 + 2] = c.b;
      }
      shG.attributes.tint.needsUpdate = true;
    }
    paintShell(-1);
    // 4) 정거장: 동그라미 + 바닥까지 내린 빛기둥 + 바닥 고리
    var sprites = [], pillars = [], baseOp = [];
    P.forEach(function (p, i) {
      var s = st[i] || { no: (i < 9 ? "0" : "") + (i + 1), state: "next" };
      // 정거장 = 각진 20면체 (끝냄은 강조색, 지금은 흰색, 아직은 회색). 번호는 HTML 이름표가 보여 줘요
      var ig = new THREE.IcosahedronGeometry(0.34, 0); geos.push(ig);
      var sp = new THREE.Mesh(ig, polyMat(s.state === "done" ? CYAN : (s.state === "now" ? 0xffffff : 0x55585e)));
      sp.position.copy(p); sp.rotation.set(i * 0.7, i * 1.3, 0); add(sp); sprites.push(sp);
      var lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, FLOOR, p.z), new THREE.Vector3(p.x, p.y - 0.32, p.z)]); geos.push(lg);
      baseOp[i] = s.state === "next" ? 0.16 : 0.42;
      var lm = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: baseOp[i], blending: THREE.AdditiveBlending, depthWrite: false }); mats.push(lm);
      pillars.push(add(new THREE.Line(lg, lm)));
      var rg = new THREE.RingGeometry(0.09, 0.125, 40); geos.push(rg);
      var ring = add(new THREE.Mesh(rg, glowMat(s.state === "next" ? 0.22 : 0.55)));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, FLOOR + 0.003, p.z);
    });

    // 5) 바닥 격자 (멀수록 안개로 흐려져요)
    var grid = add(new THREE.GridHelper(36, 72, CYAN, CYAN));
    grid.material.transparent = true; grid.material.opacity = 0.09; grid.material.depthWrite = false; grid.position.y = FLOOR;

    // 6) 흐르는 점: 일감이 단계를 따라 흘러가는 모습 (움직임 줄이기면 제자리)
    var N = 42, pos = new Float32Array(N * 3), seeds = [];
    for (var j = 0; j < N; j++) seeds.push({ u: (j / N + Math.random() * 0.02) % 1, v: 0.014 + Math.random() * 0.016 });
    var pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geos.push(pg);
    var dot = dotTexture(); texs.push(dot);
    var pm = new THREE.PointsMaterial({ size: 0.14, map: dot, color: 0xfff3b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); mats.push(pm);
    add(new THREE.Points(pg, pm));
    function placePackets(dt) {
      for (var j = 0; j < N; j++) {
        var sd = seeds[j]; if (!REDUCED) sd.u = (sd.u + sd.v * dt) % 1;
        var q = curve.getPointAt(sd.u); pos[j * 3] = q.x; pos[j * 3 + 1] = q.y + 0.02; pos[j * 3 + 2] = q.z;
      }
      pg.attributes.position.needsUpdate = true;
    }

    // 7) 지금 정거장의 맥박 고리
    var cur = -1; for (var n = 0; n < st.length; n++) if (st[n].state === "now") cur = n;
    var pulse = null;
    if (cur >= 0) {
      var rtx = ringTexture(); texs.push(rtx);
      var plm = new THREE.SpriteMaterial({ map: rtx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); mats.push(plm);
      pulse = add(new THREE.Sprite(plm)); pulse.position.copy(P[cur]);
    }

    // 카메라: 날아오기 → 비스듬히 내려다보기. 마우스를 따라 조금 기울고, 끌면 돌아가요
    var R0 = 11.5, Rfit = R0, flyT = REDUCED ? 1 : 0, clock = 0, last = performance.now();
    var want = { yaw: 0, pitch: 0 }, tilt = { yaw: 0, pitch: 0 }, dragOff = { yaw: 0, pitch: 0 }, drag = null, moved = 0;
    var look = new THREE.Vector3(0, -0.3, 0);
    function placeCam() {
      var f = ease(Math.min(1, flyT));
      var R = Rfit * (1 + (1 - f) * 0.8), p = 0.6 + (1 - f) * 0.55 + tilt.pitch + dragOff.pitch;
      var y = tilt.yaw + dragOff.yaw - (1 - f) * 0.5;
      camera.position.set(Math.sin(y) * Math.cos(p) * R, Math.sin(p) * R, Math.cos(y) * Math.cos(p) * R);
      camera.lookAt(look);
    }
    function fit() {
      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      var th = Math.tan((camera.fov / 2) * Math.PI / 180) * camera.aspect;
      Rfit = Math.max(R0, (A * 2 * 1.25) / (2 * th));
      // 안개는 카메라 거리에 맞춰요: 화면이 좁아 카메라가 멀어져도 고리는 흐려지지 않고, 먼 바닥 격자만 흐려져요
      scene.fog.near = Rfit + 5; scene.fog.far = Rfit + 24;
      SU.uAspect.value = camera.aspect; SU.uScale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2;
    }

    // 이름표를 정거장 위로 옮기고, 화면 좌표를 기억해 둬요 (마우스 고르기에 써요)
    var v = new THREE.Vector3(), scr = [];
    function project() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      for (var i = 0; i < P.length; i++) {
        v.copy(P[i]).project(camera);
        scr[i] = { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
        var el = labels[i];
        if (el) el.style.transform = "translate(" + Math.round(scr[i].x) + "px," + Math.round(scr[i].y - 24) + "px) translate(-50%,-100%)";
      }
      for (var k = 0; k < lobes.length; k++) {
        var lb = lobes[k]; if (!lb) continue;
        v.set(k ? A * 0.62 : -A * 0.62, FLOOR, A * 1.05).project(camera);
        lb.style.transform = "translate(" + Math.round((v.x + 1) / 2 * w) + "px," + Math.round((1 - v.y) / 2 * h) + "px) translate(-50%,-50%)";
      }
    }
    var hot = -1;
    function setHot(i) {
      if (i === hot) return;
      if (hot >= 0) { sprites[hot].scale.setScalar(1); pillars[hot].material.opacity = baseOp[hot]; }
      hot = i;
      if (hot >= 0) { sprites[hot].scale.setScalar(1.4); pillars[hot].material.opacity = 0.85; }
      paintShell(hot);
      canvas.style.cursor = hot >= 0 ? "pointer" : (drag ? "grabbing" : "grab");
    }
    function nearest(e) {
      var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = -1, bd = 34 * 34;
      for (var i = 0; i < scr.length; i++) { var dx = scr[i].x - x, dy = scr[i].y - y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; } }
      return best;
    }
    function down(e) { drag = { x: e.clientX, y: e.clientY }; moved = 0; if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); }
    var mouseT = new THREE.Vector2(9, 9), inside = false, speed = 0, lastPX = null;
    function move(e) {
      var r = canvas.getBoundingClientRect();
      var nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((e.clientY - r.top) / r.height) * 2;
      mouseT.set(nx * camera.aspect, ny); inside = true;
      if (lastPX) speed += Math.hypot(e.clientX - lastPX.x, e.clientY - lastPX.y); lastPX = { x: e.clientX, y: e.clientY };
      want.yaw = (((e.clientX - r.left) / r.width) * 2 - 1) * 0.28;
      want.pitch = (((e.clientY - r.top) / r.height) * 2 - 1) * 0.12;
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
        dragOff.yaw = Math.max(-0.7, Math.min(0.7, dragOff.yaw - dx * 0.004));
        dragOff.pitch = Math.max(-0.25, Math.min(0.35, dragOff.pitch + dy * 0.003));
        canvas.style.cursor = "grabbing";
      } else { var i = nearest(e); if (i !== hot) { setHot(i); onHover(i); } }
    }
    function up(e) { var was = drag; drag = null; canvas.style.cursor = hot >= 0 ? "pointer" : "grab"; if (was && moved < 6) { var i = nearest(e); if (i >= 0) onPick(i); } }
    function leave() { want.yaw = 0; want.pitch = 0; inside = false; lastPX = null; if (hot >= 0) { setHot(-1); onHover(-1); } }
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointerleave", leave);
    canvas.style.cursor = "grab"; canvas.style.touchAction = "pan-y";
    var lostTimer = 0;
    function ctxLost(e) { e.preventDefault(); clearTimeout(lostTimer); lostTimer = setTimeout(function () { if (alive && opts.onLost) opts.onLost(); }, 1500); }
    function ctxBack() { clearTimeout(lostTimer); }
    canvas.addEventListener("webglcontextlost", ctxLost); canvas.addEventListener("webglcontextrestored", ctxBack);

    var ro = new ResizeObserver(fit); ro.observe(canvas); fit();
    var visible = true, io = null;
    if (window.IntersectionObserver) { io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }); io.observe(canvas); }
    var alive = true, raf = 0;
    function tick(now) {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible || document.hidden) return;
      clock += dt; if (flyT < 1) flyT = Math.min(1, flyT + dt / 2.0);
      tilt.yaw += (want.yaw - tilt.yaw) * 0.08; tilt.pitch += (want.pitch - tilt.pitch) * 0.08;
      placeCam(); placePackets(dt);
      // 흩어지기: 마우스 위치는 살짝 늦게 따라가고, 세기는 빨리 차오르고 천천히 가라앉아요 (움직임 줄이기면 0)
      SU.uTime.value = clock; speed *= 0.88;
      SU.uMouse.value.lerp(mouseT, 0.22);
      var want0 = REDUCED || !inside ? 0 : Math.min(1.6, 0.85 + speed * 0.012), pw = SU.uPower.value;
      SU.uPower.value = pw + (want0 - pw) * (want0 > pw ? 0.16 : 0.05);
      if (hot >= 0 && !REDUCED) { sprites[hot].rotation.y += dt * 1.6; sprites[hot].rotation.x += dt * 0.5; }
      if (pulse) {
        var ph = REDUCED ? 0.4 : (clock * 0.45) % 1, sc = 0.72 + ph * 0.95;
        pulse.scale.set(sc, sc, 1); pulse.material.opacity = REDUCED ? 0.35 : (1 - ph) * 0.65;
      }
      renderer.render(scene, camera); project();
    }
    placePackets(0); placeCam();
    raf = requestAnimationFrame(tick);
    return {
      ok: true,
      highlight: function (i) { setHot(typeof i === "number" ? i : -1); },
      destroy: function () {
        alive = false; cancelAnimationFrame(raf); ro.disconnect(); if (io) io.disconnect();
        canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointerleave", leave);
        canvas.removeEventListener("webglcontextlost", ctxLost); canvas.removeEventListener("webglcontextrestored", ctxBack); clearTimeout(lostTimer);
        geos.forEach(function (g) { g.dispose(); }); mats.forEach(function (m) { m.dispose(); }); texs.forEach(function (t) { t.dispose(); });
        grid.geometry.dispose(); grid.material.dispose(); renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) {} // 문맥을 바로 돌려줘요 (브라우저마다 WebGL 문맥 수에 한도가 있어요)
      }
    };
  }


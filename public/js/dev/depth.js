// 깊이 길 (#/sw 책 · #/sw/<과정> 장) — 판을 아래 · 안쪽으로 줄지어 놓고, 휠 · 스와이프 · ↑↓ · 오른쪽 점으로 한 판씩 내려가요
//   2026-10-21: 책이 늘어도 아래로 길어지지 않게. 한 번에 하나만 또렷하고 나머지는 안개 속으로. 글은 WebGL 밖 HTML 패널에.
//   그림은 움직일 때(또는 크기 · 색이 바뀔 때)만 그려요. 움직임 줄이기면 바로 이동.
//   mountDepth(stage, items, { shape:[w,h], onFocus(i), onOpen(i), start, label }) → Promise<{ go(i), focus(), update(i, face), destroy }>
//   items[i] = { dot: "점 이름", face: { top, title, sub, ratio } } — 실패하면(three · WebGL) reject → 부르는 쪽이 목록으로 돌아가요
import { loadThree, cssColor } from "../figs/three-kit.js";
import { reduced } from "../figs/kit.js";

const GAP_X = 0.7, GAP_Y = 3.4, GAP_Z = 6.5, MS = 700;

export async function mountDepth(stage, items, o = {}) {
  const THREE = await loadThree();
  const [W, H] = o.shape || [3, 4];
  const canvas = document.createElement("canvas"); canvas.className = "dp-c";
  canvas.tabIndex = 0; canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", o.label || "깊이 길 — 휠 · 스와이프 · 위아래 화살표로 이동");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); } catch (e) { throw new Error("webgl"); }
  if (!renderer.getContext()) throw new Error("webgl");
  stage.prepend(canvas);
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
  scene.fog = new THREE.Fog(0x000000, 12, 34);
  const col = (n, fb) => cssColor(THREE, stage, n, fb);
  const css = (n, fb) => getComputedStyle(stage).getPropertyValue(n).trim() || fb;
  const at = (i) => new THREE.Vector3(i * GAP_X, -i * GAP_Y, -i * GAP_Z);

  // 판 하나 = 얼굴(글자 그린 캔버스) + 가는 테두리
  const geo = new THREE.PlaneGeometry(W, H);
  const edgeGeo = new THREE.EdgesGeometry(geo);
  const TW = 512, TH = Math.round(512 * H / W);
  const slabs = items.map((it, i) => {
    const cv = document.createElement("canvas"); cv.width = TW; cv.height = TH;
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    const face = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ transparent: true }));
    const g = new THREE.Group(); g.add(face, edge); g.position.copy(at(i)); g.rotation.y = -0.22; g.userData.i = i;
    face.userData.i = i; scene.add(g);
    return { g, face, edge, cv, tex, data: it.face, k: 0 };
  });
  // 판을 잇는 가는 등뼈 선 + 판마다 작은 눈금
  const spinePts = []; items.forEach((_, i) => { const p = at(i); spinePts.push(p.x - W * 0.5 - 0.5, p.y - H * 0.5 - 0.35, p.z); });
  const spineGeo = new THREE.BufferGeometry(); spineGeo.setAttribute("position", new THREE.Float32BufferAttribute(spinePts, 3));
  const spine = new THREE.Line(spineGeo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 })); scene.add(spine);
  const tickGeo = new THREE.BufferGeometry(); const tk = [];
  items.forEach((_, i) => { const p = at(i); const x = p.x - W * 0.5 - 0.5, y = p.y - H * 0.5 - 0.35; tk.push(x, y, p.z, x + 0.5, y, p.z); });
  tickGeo.setAttribute("position", new THREE.Float32BufferAttribute(tk, 3));
  const ticks = new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ transparent: true })); scene.add(ticks);

  function wrapText(ctx, text, maxW) {
    const out = []; let line = "";
    for (const word of text.split(/(\s+)/)) {
      if (ctx.measureText(line + word).width <= maxW) { line += word; continue; }
      if (line.trim()) out.push(line.trim()); line = "";
      if (!word.trim()) continue;
      for (const ch of [...word]) { if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
    }
    if (line.trim()) out.push(line.trim()); return out;
  }
  function paintFace(s, focused) {
    const c = s.cv.getContext("2d"), d = s.data || {};
    const sheet = css("--pp-sheet", "#fff"), ink = css("--pp-ink", "#111"), mute = css("--pp-mute", "#888"), line = css("--pp-line", "#ddd"), acc = css("--pp-acc", "#2A55C4");
    const serif = css("--pp-serif", "serif"), ko = css("--pp-ko", "sans-serif");
    c.clearRect(0, 0, TW, TH); c.fillStyle = sheet; c.fillRect(0, 0, TW, TH);
    const P = 40;
    c.fillStyle = focused ? acc : mute; c.font = `600 22px ${ko}`; c.textBaseline = "top"; c.fillText(d.top || "", P, P);
    c.fillStyle = ink; c.font = `700 ${TH > TW ? 44 : 40}px ${serif}`;
    const lines = wrapText(c, d.title || "", TW - P * 2).slice(0, 4);
    lines.forEach((l, k) => c.fillText(l, P, P + 46 + k * (TH > TW ? 58 : 52)));
    if (d.sub) { c.fillStyle = mute; c.font = `500 20px ${ko}`; wrapText(c, d.sub, TW - P * 2).slice(0, 2).forEach((l, k) => c.fillText(l, P, TH - P - 44 - (1 - k) * 28)); }
    c.fillStyle = line; c.fillRect(P, TH - P - 4, TW - P * 2, 3);
    c.fillStyle = acc; c.fillRect(P, TH - P - 4, (TW - P * 2) * Math.max(0, Math.min(1, d.ratio || 0)), 3);
    s.tex.needsUpdate = true;
  }
  let lineC, line2C, accC;
  function recolor() {
    const bg = col("--pp-bg", "#f3f0e8");
    renderer.setClearColor(bg, 1); scene.fog.color.copy(bg);
    lineC = col("--pp-line2", "#ccc"); line2C = col("--pp-line", "#ddd"); accC = col("--pp-acc", "#2A55C4");
    spine.material.color.copy(line2C); ticks.material.color.copy(lineC);
    slabs.forEach((s, i) => paintFace(s, i === cur));
    tint(); dirty();
  }
  // 지나간 판은 카메라 뒤로 빠지기 전에 사라져요 (화면 앞을 가리지 않게)
  function tint() {
    const f = Math.max(0, Math.floor(cam.y)); spineGeo.setDrawRange(f, items.length); tickGeo.setDrawRange(f * 2, items.length * 2);
    slabs.forEach((s, i) => {
      const d = i - cam.y, gone = d < 0 ? Math.max(0, 1 + d * 1.8) : 1;
      s.g.visible = gone > 0.01;
      s.edge.material.color.copy(lineC).lerp(accC, s.k); s.edge.material.opacity = gone;
      s.face.material.opacity = (0.5 + 0.5 * s.k) * gone;
    });
  }

  // 카메라: 지금 판 앞 · 조금 위 · 오른쪽에서. 넓은 화면은 판이 오른쪽(패널이 왼쪽), 좁은 화면은 판이 위(패널이 아래)
  const cam = { y: 0, z: 0 };
  function aim() {
    const narrow = camera.aspect < 0.9, p = { x: cam.y * GAP_X, y: -cam.y * GAP_Y, z: -cam.y * GAP_Z };
    const dist = narrow ? 11 + (H > W ? 2 : 4) : 10.5;
    scene.fog.near = dist + 1.5; scene.fog.far = dist + 22;
    camera.position.set(p.x + (narrow ? 1.0 : 2.2), p.y + 1.6, p.z + dist);
    camera.lookAt(p.x + (narrow ? 0.3 : -2.6), p.y + (narrow ? -2.6 : -1.0), p.z - 2);
  }
  let need = false, raf = 0, alive = true;
  function dirty() { if (!need && alive) { need = true; raf = requestAnimationFrame(draw); } }
  function draw() { need = false; if (!alive) return; aim(); renderer.render(scene, camera); }
  function size() {
    const w = stage.clientWidth || 600, h = stage.clientHeight || 400;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty();
  }

  // 이동 (한 판씩 · 0.7초 · 부드럽게)
  let cur = Math.max(0, Math.min(items.length - 1, o.start || 0)), anim = 0, busyTill = 0;
  cam.y = cur; slabs.forEach((s, i) => { s.k = i === cur ? 1 : 0; });
  const dots = document.createElement("nav"); dots.className = "dp-dots"; dots.setAttribute("aria-label", "이동");
  dots.innerHTML = items.map((it, i) => `<button type="button" data-i="${i}" aria-label="${String(it.dot || i + 1).replace(/"/g, "&quot;")}"><i></i><span>${String(it.dot || i + 1).replace(/</g, "&lt;")}</span></button>`).join("");
  stage.appendChild(dots);
  const markDots = () => dots.querySelectorAll("button").forEach((b, i) => { b.classList.toggle("on", i === cur); if (i === cur) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
  function go(i) {
    i = Math.max(0, Math.min(items.length - 1, i));
    if (i === cur) return;
    const prev = cur; cur = i; markDots(); o.onFocus?.(cur);
    slabs[prev] && paintFace(slabs[prev], false); paintFace(slabs[cur], true);
    cancelAnimationFrame(anim);
    const from = cam.y, ks = slabs.map((s) => s.k);
    if (reduced()) { cam.y = cur; slabs.forEach((s, j) => { s.k = j === cur ? 1 : 0; }); tint(); dirty(); return; }
    const t0 = performance.now(); busyTill = t0 + MS;
    const step = (now) => {
      if (!alive) return;
      const t = Math.min(1, (now - t0) / MS), e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      cam.y = from + (cur - from) * e;
      slabs.forEach((s, j) => { s.k = ks[j] + ((j === cur ? 1 : 0) - ks[j]) * e; });
      tint(); aim(); renderer.render(scene, camera);
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // 입력 — 휠(무대 위에서만) · 터치 스와이프 · 탭/클릭 · ↑↓ 키 · 점
  let acc = 0, accT = 0, lastStep = 0;
  const onWheel = (e) => {
    if (e.ctrlKey) return; // 확대는 그대로
    e.preventDefault();
    const now = performance.now();
    if (now - accT > 220) acc = 0; accT = now;
    if (now < busyTill || now - lastStep < 520) return;
    acc += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(acc) > 40) { lastStep = now; go(cur + Math.sign(acc)); acc = 0; }
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(x, y) {
    const r = canvas.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(slabs.map((s) => s.face))[0]; return h ? h.object.userData.i : -1;
  }
  let down = null;
  const onDown = (e) => { if (e.button) return; down = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
  const onUp = (e) => {
    if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) { go(cur + (dy < 0 ? 1 : -1)); return; }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) { const i = hit(e.clientX, e.clientY); if (i < 0) return; if (i === cur) o.onOpen?.(i); else go(i); }
  };
  const onMove = (e) => { if (e.pointerType !== "mouse" || down) return; canvas.style.cursor = hit(e.clientX, e.clientY) >= 0 ? "pointer" : ""; };
  const onKey = (e) => {
    if (!stage.isConnected || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
    const t = e.target; if (t && (t.closest?.("input, textarea, select, [contenteditable], dialog, .dock") || (t !== document.body && !stage.contains(t) && !t.closest?.(".dv")))) return;
    const d = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[e.key];
    if (d) { e.preventDefault(); go(cur + d); return; }
    if (e.key === "Home") { e.preventDefault(); go(0); } else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
    else if (e.key === "Enter" && t === canvas) { e.preventDefault(); o.onOpen?.(cur); }
  };
  const onDot = (e) => { const b = e.target.closest("[data-i]"); if (b) go(Number(b.dataset.i)); };
  stage.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointercancel", () => { down = null; });
  document.addEventListener("keydown", onKey);
  dots.addEventListener("click", onDot);
  const ro = new ResizeObserver(size); ro.observe(stage);
  const onTheme = () => requestAnimationFrame(recolor);
  document.addEventListener("sw-theme", onTheme);
  size(); recolor(); markDots(); o.onFocus?.(cur);
  // 글꼴이 늦게 오면 한 번 더 칠해요
  document.fonts?.ready?.then(() => { if (alive) recolor(); });

  function destroy() {
    if (!alive) return; alive = false; cancelAnimationFrame(raf); cancelAnimationFrame(anim); ro.disconnect();
    stage.removeEventListener("wheel", onWheel); document.removeEventListener("keydown", onKey); document.removeEventListener("sw-theme", onTheme);
    slabs.forEach((s) => { s.tex.dispose(); s.face.material.dispose(); s.edge.material.dispose(); });
    [geo, edgeGeo, spineGeo, tickGeo].forEach((g) => g.dispose()); spine.material.dispose(); ticks.material.dispose();
    renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove(); dots.remove();
  }
  return {
    go, destroy,
    get cur() { return cur; },
    update(i, face) { const s = slabs[i]; if (!s) return; s.data = face; paintFace(s, i === cur); dirty(); },
  };
}

// 무대를 화면 칸(.main)의 남은 높이에 맞춰요 — 페이지 스크롤이 생기지 않게. 정리 함수를 돌려줘요
export function fitStage(stage) {
  const main = stage.closest(".main");
  const fit = () => {
    const top = stage.getBoundingClientRect().top - (main ? main.getBoundingClientRect().top : 0);
    const h = (main ? main.clientHeight : innerHeight) - Math.max(0, top);
    stage.style.height = Math.max(380, Math.round(h)) + "px";
  };
  fit(); addEventListener("resize", fit);
  return () => removeEventListener("resize", fit);
}

// 리스트 보기 선택 기억 (실패해도 괜찮아요)
export const listPref = {
  get(k) { try { return localStorage.getItem("sw-list:" + k) === "1"; } catch { return false; } },
  set(k, v) { try { localStorage.setItem("sw-list:" + k, v ? "1" : "0"); } catch {} },
};

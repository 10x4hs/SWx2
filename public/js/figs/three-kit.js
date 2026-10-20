// 3D 설명 그림 도구 — three.js(/vendor) 를 필요할 때만 불러와요. 끌어서 돌리기 · 글자 이름표(HTML) · 종이/밤 색 · 그림이 사라지면 정리
//   3D 는 생각이 '공간'일 때만 (벡터 공간 · 층이 쌓인 그래프). 저절로 빙빙 돌지 않고, 사용자가 끌어서 돌려요.
import { reduced } from "./kit.js";

let threeP = null;
export function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!threeP) threeP = new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = "/vendor/three.min.js"; s.async = true;
    s.onload = () => (window.THREE ? ok(window.THREE) : no(new Error("three"))); s.onerror = () => { threeP = null; no(new Error("three")); };
    document.head.appendChild(s);
  });
  return threeP;
}
// CSS 변수 색 → THREE.Color (종이/밤에 따라 달라요)
export function cssColor(THREE, elm, name, fallback = "#888") {
  const v = getComputedStyle(elm).getPropertyValue(name).trim() || fallback;
  try { return new THREE.Color(v); } catch { return new THREE.Color(fallback); }
}

// scene3d(stage, { yaw, pitch, dist, fov }) → { THREE, scene, camera, root, render, label(text, cls) → { set(x,y,z), el }, color(name), onTheme(fn), setView(yaw, pitch), tweenView(...) , destroy }
export async function scene3d(stage, o = {}) {
  const THREE = await loadThree();
  const wrap = document.createElement("div"); wrap.className = "fg-3d";
  const canvas = document.createElement("canvas"); canvas.className = "fg-3d-c";
  const labels = document.createElement("div"); labels.className = "fg-3d-l";
  wrap.append(canvas, labels); stage.appendChild(wrap);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov || 38, 1, 0.1, 200);
  const root = new THREE.Group(); scene.add(root);
  const view = { yaw: o.yaw ?? -0.6, pitch: o.pitch ?? 0.38, dist: o.dist ?? 9, ty: o.ty ?? 0 };
  const tags = [];
  let dirty = true, alive = true, raf = 0;

  function place() {
    const cp = Math.cos(view.pitch);
    camera.position.set(Math.sin(view.yaw) * cp * view.dist, Math.sin(view.pitch) * view.dist + view.ty, Math.cos(view.yaw) * cp * view.dist);
    camera.lookAt(0, view.ty, 0);
  }
  function size() {
    const w = wrap.clientWidth || 600, h = wrap.clientHeight || 360;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  }
  const v3 = new THREE.Vector3();
  function render() {
    place(); renderer.render(scene, camera);
    const w = wrap.clientWidth, h = wrap.clientHeight;
    for (const t of tags) {
      if (!t.on) { t.el.style.display = "none"; continue; }
      v3.set(t.x, t.y, t.z); root.localToWorld(v3); v3.project(camera);
      const vis = v3.z < 1 && v3.z > -1;
      t.el.style.display = vis ? "" : "none";
      t.el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * w}px, ${(-v3.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
    }
    dirty = false;
  }
  function frame() {
    raf = 0;
    if (!alive) return;
    if (!canvas.isConnected) { if (++gone > 120) destroy(); else raf = requestAnimationFrame(frame); return; }
    gone = 0;
    if (dirty) render();
    raf = requestAnimationFrame(frame);
  }
  let gone = 0;
  // 끌어서 돌리기 (위아래는 조금만) · 키보드 ← → ↑ ↓
  let drag = null;
  wrap.style.touchAction = "pan-y"; wrap.tabIndex = 0; wrap.setAttribute("aria-label", o.label || "3D 그림 — 끌거나 화살표 키로 돌려요");
  wrap.addEventListener("pointerdown", (e) => { if (e.button) return; drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch }; wrap.setPointerCapture(e.pointerId); wrap.classList.add("on"); });
  wrap.addEventListener("pointermove", (e) => {
    if (!drag) return;
    view.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
    view.pitch = Math.max(-0.2, Math.min(1.25, drag.pitch + (e.clientY - drag.y) * 0.006));
    dirty = true; o.onTurn?.();
  });
  const end = () => { drag = null; wrap.classList.remove("on"); };
  wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end);
  wrap.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[e.key]; if (!d) return;
    e.preventDefault(); e.stopPropagation(); view.yaw += d[0]; view.pitch = Math.max(-0.2, Math.min(1.25, view.pitch + d[1])); dirty = true; o.onTurn?.();
  });
  const ro = new ResizeObserver(size); ro.observe(wrap);
  const themeFns = [];
  const onThemeEv = () => { themeFns.forEach((f) => f()); dirty = true; };
  document.addEventListener("sw-theme", onThemeEv);
  size(); raf = requestAnimationFrame(frame);

  function destroy() {
    if (!alive) return; alive = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("sw-theme", onThemeEv);
    scene.traverse((x) => { x.geometry?.dispose?.(); if (x.material) [].concat(x.material).forEach((m) => m.dispose?.()); });
    renderer.dispose(); renderer.forceContextLoss?.();
  }
  return {
    THREE, scene, camera, root, renderer, wrap, view,
    render: () => { dirty = true; },
    color: (name, fb) => cssColor(THREE, stage, name, fb),
    onTheme: (fn) => { themeFns.push(fn); },
    label(textHtml, cls = "") {
      const e = document.createElement("span"); e.className = "fg-3d-tag " + cls; e.innerHTML = textHtml; labels.appendChild(e);
      const t = { el: e, x: 0, y: 0, z: 0, on: true };
      tags.push(t);
      return { el: e, set(x, y, z) { t.x = x; t.y = y; t.z = z; dirty = true; }, show(on) { t.on = on; dirty = true; }, text(h) { e.innerHTML = h; } };
    },
    // 카메라를 부드럽게 옮겨요 (움직임 줄이기면 바로)
    tweenView(to, ms = 900) {
      const from = { ...view };
      return new Promise((done) => {
        if (reduced()) { Object.assign(view, to); dirty = true; done(); return; }
        const t0 = performance.now();
        const step = (now) => { const t = Math.min(1, (now - t0) / ms), k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; for (const key in to) view[key] = from[key] + (to[key] - from[key]) * k; dirty = true; if (t < 1 && alive) requestAnimationFrame(step); else done(); };
        requestAnimationFrame(step);
      });
    },
    destroy,
  };
}

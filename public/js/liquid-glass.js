// 리퀴드 글래스 — 입장 화면의 유리 알약 (2026-11-20, 애플 Liquid Glass 를 따라 절제 2026-11-20)
//   애플: 주변을 비추고 굴절시키고 · 움직임에 반응하는 반사광 · 색은 뒤 콘텐츠에서 · 콘텐츠에 집중 → 그것만 남겼어요
//   · 굴절: 알약 모양에 맞춘 변위 지도(가장자리 띠만 휨, 안쪽은 아주 살짝 확대)를 SVG 필터(feDisplacementMap)로 뒤 배경에 걸어요
//   · 색 갈라짐은 눈에 거의 안 띄게 (R · G · B 휨 차이 4px) — 무지개 테두리 · 프리즘 띠는 뺐어요 (과했어요)
//   · 반사광: 빛이 오는 쪽(--la) 테두리가 밝은 흰 선 하나, 손가락 · 마우스를 살짝 따라가요
//   backdrop-filter 의 url(#필터)는 Chromium 만 그려요 → 그 밖(사파리 · 아이폰)은 반사광 · 프리즘만, 유리는 예전 그대로 (lg-on 없음)
//   움직임 줄이기를 켜면 빛은 왼쪽 위에 멈춰 있어요.

const SCALES = [24, 22, 20]; // R · G · B 휨 세기(px) — 차이(4px)는 가장자리가 유리처럼 보일 만큼만
const BEZEL = 0.28;          // 가장자리에서 휘는 띠의 두께 (알약 높이에 대한 비율) — 가운데는 맑게
const LENS = 0.08;           // 안쪽을 아주 살짝 확대 (렌즈) — 테두리에서 바깥 구름과 이어짐이 끊길 만큼만

export const liquidDefs = () => `<svg class="lg-defs" width="0" height="0" aria-hidden="true" focusable="false">
  <filter id="lg-refract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feImage id="lg-map" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map"/>
    ${SCALES.map((s, i) => `<feDisplacementMap in="SourceGraphic" in2="map" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="d${i}"/>
    <feColorMatrix in="d${i}" type="matrix" values="${[0, 1, 2].map((r) => [0, 1, 2].map((c) => (r === i && c === i ? 1 : 0)).concat([0, 0]).join(" ")).join("  ")}  0 0 0 1 0" result="c${i}"/>`).join("\n    ")}
    <feBlend in="c0" in2="c1" mode="screen" result="c01"/>
    <feBlend in="c01" in2="c2" mode="screen"/>
  </filter>
</svg>`;

// Chromium 만 backdrop-filter 의 SVG 필터를 그려요 (사파리는 받아들인 척하고 유리를 지워 버려요)
const refractOK = () => !!navigator.userAgentData?.brands?.some((b) => /Chromium/i.test(b.brand)) && CSS.supports("backdrop-filter", "url(#lg-refract)");

// 알약(둥근 사각형) 변위 지도: R = 128 + x 쪽으로 읽을 거리, G = 128 + y 쪽. 테두리 띠는 바깥 풍경을 눌러 담고, 안쪽은 살짝 확대해요
function mapURL(w, h, r) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  const hx = w / 2, hy = h / 2, bez = Math.max(8, h * BEZEL);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5 - hx, py = y + 0.5 - hy;
    const qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), out = Math.hypot(ox, oy);
    const sd = out + Math.min(Math.max(qx, qy), 0) - r; // 0 = 테두리, 음수 = 안쪽
    let nx = 0, ny = 0;
    if (out > 0) { nx = (ox / out) * Math.sign(px); ny = (oy / out) * Math.sign(py); } else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
    const t = Math.min(1, Math.max(0, 1 + sd / bez)), m = t * t * t; // 가장자리 띠 안에서만 — 테두리 쪽으로 갈수록 급하게 (볼록한 유리 가장자리)
    const i = (y * w + x) * 4;
    // 읽을 자리 = 지금 자리 + o. 테두리 띠: 바깥쪽에서(+n) 끌어와 바깥 풍경을 띠에 눌러 담고(볼록 유리 가장자리), 안쪽: 가운데 쪽에서(−p) 끌어와 살짝 확대(렌즈)
    // (반대로 안쪽에서 끌어오면 띠가 세로 줄무늬로 늘어져 보였어요)
    const inside = sd < 0 ? 1 : 0;
    const dx = Math.max(-1, Math.min(1, nx * m - (px / hx) * LENS * inside)), dy = Math.max(-1, Math.min(1, ny * m - (py / hy) * LENS * inside));
    d[i] = 128 + dx * 127; d[i + 1] = 128 + dy * 127; d[i + 2] = 128; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

// gate: 빛을 받는 넓은 판 · pill: 유리 알약
export function mountLiquidGlass(gate, pill) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const set = (x, y) => {
    const r = pill.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    pill.style.setProperty("--la", `${Math.round((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90)}deg`);
  };
  { const r = pill.getBoundingClientRect(); set(r.left + r.width * 0.15, r.top - r.height); } // 처음: 왼쪽 위에서 오는 빛
  if (!still) {
    let raf = 0, last = null;
    gate.addEventListener("pointermove", (e) => { last = e; if (!raf) raf = requestAnimationFrame(() => { raf = 0; set(last.clientX, last.clientY); }); }, { passive: true });
  }
  if (!refractOK()) return;
  const fe = gate.querySelector("#lg-map");
  let w0 = 0, h0 = 0;
  const draw = () => {
    if (!pill.isConnected) { ro.disconnect(); return; }
    const w = Math.round(pill.offsetWidth), h = Math.round(pill.offsetHeight);
    if (!w || !h || (w === w0 && h === h0)) return;
    w0 = w; h0 = h;
    fe.setAttribute("href", mapURL(w, h, h / 2));
    fe.setAttribute("width", w); fe.setAttribute("height", h);
    pill.classList.add("lg-on");
  };
  const ro = new ResizeObserver(draw);
  ro.observe(pill); draw();
}

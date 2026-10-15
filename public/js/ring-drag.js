// 오늘 링에서 끌어서 계획 넣기 — 마우스를 대면 그 시각에 가는 선, 누른 채 링을 따라 끌면 5분씩 조각이 자라요.
// 놓으면 그 자리에 이름 칸이 떠요 (Enter 저장 · Esc · 바깥 누르기 취소). 컴퓨터(마우스)에서만, 끌지 않고 누르면 원래대로.
// 차트 SVG 에 data-dial="cx cy ri ro pad cr" (viewBox 단위: 중심 · 링 띠 안쪽/바깥 반지름 · 잡는 여유 · 가운데 빈 원 반지름) 이 있으면 그 위에서 움직여요.
// 차트는 다시 그리지 않고, SVG 안에 얹은 끌기 층(<g class="rd">)의 선 · 조각 · 글자만 고쳐요.
import { esc, hm } from "./util.js";
import { sectorPath, polar, f2 } from "./charts/svg.js";

const STEP = 5, DAY = 1440, MOVE = 6; // 5분 단위 · 하루 1440분 · 6px 넘게 움직여야 끌기 (손이 조금 떨린 누르기는 그냥 누르기)
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const snap = (m) => Math.max(0, Math.min(DAY, Math.round(m / STEP) * STEP));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function dialOf(svg) {
  const [cx, cy, ri, ro, pad, cr] = (svg.dataset.dial || "").split(" ").map(Number);
  return Number.isFinite(cr) ? { cx, cy, ri, ro, pad, cr } : null;
}
// 화면 좌표 → SVG 좌표 (CSS 로 줄어든 크기까지)
function toSvg(svg, e) {
  const m = svg.getScreenCTM();
  return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : null;
}
const onBand = (d, p) => { const r = Math.hypot(p.x - d.cx, p.y - d.cy); return r >= d.ri - d.pad && r <= d.ro + d.pad; };
// 12시 방향에서 시계 방향으로 0 ~ 1440분 (소수)
const minuteAt = (d, p) => { const v = (Math.atan2(p.y - d.cy, p.x - d.cx) + Math.PI / 2) / (2 * Math.PI); return (v < 0 ? v + 1 : v) * DAY; };

// SVG 안의 끌기 층 — 없으면 만들어요 (차트를 다시 그리면 같이 사라져요)
function layerOf(svg) {
  let g = svg.querySelector(":scope > g.rd");
  if (g) return g;
  g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "rd");
  g.setAttribute("aria-hidden", "true");
  g.innerHTML = `<path class="rd-arc"/><line class="rd-line"/><text class="rd-tag rd-t0"/><text class="rd-tag rd-t1"/>
    <g class="rd-mid"><text class="rd-range" text-anchor="middle"/><text class="rd-big" text-anchor="middle"/><text class="rd-sub" text-anchor="middle"/><text class="rd-warn" text-anchor="middle"/></g>`;
  svg.appendChild(g);
  return g;
}
const $q = (g, c) => g.querySelector("." + c);
const attrs = (el, o) => { for (const k in o) el.setAttribute(k, typeof o[k] === "number" ? f2(o[k]) : o[k]); };

// 링 바깥, 그 시각 자리에 시각 글자 (화면에서 13px 쯤 되게)
function tagAt(svg, d, el, m, text) {
  const k = svg.getScreenCTM()?.a || 1, fs = 13 / k, v = (m % DAY) / DAY;
  const [x, y] = polar(d.cx, d.cy, d.ro + 6 / k + fs * 0.9, v);
  attrs(el, { x, y: y + fs * 0.36, "font-size": fs, "text-anchor": Math.abs(x - d.cx) < fs ? "middle" : x > d.cx ? "start" : "end" });
  el.textContent = text;
}
function lineAt(d, el, m) {
  const v = (m % DAY) / DAY, [x1, y1] = polar(d.cx, d.cy, d.ri - 3, v), [x2, y2] = polar(d.cx, d.cy, d.ro + 3, v);
  attrs(el, { x1, y1, x2, y2 });
}

// opts: can() → 끌어도 되나(내 차트) · blocks() → 오늘 조각 [{a0, a1, title}] (겹침 안내)
//       save({ start, mins, text }) → Promise (실패하면 throw) · onIdle() → 끌기 · 이름 칸이 끝났을 때
export function mountRingDrag(root, opts) {
  let hov = null;  // 마우스가 올라간 원 { svg, d, g }
  let drag = null; // 누른 뒤 { svg, d, g, id, x, y, anchor, pos, raw, moved } · Esc 로 취소했는데 버튼이 아직 눌려 있으면 { id, dead }
  let pop = null;  // 이름 칸 { el, svg, g }
  let eat = false; // 끌기 뒤에 따라오는 click 하나는 먹어요 (페이지 이동 막기)

  const span = (dr) => { const end = snap(dr.pos); return { lo: Math.min(dr.anchor, end), hi: Math.max(dr.anchor, end), end }; };
  function hideHover() { if (hov) { hov.g.classList.remove("hover"); hov.svg.classList.remove("rd-hov"); hov = null; } }
  function clear(svg, g) { g?.classList.remove("drag", "hold", "saved"); svg?.classList.remove("rd-on"); document.documentElement.classList.remove("rd-dragging"); }
  const idle = () => { if (!drag && !pop) opts.onIdle?.(); };

  function hover(e) {
    if (drag || pop || e.pointerType !== "mouse" || e.buttons) return;
    const svg = e.target.closest?.("svg[data-dial]");
    const d = svg && !svg.closest(".pg-slide.out") && opts.can() ? dialOf(svg) : null;
    const p = d && toSvg(svg, e);
    if (!p || !onBand(d, p)) { hideHover(); return; }
    if (hov?.svg !== svg) { hideHover(); hov = { svg, d, g: layerOf(svg) }; }
    const m = snap(minuteAt(d, p)) % DAY;
    lineAt(d, $q(hov.g, "rd-line"), m);
    tagAt(svg, d, $q(hov.g, "rd-t1"), m, clock(m));
    hov.g.classList.add("hover"); svg.classList.add("rd-hov");
  }

  function paint(dr) {
    const { svg, d, g } = dr, { lo, hi, end } = span(dr), mins = hi - lo;
    const arc = $q(g, "rd-arc");
    if (mins > 0) attrs(arc, { d: sectorPath(d.cx, d.cy, (d.ri + d.ro) / 2, d.ro - d.ri, lo / DAY, hi / DAY) });
    arc.style.display = mins > 0 ? "" : "none";
    lineAt(d, $q(g, "rd-line"), end);
    tagAt(svg, d, $q(g, "rd-t1"), end, clock(end));
    tagAt(svg, d, $q(g, "rd-t0"), dr.anchor, clock(dr.anchor));
    // 짧을 땐 시작 시각 글자가 끝 시각과 겹쳐서 숨겨요 (화면에서 56px 보다 가까우면)
    $q(g, "rd-t0").style.display = ((hi - lo) / DAY) * 2 * Math.PI * d.ro * (svg.getScreenCTM()?.a || 1) < 56 ? "none" : "";
    // 가운데: 14:00 → 15:25 / +85분 / 1시간 25분 / 겹침
    const big = `+${mins}분`, fs = d.cr * 0.5 * Math.min(1, 5 / big.length), sm = d.cr * 0.16;
    attrs($q(g, "rd-range"), { x: d.cx, y: d.cy - d.cr * 0.42, "font-size": sm }); $q(g, "rd-range").textContent = `${clock(lo)} → ${clock(hi)}`;
    attrs($q(g, "rd-big"), { x: d.cx, y: d.cy + fs * 0.3, "font-size": fs }); $q(g, "rd-big").textContent = big;
    attrs($q(g, "rd-sub"), { x: d.cx, y: d.cy + d.cr * 0.42, "font-size": sm }); $q(g, "rd-sub").textContent = mins >= 60 ? hm(mins) : mins ? "5분씩 늘어나요" : "";
    const over = mins ? (opts.blocks?.() || []).filter((b) => b.a0 * DAY < hi && b.a1 * DAY > lo).map((b) => b.title) : [];
    attrs($q(g, "rd-warn"), { x: d.cx, y: d.cy + d.cr * 0.66, "font-size": d.cr * 0.13 });
    $q(g, "rd-warn").textContent = over.length ? `겹침 · ${cut(over[0], 10)}${over.length > 1 ? ` 외 ${over.length - 1}` : ""}` : "";
  }

  // 한 바퀴를 넘는 움직임도 이어 붙여요 (각도 변화량을 더해 가요). 0시 ~ 24시 밖으로는 안 나가요
  function track(dr, raw) {
    let dl = raw - dr.raw;
    if (dl > DAY / 2) dl -= DAY; else if (dl < -DAY / 2) dl += DAY;
    dr.raw = raw;
    // 자정(0시 = 24시)에서 누르면 처음 움직인 쪽으로 정해요: 시계 방향이면 0시부터, 반대면 24시까지
    if (dr.anchor % DAY === 0 && Math.abs(dr.pos - dr.anchor) < STEP * 2) {
      const base = dl >= 0 ? 0 : DAY;
      if (base !== dr.anchor) { dr.pos += base - dr.anchor; dr.anchor = base; }
    }
    dr.pos = Math.max(0, Math.min(DAY, dr.pos + dl));
  }

  function down(e) {
    if (drag?.dead) drag = null; // 창 밖에서 버튼을 놓아 pointerup 을 못 받은 경우
    if (e.pointerType !== "mouse" || e.button !== 0 || drag) return;
    const svg = e.target.closest?.("svg[data-dial]");
    const d = svg && !svg.closest(".pg-slide.out") && opts.can() ? dialOf(svg) : null;
    const p = d && toSvg(svg, e);
    if (!p || !onBand(d, p)) return;
    const raw = minuteAt(d, p);
    drag = { svg, d, g: layerOf(svg), id: e.pointerId, x: e.clientX, y: e.clientY, anchor: snap(raw), pos: raw, raw, moved: false };
  }
  function move(e) {
    if (drag?.dead) { if (e.buttons) return; drag = null; }
    if (!drag || e.pointerId !== drag.id) { hover(e); return; }
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < MOVE) return;
      drag.moved = true;
      try { drag.svg.setPointerCapture(drag.id); } catch {}
      hideHover();
      drag.g.classList.add("drag"); drag.svg.classList.add("rd-on");
      document.documentElement.classList.add("rd-dragging");
    }
    const p = toSvg(drag.svg, e);
    if (!p) return;
    track(drag, minuteAt(drag.d, p));
    paint(drag);
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dr = drag; drag = null;
    if (dr.dead) { eat = true; setTimeout(() => { eat = false; }, 60); return; } // 취소한 끌기의 click 도 먹어요
    if (!dr.moved) return; // 그냥 누르기 → 원래 click 그대로
    eat = true; setTimeout(() => { eat = false; }, 60);
    try { dr.svg.releasePointerCapture(dr.id); } catch {}
    document.documentElement.classList.remove("rd-dragging");
    const { lo, hi } = span(dr);
    if (hi - lo < STEP) { clear(dr.svg, dr.g); idle(); return; }
    open(dr, lo, hi - lo, e.clientX, e.clientY);
  }
  // Esc · 오른쪽 버튼 · 차트가 사라짐 → 끌기 취소. 버튼을 아직 누르고 있으면 놓을 때 오는 click 까지 먹어요 (페이지가 넘어가지 않게)
  function cancelDrag(e) {
    if (!drag || drag.dead) { if (e?.type === "pointercancel") drag = null; return; }
    const dr = drag;
    if (dr.moved) { try { dr.svg.releasePointerCapture(dr.id); } catch {} }
    drag = dr.moved && e?.type !== "pointercancel" ? { id: dr.id, dead: true } : null;
    clear(dr.svg, dr.g); idle();
  }

  // ---------- 이름 칸 ----------
  function open(dr, start, mins, x, y) {
    dr.g.classList.remove("drag"); dr.g.classList.add("hold");
    const el = document.createElement("form");
    el.className = "cm glass rd-pop";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "새 계획");
    el.innerHTML = `<div class="rd-pop-t">${clock(start)} → ${clock(start + mins)} · ${esc(hm(mins))}</div>
      <input class="input" name="text" maxlength="200" autocomplete="off" placeholder="무엇을 할까요?" aria-label="계획 이름">
      <div class="rd-pop-h"><span>Esc 취소</span><span data-msg>Enter 저장</span></div>`;
    document.body.appendChild(el);
    // 원 바깥쪽으로 띄워서 방금 끈 조각을 가리지 않게 (가운데보다 왼쪽이면 왼쪽에, 위면 위에)
    const w = el.offsetWidth || 280, h = el.offsetHeight || 120, m = dr.svg.getScreenCTM();
    const c = m ? new DOMPoint(dr.d.cx, dr.d.cy).matrixTransform(m) : { x, y };
    const left = x < c.x ? x - w - 16 : x + 16, top = y < c.y ? y - h - 16 : y + 16;
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, left)) + "px";
    el.style.top = Math.max(8, Math.min(innerHeight - h - 8, top)) + "px";
    pop = { el, svg: dr.svg, g: dr.g };
    const input = el.querySelector("input"), msg = el.querySelector("[data-msg]");
    input.focus();
    el.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !ev.isComposing) { ev.preventDefault(); ev.stopPropagation(); close(); } });
    el.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const text = input.value.trim();
      if (!text) { input.focus(); msg.textContent = "이름을 적어 주세요"; return; }
      if (el.dataset.busy) return;
      el.dataset.busy = "1"; input.disabled = true; msg.textContent = "저장 중…";
      try {
        await opts.save({ start: clock(start), mins, text });
        const { svg, g } = pop; pop = null; el.remove();
        g.classList.remove("hold"); g.classList.add("saved"); svg.classList.remove("rd-on"); // 다시 그려질 때까지 조각만 남겨 둬요
        setTimeout(() => { if (g.isConnected) clear(svg, g); }, 4000);
        idle();
      } catch (err) {
        delete el.dataset.busy; input.disabled = false; input.focus();
        msg.textContent = err?.message || "저장하지 못했어요";
      }
    });
  }
  function close() {
    if (!pop) return;
    const { el, svg, g } = pop; pop = null;
    el.remove(); clear(svg, g); idle();
  }

  // ---------- 이벤트 ----------
  const onClick = (e) => { if (eat) { eat = false; e.preventDefault(); e.stopImmediatePropagation(); } };
  const onKey = (e) => { if (e.key === "Escape" && drag?.moved) { e.preventDefault(); cancelDrag(); } };
  // 이름 칸 바깥을 누르면 닫혀요. 링을 눌러 닫았으면 그 click 으로 페이지가 넘어가지 않게 먹어요
  const onOutside = (e) => {
    if (!pop || pop.el.contains(e.target)) return;
    const onRing = !!e.target.closest?.("svg[data-dial]");
    close();
    if (onRing) { eat = true; setTimeout(() => { eat = false; }, 800); }
  };
  const onMenu = (e) => { if (drag?.moved) { e.preventDefault(); cancelDrag(); } };
  const onLost = (e) => { if (drag?.moved && e.pointerId === drag.id && !drag.svg.isConnected) cancelDrag(); };
  root.addEventListener("pointerdown", down);
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", up);
  root.addEventListener("pointercancel", cancelDrag);
  root.addEventListener("lostpointercapture", onLost, true);
  root.addEventListener("pointerleave", hideHover);
  root.addEventListener("click", onClick, true);
  root.addEventListener("contextmenu", onMenu, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onOutside, true);

  return {
    busy: () => !!((drag?.moved && !drag.dead) || pop),
    destroy() {
      cancelDrag(); drag = null; close(); hideHover();
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", cancelDrag);
      root.removeEventListener("lostpointercapture", onLost, true);
      root.removeEventListener("pointerleave", hideHover);
      root.removeEventListener("click", onClick, true);
      root.removeEventListener("contextmenu", onMenu, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onOutside, true);
    },
  };
}

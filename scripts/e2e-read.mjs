// 읽기 쉬움 · 키보드 초점 · 가벼운 움직임 검사 (2026-11-16) — scripts/e2e.mjs 의 "read-type" · "read-focus" · "read-motion" 구역
//   ① 글자 크기 — 주요 화면(홈 · Plan · 노트 · 일기 · 설정 · 내 메뉴)에서 보이는 글자가 11px 아래가 없고, 긴 글(본문)은 12.5px 이상
//      SVG 안 글자는 viewBox 로 줄어든 실제 크기로 재요. Dock 아이콘 그림(aria-hidden) 안 글자는 그림이라 빼요.
//   ② 초점 — 홈에서 Tab 으로 다니면 초점이 간 칸마다 outline 이나 box-shadow 테가 실제로 보여요 (투명 · none 이면 실패)
//   ③ 화면 바꾸기 — 화면이 바뀔 때 .host 에 filter: blur 가 걸리지 않아요 (유리 위에서 비싸고 꾸밈뿐)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 화면에 보이는 글자 칸을 모아서 크기 · 글자 수 · 대비를 재요 (브라우저 안에서 돌아요)
export const scanText = () => {
  const out = [], seen = new Set();
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, base) => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  // 유리 뒤 배경화면은 흐린 사진이라 밝기가 곳곳 달라요 → 어두운 테마는 밝은 쪽(64), 밝은 테마는 어두운 쪽(200)으로 깐깐하게 잡아요
  const dark = document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const base = dark ? [64, 64, 66, 1] : [200, 200, 204, 1];
  const bgOf = (el) => { const stack = []; for (let e = el; e && e !== document.body; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) stack.push(c); } let b = base; for (const c of stack.reverse()) b = over(c, b); return b; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.replace(/\s+/g, " ").trim(); if (!t) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest("[aria-hidden='true'], script, style, noscript, template, [hidden], .sr-only, .visually-hidden")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    let hiddenUp = false; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (+s.opacity < 0.05 || s.visibility === "hidden" || s.display === "none") { hiddenUp = true; break; } } if (hiddenUp) continue;
    let px = parseFloat(cs.fontSize); if (px < 1) continue; // font-size: 0 = 일부러 숨긴 글자(점 탭의 이름 등)
    if (el instanceof SVGElement) { const m = el.getScreenCTM?.(); if (m) px *= Math.hypot(m.a, m.b); }
    const col = parse(cs.color) || [0, 0, 0, 1], bg = bgOf(el), fg = over([col[0], col[1], col[2], col[3] * +cs.opacity], bg);
    const L1 = lum(fg), L2 = lum(bg), cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join("").replace(/\s+/g, " ").trim();
    const sel = el.tagName.toLowerCase() + (el.classList.length ? "." + [...el.classList].slice(0, 2).join(".") : "") + (el.parentElement?.classList.length ? " < ." + el.parentElement.classList[0] : "");
    out.push({ sel, px: Math.round(px * 10) / 10, len: own.length, t: own.slice(0, 30), cr: Math.round(cr * 10) / 10, color: cs.color });
  }
  return out;
};

// 초점이 간 칸에 보이는 테가 있는지 (outline 이 none/투명이 아니거나, box-shadow 에 보이는 색이 있어요)
export const focusRing = () => {
  const e = document.activeElement; if (!e || e === document.body) return null;
  const cs = getComputedStyle(e), vis = (c) => { const m = c.match(/rgba?\(([^)]+)\)/g) || []; return m.some((x) => { const p = x.slice(x.indexOf("(") + 1, -1).split(/[ ,/]+/).filter(Boolean).map(Number); return p.length < 4 || p[3] > 0.25; }); };
  const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 1 && vis(cs.outlineColor);
  // 안쪽 하이라이트(inset 1px 흰 줄)는 원래 꾸밈이라 빼요: 2px 이상 퍼지는 그림자만 테로 쳐요
  const shadow = cs.boxShadow !== "none" && cs.boxShadow.split(/,(?![^(]*\))/).some((s) => !/inset/.test(s) && /(?:^|\s)0px 0px 0px [2-9]/.test(s.replace(/rgba?\([^)]*\)/, "").trim()) && vis(s));
  const name = (e.tagName.toLowerCase() + "." + [...(e.classList || [])].join(".") + (e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : "")).slice(0, 60);
  return { name, ok: outline || shadow, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, shadow: cs.boxShadow.slice(0, 60) };
};

const ROUTES = [["#/", ".stage, .home"], ["#/calendar", ".view"], ["#/notes", ".view"], ["#/diary", ".view"], ["#/settings", ".view"]];

export async function readE2E({ p, go, ok, tv, part, shots }) {
  if (part === "type") {
    const all = [];
    for (const [hash] of ROUTES) {
      await go(hash, 2200);
      const rows = await p.evaluate(scanText);
      all.push(...rows.map((r) => ({ ...r, hash })));
    }
    // 내 메뉴(프로필) 창도 열어서 재요
    await go("#/", 1800);
    await p.click(".me-btn").catch(() => {}); await sleep(500);
    all.push(...(await p.evaluate(scanText)).map((r) => ({ ...r, hash: "me-menu" })));
    await p.keyboard.press("Escape").catch(() => {});
    const tiny = all.filter((r) => r.px < 10.95);
    const body = all.filter((r) => r.len >= 40 && r.px < 12.45);
    ok(all.length > 40 && !tiny.length, `${tv} · 글자 11px 아래 없음 — ${all.length}칸 중 ${tiny.length}칸${tiny.length ? ": " + tiny.slice(0, 6).map((r) => `${r.hash} ${r.sel} ${r.px}px "${r.t}"`).join(" | ") : ""}`);
    ok(!body.length, `${tv} · 긴 글(40자 이상)은 12.5px 이상 — ${body.length}칸${body.length ? ": " + body.slice(0, 6).map((r) => `${r.hash} ${r.sel} ${r.px}px "${r.t}"`).join(" | ") : ""}`);
    const small = all.filter((r) => r.px < 12.45);
    const lowC = small.filter((r) => r.cr < 4.5);
    ok(!lowC.length, `${tv} · 작은 글(12.5px 미만) 대비 4.5 이상 — ${small.length}칸 중 ${lowC.length}칸${lowC.length ? ": " + lowC.slice(0, 6).map((r) => `${r.hash} ${r.sel} ${r.px}px ${r.cr}:1`).join(" | ") : ""}`);
    if (process.env.READ_DUMP) console.log(JSON.stringify(all.filter((r) => r.px < 12.45), null, 0));
  }
  if (part === "focus") {
    await go("#/", 2200);
    await p.evaluate(() => document.activeElement?.blur());
    const seen = [], bad = [];
    for (let i = 0; i < 60; i++) {
      await p.keyboard.press("Tab"); await sleep(60);
      const f = await p.evaluate(focusRing);
      if (!f) continue;
      if (seen.length && f.name === seen[0]) break; // 한 바퀴 돌았어요
      seen.push(f.name); if (!f.ok) bad.push(`${f.name} (${f.outline})`);
    }
    const names = seen.join(" ");
    ok(seen.length >= 10 && /pad-input/.test(names) && !bad.length, `${tv} · 홈 Tab ${seen.length}칸 모두 초점 테 — 빠짐 ${bad.length}${bad.length ? ": " + bad.slice(0, 5).join(" | ") : ""} · pad-input ${/pad-input/.test(names)}`);
    // AI 챗 입력칸(aic-in)도: 펼치고 초점 → 테
    await p.click(".hud-ai-min").catch(() => {}); await sleep(500);
    const aic = await p.evaluate(() => { const i = document.querySelector(".aic-in"); return !!i?.offsetParent; }); // 폰은 AI 챗이 없어요
    if (aic) {
      // 펼치면 입력칸에 바로 초점이 가요 → 키보드로 한 칸 뒤로 갔다(Shift+Tab) 다시 Tab 으로 들어와서 :focus-visible 을 확실히
      await p.evaluate(() => document.querySelector(".aic-in")?.focus());
      await p.keyboard.press("Shift+Tab"); await sleep(60);
      let f = null;
      for (let i = 0; i < 6 && !/aic-in/.test(f?.name || ""); i++) { await p.keyboard.press(i < 3 ? "Tab" : "Shift+Tab"); await sleep(60); f = await p.evaluate(focusRing); }
      const got = /aic-in/.test(f?.name || "") ? f : null;
      ok(got?.ok, `${tv} · AI 챗 입력칸(aic-in) Tab 초점 테 — ${got ? got.outline + " · " + got.shadow : "못 닿음 (초점: " + (f?.name || "없음") + ")"}`);
    }
    if (shots) await p.screenshot({ path: `${shots}/focus-${tv}.png`, clip: { x: 0, y: 0, width: Math.min(900, p.viewportSize().width), height: 300 } }).catch(() => {});
  }
  if (part === "motion") {
    await go("#/", 1800);
    // 화면을 바꾸는 순간부터 .host 의 filter 를 매 프레임 기록
    const blurs = await p.evaluate(async () => {
      const seen = new Set(); let stop = false;
      const tick = () => { for (const h of document.querySelectorAll(".host, .view, main")) { const f = getComputedStyle(h).filter; if (f && f !== "none") seen.add(f); } if (!stop) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      location.hash = "#/calendar"; await new Promise((r) => setTimeout(r, 500));
      location.hash = "#/notes"; await new Promise((r) => setTimeout(r, 500));
      stop = true; return [...seen];
    });
    ok(!blurs.some((f) => /blur/.test(f)), `${tv} · 화면 바꿀 때 blur 없음 — ${blurs.join(", ") || "filter 없음"}`);
    // 꾸밈뿐인 무한 반복(차트 둥둥 · 필름 grain)이 없어요
    await go("#/", 2200);
    const loops = await p.evaluate(() => [...document.querySelectorAll(".stage-chart > svg, .grain")].map((e) => { const cs = getComputedStyle(e); return cs.animationName !== "none" && cs.animationIterationCount === "infinite" ? (e.className.baseVal ?? e.className) + ":" + cs.animationName : null; }).filter(Boolean));
    ok(!loops.length, `${tv} · 홈 꾸밈 무한 반복 없음 — ${loops.join(", ") || "없음"}`);
  }
}

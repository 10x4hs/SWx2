// ㉔ 화면 꾸미기 화면 검사 (2026-10-24) — e2e.mjs 가 컴퓨터 · 폰 크기마다 불러요. 이 파일만 따로 돌려도 돼요:
//   NODE_PATH=… BASE=http://127.0.0.1:8811 node scripts/e2e-theme.mjs     (임시 계정 t_eth… 을 만들었다가 지워요 · SHOTS=폴더 면 화면도 찍어요)
//   1) 기본값이면 css/theme.css 를 빼도 계산된 색이 똑같아요 (= 예전 화면 그대로)
//   2) 프로필 메뉴 → '화면 꾸미기' → 강조 색(파랑) · 배경화면(세이지) · 투명도 줄이기 → 버튼 · 체크 · 배경 · 흐림이 바로 바뀌어요
//   3) 계정에 저장(/api/apps/ui/state) → 새로 열어도 그대로 · 이 기기 사본을 지워도 서버 값으로 돌아와요
//   4) 키보드: 라디오 묶음에서 → 로 다음 색 · Esc 로 닫기 · '기본으로' → 처음 화면
import { execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function themeE2E({ p, ctx, go, ok, tv, w, BASE, H, getErrs, shots = null }) {
  let step = "준비";
  const shot = async (name) => { if (shots) await p.screenshot({ path: `${shots}/theme-${name}-${w}.png` }).catch(() => {}); };
  const look = () => p.evaluate(() => {
    const cs = (el, pr) => (el ? getComputedStyle(el)[pr] : null), root = document.documentElement;
    const main = document.querySelector("#main"), bg = document.querySelector(".bg");
    return {
      attrs: { theme: root.dataset.theme || "", wall: root.dataset.wall || "", accent: root.dataset.accent || "", glass: root.dataset.glass || "", solid: root.dataset.solid || "" },
      accent: getComputedStyle(root).getPropertyValue("--accent").trim(),
      bgImage: cs(bg, "backgroundImage"), bgFilter: cs(bg, "filter"),
      mainBg: cs(main, "backgroundColor"), mainBlur: cs(main, "backdropFilter"),
      body: cs(document.body, "backgroundColor"),
    };
  });
  const server = async () => (await (await ctx.request.get(BASE + "/api/apps/ui/state", { headers: H })).json());
  const openPanel = async () => { await p.click("#me-btn"); await sleep(150); await p.click("#theme-btn"); await p.waitForSelector(".thm-dialog", { timeout: 4000 }); };
  try {
    // 0) 깨끗한 계정 · 이 기기 사본 없이 시작
    step = "0 시작";
    await go("#/", 2000);
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("trio-ui")) localStorage.removeItem(k); });
    await go("#/", 2200);

    // 1) 기본값 = theme.css 를 빼도 똑같아요
    step = "1 기본값";
    const a = await look();
    const b = await p.evaluate(() => { const l = document.querySelector('link[href="/css/theme.css"]'); l.disabled = true; return true; }).then(look);
    await p.evaluate(() => { document.querySelector('link[href="/css/theme.css"]').disabled = false; });
    const sameish = JSON.stringify({ ...a, attrs: 0 }) === JSON.stringify({ ...b, attrs: 0 });
    ok(!a.attrs.wall && !a.attrs.accent && !a.attrs.glass && sameish, `${tv} · 꾸미기 기본값 — 속성 없음 · theme.css 를 빼도 같은 색 ${sameish}${sameish ? "" : " " + JSON.stringify([a, b]).slice(0, 300)}`);

    // 2) 창 열기 → 강조 색 · 배경화면 · 투명도 줄이기
    step = "2 창";
    await openPanel();
    const radios = await p.evaluate(() => ["theme", "wall", "accent", "glass"].map((g) => document.querySelectorAll(`[data-group="${g}"][role=radiogroup] [role=radio]`).length));
    await p.click('.thm-dialog [data-group=accent] [data-v="blue"]'); await sleep(100);
    await p.click('.thm-dialog [data-group=wall] [data-v="sage"]'); await sleep(100);
    await p.click(".thm-switch"); await sleep(250);
    const c = await look();
    const btnBg = await p.evaluate(() => getComputedStyle(document.querySelector(".thm-dialog .btn.accent")).backgroundColor);
    await shot("panel");
    const accentOk = c.accent && c.accent !== a.accent && btnBg !== "rgba(0, 0, 0, 0)" && /rgb\(0, 102, 204\)|rgb\(90, 169, 255\)/.test(btnBg);
    ok(radios.join() === "3,11,7,2" && c.attrs.accent === "blue" && c.attrs.wall === "sage" && c.attrs.solid === "1" && accentOk && /radial-gradient/.test(c.bgImage) && c.bgImage !== a.bgImage && c.mainBlur === "none" && c.mainBg !== a.mainBg,
      `${tv} · 꾸미기 바로 적용 — 라디오 ${radios.join("/")} · 강조 ${c.attrs.accent} (버튼 ${btnBg}) · 배경 ${c.attrs.wall} ${/radial-gradient/.test(c.bgImage)} · 불투명 ${c.attrs.solid} (흐림 ${c.mainBlur} · 판 ${c.mainBg})`);

    // 키보드: 강조 색 묶음에서 → 로 다음(보라), 다시 ← 로 파랑 · Esc 로 닫고 포커스는 메뉴 버튼으로
    step = "2 키보드";
    await p.focus('.thm-dialog [data-group=accent] [data-v="blue"]'); await p.keyboard.press("ArrowRight"); await sleep(120);
    const k1 = await p.evaluate(() => [document.documentElement.dataset.accent, document.activeElement?.dataset.v, document.querySelector('.thm-dialog [data-group=accent] [data-v="purple"]').getAttribute("aria-checked")]);
    await p.keyboard.press("ArrowLeft"); await sleep(120);
    await p.keyboard.press("Escape"); await sleep(200);
    const closed = await p.evaluate(() => !document.querySelector(".thm-dialog"));
    ok(k1.join() === "purple,purple,true" && closed, `${tv} · 꾸미기 키보드 — → 다음 색 ${k1.join("/")} · Esc 닫기 ${closed}`);

    // 3) 계정에 저장 → 새로 열어도 · 이 기기 사본을 지워도
    step = "3 저장";
    let srv = null;
    for (let i = 0; i < 15; i++) { srv = await server(); if (srv.data?.accent === "blue" && srv.data?.solid === true) break; await sleep(300); }
    await go("#/calendar", 2200);
    const d = await look();
    await shot("plan-saved");
    await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("trio-ui")) localStorage.removeItem(k); });
    await go("#/", 2600);
    const e = await look();
    ok(srv?.data?.accent === "blue" && srv.data.wall === "sage" && srv.data.solid === true && d.attrs.accent === "blue" && d.attrs.wall === "sage" && d.attrs.solid === "1" && e.attrs.accent === "blue" && e.attrs.wall === "sage",
      `${tv} · 꾸미기 저장 — 서버 ${JSON.stringify(srv?.data)} · 새로 열기 ${d.attrs.accent}/${d.attrs.wall}/${d.attrs.solid} · 이 기기 사본 없이 ${e.attrs.accent}/${e.attrs.wall}`);

    // 다른 기기가 먼저 바꿨으면(409) 서버 값으로: 서버를 주황으로 바꿔 두고 이 화면에서 초록을 고르면 → 주황이 남아요
    step = "3 409";
    const cur = await server();
    await ctx.request.put(BASE + "/api/apps/ui/state", { headers: H, data: { data: { ...cur.data, accent: "orange" }, at: cur.updated_at } });
    await openPanel();
    await p.click('.thm-dialog [data-group=accent] [data-v="green"]');
    let f = null;
    for (let i = 0; i < 15; i++) { await sleep(300); f = await p.evaluate(() => document.documentElement.dataset.accent); if (f === "orange") break; }
    const srv2 = await server();
    ok(f === "orange" && srv2.data.accent === "orange", `${tv} · 꾸미기 409 — 다른 기기 값으로 맞춤 (화면 ${f} · 서버 ${srv2.data.accent})`);

    // 4) 기본으로 → 처음 화면 그대로
    step = "4 기본으로";
    await p.click("#thm-reset"); await sleep(200);
    await p.click(".thm-foot [data-close]"); await sleep(900);
    const g = await look();
    let srv3 = null;
    for (let i = 0; i < 10; i++) { srv3 = await server(); if (srv3.data?.accent === "default") break; await sleep(300); }
    const back = JSON.stringify({ ...g, attrs: 0 }) === JSON.stringify({ ...a, attrs: 0 });
    ok(!g.attrs.wall && !g.attrs.accent && !g.attrs.solid && back && srv3?.data?.accent === "default" && srv3.data.wall === "default" && srv3.data.solid === false && !getErrs().length,
      `${tv} · 꾸미기 기본으로 — 속성 없음 · 처음 색 그대로 ${back} · 서버 ${srv3?.data?.accent}/${srv3?.data?.wall}${getErrs().length ? " — " + getErrs()[0] : ""}`);
  } catch (e) { ok(false, `${tv} · 화면 꾸미기 (${step}) — ${String(e.message).split("\n")[0]}`); }
  finally { await p.keyboard.press("Escape").catch(() => {}); }
}

// 따로 돌리기
if (process.argv[1]?.endsWith("e2e-theme.mjs")) {
  const { createRequire } = await import("node:module");
  const { chromium } = createRequire(import.meta.url)("playwright");
  const BASE = process.env.BASE || "http://127.0.0.1:8787", H = { "x-trio": "1", "content-type": "application/json" };
  let fails = 0;
  const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
  const user = "t_eth" + Date.now().toString(36).slice(-6);
  execFileSync("node", ["scripts/add-user.mjs", user, "꾸미기검사", "password1", "--features=all"], { stdio: "ignore" });
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    for (const [w, h, tv] of [[1280, 860, "컴퓨터"], [390, 844, "폰"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const login = await ctx.request.post(BASE + "/api/auth/login", { headers: H, data: { username: user } });
      ok(login.ok(), `${tv} · 임시 계정 로그인`);
      const p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
      const go = async (hash, wait = 1800) => { await p.goto("about:blank"); await p.goto(BASE + "/" + hash); await sleep(wait); };
      await themeE2E({ p, ctx, go, ok, tv, w, BASE, H, getErrs: () => errs, shots: process.env.SHOTS || null });
      await ctx.close();
    }
  } finally {
    await browser.close();
    execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM users WHERE username = '${user}'`], { stdio: "ignore" });
  }
  console.log(fails ? `\n${fails} FAIL` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
}

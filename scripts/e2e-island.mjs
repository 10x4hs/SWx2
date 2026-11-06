// ㉔ 집중 섬 화면 검사 (2026-10-24) — e2e.mjs 가 컴퓨터 · 폰 크기마다 불러요. 이 파일만 따로 돌려도 돼요:
//   NODE_PATH=… BASE=http://127.0.0.1:8813 node scripts/e2e-island.mjs     (임시 계정 t_eis… 을 만들었다가 지워요 · SHOTS=폴더 면 화면도 찍어요)
//   1) 쉬는 중엔 섬이 없어요 → Dock ⏱ = 펼친 카드(길이 · 시작) → 시작 = 맨 위 가운데 작은 알약 · 서버에 "공부 중"
//   2) 다른 화면 둘(노트 · Code Flow)로 옮겨도 알약이 그대로
//   3) 알약 → 카드 · +5분 = 남은 시간 +5:00 · 일시정지(숫자 멈춤) · 계속 · Esc / 바깥 클릭 = 접기
//   4) 체험 띠 · 공지 띠를 넣어 봐도 서로 겹치지 않아요 (앱 머리줄도 섬 밑으로)
//   5) 멈추기 = 섬이 사라지고 서버에 "쉬는 중" · 끝까지 가면 잠깐 "끝" 알약 → 사라짐
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secs = (t) => { const m = /^(\d+):(\d\d)$/.exec(String(t || "").trim()); return m ? +m[1] * 60 + +m[2] : NaN; };
const overlap = (a, b) => !!(a && b && a.w && b.w && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);

export async function islandE2E({ p, go, ok, tv, w, getErrs, shots = null }) {
  let step = "준비";
  try {
    const shot = async (name) => { if (shots) await p.screenshot({ path: `${shots}/island-${name}-${w}.png` }).catch(() => {}); };
    const box = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; }, sel);
    const st = () => p.evaluate(() => {
      const el = document.querySelector("#timer"), pill = el?.querySelector(".isl-pill"), card = el?.querySelector(".isl-card");
      const vis = (n) => !!n && n.getBoundingClientRect().width > 0;
      return { phase: el?.dataset.phase, live: !!el?.classList.contains("is-live"), hidden: !!el?.hidden, pill: vis(pill), card: vis(card), time: el?.querySelector(".isl-time")?.textContent, clock: el?.querySelector(".isl-clock")?.textContent, sr: el?.querySelector(".isl-sr")?.textContent || "", pillText: pill?.textContent || "" };
    });
    const presence = []; // PUT /api/presence 몸통
    const onReq = (r) => { if (r.method() === "PUT" && r.url().endsWith("/api/presence")) { try { presence.push(r.postDataJSON()?.state); } catch {} } };
    p.on("request", onReq);
    const logIds = []; // 끝 검사가 남긴 집중 기록 — 다른 검사(홈 링 등)에 섞이지 않게 마지막에 지워요
    const onRes = async (r) => { if (r.request().method() === "POST" && r.url().endsWith("/api/logs")) { try { logIds.push((await r.json()).log?.id); } catch {} } };
    p.on("response", onRes);

    // 1) 쉬는 중 → Dock ⏱ → 카드 → 시작
    step = "Dock ⏱";
    await go("#/notes", 2500);
    const s0 = await st();
    await p.click("#timer-btn"); await sleep(450);
    const s1 = await st(), chips = await p.locator("#timer .isl-chip").count();
    await shot("idle-card");
    await p.click('#timer .isl-chip[data-min="25"]'); await sleep(150);
    await p.click("#tm-start"); await sleep(900);
    const s2 = await st(), pb = await box("#timer .isl-pill");
    const centered = pb && Math.abs(pb.x + pb.w / 2 - w / 2) < 2 && pb.y >= 0 && pb.y < 60;
    ok(!s0.live && !s0.pill && s1.card && chips === 5 && s2.live && s2.hidden && s2.pill && !s2.card && s2.phase === "run" && centered && /시작/.test(s2.pillText) && presence.includes("focus"),
      `${tv} · 집중 섬 시작 — 쉬는 중 섬 ${s0.pill} · Dock ⏱ 카드 ${s1.card}(길이 ${chips}개) → 시작 = 알약 ${s2.pill} · 가운데 ${!!centered} (${pb ? Math.round(pb.x + pb.w / 2) + "/" + w / 2 + " · 위 " + Math.round(pb.y) : "없음"}) · '${s2.pillText.trim()}' · 서버 ${presence.join(",") || "없음"}`);
    await sleep(1800); // 시작 알림이 끝나고 "집중" 으로
    await shot("collapsed");

    // 2) 다른 화면 둘
    step = "다른 화면";
    const seen = [];
    for (const [hash, sel] of [["#/sw", "#main .host"], ["#/plans", "#main .host"]]) {
      await p.evaluate((x) => { location.hash = x; }, hash); await p.waitForSelector(sel, { timeout: 8000 }).catch(() => {}); await sleep(900);
      const s = await st(); seen.push(`${hash} ${s.pill ? s.time : "없음"}`);
      if (!s.pill || s.phase !== "run") seen.push("!");
    }
    const sMid = await st();
    ok(!seen.includes("!") && /집중/.test(sMid.pillText) && !/시작/.test(sMid.pillText), `${tv} · 집중 섬 — 화면을 옮겨도 그대로 (${seen.join(" · ")}) · 알약 '${sMid.pillText.trim()}'`);

    // 3) 펼치기 · +5분 · 일시정지 · 계속 · 접기
    step = "펼치기";
    await p.click("#timer .isl-pill"); await sleep(450);
    const e1 = await st(), focusIn = await p.evaluate(() => document.activeElement?.id);
    await shot("expanded");
    const before = secs(e1.clock);
    await p.click("#tm-plus"); await sleep(300);
    const e2 = await st(), after = secs(e2.clock), title = await p.locator("#timer .isl-title").textContent();
    const plus = after - before;
    step = "일시정지";
    await p.click("#tm-toggle"); await sleep(300);
    const pz1 = await st(); await sleep(1600); const pz2 = await st();
    const focusKept = await p.evaluate(() => document.activeElement?.id);
    await shot("paused");
    await p.click("#tm-toggle"); await sleep(1700);
    const rs = await st();
    ok(e1.card && !e1.pill && focusIn === "tm-toggle" && plus >= 298 && plus <= 301 && /30분 블록/.test(title) && pz1.phase === "pause" && pz1.clock === pz2.clock && focusKept === "tm-toggle" && rs.phase === "run" && secs(rs.clock) < secs(pz2.clock) && presence.filter((x) => x === "idle").length >= 1,
      `${tv} · 집중 섬 카드 — 펼침 ${e1.card} (포커스 ${focusIn}) · +5분 ${e1.clock} → ${e2.clock} (${plus}초) · '${title}' · 일시정지 ${pz1.phase} 숫자 ${pz1.clock}→${pz2.clock} · 계속 ${rs.phase} ${rs.clock} · 서버 ${presence.join(",")}`);
    step = "접기";
    await p.keyboard.press("Escape"); await sleep(400);
    const c1 = await st(), focusPill = await p.evaluate(() => !!document.activeElement?.classList.contains("isl-pill"));
    await p.keyboard.press("Enter"); await sleep(400);
    const c2 = await st();
    await p.mouse.click(w - 30, 300); await sleep(400);
    const c3 = await st();
    ok(c1.hidden && c1.pill && !c1.card && focusPill && !c2.hidden && c2.card && c3.hidden && c3.pill, `${tv} · 집중 섬 접기 — Esc ${c1.hidden} (알약에 포커스 ${focusPill}) · Enter 다시 펼침 ${c2.card} · 바깥 클릭 ${c3.hidden}`);

    // 4) 맨 위 띠들과 겹치지 않기
    step = "띠 겹침";
    const addBar = (cls, html) => p.evaluate(([cls, html]) => { const b = document.createElement("div"); b.className = cls; b.dataset.e2e = "1"; b.innerHTML = html; document.body.append(b); }, [cls, html]);
    await addBar("trial-bar", "<span>무료 체험 <b>23시간</b> 남았어요</span><button class='trial-x' type='button'>✕</button>");
    await sleep(300);
    const t1 = { isl: await box("#timer .isl-pill"), trial: await box(".trial-bar") };
    await shot("trial");
    await addBar("ann-bar", "<span>오늘 밤 11시에 점검이 있어요. 저장을 잊지 마세요.</span><button class='ann-x' type='button'>✕</button>");
    await sleep(300);
    const t2 = { isl: await box("#timer .isl-pill"), ann: await box(".ann-bar"), trial: await box(".trial-bar"), dock: await box(".rail.dock") };
    await shot("ann");
    // 띠를 넣은 뒤 앱 머리줄이 내려가기까지 — 검사를 같이 돌려 느릴 때는 300ms 로 모자랐어요 (최대 3초 기다려요)
    await p.waitForFunction((b) => document.querySelector("#main").getBoundingClientRect().y >= b, t1.isl.y + t1.isl.h, { timeout: 3000 }).catch(() => {});
    const main = await box("#main");
    const noOver = !overlap(t1.isl, t1.trial) && !overlap(t2.isl, t2.ann) && !overlap(t2.isl, t2.trial) && !overlap(t2.ann, t2.trial) && t1.trial.y > t1.isl.y;
    const dockOk = w > 600 || !overlap(t2.trial, t2.dock);
    const mainOk = main.y >= t1.isl.y + t1.isl.h; // 앱(머리줄)이 섬 밑에서 시작
    ok(noOver && dockOk && mainOk, `${tv} · 집중 섬 + 띠 — 체험 띠 ${Math.round(t1.trial.y)}px(섬 ${Math.round(t1.isl.y)}~${Math.round(t1.isl.y + t1.isl.h)}) · 공지 ${Math.round(t2.ann.y)}px · 체험 띠(공지 있을 때) ${Math.round(t2.trial.y)}px · 겹침 없음 ${noOver} · Dock 안 가림 ${dockOk} · 앱 머리 ${Math.round(main.y)}px ${mainOk}`);
    // 라이트 테마에서도 섬은 검은색
    await p.evaluate(() => { document.documentElement.dataset.theme = "light"; }); await sleep(250);
    await shot("ann-light");
    const bg = await p.evaluate(() => getComputedStyle(document.querySelector("#timer .isl-pill")).backgroundColor);
    await p.click("#timer .isl-pill"); await sleep(450); await shot("expanded-light");
    await p.keyboard.press("Escape"); await sleep(300);
    await p.evaluate(() => document.querySelectorAll("[data-e2e]").forEach((n) => n.remove())); await sleep(250);
    await shot("collapsed-light");
    await p.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    ok(bg === "rgb(11, 11, 13)", `${tv} · 라이트 테마에서도 섬은 검은색 (${bg})`);

    // 4b) 새로고침해도 집중이 이어져요 (localStorage focus-sess)
    step = "새로고침";
    const rb = await p.$eval("#timer .isl-time", (n) => n.textContent).catch(() => "");
    await p.reload({ waitUntil: "networkidle" }); await sleep(900);
    const ra = await p.$eval("#timer.is-live .isl-time", (n) => n.textContent).catch(() => "");
    ok(!!ra && ra <= rb, `${tv} · 새로고침해도 집중 섬이 이어져요 (${rb} → ${ra || "없음"})`);

    // 5) 멈추기 · 끝
    step = "멈추기";
    presence.length = 0;
    await p.click("#timer .isl-pill"); await sleep(400);
    await p.click("#tm-stop"); await sleep(600);
    const x1 = await st(), xb = await box("#timer .isl-pill"), padBack = await box("#main");
    ok(!x1.live && !x1.pill && !xb && presence.includes("idle") && padBack.y < 30, `${tv} · 집중 섬 멈추기 — 섬 사라짐 ${!x1.pill} · 서버 ${presence.join(",") || "없음"} · 앱 머리 ${Math.round(padBack.y)}px`);
    step = "끝";
    // 할 일 ▶ 와 같은 길(ctx.timer = 같은 모듈)로 시작하고, 끝 시각만 1.5초 뒤로 당겨요
    await p.evaluate(async () => { const m = await import("/js/focus-timer.js"); m.timer.start(15); m.timer.end = Date.now() + 1500; });
    await sleep(2600);
    const d1 = await st();
    await shot("done");
    await sleep(4600);
    const d2 = await st();
    ok(d1.phase === "done" && d1.pill && /끝/.test(d1.pillText) && /끝났어요/.test(d1.sr) && !d2.live && !d2.pill, `${tv} · 집중 섬 끝 — '${d1.pillText.trim()}' (${d1.phase}) · 읽기 '${d1.sr}' → 4초 뒤 사라짐 ${!d2.pill}`);
    const errs = getErrs();
    ok(!errs.length, `${tv} · 집중 섬 — 콘솔 오류 없음${errs.length ? " — " + errs[0] : ""}`);
    p.off("request", onReq); p.off("response", onRes);
    await p.evaluate(async (ids) => { for (const id of ids) if (id) await fetch("/api/logs/" + id, { method: "DELETE", headers: { "x-trio": "1" } }); }, logIds);
  } catch (e) {
    ok(false, `${tv} · 집중 섬 (${step}) — ${e.message.split("\n")[0]}`);
  }
}

// 따로 돌리기
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const BASE = process.env.BASE || "http://127.0.0.1:8787";
  const { chromium } = createRequire(import.meta.url)("playwright");
  const H = { "x-trio": "1", "content-type": "application/json" };
  let fails = 0;
  const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
  const user = "t_eis" + Date.now().toString(36);
  execFileSync("node", ["scripts/add-user.mjs", user, "섬검사", "password1", "--team=swx2", "--features=all"], { stdio: "ignore" });
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    for (const [w, h, tv] of [[1280, 860, "컴퓨터"], [390, 844, "폰"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.request.post(BASE + "/api/auth/login", { headers: H, data: { username: user } });
      const p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      const go = async (hash, wait = 1800) => { await p.goto("about:blank"); await p.goto(BASE + "/" + hash); await sleep(wait); };
      await islandE2E({ p, go, ok, tv, w, getErrs: () => errs, shots: process.env.SHOTS || null });
      await ctx.close();
    }
  } finally {
    await browser.close();
    try { execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM users WHERE username = '${user}'`], { stdio: "ignore" }); } catch {}
  }
  console.log(fails ? `\n실패 ${fails}개` : "\n모두 통과");
  process.exitCode = fails ? 1 : 0;
}

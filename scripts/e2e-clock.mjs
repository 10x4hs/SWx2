// 홈 시계가 하루 중 어느 시각에도 눌리는지 — 시각을 고정(Playwright clock)하고 컴퓨터 · 폰에서 검사해요
//   `BASE=http://127.0.0.1:8787 node scripts/e2e-clock.mjs` (앱을 켜 둔 상태에서)
//   시각마다: 링 누르면 하루 계획표 · Day 쪽 ‹ 날짜 › · 조각 복사 → 링 20시에 붙여넣기(컴퓨터) · 터치로 링 누르기(폰)
//   예전엔 .hud-pad 의 빈 자리(z-index 6)가 링 위를 덮어서, 시각 · 다짐 길이에 따라 클릭을 가로챘어요.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const SHOTS = process.env.SHOTS || "/private/tmp/claude-501/clock-shots";
const { chromium } = createRequire(import.meta.url)("playwright");
const H = { "x-trio": "1", "content-type": "application/json" };
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SHOTS, { recursive: true });

// 같은 팀 친구 여럿(다짐도 써요, 기본 8명) — 친구 칩이 여러 줄로 늘어나 패드가 링까지 내려오는 가장 나쁜 경우
const tag = Date.now().toString(36), user = "t_e2c" + tag, friends = Array.from({ length: +(process.env.FRIENDS || 8) }, (_, i) => `t_e2d${i}${tag}`);
for (const [u, n] of [[user, "시계검사"], ...friends.map((f, i) => [f, "시계친구" + i])]) execFileSync("node", ["scripts/add-user.mjs", u, n, "password1", "--team=swx2", "--features=all"], { stdio: "ignore" });
const cleanup = () => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM users WHERE username IN ('${[user, ...friends].join("','")}')`], { stdio: "ignore" });

// 오늘(KST) 날짜에 시각만 바꿔요
const kstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const HOURS = ["00:30", "06:00", "13:00", "20:00", "23:50"];
const ringPt = (pg, m, r = 0.5) => pg.evaluate(([m, r]) => {
  const svg = document.querySelector(".pg-slide:not(.out) svg[data-dial]");
  const [cx, cy, ri, ro] = svg.dataset.dial.split(" ").map(Number), rr = ri + (ro - ri) * r, a = (m / 1440) * 2 * Math.PI - Math.PI / 2;
  const q = new DOMPoint(cx + rr * Math.cos(a), cy + rr * Math.sin(a)).matrixTransform(svg.getScreenCTM());
  return [q.x, q.y];
}, [m, r]);
// 그 자리를 누르면 무엇이 받는지 (svg 안이 아니면 가린 것)
const hit = (pg, [x, y]) => pg.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest("svg[data-dial]") ? "" : (e ? e.tagName.toLowerCase() + "." + [...e.classList].join(".") : "nothing"); }, [x, y]);

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
  for (const f of friends) {
    const fc = await browser.newContext();
    await fc.request.post(BASE + "/api/auth/login", { headers: H, data: { username: f } });
    await fc.request.put(BASE + "/api/home/pledge", { headers: H, data: { text: "친구도 오늘 다짐을 길게 써 두었어요 정말 길게요", day: kstToday } });
    await fc.close();
  }
  for (const [w, h, tv] of [[1280, 900, "컴퓨터"], [390, 844, "폰"]]) {
    for (const hm of HOURS) {
      const touch = tv === "폰";
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: "Asia/Seoul", locale: "ko-KR", ...(touch ? { hasTouch: true, isMobile: true } : {}) });
      await ctx.request.post(BASE + "/api/auth/login", { headers: H, data: { username: user } });
      // 다짐을 길게 써 두면 패드가 더 커져요 — 가장 나쁜 경우로
      await ctx.request.put(BASE + "/api/home/pledge", { headers: H, data: { text: "오늘은 링 위를 가리지 않는 긴 다짐을 써 봐요 ".repeat(3).slice(0, 118), day: kstToday } }).catch(() => {});
      await ctx.clock.setFixedTime(new Date(`${kstToday}T${hm}:00+09:00`));
      await ctx.addInitScript(() => { try { localStorage.setItem("trio-home-page", "3"); localStorage.setItem("trio-guide-off", "1"); localStorage.removeItem("trio-home-day"); } catch {} });
      const p = await ctx.newPage();
      const go = async () => { await p.goto("about:blank"); await p.goto(BASE + "/#/"); await p.waitForSelector(".pg-slide:not(.out) svg[data-dial]", { timeout: 10000 }); await sleep(1200); };
      const tag = `${tv} ${hm}`;
      try {
        await go();
        await p.screenshot({ path: `${SHOTS}/${w}-${hm.replace(":", "")}.png` });
        // 링 둘레를 한 바퀴(30분마다) — 어느 자리도 가려지면 안 돼요
        const blocked = [];
        for (let m = 0; m < 1440; m += 30) { const b = await hit(p, await ringPt(p, m)); if (b) blocked.push(`${String(m / 60 | 0).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}→${b}`); }
        ok(!blocked.length, `${tag} · 링 둘레 가림 없음${blocked.length ? " — " + blocked.slice(0, 4).join(", ") : ""}`);
        // 링 누르면 하루 계획표
        const pt = await ringPt(p, 300);
        if (touch) await p.touchscreen.tap(...pt); else await p.mouse.click(...pt);
        await sleep(900);
        const hash = await p.evaluate(() => location.hash);
        ok(hash.startsWith("#/calendar/"), `${tag} · 링 누르면 하루 계획표 (${hash})`);
        // Day 쪽 ‹ 날짜 › (Playwright click 은 가리는 게 있으면 실패해요)
        await go();
        const cap = () => p.evaluate(() => document.querySelector(".pg-slide:not(.out) svg.ch-day-clock .ch-cap")?.textContent || "");
        await p.click('.pg-slide:not(.out) svg [data-dnav="next"]', { timeout: 4000 }); await sleep(500); const c1 = await cap();
        await p.click('.pg-slide:not(.out) svg [data-dnav="today"]', { timeout: 4000 }); await sleep(500);
        await p.click('.pg-slide:not(.out) svg [data-dnav="prev"]', { timeout: 4000 }); await sleep(500); const c2 = await cap();
        ok(c1 === "내일 계획" && c2 === "어제 점수", `${tag} · Day 쪽 › ${c1} · ‹ ${c2}`);
        await p.evaluate(() => localStorage.removeItem("trio-home-day"));
        // 컴퓨터: 조각 복사 → 링 20시에 붙여넣기
        if (!touch) {
          const made = (await (await ctx.request.post(BASE + "/api/plans", { headers: H, data: { scope: "day", period: "D:" + kstToday, text: "시계 복사", start: "06:00", mins: 30 } })).json()).plan;
          await go();
          const seg = await p.evaluate(() => { const b = [...document.querySelectorAll(".pg-slide:not(.out) svg .ch-block")].find((x) => /시계 복사/.test(x.querySelector("title")?.textContent || "")); const r = b?.getBoundingClientRect(); return r ? [r.left + r.width / 2, r.top + r.height / 2] : [0, 0]; });
          await p.mouse.move(...seg); await sleep(150); await p.keyboard.press("Control+C"); await sleep(200);
          await p.mouse.move(...await ringPt(p, 1200)); await sleep(150); await p.keyboard.press("Control+V"); await sleep(1800);
          const plans = (await (await ctx.request.get(BASE + "/api/plans?periods=D:" + kstToday, { headers: H })).json()).plans || [];
          const pasted = plans.filter((x) => x.text === "시계 복사" && x.start === "20:00");
          ok(pasted.length === 1, `${tag} · 조각 복사 → 링 20시에 붙여넣기 ${pasted.length === 1}`);
          for (const x of plans.filter((x) => x.text === "시계 복사")) await ctx.request.delete(BASE + "/api/plans/" + x.id, { headers: H });
          void made;
        }
      } catch (e) { ok(false, `${tag} · ${String(e.message).split("\n")[0]}`); }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  try { cleanup(); } catch {}
}
console.log(fails ? `\n${fails} FAIL` : "\nALL PASS");
process.exit(fails ? 1 : 0);

// 가벼운 첫 화면 (화면 모듈 나눠 받기 · CDN 안 기다리기 · SW API 캐시) — e2e.mjs 가 부르는 구역 "lazy-load" (컴퓨터 · 폰) · 2026-11-16
//   1) 새로 연 #/ : 관리자 · SVM · Psychology · MBA 화면 모듈이나 그 CSS 를 받지 않아요 (처음 열 때 받아요)
//   2) CDN(jsDelivr · Google Fonts)이 답을 안 줘도 홈이 떠요 (글꼴 CSS 가 첫 화면을 막지 않아요)
//   3) Dock 아이콘마다 + 그 밖의 화면 주소: 처음 여는 화면도 그려지고 그 화면 CSS 가 붙어요 (바로 주소로 새로 열어도)
//   4) 서비스 워커: /api/plans 에 저장(GET 아님)이 지나가도 상관없는 API 캐시(/api/notes)는 그대로, plans 캐시만 비워요
import { execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAVY = /\/js\/views\/(admin|svm|psy|mba)\.js$|\/css\/(svm|psy|mba)\.css$/;
// Dock 아이콘 → 그려질 화면 (svm 은 관리자만)
const DOCK = [["calendar", "calendar"], ["brain", "brain"], ["study", "study"], ["news", "news"], ["room", "room"], ["diary", "diaryRoom"], ["biz", "mba"], ["dev", "dev"], ["cim", "cim"], ["psy", "psy"], ["svm", "svm"], ["home", "home"]];
const ROUTES = [["#/settings", "settings"], ["#/updates", "updates"], ["#/teams", "teams"], ["#/ai", "ai"], ["#/planner", "planner"], ["#/admin", "admin"], ["#/notes", "notes"], ["#/brain/graph", "graph"], ["#/goals/week", "goals"], ["#/checklist", "checklist"], ["#/p/new", "page"], ["#/papers", "study"], ["#/books", "study"]];
// 화면 CSS 가 붙었는지: 그 화면만 쓰는 규칙 하나 (.main:has(.host-x) 배경)
const CSS_PROBE = { mba: "rgb(5, 6, 7)", psy: "rgb(8, 8, 10)" };

export async function lazyE2E({ browser, BASE, H, ok, VIEWPORTS, TEAM, tag }) {
  const u = "t_e2z" + tag;
  const sq = (q) => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", q], { stdio: "ignore" });
  execFileSync("node", ["scripts/add-user.mjs", u, "나눠받기", "password1", "--team=" + TEAM, "--features=all"], { stdio: "ignore" });
  // 관리자 + psy: 관리자 화면 · SVM · Psychology 까지 열 수 있는 사람이어도 첫 화면에선 안 받아야 해요
  sq(`UPDATE users SET role = 'admin' WHERE username = '${u}'; INSERT OR IGNORE INTO user_features (user_id, feature, at) SELECT id, 'psy', ${Date.now()} FROM users WHERE username = '${u}'`);
  try {
    for (const [w, h, tv] of [[1300, 900, "컴퓨터", "desktop"], [390, 844, "폰", "phone"]].filter((v) => VIEWPORTS.includes(v[3]))) {
      // ---- 1) 첫 화면에서 무거운 화면을 받지 않아요 ----
      {
        const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
        try {
          await c.request.post(BASE + "/api/auth/login", { headers: H, data: { username: u, password: "password1" } });
          const p = await c.newPage(), got = [];
          p.on("request", (r) => got.push(new URL(r.url()).pathname));
          await p.goto(BASE + "/#/");
          await p.waitForSelector(".host-home > *", { timeout: 15000 }).catch(() => {});
          await p.waitForLoadState("networkidle").catch(() => {});
          const heavy = got.filter((x) => HEAVY.test(x)), views = got.filter((x) => x.startsWith("/js/views/"));
          ok(await p.$(".host-home > *") && !heavy.length, `${tv} · 새로 연 #/ 에서 관리자 · SVM · Psychology · MBA 모듈/CSS 를 안 받아요 (화면 모듈 ${views.length}개${heavy.length ? " — 받음: " + heavy.join(", ") : ""})`);
        } finally { await c.close(); }
      }
      // ---- 2) CDN 이 멈춰도 홈이 떠요 ----
      {
        const c = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
        try {
          await c.request.post(BASE + "/api/auth/login", { headers: H, data: { username: u, password: "password1" } });
          await c.route(/^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, () => {}); // 답을 영영 안 줘요
          const p = await c.newPage(), t0 = Date.now();
          await p.goto(BASE + "/#/", { waitUntil: "commit" });
          const shown = await p.waitForSelector(".host-home > *", { timeout: 8000 }).then(() => true, () => false);
          ok(shown, `${tv} · CDN(jsDelivr · Google Fonts)이 답을 안 줘도 홈이 떠요 (${shown ? Date.now() - t0 + "ms" : "8초 넘게 안 뜸"})`);
        } finally { await c.close(); }
      }
      // ---- 3) Dock 아이콘 · 화면 주소마다 처음 열어도 그려져요 ----
      const c = await browser.newContext({ viewport: { width: w, height: h } });
      try {
        await c.request.post(BASE + "/api/auth/login", { headers: H, data: { username: u, password: "password1" } });
        const p = await c.newPage(), errs = [];
        p.on("pageerror", (e) => errs.push(e.message));
        await p.goto(BASE + "/#/");
        await p.waitForSelector(".host-home > *", { timeout: 15000 }).catch(() => {});
        const drawn = (key) => p.waitForFunction((k) => document.querySelector("#main > .host-" + k)?.childElementCount > 0 && !document.querySelector("#main[aria-busy]"), key, { timeout: 12000 }).then(() => true, () => false);
        const bg = () => p.evaluate(() => getComputedStyle(document.querySelector("#main")).backgroundColor);
        const bad = [];
        for (const [nav, key] of DOCK) {
          const has = await p.evaluate((n) => { const a = document.querySelector(`a.rail-btn[data-nav="${n}"]`); if (a) a.click(); return !!a; }, nav);
          if (!has || !(await drawn(key))) { bad.push(`${nav}${has ? "" : "(Dock 에 없음)"}`); continue; }
          if (CSS_PROBE[key] && (await bg()) !== CSS_PROBE[key]) bad.push(`${nav}(CSS 안 붙음: ${await bg()})`);
        }
        ok(!bad.length && !errs.length, `${tv} · Dock 아이콘 ${DOCK.length}개 — 처음 여는 화면도 그려져요${bad.length ? " — 안 됨: " + bad.join(", ") : ""}${errs.length ? " — 오류: " + errs[0] : ""}`);
        const bad2 = [];
        for (const [hash, key] of ROUTES) {
          await p.evaluate((x) => { location.hash = x; }, hash);
          if (!(await drawn(key))) bad2.push(hash);
        }
        ok(!bad2.length && !errs.length, `${tv} · 화면 주소 ${ROUTES.length}개 (설정 · 관리자 · 노트 · 그래프 …) 처음 열어도 그려져요${bad2.length ? " — 안 됨: " + bad2.join(", ") : ""}${errs.length ? " — 오류: " + errs[0] : ""}`);
        // 바로 주소로 새로 열기 (모듈이 하나도 없는 상태에서 그 화면부터)
        const bad3 = [];
        for (const [hash, key] of [["#/mba", "mba"], ["#/psy", "psy"], ["#/svm", "svm"], ["#/news", "news"]]) {
          await p.goto("about:blank"); await p.goto(BASE + "/" + hash);
          if (!(await drawn(key))) bad3.push(hash);
          else if (CSS_PROBE[key] && (await bg()) !== CSS_PROBE[key]) bad3.push(hash + "(CSS)");
        }
        ok(!bad3.length && !errs.length, `${tv} · #/mba · #/psy · #/svm · #/news 를 바로 열어도 그려지고 CSS 가 붙어요${bad3.length ? " — 안 됨: " + bad3.join(", ") : ""}${errs.length ? " — 오류: " + errs[0] : ""}`);

        // ---- 4) SW: /api/plans 저장이 다른 API 캐시를 지우지 않아요 ----
        const ctl = await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).then(() => true, () => false);
        const r = ctl && await p.evaluate(async () => {
          const hd = { "x-trio": "1" }, sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
          const day = new Date().toISOString().slice(0, 10);
          await fetch("/api/notes", { headers: hd }); await fetch("/api/plans?day=" + day, { headers: hd });
          await sleep(400);
          const name = (await caches.keys()).find((k) => k.startsWith("dsm-api-"));
          const has = async (path) => (await (await caches.open(name)).keys()).some((k) => new URL(k.url).pathname === path);
          const before = { notes: await has("/api/notes"), plans: await has("/api/plans") };
          await fetch("/api/plans/no-such-plan", { method: "DELETE", headers: { ...hd, "content-type": "application/json" } });
          await sleep(600);
          return { before, notes: await has("/api/notes"), plans: await has("/api/plans") };
        });
        ok(r && r.before.notes && r.before.plans && r.notes && !r.plans, `${tv} · SW: /api/plans 지우기가 지나가도 /api/notes 캐시는 남고 plans 캐시만 비워요 → ${JSON.stringify(r)}`);
      } finally { await c.close(); }
    }
  } finally {
    sq(`DELETE FROM users WHERE username = '${u}'`);
  }
}

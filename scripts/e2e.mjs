// 화면 검사(브라우저) — `npm run dev` 로 앱을 켜 둔 상태에서 `npm run e2e` (기본 http://127.0.0.1:8787, 다른 주소는 BASE=…)
// 지금까지 실제로 깨졌던 것만 봐요. 컴퓨터(1300×900) · 폰(390×844) 크기 둘 다:
//   ① 과목 탭 높이 — 어느 길로 들어와도(바로 주소 · 영어 · 논문 · AI 탭에서 전환 · 과목끼리 · 새로고침) iframe 이 화면 끝까지 (2026-10-11)
//   ② 여러 파일 페이지 — style.css · app.js 가 sandbox iframe 안에서 불러와지는지 (흰 화면에 글자만 뜨던 문제, 2026-10-10)
//   ③ AI 공부책 — 책장 · 모든 장 · 복습 · 용어 사전이 오류 없이, 가로로 넘치지 않게
//   ④ 논문 쉽게 읽기 — 목록 · 한 편(장면 · 퀴즈 · 목차) · 복습
//   ⑤ 내 AI 모델 — 일정 AI 비서 칸에 고르기가 보이고, 바꾸면 계정에 저장돼 다시 열어도 그대로
// 처음 한 번: `npm install` 후 `npx playwright install chromium`. 임시 계정(t_e2e…)을 만들었다가 지워요.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const { chromium } = createRequire(import.meta.url)("playwright"); // NODE_PATH 로 다른 곳의 playwright 도 쓸 수 있어요
const H = { "x-trio": "1", "content-type": "application/json" };
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/"); break; } catch { await sleep(500); } }

const tag = Date.now().toString(36), user = "t_e2e" + tag;
execFileSync("node", ["scripts/add-user.mjs", user, "화면검사", "password1"], { stdio: "ignore" });
const cleanup = () => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM users WHERE username = '${user}'`], { stdio: "ignore" }); // 페이지 · 기록은 같이 지워져요 (ON DELETE CASCADE)

// 과목 페이지: 화면을 꽉 채우는 한 장짜리 · 여러 파일(style.css · app.js)짜리
const FULL = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}body{display:grid;place-items:center;background:#1b6}</style><p>꽉 차야 해요</p>`;
const MULTI = {
  "index.html": `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="style.css"><p id="t">아직</p><script src="app.js"></script>`,
  "style.css": `#t { color: rgb(255, 0, 128); }`,
  "app.js": `document.getElementById("t").textContent = "JS OK";`,
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
  for (const [w, h, tv] of [[1300, 900, "컴퓨터"], [390, 844, "폰"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const login = await ctx.request.post(BASE + "/api/auth/login", { headers: H, data: { username: user } });
    ok(login.ok(), `${tv} · 임시 계정 로그인`);
    const mk = async (data) => (await (await ctx.request.post(BASE + "/api/pages", { headers: H, data })).json()).page.id;
    const A = await mk({ title: "검사 A", place: "study", files: { "index.html": FULL } });
    const B = await mk({ title: "검사 B", place: "study", files: { "index.html": FULL } });
    const M = await mk({ title: "검사 여러 파일", files: MULTI });

    const p = await ctx.newPage();
    let errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    // 앱을 새로 열어요 — 같은 문서에서 # 뒤만 바꾸면 껍데기가 남아서, "AI 탭에서 새로 열고 → 과목 탭" 같은 실제 순서를 흉내 내지 못해요
    const go = async (hash, wait = 1800) => { await p.goto("about:blank"); await p.goto(BASE + "/" + hash); await sleep(wait); };
    const hop = async (hash, sel, wait = 350) => { await p.evaluate((x) => { location.hash = x; }, hash); await p.waitForSelector(sel, { timeout: 8000 }).catch(() => {}); await sleep(wait); };

    // ---------- ① 과목 탭 높이 ----------
    const frameFill = () => p.evaluate(() => {
      const f = document.querySelector(".study-body iframe"), m = document.querySelector("#main").getBoundingClientRect(), r = f?.getBoundingClientRect();
      return r ? { h: Math.round(r.height), gap: Math.round(m.bottom - r.bottom), mh: Math.round(m.height) } : { h: 0, gap: 999, mh: Math.round(m.height) };
    });
    const filled = async (label) => { await sleep(1500); const f = await frameFill(); ok(f.h > f.mh * 0.7 && f.gap < 40, `${tv} · 과목 탭 높이 — ${label} (iframe ${f.h}px / 화면 ${f.mh}px)`); };
    await go("#/study/" + A); await filled("바로 주소");
    for (const [from, name] of [["#/english", "영어"], ["#/papers", "논문"], ["#/books", "AI"]]) {
      await go(from); await p.click(`#study-switch [data-sub="p:${A}"]`); await filled(`${name} 탭에서 전환`);
    }
    await p.click(`#study-switch [data-sub="p:${B}"]`); await filled("과목에서 다른 과목으로");
    await p.reload(); await sleep(800); await filled("새로고침");
    await p.click('#study-switch [data-sub="english"]'); await sleep(1500);
    const back = await p.evaluate(() => { const o = document.querySelector("#main > .host"), wr = document.querySelector(".study-wrap"); return { fill: o.classList.contains("study-fill"), fits: wr.scrollHeight <= wr.clientHeight + 1 }; });
    ok(!back.fill && back.fits, `${tv} · 과목에서 영어로 돌아가면 높이 고정이 풀려요`);

    // ---------- ⑤ 내 AI 모델 — 일정 AI 비서 칸에서 보이고 바꾸면 계정에 남아요 ----------
    await go("#/calendar/" + new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), 2500);
    const pick = p.locator(".aic-pick select").first();
    const hasPick = await pick.count() > 0;
    if (hasPick) { await p.waitForFunction(() => document.querySelectorAll(".aic-pick select option").length > 1, null, { timeout: 8000 }).catch(() => {}); await pick.selectOption("cohere"); await sleep(1200); }
    const saved = hasPick ? (await (await ctx.request.get(BASE + "/api/me")).json()).user.ai_model : null;
    await go("#/calendar/" + new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), 2500);
    const shown = hasPick ? await p.locator(".aic-pick select").first().inputValue().catch(() => "") : "";
    ok(hasPick && saved === "cohere" && shown === "cohere", `${tv} · 일정 AI 비서 — 모델 고르기 칸이 보이고, 바꾸면 계정에 저장 (${saved || "없음"} · 다시 열면 ${shown || "없음"})`);
    await ctx.request.patch(BASE + "/api/me", { headers: H, data: { ai_model: "" } });

    // ---------- ② 여러 파일 페이지 ----------
    await go("#/p/" + M, 3000);
    const fr = p.frames().find((x) => x.url().includes("/pf/"));
    const inner = fr ? await fr.evaluate(() => { const t = document.getElementById("t"); return t ? { text: t.textContent, color: getComputedStyle(t).color } : null; }).catch(() => null) : null;
    ok(inner?.text === "JS OK" && inner.color === "rgb(255, 0, 128)", `${tv} · 여러 파일 페이지 — app.js 실행 · style.css 적용 (${inner ? inner.text + " · " + inner.color : "iframe 없음"})`);

    // ---------- ③ AI 공부책 ----------
    errs = [];
    const idx = await (await ctx.request.get(BASE + "/books/index.json")).json();
    await go("#/books", 2200);
    const shelf = await p.evaluate(() => document.querySelectorAll(".bk-book").length);
    ok(shelf === idx.books.length, `${tv} · AI 책장 ${shelf} / ${idx.books.length}권`);
    const bad = [];
    for (const b of idx.books) for (const c of b.chapters) {
      errs = [];
      await hop(`#/books/${b.id}/${c.id}`, ".ez-sec#ez-s1");
      const r = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over = [...document.querySelectorAll(".ez *")].filter((e) => !e.closest("pre") && e.getBoundingClientRect().right > vw + 2).length;
        const emptyWidget = [...document.querySelectorAll("[data-widget]")].filter((x) => !x.querySelector("[data-out], .wg-bars, .wg-grid")?.textContent.trim()).length;
        return { secs: document.querySelectorAll(".ez-sec[id^=ez-s]").length, over, emptyWidget, hscroll: document.documentElement.scrollWidth > vw + 2 };
      });
      if (r.secs < 4 || r.over || r.emptyWidget || r.hscroll || errs.length) bad.push(`${b.id}/${c.id}(${[r.secs < 4 && "장 " + r.secs, r.over && "넘침 " + r.over, r.emptyWidget && "빈 위젯", r.hscroll && "가로스크롤", errs[0]].filter(Boolean).join(", ")})`);
    }
    ok(!bad.length, `${tv} · AI 공부책 ${idx.books.reduce((a, b) => a + b.chapters.length, 0)}장 — 오류 · 넘침 없음${bad.length ? ": " + bad.slice(0, 5).join(" · ") : ""}`);
    errs = [];
    await hop("#/books/review", ".ez-rv h2, .ez-rv .qz", 600);
    await hop("#/books/words", "#bk-wl", 600);
    ok(!errs.length && await p.evaluate(() => !!document.querySelector("#bk-wl")), `${tv} · AI 복습 · 용어 사전 열림${errs.length ? " — " + errs[0] : ""}`);

    // ---------- ④ 논문 쉽게 읽기 ----------
    errs = [];
    const pidx = await (await ctx.request.get(BASE + "/papers/index.json")).json();
    await go("#/papers/easy", 2500);
    ok(await p.evaluate(() => document.querySelectorAll(".ez-list li").length) === pidx.papers.length, `${tv} · 논문 쉽게 읽기 목록 ${pidx.papers.length}편`);
    await go("#/papers/cmx/easy", 3000);
    const pe = await p.evaluate(() => ({ secs: document.querySelectorAll(".ez-sec[id^=ez-s]").length, scene: document.querySelectorAll("[data-scene]").length, toc: document.querySelectorAll(".ez-toc a, .ez-toc-pop a").length }));
    await p.click('.ez-sec .qz [data-c="0"]').catch(() => {});
    const answered = await p.evaluate(() => !document.querySelector(".ez-sec .qz .qz-w")?.hidden);
    ok(pe.secs >= 9 && pe.scene >= 1 && pe.toc > 0 && answered && !errs.length, `${tv} · 논문 한 편 — 장 ${pe.secs} · 장면 ${pe.scene} · 목차 ${pe.toc} · 퀴즈 답하기 ${answered}${errs.length ? " — " + errs[0] : ""}`);
    await go("#/papers/easy/review", 2000);
    ok(await p.evaluate(() => !!document.querySelector(".ez-rv h2, .ez-rv .qz")), `${tv} · 논문 섞어서 복습 화면`);

    await ctx.close();
  }
} finally {
  await browser.close();
  try { cleanup(); } catch {}
}
console.log(fails ? `\n실패 ${fails}개` : "\n모두 통과");
process.exitCode = fails ? 1 : 0;

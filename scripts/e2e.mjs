// 화면 검사(브라우저) — `npm run dev` 로 앱을 켜 둔 상태에서 `npm run e2e` (기본 http://127.0.0.1:8787, 다른 주소는 BASE=…)
// 지금까지 실제로 깨졌던 것만 봐요. 컴퓨터(1300×900) · 폰(390×844) 크기 둘 다:
//   ① 과목 탭 높이 — 어느 길로 들어와도(바로 주소 · 영어 · 논문 · AI 탭에서 전환 · 과목끼리 · 새로고침) iframe 이 화면 끝까지 (2026-10-11)
//   ② 여러 파일 페이지 — style.css · app.js 가 sandbox iframe 안에서 불러와지는지 (흰 화면에 글자만 뜨던 문제, 2026-10-10)
//   ③ AI 공부책 — 책장 · 모든 장 · 복습 · 용어 사전이 오류 없이, 가로로 넘치지 않게
//   ④ 논문 쉽게 읽기 — 목록 · 한 편(장면 · 퀴즈 · 목차) · 복습
//   ⑤ 내 AI 모델 — 일정 AI 비서 칸에 고르기가 보이고, 바꾸면 계정에 저장돼 다시 열어도 그대로
//   ⑥ 자정 AI 점수 — 지난 날 그날 화면에 점수 · 한 줄 평 · 매긴 모델, 오늘은 안 보여요
//   ⑦ 계획 길이 — 직접 입력 '3' 은 3분으로 저장되고, 다음 계획의 기본 길이는 그대로 1시간 (전에 넣은 길이를 따라가지 않아요)
//   ⑧ Dock 순서 — '대화' 아이콘을 끌어서 맨 앞으로 → 계정에 저장, 새로고침해도 그대로, 끄는 동안 링크가 열리지 않아요
//   ⑨ 친구 페이지 숨기기 — 친구가 공개한 Dock 페이지 · 공부 과목 탭을 '내 화면에서 숨기기', 프로필에서 다시 보이기
//   ⑩ Study 그래프 — 영어 · 논문 · AI · 과목 페이지마다 [내용 | 그래프], 크기 기준 · 크기가 계정에 저장, 점을 누르면 그 내용으로
//   ⑪ Brain — 노트 + 공부를 한 나무로: 맨 위엔 큰 개념 5개, 누르면 안으로, 공부 점은 원래 화면, 가져오기는 다시 올려도 그대로 (2026-10-13)
//   ⑫ 뉴스 — 하루 한 호 (유리 재질 · 한국어) · 분야 · 기사 시트 · 메모 + 반박 · j/k · Esc (2026-10-13)
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

const tag = Date.now().toString(36), user = "t_e2e" + tag, friend = "t_e2f" + tag;
execFileSync("node", ["scripts/add-user.mjs", user, "화면검사", "password1"], { stdio: "ignore" });
execFileSync("node", ["scripts/add-user.mjs", friend, "검사친구", "password1"], { stdio: "ignore" }); // ⑨ 공개 페이지를 올리는 친구
const cleanup = () => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM users WHERE username IN ('${user}', '${friend}')`], { stdio: "ignore" }); // 페이지 · 기록은 같이 지워져요 (ON DELETE CASCADE)

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

    // ---------- ⑦ 계획 길이: 직접 입력 3 → 3분, 다음 기본값은 1시간 ----------
    try {
      const day7 = new Date(Date.now() + 9 * 3600e3 + 2 * 864e5).toISOString().slice(0, 10); // 모레 (지금 시각 줄과 겹치지 않게)
      await go("#/calendar/" + day7, 2500);
      const hr = w > 600 ? 9 : 14, label7 = `3분 스트레칭 ${tv}`; // 컴퓨터 · 폰이 같은 날을 써서 칸이 겹치지 않게
      await p.locator(`.hour[data-h="${hr}"] [data-slot]`).first().click({ position: { x: 40, y: 3 }, timeout: 8000 }); // 그 시각 칸 (가려져 있으면 여기서 실패해요)
      const f = p.locator("[data-slot-form]").first();
      await f.waitFor({ timeout: 5000 });
      const def1 = await f.locator("select[name=mins]").inputValue().catch(() => "");
      await f.locator("[name=text]").fill(label7);
      await f.locator("select[name=mins]").selectOption("custom");
      await f.locator("[name=mins_text]").fill("3");
      await f.locator("[name=text]").press("Enter");
      await sleep(1500);
      const saved = (await (await ctx.request.get(BASE + "/api/plans?periods=D:" + day7)).json()).plans.find((x) => x.text === label7);
      const def2 = await p.locator("[data-slot-form] select[name=mins]").first().inputValue().catch(() => "(창 없음)");
      ok(def1 === "60" && saved?.mins === 3 && def2 === "60", `${tv} · 계획 길이 — 직접 입력 3 → ${saved ? saved.mins + "분" : "저장 안 됨"} · 기본값 처음 ${def1} → 다음 ${def2}`);
    } catch (e) { const why = String(e.message).split("\n").filter((l) => /intercept|stable|outside|visible/.test(l)).slice(-2).join(" / "); ok(false, `${tv} · 계획 길이 — ${String(e.message).split("\n")[0]}${why ? " · " + why : ""}`); }

    // ---------- ⑧ Dock 순서: '대화'를 끌어서 맨 앞으로 ----------
    try {
      await ctx.request.patch(BASE + "/api/me", { headers: H, data: { dock_order: null } });
      await go("#/", 2200);
      const order = () => p.evaluate(() => [...document.querySelectorAll("#dock-list > [data-dock]")].map((x) => x.dataset.dock));
      const mid = async (k) => { const bb = await p.locator(`#dock-list > [data-dock="${k}"]`).boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
      const first = (await order())[0], from = await mid("nav:room"), to = await mid(first), vert = Math.abs(to.y - from.y) > Math.abs(to.x - from.x);
      await p.mouse.move(from.x, from.y); await p.mouse.down();
      await p.mouse.move(from.x + (vert ? 0 : -8), from.y + (vert ? -8 : 0), { steps: 3 });
      await p.mouse.move(to.x - (vert ? 0 : 8), to.y - (vert ? 8 : 0), { steps: 12 }); await p.mouse.up(); await sleep(1200);
      const moved = (await order())[0], stayed = await p.evaluate(() => location.hash);
      const savedOrder = (await (await ctx.request.get(BASE + "/api/me")).json()).user.dock_order;
      await p.reload(); await sleep(2200);
      const after = (await order())[0];
      ok(moved === "nav:room" && savedOrder[0] === "nav:room" && after === "nav:room" && stayed === "#/", `${tv} · Dock 순서 — 끌어서 맨 앞: ${moved} · 저장 ${savedOrder[0]} · 새로고침 ${after} · 링크 안 열림 ${stayed === "#/"}`);
      await ctx.request.patch(BASE + "/api/me", { headers: H, data: { dock_order: null } });
    } catch (e) { ok(false, `${tv} · Dock 순서 — ${String(e.message).split("\n")[0]}`); }

    // ---------- ⑨ 친구가 공개한 페이지를 내 화면에서 숨기기 → 프로필에서 다시 보이기 ----------
    try {
      const fctx = await browser.newContext();
      await fctx.request.post(BASE + "/api/auth/login", { headers: H, data: { username: friend } });
      const fmk = async (data) => (await (await fctx.request.post(BASE + "/api/pages", { headers: H, data })).json()).page.id;
      const FD = await fmk({ title: "친구 Dock", shared: true, files: { "index.html": FULL } });
      const FS = await fmk({ title: "친구 과목", place: "study", shared: true, files: { "index.html": FULL } });
      await go("#/", 2200);
      const dockHas = () => p.locator(`#dock-list > [data-dock="page:${FD}"]`).count();
      const seen = await dockHas();
      await p.locator(`#dock-list > [data-dock="page:${FD}"]`).click({ button: "right" });
      await p.locator('.cm [data-k="hide"]').click(); await sleep(1200);
      const goneDock = await dockHas() === 0;
      await go("#/english", 2200);
      const tab = p.locator(`#study-switch [data-sub="p:${FS}"]`), tabSeen = await tab.count();
      if (tabSeen) { await tab.click({ button: "right" }); await p.locator('.cm [data-k="hide"]').click(); await sleep(1200); }
      const goneTab = await p.locator(`#study-switch [data-sub="p:${FS}"]`).count() === 0;
      const hiddenSaved = (await (await ctx.request.get(BASE + "/api/me")).json()).user.hidden_pages;
      await go("#/", 2200);
      await p.locator("#me-btn").click(); await p.locator("#me-head").click();
      await p.locator(`[data-unhide="${FD}"]`).click({ timeout: 6000 }); await sleep(1200);
      await p.keyboard.press("Escape"); await sleep(400);
      const back = await dockHas() === 1, stillHidden = (await (await ctx.request.get(BASE + "/api/me")).json()).user.hidden_pages;
      ok(seen === 1 && goneDock && tabSeen === 1 && goneTab && hiddenSaved.includes(FD) && hiddenSaved.includes(FS) && back && !stillHidden.includes(FD) && stillHidden.includes(FS),
        `${tv} · 친구 페이지 숨기기 — Dock 숨김 ${goneDock} · 과목 탭 숨김 ${goneTab} · 저장 ${hiddenSaved.length}개 · 프로필에서 다시 보이기 ${back}`);
      await ctx.request.patch(BASE + "/api/me", { headers: H, data: { hidden_pages: [] } });
      await fctx.close();
    } catch (e) { ok(false, `${tv} · 친구 페이지 숨기기 — ${String(e.message).split("\n")[0]}`); }

    // ---------- ⑩ Study 그래프 ----------
    try {
      await ctx.request.patch(BASE + "/api/me", { headers: H, data: { graph_prefs: null } });
      const counts = {};
      for (const [k, hash] of [["영어", "#/english/graph"], ["논문", "#/papers/graph"], ["AI", "#/books/graph"], ["과목", `#/study/${A}/graph`]]) {
        await go(hash, 3200);
        counts[k] = await p.evaluate(() => (document.querySelector(".og-c")?.__nodes?.() || []).length);
        counts[k + "탭"] = await p.evaluate(() => document.querySelector('#study-mode a[aria-current="page"]')?.textContent);
      }
      await go("#/books/graph", 3500);
      if (w <= 760) await p.locator("[data-toggle]").click();
      await p.selectOption('[data-p="basis"]', "tier"); await p.locator('[data-p="node"]').fill("2"); await sleep(1200);
      const gp = (await (await ctx.request.get(BASE + "/api/me")).json()).user.graph_prefs;
      if (w <= 760) await p.locator("[data-toggle]").click();
      await sleep(4000);
      const target = await p.evaluate(() => { const c = document.querySelector(".og-c"), r = c.getBoundingClientRect(); return c.__nodes().filter((n) => n.type === "chapter").map((n) => ({ ...n, x: n.x + r.left, y: n.y + r.top })).find((n) => document.elementFromPoint(n.x, n.y) === c); });
      if (target) { await p.mouse.click(target.x, target.y); await sleep(300); if (w <= 760) await p.mouse.click(target.x, target.y); await sleep(1500); }
      const went = await p.evaluate(() => location.hash);
      ok(counts["영어"] > 100 && counts["논문"] > 30 && counts["AI"] > 300 && counts["과목"] >= 1 && ["영어탭", "논문탭", "AI탭", "과목탭"].every((k) => counts[k] === "그래프") && gp?.basis === "tier" && gp?.node === 2 && /^#\/books\/[a-z-]+\/[a-z0-9-]+$/.test(went),
        `${tv} · Study 그래프 — 점 영어 ${counts["영어"]} · 논문 ${counts["논문"]} · AI ${counts["AI"]} · 과목 ${counts["과목"]} · 저장 ${gp?.basis}/${gp?.node} · 점 누르기 → ${went}`);
      await ctx.request.patch(BASE + "/api/me", { headers: H, data: { graph_prefs: null } });
    } catch (e) { ok(false, `${tv} · Study 그래프 — ${String(e.message).split("\n")[0]}`); }

    // ---------- ⑪ Brain — 맨 위엔 큰 개념만, 누르면 안으로, 공부 점은 원래 화면으로, 가져오기는 다시 올려도 그대로 ----------
    try {
      const items = [
        { title: "Business & Finance", body: "" }, { title: "AI & Dev", body: "" },
        { title: "검사 CIM", body: "[[검사 멘토링]]", parent_title: "Business & Finance" },
        { title: "검사 VaR", body: "", parent_title: "검사 CIM" },
        { title: "검사 멘토링", body: "", parent_title: "AI & Dev" },
      ];
      const imp = async () => (await ctx.request.post(BASE + "/api/notes/import", { headers: H, data: { items } })).json();
      const first = await imp(), again = await imp();
      const nodes = () => p.evaluate(() => (document.querySelector(".og-c")?.__nodes?.() || []).map((n) => n.title).sort());
      await go("#/graph", 3000); // 예전 노트 그래프 주소 → Brain
      const top = await nodes();
      await p.locator(".brain-list a", { hasText: "Business & Finance" }).click(); await sleep(1500);
      const inBiz = await nodes(), crumb = await p.evaluate(() => document.querySelector(".brain-crumbs b")?.textContent);
      await go("#/brain", 2500);
      await p.locator(".brain-list a", { hasText: "AI & Dev" }).click(); await sleep(1500);
      const inAi = await nodes();
      await p.locator(".brain-list a", { hasText: "AI Books" }).click(); await sleep(1500);
      const study = await p.evaluate(() => location.hash);
      const dock = await p.evaluate(() => [...document.querySelectorAll("[data-nav]")].map((a) => a.dataset.nav));
      const varId = (await (await ctx.request.get(BASE + "/api/notes/resolve?title=" + encodeURIComponent("검사 VaR"), { headers: H })).json()).id;
      await go("#/notes/" + varId, 2500);
      const path = await p.evaluate(() => document.querySelector(".ed-inner .crumbs")?.innerText.replace(/\s+/g, " ").trim());
      await p.locator(".crumb-map").click(); await sleep(1500);
      const mapped = await nodes();
      ok(first.created + first.kept === 5 && again.created === 0 && again.kept === 5 && ["AI & Dev", "Business & Finance", "Language", "Life", "Records"].every((t) => top.includes(t)) && top.length <= 6
        && inBiz.join() === "검사 CIM" && crumb === "Business & Finance" && inAi.includes("AI Books") && inAi.includes("검사 멘토링") && study === "#/books"
        && dock.includes("brain") && !dock.includes("notes") && dock.includes("study") && /^Brain › Business & Finance › 검사 CIM › 검사 VaR/.test(path || "") && mapped.join() === "검사 VaR",
        `${tv} · Brain — 가져오기 ${first.created}/${again.created} · 맨 위 ${top.join(", ")} · Business 안 ${inBiz.join(", ")} · AI 안 ${inAi.join(", ")} · 공부 점 → ${study} · 노트 경로 ${path} · Map → ${mapped.join(", ")}`);
    } catch (e) { ok(false, `${tv} · Brain — ${String(e.message).split("\n")[0]}`); }

    // ---------- ⑫ 블록 편집기 — 토글 접기 · "/" 로 콜아웃 · 보드에서 끌면 상태가 바뀌어요 (2026-10-13) ----------
    try {
      errs = [];
      const doc = { v: 1, blocks: [{ id: "b_tg1", type: "toggle", text: "Fold me", props: {}, children: [{ id: "b_in1", type: "paragraph", text: "hidden inside", props: {}, children: [] }] }, { id: "b_p1", type: "paragraph", text: "", props: {}, children: [] }] };
      const bn = (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: "검사 블록 " + tv, blocks: doc } })).json()).note.id;
      await go("#/notes/" + bn, 2200);
      await p.evaluate(() => { const b = [...document.querySelectorAll('[data-mode="block"]')][0]; if (b && b.getAttribute("aria-selected") !== "true") b.click(); });
      await p.waitForSelector('.nb[data-id="b_tg1"] .nb-tg', { timeout: 8000 });
      const vis = () => p.evaluate(() => !!document.querySelector('.nb[data-id="b_in1"]'));
      const v0 = await vis(); await p.click('.nb[data-id="b_tg1"] .nb-tg'); const v1 = await vis(); await p.click('.nb[data-id="b_tg1"] .nb-tg'); const v2 = await vis();
      await p.click('.nb[data-id="b_p1"] .nb-text'); await p.keyboard.type("/callout"); await sleep(200);
      const menuOk = await p.evaluate(() => !!document.querySelector('.nb-menu [data-type="callout"]'));
      await p.keyboard.press("Enter"); await p.keyboard.type("Hello callout");
      for (let i = 0; i < 7; i++) await p.keyboard.press("Shift+ArrowLeft");
      await p.waitForSelector(".nb-tb", { timeout: 3000 }).catch(() => {});
      await p.click('.nb-tb [data-f="b"]').catch(() => {}); await sleep(1500);
      const saved = await (await ctx.request.get(BASE + "/api/notes/" + bn)).json();
      const sb = JSON.parse(saved.note.blocks || "{}").blocks || [];
      ok(v0 !== v1 && v1 !== v2 && menuOk && sb.some((b) => b.type === "callout" && /Hello \*\*callout\*\*/.test(b.text)) && /\[!note\]/.test(saved.note.body) && !errs.length,
        `${tv} · 블록 — 토글 ${v0}→${v1}→${v2} · "/" 메뉴 ${menuOk} · 콜아웃 저장 ${sb.map((b) => b.type).join(",")}${errs.length ? " — " + errs[0] : ""}`);
      // "@" 멘션 → [[페이지]] 링크 · 그 페이지 아래 백링크 (제목 형광펜)
      const tgt = (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: "검사대상" + tv, body: "x" } })).json()).note.id;
      await p.goto("about:blank"); await go("#/notes/" + bn, 2200);
      await p.click('.nb[data-id="b_p1"] .nb-text').catch(() => {});
      const last = p.locator(".nb-doc > .nb").last().locator(".nb-text").first();
      await last.click(); await p.keyboard.press("End"); await p.keyboard.press("Enter"); await p.keyboard.type("see @검사대상" + tv); await sleep(300);
      const atMenu = await p.evaluate(() => [...document.querySelectorAll(".suggest button")].map((b) => b.textContent).join("|") + " / " + document.activeElement?.className + ":" + document.activeElement?.innerText + " / " + location.hash);
      await p.keyboard.press("Enter"); await sleep(1500);
      const s2 = await (await ctx.request.get(BASE + "/api/notes/" + bn)).json();
      await go("#/notes/" + tgt, 2200);
      const bl = await p.evaluate(() => ({ cnt: document.querySelector("#bl-count")?.textContent || "", mark: document.querySelector("#ed-back-list mark")?.textContent || "" }));
      ok(new RegExp("\\[\\[검사대상" + tv + "\\]\\]").test(s2.note.body) && /1 backlink/.test(bl.cnt) && bl.mark === "검사대상" + tv, `${tv} · "@" 멘션 → 링크 · 백링크 ${bl.cnt} · 형광펜 ${bl.mark} (메뉴 ${atMenu.slice(0, 60)})`);
      const dbn = (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: "검사 DB " + tv, kind: "database" } })).json()).note.id;
      const row = (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: "검사 카드 " + tv, parent_id: dbn, props: { status: "시작 전" } } })).json()).note.id;
      const row2 = (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: "검사 카드2 " + tv, parent_id: dbn, props: { status: "시작 전" } } })).json()).note.id;
      await go("#/notes/" + dbn, 2200);
      await p.waitForSelector(".db-tabs", { timeout: 8000 });
      const tableOk = await p.evaluate(() => !!document.querySelector(".db-table .db-pill.st"));
      await p.evaluate(() => [...document.querySelectorAll(".db-tabs [data-view]")].find((b) => /Board/.test(b.textContent))?.click());
      await p.waitForSelector(`.db-card[data-row="${row}"]`, { timeout: 8000 });
      await p.dragAndDrop(`.db-card[data-row="${row}"]`, '.db-col[data-group="완료"]'); await sleep(1200);
      const rp = JSON.parse((await (await ctx.request.get(BASE + "/api/notes/" + row)).json()).note.props || "{}");
      const cnt = await p.evaluate(() => document.querySelector('.db-col[data-group="완료"] .db-count')?.textContent);
      await p.screenshot({ path: `${process.env.SHOTS || "/tmp"}/e2e-board-${w}.png` }).catch(() => {});
      ok(tableOk && rp.status === "완료" && cnt === "1", `${tv} · DB — 표 상태 알약 ${tableOk} · 보드 끌기 → ${rp.status} (완료 ${cnt})`);
      // 손가락 끌기: 길게 눌러 들고 → 다른 열에 놓기 (pointer 이벤트, pointerType touch)
      await p.evaluate(async (rid) => {
        const c = document.querySelector(`.db-card[data-row="${rid}"]`), t = document.querySelector('.db-col[data-group="진행 중"]');
        const a = c.getBoundingClientRect(), b = t.getBoundingClientRect(), ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y }));
        ev("pointerdown", a.x + 10, a.y + 10); await new Promise((r) => setTimeout(r, 550));
        ev("pointermove", b.x + 20, b.y + 30); ev("pointerup", b.x + 20, b.y + 30);
      }, row2);
      await sleep(1200);
      const rp2 = JSON.parse((await (await ctx.request.get(BASE + "/api/notes/" + row2)).json()).note.props || "{}");
      // 필터: 표 보기에서 Filter → + Add filter → 상태 = 완료 → 한 줄만
      await p.evaluate(() => [...document.querySelectorAll(".db-tabs [data-view]")].find((b) => /Table/.test(b.textContent))?.click());
      await p.waitForSelector(".db-table", { timeout: 8000 });
      await p.click("[data-add-filter]"); await p.click('.db-pop [data-p="status"]'); await p.click('.db-pop [data-fopt="완료"]'); await sleep(1200);
      const shown = await p.evaluate(() => document.querySelectorAll(".db-table tr[data-row]").length);
      const listed = await (await ctx.request.get(BASE + "/api/notes")).json();
      ok(rp2.status === "진행 중" && shown === 1 && !listed.notes.some((n) => n.id === row2), `${tv} · DB — 손가락 끌기 → ${rp2.status} · 필터 후 ${shown}줄 · 행은 왼쪽 목록에서 숨김`);
    } catch (e) { ok(false, `${tv} · 블록 편집기 — ${String(e.message).split("\n")[0]}`); }

    // ---------- ⑬ 데이터베이스 — 필터로 줄이기 · 묶기 · 달력에서 날짜 옮기기 (컴퓨터는 마우스, 폰은 길게 눌러 끌기) ----------
    try {
      errs = [];
      const shot = (n) => p.screenshot({ path: `${process.env.SHOTS || "/tmp"}/e2e-${n}-${w}.png` }).catch(() => {});
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), mon = today.slice(0, 7);
      const other = today.endsWith("-02") ? mon + "-03" : mon + "-02";
      const dbn = (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: "검사 필터 DB " + tv, kind: "database" } })).json()).note.id;
      const mkRow = async (title, props) => (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: title + " " + tv, parent_id: dbn, props } })).json()).note.id;
      await mkRow("필터 하나", { status: "완료", date: today, tags: ["math"] });
      await mkRow("필터 둘", { status: "진행 중", date: today, tags: ["eng"] });
      const r3 = await mkRow("필터 셋", { status: "시작 전", date: other, tags: ["math", "eng"] });
      await go("#/notes/" + dbn, 2200);
      await p.waitForSelector(".db-table", { timeout: 8000 });
      const before = await p.locator(".db-table tbody tr").count();
      const listed = await p.evaluate(() => [...document.querySelectorAll("#nl .nt")].map((x) => x.textContent).join("|"));
      await p.click("[data-add-filter]"); await p.click('.db-pop [data-p="status"]'); await p.click('.db-pop [data-fopt="완료"]'); await sleep(1200);
      const after = await p.locator(".db-table tbody tr").count();
      const sv = JSON.parse((await (await ctx.request.get(BASE + "/api/notes/" + dbn)).json()).note.db).views[0];
      await shot("db-filter");
      ok(before === 3 && after === 1 && sv.filters?.[0]?.value === "완료" && !listed.includes("필터 하나") && listed.includes("검사 필터 DB"), `${tv} · DB 필터 — ${before}줄 → ${after}줄 · 저장 ${JSON.stringify(sv.filters)} · 왼쪽 목록에 행 숨김 ${!listed.includes("필터 하나")}`);
      await p.click("[data-del-filter='0']"); await sleep(1000);
      await p.click(".db-bar [data-group-menu]"); await p.click('.db-pop [data-g="tags"]'); await sleep(1200);
      const groups = await p.locator(".db-tgroup").count();
      const vb = (await p.locator(".db-tabs [data-view]").allTextContents()).findIndex((t) => /Board/.test(t));
      await p.locator(".db-tabs [data-view]").nth(vb).click(); await sleep(300);
      await p.click(".db-bar [data-group-menu]"); await p.click('.db-pop [data-g="tags"]'); await sleep(1200);
      const cols = await p.locator(".db-col").count(), mathCnt = await p.evaluate(() => document.querySelector('.db-col[data-group="math"] .db-count')?.textContent);
      await shot("db-board-grouped");
      ok(groups >= 2 && cols >= 2 && mathCnt === "2", `${tv} · DB 묶기 — 표 묶음 ${groups}개 · 보드(태그) 칸 ${cols}개 · math ${mathCnt}`);
      // 달력: 보기를 더하고 카드를 다른 날로
      await p.click(".db-addview"); await p.click('.db-pop [data-v="calendar"]'); await sleep(1500);
      await p.waitForSelector(`.db-cal-card[data-row="${r3}"]`, { timeout: 8000 });
      if (w > 640) {
        await p.dragAndDrop(`.db-cal-card[data-row="${r3}"]`, `.db-cal-cell[data-day="${today}"]`);
      } else {
        // 폰: 길게 누르고(350ms) 끌어서 오늘 칸에 놓아요 — pointerType touch
        await p.evaluate(async ({ r3, today }) => {
          const c = document.querySelector(`.db-cal-card[data-row="${r3}"]`), t = document.querySelector(`.db-ag-day[data-drop="${today}"]`);
          const a = c.getBoundingClientRect(), b = t.getBoundingClientRect();
          const ev = (type, x, y, el) => (el || document.elementFromPoint(x, y)).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y }));
          ev("pointerdown", a.left + 10, a.top + 10, c);
          await new Promise((r) => setTimeout(r, 450));
          const steps = 6; for (let i = 1; i <= steps; i++) ev("pointermove", a.left + 10, a.top + 10 + ((b.top + 12 - a.top - 10) * i) / steps, c);
          ev("pointerup", a.left + 10, b.top + 12, c);
        }, { r3, today });
      }
      await sleep(1500);
      const moved = JSON.parse((await (await ctx.request.get(BASE + "/api/notes/" + r3)).json()).note.props || "{}").date;
      await shot("db-calendar");
      ok(moved === today && !errs.length, `${tv} · DB 달력 — 카드 ${other} → ${moved}${errs.length ? " — " + errs[0] : ""}`);
    } catch (e) { ok(false, `${tv} · DB 필터 · 달력 — ${String(e.message).split("\n")[0]}`); }

    // ---------- ⑥ 자정 AI 점수 — 어제 기록을 하나 넣고 그날 화면에서 봐요 ----------
    const kst = (n) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
    execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `INSERT OR REPLACE INTO day_records (user_id, day, data, score, done, total, auto, saved_at, ai_score, ai_note, ai_model) SELECT id, '${kst(-1)}', '{"plans":[]}', 70, 1, 1, 1, 0, 82, '우선순위 높은 일을 끝냈어요.', 'openai/gpt-oss-120b' FROM users WHERE username = '${user}'`], { stdio: "ignore" });
    await go("#/calendar/" + kst(-1), 2500);
    const ais = await p.evaluate(() => { const b = document.querySelector("#dp-ai-score"); return b && !b.hidden ? b.innerText.replace(/\s+/g, " ") : ""; });
    await go("#/calendar/" + kst(0), 2000);
    const aisToday = await p.evaluate(() => !document.querySelector("#dp-ai-score")?.hidden);
    ok(/82/.test(ais) && /Groq GPT-OSS/.test(ais) && /우선순위/.test(ais) && !aisToday, `${tv} · 자정 AI 점수 — 어제: ${ais || "안 보임"} · 오늘은 숨김 ${!aisToday}`);

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
    { // Dock 에서 바로 Study → AI 탭 → 책장이 보여야 해요 (Brain 안에만 묻히면 못 찾아요)
      await go("#/", 1200);
      const dock = await p.evaluate(() => !!document.querySelector('[data-nav="study"]'));
      if (dock) { await p.evaluate(() => document.querySelector('[data-nav="study"]').click()); await p.waitForTimeout(1200); await p.evaluate(() => [...document.querySelectorAll("#study-switch a, #study-switch button")].find((x) => x.textContent.trim() === "AI")?.click()); await p.waitForTimeout(2200); }
      const got = await p.evaluate(() => ({ h: location.hash, n: document.querySelectorAll(".bk-book").length, cur: document.querySelector('[data-nav="study"]')?.getAttribute("aria-current") }));
      ok(dock && got.h.startsWith("#/books") && got.n === idx.books.length && got.cur === "page", `${tv} · Dock Study 아이콘 → AI 탭 책장 ${got.n}권 (${got.h})`);
    }
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

    // ---------- ⑫ 뉴스 — 하루 한 호 (유리 재질 · 한국어): 헤드라인 · 분야 · 기사 시트 · 메모 + 반박 · j/k · Esc (2026-10-13) ----------
    errs = [];
    execFileSync("node", ["scripts/news-seed.mjs"], { stdio: "ignore" });
    await p.goto(BASE + "/#/news"); await p.waitForSelector(".gn-hero", { timeout: 10000 }).catch(() => {});
    const np = await p.evaluate(() => ({ h1: document.querySelector(".gn-h1")?.textContent || "", items: document.querySelectorAll(".gn-item").length, over: document.documentElement.scrollWidth > innerWidth + 1, seg: document.querySelectorAll(".gn-seg [data-sec]").length }));
    ok(np.h1.length > 1 && np.items > 0 && !np.over && np.seg === 5, `${tv} · 신문 — 헤드라인 · 기사 ${np.items}개 · 분야 5칸 · 가로 넘침 없음`);
    await p.click('.gn-seg [data-sec="geopolitics"]'); await sleep(300);
    const geo = await p.evaluate(() => document.querySelectorAll(".gn-item").length);
    await p.click('.gn-seg [data-sec="all"]'); await sleep(300);
    ok(geo > 0 && geo < np.items, `${tv} · 분야 고르기 — 지정학만 ${geo}개`);
    const firstId = await p.evaluate(() => document.querySelector(".gn-item[data-id]")?.dataset.id);
    await p.click(`.gn-item[data-id="${firstId}"] .gn-item-a`);
    await p.waitForSelector("#gn-compose textarea", { timeout: 8000 }).catch(() => {});
    ok(await p.evaluate((id) => location.hash === "#/news/item/" + id && !!document.querySelector(".gn.sheet-on .gn-sh-t"), firstId), `${tv} · 기사를 열면 유리 시트`);
    await p.fill("#gn-compose textarea", "e2e memo " + tv);
    await p.click("#gn-compose button"); await sleep(600);
    const memoN = await p.evaluate(() => document.querySelectorAll(".gn-memo").length);
    await p.locator(".gn-memo").last().locator("[data-reply=rebut]").click();
    await p.locator(".gn-memo").last().locator(".gn-rform textarea").fill("e2e rebut");
    await p.locator(".gn-memo").last().locator(".gn-rform button").click(); await sleep(600);
    const talk = await p.evaluate(() => ({ rebut: !!document.querySelector(".gn-memo:last-of-type .gn-reply.rebut"), n: document.querySelector("#gn-talk-n")?.textContent || "" }));
    ok(memoN > 0 && talk.rebut && talk.n.includes("의견 갈림"), `${tv} · 메모 + 반박 — 의견 갈림 표시`);
    await p.evaluate(() => document.activeElement?.blur());
    await p.keyboard.press("j"); await sleep(900);
    const moved = await p.evaluate((id) => /^#\/news\/item\//.test(location.hash) && location.hash !== "#/news/item/" + id, firstId);
    await p.keyboard.press("Escape"); await sleep(600);
    ok(moved && await p.evaluate(() => /^#\/news(\/\d{4}-\d{2}-\d{2})?$/.test(location.hash) && !document.querySelector(".gn.sheet-on")) && !errs.length, `${tv} · j 로 다음 기사 · Esc 로 닫기 · 오류 없음${errs.length ? " — " + errs[0] : ""}`);
    await ctx.request.fetch(BASE + "/api/news/item/" + firstId, { method: "GET", headers: H }).then(async (r) => {
      for (const c of (await r.json()).comments || []) if (/^e2e /.test(c.body) && !c.parent_id) await ctx.request.fetch(BASE + "/api/news/comments/" + c.id, { method: "DELETE", headers: H });
    }).catch(() => {});

    await ctx.close();
  }
} finally {
  await browser.close();
  try { cleanup(); } catch {}
}
console.log(fails ? `\n실패 ${fails}개` : "\n모두 통과");
process.exitCode = fails ? 1 : 0;

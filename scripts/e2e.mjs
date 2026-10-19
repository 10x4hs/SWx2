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
//   ⑪-b 노트 우클릭 — 목록 · Brain 점 · Brain 목록에서 (폰은 길게 누르기, 키보드 Shift+F10): 이름 바꾸기(다른 노트 [[링크]] 도) · 새 하위 노트(Edit) · 옮기기 · 지우기 Undo / 5초 뒤 · 화면을 떠나면 바로 (2026-10-15)
//   ⑫ 뉴스 — 하루 한 호 (가독성 · 한국어) · 분야 · 기사 시트 · 메모 + 반박 · j/k · Esc (2026-10-13)
//   ⑬ 경영 마이크로디그리 — 모듈 지도 · 현황판 · 하루 60/90/120분 · 2주 계획 · 카드(정적 이익 지도 · 더 자세히 · 퀴즈 · AI 튜터) · 케이스(내 답 먼저) · 연습문제 채점 · 오늘 · 회사 세우기 세금 계산 · 용어 찾기 (2026-10-14)
//   ⑭ 홈 오늘 링 끌기 — 마우스를 대면 선 · 끌면 +분 · 놓으면 이름 칸(Enter 저장 · Esc 취소) · 거꾸로 · 겹침 · 그냥 누르면 원래대로 · 전체 쪽 오늘 링 · 친구 차트 · 터치는 그대로 (2026-10-15)
//   ⑮ 하루 계획표 짧은 일정 — 맞닿은 일정은 위아래로(5분 휴식 + 바로 뒤 시험) · 붙어 있으면 그 칸만 30px 로 늘어남 · 진짜 겹침은 나란히 · 늘어난 칸의 빈 칸 시각 · 끌기 시각 (2026-10-15)
//   ⑯ 홈 Day 쪽 ‹ 날짜 › — › 내일(바늘 없음 · 오늘로) · 내일에 끌어 넣기 → 그 날짜 · 새로 열어도 고른 날 · 지난 기억은 오늘 · ‹ 어제 점수 · 링 누르면 그날 계획표 (2026-10-15)
//   ⑰ 계획 복사 · 붙여넣기 — 마우스 올리고 ⌘C · 붙일 시각에 ⌘V(우선순위까지) · ⌘Z 되돌리기 · Shift+클릭 여러 개(간격 그대로) · 다른 앱의 "07:00–07:30 이름" 줄 · 그냥 글은 무시 · 홈 시계 링 시각 (2026-10-16)
//   ⑱ 둘이 같이 보는 일기 — 일기 모임만 독 아이콘 · 새 일기 기본 공개 → 상대가 읽음 · 비공개면 자물쇠만(글은 서버에서도 안 와요) · 지난 일기 비공개 · 상대 탭 읽기 · 모임 밖은 403 · 아이콘 없음 (2026-10-16)
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

const tag = Date.now().toString(36), user = "t_e2e" + tag, friend = "t_e2f" + tag, outsider = "t_e2o" + tag; // outsider = ⑱ 일기 모임 밖
execFileSync("node", ["scripts/add-user.mjs", user, "화면검사", "password1", "--team=swx2", "--features=all"], { stdio: "ignore" });
execFileSync("node", ["scripts/add-user.mjs", friend, "검사친구", "password1", "--team=swx2", "--features=all"], { stdio: "ignore" }); // ⑨ 공개 페이지를 올리는 친구
execFileSync("node", ["scripts/add-user.mjs", outsider, "모임밖", "password1", "--team=swx2", "--features=all"], { stdio: "ignore" });
const cleanup = () => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM users WHERE username IN ('${user}', '${friend}', '${outsider}')`], { stdio: "ignore" }); // 페이지 · 기록은 같이 지워져요 (ON DELETE CASCADE)

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

    // ---------- ⑪-b 노트 우클릭 — 열기(오른쪽 클릭 · 폰은 길게 누르기 · Shift+F10) · 이름 바꾸기 · 새 하위 노트 · 옮기기 · 지우기 Undo / 5초 뒤 (2026-10-15) ----------
    let step = "준비";
    try {
      errs = [];
      const T = (s) => `우클릭 ${s} ${tv}`, FULL = "Open|Rename|Edit|New sub-note|Move to…|Delete";
      const add = async (data) => (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data })).json()).note?.id;
      const note = async (id) => { const res = await ctx.request.get(BASE + "/api/notes/" + id); return res.ok() ? (await res.json()).note : null; };
      const idOf = async (t) => (await (await ctx.request.get(BASE + "/api/notes/resolve?title=" + encodeURIComponent(t))).json()).id;
      const aiDev = await idOf("AI & Dev");
      const P = await add({ title: T("부모"), body: "", parent_id: aiDev }), C = await add({ title: T("대상"), body: "", parent_id: P });
      const Q = await add({ title: T("이동처"), body: "", parent_id: aiDev }), L = await add({ title: T("링크"), body: `[[${T("대상")}]] · [[${T("대상")}|별칭]]` });
      const D = await add({ title: T("지우기"), body: "", parent_id: P }), DK = await add({ title: T("지우기 하위"), body: "", parent_id: D });
      const labels = () => p.evaluate(() => [...document.querySelectorAll(".cm [data-k]")].map((b) => b.textContent.trim()).join("|"));
      // 폰은 손가락으로 0.5초 누르기 (pointer 이벤트, pointerType touch) · 컴퓨터는 오른쪽 클릭
      const holdAt = (sel, x, y) => p.evaluate(async ([s, x, y]) => {
        const el = document.querySelector(s), r = el.getBoundingClientRect(), cx = x ?? r.left + Math.min(40, r.width / 2), cy = y ?? r.top + r.height / 2;
        const ev = (t) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 9, pointerType: "touch", isPrimary: true, clientX: cx, clientY: cy }));
        ev("pointerdown"); await new Promise((res) => setTimeout(res, 650)); ev("pointerup");
      }, [sel, x ?? null, y ?? null]);
      const menuOn = async (sel) => { await p.waitForSelector(sel, { timeout: 8000 }); await p.locator(sel).scrollIntoViewIfNeeded(); if (w > 600) await p.locator(sel).click({ button: "right" }); else await holdAt(sel); await p.waitForSelector(".cm", { timeout: 4000 }); return labels(); };
      const item = (id) => `#nl a[href="#/notes/${id}"]`, listed = (id) => p.evaluate((s) => !!document.querySelector(s), item(id));
      // 그래프 점: 움직임이 멎은 자리를 찾아서
      const nodeAt = async (title) => { let a = null; for (let i = 0; i < 20; i++) { const b = await p.evaluate((t) => { const c = document.querySelector(".og-c"), r = c.getBoundingClientRect(), n = c.__nodes().find((x) => x.title === t); return n && { x: n.x + r.left, y: n.y + r.top, top: document.elementFromPoint(n.x + r.left, n.y + r.top) === c }; }, title); if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 0.5) return b; a = b; await sleep(150); } return a; };
      const menuOnNode = async (title) => {
        const at = await nodeAt(title); if (!at) return "(점 없음)";
        if (w > 600 && at.top) await p.mouse.click(at.x, at.y, { button: "right" });
        else if (w > 600) await p.evaluate(({ x, y }) => document.querySelector(".og-c").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })), at);
        else await holdAt(".og-c", at.x, at.y);
        await p.waitForSelector(".cm", { timeout: 4000 }).catch(() => {});
        return labels();
      };
      const nodes = () => p.evaluate(() => (document.querySelector(".og-c")?.__nodes?.() || []).map((n) => n.title).sort().join("|"));
      // 준비 노트는 API 로 바로 넣어서(서비스 워커를 안 거쳐요) 받아 둔 목록이 낡았을 수 있어요 → API 캐시를 비워요 (pwa.js 가 로그아웃 때 하듯이)
      const fresh = () => p.evaluate(async () => { for (const n of await caches.keys()) if (n.startsWith("dsm-api-")) await caches.delete(n); }).catch(() => {});

      // 1) 목록 칸 메뉴 → Rename (Enter) → 다른 노트의 [[링크]] · [[링크|별칭]] 도 · 키보드 Shift+F10 → Esc 면 초점이 그 칸으로
      step = "1 목록 · Rename"; await fresh(); await go("#/notes", 2200);
      const m1 = await menuOn(item(C)), danger = await p.evaluate(() => !!document.querySelector('.cm .cm-sep + [data-k="del"].danger'));
      await p.click('.cm [data-k="rename"]');
      const v0 = await p.locator(".nm input").inputValue();
      await p.locator(".nm input").fill(T("새이름")); await p.keyboard.press("Enter"); await sleep(1500);
      const ren = (await note(C))?.title, lb = (await note(L))?.body, shown = await p.evaluate((s) => document.querySelector(s + " .nt")?.textContent.trim(), item(C));
      await p.focus(item(C)); await p.keyboard.press("Shift+F10"); await p.waitForSelector(".cm", { timeout: 3000 }).catch(() => {});
      const kb = await labels(); await sleep(150); await p.keyboard.press("Escape"); await sleep(150); // 메뉴는 열린 다음 차례부터 Esc 를 들어요
      const back = await p.evaluate((s) => document.activeElement === document.querySelector(s) && !document.querySelector(".cm"), item(C));
      ok(m1 === FULL && danger && v0 === T("대상") && ren === T("새이름") && lb === `[[${T("새이름")}]] · [[${T("새이름")}|별칭]]` && shown === T("새이름") && kb === FULL && back,
        `${tv} · 노트 우클릭 — 목록 메뉴 ${m1} · Rename → ${ren} · 링크한 노트 "${lb}" · 목록 "${shown}" · Shift+F10 ${kb === FULL} · Esc 뒤 초점 ${back}`);

      // 2) New sub-note → 그 노트가 Edit 로 열려요 · 3) Move to…: 나와 하위는 후보에서 빠지고, 찾아서 Enter → 이동처 아래 → 맨 위로
      step = "2 New sub-note"; await menuOn(item(C)); await p.click('.cm [data-k="sub"]');
      await p.locator(".nm input").fill(T("하위")); await p.keyboard.press("Enter"); await sleep(1800);
      const subId = await idOf(T("하위")), sub = subId ? await note(subId) : null, hash1 = await p.evaluate(() => location.hash);
      const editMode = await p.evaluate(() => document.querySelector('[data-mode="block"]')?.getAttribute("aria-selected") === "true" && !!document.querySelector("#ed-blocks"));
      step = "3 Move to"; await go("#/notes", 2200);
      await menuOn(item(C)); await p.click('.cm [data-k="move"]');
      await p.waitForSelector(".nm-move [role=option]", { timeout: 5000 });
      const opts = await p.evaluate(() => [...document.querySelectorAll(".nm-move [role=option] .t")].map((x) => x.textContent));
      await p.locator(".nm-move input").fill(T("이동처")); await sleep(150); await p.keyboard.press("Enter"); await sleep(1500);
      const movedTo = (await note(C))?.parent_id;
      await menuOn(item(C)); await p.click('.cm [data-k="move"]');
      await p.locator(".nm-move [role=option]", { hasText: "Top level (no parent)" }).click(); await sleep(1500);
      const top = (await note(C))?.parent_id;
      ok(sub?.parent_id === C && hash1 === "#/notes/" + subId && editMode && opts[0] === "Top level (no parent)" && opts.includes(T("이동처")) && !opts.includes(T("새이름")) && !opts.includes(T("하위")) && movedTo === Q && top === null,
        `${tv} · 노트 우클릭 — New sub-note ${sub?.parent_id === C ? "부모 맞음" : "부모 틀림"} · 열림 ${hash1 === "#/notes/" + subId} · Edit ${editMode} · Move 후보 ${opts.length}개 (나 · 하위 빠짐 ${!opts.includes(T("새이름")) && !opts.includes(T("하위"))}) · 이동처 ${movedTo === Q} · 맨 위 ${top === null}`);

      // 4) 그래프 점 · 오른쪽 목록: 개념은 Open · New sub-note 만, 공부 점은 Open 만, 노트는 전부
      step = "4 그래프 메뉴"; await go("#/brain", 3500);
      const gConcept = await menuOnNode("AI & Dev"); await p.keyboard.press("Escape");
      await go("#/brain/" + encodeURIComponent(aiDev), 3500);
      const gNote = await menuOnNode(T("이동처")); await p.keyboard.press("Escape");
      const gStudy = await menuOnNode("AI Books"); await p.keyboard.press("Escape");
      const gList = await menuOn(`.brain-list a[data-id="${Q}"]`); await p.keyboard.press("Escape");
      ok(gConcept === "Open|New sub-note" && gNote === FULL && gStudy === "Open" && gList === FULL, `${tv} · 노트 우클릭 — 그래프 개념 점 ${gConcept} · 노트 점 ${gNote} · 공부 점 ${gStudy} · Brain 목록 ${gList}`);

      // 5) Delete + Undo (그래프): 바로 빠지고 하위가 한 칸 위로 → Undo 면 돌아와요 (서버엔 아무것도 안 갔어요)
      step = "5 그래프 Delete · Undo"; await go("#/brain/" + encodeURIComponent(P), 3500);
      const before = await nodes();
      await menuOnNode(T("지우기")); await p.click('.cm [data-k="del"]'); await sleep(300);
      const hidden = await nodes(), toasted = await p.locator(".nm-undo").count();
      await p.click(".nm-undo button"); await sleep(400);
      const restored = await nodes();
      await sleep(5300);
      const kept = !!(await note(D)), dk1 = (await note(DK))?.parent_id;
      // 6) Delete + 5초 (목록): 바로 빠지고, 5초 뒤 서버에서 지워지고, 하위는 지운 노트의 부모 밑으로
      step = "6 목록 Delete · 5초"; await go("#/notes", 2200);
      await menuOn(item(D)); await p.click('.cm [data-k="del"]'); await sleep(300);
      const goneNow = !(await listed(D)), onServer = !!(await note(D));
      await sleep(5800);
      const goneLater = !(await note(D)), dk2 = (await note(DK))?.parent_id, notBack = !(await listed(D));
      ok(before === T("지우기") && hidden === T("지우기 하위") && toasted === 1 && restored === T("지우기") && kept && dk1 === D && goneNow && onServer && goneLater && dk2 === P && notBack,
        `${tv} · 노트 우클릭 — 그래프 Delete: "${before}" → "${hidden}" · Undo → "${restored}" · 5초 뒤에도 서버에 ${kept} · 목록 Delete: 바로 빠짐 ${goneNow} (서버엔 아직 ${onServer}) · 5초 뒤 지워짐 ${goneLater} · 하위는 부모 밑 ${dk2 === P}`);

      // 7) 편집기의 휴지통 버튼도 같은 흐름: 목록으로 나갔다가 Undo 면 그 노트로 · 8) 지우고 바로 다른 화면으로 가면 그때 서버로 (keepalive)
      step = "7 편집기 휴지통"; const E = await add({ title: T("편집기"), body: "x" }), F = await add({ title: T("떠나기"), body: "" });
      await fresh(); await go("#/notes/" + E, 2200);
      await p.click("#ed-del"); await sleep(400);
      const left = await p.evaluate(() => location.hash);
      await p.click(".nm-undo button"); await sleep(1200);
      const reopened = await p.evaluate(() => location.hash), eKept = !!(await note(E));
      step = "8 지우고 떠나기"; await go("#/notes", 2200);
      await menuOn(item(F)); await p.click('.cm [data-k="del"]'); await sleep(200);
      await go("#/brain", 1500);
      const fGone = !(await note(F));
      ok(left === "#/notes" && reopened === "#/notes/" + E && eKept && fGone && !errs.length,
        `${tv} · 노트 우클릭 — 편집기 지우기 → ${left} · Undo → ${reopened === "#/notes/" + E ? "다시 열림" : reopened} · 지우고 바로 떠나면 서버에서 지워짐 ${fGone}${errs.length ? " — " + errs[0] : ""}`);
    } catch (e) { ok(false, `${tv} · 노트 우클릭 (${step}) — ${String(e.message).split("\n")[0]}`); }

    // ---------- ⑫-b 단 나누기 · 수식 — 끝에 끌어 놓기 → 2단, "/2 columns", "/equation" KaTeX, 글 속 $..$ (2026-10-14) ----------
    try {
      errs = [];
      const P = (id, text) => ({ id, type: "paragraph", text, props: {}, children: [] });
      const doc = { v: 1, blocks: [P("b_cl", "Left side"), P("b_cr", "Right side"), P("b_cm", "area $a^2$ here"), P("b_ce", "")] };
      const cn = (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: "검사 단 " + tv, blocks: doc } })).json()).note.id;
      await go("#/notes/" + cn, 2200);
      await p.evaluate(() => { const b = [...document.querySelectorAll('[data-mode="block"]')][0]; if (b && b.getAttribute("aria-selected") !== "true") b.click(); });
      await p.waitForSelector('.nb[data-id="b_cl"]', { timeout: 8000 });
      const inl = await p.waitForSelector('.nb[data-id="b_cm"] .nb-math .katex', { timeout: 15000 }).then(() => true, () => false);
      const box = await p.locator('.nb[data-id="b_cl"] > .nb-row').boundingBox();
      await p.hover('.nb[data-id="b_cr"] > .nb-row'); const hb = await p.locator('.nb[data-id="b_cr"] .nb-handle').boundingBox();
      await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 }); await p.mouse.move(box.x + box.width - 6, box.y + box.height / 2, { steps: 5 }); await p.mouse.up().catch(() => {});
      await sleep(300);
      const dragCols = await p.evaluate(() => [...document.querySelectorAll(".nb-columns .nb-col")].map((c) => [...c.querySelectorAll(".nb-text")].map((t) => t.textContent.trim()).join(" ")).join("|"));
      await p.click('.nb[data-id="b_ce"] .nb-text'); await p.keyboard.type("/2 col"); await sleep(200);
      const cm = await p.evaluate(() => !!document.querySelector('.nb-menu [data-type="columns2"]'));
      await p.keyboard.press("Enter"); await sleep(200);
      await p.keyboard.type("/equation"); await sleep(200); await p.keyboard.press("Enter");
      await p.waitForSelector(".nb-eqsrc", { timeout: 3000 }).catch(() => {});
      await p.keyboard.type("\\frac{a}{b}"); await sleep(200);
      const live = await p.waitForSelector(".nb-eq .katex", { timeout: 15000 }).then(() => true, () => false);
      await p.keyboard.press("Enter"); await sleep(1500);
      const stack = await p.evaluate(() => { const g = document.querySelector(".nb-cols"); return g ? getComputedStyle(g).gridTemplateColumns.split(" ").length : 0; });
      const vw = await p.evaluate(() => innerWidth);
      const sv = (await (await ctx.request.get(BASE + "/api/notes/" + cn)).json()).note;
      const sb = JSON.parse(sv.blocks || "{}").blocks || [];
      const cols = sb.filter((b) => b.type === "columns");
      const eqIn = cols.some((c) => c.children.some((k) => k.children.some((x) => x.type === "equation" && x.props.expr === "\\frac{a}{b}")));
      ok(inl && /Left side\|Right side/.test(dragCols) && cm && live && cols.length === 2 && eqIn && sv.body.includes("$$\\frac{a}{b}$$") && sv.body.includes("$a^2$") && /Left side\s+Right side/.test(sv.body) && (vw < 600 ? stack === 1 : stack === 2) && !errs.length,
        `${tv} · 단 · 수식 — 글 속 수식 ${inl} · 끌기 ${dragCols} · "/2 columns" ${cm} · 수식 미리보기 ${live} · 저장 ${sb.map((b) => b.type).join(",")} · 수식 ${eqIn} · 폭 ${vw} 단 ${stack}${errs.length ? " — " + errs[0] : ""}`);
    } catch (e) { ok(false, `${tv} · 단 · 수식 — ${String(e.message).split("\n")[0]}`); }

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

    // ---------- ⑫-b 페이지 기록 — 두 번 고치고(강제 기록) Page history 에서 되돌리면 내용이 그때로 (2026-10-14) ----------
    try {
      errs = [];
      const blk = (t) => ({ v: 1, blocks: [{ id: "b_h1", type: "paragraph", text: t, props: {}, children: [] }] });
      const hn = (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: "검사 기록 " + tv, blocks: blk("첫 버전 " + tv) } })).json()).note.id;
      const put = async (t) => ctx.request.put(BASE + "/api/notes/" + hn, { headers: H, data: { blocks: blk(t), snapshot: true } });
      await put("둘째 버전 " + tv); await put("셋째 버전 " + tv);
      const vs = (await (await ctx.request.get(BASE + "/api/notes/" + hn + "/versions")).json()).versions || [];
      await go("#/notes/" + hn, 2200);
      await p.click("#ed-hist"); await p.waitForSelector(".vh-item", { timeout: 6000 });
      const first = vs.find((v) => v.size && v === vs.at(-1)); // 가장 오래된 기록 = 첫 버전
      await p.click(`.vh-item[data-vid="${first.id}"]`); await p.waitForSelector(".vh-doc .nb", { timeout: 6000 });
      const prev = await p.evaluate(() => document.querySelector(".vh-doc")?.innerText || "");
      await p.click("[data-restore]"); await p.click("[data-yes]"); await sleep(1500);
      const after = await (await ctx.request.get(BASE + "/api/notes/" + hn)).json();
      const shown = await p.evaluate(() => document.querySelector("#ed-blocks")?.innerText || "");
      const vs2 = (await (await ctx.request.get(BASE + "/api/notes/" + hn + "/versions")).json()).versions || [];
      ok(vs.length === 2 && /\+\d+ \/ −\d+ chars/.test(vs[0].summary) && prev.includes("첫 버전") && after.note.body.includes("첫 버전 " + tv) && shown.includes("첫 버전") && vs2.length === 3 && !(await p.$(".vh-panel")) && !errs.length,
        `${tv} · 페이지 기록 — 기록 ${vs.length}→${vs2.length} · 미리보기 "${prev.slice(0, 20)}" · 되돌린 뒤 "${shown.slice(0, 20)}"${errs.length ? " — " + errs[0] : ""}`);
    } catch (e) { ok(false, `${tv} · 페이지 기록 — ${String(e.message).split("\n")[0]}`); }
    await sleep(2100); // 되돌린 뒤 받은 노트 목록이 SW 의 2초 "갓 받은 답" 창을 벗어나게 (다음 DB 검사가 새 목록을 받도록)

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

    // ---------- ⑬-2 데이터베이스 — 갤러리 · 목록 · 템플릿 · 관계 + 롤업 · 수식 ----------
    try {
      errs = [];
      const post = async (data) => (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data })).json()).note;
      const getN = async (nid) => (await (await ctx.request.get(BASE + "/api/notes/" + nid)).json());
      const B = (await post({ title: "검사 대상 DB " + tv, kind: "database", db: { props: [{ key: "hours", name: "Hours", type: "number" }], views: [{ id: "v1", name: "Table", type: "table" }] } })).id;
      const b1 = (await post({ title: "대상 하나 " + tv, parent_id: B, props: { hours: 2 } })).id;
      const b2 = (await post({ title: "대상 둘 " + tv, parent_id: B, props: { hours: 5 } })).id;
      const A = (await post({ title: "검사 관계 DB " + tv, kind: "database", db: {
        props: [{ key: "status", name: "Status", type: "status", options: [{ name: "시작 전", color: "gray" }, { name: "진행 중", color: "blue" }] },
          { key: "proj", name: "Proj", type: "relation", target: B },
          { key: "tot", name: "Total", type: "rollup", relation: "proj", target: "hours", fn: "sum" },
          { key: "fx", name: "Fx", type: "formula", expr: 'if(prop("Total") > 5, "big " + prop("Total"), "small")' },
          { key: "bad", name: "Bad", type: "formula", expr: "1 +" },
          { key: "pic", name: "Pic", type: "url" }],
        views: [{ id: "v1", name: "Table", type: "table" }, { id: "v2", name: "Big", type: "table", filters: [{ prop: "fx", op: "contains", value: "big" }] },
          { id: "v3", name: "Gallery", type: "gallery", show: ["tot", "fx"], cover: "pic" }, { id: "v4", name: "List", type: "list", show: ["fx"] }] } })).id;
      const a1 = (await post({ title: "관계 하나 " + tv, parent_id: A, props: { proj: [b1, b2], pic: "/assets/graph/orb.png" } })).id;
      const a2 = (await post({ title: "관계 둘 " + tv, parent_id: A, props: { proj: [b1] } })).id;
      await go("#/notes/" + A, 2500);
      await p.waitForSelector(".db-table", { timeout: 8000 }); await sleep(800);
      const cell = (rid, k) => p.evaluate(([rid, k]) => document.querySelector(`tr[data-row="${rid}"] td[data-prop="${k}"]`)?.textContent.trim() || "", [rid, k]);
      const t1 = await cell(a1, "tot"), f1 = await cell(a1, "fx"), f2 = await cell(a2, "fx"), bad = await cell(a1, "bad"), chips = await cell(a1, "proj");
      ok(t1 === "7" && f1 === "big 7" && f2 === "small" && bad.startsWith("⚠") && chips.includes("대상 둘"), `${tv} · DB 관계 · 롤업 · 수식 — 합 ${t1} · 수식 ${f1}/${f2} · 오류 ${bad.slice(0, 20)} · 칩 ${chips.slice(0, 30)}`);
      // 수식 필터 보기: big 만
      const vi = async (name) => { const i = (await p.locator(".db-tabs [data-view]").allTextContents()).findIndex((t) => t.includes(name)); await p.locator(".db-tabs [data-view]").nth(i).click(); await sleep(500); };
      await vi("Big"); const bigN = await p.locator(".db-table tr[data-row]").count();
      // 관계 고르기 (검색 팝오버) → 롤업이 바로 바뀌어요
      await vi("Table");
      await p.click(`tr[data-row="${a2}"] td[data-prop="proj"]`); await p.waitForSelector(".db-pop [data-rel]", { timeout: 5000 });
      await p.fill(".db-pop .db-pop-q", "둘"); await p.click(`.db-pop [data-rel="${b2}"]`); await p.press(".db-pop .db-pop-q", "Escape"); await sleep(1300);
      const rel2 = JSON.parse((await getN(a2)).note.props || "{}").proj || [];
      const t2 = await cell(a2, "tot");
      ok(bigN === 1 && rel2.length === 2 && t2 === "7", `${tv} · DB 수식 필터 ${bigN}줄 · 관계 고르기 → ${rel2.length}개 · 롤업 ${t2}`);
      // 갤러리 · 목록
      await vi("Gallery");
      const gal = await p.evaluate(() => ({ n: document.querySelectorAll(".db-gcard[data-row]").length, img: document.querySelector(".db-gcover img")?.getAttribute("src") || "", txt: document.querySelector(".db-gcard[data-row]")?.textContent || "" }));
      await p.screenshot({ path: `${process.env.SHOTS || "/tmp"}/e2e-db-gallery-${w}.png` }).catch(() => {});
      await vi("List");
      const li = await p.evaluate(() => ({ n: document.querySelectorAll(".db-li").length, txt: document.querySelector(".db-li")?.textContent || "" }));
      ok(gal.n === 2 && gal.img.includes("orb.png") && /big 7/.test(gal.txt) && li.n === 2 && /big 7/.test(li.txt), `${tv} · DB 갤러리 ${gal.n}장 (표지 ${gal.img.slice(-9)}) · 목록 ${li.n}줄`);
      // 템플릿: + New ▾ → + New template → 이름 → 블록 · 값 넣기 → 그 템플릿으로 새 행
      await vi("Table");
      await p.click(".db-newmenu"); await p.click(".db-pop [data-tpl-new]");
      await p.waitForSelector(".db-rename", { timeout: 5000 }); await p.fill(".db-rename", "검사 템플릿 " + tv); await p.press(".db-rename", "Enter"); await sleep(1200);
      const tpl = (await getN(A)).children.find((c) => JSON.parse(c.props || "{}")._tpl);
      await ctx.request.put(BASE + "/api/notes/" + tpl.id, { headers: H, data: { props: { status: "진행 중" }, blocks: { v: 1, blocks: [{ id: "b_tpl1", type: "paragraph", text: "시작 블록 " + tv }] } } });
      await go("#/notes/" + A, 2500); await p.waitForSelector(".db-table", { timeout: 8000 });
      await p.click(".db-newmenu"); await p.click(`.db-pop [data-tpl="${tpl.id}"]`);
      await p.waitForSelector(".db-rename", { timeout: 5000 }); await p.press(".db-rename", "Escape"); await sleep(1000);
      const kids = (await getN(A)).children.filter((c) => !JSON.parse(c.props || "{}")._tpl);
      const made = kids.find((c) => c.id !== a1 && c.id !== a2);
      const madeN = made ? (await getN(made.id)).note : null;
      const rowsShown = await p.locator(".db-table tr[data-row]").count();
      ok(tpl && madeN && JSON.parse(madeN.props).status === "진행 중" && madeN.body.includes("시작 블록") && rowsShown === 3 && !errs.length, `${tv} · DB 템플릿 — 새 행 ${madeN?.title} · 상태 ${madeN && JSON.parse(madeN.props).status} · 블록 복사 ${!!madeN?.body.includes("시작 블록")} · 표 ${rowsShown}줄${errs.length ? " — " + errs[0] : ""}`);
    } catch (e) { ok(false, `${tv} · DB 갤러리 · 템플릿 · 관계 — ${String(e.message).split("\n")[0]}`); }

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

    // ---------- ⑫ 뉴스 — 하루 한 호 (가독성 · 한국어): 헤드라인 · 분야 · 기사 시트 · 메모 + 반박 · j/k · Esc (2026-10-13) ----------
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
    // 심은 글은 '몇 시간 전'이라 자정 직후엔 모두 어제 호로 가요 — 오늘 호가 비면 아래 기사 검사는 실패로 적고 넘어가요 (뒤 검사까지 멈추지 않게)
    if (!firstId) ok(false, `${tv} · 기사 시트 · 메모 · j/k — 오늘 호에 기사가 없어 건너뜀 (자정 직후면 news-seed 의 글이 어제 호로 가요)`);
    else {
    await p.click(`.gn-item[data-id="${firstId}"] .gn-item-a`);
    await p.waitForSelector("#gn-compose textarea", { timeout: 8000 }).catch(() => {});
    ok(await p.evaluate((id) => location.hash === "#/news/item/" + id && !!document.querySelector(".gn.sheet-on .gn-sh-t"), firstId), `${tv} · 기사를 열면 시트`);
    await p.fill("#gn-compose textarea", "e2e memo " + tv);
    await p.click("#gn-compose button"); await sleep(600);
    const memoN = await p.evaluate(() => document.querySelectorAll(".gn-memo").length);
    await p.locator(".gn-memo").last().locator("[data-reply=rebut]").click();
    await p.locator(".gn-memo").last().locator(".gn-rform textarea").fill("e2e rebut");
    await p.locator(".gn-memo").last().locator(".gn-rform button").click(); await sleep(600);
    const talk = await p.evaluate(() => ({ rebut: !!document.querySelector(".gn-memo:last-of-type .gn-reply.rebut"), n: document.querySelector("#gn-talk-n")?.textContent || "" }));
    ok(memoN > 0 && talk.rebut && talk.n.includes("Disputed"), `${tv} · 메모 + 반박 — 의견 갈림 표시`);
    await p.evaluate(() => document.activeElement?.blur());
    await p.keyboard.press("j"); await sleep(900);
    const moved = await p.evaluate((id) => /^#\/news\/item\//.test(location.hash) && location.hash !== "#/news/item/" + id, firstId);
    await p.keyboard.press("Escape"); await sleep(600);
    ok(moved && await p.evaluate(() => /^#\/news(\/\d{4}-\d{2}-\d{2})?$/.test(location.hash) && !document.querySelector(".gn.sheet-on")) && !errs.length, `${tv} · j 로 다음 기사 · Esc 로 닫기 · 오류 없음${errs.length ? " — " + errs[0] : ""}`);
    }
    // 세계 — 진짜 지구본(캔버스) · 나라 목록 / 회사 — 구독하면 탭이 생겨요
    await hop("#/news/world", ".gn-ranks [data-cc]", 1500);
    const wv = await p.evaluate(() => ({ cv: (document.querySelector("#gn-globe")?.width || 0) > 100, n: document.querySelectorAll(".gn-ranks [data-cc]").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
    ok(wv.cv && wv.n > 0 && !wv.over, `${tv} · 세계 — 지구본 · 나라 ${wv.n}곳 · 가로 넘침 없음`);
    await hop("#/news/co", ".gn-sub", 800);
    const wasOn = await p.evaluate(() => document.querySelector(".gn-sub")?.getAttribute("aria-pressed") === "true");
    await p.click(".gn-sub"); await sleep(900);
    const coOk = await p.evaluate((w) => document.querySelector(".gn-sub")?.getAttribute("aria-pressed") === String(!w), wasOn);
    await p.click(".gn-sub"); await sleep(600);
    ok(coOk, `${tv} · 회사 — 구독 켜고 끄기`);
    if (firstId) await ctx.request.fetch(BASE + "/api/news/item/" + firstId, { method: "GET", headers: H }).then(async (r) => {
      for (const c of (await r.json()).comments || []) if (/^e2e /.test(c.body) && !c.parent_id) await ctx.request.fetch(BASE + "/api/news/comments/" + c.id, { method: "DELETE", headers: H });
    }).catch(() => {});

    // ---------- ⑬ 경영 마이크로디그리 — 모듈 지도 · 현황판 · 2주 계획 · 카드 · 케이스 · 연습문제 · 오늘 · 회사 세우기 · 용어 (2026-10-14) ----------
    {
      errs = [];
      await go("#/mba", 2600);
      const hm = await p.evaluate(() => ({ map: !!document.querySelector("#mb-map:not([hidden])") || !!document.querySelector("#mb-fallback:not([hidden])"), nav: document.querySelectorAll(".mb-nav .mb-pill").length, rows: document.querySelectorAll(".mb-table tbody tr").length, steps: document.querySelectorAll(".mb-steps li").length,
        dash: document.querySelectorAll(".mbd-wrap > .mbd").length, heat: document.querySelectorAll(".mbd-grid i").length, mods: document.querySelectorAll(".mbd-mods li").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      await p.click('.mb-today [data-min="60"]').catch(() => {}); await sleep(200);
      const m60 = await p.evaluate(() => document.querySelector("#mb-tmin")?.textContent.startsWith("60") && document.querySelector("#mb-pmin")?.textContent === "60" && /300분/.test(document.querySelector(".mbd-week .mbd-big")?.textContent || ""));
      await p.click('.mb-today [data-min="90"]').catch(() => {});
      ok(hm.map && hm.nav === 4 && hm.rows === 12 && hm.steps === 5 && hm.dash === 6 && hm.heat === 168 && hm.mods === 12 && m60 && !hm.over && !errs.length, `${tv} · 경영 홈 — 지도 ${hm.map} · 내비 ${hm.nav} · 모듈 ${hm.rows} · 순서 ${hm.steps} · 현황판 ${hm.dash}칸 · 24주 ${hm.heat}칸 · 60분 바꾸기 ${m60} · 가로 넘침 ${hm.over}${errs.length ? " — " + errs[0] : ""}`);
      const mi = await (await ctx.request.get(BASE + "/mba/index.json")).json(), acc = mi.modules.find((m) => m.id === "accounting");
      const doc = await (await ctx.request.get(BASE + "/mba/accounting.json")).json();
      errs = [];
      await hop("#/mba/accounting", ".mb-days", 500);
      const mp = await p.evaluate(() => ({ days: document.querySelectorAll(".mb-day").length, goals: document.querySelectorAll(".mb-goals li").length, cs: document.querySelectorAll(".mb-it.case").length, pr: document.querySelectorAll('a.mb-it[href*="/practice/"]').length, lec: document.querySelectorAll("li.mb-it.lec a[target=_blank]").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(mp.days === 10 && mp.goals >= 3 && mp.cs === acc.cases.length && mp.pr >= 5 && mp.lec === acc.lectures.length && !mp.over && !errs.length, `${tv} · 경영 2주 계획 — ${mp.days}일 · 목표 ${mp.goals} · 케이스 ${mp.cs} · 문제 묶음 ${mp.pr} · 강의 ${mp.lec} · 가로 넘침 ${mp.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop("#/mba/accounting/profit-vs-revenue", ".mb-read h1", 600);
      const c0 = await p.evaluate(() => ({ svg: !!document.querySelector("#mb-vis svg.mbc .k-be"), read: document.querySelector("[data-read] dd.pos, [data-read] dd.neg")?.textContent || "", canvas3d: document.querySelectorAll("#mb-vis canvas").length, ai: !!document.querySelector(".mb-ai .ppc-form"), q: document.querySelectorAll(".mb-q").length, deep: document.querySelectorAll(".mb-deepblk .mb-p").length, outline: document.querySelectorAll(".mb-outline li:not(.mb-ol-day)").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      await p.evaluate(() => { const s = document.querySelector('#mb-vis input[data-k="price"]'); s.value = "2300"; s.dispatchEvent(new Event("input", { bubbles: true })); });
      await sleep(150);
      const c1 = await p.evaluate(() => document.querySelector("[data-read] dd.pos, [data-read] dd.neg")?.textContent || "");
      await p.click(".mb-q .mb-choice").catch(() => {}); await sleep(150);
      const why = await p.evaluate(() => !document.querySelector(".mb-q .mb-q-why").hidden);
      ok(c0.svg && c0.canvas3d === 0 && c0.read && c1 && c0.read !== c1 && why && c0.ai && c0.q >= 2 && c0.deep >= 2 && c0.outline === doc.cards.length && !c0.over && !errs.length, `${tv} · 경영 카드 — 정적 이익 지도 ${c0.svg} (3D ${c0.canvas3d}) · 가격 바꾸면 ${c0.read} → ${c1} · 더 자세히 ${c0.deep}문단 · 목차 ${c0.outline}장 · 퀴즈 풀이 ${why} · AI 튜터 ${c0.ai} · 가로 넘침 ${c0.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop(`#/mba/accounting/case/${acc.cases[0].id}`, ".mb-cq", 500);
      const k0 = await p.evaluate(() => ({ q: document.querySelectorAll(".mb-cq").length, table: !!document.querySelector("#mb-c-data table"), ai: !!document.querySelector(".mb-ai .ppc-form") }));
      await p.fill('[data-ans="0"]', ""); await p.click('[data-model="0"]'); await sleep(100);
      const nudge = await p.evaluate(() => !document.querySelector('[data-nudge="0"]').hidden && document.querySelector('[data-model-t="0"]').hidden);
      await p.fill('[data-ans="0"]', "매출보다 현금 흐름을 먼저 봐요"); await p.click('[data-model="0"]'); await sleep(100);
      const model = await p.evaluate(() => !document.querySelector('[data-model-t="0"]').hidden);
      await p.click("#mb-case-done"); await p.waitForSelector("#mb-case-undo", { timeout: 5000 }).catch(() => {});
      const kd = await p.evaluate(() => ({ undo: !!document.querySelector("#mb-case-undo"), over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(k0.q >= 3 && k0.table && k0.ai && nudge && model && kd.undo && !kd.over && !errs.length, `${tv} · 경영 케이스 — 질문 ${k0.q} · 데이터 표 ${k0.table} · 빈 답이면 먼저 쓰라고 ${nudge} · 쓰고 나면 모범 답안 ${model} · 끝 기록 ${kd.undo} · AI 코치 ${k0.ai} · 가로 넘침 ${kd.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      const d1 = doc.problems.filter((x) => x.day === doc.problems[0].day), pn = d1.find((x) => x.type === "number"), pc = d1.find((x) => x.type === "choice");
      await hop(`#/mba/accounting/practice/${doc.problems[0].day}`, ".mb-prob", 500);
      const n0 = await p.evaluate(() => document.querySelectorAll(".mb-prob").length);
      let numOk = true, chOk = true;
      if (pn) { const li = `.mb-prob[data-pid="${pn.id}"]`; await p.fill(`${li} input`, Number(pn.answer).toLocaleString("en-US")); await p.click(`${li} button[type=submit]`); await sleep(250); numOk = await p.evaluate((s) => !!document.querySelector(`${s} .mb-in.right`) && !!document.querySelector(`${s} .mb-solve li`), li); }
      if (pc) { const li = `.mb-prob[data-pid="${pc.id}"]`, wrong = pc.answer === 0 ? 1 : 0; await p.click(`${li} .mb-choice[data-ci="${wrong}"]`); await sleep(250); chOk = await p.evaluate((s) => !!document.querySelector(`${s} .mb-choice.wrong`) && !!document.querySelector(`${s} .mb-choice.right`) && !document.querySelector(`${s} .mb-prob-r`).hidden, li); }
      const sc = await p.evaluate(() => ({ t: document.querySelector("#mb-score")?.textContent || "", over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(n0 === d1.length && (pn || pc) && numOk && chOk && /맞힘/.test(sc.t) && !sc.over && !errs.length, `${tv} · 경영 연습문제 — ${n0}문제 · 숫자 채점(쉼표 써도) ${numOk} · 틀린 고르기 풀이 ${chOk} · "${sc.t}" · 가로 넘침 ${sc.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop("#/mba/today", ".mb-tsteps", 600);
      const td = await p.evaluate(() => ({ steps: document.querySelectorAll(".mb-tsteps li").length, recall: !!document.querySelector("#mb-recall-t"), fresh: document.querySelectorAll(".mb-nexts a.mb-it").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(td.steps === 5 && td.recall && td.fresh >= 3 && !td.over && !errs.length, `${tv} · 경영 오늘 — 순서 ${td.steps} · 떠올리기 ${td.recall} · 새 카드 · 문제 ${td.fresh} · 가로 넘침 ${td.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop("#/mba/company", ".mb-stepbox", 500);
      const t0 = await p.evaluate(() => document.querySelector("#mb-tax dd.acc")?.textContent || "");
      await p.click('[data-dense="1"]'); await sleep(150);
      const t1 = await p.evaluate(() => document.querySelector("#mb-tax dd.acc")?.textContent || "");
      await p.click('.mb-step[data-i="8"]'); await sleep(150);
      const st = await p.evaluate(() => ({ h: document.querySelector(".mb-stepbox h2")?.textContent || "", n: document.querySelectorAll(".mb-step").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(t0 === "135,000원" && t1 === "405,000원" && /사업자/.test(st.h) && st.n === 12 && !st.over && !errs.length, `${tv} · 회사 세우기 — 세금 ${t0} → 과밀 ${t1} · 단계 ${st.n}칸 · 8번 "${st.h}" · 가로 넘침 ${st.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop("#/mba/words", "#mb-q", 500);
      const w0 = await p.evaluate(() => document.querySelectorAll(".mb-term").length);
      await p.fill("#mb-q", "EBITDA"); await sleep(150);
      const w1 = await p.evaluate(() => document.querySelectorAll(".mb-term").length);
      ok(w0 >= 100 && w1 >= 1 && w1 < w0 && !errs.length, `${tv} · 경영 용어 — 전체 ${w0} · 'EBITDA' 찾기 ${w1}${errs.length ? " — " + errs[0] : ""}`);
    }

    // ---------- ⑬-2 개발 흐름 마이크로디그리 — 3D 흐름 지도 · 현황판 · 한 주 · 카드 · 사례 · 회의실 · 오늘 · 문서 지도 (2026-10-15) ----------
    {
      errs = [];
      await go("#/dev", 3000);
      const dh = await p.evaluate(() => ({ dock: !!document.querySelector('[data-nav="dev"]'), disp: /dev flow/i.test(document.querySelector(".dv-disp")?.textContent || ""), st: document.querySelectorAll(".dv-st").length,
        canvas: !!document.querySelector("#dv-canvas"), placed: [...document.querySelectorAll(".dv-st")].filter((b) => !/-9999/.test(b.style.transform) && b.style.display !== "none").length, hidden3d: [...document.querySelectorAll(".dv-st")].every((b) => b.style.display === "none"),
        plan: document.querySelectorAll(".dv-plan li").length, why: document.querySelectorAll(".dv-why .dv-panel").length, mods: document.querySelectorAll(".dv-mod").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      await p.click('.dv [data-min="60"]').catch(() => {}); await sleep(250);
      const d60 = await p.evaluate(() => /60분/.test(document.querySelector("#dv-today-h")?.textContent || "") && document.querySelector('[data-min="60"]')?.getAttribute("aria-pressed") === "true");
      await p.click('.dv [data-min="45"]').catch(() => {});
      ok(dh.dock && dh.disp && dh.st === 12 && dh.canvas && (dh.placed === 12 || dh.hidden3d) && dh.plan === 5 && dh.why === 6 && dh.mods === 12 && d60 && !dh.over && !errs.length, `${tv} · 개발 홈 — 독 ${dh.dock} · 제목 ${dh.disp} · 정거장 ${dh.st}(놓임 ${dh.placed}) · 순서 ${dh.plan} · 학습 설계 ${dh.why} · 모듈 ${dh.mods} · 60분 ${d60} · 가로 넘침 ${dh.over}${errs.length ? " — " + errs[0] : ""}`);
      const di = await (await ctx.request.get(BASE + "/dev/index.json")).json(), sm = di.modules.find((m) => m.id === "security");
      const sd = await (await ctx.request.get(BASE + "/dev/security.json")).json();
      errs = [];
      await hop("#/dev/security", ".dv-days", 600);
      const wk = await p.evaluate(() => ({ no: document.querySelector(".dv-week-no")?.textContent, days: document.querySelectorAll(".dv-day").length, rows: document.querySelectorAll('.dv-panel a.dv-row[href*="/c"]:not([href*="/case/"])').length, story: !!document.querySelector(".dv-paper h2"), over: document.documentElement.scrollWidth > innerWidth + 1 }));
      await p.click('.dv-day[data-day="4"]'); await sleep(150);
      const wk5 = await p.evaluate(() => document.querySelector('.dv-day[data-day="4"]')?.getAttribute("aria-pressed") === "true");
      ok(wk.no === "07" && wk.days === 5 && wk.rows === 4 && wk.story && wk5 && !wk.over && !errs.length, `${tv} · 개발 한 주 — ${wk.no} · ${wk.days}일 · 그날 카드 ${wk.rows} · 두런 장면 ${wk.story} · 5일째로 ${wk5} · 가로 넘침 ${wk.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop("#/dev/security/c09", "#dv-read h1", 700);
      const cd = await p.evaluate(() => ({ code: /kauth\.kakao\.com/.test(document.querySelector(".dv-code")?.textContent || ""), src: document.querySelectorAll(".dv-src a").length, ai: !!document.querySelector("#dv-ai .ppc-form, #dv-ai form"), over: document.documentElement.scrollWidth > innerWidth + 1 }));
      await p.click("#dv-recall-b"); await p.click(".dv-qz .dv-opt").catch(() => {}); await sleep(150);
      const cd2 = await p.evaluate(() => ({ ans: !document.querySelector("#dv-recall-a").hidden, why: !document.querySelector(".dv-qz .dv-why")?.hidden }));
      ok(cd.code && cd.src >= 1 && cd.ai && cd2.ans && cd2.why && !cd.over && !errs.length, `${tv} · 개발 카드 — 카카오 주소 코드 ${cd.code} · 출처 ${cd.src} · AI ${cd.ai} · 떠올리기 답 ${cd2.ans} · 퀴즈 해설 ${cd2.why} · 가로 넘침 ${cd.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop(`#/dev/security/case/${sm.cases[0].id}`, ".dv-tl", 600);
      await p.click("[data-show='0']"); await sleep(100);
      const cs = await p.evaluate(() => ({ tl: document.querySelectorAll(".dv-tl li").length, q: document.querySelectorAll(".dv-q").length, a: !document.querySelector('[data-a="0"]').hidden, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(cs.tl >= 4 && cs.q >= 3 && cs.a && !cs.over && !errs.length, `${tv} · 개발 사례 — 타임라인 ${cs.tl} · 질문 ${cs.q} · 해설 ${cs.a} · 가로 넘침 ${cs.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      const pd = sd.problems[0].day;
      await hop(`#/dev/security/practice/${pd}`, ".dv-mopt", 600);
      await p.click("[data-p] .dv-mopt"); await sleep(200);
      const mt = await p.evaluate(() => ({ n: document.querySelectorAll("[data-p]").length, ex: !document.querySelector("[data-p] [data-ex]").hidden, pick: !!document.querySelector("[data-p] .dv-mopt.pick"), over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(mt.n === sd.problems.filter((x) => x.day === pd).length && mt.ex && mt.pick && !mt.over && !errs.length, `${tv} · 개발 회의실 — ${mt.n}장면 · 해설 ${mt.ex} · 정답 표시 ${mt.pick} · 가로 넘침 ${mt.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop("#/dev/today", ".dv-plan-in", 600);
      const td = await p.evaluate(() => ({ sec: document.querySelectorAll(".dv-wrap > section.dv-panel").length, fresh: document.querySelectorAll('section a.dv-row[href*="/c"]').length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(td.sec === 5 && td.fresh >= 3 && !td.over && !errs.length, `${tv} · 개발 오늘 — 단계 ${td.sec} · 새 카드 ${td.fresh} · 가로 넘침 ${td.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop("#/dev/docs", ".dv-lane", 600);
      await p.click('.dv-doc[data-k="erd"]'); await sleep(150);
      const dc = await p.evaluate(() => ({ docs: document.querySelectorAll(".dv-doc").length, erd: document.querySelectorAll(".dv-ent").length, map: document.querySelectorAll(".dv-tbl tbody tr").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(dc.docs === 11 && dc.erd === 5 && dc.map >= 8 && !dc.over && !errs.length, `${tv} · 개발 문서 지도 — 문서 ${dc.docs} · ERD 표 ${dc.erd} · 대응표 ${dc.map} · 가로 넘침 ${dc.over}${errs.length ? " — " + errs[0] : ""}`);
      errs = [];
      await hop("#/dev/ask/security", "#dv-ask .ppc", 600);
      const ak = await p.evaluate(() => ({ tabs: document.querySelectorAll(".dv-nav a").length, cur: document.querySelector('.dv-nav a[aria-current="page"]')?.textContent, mods: document.querySelectorAll(".dv-askmods a").length, on: document.querySelector('.dv-askmods a[aria-current="page"]')?.getAttribute("href"), input: !!document.querySelector("#dv-ask textarea, #dv-ask input"), over: document.documentElement.scrollWidth > innerWidth + 1 }));
      await hop("#/dev/security", ".dv-days", 400);
      const wkAsk = await p.evaluate(() => !!document.querySelector('a[href="#/dev/ask/security"]'));
      ok(ak.tabs === 4 && ak.cur === "AI 질문" && ak.mods === 12 && ak.on === "#/dev/ask/security" && ak.input && wkAsk && !ak.over && !errs.length, `${tv} · 개발 AI 질문 — 탭 ${ak.tabs} (${ak.cur}) · 주 고르기 ${ak.mods} · 지금 ${ak.on} · 입력칸 ${ak.input} · 주 화면에서 바로 가기 ${wkAsk} · 가로 넘침 ${ak.over}${errs.length ? " — " + errs[0] : ""}`);
      await ctx.request.fetch(BASE + "/api/dev/done", { method: "PUT", headers: H, data: { module: "security", item: sd.problems.find((x) => x.day === pd).id, kind: "problem", done: false } }).catch(() => {});
    }

    // ---------- ⑭ 영상 노트 한 화면 — 맨 위 인용에 YouTube 영상이 있으면 왼쪽 영상 · 목차 · 접힌 스크립트, 오른쪽 정리 (2026-10-14) ----------
    {
      const V = "Am7IWP8IpEc", u = (t) => `https://youtu.be/${V}?t=${t}`, title = "영상 검사 " + tv;
      const body = `> 🎬 원본 영상: [YouTube](https://youtu.be/${V}) · 채널 **검사 채널** · 길이 1:00:00\n> 🖼 이미지: 영상 캡처 1장\n\n#영상정리\n\n## 한 줄 결론\n핵심 **한 줄**.\n\n## 짧은 요약\n_(없음)_\n\n## 목차\n- 1. 첫째\n\n## 정리 본문\n_각 항목 끝의 ⏱ 표시는 그 말이 나온 영상 위치예요._\n\n### 1. 첫째 [⏱0:00](${u(0)})\n![영상 캡처 0:05](/icons/icon-192.png)\n[▶ 0:05 에서 보기](${u(5)})\n- **요점** [⏱0:30](${u(30)})\n#### 1.1. 둘째 [⏱1:00](${u(60)})\n- 설명 [⏱1:30](${u(90)})\n\n## 원문\n- [[${title} · 원문 스크립트]] — 자막 전체\n`;
      const mkN = async (data) => (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data })).json()).note;
      const sum = await mkN({ title, body });
      const scr = await mkN({ title: title + " · 원문 스크립트", parent_id: sum.id, body: `> 🎬 [검사 영상](https://www.youtube.com/watch?v=${V}) 의 자막 전체예요. 정리본: [[${title}]]\n\n` + [0, 30, 60, 90].map((t) => `[${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}](${u(t)}) line ${t} >> next speaker`).join("\n\n") });
      const mineErr = () => errs.filter((e) => !/youtube|ytimg|googlevideo|doubleclick|ERR_BLOCKED|Permissions-Policy|third-party/i.test(e)); // YouTube 안쪽 경고는 빼요
      errs = [];
      await go("#/notes/" + sum.id, 2200);
      const a = await p.evaluate(() => ({ h: document.querySelectorAll(".vn-main h3, .vn-main h4").length, ts: document.querySelectorAll(".vn-main .vn-ts").length, shot: document.querySelectorAll(".vn-main .vn-shot").length, lead: !!document.querySelector(".vn-lead"), gone: !/없음|목차|원문 스크립트/.test(document.querySelector(".vn-main")?.textContent || "-"), toc: document.querySelectorAll(".vn-toc-l button").length, lines: document.querySelectorAll(".vn-side .vn-lines li").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      await p.click(".vn-script summary"); await sleep(200);
      await p.click(".vn-side .vn-lines li:nth-child(2)"); await sleep(400);
      const pl = await p.evaluate(() => ({ playing: !!document.querySelector(".vn.playing"), player: !!document.querySelector(".vn-player .vn-yt, .vn-player iframe") }));
      const e1 = mineErr();
      ok(a.h === 2 && a.ts === 4 && a.shot === 1 && a.lead && a.gone && a.toc === 2 && a.lines === 4 && !a.over && pl.playing && pl.player && !e1.length, `${tv} · 영상 노트 — 제목 ${a.h} · 시간 ${a.ts} · 캡처 ${a.shot} · 목차 ${a.toc} · 스크립트 ${a.lines}줄 · 줄 누르면 앱 안 영상 ${pl.player} · 빈 칸 숨김 ${a.gone} · 가로 넘침 ${a.over}${e1.length ? " — " + e1[0] : ""}`);
      errs = [];
      await go("#/notes/" + scr.id, 2200);
      const b = await p.evaluate(() => ({ from: document.querySelector(".vn-from")?.textContent || "", open: !!document.querySelector(".vn-script[open]"), h: document.querySelectorAll(".vn-main h3").length }));
      const e2 = mineErr();
      ok(/정리/.test(b.from) && b.open && b.h === 1 && !e2.length, `${tv} · 스크립트 노트도 같은 화면 — 오른쪽 '${b.from}' · 스크립트 펼침 ${b.open}${e2.length ? " — " + e2[0] : ""}`);
      // 우클릭 Edit 로 고르면 영상 노트도 보기 대신 편집으로 (목록 · 그래프 모두 같은 길)
      if (w > 600) {
        await p.evaluate(async () => { for (const n of await caches.keys()) if (n.startsWith("dsm-api-")) await caches.delete(n); }).catch(() => {});
        await go("#/notes", 1800);
        const li = `#nl a[href="#/notes/${sum.id}"]`;
        await p.waitForSelector(li, { timeout: 8000 }).catch(() => {});
        await p.locator(li).click({ button: "right" }); await p.click('.cm [data-k="edit"]'); await sleep(1500);
        const ed = await p.evaluate(() => ({ vn: !!document.querySelector(".vn"), mode: document.querySelector('[data-mode][aria-selected="true"]')?.dataset.mode }));
        ok(!ed.vn && ed.mode === "block", `${tv} · 우클릭 Edit → 영상 노트도 편집 (${ed.mode})`);
      }
      // 첫 줄이 YouTube 주소뿐인 노트(공유 링크 ?si=)도 영상 노트 — 본문은 그대로, 시간 링크만 버튼으로
      const bare = await mkN({ title: "영상 주소 검사 " + tv, body: `[https://youtu.be/${V}?si=abc](https://youtu.be/${V}?si=abc)\n\n## 요약\n첫 이야기 [⏱0:10](${u(10)})\n\n## 내 생각\n좋았어요.` });
      errs = [];
      await go("#/notes/" + bare.id, 2000);
      const c = await p.evaluate(() => ({ vn: !!document.querySelector(".vn"), lilys: !!document.querySelector(".vn-lilys"), h2: document.querySelectorAll(".vn-main h2").length, ts: document.querySelectorAll(".vn-main .vn-ts").length, toc: document.querySelectorAll(".vn-toc-l button").length, link: !!document.querySelector('.vn-info a[target="_blank"]') }));
      const e3 = mineErr();
      ok(c.vn && !c.lilys && c.h2 === 2 && c.ts === 1 && c.toc === 2 && c.link && !e3.length, `${tv} · 주소만 있는 영상 노트 — 한 화면 ${c.vn} · 제목 ${c.h2} · 시간 ${c.ts} · 목차 ${c.toc}${e3.length ? " — " + e3[0] : ""}`);
      errs = [];
    }

    // ---------- ⑭ 홈 오늘 링 끌기 — 하루 쪽 큰 시계 · 전체 쪽 오늘 링, 마우스 · 내 차트에서만 (2026-10-15) ----------
    {
      errs = [];
      const day = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
      const plansNow = async () => (await (await ctx.request.get(BASE + "/api/plans?periods=D:" + day, { headers: H })).json()).plans || [];
      // 링 띠 가운데(r=0.5)에서 m분 자리의 화면 좌표 (data-dial = 중심 · 띠 안쪽/바깥 반지름)
      const ringPt = (pg, m, r = 0.5) => pg.evaluate(([m, r]) => {
        const svg = document.querySelector(".pg-slide:not(.out) svg[data-dial]");
        const [cx, cy, ri, ro] = svg.dataset.dial.split(" ").map(Number), rr = ri + (ro - ri) * r, a = (m / 1440) * 2 * Math.PI - Math.PI / 2;
        const q = new DOMPoint(cx + rr * Math.cos(a), cy + rr * Math.sin(a)).matrixTransform(svg.getScreenCTM());
        return [q.x, q.y];
      }, [m, r]);
      const rd = () => p.evaluate(() => { const q = (c) => document.querySelector(".pg-slide:not(.out) .rd " + c)?.textContent || ""; return { cls: document.querySelector(".pg-slide:not(.out) .rd")?.getAttribute("class") || "", t1: q(".rd-t1"), big: q(".rd-big"), range: q(".rd-range"), sub: q(".rd-sub"), warn: q(".rd-warn"), pop: !!document.querySelector(".rd-pop"), hash: location.hash }; });
      const dragRing = async (from, to) => { await p.mouse.move(...await ringPt(p, from)); await p.mouse.down(); const st = to > from ? 5 : -5; for (let m = from + st; st > 0 ? m <= to : m >= to; m += st) await p.mouse.move(...await ringPt(p, m)); await sleep(60); };
      if (tv === "컴퓨터") {
        await p.evaluate(() => { localStorage.setItem("trio-home-page", "3"); localStorage.setItem("trio-guide-off", "1"); });
        await go("#/", 2500);
        await p.mouse.move(...await ringPt(p, 840)); await sleep(120);
        const hv = await rd();
        await dragRing(840, 925);
        const dg = await rd();
        await p.mouse.up(); await sleep(200);
        const up = await rd(), focused = await p.evaluate(() => !!document.activeElement?.closest?.(".rd-pop"));
        await p.keyboard.type("끌기 검사"); await p.keyboard.press("Enter"); await sleep(1500);
        const saved = (await plansNow()).find((x) => x.text === "끌기 검사"), after = await rd();
        ok(hv.cls.includes("hover") && hv.t1 === "14:00" && dg.big === "+85분" && dg.range === "14:00 → 15:25" && dg.sub === "1시간 25분" && up.pop && focused && saved?.start === "14:00" && saved?.mins === 85 && after.hash === "#/" && !after.pop,
          `${tv} · 하루 쪽 시계 끌기 — 선 ${hv.t1} · ${dg.big} · ${dg.range} · 이름 칸 ${up.pop}(입력 ${focused}) · 저장 ${saved ? saved.start + " " + saved.mins + "분" : "없음"} · 홈 그대로 ${after.hash}`);
        // 겹침 안내 + 이름 칸 Esc → 저장 안 됨 · 거꾸로 끌기 · 끄는 중 Esc → 놓아도 홈 그대로
        const n0 = (await plansNow()).length;
        await dragRing(900, 930); const ov = await rd(); await p.mouse.up(); await sleep(200);
        await p.keyboard.press("Escape"); await sleep(200);
        const esc1 = await rd(), n1 = (await plansNow()).length;
        await dragRing(720, 660); const back = await rd(); await p.keyboard.press("Escape"); await sleep(80);
        const esc2 = await rd(); await p.mouse.up(); await sleep(400);
        const esc3 = await rd();
        ok(/끌기 검사/.test(ov.warn) && !esc1.pop && n1 === n0 && back.range === "11:00 → 12:00" && back.big === "+60분" && !esc2.cls.includes("drag") && !esc3.pop && esc3.hash === "#/",
          `${tv} · 겹침 "${ov.warn}" · 이름 칸 Esc(저장 ${n1 - n0}) · 거꾸로 ${back.range} · 끄는 중 Esc → 홈 그대로 ${esc3.hash}`);
        // 끌지 않고 누르면 원래대로 하루 계획표
        await p.mouse.click(...await ringPt(p, 300)); await sleep(800);
        const clickHash = await p.evaluate(() => location.hash);
        ok(clickHash.startsWith("#/calendar/"), `${tv} · 링을 끌지 않고 누르면 원래대로 하루 계획표 (${clickHash})`);
        // 전체 쪽: 링 다섯 개 중 오늘 링에서만
        await p.evaluate(() => localStorage.setItem("trio-home-page", "0"));
        await go("#/", 2500);
        await p.mouse.move(...await ringPt(p, 180)); await sleep(120); const ah = await rd();
        await p.mouse.move(...await ringPt(p, 180, 1.9)); await sleep(120); const wk = await rd();
        await dragRing(300, 340); const ad = await rd(); await p.mouse.up(); await sleep(200);
        await p.keyboard.type("전체 쪽 끌기"); await p.keyboard.press("Enter"); await sleep(1500);
        const s2 = (await plansNow()).find((x) => x.text === "전체 쪽 끌기");
        ok(ah.cls.includes("hover") && ah.t1 === "03:00" && !wk.cls.includes("hover") && ad.big === "+40분" && s2?.start === "05:00" && s2?.mins === 40 && !errs.length,
          `${tv} · 전체 쪽 오늘 링 끌기 — 선 ${ah.t1} · 이번 주 링엔 선 없음 ${!wk.cls.includes("hover")} · ${ad.big} · 저장 ${s2 ? s2.start + " " + s2.mins + "분" : "없음"}${errs.length ? " — " + errs[0] : ""}`);
        // 친구 차트에선 선이 안 떠요
        await p.evaluate(() => document.querySelector('[data-who]:not([aria-selected="true"])')?.click()); await sleep(1500);
        await p.mouse.move(...await ringPt(p, 600)); await sleep(150);
        const fr = await rd();
        ok(!fr.cls.includes("hover"), `${tv} · 친구 차트엔 끌기 선이 안 떠요`);
        await p.evaluate(() => localStorage.removeItem("trio-home-page"));
      } else {
        // 폰(터치): 끌기 층이 생기지 않고, 누르면 원래대로 하루 계획표
        const tctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
        await tctx.request.post(BASE + "/api/auth/login", { headers: H, data: { username: user } });
        await tctx.addInitScript(() => { try { localStorage.setItem("trio-home-page", "3"); localStorage.setItem("trio-guide-off", "1"); } catch {} });
        const tp = await tctx.newPage();
        await tp.goto(BASE + "/#/"); await sleep(2500);
        await tp.touchscreen.tap(...await ringPt(tp, 600)); await sleep(900);
        const t = await tp.evaluate(() => ({ layer: !!document.querySelector(".rd"), hash: location.hash }));
        ok(!t.layer && t.hash.startsWith("#/calendar/"), `${tv} · 터치로 링을 누르면 원래대로 하루 계획표 · 끌기 층 없음 ${!t.layer} (${t.hash})`);
        await tctx.close();
      }
    }

    // ---------- ⑮ 하루 계획표 짧은 일정 — 맞닿으면 위아래로 · 붙어 있으면 그 칸만 늘어남 · 진짜 겹침은 나란히 (2026-10-15) ----------
    {
      errs = [];
      const ahead = tv === "컴퓨터" ? 3 : 4; // 다른 검사 계획 · 다른 크기 검사와 날짜가 안 겹치게
      const day = await p.evaluate((n) => { const d = new Date(Date.now() + n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }, ahead);
      const add = async (text, start, mins) => (await (await ctx.request.post(BASE + "/api/plans", { headers: H, data: { scope: "day", period: "D:" + day, text, start, mins } })).json()).plan;
      const rest = await add("짧은 휴식", "08:55", 5); await add("짧은 뒤 시험", "09:00", 50); await add("겹침 A", "13:00", 60); await add("겹침 B", "13:30", 30);
      await go("#/calendar/" + day, 2500);
      await p.evaluate(() => [...document.querySelectorAll("#dp-grid .block")].find((x) => x.querySelector("[data-edit]")?.textContent === "짧은 휴식")?.scrollIntoView({ block: "center" }));
      await sleep(300);
      const L = await p.evaluate(() => {
        const r = (t) => { const b = [...document.querySelectorAll("#dp-grid .block")].find((x) => x.querySelector("[data-edit]")?.textContent === t); if (!b) return null; const q = b.getBoundingClientRect(); return { top: q.top, h: q.height, left: q.left, w: q.width, cls: b.className }; };
        const hr = (h) => document.querySelector(`#dp-grid .hour[data-h="${h}"]`)?.getBoundingClientRect().height || 0;
        return { rest: r("짧은 휴식"), test: r("짧은 뒤 시험"), a: r("겹침 A"), b: r("겹침 B"), h8: hr(8), h11: hr(11) };
      });
      const stacked = L.rest && L.test && Math.abs(L.rest.left - L.test.left) <= 1 && Math.abs(L.rest.w - L.test.w) <= 1 && L.test.top >= L.rest.top + L.rest.h - 1;
      ok(stacked && L.rest.h >= 29 && /\bthin\b/.test(L.rest.cls) && !/\btiny\b/.test(L.rest.cls) && L.h8 > 96 && Math.round(L.h11) === 96 && L.b?.left > L.a?.left + 50 && !errs.length,
        `${tv} · 하루 계획표 — 5분 휴식 + 바로 뒤 시험 위아래로 ${stacked} · 휴식 높이 ${Math.round(L.rest?.h)}px · 8시 칸 ${Math.round(L.h8)}px(11시 ${Math.round(L.h11)}) · 진짜 겹침 나란히 ${L.b?.left > L.a?.left + 50}${errs.length ? " — " + errs[0] : ""}`);
      if (tv === "컴퓨터") {
        // 늘어난 칸에서도 빈 칸 시각이 맞아요: 휴식 바로 위(08:50~08:55) → "+ 08:50에 추가"
        const sx = await p.evaluate(() => document.querySelector('#dp-grid .hour[data-h="8"] [data-slot]').getBoundingClientRect().left + 40);
        await p.mouse.move(sx, L.rest.top - 4); await sleep(150);
        const slot = await p.evaluate(() => document.querySelector('#dp-grid .hour[data-h="8"] [data-slot]').textContent);
        // 끌기도 실제 시각: 휴식을 늘어난 칸 높이(시험 top − 휴식 top)만큼 내리면 09:00
        const dy = L.test.top - L.rest.top, x = L.rest.left + 160, y = L.rest.top + L.rest.h / 2;
        await p.mouse.move(x, y); await p.mouse.down();
        for (let k = 1; k <= 6; k++) { await p.mouse.move(x, y + (dy * k) / 6); await sleep(30); }
        await p.mouse.up(); await sleep(1500);
        const moved = (await (await ctx.request.get(BASE + "/api/plans?periods=D:" + day, { headers: H })).json()).plans.find((q) => q.id === rest.id)?.start;
        ok(slot === "+ 08:50에 추가" && moved === "09:00", `${tv} · 늘어난 칸 — 빈 칸 "${slot}" · 끌어서 내리면 ${moved}`);
      }
    }

    // ---------- ⑯ 홈 Day 쪽 ‹ 날짜 › — 내일 · 다른 날 보기와 끌어 넣기 · 고른 날 기억 (2026-10-15) ----------
    {
      errs = [];
      await p.evaluate(() => { localStorage.setItem("trio-home-page", "3"); localStorage.setItem("trio-guide-off", "1"); localStorage.removeItem("trio-home-day"); });
      await go("#/", 2500);
      const dn = () => p.evaluate(() => { const svg = document.querySelector(".pg-slide:not(.out) svg.ch-day-clock"); return { label: svg?.querySelector(".ch-dnav-t")?.textContent || "", cap: svg?.querySelector(".ch-cap")?.textContent || "", hand: !!svg?.querySelector(".ch-hand"), todayBtn: !!svg?.querySelector('[data-dnav="today"]'), kept: localStorage.getItem("trio-home-day"), hash: location.hash }; });
      const tap = async (k) => { await p.click(`.pg-slide:not(.out) svg [data-dnav="${k}"]`); await sleep(500); };
      const at = (m) => p.evaluate((m) => { const svg = document.querySelector(".pg-slide:not(.out) svg[data-dial]"); const [cx, cy, ri, ro] = svg.dataset.dial.split(" ").map(Number), r = (ri + ro) / 2, a = (m / 1440) * 2 * Math.PI - Math.PI / 2; const q = new DOMPoint(cx + r * Math.cos(a), cy + r * Math.sin(a)).matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }, m);
      const d0 = await dn();
      await tap("next"); const d1 = await dn();
      ok(d0.cap === "오늘 점수" && d0.hand && !d0.todayBtn && d1.cap === "내일 계획" && !d1.hand && d1.todayBtn && /^\d{4}-\d{2}-\d{2}$/.test(d1.kept || ""),
        `${tv} · Day 쪽 › → 내일 — "${d0.label}" ${d0.cap} → "${d1.label}" ${d1.cap} · 바늘 ${d1.hand} · 오늘로 ${d1.todayBtn}`);
      if (tv === "컴퓨터") {
        // 내일에 끌어 넣기 (10:00 → 11:00) → 고른 날짜로 저장
        await p.mouse.move(...await at(600)); await p.mouse.down();
        for (let m = 605; m <= 660; m += 5) await p.mouse.move(...await at(m));
        await p.mouse.up(); await sleep(250);
        await p.keyboard.type("내일 끌기"); await p.keyboard.press("Enter"); await sleep(1500);
        const tp = (await (await ctx.request.get(BASE + "/api/plans?periods=D:" + d1.kept, { headers: H })).json()).plans.find((x) => x.text === "내일 끌기");
        // 새로 열어도 고른 날 · 지난 날짜를 기억해 두었으면 오늘부터 · ‹ 어제 · 오늘로
        await go("#/", 2500); const d2 = await dn();
        await p.evaluate(() => localStorage.setItem("trio-home-day", "2020-01-01")); await go("#/", 2500); const d3 = await dn();
        await tap("prev"); const d4 = await dn(); await tap("today"); const d5 = await dn();
        // 내일에서 링을 끌지 않고 누르면 내일 하루 계획표
        await tap("next"); await p.mouse.click(...await at(300)); await sleep(900);
        const h6 = await p.evaluate(() => location.hash);
        ok(tp?.start === "10:00" && tp?.mins === 60 && d2.cap === "내일 계획" && d3.cap === "오늘 점수" && d4.cap === "어제 점수" && d5.cap === "오늘 점수" && h6 === "#/calendar/" + d1.kept && !errs.length,
          `${tv} · 내일에 끌어 넣기 ${tp ? tp.start + " " + tp.mins + "분" : "없음"} · 새로 열어도 ${d2.cap} · 지난 기억 → ${d3.cap} · ‹ ${d4.cap} · 오늘로 ${d5.cap} · 링 → ${h6}${errs.length ? " — " + errs[0] : ""}`);
      }
      await p.evaluate(() => { localStorage.removeItem("trio-home-day"); localStorage.removeItem("trio-home-page"); });
    }

    // ---------- ⑰ 계획 복사 · 붙여넣기 (⌘C · ⌘V · ⌘Z, Ctrl 도 돼요) — 하루 계획표 · 홈 시계 (2026-10-16) ----------
    if (tv === "컴퓨터") {
      errs = [];
      const day = await p.evaluate(() => { const d = new Date(Date.now() + 7 * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
      const add = async (text, start, mins, priority) => (await (await ctx.request.post(BASE + "/api/plans", { headers: H, data: { scope: "day", period: "D:" + day, text, start, mins, ...(priority ? { priority } : {}) } })).json()).plan;
      const list = async (d) => (await (await ctx.request.get(BASE + "/api/plans?periods=D:" + d, { headers: H })).json()).plans.map((x) => `${x.start} ${x.mins} ${x.text}${x.priority ? " " + x.priority : ""}`).sort();
      await add("복사 A", "09:00", 60, "high"); await add("복사 B", "10:00", 30);
      await go("#/calendar/" + day, 2500);
      const blockAt = (t) => p.evaluate((t) => { const b = [...document.querySelectorAll("#dp-grid .block")].find((x) => x.querySelector("[data-edit]")?.textContent === t); b?.scrollIntoView({ block: "center" }); const r = b?.getBoundingClientRect(); return r ? [r.left + Math.min(200, r.width / 2), r.top + r.height / 2] : [0, 0]; }, t);
      const hourAt = (h) => p.evaluate((h) => { const r = document.querySelector(`#dp-grid .hour[data-h="${h}"]`); r.scrollIntoView({ block: "center" }); const q = r.getBoundingClientRect(); return [q.left + 300, q.top + 2]; }, h);
      const shiftClick = async ([x, y]) => { await p.keyboard.down("Shift"); await p.mouse.click(x, y); await p.keyboard.up("Shift"); };
      // 하나: A 에 마우스 → ⌘C → 14시 칸에 마우스 → ⌘V → 14:00 (우선순위까지) → ⌘Z 로 되돌리기
      await p.mouse.move(...await blockAt("복사 A")); await p.keyboard.press("Control+C"); await sleep(200);
      await p.mouse.move(...await hourAt(14)); await p.keyboard.press("Control+V"); await sleep(1500);
      const one = await list(day);
      await p.keyboard.press("Control+Z"); await sleep(1500);
      const undone = await list(day);
      // 여러 개: Shift+클릭 A · B → ⌘C → 16시 칸 → ⌘V → 16:00 · 17:00 (간격 그대로)
      await shiftClick(await blockAt("복사 A")); await shiftClick(await blockAt("복사 B"));
      const sel = await p.evaluate(() => document.querySelectorAll("#dp-grid .block.sel").length);
      await p.keyboard.press("Control+C"); await sleep(200);
      await p.mouse.move(...await hourAt(16)); await p.keyboard.press("Control+V"); await sleep(2000);
      const multi = await list(day);
      ok(one.includes("14:00 60 복사 A high") && undone.length === 2 && sel === 2 && multi.includes("16:00 60 복사 A high") && multi.includes("17:00 30 복사 B") && multi.length === 4 && !errs.length,
        `${tv} · 계획 복사 · 붙여넣기 — 14시에 ${one.includes("14:00 60 복사 A high")} · ⌘Z ${undone.length === 2} · Shift+클릭 ${sel}개 → 16:00 · 17:00 ${multi.includes("17:00 30 복사 B")}${errs.length ? " — " + errs[0] : ""}`);
      // 다른 앱에서 복사한 "07:00–07:30 이름" 줄은 계획으로 · 그냥 글은 그대로 무시 (마우스가 시간표 밖이면 줄에 적힌 시각에)
      await p.mouse.move(5, 5);
      const pasteText = (t) => p.evaluate((t) => { const dt = new DataTransfer(); dt.setData("text/plain", t); document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, t);
      await pasteText("07:00–07:30 아침 운동"); await sleep(1500);
      await pasteText("그냥 글이에요"); await sleep(800);
      const txt = await list(day);
      ok(txt.includes("07:00 30 아침 운동") && txt.length === 5, `${tv} · 다른 앱의 계획 줄 붙여넣기 ${txt.includes("07:00 30 아침 운동")} · 그냥 글은 무시 ${txt.length === 5}`);
      // 홈 시계: 조각에 마우스 → ⌘C → 링 20시 자리에 마우스 → ⌘V → 오늘 20:00
      const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
      await ctx.request.post(BASE + "/api/plans", { headers: H, data: { scope: "day", period: "D:" + today, text: "홈 복사", start: "06:00", mins: 30 } });
      await p.evaluate(() => { localStorage.setItem("trio-home-page", "3"); localStorage.removeItem("trio-home-day"); });
      await go("#/", 2500);
      const seg = await p.evaluate(() => { const b = [...document.querySelectorAll(".pg-slide:not(.out) svg .ch-block")].find((x) => /홈 복사/.test(x.querySelector("title")?.textContent || "")); const r = b?.getBoundingClientRect(); return r ? [r.left + r.width / 2, r.top + r.height / 2] : [0, 0]; });
      await p.mouse.move(...seg); await sleep(150); await p.keyboard.press("Control+C"); await sleep(200);
      const ring = await p.evaluate(() => { const svg = document.querySelector(".pg-slide:not(.out) svg[data-dial]"); const [cx, cy, ri, ro] = svg.dataset.dial.split(" ").map(Number), r = (ri + ro) / 2, a = (1200 / 1440) * 2 * Math.PI - Math.PI / 2; const q = new DOMPoint(cx + r * Math.cos(a), cy + r * Math.sin(a)).matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; });
      await p.mouse.move(...ring); await sleep(150); await p.keyboard.press("Control+V"); await sleep(1800);
      const home = await list(today);
      ok(home.includes("20:00 30 홈 복사"), `${tv} · 홈 시계 — 조각 복사 → 링 20시에 붙여넣기 ${home.includes("20:00 30 홈 복사")}`);
      await p.evaluate(() => localStorage.removeItem("trio-home-page"));
    }

    // ---------- ⑱ 둘이 같이 보는 일기 — 일기 모임(user · friend)만, 모임 밖(outsider)은 서버가 막아요 (2026-10-16) ----------
    {
      errs = [];
      // 일기 모임은 이 검사 동안만 (켜 둔 채 다음 차례로 가면 독 아이콘이 하나 늘어 폰의 ⑧ Dock 순서 검사가 '대화'를 못 잡아요)
      const circle = (v) => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `UPDATE users SET diary_circle = ${v} WHERE username IN ('${user}', '${friend}')`], { stdio: "ignore" });
      circle(1);
      // 이 차례 앞에서 서비스 워커가 받아 둔 /api/me(모임 전)를 비우고 열어요 — 운영에선 배포 때 VERSION 이 바뀌어 API 캐시가 저절로 비워져요
      await p.evaluate(() => new Promise((res) => { const sw = navigator.serviceWorker?.controller; if (!sw) return res(); const ch = new MessageChannel(); ch.port1.onmessage = () => res(); sw.postMessage({ type: "clear-api" }, [ch.port2]); setTimeout(res, 1500); }));
      const day = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
      await go("#/diary", 2500);
      const pg = await p.evaluate(() => ({ dock: !!document.querySelector('[data-nav="diary"]'), tabs: document.querySelectorAll(".dr-tabs [data-who]").length, share: document.querySelector("[data-share]")?.getAttribute("aria-pressed"), grass: document.querySelectorAll(".dr-grass .g").length, over: document.documentElement.scrollWidth > innerWidth + 1 }));
      ok(pg.dock && pg.tabs === 2 && (tv === "컴퓨터" ? pg.share === "true" : pg.share != null) && pg.grass >= 365 && !pg.over && !errs.length, `${tv} · 일기 페이지 — 독 아이콘 ${pg.dock} · 탭 ${pg.tabs} · 새 일기 공개 ${pg.share} · 잔디 ${pg.grass}칸 · 가로 넘침 ${pg.over}${errs.length ? " — " + errs[0] : ""}`);
      if (tv === "컴퓨터") {
        const fc = await browser.newContext(), oc = await browser.newContext();
        const fid = (await (await fc.request.post(BASE + "/api/auth/login", { headers: H, data: { username: friend } })).json()).user.id;
        await oc.request.post(BASE + "/api/auth/login", { headers: H, data: { username: outsider } });
        const myId = (await (await ctx.request.get(BASE + "/api/me", { headers: H })).json()).user.id;
        const of = async (c, who, d) => { const r = await c.request.get(BASE + `/api/diary/of?user=${who}&day=${d}`, { headers: H }); return r.ok() ? (await r.json()).diary : r.status(); };
        // 새 일기는 기본 공개 → 친구가 읽어요. 비공개로 바꾸면 날짜 · 비공개 표시만 (기분 · 글은 안 와요)
        await p.click(".diary-doc .nb-text"); await p.keyboard.type("모임 일기 검사"); await sleep(1800);
        const seen1 = await of(fc, myId, day);
        await p.click("[data-share]"); await sleep(1500);
        const seen2 = await of(fc, myId, day);
        // 지난 일기(공개 여부 없이 저장)는 비공개
        const past = new Date(Date.parse(day) - 2 * 864e5).toISOString().slice(0, 10);
        await ctx.request.put(BASE + "/api/diary", { headers: H, data: { day: past, body: "지난 일기", mood: 2 } });
        const seen3 = await of(fc, myId, past);
        ok(seen1?.body === "모임 일기 검사" && seen2?.private === true && seen2.body === undefined && seen2.mood === undefined && seen3?.private === true && seen3.body === undefined,
          `${tv} · 일기 공개 · 비공개 — 새 일기 친구가 읽음 ${seen1?.body === "모임 일기 검사"} · 비공개면 자물쇠만 ${seen2?.private === true && seen2.body === undefined} · 지난 일기 비공개 ${seen3?.private === true}`);
        // 친구 탭: 공개 일기는 글, 비공개로 바꾸면 자물쇠 (새로 고침해도 예전 글이 남지 않아요)
        await fc.request.put(BASE + "/api/diary", { headers: H, data: { day, body: "친구의 공개 일기", mood: 4, shared: true } });
        await go(`#/diary/u/${fid}/${day}`, 2500);
        const r1 = await p.evaluate(() => document.querySelector(".dr-body")?.textContent || "");
        await fc.request.put(BASE + "/api/diary", { headers: H, data: { day, body: "친구의 공개 일기", mood: 4, shared: false } });
        await p.reload(); await sleep(2500);
        const r2 = await p.evaluate(() => ({ lock: !!document.querySelector(".dr-lock"), body: !!document.querySelector(".dr-body") }));
        // 모임 밖: 모임 · 남의 일기 403, 독 아이콘 없고 #/diary 는 예전처럼 캘린더로
        const s1 = (await oc.request.get(BASE + "/api/diary/circle", { headers: H })).status(), s2 = await of(oc, myId, day), s3 = await of(ctx, (await (await oc.request.get(BASE + "/api/me", { headers: H })).json()).user.id, day);
        const op = await oc.newPage(); await op.goto(BASE + "/#/diary"); await sleep(2500);
        const ov = await op.evaluate(() => ({ dock: !!document.querySelector('[data-nav="diary"]'), hash: location.hash }));
        ok(r1 === "친구의 공개 일기" && r2.lock && !r2.body && s1 === 403 && s2 === 403 && s3 === 403 && !ov.dock && ov.hash.startsWith("#/calendar/") && !errs.length,
          `${tv} · 친구 탭 읽기 ${r1 === "친구의 공개 일기"} · 비공개 후 자물쇠 ${r2.lock && !r2.body} · 모임 밖 403 ${[s1, s2, s3].join("/")} · 아이콘 없음 ${!ov.dock} (${ov.hash})${errs.length ? " — " + errs[0] : ""}`);
        await fc.close(); await oc.close();
      }
      circle(0);
    }

    await ctx.close();
  }
} finally {
  await browser.close();
  try { cleanup(); } catch {}
}
console.log(fails ? `\n실패 ${fails}개` : "\n모두 통과");
process.exitCode = fails ? 1 : 0;

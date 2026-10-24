// ㉔ 할 일 보드 화면 검사 (2026-10-24) — e2e.mjs 가 컴퓨터 · 폰 크기마다 불러요. 이 파일만 따로 돌려도 돼요:
//   NODE_PATH=… BASE=http://127.0.0.1:8812 node scripts/e2e-board.mjs     (임시 계정 t_ebd… 을 만들었다가 지워요 · SHOTS=폴더 면 밝은/어두운 화면도 찍어요)
//   1) 체크리스트 [보드 | 목록] — 보드로 바꾸면 칸 셋(할 일 · 진행 중 · 완료) · 새로 열어도 보드(사람마다 기억)
//   2) '새 할 일' → 할 일 칸에 적기 → 서버(오늘 · 칸 없음)
//   3) 끌어서 진행 중 → 완료 (끄는 동안 기울어진 카드 + 빈 자리) → 서버 status · done 1 · ⌘Z 로 진행 중 · ⌘⇧Z 다시 완료
//   4) 자세히 시트: 작은 할 일 셋 · 둘 체크 → 카드 '2/3' · 서버 · 우선순위 1 긴급 · 프로젝트
//   5) 필터: 우선순위 · 찾기 · 오늘 · 숫자 칩 · 필터 지우기
//   6) 홈 CheckList 쪽 오늘 막대 = 서버의 오늘 끝낸 수 / 전체
//   7) 폰: 칸 하나씩 옆으로 + 아래 칸 고르기 · 가로 넘침 없음 · 목록 보기 체크 → 줄 긋고 맨 아래로
import { execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function boardE2E({ p, ctx, go, ok, tv, w, BASE, H, getErrs, shots = null }) {
  let step = "준비";
  const phone = w <= 760, MODK = w > 600 ? "Meta" : "Control", made = [];
  const get = async (path) => { const r = await ctx.request.get(BASE + "/api" + path, { headers: H }); return r.ok() ? r.json() : null; };
  const boardItems = async () => (await get("/plans/board?since=2020-01-01&done_since=0"))?.plans || [];
  const byText = async (t) => (await boardItems()).find((x) => x.text === t) || null;
  const waitFor = async (fn, ms = 6000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(200); } return v; };
  const shot = async (name) => { if (!shots) return; await p.screenshot({ path: `${shots}/board-${name}-${w}.png`, fullPage: false }).catch(() => {}); };
  const cardSel = (t) => `.tb-card:has(.tb-text:text-is("${t}"))`;
  const colOfCard = (t) => p.evaluate((t) => [...document.querySelectorAll(".tb-card")].find((c) => c.querySelector(".tb-text")?.textContent === t)?.closest(".tb-col")?.dataset.col || null, t);
  const tag = Date.now().toString(36).slice(-4), T = `보드 카드 ${tv} ${tag}`, T2 = `다른 카드 ${tv} ${tag}`;
  const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });

  // 카드를 칸 col 로 끌기: 마우스는 그대로, 폰은 길게 누른 뒤(터치) — 칸이 화면 밖이면 오른쪽 끝에 대고 넘어가길 기다려요
  async function dragTo(text, col) {
    const box = await p.locator(cardSel(text)).boundingBox();
    const sx = box.x + box.width / 2, sy = box.y + Math.min(24, box.height / 2);
    const target = async () => p.evaluate((col) => { const c = document.querySelector(`.tb-col[data-col="${col}"] .tb-body`); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20, l: r.left, vis: r.left >= 0 && r.right <= innerWidth + 1 }; }, col);
    let tilt = false, ph = false;
    const midCheck = async () => { const s = await p.evaluate(() => ({ t: document.querySelector(".tb-ghost")?.style.transform || "", ph: !!document.querySelector(".tb-card.is-ph") })); tilt = tilt || /rotate\(2\.5deg\)/.test(s.t); ph = ph || s.ph; };
    if (!phone) {
      const tg = await target();
      await p.mouse.move(sx, sy); await p.mouse.down();
      await p.mouse.move(sx + 12, sy + 4, { steps: 3 });
      await p.mouse.move(tg.x, tg.y, { steps: 14 }); await sleep(120); await midCheck();
      await p.mouse.move(tg.x, tg.y + 2); await sleep(80);
      await p.mouse.up();
    } else {
      const ev = (type, x, y) => p.evaluate(([type, x, y]) => { const el = type === "pointerdown" ? document.elementFromPoint(x, y) : document; el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 })); }, [type, x, y]);
      await ev("pointerdown", sx, sy); await sleep(420); // 길게 누르기
      await ev("pointermove", sx + 3, sy + 2); await midCheck();
      let tg = await target();
      for (let i = 0; i < 40 && !tg.vis; i++) { await ev("pointermove", w - 18, sy + 2); await sleep(120); tg = await target(); if (tg.l < w * 0.4) break; }
      tg = await target();
      for (let i = 1; i <= 6; i++) await ev("pointermove", w - 18 + ((tg.x - (w - 18)) * i) / 6, sy + ((tg.y - sy) * i) / 6);
      await sleep(150); tg = await target(); await ev("pointermove", tg.x, tg.y); await sleep(80);
      await ev("pointerup", tg.x, tg.y);
    }
    await sleep(500);
    return { tilt, ph };
  }

  try {
    // 1) 보드 | 목록
    step = "1 보드로 바꾸기";
    await go("#/checklist", 2200);
    const hasSeg = await p.locator(".ck-mode [data-mode=board]").count();
    await p.click(".ck-mode [data-mode=board]"); await p.waitForSelector(".tb-col", { timeout: 6000 });
    const cols = await p.$$eval(".tb-col", (els) => els.map((e) => e.querySelector(".tb-col-name").textContent).join("|"));
    const remembered = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("trio.ck.mode.")).map((k) => localStorage.getItem(k)).join());
    await go("#/checklist", 2200);
    const stillBoard = await p.locator(".tb-board .tb-col").count();
    ok(hasSeg === 1 && cols === "할 일|진행 중|완료" && remembered === "board" && stillBoard === 3, `${tv} · 보드 — [보드 | 목록] · 칸 ${cols} · 기억 ${remembered} · 새로 열어도 보드 ${stillBoard === 3}`);

    // 2) 새 할 일 → 할 일 칸
    step = "2 새 할 일";
    await p.click("#tb-new");
    await p.waitForSelector("[data-addform=todo] input", { timeout: 4000 });
    await p.fill("[data-addform=todo] input", T); await p.keyboard.press("Enter");
    await p.waitForSelector(cardSel(T), { timeout: 5000 });
    await p.fill("[data-addform=todo] input", T2); await p.keyboard.press("Enter");
    await p.waitForSelector(cardSel(T2), { timeout: 5000 });
    await p.keyboard.press("Escape");
    const s1 = await waitFor(() => byText(T)); let s2 = await byText(T2);
    if (s1) made.push(s1.id); if (s2) made.push(s2.id);
    ok(s1 && s1.period === "D:" + today && s1.status === null && s1.done === 0 && (await colOfCard(T)) === "todo", `${tv} · 보드 — 할 일 칸에 더하기 (서버 ${s1?.period} · 칸 ${s1?.status})`);

    // 3) 끌기: 진행 중 → 완료 · ⌘Z / ⌘⇧Z
    step = "3 끌어서 진행 중";
    const d1 = await dragTo(T, "doing");
    const a1 = await waitFor(async () => { const x = await byText(T); return x?.status === "doing" ? x : null; });
    ok(a1 && a1.done === 0 && (await colOfCard(T)) === "doing" && d1.tilt && d1.ph, `${tv} · 보드 — 끌어서 진행 중 (서버 ${a1?.status} · 기울기 ${d1.tilt} · 빈 자리 ${d1.ph})`);
    if (phone) await p.click('#tb-tabs [data-tab="todo"]').catch(() => {});
    await sleep(500);
    step = "3 끌어서 완료";
    if (phone) { await p.click('#tb-tabs [data-tab="doing"]'); await sleep(700); }
    await dragTo(T, "done");
    const a2 = await waitFor(async () => { const x = await byText(T); return x?.done === 1 ? x : null; });
    const strike = await p.evaluate((t) => { const c = [...document.querySelectorAll(".tb-card")].find((c) => c.querySelector(".tb-text")?.textContent === t); return !!c && c.classList.contains("done") && getComputedStyle(c.querySelector(".tb-text")).textDecorationLine.includes("line-through"); }, T);
    ok(a2 && a2.status === "done" && a2.done_at > 0 && strike, `${tv} · 보드 — 끌어서 완료 = 끝냄 (서버 done ${a2?.done} · 칸 ${a2?.status} · 줄 긋기 ${strike})`);
    await shot("dragged");
    step = "3 되돌리기";
    await p.evaluate(() => document.activeElement?.blur());
    await p.keyboard.press(MODK + "+z");
    const u1 = await waitFor(async () => { const x = await byText(T); return x?.status === "doing" ? x : null; });
    await sleep(500); // 되돌리기가 끝나야 다시 하기 기록에 들어가요
    await p.keyboard.press(MODK + "+Shift+z");
    const r1 = await waitFor(async () => { const x = await byText(T); return x?.done === 1 ? x : null; });
    ok(u1 && u1.done === 0 && r1 && r1.status === "done", `${tv} · 보드 — ⌘Z 로 진행 중 (done ${u1?.done}) · ⌘⇧Z 다시 완료 (done ${r1?.done})`);

    // 키보드로 옮기기: 카드에 초점 → ← = 왼쪽 칸
    step = "3 키보드";
    if (phone) { await p.click('#tb-tabs [data-tab="done"]'); await sleep(600); }
    await p.focus(cardSel(T)); await p.keyboard.press("ArrowLeft");
    const k1 = await waitFor(async () => { const x = await byText(T); return x?.status === "doing" ? x : null; });
    ok(k1 && k1.done === 0, `${tv} · 보드 — 키보드 ← 로 완료 → 진행 중 (서버 ${k1?.status})`);

    // 4) 자세히: 작은 할 일 · 우선순위 · 프로젝트
    step = "4 자세히";
    if (phone) { await p.click('#tb-tabs [data-tab="doing"]'); await sleep(600); }
    await p.click(`${cardSel(T)} .tb-text`);
    await p.waitForSelector(".tb-sheet .tb-panel", { timeout: 4000 });
    for (const s of ["자료 찾기", "읽기", "정리"]) { await p.fill(".tb-subadd input", s); await p.keyboard.press("Enter"); await sleep(450); }
    await p.click(".tb-subs [data-sub='0']"); await sleep(400);
    await p.click(".tb-subs [data-sub='1']"); await sleep(400);
    await p.click(".tb-prios [data-prio=max]"); await sleep(400);
    await p.fill(".tb-sheet [data-f=project]", "논문"); await p.press(".tb-sheet [data-f=project]", "Tab"); await sleep(500);
    await shot("sheet");
    await p.keyboard.press("Escape"); await sleep(400);
    const sv = await waitFor(async () => { const x = await byText(T); return x?.subtasks?.length === 3 && x.project === "논문" && x.priority === "max" ? x : null; });
    const prog = await p.evaluate((t) => { const c = [...document.querySelectorAll(".tb-card")].find((c) => c.querySelector(".tb-text")?.textContent === t); return { n: c?.querySelector(".tb-subn")?.textContent, f: c?.querySelector(".tb-flag")?.textContent?.trim(), proj: c?.querySelector(".tb-proj")?.textContent }; }, T);
    ok(sv && sv.subtasks.filter((s) => s.d).length === 2 && prog.n === "2/3" && prog.f === "긴급" && prog.proj === "논문" && !(await p.locator(".tb-sheet").count()), `${tv} · 보드 — 작은 할 일 ${prog.n} · 깃발 ${prog.f} · 프로젝트 ${prog.proj} · 서버 ${sv?.subtasks?.filter((s) => s.d).length}/${sv?.subtasks?.length}`);
    step = "4 작은 할 일 되돌리기";
    await p.keyboard.press(MODK + "+z"); // 프로젝트 되돌리기
    const up = await waitFor(async () => { const x = await byText(T); return x && !x.project ? x : null; });
    await sleep(500);
    await p.keyboard.press(MODK + "+Shift+z");
    const rp = await waitFor(async () => { const x = await byText(T); return x?.project === "논문" ? x : null; });
    ok(!!up && !!rp, `${tv} · 보드 — 고치기도 ⌘Z / ⌘⇧Z (프로젝트 지움 ${!!up} · 다시 ${!!rp})`);

    // 5) 필터
    step = "5 필터";
    const visible = () => p.$$eval(".tb-card .tb-text", (els) => els.map((e) => e.textContent));
    await p.click("#tb-fprio"); await p.waitForSelector(".cm-drop", { timeout: 3000 }); await p.click(".cm-drop [data-v=max]"); await sleep(300);
    const fPrio = await visible();
    await p.click("#tb-clear"); await sleep(200);
    await p.fill("#tb-q", "다른 카드"); await sleep(400);
    const fQ = await visible();
    await p.click("#tb-clear"); await sleep(200);
    await p.click("#tb-fproj"); await p.waitForSelector(".cm-drop", { timeout: 3000 }); await p.click('.cm-drop [data-v="논문"]'); await sleep(300);
    const fProj = await visible();
    await p.click("#tb-clear"); await sleep(200);
    await p.click("[data-range=today]"); await sleep(300);
    const fToday = await visible();
    await p.click("[data-range=all]"); await sleep(200);
    const kpiOpen = await p.$eval("[data-kpi=open] b", (e) => +e.textContent);
    ok(fPrio.includes(T) && !fPrio.includes(T2) && fQ.length === 1 && fQ[0] === T2 && fProj.join() === T && fToday.includes(T) && fToday.includes(T2) && kpiOpen >= 2,
      `${tv} · 보드 — 필터 (긴급 ${fPrio.length} · 찾기 ${fQ.join()} · 프로젝트 ${fProj.length} · 오늘 ${fToday.length} · 열린 일 ${kpiOpen})`);

    // 칸: 더하기 → 이름 · 지우기 → ⌘Z 되살리기 · 카드 지우기(Delete) → ⌘Z
    step = "5 칸 · 지우기";
    const colsNow = async () => ((await get("/plans/board/cols"))?.cols || []).map((c) => c.name).join("|");
    await p.click("[data-addcol]"); await p.waitForSelector(".tb-col-in", { timeout: 4000 });
    await p.fill(".tb-col-in", "검토"); await p.keyboard.press("Enter");
    const c1 = await waitFor(async () => { const v = await colsNow(); return v.includes("검토") ? v : null; });
    const cid = await p.evaluate(() => [...document.querySelectorAll(".tb-col")].find((c) => c.querySelector(".tb-col-name")?.textContent === "검토")?.dataset.col);
    await p.evaluate((cid) => document.querySelector(`[data-colmenu="${cid}"]`)?.click(), cid);
    await p.waitForSelector(".cm [data-k=del]", { timeout: 3000 }); await p.click(".cm [data-k=del]");
    const c2 = await waitFor(async () => { const v = await colsNow(); return v && !v.includes("검토") ? v : null; });
    await sleep(400); await p.evaluate(() => document.activeElement?.blur());
    await p.keyboard.press(MODK + "+z");
    const c3 = await waitFor(async () => { const v = await colsNow(); return v.includes("검토") ? v : null; });
    ok(c1 === "할 일|진행 중|검토|완료" && c2 === "할 일|진행 중|완료" && c3 === c1 && (await p.locator(".tb-col").count()) === 4, `${tv} · 보드 — 칸 더하기 '${c1}' · 지우기 '${c2}' · ⌘Z '${c3}'`);
    await p.evaluate((cid) => document.querySelector(`[data-colmenu="${cid}"]`)?.click(), cid);
    await p.waitForSelector(".cm [data-k=del]", { timeout: 3000 }); await p.click(".cm [data-k=del]"); await waitFor(async () => !(await colsNow()).includes("검토"));
    await sleep(300);
    if (phone) { await p.click('#tb-tabs [data-tab="todo"]'); await sleep(600); }
    await p.focus(cardSel(T2)); await p.keyboard.press("Delete");
    const gone = await waitFor(async () => !(await byText(T2)));
    await sleep(500); await p.evaluate(() => document.activeElement?.blur());
    await p.keyboard.press(MODK + "+z");
    const back = await waitFor(() => byText(T2));
    if (back) made.push(back.id);
    ok(gone && back && back.status === null && (await p.locator(cardSel(T2)).count()) === 1, `${tv} · 보드 — 카드 지우기(Delete) → ⌘Z 로 되살리기 (서버 ${!!back})`);
    s2 = back || s2;

    // 7) 폰 모양
    if (phone) {
      step = "7 폰";
      const lay = await p.evaluate(() => { const b = document.querySelector(".tb-board"), c = document.querySelector(".tb-col"), t = document.querySelector(".tb-tabs"); return { bw: b.clientWidth, cw: c.getBoundingClientRect().width, snap: getComputedStyle(b).scrollSnapType, tabs: t && getComputedStyle(t).display !== "none" && getComputedStyle(t).position, over: document.documentElement.scrollWidth - innerWidth }; });
      await p.click('#tb-tabs [data-tab="done"]'); await sleep(700);
      const atDone = await p.evaluate(() => { const c = document.querySelector('.tb-col[data-col="done"]').getBoundingClientRect(); return c.left >= -2 && c.left < 40; });
      ok(lay.cw > lay.bw * 0.85 && lay.cw < lay.bw && /x/.test(lay.snap) && lay.tabs === "sticky" && lay.over <= 0 && atDone, `${tv} · 보드 — 폰: 칸 하나씩 (${Math.round(lay.cw)}/${lay.bw}px · ${lay.snap}) · 아래 칸 고르기 ${lay.tabs} · 완료 탭 → 완료 칸 ${atDone} · 가로 넘침 ${lay.over}`);
      await p.click('#tb-tabs [data-tab="todo"]'); await sleep(500);
    }
    if (shots) {
      const theme = (t) => p.evaluate((t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }, t);
      await theme("light"); await sleep(300); await shot("light");
      await theme("dark"); await sleep(300); await shot("dark");
      await theme(null);
    }

    // 6) 홈 CheckList 쪽 오늘 막대
    step = "6 홈";
    const own = (await get(`/plans?periods=D:${today}`))?.plans?.filter((x) => !x.start) || [];
    const want = `${own.filter((x) => x.done).length}/${own.length}`;
    await go("#/", 2500);
    await p.evaluate(() => document.querySelector('.pg-tab[data-page="5"]')?.click()); await sleep(900); // CheckList 쪽 (컴퓨터는 위에 겹친 칸이 있어서 직접 눌러요)
    const hw = await p.evaluate(() => document.querySelector(".hw-bar.today")?.closest(".hw")?.querySelector(".hw-n")?.textContent || "");
    ok(own.some((x) => x.text === T && x.done === 0) && hw === want, `${tv} · 보드 — 홈 CheckList 오늘 막대 ${hw} = 서버 ${want}`);
    // 완료로 옮긴 뒤 홈 숫자가 하나 늘어요
    await ctx.request.patch(BASE + "/api/plans/" + s1.id, { headers: H, data: { status: "done" } });
    const want2 = `${own.filter((x) => x.done).length + 1}/${own.length}`;
    await go("#/", 2500);
    await p.evaluate(() => document.querySelector('.pg-tab[data-page="5"]')?.click()); await sleep(900); // CheckList 쪽 (컴퓨터는 위에 겹친 칸이 있어서 직접 눌러요)
    const hw2 = await p.evaluate(() => document.querySelector(".hw-bar.today")?.closest(".hw")?.querySelector(".hw-n")?.textContent || "");
    ok(hw2 === want2, `${tv} · 보드 — '완료' 칸 → 홈 CheckList 오늘 ${hw2} (기대 ${want2})`);

    // 목록 보기: 체크하면 줄 긋고 맨 아래로
    step = "7 목록 체크";
    await go("#/checklist", 2200);
    await p.click(".ck-mode [data-mode=list]"); await p.waitForSelector("#ck-list .gl-item", { timeout: 5000 });
    await p.click(`#ck-list .gl-item:has(.gl-text:text-is("${T2}")) [data-toggle]`); await sleep(700);
    const lastDone = await p.evaluate((t) => { const li = [...document.querySelectorAll("#ck-list .gl-item")]; const me = li.find((x) => x.querySelector(".gl-text")?.textContent === t); return !!me && me.classList.contains("done") && li.filter((x) => !x.classList.contains("done")).every((x) => li.indexOf(x) < li.indexOf(me)); }, T2);
    const s2b = await byText(T2);
    ok(lastDone && s2b?.done === 1 && s2b.status === "done", `${tv} · 목록 — 체크하면 줄 긋고 아래로 · 보드도 완료 칸 (서버 ${s2b?.status})`);
    await p.click(".ck-mode [data-mode=board]"); await p.waitForSelector(".tb-col", { timeout: 5000 });
    ok((await colOfCard(T2)) === "done", `${tv} · 보드 — 목록에서 체크한 일은 완료 칸`);
    await p.click(".ck-mode [data-mode=list]"); await sleep(300); // 다음 검사를 위해 원래 보기(목록)로

    const errs = getErrs().filter((e) => !/Failed to load resource|favicon/.test(e));
    ok(!errs.length, `${tv} · 보드 — 화면 오류 없음${errs.length ? " · " + errs.slice(0, 2).join(" / ") : ""}`);
  } catch (e) { ok(false, `${tv} · 보드 (${step}) — ${String(e.message).split("\n")[0]}`); }
  finally { for (const id of made) await ctx.request.delete(BASE + "/api/plans/" + id, { headers: H }).catch(() => {}); }
}

// 따로 돌리기
if (process.argv[1]?.endsWith("e2e-board.mjs")) {
  const { createRequire } = await import("node:module");
  const { chromium } = createRequire(import.meta.url)("playwright");
  const BASE = process.env.BASE || "http://127.0.0.1:8787", H = { "x-trio": "1", "content-type": "application/json" };
  let fails = 0;
  const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
  const user = "t_ebd" + Date.now().toString(36).slice(-6);
  execFileSync("node", ["scripts/add-user.mjs", user, "보드검사", "password1", "--features=all"], { stdio: "ignore" });
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
      await boardE2E({ p, ctx, go, ok, tv, w, BASE, H, getErrs: () => errs, shots: process.env.SHOTS || null });
      await ctx.close();
    }
  } finally {
    await browser.close();
    execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM users WHERE username = '${user}'`], { stdio: "ignore" });
  }
  console.log(fails ? `\n${fails} FAIL` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
}

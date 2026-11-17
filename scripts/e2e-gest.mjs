// e2e: 눈에 보이는 손짓 (2026-11, row-more.js · shortcuts.js) — e2e.mjs 의 sec("gest") 가 불러요.
//   ⋯ 버튼이 있고, 누르면 우클릭과 같은 메뉴가 그 버튼 밑에 떠요 — 노트 목록 · Brain 목록 · Brain 그래프 고른 노드 · 하루 계획표 블록 · 체크리스트 줄 · 보드 카드
//   컴퓨터는 칸에 올려야 보이고(그 전엔 투명) · 폰(좁은 화면)은 올리지 않아도 보여요
//   ⋯ 를 다시 누르면 닫히고 · Esc 면 초점이 ⋯ 로 돌아와요
//   ? → 단축키 창(<dialog>) · Tab 은 창 안에서만 · Esc 로 닫으면 초점이 연 자리로 · 프로필 메뉴 '단축키' 도 같은 창
//   Brain 사용법 첫 장에서 '노드를 우클릭' 설명이 빠지고 ⋯ 로 바뀌었어요
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function gestE2E({ p, ctx, go, ok, tv, w, BASE, H, getErrs }) {
  const phone = w <= 720, tag = Date.now().toString(36).slice(-4);
  const kst = new Date(Date.now() + 9 * 3600e3), day = kst.toISOString().slice(0, 10);
  const post = async (path, data) => (await (await ctx.request.post(BASE + "/api" + path, { headers: H, data })).json());
  const fresh = () => p.evaluate(async () => { for (const n of await caches.keys()) if (n.startsWith("dsm-api-")) await caches.delete(n); }).catch(() => {});
  const labels = () => p.evaluate(() => [...document.querySelectorAll(".cm [data-k]")].map((b) => b.textContent.trim()).join("|"));
  // ⋯ 하나 검사: 보이기(컴퓨터: 올리기 전 0 → 올린 뒤 1 · 폰: 처음부터 1) → 누르기 → 메뉴(want 가 들어 있어야) · 버튼 밑 · aria-expanded → 다시 누르면 닫힘 → 다시 열고 Esc → 초점 = ⋯
  async function check(name, row, want) {
    const btn = `${row} .row-more`;
    const found = await p.waitForSelector(btn, { timeout: 8000, state: "attached" }).then(() => true).catch(() => false);
    if (!found) { ok(false, `${tv} · ⋯ ${name} — 버튼이 없어요 (${btn})`); return; }
    await p.locator(btn).first().scrollIntoViewIfNeeded().catch(() => {});
    await p.mouse.move(1, 1); await sleep(250);
    const before = await p.evaluate((s) => { const b = document.querySelector(s), cs = getComputedStyle(b), r = b.getBoundingClientRect(); return { op: +cs.opacity, shown: cs.display !== "none" && cs.visibility !== "hidden" && r.width >= 18 && r.height >= 18 }; }, btn);
    if (!phone) { await p.locator(row).first().hover(); await sleep(250); }
    const after = await p.evaluate((s) => +getComputedStyle(document.querySelector(s)).opacity, btn);
    const visOk = phone ? before.shown && before.op === 1 : before.shown && before.op === 0 && after === 1;
    await p.locator(btn).first().click(); await p.waitForSelector(".cm", { timeout: 3000 }).catch(() => {});
    const got = await labels();
    const place = await p.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(), m = document.querySelector(".cm")?.getBoundingClientRect(); return m ? Math.abs(m.left - b.left) < 260 && Math.abs(m.top - b.bottom) < 420 : false; }, btn);
    const exp = await p.evaluate((s) => document.querySelector(s).getAttribute("aria-expanded"), btn);
    await p.locator(btn).first().click(); await sleep(250);
    const toggled = await p.evaluate(() => !document.querySelector(".cm"));
    await p.locator(btn).first().click(); await p.waitForSelector(".cm", { timeout: 3000 }).catch(() => {}); await sleep(150);
    await p.keyboard.press("Escape"); await sleep(200);
    const back = await p.evaluate((s) => !document.querySelector(".cm") && document.activeElement === document.querySelector(s), btn);
    ok(visOk && want.every((x) => got.split("|").some((g) => g.startsWith(x))) && place && exp === "true" && toggled && back,
      `${tv} · ⋯ ${name} — ${phone ? `올리지 않아도 보여요 ${before.shown && before.op === 1}` : `올리기 전 투명 ${before.op === 0} · 올리면 보여요 ${after === 1}`} · 메뉴 "${got}" · 버튼 밑 ${place} · aria-expanded ${exp} · 다시 누르면 닫힘 ${toggled} · Esc 뒤 초점 ⋯ ${back}`);
  }

  // 준비: 노트 하나 (부모 없음) · 하루 계획 블록 하나 · 체크리스트 할 일 하나
  const N = (await post("/notes", { title: `손짓 노트 ${tv} ${tag}`, body: "" })).note?.id; // 부모 없음 → Brain 'Unsorted' 안
  const plan = (await post("/plans", { scope: "day", period: "D:" + day, text: `손짓 블록 ${tag}`, start: "05:00", mins: 60 })).plan;
  const todo = (await post("/plans", { scope: "day", period: "D:" + day, text: `손짓 할 일 ${tag}` })).plan;
  await fresh();

  try {
    // 1) 노트 목록
    await go("#/notes", 2200);
    await check("노트 목록", `#nl li:has(a[href="#/notes/${N}"])`, ["열기", "이름 바꾸기", "지우기"]);

    // 2) Brain 'Unsorted' 층 — 목록 줄 · 그래프에서 고른 노트 점 (노트 메뉴 = 우클릭과 같은 것)
    await go("#/brain/" + encodeURIComponent("c:Unsorted"), 2600);
    if (await p.locator(".bi").count()) { await p.keyboard.press("Escape"); await sleep(300); } // 처음 오면 뜨는 사용법은 닫고
    await check("Brain 목록", `.brain-list li:has(a[data-id="${N}"])`, ["열기", "이름 바꾸기", "하위 노드 만들기", "지우기"]);
    const title = `손짓 노트 ${tv} ${tag}`;
    let at = null;
    for (let i = 0; i < 25; i++) { const b = await p.evaluate((t) => { const c = document.querySelector(".og-c"); if (!c?.__nodes) return null; const r = c.getBoundingClientRect(), n = c.__nodes().find((x) => x.title === t); return n && { x: n.x + r.left, y: n.y + r.top }; }, title); if (at && b && Math.hypot(at.x - b.x, at.y - b.y) < 0.5) break; at = b; await sleep(160); }
    if (at) await p.mouse.click(at.x, at.y);
    const hm = await p.waitForSelector(".brain-hint [data-node-more]", { timeout: 4000 }).then(() => true).catch(() => false);
    let nodeLabels = "", nodeBack = false;
    if (hm) {
      await p.click(".brain-hint [data-node-more]"); await p.waitForSelector(".cm", { timeout: 3000 }).catch(() => {});
      nodeLabels = await labels(); await sleep(150);
      await p.keyboard.press("Escape"); await sleep(200);
      nodeBack = await p.evaluate(() => !document.querySelector(".cm") && document.activeElement?.matches?.("[data-node-more]"));
    }
    ok(hm && nodeLabels === "열기|이름 바꾸기|편집|하위 노드 만들기|옮기기…|지우기" && nodeBack,
      `${tv} · ⋯ Brain 그래프 — 노드를 고르면 아래 줄에 '⋯ 메뉴' ${hm} · 메뉴 "${nodeLabels}" · Esc 뒤 초점 ${nodeBack}`);
    // 사용법 첫 장: 노드 우클릭 설명 대신 ⋯
    await p.click("[data-help]").catch(() => {}); await sleep(400);
    const tour = await p.evaluate(() => document.querySelector(".bi")?.textContent || "");
    ok(tour.includes("⋯") && !tour.includes("노드를 우클릭"), `${tv} · Brain 사용법 — 첫 장이 ⋯ 로 바뀌었어요 (노드 우클릭 설명 없음 ${!tour.includes("노드를 우클릭")})`);
    await p.keyboard.press("Escape"); await sleep(250);

    // 3) 하루 계획표 블록 · 체크리스트 줄 · 보드 카드
    await go("#/calendar/" + day, 2600);
    await check("하루 계획 블록", `#dp-grid .block[data-id="${plan.id}"]`, ["편집", "끝냄", "삭제"]);
    await go("#/checklist", 2200);
    if (await p.locator(".home-tabs [data-tab=list]").count()) { await p.click(".home-tabs [data-tab=list]"); await sleep(600); }
    await check("체크리스트 줄", `.gl-item[data-id="${todo.id}"]`, ["이름 고치기", "끝냄"]);
    if (await p.locator(".home-tabs [data-tab=board]").count()) {
      await p.click(".home-tabs [data-tab=board]"); await p.waitForSelector(".tb-card", { timeout: 6000 }).catch(() => {});
      await check("보드 카드", `.tb-card[data-id="${todo.id}"]`, ["자세히", "끝냄", "지우기"]);
      // 두 번 눌러야만 되던 칸 이름 바꾸기: 초점 + Enter 로도 (data-dblkey)
      await p.focus('.tb-col-name[data-rename="todo"]').catch(() => {});
      await p.keyboard.press("Enter"); await sleep(250);
      const renaming = await p.evaluate(() => document.activeElement?.matches?.(".tb-col-in") && document.activeElement.value === "할 일");
      await p.keyboard.press("Escape"); await sleep(250);
      const restored = await p.evaluate(() => !document.querySelector(".tb-col-in") && document.querySelector('.tb-col-name[data-rename="todo"]')?.textContent === "할 일");
      ok(renaming && restored, `${tv} · 두 번 누르기 대신 키보드 — 칸 이름에 초점 + Enter → 이름 칸 ${renaming} · Esc 로 그대로 ${restored}`);
      await p.click(".home-tabs [data-tab=list]").catch(() => {}); await sleep(300);
    }

    // 4) ? → 단축키 창 · Tab 은 창 안에서 · Esc → 연 자리로
    await go("#/notes", 2000);
    const from = `#nl a[href="#/notes/${N}"]`;
    await p.focus(from); await p.keyboard.press("Shift+Slash"); await sleep(300);
    const open1 = await p.evaluate(() => { const d = document.querySelector("dialog.ks"); return !!d?.open && d.contains(document.activeElement) && /단축키/.test(d.querySelector("h2")?.textContent || ""); });
    const rows = await p.evaluate(() => [...document.querySelectorAll("dialog.ks .ks-r dd")].map((x) => x.textContent).join(" / "));
    let trapped = true;
    for (let i = 0; i < 5; i++) { await p.keyboard.press(i % 2 ? "Shift+Tab" : "Tab"); trapped = trapped && await p.evaluate(() => document.querySelector("dialog.ks").contains(document.activeElement)); }
    await p.keyboard.press("Escape"); await sleep(250);
    const back1 = await p.evaluate((s) => !document.querySelector("dialog.ks")?.open && document.activeElement === document.querySelector(s), from);
    // 글 쓰는 중엔 ? 가 글자예요
    await p.focus("#filter").catch(() => {});
    const typed = await p.evaluate(() => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || ""));
    if (typed) { await p.keyboard.press("Shift+Slash"); await sleep(200); }
    const notInInput = typed ? await p.evaluate(() => !document.querySelector("dialog.ks")?.open) : true;
    if (typed) await p.keyboard.press("Escape");
    ok(open1 && /명령 팔레트/.test(rows) && /되돌리기/.test(rows) && /다음 · 이전 기사/.test(rows) && trapped && back1 && notInInput,
      `${tv} · ? 단축키 창 — 열림 ${open1} · ⌘K · ⌘Z · j/k 줄 ${/명령 팔레트/.test(rows) && /되돌리기/.test(rows) && /다음 · 이전 기사/.test(rows)} · Tab 은 창 안 ${trapped} · Esc 뒤 초점 제자리 ${back1} · 입력 칸에선 안 열림 ${notInInput}`);

    // 5) 프로필 메뉴 '단축키' (메뉴 하나만 더했어요)
    const me = await p.locator("#me-btn").isVisible().catch(() => false);
    if (me) {
      await p.click("#me-btn"); await sleep(250);
      await p.click("#me-menu [data-shortcuts]"); await sleep(300);
      const open2 = await p.evaluate(() => !!document.querySelector("dialog.ks")?.open && document.querySelector("#me-menu").hidden);
      await p.keyboard.press("Escape"); await sleep(250);
      const back2 = await p.evaluate(() => document.activeElement?.id === "me-btn");
      ok(open2 && back2, `${tv} · 프로필 메뉴 '단축키' — 창 열림 · 메뉴 닫힘 ${open2} · Esc 뒤 초점 프로필 버튼 ${back2}`);
    } else ok(true, `${tv} · 프로필 버튼이 이 화면에선 안 보여요 — ? 로 검사했어요`);
    const errs = getErrs?.() || [];
    ok(!errs.length, `${tv} · 손짓 — 콘솔 오류 없음 ${errs.slice(0, 2).join(" / ")}`);
  } finally {
    // 만든 것 지우기
    await ctx.request.delete(BASE + "/api/plans/" + plan?.id, { headers: H }).catch(() => {});
    await ctx.request.delete(BASE + "/api/plans/" + todo?.id, { headers: H }).catch(() => {});
    if (N) await ctx.request.delete(BASE + "/api/notes/" + N, { headers: H }).catch(() => {});
  }
}

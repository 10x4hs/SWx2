// ㉓ 관계 종류 화면 검사 (2026-10-24) — e2e.mjs 가 컴퓨터 · 폰 크기마다 불러요. 이 파일만 따로 돌려도 돼요:
//   NODE_PATH=… BASE=http://127.0.0.1:8797 node scripts/e2e-onto.mjs     (임시 계정 t_eon… 을 만들었다가 지워요 · SHOTS=폴더 면 화면도 찍어요)
//   1) 두 점 연결 → '어떤 관계예요?' 작은 창(칩 8개 · 기본 관련) → 예시 → 서버 행 · 색 · 점선 선 → ⌘Z 관계만 빠짐 → ⌘⇧Z 다시
//   2) 선 우클릭(폰은 길게) → '관계 바꾸기 ▸' → 지금 관계가 눌린 칩 → 종류 → 서버 · Esc = 새 연결은 그냥 '관련'(행 없음)
//   3) 머리줄 'AI 제안 N' → 제안함: 확정 · 거절 → 서버 · 숫자 · ⌘Z 로 거절 되돌리기
//   4) 맨 위(Unsorted) 노트 → '‘AI & Dev’에 둘까요?' 칩 → 옮기기 → 부모가 그 개념 → ⌘Z 맨 위로
import { execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d1 = (sql) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0].results;

export async function ontoE2E({ p, ctx, go, ok, tv, w, BASE, H, getErrs, shots = null }) {
  let step = "준비";
  try {
    const T = (s) => `관 ${s} ${tv}`, MODK = w > 600 ? "Meta" : "Control";
    const post = async (data) => { const r = await ctx.request.post(BASE + "/api/notes", { headers: H, data }); const j = await r.json(); return j.note?.id || j.id || null; };
    const get = async (path) => { const r = await ctx.request.get(BASE + "/api" + path, { headers: H }); return r.ok() ? r.json() : null; };
    const note = async (id) => (await get("/notes/" + id))?.note || null;
    const relOf = async (a, b) => (await get("/graph"))?.rels?.find((x) => (x.src_id === a && x.dst_id === b) || (x.src_id === b && x.dst_id === a)) || null;
    const idOf = async (t) => (await get("/notes/resolve?title=" + encodeURIComponent(t)))?.id || null;
    const shot = async (name) => { if (shots) await p.screenshot({ path: `${shots}/onto-${name}-${w}.png` }).catch(() => {}); };
    const aiDev = (await idOf("AI & Dev")) || (await post({ title: "AI & Dev", body: "", parent_id: null }));
    const R = await post({ title: T("방"), body: "", parent_id: aiDev });
    const X = await post({ title: T("바나나"), body: "노란 열대 과일이에요.", parent_id: R });
    const Y = await post({ title: T("과일"), body: "먹을 수 있는 식물의 열매예요.", parent_id: R });
    const Z = await post({ title: T("사과"), body: "빨갛고 단단한 과일이에요.", parent_id: R });
    const nodeAt = async (title) => { let a = null; for (let i = 0; i < 25; i++) { const b = await p.evaluate((t) => { const c = document.querySelector(".og-c"); if (!c?.__nodes) return null; const r = c.getBoundingClientRect(), n = c.__nodes().find((x) => x.title === t); return n && { x: n.x + r.left, y: n.y + r.top }; }, title); if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 0.5) return b; a = b; await sleep(160); } return a; };
    const linkOf = (a, b) => p.evaluate(([a, b]) => (document.querySelector(".og-c")?.__links?.() || []).find((l) => (l.s === a && l.t === b) || (l.s === b && l.t === a)) || null, [a, b]);
    const touch = (x, y, ms = 40) => p.evaluate(async ([x, y, ms]) => { const c = document.querySelector(".og-c"); const ev = (t) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 9, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, button: 0 })); ev("pointerdown"); await new Promise((r) => setTimeout(r, ms)); ev("pointerup"); }, [x, y, ms]);
    const tap = async (at) => { if (w > 600) await p.mouse.click(at.x, at.y); else await touch(at.x, at.y); };
    const menuAt = async (x, y) => { if (w > 600) await p.mouse.click(x, y, { button: "right" }); else await touch(x, y, 650); await p.waitForSelector(".cm", { timeout: 4000 }).catch(() => {}); return p.evaluate(() => [...document.querySelectorAll(".cm [data-k]")].map((b) => b.textContent.trim()).join("|")); };
    const midOf = async (a, b) => { const l = await p.evaluate(([a, b]) => { const c = document.querySelector(".og-c"), r = c.getBoundingClientRect(), l = c.__links().find((l) => (l.s === a && l.t === b) || (l.s === b && l.t === a)); return l && { x: r.left + (l.x1 + l.x2) / 2, y: r.top + (l.y1 + l.y2) / 2 }; }, [a, b]); return l; };
    const popOpen = () => p.waitForSelector(".relpop", { timeout: 5000 }).then(() => true, () => false);

    // 1) 연결 → 작은 창 → 예시 → 서버 · 선 모양 → ⌘Z / ⌘⇧Z
    step = "1 연결 → 관계 고르기";
    await go("#/brain/" + encodeURIComponent(R), 3500);
    await tap(await nodeAt(T("바나나"))); await sleep(450);
    await tap(await nodeAt(T("과일")));
    const pop1 = await popOpen();
    const chips = await p.evaluate(() => [...document.querySelectorAll(".relpop [data-rel]")].map((b) => b.textContent.replace(/AI$/, "").trim()));
    const pressed = await p.evaluate(() => document.querySelector('.relpop [aria-pressed="true"]')?.dataset.rel);
    const head1 = await p.evaluate(() => document.querySelector(".relpop-h b")?.textContent);
    await shot("popover");
    const guessed = await p.waitForSelector(".relpop-ai:not([hidden])", { timeout: 5000 }).then(() => p.evaluate(() => document.querySelector(".relpop-ai").textContent.trim()), () => "(짐작 없음)");
    await shot("popover-guess");
    // AI 짐작이 반대 방향이라고 하면 창이 방향을 바꿔 둬요 — 바나나 → 과일 로 맞추고 고르기
    const dir = await p.evaluate(() => document.querySelector(".relpop-dir span")?.textContent || "");
    if (!dir.includes("바나나")) { await p.click(".relpop [data-swap]"); await sleep(100); }
    await p.click('.relpop [data-rel="example_of"]'); await sleep(1800);
    const r1 = await relOf(X, Y), l1 = await linkOf(X, Y);
    await shot("styled-edge");
    await p.keyboard.press(MODK + "+z"); await sleep(1800);
    const r2 = await relOf(X, Y), l2 = await linkOf(X, Y);
    await p.keyboard.press(MODK + "+Shift+z"); await sleep(1800);
    const r3 = await relOf(X, Y);
    ok(pop1 && head1 === "어떤 관계예요?" && chips.length === 8 && chips[0] === "관련" && chips.includes("예시") && pressed === "related"
      && r1?.rel === "example_of" && r1.src_id === X && l1?.rel === "example_of" && !!l1.color && l1.dash && l1.from === X && !r2 && l2 && !l2.rel && r3?.rel === "example_of" && !getErrs().length,
      `${tv} · 관계 — 연결 뒤 작은 창 ${pop1} "${head1}" · 칩 ${chips.length}개 (기본 ${pressed}) · ${guessed} · 예시 저장 ${r1?.rel} (방향 ${r1?.src_id === X}) · 선 색 ${l1?.color} 점선 ${l1?.dash} · ⌘Z 관계만 빠짐 ${!r2 && !!l2} · ⌘⇧Z 다시 ${r3?.rel}${getErrs().length ? " — " + getErrs()[0] : ""}`);

    // 2) 선 우클릭 → 관계 바꾸기 → 종류 · 새 연결에서 Esc = 관련(행 없음)
    step = "2 선 우클릭 관계 바꾸기";
    await sleep(600);
    const m1 = await midOf(X, Y);
    const em = m1 ? await menuAt(m1.x, m1.y) : "(선 없음)";
    let pressed2 = null, head2 = null;
    if (em.includes("관계 바꾸기")) {
      await p.click('.cm [data-k="rel"]'); await popOpen();
      pressed2 = await p.evaluate(() => document.querySelector('.relpop [aria-pressed="true"]')?.dataset.rel);
      head2 = await p.evaluate(() => document.querySelector(".relpop-h b")?.textContent);
      await shot("change-rel");
      await p.click('.relpop [data-rel="is_a"]'); await sleep(1800);
    } else await p.keyboard.press("Escape");
    const r4 = await relOf(X, Y);
    await tap(await nodeAt(T("바나나"))); await sleep(450);
    await tap(await nodeAt(T("사과")));
    const pop3 = await popOpen();
    await p.keyboard.press("Escape"); await sleep(1500);
    const gone3 = !(await p.$(".relpop")), r5 = await relOf(X, Z), bodyXZ = ((await note(X))?.body || "").includes(`[[${T("사과")}]]`);
    ok(/관계 바꾸기/.test(em) && /연결 끊기/.test(em) && head2 === "관계 바꾸기" && pressed2 === "example_of" && r4?.rel === "is_a" && pop3 && gone3 && !r5 && bodyXZ,
      `${tv} · 관계 바꾸기 — 선 메뉴 "${em}" · 지금 관계 눌림 ${pressed2} · 종류로 ${r4?.rel} · 새 연결 Esc: 창 닫힘 ${gone3} · 행 없음(관련) ${!r5} · [[링크]] 그대로 ${bodyXZ}`);

    // 3) AI 제안함: 머리줄 숫자 → 확정 · 거절 → ⌘Z
    step = "3 AI 제안함";
    const me = (await get("/me")).user.id, s1 = "es1" + Date.now().toString(36) + w, s2 = "es2" + Date.now().toString(36) + w, t0 = Date.now();
    d1(`INSERT INTO note_rel (id, user_id, src_id, dst_id, rel, status, origin, confidence, evidence, created_at, updated_at) VALUES ('${s1}', '${me}', '${Z}', '${Y}', 'example_of', 'suggested', 'ai', 0.82, '사과는 과일의 한 예', ${t0}, ${t0}), ('${s2}', '${me}', '${Z}', '${X}', 'contrasts_with', 'suggested', 'ai', 0.7, NULL, ${t0}, ${t0})`);
    await go("#/brain/" + encodeURIComponent(R), 3500);
    const badge = await p.evaluate(() => { const b = document.querySelector("[data-inbox]"); return b && !b.hidden ? b.textContent.replace(/\s+/g, " ").trim() : null; });
    await p.click("[data-inbox]");
    await p.waitForSelector(".relsheet li[data-id]", { timeout: 6000 }).catch(() => {});
    const items = await p.evaluate(() => [...document.querySelectorAll(".relsheet li[data-id]")].map((li) => li.querySelector(".rs-pair").textContent.replace(/\s+/g, " ").trim() + " | " + li.querySelector(".rs-meta").textContent.trim()));
    await shot("inbox");
    await p.click(`.relsheet li[data-id="${s1}"] [data-act="ok"]`); await sleep(1500);
    await p.click(`.relsheet li[data-id="${s2}"] [data-act="no"]`); await sleep(1800);
    const st1 = d1(`SELECT status FROM note_rel WHERE id = '${s1}'`)[0]?.status, st2 = d1(`SELECT status FROM note_rel WHERE id = '${s2}'`)[0]?.status;
    const left = await p.evaluate(() => document.querySelectorAll(".relsheet li[data-id]").length);
    const badgeAfter = await p.evaluate(() => document.querySelector("[data-inbox]")?.hidden);
    const lzy = await linkOf(Z, Y);
    await p.keyboard.press(MODK + "+z"); await sleep(1800);
    const st2u = d1(`SELECT status FROM note_rel WHERE id = '${s2}'`)[0]?.status;
    await p.keyboard.press("Escape"); await sleep(300);
    // AI 가 찾은 관계 선을 끊으면: 행은 거절로 남아요(다시 제안 안 함) → ⌘Z 로 확정 그대로
    await sleep(600);
    const mzy = await midOf(Z, Y), cm = mzy ? await menuAt(mzy.x, mzy.y) : "(선 없음)";
    if (cm.includes("연결 끊기")) await p.click('.cm [data-k="cut"]'); else await p.keyboard.press("Escape");
    await sleep(1800);
    const cut1 = d1(`SELECT status FROM note_rel WHERE id = '${s1}'`)[0]?.status, cutLine = await linkOf(Z, Y).then((l) => !l || (l.w < 1 && !l.rel)); // 제목이 비슷하면 옅은 선(w 0.5)은 남아요
    await p.keyboard.press(MODK + "+z"); await sleep(1800);
    const cut2 = d1(`SELECT status FROM note_rel WHERE id = '${s1}'`)[0]?.status;
    ok(cut1 === "rejected" && cutLine && cut2 === "confirmed", `${tv} · AI 관계 선 끊기 — 메뉴 "${cm}" · 거절로 남음 ${cut1} · 선 사라짐 ${cutLine} · ⌘Z ${cut2}`);
    d1(`DELETE FROM note_rel WHERE id IN ('${s1}', '${s2}')`); // 다음 크기(폰) 검사가 같은 계정을 써요
    ok(badge === "AI 제안 2" && items.length === 2 && /사과.*—예시→.*과일/.test(items[0]) && /확신 82% · 사과는 과일의 한 예/.test(items[0]) && st1 === "confirmed" && st2 === "rejected" && left === 0 && badgeAfter === true && lzy?.rel === "example_of" && st2u === "suggested" && !getErrs().length,
      `${tv} · AI 제안함 — 머리줄 "${badge}" · 목록 ${items.length} "${items[0]}" · 확정 ${st1} · 거절 ${st2} · 숫자 숨김 ${badgeAfter} · 확정 선 ${lzy?.rel} · ⌘Z 거절 되돌림 ${st2u}${getErrs().length ? " — " + getErrs()[0] : ""}`);

    // 4) 맨 위 노트 → 자리 칩 → 옮기기 → ⌘Z
    step = "4 새 노트 자리 칩";
    const N = await post({ title: T("프롬프트 엔지니어링"), body: "LLM 에게 프롬프트를 주는 방법이에요. 머신러닝 · 딥러닝 모델과 인공지능 API 를 프로그래밍으로 부르고, 시스템 프롬프트 · few-shot 예시 · 체인 오브 소트 같은 기법을 써요. 소프트웨어 개발에서 AI 코딩 도구를 쓸 때도 중요해요.", parent_id: null });
    const sug = await get(`/notes/${N}/sort`);
    await go("#/notes/" + N, 3000);
    const chip = await p.waitForSelector(".sort-chip", { timeout: 8000 }).then(async () => (await p.locator(".sort-chip").innerText()).replace(/\s+/g, " ").trim(), () => null);
    await shot("sort-chip");
    let moved = null, back = null;
    if (chip) {
      await p.click("[data-sort-yes]"); await sleep(2000);
      moved = (await note(N))?.parent_id;
      await p.keyboard.press(MODK + "+z"); await sleep(2000);
      back = (await note(N))?.parent_id;
    }
    const outcome = sug?.log_id ? d1(`SELECT outcome FROM decide_log WHERE id = '${sug.log_id}'`)[0]?.outcome : null;
    ok(sug?.show === true && sug.concept === "AI & Dev" && chip && /AI & Dev/.test(chip) && moved === aiDev && back === null && outcome === "AI & Dev",
      `${tv} · 자리 칩 — 서버 ${sug?.concept} ${sug?.confidence} (보임 ${sug?.show}) · 칩 "${chip}" · 옮김 ${moved === aiDev} · ⌘Z 맨 위 ${back === null} · 사람 결과 ${outcome}`);
  } catch (e) { ok(false, `${tv} · 관계 (${step}) — ${String(e.message).split("\n")[0]}`); }
}

// 따로 돌리기
if (import.meta.url === new URL(process.argv[1], "file://").href || process.argv[1]?.endsWith("e2e-onto.mjs")) {
  const { createRequire } = await import("node:module");
  const { chromium } = createRequire(import.meta.url)("playwright");
  const BASE = process.env.BASE || "http://127.0.0.1:8787", H = { "x-trio": "1", "content-type": "application/json" };
  let fails = 0;
  const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
  const user = "t_eon" + Date.now().toString(36).slice(-6);
  execFileSync("node", ["scripts/add-user.mjs", user, "관계검사", "password1", "--features=all"], { stdio: "ignore" });
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    for (const [w, h, tv] of [[1280, 860, "컴퓨터"], [390, 844, "폰"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const login = await ctx.request.post(BASE + "/api/auth/login", { headers: H, data: { username: user } });
      ok(login.ok(), `${tv} · 임시 계정 로그인`);
      const p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
      await ctx.addInitScript(() => { try { localStorage.setItem("trio-brain-intro:" + "", "1"); } catch {} });
      const go = async (hash, wait = 1800) => { await p.goto("about:blank"); await p.goto(BASE + "/" + hash); await sleep(wait); await p.evaluate(() => document.querySelector(".bi [data-bi=skip]")?.click()); };
      await ontoE2E({ p, ctx, go, ok, tv, w, BASE, H, getErrs: () => errs, shots: process.env.SHOTS || null });
      await ctx.close();
    }
  } finally {
    await browser.close();
    execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM users WHERE username = '${user}'`], { stdio: "ignore" });
  }
  console.log(fails ? `\n${fails} FAIL` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
}

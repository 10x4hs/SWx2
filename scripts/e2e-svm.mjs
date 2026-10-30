// Silicon Valley Mafia (#/svm, 관리자만) 화면 검사 — e2e.mjs 가 부르는 구역 "svm" (컴퓨터 · 폰) · v3 "하이테크 책" (2026-10-30)
//   1) 서재: Dock 아이콘 · 책장 4권 · QUERY 질문(누르면 답 장들) · 적어서 장 찾기 → ↵ · 개념 × 장 점 · 가로 넘침 없음
//   2) 권 차례: 제2권 → 장 5개 → 첫 장 글 읽기
//   3) 글 읽기: 제목 · 논지 · 읽는 방식 셋 (원문 + 번역은 가짜 원문으로 — 바깥 사이트에 기대지 않게, 가짜 AI 면 번역 줄까지) · 다 읽었어요 → 서버 기록
//   4) 인물 지도: 캔버스 · 처음 고른 사람(틸) · 모든 인물에서 고르기 · 옛 주소(#/svm/graph/p:…) → 새 주소 · 비판 모아 보기 · [DAY] 밝게 ↔ 어둡게
//   5) 회원: Dock 에 없고 #/svm 은 홈, API 는 404
import { execFileSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIXTURE = (id) => ({ id, part: 0, label: "Part 1 (검사용 가짜 원문)", url: "https://example.com/svm-fixture", partial: false,
  blocks: [{ k: "h", t: "A test heading" }, { k: "p", t: "The first paragraph of a fake original, long enough to look like prose in the reader." }, { k: "q", t: "A quoted line." }, { k: "p", t: "The last paragraph." }] });

export async function svmE2E({ browser, BASE, H, ok, VIEWPORTS, TEAM, tag, member, aiMock }) {
  const adm = "t_e2v" + tag;
  const sq = (q) => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--json", "--command", q], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  execFileSync("node", ["scripts/add-user.mjs", adm, "SVM검사", "password1", "--team=" + TEAM, "--features=all"], { stdio: "ignore" });
  sq(`UPDATE users SET role = 'admin' WHERE username = '${adm}'`);
  try {
    for (const [w, h, tv] of [[1300, 900, "컴퓨터", "desktop"], [390, 844, "폰", "phone"]].filter((v) => VIEWPORTS.includes(v[3]))) {
      const ac = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" }); // 가짜 원문(route)이 서비스 워커를 거치지 않게
      try {
        await ac.request.post(BASE + "/api/auth/login", { headers: H, data: { username: adm, password: "password1" } });
        const D = await (await ac.request.get(BASE + "/api/svm/data", { headers: H })).json();
        const p = await ac.newPage(), errs = [];
        p.on("pageerror", (e) => errs.push(e.message));
        await p.route("**/api/svm/source*", (r) => r.fulfill({ json: FIXTURE("fixture") }));
        const over = () => p.evaluate(() => document.querySelector(".sv").scrollWidth - innerWidth);

        // 1) 서재
        await p.goto("about:blank"); await p.goto(BASE + "/#/svm");
        await p.waitForSelector(".sv-book", { timeout: 15000 }).catch(() => {});
        const conceptDots = D.essays.reduce((n, e) => n + (e.concepts || []).length, 0);
        const lib = await p.evaluate(() => ({ books: document.querySelectorAll(".sv-books .sv-book").length, qs: document.querySelectorAll(".sv-qlist [data-qi]").length, dots: document.querySelectorAll(".sv-mx a.sv-dot.on").length, dock: !!document.querySelector('[data-nav="svm"]'), stats: document.querySelector("#sv-stats")?.textContent || "" }));
        const o1 = await over();
        ok(lib.books === 4 && lib.qs === D.questions.length && lib.dots >= conceptDots && lib.dock && o1 <= 1 && /CH\s*15/.test(lib.stats), `${tv} · SVM 서재 — 책 ${lib.books} · 질문 ${lib.qs} · 점 ${lib.dots}(개념 ${conceptDots}+) · Dock ${lib.dock} · 넘침 ${o1}px · "${lib.stats}"`);
        const q0 = D.questions.findIndex((x) => !x.to);
        await p.click(`button[data-q="${q0}"]`); await sleep(200);
        const ans = await p.evaluate(() => [...document.querySelectorAll(".sv-qans .sv-qch")].map((a) => a.getAttribute("href")));
        ok(ans.length === D.questions[q0].essays.length && ans.every((h, i) => h === "#/svm/read/" + D.questions[q0].essays[i]), `${tv} · SVM 질문 "${D.questions[q0].q}" → 장 ${ans.length}개`);
        await p.fill("#sv-query", "패치워크"); await sleep(150); await p.keyboard.press("Enter");
        await p.waitForFunction(() => location.hash === "#/svm/read/patchwork", null, { timeout: 5000 }).catch(() => {});
        ok((await p.evaluate(() => location.hash)) === "#/svm/read/patchwork", `${tv} · SVM QUERY 에 "패치워크" → ↵ → 그 장`);

        // 2) 권 차례 → 첫 장
        await p.goto("about:blank"); await p.goto(BASE + "/#/svm");
        await p.waitForSelector('.sv-book[href="#/svm/v/core"]', { timeout: 15000 }).catch(() => {});
        await p.click('.sv-book[href="#/svm/v/core"]'); await p.waitForSelector("a.sv-tl", { timeout: 8000 }).catch(() => {});
        const core = D.essays.filter((e) => e.section === "core");
        const vol = await p.evaluate(() => ({ rows: document.querySelectorAll("a.sv-tl").length, first: document.querySelector("a.sv-tl")?.getAttribute("href") }));
        ok(vol.rows === core.length && vol.first === "#/svm/read/" + core[0].id && (await over()) <= 1, `${tv} · SVM 제2권 차례 — 장 ${vol.rows}개`);
        await p.click("a.sv-tl"); await p.waitForSelector(".sv-art h1", { timeout: 8000 }).catch(() => {});
        const e0 = core[0];

        // 3) 글 읽기
        const rd = await p.evaluate(() => ({ h1: document.querySelector(".sv-art h1")?.textContent, ch: document.querySelector(".sv-chno")?.textContent || "", claims: document.querySelectorAll(".sv-claim").length, quotes: document.querySelectorAll(".sv-quote").length, modes: document.querySelectorAll(".sv-modes [role=tab]").length }));
        ok(rd.h1 === e0.title && rd.ch.includes("CH " + String(e0.no).padStart(2, "0")) && rd.claims === e0.claims.length && rd.quotes === (e0.quotes || []).length && rd.modes === 3 && (await over()) <= 1, `${tv} · SVM 글 — "${rd.h1}" · ${rd.ch} · 논지 ${rd.claims} · 인용 ${rd.quotes}`);
        const term = await p.$(".sv-term");
        if (term && w > 760) { await term.hover(); await sleep(150); const tip = await p.evaluate(() => { const t = document.querySelector(".sv-tip"); return t && !t.hidden ? t.textContent : ""; }); ok(tip.length > 2, `${tv} · SVM 개념 밑줄 → 풀이 "${tip.slice(0, 30)}"`); }
        await p.click('.sv-modes [data-mode="orig"]'); await p.waitForSelector(".sv-para", { timeout: 8000 }).catch(() => {});
        const og = await p.evaluate(() => ({ paras: document.querySelectorAll(".sv-para").length, hash: location.hash }));
        ok(og.paras === 4 && og.hash.endsWith("/orig"), `${tv} · SVM 원문 + 번역 — 단락 ${og.paras} · 주소 ${og.hash}`);
        if (aiMock) {
          await p.waitForFunction(() => [...document.querySelectorAll(".sv-kr")].every((x) => x.textContent.startsWith("모의 번역")), null, { timeout: 12000 }).catch(() => {});
          const kr = await p.evaluate(() => [...document.querySelectorAll(".sv-kr")].map((x) => x.textContent.slice(0, 12)));
          ok(kr.length === 4 && kr.every((t) => t.startsWith("모의 번역")), `${tv} · SVM 단락 번역 (가짜 AI) — ${kr.join(" | ")}`);
        }
        await p.keyboard.press("3"); await sleep(250);
        const br = await p.evaluate(() => ({ sel: document.querySelector('.sv-modes [aria-selected="true"]')?.dataset.mode, quotes: document.querySelectorAll(".sv-quote").length, claims: document.querySelectorAll(".sv-claim").length }));
        ok(br.sel === "brief" && br.quotes === 0 && br.claims >= 3, `${tv} · SVM 요약만 (키 3) — 인용 ${br.quotes} · 논지 ${br.claims}`);
        await p.keyboard.press("1"); await sleep(250);
        await p.click("[data-done]"); await sleep(1500);
        const st = await (await ac.request.get(BASE + "/api/apps/svm/state", { headers: H })).json();
        const stats = await p.evaluate(() => document.querySelector("#sv-stats")?.textContent || "");
        ok(!!st.data?.read?.[e0.id] && st.data.mode === "sum" && (w <= 760 || /READ\s*01/.test(stats)), `${tv} · SVM 다 읽었어요 → 서버 기록 ${!!st.data?.read?.[e0.id]} · 방식 ${st.data?.mode} · "${stats}"`);
        if (w > 760) { const nx = D.essays[D.essays.indexOf(D.essays.find((x) => x.id === e0.id)) + 1]; await p.keyboard.press("ArrowRight"); await p.waitForFunction((id) => location.hash === "#/svm/read/" + id, nx.id, { timeout: 5000 }).catch(() => {}); ok((await p.evaluate(() => document.querySelector(".sv-art h1")?.textContent)) === nx.title, `${tv} · SVM → 키로 다음 장`); }

        // 4) 인물 지도 · 옛 주소 · 비판 · 밝게
        await p.goto("about:blank"); await p.goto(BASE + "/#/svm/people");
        await p.waitForSelector(".sv-gc canvas", { timeout: 8000 }).catch(() => {}); await sleep(500);
        const g1 = await p.evaluate(() => ({ canvas: !!document.querySelector(".sv-gc canvas"), node: document.querySelector(".sv-gnode h2")?.textContent || "", all: document.querySelectorAll(".sv-gall [data-pick]").length, stat: document.querySelector(".og-stat")?.textContent || "" }));
        ok(g1.canvas && /틸/.test(g1.node) && g1.all === D.people.length && g1.stat.startsWith(D.people.length + " node") && (await over()) <= 1, `${tv} · SVM 인물 지도 — 처음 "${g1.node}" · 인물 ${g1.all} · "${g1.stat}"`);
        await p.click('.sv-gall [data-pick="yarvin"]'); await sleep(250);
        const g2 = await p.evaluate(() => ({ node: document.querySelector(".sv-gnode h2")?.textContent || "", hash: location.hash }));
        ok(/야빈/.test(g2.node) && g2.hash === "#/svm/people/yarvin", `${tv} · SVM 모든 인물에서 고르기 → "${g2.node}" · ${g2.hash}`);
        await p.goto("about:blank"); await p.goto(BASE + "/#/svm/graph/p:land");
        await p.waitForFunction(() => location.hash === "#/svm/people/land" && /랜드/.test(document.querySelector(".sv-gnode h2")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
        ok((await p.evaluate(() => location.hash)) === "#/svm/people/land", `${tv} · SVM 옛 주소 #/svm/graph/p:land → 인물 지도`);
        await p.goto("about:blank"); await p.goto(BASE + "/#/svm/counter");
        await p.waitForSelector(".sv-cset", { timeout: 8000 }).catch(() => {});
        const nCrit = D.essays.reduce((n, e) => n + (e.critiques || []).length, 0), crits = await p.evaluate(() => document.querySelectorAll(".sv-cset .sv-crit").length);
        ok(crits === nCrit, `${tv} · SVM 비판 모아 보기 — ${crits}/${nCrit}`);
        const bg = async () => p.evaluate(() => getComputedStyle(document.querySelector(".sv")).backgroundColor);
        const night = await bg(); await p.click("#sv-day"); await sleep(100); const day = await bg(); await p.click("#sv-day"); await sleep(100);
        ok(night === "rgb(10, 10, 11)" && day === "rgb(250, 250, 249)" && (await bg()) === night, `${tv} · SVM 어둡게 ${night} · [DAY] ${day}`);
        ok(!errs.length, `${tv} · SVM 화면 오류 없음${errs.length ? " — " + errs[0] : ""}`);
      } finally { await ac.close(); }
    }
    // 회원: Dock 에 없고 #/svm 은 홈, API 는 404
    const mc = await browser.newContext({ viewport: { width: 1300, height: 900 } });
    try {
      await mc.request.post(BASE + "/api/auth/login", { headers: H, data: { username: member } });
      const mp = await mc.newPage();
      await mp.goto(BASE + "/#/svm"); await sleep(2500);
      const m = await mp.evaluate(() => ({ dock: !!document.querySelector('[data-nav="svm"]'), sv: !!document.querySelector(".sv") }));
      const api = (await mc.request.get(BASE + "/api/svm/data", { headers: H })).status();
      ok(!m.dock && !m.sv && api === 404, `회원 · SVM 안 보임 — Dock ${m.dock} · 화면 ${m.sv} · API ${api}`);
    } finally { await mc.close(); }
  } finally { sq(`DELETE FROM users WHERE username = '${adm}'`); }
}

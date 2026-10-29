// Silicon Valley Mafia (#/svm, 관리자만) 화면 검사 — e2e.mjs 가 부르는 구역 "svm" (컴퓨터 · 폰)
//   1) 관리자: Dock 아이콘 · 서재(글 15 · 진행 칸 · 계보 줄) · 가로 넘침 없음
//   2) 글 읽기: 제목 · 논지 · 읽는 방식 셋 (원문 + 번역은 가짜 원문으로 — 바깥 사이트에 기대지 않게, 가짜 AI 면 번역 줄까지) · 다 읽었어요 → 서버 기록
//   3) 지식그래프: 캔버스 · 처음 고른 점(틸 — 야빈은 연결이 너무 많아서) 패널 · 걸러 보기 · 밝게/어둡게 색
//   4) 회원: Dock 에 없고 #/svm 은 홈, API 는 404
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
        const e0 = D.essays[0];
        const p = await ac.newPage(), errs = [];
        p.on("pageerror", (e) => errs.push(e.message));
        await p.route("**/api/svm/source*", (r) => r.fulfill({ json: FIXTURE(e0.id) }));
        await p.goto("about:blank"); await p.goto(BASE + "/#/svm");
        await p.waitForSelector(".sv-row", { timeout: 15000 }).catch(() => {});
        const lib = await p.evaluate(() => ({ rows: document.querySelectorAll(".sv-row").length, cells: document.querySelectorAll(".sv-cell").length, lin: document.querySelectorAll(".sv-lin-n").length, dock: !!document.querySelector('[data-nav="svm"]'), over: document.querySelector(".sv").scrollWidth - innerWidth, stats: document.querySelector("#sv-stats")?.textContent || "" }));
        ok(lib.rows === 15 && lib.cells === 15 && lib.lin >= 3 && lib.dock && lib.over <= 1 && /글\s*15/.test(lib.stats), `${tv} · SVM 서재 — 글 ${lib.rows} · 칸 ${lib.cells} · 계보 ${lib.lin} · Dock ${lib.dock} · 넘침 ${lib.over}px · "${lib.stats}"`);

        // 글 읽기
        await p.click(".sv-row >> nth=0"); await p.waitForSelector(".sv-art h1", { timeout: 8000 }).catch(() => {});
        const rd = await p.evaluate(() => ({ h1: document.querySelector(".sv-art h1")?.textContent, claims: document.querySelectorAll(".sv-claim").length, quotes: document.querySelectorAll(".sv-quote").length, modes: document.querySelectorAll(".sv-modes [role=tab]").length, over: document.querySelector(".sv").scrollWidth - innerWidth }));
        ok(rd.h1 === e0.title && rd.claims === e0.claims.length && rd.quotes === (e0.quotes || []).length && rd.modes === 3 && rd.over <= 1, `${tv} · SVM 글 — "${rd.h1}" · 논지 ${rd.claims} · 인용 ${rd.quotes} · 방식 ${rd.modes} · 넘침 ${rd.over}px`);
        const term = await p.$(".sv-term");
        if (term && w > 760) { await term.hover(); await sleep(150); const tip = await p.evaluate(() => { const t = document.querySelector(".sv-tip"); return t && !t.hidden ? t.textContent : ""; }); ok(tip.length > 2, `${tv} · SVM 개념 밑줄 → 풀이 "${tip.slice(0, 30)}"`); }
        await p.click('.sv-modes [data-mode="orig"]'); await p.waitForSelector(".sv-para", { timeout: 8000 }).catch(() => {});
        const og = await p.evaluate(() => ({ paras: document.querySelectorAll(".sv-para").length, hash: location.hash }));
        ok(og.paras === 4 && og.hash.endsWith("/orig"), `${tv} · SVM 원문 + 번역 — 단락 ${og.paras} · 주소 ${og.hash}`);
        if (aiMock) {
          await p.waitForFunction(() => [...document.querySelectorAll(".sv-kr")].every((x) => x.textContent.startsWith("모의 번역")), null, { timeout: 10000 }).catch(() => {});
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
        ok(!!st.data?.read?.[e0.id] && st.data.mode === "sum" && /읽음\s*01/.test(stats), `${tv} · SVM 다 읽었어요 → 서버 기록 ${!!st.data?.read?.[e0.id]} · 방식 ${st.data?.mode} · "${stats}"`);
        if (w > 760) { await p.keyboard.press("ArrowRight"); await p.waitForFunction((id) => location.hash === "#/svm/read/" + id, D.essays[1].id, { timeout: 5000 }).catch(() => {}); ok((await p.evaluate(() => document.querySelector(".sv-art h1")?.textContent)) === D.essays[1].title, `${tv} · SVM → 키로 다음 글`); }

        // 지식그래프
        await p.click('[data-sw="graph"]'); await p.waitForSelector(".sv-gc canvas", { timeout: 8000 }).catch(() => {});
        await sleep(600);
        const gr = await p.evaluate(() => ({ canvas: !!document.querySelector(".sv-gc canvas"), node: document.querySelector(".sv-gnode h2")?.textContent || "", edges: document.querySelectorAll(".sv-gedge").length, hash: location.hash, over: document.querySelector(".sv").scrollWidth - innerWidth }));
        ok(gr.canvas && /틸|Thiel/.test(gr.node) && gr.edges >= 3 && gr.over <= 1, `${tv} · SVM 그래프 — 처음 고른 점 "${gr.node}" (틸) · 연결 ${gr.edges} · 넘침 ${gr.over}px`);
        await p.click('[data-show="concept"]'); await sleep(200);
        ok((await p.getAttribute('[data-show="concept"]', "aria-pressed")) === "false", `${tv} · SVM 그래프 걸러 보기 — 개념 끄기`);
        const bg = await p.evaluate(async () => { const d = document.documentElement, was = d.dataset.theme, out = {}; for (const t of ["light", "dark"]) { d.dataset.theme = t; await new Promise((r) => requestAnimationFrame(r)); out[t] = getComputedStyle(document.querySelector(".sv")).backgroundColor; } d.dataset.theme = was; return out; });
        ok(bg.light === "rgb(250, 250, 249)" && bg.dark === "rgb(11, 11, 12)", `${tv} · SVM 밝게 ${bg.light} · 어둡게 ${bg.dark}`);
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

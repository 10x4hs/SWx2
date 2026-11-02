// CIM 실전 CBT (#/cim/exam/cbt) 검사 — e2e.mjs 가 부르는 구역 "cimcbt" (컴퓨터 · 폰) · 2026-11-02
//   0) public/cim/cbt.json = scripts/cim-cbt-build.mjs 결과 그대로 · 15회 × 100 · 과목 20/30/50 · 회차 사이 중복 = 문제가 모자란 만큼만 (생성 문제가 다 들어오면 0)
//   1) 목록 15줄 → 1회 시작 → 시계 · 번호판 100칸
//   2) 키 1 로 답 → 다음 문항 · 표시 토글 → 번호판에 답함/표시 · ← 로 돌아가기
//   3) 새로 고침 → 서버에서 이어서 (답 · 표시 · 지금 문항 그대로)
//   4) 제출 → 확인창에 안 푼 수 → 점수 · 과목 3칸 · 해설(틀린 것 / 전체 100) · 서버 cbt[1] · 오답노트에 들어감
//   5) 오늘 탭 6일 플랜: '6일 플랜 시작' → 1일째 · 오전 1회 점수 · 오후 2회 · 저녁 3회 (첫날은 '어제 오답' 줄 없음)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { build } from "./cim-cbt-build.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function cimCbtE2E({ browser, BASE, H, ok, VIEWPORTS, TEAM, tag }) {
  // 0) 세트 파일
  const file = JSON.parse(readFileSync("public/cim/cbt.json", "utf8")), fresh = build();
  const all = file.exams.flatMap((e) => e.ids), dup = all.length - new Set(all).size, short = fresh.stat.reduce((a, s) => a + s.short, 0);
  const shape = file.exams.length === 15 && file.exams.every((e) => e.ids.length === 100 && [1, 2, 3].map((s) => e.ids.filter((id) => +id[1] === s).length).join() === "20,30,50");
  ok(shape && JSON.stringify(file.exams) === JSON.stringify(fresh.exams) && dup === short, `CBT 세트 — 15회 × 100 · 과목 20/30/50 ${shape} · 빌드 결과와 같음 · 중복 ${dup} (모자란 문제 ${short})`);

  const u = "t_e2cb" + tag;
  execFileSync("node", ["scripts/add-user.mjs", u, "CBT검사", "password1", "--team=" + TEAM, "--features=all"], { stdio: "ignore" });
  const sq = (q) => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--json", "--command", q], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    for (const [w, h, tv] of [[1300, 900, "컴퓨터", "desktop"], [390, 844, "폰", "phone"]].filter((v) => VIEWPORTS.includes(v[3]))) {
      const ac = await browser.newContext({ viewport: { width: w, height: h } });
      try {
        await ac.request.post(BASE + "/api/auth/login", { headers: H, data: { username: u, password: "password1" } });
        const cur = await (await ac.request.get(BASE + "/api/apps/cim/state", { headers: H })).json();
        await ac.request.put(BASE + "/api/apps/cim/state", { headers: H, data: { data: { v: 2, intro: 1 }, at: cur.updated_at } }); // 빈 기록 · 처음 안내는 봤다고
        const p = await ac.newPage(), errs = [];
        p.on("pageerror", (e) => errs.push(e.message));
        const dialogs = [];
        p.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
        const over = () => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        const state = async () => (await (await ac.request.get(BASE + "/api/apps/cim/state", { headers: H })).json()).data || {};

        // 1) 목록 → 1회 시작
        await p.goto(BASE + "/#/cim/exam/cbt"); await p.waitForSelector(".cb-row", { timeout: 15000 }).catch(() => {});
        const nRows = await p.locator(".cb-row").count();
        ok(nRows === 15 && (await over()) <= 1, `${tv} · CBT 목록 ${nRows}줄`);
        await p.click('.cb-row[data-no="1"]'); await p.waitForSelector("#cb-go", { timeout: 8000 }).catch(() => {});
        await p.click("#cb-go"); await p.waitForSelector(".cb-run", { timeout: 20000 }).catch(() => {});
        await sleep(1200);
        const r1 = await p.evaluate(() => ({ tm: document.querySelector("#cm-tm")?.textContent || "", cells: document.querySelectorAll(".cb-grid [data-j]").length, hash: location.hash, focus: !!document.querySelector(".c-focus"), q: document.querySelector("#cb-q")?.textContent || "" }));
        ok(/^1[01]\d:\d\d$/.test(r1.tm) && r1.cells === 100 && r1.hash === "#/cim/exam/cbt/1" && r1.focus && r1.q.length > 5 && (await over()) <= 1, `${tv} · CBT 1회 시작 — 시계 ${r1.tm} · 번호판 ${r1.cells} · ${r1.hash}`);

        // 2) 답 · 표시 · 이동
        await p.keyboard.press("1"); await sleep(150);   // 1번 문항 답 → 2번으로
        await p.click("#cb-flag"); await sleep(150);      // 2번 표시
        await p.keyboard.press("ArrowRight"); await sleep(150);
        await p.keyboard.press("3"); await sleep(150);   // 3번 문항 답 → 4번
        await p.keyboard.press("ArrowLeft"); await sleep(150); // 3번으로
        const g = await p.evaluate(() => ({ a: [...document.querySelectorAll(".cb-grid .a")].map((b) => +b.dataset.j), f: [...document.querySelectorAll(".cb-grid .f")].map((b) => +b.dataset.j), cur: +document.querySelector(".cb-grid .cur")?.dataset.j, pick: document.querySelector(".c-opt.pick")?.dataset.k, legend: document.querySelector(".cb-legend")?.textContent || "" }));
        ok(g.a.join() === "0,2" && g.f.join() === "1" && g.cur === 2 && g.pick === "2" && /표시 1/.test(g.legend), `${tv} · CBT 답 · 표시 — 답함 [${g.a}] · 표시 [${g.f}] · 지금 ${g.cur + 1}번 · 고른 보기 ${g.pick}`);

        // 3) 새로 고침 → 이어서
        await sleep(1800); // 저장(0.7초 모아서 PUT)
        await p.reload(); await p.waitForSelector(".cb-run", { timeout: 20000 }).catch(() => {}); await sleep(600);
        const g2 = await p.evaluate(() => ({ a: [...document.querySelectorAll(".cb-grid .a")].map((b) => +b.dataset.j), f: [...document.querySelectorAll(".cb-grid .f")].map((b) => +b.dataset.j), cur: +document.querySelector(".cb-grid .cur")?.dataset.j }));
        const s1 = await state();
        ok(g2.a.join() === "0,2" && g2.f.join() === "1" && g2.cur === 2 && s1.cbtRun?.no === 1 && Object.keys(s1.cbtRun?.picks || {}).length === 2, `${tv} · CBT 새로 고침 → 이어서 — 답함 [${g2.a}] · 표시 [${g2.f}] · 지금 ${g2.cur + 1}번 · 서버 run ${s1.cbtRun?.no}회`);

        // 4) 제출 → 결과 · 해설 · 오답
        dialogs.length = 0;
        await p.click("#cb-sub"); await p.waitForSelector("#cb-score", { timeout: 10000 }).catch(() => {});
        const res = await p.evaluate(() => ({ score: document.querySelector("#cb-score")?.textContent || "", subj: document.querySelectorAll(".cb-res .c-subj > div").length, rv: document.querySelectorAll(".cb-rv").length, verdict: document.querySelector(".c-verdict")?.textContent || "", focus: !!document.querySelector(".c-focus") }));
        ok(/안 푼 문항이 98개/.test(dialogs[0] || "") && /^\d+ \/ 100$/.test(res.score) && res.subj === 3 && res.rv >= 98 && /불합격/.test(res.verdict) && !res.focus, `${tv} · CBT 제출 — 확인 "${dialogs[0] || "없음"}" · 점수 ${res.score} · 과목 ${res.subj}칸 · 해설 ${res.rv}`);
        await p.click('[data-all="1"]'); await sleep(300);
        const nAll = await p.locator(".cb-rv").count();
        await sleep(1800);
        const s2 = await state(), wrong = Object.keys(s2.wrong || {}).length;
        ok(nAll === 100 && s2.cbt?.["1"]?.total != null && !s2.cbtRun && wrong >= 98, `${tv} · CBT 해설 전체 ${nAll} · 서버 1회 ${s2.cbt?.["1"]?.total}점 · 오답노트 ${wrong}개`);

        // 5) 오늘 탭 6일 플랜
        await p.goto(BASE + "/#/cim"); await p.waitForSelector("#c-cbt", { timeout: 10000 }).catch(() => {});
        await p.click("[data-cbt-start]").catch(() => {}); await sleep(400);
        const plan = await p.evaluate(() => ({ t: document.querySelector("#c-cbt .t")?.textContent || "", rows: [...document.querySelectorAll("#c-cbt .c-row")].map((a) => a.textContent.replace(/\s+/g, " ").trim()) }));
        ok(/1일째/.test(plan.t) && plan.rows.length === 3 && /오전.*CBT 1회.*점/.test(plan.rows[0]) && /저녁.*3회/.test(plan.rows[2]) && (await over()) <= 1, `${tv} · 6일 플랜 — "${plan.t}" · ${plan.rows.join(" | ")}`);
        ok(!errs.length, `${tv} · CBT 화면 오류 없음${errs.length ? " — " + errs[0] : ""}`);
      } finally { await ac.close(); }
    }
  } finally { sq(`DELETE FROM users WHERE username = '${u}'`); }
}

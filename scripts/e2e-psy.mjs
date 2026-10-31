// Psychology (#/psy, 기능 psy) 화면 검사 — e2e.mjs 가 부르는 구역 "psy" (컴퓨터 · 폰) · 2026-10-31
//   1) MAP 홈: Dock 아이콘 · 트랙 7칸 · 카드마다 점 하나 · 통계 줄 · 가로 넘침 없음
//   2) 트랙 → 카드 줄 → LEARN 카드: EN 이름 · 한국어 이름 · WHY / USE / COUNTER · 출처
//   3) 평가 키 3 (알아) → 서버 기록 (user_app_state psy.srs[id])
//   4) QUIZ: 예시 하나 · 보기 4개 → 하나 고르면 풀이
//   5) SPAR: 상황 고르기 → 한 턴 (가짜 AI 답 — route 로 고정) → 옆 패널 점수
//   6) 영상 · 서재 화면이 그려짐
//   7) psy 기능이 없는 회원: Dock 에 없고, API 는 403
// UI 쪽 이름(클래스 · data-*)은 아래 S 한 곳에만 적어요 — UI 가 바뀌면 여기만 고치면 돼요.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = {
  root: ".psy",
  dock: '[data-nav="psy"]',
  tile: ".psy-tile",            // MAP 의 트랙 칸 (7개)
  dot: ".psy-tile .psy-dot",    // 카드마다 점 하나
  stats: ".psy-stats",          // CARDS · KNOWN · DUE
  row: 'a[href^="#/psy/c/"]',   // 트랙 화면의 카드 줄
  cardEn: ".psy-en",            // LEARN 카드 EN 이름
  cardKo: ".psy-card h1",       // 한국어 이름
  sec: ".psy-sec",              // WHY / USE / COUNTER 칸
  source: ".psy-source",
  quizEx: ".psy-quiz .psy-example",
  opt: ".psy-quiz [data-opt]",
  explain: ".psy-explain",
  scen: "[data-scen]",
  sparIn: ".psy-spar textarea",
  sparSend: ".psy-spar [data-send]",
  sparScore: ".psy-spar .psy-score",
  video: ".psy-video",
  book: ".psy-book",
};
const MOCK_SPAR = { reply: "그건 좀 어렵겠네요. 다른 회사 제안도 받으셨나요?", ai_moves: [], my_moves: [], score: 62, missed: null };

export async function psyE2E({ browser, BASE, H, ok, VIEWPORTS, TEAM, tag }) {
  const u = "t_e2p" + tag, m = "t_e2q" + tag;
  const sq = (q) => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--json", "--command", q], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  execFileSync("node", ["scripts/add-user.mjs", u, "PSY검사", "password1", "--team=" + TEAM, "--features=all"], { stdio: "ignore" });
  execFileSync("node", ["scripts/add-user.mjs", m, "PSY회원", "password1", "--team=" + TEAM, "--features=all"], { stdio: "ignore" }); // all 에 psy 는 없어요
  sq(`INSERT OR IGNORE INTO user_features (user_id, feature, at) SELECT id, 'psy', ${Date.now()} FROM users WHERE username = '${u}'`);
  const C = JSON.parse(readFileSync("public/psy/cards.json", "utf8"));
  const tracks = C.tracks, cards = C.cards;
  const t0 = tracks[0], c0 = cards.find((c) => c.id === t0.order[0]);
  try {
    for (const [w, h, tv] of [[1300, 900, "컴퓨터", "desktop"], [390, 844, "폰", "phone"]].filter((v) => VIEWPORTS.includes(v[3]))) {
      const ac = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" }); // 가짜 AI(route)가 서비스 워커를 거치지 않게
      try {
        await ac.request.post(BASE + "/api/auth/login", { headers: H, data: { username: u, password: "password1" } });
        const p = await ac.newPage(), errs = [];
        p.on("pageerror", (e) => errs.push(e.message));
        await p.route("**/api/apps/psy/spar", (r) => r.fulfill({ json: MOCK_SPAR }));
        const over = () => p.evaluate((s) => (document.querySelector(s)?.scrollWidth ?? 0) - innerWidth, S.root);
        const go = async (hash, sel) => { await p.goto("about:blank"); await p.goto(BASE + "/" + hash); await p.waitForSelector(sel, { timeout: 15000 }).catch(() => {}); await sleep(200); };

        // 1) MAP
        await go("#/psy", S.tile);
        const mp = await p.evaluate((S) => ({ tiles: document.querySelectorAll(S.tile).length, dots: document.querySelectorAll(S.dot).length, dock: !!document.querySelector(S.dock), stats: document.querySelector(S.stats)?.textContent || "" }), S);
        const o1 = await over();
        ok(mp.tiles === 7 && mp.dots === cards.length && mp.dock && /CARDS/i.test(mp.stats) && o1 <= 1, `${tv} · PSY 지도 — 트랙 ${mp.tiles} · 점 ${mp.dots}/${cards.length} · Dock ${mp.dock} · 넘침 ${o1}px · "${mp.stats.slice(0, 40)}"`);

        // 2) 트랙 → 카드
        await go("#/psy/t/" + t0.id, S.row);
        const rows = await p.evaluate((s) => [...document.querySelectorAll(s)].map((a) => a.getAttribute("href")), S.row);
        ok(rows.length === t0.order.length && rows[0] === "#/psy/c/" + t0.order[0], `${tv} · PSY 트랙 ${t0.id} — 카드 ${rows.length}/${t0.order.length} · 순서대로`);
        await p.click(S.row); await p.waitForSelector(S.sec, { timeout: 8000 }).catch(() => {});
        const cd = await p.evaluate((S) => ({ en: document.querySelector(S.cardEn)?.textContent || "", ko: document.querySelector(S.cardKo)?.textContent || "", secs: document.querySelectorAll(S.sec).length, src: !!document.querySelector(S.source), hash: location.hash }), S);
        ok(cd.hash === "#/psy/c/" + c0.id && cd.en.includes(c0.en) && cd.ko.includes(c0.ko) && cd.secs >= 3 && cd.src && (await over()) <= 1, `${tv} · PSY 카드 "${cd.ko}" — EN ${!!cd.en} · 칸 ${cd.secs} · 출처 ${cd.src}`);

        // 3) 평가 3 = 알아 → 서버 기록
        await p.keyboard.press("3"); await sleep(1500);
        const st = await (await ac.request.get(BASE + "/api/apps/psy/state", { headers: H })).json();
        const s0 = st.data?.srs?.[c0.id];
        ok(!!s0 && s0.b >= 1 && s0.d > Date.now(), `${tv} · PSY 평가 3 → 서버 기록 box ${s0?.b} · 다음 ${s0 ? new Date(s0.d).toISOString().slice(0, 10) : "-"}`);

        // 4) QUIZ
        await go("#/psy/quiz", S.opt);
        const qz = await p.evaluate((S) => ({ ex: document.querySelector(S.quizEx)?.textContent || "", opts: document.querySelectorAll(S.opt).length }), S);
        ok(qz.ex.length > 5 && qz.opts === 4, `${tv} · PSY 퀴즈 — 예시 ${qz.ex.length}자 · 보기 ${qz.opts}`);
        await p.click(S.opt); await p.waitForSelector(S.explain, { timeout: 5000 }).catch(() => {});
        const ex = await p.evaluate((s) => document.querySelector(s)?.textContent || "", S.explain);
        ok(ex.length > 5, `${tv} · PSY 퀴즈 고르면 풀이 "${ex.slice(0, 30)}"`);

        // 5) SPAR (가짜 AI 한 턴)
        await go("#/psy/spar", S.scen);
        const nScen = await p.evaluate((s) => document.querySelectorAll(s).length, S.scen);
        await p.click(S.scen); await p.waitForSelector(S.sparIn, { timeout: 8000 }).catch(() => {});
        await p.fill(S.sparIn, "제 성과를 보면 10% 인상이 맞다고 생각합니다.");
        await p.click(S.sparSend).catch(async () => { await p.keyboard.press("Enter"); });
        await p.waitForFunction((t) => document.body.textContent.includes(t), MOCK_SPAR.reply.slice(0, 10), { timeout: 8000 }).catch(() => {});
        const sp = await p.evaluate((S) => ({ reply: document.body.textContent.includes("다른 회사 제안도"), score: document.querySelector(S.sparScore)?.textContent || "" }), S);
        ok(nScen >= 1 && sp.reply && sp.score.includes("62") && (await over()) <= 1, `${tv} · PSY 스파링 — 상황 ${nScen} · AI 답 ${sp.reply} · 점수 "${sp.score}"`);

        // 6) 영상 · 서재
        await go("#/psy/v", S.video);
        const nv = await p.evaluate((s) => document.querySelectorAll(s).length, S.video);
        ok(nv >= 1 && (await over()) <= 1, `${tv} · PSY 영상 ${nv}개`);
        await go("#/psy/library", S.book);
        const nb = await p.evaluate((s) => document.querySelectorAll(s).length, S.book);
        ok(nb >= 1 && (await over()) <= 1, `${tv} · PSY 서재 책 ${nb}권`);
        ok(!errs.length, `${tv} · PSY 화면 오류 없음${errs.length ? " — " + errs[0] : ""}`);
      } finally { await ac.close(); }
    }
    // 7) psy 가 없는 회원: Dock 에 없고 API 는 403
    const mc = await browser.newContext({ viewport: { width: 1300, height: 900 } });
    try {
      await mc.request.post(BASE + "/api/auth/login", { headers: H, data: { username: m, password: "password1" } });
      const mp2 = await mc.newPage();
      await mp2.goto(BASE + "/#/psy"); await sleep(2500);
      const dock = await mp2.evaluate((s) => !!document.querySelector(s), S.dock);
      const api = (await mc.request.get(BASE + "/api/apps/psy/state", { headers: H })).status();
      ok(!dock && api === 403, `회원(psy 없음) · PSY 안 보임 — Dock ${dock} · API ${api}`);
    } finally { await mc.close(); }
  } finally { sq(`DELETE FROM users WHERE username IN ('${u}', '${m}')`); }
}

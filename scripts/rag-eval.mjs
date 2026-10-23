// 뜻으로 찾기 평가 (Phase 0) — 무엇을 기본값으로 둘지 숫자로 정해요.
//   BASE=http://127.0.0.1:8797 node scripts/rag-eval.mjs [--n=150] [--seed=20261023] [--no-rerank] [--no-notes]
//   정답 묶음(golden set): CIM 문제 → 그 문제가 붙은 카드 (public/cim/*.json, 문제 id = q.k || `${key}-${i}` — public/js/cim/data.js 와 같게).
//   질문 글만(보기 없이) 검색어로 넣고, 돌아온 카드 순위로 recall@1/5/10 · MRR@10 을 재요.
//   · 글자 찾기에는 CIM 문제 행(cimq)도 들어 있어서, 그 질문 자기 행은 빼고(leave-one-out) 재요 — 같은 카드의 다른 문제는 남아요(실제 사용과 같게).
//     문제 행을 모두 뺀 숫자(no-q)도 같이 보여 줘요.
//   · 아무 상관없는 질문(off-topic)의 최고 코사인과 비교해 '근거 없음' 기준(minCos)을 골라요.
//   · 노트 묶음: 로컬 노트는 시험 계정 쓰레기라, 임시 사람에게 작은 노트 8개를 만들어 바꿔 쓴 질문으로 재요 (끝나면 지워요).
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { adminSession } from "./lib/rag-admin.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8797";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const N = Number(arg("n", 150)), SEED = Number(arg("seed", 20261023));
const RERANK = !process.argv.includes("--no-rerank"), NOTES = !process.argv.includes("--no-notes");

// ---------- 정답 묶음 ----------
const all = [];
for (const f of readdirSync("public/cim").filter((x) => /^s\dc\d+\.json$/.test(x)).sort()) {
  const c = JSON.parse(readFileSync("public/cim/" + f, "utf8")), id = `s${c.s}c${c.c}`;
  for (const s of c.sec) for (const p of s.p) p.q.forEach((q, i) => all.push({ qid: q.k || `${id}-${p.n}-${i}`, key: `${id}-${p.n}`, q: q.q }));
}
// mulberry32 — 같은 seed 면 같은 150문제
let st = SEED >>> 0;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pool = all.slice();
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const sample = pool.slice(0, N);

const OFF = ["오늘 저녁 메뉴 뭐 먹을까", "고양이가 밤에 우는 이유", "아이폰 배터리 오래 쓰는 법", "축구 오프사이드 규칙", "파이썬 리스트 정렬하는 방법", "비 오는 날 듣기 좋은 노래", "제주도 여행 코스 추천", "감기 빨리 낫는 법", "피아노 독학 순서", "영어 회화 첫 인사", "운동 후 근육통 줄이는 법", "강아지 산책 시간", "자바스크립트 비동기 함수", "봄에 피는 꽃 이름", "라면 맛있게 끓이는 법"];

const { call, done } = await adminSession(BASE);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(3) : "  —  ");

async function pmap(list, n, fn) {
  const out = new Array(list.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}
function score(rows, modes) {
  const res = {};
  for (const m of modes) {
    let r1 = 0, r5 = 0, r10 = 0, mrr = 0, ms = 0, n = 0;
    for (const { gold, out } of rows) {
      const o = out[m]; if (!o) continue;
      n++; ms += o.ms;
      const at = o.list.indexOf(gold);
      if (at === 0) r1++;
      if (at >= 0 && at < 5) r5++;
      if (at >= 0 && at < 10) { r10++; mrr += 1 / (at + 1); }
    }
    res[m] = { n, r1: r1 / n, r5: r5 / n, r10: r10 / n, mrr: mrr / n, ms: ms / n };
  }
  return res;
}
function table(title, res) {
  console.log(`\n${title}`);
  console.log("mode                    |  n  | R@1   | R@5   | R@10  | MRR   | ms");
  console.log("------------------------+-----+-------+-------+-------+-------+------");
  for (const [m, r] of Object.entries(res)) console.log(`${m.padEnd(24)}| ${String(r.n).padStart(3)} | ${fmt(r.r1)} | ${fmt(r.r5)} | ${fmt(r.r10)} | ${fmt(r.mrr)} | ${Math.round(r.ms)}`);
}

try {
  const st0 = await call("GET", "/rag/status");
  const cimDone = st0.data?.chunks?.find((c) => c.source_type === "cim" && c.vec_state === "done")?.n || 0;
  console.log(`index ${st0.data?.index} · CIM vectors ${cimDone} · sample ${sample.length}/${all.length} questions (seed ${SEED})`);
  if (!cimDone) throw new Error("CIM 색인이 비었어요 — 먼저 node scripts/rag-index.mjs");

  if (process.argv.includes("--notes-only")) { await notesEval(); process.exit(0); }
  // 1) leave-one-out (자기 문제 행만 빼요)
  // fts+term = 낱말째 MATCH · fts+tri = 낱말을 trigram 조각으로 나눠 OR (한국어 어미 대응)
  //   --modes=a,b · --modesB=a,b 로 바꿔 볼 수 있어요 (플래그: term · tri · rerank · nb · noq(문제 행 빼기) · w5(벡터 무게 0.5) · qp20(문제 행 벌점 2.0))
  const modesA = arg("modes", "") ? arg("modes").split(",") : ["fts+term", "fts+tri", "vec", "hybrid+term", "hybrid+tri", ...(RERANK ? ["hybrid+term+rerank", "hybrid+tri+rerank"] : [])];
  const rowsA = await pmap(sample, 4, async (s) => {
    const r = await call("GET", `/rag/eval?q=${encodeURIComponent(s.q)}&exclude=${encodeURIComponent(s.qid)}&modes=${encodeURIComponent(modesA.join(","))}`);
    if (r.status !== 200) throw new Error(`eval ${r.status} ${JSON.stringify(r.data)}`);
    return { gold: s.key, out: r.data };
  });
  table("CIM golden set — leave-one-out (other questions of the same card stay in FTS)", score(rowsA, modesA));
  // 2) 문제 행 모두 빼기
  const modesB = arg("modesB", "") ? arg("modesB").split(",") : ["fts+term", "fts+tri", "hybrid+term", "hybrid+tri"];
  const rowsB = await pmap(sample, 4, async (s) => {
    const r = await call("GET", `/rag/eval?q=${encodeURIComponent(s.q)}&exclude=all&modes=${encodeURIComponent(modesB.join(","))}`);
    return { gold: s.key, out: r.data };
  });
  table("CIM golden set — no question rows at all (cards only)", score(rowsB, modesB));

  // 3) 근거 기준: 맞는 질문의 최고 코사인 vs 상관없는 질문
  const goldTop = rowsA.map((r) => r.out.vec?.topCos).filter((x) => x > -1);
  const offTop = (await pmap(OFF, 4, async (q) => (await call("GET", `/rag/eval?q=${encodeURIComponent(q)}&modes=vec`)).data.vec.topCos)).filter((x) => x > -1);
  const goldHit = rowsA.filter((r) => r.out.vec?.list[0] === r.gold).map((r) => r.out.vec.topCos);
  console.log("\ntop-1 cosine (vec)        p10    p25    p50    p75    p90");
  console.log(`CIM questions           ${[0.1, 0.25, 0.5, 0.75, 0.9].map((p) => fmt(pct(goldTop, p))).join("  ")}`);
  console.log(`  …when top-1 is right  ${[0.1, 0.25, 0.5, 0.75, 0.9].map((p) => fmt(pct(goldHit, p))).join("  ")}`);
  console.log(`off-topic questions     ${[0.1, 0.25, 0.5, 0.75, 0.9].map((p) => fmt(pct(offTop, p))).join("  ")}  (max ${fmt(Math.max(...offTop))})`);

  // 4) 노트 묶음 (임시 사람)
  if (NOTES) await notesEval();
} finally { await done(); }

async function notesEval() {
  const u = "rgn_" + Date.now().toString(36).slice(-5);
  execFileSync("node", ["scripts/add-user.mjs", u, "노트평가", "--features=all"], { stdio: "ignore" });
  const login = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-trio": "1" }, body: JSON.stringify({ username: u }) });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const me = (await login.json()).user;
  const ucall = async (method, path, body) => { const r = await fetch(BASE + "/api" + path, { method, headers: { "content-type": "application/json", "x-trio": "1", cookie }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
  const NOTES = [
    ["듀레이션 정리", "# 듀레이션\n채권 가격이 금리 변화에 얼마나 민감한지 나타내는 지표예요. 만기가 길수록, 표면이자율이 낮을수록 커져요.\n\n## 수정 듀레이션\n맥컬리 듀레이션을 (1+시장금리)로 나눈 값으로, 금리가 1%p 오를 때 가격이 몇 % 내리는지 어림해요. [[볼록성]] 과 같이 봐요."],
    ["볼록성", "가격-수익률 곡선이 원점 쪽으로 휜 정도. 금리가 크게 움직이면 듀레이션만으로는 오차가 생겨서 볼록성으로 고쳐요. 볼록성이 큰 채권이 금리 하락 때 더 많이 오르고 상승 때 덜 내려요."],
    ["주말 장보기", "우유, 달걀, 양파, 대파, 두부. 일요일 오전에 마트. 세일하는 과일도 보기."],
    ["샤프 비율 메모", "포트폴리오의 초과수익률(수익률 - 무위험이자율)을 표준편차로 나눈 값. 위험 한 단위당 보상. 트레이너 비율은 표준편차 대신 베타를 써요. [[젠센 알파]] 도 같이 외우기."],
    ["젠센 알파", "CAPM 으로 기대되는 수익률보다 실제 수익률이 얼마나 높은지. 양수면 펀드매니저가 시장보다 잘한 것."],
    ["운동 루틴", "월수금 하체, 화목 상체. 스쿼트 5세트, 데드리프트 3세트. 끝나고 스트레칭 10분."],
    ["옵션 그릭스", "## 델타\n기초자산 가격이 1 오를 때 옵션 가격 변화. 콜은 0~1, 풋은 -1~0.\n\n## 감마\n델타의 변화율. 등가격(ATM) 근처에서 가장 커요.\n\n## 세타\n시간이 하루 지날 때 옵션 가치가 줄어드는 정도. 만기 직전에 빨라져요."],
    ["독서 목록", "사피엔스, 총균쇠, 이기적 유전자. 한 달에 한 권."],
  ];
  const ids = {};
  for (const [t, b] of NOTES) { const r = await ucall("POST", "/notes", { title: t, body: b }); ids[t] = r.data?.note?.id; }
  const Q = [
    ["금리가 오르면 채권 값이 얼마나 떨어지는지 재는 숫자", "듀레이션 정리"],
    ["곡선이 휘어서 생기는 오차 보정", "볼록성"],
    ["위험 대비 수익을 비교하는 지표", "샤프 비율 메모"],
    ["시장 기대보다 초과로 번 수익", "젠센 알파"],
    ["만기가 다가오면 옵션 가치가 빨리 줄어드는 현상", "옵션 그릭스"],
    ["마트에서 살 것", "주말 장보기"],
    ["하체 운동하는 날", "운동 루틴"],
    ["읽을 책", "독서 목록"],
    ["콜옵션 가격이 기초자산에 반응하는 정도", "옵션 그릭스"],
    ["펀드매니저 실력 평가", "젠센 알파"],
  ];
  // 벡터가 보일 때까지 — Vectorize 쓰기는 늦게 보여요 (재 보니 30초 ~ 몇 분). 노트 저장 직후 waitUntil 이 임베딩해요
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 600e3) {
    const r = await call("GET", `/rag/eval?scope=notes&as=${me.id}&modes=vec&q=${encodeURIComponent("주말에 살 식재료")}`);
    if ((r.data?.vec?.list || []).length >= NOTES.length) { ready = true; break; }
    await new Promise((res) => setTimeout(res, 10000));
  }
  console.log(`\nnotes golden set: ${NOTES.length} notes · ${Q.length} paraphrased queries · all vectors visible ${ready ? "after " + Math.round((Date.now() - t0) / 1000) + "s" : "NOT within 600s"}`);
  // 같은 retrieve 를 방식마다 (로컬 전용 as=<그 사람 id>) + 실제 화면 길(/search/semantic, 그 사람 세션 · minCos 거름)
  const nm = ["fts+term", "fts+tri", "vec", "hybrid+tri", "hybrid+tri+nb", ...(RERANK ? ["hybrid+tri+rerank"] : [])];
  const rows = [];
  for (const [q, gold] of Q) {
    const r = await call("GET", `/rag/eval?scope=notes&as=${me.id}&modes=${encodeURIComponent(nm.join(","))}&q=${encodeURIComponent(q)}`);
    const s = await ucall("GET", "/search/semantic?limit=10&q=" + encodeURIComponent(q));
    rows.push({ gold: ids[gold], out: { ...r.data, "/search/semantic": { list: (s.data?.results || []).filter((x) => x.type === "note").map((x) => x.id), ms: 0 } } });
    const hit = (s.data?.results || []).find((x) => x.id === ids[gold]);
    console.log(`  ${q.padEnd(34)} → vec top-1 ${r.data.vec?.list[0] === ids[gold] ? "✓" : "✗"} cos ${fmt(r.data.vec?.topCos)} · /search/semantic ${hit ? "rank " + ((s.data.results.filter((x) => x.type === "note").indexOf(hit)) + 1) + " via " + hit.via.join("+") : "missing"}`);
  }
  table("notes golden set (tiny: 8 notes, 10 paraphrased queries)", score(rows, [...nm, "/search/semantic"]));
  // 격리: 다른 사람(관리자 평가 계정)은 이 노트를 못 봐요
  const other = await call("GET", "/search/semantic?q=" + encodeURIComponent("듀레이션 볼록성 샤프 젠센"));
  console.log("isolation: another user sees these notes →", (other.data?.results || []).some((x) => Object.values(ids).includes(x.id)) ? "YES (BUG)" : "no");
  for (const id of Object.values(ids)) await ucall("DELETE", "/notes/" + id);
  execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM users WHERE id = '${me.id}'`], { stdio: "ignore" });
  await new Promise((res) => setTimeout(res, 3000));
  await call("POST", "/rag/index/step"); // 지운 노트의 벡터를 rag_tomb 에서 지워요
}

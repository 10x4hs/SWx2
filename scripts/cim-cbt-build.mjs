// CIM CBT 15회 만들기 — public/cim/s*c*.json 을 읽어 public/cim/cbt.json { exams: [{ no, ids: [100문항] }] } 을 써요.
//   node scripts/cim-cbt-build.mjs [--check] [--strict]   (--check: 쓰지 않고 검사만 · --strict: 회차 사이 중복이 하나라도 있으면 실패)
// 장별 문항수는 금융투자협회 공식 세부과목 표 그대로예요 (2026-11-02 확인: 거시경제 4 · 분산투자기법 5).
//   투자분석기법(s2c3 · s2c4 · s2c5)은 한 덩어리 12문항이에요.
// 한 회차 안에서 장마다 절반(올림)은 생성 문제(gen:1), 나머지는 교재 문제. 한쪽이 모자라면 다른 쪽으로 채워요.
// 15회 사이에 같은 문제는 없어요. 순서 = 과목 순 · 과목 안은 섞어서. 씨앗이 고정이라 늘 같은 결과예요.
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = process.env.CIM_DIR ? new URL("file://" + process.env.CIM_DIR.replace(/\/?$/, "/")) : new URL("../public/cim/", import.meta.url); // CIM_DIR: 다른 폴더로 시험해 볼 때
const N_EXAMS = 15, SEED = 20261102;
export const QUOTA = [
  [["s1c1"], 7], [["s1c2"], 8], [["s1c3"], 5],
  [["s2c1"], 5], [["s2c2"], 5], [["s2c3", "s2c4", "s2c5"], 12], [["s2c6"], 8],
  [["s3c1"], 5], [["s3c2"], 7], [["s3c3"], 4], [["s3c4"], 3], [["s3c5"], 6], [["s3c6"], 6], [["s3c7"], 6], [["s3c8"], 4], [["s3c9"], 4], [["s3c10"], 5],
];

// 씨앗 난수 (mulberry32)
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const DUPS = [];
// 장의 문제 id 들 — data.js 와 같은 규칙 (q.k 가 있으면 그것, 없으면 <장>-<핵심 번호>-<순번>)
function load(ch) {
  const c = JSON.parse(readFileSync(new URL(ch + ".json", ROOT), "utf8")), gen = [], book = [];
  const seen = new Set(); // 같은 id 가 두 번 나오면(옮긴 문제 k 가 다른 카드 순번과 겹침) 처음 것만 — 앱 QI 도 하나만 남아요
  c.sec.forEach((s) => s.p.forEach((p) => (p.q || []).forEach((q, i) => { const id = q.k || `${ch}-${p.n}-${i}`; if (seen.has(id)) { DUPS.push(id); return; } seen.add(id); (q.gen ? gen : book).push(id); })));
  return { gen, book };
}

export function build() {
  const r = rng(SEED), exams = Array.from({ length: N_EXAMS }, (_, i) => ({ no: i + 1, ids: [] })), stat = [];
  for (const [chs, n] of QUOTA) {
    const pool = { gen: [], book: [] };
    chs.forEach((ch) => { const x = load(ch); pool.gen.push(...x.gen); pool.book.push(...x.book); });
    shuffle(pool.gen, r); shuffle(pool.book, r);
    const need = n * N_EXAMS;
    // 생성 문제가 아직 모자라면(생성 작업 전) 같은 문제를 다른 회차에 다시 써서 채워요 — 경고만 하고 --strict 면 실패
    const have = pool.gen.length + pool.book.length, short = Math.max(0, need - have);
    for (let i = 0; pool.book.length + pool.gen.length < need; i++) pool.book.push(pool.book[i % have] ?? pool.gen[i % have]);
    // 전체로 먼저 나눠요: 생성 문제는 회차당 ceil(n/2) 까지, 모자라면 교재로 · 교재가 모자라면 생성으로
    const wantGen = Math.min(pool.gen.length, Math.max(need - pool.book.length, Math.ceil(n / 2) * N_EXAMS));
    const g = pool.gen.slice(0, wantGen), b = pool.book.slice(0, need - wantGen);
    // 회차마다 생성 문제를 고르게: 돌아가며 한 장씩 나눠 줘요
    const per = exams.map(() => []);
    g.forEach((id, i) => per[i % N_EXAMS].push(id));
    let k = 0;
    per.forEach((a) => { while (a.length < n) a.push(b[k++]); });
    // 생성이 고르지 않게 남았으면(나머지) 위에서 이미 n 넘지 않아요 — 회차당 생성 ≤ ceil(wantGen/15) ≤ n
    per.forEach((a, i) => exams[i].ids.push(...a));
    stat.push({ ch: chs.join("+"), n, gen: pool.gen.length, book: have - pool.gen.length, usedGen: g.length, short });
  }
  // 과목 안에서 섞어요 (과목 순서는 1 → 2 → 3)
  exams.forEach((e) => {
    const by = { 1: [], 2: [], 3: [] };
    e.ids.forEach((id) => by[+id[1]].push(id));
    e.ids = [...shuffle(by[1], r), ...shuffle(by[2], r), ...shuffle(by[3], r)];
  });
  return { exams, stat };
}

export function check(exams, allowDup = 0) {
  const all = exams.flatMap((e) => e.ids), errs = [];
  if (exams.length !== N_EXAMS) errs.push(`회차 ${exams.length}`);
  exams.forEach((e) => {
    if (e.ids.length !== 100) errs.push(`${e.no}회 ${e.ids.length}문항`);
    const s = [1, 2, 3].map((j) => e.ids.filter((id) => +id[1] === j).length);
    if (s.join() !== "20,30,50") errs.push(`${e.no}회 과목별 ${s}`);
  });
  if (all.length - new Set(all).size > allowDup) errs.push(`중복 ${all.length - new Set(all).size}개`);
  return errs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exams, stat } = build(), errs = [];
  const short = stat.reduce((a, s) => a + s.short, 0), strict = process.argv.includes("--strict");
  for (const s of stat) console.log(`${s.ch.padEnd(16)} 회당 ${String(s.n).padStart(2)} · 생성 ${s.usedGen}/${s.gen} · 교재 ${s.n * N_EXAMS - s.usedGen}/${s.book}${s.short ? ` · ⚠ ${s.short}개 모자라 다시 씀` : ""}`);
  if (DUPS.length) console.warn(`⚠ 장 JSON 안에서 id 가 겹쳐요 (한 번만 써요): ${[...new Set(DUPS)].join(", ")}`);
  if (short) console.warn(`⚠ 문제가 ${short}개 모자라요 — 생성 문제를 더 넣고 다시 돌려 주세요.`);
  errs.push(...check(exams, strict ? 0 : short).filter((e) => !errs.includes(e)));
  const gen = stat.reduce((a, s) => a + s.usedGen, 0);
  console.log(`15회 × 100 = ${exams.length * 100} · 생성 ${gen} · 교재 ${1500 - gen}`);
  if (errs.length) { console.error("검사 실패:", errs.join(" · ")); process.exit(1); }
  if (!process.argv.includes("--check")) { writeFileSync(new URL("cbt.json", ROOT), JSON.stringify({ seed: SEED, exams }) + "\n"); console.log("→ public/cim/cbt.json"); }
}

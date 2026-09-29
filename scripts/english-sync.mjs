// 앱 → ENGLISH-OS 볼트 동기화 (한 방향)
//   ENGLISH_OS=볼트경로 API=https://… EN_USER=아이디 EN_PASS=비번 npm run english:sync [-- --dry-run] [-- --to=YYYY-MM-DD]
// 하는 일은 딱 두 가지예요:
//   1) 공부한 날(minutes > 0)마다 01 매일 기록/날짜.md 의 YAML 프로퍼티만 고쳐요 (본문은 안 건드림).
//      파일이 없으면 서식/오늘 기록 서식.md 로 새로 만들고 블록 표·체크리스트·오늘의 한 문장까지 채워요.
//   2) 앱의 "내가 막힌 표현" 중 볼트에 없는 줄을 05 표현/내가 막힌 표현.md 의 ## 기록 목록 끝에 붙여요.
// 두 번 돌려도 바뀌는 게 없어요. --dry-run 이면 무엇을 바꿀지만 보여 줘요.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VAULT = process.env.ENGLISH_OS || "/Users/prime/Documents/ENGLISH-OS";
const API = (process.env.API || "https://dsm-mafia.dsm-mafia.workers.dev").replace(/\/+$/, "");
const USER = process.env.EN_USER, PASS = process.env.EN_PASS;
const DRY = process.argv.includes("--dry-run");
const TO_ARG = process.argv.find((a) => a.startsWith("--to="))?.slice(5);

const DAILY_DIR = "01 매일 기록";
const TEMPLATE = "서식/오늘 기록 서식.md";
const PHRASES = "05 표현/내가 막힌 표현.md";
const KEYS = ["date", "week", "sprint", "minutes", "spoken", "newwords", "mistakes", "mood"];
const BLOCK_ROWS = [["words", "단어"], ["sound", "소리"], ["speak", "말하기"], ["recall", "인출"]];
const EXTRA_ROWS = [["pattern", "신규 패턴"], ["review", "점검"]];

const die = (msg) => { console.error("✖ " + msg); process.exit(1); };
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const localDay = (ms = Date.now()) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

if (!USER) die("EN_USER 환경변수(앱 아이디)를 넣어 주세요.");
if (!existsSync(join(VAULT, TEMPLATE))) die(`볼트를 못 찾았어요 (서식 파일 없음): ${VAULT}`);
if (TO_ARG && !/^\d{4}-\d{2}-\d{2}$/.test(TO_ARG)) die("--to 는 YYYY-MM-DD 로 적어 주세요.");

// 프로그램 시작일·스프린트는 import 가 만든 data.json 에서 (없으면 기본값)
let program = { start: "2026-09-28", end: "2027-03-28" };
let weekend = null;
let sprints = [["S1", 1, 4], ["S2", 5, 12], ["S3", 13, 20], ["S4", 21, 26]].map(([id, a, b]) => ({ id, weeks: [a, b], blocks: null }));
try {
  const data = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "english", "data.json"), "utf8"));
  program = data.program; sprints = data.sprints; weekend = data.weekend_blocks;
} catch { console.warn("⚠ public/english/data.json 이 없어서 기본 일정으로 계산해요 (npm run english:import 먼저 추천)"); }
const weekOf = (day) => Math.max(0, Math.floor(diffDays(program.start, day) / 7) + 1);
const sprintOf = (week) => (sprints.find((s) => week >= s.weeks[0] && week <= s.weeks[1]) || (week < 1 ? sprints[0] : sprints[sprints.length - 1]));

// ---------- API ----------
let cookie = "";
async function api(method, path, body) {
  const r = await fetch(API + "/api" + path, {
    method, headers: { "content-type": "application/json", "x-trio": "1", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  const data = await r.json().catch(() => null);
  if (!r.ok) die(`${method} ${path} → ${r.status} ${data?.error || ""}`);
  return data;
}

// ---------- YAML 프로퍼티 (맨 위 --- 블록만) ----------
const yamlVal = (v) => (v == null ? "" : String(v));
function setFrontmatter(md, values) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  const lines = m ? m[1].split("\n") : [];
  const changes = [];
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    const i = lines.findIndex((l) => l.startsWith(k + ":"));
    const next = `${k}: ${yamlVal(v)}`;
    if (i < 0) { lines.push(next); changes.push(`${k}: (없음) → ${yamlVal(v)}`); }
    else if (lines[i].trimEnd() !== next) { changes.push(`${k}: ${lines[i].slice(k.length + 1).trim()} → ${yamlVal(v)}`); lines[i] = next; }
  }
  const fm = `---\n${lines.join("\n")}\n---\n`;
  return { md: m ? fm + md.slice(m[0].length) : fm + "\n" + md, changes };
}
const fmValues = (d) => {
  const week = weekOf(d.day);
  return { date: d.day, week, sprint: sprintOf(week).id, minutes: d.minutes, spoken: d.spoken, newwords: d.newwords, mistakes: d.mistakes, mood: d.mood ?? undefined };
};

// 새 파일: 서식 → 날짜·프로퍼티·블록 표(목표/실제)·체크·오늘의 한 문장 채우기
// 목표 분: 평일은 스프린트 배분, 토·일은 주말 300분 배분
const isWeekend = (day) => [0, 6].includes(new Date(day + "T00:00:00Z").getUTCDay());
function fromTemplate(tpl, d) {
  const goals = isWeekend(d.day) && weekend ? weekend : sprintOf(weekOf(d.day)).blocks;
  const goalCell = (key, fallback) => (goals ? (goals[key] != null ? ` ${goals[key]}분 ` : " — ") : fallback);
  let md = tpl.replace(/\{\{date\}\}/g, d.day);
  md = setFrontmatter(md, fmValues(d)).md;
  const lines = md.split("\n");
  // 4블록 표: | # | 블록 | 목표 | 실제 |
  let lastRow = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*([1-4])\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/);
    if (!m) continue;
    const [key] = BLOCK_ROWS[Number(m[1]) - 1];
    lines[i] = `| ${m[1]} |${m[2]}|${goalCell(key, m[3])}| ${d.blocks[key] || 0}분 |`;
    lastRow = i;
  }
  // 주말 블록(신규 패턴·점검)은 쓴 날만 줄을 더해요
  const extra = EXTRA_ROWS.filter(([k]) => d.blocks[k] > 0).map(([k, label], j) => `| ${5 + j} | ${label} |${goalCell(k, " ")}| ${d.blocks[k]}분 |`);
  if (lastRow >= 0 && extra.length) lines.splice(lastRow + 1, 0, ...extra);
  // 체크리스트: 서식 순서대로 체크
  let ci = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^- \[ \]/.test(lines[i])) { if (d.checks[ci]) lines[i] = lines[i].replace("- [ ]", "- [x]"); ci++; }
  }
  // 오늘의 한 문장: 헤딩 다음 ">" 줄
  const h = lines.findIndex((l) => /^##\s+오늘의 한 문장/.test(l));
  if (h >= 0 && d.sentence) {
    const q = lines.findIndex((l, i) => i > h && /^>\s*$/.test(l));
    const text = "> " + d.sentence.replace(/\s*\n\s*/g, " ");
    if (q > h && q <= h + 2) lines[q] = text; else lines.splice(h + 1, 0, text);
  }
  return lines.join("\n");
}

// ---------- 내가 막힌 표현 ----------
const one = (s) => String(s || "").replace(/\s+/g, " ").trim();
const phraseLine = (p) => {
  const parts = [one(p.ko)];
  if (p.en || p.chunk) parts.push(one(p.en) || "?");
  if (p.chunk) parts.push(one(p.chunk));
  return `- [${p.day || localDay(p.created_at)}] ${parts.join(" → ")}`;
};
function appendPhrases(md, newLines) {
  const lines = md.split("\n");
  const h = lines.findIndex((l) => /^##\s+기록\s*$/.test(l));
  if (h < 0) die(`${PHRASES} 에 "## 기록" 헤딩이 없어요.`);
  // ## 기록 아래 목록의 끝 (다음 헤딩이나 --- 전)
  let end = h;
  for (let i = h + 1; i < lines.length && !/^(#{1,6}\s|---\s*$)/.test(lines[i]); i++) if (lines[i].startsWith("- ")) end = i;
  if (end === h) newLines = ["", ...newLines];
  lines.splice(end + 1, 0, ...newLines);
  return lines.join("\n");
}

// ---------- 실행 ----------
const login = await api("POST", "/auth/login", PASS ? { username: USER, password: PASS } : { username: USER });
console.log(`${DRY ? "[dry-run] " : ""}${login.user.display_name} (@${login.user.username}) · ${API} → ${VAULT}`);

const to = TO_ARG || localDay();
const summaries = [];
for (let from = program.start; from <= to; from = addDays(from, 400)) {
  const end = addDays(from, 399) < to ? addDays(from, 399) : to;
  summaries.push(...(await api("GET", `/english/days?from=${from}&to=${end}`)).days);
}
const studied = summaries.filter((d) => d.minutes > 0);
const tpl = readFileSync(join(VAULT, TEMPLATE), "utf8").replace(/\r\n/g, "\n");
let created = 0, updated = 0, same = 0;

for (const s of studied) {
  const rel = `${DAILY_DIR}/${s.day}.md`, abs = join(VAULT, rel);
  if (existsSync(abs)) {
    const before = readFileSync(abs, "utf8");
    const { md, changes } = setFrontmatter(before.replace(/\r\n/g, "\n"), fmValues(s));
    if (!changes.length) { same++; continue; }
    console.log(`~ ${rel} (프로퍼티만) ${changes.join(", ")}`);
    if (!DRY) writeFileSync(abs, md);
    updated++;
  } else {
    const { day } = await api("GET", `/english/day?day=${s.day}`);
    if (!day) continue;
    console.log(`+ ${rel} (서식으로 새로 만듦) ${day.minutes}분 · 입 ${day.spoken}분`);
    if (!DRY) writeFileSync(abs, fromTemplate(tpl, day));
    created++;
  }
}

const { phrases } = await api("GET", "/english/phrases");
const pAbs = join(VAULT, PHRASES);
if (!existsSync(pAbs)) die(`${PHRASES} 파일이 없어요.`);
const pMd = readFileSync(pAbs, "utf8").replace(/\r\n/g, "\n");
const have = new Set(pMd.split("\n").map((l) => l.trim()));
const add = [...phrases].reverse().map(phraseLine).filter((l, i, a) => !have.has(l) && a.indexOf(l) === i); // 오래된 것부터
for (const l of add) console.log(`+ ${PHRASES}: ${l}`);
if (add.length && !DRY) writeFileSync(pAbs, appendPhrases(pMd, add));

console.log(`${DRY ? "[dry-run] 바꿀 예정" : "끝"} — 매일 기록: 새로 ${created} · 프로퍼티 ${updated} · 그대로 ${same} / 막힌 표현 +${add.length} (앱 ${phrases.length}개)`);

// ENGLISH-OS 볼트(옵시디언) → public/english/data.json
// 볼트를 고친 뒤 `npm run english:import` 한 번이면 앱의 영어 탭 내용이 바뀌어요.
// 볼트는 읽기만 해요. 표를 못 읽으면 바로 멈추고(종료 코드 1) 어느 파일이 문제인지 알려줘요.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VAULT = process.env.ENGLISH_OS || "/Users/prime/Documents/ENGLISH-OS";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "english", "data.json");

const F = {
  stage1Days: "03 단계별 할 일/1단계 28일 일정.md",
  stage2Weeks: "03 단계별 할 일/2단계 8주 일정.md",
  daily: "02 계획/하루 3시간 쓰는 법.md",
  sentences: "05 표현/생존 문장 60.md",
  patterns: "05 표현/기초 패턴 91.md",
  fillers: "05 표현/막혔을 때 쓰는 말 8.md",
  pressure: "05 표현/압박받을 때 쓰는 말 6.md",
  smalltalk: "05 표현/스몰토크 대본 8.md",
  falseFriends: "04 단어/헷갈리는 표현 12.md",
  prompts: "07 AI 대화/복붙할 프롬프트.md",
  checkpoints: "08 녹음과 시험/2주마다 시험.md",
  template: "서식/오늘 기록 서식.md",
};
// 스프린트 이름은 파일 이름에서 (1단계 소리 익히기 → "소리 익히기")
const STAGE_FILES = {
  S1: "03 단계별 할 일/1단계 소리 익히기.md",
  S2: "03 단계별 할 일/2단계 단어 쌓기.md",
  S3: "03 단계별 할 일/3단계 말하기 전환.md",
  S4: "03 단계별 할 일/4단계 실전 준비.md",
};

// ---------- 작은 도구들 ----------
let current = "";
const die = (msg) => { console.error(`✖ ${current ? `[${current}] ` : ""}${msg}`); process.exit(1); };
const need = (cond, msg) => { if (!cond) die(msg); };
function read(rel) {
  current = rel;
  const p = join(VAULT, rel);
  need(existsSync(p), `파일이 없어요: ${p}`);
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n");
}
// [[a|b]] → b, [[a]] → a의 마지막 이름
const unlink = (s) => s.replace(/\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g, (_, a, b) => (b || a.split("/").pop()).trim());
// 굵게·코드 표시만 걷어내요 (___ 빈칸은 그대로)
const clean = (s) => unlink(String(s ?? "")).replace(/\\\|/g, "|").replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
// 여러 줄 설명글용: 줄바꿈은 살리고 굵게·코드 표시만 걷어내요
const plain = (s) => unlink(String(s ?? "")).replace(/\*\*/g, "").replace(/`/g, "").trim();
const unquote = (s) => s.replace(/^"(.*)"$/, "$1").trim();
const num = (s) => { const m = String(s).replace(/,/g, "").match(/\d+/); return m ? Number(m[0]) : NaN; };
const pad = (n) => String(n).padStart(2, "0");
// "09-28" → 2026-09-28 (9~12월은 2026, 1~8월은 2027)
const mmdd = (s) => {
  const m = String(s).match(/(\d{1,2})-(\d{1,2})/);
  need(m, `날짜를 못 읽었어요: "${s}"`);
  return `${Number(m[1]) >= 9 ? 2026 : 2027}-${pad(m[1])}-${pad(m[2])}`;
};
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

// 표 한 줄 → 칸들 (\| 는 칸 나눔이 아님)
const cells = (line) => {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split(/(?<!\\)\|/).map((c) => c.trim());
};
const isSep = (line) => /^\|?\s*:?-{2,}/.test(line.trim()) && /^[\s|:-]+$/.test(line.trim());

// 문서를 훑어서 표마다 { h2, h3, header, rows, line } 로 모아요
function tables(md) {
  const lines = md.split("\n");
  const out = [];
  let h2 = "", h3 = "", inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim().startsWith("```")) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (/^##\s/.test(l)) { h2 = l.replace(/^##\s+/, "").trim(); h3 = ""; continue; }
    if (/^###\s/.test(l)) { h3 = l.replace(/^###\s+/, "").trim(); continue; }
    if (l.trim().startsWith("|") && lines[i + 1] && isSep(lines[i + 1])) {
      const header = cells(l).map(clean);
      const rows = [];
      let j = i + 2;
      for (; j < lines.length && lines[j].trim().startsWith("|"); j++) rows.push(cells(lines[j]));
      out.push({ h2, h3, header, rows, line: i + 1 });
      i = j - 1;
    }
  }
  return out;
}
const col = (t, name) => {
  const i = t.header.findIndex((h) => h.includes(name));
  need(i >= 0, `${t.line}번째 줄 표에 "${name}" 칸이 없어요 (칸: ${t.header.join(" | ")})`);
  return i;
};
// ## 헤딩 기준으로 나누기
function sections(md, re) {
  const out = [];
  let cur = null, inCode = false;
  for (const l of md.split("\n")) {
    if (l.trim().startsWith("```")) inCode = !inCode;
    const m = !inCode && l.match(re);
    if (m) { cur = { m, lines: [] }; out.push(cur); continue; }
    if (!inCode && /^##\s/.test(l) && cur) { cur = null; continue; }
    if (cur) cur.lines.push(l);
  }
  return out;
}
const codeBlocks = (lines) => {
  const out = [];
  let buf = null, before = [], after = [];
  for (const l of lines) {
    if (l.trim().startsWith("```")) {
      if (buf) { out.push(buf.join("\n")); buf = null; } else buf = [];
      continue;
    }
    if (buf) buf.push(l); else (out.length ? after : before).push(l);
  }
  need(!buf, "``` 코드 블록이 닫히지 않았어요");
  return { blocks: out, before, after };
};
const prose = (lines) => lines.filter((l) => l.trim() !== "---").join("\n").trim();

// ---------- 스프린트 · 하루 블록 ----------
const BLOCK_KEY = [["단어", "words"], ["소리", "sound"], ["말하기", "speak"], ["인출", "recall"], ["패턴", "pattern"], ["점검", "review"]];
const blockKey = (label) => BLOCK_KEY.find(([k]) => clean(label).includes(k))?.[1];

const stage_notes = {};
const sprints = [];
for (const [id, rel] of Object.entries(STAGE_FILES)) {
  const md = read(rel);
  const range = md.match(/\(W(\d+)[–-](\d+)\)/);
  need(range, "첫 줄에 (W1–4) 같은 주차 범위가 없어요");
  const meta = md.match(/\*\*(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})\s*·\s*(\d+)시간\s*·\s*목표\s*([^*]+)\*\*/);
  need(meta, "**시작 → 끝 · N시간 · 목표 X** 줄을 못 찾았어요");
  sprints.push({
    id, name: rel.split("/").pop().replace(/\.md$/, "").replace(/^\d단계\s*/, ""),
    weeks: [Number(range[1]), Number(range[2])], from: meta[1], to: meta[2],
    hours: Number(meta[3]), goal: meta[4].trim(), blocks: {},
  });
  stage_notes[id] = unlink(md).trim();
}

let weekend_blocks = {};
{
  const md = read(F.daily);
  const ts = tables(md);
  const sp = ts.find((t) => t.header[0] === "블록" && t.header.includes("S1"));
  need(sp, "스프린트별 블록 배분 표(블록 | S1 | S2 | S3 | S4)를 못 찾았어요");
  for (const row of sp.rows) {
    const key = blockKey(row[0]);
    if (!key) continue; // "입 연 시간 비중" 줄은 건너뛰어요
    for (const s of sprints) {
      const v = num(row[sp.header.indexOf(s.id)]);
      need(Number.isFinite(v), `${s.id} ${row[0]} 분을 못 읽었어요`);
      s.blocks[key] = v;
    }
  }
  for (const s of sprints) need(["words", "sound", "speak", "recall"].every((k) => s.blocks[k] > 0), `${s.id} 블록 4개가 다 안 채워졌어요`);
  const we = ts.find((t) => t.h2.startsWith("주말"));
  need(we, "## 주말 표를 못 찾았어요");
  for (const row of we.rows) {
    const key = blockKey(row[0]);
    need(key, `주말 블록 "${row[0]}"을(를) 모르겠어요`);
    weekend_blocks[key] = num(row[col(we, "시간")]);
  }
  need(Object.keys(weekend_blocks).length === 5, "주말 블록이 5개가 아니에요");
}

// ---------- 1단계 28일 ----------
const stage1_days = [];
{
  const md = read(F.stage1Days);
  for (const t of tables(md).filter((t) => t.header[0] === "일차")) {
    const wm = t.h2.match(/^(\d+)주차\s*[—-]\s*(.+)$/);
    need(wm, `${t.line}번째 줄 표 위에 "## N주차 — 제목" 헤딩이 없어요`);
    const iDay = col(t, "일차"), iDate = col(t, "날짜"), iTask = col(t, "소리");
    const iSent = t.header.findIndex((h) => h.includes("생존 문장"));
    const iListen = t.header.findIndex((h) => h.includes("듣기"));
    for (const r of t.rows) {
      const label = iSent >= 0 ? clean(r[iSent]) : "";
      const rg = label.match(/(\d+)\s*~\s*(\d+)/);
      const sentences = rg ? [Number(rg[1]), Number(rg[2])] : label.includes("전체") ? [1, 60] : null;
      const day = { day: num(r[iDay]), date: mmdd(r[iDate]), week: Number(wm[1]), week_title: clean(wm[2]), task: clean(r[iTask]), sentences, sentences_label: label || null };
      if (iListen >= 0) day.listen = clean(r[iListen]);
      stage1_days.push(day);
    }
  }
  need(stage1_days.length === 28, `28일이어야 하는데 ${stage1_days.length}일을 읽었어요`);
  stage1_days.forEach((d, i) => need(d.day === i + 1, `${i + 1}일차 순서가 이상해요 (${d.day})`));
}

// ---------- 2단계 8주 ----------
const stage2_weeks = [];
{
  const md = read(F.stage2Weeks);
  const t = tables(md).find((t) => t.h2 === "한눈에");
  need(t, "## 한눈에 표를 못 찾았어요");
  const i = { w: col(t, "주차"), p: col(t, "기간"), pat: col(t, "패턴"), inp: col(t, "인풋"), sp: col(t, "말하기"), a: col(t, "Anki") };
  for (const r of t.rows) {
    const [from, to] = clean(r[i.p]).split("~").map((s) => mmdd(s));
    need(from && to, `기간을 못 읽었어요: ${r[i.p]}`);
    stage2_weeks.push({ week: num(r[i.w]), from, to, patterns: clean(r[i.pat]), input: clean(r[i.inp]), speaking: clean(r[i.sp]), anki: clean(r[i.a]) });
  }
  need(stage2_weeks.length === 8, `8주여야 하는데 ${stage2_weeks.length}주를 읽었어요`);
}

// ---------- 표현들 ----------
const sentences = [];
{
  const md = read(F.sentences);
  for (const t of tables(md).filter((t) => t.header[0] === "#")) {
    const group = t.h2.replace(/\s*\(.*$/, "").replace(/\s*←.*$/, "").trim();
    for (const r of t.rows) sentences.push({ n: num(r[0]), en: clean(r[col(t, "영어")]), ko: clean(r[col(t, "한국어")]), group });
  }
  need(sentences.length === 60, `생존 문장이 60개가 아니라 ${sentences.length}개예요`);
  sentences.forEach((s, i) => need(s.n === i + 1 && s.en && s.ko, `${i + 1}번 문장이 비었거나 순서가 이상해요`));
}

const patterns = [];
{
  const md = read(F.patterns);
  for (const t of tables(md).filter((t) => t.header[0] === "패턴")) {
    const m = t.h2.match(/^(\d+)주차\s*·\s*(.+)$/);
    need(m, `${t.line}번째 줄 표 위에 "## N주차 · 묶음" 헤딩이 없어요`);
    t.rows.forEach((r, k) => patterns.push({ id: `${m[1]}-${k + 1}`, week: Number(m[1]), group: clean(m[2]), pattern: clean(r[0]), meaning: clean(r[col(t, "뜻")]), example: clean(r[col(t, "예문")]) }));
  }
  need(patterns.length === 91, `기초 패턴이 91개가 아니라 ${patterns.length}개예요`);
}

const fillers = [];
{
  const md = read(F.fillers);
  const t = tables(md).find((t) => t.header[0] === "표현");
  need(t, "표현 | 한국어 | 언제 표를 못 찾았어요");
  t.rows.forEach((r, k) => fillers.push({ id: `f${k + 1}`, en: clean(r[0]), ko: clean(r[col(t, "한국어")]), when: clean(r[col(t, "언제")]) }));
  need(fillers.length >= 1, "시간 벌기 표현이 없어요");
}

// 압박 표현은 표가 아니라 ### n. 상황 → > `영어` → > "한국어" → **효과** / **왜 통하나**
const pressure = [];
{
  const md = read(F.pressure);
  const parts = md.split(/\n(?=###\s)/).filter((p) => /^###\s+\d+\./.test(p));
  for (const p of parts) {
    const when = clean(p.match(/^###\s+\d+\.\s*(.+)/)[1]);
    const en = p.match(/^>\s*`([^`]+)`/m);
    const ko = p.match(/^>\s*"([^"]+)"/m);
    need(en && ko, `"${when}" 에서 영어/한국어 줄을 못 찾았어요`);
    const effect = p.match(/\*\*효과\*\*\s*[—-]\s*(.+)/);
    const why = p.match(/\*\*왜 통하나\*\*\s*[—-]\s*(.+)/);
    pressure.push({ id: `r${pressure.length + 1}`, en: clean(en[1]), ko: clean(ko[1]), when, effect: effect ? clean(effect[1]) : null, why: why ? clean(why[1]) : null });
  }
  need(pressure.length >= 1, "압박 표현(### 1. …)을 하나도 못 읽었어요");
}

const smalltalk = [];
{
  const md = read(F.smalltalk);
  for (const s of sections(md, /^##\s+(\d+)\.\s*(.+)$/)) {
    const id = Number(s.m[1]), title = clean(s.m[2]);
    const tip = s.lines.find((l) => l.startsWith("> 💡"));
    const item = { id, title, kind: "dialog", lines: [], tip: tip ? clean(tip.replace(/^>\s*💡\s*/, "")) : null };
    const t = tables(s.lines.join("\n"))[0];
    if (t) {
      const iKo = t.header.findIndex((h) => h.includes("한국어"));
      if (iKo < 0) item.kind = "pitch"; // 3번: 문제·해결·성과·요청 (한국어 없음)
      item.lines = t.rows.map((r) => ({ who: clean(r[0]), en: clean(r[col(t, "영어")]), ko: iKo >= 0 ? clean(r[iKo]) : null }));
    } else {
      const { blocks } = codeBlocks(s.lines);
      need(blocks.length, `스몰토크 ${id}번에 표도 코드 블록도 없어요`);
      item.kind = "email";
      item.text = blocks[0].trim();
      item.lines = item.text.split("\n").filter((l) => l.trim()).map((l) => ({ who: "A", en: l.trim(), ko: null }));
    }
    need(item.lines.length, `스몰토크 ${id}번 줄이 비었어요`);
    smalltalk.push(item);
  }
  need(smalltalk.length === 8, `스몰토크가 8개가 아니라 ${smalltalk.length}개예요`);
}

const false_friends = [];
{
  const md = read(F.falseFriends);
  for (const t of tables(md).filter((t) => t.header[0] === "표현")) {
    const iReply = t.header.findIndex((h) => h.includes("대응"));
    const group = t.h2.replace(/^[^\p{L}\p{N}]+/u, "").trim();
    for (const r of t.rows) false_friends.push({
      id: `x${false_friends.length + 1}`, group, expr: unquote(clean(r[0])),
      sounds: clean(r[col(t, "들린다")]), means: clean(r[col(t, "실제 의미")]), reply: iReply >= 0 ? clean(r[iReply]) || null : null,
    });
  }
  need(false_friends.length === 12, `헷갈리는 표현이 12개가 아니라 ${false_friends.length}개예요`);
}

// ---------- AI 프롬프트 ----------
const MARKS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";
const sprintOfWeek = (w) => sprints.find((s) => w >= s.weeks[0] && w <= s.weeks[1])?.id;
const prompts = [];
{
  const md = read(F.prompts);
  for (const s of sections(md, new RegExp(`^##\\s+([${MARKS}])\\s*(.+)$`, "u"))) {
    const mark = s.m[1];
    const hm = s.m[2].match(/^(.*?)\s*\(([^)]*)\)\s*(?:[—-]\s*(.*))?$/);
    const title = clean(hm ? hm[1] : s.m[2]), when = hm ? clean(hm[2]) : null;
    const { blocks, before, after } = codeBlocks(s.lines);
    need(blocks.length === 1, `${mark} 프롬프트에 코드 블록이 ${blocks.length}개예요 (1개여야 해요)`);
    // 어느 스프린트용인지: 제목의 S1~S4 + (W13–20) 같은 주차 → 없으면 전체
    const set = new Set((title + " " + (when || "")).match(/S[1-4]/g) || []);
    const wr = (when || "").match(/W(\d+)[–-](\d+)/);
    if (wr) for (let w = Number(wr[1]); w <= Number(wr[2]); w++) set.add(sprintOfWeek(w));
    if (/Day 0/.test(when || "")) set.add("S1");
    const list = set.size ? [...set].filter(Boolean).sort() : sprints.map((x) => x.id);
    prompts.push({ id: MARKS.indexOf(mark) + 1, mark, title, when, sprints: list, note: hm?.[3] ? clean(hm[3]) : null, intro: plain(prose(before)), text: blocks[0].replace(/\s+$/, ""), after: plain(prose(after)) || null });
  }
  need(prompts.length === 11, `프롬프트가 11개가 아니라 ${prompts.length}개예요`);
}

// ---------- 체크포인트 · 오늘 기록 체크리스트 ----------
const checkpoints = [];
{
  const md = read(F.checkpoints);
  const t = tables(md).find((t) => t.header[0] === "#" && t.header.some((h) => h.includes("통과")));
  need(t, "체크포인트 표(# | 날짜 | 구간 | 테스트 | 통과 기준)를 못 찾았어요");
  for (const r of t.rows) {
    const date = clean(r[col(t, "날짜")]);
    need(/^\d{4}-\d{2}-\d{2}$/.test(date), `체크포인트 날짜를 못 읽었어요: ${date}`);
    checkpoints.push({ id: clean(r[0]), date, span: clean(r[col(t, "구간")]), test: clean(r[col(t, "테스트")]), pass: clean(r[col(t, "통과")]) });
  }
  need(checkpoints.length === 13, `체크포인트가 13개가 아니라 ${checkpoints.length}개예요`);
}
const daily_checks = read(F.template).split("\n").filter((l) => /^- \[ \]/.test(l)).map((l) => clean(l.replace(/^- \[ \]\s*/, "")));
need(daily_checks.length >= 1, "서식에 - [ ] 체크 줄이 없어요");

// ---------- 합쳐서 쓰기 ----------
current = "";
const start = stage1_days[0].date, end = sprints[3].to;
need(start === sprints[0].from, `1일차(${start})와 S1 시작(${sprints[0].from})이 달라요`);
const data = {
  source: "ENGLISH-OS", generated_at: new Date().toISOString(),
  program: { start, end, goal_hours: sprints.reduce((a, s) => a + s.hours, 0), days: diffDays(start, end) + 1 },
  sprints: sprints.map(({ id, name, weeks, from, to, blocks, hours, goal }) => ({ id, name, weeks, from, to, blocks, hours, goal })),
  weekend_blocks, stage1_days, stage2_weeks, stage_notes, sentences, patterns, fillers, pressure, smalltalk, false_friends, prompts, checkpoints, daily_checks,
};
// 날짜가 프로그램 시작일 기준 주차와 안 맞으면 알려만 줘요 (볼트 쪽 표기 그대로 둠)
const off = stage2_weeks.filter((w) => w.from !== addDays(start, (w.week - 1) * 7));
if (off.length) console.warn(`⚠ 2단계 표의 기간이 프로그램 주차와 달라요 (${off.map((w) => `W${w.week} ${w.from}≠${addDays(start, (w.week - 1) * 7)}`).slice(0, 2).join(", ")}…) — 볼트 표기를 그대로 써요`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
const counts = Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ${v.length}`);
console.log(`✔ ${OUT}`);
console.log(`  program ${start} → ${end} · ${data.program.days}일 · ${data.program.goal_hours}시간`);
console.log(`  ${counts.join(" · ")} · stage_notes ${Object.keys(stage_notes).length} · weekend_blocks ${Object.keys(weekend_blocks).length}`);

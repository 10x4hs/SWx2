// 경영 마이크로디그리 모듈 목록 만들기
//   node scripts/mba-index.mjs          public/mba/index.json 을 새로 써요 (모듈 파일의 카드 목록 + 아래 모듈 소개)
//   node scripts/mba-index.mjs --check  모듈 파일 규칙 검사 + 목록이 낡았으면 실패 (npm test 가 불러요)
// 모듈 순서 · 단계 · '9개교 중 필수' 는 MBA 9개교 조사(2025-26 공식 커리큘럼)의 12모듈 압축안을 따라요.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "mba");
const META = [
  ["accounting", "01", "회계", "재무제표 세 장 · 원가 · 손익분기", "도구", "9/9", "재무제표 세 장이 서로 어떻게 이어지는지, 이익과 현금이 왜 다른지 배워요."],
  ["data", "02", "데이터와 결정", "평균의 함정 · 표본 · 실험 · 편향", "도구", "9/9", "숫자 한 개에 속지 않는 법. 표본과 실험으로 결정을 검증해요."],
  ["economics", "03", "경제학", "기회비용 · 수요와 공급 · 금리 · 환율", "도구", "9/9", "가격이 어떻게 정해지는지와 금리 · 환율이 회사에 닿는 길."],
  ["finance", "04", "재무", "현재가치 · 위험과 수익 · 자금 조달", "기능", "9/9", "오늘의 1원과 내년의 1원이 왜 다른지부터 회사 가치까지."],
  ["marketing", "05", "마케팅", "고객 · 포지셔닝 · 가격 · 퍼널", "기능", "9/9", "누구에게, 무엇을, 얼마에 — 고르는 순서를 배워요."],
  ["operations", "06", "운영", "프로세스 · 병목 · 품질 · 재고", "기능", "9/9*", "일이 막히는 한 지점(병목)을 찾는 눈을 길러요. (*MIT는 4과목 중 하나를 고르는 필수)"],
  ["people", "07", "사람과 조직", "동기 · 인센티브 · 팀 · 편향", "기능", "9/9", "사람은 보상과 구조대로 움직여요. 팀이 잘 되는 조건."],
  ["strategy", "08", "전략", "5 Forces · 경쟁우위 · 파괴적 혁신", "통합", "9/9", "어디서 싸우고, 무엇으로 이기는지 고르는 일."],
  ["leadership", "09", "리더십 · 협상", "피드백 · 설득 · BATNA · 앵커링", "통합", "5/9 · 협상 3/9", "말과 글로 사람을 움직이고, 협상에서 가치를 키워요."],
  ["ethics-law", "10", "윤리 · 법 · 사회", "이해관계자 · 규제 · 개인정보 · 지식재산", "통합", "5/9", "회사가 지켜야 할 선과, 법이 닿는 순간들."],
  ["startup", "11", "창업과 법인", "검증 · 법인 설립 · 지분 · 투자", "실행", "2/9", "아이디어를 검증하고 회사를 실제로 세우는 절차."],
  ["capstone", "12", "캡스톤", "실제 회사 한 곳 + AI로 분석", "실행", "3/9 (구조)", "1~11의 도구로 실제 상장사 하나를 끝까지 분석해요."],
];
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const TYPES = new Set(["profitMap", "breakEven", "ppf", "supplyDemand", "statements", "compound", "dilution", "funnel", "bars", "table", "flow", "matrix", "bottleneck"]);

const problems = [];
const modules = META.map(([id, no, title, sub, phase, schools, what]) => {
  const f = join(DIR, `${id}.json`);
  if (!existsSync(f)) { problems.push(`${id}.json 이 없어요`); return { id, no, title, sub, phase, schools, what, cards: [] }; }
  const d = JSON.parse(readFileSync(f, "utf8"));
  if (d.id !== id) problems.push(`${id}.json: id 가 ${d.id}`);
  const seen = new Set();
  for (const c of d.cards || []) {
    const w = `${id}/${c.id}`;
    if (!ID.test(c.id || "") || seen.has(c.id) || c.id === "case" || c.id === "practice") problems.push(`${w}: 카드 id`); seen.add(c.id); // case · practice 는 주소에 써요
    if (!c.title || !c.recall?.q || !Array.isArray(c.idea) || !c.idea.length) problems.push(`${w}: title · recall · idea`);
    if (c.visual != null && !TYPES.has(c.visual.type)) problems.push(`${w}: 그림 종류 ${c.visual.type}`);
    for (const q of c.quiz || []) if (!Array.isArray(q.choices) || !(q.answer >= 0 && q.answer < q.choices.length)) problems.push(`${w}: 퀴즈 답 번호`);
  }
  for (const k of d.cases || []) if (!ID.test(k.id || "") || seen.has(k.id)) problems.push(`${id}/${k.id}: 케이스 id`); else seen.add(k.id);
  for (const p of d.problems || []) {
    if (!ID.test(p.id || "") || seen.has(p.id)) problems.push(`${id}/${p.id}: 문제 id`); else seen.add(p.id);
    if (p.type === "number" ? !Number.isFinite(p.answer) : !(Array.isArray(p.choices) && p.answer >= 0 && p.answer < p.choices.length)) problems.push(`${id}/${p.id}: 문제 답`);
  }
  for (const l of d.lectures || []) { if (!ID.test(l.id || "") || seen.has(l.id)) problems.push(`${id}/${l.id}: 강의 id`); else seen.add(l.id); if (!/^https:\/\//.test(l.url || "")) problems.push(`${id}/${l.id}: 강의 주소`); }
  return {
    id, no, title, sub, phase, schools, what, intro: d.intro || "", goals: d.goals || [],
    cards: (d.cards || []).map((c) => ({ id: c.id, title: c.title, min: c.min, day: c.day || 1 })),
    cases: (d.cases || []).map((k) => ({ id: k.id, title: k.title, min: k.min, day: k.day })),
    problems: (d.problems || []).map((p) => ({ id: p.id, day: p.day, card: p.card || null, type: p.type })),
    lectures: (d.lectures || []).map((l) => ({ id: l.id, title: l.title, provider: l.provider, url: l.url, min: l.min, day: l.day, lang: l.lang || "" })),
  };
});
const out = JSON.stringify({ version: 2, note: "node scripts/mba-index.mjs 가 모듈 파일에서 만들어요. 손으로 고치지 마세요.", modules }, null, 2) + "\n";
const file = join(DIR, "index.json");
if (process.argv[2] === "--check") {
  if (problems.length) { console.error("경영 마이크로디그리 모듈 파일 문제:\n  " + problems.join("\n  ")); process.exit(1); }
  if (!existsSync(file) || readFileSync(file, "utf8") !== out) { console.error("public/mba/index.json 이 낡았어요 → node scripts/mba-index.mjs"); process.exit(1); }
  console.log(`mba 모듈 ${modules.length}개 · 카드 ${modules.reduce((n, m) => n + m.cards.length, 0)}장 · 케이스 ${modules.reduce((n, m) => n + m.cases.length, 0)} · 문제 ${modules.reduce((n, m) => n + m.problems.length, 0)} · 강의 ${modules.reduce((n, m) => n + m.lectures.length, 0)} 최신`);
} else {
  if (problems.length) console.warn("주의:\n  " + problems.join("\n  "));
  writeFileSync(file, out);
  console.log(`index.json 썼어요 — 모듈 ${modules.length}개 · 카드 ${modules.reduce((n, m) => n + m.cards.length, 0)}장 · 케이스 ${modules.reduce((n, m) => n + m.cases.length, 0)} · 문제 ${modules.reduce((n, m) => n + m.problems.length, 0)} · 강의 ${modules.reduce((n, m) => n + m.lectures.length, 0)}`);
}

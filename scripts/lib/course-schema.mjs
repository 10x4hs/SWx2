// One course schema for the card courses (MBA · SW space: dev · vg · onto · aip).
// Content files stay as they are: each course has an adapter that checks its module file
// (public/<dir>/<id>.json) with the shared rules plus its own, and maps it to an index entry.
// The index entry keeps each course's existing shape byte for byte, so the client, the server
// (src/mba.js registerCourse) and saved progress (<key>_reads · _days · _done) are untouched.
//
// Shared shape (every index.json):  { version, note, modules: [ { id, no, title, ...,
//   cards:[{id,title,day,...}], cases:[{id,title,day}], problems:[{id,day,...}], lectures:[{id,title,url,min,day,lang}] } ] }
// Progress keys are `${module}/${item}` for every item kind (cards in <key>_reads, the rest in <key>_done).

export const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const RESERVED = new Set(["case", "practice", "docs"]); // card ids that collide with route words

// ---------- shared rules ----------
// Each takes the module doc and a `bad(msg)` sink, and returns nothing.
export function uniqueIds(seen, bad) {
  return (x, what) => { if (!ID.test(x || "") || seen.has(x)) bad(`${what} id ${x}`); seen.add(x); };
}
export const httpsUrl = (u) => /^https:\/\//.test(u || "");
export const validAnswer = (list, a) => Array.isArray(list) && a >= 0 && a < list.length;
export const coreCard = (c) => !!(c.title && c.recall?.q && Array.isArray(c.idea) && c.idea.length);

// ---------- adapters ----------
const SW_ORDERS = {
  dev: ["company", "mvp", "requirements", "ux", "architecture", "data", "security", "planning", "repo", "release", "ops", "lead"],
  vg: ["vg-embeddings", "vg-ann-index", "vg-vector-db", "vg-hybrid-search", "vg-rag", "vg-graph-model", "vg-kg-algo", "vg-graphrag"],
  onto: ["onto-what", "onto-logic", "onto-rdf", "onto-graphs", "onto-build", "onto-standards", "onto-ai", "onto-world"],
  aip: ["aip-palantir", "aip-objects", "aip-actions", "aip-data", "aip-apps", "aip-llm", "aip-cases", "aip-critique"],
};

// SW space course: 20 cards (4 a day × 5 days) · 2 cases · 15 meeting-room problems (one right option) · 3–6 lectures · sourced cards
function swAdapter(key) {
  const order = SW_ORDERS[key];
  return {
    key, dir: key, version: 1, cmd: `node scripts/course-index.mjs ${key}`,
    note: "node scripts/course-index.mjs 가 모듈 파일에서 만들어요. 손으로 고치지 마세요.",
    modules: order.map((id, i) => ({ id, no: String(i + 1).padStart(2, "0") })),
    missing: ({ id, no }) => ({ id, no, title: id, short: id, q: "", sub: "", doc: "", goals: [], story: { title: "", size: 0 }, cards: [], cases: [], problems: [], lectures: [] }),
    check(d, { id, no }, bad) {
      if (d.id !== id) bad(`id 가 ${d.id}`);
      if (d.no !== no) bad(`no 가 ${d.no} (${no} 이어야 해요)`);
      for (const k of ["title", "short", "q", "sub", "doc"]) if (!d[k]) bad(`${k} 이 비었어요`);
      if (!d.story?.title || !Array.isArray(d.story.body) || !d.story.body.length) bad("story");
      const uniq = uniqueIds(new Set(), bad), cards = d.cards || [];
      if (cards.length !== 20) bad(`카드 ${cards.length}장 (20장이어야 해요)`);
      cards.forEach((c, j) => {
        uniq(c.id, "카드");
        if (RESERVED.has(c.id)) bad(`카드 id ${c.id} 는 주소에 써요`);
        if (c.day !== Math.floor(j / 4) + 1) bad(`${c.id}: day ${c.day} (하루 4장 순서)`);
        if (!c.lead || !coreCard(c)) bad(`${c.id}: title · lead · idea · recall`);
        if (!Array.isArray(c.sources) || !c.sources.length || c.sources.some((s) => !s.title)) bad(`${c.id}: 출처`);
        for (const q of c.quiz || []) if (!validAnswer(q.options, q.answer)) bad(`${c.id}: 퀴즈 답 번호`);
        if (c.code && (typeof c.code.text !== "string" || c.code.text.split("\n").length > 8 || !c.code.read)) bad(`${c.id}: 코드는 8줄 이하 + 읽는 법`);
      });
      if ((d.cases || []).length !== 2) bad(`사례 ${(d.cases || []).length}개 (2개)`);
      for (const k of d.cases || []) { uniq(k.id, "사례"); if (!k.sources?.length || !k.timeline?.length || !k.questions?.length) bad(`${k.id}: 출처 · 타임라인 · 질문`); }
      if ((d.problems || []).length !== 15) bad(`문제 ${(d.problems || []).length}개 (15개)`);
      for (const p of d.problems || []) {
        uniq(p.id, "문제");
        if (!(p.day >= 1 && p.day <= 5)) bad(`${p.id}: day`);
        if (!Array.isArray(p.options) || p.options.filter((o) => o.ok).length !== 1) bad(`${p.id}: 정답은 하나`);
      }
      const lec = d.lectures || [];
      if (lec.length < 3 || lec.length > 6) bad(`강의 ${lec.length}개 (3~6)`);
      for (const l of lec) { uniq(l.id, "강의"); if (!httpsUrl(l.url)) bad(`${l.id}: 강의 주소`); }
    },
    entry: (d, { id, no }) => ({
      id, no, title: d.title, short: d.short, q: d.q, sub: d.sub, doc: d.doc, goals: d.goals || [],
      story: { title: d.story?.title || "", size: d.story?.size || 0 },
      cards: (d.cards || []).map((c) => ({ id: c.id, title: c.title, day: c.day })),
      cases: (d.cases || []).map((k) => ({ id: k.id, title: k.title, day: k.day })),
      problems: (d.problems || []).map((p) => ({ id: p.id, title: p.title, day: p.day, mixed: !!p.mixed })),
      lectures: (d.lectures || []).map((l) => ({ id: l.id, title: l.title, url: l.url, min: l.min, day: l.day, lang: l.lang || "" })),
    }),
    summary: (s) => `${key} 모듈 ${s.modules}개 · 카드 ${s.cards}장 · 사례 ${s.cases} · 문제 ${s.problems} · 강의 ${s.lectures}`,
  };
}

// MBA: module intro lives here (order · phase · '9개교 중 필수' from the 9-school MBA survey, 2025-26)
const MBA_META = [
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
const MBA_VISUALS = new Set(["profitMap", "breakEven", "ppf", "supplyDemand", "statements", "compound", "dilution", "funnel", "bars", "table", "flow", "matrix", "bottleneck"]);

const mbaAdapter = {
  key: "mba", dir: "mba", version: 2, cmd: "node scripts/course-index.mjs mba",
  note: "node scripts/course-index.mjs 가 모듈 파일에서 만들어요. 손으로 고치지 마세요.",
  modules: MBA_META.map(([id, no, title, sub, phase, schools, what]) => ({ id, no, title, sub, phase, schools, what })),
  missing: (m) => ({ ...m, cards: [] }),
  check(d, { id }, bad) {
    if (d.id !== id) bad(`id 가 ${d.id}`);
    const seen = new Set(), uniq = uniqueIds(seen, bad);
    for (const c of d.cards || []) {
      uniq(c.id, "카드");
      if (RESERVED.has(c.id) && c.id !== "docs") bad(`카드 id ${c.id} 는 주소에 써요`);
      if (!coreCard(c)) bad(`${c.id}: title · recall · idea`);
      if (c.visual != null && !MBA_VISUALS.has(c.visual.type)) bad(`${c.id}: 그림 종류 ${c.visual.type}`);
      for (const q of c.quiz || []) if (!validAnswer(q.choices, q.answer)) bad(`${c.id}: 퀴즈 답 번호`);
    }
    for (const k of d.cases || []) uniq(k.id, "케이스");
    for (const p of d.problems || []) {
      uniq(p.id, "문제");
      if (p.type === "number" ? !Number.isFinite(p.answer) : !validAnswer(p.choices, p.answer)) bad(`${p.id}: 문제 답`);
    }
    for (const l of d.lectures || []) { uniq(l.id, "강의"); if (!httpsUrl(l.url)) bad(`${l.id}: 강의 주소`); }
  },
  entry: (d, m) => ({
    ...m, intro: d.intro || "", goals: d.goals || [],
    cards: (d.cards || []).map((c) => ({ id: c.id, title: c.title, min: c.min, day: c.day || 1 })),
    cases: (d.cases || []).map((k) => ({ id: k.id, title: k.title, min: k.min, day: k.day })),
    problems: (d.problems || []).map((p) => ({ id: p.id, day: p.day, card: p.card || null, type: p.type })),
    lectures: (d.lectures || []).map((l) => ({ id: l.id, title: l.title, provider: l.provider, url: l.url, min: l.min, day: l.day, lang: l.lang || "" })),
  }),
  summary: (s) => `mba 모듈 ${s.modules}개 · 카드 ${s.cards}장 · 케이스 ${s.cases} · 문제 ${s.problems} · 강의 ${s.lectures}`,
};

export const ADAPTERS = { mba: mbaAdapter, dev: swAdapter("dev"), vg: swAdapter("vg"), onto: swAdapter("onto"), aip: swAdapter("aip") };

// Build one course's index from its module docs. `read(id)` returns the parsed module doc or null (missing file).
// Returns { text, index, problems, summary } — text is the exact index.json content.
export function buildIndex(adapter, read) {
  const problems = [];
  const modules = adapter.modules.map((m) => {
    const d = read(m.id);
    if (!d) { problems.push(`${m.id}.json 이 없어요`); return adapter.missing(m); }
    adapter.check(d, m, (msg) => problems.push(`${m.id}: ${msg}`));
    return adapter.entry(d, m);
  });
  const index = { version: adapter.version, note: adapter.note, modules };
  const sum = (k) => modules.reduce((n, x) => n + (x[k] || []).length, 0);
  const summary = adapter.summary({ modules: modules.length, cards: sum("cards"), cases: sum("cases"), problems: sum("problems"), lectures: sum("lectures") });
  return { text: JSON.stringify(index, null, 2) + "\n", index, problems, summary };
}

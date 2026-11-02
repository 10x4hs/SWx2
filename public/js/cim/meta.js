// CIM(투자자산운용사) — 장 목록 · 과목 · 문항 수. 내용(핵심포인트 · 문제)은 public/cim/<장>.json 에서 필요할 때만 받아요.
// 이 목록은 public/cim/*.json 에서 뽑았어요 (np = 핵심포인트 수 · nq = 문제 수). 내용을 바꾸면 숫자도 같이 고쳐 주세요.
export const CHS = [
  {"id":"s1c1","s":1,"c":1,"t":"세제관련 법규 및 세무전략","pg":"20","np":32,"nq":160},
  {"id":"s1c2","s":1,"c":2,"t":"금융상품","pg":"78","np":28,"nq":140},
  {"id":"s1c3","s":1,"c":3,"t":"부동산관련 상품","pg":"122","np":19,"nq":95},
  {"id":"s2c1","s":2,"c":1,"t":"대안투자운용 및 투자전략","pg":"158","np":24,"nq":120},
  {"id":"s2c2","s":2,"c":2,"t":"해외증권투자운용 및 투자전략","pg":"196","np":15,"nq":75},
  {"id":"s2c3","s":2,"c":3,"t":"투자분석기법 - 기본적 분석","pg":"224","np":20,"nq":100},
  {"id":"s2c4","s":2,"c":4,"t":"투자분석기법 - 기술적 분석","pg":"254","np":20,"nq":100},
  {"id":"s2c5","s":2,"c":5,"t":"투자분석기법 - 산업분석","pg":"284","np":13,"nq":65},
  {"id":"s2c6","s":2,"c":6,"t":"리스크 관리","pg":"306","np":17,"nq":85},
  {"id":"s3c1","s":3,"c":1,"t":"직무윤리","pg":"348","np":16,"nq":118},
  {"id":"s3c2","s":3,"c":2,"t":"자본시장과 금융투자업에 관한 법률","pg":"376","np":35,"nq":228},
  {"id":"s3c3","s":3,"c":3,"t":"금융위원회 규정","pg":"430","np":15,"nq":105},
  {"id":"s3c4","s":3,"c":4,"t":"한국금융투자협회 규정","pg":"460","np":14,"nq":93},
  {"id":"s3c5","s":3,"c":5,"t":"주식투자운용 및 투자전략","pg":"482","np":25,"nq":170},
  {"id":"s3c6","s":3,"c":6,"t":"채권투자운용 및 투자전략","pg":"522","np":24,"nq":165},
  {"id":"s3c7","s":3,"c":7,"t":"파생상품투자운용 및 투자전략","pg":"562","np":24,"nq":165},
  {"id":"s3c8","s":3,"c":8,"t":"투자운용결과분석","pg":"600","np":18,"nq":120},
  {"id":"s3c9","s":3,"c":9,"t":"거시경제","pg":"628","np":20,"nq":123},
  {"id":"s3c10","s":3,"c":10,"t":"분산투자기법","pg":"658","np":20,"nq":145}
];
export const SUBJ = {
  1: { n: "1과목 금융상품·세제", short: "금융상품·세제", q: 20 },
  2: { n: "2과목 투자운용II·투자분석", short: "투자운용II·분석", q: 30 },
  3: { n: "3과목 윤리·법규·투자운용I", short: "윤리·법규·운용I", q: 50 },
};
export const CH = Object.fromEntries(CHS.map((c) => [c.id, c]));
export const ORDER = CHS.map((c) => c.id);
export const TOTAL_Q = CHS.reduce((n, c) => n + c.nq, 0);
export const TOTAL_P = CHS.reduce((n, c) => n + c.np, 0);
export const SUBJ_Q = { 1: 0, 2: 0, 3: 0 };
CHS.forEach((c) => (SUBJ_Q[c.s] += c.nq));
export const CALC = ["s2c3", "s2c6", "s3c6", "s3c7", "s3c10", "s3c8"]; // 계산 파트 (섞어 풀기 기본)
export const LAW = ["s3c1", "s3c2", "s3c3", "s3c4", "s1c1"]; // 법규 · 윤리 · 세제
export const MARK = "①②③④⑤";
// 문제 id = "<장>-<핵심 번호>-<순번>" (예: s3c6-13-2)
export const chOf = (qid) => qid.slice(0, qid.indexOf("-"));
export const subjOf = (qid) => +qid[1];
export const chName = (id) => `${CH[id].s}과목 ${CH[id].c}장 ${CH[id].t}`;
export const chShort = (id) => `${CH[id].s}-${CH[id].c}`;

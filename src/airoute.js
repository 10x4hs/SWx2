// AI 길 고르기 (CIM 튜터만, 2026-10-24) — 질문 하나를 {빠른 답 · 깊은 설명 · 내 자료 검색 필요 · 계산 풀이} 중 하나로.
//   1) 규칙 먼저 (공짜 · 즉시). 규칙 하나만 맞으면 확신 0.9, 여럿이면 우선순위(my_notes > calc > deep > quick)로 0.7
//   2) 규칙이 아무것도 못 고르면 embed-proto (예시 질문 원형 · 공짜 임베딩 한 번) — 확신이 낮으면 unknown = 지금처럼
//   기록: decide_log kind = "route" (질문 글은 적지 않아요 — subject 는 화면 종류 card · quiz · general 만)
//   효과: DECIDE_ROUTE=1 일 때만 프롬프트에 한 줄(길이 · 순서) + 내 자료 질문이면 노트 근거를 4개까지. 기본은 'log' = 기록만 (품질 근거가 아직 없어서).
//         모델 · 토큰 한도는 바꾸지 않아요 (aiText 가 공급사 순서만 받아요).
import { decide, logDecision, meanVec, UNKNOWN } from "./decide.js";
import { embed } from "./rag.js";

export const ROUTES = {
  quick: { ko: "빠른 답", d: "용어 뜻 · 한 줄 정의 · 짧은 확인처럼 짧게 답하면 되는 질문", hint: "이번 질문은 짧게: 3문장 이내로 핵심만 답해." },
  deep: { ko: "깊은 설명", d: "왜 그런지 · 원리 · 차이 · 비교처럼 깊게 풀어 줘야 하는 질문", hint: "이번 질문은 깊게: 원리 → 쉬운 예시 → 헷갈리는 점 순서로 풀어 줘." },
  my_notes: { ko: "내 자료 검색 필요", d: "내가 정리한 노트 · 내 메모를 찾아봐야 하는 질문", hint: "학생이 자기 노트를 물었어요. [근거] 중 '내 노트' 를 먼저 보고 답해." },
  calc: { ko: "계산 풀이", d: "숫자를 넣어 수익률 · 가치 · 비율을 계산해야 하는 질문", hint: "계산 풀이: 공식 → 숫자 대입 → 한 줄씩 계산 → 답 순서로 보여 줘." },
};
const RULES = [
  ["my_notes", /내\s*(?:노트|자료|정리|메모|필기)|내가\s*(?:정리|적|쓴|써)|노트에서|제\s*노트/],
  ["calc", /계산|구하(?:면|시오|세요|라|는|여)|구해|얼마(?:인가|야|예요|일까|가)|몇\s*(?:%|퍼센트|원)|\d[\d,.]*\s*(?:%|원|억|만\s*원|bp)|\d\s*[×x*/+\-=]\s*\d|현재가치를?|미래가치를?|듀레이션을?\s*(?:구|계산)/],
  ["deep", /왜|자세히|깊게|원리|차이|비교|어떻게\s*(?:되|작동|달라|돌아|생겨)|이유|구조|흐름|헷갈/],
  ["quick", /뭐야|뭔가요|뭐예요|무엇인가요|뜻이?|정의|간단히|짧게|한\s*줄|요약|핵심만/],
];
const PRIORITY = ["my_notes", "calc", "deep", "quick"];
/** 규칙만 — { choice, confidence, matched } (아무것도 안 맞으면 choice = unknown) */
export function routeRules(text) {
  const t = String(text || "");
  const matched = RULES.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (!matched.length) return { choice: UNKNOWN, confidence: 0, matched };
  const choice = PRIORITY.find((k) => matched.includes(k));
  return { choice, confidence: matched.length === 1 ? 0.9 : 0.7, matched };
}
// embed-proto 원형: 라벨마다 예시 질문 몇 개 (scripts/onto-eval.mjs 의 평가 질문과는 겹치지 않게 썼어요)
export const ROUTE_EXAMPLES = {
  quick: ["듀레이션이 뭐야?", "샤프비율 정의 알려줘", "콜옵션 한 줄로", "ETF 뜻", "베타가 뭐예요"],
  deep: ["왜 금리가 오르면 채권 가격이 떨어져?", "CAPM 과 APT 차이를 설명해 줘", "포트폴리오 분산 효과 원리가 궁금해", "선물과 선도 계약은 어떻게 달라?", "효율적 시장 가설이 왜 중요해?"],
  my_notes: ["내 노트에 정리한 채권 내용 찾아줘", "내가 적은 옵션 메모 다시 보여줘", "노트에서 위험 관리 부분 찾아봐", "내 정리 기준으로 설명해 줘", "제 노트에 있던 공식 뭐였죠"],
  calc: ["액면 10000원 쿠폰 5% 3년 채권 가격 구해줘", "기대수익률 8% 표준편차 20% 샤프비율 계산", "현재가치를 구하면?", "수익률이 12%면 원금 500만원은 얼마가 돼?", "베타 1.2 시장수익률 10% 무위험 3% 기대수익률"],
};
const protoCache = { v: null };
async function routeProtos(env) {
  if (protoCache.v) return protoCache.v;
  const labels = Object.keys(ROUTE_EXAMPLES), flat = labels.flatMap((k) => ROUTE_EXAMPLES[k].map((q) => [k, q]));
  const vs = await embed(env, flat.map(([, q]) => q));
  protoCache.v = Object.fromEntries(labels.map((k) => [k, meanVec(vs.filter((_, i) => flat[i][0] === k))]));
  return protoCache.v;
}
export const ROUTE_PROTO = { T: 0.03, floor: 0.45, min: 0.3 };
/** 질문 → { choice, confidence, engine } (기록까지). 실패하면 unknown */
export async function routeAsk(env, user, text, kind = "general", { log = true } = {}) {
  const r = routeRules(text);
  let out = { ...r, engine: "rules" };
  if (r.choice === UNKNOWN && env.AI) {
    try {
      const protos = await routeProtos(env);
      const [vec] = await embed(env, [String(text).slice(0, 500)]);
      const { answers } = await decide(env, { questions: { r: { type: "choice", instructions: "이 질문에 맞는 답하는 길은?", criteria: Object.fromEntries(Object.entries(ROUTES).map(([k, v]) => [k, v.d])), protos } }, vec, engine: "embed-proto", proto: ROUTE_PROTO });
      const a = answers.r;
      out = { choice: a.confidence >= ROUTE_PROTO.min ? a.choice : UNKNOWN, confidence: a.confidence, engine: "embed-proto", probabilities: a.probabilities };
    } catch (e) { console.log("route proto", String(e?.message || e)); }
  }
  if (log) await logDecision(env, { userId: user?.id || null, kind: "route", subject: kind, engine: out.engine, answer: out.choice, confidence: out.confidence, probabilities: out.probabilities || null }).catch(() => {});
  return out;
}
export const routeMode = (env) => (env.DECIDE_ROUTE === "1" ? "apply" : env.DECIDE_ROUTE === "0" ? "off" : "log");

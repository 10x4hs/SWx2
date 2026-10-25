// 관계 종류 · 개념 5개 이름표 — src/onto.js 와 scripts/onto-eval.mjs 가 같이 써요 (decide.js 말고는 불러오지 않아서 node 로도 돼요).
import { UNKNOWN } from "../decide.js";

export const REL = {
  is_a: { ko: "종류", d: "A는 B의 한 종류예요 (예: 사과 → 과일)", inv: "B는 A의 한 종류예요" },
  part_of: { ko: "부분", d: "A는 B를 이루는 한 부분이에요 (예: 바퀴 → 자동차)", inv: "B는 A를 이루는 한 부분이에요" },
  example_of: { ko: "예시", d: "A는 B의 구체적인 예시예요 (예: 삼성전자 → 대형주)", inv: "B는 A의 구체적인 예시예요" },
  causes: { ko: "원인", d: "A가 B를 일으키거나 B의 원인이에요 (예: 금리 인상 → 채권 가격 하락)", inv: "B가 A를 일으키거나 A의 원인이에요" },
  contrasts_with: { ko: "반대·비교", d: "A와 B는 반대이거나 서로 견주어 보는 짝이에요 (방향 없음)" },
  prerequisite_of: { ko: "먼저 알아야 함", d: "A를 먼저 알아야 B를 이해할 수 있어요", inv: "B를 먼저 알아야 A를 이해할 수 있어요" },
  defined_by: { ko: "정의", d: "A의 뜻은 B로 정의돼요 (B가 A를 정의하는 개념 · 식이에요)", inv: "B의 뜻은 A로 정의돼요" },
  related: { ko: "관련", d: "관련은 있지만 위 어느 관계에도 딱 맞지 않아요" },
};
export const REL_KEYS = Object.keys(REL);
export const SYMMETRIC = new Set(["contrasts_with", "related"]);
/** 관계 질문의 선택지: 8 + 반대 방향 6 + none (+ decide 가 unknown 을 붙여요) */
export function relCriteria() {
  const c = {};
  for (const [k, v] of Object.entries(REL)) { c[k] = v.d; if (v.inv) c[k + "_inv"] = v.inv; }
  c.none = "두 노트는 거의 관련이 없어요";
  return c;
}
/** 선택지 → { rel, swap } (none · unknown 은 null) */
export function readRelChoice(choice) {
  if (!choice || choice === "none" || choice === UNKNOWN) return null;
  const inv = choice.endsWith("_inv"), rel = inv ? choice.slice(0, -4) : choice;
  return REL[rel] ? { rel, swap: inv } : null;
}
/** 사람 결과 → 물은 방향(askSrc → askDst) 기준 라벨 (decide_log 의 answer 와 비교해요) */
export function outcomeLabel(askSrc, askDst, src, dst, rel) {
  if (!rel) return "none";
  if (SYMMETRIC.has(rel) || (src === askSrc && dst === askDst)) return rel;
  return rel + "_inv";
}

// 개념 5개 (public/js/graph/brain-data.js CONCEPTS 와 같은 이름) — embed-proto 원형의 설명 문장
export const CONCEPTS = {
  "Business & Finance": "경영 · 재무 · 회계 · 투자 · 금융 시장 · 주식 · 채권 · 금리 · 환율 · 옵션 · 선물 · 파생상품 · 펀드 · 배당 · 수익률 · 위험 관리 · 세금 · 경제 지표 · 기업 분석 · 마케팅 · 경영 전략 · 투자자산운용사(CIM) 시험",
  "AI & Dev": "인공지능 · 머신러닝 · 딥러닝 · LLM · 임베딩 · 프롬프트 · 프로그래밍 · 코드 · 함수 · 알고리즘 · 자료구조 · Git · API · 서버 · 웹 개발 · 데이터베이스 · 클라우드 · 소프트웨어 설계 · 논문",
  Records: "기록 · 일지 · 회의록 · 회고 · 오늘 할 일 목록 · 주간 계획 · 체크리스트 · 독서 기록 · 공부 기록 · 날짜별 메모 · 진행 상황 정리",
  Language: "외국어 공부 · 영어 단어 · 숙어 · 문법 · 시제 · 가정법 · 예문 · 표현 · 회화 · 발음 · 번역 · 토익 · 일본어 · 중국어",
  Life: "일상 생활 · 건강 · 운동 루틴 · 헬스 · 식단 · 요리 레시피 · 여행 계획 · 취미 · 가족 · 친구 · 감정 · 마음 · 잠 · 집안일 · 쇼핑",
};

// ---------- 나눠 묻기 (2026-10-25): ① 관계 종류만(방향 없이) → ② 방향만 (Jev 식 '작은 질문으로 쪼개기') ----------
// 평가에서 가장 큰 실수가 방향(_inv)이라, 15개 선택지 한 질문에서 둘을 같이 묻지 않아요.
export const TYPE_CRIT = {
  is_a: "한 노트가 다른 노트의 한 종류예요 (예: 사과 · 과일)",
  part_of: "한 노트가 다른 노트를 이루는 한 부분이에요 (예: 바퀴 · 자동차)",
  example_of: "한 노트가 다른 노트의 구체적인 예시예요 (예: 삼성전자 · 대형주)",
  causes: "한 노트가 다른 노트를 일으키거나 그 원인이에요 (예: 금리 인상 · 채권 가격 하락)",
  contrasts_with: REL.contrasts_with.d,
  prerequisite_of: "한 노트를 먼저 알아야 다른 노트를 이해할 수 있어요",
  defined_by: "한 노트의 뜻이 다른 노트(개념 · 식)로 정의돼요",
  related: REL.related.d,
  none: "두 노트는 거의 관련이 없어요",
};
/** 방향 질문의 선택지 (forward = A → B 로 읽힘 · backward = B → A) */
export const dirCriteria = (rel) => ({ forward: REL[rel].d, backward: REL[rel].inv });
/** 종류 + 방향 → relCriteria 이름 (rel | rel_inv | none | unknown) */
export function combineRel(rel, dir) {
  if (!rel || rel === "none" || rel === UNKNOWN) return rel || UNKNOWN;
  if (SYMMETRIC.has(rel)) return rel;
  return dir === "forward" ? rel : dir === "backward" ? rel + "_inv" : UNKNOWN;
}
/** few-shot 한 줄 — 사용자가 확인한 관계(pos) · 거절한 제안(neg). rel 이 없으면 '관계 없음' */
export function exampleLine(x, neg = false) {
  if (!x.rel) return `- 「${x.a}」 · 「${x.b}」: 관계 없음${neg ? " (사용자가 관계 제안을 거절)" : ""}`;
  return `- A=「${x.a}」 B=「${x.b}」: ${x.rel} (${REL[x.rel]?.d || ""})${neg ? " ← 사용자가 이 제안을 거절했어요. 비슷한 쌍에 같은 답을 고르지 마." : ""}`;
}

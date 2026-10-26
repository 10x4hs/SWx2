// 검사용 가짜 AI (AI_MOCK) — 로컬 검사가 Groq · Gemini · Workers AI 한도를 쓰지 않고, 답이 매번 같게.
// 켜지는 조건은 셋 다예요: AI_MOCK=1 · PASSWORDLESS=1 (로컬 .dev.vars 에만 있어요) · 요청 주소가 localhost/127.0.0.1.
// 배포본은 wrangler.jsonc 의 PASSWORDLESS "0" 이고 주소도 workers.dev 라서, AI_MOCK 를 실수로 넣어도 켜지지 않아요.
// 켜지면 worker.js 가 env 를 mockEnv(env) 로 바꿔요: env.__AI_MOCK = true (ai.js · decide.js · vision.js 가 봐요),
// env.AI = 가짜 Workers AI (글자 조각으로 만든 벡터 · 순위 · 짧은 답), 벡터 색인은 빼요 (원격 개발 색인을 가짜 벡터로 더럽히지 않게),
// NEWS_FAKE_AI = "1" (뉴스는 원래 있던 가짜 답을 써요).

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;
export function aiMockOn(env, url = null) {
  if (env?.AI_MOCK !== "1" || env?.PASSWORDLESS !== "1") return false;
  return url ? LOCAL_HOST.test(url.hostname) : true; // 크론(scheduled)은 주소가 없어요 — PASSWORDLESS 로컬에서만 돌아요
}

export const MOCK_MODEL = "mock";
export const MOCK_DIMS = 1024;

/** 글 → 1024 차원 벡터 (글자 두 개씩 묶어 해시). 글이 겹칠수록 가까워요 — 진짜 의미는 아니지만 같은 글은 항상 같은 벡터 */
export function mockEmbed(text) {
  const v = new Array(MOCK_DIMS).fill(0), s = String(text || "").toLowerCase().replace(/\s+/g, " ");
  for (let i = 0; i < s.length - 1; i++) {
    let h = 2166136261;
    for (const c of s.slice(i, i + 2)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % MOCK_DIMS] += 1;
  }
  if (s.length === 1) v[s.codePointAt(0) % MOCK_DIMS] = 1;
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

/** 짧은 고정 답. 마지막 질문 앞부분을 넣어서 어떤 질문에 대한 답인지만 알 수 있게 */
export function mockText(last = "") {
  const q = String(last || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (/이미지|사진|image/i.test(q)) return "모의 답이에요: 빨간색(red) 이미지예요.";
  return `모의 답이에요 (AI_MOCK): ${q || "안녕하세요"}`;
}

/** aiJson 의 가짜 답 — 여러 기능이 쓰는 칸을 한꺼번에 담아요 (없는 칸은 기능 쪽이 기본값으로 처리해요) */
export function mockJson() {
  return {
    score: 70, note: "모의 채점이에요", comment: "모의 평가예요", feedback: "모의 평가예요",
    lines: ["모의 회고: 이번 주 계획을 대부분 지켰어요"], body: "모의 회고: 이번 주 계획을 대부분 지켰어요",
    summary: "모의 요약이에요", one_liner: "모의 한 줄이에요", one: "모의 한 줄",
    answers: {}, // decide: 모든 질문 unknown
    topic: "모의 주제", notes: [], tags: [], links: [], items: [], topics: [],
    title: "모의 페이지", files: { "index.html": "<!doctype html><meta charset=utf-8><p>모의 페이지</p>" },
  };
}

/** 스트리밍 흉내: 글을 몇 조각으로 나눠서 */
export const mockChunks = (text) => text.match(/.{1,12}/gsu) || [text];

const fakeAI = {
  async run(model, input = {}) {
    if (/bge-m3|embedding|bge-(small|base|large)-en/i.test(model) || Array.isArray(input.text) || typeof input.text === "string") {
      const list = Array.isArray(input.text) ? input.text : [input.text];
      return { shape: [list.length, MOCK_DIMS], data: list.map(mockEmbed) };
    }
    if (/rerank/i.test(model)) {
      const qv = mockEmbed(input.query);
      const score = (t) => mockEmbed(t).reduce((a, x, i) => a + x * qv[i], 0);
      return { response: (input.contexts || []).map((c, id) => ({ id, score: score(c.text) })).sort((a, b) => b.score - a.score) };
    }
    const last = input.messages?.at?.(-1)?.content ?? input.prompt ?? "";
    return { response: mockText(typeof last === "string" ? last : "") };
  },
};

export function mockEnv(env) {
  return { ...env, __AI_MOCK: true, AI: fakeAI, VECTORS: undefined, VECTORS_DEV: undefined, NEWS_FAKE_AI: "1" };
}

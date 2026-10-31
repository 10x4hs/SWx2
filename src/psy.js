// Psychology (#/psy) — 설득 · 수사학 공부 앱의 AI 스파링 (2026-10-31)
//   POST /apps/psy/spar { scenario, turns: [{ who: "me"|"ai", text }] }
//     → { reply, ai_moves: [카드 id], my_moves: [카드 id], score: 0-100, missed: { text, card } | null, model }
//   잠금: 기능 'psy' (src/features.js MAP) · 기록(SRS · 퀴즈 · 스파링 점수)은 /apps/psy/state (src/appstate.js)
//   사용량: 전체 AI 하루 사용량(worker.js AI_PATH) + 이 앱만 한 사람 하루 SPAR_DAILY 번 (팀 상관없이)
//   카드 id · 장면 정보는 화면이 보내요 — 서버는 모양만 검사하고, 카드 id 는 영어 소문자 · 숫자 · - 만 받아요
import { aiJson } from "./ai.js";

export const SPAR_DAILY = 60;
const MAX_TURNS = 12, MAX_TEXT = 600, MAX_CHARS = 5000, MAX_FIELD = 300;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const ids = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === "string" && ID.test(x)))].slice(0, 6) : []);

// 한국 날짜 하나에 한 사람 SPAR_DAILY 번 — ai_quota 표를 "psy:" 날짜로 같이 써요 (새 표 없이)
async function sparQuota(env, user) {
  const day = "psy:" + new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const r = await env.DB.prepare("INSERT INTO ai_quota (user_id, day, n) VALUES (?1, ?2, 1) ON CONFLICT(user_id, day) DO UPDATE SET n = n + 1 WHERE n < ?3").bind(user.id, day, SPAR_DAILY).run();
  return (r.meta.changes || 0) > 0;
}

// 받은 몸통 검사 → { sc, turns } (틀리면 400)
export function parseSpar(b, fail) {
  const s = b?.scenario;
  const sc = typeof s === "string" ? { id: str(s, 64), title: str(s, 64) } : s && typeof s === "object" ? { id: str(s.id, 64), title: str(s.title, MAX_FIELD), role: str(s.role, MAX_FIELD), goal: str(s.goal, MAX_FIELD), opener: str(s.opener, MAX_TEXT) } : null;
  if (!sc?.id && !sc?.title) fail(400, "장면(scenario)이 없어요.");
  const t = b?.turns;
  if (!Array.isArray(t) || t.length > MAX_TURNS) fail(400, `대화는 ${MAX_TURNS}턴까지 보낼 수 있어요.`);
  if (t.some((x) => !x || (x.who !== "me" && x.who !== "ai") || typeof x.text !== "string" || !x.text.trim() || x.text.length > MAX_TEXT)) fail(400, `한 턴은 who(me|ai) 와 1~${MAX_TEXT}자 text 예요.`);
  if (t.reduce((n, x) => n + x.text.length, 0) > MAX_CHARS) fail(400, `대화는 모두 ${MAX_CHARS}자까지예요.`);
  if (t.length && t[t.length - 1].who !== "me") fail(400, "마지막 턴은 내 말이어야 해요.");
  return { sc, turns: t.map((x) => ({ who: x.who, text: x.text.trim() })) };
}

// AI 답 → 약속한 모양으로 (모르는 값은 버려요)
export function shapeSpar(d) {
  const score = Math.max(0, Math.min(100, Math.round(Number(d?.score) || 0)));
  const m = d?.missed;
  const missed = m && typeof m === "object" && str(m.text, MAX_TEXT) ? { text: str(m.text, MAX_TEXT), card: ID.test(m.card || "") ? m.card : null } : null;
  return { reply: str(d?.reply, 1200) || "…", ai_moves: ids(d?.ai_moves), my_moves: ids(d?.my_moves), score, missed };
}

const MOCK = (turns) => ({ reply: `모의 상대 · ${turns.length ? "그 말은 좀 더 근거가 필요해 보여요. 왜 그렇게 생각하세요?" : "자, 시작해 볼까요? 먼저 말씀해 보세요."}`, ai_moves: ["socratic-questioning"], my_moves: turns.length ? ["anchoring"] : [], score: turns.length ? 55 : 0, missed: turns.length ? { text: "상대의 반론을 먼저 인정했으면 더 설득력이 있었어요.", card: "concession" } : null });

export function registerPsy(on, { json, body, fail }) {
  on("POST", "/apps/psy/spar", async ({ req, env, user }) => {
    const { sc, turns } = parseSpar(await body(req), fail);
    if (!(await sparQuota(env, user))) fail(429, `스파링은 하루 ${SPAR_DAILY}번까지예요. 내일 다시 해 주세요.`);
    if (env.__AI_MOCK) return json({ ...shapeSpar(MOCK(turns)), model: "mock" }); // 로컬 검사 (AI_MOCK)
    const system = `너는 설득 · 논증 연습 상대(스파링 파트너)이자 채점관이다.
- 장면 속 상대 역할을 맡아 한국어 구어체로 짧게(2~4문장) 답한다. 쉽게 져 주지 말고, 실제로 쓰이는 설득 기법을 써서 버틴다.
- 사용자의 마지막 말에 쓰인 기법, 네 답에 쓴 기법을 카드 id 로 적는다. 카드 id 는 영어 소문자-하이픈 (예: anchoring, social-proof, reciprocity, scarcity, foot-in-the-door, door-in-the-face, straw-man, ad-hominem, false-dilemma, concession, reframing, socratic-questioning, ethos, pathos, logos, batna, labeling, mirroring). 확실하지 않으면 빼라.
- score 는 지금까지 사용자의 설득력 0~100. missed 는 사용자가 놓친 가장 좋은 기회 한 줄과 그 기법 카드 id (없으면 null).
- 출력은 JSON 하나: {"reply": "...", "ai_moves": ["id"], "my_moves": ["id"], "score": 0, "missed": {"text": "...", "card": "id"} }`;
    const prompt = `장면: ${sc.title || sc.id}${sc.role ? `\n너의 역할: ${sc.role}` : ""}${sc.goal ? `\n사용자의 목표: ${sc.goal}` : ""}${sc.opener ? `\n첫 말: ${sc.opener}` : ""}\n\n대화:\n${turns.length ? turns.map((x) => `${x.who === "me" ? "사용자" : "상대"}: ${x.text}`).join("\n") : "(아직 없음 — 상대로서 먼저 말을 꺼내라)"}`;
    let r;
    try { r = await aiJson(env, system, prompt); }
    catch (err) { fail(err.status === 503 ? 503 : 502, err.status === 503 ? err.message : "AI 답을 받지 못했어요. 잠시 뒤에 다시 해 주세요."); }
    return json({ ...shapeSpar(r.data), model: r.model });
  });
}

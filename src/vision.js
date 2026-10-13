// 이미지 읽기 — 채팅 · AI 비서 · 노드 만들기 · 노트 AI 어디서든 사진/캡처를 붙일 수 있어요.
// 이미지를 볼 수 있는 모델(Gemini → OpenRouter 무료 Gemma)이 먼저 글로 옮겨 적고(글자는 그대로, 표·문제는 구조대로),
// 그 글을 질문에 붙여 사용자가 고른 어떤 모델이든 이어서 답해요. 그래서 이미지 못 보는 모델도 사진 질문을 풀 수 있어요.
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const GEMINI_CHAIN = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
const OPENROUTER_CHAIN = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "qwen/qwen3.8-27b:free"];
export const MAX_IMAGES = 4;
const MAX_B64 = 2_200_000;            // 한 장 base64 길이 (≈1.6MB) — 브라우저에서 1600px 로 줄여 보내서 보통 200~500KB
const DATA_RE = /^data:(image\/(?:png|jpeg|webp|gif|heic|heif));base64,([A-Za-z0-9+/=]+)$/;

// [{mime, data}] 로 걸러요. 형식이 틀리거나 너무 크면 400
export function cleanImages(list, fail) {
  if (!Array.isArray(list) || !list.length) return [];
  if (list.length > MAX_IMAGES) fail(400, `이미지는 한 번에 ${MAX_IMAGES}장까지 붙일 수 있어요.`);
  return list.map((u) => {
    const m = typeof u === "string" ? DATA_RE.exec(u) : null;
    if (!m) fail(400, "이미지 형식을 읽을 수 없어요. (png · jpg · webp)");
    if (m[2].length > MAX_B64) fail(400, "이미지가 너무 커요. 조금 작게 해서 다시 붙여 주세요.");
    return { mime: m[1], data: m[2] };
  });
}

const PROMPT = (q) => [
  "첨부한 이미지를 다른 AI 가 보지 않고도 답할 수 있게 한국어로 빠짐없이 옮겨 적어.",
  "- 보이는 글자(문제 · 필기 · 화면 · 표지판)는 원문 그대로 옮겨 (영어는 영어로). 수식은 LaTeX 없이 읽히는 대로.",
  "- 표는 마크다운 표로, 문제는 번호 · 보기까지, 도표 · 그래프는 축과 값, 사진이면 무엇이 어디에 있는지.",
  "- 해석이나 풀이는 하지 마. 이미지에 있는 것만. 여러 장이면 '이미지 1:' 처럼 나눠.",
  q ? `(사용자가 함께 물은 말: ${q.slice(0, 300)})` : "",
].filter(Boolean).join("\n");

// 두 회사 공통: JSON POST → 실패면 status 가 붙은 오류, 성공이면 본문 JSON
async function postJson(name, url, headers, payload) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!res.ok) throw Object.assign(new Error(`${name} ${res.status}`), { status: res.status });
  return res.json();
}
async function viaGemini(env, model, images, q) {
  const j = await postJson("Gemini", `${GEMINI_URL}${model}:generateContent`,
    { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    { contents: [{ role: "user", parts: [...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text: PROMPT(q) }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 4096 } });
  return (j.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
}
async function viaOpenRouter(env, model, images, q) {
  const j = await postJson("OpenRouter", "https://openrouter.ai/api/v1/chat/completions",
    { "content-type": "application/json", authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "HTTP-Referer": "https://dsm-mafia.dsm-mafia.workers.dev", "X-Title": "Dsm-mafia" },
    { model, max_tokens: 4096, temperature: 0.1, messages: [{ role: "user", content: [{ type: "text", text: PROMPT(q) }, ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.data}` } }))] }] });
  return String(j.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// 이미지들 → 글. { text, model }. 볼 수 있는 모델이 다 막히면 503
export async function describeImages(env, images, q = "") {
  const tries = [
    ...(env.GEMINI_API_KEY ? GEMINI_CHAIN.map((m) => [m, () => viaGemini(env, m, images, q)]) : []),
    ...(env.OPENROUTER_API_KEY ? OPENROUTER_CHAIN.map((m) => [m, () => viaOpenRouter(env, m, images, q)]) : []),
  ];
  if (!tries.length) throw Object.assign(new Error("이미지를 읽으려면 Gemini 또는 OpenRouter 키가 필요해요."), { status: 503 });
  for (const [model, run] of tries) {
    try { const text = await run(); if (text) return { text: text.slice(0, 8000), model }; }
    catch (e) { if (e.status && ![404, 429, 500, 502, 503, 504].includes(e.status)) break; } // 요청 자체가 틀렸으면(400) 다른 회사로
  }
  throw Object.assign(new Error("이미지를 읽는 AI 가 지금 붐벼요. 잠시 뒤 다시 보내 주세요."), { status: 503 });
}

// 질문 + 이미지 → 이미지 내용을 붙인 질문. step 은 화면에 "이미지 읽기" 칩으로 보여 줘요
export async function withImages(env, text, images) {
  if (!images.length) return { text, step: null, note: "" };
  const d = await describeImages(env, images, text);
  const note = `[첨부 이미지 ${images.length}장 — 이미지를 읽은 내용]\n${d.text}`;
  return { text: `${text || "이 이미지를 보고 설명해 줘."}\n\n${note}`, note, step: { name: "read_image", args: { n: images.length }, summary: `${images.length}장 · ${d.model}`, auto: true } };
}

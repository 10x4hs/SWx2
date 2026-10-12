// AI 채팅: Gemini(Google AI Studio) · Groq · Cohere · Xiaomi MiMo · Zhipu GLM · OpenRouter · Kilo · Ollama · 여러 개 나란히 비교.
// 키는 Worker 비밀값(GEMINI_API_KEY, GROQ_API_KEY, COHERE_API_KEY, MIMO_API_KEY, ZHIPU_API_KEY, OPENROUTER_API_KEY, KILO_API_KEY, OLLAMA_API_KEY)에만 있고 브라우저로 나가지 않아요.

import { toolPrompt, parseToolCall, runAgentTool, toolSummary, autoResearch, WRITE_TOOLS, CLAIM_RE, dayPlans, stripToolLines } from "./agent.js";
import { cleanImages, withImages } from "./vision.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const MIMO_URL = "https://api.xiaomimimo.com/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const COHERE_URL = "https://api.cohere.com/v2/chat";
// OpenAI 모양 API 셋 더 (무료 자동 라우팅·GLM). 회사 이름 → 주소·키·붙일 헤더·본문 추가
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const KILO_URL = "https://api.kilo.ai/api/gateway/chat/completions";
const OLLAMA_URL = "https://ollama.com/v1/chat/completions";
const OPENAI_LIKE = {
  openrouter: { url: OPENROUTER_URL, name: "OpenRouter", headers: { "HTTP-Referer": "https://dsm-mafia.dsm-mafia.workers.dev", "X-Title": "Dsm-mafia" } },
  zhipu: { url: ZHIPU_URL, name: "GLM", body: { thinking: { type: "disabled" } } },   // 생각 모드를 끄지 않으면 본문이 빈 채로 와요
  kilo: { url: KILO_URL, name: "Kilo", headers: { "HTTP-Referer": "https://dsm-mafia.dsm-mafia.workers.dev", "X-Title": "Dsm-mafia" } },
  ollama: { url: OLLAMA_URL, name: "Ollama" },
};
const KEY = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", cohere: "COHERE_API_KEY", mimo: "MIMO_API_KEY", openrouter: "OPENROUTER_API_KEY", zhipu: "ZHIPU_API_KEY", kilo: "KILO_API_KEY", ollama: "OLLAMA_API_KEY" };

// 혼잡(503)·한도(429)·폐지(404)면 다음 모델로 넘어가요
const MODELS = {
  gemini: { label: "Gemini Flash", desc: "빠르고 한국어가 자연스러워요", provider: "gemini", chain: ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"] },
  // 무료 키는 Pro 한도가 거의 없어서(429) 막히면 Flash로 내려가요
  "gemini-pro": { label: "Gemini Pro", desc: "깊게 풀어요 · 무료 한도가 작아요", provider: "gemini", chain: ["gemini-3.1-pro-preview", "gemini-pro-latest", "gemini-3.8-flash", "gemini-flash-latest"] },
  // Groq 무료 등급은 분당 토큰(8천)이 작아서, 막히면 더 작은 모델로 내려가요
  groq: { label: "Groq GPT-OSS", desc: "아주 빨라요", provider: "groq", chain: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] },
  cohere: { label: "Cohere Command A", desc: "한국어 정리가 깔끔해요", provider: "cohere", chain: ["command-a-03-2025", "command-a-plus-05-2026"] },
  mimo: { label: "MiMo Flash", desc: "생각 과정을 보여줘요", provider: "mimo", chain: ["mimo-v2.6-flash", "mimo-v2.5"] },
  "mimo-pro": { label: "MiMo Pro", desc: "추론이 강한 큰 모델", provider: "mimo", chain: ["mimo-v2.6-pro", "mimo-v2.5-pro"] },
  // 무료 자동 라우팅 둘 + GLM (4.6 은 무료 키가 429 라서 4.5 Flash 만)
  zhipu: { label: "GLM 4.5 Flash", desc: "Zhipu · 무료 · 중국어권 모델이지만 한국어도 돼요", provider: "zhipu", chain: ["glm-4.5-flash"] },
  openrouter: { label: "OpenRouter · 무료 자동", desc: "그때그때 되는 무료 모델로 보내요", provider: "openrouter", chain: ["openrouter/free", "nvidia/nemotron-3-ultra-550b-a55b:free"] },
  kilo: { label: "Kilo · 무료 자동", desc: "Kilo 가 고른 무료 모델", provider: "kilo", chain: ["kilo-auto/free", "stepfun/step-3.7-flash:free"] },
  ollama: { label: "Ollama Nemotron", desc: "Ollama 클라우드 · 큰 모델이라 조금 느려요", provider: "ollama", chain: ["nemotron-3-ultra", "gpt-oss:120b"] },
};
// 한 번에 답 받는 순서 (뒤의 셋은 느리거나 JSON 모드가 없어서 마지막)
const JSON_ORDER = ["gemini", "groq", "cohere", "mimo", "zhipu", "openrouter", "kilo", "ollama"];
export const TEXT_ORDER = ["groq", "gemini", "cohere", "mimo", "zhipu", "openrouter", "kilo", "ollama"];
// 사용자가 고른 모델을 맨 앞에 (없거나 모르는 id 면 기본 순서). 그 모델이 막히면 뒤의 것들로 넘어가요.
export const orderFrom = (prefer, base = TEXT_ORDER) => (prefer && MODELS[prefer] ? [prefer, ...base.filter((p) => p !== prefer)] : base);
export const modelLabel = (id) => MODELS[id]?.label || id;
export const isModel = (id) => typeof id === "string" && Object.hasOwn(MODELS, id);
// 실제로 답한 모델 id(체인 안의 이름) → { pick: 고를 수 있는 이름, label } — 화면에 "Groq GPT-OSS" 처럼 보여 주려고
export function whoAnswered(used) {
  if (!used) return null;
  if (used === "formula") return { pick: null, label: "계산식 (AI 가 바빠서)", used };
  const hit = Object.entries(MODELS).find(([id, m]) => id === used || m.chain.includes(used));
  return hit ? { pick: hit[0], label: hit[1].label, used } : { pick: null, label: used, used };
}
const COMPARE = ["gemini", "groq", "cohere"]; // "all" = 이 셋을 나란히 (MiMo는 따로 골라요)
const DAILY_LIMIT = 200;             // 사람당 하루 질문 수
// 413 = Groq "한 번에 너무 큼(분당 토큰 초과)" → 다음 모델/회사로
const RETRYABLE = new Set([404, 413, 429, 500, 502, 503, 504]);

const hasKey = (env, provider) => !!env[KEY[provider]];
const available = (env, id) => hasKey(env, MODELS[id].provider);

export function registerAi(on, { json, body, fail, str, uid, now }) {
  on("GET", "/ai/models", ({ env }) => json({
    models: [
      // 키가 하나라도 있으면 비교를 열어 두고, 없는 모델은 meta.skipped 로 알려줘요
      { id: "all", label: "전체 비교", desc: "Gemini · Groq · Cohere 답을 나란히", available: COMPARE.some((m) => available(env, m)), targets: COMPARE },
      ...Object.entries(MODELS).map(([id, m]) => ({ id, label: m.label, desc: m.desc, available: available(env, id), chain: m.chain })), // chain: 실제로 답한 모델 이름을 이 목록 이름으로 바꿔 보여 주려고
    ],
    default: "all",
  }));
  // 내 AI 모델 (일정 · 계획 · 노트 AI 와 자정 점수 · 주간 회고가 먼저 써요) — 고르는 건 PATCH /me { ai_model }
  on("GET", "/ai/my-model", ({ user }) => json({ model: user.ai_model || "", label: user.ai_model ? modelLabel(user.ai_model) : "자동 (되는 모델)" }));

  on("GET", "/ai/chats", async ({ env, user }) => {
    const { results } = await env.DB.prepare("SELECT id, title, model, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all();
    return json({ chats: results });
  });

  const ownChat = async (env, id, user) => {
    const c = await env.DB.prepare("SELECT * FROM chats WHERE id = ? AND user_id = ?").bind(id, user.id).first();
    if (!c) fail(404, "대화를 찾을 수 없어요.");
    return c;
  };

  on("GET", "/ai/chats/:id", async ({ env, user, params }) => {
    // 대화방 + 메시지를 왕복 한 번에 (내 대화가 아니면 메시지는 버리고 404)
    const [c, m] = await env.DB.batch([
      env.DB.prepare("SELECT * FROM chats WHERE id = ? AND user_id = ?").bind(params.id, user.id),
      env.DB.prepare("SELECT id, role, model, content, created_at FROM chat_messages WHERE chat_id = ? ORDER BY created_at, rowid").bind(params.id),
    ]);
    const chat = c.results[0];
    if (!chat) fail(404, "대화를 찾을 수 없어요.");
    return json({ chat, messages: m.results });
  });

  on("PATCH", "/ai/chats/:id", async ({ req, env, user, params }) => {
    const chat = await ownChat(env, params.id, user);
    const title = str((await body(req)).title, 60, "제목");
    await env.DB.prepare("UPDATE chats SET title = ? WHERE id = ?").bind(title, chat.id).run();
    return json({ chat: { ...chat, title } });
  });

  on("DELETE", "/ai/chats/:id", async ({ env, user, params }) => {
    await ownChat(env, params.id, user);
    await env.DB.prepare("DELETE FROM chats WHERE id = ?").bind(params.id).run();
    return json({ ok: true });
  });

  // 질문 보내기 → text/event-stream 으로 답을 흘려보내요
  on("POST", "/ai/chat", async ({ req, env, ec, user }) => {
    const b = await body(req);
    const images = cleanImages(b.images, fail);
    const message = images.length && !String(b.message || "").trim() ? "이 이미지를 보고 설명해 줘." : str(b.message, 4000, "질문");
    const modelId = b.model === "all" || MODELS[b.model] ? b.model : "all";
    const targets = modelId === "all" ? COMPARE : [modelId];
    const missing = targets.filter((t) => !available(env, t));
    if (missing.length === targets.length) fail(503, "AI 키가 설정되지 않았어요. README의 'AI 키' 부분을 확인해 주세요.");
    const live = targets.filter((t) => available(env, t));

    const since = now() - 864e5;
    const { n } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM chat_messages m JOIN chats c ON c.id = m.chat_id WHERE c.user_id = ? AND m.role = 'user' AND m.created_at > ?"
    ).bind(user.id, since).first();
    if (n >= DAILY_LIMIT) fail(429, `하루 질문 한도(${DAILY_LIMIT}개)를 다 썼어요. 내일 다시 물어봐 주세요.`);

    let chat;
    if (b.chat_id) chat = await ownChat(env, b.chat_id, user);
    else {
      chat = { id: uid(), user_id: user.id, title: message.replace(/\s+/g, " ").slice(0, 40), model: modelId, created_at: now(), updated_at: now() };
      await env.DB.prepare("INSERT INTO chats (id, user_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(chat.id, chat.user_id, chat.title, chat.model, chat.created_at, chat.updated_at).run();
    }
    const { results: past } = await env.DB.prepare("SELECT role, model, content FROM chat_messages WHERE chat_id = ? ORDER BY created_at, rowid").bind(chat.id).all();
    const userMsg = { id: uid(), created_at: now() };
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chat_messages (id, chat_id, role, model, content, created_at) VALUES (?, ?, 'user', ?, ?, ?)").bind(userMsg.id, chat.id, modelId, message, userMsg.created_at),
      env.DB.prepare("UPDATE chats SET updated_at = ?, model = ? WHERE id = ?").bind(now(), modelId, chat.id),
    ]);

    let system = b.use_context === false ? basePrompt(user) : await contextPrompt(env, user, b, message);
    // 모든 모델이 에이전트처럼: 웹 검색 · 페이지 읽기 · 노트 · 계획 도구가 늘 열려 있어요. 계획 고치기는 모델 하나일 때만 (비교 모드에서 셋이 같은 일을 넣지 않게)
    const TOOLS = ["web_search", "read_page", "search_notes", "read_note", "my_plans", ...(live.length === 1 ? ["day_plans", "add_plan", "update_plan", "delete_plan"] : [])];
    // 날짜 감각: 사용자가 '보고 있는 날짜'(b.day — 달력에서 고른 날)와 '실제 오늘'(b.today)은 다를 수 있어요.
    // 날짜 말이 없는 요청은 보고 있는 날짜 하나에만 넣게 해요 (예전엔 오늘·내일 둘 다 보여 줘서 두 날에 넣는 일이 있었어요)
    const isYmd = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const kstToday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const viewDay = isYmd(b.day) ? b.day : (isYmd(b.today) ? b.today : kstToday);
    const realToday = isYmd(b.today) ? b.today : kstToday;
    const dayWord = viewDay === realToday ? "오늘" : viewDay > realToday ? "실제 오늘이 아니라 앞으로 올 날" : "실제 오늘이 아니라 지난 날";
    system += "\n\n" + toolPrompt(TOOLS, 4) + (live.length === 1
      ? `\n계획을 넣거나 고쳐 달라고 하면 add_plan 등으로 직접 해. 시간은 24시간 HH:MM.\n사용자가 지금 보고 있는 날짜: ${viewDay} (${dayWord}). 실제 오늘: ${realToday}.\n사용자가 날짜를 말하지 않으면 add_plan 의 date 는 반드시 ${viewDay} 하나만 써. '내일'·'모레'·'다음 주' 처럼 날짜 말이 있을 때만 그 날짜로(기준은 보고 있는 날짜 ${viewDay}) 넣어.`
      : "");
    // 지금 DB 에 실제로 있는 '보고 있는 날짜' 계획을 사실로 넣어 줘요 — 앞 대화의 "넣었어요"를 믿고 상태를 지어내지 않게
    if (live.length === 1) {
      const p0 = await dayPlans(env, user, viewDay);
      const fmt = (r) => (r.plans?.length ? r.plans.map((x) => `  - ${x.start ? x.start + " " : ""}${x.text}${x.done ? " (끝냄)" : ""}`).join("\n") : "  (없음)");
      system += `\n\n[지금 실제로 저장된 계획 — 이것만 사실이야. 앞 대화에서 '넣었다'고 한 말과 달라도 이걸 믿어. 여기 없는 건 아직 안 들어간 거야]\n${viewDay} (보고 있는 날짜)\n${fmt(p0)}\n계획을 넣으라고 하면 항목마다 add_plan 을 한 번씩만 불러 — 날짜는 하나야. 같은 항목을 다른 날짜에 또 넣지 마. 다른 날짜의 계획은 day_plans 로 확인해.`;
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    let open = true;
    const send = async (o) => { if (!open) return; try { await writer.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { open = false; } };

    const task = (async () => {
      await send({ type: "meta", chat_id: chat.id, title: chat.title, targets: live, skipped: missing });
      // 이미지 읽기 · 링크 읽기 · (필요하면) 웹 검색은 한 번만 해서 모든 모델이 같이 써요
      const each = (o) => Promise.all(live.map((t) => send({ ...o, model: t })));
      let ask = message;
      try {
        if (images.length) await each({ type: "status", text: "이미지 읽는 중…" });
        const [vis, pre] = await Promise.all([withImages(env, message, images), autoResearch(message, b.web === true ? true : "auto")]);
        for (const st of [vis.step, ...pre.steps].filter(Boolean)) await each({ type: "tool", ...st });
        ask = [vis.text, pre.note].filter(Boolean).join("\n\n");
        if (vis.note) await env.DB.prepare("UPDATE chat_messages SET content = ? WHERE id = ?").bind(`${message}\n\n${vis.note}`, userMsg.id).run();
      } catch (e) { await each({ type: "error", message: e.message || "이미지를 읽지 못했어요." }); await send({ type: "end" }); open = false; try { await writer.close(); } catch {} return; }
      const results = await Promise.all(live.map(async (t) => {
        // 모델마다 자기 답만 이어서 기억해요 (비교 모드에서 서로 섞이지 않게)
        const history = past.filter((m) => m.role === "user" || m.model === t).slice(-16);
        try {
          const r = await runToolLoop(env, user, t, system, history, ask, TOOLS, b.periods, (o) => send({ ...o, model: t }));
          await send({ type: "done", model: t, used: r.used, fallback: r.used !== MODELS[t].chain[0], changed: r.changed }); // fallback = 첫 모델이 아닌 걸로 답함
          return { t, text: r.text };
        } catch (e) {
          await send({ type: "error", model: t, message: e.message || "답을 받지 못했어요." });
          return { t, text: "" };
        }
      }));
      const saves = results.filter((r) => r.text.trim()).map((r, i) =>
        env.DB.prepare("INSERT INTO chat_messages (id, chat_id, role, model, content, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)").bind(uid(), chat.id, r.t, r.text, now() + i + 1));
      if (saves.length) await env.DB.batch(saves);
      await send({ type: "end" });
      open = false;
      try { await writer.close(); } catch {}
    })();
    ec?.waitUntil(task);

    return new Response(readable, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  });
}

// 도구 바퀴(채팅용): 글은 바로바로 흘려보내되, 첫 글자가 도구 줄(<<tool>> · ```tool · {)로 시작하면 모아 두고 실행해요.
// 글을 흘려보낸 뒤에 도구 줄이 나오면 { type: "reset" } 으로 화면의 그 답을 지우고 이어서 해요.
async function runToolLoop(env, user, t, system, history, message, tools, periods, send) {
  const convo = [...history];
  let msg = message, used = null, changed = false, nudges = 0;
  const acted = [];   // 이번 요청에서 실제로 실행한 도구 (계획 바꾸기 · 확인)
  const canWrite = tools.some((x) => WRITE_TOOLS.has(x));
  // 답 끝에 실제 실행 내역을 한 줄로 — 화면에도 보이고, 다음 턴의 모델도 "말로만 한 것"과 구분해요
  const footer = () => {
    const w = acted.filter((a) => WRITE_TOOLS.has(a.name));
    return w.length ? `\n\n_실행: ${w.map((a) => `${TOOL_KO[a.name]} ${a.ok ? "✓" : "✗"} ${a.summary}`).join(" · ")}_` : "";
  };
  for (let i = 0; i < 6; i++) {
    let buf = "", think = "", mode = null; // null = 아직 모름 · "stream" = 흘려보내는 중 · "hold" = 도구 줄 같아서 모으는 중
    const r = await runModel(env, t, system, convo, msg, async (kind, text) => {
      if (kind === "reset") { if (mode === "stream") await send({ type: "reset" }); buf = ""; think = ""; mode = null; return; } // 체인의 다음 모델로 넘어감
      if (kind === "reasoning") { think += text; return; }
      if (kind !== "delta") { await send({ type: kind, text }); return; }
      buf += text;
      if (mode === "stream") { await send({ type: "delta", text }); return; }
      if (mode === null) {
        const head = buf.trimStart();
        if (head.length < 8 && !/\n/.test(head)) return;
        mode = /^(<{1,2}\s*tool|```tool|\{\s*"name")/.test(head) ? "hold" : "stream";
        if (mode === "stream") { if (think) { await send({ type: "reasoning", text: think }); think = ""; } await send({ type: "delta", text: buf }); }
      }
    });
    used = r.used;
    const call = i < 5 ? parseToolCall(r.text) : null;
    if (!call || !tools.includes(call.name)) {
      let clean = stripToolLines(r.text);
      if (!/[가-힣A-Za-z]{2}/.test(clean)) clean = ""; // ">" · "[[tool_calls]]" 같은 깨진 답은 빈 답으로
      // 계획을 넣었다 · 이미 있다고 말하는데 이번 요청에서 계획 도구를 하나도 안 불렀으면: 되돌려서 실제로 부르게 해요 (최대 2번)
      const claims = canWrite && CLAIM_RE.test(clean) && !acted.some((a) => WRITE_TOOLS.has(a.name) || a.name === "day_plans" || a.name === "my_plans");
      if (claims && nudges < 2 && i < 5) {
        nudges++;
        if (mode === "stream") await send({ type: "reset" });
        await send({ type: "status", text: "실제로 넣는 중…" });
        convo.push({ role: "user", content: msg }, { role: "assistant", content: clean });
        msg = "방금 답은 이번 요청에서 도구를 실제로 부르지 않고 넣었다(또는 이미 있다)고 말했어. 앞 대화의 답은 믿지 마. 이미 있다고 생각하면 day_plans 로 확인하고, 없으면 add_plan 을 날짜·항목마다 한 번씩 불러. 지금은 도구 줄(<<tool>>…<</tool>>) 한 줄만 출력해.";
        continue;
      }
      if (think) await send({ type: "reasoning", text: think });
      const warn = claims ? "\n\n⚠️ _실제로는 계획을 넣지 못했어요. 한 번 더 말해 주시거나 다른 모델로 바꿔 주세요._"
        : !clean && !footer() ? "⚠️ _답을 받지 못했어요 (모델이 붐비거나 빈 답을 보냈어요). 잠시 뒤 다시 보내 주시거나 다른 모델로 바꿔 주세요._" : "";
      const tail = footer() + warn;
      if (mode !== "stream") await send({ type: "delta", text: clean + tail });
      else if (tail) await send({ type: "delta", text: tail });
      return { text: clean + tail, used, changed };
    }
    if (mode === "stream") await send({ type: "reset" });
    await send({ type: "status", text: `${TOOL_KO[call.name] || call.name} 중…` });
    const result = await runAgentTool(env, user, call.name, call.args, { periods: Object.values(periods || {}) });
    if (WRITE_TOOLS.has(call.name) && !result.error) changed = true;
    const summary = toolSummary(call.name, call.args, result);
    acted.push({ name: call.name, ok: !result.error, summary });
    await send({ type: "tool", name: call.name, args: call.args, summary });
    convo.push({ role: "user", content: msg }, { role: "assistant", content: `<<tool>>${JSON.stringify(call)}<</tool>>` });
    msg = `[도구 결과 ${call.name}]\n${JSON.stringify(result).slice(0, 9000)}\n\n이 결과를 참고해서 계속해. (도구가 더 필요하면 한 줄만, 아니면 최종 답을 써. 최종 답에는 이번에 도구로 실제로 한 일과 그 결과만 써 — 앞 대화나 다른 날의 계획을 다시 나열하지 마.)`;
  }
  const end = footer().trim() || "⚠️ _도구를 여러 번 부르다 끝내지 못했어요. 한 번 더 말해 주세요._";
  await send({ type: "delta", text: end });
  return { text: end, used, changed };
}
const TOOL_KO = { web_search: "웹 검색", read_page: "페이지 읽기", search_notes: "노트 찾기", read_note: "노트 읽기", my_plans: "계획 보기", day_plans: "계획 보기", add_plan: "계획 넣기", update_plan: "계획 고치기", delete_plan: "계획 지우기" };

// ---------- prompts ----------
function basePrompt(user) {
  return [
    `너는 세 친구가 함께 쓰는 공부 앱 'Dsm-mafia'의 AI 튜터야. 지금 대화하는 사람은 ${user.display_name}이야.`,
    "항상 한국어로, 친절하지만 군더더기 없이 답해. 마크다운(제목, 목록, 표, 코드블록)을 적절히 써.",
    "개념 설명은 핵심 → 예시 → 헷갈리기 쉬운 점 순서로. 문제 풀이는 단계별로.",
    "모르는 건 모른다고 말하고, 사용자의 기록에 없는 내용을 기록인 것처럼 지어내지 마.",
  ].join("\n");
}

async function contextPrompt(env, user, b, message) {
  const p = b.periods || {};
  const periods = [p.day, p.week, p.month, p.year].filter((x) => typeof x === "string" && /^[DWMY]:[\d\-W]+$/.test(x));
  const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null;
  const [plans, logs, titles] = await env.DB.batch([
    env.DB.prepare(`SELECT scope, period, text, done, start, mins FROM plans WHERE user_id = ? AND period IN (${periods.map(() => "?").join(",") || "''"}) ORDER BY scope, start, created_at`).bind(user.id, ...periods),
    env.DB.prepare("SELECT at, text, kind FROM logs WHERE user_id = ? AND day = ? ORDER BY at").bind(user.id, day || ""),
    env.DB.prepare("SELECT id, title FROM notes WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 80").bind(user.id),
  ]);

  // 질문과 관련된 노트: [[제목]] 언급 > 제목이 질문에 들어감 > 본문에 질문 단어가 들어감
  const q = message.toLowerCase();
  const mentioned = [...message.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim().toLowerCase());
  const byTitle = titles.results.filter((n) => mentioned.includes(n.title.toLowerCase()) || (n.title.length >= 2 && q.includes(n.title.toLowerCase())));
  const words = [...new Set(message.split(/[\s,.?!·()\[\]"'“”]+/).filter((w) => w.length >= 2))].slice(0, 6);
  let byBody = [];
  if (byTitle.length < 3 && words.length) {
    const cond = words.map((_, i) => `(n.title LIKE ?${i + 2} OR n.body LIKE ?${i + 2})`).join(" OR ");
    const r = await env.DB.prepare(`SELECT n.id, n.title FROM notes n WHERE n.user_id = ?1 AND (${cond}) ORDER BY n.updated_at DESC LIMIT 3`)
      .bind(user.id, ...words.map((w) => `%${w.replace(/[\\%_]/g, "")}%`)).all();
    byBody = r.results;
  }
  const pick = [...new Map([...byTitle, ...byBody].map((n) => [n.id, n])).values()].slice(0, 4);
  let notes = [];
  if (pick.length) {
    const r = await env.DB.prepare(`SELECT title, body FROM notes WHERE id IN (${pick.map(() => "?").join(",")})`).bind(...pick.map((n) => n.id)).all();
    notes = r.results;
  }

  const scopeName = { year: "올해 목표", month: "이번 달", week: "이번 주", day: "오늘 시간표" };
  const planLines = ["year", "month", "week", "day"].map((s) => {
    const list = plans.results.filter((x) => x.scope === s);
    if (!list.length) return "";
    return `### ${scopeName[s]}\n` + list.map((x) => `- [${x.done ? "x" : " "}] ${x.start ? `${x.start} (${x.mins}분) ` : ""}${x.text}`).join("\n");
  }).filter(Boolean).join("\n");
  let budget = 9000;
  const noteText = notes.map((n) => { const body = n.body.slice(0, Math.max(0, Math.min(2800, budget))); budget -= body.length; return `### [[${n.title}]]\n${body}`; }).join("\n\n");

  return [
    basePrompt(user),
    "",
    `사용자가 보고 있는 날짜: ${day || "?"}${typeof b.today === "string" && b.today !== day ? ` (실제 오늘은 ${b.today})` : ""} · 지금 시각 ${typeof b.time === "string" ? b.time : ""} (사용자 현지 시간)`,
    "",
    "## 사용자의 기록 (참고용 — 질문과 관련 있을 때만 활용하고, 노트를 인용할 땐 [[제목]]으로 표시해)",
    planLines || "(계획 없음)",
    logs.results.length ? "### 오늘 실행 기록\n" + logs.results.map((l) => `- ${l.at} ${l.text}`).join("\n") : "",
    titles.results.length ? "### 노트 제목 목록\n" + titles.results.map((n) => n.title).join(", ") : "",
    noteText ? "## 관련 노트 본문\n" + noteText : "",
  ].filter((x) => x !== "").join("\n");
}

// ---------- JSON 한 번에 받기 (노트 정리·생성용) ----------
// Gemini(JSON 모드) → Groq → Cohere → MiMo 순서. 키가 하나도 없으면 503.
// 한 회사 안에서는 붐빌 때만 다음 모델로, 그 회사가 아예 안 되면(키·요청 오류) 다음 회사로 넘어가요.
export async function aiJson(env, system, prompt, prefer = null) {
  const JSON_RUN = { gemini: geminiJson, groq: groqJson, cohere: cohereJson, mimo: mimoJson, zhipu: openaiJson("zhipu"), openrouter: openaiJson("openrouter"), kilo: openaiJson("kilo"), ollama: openaiJson("ollama") };
  const pv = prefer && MODELS[prefer] ? MODELS[prefer].provider : null; // 고른 모델의 회사를 맨 앞에
  const groups = orderFrom(pv, JSON_ORDER).filter((p) => hasKey(env, p));
  if (!groups.length) { const e = new Error("AI 키가 설정되지 않았어요. README의 'AI 키' 부분을 확인해 주세요."); e.status = 503; throw e; }
  let lastErr = null;
  for (const p of groups) {
    // 고른 모델이 같은 회사의 다른 체인(예: gemini-pro · mimo-pro)이면 그 체인을 먼저 돌고, 막히면 회사 기본 체인으로
    const chain = p === pv && prefer !== p ? [...new Set([...MODELS[prefer].chain, ...MODELS[p].chain])] : MODELS[p].chain;
    for (const model of chain) {
      try { return await JSON_RUN[p](env, model, system, prompt); }
      catch (e) { lastErr = e; if (!e.retry) break; }
    }
  }
  throw lastErr || new Error("AI 답을 받지 못했어요.");
}

function parseJsonText(text, name) {
  const s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  try { return JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s); }
  catch { const e = new Error(`${name}가 형식에 맞지 않는 답을 보냈어요.`); e.retry = true; throw e; }
}

async function geminiJson(env, model, system, prompt) {
  const res = await fetch(`${GEMINI_URL}${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 16384, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw await providerError(res, "Gemini");
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  if (!text) { const e = new Error("Gemini가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return { data: parseJsonText(text, "Gemini"), used: model };
}

async function mimoJson(env, model, system, prompt) {
  const res = await fetch(MIMO_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.MIMO_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system + "\n반드시 JSON 객체 하나만 출력해." }, { role: "user", content: prompt }], max_tokens: 16384, temperature: 0.3 }),
  });
  if (!res.ok) throw await providerError(res, "MiMo");
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content || "";
  if (!text) { const e = new Error("MiMo가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return { data: parseJsonText(text, "MiMo"), used: model };
}

// OpenAI 모양 API(Groq)에서 JSON 한 덩어리 받기
async function groqJson(env, model, system, prompt) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({ model, ...groqExtra(model), messages: [{ role: "system", content: system + "\n반드시 JSON 객체 하나만 출력해." }, { role: "user", content: prompt }], response_format: { type: "json_object" }, max_tokens: 8192, temperature: 0.3 }),
  });
  if (!res.ok) throw await providerError(res, "Groq");
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content || "";
  if (!text) { const e = new Error("Groq가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return { data: parseJsonText(text, "Groq"), used: model };
}

async function cohereJson(env, model, system, prompt) {
  const res = await fetch(COHERE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.COHERE_API_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], response_format: { type: "json_object" }, max_tokens: 8000, temperature: 0.3 }),
  });
  if (!res.ok) throw await providerError(res, "Cohere");
  const j = await res.json();
  const text = (j.message?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  if (!text) { const e = new Error("Cohere가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return { data: parseJsonText(text, "Cohere"), used: model };
}

// OpenAI 모양 API(Zhipu · OpenRouter · Kilo)에서 JSON 한 덩어리 받기. JSON 모드가 보장되지 않아서 코드 펜스를 벗기고 { } 만 골라 파싱해요
const openaiJson = (provider) => async (env, model, system, prompt) => {
  const p = OPENAI_LIKE[provider];
  const res = await fetch(p.url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env[KEY[provider]]}`, ...(p.headers || {}) },
    body: JSON.stringify({ model, ...(p.body || {}), messages: [{ role: "system", content: system + "\n반드시 JSON 객체 하나만 출력해. 설명이나 코드 펜스 없이." }, { role: "user", content: prompt }], max_tokens: 8192, temperature: 0.3 }),
  });
  if (!res.ok) throw await providerError(res, p.name);
  const j = await res.json();
  if (j.error) throw Object.assign(new Error(`${p.name} 오류: ${String(j.error.message || "").slice(0, 120)}`), { retry: true });
  const text = j.choices?.[0]?.message?.content || "";
  if (!text) { const e = new Error(`${p.name}가 빈 답을 보냈어요.`); e.retry = true; throw e; }
  return { data: parseJsonText(text.replace(/<think>[\s\S]*?<\/think>/g, ""), p.name), used: j.model && j.model !== model ? `${model} → ${j.model}` : model };
};

// Qwen은 생각 과정을 따로 빼 달라고 해야 본문에 <think>가 안 섞여요 (gpt-oss는 원래 따로 줘요)
const groqExtra = (model) => (model.startsWith("qwen/") ? { reasoning_format: "parsed" } : {});

// ---------- providers ----------
async function runModel(env, id, system, history, message, emit) {
  const m = MODELS[id];
  let lastErr = null;
  for (let round = 0; round < 2; round++) {   // 전부 붐비면 잠깐 쉬고 한 바퀴 더
    if (round) { await emit("status", "모두 붐벼서 잠시 후 다시 시도해요"); await new Promise((r) => setTimeout(r, 1200)); }
    for (const model of m.chain) {
      try {
        const text = await RUN[m.provider](env, model, system, history, message, emit);
        return { text, used: model };
      } catch (e) {
        lastErr = e;
        if (!e.retry) throw e;           // 이미 글자를 보냈거나 되돌릴 수 없는 오류
        await emit("reset", "");          // 앞 모델이 흘려보낸 글자는 버려요
        await emit("status", `${model} ${e.guard ? "엉뚱한 답(안전 검사 모델)" : "혼잡"} → 다음 모델로`);
      }
    }
  }
  throw lastErr || new Error("답을 받지 못했어요.");
}

async function providerError(res, name) {
  let msg = "";
  try { const j = await res.json(); msg = j.error?.message || j.message || ""; } catch {}
  const e = new Error(res.status === 429 || res.status === 413 ? `${name} 사용 한도에 걸렸어요. 잠시 뒤 다시 시도해 주세요.` : res.status === 503 ? `${name}이(가) 지금 붐벼요.` : `${name} 오류 (${res.status}) ${msg.slice(0, 120)}`);
  e.retry = RETRYABLE.has(res.status);
  return e;
}

async function* sse(res) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try { yield JSON.parse(data); } catch {}
    }
  }
}

async function gemini(env, model, system, history, message, emit) {
  const contents = [...history, { role: "user", content: message }].map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const res = await fetch(`${GEMINI_URL}${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } }),
  });
  if (!res.ok) throw await providerError(res, "Gemini");
  let text = "";
  for await (const chunk of sse(res)) {
    for (const part of chunk.candidates?.[0]?.content?.parts || []) {
      if (!part.text) continue;
      if (part.thought) await emit("reasoning", part.text);
      else { text += part.text; await emit("delta", part.text); }
    }
  }
  if (!text) { const e = new Error("Gemini가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return text;
}

// OpenAI 모양 스트림 (MiMo · Groq 둘 다): 생각 과정은 reasoning_content(MiMo) 또는 reasoning(Groq)으로 와요
async function openaiStream(url, key, name, payload, emit, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...headers },
    body: JSON.stringify({ ...payload, stream: true }),
  });
  if (!res.ok) throw await providerError(res, name);
  let text = "", routed = null;
  for await (const chunk of sse(res)) {
    if (chunk.error) { const e = new Error(`${name} 오류: ${String(chunk.error.message || "").slice(0, 120)}`); e.retry = !text; throw e; }
    // 자동 라우팅(openrouter/free 등)은 실제로 어느 모델이 답했는지 chunk.model 로 알려줘요
    if (chunk.model && chunk.model !== payload.model && chunk.model !== routed) { routed = chunk.model; await emit("status", `${name} → ${routed}`); }
    const d = chunk.choices?.[0]?.delta || {};
    const think = d.reasoning_content || d.reasoning;
    if (think) await emit("reasoning", think);
    if (d.content) { text += d.content; await emit("delta", d.content); }
  }
  if (!text) { const e = new Error(`${name}가 빈 답을 보냈어요.`); e.retry = true; throw e; }
  // 무료 자동 선택(openrouter/free 등)이 대화 모델이 아니라 안전 분류 모델(Llama Guard 류)로 가면 "User Safety: safe" 같은 판정만 와요
  if (/^\s*(?:(?:User|Response|Prompt)\s+Safety\s*:|(?:safe|unsafe)\s*(?:\n|$))/i.test(text) && text.length < 300) { const e = new Error(`${name}가 대화가 아닌 안전 판정만 보냈어요.`); e.retry = true; e.guard = true; throw e; }
  return text;
}

const chatMessages = (system, history, message) => [{ role: "system", content: system }, ...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: message }];

function mimo(env, model, system, history, message, emit) {
  return openaiStream(MIMO_URL, env.MIMO_API_KEY, "MiMo", { model, messages: chatMessages(system, history, message), max_tokens: 8192, temperature: 0.7 }, emit);
}

function groq(env, model, system, history, message, emit) {
  return openaiStream(GROQ_URL, env.GROQ_API_KEY, "Groq", { model, ...groqExtra(model), messages: chatMessages(system, history, message), max_tokens: 4096, temperature: 0.7 }, emit);
}

// Cohere v2: event 이름이 data 안의 type 에도 들어 있어요 → content-delta 만 글자로 받아요
async function cohere(env, model, system, history, message, emit) {
  const res = await fetch(COHERE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.COHERE_API_KEY}` },
    body: JSON.stringify({ model, messages: chatMessages(system, history, message), stream: true, max_tokens: 4096, temperature: 0.7 }),
  });
  if (!res.ok) throw await providerError(res, "Cohere");
  let text = "";
  for await (const ev of sse(res)) {
    if (ev.type === "content-delta") {
      const c = ev.delta?.message?.content || {};
      if (c.thinking) await emit("reasoning", c.thinking);   // 추론 모델(command-a-reasoning)일 때
      if (c.text) { text += c.text; await emit("delta", c.text); }
    } else if (ev.type === "error" || (ev.message && !ev.type)) {
      const e = new Error(`Cohere 오류: ${String(ev.message || "").slice(0, 120)}`); e.retry = !text; throw e;
    }
  }
  if (!text) { const e = new Error("Cohere가 빈 답을 보냈어요."); e.retry = true; throw e; }
  return text;
}

// Zhipu · OpenRouter · Kilo: 전부 OpenAI 모양 스트림
const openaiLike = (provider) => (env, model, system, history, message, emit) => {
  const p = OPENAI_LIKE[provider];
  return openaiStream(p.url, env[KEY[provider]], p.name, { model, ...(p.body || {}), messages: chatMessages(system, history, message), max_tokens: 4096, temperature: 0.7 }, emit, p.headers);
};

const RUN = { gemini, mimo, groq, cohere, zhipu: openaiLike("zhipu"), openrouter: openaiLike("openrouter"), kilo: openaiLike("kilo"), ollama: openaiLike("ollama") };

// ---------- 글 한 번에 받기 (대화방 AI용) ----------
// 스트리밍 함수를 그대로 쓰되 글자는 모아서 한 번에 돌려줘요. messages = [{ role: 'user'|'assistant', content }], 마지막은 user.
// 회사 순서는 order 로 (기본 Groq → Gemini → Cohere → MiMo → Zhipu → OpenRouter → Kilo). 붐비면 다음 모델, 그 회사가 아예 안 되면 다음 회사로.
// onToken(text) 을 주면 글자가 나오는 대로 불러요 (스트리밍). 모델이 바뀌어 다시 시작하면 onToken("", { reset: true }) 로 알려요.
export async function aiText(env, system, messages, order = TEXT_ORDER, onToken = null) {
  const groups = order.filter((p) => MODELS[p] && hasKey(env, p));
  if (!groups.length) { const e = new Error("AI 키가 설정되지 않았어요. README의 'AI 키' 부분을 확인해 주세요."); e.status = 503; throw e; }
  const history = messages.slice(0, -1), last = messages[messages.length - 1]?.content || "";
  const quiet = async () => {};
  let lastErr = null, started = false;
  for (const p of groups) {
    for (const model of MODELS[p].chain) {
      // RUN 의 emit(kind, text) 중 delta 만 밖으로 (status · reasoning 은 조용히)
      const tok = onToken ? async (kind, t) => { if (kind !== "delta") return; started = true; await onToken(t); } : quiet;
      try { if (started && onToken) await onToken("", { reset: true }); started = false; return { text: await RUN[p](env, model, system, history, last, tok), used: model }; }
      catch (e) { lastErr = e; if (!e.retry) break; }
    }
  }
  throw lastErr || new Error("AI 답을 받지 못했어요.");
}

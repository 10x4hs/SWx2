// 개인 자료 공급사 확인 (2026-10-25) — 서버 없이 node 에서 돌아요. scripts/smoke.mjs 도 불러요.
//   1) aiJson · aiText · runAgent 를 private 로 부르면 Groq 에만 가고, Groq 가 안 되면 privateError (Gemini 등으로 넘어가지 않아요)
//   2) 공개 호출(private 없음)은 예전 순서 그대로 (Gemini 먼저 — 뉴스 · CIM 교재 · 논문은 아무 회사나 써도 돼요)
//   3) 개인 글을 보내는 곳(brain · records · together · ai 채팅 · cimask)이 private 를 넘기고, brain 이 Cohere 임베딩을 안 쓰는지 (글자로 확인)
//   node scripts/privacy-check.mjs
import { readFileSync } from "node:fs";
import { aiJson, aiText, PRIVATE_SAFE } from "../src/ai.js";
import { runAgent } from "../src/agent.js";

export async function privacyChecks(ok) {
  const env = { GEMINI_API_KEY: "g", GROQ_API_KEY: "q", COHERE_API_KEY: "c", MIMO_API_KEY: "m", ZHIPU_API_KEY: "z", OPENROUTER_API_KEY: "o", KILO_API_KEY: "k", OLLAMA_API_KEY: "l" };
  const real = globalThis.fetch;
  let hosts = [];
  const mock = (groqOk) => async (url) => {
    const h = new URL(String(url)).hostname;
    hosts.push(h);
    if (h === "api.groq.com" && groqOk) return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ error: { message: "busy" } }), { status: 503, headers: { "content-type": "application/json" } });
  };
  const only = (want) => hosts.length > 0 && hosts.every((h) => h === want);
  try {
    ok(PRIVATE_SAFE.length === 1 && PRIVATE_SAFE[0] === "groq", "privacy: PRIVATE_SAFE = [groq]");

    globalThis.fetch = mock(true); hosts = [];
    const a = await aiJson(env, "s", "개인 노트", "gemini", { private: true });
    ok(a.provider === "groq" && only("api.groq.com"), "privacy: aiJson private → Groq first and only, even when Gemini is preferred");

    globalThis.fetch = mock(false); hosts = [];
    let err = null; try { await aiJson(env, "s", "개인 노트", null, { private: true }); } catch (e) { err = e; }
    ok(err?.private === true && only("api.groq.com"), "privacy: aiJson private + Groq down → privateError, no other provider called");

    hosts = []; err = null;
    try { await aiText(env, "s", [{ role: "user", content: "개인 노트" }], ["gemini", "groq", "cohere"], null, { private: true }); } catch (e) { err = e; }
    ok(err?.private === true && only("api.groq.com"), "privacy: aiText private filters order to Groq and fails clearly");

    hosts = []; err = null;
    try { await runAgent(env, null, { system: "s", messages: [{ role: "user", content: "노트" }], tools: [], prefer: "gemini", private: true }); } catch (e) { err = e; }
    ok(err?.private === true && only("api.groq.com"), "privacy: runAgent private ignores prefer=gemini and stays on Groq");

    let noKey = null; try { await aiJson({ GEMINI_API_KEY: "g" }, "s", "p", null, { private: true }); } catch (e) { noKey = e; }
    ok(noKey?.private === true && noKey.status === 503, "privacy: no Groq key → 503 privateError (not Gemini)");

    globalThis.fetch = mock(false); hosts = [];
    try { await aiJson(env, "s", "공개 뉴스", null); } catch {}
    ok(hosts[0] === "generativelanguage.googleapis.com" && hosts.includes("api.groq.com"), "privacy: public aiJson keeps the old order (Gemini first, then others)");
  } finally { globalThis.fetch = real; }

  const src = (f) => readFileSync(new URL("../src/" + f, import.meta.url), "utf8");
  const brain = src("brain.js");
  ok(!/api\.cohere\.com/.test(brain) && /noteVectors/.test(brain), "privacy: brain.js similar-notes uses rag.js noteVectors (no Cohere embed)");
  ok(/aiJson\(env, system, prompt, prefer, \{ private: true \}\)/.test(brain) && (brain.match(/private: true/g) || []).length >= 4, "privacy: brain.js AI calls (organize · generate · page · plan · ask) pass private");
  ok(/\{ private: true \}\); \/\/ 하루 계획/.test(src("records.js")), "privacy: records.js day score is private");
  ok(/private: true \}\)\); \} \/\/ 계획/.test(src("together.js")), "privacy: together.js weekly review is private");
  ok(/isPrivateSafe\(MODELS\[t\]\.provider\) \? \{ sys: system, tools: TOOLS \} : \{ sys: publicSystem, tools: PUBLIC_TOOLS \}/.test(src("ai.js")), "privacy: /ai/chat gives notes · plans context only to private-safe targets");
  ok(/PRIVATE_SAFE, onTok, \{ private: true \}/.test(src("cimask.js")), "privacy: cimask note answers are private");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await privacyChecks((c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; });
}

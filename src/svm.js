// Silicon Valley Mafia (#/svm) — 관리자(HSK · GYK)만 보는 Curtis Yarvin 모음 (2026-10-30)
//   GET  /svm/data                    → 내용 전부: 글 15 · 개념 · 인물 · 관계 · 영상 · 더 읽을 거리 (src/svm/data.js)
//   GET  /svm/source?id=<글>&part=<n> → { label, url, blocks: [{ k: "p"|"h"|"q"|"li", t }], partial }
//        원문은 저장하지 않고 열 때마다 원문 사이트에서 읽어요. 주소는 내용 파일에 적힌 것만 (아무 주소나 대신 열지 않게)
//   POST /svm/translate { id, texts } → { ko: [...] } 단락 번역 (AI · 하루 사용량은 worker.js AI_PATH) — 번역도 서버에 남기지 않아요
//   잠금: 관리자 말고는 404 (src/features.js gate) · 화면도 Dock 에 안 보여요 (public/js/app.js NAV 의 when)
//   읽은 기록 · 설정은 /apps/svm/state (src/appstate.js)
import { aiJson } from "./ai.js";
import { DATA, essayOf } from "./svm/data.js";
import { canonical, extract } from "./svm/extract.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const FETCH_MS = 10_000, MAX_HTML = 3_000_000;
const MAX_TEXTS = 12, MAX_TEXT = 3000, MAX_CHARS = 9000;

export function registerSvm(on, { json, body, fail }) {
  const essay = (id) => essayOf(String(id || "")) || fail(404, "없는 글이에요.");

  on("GET", "/svm/data", async () => json(DATA));

  on("GET", "/svm/source", async ({ q }) => {
    const e = essay(q.get("id")), part = Number(q.get("part") || 0);
    const src = Number.isInteger(part) ? e.sources?.[part] : null;
    if (!src?.url) fail(404, "원문 주소가 없어요.");
    const url = canonical(src.url);
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), FETCH_MS);
    let res, html;
    try {
      res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: ac.signal });
      if (res.ok) html = (await res.text()).slice(0, MAX_HTML);
    } catch { fail(504, "원문 사이트가 답하지 않아요. 잠시 뒤에 다시 해 주세요."); }
    finally { clearTimeout(timer); }
    if (!res.ok) fail(502, `원문 사이트가 ${res.status} 로 답했어요.`);
    const { blocks, paywall } = await extract(html, new URL(res.url || url).hostname);
    if (!blocks.length) fail(502, "원문에서 본문을 찾지 못했어요. '원문 열기'로 사이트에서 읽어 주세요.");
    return json({ id: e.id, part, label: src.label || e.title, url, blocks, partial: paywall });
  });

  on("POST", "/svm/translate", async ({ req, env }) => {
    const b = await body(req), e = essay(b.id);
    const texts = Array.isArray(b.texts) ? b.texts : [];
    if (!texts.length || texts.length > MAX_TEXTS || texts.some((t) => typeof t !== "string" || !t.trim() || t.length > MAX_TEXT)) fail(400, `단락은 1~${MAX_TEXTS}개, 하나에 ${MAX_TEXT}자까지 보낼 수 있어요.`);
    if (texts.reduce((n, t) => n + t.length, 0) > MAX_CHARS) fail(400, `한 번에 ${MAX_CHARS}자까지 보낼 수 있어요.`);
    if (env.__AI_MOCK) return json({ ko: texts.map((t) => "모의 번역 · " + t.slice(0, 40)), model: "mock" }); // 로컬 검사 (AI_MOCK)
    const system = `너는 영어 에세이를 한국어로 옮기는 번역가다.
- 자연스러운 한국어 한다체로 옮긴다. 뜻을 더하거나 빼지 않고, 요약하지 않는다.
- 사람 · 책 · 단체 이름은 한국어로 적고 처음 나올 때만 괄호에 원문을 단다. 비꼬는 말투와 강조는 살린다.
- 단락마다 따로 옮긴다. 출력은 JSON 하나: {"ko": ["1번 단락 번역", "2번 단락 번역", ...]} — 입력 단락 수(${texts.length}개)와 같은 개수, 같은 순서.`;
    const prompt = `글: ${e.title} (${e.venue || ""} ${e.year || ""})\n단락 ${texts.length}개:\n\n${texts.map((t, i) => `[${i + 1}] ${t.trim()}`).join("\n\n")}`;
    let r;
    try { r = await aiJson(env, system, prompt); }
    catch (err) { fail(err.status === 503 ? 503 : 502, err.status === 503 ? err.message : "번역을 받지 못했어요. 잠시 뒤에 다시 해 주세요."); }
    const ko = Array.isArray(r.data?.ko) ? r.data.ko : [];
    return json({ ko: texts.map((_, i) => (typeof ko[i] === "string" && ko[i].trim() ? ko[i].trim() : null)), model: r.model });
  });
}

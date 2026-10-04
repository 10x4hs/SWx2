// 사용자 페이지 — Dock 에 내가 추가하는 화면. 코드는 HTML 한 파일, 화면 쪽 sandbox iframe 에서 돌고 trio.api 브리지로 앱 API 를 써요.
// 규칙: 내 페이지는 읽기·쓰기 전부, 남이 공유한 페이지는 내 계정으로 읽기(GET)만 — 브리지가 막아요(public/js/page-runner.js).
// 만드는 길 두 가지: 앱 안 AI(POST /ai/page-code, 내장 모델) · MCP page_write(Claude Code 같은 바깥 에이전트).
import { aiJson } from "./ai.js";

export const MAX_CODE = 200_000;   // 코드 글자 수
const MAX_VERSIONS = 30;           // 페이지당 남기는 이전 버전 수
const LIST_COLS = "id, user_id, title, icon, purpose, shared, sort, created_at, updated_at, length(code) AS size";

// 페이지 코드가 쓸 수 있는 브리지 설명 — AI 프롬프트와 MCP page_guide 가 같이 써요
export const BRIDGE_GUIDE = `## 페이지 코드 규칙
- HTML 문서 하나(<!doctype html> … </html>). CSS · JS 는 그 안에 인라인. 바깥 CDN 은 쓰지 마 (오프라인 · 보안).
- 화면은 sandbox iframe 안. 쿠키·fetch("/api") 는 안 돼 — 반드시 window.trio 브리지를 써.
- 다크 유리 느낌의 앱 안에 떠. :root 변수가 미리 들어와 있어: --bg --ink --ink-2 --ink-3 --line --glass --accent --c-blue --c-green --c-amber --c-rose --c-teal --font. body 배경은 투명하게 두고 글자색은 var(--ink).
- 모바일 폭(360px)에서도 깨지지 않게. 글자는 14~16px, 눌리는 것은 36px 이상.

## window.trio (await 로 써)
- trio.me  → { id, display_name, color }  · trio.users → 셋의 목록 · trio.today → "YYYY-MM-DD"(한국) · trio.readonly → true 면 남의 공유 페이지(쓰기 호출은 실패)
- trio.api(method, path, body?) → JSON. 실패하면 throw Error(메시지). 예: await trio.api("GET", "/plans?periods=D:2026-10-04")
- trio.go(hash) 앱 화면 이동(예 "#/calendar/2026-10-04") · trio.toast(글) 짧은 알림 · trio.store.get(key)/set(key, value) 이 페이지만의 저장소(JSON)
- trio.onChange(fn) 앱 데이터가 바뀌면 fn 호출(다시 그릴 때)

## 앱 API (path 는 /api 를 뺀 것)
- GET /plans?periods=D:YYYY-MM-DD,W:YYYY-Wnn,M:YYYY-MM,Y:YYYY[&user=id][&days=YYYY-MM-DD..YYYY-MM-DD] → { plans:[{id,text,period,start("HH:MM"|null),mins,done,missed,priority,focus_mins,sort}] }
- POST /plans { text, period:"D:2026-10-04", start?, mins?, priority? } · PATCH /plans/:id { done?, missed?, text?, start?, mins?, priority? } · DELETE /plans/:id
- GET /summary?periods=... → 기간별 계획 수·끝낸 수 · GET /plans/heatmap?from=&to= → 날마다 실행률
- GET /notes[?q=] → { notes:[{id,title,updated_at,shared,user_id}] } · GET /notes/:id → { note:{title,body(markdown)} } · POST /notes { title, body } · PUT /notes/:id { body }
- GET /search?q= · GET /tags · GET /graph
- GET /english/day?day= → 그날 영어 기록 { day:{minutes,newwords,...} } · GET /english/days?from=&to= · PUT /english/day { day, minutes, ... }
- GET /papers/progress → 논문 스프린트 진도(셋) · GET /logs/focus?from=&to=&user= → 집중 타이머 기록
- GET /diary?day= · PUT /diary { day, body } · GET /records/recent · GET /users · GET /me`;

const PAGE_SYSTEM = `너는 작은 웹 앱 화면을 짜는 프런트엔드 개발자야. 사용자가 적은 '목적'에 맞는 페이지를 HTML 한 파일로 만들어.
${BRIDGE_GUIDE}

## 품질
- 처음 열자마자 쓸 수 있게: 데이터는 trio.api 로 바로 불러와 보여 주고, 비어 있으면 안내 문장.
- 버튼마다 동작이 있어야 해. 예외는 try/catch 로 잡아 trio.toast 로 알려.
- 글은 쉬운 한국어 해요체. 이모지는 제목에 하나까지.
- 코드는 짧고 읽기 쉽게, 주석은 한국어로 핵심만. 전체 8,000자 안쪽이면 좋아.
반드시 JSON 하나로만 답해: {"title":"페이지 이름(12자 이내)","icon":"이모지 하나","code":"<!doctype html>…","reply":"무엇을 만들었는지(또는 바꿨는지) 한두 문장"}`;

export function registerPages(on, { json, body, fail, uid, now }) {
  const own = async (env, id, user) => {
    const p = await env.DB.prepare("SELECT * FROM user_pages WHERE id = ?").bind(id).first();
    if (!p) fail(404, "페이지를 찾을 수 없어요.");
    if (p.user_id !== user.id) fail(403, "다른 사람의 페이지는 고칠 수 없어요.");
    return p;
  };
  const visible = async (env, id, user) => {
    const p = await env.DB.prepare("SELECT * FROM user_pages WHERE id = ?").bind(id).first();
    if (!p || (p.user_id !== user.id && !p.shared)) fail(404, "페이지를 찾을 수 없어요.");
    return p;
  };
  const cleanTitle = (s, fallback = "새 페이지") => (String(s || "").replace(/\s+/g, " ").trim().slice(0, 40) || fallback);
  const cleanIcon = (s, fallback = "✨") => { const t = String(s || "").trim(); return t && [...t].length <= 2 ? t : fallback; };
  const cleanCode = (s) => { const c = String(s || ""); if (c.length > MAX_CODE) fail(400, `코드는 ${MAX_CODE.toLocaleString()}자까지예요.`); return c; };
  const nextSort = async (env, user) => ((await env.DB.prepare("SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM user_pages WHERE user_id = ?").bind(user.id).first())?.n ?? 0);
  async function keepVersion(env, p, note) {
    if (!p.code) return;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO user_page_versions (id, page_id, code, note, created_at) VALUES (?, ?, ?, ?, ?)").bind(uid(), p.id, p.code, String(note || "").slice(0, 200), now()),
      env.DB.prepare("DELETE FROM user_page_versions WHERE page_id = ? AND id NOT IN (SELECT id FROM user_page_versions WHERE page_id = ? ORDER BY created_at DESC LIMIT ?)").bind(p.id, p.id, MAX_VERSIONS),
    ]);
  }
  const shape = (p, me) => ({ ...p, shared: !!p.shared, mine: p.user_id === me.id });

  // 목록: 내 것 전부 + 남이 공유한 것 (코드는 빼고)
  on("GET", "/pages", async ({ env, user }) => {
    const { results } = await env.DB.prepare(`SELECT ${LIST_COLS} FROM user_pages WHERE user_id = ? OR shared = 1 ORDER BY (user_id = ?) DESC, sort ASC, created_at ASC`).bind(user.id, user.id).all();
    return json({ pages: results.map((p) => shape(p, user)) });
  });
  on("GET", "/pages/guide", async () => json({ guide: BRIDGE_GUIDE }));
  on("GET", "/pages/:id", async ({ env, user, params }) => json({ page: shape(await visible(env, params.id, user), user) }));
  on("GET", "/pages/:id/versions", async ({ env, user, params }) => {
    await visible(env, params.id, user);
    const { results } = await env.DB.prepare("SELECT id, note, created_at, length(code) AS size FROM user_page_versions WHERE page_id = ? ORDER BY created_at DESC").bind(params.id).all();
    return json({ versions: results });
  });

  on("POST", "/pages", async ({ req, env, user }) => {
    const b = await body(req);
    const p = { id: uid(), user_id: user.id, title: cleanTitle(b.title), icon: cleanIcon(b.icon), purpose: String(b.purpose || "").slice(0, 1000), code: cleanCode(b.code), shared: b.shared ? 1 : 0, sort: await nextSort(env, user), created_at: now(), updated_at: now() };
    await env.DB.prepare("INSERT INTO user_pages (id, user_id, title, icon, purpose, code, shared, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(p.id, p.user_id, p.title, p.icon, p.purpose, p.code, p.shared, p.sort, p.created_at, p.updated_at).run();
    return json({ page: shape(p, user) }, 201);
  });

  on("PATCH", "/pages/:id", async ({ req, env, user, params }) => {
    const p = await own(env, params.id, user), b = await body(req);
    const next = {
      title: b.title !== undefined ? cleanTitle(b.title, p.title) : p.title,
      icon: b.icon !== undefined ? cleanIcon(b.icon, p.icon) : p.icon,
      purpose: typeof b.purpose === "string" ? b.purpose.slice(0, 1000) : p.purpose,
      shared: b.shared !== undefined ? (b.shared ? 1 : 0) : p.shared,
      code: typeof b.code === "string" ? cleanCode(b.code) : p.code,
    };
    if (next.code !== p.code) await keepVersion(env, p, b.note || "직접 고침");
    await env.DB.prepare("UPDATE user_pages SET title = ?, icon = ?, purpose = ?, shared = ?, code = ?, updated_at = ? WHERE id = ?").bind(next.title, next.icon, next.purpose, next.shared, next.code, now(), p.id).run();
    return json({ page: shape({ ...p, ...next, updated_at: now() }, user) });
  });

  on("DELETE", "/pages/:id", async ({ env, user, params }) => {
    const p = await own(env, params.id, user);
    await env.DB.prepare("DELETE FROM user_pages WHERE id = ?").bind(p.id).run();
    return json({ ok: true });
  });

  // 순서: 내 페이지 id 를 원하는 순서대로
  on("POST", "/pages/reorder", async ({ req, env, user }) => {
    const b = await body(req), ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === "string").slice(0, 100) : [];
    if (!ids.length) fail(400, "순서를 주세요.");
    await env.DB.batch(ids.map((id, i) => env.DB.prepare("UPDATE user_pages SET sort = ? WHERE id = ? AND user_id = ?").bind(i, id, user.id)));
    return json({ ok: true });
  });

  // 이전 버전으로 되돌리기 (지금 코드도 버전으로 남겨요)
  on("POST", "/pages/:id/restore", async ({ req, env, user, params }) => {
    const p = await own(env, params.id, user), b = await body(req);
    const v = await env.DB.prepare("SELECT * FROM user_page_versions WHERE id = ? AND page_id = ?").bind(String(b.version_id || ""), p.id).first();
    if (!v) fail(404, "그 버전을 찾을 수 없어요.");
    await keepVersion(env, p, "되돌리기 전");
    await env.DB.prepare("UPDATE user_pages SET code = ?, updated_at = ? WHERE id = ?").bind(v.code, now(), p.id).run();
    return json({ page: shape({ ...p, code: v.code, updated_at: now() }, user) });
  });

  // ---------- AI: 목적을 적으면 페이지 코드를 짜고, 대화로 고쳐요 ----------
  // body: { purpose, model? } → 새 페이지 | { page_id, instruction, model? } → 그 페이지 코드를 고쳐 써요
  on("POST", "/ai/page-code", async ({ req, env, user }) => {
    const b = await body(req), model = typeof b.model === "string" ? b.model : null;
    const ask = async (prompt) => {
      try { return await aiJson(env, PAGE_SYSTEM, prompt, model); }
      catch (e) { fail(e.status || 502, e.message || "AI 가 응답하지 않았어요."); }
    };
    const pick = (data) => {
      const code = String(data?.code || "");
      if (!/<html[\s>]/i.test(code) || !/<\/html>/i.test(code)) fail(502, "AI 가 완전한 페이지를 돌려주지 않았어요. 다시 시도하거나 더 짧게 적어 주세요.");
      return { code: cleanCode(code), title: data?.title, icon: data?.icon, reply: String(data?.reply || "") };
    };
    const me = `사용자: ${user.display_name} (id ${user.id}) · 오늘 ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}`;
    if (b.page_id) {
      const p = await own(env, b.page_id, user);
      const instruction = String(b.instruction || "").trim().slice(0, 1000);
      if (!instruction) fail(400, "어떻게 고칠지 적어 주세요.");
      const { data, used } = await ask([me, `페이지 '${p.title}' (목적: ${p.purpose || "-"}) 를 사용자의 요청대로 고쳐. 요청과 상관없는 부분은 그대로 두고, 전체 코드를 다시 돌려줘.`, `## 요청\n${instruction}`, `## 현재 코드\n${p.code.slice(0, 60_000)}`].join("\n\n"));
      const r = pick(data);
      await keepVersion(env, p, `AI: ${instruction.slice(0, 80)}`);
      const title = b.keep_title === false ? cleanTitle(r.title, p.title) : p.title, icon = cleanIcon(r.icon, p.icon);
      await env.DB.prepare("UPDATE user_pages SET title = ?, icon = ?, code = ?, updated_at = ? WHERE id = ?").bind(title, icon, r.code, now(), p.id).run();
      return json({ page: shape({ ...p, title, icon, code: r.code, updated_at: now() }, user), reply: r.reply || "고쳤어요.", model: used });
    }
    const purpose = String(b.purpose || "").trim().slice(0, 1000);
    if (!purpose) fail(400, "이 페이지로 무엇을 하고 싶은지 적어 주세요.");
    const { data, used } = await ask([me, `## 목적\n${purpose}`].join("\n\n"));
    const r = pick(data);
    const p = { id: uid(), user_id: user.id, title: cleanTitle(r.title, purpose.slice(0, 12)), icon: cleanIcon(r.icon), purpose, code: r.code, shared: 0, sort: await nextSort(env, user), created_at: now(), updated_at: now() };
    await env.DB.prepare("INSERT INTO user_pages (id, user_id, title, icon, purpose, code, shared, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(p.id, p.user_id, p.title, p.icon, p.purpose, p.code, p.shared, p.sort, p.created_at, p.updated_at).run();
    return json({ page: shape(p, user), reply: r.reply || "만들었어요.", model: used }, 201);
  });
}

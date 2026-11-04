// 사용자 페이지 — Dock 에 내가 추가하는 화면. 페이지 하나 = 여러 파일(index.html · style.css · app.js · 다른 html …).
// 서버가 /pf/<id>/<path> 로 그대로 서빙하고(html 에는 브리지 스크립트를 끼워 넣어요), 화면 쪽은 sandbox iframe(allow-same-origin 없음)에 띄워요.
// 규칙: 내 페이지는 앱 API 읽기·쓰기 전부, 남이 공유한 페이지는 내 계정으로 읽기(GET)만 — 브리지가 막아요(public/js/page-runner.js).
// kind=url 이면 바깥 사이트 주소를 Dock 안에 띄우는 페이지예요(파일 없음).
import { aiJson } from "./ai.js";
import { b64u, unb64u } from "./proxy.js";
import { kstToday } from "./lib/day.js";
import { PEERS, isPeer } from "./teams.js";

export const MAX_FILE = 300_000;      // 파일 하나 글자 수
export const MAX_FILES = 40;          // 페이지당 파일 수
const MAX_TOTAL = 1_500_000;   // 페이지 전체 글자 수
const MAX_VERSIONS = 30;
const LIST_COLS = "id, user_id, title, icon, purpose, kind, url, place, shared, sort, created_at, updated_at";
const MAX_STATE = 200_000; // 사람별 저장소(JSON) 글자 수
const PATH_RE = /^(?!\.)(?!.*\.\.)[\w\-. /]{1,120}$/;  // 상대 경로만 · .. 금지
const TYPES = { html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", svg: "image/svg+xml", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8", csv: "text/csv; charset=utf-8", xml: "application/xml; charset=utf-8", webmanifest: "application/manifest+json" };
const BRIDGE_TAG = `<script src="/js/page-bridge.js"></script>`;

// 페이지 코드가 쓸 수 있는 브리지 설명 — AI 프롬프트와 MCP page_guide 가 같이 써요
export const BRIDGE_GUIDE = `## 페이지 규칙
- 페이지 = 파일 여러 개. 반드시 index.html 이 있어야 하고, style.css · app.js · 다른 html(about.html 처럼) 을 상대 경로로 자유롭게 써. 상대 경로는 그대로 돼.
- 외부 자원은 제한 없음: CDN 라이브러리(three.js · Chart.js · Tailwind · GSAP …), 구글 폰트, 이미지 주소, 바깥 API fetch(그 사이트가 CORS 를 열어 둔 경우). 손으로 짠 정적 사이트 수준(여러 장 · 애니메이션 · 폰트)으로 만들어도 돼.
- 화면은 sandbox iframe 안. 쿠키·fetch("/api") 는 안 돼 — 앱 데이터는 반드시 window.trio 브리지로. 브리지는 서버가 html 마다 끼워 넣어 주니 직접 넣지 마.
- 기본 글꼴·색은 네가 정해. 앱 테마 색이 필요하면 trio.theme (아래) 로 받아 써. 모바일 폭(360px)에서도 깨지지 않게.

## window.trio (await trio.ready 뒤에 써 — 또는 trio.onReady(fn))
- trio.me { id, display_name, color } · trio.users 셋의 목록 · trio.today "YYYY-MM-DD"(한국) · trio.readonly true 면 남의 공유 페이지(쓰기 호출은 실패) · trio.theme { bg, ink, ink2, ink3, line, accent, blue, green, amber, rose, teal, dark:boolean }
- trio.api(method, path, body?) → JSON. 실패하면 throw Error(메시지). 예: await trio.api("GET", "/plans?periods=D:" + trio.today)
- trio.go(hash) 앱 화면 이동(예 "#/calendar/2026-10-04") · trio.toast(글) 짧은 알림
- trio.store.get(key) / set(key, value) / all() — 이 페이지의 **사람별 서버 저장소**(JSON, 폰 · 노트북 어디서나 같음). 체크 · 기록 · 진도는 여기에.
- trio.others() → [{ user_id, display_name, color, data }] 공개 페이지일 때 셋의 저장값(친구 진도 나란히 보기). 비공개면 내 것만.
- trio.onChange(fn) 앱 데이터가 바뀌면 fn 호출(다시 그릴 때)

## 짧은 도우미 (trio.api 를 감싼 것 — 되도록 이걸 먼저 써)
- await trio.plans.today() → 오늘 하루 계획 [{id,text,start,mins,done,missed,priority,focus_mins}] · trio.plans.day("YYYY-MM-DD") 그날 · trio.plans.range(from, to) 그 사이 날마다(62일까지, 항목에 date)
- await trio.plans.add({ text, start?:"HH:MM", mins?, day?:"YYYY-MM-DD"(기본 오늘), priority?:1~5 }) → 만든 plan · await trio.plans.done(id, true|false) → 고친 plan
- await trio.notes.search("검색어") → [{id,title,snippet}] · await trio.notes.get(id) → { id, title, body(markdown) … }
- 예: const ps = await trio.plans.today(); list.innerHTML = ps.map((p) => \`<li>\${p.start || ""} \${p.text}</li>\`).join("") || "<li>오늘 계획이 없어요</li>";

## 앱 API (path 는 /api 를 뺀 것)
- GET /plans?periods=D:YYYY-MM-DD,W:YYYY-Wnn,M:YYYY-MM,Y:YYYY[&user=id][&days=YYYY-MM-DD..YYYY-MM-DD] → { plans:[{id,text,period,start("HH:MM"|null),mins,done,missed,priority,focus_mins,sort}] }
- POST /plans { scope:"day", period:"D:2026-10-04", text, start?, mins?, priority? } (scope 는 day|week|month|year, period 모양과 맞게) · PATCH /plans/:id { done?, missed?, text?, start?, mins?, priority? } · DELETE /plans/:id
- GET /summary?periods=... → 기간별 계획 수·끝낸 수 · GET /plans/heatmap?from=&to= → 날마다 실행률
- GET /notes → { notes:[{id,title,updated_at,shared,user_id}] } (검색은 GET /search?q= → { notes:[{id,title,snippet}], plans }) · GET /notes/:id → { note:{title,body(markdown)} } · POST /notes { title, body } · PUT /notes/:id { body }
- GET /search?q= · GET /tags · GET /graph
- GET /english/day?day= → 그날 영어 기록 { day:{minutes,newwords,...} } · GET /english/days?from=&to= · PUT /english/day { day, minutes, ... }
- GET /papers/progress → 논문 스프린트 진도(셋) · GET /logs/focus?from=&to=&user= → 집중 타이머 기록
- GET /diary?day= · PUT /diary { day, body } · GET /records/recent · GET /users · GET /me

## Study 그래프 (place="study" 과목 페이지)
Study 의 각 과목 탭에는 [내용 | 그래프] 가 있고, 그래프는 페이지에서 자동으로 만들어져요. 그래서 과목 페이지는 이렇게 만들어 주세요:
- 내용의 구조를 **정적 HTML 제목(h1~h4)** 으로 써요 (JS 로만 그리면 그래프가 못 읽어요). 제목이 아닌 개념 하나하나는 \`data-node="개념 이름"\` 을 붙이면 점이 돼요.
- 개념 사이 관계가 중요하면 \`graph.json\` 파일을 같이 넣어요: \`{"nodes":[{"id":"tok","title":"토큰","type":"section|topic|item"}],"links":[{"s":"root","t":"tok"}]}\` — 있으면 제목 대신 이걸로 그려요 ("root" = 과목).`;

const PAGE_SYSTEM = `너는 작은 웹 사이트·앱 화면을 짜는 프런트엔드 개발자야. 사용자가 적은 '목적'에 맞는 페이지를 파일 여러 개로 만들어.
${BRIDGE_GUIDE}

## 품질
- 처음 열자마자 쓸 수 있게: 앱 데이터가 필요하면 trio.plans · trio.notes 도우미(없으면 trio.api)로 바로 불러와 보여 주고, 비어 있으면 안내 문장.
- 버튼마다 동작이 있어야 해. 예외는 try/catch 로 잡아 trio.toast 로 알려.
- 디자인은 목적에 맞게 과감하게(폰트 · 여백 · 움직임). 글은 쉬운 한국어 해요체.
- 파일은 index.html + style.css + app.js 로 나누는 게 기본. 장이 여러 개면 html 을 더 만들어 서로 링크해.
반드시 JSON 하나로만 답해: {"title":"페이지 이름(12자 이내)","icon":"이모지 하나","files":{"index.html":"<!doctype html>…","style.css":"…","app.js":"…"},"reply":"무엇을 만들었는지(또는 바꿨는지) 한두 문장"}`;

const isHtml = (p) => /\.html?$/i.test(p);
const typeOf = (p) => TYPES[(p.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
// html 에 브리지를 끼워 넣어요 (<head> 바로 뒤, 없으면 맨 앞)
const withBridge = (html) => (html.includes("/js/page-bridge.js") ? html : /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + BRIDGE_TAG) : BRIDGE_TAG + html);

export function registerPages(on, { json, body, fail, uid, now }) {
  const own = async (env, id, user) => {
    const p = await env.DB.prepare("SELECT * FROM user_pages WHERE id = ?").bind(id).first();
    if (!p) fail(404, "페이지를 찾을 수 없어요.");
    if (p.user_id !== user.id) fail(403, "다른 사람의 페이지는 고칠 수 없어요.");
    return p;
  };
  const visible = async (env, id, user) => {
    const p = await env.DB.prepare("SELECT * FROM user_pages WHERE id = ?").bind(id).first();
    if (!p || (p.user_id !== user.id && !(p.shared && (await isPeer(env, user.id, p.user_id))))) fail(404, "페이지를 찾을 수 없어요."); // 공개 페이지도 같은 팀 사람만
    return p;
  };
  const cleanTitle = (s, fallback = "새 페이지") => (String(s || "").replace(/\s+/g, " ").trim().slice(0, 40) || fallback);
  const cleanIcon = (s, fallback = "✨") => { const t = String(s || "").trim(); return (t && [...t].length <= 2) || /^https?:\/\/\S{1,500}$/.test(t) ? t : fallback; }; // 이모지 하나 또는 파비콘 주소
  const cleanUrl = (s) => { const u = String(s || "").trim(); if (!u) return ""; if (!/^https?:\/\/[^\s]+$/i.test(u)) fail(400, "주소는 http:// 또는 https:// 로 시작해야 해요."); return u.slice(0, 2000); };
  const nextSort = async (env, user) => ((await env.DB.prepare("SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM user_pages WHERE user_id = ?").bind(user.id).first())?.n ?? 0);
  // 파일 묶음 검사: { path: content | null(지움) }
  function cleanFiles(input, { partial = false } = {}) {
    if (!input || typeof input !== "object") fail(400, "files 는 { 경로: 내용 } 모양이어야 해요.");
    const out = {};
    for (const [rawPath, content] of Object.entries(input)) {
      const path = rawPath.replace(/^\.?\//, "").trim();
      if (!PATH_RE.test(path)) fail(400, `파일 이름이 이상해요: ${rawPath} (글자·숫자·-_./ 만, .. 금지)`);
      if (content === null) { if (partial) out[path] = null; continue; }
      if (typeof content !== "string") fail(400, `${path} 의 내용은 글자여야 해요.`);
      if (content.length > MAX_FILE) fail(400, `${path} 가 너무 커요 (${MAX_FILE.toLocaleString()}자까지).`);
      out[path] = content;
    }
    return out;
  }
  const filesOf = async (env, id) => Object.fromEntries((await env.DB.prepare("SELECT path, content FROM user_page_files WHERE page_id = ? ORDER BY path").bind(id).all()).results.map((r) => [r.path, r.content]));
  async function writeFiles(env, id, files, { replaceAll = false } = {}) {
    const stmts = [];
    if (replaceAll) stmts.push(env.DB.prepare("DELETE FROM user_page_files WHERE page_id = ?").bind(id));
    for (const [path, content] of Object.entries(files)) {
      if (content === null) stmts.push(env.DB.prepare("DELETE FROM user_page_files WHERE page_id = ? AND path = ?").bind(id, path));
      else stmts.push(env.DB.prepare("INSERT INTO user_page_files (page_id, path, content, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(page_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at").bind(id, path, content, now()));
    }
    if (stmts.length) await env.DB.batch(stmts);
    const all = await filesOf(env, id);
    const n = Object.keys(all).length, total = Object.values(all).reduce((a, c) => a + c.length, 0);
    if (n > MAX_FILES || total > MAX_TOTAL) fail(400, `페이지가 너무 커요 (파일 ${MAX_FILES}개 · 총 ${(MAX_TOTAL / 1e6).toFixed(1)}MB 까지).`);
    // code 컬럼 = index.html (예전 화면 · MCP 호환)
    await env.DB.prepare("UPDATE user_pages SET code = ?, updated_at = ? WHERE id = ?").bind(all["index.html"] || "", now(), id).run();
    return all;
  }
  async function keepVersion(env, p, note) {
    const files = await filesOf(env, p.id);
    if (!Object.keys(files).length) return;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO user_page_versions (id, page_id, code, note, created_at) VALUES (?, ?, ?, ?, ?)").bind(uid(), p.id, JSON.stringify(files), String(note || "").slice(0, 200), now()),
      env.DB.prepare("DELETE FROM user_page_versions WHERE page_id = ? AND id NOT IN (SELECT id FROM user_page_versions WHERE page_id = ? ORDER BY created_at DESC LIMIT ?)").bind(p.id, p.id, MAX_VERSIONS),
    ]);
  }
  const shape = (p, me, files) => ({ id: p.id, user_id: p.user_id, title: p.title, icon: p.icon, purpose: p.purpose, kind: p.kind || "code", url: p.url || "", place: p.place === "study" ? "study" : "dock", shared: !!p.shared, sort: p.sort, created_at: p.created_at, updated_at: p.updated_at, mine: p.user_id === me.id, ...(files ? { files, code: files["index.html"] || "" } : {}) });

  on("GET", "/pages", async ({ env, user }) => {
    const { results } = await env.DB.prepare(`SELECT ${LIST_COLS} FROM user_pages WHERE user_id = ?1 OR (shared = 1 AND user_id IN ${PEERS("?1")}) ORDER BY (user_id = ?1) DESC, sort ASC, created_at ASC`).bind(user.id).all();
    return json({ pages: results.map((p) => shape(p, user)) });
  });
  on("GET", "/pages/guide", async () => json({ guide: BRIDGE_GUIDE }));
  // 페이지 + 파일을 한 번에 (볼 수 없는 페이지면 파일은 버리고 404)
  on("GET", "/pages/:id", async ({ env, user, params }) => {
    const [pg, fs] = await env.DB.batch([env.DB.prepare("SELECT * FROM user_pages WHERE id = ?").bind(params.id), env.DB.prepare("SELECT path, content FROM user_page_files WHERE page_id = ? ORDER BY path").bind(params.id)]);
    const p = pg.results[0];
    if (!p || (p.user_id !== user.id && !(p.shared && (await isPeer(env, user.id, p.user_id))))) fail(404, "페이지를 찾을 수 없어요."); // 공개 페이지도 같은 팀 사람만
    return json({ page: shape(p, user, Object.fromEntries(fs.results.map((r) => [r.path, r.content]))) });
  });
  on("GET", "/pages/:id/versions", async ({ env, user, params }) => {
    await visible(env, params.id, user);
    const { results } = await env.DB.prepare("SELECT id, note, created_at, length(code) AS size FROM user_page_versions WHERE page_id = ? ORDER BY created_at DESC").bind(params.id).all();
    return json({ versions: results });
  });

  // 만들기: { title, icon, purpose, kind:"code"|"url", url, files | code, shared }
  on("POST", "/pages", async ({ req, env, user }) => {
    const b = await body(req);
    const kind = b.kind === "url" ? "url" : "code", url = kind === "url" ? cleanUrl(b.url) : "", place = b.place === "study" ? "study" : "dock";
    if (kind === "url" && !url) fail(400, "띄울 주소를 적어 주세요.");
    const p = { id: uid(), user_id: user.id, title: cleanTitle(b.title), icon: cleanIcon(b.icon, kind === "url" ? "🔗" : place === "study" ? "📚" : "✨"), purpose: String(b.purpose || "").slice(0, 1000), code: "", kind, url, place, shared: b.shared ? 1 : 0, sort: await nextSort(env, user), created_at: now(), updated_at: now() };
    await env.DB.prepare("INSERT INTO user_pages (id, user_id, title, icon, purpose, code, kind, url, place, shared, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(p.id, p.user_id, p.title, p.icon, p.purpose, p.code, p.kind, p.url, p.place, p.shared, p.sort, p.created_at, p.updated_at).run();
    let files = {};
    if (kind === "code") {
      const f = b.files ? cleanFiles(b.files) : typeof b.code === "string" ? { "index.html": b.code.slice(0, MAX_FILE) } : {};
      if (!f["index.html"] && place === "study") f["index.html"] = `<!doctype html>\n<html lang="ko">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${p.title}</title><link rel="stylesheet" href="style.css"></head>\n<body>\n  <h1>${p.icon} ${p.title}</h1>\n  <p>아직 빈 과목 페이지예요. 오른쪽 'AI 에게' 칸에 이렇게 적어 보세요: "매일 30분 목표, 이번 주 할 일 체크리스트, 공부한 날 잔디, 자료 링크 칸" — 체크 · 기록은 trio.store 에 사람별로 저장돼요.</p>\n  <p id="out"></p>\n  <script src="app.js"></script>\n</body>\n</html>`;
      if (!f["index.html"]) f["index.html"] = `<!doctype html>\n<html lang="ko">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${p.title}</title><link rel="stylesheet" href="style.css"></head>\n<body>\n  <h1>${p.icon} ${p.title}</h1>\n  <p>오른쪽 '코드' 탭에서 파일을 고치거나, 'AI 에게' 칸에 바꾸고 싶은 걸 적어 보세요.</p>\n  <p id="out"></p>\n  <script src="app.js"></script>\n</body>\n</html>`;
      if (f["index.html"].includes("style.css") && !f["style.css"]) f["style.css"] = `body { font-family: system-ui, sans-serif; margin: 24px; line-height: 1.6; }`;
      if (f["index.html"].includes("app.js") && !f["app.js"]) f["app.js"] = `trio.onReady(async () => {\n  const r = await trio.api("GET", "/plans?periods=D:" + trio.today);\n  document.getElementById("out").textContent = trio.me.display_name + " 의 오늘 계획 " + r.plans.length + "개";\n});`;
      files = await writeFiles(env, p.id, f, { replaceAll: true });
    }
    return json({ page: shape(p, user, files) }, 201);
  });

  // 고치기: { title, icon, purpose, shared, url, files:{path: content|null}(부분) | code(=index.html), note }
  on("PATCH", "/pages/:id", async ({ req, env, user, params }) => {
    const p = await own(env, params.id, user), b = await body(req);
    const next = {
      title: b.title !== undefined ? cleanTitle(b.title, p.title) : p.title,
      icon: b.icon !== undefined ? cleanIcon(b.icon, p.icon) : p.icon,
      purpose: typeof b.purpose === "string" ? b.purpose.slice(0, 1000) : p.purpose,
      shared: b.shared !== undefined ? (b.shared ? 1 : 0) : p.shared,
      url: b.url !== undefined ? cleanUrl(b.url) : p.url,
      place: b.place !== undefined ? (b.place === "study" ? "study" : "dock") : (p.place || "dock"),
    };
    let files = null;
    const patch = b.files ? cleanFiles(b.files, { partial: true }) : typeof b.code === "string" ? { "index.html": b.code.slice(0, MAX_FILE) } : null;
    if (patch && Object.keys(patch).length) { await keepVersion(env, p, b.note || "직접 고침"); files = await writeFiles(env, p.id, patch); }
    await env.DB.prepare("UPDATE user_pages SET title = ?, icon = ?, purpose = ?, shared = ?, url = ?, place = ?, updated_at = ? WHERE id = ?").bind(next.title, next.icon, next.purpose, next.shared, next.url, next.place, now(), p.id).run();
    return json({ page: shape({ ...p, ...next, updated_at: now() }, user, files || await filesOf(env, p.id)) });
  });

  on("DELETE", "/pages/:id", async ({ env, user, params }) => {
    const p = await own(env, params.id, user);
    await env.DB.prepare("DELETE FROM user_pages WHERE id = ?").bind(p.id).run();
    return json({ ok: true });
  });
  on("POST", "/pages/reorder", async ({ req, env, user }) => {
    const b = await body(req), ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === "string").slice(0, 100) : [];
    if (!ids.length) fail(400, "순서를 주세요.");
    await env.DB.batch(ids.map((id, i) => env.DB.prepare("UPDATE user_pages SET sort = ? WHERE id = ? AND user_id = ?").bind(i, id, user.id)));
    return json({ ok: true });
  });
  // 파일 토큰: 러너가 iframe 을 /pf/<id>/~<토큰>/ 로 열 때 써요 (servePageFile 위 설명)
  on("GET", "/pages/:id/file-token", async ({ env, user, params }) => {
    await visible(env, params.id, user);
    return json({ token: await makeFileToken(env, user.id, params.id), ttl: FILE_TOKEN_TTL });
  });
  // 사람별 저장소 (trio.store): 내 것 읽기·쓰기. 공개 페이지면 셋의 것을 읽기(trio.others)
  on("GET", "/pages/:id/state", async ({ env, user, params }) => {
    // 볼 수 있는 페이지일 때만 내 저장값 (쿼리 하나)
    const r = await env.DB.prepare(`SELECT s.data FROM user_pages p LEFT JOIN user_page_state s ON s.page_id = p.id AND s.user_id = ?1 WHERE p.id = ?2 AND (p.user_id = ?1 OR (p.shared AND p.user_id IN ${PEERS("?1")}))`).bind(user.id, params.id).first();
    if (!r) fail(404, "페이지를 찾을 수 없어요.");
    let data = {}; try { data = JSON.parse(r?.data || "{}"); } catch {}
    return json({ data });
  });
  on("PUT", "/pages/:id/state", async ({ req, env, user, params }) => {
    const b = await body(req), data = b && typeof b.data === "object" && b.data ? b.data : {};
    const text = JSON.stringify(data); if (text.length > MAX_STATE) fail(400, "저장할 게 너무 커요 (200KB 까지).");
    // 볼 수 있는 페이지일 때만 저장 (권한 확인 + 저장을 쿼리 하나로). 안 들어갔으면 404
    const r = await env.DB.prepare(`INSERT INTO user_page_state (page_id, user_id, data, updated_at) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM user_pages WHERE id = ?1 AND (user_id = ?2 OR (shared AND user_id IN ${PEERS("?2")}))) ON CONFLICT(page_id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).bind(params.id, user.id, text, now()).run();
    if (!r.meta.changes) fail(404, "페이지를 찾을 수 없어요.");
    return json({ ok: true });
  });
  on("GET", "/pages/:id/state/all", async ({ env, user, params }) => {
    const p = await visible(env, params.id, user);
    if (!p.shared && p.user_id !== user.id) fail(403, "공개 페이지만 친구 저장값을 볼 수 있어요.");
    const { results } = await env.DB.prepare(`SELECT s.user_id, s.data, s.updated_at, u.display_name, u.color FROM user_page_state s JOIN users u ON u.id = s.user_id WHERE s.page_id = ? AND s.user_id IN ${PEERS("?")}`).bind(params.id, user.id).all();
    return json({ states: results.map((r) => { let data = {}; try { data = JSON.parse(r.data || "{}"); } catch {} return { user_id: r.user_id, display_name: r.display_name, color: r.color, updated_at: r.updated_at, data }; }) });
  });
  on("POST", "/pages/:id/restore", async ({ req, env, user, params }) => {
    const p = await own(env, params.id, user), b = await body(req);
    const v = await env.DB.prepare("SELECT * FROM user_page_versions WHERE id = ? AND page_id = ?").bind(String(b.version_id || ""), p.id).first();
    if (!v) fail(404, "그 버전을 찾을 수 없어요.");
    let files; try { files = JSON.parse(v.code); if (!files || typeof files !== "object") throw 0; } catch { files = { "index.html": v.code }; } // 예전 버전은 html 한 덩어리
    await keepVersion(env, p, "되돌리기 전");
    const all = await writeFiles(env, p.id, files, { replaceAll: true });
    return json({ page: shape({ ...p, updated_at: now() }, user, all) });
  });

  // ---------- AI: 목적을 적으면 페이지(파일 여러 개)를 짜고, 대화로 고쳐요 ----------
  on("POST", "/ai/page-code", async ({ req, env, user }) => {
    const b = await body(req), model = typeof b.model === "string" && b.model ? b.model : "gemini"; // 긴 코드는 Gemini 가 가장 안정적
    const ask = async (prompt) => { try { return await aiJson(env, PAGE_SYSTEM, prompt, model); } catch (e) { fail(e.status || 502, e.message || "AI 가 응답하지 않았어요."); } };
    const pick = (data) => {
      let files = data?.files && typeof data.files === "object" ? data.files : typeof data?.code === "string" ? { "index.html": data.code } : null;
      if (!files || !/<html[\s>]/i.test(files["index.html"] || "")) fail(502, "AI 가 완전한 페이지(index.html)를 돌려주지 않았어요. 다시 시도하거나 더 짧게 적어 주세요.");
      return { files: cleanFiles(files), title: data?.title, icon: data?.icon, reply: String(data?.reply || "") };
    };
    const me = `사용자: ${user.display_name} (id ${user.id}) · 오늘 ${kstToday()}`;
    if (b.page_id) {
      const p = await own(env, b.page_id, user);
      if ((p.kind || "code") !== "code") fail(400, "URL 페이지는 AI 로 고칠 수 없어요.");
      const instruction = String(b.instruction || "").trim().slice(0, 1000);
      if (!instruction) fail(400, "어떻게 고칠지 적어 주세요.");
      const cur = await filesOf(env, p.id);
      const dump = Object.entries(cur).map(([k, v]) => `### ${k}\n${v}`).join("\n\n").slice(0, 120_000);
      const { data, used } = await ask([me, `페이지 '${p.title}' (목적: ${p.purpose || "-"}) 를 사용자의 요청대로 고쳐. 요청과 상관없는 부분은 그대로 두고, 모든 파일을 전부 다시 돌려줘(빠뜨린 파일은 지워져).`, `## 요청\n${instruction}`, `## 현재 파일\n${dump}`].join("\n\n"));
      const r = pick(data);
      await keepVersion(env, p, `AI: ${instruction.slice(0, 80)}`);
      const files = await writeFiles(env, p.id, r.files, { replaceAll: true });
      const icon = cleanIcon(r.icon, p.icon);
      await env.DB.prepare("UPDATE user_pages SET icon = ?, updated_at = ? WHERE id = ?").bind(icon, now(), p.id).run();
      return json({ page: shape({ ...p, icon, updated_at: now() }, user, files), reply: r.reply || "고쳤어요.", model: used });
    }
    const purpose = String(b.purpose || "").trim().slice(0, 1000), place = b.place === "study" ? "study" : "dock";
    if (!purpose) fail(400, "이 페이지로 무엇을 하고 싶은지 적어 주세요.");
    const { data, used } = await ask([me, place === "study" ? "이 페이지는 'Study' 탭 안의 과목 페이지야. 목표 · 일정 · 자료 · 체크 · 기록처럼 그 과목을 꾸준히 공부하게 돕는 구성으로. 내용 구조는 정적 h1~h4 제목으로 써 줘(Study 그래프가 자동으로 읽어요). 체크 · 기록은 trio.store 에 저장하고(사람별), 공개 페이지면 trio.others() 로 친구 진도도 나란히 보여 줘." : "", `## 목적\n${purpose}`].filter(Boolean).join("\n\n"));
    const r = pick(data);
    const p = { id: uid(), user_id: user.id, title: cleanTitle(r.title, purpose.slice(0, 12)), icon: cleanIcon(r.icon, place === "study" ? "📚" : "✨"), purpose, code: "", kind: "code", url: "", place, shared: 0, sort: await nextSort(env, user), created_at: now(), updated_at: now() };
    await env.DB.prepare("INSERT INTO user_pages (id, user_id, title, icon, purpose, code, kind, url, place, shared, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(p.id, p.user_id, p.title, p.icon, p.purpose, p.code, p.kind, p.url, p.place, p.shared, p.sort, p.created_at, p.updated_at).run();
    const files = await writeFiles(env, p.id, r.files, { replaceAll: true });
    return json({ page: shape(p, user, files), reply: r.reply || "만들었어요.", model: used }, 201);
  });
}

// 페이지 파일 토큰 — sandbox iframe(allow-same-origin 없음) 안에서 부르는 style.css · app.js 같은 하위 요청은 출처가 없어서
// SameSite=Lax 로그인 쿠키가 안 붙어요. 그래서 iframe 을 /pf/<id>/~<토큰>/index.html 로 열고, 상대 경로가 토큰을 그대로 달고 가게 해요.
// 토큰은 (보는 사람 · 페이지 하나 · 12시간) 에 묶여서, 공유 페이지 코드가 보는 사람의 다른 페이지를 읽는 데는 못 써요.
const FILE_TOKEN_TTL = 12 * 3600e3;
async function signFile(env, data) {
  const secret = env.FILE_TOKEN_SECRET || env.VAPID_PRIVATE_KEY || env.INVITE_CODE; // 비밀값이 없으면 토큰을 만들지도 받지도 않아요 (짐작되는 기본값 금지)
  if (!secret) throw new Error("token secret missing");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("pf:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
async function makeFileToken(env, userId, pageId) { const body = `${userId}.${pageId}.${Date.now() + FILE_TOKEN_TTL}`; return `${b64u(body)}.${await signFile(env, body)}`; }
async function fileTokenUser(env, token, pageId) {
  const [b, sig] = String(token || "").split("."); if (!b || !sig) return null;
  let body; try { body = unb64u(b); } catch { return null; }
  if ((await signFile(env, body)) !== sig) return null;
  const [userId, pid, exp] = body.split(".");
  return pid === pageId && +exp > Date.now() ? userId : null;
}

// /pf/<id>/[~<토큰>/]<path> — 페이지 파일 서빙 (파일 토큰 또는 로그인 쿠키로 · 내 것 또는 공유된 것). html 에는 브리지를 끼워요. sandbox CSP 로 한 번 더 가둬요.
// getUser: 로그인 쿠키의 사람을 찾는 함수 (토큰이 없을 때만 불러서 DB 왕복을 아껴요)
export async function servePageFile(req, env, url, getUser) {
  const m = /^\/pf\/([^/]+)(?:\/~([^/]+))?\/?(.*)$/.exec(url.pathname);
  if (!m) return new Response("not found", { status: 404 });
  const id = m[1], viewer = m[2] ? await fileTokenUser(env, m[2], id) : (await getUser())?.id;
  if (!viewer) return new Response("로그인이 필요해요.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  let path = decodeURIComponent(m[3] || "") || "index.html";
  if (path.endsWith("/")) path += "index.html";
  // 페이지 권한 + 파일을 쿼리 하나로 (f.page_id 가 NULL 이면 파일이 없는 것)
  const p = await env.DB.prepare("SELECT p.user_id, p.shared, f.page_id AS has, f.content FROM user_pages p LEFT JOIN user_page_files f ON f.page_id = p.id AND f.path = ? WHERE p.id = ?").bind(path, id).first();
  if (!p || (p.user_id !== viewer && !(p.shared && (await isPeer(env, viewer, p.user_id))))) return new Response("not found", { status: 404 });
  const f = p.has == null ? null : p;
  if (!f) return new Response(`파일이 없어요: ${path}`, { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const html = isHtml(path);
  return new Response(html ? withBridge(f.content) : f.content, { headers: {
    "content-type": typeOf(path), "cache-control": "no-store", "x-content-type-options": "nosniff",
    // html 이 아닌 파일(svg · xml …)도 주소를 바로 열면 문서가 돼요 → 언제나 sandbox (스크립트 없이). 페이지가 불러 쓰는 css · js 에는 영향 없어요
    "content-security-policy": html ? "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock" : "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    "referrer-policy": "no-referrer",
  } });
}

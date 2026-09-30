// 도구를 쓰는 AI 한 바퀴 (agentic 최소 기능).
// 모델이 답 대신 <<tool>>{"name":"web_search","args":{"q":"…"}}<</tool>> 한 줄을 내면 그 도구를 실행하고 결과를 넣어 다시 물어요. 최대 maxSteps 번.
// 어느 회사 모델이든(Gemini·Groq·Cohere·MiMo·GLM·OpenRouter·Kilo·Ollama) 같은 방식으로 돼요 — 회사별 함수 호출 API 를 쓰지 않고 글로만 주고받아요.
// 도구: web_search(웹 검색) · read_page(페이지 읽기) · search_notes(내 노트 찾기) · read_note(내 노트 읽기) · my_plans(내 계획 보기)
import { aiText, TEXT_ORDER, orderFrom } from "./ai.js";

const TOOL_RE = /<<tool>>\s*([\s\S]*?)\s*<<\/tool>>/;
const FENCE_RE = /```tool\s*([\s\S]*?)```/;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36 Dsm-mafia/1.0";
const clip = (s, n) => (s.length > n ? s.slice(0, n) + " …" : s);
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ");
const strip = (html) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const withTimeout = (ms) => AbortSignal.timeout(ms);

// ---------- 도구들 ----------
export async function webSearch(q, n = 6) {
  q = String(q || "").trim().slice(0, 200);
  if (!q) return { results: [] };
  // 0) Bing RSS — 키 없이 제목·주소·요약이 다 와요 (가장 안정적)
  try {
    const res = await fetch("https://www.bing.com/search?format=rss&setlang=ko&q=" + encodeURIComponent(q), { headers: { "user-agent": UA, accept: "application/rss+xml,text/xml,*/*" }, signal: withTimeout(8000) });
    if (res.ok) {
      const xml = await res.text(), out = [];
      const cd = (x) => strip(String(x || "").replace(/^<!\[CDATA\[|\]\]>$/g, ""));
      const re = /<item>([\s\S]*?)<\/item>/g; let m;
      while ((m = re.exec(xml)) && out.length < n) {
        const it = m[1], t = /<title>([\s\S]*?)<\/title>/.exec(it)?.[1], l = /<link>([\s\S]*?)<\/link>/.exec(it)?.[1], d = /<description>([\s\S]*?)<\/description>/.exec(it)?.[1];
        const url = cd(l); if (!/^https?:/i.test(url)) continue;
        out.push({ title: cd(t), url, snippet: cd(d) });
      }
      if (out.length) return { results: out, via: "bing" };
    }
  } catch {}
  // 1) DuckDuckGo HTML — 키 없이 돼요 (가끔 봇으로 보고 막아요)
  try {
    const res = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q) + "&kl=kr-kr", { headers: { "user-agent": UA, accept: "text/html" }, signal: withTimeout(8000) });
    if (res.ok) {
      const html = await res.text();
      const out = [];
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>)?/g;
      let m;
      while ((m = re.exec(html)) && out.length < n) {
        let url = decode(m[1]);
        const u = /[?&]uddg=([^&]+)/.exec(url); if (u) url = decodeURIComponent(u[1]);
        if (!/^https?:/i.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
        out.push({ title: strip(m[2]), url, snippet: strip(m[3] || m[4] || "") });
      }
      if (out.length) return { results: out, via: "duckduckgo" };
    }
  } catch {}
  // 2) DuckDuckGo lite
  try {
    const res = await fetch("https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(q), { headers: { "user-agent": UA, accept: "text/html" }, signal: withTimeout(8000) });
    if (res.ok) {
      const html = await res.text(), out = [];
      const re = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
      let m;
      while ((m = re.exec(html)) && out.length < n) { let url = decode(m[1]); const u = /[?&]uddg=([^&]+)/.exec(url); if (u) url = decodeURIComponent(u[1]); if (/^https?:/i.test(url)) out.push({ title: strip(m[2]), url, snippet: strip(m[3]) }); }
      if (out.length) return { results: out, via: "duckduckgo-lite" };
    }
  } catch {}
  return { results: [], error: "검색 결과를 받지 못했어요." };
}

export async function readPage(url, max = 7000) {
  url = String(url || "").trim();
  if (!/^https?:\/\//i.test(url)) return { error: "http(s) 주소만 읽을 수 있어요." };
  // 1) Jina Reader — 본문을 마크다운으로
  try {
    const res = await fetch("https://r.jina.ai/" + url, { headers: { accept: "text/plain", "user-agent": UA, "x-no-cache": "true" }, signal: withTimeout(12000) });
    if (res.ok) { const t = (await res.text()).trim(); if (t.length > 80) return { url, text: clip(t, max), via: "jina" }; }
  } catch {}
  // 2) 그냥 받아서 태그 걷어내기
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: withTimeout(10000), redirect: "follow" });
    if (!res.ok) return { error: `페이지를 열지 못했어요 (${res.status}).` };
    const html = await res.text();
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] || html;
    return { url, title: title ? strip(title) : undefined, text: clip(strip(body), max), via: "raw" };
  } catch (e) { return { error: "페이지를 읽지 못했어요." }; }
}

async function searchNotes(env, user, q, n = 6) {
  q = String(q || "").trim().slice(0, 100);
  if (!q) return { notes: [] };
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { results } = await env.DB.prepare("SELECT title, substr(body, 1, 240) AS snippet, updated_at FROM notes WHERE user_id = ? AND (title LIKE ? OR body LIKE ?) ORDER BY updated_at DESC LIMIT ?").bind(user.id, like, like, n).all();
  return { notes: results.map((r) => ({ title: r.title, snippet: r.snippet.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim() })) };
}
async function readNote(env, user, title, max = 7000) {
  const n = await env.DB.prepare("SELECT title, body FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE").bind(user.id, String(title || "").trim()).first();
  return n ? { title: n.title, body: clip(n.body, max) } : { error: "그 제목의 노트가 없어요." };
}
async function myPlans(env, user, periods) {
  const ps = (Array.isArray(periods) ? periods : []).filter((x) => typeof x === "string" && /^[DWMY]:[\d\-W]+$/.test(x)).slice(0, 6);
  if (!ps.length) return { plans: [] };
  const { results } = await env.DB.prepare(`SELECT scope, period, text, done, start, mins FROM plans WHERE user_id = ? AND period IN (${ps.map(() => "?").join(",")}) ORDER BY scope, start, created_at`).bind(user.id, ...ps).all();
  return { plans: results };
}

// 질문 → 검색어: 첫 문장에서 군말을 조금 걷어내요
// 문장마다 시키는 말(찾아봐서 · 알려 줘 · 한 줄로 · 계획은 넣지 마 …)을 걷어내고 알맹이만 남겨요
const FILLER = /(웹에서|인터넷에서|구글에서|네이버에서|검색해\s?서|검색해\s?(줘|봐|주세요)?|찾아\s?(봐서|보고|봐|서)?\s?(줘|주세요|줄래)?|알아\s?(봐서|보고|봐|서)?\s?(줘|주세요|줄래)?|알려\s?(줘|주세요|줄래)|설명해\s?(줘|주세요)?|정리해\s?(줘|주세요)?|요약해\s?(줘|주세요)?|말해\s?줘|해\s?(줘|주세요)|한\s?(줄|문장)로|짧게|간단히|자세히|최대한|좀|뭐야|뭔가요|뭐예요|무엇인가요|무엇|인가요|일까요?|있어\?|계획은?\s?넣지\s?마\S*|넣지\s?마\S*)/g;
export const searchQuery = (text) => {
  const base = String(text).replace(/\[(미리 검색한|미리 찾아본|첨부 이미지)[\s\S]*$/, "").replace(URL_RE, " ");
  const parts = base.split(/[.?!。\n]+/).map((x) => x.replace(FILLER, " ").replace(/[?"'“”]/g, " ").replace(/\s+/g, " ").trim()).filter((x) => x.length > 1);
  return parts.slice(0, 2).join(" ").slice(0, 100) || base.trim().slice(0, 100);
};

// 웹을 먼저 찾아봐야 하는 말인지 — 웹 토글을 안 켜도 이런 말이면 스스로 한 번 검색하고 시작해요.
// (그 밖의 질문도 도구는 늘 열려 있어서, 모델이 필요하다고 보면 web_search · read_page 를 직접 불러요)
const WEB_HINT = /(검색|찾아\s?봐|찾아\s?줘|알아\s?봐|조사|최신|요즘|최근\s?(소식|뉴스|동향)|뉴스|속보|가격|환율|주가|시세|날씨|출시|발표|업데이트\s?내용|공식\s?(사이트|문서)|레퍼런스|출처|자료\s?찾|latest|news|price|docs?\b)/i;
export const needsWeb = (text) => WEB_HINT.test(String(text).replace(/\[(미리|첨부)[\s\S]*$/, "").slice(0, 800));
export const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;

// 도구 바퀴 전에 미리 해 두는 조사: 글 속 링크는 바로 읽고, web 이 true(토글) 거나 "auto" 인데 웹이 필요한 말이면 한 번 검색해요.
// → { note: 질문 뒤에 붙일 자료 글, steps: [{ name, args, summary, auto }] }
export async function autoResearch(text, web = "auto") {
  const raw = String(text || "").replace(/\[(미리|첨부)[\s\S]*$/, "");
  const urls = [...new Set(raw.match(URL_RE) || [])].map((u) => u.replace(/[.,!?。]+$/, "")).slice(0, 2);
  const doSearch = web === true || (web === "auto" && needsWeb(raw));
  const q = doSearch ? searchQuery(raw) : "";
  const [pages, found] = await Promise.all([
    Promise.all(urls.map((url) => readPage(url, 6000).then((r) => ({ url, r })))),
    q ? webSearch(q, 6) : null,
  ]);
  const steps = [], parts = [];
  for (const { url, r } of pages) { steps.push({ name: "read_page", args: { url }, summary: toolSummary("read_page", { url }, r), auto: true }); parts.push(`### 링크 ${url}\n${r.error || JSON.stringify(r).slice(0, 6000)}`); }
  if (found) { steps.push({ name: "web_search", args: { q }, summary: toolSummary("web_search", { q }, found), auto: true }); parts.push(`### web_search "${q}"\n${JSON.stringify(found).slice(0, 6500)}`); }
  if (!parts.length) return { note: "", steps };
  return { steps, note: `[미리 찾아본 자료]\n${parts.join("\n\n")}\n\n위 자료를 근거로 답해. 더 필요하면 read_page 로 그 주소를 읽거나 다른 검색어로 web_search 를 더 써. 웹 자료를 썼으면 답 끝에 '출처:' 로 링크를 적어.` };
}

// ---------- 계획 바꾸기 도구 (AI 비서) ----------
const pad2 = (n) => String(n).padStart(2, "0");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function isoWeekKey(ymd) {
  const d = new Date(ymd + "T00:00:00Z"), day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear(), w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `W:${y}-W${pad2(w)}`;
}
const periodOf = (scope, date) => scope === "week" ? isoWeekKey(date) : scope === "month" ? `M:${date.slice(0, 7)}` : scope === "year" ? `Y:${date.slice(0, 4)}` : `D:${date}`;
const normHM = (v) => { if (typeof v !== "string") return null; const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!m) return null; const t = `${pad2(+m[1])}:${m[2]}`; return HM_RE.test(t) ? t : null; };
async function dayPlans(env, user, date) {
  if (!DATE_RE.test(date || "")) return { error: "date 는 YYYY-MM-DD 예요." };
  const { results } = await env.DB.prepare("SELECT id, text, done, missed, start, mins FROM plans WHERE user_id = ? AND scope = 'day' AND period = ? ORDER BY start IS NULL, start, sort").bind(user.id, "D:" + date).all();
  return { date, plans: results.map((p) => ({ id: p.id, text: p.text, done: !!p.done, missed: !!p.missed, start: p.start, mins: p.mins })) };
}
async function addPlan(env, user, a) {
  const scope = ["day", "week", "month", "year"].includes(a.scope) ? a.scope : "day";
  const date = DATE_RE.test(a.date || "") ? a.date : null;
  if (!date) return { error: "date(YYYY-MM-DD) 가 필요해요." };
  const text = String(a.text || "").trim().slice(0, 200);
  if (!text) return { error: "text 가 필요해요." };
  const start = scope === "day" ? normHM(a.start) : null;
  if (scope === "day" && a.start && !start) return { error: "start 는 HH:MM (24시간) 이에요." };
  let mins = scope === "day" && a.mins != null ? Math.round(+a.mins) : null;
  if (mins != null && !(mins >= 5 && mins <= 1440)) mins = 60;
  if (start && mins == null) mins = 60;
  const id = crypto.randomUUID(), t = Date.now(), period = periodOf(scope, date);
  const priority = ["low", "medium", "high", "xhigh", "max"].includes(a.priority) ? a.priority : null;
  await env.DB.prepare("INSERT INTO plans (id, user_id, scope, period, text, done, start, mins, color, priority, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL, ?, ?, ?, ?)").bind(id, user.id, scope, period, text, start, mins, priority, t, t, t).run();
  return { ok: true, plan: { id, scope, period, date, text, start, mins, priority } };
}
async function updatePlan(env, user, a) {
  const p = await env.DB.prepare("SELECT * FROM plans WHERE id = ? AND user_id = ?").bind(String(a.id || ""), user.id).first();
  if (!p) return { error: "그 id 의 계획이 없어요. 먼저 day_plans 로 id 를 확인해." };
  const text = a.text != null ? String(a.text).trim().slice(0, 200) || p.text : p.text;
  const start = a.start !== undefined && p.scope === "day" ? (a.start === null ? null : normHM(a.start) ?? p.start) : p.start;
  const mins = a.mins !== undefined && p.scope === "day" ? (a.mins === null ? null : Math.min(1440, Math.max(5, Math.round(+a.mins) || 60))) : p.mins;
  let period = p.period;
  if (a.date && DATE_RE.test(a.date) && p.scope === "day") period = "D:" + a.date;
  let done = a.done === undefined ? p.done : a.done ? 1 : 0;
  let missed = a.missed === undefined ? (a.done ? 0 : p.missed || 0) : a.missed ? 1 : 0;
  if (missed && a.missed) done = 0;
  if (period !== p.period && a.missed === undefined) missed = 0;
  const priority = a.priority === undefined ? p.priority ?? null : ["low", "medium", "high", "xhigh", "max"].includes(a.priority) ? a.priority : null;
  await env.DB.prepare("UPDATE plans SET text = ?, start = ?, mins = ?, period = ?, done = ?, done_at = ?, missed = ?, priority = ?, updated_at = ? WHERE id = ?").bind(text, start, mins, period, done, done ? p.done_at || Date.now() : null, missed, priority, Date.now(), p.id).run();
  return { ok: true, plan: { id: p.id, text, start, mins, period, done: !!done, missed: !!missed } };
}
async function deletePlan(env, user, a) {
  const r = await env.DB.prepare("DELETE FROM plans WHERE id = ? AND user_id = ?").bind(String(a.id || ""), user.id).run();
  return r.meta?.changes ? { ok: true } : { error: "그 id 의 계획이 없어요." };
}
export const WRITE_TOOLS = new Set(["add_plan", "update_plan", "delete_plan"]);

export const TOOL_DOCS = {
  day_plans: { desc: "그날 계획(할 일·시간표)을 id 와 함께 봐요", args: '{"date":"2026-09-29"}' },
  add_plan: { desc: "계획을 새로 넣어요. 시간이 있으면 start(24시간 HH:MM)·mins(분), 없으면 할 일. scope 는 day(기본)·week·month", args: '{"date":"2026-09-29","text":"영어 수업","start":"21:30","mins":60}' },
  update_plan: { desc: "계획을 고쳐요(시간 옮기기·이름 바꾸기·끝냄 done · 못함 missed 표시). id 는 day_plans 로 확인", args: '{"id":"…","start":"22:00","done":true}' },
  delete_plan: { desc: "계획을 지워요. id 는 day_plans 로 확인", args: '{"id":"…"}' },
  web_search: { desc: "웹에서 최신 정보를 찾아요", args: '{"q":"검색어"}' },
  read_page: { desc: "웹 페이지 본문을 읽어요 (검색 결과 url 을 넣어요)", args: '{"url":"https://…"}' },
  search_notes: { desc: "내 노트에서 제목·내용으로 찾아요", args: '{"q":"찾을 말"}' },
  read_note: { desc: "내 노트 하나를 통째로 읽어요", args: '{"title":"노트 제목"}' },
  my_plans: { desc: "내 계획(오늘·이번 주·이번 달)을 봐요", args: '{}' },
};

export async function runAgentTool(env, user, name, args, extra = {}) {
  switch (name) {
    case "web_search": return webSearch(args.q);
    case "read_page": return readPage(args.url);
    case "search_notes": return searchNotes(env, user, args.q);
    case "read_note": return readNote(env, user, args.title);
    case "my_plans": return myPlans(env, user, extra.periods);
    case "day_plans": return dayPlans(env, user, args.date);
    case "add_plan": return addPlan(env, user, args);
    case "update_plan": return updatePlan(env, user, args);
    case "delete_plan": return deletePlan(env, user, args);
    default: return { error: `모르는 도구: ${name}` };
  }
}
export const toolSummary = (name, args, r) => {
  if (r?.error) return r.error;
  if (name === "web_search") return `${r.results.length}건: ` + r.results.slice(0, 3).map((x) => x.title).join(" · ");
  if (name === "read_page") return (r.title || r.url || "").slice(0, 80);
  if (name === "search_notes") return `${r.notes.length}개: ` + r.notes.map((x) => x.title).join(" · ");
  if (name === "read_note") return r.title || "";
  if (name === "my_plans") return `${r.plans.length}개`;
  if (name === "day_plans") return `${r.date} · ${r.plans.length}개`;
  if (name === "add_plan") return `${r.plan.date}${r.plan.start ? " " + r.plan.start : ""} ${r.plan.text}`;
  if (name === "update_plan") return `${r.plan.text}${r.plan.start ? " → " + r.plan.start : ""}${r.plan.done ? " ✓" : ""}${r.plan.missed ? " ✗ 못함" : ""}`;
  if (name === "delete_plan") return "지웠어요";
  return "";
};

export function toolPrompt(tools, maxSteps) {
  return [
    `## 도구\n필요하면 답 대신 아래 형식 **한 줄만** 출력해 (다른 말 없이). 결과가 [도구 결과] 로 돌아오면 그걸 보고 이어서 해. 최대 ${maxSteps}번까지 쓸 수 있고, 충분하면 바로 최종 답을 써.`,
    ...tools.map((t) => `- ${t} — ${TOOL_DOCS[t].desc}. 예: <<tool>>{"name":"${t}","args":${TOOL_DOCS[t].args}}<</tool>>`),
    "일하는 방식: 먼저 무엇을 알아야 하는지 생각하고 → 도구로 찾고 → 결과가 부족하면 검색어를 바꿔 다시 찾거나 read_page 로 원문을 읽고 → 충분할 때 답해. 기억만으로 최신 정보·수치·날짜·버전·가격을 말하지 마.",
    "최신 정보·사실 확인이 필요하면 web_search → 믿을 만한 결과의 read_page. 내 공부 내용과 관련되면 search_notes → read_note. 답에 웹 출처를 썼으면 끝에 '출처:' 로 링크를 적어.",
  ].join("\n");
}

export function parseToolCall(text) {
  const m = TOOL_RE.exec(text) || FENCE_RE.exec(text);
  let raw = m ? m[1] : null;
  if (!raw) { const t = text.trim(); if (/^\{[\s\S]*"name"[\s\S]*\}$/.test(t) && t.length < 600) raw = t; }
  if (!raw) return null;
  try { const j = JSON.parse(raw); if (j && typeof j.name === "string") return { name: j.name, args: j.args && typeof j.args === "object" ? j.args : {} }; } catch {}
  return null;
}

// system: 역할 프롬프트 · messages: [{role, content}] (마지막이 user) · tools: 쓸 도구 이름들 · prefer: 모델 id (없으면 기본 순서)
// onStep({ name, args, summary }) 로 도구 실행을 알려줘요. 돌려주는 값: { text, model, steps }
export async function runAgent(env, user, { system, messages, tools = Object.keys(TOOL_DOCS), prefer = null, maxSteps = 4, onStep = null, periods = [], preSearch = "auto", researchOn = null }) {
  const order = orderFrom(prefer, TEXT_ORDER);
  const sys = tools.length ? `${system}\n\n${toolPrompt(tools, maxSteps)}` : system;
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  const steps = [];
  let used = null;
  // 링크는 먼저 읽고, 웹 모드(preSearch true)거나 웹이 필요한 말("auto")이면 먼저 한 번 검색해 두어요 (모델이 검색을 건너뛰고 지어내지 않게)
  if (tools.includes("web_search")) {
    const pre = await autoResearch(researchOn ?? (convo[convo.length - 1]?.content || ""), preSearch);
    for (const step of pre.steps) { steps.push(step); if (onStep) await onStep(step); }
    if (pre.note) convo[convo.length - 1] = { role: "user", content: `${convo[convo.length - 1].content}\n\n${pre.note}` };
  }
  for (let i = 0; i <= maxSteps; i++) {
    const r = await aiText(env, sys, convo, order);
    used = r.used;
    const call = i < maxSteps ? parseToolCall(r.text) : null;
    if (!call || !tools.includes(call.name)) {
      // 도구 없이 "넣었어요/옮겼어요" 라고만 하면 한 번 되돌려 실제로 부르게 해요
      const claims = tools.some((t) => WRITE_TOOLS.has(t)) && !steps.some((s) => WRITE_TOOLS.has(s.name)) && /(넣었|등록했|추가했|옮겼|바꿨|지웠|삭제했|표시했)/.test(r.text);
      if (claims && i < maxSteps) { convo.push({ role: "assistant", content: r.text }, { role: "user", content: "아직 도구를 실제로 부르지 않았어. 말만 하지 말고 지금 필요한 도구 줄(<<tool>>…<</tool>>)을 한 줄만 출력해." }); continue; }
      return { text: r.text.replace(TOOL_RE, "").trim(), model: used, steps };
    }
    const result = await runAgentTool(env, user, call.name, call.args, { periods });
    const step = { name: call.name, args: call.args, summary: toolSummary(call.name, call.args, result) };
    steps.push(step); if (onStep) await onStep(step);
    convo.push({ role: "assistant", content: `<<tool>>${JSON.stringify(call)}<</tool>>` });
    convo.push({ role: "user", content: `[도구 결과 ${call.name}]\n${JSON.stringify(result).slice(0, 9000)}\n\n이 결과를 참고해서 계속해. (도구가 더 필요하면 한 줄만, 아니면 최종 답을 써.)` });
  }
  const r = await aiText(env, sys, convo, order);
  return { text: r.text.replace(TOOL_RE, "").trim(), model: r.used, steps };
}

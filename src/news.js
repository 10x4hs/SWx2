// =====================================================================================
// [파일 역할 및 개요: src/news.js]
// 지정학 · AI · 첨단기술 소식을 RSS 로 모아, 한국어로 요약해서 셋이 같이 읽는 모듈입니다.
//
// 1. 요약은 2단입니다:
//    - 얕게: 들어오는 **모든** 글에 한 줄. 목록에서 버릴 걸 빨리 버리려고요.
//    - 깊게: 누가 **열었을 때만**. 전부 깊게 돌리면 비용이 몇 배가 됩니다.
//    AI 호출은 src/ai.js 의 aiJson 을 그대로 씁니다 — 이미 8개 공급사 장애 조치가 들어 있어요.
// 2. 수집과 요약을 **갈라 두었습니다**. 요약이 느리거나 실패해도 글은 이미 들어와 있습니다.
// 3. 날짜 상한(60일)이 있습니다. 어떤 피드는 전체 아카이브를 통째로 줍니다 —
//    Tech Policy Press 가 2018년부터 4,042편을 한 번에 보내 한 소스가 목록을 다 먹었습니다.
// 4. 피드는 조용히 죽습니다. 200 에 유효한 XML 을 주면서 몇 년째 새 글이 없는 경우가 있어
//    마지막 글이 90일보다 오래되면 경고합니다.
// =====================================================================================
import { aiJson as realAiJson, aiText } from "./ai.js";
import { SEED } from "./feeds.js";
import { pushUsers } from "./push.js";
import { charge, left, withBudget } from "./lib/budget.js";
import { kstToday } from "./lib/day.js";
import { PEERS } from "./teams.js";

// 로컬 시험용: NEWS_FAKE_AI=1 이면 AI 를 부르지 않고 정해진 답을 돌려줘요 (smoke · e2e 가 키 없이 돌게).
// 가짜도 바깥 요청 1개로 세요(lib/budget.js) — 시험에서 크론 예산을 실제처럼 확인하려고요.
// AI 를 부를 때마다 ai_usage 에 한 줄 남겨요 (기능 · 회사 · 모델 · 토큰). 회사가 토큰 수를 안 주면 글자 수 ÷ 3.5 로 어림하고 estimated=1.
// 기록도 바깥 요청 하나로 쳐서, 예산이 3개 미만이면 기록을 건너뛰어요 (크론이 기록 때문에 막히지 않게).
const aiJson = async (env, system, prompt, fake, feature = "other") => {
  let r, ok = 1;
  try {
    if (env.NEWS_FAKE_AI === "1" && fake) { charge(1); r = { data: fake(), provider: "fake", model: "fake" }; }
    else r = await realAiJson(env, system, prompt);
    return r;
  } catch (e) { ok = 0; throw e; }
  finally { await logUsage(env, feature, system, prompt, r, ok).catch(() => {}); }
};
async function logUsage(env, feature, system, prompt, r, ok) {
  if (!env.DB || left() < 3) return;
  try { charge(1); } catch { return; }
  const est = !r?.usage;
  const inT = est ? Math.round((String(system).length + String(prompt).length) / 3.5) : r.usage.in;
  const outT = est ? (r ? Math.round(JSON.stringify(r.data ?? "").length / 3.5) : 0) : r.usage.out;
  const t = Date.now();
  await env.DB.prepare("INSERT INTO ai_usage (at, day, feature, provider, model, in_tokens, out_tokens, estimated, ok) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(t, kstDay(t), feature, r?.provider || null, r?.used || r?.model || null, inT, outT, est ? 1 : 0, ok).run();
}

/** 한국 날짜 (YYYY-MM-DD) */
export const kstDay = (ms) => new Date(ms + 9 * 36e5).toISOString().slice(0, 10);

/** 신문 면 4개. 피드 주제로 먼저 정하고, AI 가 다른 면을 고르면 그걸 따라요. */
export const SECTIONS = ["ai", "geopolitics", "tech", "economy"];
const TOPIC_SECTION = { ai: "ai", semi: "tech", energy: "economy", macro: "economy", china: "geopolitics", europe: "geopolitics", geopolitics: "geopolitics" };
export const sectionOf = (topic, ai) => (SECTIONS.includes(ai) ? ai : TOPIC_SECTION[topic] || "geopolitics");

// ---------- 상수 ----------

const MAX_AGE = 60 * 864e5;   // 이보다 오래된 글은 넣지 않아요
const STALE = 90 * 864e5;     // 마지막 글이 이보다 오래되면 죽은 피드
const FETCH_MS = 30000;       // 피드 하나를 기다리는 시간
const PULL_AT_ONCE = 6;       // 동시에 긁는 피드 수
const SUM_AT_ONCE = 3;        // 동시 요약. 6으로 올렸더니 Groq 가 429 를 돌려줬어요.

const TOPICS = ["china", "europe", "ai", "semi", "energy", "macro", "geopolitics"];

const RULES = `너는 지정학·AI·첨단기술을 읽는 한국인 독자를 돕는다.
- 반드시 한국어로 쓴다. 원문이 영어든 중국어든.
- 추측하지 않는다. 원문에 없는 사실을 지어내지 않는다.
- 수식어를 빼고 사실과 인과만 남긴다.`;

/** 깊은 요약에만 붙여요. 목록에서는 원어 병기가 글자 수를 다 먹어요 —
 *  "에두아르 필리프(Édouard Philippe)" 하나가 24자예요. */
const SPELL = `\n- 고유명사(기관·인물·법안)는 한국어 뒤에 원어를 괄호로 한 번만 병기한다.`;

// ---------- RSS / Atom 읽기 (의존성 없이) ----------

const unesc = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&");

const strip = (html) =>
  unesc(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** <tag>안쪽</tag> 첫 번째 것을 꺼내요. */
const tag = (xml, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(xml);
  return m ? unesc(m[1]) : "";
};

/** Atom 의 링크는 속성에 들어 있어요: <link rel="alternate" href="..."/> */
const linkOf = (xml) => {
  const plain = tag(xml, "link").trim();
  if (plain && !plain.startsWith("<")) return plain;
  const alt = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(xml);
  if (alt) return unesc(alt[1]);
  const any = /<link[^>]*href=["']([^"']+)["']/i.exec(xml);
  if (any) return unesc(any[1]);
  return tag(xml, "guid").trim() || tag(xml, "id").trim();
};

/**
 * 피드 하나를 읽어 글 목록과 가장 최근 글 시각을 돌려줘요.
 * 호출하는 쪽이 `latest` 를 보고 죽은 피드인지 판단할 수 있게 같이 줍니다.
 */
export async function fetchFeed(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_MS),
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; TrioNews/1.0)",
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const xml = await res.text();
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];

  const items = [];
  let latest = 0;

  for (const b of blocks) {
    const link = linkOf(b).trim();
    if (!link) continue;

    const when =
      tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const at = when ? Date.parse(when) : NaN;
    // 행사 안내(PIIE /events/ 등)는 기사가 아니에요 — 미래 날짜가 붙은 글도 행사 공지라 건너뛰어요
    if (/\/events?\//i.test(link) || (Number.isFinite(at) && at > Date.now() + 36e5)) continue;
    // 날짜가 없거나 미래(PIIE 는 행사 날짜를 pubDate 로 줘요)면 null → 넣을 때 처음 본 시각 + dated=0
    const published = Number.isFinite(at) && at <= Date.now() + 36e5 ? at : null;
    if (published && published > latest) latest = published;

    items.push({
      url: link,
      title: strip(tag(b, "title")) || "(제목 없음)",
      author: strip(tag(b, "dc:creator") || tag(b, "author")).slice(0, 120) || null,
      published,
      content: strip(
        tag(b, "content:encoded") || tag(b, "content") || tag(b, "description") || tag(b, "summary")
      ).slice(0, 40000),
    });
  }

  return { items, latest: latest || null };
}

// ---------- 수집 ----------

const id = () => crypto.randomUUID();

/** 피드 하나를 긁어 새 글만 넣어요. 같은 주소는 다시 안 들어가요. */
async function pull(env, feed, now) {
  try {
    const { items, latest } = await fetchFeed(feed.url);
    const cutoff = now - MAX_AGE;
    const fresh = items.filter((i) => i.published == null || i.published >= cutoff);

    let added = 0;
    for (const it of fresh) {
      const r = await env.DB.prepare(
        "INSERT OR IGNORE INTO news_items (id, feed_id, url, title, author, published_at, dated, raw, created_at, day, section) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(id(), feed.id, it.url, it.title.slice(0, 500), it.author, it.published ?? now, it.published == null ? 0 : 1, it.content, now, kstDay(it.published ?? now), sectionOf(feed.topic)).run();
      if (r.meta?.changes) added += 1;
    }

    await env.DB.prepare(
      "UPDATE news_feeds SET last_fetched_at = ?, last_item_at = ?, fail_count = 0, last_error = NULL WHERE id = ?"
    ).bind(now, latest, feed.id).run();

    const staleDays = latest && now - latest > STALE ? Math.floor((now - latest) / 864e5) : null;
    return { feed: feed.name, added, staleDays };
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    await env.DB.prepare(
      "UPDATE news_feeds SET fail_count = fail_count + 1, last_error = ?, last_fetched_at = ? WHERE id = ?"
    ).bind(msg, now, feed.id).run();
    return { feed: feed.name, added: 0, error: msg };
  }
}

/** 몇 개씩 나눠서 돌려요. 한꺼번에 다 하면 Worker 가 버거워요. */
async function inBatches(list, size, fn) {
  const out = [];
  const queue = [...list];
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (;;) {
        const next = queue.shift();
        if (next === undefined) return;
        out.push(await fn(next));
      }
    })
  );
  return out;
}

/** 살아 있는 피드를 전부 긁어요. */
// Workers 무료 플랜은 요청 한 번에 바깥 요청(fetch) 50개까지예요. 피드 46곳 + AI 요약을 한 번에 하면 넘쳐서
// 한 번에 받는 피드 수(max)와 요약 수를 나눠요. 오래 안 받은 피드부터.
// AI 가 붙이는 "출처 이름) 제목" · "[0] 제목" 같은 머리말을 걷어 내요
export function cleanKoTitle(s, feed = "") {
  let k = String(s || "").trim().replace(/^\[\d+\]\s*/, "");
  const f = String(feed || "").trim();
  for (const name of [f, f.replace(/\s*(Update|News|Blog|Newsletter)$/i, "")].filter(Boolean)) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    k = k.replace(new RegExp(`^\\(?${esc}[^)\\]]{0,12}[)\\]:：]\\s*`, "i"), "");
  }
  return k.slice(0, 200);
}

export async function ingest(env, now = Date.now(), max = 24) {
  max = Math.max(0, Math.min(max, left() - 1)); // 예산 안에서만 (lib/budget.js)
  if (!max) return [];
  const { results } = await env.DB.prepare(
    "SELECT id, url, name, topic FROM news_feeds WHERE active = 1 AND fail_count < 5 ORDER BY COALESCE(last_fetched_at, 0) ASC LIMIT ?"
  ).bind(max).all();
  return inBatches(results || [], PULL_AT_ONCE, (f) => pull(env, f, now));
}

// ---------- 한국어 제목 (요약보다 먼저 · 싸게) ----------

/**
 * title_ko 가 없는 글의 제목을 한국어로 옮겨요. 제목 + 출처 이름만 보내고, AI 한 번에 TITLE_CHUNK 편.
 * 오늘(한국) 글 먼저, 그다음 최신순 → 오늘 글은 한 번 돌 때 다 한국어 제목이 붙어요.
 * 이미 한글 제목이면 AI 없이 그대로 옮겨 적어요. opts.day = 그날 글만, opts.calls = AI 호출 상한.
 */
const TITLE_CHUNK = 30;
const hasHangul = (s) => /[\uac00-\ud7a3]/.test(String(s || ""));
export async function translateTitles(env, opts = {}) {
  const calls = Math.max(0, Math.min(opts.calls ?? 2, left() - (opts.reserve ?? 1)));
  if (!calls) return { done: 0, calls: 0 };
  const where = opts.day ? "i.day = ?" : "i.published_at > ?";
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, f.name AS feed FROM news_items i JOIN news_feeds f ON f.id = i.feed_id
      WHERE i.title_ko IS NULL AND ${where}
      ORDER BY (i.day = ?) DESC, i.published_at DESC LIMIT ?`
  ).bind(opts.day || Date.now() - MAX_AGE, kstToday(0), calls * TITLE_CHUNK + 60).all();
  const rows = results || [];
  const ko = rows.filter((r) => hasHangul(r.title));
  if (ko.length) await env.DB.batch(ko.map((r) => env.DB.prepare("UPDATE news_items SET title_ko = title WHERE id = ?").bind(r.id)));
  const todo = rows.filter((r) => !hasHangul(r.title)).slice(0, calls * TITLE_CHUNK);
  const chunks = [];
  for (let i = 0; i < todo.length; i += TITLE_CHUNK) chunks.push(todo.slice(i, i + TITLE_CHUNK));
  let done = ko.length, used = 0;
  const failed = [];
  await inBatches(chunks, 2, async (chunk) => {
    if (left() < 1) return;
    used += 1;
    try {
      const { data } = await aiJson(env, RULES,
        `다음 뉴스 제목 ${chunk.length}개를 한국어 신문 제목으로 옮겨 줘. 영어 · 독일어 · 중국어 등 어떤 언어든.
- 자연스러운 한국어 기사 제목처럼, 60자 이내. 뜻을 더하거나 빼지 마 — 제목에 없는 설명 · 부제를 덧붙이지 마. 영어 표현을 비슷한 소리의 다른 낱말로 바꾸지 마 (frontier model → 프런티어 모델).
- 제품 · 모델 · 회사 이름(Claude, GPT-5, Gemini, OpenAI, Nvidia 등)은 원문 표기 그대로 둬도 돼.
- 고유명사에 원어 괄호 병기는 하지 마.
- 출처(매체) 이름은 참고만 해. 번역한 제목 앞뒤에 출처 이름이나 "출처)" 같은 머리말을 붙이지 마.

${chunk.map((t, n) => `[${n}] ${t.title}   — 출처: ${t.feed}`).join("\n")}

{"t":[{"i":0,"ko":"..."}]} 형식으로만 답해. i 는 번호.`,
        () => ({ t: chunk.map((t, n) => ({ i: n, ko: `(번역) ${t.title}`.slice(0, 120) })) }), "titles");
      const outs = Array.isArray(data?.t) ? data.t : Array.isArray(data?.items) ? data.items : [];
      const ups = [];
      for (const [n, t] of chunk.entries()) {
        const o = outs.find((x) => Number(x?.i) === n);
        const k = cleanKoTitle(o?.ko, t.feed);
        if (k) ups.push(env.DB.prepare("UPDATE news_items SET title_ko = ? WHERE id = ?").bind(k, t.id));
      }
      if (ups.length) await env.DB.batch(ups);
      done += ups.length;
    } catch (e) {
      failed.push(`${chunk.length}편 제목: ${String(e?.message || e).slice(0, 80)}`);
    }
  });
  return { done, calls: used, failed: failed.slice(0, 2) };
}

// ---------- 요약 ----------

/**
 * 요약이 없는 글에 한 줄(one_liner) + 2~3줄 요약(summary) + 면(section) + 지도·줄기 태그를 붙여요.
 * 글 SUM_CHUNK 편을 **AI 한 번**에 묶어요 — 글마다 부르면 바깥 요청 50개 한도가 금방 차요.
 * opts.day 를 주면 그날 글만 (되채우기). 예산(lib/budget.js)이 모자라면 남은 묶음은 다음 번으로 미뤄요.
 */
const SUM_CHUNK = 4;
const FEED_CAP = 5; // 하루 신문에 한 매체가 올릴 수 있는 글 수
const SUM_SKIP = 2; // AI 가 이만큼 답을 안 주면 그 글은 건너뛰어요 (sum_skip=1 · summary 는 비워 둔 채) → 그날 신문이 막히지 않게
/** 답을 못 받은 횟수를 세고, SUM_SKIP 번이면 건너뛰기 표시 */
const markMiss = (env, id) => env.DB.prepare("UPDATE news_items SET sum_miss = sum_miss + 1, sum_skip = CASE WHEN sum_miss + 1 >= ? THEN 1 ELSE 0 END WHERE id = ?").bind(SUM_SKIP, id).run();

/** 한 줄 요약은 55자까지. 넘으면 예산이 남을 때 한 번만 줄여 달라고 하고, 그래도 길면 잘라요. */
async function fitOne(env, one) {
  one = String(one || "").trim();
  if (one.length <= 55) return one;
  if (left() >= 3) {
    const r = await aiJson(env, RULES, `다음 문장을 뜻은 그대로 두고 45자 이내로 줄여 줘. "~했다" 체.\n${one}\n{"one":"..."} 형식으로만 답해.`, () => ({ one: one.slice(0, 45) }), "shorten").catch(() => null);
    const short = String(r?.data?.one || "").trim();
    if (short && short.length <= 55) return short;
  }
  return one.slice(0, 54).replace(/\s+\S*$/, "") + "…";
}

/** 기사 페이지 HTML 에서 본문 글자만 (meta 설명 + <p> 문단), 4000자까지 */
async function pageText(url) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; SWx2News/1.0)", accept: "text/html" } });
    if (!r.ok) return "";
    const html = (await r.text()).slice(0, 400000);
    const dec = (x) => x.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&lsquo;/g, "'").replace(/\s+/g, " ").trim();
    const meta = html.match(/<meta[^>]+(?:property|name)=["'](?:og:)?description["'][^>]+content=["']([^"']+)/i)?.[1] || "";
    const paras = [...html.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)].map((m) => dec(m[0])).filter((x) => x.length > 60);
    return [dec(meta), ...paras].join("\n").slice(0, 4000);
  } finally { clearTimeout(tm); }
}

export async function summarize(env, limit = 10, opts = {}) {
  // opts.ids: 이 글들만 (기사를 연 사람이 기다릴 때 — 건너뛴 글도 다시 시도해요)
  const ids = Array.isArray(opts.ids) ? opts.ids.slice(0, SUM_CHUNK) : null;
  const where = ids ? `i.id IN (${ids.map(() => "?").join(",")})` : `i.sum_skip = 0 AND ${opts.day ? "i.day = ?" : "i.published_at > ?"}`;
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, i.raw, i.url, i.one_liner, f.name AS feed, f.topic
       FROM news_items i JOIN news_feeds f ON f.id = i.feed_id
      WHERE i.summary IS NULL AND ${where}
      ORDER BY i.published_at DESC LIMIT ?`
  ).bind(...(ids || [opts.day || Date.now() - MAX_AGE]), limit).all();

  const todo = results || [];
  if (!todo.length) return { done: 0, left: 0, failed: [] };
  // 사람이 기다리는 글인데 피드에 본문이 거의 없으면(제목만 오는 매체) 기사 페이지에서 글을 읽어 와요
  if (ids) await Promise.all(todo.map(async (t) => {
    if (String(t.raw || "").replace(/<[^>]+>/g, "").trim().length >= 200 || left() < 3) return;
    const text = await pageText(t.url).catch(() => "");
    if (text.length < 200) return;
    t.raw = text;
    await env.DB.prepare("UPDATE news_items SET raw = ? WHERE id = ?").bind(text, t.id).run();
  }));
  // 이미 있는 줄기 태그를 보여 주고 맞으면 그대로 쓰게 해요 — 안 그러면 "ukraine war" · "russia ukraine war" 처럼 글마다 줄기가 갈라져요
  const { results: known } = await env.DB.prepare(
    `SELECT t.key, COUNT(i.id) AS n FROM news_threads t LEFT JOIN news_items i ON i.thread_id = t.id
      WHERE t.key NOT LIKE 'user:%' AND t.updated_at > ? GROUP BY t.id ORDER BY n DESC, t.updated_at DESC LIMIT 60`
  ).bind(Date.now() - 21 * 864e5).all();
  const keys = (known || []).map((k) => k.key);
  let done = 0;
  const failed = [];
  const chunks = [];
  for (let i = 0; i < todo.length; i += SUM_CHUNK) chunks.push(todo.slice(i, i + SUM_CHUNK));

  await inBatches(chunks, SUM_AT_ONCE, async (chunk) => {
    if (left() < 2) { failed.push("예산 부족 — 다음 번에"); return; }
    try {
      const body = chunk.map((t, n) => `### [${n}] 출처: ${t.feed} (${t.topic})\n제목: ${t.title}\n${String(t.raw || "").slice(0, 4000)}`).join("\n\n");
      const { data } = await aiJson(
        env,
        RULES,
        `다음 글 ${chunk.length}편을 각각 요약하고, 지도와 줄기 표시용 태그를 붙여 줘.

글마다 규칙:
- 오늘은 ${kstToday(0)} (한국 시간)이야. 연도·날짜는 원문에 적힌 것만 쓰고, 원문에 없는 연도를 지어내지 마.
- 고유명사·용어는 정확한 한국어 표준 표기로 (예: "language model" → "언어 모델", "rare earth" → "희토류"). 낯선 이름은 억지로 옮기지 말고 원문 표기 그대로.
- one: **35~50자 한 문장.** 절대 55자를 넘기지 마. 한 가지 사실만. 끝은 "~했다 / ~한다" 체. 고유명사에 원어를 괄호로 병기하지 마. 제목을 되풀이하지 말고 알맹이를 담아.
- summary: **4~5문장**, 합쳐서 220~380자. 이것만 읽어도 내용을 알 수 있게: ① 무슨 일이 있었나(누가·언제·무엇을) ② 핵심 내용·수치 ③ 배경 ④ 왜 중요한지·다음에 볼 것. "~했다 / ~이다" 체. 원문에 없는 건 쓰지 마.
- section: **기사 내용**으로 고른 신문 면 하나 (출처의 주제와 달라도 기사 내용을 따라. 예: AI 매체의 언론 자유·선거 기사는 "geopolitics") — "ai"(AI 모델·연구·정책 · AI 회사 소식: 새 모델 출시·예고, OpenAI·Anthropic·Google DeepMind·xAI·Meta AI 등의 발표·투자·인사. **출처가 어디든 AI 가 주인공인 기사는 "ai"**) | "geopolitics"(외교·안보·전쟁·국내정치) | "tech"(반도체·제조·우주·기술산업) | "economy"(거시·무역·에너지·금융).
- geo: 무대가 되는 나라 ISO 3166-1 alpha-2 코드 1~3개 (EU 는 "BE"). 없으면 빈 배열.
- tag: 이 글이 속한 **지속되는 이야기**를 2~4단어 영어 소문자로 (예: "us china chip controls", "ukraine war"). 몇 주 동안 이어질 이야기여야 해.
  아래 기존 태그 중 **바로 그 이야기**가 있으면 글자 그대로 써. 분야만 비슷하면 묶지 마. 맞는 게 없으면 새 태그.
  기존 태그: ${keys.length ? keys.join(" | ") : "(없음)"}
- tag_ko: tag 의 한국어 제목 (12자 이내).
- trend: 이 글이 **새로 나온 기술 그 자체**를 다루면 — "sw"(소프트웨어 신기술: 새 AI 모델 · 구조(JEPA 등) · RAG · 에이전트 · 개발 도구 · 언어 · 프레임워크 · 오픈소스) | "hw"(하드웨어 신기술: 뇌 임플란트 · BCI · 로봇 · 휴머노이드 · 칩 · 양자컴퓨터 · 전기차(테슬라 로드스터 같은 새 차) · 배터리 · 우주 · 웨어러블). 정책 · 투자 · 인사 · 소송만 다루면 "".

${body}

{"items":[{"i":0,"one":"...","summary":"...","section":"ai","geo":["US"],"tag":"...","tag_ko":"...","trend":""}]} 형식으로만 답해. i 는 글 번호.`,
        () => ({ items: chunk.map((t, n) => /NOANSWER/.test(t.title) ? null : ({ i: n, one: `${t.title}`.slice(0, 55), summary: `${t.title}. 시험용 요약 둘째 줄이에요.`, section: "", geo: guessGeo(`${t.title} ${t.raw || ""}`), tag: fakeTag(`${t.title} ${t.raw || ""}`, t.topic), tag_ko: "" })).filter(Boolean) }), opts.ids ? "summarize-one" : "summarize"
      );
      const outs = Array.isArray(data?.items) ? data.items : [];
      for (const [n, t] of chunk.entries()) {
        const o = outs.find((x) => Number(x?.i) === n);
        if (!o || !String(o.summary || "").trim()) { failed.push(`${t.title.slice(0, 30)}: 답 없음`); await markMiss(env, t.id); continue; }
        const one = await fitOne(env, t.one_liner || String(o.one || "").trim());
        const summary = String(o.summary || "").trim().slice(0, 600);
        if (!one || !summary) { failed.push(`${t.title.slice(0, 30)}: 빈 요약`); continue; }
        const text = `${t.title} ${t.raw || ""}`.slice(0, 4000);
        let geo = [...new Set((Array.isArray(o.geo) ? o.geo : []).map((c) => String(c).toUpperCase().trim()).map((c) => (c === "EU" ? "BE" : c === "UK" ? "GB" : c)).filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 3);
        if (!geo.length) geo = guessGeo(text);
        const trend = ["sw", "hw"].includes(String(o.trend || "").toLowerCase()) ? String(o.trend).toLowerCase() : null;
        await env.DB.prepare("UPDATE news_items SET one_liner = ?, summary = ?, section = ?, geo = ?, trend = ? WHERE id = ?")
          .bind(one, summary, sectionOf(t.topic, String(o.section || "").toLowerCase().trim()), JSON.stringify(geo), trend, t.id).run();
        await attachThread(env, { id: t.id, text: `${t.title} ${one}` }, o.tag, o.tag_ko);
        const k = normTag(o.tag); if (k && !keys.includes(k)) keys.push(k);
        done += 1;
      }
    } catch (e) {
      failed.push(`${chunk.length}편 묶음: ${String(e?.message || e).slice(0, 80)}`);
    }
  });

  return { done, left: todo.length - done, failed: failed.slice(0, 3) };
}

/** 깊은 요약은 누가 열었을 때만 만들고, 만든 건 저장해 뒀다 다시 써요. */
async function deepen(env, item) {
  if (item.deep) return JSON.parse(item.deep);

  const { data } = await aiJson(
    env,
    RULES + SPELL,
    `다음 글을 읽고 아래 형식 그대로 JSON 하나로 답해 줘.

{"summary":["핵심 한 문장","..."],"why":"이 글이 더 큰 흐름에서 어떤 의미인지 2~3문장. 원문에 없는 배경을 덧붙이면 '배경:' 으로 시작해 구분해 줘.","numbers":["글에 나온 구체적 수치나 일정","없으면 빈 배열"]}

summary 는 3~5개, 각 줄은 한 문장이야.

제목: ${item.title}

${String(item.raw || "").slice(0, 20000)}`,
    () => ({ summary: [String(item.title)], why: "배경: 시험용 요약이에요.", numbers: [] }), "deep"
  );

  const deep = {
    summary: Array.isArray(data?.summary) ? data.summary.slice(0, 6).map(String) : [],
    why: String(data?.why || ""),
    numbers: Array.isArray(data?.numbers) ? data.numbers.slice(0, 8).map(String) : [],
  };
  await env.DB.prepare("UPDATE news_items SET deep = ? WHERE id = ?")
    .bind(JSON.stringify(deep), item.id).run();
  return deep;
}

// ---------- 오늘의 브리핑 ----------

/**
 * 오늘 세계의 무게가 어디에 쏠렸는지 한 문장. 하루 한 번만 만들어요.
 * 글 수 막대가 화면에 같이 뜨니까, 글이 많은 쪽과 실제로 중요한 쪽이 다르면
 * 모델이 그 차이를 직접 짚게 했어요 — 안 그러면 화면이 서로 어긋나 보여요.
 */
export async function brief(env, day, force = false) {
  if (!force) {
    const had = await env.DB.prepare("SELECT * FROM news_briefs WHERE day = ?").bind(day).first();
    if (had) return { ...had, weights: JSON.parse(had.weights) };
  }

  const { results } = await env.DB.prepare(
    `SELECT i.title, i.one_liner, f.topic
       FROM news_items i JOIN news_feeds f ON f.id = i.feed_id
      WHERE i.published_at > ? AND i.one_liner IS NOT NULL
      ORDER BY i.published_at DESC LIMIT 120`
  ).bind(Date.now() - 36 * 36e5).all();

  const recent = results || [];
  if (recent.length < 3) return null;

  const count = {};
  for (const r of recent) count[r.topic] = (count[r.topic] || 0) + 1;
  const weights = Object.entries(count)
    .map(([topic, n]) => ({ topic, n }))
    .sort((a, b) => b.n - a.n);

  const tally = weights.map((w) => `${w.topic} ${w.n}편`).join(", ");
  const digest = recent.slice(0, 60).map((r) => `[${r.topic}] ${r.one_liner || r.title}`).join("\n");

  const { data } = await aiJson(
    env,
    RULES,
    `아래는 지난 하루 들어온 기사 ${recent.length}건의 한 줄 요약이야.
이걸 읽고 **오늘 세계의 무게가 어디에 쏠려 있는지** 알려 줘.

주제별 글 수: ${tally}

중요: 화면에는 네 문장 **옆에 이 글 수 막대가 같이** 떠. 글이 많은 쪽과 실제로 중요한 쪽이
다르면 body 에서 짚어 줘("글은 거시 쪽이 많지만 무게는 ~" 처럼). 다르지 않으면 언급하지 마.

{"headline":"한 문장. 25자 이내. 단정적으로. 영화 자막처럼 짧고 묵직하게.","body":"2~3문장. 서로 다른 기사들이 어떻게 이어지는지. '~예요' 로. 사실만."}

${digest}`,
    () => ({ headline: "오늘의 흐름", body: "시험용 브리핑이에요." }), "briefing"
  );

  const row = {
    day,
    headline: String(data?.headline || "오늘의 흐름").slice(0, 120),
    body: String(data?.body || "").slice(0, 600),
    weights: JSON.stringify(weights),
    item_count: recent.length,
  };
  await env.DB.prepare(
    "INSERT OR REPLACE INTO news_briefs (day, headline, body, weights, item_count, created_at) VALUES (?,?,?,?,?,?)"
  ).bind(row.day, row.headline, row.body, row.weights, row.item_count, Date.now()).run();

  return { ...row, weights };
}

// ---------- Signal Map: 지도 · 줄기 · 토론 ----------

/** 나라 이름 → ISO 코드. AI 가 geo 를 안 줬거나 AI 없이 돌 때 쓰는 낱말 표예요. */
const GEO_WORDS = [
  ["US", /\b(u\.s\.|usa|america[n]?|washington|white house|pentagon|congress|biden|trump)\b|미국/i],
  ["CN", /\b(china|chinese|beijing|xi jinping|ccp|prc|shanghai|shenzhen)\b|중국|베이징/i],
  ["TW", /\b(taiwan|taipei|tsmc)\b|대만/i],
  ["RU", /\b(russia[n]?|moscow|kremlin|putin)\b|러시아/i],
  ["UA", /\b(ukrain\w*|kyiv|zelensky\w*)\b|우크라/i],
  ["JP", /\b(japan\w*|tokyo)\b|일본/i],
  ["KR", /\b(south korea\w*|seoul|samsung|sk hynix)\b|한국/i],
  ["KP", /\b(north korea\w*|pyongyang)\b|북한/i],
  ["IN", /\b(india[n]?|delhi|modi)\b|인도/i],
  ["IR", /\b(iran\w*|tehran)\b|이란/i],
  ["IL", /\b(israel\w*|gaza|netanyahu)\b|이스라엘/i],
  ["SA", /\b(saudi\w*|riyadh)\b|사우디/i],
  ["AE", /\b(uae|emirat\w*|abu dhabi|dubai)\b/i],
  ["TR", /\b(turkey|türkiye|turkish|ankara|erdogan)\b|튀르키예/i],
  ["DE", /\b(german\w*|berlin)\b|독일/i],
  ["FR", /\b(france|french|paris|macron)\b|프랑스/i],
  ["GB", /\b(britain|british|uk|london)\b|영국/i],
  ["BE", /\b(eu|european union|brussels|european commission)\b|유럽연합/i],
  ["PL", /\b(poland|polish|warsaw)\b|폴란드/i],
  ["NL", /\b(netherlands|dutch|asml)\b|네덜란드/i],
  ["AU", /\b(australia\w*|canberra)\b|호주/i],
  ["BR", /\b(brazil\w*)\b|브라질/i],
  ["MX", /\b(mexic\w*)\b|멕시코/i],
  ["CA", /\b(canad\w*|ottawa)\b|캐나다/i],
  ["SG", /\b(singapore\w*)\b|싱가포르/i],
  ["VN", /\b(vietnam\w*|hanoi)\b|베트남/i],
  ["PH", /\b(philippin\w*|manila)\b|필리핀/i],
  ["ID", /\b(indonesia\w*|jakarta)\b|인도네시아/i],
  ["PK", /\b(pakistan\w*)\b|파키스탄/i],
  ["EG", /\b(egypt\w*|cairo)\b|이집트/i],
  ["ZA", /\b(south africa\w*)\b|남아공/i],
  ["NG", /\b(nigeria\w*)\b/i],
  ["SY", /\b(syria\w*|damascus)\b|시리아/i],
  ["IQ", /\b(iraq\w*|baghdad)\b|이라크/i],
  ["KZ", /\b(kazakh\w*)\b/i],
];
export function guessGeo(text) {
  const t = String(text || "").slice(0, 4000), hits = [];
  for (const [c, re] of GEO_WORDS) {
    const m = t.match(new RegExp(re.source, re.flags + "g"));
    if (m) hits.push([c, m.length, t.search(re)]);
  }
  return hits.sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, 3).map((h) => h[0]);
}
/** AI 없이 돌 때의 줄기 태그: 주제 + 가장 많이 나온 나라 */
function fakeTag(text, topic) {
  const g = guessGeo(text)[0];
  return `${topic || "world"}${g ? " " + g.toLowerCase() : ""}`;
}
const normTag = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * 새 글을 줄기에 붙여요. 1) 사람이 만든 줄기의 키워드가 제목·요약에 있으면 그 줄기,
 * 2) 아니면 AI 태그가 같은 줄기, 3) 그것도 없으면 새 줄기를 만들어요 (글 1편짜리 줄기는 화면이 숨겨요).
 */
export async function attachThread(env, item, tag, tagKo) {
  const now = Date.now();
  const { results } = await env.DB.prepare("SELECT id, keywords FROM news_threads WHERE keywords <> '[]'").all();
  const text = String(item.text || "").toLowerCase();
  let hit = (results || []).find((t) => { try { return JSON.parse(t.keywords).some((k) => k && text.includes(String(k).toLowerCase())); } catch { return false; } });
  if (!hit) {
    const key = normTag(tag);
    if (!key) return null;
    hit = await env.DB.prepare("SELECT id FROM news_threads WHERE key = ?").bind(key).first();
    if (!hit) {
      await env.DB.prepare("INSERT OR IGNORE INTO news_threads (id, key, title, created_at, updated_at) VALUES (?,?,?,?,?)")
        .bind(crypto.randomUUID(), key, String(tagKo || "").trim().slice(0, 40) || key, now, now).run();
      hit = await env.DB.prepare("SELECT id FROM news_threads WHERE key = ?").bind(key).first();
    }
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE news_items SET thread_id = ? WHERE id = ?").bind(hit.id, item.id),
    env.DB.prepare("UPDATE news_threads SET updated_at = ? WHERE id = ?").bind(now, hit.id),
  ]);
  return hit.id;
}

/** D1 은 한 문장에 바인드 100개까지라 나눠서 물어요. */
async function inChunks(env, sql, ids, size = 90) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size);
    const { results } = await env.DB.prepare(sql.replace("(?)", `(${part.map(() => "?").join(",")})`)).bind(...part).all();
    out.push(...(results || []));
  }
  return out;
}

// ---------- 회사 ----------
// 구독할 수 있는 회사와 기사에서 알아보는 이름들. 짧은 영어 이름(Meta · Apple · Grok …)은 단어 경계로만 맞춰요.
export const COMPANIES = [
  { key: "anthropic", name: "Anthropic", aliases: ["Anthropic", "Claude", "앤트로픽", "클로드"] },
  { key: "openai", name: "OpenAI", aliases: ["OpenAI", "ChatGPT", "GPT-", "오픈AI", "Sam Altman"] },
  { key: "google", name: "Google DeepMind", aliases: ["DeepMind", "Gemini", "Google AI", "구글", "딥마인드", "제미나이"] },
  { key: "meta", name: "Meta AI", aliases: ["Meta AI", "Llama", "메타"] },
  { key: "xai", name: "xAI", aliases: ["xAI", "Grok"] },
  { key: "nvidia", name: "NVIDIA", aliases: ["Nvidia", "NVIDIA", "엔비디아"] },
  { key: "microsoft", name: "Microsoft", aliases: ["Microsoft", "Copilot", "마이크로소프트"] },
  { key: "apple", name: "Apple", aliases: ["Apple Intelligence", "Apple", "애플"] },
  { key: "deepseek", name: "DeepSeek", aliases: ["DeepSeek", "딥시크"] },
  { key: "mistral", name: "Mistral", aliases: ["Mistral", "미스트랄"] },
  { key: "tsmc", name: "TSMC", aliases: ["TSMC"] },
  { key: "samsung", name: "Samsung", aliases: ["Samsung", "삼성"] },
  { key: "amazon", name: "Amazon", aliases: ["Amazon", "AWS", "아마존"] },
  { key: "tesla", name: "Tesla", aliases: ["Tesla", "테슬라"] },
  { key: "intel", name: "Intel", aliases: ["Intel", "인텔"] },
  { key: "amd", name: "AMD", aliases: ["AMD"] },
  { key: "asml", name: "ASML", aliases: ["ASML"] },
  { key: "huawei", name: "Huawei", aliases: ["Huawei", "화웨이"] },
  { key: "alibaba", name: "Alibaba", aliases: ["Alibaba", "Qwen", "알리바바"] },
  { key: "baidu", name: "Baidu", aliases: ["Baidu", "바이두"] },
  { key: "bytedance", name: "ByteDance", aliases: ["ByteDance", "TikTok", "바이트댄스", "틱톡"] },
  { key: "perplexity", name: "Perplexity", aliases: ["Perplexity", "퍼플렉시티"] },
  { key: "huggingface", name: "Hugging Face", aliases: ["Hugging Face", "HuggingFace", "허깅페이스"] },
  { key: "scaleai", name: "Scale AI", aliases: ["Scale AI"] },
  { key: "palantir", name: "Palantir", aliases: ["Palantir", "팔란티어"] },
  { key: "skhynix", name: "SK hynix", aliases: ["SK hynix", "SK Hynix", "SK하이닉스", "하이닉스"] },
  { key: "qualcomm", name: "Qualcomm", aliases: ["Qualcomm", "퀄컴"] },
  { key: "arm", name: "Arm", aliases: ["Arm Holdings", "Arm"] },
  { key: "broadcom", name: "Broadcom", aliases: ["Broadcom", "브로드컴"] },
  { key: "softbank", name: "SoftBank", aliases: ["SoftBank", "소프트뱅크"] },
  { key: "cohere", name: "Cohere", aliases: ["Cohere", "코히어"] },
  // 회사가 아니라 이야기 줄기를 따라가요 (kind: "topic") — 복수형도 잡게 단어 끝은 열어 둬요
  { key: "chips-export", name: "Chip export controls", kind: "topic", aliases: ["export control", "Entity List", "수출 통제", "수출통제"] },
  { key: "taiwan", name: "Taiwan", kind: "topic", aliases: ["Taiwan", "대만"] },
  { key: "ukraine", name: "Ukraine war", kind: "topic", aliases: ["Ukrain", "우크라이나"] },
  { key: "ai-regulation", name: "AI regulation", kind: "topic", aliases: ["AI Act", "regulat", "규제"] },
  { key: "robotics", name: "Robotics", kind: "topic", aliases: ["robot", "humanoid", "로봇", "휴머노이드"] },
  { key: "open-source-ai", name: "Open-source AI", kind: "topic", aliases: ["open-source", "open source", "open weights", "open-weight", "오픈소스"] },
].map((c) => ({ kind: "company", ...c }));
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 영어 이름은 단어 단위로만 (Arm ≠ "arms", AMD ≠ "amid"). 4글자 이하 짧은 이름은 대소문자까지 맞춰요 (Arm ≠ "arm"). 주제(topic)는 복수형도 잡게 끝을 열어 둬요.
const aliasRe = (a, topic) => {
  if (!/^[\x00-\x7f]+$/.test(a)) return new RegExp(reEsc(a));
  const tail = topic || /-$/.test(a) ? "" : "(?![A-Za-z])";
  return new RegExp(`(?<![A-Za-z])${reEsc(a)}${tail}`, a.length <= 4 ? "" : "i");
};
const CO_RE = COMPANIES.map((c) => [c.key, c.aliases.map((a) => aliasRe(a, c.kind === "topic"))]);
/** 기사에 나오는 회사 key 목록 (제목 · 한국어 제목 · 한 줄 요약에서) */
export const coOf = (r) => { const t = `${r.title || ""} ${r.title_ko || ""} ${r.one_liner || ""}`; return CO_RE.filter(([, res]) => res.some((re) => re.test(t))).map(([k]) => k); };

const parseGeo = (g) => { if (Array.isArray(g)) return g; try { return JSON.parse(g || "[]") || []; } catch { return []; } };

/** 글 목록에 셋의 흔적을 붙여요: 읽은 사람 · ★ 한 사람 · 💬 수 · ⚡(반박이 있으면) · 나라 */
export async function decorate(env, rows) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return rows;
  const [marks, talk] = await Promise.all([
    inChunks(env, "SELECT item_id, user_id, read, flagged FROM news_reads WHERE item_id IN (?) AND (read = 1 OR flagged = 1)", ids),
    inChunks(env, "SELECT item_id, COUNT(*) AS n, SUM(stance = 'rebut') AS rebut FROM news_comments WHERE item_id IN (?) GROUP BY item_id", ids),
  ]);
  const by = new Map(rows.map((r) => [r.id, { ...r, readers: [], stars: [], comments: 0, disputed: false, geo: parseGeo(r.geo) }]));
  for (const m of marks) { const r = by.get(m.item_id); if (m.read) r.readers.push(m.user_id); if (m.flagged) r.stars.push(m.user_id); }
  for (const t of talk) { const r = by.get(t.item_id); r.comments = t.n; r.disputed = t.rebut > 0; }
  return [...by.values()];
}

/** 줄기의 "지금까지의 이야기". 글이 늘었을 때만 새로 만들어요. */
async function storySoFar(env, thread, items) {
  const lines = items.slice(-30).map((i) => `${new Date(i.published_at + 9 * 36e5).toISOString().slice(0, 10)} ${i.one_liner || i.title}`).join("\n");
  const { data } = await aiJson(
    env,
    RULES,
    `아래는 "${thread.title}" 이야기에 속한 기사들을 시간순으로 놓은 거야.
이 이야기가 **어떻게 흘러왔고 지금 어디에 와 있는지** 3~4문장으로 써 줘. '~예요' 체로. 사실만, 원문에 없는 건 쓰지 마.
마지막 문장은 "다음에 볼 것:" 으로 시작해서 지켜볼 지점 하나.

${lines}

{"title":"이 이야기의 한국어 제목 (12자 이내)","story":"3~4문장"} 형식으로만 답해.`,
    () => ({ title: thread.title, story: `기사 ${items.length}편이 이어진 이야기예요. 다음에 볼 것: 시험용이에요.` }), "story"
  );
  const story = String(data?.story || "").slice(0, 1200);
  const title = thread.title === thread.key && data?.title ? String(data.title).slice(0, 40) : thread.title;
  await env.DB.prepare("UPDATE news_threads SET story = ?, story_at = ?, title = ? WHERE id = ?").bind(story, Date.now(), title, thread.id).run();
  return { story, title };
}

/** 메모 하나에 대한 🤖 반박: 기사 본문에 근거한 반론 하나만. */
async function aiRebut(env, item, memo) {
  const { data } = await aiJson(
    env,
    RULES,
    `친구가 아래 기사를 읽고 메모를 남겼어. 이 메모에 대한 **반론**을 써 줘.
- 반드시 기사 본문에 있는 사실을 근거로 들어. 본문에 없는 건 지어내지 마.
- 서로 다른 **구체적인 반론 2~3개.** 각각 한 문장, '~예요' 체. 일반론("다른 면도 있어요") 말고 메모의 어느 주장이 왜 틀릴 수 있는지 짚어.
- 반론마다 근거 한 줄: 본문 구절을 원문 그대로 짧게 (20단어 이내).
- 짧게. 전체 300자 안쪽. 반론 문장에 영어 단어를 섞지 마 (근거 구절만 원문).

기사 제목: ${item.title}
본문:
${String(item.raw || "").slice(0, 12000)}

친구 메모: ${memo.body}

{"points":[{"claim":"반론 한 문장","evidence":"본문 구절"}]} 형식으로만 답해.`,
    () => ({ points: [
      { claim: `제목부터 메모와 다른 방향이에요 — "${String(item.title).slice(0, 40)}".`, evidence: String(item.raw || item.title).slice(0, 60) },
      { claim: "본문은 반대 근거도 함께 들고 있어요.", evidence: String(item.raw || item.title).slice(60, 120) },
    ] }), "ai-rebut"
  );
  const points = (Array.isArray(data?.points) ? data.points : []).slice(0, 3)
    .map((p) => ({ claim: String(p?.claim || "").trim(), evidence: String(p?.evidence || "").trim() })).filter((p) => p.claim);
  if (!points.length) throw new Error("AI 가 반론을 만들지 못했어요.");
  return points.map((p, i) => `${i + 1}. ${p.claim}${p.evidence ? `\n> ${p.evidence}` : ""}`).join("\n").slice(0, 2000);
}

// 메모 · 답글은 같은 팀 사람(나 포함) 것만
async function talkOf(env, itemId, me) {
  const { results } = await env.DB.prepare(`SELECT c.*, u.display_name FROM news_comments c JOIN users u ON u.id = c.user_id
      WHERE c.item_id = ? AND c.user_id IN ${PEERS("?")} ORDER BY c.created_at ASC`).bind(itemId, me).all();
  return results || [];
}

export function registerNewsSignal(on, { json, body, fail, now }) {
  const day = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  const ITEM_COLS = "i.id, i.title, i.title_ko, i.url, i.one_liner, i.published_at, i.dated, i.geo, i.thread_id, f.name AS feed, f.topic";

  // [GET /news/map] Signal Map 한 번에: 오늘의 신호 · 줄기(지도 호) · 최근 글 · 브리핑
  on("GET", "/news/map", async ({ env, user }) => {
    const since = Date.now() - 36 * 36e5;
    const [{ results: today }, { results: live }, { results: threads }] = await env.DB.batch([
      env.DB.prepare(`SELECT ${ITEM_COLS}, (SELECT COUNT(*) FROM news_items x WHERE x.thread_id = i.thread_id) AS thread_n
          FROM news_items i JOIN news_feeds f ON f.id = i.feed_id
         WHERE i.published_at > ? AND i.one_liner IS NOT NULL ORDER BY i.published_at DESC LIMIT 120`).bind(since),
      env.DB.prepare(`SELECT ${ITEM_COLS} FROM news_items i JOIN news_feeds f ON f.id = i.feed_id ORDER BY i.published_at DESC LIMIT 40`),
      env.DB.prepare(`SELECT t.id, t.title, t.key, t.story, COUNT(i.id) AS n, MAX(i.published_at) AS last_at, MIN(i.published_at) AS first_at,
             json_group_array(i.geo) AS geos
          FROM news_threads t JOIN news_items i ON i.thread_id = t.id
         WHERE i.published_at > ? GROUP BY t.id HAVING n >= 2 ORDER BY last_at DESC LIMIT 24`).bind(Date.now() - 14 * 864e5),
    ]);
    // 오늘의 신호: 줄기가 굵은 것(이어지는 이야기)을 먼저, 줄기마다 하나씩 — 같은 이야기가 목록을 다 먹지 않게
    const seen = new Set(), signals = [];
    for (const r of [...(today || [])].sort((a, b) => (b.thread_n || 0) - (a.thread_n || 0) || b.published_at - a.published_at)) {
      if (r.thread_id && seen.has(r.thread_id)) continue;
      if (r.thread_id) seen.add(r.thread_id);
      signals.push(r);
      if (signals.length >= 9) break;
    }
    const all = await decorate(env, [...signals, ...(live || []).filter((l) => !signals.some((s) => s.id === l.id))]);
    const dec = new Map(all.map((r) => [r.id, r]));
    // 오늘 브리핑이 아직 없으면 가장 최근 것을 날짜와 함께 보여 줘요
    const b = await env.DB.prepare("SELECT day, headline, body, item_count FROM news_briefs WHERE day <= ? ORDER BY day DESC LIMIT 1").bind(day()).first();
    return json({
      day: day(),
      count: (today || []).length,
      brief: b || null,
      signals: signals.map((s) => dec.get(s.id)),
      live: (live || []).map((l) => dec.get(l.id)),
      threads: (threads || []).map((t) => {
        const codes = new Map();
        for (const g of JSON.parse(t.geos || "[]")) for (const c of parseGeo(g)) codes.set(c, (codes.get(c) || 0) + 1);
        return { id: t.id, title: t.title, story: t.story, n: t.n, last_at: t.last_at, first_at: t.first_at, geo: [...codes].sort((a, b) => b[1] - a[1]).map((c) => c[0]).slice(0, 5) };
      }),
    });
  });

  // [GET /news/thread/:id] 줄기 타임라인
  on("GET", "/news/thread/:id", async ({ env, params }) => {
    const t = await env.DB.prepare("SELECT * FROM news_threads WHERE id = ?").bind(params.id).first();
    if (!t) fail(404, "그 줄기가 없어요.");
    const { results } = await env.DB.prepare(`SELECT ${ITEM_COLS} FROM news_items i JOIN news_feeds f ON f.id = i.feed_id
        WHERE i.thread_id = ? ORDER BY i.published_at ASC LIMIT 200`).bind(t.id).all();
    const items = await decorate(env, results || []);
    const stale = !t.story || (t.story_at || 0) < Math.max(0, ...items.map((i) => i.published_at));
    return json({ thread: { id: t.id, title: t.title, keywords: JSON.parse(t.keywords || "[]"), story: t.story, story_at: t.story_at, stale }, items });
  });

  // [POST /news/thread/:id/story] 지금까지의 이야기 (AI) — 화면이 열고 나서 따로 불러요
  on("POST", "/news/thread/:id/story", async ({ env, params }) => {
    const t = await env.DB.prepare("SELECT * FROM news_threads WHERE id = ?").bind(params.id).first();
    if (!t) fail(404, "그 줄기가 없어요.");
    const { results } = await env.DB.prepare("SELECT title, one_liner, published_at FROM news_items WHERE thread_id = ? ORDER BY published_at ASC").bind(t.id).all();
    if (!(results || []).length) return json({ story: null });
    try { return json(await storySoFar(env, t, results)); }
    catch (e) { return json({ story: null, error: String(e?.message || e).slice(0, 200) }); }
  });

  // [POST /news/threads] 줄기 직접 만들기 { title, keywords[] } → 최근 60일 글 중 키워드가 맞는 걸 붙여요
  on("POST", "/news/threads", async ({ env, req, user }) => {
    const b = await body(req);
    const title = String(b.title || "").trim().slice(0, 40);
    const keywords = (Array.isArray(b.keywords) ? b.keywords : []).map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 12);
    if (!title || !keywords.length) fail(400, "제목과 키워드를 알려 주세요.");
    const id = crypto.randomUUID(), t = now();
    await env.DB.prepare("INSERT INTO news_threads (id, key, title, keywords, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id, "user:" + id.slice(0, 8), title, JSON.stringify(keywords), user.id, t, t).run();
    const like = keywords.map(() => "(LOWER(title) LIKE ? OR LOWER(COALESCE(one_liner,'')) LIKE ?)").join(" OR ");
    const r = await env.DB.prepare(`UPDATE news_items SET thread_id = ? WHERE published_at > ? AND (${like})`)
      .bind(id, Date.now() - MAX_AGE, ...keywords.flatMap((k) => [`%${k}%`, `%${k}%`])).run();
    return json({ id, attached: r.meta?.changes || 0 });
  });

  // [GET /news/item/:id/talk] 토론 (메모 → 답글 2단)
  on("GET", "/news/item/:id/talk", async ({ env, params, user }) => json({ comments: await talkOf(env, params.id, user.id) }));

  // [POST /news/item/:id/comments] { body, stance, parent_id? } — 맨 위는 메모, 답글은 반박/동의, 2단까지
  on("POST", "/news/item/:id/comments", async ({ env, ec, req, params, user }) => {
    const b = await body(req);
    const text = String(b.body || "").trim().slice(0, 2000);
    if (!text) fail(400, "내용을 써 주세요.");
    const item = await env.DB.prepare("SELECT id FROM news_items WHERE id = ?").bind(params.id).first();
    if (!item) fail(404, "그 글이 없어요.");
    let parent = null, stance = "memo";
    if (b.parent_id) {
      parent = await env.DB.prepare(`SELECT id, user_id, parent_id FROM news_comments WHERE id = ? AND item_id = ? AND user_id IN ${PEERS("?")}`).bind(String(b.parent_id), params.id, user.id).first();
      if (!parent) fail(404, "답할 메모가 없어요.");
      if (parent.parent_id) fail(400, "답글에는 다시 답할 수 없어요 (2단까지).");
      stance = ["rebut", "agree", "memo"].includes(b.stance) ? b.stance : "memo";
    }
    const c = { id: crypto.randomUUID(), item_id: params.id, user_id: user.id, parent_id: parent?.id || null, stance, body: text, ai: 0, created_at: now(), display_name: user.display_name };
    await env.DB.prepare("INSERT INTO news_comments (id, item_id, user_id, parent_id, stance, body, ai, created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(c.id, c.item_id, c.user_id, c.parent_id, c.stance, c.body, c.ai, c.created_at).run();
    const notified = parent && parent.user_id !== user.id && stance !== "memo" ? [parent.user_id] : [];
    if (notified.length) pushUsers(env, ec, notified, { room: "news" });
    return json({ comment: c, notified });
  });

  // [POST /news/comments/:id/ai-rebut] 🤖 반박 하나 (메모에만)
  on("POST", "/news/comments/:id/ai-rebut", async ({ env, ec, params, user }) => {
    const memo = await env.DB.prepare(`SELECT * FROM news_comments WHERE id = ? AND user_id IN ${PEERS("?")}`).bind(params.id, user.id).first();
    if (!memo) fail(404, "그 메모가 없어요.");
    if (memo.parent_id) fail(400, "메모에만 AI 반박을 달 수 있어요.");
    const had = await env.DB.prepare("SELECT id FROM news_comments WHERE parent_id = ? AND ai = 1").bind(memo.id).first();
    if (had) fail(409, "이 메모에는 이미 🤖 반박이 있어요.");
    const item = await env.DB.prepare("SELECT id, title, raw FROM news_items WHERE id = ?").bind(memo.item_id).first();
    let text;
    try { text = await aiRebut(env, item, memo); }
    catch (e) { fail(502, String(e?.message || "AI 가 답하지 못했어요.").slice(0, 200)); }
    const c = { id: crypto.randomUUID(), item_id: memo.item_id, user_id: user.id, parent_id: memo.id, stance: "rebut", body: text, ai: 1, created_at: now(), display_name: user.display_name };
    await env.DB.prepare("INSERT INTO news_comments (id, item_id, user_id, parent_id, stance, body, ai, created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(c.id, c.item_id, c.user_id, c.parent_id, c.stance, c.body, c.ai, c.created_at).run();
    const notified = memo.user_id !== user.id ? [memo.user_id] : [];
    if (notified.length) pushUsers(env, ec, notified, { room: "news" });
    return json({ comment: c, notified });
  });

  // [DELETE /news/comments/:id] 내 것만 (답글도 같이 지워져요)
  on("DELETE", "/news/comments/:id", async ({ env, params, user }) => {
    await env.DB.prepare("DELETE FROM news_comments WHERE parent_id = ? AND EXISTS (SELECT 1 FROM news_comments p WHERE p.id = ? AND p.user_id = ?)").bind(params.id, params.id, user.id).run();
    const r = await env.DB.prepare("DELETE FROM news_comments WHERE id = ? AND user_id = ?").bind(params.id, user.id).run();
    if (!r.meta?.changes) fail(404, "지울 수 있는 글이 없어요.");
    return json({ ok: true });
  });

  // [GET /news/inbox] 내 메모에 친구가 단 반박·동의 중 아직 안 본 것 (푸시 알림 내용)
  on("GET", "/news/inbox", async ({ env, user }) => {
    const seen = (await env.DB.prepare("SELECT at FROM news_inbox_seen WHERE user_id = ?").bind(user.id).first())?.at || 0;
    const { results } = await env.DB.prepare(`SELECT c.stance, c.body, c.ai, c.item_id, c.created_at, u.display_name AS who
        FROM news_comments c JOIN news_comments m ON m.id = c.parent_id JOIN users u ON u.id = c.user_id
       WHERE m.user_id = ? AND c.user_id <> ? AND c.stance <> 'memo' AND c.created_at > ? AND c.user_id IN ${PEERS("?")} ORDER BY c.created_at DESC LIMIT 20`)
      .bind(user.id, user.id, seen, user.id).all();
    return json({ n: (results || []).length, last: results?.[0] || null });
  });
  on("PUT", "/news/inbox/seen", async ({ env, user }) => {
    await env.DB.prepare("INSERT INTO news_inbox_seen (user_id, at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET at = excluded.at").bind(user.id, now()).run();
    return json({ ok: true });
  });

  // ---------- 신문 (하루 한 부) ----------
  const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  const ED_COLS = "i.id, i.title, i.title_ko, i.url, i.one_liner, i.summary, i.section, i.day, i.published_at, i.dated, i.geo, i.thread_id, f.name AS feed, f.topic";
  const shape = (r) => ({ id: r.id, title: r.title, title_ko: r.title_ko ? cleanKoTitle(r.title_ko, r.feed) : null, url: r.url, feed: r.feed, topic: r.topic, section: sectionOf(r.topic, r.section), one_liner: r.one_liner, summary: r.summary,
    published_at: r.published_at, dated: r.dated, thread_id: r.thread_id, geo: r.geo, readers: r.readers, stars: r.stars, comments: r.comments, disputed: r.disputed, co: coOf(r) });

  // [GET /news/world?days=1|7|30] 지구본용 — 나라 코드가 붙은 글만 (기본 7일)
  on("GET", "/news/world", async ({ env, q }) => {
    const days = Math.min(30, Math.max(1, Number(q.get("days")) || 7)), from = kstToday(1 - days), to = kstToday(0);
    const { results } = await env.DB.prepare(`SELECT i.id, i.title, i.title_ko, i.one_liner, i.published_at, i.dated, i.section, i.geo, f.name AS feed, f.topic
        FROM news_items i JOIN news_feeds f ON f.id = i.feed_id
       WHERE i.day BETWEEN ? AND ? AND i.geo IS NOT NULL AND i.geo <> '[]' ORDER BY i.published_at DESC LIMIT 1500`).bind(from, to).all();
    const items = (results || []).map((r) => ({ id: r.id, title: r.title, title_ko: r.title_ko ? cleanKoTitle(r.title_ko, r.feed) : null, one_liner: r.one_liner, feed: r.feed,
      published_at: r.published_at, dated: r.dated, section: sectionOf(r.topic, r.section), geo: parseGeo(r.geo) })).filter((r) => r.geo.length);
    return json({ from, to, items });
  });

  // [GET /news/companies] 회사 목록 · 누가 구독했는지 · 오늘 글 수
  const subsOf = async (env) => {
    const { results } = await env.DB.prepare("SELECT user_id, company FROM news_company_subs").all();
    const m = new Map(COMPANIES.map((c) => [c.key, []]));
    for (const r of results || []) m.get(r.company)?.push(r.user_id);
    return m;
  };
  // [GET /news/library?kind=starred|read] 내가 별표한 기사 · 직접 읽음 표시한 기사 — 날짜와 상관없이 전부 (최근 표시한 순)
  on("GET", "/news/library", async ({ env, user, q }) => {
    const kind = (q?.get ? q.get("kind") : q?.kind) === "read" ? "read" : "starred";
    const col = kind === "read" ? "r.read = 1" : "r.flagged = 1", order = kind === "read" ? "COALESCE(r.read_at, r.updated_at)" : "r.updated_at";
    const { results: rows } = await env.DB.prepare(`SELECT ${ED_COLS}, ${order} AS marked_at FROM news_reads r JOIN news_items i ON i.id = r.item_id JOIN news_feeds f ON f.id = i.feed_id
      WHERE r.user_id = ? AND ${col} ORDER BY marked_at DESC LIMIT 500`).bind(user.id).all();
    const at = new Map((rows || []).map((r) => [r.id, r.marked_at]));
    return json({ kind, items: (await decorate(env, rows || [])).map((r) => ({ ...shape(r), marked_at: at.get(r.id) })) });
  });

  // ---------- 지난 기사 (History) ----------
  // [GET /news/history?before=YYYY-MM-DD&days=7] before 날짜 전(그날 제외)부터 거꾸로, 기사가 있는 날만. 한 번에 최대 400편
  on("GET", "/news/history", async ({ env, q }) => {
    const before = /^\d{4}-\d{2}-\d{2}$/.test(q.get("before") || "") ? q.get("before") : kstToday(1);
    const n = Math.min(14, Math.max(1, Number(q.get("days")) || 7));
    const { results: dayRows } = await env.DB.prepare("SELECT day FROM news_items WHERE day < ? GROUP BY day ORDER BY day DESC LIMIT ?").bind(before, n).all();
    const days = (dayRows || []).map((d) => d.day);
    if (!days.length) return json({ days: [], next_before: null });
    const { results } = await env.DB.prepare(`SELECT ${ED_COLS} FROM news_items i JOIN news_feeds f ON f.id = i.feed_id WHERE i.day BETWEEN ? AND ? ORDER BY i.published_at DESC LIMIT 400`).bind(days[days.length - 1], days[0]).all();
    const dayOf = new Map((results || []).map((r) => [r.id, r.day])); // shape() 에는 day 가 없어요
    const rows = (await decorate(env, results || [])).map((r) => ({ ...shape(r), day: dayOf.get(r.id) }));
    const by = new Map(days.map((d) => [d, []]));
    for (const r of rows) by.get(r.day)?.push(r);
    const out = days.map((day) => ({ day, items: by.get(day) })).filter((d) => d.items.length);
    return json({ days: out, next_before: out.length ? out[out.length - 1].day : null });
  });
  // [GET /news/trend/sw|hw?before=<ms>] 트렌드: SW(AI 트렌드) · HW 신기술 글, 최신순 40개씩
  on("GET", "/news/trend/:kind", async ({ env, q, params }) => {
    if (!["sw", "hw"].includes(params.kind)) fail(404, "없는 트렌드예요.");
    const before = Number(q.get("before")) || Date.now() + 864e5;
    const { results } = await env.DB.prepare(`SELECT ${ED_COLS} FROM news_items i JOIN news_feeds f ON f.id = i.feed_id WHERE i.trend = ? AND i.published_at < ? ORDER BY i.published_at DESC LIMIT 40`).bind(params.kind, before).all();
    const items = (await decorate(env, results || [])).map(shape);
    return json({ items, next_before: items.length === 40 ? results[results.length - 1].published_at : null });
  });
  // [GET /news/search?q=..&limit=60] 제목 · 한국어 제목 · 한 줄 요약 · 요약에서 찾기 (최신순)
  on("GET", "/news/search", async ({ env, q }) => {
    const term = String(q.get("q") || "").trim().slice(0, 80);
    if (term.length < 2) return json({ items: [] });
    const lim = Math.min(200, Math.max(1, Number(q.get("limit")) || 60)), l = "%" + term.replace(/[%_]/g, "") + "%";
    const { results } = await env.DB.prepare(`SELECT ${ED_COLS} FROM news_items i JOIN news_feeds f ON f.id = i.feed_id
      WHERE i.title LIKE ? OR i.title_ko LIKE ? OR i.one_liner LIKE ? OR i.summary LIKE ? ORDER BY i.published_at DESC LIMIT ?`).bind(l, l, l, l, lim).all();
    return json({ items: (await decorate(env, results || [])).map(shape) });
  });

  // ---------- AI 토큰 사용량 ----------
  // [GET /news/usage?days=30] 날마다 · 기능별 · 회사/모델별 호출 수와 토큰
  on("GET", "/news/usage", async ({ env, q }) => {
    const n = Math.min(90, Math.max(1, Number(q.get("days")) || 30)), from = kstToday(1 - n), today = kstToday(0);
    const S = "COUNT(*) AS calls, COALESCE(SUM(in_tokens),0) AS in_tokens, COALESCE(SUM(out_tokens),0) AS out_tokens";
    const [d, f, p, t, all] = await env.DB.batch([
      env.DB.prepare(`SELECT day, ${S} FROM ai_usage WHERE day >= ? GROUP BY day ORDER BY day`).bind(from),
      env.DB.prepare(`SELECT feature, ${S} FROM ai_usage WHERE day >= ? GROUP BY feature ORDER BY in_tokens + out_tokens DESC`).bind(from),
      env.DB.prepare(`SELECT provider, model, ${S} FROM ai_usage WHERE day >= ? GROUP BY provider, model ORDER BY calls DESC`).bind(from),
      env.DB.prepare(`SELECT ${S} FROM ai_usage WHERE day = ?`).bind(today),
      env.DB.prepare(`SELECT ${S}, SUM(estimated) AS estimated FROM ai_usage`),
    ]);
    return json({ days: d.results || [], by_feature: f.results || [], by_provider: p.results || [], today: t.results?.[0] || { calls: 0, in_tokens: 0, out_tokens: 0 }, total: all.results?.[0] || { calls: 0, in_tokens: 0, out_tokens: 0 } });
  });

  // ---------- 읽기 대결 ----------
  // [GET /news/leaderboard] 셋의 오늘 · 이번 주(월요일부터, 한국 시간) · 전체 읽은 수 + 하루 몫 연속 달성 일수
  on("GET", "/news/leaderboard", async ({ env, user }) => {
    const KST = 9 * 36e5, day = (t) => new Date(t + KST).toISOString().slice(0, 10);
    const today = day(Date.now());
    const dow = (new Date(Date.now() + KST).getUTCDay() + 6) % 7; // 월=0
    const weekFrom = day(Date.now() - dow * 864e5);
    const [{ results: users }, { results: prefs }, { results: rows }, { results: exc }] = await env.DB.batch([
      env.DB.prepare(`SELECT id FROM users WHERE username NOT LIKE 't\\_%' ESCAPE '\\' AND id IN ${PEERS("?")}`).bind(user.id),
      env.DB.prepare("SELECT user_id, quota FROM news_prefs"),
      env.DB.prepare("SELECT user_id, date((read_at + 32400000) / 1000, 'unixepoch') AS d, COUNT(*) AS n FROM news_reads WHERE read = 1 AND read_at IS NOT NULL AND read_at > ? GROUP BY user_id, d").bind(Date.now() - 400 * 864e5),
      env.DB.prepare("SELECT user_id, day FROM news_excused WHERE day > ?").bind(day(Date.now() - 400 * 864e5)),
    ]);
    const excused = new Set((exc || []).map((e) => e.user_id + "|" + e.day));
    const quota = new Map((prefs || []).map((p) => [p.user_id, p.quota]));
    const by = new Map();
    for (const r of rows || []) { if (!by.has(r.user_id)) by.set(r.user_id, new Map()); by.get(r.user_id).set(r.d, r.n); }
    const board = (users || []).map(({ id }) => {
      const m = by.get(id) || new Map(), q = quota.get(id) || 5;
      let week = 0, total = 0; for (const [d, n] of m) { total += n; if (d >= weekFrom) week += n; }
      // 오늘 아직 몫을 못 채웠으면 어제부터 거꾸로 세요 (하루가 끝나기 전에 연속이 끊겨 보이지 않게)
      // 관리자가 '출석 인정'한 날은 끊기지 않고 건너뛰어요 (일수에는 더하지 않아요)
      let streak = 0, t = Date.now(); if ((m.get(today) || 0) < q) t -= 864e5;
      for (;;) { const d = day(t), ok = (m.get(d) || 0) >= q; if (ok) streak++; else if (!excused.has(id + "|" + d)) break; t -= 864e5; if (streak > 400) break; }
      const best = Math.max(0, ...m.values());
      return { user_id: id, quota: q, today: m.get(today) || 0, week, total, streak, best };
    }).sort((a, b) => b.week - a.week || b.today - a.today || b.total - a.total);
    return json({ today, week_from: weekFrom, board });
  });

  // [PUT /news/prefs] 내 하루 몫 { quota: 3 | 5 | 7 }
  on("PUT", "/news/prefs", async ({ env, req, user }) => {
    const b = await body(req), q = [3, 5, 7].includes(+b.quota) ? +b.quota : 5;
    await env.DB.prepare("INSERT INTO news_prefs (user_id, quota, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET quota = excluded.quota, updated_at = excluded.updated_at").bind(user.id, q, now()).run();
    return json({ ok: true, quota: q });
  });

  on("GET", "/news/companies", async ({ env, user }) => {
    const [subs, { results }] = await Promise.all([subsOf(env),
      env.DB.prepare("SELECT title, title_ko, one_liner FROM news_items WHERE day = ?").bind(kstToday(0)).all()]);
    const today = new Map();
    for (const r of results || []) for (const k of coOf(r)) today.set(k, (today.get(k) || 0) + 1);
    return json({ companies: COMPANIES.map((c) => ({ key: c.key, name: c.name, kind: c.kind, subs: subs.get(c.key), mine: subs.get(c.key).includes(user.id), today: today.get(c.key) || 0 })) });
  });
  // [PUT /news/companies/:key] {on} 구독 켜기 · 끄기 (나만)
  on("PUT", "/news/companies/:key", async ({ env, req, user, params }) => {
    if (!COMPANIES.some((c) => c.key === params.key)) fail(404, "없는 회사예요.");
    const b = await body(req), on_ = !!b.on;
    await env.DB.prepare(on_ ? "INSERT OR IGNORE INTO news_company_subs (user_id, company, created_at) VALUES (?, ?, ?)" : "DELETE FROM news_company_subs WHERE user_id = ? AND company = ?")
      .bind(...(on_ ? [user.id, params.key, now()] : [user.id, params.key])).run();
    return json({ ok: true, mine: on_ });
  });
  // [GET /news/company/:key?days=14] 그 회사가 나온 글
  on("GET", "/news/company/:key", async ({ env, q, user, params }) => {
    const c = COMPANIES.find((x) => x.key === params.key); if (!c) fail(404, "없는 회사예요.");
    const days = Math.min(60, Math.max(1, Number(q.get("days")) || 14));
    const like = c.aliases.flatMap((a) => ["%" + a + "%", "%" + a + "%", "%" + a + "%"]);
    const cond = c.aliases.map(() => "(i.title LIKE ? OR i.title_ko LIKE ? OR i.one_liner LIKE ?)").join(" OR ");
    const [subs, { results }] = await Promise.all([subsOf(env),
      env.DB.prepare(`SELECT ${ED_COLS} FROM news_items i JOIN news_feeds f ON f.id = i.feed_id WHERE i.day >= ? AND (${cond}) ORDER BY i.published_at DESC LIMIT 200`).bind(kstToday(1 - days), ...like).all()]);
    const rows = (results || []).filter((r) => coOf(r).includes(c.key));
    return json({ company: { key: c.key, name: c.name, kind: c.kind, subs: subs.get(c.key), mine: subs.get(c.key).includes(user.id) }, items: (await decorate(env, rows)).map(shape) });
  });

  // [GET /news/editions?from&to] 신문 목록 (달력용) — 기본 최근 60일
  on("GET", "/news/editions", async ({ env, q }) => {
    const to = isDay(q.get("to")) ? q.get("to") : kstToday(0), from = isDay(q.get("from")) ? q.get("from") : kstToday(-60);
    const [{ results: eds }, { results: days }] = await env.DB.batch([
      env.DB.prepare("SELECT day, headline, status, item_count, sections, front, built_at FROM news_editions WHERE day BETWEEN ? AND ? ORDER BY day DESC").bind(from, to),
      env.DB.prepare("SELECT day, COUNT(*) AS n, SUM(summary IS NOT NULL) AS summed FROM news_items WHERE day BETWEEN ? AND ? GROUP BY day").bind(from, to),
    ]);
    const byDay = new Map((days || []).map((d) => [d.day, d]));
    const out = (eds || []).map((e) => {
      const s = parseJ(e.sections, {});
      return { day: e.day, headline: e.headline, status: e.status, built_at: e.built_at, items: byDay.get(e.day)?.n ?? e.item_count,
        counts: Object.fromEntries(SECTIONS.map((k) => [k, (s[k] || []).length])), front: parseJ(e.front, []).length };
    });
    // 글은 있는데 아직 신문이 없는 날 (되채우기 전) — 달력에 흐리게
    const pending = (days || []).filter((d) => !out.some((e) => e.day === d.day)).map((d) => ({ day: d.day, items: d.n, summed: d.summed })).sort((a, b) => (a.day < b.day ? 1 : -1));
    return json({ from, to, editions: out, pending });
  });

  // [GET /news/edition/:day] 신문 한 부 (day = YYYY-MM-DD 또는 today)
  on("GET", "/news/edition/:day", async ({ env, params }) => {
    const day = params.day === "today" ? kstToday(0) : params.day;
    if (!isDay(day)) fail(400, "날짜는 YYYY-MM-DD 로 주세요.");
    const e = await env.DB.prepare("SELECT * FROM news_editions WHERE day = ?").bind(day).first();
    const { results } = await env.DB.prepare(`SELECT ${ED_COLS} FROM news_items i JOIN news_feeds f ON f.id = i.feed_id WHERE i.day = ? ORDER BY i.published_at DESC LIMIT 400`).bind(day).all();
    // 한 매체가 하루를 덮지 않게 매체마다 최신 5편까지만 (1면에 오른 글은 빼지 않아요)
    const frontIds = new Set((e ? parseJ(e.front, []) : []).map((f) => f.item_id));
    const perFeed = new Map();
    const capped = (results || []).filter((r) => { if (frontIds.has(r.id)) return true; const n = (perFeed.get(r.feed) || 0) + 1; perFeed.set(r.feed, n); return n <= FEED_CAP; });
    const items = new Map((await decorate(env, capped)).map((r) => [r.id, shape(r)]));
    const secIds = e ? parseJ(e.sections, {}) : null;
    const sections = emptySections(), placed = new Set();
    if (secIds) for (const k of SECTIONS) for (const id of secIds[k] || []) { const it = items.get(id); if (it) { sections[k].push(it); placed.add(id); } }
    // 마감 뒤에 들어온 글(밤사이 추가)은 late 로 따로. 신문이 아직 없으면 전부 면별로 바로 보여 줘요(status "live").
    const late = [];
    for (const it of items.values()) if (!placed.has(it.id)) (secIds ? late : sections[it.section]).push(it);
    const thRows = e ? parseJ(e.threads, []) : [];
    const thInfo = thRows.length ? await inChunks(env, "SELECT t.id, t.title, t.story, (SELECT COUNT(*) FROM news_items x WHERE x.thread_id = t.id) AS n FROM news_threads t WHERE t.id IN (?)", thRows.map((t) => t.thread_id)) : [];
    const [prev, next] = await env.DB.batch([
      env.DB.prepare("SELECT day FROM news_editions WHERE day < ? ORDER BY day DESC LIMIT 1").bind(day),
      env.DB.prepare("SELECT day FROM news_editions WHERE day > ? ORDER BY day ASC LIMIT 1").bind(day),
    ]);
    return json({
      day,
      status: e ? e.status : "live",
      headline: e?.headline || null,
      lede: e?.lede || "",
      built_at: e?.built_at || null,
      front: (e ? parseJ(e.front, []) : []).map((f) => ({ item: items.get(f.item_id) || null, why: f.why })).filter((f) => f.item),
      threads: thRows.map((t) => { const i = thInfo.find((x) => x.id === t.thread_id); return i ? { id: i.id, title: i.title, story: i.story, n: i.n, move: t.move } : null; }).filter(Boolean),
      sections,
      late,
      count: items.size,
      prev: prev.results?.[0]?.day || null,
      next: next.results?.[0]?.day || null,
    });
  });

  // [POST /news/backfill] 되채우기 한 걸음 (지난 60일 중 마감 안 된 가장 오래된 날)
  on("POST", "/news/backfill", async ({ env }) => {
    const r = await withBudget(NEWS_BUDGET, () => backfillStep(env, 0));
    return json({ ...r.result, subrequests: r.used });
  });
  on("GET", "/news/backfill", async ({ env }) => json({ state: await getJob(env, "backfill") }));
}

// ---------- 하루 한 부: 신문 (news_editions) ----------

const parseJ = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const emptySections = () => Object.fromEntries(SECTIONS.map((k) => [k, []]));

/**
 * 그날(한국 날짜) 신문을 짜요. 1면(헤드라인 · 리드 · 핵심 3~5편 · 줄기가 오늘 어떻게 움직였나) + 면별 글 목록.
 * AI 는 한 번만 불러요. 마감(closed)된 신문은 draft 로 덮어쓰지 않아요.
 */
export async function buildEdition(env, day, status = "draft") {
  const had = await env.DB.prepare("SELECT status FROM news_editions WHERE day = ?").bind(day).first();
  if (had?.status === "closed" && status !== "closed") return { day, status: "closed", skipped: true };

  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, i.one_liner, i.summary, i.section, i.thread_id, i.published_at, f.topic
       FROM news_items i JOIN news_feeds f ON f.id = i.feed_id WHERE i.day = ? ORDER BY i.published_at DESC LIMIT 400`
  ).bind(day).all();
  const items = results || [];
  const sections = emptySections();
  for (const it of items) sections[sectionOf(it.topic, it.section)].push(it.id);

  // 오늘 움직인 줄기: 오늘 글이 있고, 전체로 2편 이상 이어진 이야기
  const perThread = new Map();
  for (const it of items) if (it.thread_id) perThread.set(it.thread_id, [...(perThread.get(it.thread_id) || []), it]);
  let threads = [];
  if (perThread.size) {
    const ids = [...perThread.keys()];
    const rows = await inChunks(env, "SELECT t.id, t.title, (SELECT COUNT(*) FROM news_items x WHERE x.thread_id = t.id) AS n FROM news_threads t WHERE t.id IN (?)", ids);
    threads = rows.filter((t) => t.n >= 2).map((t) => ({ ...t, today: perThread.get(t.id) }))
      .sort((a, b) => b.today.length - a.today.length || b.n - a.n).slice(0, 6);
  }

  const pool = items.filter((i) => i.one_liner).slice(0, 40);
  let out = { headline: "조용한 하루", lede: "", front: [], threads: [] };
  if (pool.length && left() >= 2) {
    try {
      const { data } = await aiJson(
        env,
        RULES,
        `아래는 ${day} 하루 동안 들어온 기사 ${pool.length}편과, 오늘 새 글이 붙은 이어지는 이야기(줄기)야. 이걸로 **오늘 신문의 1면**을 짜 줘.

- headline: 오늘을 대표하는 한 문장, 30자 이내. 단정적으로.
- lede: 2~3문장. 오늘 기사들이 어떻게 이어지는지. '~예요' 체. 사실만.
- front: 1면에 올릴 기사 3~5편. 글 수가 많은 쪽보다 **실제로 중요한 것**. 서로 다른 이야기로. why = 왜 1면인지 한 문장('~예요').
- threads: 아래 줄기마다 오늘 어떻게 움직였는지 한 문장(move, '~예요'). 줄기가 없으면 빈 배열.

기사:
${pool.map((p, n) => `[${n}] (${sectionOf(p.topic, p.section)}) ${p.one_liner}`).join("\n")}

줄기:
${threads.length ? threads.map((t, n) => `[T${n}] ${t.title} — 오늘 ${t.today.length}편: ${t.today.slice(0, 3).map((x) => x.one_liner || x.title).join(" / ")}`).join("\n") : "(없음)"}

{"headline":"...","lede":"...","front":[{"n":0,"why":"..."}],"threads":[{"t":0,"move":"..."}]} 형식으로만 답해.`,
        () => ({ headline: String(pool[0].one_liner).slice(0, 30), lede: `${day} 기사 ${items.length}편이에요. 시험용 1면이에요.`,
          front: pool.slice(0, 4).map((_, n) => ({ n, why: "시험용 1면 이유예요." })), threads: threads.map((_, t) => ({ t, move: "시험용 움직임이에요." })) }), "edition"
      );
      const seen = new Set();
      out = {
        headline: String(data?.headline || "").trim().slice(0, 120) || String(pool[0].one_liner).slice(0, 60),
        lede: String(data?.lede || "").trim().slice(0, 800),
        front: (Array.isArray(data?.front) ? data.front : []).map((f) => ({ p: pool[Number(f?.n)], why: String(f?.why || "").trim().slice(0, 300) }))
          .filter((f) => f.p && !seen.has(f.p.id) && seen.add(f.p.id)).slice(0, 5).map((f) => ({ item_id: f.p.id, why: f.why })),
        threads: (Array.isArray(data?.threads) ? data.threads : []).map((x) => ({ t: threads[Number(String(x?.t).replace(/^T/i, ""))], move: String(x?.move || "").trim().slice(0, 300) }))
          .filter((x) => x.t && x.move).map((x) => ({ thread_id: x.t.id, move: x.move })),
      };
    } catch (e) {
      console.log("1면 실패", day, String(e?.message || e));
      out = { headline: String(pool[0].one_liner).slice(0, 60), lede: "", front: [], threads: [] };
    }
  } else if (pool.length) out.headline = String(pool[0].one_liner).slice(0, 60);
  // 1면은 최소 3편 (글이 그만큼 있으면) — AI 가 적게 주면 줄기가 굵은 순으로 채워요
  for (const p of pool) {
    if (out.front.length >= Math.min(3, pool.length)) break;
    if (!out.front.some((f) => f.item_id === p.id)) out.front.push({ item_id: p.id, why: "" });
  }

  const row = [day, out.headline, out.lede, JSON.stringify(out.front), JSON.stringify(out.threads), JSON.stringify(sections), status, items.length, Date.now()];
  await env.DB.prepare(
    `INSERT INTO news_editions (day, headline, lede, front, threads, sections, status, item_count, built_at) VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(day) DO UPDATE SET headline = excluded.headline, lede = excluded.lede, front = excluded.front, threads = excluded.threads,
       sections = excluded.sections, status = excluded.status, item_count = excluded.item_count, built_at = excluded.built_at`
  ).bind(...row).run();
  return { day, status, items: items.length, front: out.front.length, threads: out.threads.length, headline: out.headline };
}

// ---------- 지난 60일 되채우기 (한 번에 하루씩, 조금씩) ----------

const BACKFILL_DAYS = 60;
const getJob = async (env, name) => parseJ((await env.DB.prepare("SELECT state FROM news_jobs WHERE name = ?").bind(name).first())?.state, {});
const putJob = (env, name, state) => env.DB.prepare("INSERT INTO news_jobs (name, state, updated_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at")
  .bind(name, JSON.stringify(state), Date.now()).run();

/**
 * 한 걸음: 아직 마감 신문이 없는 가장 오래된 날(최근 60일 · 오늘 제외)의 글을 perStep 편 요약하고,
 * 그날 요약할 게 다 끝났으면 그날 신문을 마감(closed)으로 짜요. 몇 번을 불러도 같은 결과(멱등).
 * 요약이 계속 실패해서 3걸음째 진전이 없으면 요약 없는 글은 둔 채 신문을 짜요(멈춰 있지 않게).
 */
export async function backfillStep(env, perStep = 10) {
  const today = kstToday(0), from = kstToday(-BACKFILL_DAYS);
  const next = await env.DB.prepare(
    `SELECT i.day, COUNT(*) AS n, SUM(i.summary IS NULL AND i.sum_skip = 0) AS todo FROM news_items i LEFT JOIN news_editions e ON e.day = i.day
      WHERE i.day >= ? AND i.day < ? AND (e.day IS NULL OR e.status <> 'closed') GROUP BY i.day ORDER BY i.day ASC LIMIT 1`
  ).bind(from, today).first();
  const st = await getJob(env, "backfill");
  const closedDays = (await env.DB.prepare("SELECT COUNT(*) AS n FROM news_editions WHERE status = 'closed' AND day >= ? AND day < ?").bind(from, today).first())?.n || 0;
  if (!next) {
    const s = { day: null, idle: true, closed_days: closedDays, at: Date.now() };
    await putJob(env, "backfill", s);
    return s;
  }
  const titles = await translateTitles(env, { day: next.day, calls: 1, reserve: 3 });
  let summed = 0, failed = [];
  if (next.todo > 0) { const r = await summarize(env, perStep || budgetChunks(2) * SUM_CHUNK, { day: next.day }); summed = r.done; failed = r.failed; }
  const todo = next.todo > 0 ? (await env.DB.prepare("SELECT COUNT(*) AS n FROM news_items WHERE day = ? AND summary IS NULL AND sum_skip = 0").bind(next.day).first()).n : 0;
  const stuck = summed === 0 && next.todo > 0 ? (st.day === next.day ? (st.stuck || 0) + 1 : 1) : 0;
  let built = null;
  if ((todo <= 0 || stuck >= 3) && left() >= 1) built = await buildEdition(env, next.day, "closed");
  const s = { day: next.day, items: next.n, summed, todo: Math.max(0, todo), stuck, built: !!built, closed_days: closedDays + (built ? 1 : 0), failed, titles: titles.done, at: Date.now() };
  await putJob(env, "backfill", s);
  return s;
}

// ---------- 크론 (전부 바깥 요청 40개 안 — lib/budget.js 가 세고 막아요) ----------

export const NEWS_BUDGET = 40;
/** 남은 예산으로 돌릴 수 있는 요약 묶음 수 (reserve 개는 남겨 둬요 — 1면 · 한 줄 줄이기 몫) */
const budgetChunks = (reserve = 2) => Math.max(0, Math.min(8, Math.floor((left() - reserve) / 1.3)));

/** 매시 10분 (DB 알림과 같은 크론): 피드 10곳 + 요약 1묶음(5편) + 되채우기 한 걸음(5편) — 보통 30개 안팎/40 (공급사 장애 조치 여유) */
export async function newsHourly(env) {
  const pulled = await ingest(env, Date.now(), 16); // 요약은 목록을 연 사람 쪽에서도 바로 채우니 수집에 몫을 더 줘요
  const titles = await translateTitles(env, { calls: 2, reserve: 4 });
  // 오늘(한국) 글을 먼저 — 되채우기 몫(6)만 남기고 요약해요. 오늘 것이 다 끝났으면 최근 글, 그다음 되채우기.
  const today = left() >= 4 ? await summarize(env, Math.max(1, budgetChunks(8)) * SUM_CHUNK, { day: kstToday(0) }) : { done: 0, left: 0 };
  const recent = !today.left && left() >= 10 ? await summarize(env, SUM_CHUNK) : { done: 0 };
  const backfill = !today.left && left() >= 6 ? await backfillStep(env, 5) : null;
  return { added: pulled.reduce((n, p) => n + p.added, 0), feeds: pulled.length, titles: titles.done, summed: today.done + recent.done, today_left: today.left, backfill };
}
/** 하위 호환 (예전 이름) */
export const newsPulse = newsHourly;

/** 아침 8시: 요약 4묶음(20편) + 오늘 신문 초안 다시 짜기 + 예전 브리핑 */
export async function newsCron(env, day = kstToday(0)) {
  const titles = (await translateTitles(env, { calls: 3, reserve: 6 })).done;
  const summed = (await summarize(env, 20)).done;
  const edition = await buildEdition(env, day, "draft");
  let head = null;
  try { if (left() >= 2) head = (await brief(env, day, true))?.headline || null; }
  catch (e) { console.log("브리핑 실패", String(e?.message || e)); }
  return { added: 0, titles, summed, broken: 0, dying: [], head, edition };
}

/** 23:10 (한국): 마지막으로 모으고, 오늘 글을 요약하고, 오늘 신문을 마감해요 */
export async function newsClose(env, day = kstToday(0)) {
  const pulled = await ingest(env, Date.now(), 12);
  const titles = await translateTitles(env, { day, calls: 2, reserve: 6 });
  const sum = await summarize(env, 20, { day });
  const edition = await buildEdition(env, day, "closed");
  return { added: pulled.reduce((n, p) => n + p.added, 0), titles: titles.done, summed: sum.done, edition };
}


// ---------- 소스 심기 ----------

/** 처음 한 번. 이미 있는 주소는 건너뛰어요. */
export async function seedFeeds(env) {
  const now = Date.now();
  let put = 0;
  for (const [name, url, topic, lang, , note] of SEED) {
    const r = await env.DB.prepare(
      "INSERT OR IGNORE INTO news_feeds (id, url, name, topic, lang, note, created_at) VALUES (?,?,?,?,?,?,?)"
    ).bind(id(), url, name, topic, lang, note || "", now).run();
    if (r.meta?.changes) put += 1;
  }
  return { put, total: SEED.length };
}

// ---------- API 라우트 ----------

export function registerNews(on, { json, body, fail, now }) {
  const me = (ctx) => ctx.user.id;

  /**
   * 주제별 균형 잡기.
   *
   * 최신순으로만 뽑으면 **일간 매체가 목록을 독점해요**. 지정학(Meduza · Semafor ·
   * The Diplomat)은 매일 쏟아내고 AI·반도체는 주간 뉴스레터라, 3일치를 세어 보면
   * 지정학 64편 / AI 8편 / 반도체 1편이에요. 소스를 잘못 고른 게 아니라
   * 발행 주기가 다른 거예요.
   *
   * 그래서 주제마다 자리를 먼저 떼어 주고(기본 6칸), 남는 자리를 최신순으로 채워요.
   * 주간지 한 편이 일간지 더미에 묻히지 않게요.
   */
  const balance = (rows, perTopic, limit) => {
    const bucket = new Map();
    for (const r of rows) {
      const list = bucket.get(r.topic) || [];
      list.push(r);
      bucket.set(r.topic, list);
    }
    const picked = [];
    const seen = new Set();
    for (const [, list] of bucket) {
      for (const r of list.slice(0, perTopic)) { picked.push(r); seen.add(r.id); }
    }
    for (const r of rows) {
      if (picked.length >= limit) break;
      if (!seen.has(r.id)) { picked.push(r); seen.add(r.id); }
    }
    return picked.sort((a, b) => b.published_at - a.published_at).slice(0, limit);
  };

  // 1. [GET /news/items] 글 목록. 피드는 셋이 공유하고 읽음만 사람별로 갈려요.
  on("GET", "/news/items", async ({ env, q, user }) => {
    const filter = q.get("filter") || "unread";   // unread | all | saved | flagged
    const topic = q.get("topic") || "all";
    const limit = Math.min(Number(q.get("limit")) || 80, 200);

    const where = ["i.published_at > ?"];
    const bind = [Date.now() - MAX_AGE];

    if (topic !== "all" && TOPICS.includes(topic)) { where.push("f.topic = ?"); bind.push(topic); }
    if (filter === "unread") where.push("COALESCE(r.read, 0) = 0");
    if (filter === "saved") where.push("COALESCE(r.saved, 0) = 1");
    if (filter === "flagged") where.push("COALESCE(r.flagged, 0) = 1");

    const { results } = await env.DB.prepare(
      `SELECT i.id, i.title, i.title_ko, i.url, i.one_liner, i.published_at, i.dated, i.geo, i.thread_id, f.name AS feed, f.topic,
              COALESCE(r.read,0) AS read, COALESCE(r.saved,0) AS saved, COALESCE(r.flagged,0) AS flagged,
              (SELECT COUNT(*) FROM news_reads s WHERE s.item_id = i.id AND s.user_id <> ? AND s.flagged = 1) AS others_flagged
         FROM news_items i
         JOIN news_feeds f ON f.id = i.feed_id
         LEFT JOIN news_reads r ON r.item_id = i.id AND r.user_id = ?
        WHERE ${where.join(" AND ")}
        ORDER BY i.published_at DESC LIMIT ?`
    ).bind(user.id, user.id, ...bind, Math.max(limit * 3, 160)).all();

    const rows = results || [];
    // 주제를 좁혀 보고 있거나 저장함이면 균형을 맞출 이유가 없어요.
    const even = topic === "all" && filter !== "saved" && q.get("balance") !== "0";
    return json({ items: await decorate(env, even ? balance(rows, Number(q.get("per")) || 6, limit) : rows.slice(0, limit)) });
  });

  // 2. [GET /news/topics] 주제별 안 읽은 수 (왼쪽 목록용)
  on("GET", "/news/topics", async ({ env, user }) => {
    const { results } = await env.DB.prepare(
      `SELECT f.topic, COUNT(*) AS total,
              SUM(CASE WHEN COALESCE(r.read,0) = 0 THEN 1 ELSE 0 END) AS unread
         FROM news_items i
         JOIN news_feeds f ON f.id = i.feed_id
         LEFT JOIN news_reads r ON r.item_id = i.id AND r.user_id = ?
        WHERE i.published_at > ?
        GROUP BY f.topic ORDER BY unread DESC`
    ).bind(user.id, Date.now() - MAX_AGE).all();
    return json({ topics: results || [] });
  });

  // 3. [GET /news/item/:id] 글 하나 + 깊은 요약(없으면 그 자리에서 만들어요) + 셋의 메모
  on("GET", "/news/item/:id", async ({ env, params, user }) => {
    const item = await env.DB.prepare(
      `SELECT i.*, f.name AS feed, f.topic FROM news_items i
         JOIN news_feeds f ON f.id = i.feed_id WHERE i.id = ?`
    ).bind(params.id).first();
    if (!item) fail(404, "그 글이 없어요.");

    // 깊은 요약을 여기서 만들면 20~30초 멈춰서 "클릭이 안 먹는" 것처럼 보여요.
    // 이미 있는 것만 돌려주고, 없으면 화면이 따로 요청해요.
    const deep = item.deep ? JSON.parse(item.deep) : null;

    const { results: notes } = await env.DB.prepare(
      `SELECT r.note, r.user_id, u.display_name, u.color FROM news_reads r
         JOIN users u ON u.id = r.user_id
        WHERE r.item_id = ? AND r.note IS NOT NULL AND r.note <> '' AND r.user_id IN ${PEERS("?")}
        ORDER BY r.updated_at DESC`
    ).bind(params.id, user.id).all();

    const mine = await env.DB.prepare(
      "SELECT read, saved, flagged, note FROM news_reads WHERE item_id = ? AND user_id = ?"
    ).bind(params.id, user.id).first();

    const [marked] = await decorate(env, [{ id: item.id, geo: item.geo }]);
    return json({
      item: {
        id: item.id, title: item.title, title_ko: item.title_ko ? cleanKoTitle(item.title_ko, item.feed) : null, url: item.url, author: item.author,
        published_at: item.published_at, one_liner: item.one_liner, summary: item.summary, section: sectionOf(item.topic, item.section),
        feed: item.feed, topic: item.topic, thread_id: item.thread_id, dated: item.dated,
        geo: marked.geo, readers: marked.readers, stars: marked.stars,
      },
      comments: await talkOf(env, item.id, user.id),
      thread: item.thread_id ? await env.DB.prepare("SELECT id, title FROM news_threads WHERE id = ?").bind(item.thread_id).first() : null,
      deep,
      excerpt: String(item.raw || "").slice(0, 700),
      // 원문 본문(태그 · 겹친 공백을 걷어 낸 글) — History 에서 지난 기사 내용을 읽게
      body: String(item.raw || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, 6000),
      mine: mine || { read: 0, saved: 0, flagged: 0, note: null },
      notes: notes || [],
    });
  });

  // 3-1. [POST /news/item/:id/deep] 깊은 요약을 만들어요. 화면이 글을 연 뒤에 따로 불러요.
  // [POST /news/item/:id/summarize] 기사를 열었는데 요약이 없으면 지금 이 글 하나만 만들어요 (AI 한 번)
  // 목록에 보이는 요약 없는 글들 (한 번에 4편, AI 호출 1번)
  on("POST", "/news/summarize", async ({ env, req }) => {
    const b = await req.json().catch(() => ({}));
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, SUM_CHUNK);
    if (!ids.length) return json({ items: [] });
    await summarize(env, ids.length, { ids });
    const { results } = await env.DB.prepare(`SELECT i.id, i.summary, i.section, f.topic FROM news_items i JOIN news_feeds f ON f.id = i.feed_id WHERE i.id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    return json({ items: results.filter((r) => r.summary).map((r) => ({ id: r.id, summary: r.summary, section: sectionOf(r.topic, r.section) })) });
  });

  on("POST", "/news/item/:id/summarize", async ({ env, params }) => {
    const pick = () => env.DB.prepare("SELECT i.id, i.summary, i.title_ko, i.one_liner, i.section, i.geo, f.topic, f.name AS feed FROM news_items i JOIN news_feeds f ON f.id = i.feed_id WHERE i.id = ?").bind(params.id).first();
    let r = await pick();
    if (!r) fail(404, "그 글이 없어요.");
    let error = null;
    if (!r.summary) {
      const out = await summarize(env, 1, { ids: [r.id] });
      if (!out.done) error = out.failed[0] || "요약을 못 만들었어요.";
      r = await pick();
    }
    return json({ item: { id: r.id, summary: r.summary, title_ko: r.title_ko ? cleanKoTitle(r.title_ko, r.feed) : null, one_liner: r.one_liner, section: sectionOf(r.topic, r.section), geo: parseGeo(r.geo) }, ...(error ? { error } : {}) });
  });

  // [GET /news/comments/recent] 모든 기사에 달린 최근 메모 · 반박 · 동의 (친구들이 뭐라고 했는지 한곳에서)
  on("GET", "/news/comments/recent", async ({ env, q }) => {
    const limit = Math.max(1, Math.min(100, Number(q?.get?.("limit")) || 30));
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.item_id, c.user_id, c.stance, c.parent_id, c.ai, c.body, c.created_at, i.title, i.title_ko, i.one_liner, f.name AS feed
         FROM news_comments c JOIN news_items i ON i.id = c.item_id JOIN news_feeds f ON f.id = i.feed_id
        ORDER BY c.created_at DESC LIMIT ?`
    ).bind(limit).all();
    return json({ comments: (results || []).map((c) => ({ id: c.id, item_id: c.item_id, item_title: (c.title_ko ? cleanKoTitle(c.title_ko, c.feed) : null) || c.one_liner || c.title, user_id: c.user_id, stance: c.stance, parent_id: c.parent_id, ai: !!c.ai, body: c.body, created_at: c.created_at })) });
  });

  on("POST", "/news/item/:id/deep", async ({ env, params }) => {
    const item = await env.DB.prepare("SELECT * FROM news_items WHERE id = ?").bind(params.id).first();
    if (!item) fail(404, "그 글이 없어요.");
    try {
      return json({ deep: await deepen(env, item) });
    } catch (e) {
      return json({ deep: null, error: String(e?.message || e).slice(0, 200) });
    }
  });

  // [POST /news/item/:id/ask] 이 기사에 대해 AI 에게 묻기 — { q, history?:[{role,content}] } → { answer }
  //   기사(공개 글)만 보내요. 개인 노트는 안 들어가서 어느 AI 든 써요. 하루 사용량은 worker.js AI_PATH
  on("POST", "/news/item/:id/ask", async ({ env, params, req }) => {
    const b = await body(req);
    const q = String(b.q || "").trim().slice(0, 1000);
    if (!q) fail(400, "궁금한 걸 적어 주세요.");
    const item = await env.DB.prepare("SELECT title, title_ko, summary, raw FROM news_items WHERE id = ?").bind(params.id).first();
    if (!item) fail(404, "그 글이 없어요.");
    let sum = []; try { sum = JSON.parse(item.summary || "[]"); } catch {}
    const sys = `너는 뉴스 기사를 읽는 사람을 돕는 한국어 해설가야. 쉬운 해요체로 짧고 정확하게 답해.
- 아래 기사 내용을 먼저 근거로 써. 기사에 없는 일반 지식(용어 뜻 · 배경)은 설명해도 되지만 '기사 밖 설명:' 으로 시작해 구분해.
- 모르는 건 모른다고 해. 숫자는 기사에 있는 것만 써.

제목: ${item.title_ko || item.title}
원제: ${item.title}
요약: ${(Array.isArray(sum) ? sum : []).join(" / ")}
본문:
${String(item.raw || "").slice(0, 16000)}`;
    const hist = (Array.isArray(b.history) ? b.history : []).slice(-6).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    const r = await aiText(env, sys, [...hist, { role: "user", content: q }]);
    return json({ answer: r.text, model: r.model });
  });

  // 4. [PATCH /news/item/:id] 읽음 · 저장 · 중요 표시 · 내 메모
  on("PATCH", "/news/item/:id", async ({ env, params, req, user }) => {
    const b = await body(req);
    const t = now();

    await env.DB.prepare(
      "INSERT OR IGNORE INTO news_reads (item_id, user_id, updated_at) VALUES (?,?,?)"
    ).bind(params.id, user.id, t).run();

    const sets = [];
    const bind = [];
    for (const k of ["read", "saved", "flagged"]) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); bind.push(b[k] ? 1 : 0); }
    }
    if (b.note !== undefined) {
      sets.push("note = ?");
      bind.push(String(b.note || "").slice(0, 2000) || null);
    }
    if (!sets.length) return json({ ok: true });

    // 처음 읽은 때만 남겨요 (읽기 대결 · 연속 달성은 이 시각의 한국 날짜로 세요)
    if (b.read) sets.push("read_at = COALESCE(read_at, " + t + ")");
    else if (b.read === false) sets.push("read_at = NULL"); // 읽음을 직접 취소하면 대결 점수에서도 빠져요
    await env.DB.prepare(`UPDATE news_reads SET ${sets.join(", ")}, updated_at = ? WHERE item_id = ? AND user_id = ?`)
      .bind(...bind, t, params.id, user.id).run();
    return json({ ok: true });
  });

  // 5. [GET /news/brief] 오늘의 브리핑
  on("GET", "/news/brief", async ({ env, q }) => {
    const day = q.get("day") || new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
    try {
      return json({ brief: await brief(env, day) });
    } catch (e) {
      return json({ brief: null, error: String(e?.message || e).slice(0, 200) });
    }
  });

  // 6. [GET /news/notes] 내가 쓴 메모 모아보기
  on("GET", "/news/notes", async ({ env, user }) => {
    const { results } = await env.DB.prepare(
      `SELECT r.note, r.updated_at, i.title, i.url, f.name AS feed
         FROM news_reads r
         JOIN news_items i ON i.id = r.item_id
         JOIN news_feeds f ON f.id = i.feed_id
        WHERE r.user_id = ? AND r.note IS NOT NULL AND r.note <> ''
        ORDER BY r.updated_at DESC LIMIT 200`
    ).bind(user.id).all();
    return json({ notes: results || [] });
  });

  /**
   * 6-1. [GET /news/breaking] 속보.
   *
   * **AI 를 전혀 쓰지 않아요.** 요약 없이 제목만 보여줘요 — 급한 건 빨리 알고 싶지
   * 잘 정리된 걸 기다리고 싶진 않으니까요. 요약은 아침 8시에 붙어요.
   * 한 시간마다 도는 가벼운 크론이 글만 긁어 와요(토큰 0).
   */
  on("GET", "/news/breaking", async ({ env, q, user }) => {
    const hours = Math.min(Number(q.get("hours")) || 6, 24);
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.title, i.title_ko, i.url, i.one_liner, i.published_at, f.name AS feed, f.topic,
              COALESCE(r.read,0) AS read
         FROM news_items i
         JOIN news_feeds f ON f.id = i.feed_id
         LEFT JOIN news_reads r ON r.item_id = i.id AND r.user_id = ?
        WHERE i.published_at > ?
        ORDER BY i.published_at DESC LIMIT 12`
    ).bind(user.id, Date.now() - hours * 36e5).all();
    return json({ items: results || [] });
  });

  // 7. [POST /news/refresh] 지금 모으기. 화면의 '새로고침'이 여기로 와요.
  on("POST", "/news/refresh", async ({ env }) => { const r = await withBudget(NEWS_BUDGET, async () => {
    // 수집은 매시 크론이 해요. 글이 하나도 없을 때만 여기서 받아요 (fetch 50개 한도 — 위 ingest 설명)
    const any = await env.DB.prepare("SELECT 1 FROM news_items LIMIT 1").first();
    const pulled = any ? [] : await ingest(env, Date.now(), 12);
    // 예산(40) 안에서 할 수 있는 만큼: 한국어 제목 → 오늘 글 요약 → 남으면 최근 글 요약 (브리핑 몫 2 는 남겨요)
    const titles = await translateTitles(env, { calls: 4, reserve: 6 });
    const todaySum = await summarize(env, budgetChunks(3) * SUM_CHUNK, { day: kstToday(0) });
    const more = budgetChunks(3) ? await summarize(env, budgetChunks(3) * SUM_CHUNK) : { done: 0 };
    const sum = { done: todaySum.done + more.done };
    // 오늘 브리핑이 없으면 여기서 만들어요 (아침 크론 전에 새로고침해도 브리핑 줄이 비지 않게)
    const today = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
    let briefed = false;
    try { if (!(await env.DB.prepare("SELECT 1 FROM news_briefs WHERE day = ?").bind(today).first())) briefed = !!(await brief(env, today)); }
    catch (e) { console.log("브리핑 실패", String(e?.message || e)); }
    return {
      briefed,
      added: pulled.reduce((n, p) => n + p.added, 0),
      titles: titles.done,
      summarized: sum.done,
      broken: pulled.filter((p) => p.error).map((p) => ({ feed: p.feed, error: p.error })),
      dying: pulled.filter((p) => p.staleDays).map((p) => ({ feed: p.feed, days: p.staleDays })),
    };
  }); return json({ ...r.result, subrequests: r.used }); });

  // 8. [GET /news/health] 손봐야 할 소스 (관리용)
  on("GET", "/news/health", async ({ env }) => {
    const { results } = await env.DB.prepare(
      `SELECT name, topic, last_item_at, fail_count, last_error FROM news_feeds
        WHERE fail_count > 0 OR last_item_at IS NULL OR last_item_at < ?
        ORDER BY fail_count DESC`
    ).bind(Date.now() - STALE).all();

    const total = await env.DB.prepare(
      `SELECT COUNT(*) AS feeds, (SELECT COUNT(*) FROM news_items WHERE published_at > ?) AS items,
              (SELECT COUNT(*) FROM news_items WHERE published_at > ? AND one_liner IS NOT NULL) AS summed
         FROM news_feeds`
    ).bind(Date.now() - MAX_AGE, Date.now() - MAX_AGE).first();

    return json({ sick: results || [], ...total });
  });

  // 9. [POST /news/seed] 소스 심기 (처음 한 번)
  on("POST", "/news/seed", async ({ env }) => json(await seedFeeds(env)));

  registerNewsSignal(on, { json, body, fail, now });
}

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
import { aiJson as realAiJson } from "./ai.js";
import { SEED } from "./feeds.js";
import { pushUsers } from "./push.js";

// 로컬 시험용: NEWS_FAKE_AI=1 이면 AI 를 부르지 않고 정해진 답을 돌려줘요 (smoke · e2e 가 키 없이 돌게).
const aiJson = (env, system, prompt, fake) =>
  env.NEWS_FAKE_AI === "1" && fake ? Promise.resolve({ data: fake() }) : realAiJson(env, system, prompt);

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
        "INSERT OR IGNORE INTO news_items (id, feed_id, url, title, author, published_at, dated, raw, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
      ).bind(id(), feed.id, it.url, it.title.slice(0, 500), it.author, it.published ?? now, it.published == null ? 0 : 1, it.content, now).run();
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
export async function ingest(env, now = Date.now()) {
  const { results } = await env.DB.prepare(
    "SELECT id, url, name FROM news_feeds WHERE active = 1 AND fail_count < 5"
  ).all();
  return inBatches(results || [], PULL_AT_ONCE, (f) => pull(env, f, now));
}

// ---------- 요약 ----------

/** 요약이 없는 글에 한 줄씩 붙여요. 수집과 따로 도니 실패해도 글은 남아요. */
export async function summarize(env, limit = 30) {
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, i.raw, f.name AS feed, f.topic
       FROM news_items i JOIN news_feeds f ON f.id = i.feed_id
      WHERE i.one_liner IS NULL AND i.published_at > ?
      ORDER BY i.published_at DESC LIMIT ?`
  ).bind(Date.now() - MAX_AGE, limit).all();

  const todo = results || [];
  // 이미 있는 줄기 태그를 보여 주고 맞으면 그대로 쓰게 해요 — 안 그러면 "ukraine war" · "russia ukraine war" 처럼 글마다 줄기가 갈라져요
  const { results: known } = await env.DB.prepare(
    `SELECT t.key, COUNT(i.id) AS n FROM news_threads t LEFT JOIN news_items i ON i.thread_id = t.id
      WHERE t.key NOT LIKE 'user:%' AND t.updated_at > ? GROUP BY t.id ORDER BY n DESC, t.updated_at DESC LIMIT 60`
  ).bind(Date.now() - 21 * 864e5).all();
  const keys = (known || []).map((k) => k.key);
  let done = 0;
  const failed = [];

  await inBatches(todo, SUM_AT_ONCE, async (t) => {
    try {
      const text = `${t.title} ${t.raw || ""}`.slice(0, 4000);
      const { data } = await aiJson(
        env,
        RULES,
        `다음 글을 **한 문장**으로 요약하고, 지도와 줄기 표시용 태그를 붙여 줘.

규칙을 꼭 지켜:
- **35~50자.** 공백 포함, 절대 55자를 넘기지 마. 목록에 두 줄로 들어가야 해서 넘기면 잘려. 한 가지 사실만.
- 끝은 "~했다 / ~한다" 체로 통일해.
- 고유명사에 **원어를 괄호로 병기하지 마.** 한국어 이름만 써.
- 제목을 되풀이하지 마. 제목에 없는 **알맹이**를 담아.
- 직함·기관 전체 이름 대신 짧게. ("우크라이나 외무장관" → "우크라 외무장관")
- geo: 이 글의 무대가 되는 나라 ISO 3166-1 alpha-2 코드 1~3개 (예: "US","CN","TW"). 특정 나라가 없으면 빈 배열.
- tag: 이 글이 속한 **지속되는 이야기**를 2~4단어 영어 소문자로 (예: "us china chip controls", "ukraine war", "ai regulation eu"). 너무 구체적이면 안 돼 — 몇 주 동안 같은 태그로 이어질 이야기여야 해.
  아래 기존 태그 중 **바로 그 이야기**(같은 사건 · 같은 갈등의 다음 장)가 있으면 그 태그를 글자 그대로 써.
  분야만 비슷하면 묶지 마 (예: 라트비아 주류 파산은 "semiconductor industry trends" 가 아니야, 북아일랜드 정국은 "ukraine war" 가 아니야). 맞는 게 없으면 새 태그.
  기존 태그: ${keys.length ? keys.join(" | ") : "(없음)"}
- geo 는 실제 나라 코드만 (EU 같은 기구는 그 본부 나라 대신 빈칸 말고 "BE"). 같은 코드를 두 번 쓰지 마.
- tag_ko: tag 의 한국어 제목 (12자 이내).

출처: ${t.feed}
제목: ${t.title}

${String(t.raw || "").slice(0, 6000)}

{"one":"55자 이내 한 문장","geo":["US"],"tag":"...","tag_ko":"..."} 형식으로만 답해.`,
        () => ({ one: `${t.title}`.slice(0, 55), geo: guessGeo(text), tag: fakeTag(text, t.topic), tag_ko: "" })
      );
      let one = String(data?.one || "").trim().slice(0, 140);
      if (one.length > 58) { // 길면 한 번만 줄여 달라고 해요
        const r2 = await aiJson(env, RULES, `다음 문장을 뜻은 그대로 두고 45자 이내로 줄여 줘. "~했다" 체.\n${one}\n{"one":"..."} 형식으로만 답해.`).catch(() => null);
        const short = String(r2?.data?.one || "").trim();
        if (short && short.length < one.length) one = short.slice(0, 140);
      }
      if (!one) throw new Error("빈 요약");
      let geo = [...new Set((Array.isArray(data?.geo) ? data.geo : []).map((c) => String(c).toUpperCase().trim()).map((c) => (c === "EU" ? "BE" : c === "UK" ? "GB" : c)).filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 3);
      if (!geo.length) geo = guessGeo(text);
      await env.DB.prepare("UPDATE news_items SET one_liner = ?, geo = ? WHERE id = ?").bind(one, JSON.stringify(geo), t.id).run();
      await attachThread(env, { id: t.id, text: `${t.title} ${one}` }, data?.tag, data?.tag_ko);
      const k = normTag(data?.tag); if (k && !keys.includes(k)) keys.push(k);
      done += 1;
    } catch (e) {
      failed.push(`${t.title.slice(0, 30)}: ${String(e?.message || e).slice(0, 60)}`);
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
    () => ({ summary: [String(item.title)], why: "배경: 시험용 요약이에요.", numbers: [] })
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
    () => ({ headline: "오늘의 흐름", body: "시험용 브리핑이에요." })
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
    () => ({ title: thread.title, story: `기사 ${items.length}편이 이어진 이야기예요. 다음에 볼 것: 시험용이에요.` })
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
    ] })
  );
  const points = (Array.isArray(data?.points) ? data.points : []).slice(0, 3)
    .map((p) => ({ claim: String(p?.claim || "").trim(), evidence: String(p?.evidence || "").trim() })).filter((p) => p.claim);
  if (!points.length) throw new Error("AI 가 반론을 만들지 못했어요.");
  return points.map((p, i) => `${i + 1}. ${p.claim}${p.evidence ? `\n> ${p.evidence}` : ""}`).join("\n").slice(0, 2000);
}

async function talkOf(env, itemId) {
  const { results } = await env.DB.prepare(`SELECT c.*, u.display_name FROM news_comments c JOIN users u ON u.id = c.user_id
      WHERE c.item_id = ? ORDER BY c.created_at ASC`).bind(itemId).all();
  return results || [];
}

export function registerNewsSignal(on, { json, body, fail, now }) {
  const day = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  const ITEM_COLS = "i.id, i.title, i.url, i.one_liner, i.published_at, i.dated, i.geo, i.thread_id, f.name AS feed, f.topic";

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
  on("GET", "/news/item/:id/talk", async ({ env, params }) => json({ comments: await talkOf(env, params.id) }));

  // [POST /news/item/:id/comments] { body, stance, parent_id? } — 맨 위는 메모, 답글은 반박/동의, 2단까지
  on("POST", "/news/item/:id/comments", async ({ env, ec, req, params, user }) => {
    const b = await body(req);
    const text = String(b.body || "").trim().slice(0, 2000);
    if (!text) fail(400, "내용을 써 주세요.");
    const item = await env.DB.prepare("SELECT id FROM news_items WHERE id = ?").bind(params.id).first();
    if (!item) fail(404, "그 글이 없어요.");
    let parent = null, stance = "memo";
    if (b.parent_id) {
      parent = await env.DB.prepare("SELECT id, user_id, parent_id FROM news_comments WHERE id = ? AND item_id = ?").bind(String(b.parent_id), params.id).first();
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
    const memo = await env.DB.prepare("SELECT * FROM news_comments WHERE id = ?").bind(params.id).first();
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
       WHERE m.user_id = ? AND c.user_id <> ? AND c.stance <> 'memo' AND c.created_at > ? ORDER BY c.created_at DESC LIMIT 20`)
      .bind(user.id, user.id, seen).all();
    return json({ n: (results || []).length, last: results?.[0] || null });
  });
  on("PUT", "/news/inbox/seen", async ({ env, user }) => {
    await env.DB.prepare("INSERT INTO news_inbox_seen (user_id, at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET at = excluded.at").bind(user.id, now()).run();
    return json({ ok: true });
  });
}

// ---------- 크론 ----------

/** 한 시간마다: **글만** 긁어 와요. AI 를 안 써서 토큰이 0이에요. 속보용이에요. */
export async function newsPulse(env) {
  const pulled = await ingest(env);
  return { added: pulled.reduce((n, p) => n + p.added, 0) };
}

/** 아침 8시: 모으고, 요약을 채우고, 오늘의 브리핑을 만들어요. */
export async function newsCron(env, day) {
  const pulled = await ingest(env);
  const added = pulled.reduce((n, p) => n + p.added, 0);

  // 한 번에 다 요약하면 공급사 한도에 걸려요. 나눠서 채워요.
  let summed = 0;
  for (let i = 0; i < 4; i += 1) {
    const r = await summarize(env, 25);
    summed += r.done;
    if (!r.done) break;
  }

  let head = null;
  try {
    const b = await brief(env, day, true);
    head = b?.headline || null;
  } catch (e) {
    console.log("브리핑 실패", String(e?.message || e));
  }

  const broken = pulled.filter((p) => p.error).length;
  const dying = pulled.filter((p) => p.staleDays).map((p) => p.feed);
  return { added, summed, broken, dying, head };
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
      `SELECT i.id, i.title, i.url, i.one_liner, i.published_at, i.dated, i.geo, i.thread_id, f.name AS feed, f.topic,
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
        WHERE r.item_id = ? AND r.note IS NOT NULL AND r.note <> ''
        ORDER BY r.updated_at DESC`
    ).bind(params.id).all();

    const mine = await env.DB.prepare(
      "SELECT read, saved, flagged, note FROM news_reads WHERE item_id = ? AND user_id = ?"
    ).bind(params.id, user.id).first();

    const [marked] = await decorate(env, [{ id: item.id, geo: item.geo }]);
    return json({
      item: {
        id: item.id, title: item.title, url: item.url, author: item.author,
        published_at: item.published_at, one_liner: item.one_liner,
        feed: item.feed, topic: item.topic, thread_id: item.thread_id, dated: item.dated,
        geo: marked.geo, readers: marked.readers, stars: marked.stars,
      },
      comments: await talkOf(env, item.id),
      thread: item.thread_id ? await env.DB.prepare("SELECT id, title FROM news_threads WHERE id = ?").bind(item.thread_id).first() : null,
      deep,
      excerpt: String(item.raw || "").slice(0, 700),
      mine: mine || { read: 0, saved: 0, flagged: 0, note: null },
      notes: notes || [],
    });
  });

  // 3-1. [POST /news/item/:id/deep] 깊은 요약을 만들어요. 화면이 글을 연 뒤에 따로 불러요.
  on("POST", "/news/item/:id/deep", async ({ env, params }) => {
    const item = await env.DB.prepare("SELECT * FROM news_items WHERE id = ?").bind(params.id).first();
    if (!item) fail(404, "그 글이 없어요.");
    try {
      return json({ deep: await deepen(env, item) });
    } catch (e) {
      return json({ deep: null, error: String(e?.message || e).slice(0, 200) });
    }
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
      `SELECT i.id, i.title, i.url, i.one_liner, i.published_at, f.name AS feed, f.topic,
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
  on("POST", "/news/refresh", async ({ env }) => {
    const pulled = await ingest(env);
    const sum = await summarize(env, 20);
    // 오늘 브리핑이 없으면 여기서 만들어요 (아침 크론 전에 새로고침해도 브리핑 줄이 비지 않게)
    const today = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
    let briefed = false;
    try { if (!(await env.DB.prepare("SELECT 1 FROM news_briefs WHERE day = ?").bind(today).first())) briefed = !!(await brief(env, today)); }
    catch (e) { console.log("브리핑 실패", String(e?.message || e)); }
    return json({
      briefed,
      added: pulled.reduce((n, p) => n + p.added, 0),
      summarized: sum.done,
      broken: pulled.filter((p) => p.error).map((p) => ({ feed: p.feed, error: p.error })),
      dying: pulled.filter((p) => p.staleDays).map((p) => ({ feed: p.feed, days: p.staleDays })),
    });
  });

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

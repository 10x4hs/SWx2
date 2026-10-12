// 공통 창고: 책 · 링크 · 영상을 셋이 나눠요. 항목마다 멤버별 표시(읽을래요·읽는 중·다 읽었어요)와 공개 한 줄 메모.
//   POST /library/preview { url?, title?, kind? }  저장 없이 메타데이터만 (유튜브 oEmbed · og 태그 · Google Books)
//   GET  /library?kind=&q=                        목록 (최신순) + marks + my
//   POST /library { kind, url?, title, ... , note?, share?, room? }  넣기 (같은 URL 이면 409). share 가 true 면 room(기본 'all')에 알림, 방 아이디 문자열이어도 됨
//   PUT  /library/:id/mark { state|null, note? }  내 표시 · 메모
//   POST /library/:id/share { room? }             방에 share 메시지 (기본 'all', dm 방도 됨)
//   DELETE /library/:id                           넣은 사람만
import { postRoomMessage, checkRoom } from "./room.js";

const KINDS = new Set(["book", "link", "video"]);
const STATES = new Set(["todo", "doing", "done"]);
const FETCH_TIMEOUT = 3000;
const MAX_HTML = 200 * 1024;
const MAX_URL = 2000;
const LIST_LIMIT = 500;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

// ---------- URL 안전 검사 ----------
// Workers 는 DNS 를 못 풀어서 호스트 이름 문자열로만 사설 주소를 막아요 (localhost · 127.x · 10.x · 192.168.x · 172.16~31.x · ::1 · .internal)
function privateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "0.0.0.0" || (h.includes(":") && /^(fe80|fc|fd)/.test(h))) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}
// http(s) 만, 사설 주소 아님. 아니면 null
export function safeUrl(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > MAX_URL) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || privateHost(u.hostname)) return null;
  u.hash = "";
  return u;
}

async function fetchTimeout(url, init = {}, ms = FETCH_TIMEOUT) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { redirect: "follow", ...init, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

// 몸통 앞 부분만 읽고 끊어요 (큰 페이지 방어)
async function readHead(res, max = MAX_HTML) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const dec = new TextDecoder();
  let out = "", got = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    got += value.byteLength;
    out += dec.decode(value, { stream: true });
    if (got >= max) { try { await reader.cancel(); } catch {} break; }
  }
  return out;
}

// ---------- HTML 메타 ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = (s) => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const clean = (s, max) => decodeEntities(s).replace(/\s+/g, " ").trim().slice(0, max) || null;

// <meta property="og:x" content="..."> — 속성 순서가 어느 쪽이어도 찾아요
function meta(html, prop) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const p = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!p || p[1].toLowerCase() !== prop) continue;
    const c = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (c) return c[1];
  }
  return null;
}
export function parseHtmlMeta(html, base) {
  const head = html.slice(0, MAX_HTML);
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  let thumb = clean(meta(head, "og:image") || meta(head, "twitter:image") || "", MAX_URL);
  if (thumb) { try { thumb = new URL(thumb, base).href; } catch { thumb = null; } }
  return {
    title: clean(meta(head, "og:title") || (t && t[1]) || "", 200),
    thumb: thumb && thumb.startsWith("https://") ? thumb : null,
    description: clean(meta(head, "og:description") || meta(head, "description") || "", 1000),
    site_name: clean(meta(head, "og:site_name") || "", 100),
  };
}

// ---------- 유튜브 ----------
export function youtubeId(u) {
  if (!YT_HOSTS.has(u.hostname.toLowerCase())) return null;
  let id = null;
  if (u.hostname.endsWith("youtu.be")) id = u.pathname.slice(1).split("/")[0];
  else if (u.pathname === "/watch") id = u.searchParams.get("v");
  else { const m = /^\/(?:shorts|embed|live|v)\/([^/?]+)/.exec(u.pathname); if (m) id = m[1]; }
  return id && YT_ID.test(id) ? id : null;
}
const ytUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

async function previewYoutube(id) {
  const out = { kind: "video", url: ytUrl(id), video_id: id, thumb: ytThumb(id), title: null, author: null, description: null, isbn: null };
  try {
    const res = await fetchTimeout(`https://www.youtube.com/oembed?url=${encodeURIComponent(out.url)}&format=json`);
    if (!res.ok) throw new Error("oEmbed " + res.status);
    const j = await res.json();
    out.title = clean(j.title || "", 200);
    out.author = clean(j.author_name || "", 500);
  } catch (e) { out.warning = "유튜브 정보를 못 가져왔어요. 제목을 직접 적어 주세요."; }
  return out;
}

async function previewPage(u) {
  const out = { kind: "link", url: u.href, title: null, author: null, thumb: null, description: null, isbn: null, video_id: null };
  try {
    const res = await fetchTimeout(u.href, { headers: { accept: "text/html,*/*;q=0.5", "user-agent": "Mozilla/5.0 (compatible; dsm-mafia-preview)" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const type = res.headers.get("content-type") || "";
    if (!/html|xml|text\//i.test(type)) { out.title = u.hostname; out.warning = "웹 페이지가 아니라서 제목만 주소로 채웠어요."; return out; }
    const m = parseHtmlMeta(await readHead(res), res.url || u.href);
    out.title = m.title; out.thumb = m.thumb; out.description = m.description; out.author = m.site_name;
    if (!out.title) { out.title = u.hostname; out.warning = "페이지 제목을 못 찾아서 주소로 채웠어요."; }
  } catch (e) {
    out.title = u.hostname;
    out.warning = e.name === "AbortError" ? "페이지가 3초 안에 답하지 않았어요. 제목을 직접 적어 주세요." : "페이지 정보를 못 가져왔어요. 제목을 직접 적어 주세요.";
  }
  return out;
}

// ---------- 책 검색 (키 없음) ----------
// Google Books 먼저 (익명 공용 한도가 자주 바닥나요 → GOOGLE_BOOKS_KEY 가 있으면 붙임), 안 되면 Open Library
const bookCandidate = (c) => ({ title: clean(c.title || "", 200), author: clean(c.author || "", 500), thumb: c.thumb || null, isbn: c.isbn || null, description: clean(c.description || "", 1000) });
async function googleBooks(env, title) {
  const key = env.GOOGLE_BOOKS_KEY ? `&key=${encodeURIComponent(env.GOOGLE_BOOKS_KEY)}` : "";
  const res = await fetchTimeout(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent("intitle:" + title)}&maxResults=3&langRestrict=ko${key}`, {}, 4000);
  if (!res.ok) throw new Error("Books " + res.status);
  const j = await res.json();
  return (j.items || []).map((it) => {
    const v = it.volumeInfo || {}, ids = v.industryIdentifiers || [];
    return bookCandidate({
      title: v.title, author: (v.authors || []).join(", "), description: v.description,
      isbn: ids.find((x) => x.type === "ISBN_13")?.identifier || ids.find((x) => x.type === "ISBN_10")?.identifier,
      thumb: (v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || "").replace(/^http:/, "https:"),
    });
  });
}
async function openLibrary(title) {
  const res = await fetchTimeout(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=3&fields=title,author_name,cover_i,isbn,first_sentence`, {}, 4000);
  if (!res.ok) throw new Error("OpenLibrary " + res.status);
  const j = await res.json();
  return (j.docs || []).map((d) => bookCandidate({
    title: d.title, author: (d.author_name || []).join(", "),
    thumb: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    isbn: (d.isbn || []).find((x) => x.length === 13) || (d.isbn || [])[0],
    description: Array.isArray(d.first_sentence) ? d.first_sentence[0] : d.first_sentence,
  }));
}
async function previewBook(env, title) {
  const out = { kind: "book", url: null, title, author: null, thumb: null, description: null, isbn: null, video_id: null, candidates: [] };
  let failed = 0;
  for (const search of [() => googleBooks(env, title), () => openLibrary(title)]) {
    try { out.candidates = (await search()).filter((c) => c.title); if (out.candidates.length) break; }
    catch { failed++; }
  }
  if (out.candidates.length) Object.assign(out, out.candidates[0], { title: out.candidates[0].title });
  else out.warning = failed === 2 ? "책 검색이 지금 안 돼요. 제목만으로 저장할 수 있어요." : "책을 못 찾았어요. 제목만으로 저장할 수 있어요.";
  return out;
}

// ---------- 라우트 ----------
export function registerLibrary(on, { json, body, fail, uid, now }) {
  const optStr = (v, max, name) => {
    if (v == null || v === "") return null;
    if (typeof v !== "string") fail(400, `${name} 형식이 올바르지 않아요.`);
    const s = v.trim();
    if (s.length > max) fail(400, `${name}은(는) ${max}자까지 쓸 수 있어요.`);
    return s || null;
  };
  const withMarks = async (env, items, me) => {
    if (!items.length) return [];
    const ids = items.map((i) => i.id);
    const { results } = await env.DB.prepare(`SELECT item_id, user_id, state, note FROM library_marks WHERE item_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    return joinMarks(items, results, me);
  };
  const joinMarks = (items, results, me) => {
    const by = new Map();
    for (const m of results) (by.get(m.item_id) || by.set(m.item_id, []).get(m.item_id)).push({ user_id: m.user_id, state: m.state, note: m.note });
    return items.map((it) => {
      const marks = by.get(it.id) || [];
      const mine = marks.find((m) => m.user_id === me);
      return { ...it, marks, my: mine ? { state: mine.state, note: mine.note } : null };
    });
  };
  const getItem = async (env, id) => {
    const it = await env.DB.prepare("SELECT * FROM library_items WHERE id = ?").bind(id).first();
    if (!it) fail(404, "창고에 그런 항목이 없어요.");
    return it;
  };
  const shareMsg = (env, user, item, room) => postRoomMessage(env, { id: uid(), room, user_id: user.id, kind: "share", body: item.title, ref_id: item.id, reply_to: null, created_at: now() });
  // share: true → room(기본 'all') · share: 'dm:...' → 그 방 · 아니면 null. 들어갈 수 없는 방이면 403
  const shareRoom = (b, user) => (b.share === true ? checkRoom(b.room, user, fail) : typeof b.share === "string" && b.share ? checkRoom(b.share, user, fail) : null);
  const optBody = async (req) => { try { return (await req.json()) || {}; } catch { return {}; } };

  // 저장 없이 메타데이터만. 바깥 서비스가 죽어도 200 + warning
  on("POST", "/library/preview", async ({ req, env }) => {
    const b = await body(req);
    const rawUrl = typeof b.url === "string" ? b.url.trim() : "";
    const title = optStr(b.title, 200, "제목");
    if (rawUrl) {
      const u = safeUrl(rawUrl);
      if (!u) fail(400, "http(s) 주소만 넣을 수 있어요.");
      const yt = youtubeId(u);
      const out = yt ? await previewYoutube(yt) : await previewPage(u);
      if (title && (!out.title || out.title === u.hostname)) { out.title = title; delete out.warning; }
      return json(out);
    }
    if (!title) fail(400, "주소나 제목 중 하나는 넣어 주세요.");
    if (b.kind && b.kind !== "book" && KINDS.has(b.kind)) return json({ kind: b.kind, url: null, title, author: null, thumb: null, description: null, isbn: null, video_id: null });
    return json(await previewBook(env, title));
  });

  on("GET", "/library", async ({ env, q, user }) => {
    const kind = q.get("kind") || "";
    const text = (q.get("q") || "").trim().slice(0, 100);
    if (kind && !KINDS.has(kind)) fail(400, "종류는 book · link · video 중 하나예요.");
    const where = [], args = [];
    if (kind) { where.push("kind = ?"); args.push(kind); }
    if (text) { const like = "%" + text.replace(/[%_\\]/g, "\\$&") + "%"; where.push("(title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"); args.push(like, like, like); }
    // 항목 + 그 항목들의 표시를 왕복 한 번에 (같은 목록 쿼리를 하위 쿼리로)
    const list = `SELECT * FROM library_items ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ?`;
    const [items, marks] = await env.DB.batch([
      env.DB.prepare(list).bind(...args, LIST_LIMIT),
      env.DB.prepare(`SELECT item_id, user_id, state, note FROM library_marks WHERE item_id IN (SELECT id FROM (${list}))`).bind(...args, LIST_LIMIT),
    ]);
    return json({ items: joinMarks(items.results, marks.results, user.id) });
  });

  on("POST", "/library", async ({ req, env, user }) => {
    const b = await body(req);
    if (!KINDS.has(b.kind)) fail(400, "종류는 book · link · video 중 하나예요.");
    const room = shareRoom(b, user);   // 방 검사는 저장 전에 (403 이면 아무것도 안 넣어요)
    if (typeof b.title !== "string" || !b.title.trim()) fail(400, "제목을 입력해 주세요.");
    const title = b.title.trim();
    if (title.length > 200) fail(400, "제목은 200자까지 쓸 수 있어요.");
    let url = null, video_id = null;
    if (b.url != null && b.url !== "") {
      const u = safeUrl(b.url);
      if (!u) fail(400, "http(s) 주소만 넣을 수 있어요. (2000자까지)");
      video_id = youtubeId(u);
      url = video_id ? ytUrl(video_id) : u.href;   // 유튜브는 같은 영상이면 같은 주소로
    }
    let thumb = optStr(b.thumb, MAX_URL, "썸네일");
    if (thumb && !/^https:\/\//i.test(thumb)) fail(400, "썸네일은 https 주소만 쓸 수 있어요.");
    if (!thumb && video_id) thumb = ytThumb(video_id);   // 유튜브는 썸네일을 몰라도 채워요
    const item = {
      id: uid(), kind: b.kind, url, title,
      author: optStr(b.author, 500, "저자"), thumb,
      description: optStr(b.description, 1000, "설명"),
      isbn: optStr(b.isbn, 32, "ISBN"),
      video_id: video_id || (b.kind === "video" ? optStr(b.video_id, 32, "영상 ID") : null),
      added_by: user.id, created_at: now(),
    };
    if (url) {
      const dup = await env.DB.prepare("SELECT * FROM library_items WHERE url = ?").bind(url).first();
      if (dup) return json({ error: "이미 창고에 있는 주소예요.", item: (await withMarks(env, [dup], user.id))[0] }, 409);
    }
    await env.DB.prepare(
      "INSERT INTO library_items (id, kind, url, title, author, thumb, description, isbn, video_id, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(item.id, item.kind, item.url, item.title, item.author, item.thumb, item.description, item.isbn, item.video_id, item.added_by, item.created_at).run();
    const note = optStr(b.note, 200, "메모");
    if (note) await env.DB.prepare("INSERT INTO library_marks (item_id, user_id, state, note, updated_at) VALUES (?, ?, NULL, ?, ?)").bind(item.id, user.id, note, now()).run();
    const out = { item: (await withMarks(env, [item], user.id))[0] };
    if (room) out.message = await shareMsg(env, user, item, room);
    return json(out, 201);
  });

  // state 가 null 이고 메모도 없으면 표시를 지워요. 메모만 남기는 것도 돼요 (state null + note)
  on("PUT", "/library/:id/mark", async ({ req, env, params, user }) => {
    const b = await body(req);
    const item = await getItem(env, params.id);
    const state = b.state == null ? null : b.state;
    if (state !== null && !STATES.has(state)) fail(400, "표시는 todo · doing · done 중 하나예요.");
    const note = optStr(b.note, 200, "메모");
    if (state === null && !note) {
      await env.DB.prepare("DELETE FROM library_marks WHERE item_id = ? AND user_id = ?").bind(item.id, user.id).run();
      return json({ mark: null });
    }
    const t = now();
    await env.DB.prepare(
      "INSERT INTO library_marks (item_id, user_id, state, note, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(item_id, user_id) DO UPDATE SET state = excluded.state, note = CASE WHEN ? THEN excluded.note ELSE library_marks.note END, updated_at = excluded.updated_at"
    ).bind(item.id, user.id, state, note, t, b.note === undefined ? 0 : 1).run();
    const row = await env.DB.prepare("SELECT user_id, state, note, updated_at FROM library_marks WHERE item_id = ? AND user_id = ?").bind(item.id, user.id).first();
    return json({ mark: row });
  });

  on("POST", "/library/:id/share", async ({ req, env, params, user }) => {
    const b = await optBody(req);
    const room = checkRoom(b.room, user, fail);
    const item = await getItem(env, params.id);
    const message = await shareMsg(env, user, item, room);
    return json({ message: { ...message, item: { id: item.id, kind: item.kind, title: item.title, thumb: item.thumb, url: item.url, video_id: item.video_id } } }, 201);
  });

  on("DELETE", "/library/:id", async ({ env, params, user }) => {
    const item = await getItem(env, params.id);
    if (item.added_by !== user.id) fail(403, "내가 넣은 항목만 지울 수 있어요.");
    await env.DB.prepare("DELETE FROM library_items WHERE id = ?").bind(item.id).run();
    return json({ ok: true });
  });
}

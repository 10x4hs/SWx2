// 일기: 하루 한 편. 기본은 본인만.
// '일기 친구' = 아이디로 초대하고 상대가 수락한 두 사람(diary_links). 둘 다 일기를 쓸 수 있을 때(관리자 · 무료체험 · 일기 기능 · 예전 모임)
// 공개(shared = 1)한 날의 일기를 서로 읽어요 — 팀이 같아도 초대 · 수락이 없으면 못 봐요 (쓰기는 늘 자기 일기만).
// 비공개 날은 상대에게 날짜와 비공개 표시만 — 기분 · 글은 서버에서 아예 보내지 않아요. 모임 밖 사람은 모임 API 를 못 써요(403).
import { fail, json, body, now, uid, DAY_RE, dayParam, yearParam } from "./http.js";
import { blocksToMd, validateDoc } from "../public/js/blocks/md.js";
import { pushUsers } from "./push.js";

const NOT_CIRCLE = "일기를 함께 보는 사람만 열 수 있어요.";
const MAX_WAIT = 20; // 수락을 기다리는 보낸 초대는 20개까지
// 일기를 쓸 수 있는 사람 (SQL · 자리표시자 ?now 대신 지금 시각을 숫자로 넣어요)
const DIARY_OK = (a) => `(${a}.role = 'admin' OR ${a}.diary_circle = 1 OR ${a}.trial_until > ${Date.now()} OR EXISTS (SELECT 1 FROM user_features f WHERE f.user_id = ${a}.id AND f.feature = 'diary'))`;
const canDiary = (u) => u.role === "admin" || u.diary_circle === 1 || (u.trial_until || 0) > Date.now() || (u.features || []).includes("diary");
const MAX_BLOCKS = 300000; // 블록 JSON 글자 수
const IMG_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const IMG_MAX = 6 * 1024 * 1024;
const IMG_KEY = /^diary-[0-9a-f-]{36}\.(?:jpg|png|webp|gif)$/;
// 블록 일기: 검사하고, 잔디 · 목록 · 검색이 쓰는 글(body)은 블록에서 만들어요
function readBlocks(v) {
  let doc;
  try { doc = validateDoc(typeof v === "string" ? JSON.parse(v) : v); } catch (e) { fail(400, e.message || "일기 블록이 올바르지 않아요."); }
  const text = JSON.stringify(doc);
  if (text.length > MAX_BLOCKS) fail(400, "일기가 너무 길어요.");
  return { text, md: blocksToMd(doc).trim(), empty: !doc.blocks.some((b) => b.text?.trim() || b.type !== "paragraph" || b.children?.length) };
}
// 두 사람 사이 줄 (작은 id 가 a)
const pair = (x, y) => (x < y ? [x, y] : [y, x]);
// 누구의 일기를 볼지: 나는 늘, 다른 사람은 서로 수락한 일기 친구이고 그 사람도 일기를 쓸 수 있을 때만
async function peer(env, user, id) {
  if (!canDiary(user)) fail(403, NOT_CIRCLE);
  if (!id || id === user.id) return { id: user.id, self: true };
  const [a, b] = pair(user.id, String(id));
  const u = await env.DB.prepare(`SELECT u.id FROM users u JOIN diary_links l ON l.a = ?2 AND l.b = ?3 AND l.state = 'accepted' WHERE u.id = ?1 AND u.state = 'active' AND ${DIARY_OK("u")}`).bind(id, a, b).first();
  if (!u) fail(403, NOT_CIRCLE);
  return { id: u.id, self: false };
}
// 남의 비공개 일기는 날짜만
const seen = (who, row) => (who.self || row.shared ? { ...row, shared: !!row.shared } : { day: row.day, private: true });

export function registerDiary(on) {
  on("GET", "/diary", async ({ env, q, user }) => {
    const day = q.get("day") || "";
    dayParam(day);
    const d = await env.DB.prepare("SELECT day, mood, body, blocks, shared, updated_at FROM diaries WHERE user_id = ? AND day = ?").bind(user.id, day).first();
    return json({ diary: d ? { ...d, shared: !!d.shared } : null });
  });

  // shared 를 안 보내면 새 일기는 비공개, 있던 일기는 그대로 (페이지 · MCP 로 쓴 일기가 실수로 열리지 않게)
  on("PUT", "/diary", async ({ req, env, user }) => {
    const b = await body(req);
    dayParam(b.day);
    const mood = b.mood == null ? null : Math.round(Number(b.mood));
    if (mood !== null && !(mood >= 1 && mood <= 5)) fail(400, "기분은 1~5 중에서 골라 주세요.");
    const blk = b.blocks == null ? null : readBlocks(b.blocks);
    const text = blk ? blk.md : typeof b.body === "string" ? b.body : "";
    if (text.length > 20000) fail(400, "일기가 너무 길어요.");
    const shared = b.shared == null ? null : b.shared ? 1 : 0;
    if ((blk ? blk.empty : !text.trim()) && mood === null) {
      await env.DB.prepare("DELETE FROM diaries WHERE user_id = ? AND day = ?").bind(user.id, b.day).run();
      return json({ diary: null });
    }
    const at = now();
    const row = await env.DB.prepare(
      "INSERT INTO diaries (user_id, day, mood, body, blocks, shared, updated_at) VALUES (?1, ?2, ?3, ?4, ?8, ?5, ?6) ON CONFLICT(user_id, day) DO UPDATE SET mood = excluded.mood, body = excluded.body, blocks = excluded.blocks, updated_at = excluded.updated_at, shared = CASE WHEN ?7 IS NULL THEN diaries.shared ELSE ?7 END RETURNING shared"
    ).bind(user.id, b.day, mood, text, shared ?? 0, at, shared, blk?.text ?? null).first();
    return json({ diary: { day: b.day, mood, body: text, blocks: blk?.text ?? null, shared: !!row?.shared, updated_at: at } });
  });

  // 잔디: 한 해 동안 일기를 쓴 날
  on("GET", "/diary/days", async ({ env, q, user }) => {
    const year = q.get("year") || "";
    yearParam(year);
    const { results } = await env.DB.prepare("SELECT day, mood, length(body) AS len, shared FROM diaries WHERE user_id = ? AND day LIKE ? ORDER BY day")
      .bind(user.id, year + "-%").all();
    return json({ days: results.map((r) => ({ ...r, shared: !!r.shared })) });
  });

  on("GET", "/diary/list", async ({ env, q, user }) => {
    const before = DAY_RE.test(q.get("before") || "") ? q.get("before") : "9999-12-31";
    const { results } = await env.DB.prepare(
      "SELECT day, mood, substr(body, 1, 200) AS snippet, length(body) AS len, shared, updated_at FROM diaries WHERE user_id = ? AND day < ? ORDER BY day DESC LIMIT 60"
    ).bind(user.id, before).all();
    return json({ entries: results.map((r) => ({ ...r, shared: !!r.shared })) });
  });

  // ---------- 일기 모임 (서로 보기) ----------
  // 나 + 서로 수락한 일기 친구(읽을 수 있는 사람) · 받은 초대 · 보낸 초대
  on("GET", "/diary/circle", async ({ env, user }) => {
    if (!canDiary(user)) fail(403, NOT_CIRCLE);
    const [fr, inc, out] = await env.DB.batch([
      env.DB.prepare(`SELECT u.id, u.username, u.display_name, u.color, l.inviter, l.accepted_at FROM users u JOIN diary_links l ON l.state = 'accepted' AND ((l.a = ?1 AND l.b = u.id) OR (l.b = ?1 AND l.a = u.id)) WHERE u.state = 'active' AND ${DIARY_OK("u")} ORDER BY u.username`).bind(user.id),
      env.DB.prepare("SELECT u.id, u.username, u.display_name, l.created_at AS at FROM diary_links l JOIN users u ON u.id = l.inviter WHERE l.state = 'pending' AND l.inviter != ?1 AND (l.a = ?1 OR l.b = ?1) ORDER BY l.created_at DESC").bind(user.id),
      env.DB.prepare("SELECT u.id, u.username, u.display_name FROM diary_links l JOIN users u ON u.id = (CASE WHEN l.a = ?1 THEN l.b ELSE l.a END) WHERE l.state = 'pending' AND l.inviter = ?1 ORDER BY l.created_at DESC").bind(user.id),
    ]);
    const me = { id: user.id, username: user.username, display_name: user.display_name, color: user.color };
    return json({ members: [me, ...fr.results], invites: { incoming: inc.results, outgoing: out.results } });
  });
  // 초대: 아이디로 (팀과 상관없이). 상대가 이미 나를 초대했으면 바로 이어져요. 상대에게 푸시 (서비스 워커가 /diary/circle 을 읽어 띄워요)
  //   locked = 상대가 아직 일기를 못 써요(기능이 잠김) → 초대는 남고, 열리면 상대 일기 화면에 보여요
  on("POST", "/diary/invite", async ({ req, env, user, ec }) => {
    if (!canDiary(user)) fail(403, NOT_CIRCLE);
    const b = await body(req), name = String(b.username || "").trim().toLowerCase();
    const t = name && (await env.DB.prepare(`SELECT u.id, u.username, ${DIARY_OK("u")} AS ok FROM users u WHERE u.username = ? AND u.state = 'active'`).bind(name).first());
    if (!t) fail(404, "그 아이디의 회원이 없어요.");
    if (t.id === user.id) fail(400, "나는 초대할 수 없어요.");
    const [a, bb] = pair(user.id, t.id), cur = await env.DB.prepare("SELECT inviter, state FROM diary_links WHERE a = ? AND b = ?").bind(a, bb).first();
    if (cur?.state === "accepted") fail(409, "이미 일기 친구예요.");
    if (cur && cur.inviter !== user.id) {
      await env.DB.prepare("UPDATE diary_links SET state = 'accepted', accepted_at = ? WHERE a = ? AND b = ?").bind(now(), a, bb).run();
      pushUsers(env, ec, [t.id], { room: "diary" });
      return json({ ok: true, accepted: true });
    }
    if (cur) return json({ ok: true, pending: true, locked: !t.ok });
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM diary_links WHERE inviter = ? AND state = 'pending'").bind(user.id).first();
    if (n.n >= MAX_WAIT) fail(429, `수락을 기다리는 초대가 ${MAX_WAIT}개예요. 보낸 초대를 몇 개 취소하고 다시 해 주세요.`);
    await env.DB.prepare("INSERT OR IGNORE INTO diary_links (a, b, inviter, state, created_at) VALUES (?, ?, ?, 'pending', ?)").bind(a, bb, user.id, now()).run(); // 둘이 동시에 초대하면 먼저 온 쪽만
    if (t.ok) pushUsers(env, ec, [t.id], { room: "diary" });
    return json({ ok: true, pending: true, locked: !t.ok }, 201);
  });
  // 받은 초대 수락 → 초대한 사람에게 푸시
  on("POST", "/diary/invite/:id/accept", async ({ env, user, params, ec }) => {
    if (!canDiary(user)) fail(403, NOT_CIRCLE);
    const [a, b] = pair(user.id, params.id);
    const r = await env.DB.prepare("UPDATE diary_links SET state = 'accepted', accepted_at = ? WHERE a = ? AND b = ? AND state = 'pending' AND inviter = ?").bind(now(), a, b, params.id).run();
    if (!r.meta.changes) fail(404, "받은 초대가 없어요.");
    pushUsers(env, ec, [params.id], { room: "diary" });
    return json({ ok: true });
  });
  // 끊기 · 거절 · 보낸 초대 취소 (둘 중 누구나)
  on("DELETE", "/diary/link/:id", async ({ env, user, params }) => {
    const [a, b] = pair(user.id, params.id);
    await env.DB.prepare("DELETE FROM diary_links WHERE a = ? AND b = ?").bind(a, b).run();
    return json({ ok: true });
  });

  // 모임 사람의 그날 일기 — 공개면 기분 · 글, 비공개면 { day, private: true }, 안 썼으면 null
  on("GET", "/diary/of", async ({ env, q, user }) => {
    const day = q.get("day") || "";
    dayParam(day);
    const who = await peer(env, user, q.get("user"));
    const d = await env.DB.prepare("SELECT day, mood, body, blocks, shared, updated_at FROM diaries WHERE user_id = ? AND day = ?").bind(who.id, day).first();
    return json({ diary: d ? seen(who, d) : null });
  });

  on("GET", "/diary/of/days", async ({ env, q, user }) => {
    const year = q.get("year") || "";
    yearParam(year);
    const who = await peer(env, user, q.get("user"));
    const { results } = await env.DB.prepare("SELECT day, mood, length(body) AS len, shared FROM diaries WHERE user_id = ? AND day LIKE ? ORDER BY day")
      .bind(who.id, year + "-%").all();
    return json({ days: results.map((r) => seen(who, r)) });
  });

  on("GET", "/diary/of/list", async ({ env, q, user }) => {
    const before = DAY_RE.test(q.get("before") || "") ? q.get("before") : "9999-12-31";
    const who = await peer(env, user, q.get("user"));
    const { results } = await env.DB.prepare(
      "SELECT day, mood, substr(body, 1, 200) AS snippet, length(body) AS len, shared, updated_at FROM diaries WHERE user_id = ? AND day < ? ORDER BY day DESC LIMIT 60"
    ).bind(who.id, before).all();
    return json({ entries: results.map((r) => seen(who, r)) });
  });

  // ---------- 일기 사진 (R2 FILES, 키 diary-<uuid>.<ext>, 주인은 메타데이터) ----------
  // 주인은 늘 · 일기 모임 상대는 '공개한 일기에 들어 있는 사진'만 · 그 밖에는 아무도 (노트 사진 /files 와 따로)
  on("POST", "/diary/img", async ({ req, env, user }) => {
    const type = (req.headers.get("content-type") || "").split(";")[0].trim();
    const ext = IMG_TYPES[type];
    if (!ext) fail(400, "jpg · png · webp · gif 이미지만 올릴 수 있어요.");
    if (!env.FILES) fail(500, "사진 저장소가 없어요.");
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) fail(400, "빈 파일이에요.");
    if (buf.byteLength > IMG_MAX) fail(400, "사진이 너무 커요 (6MB 까지).");
    const key = `diary-${uid()}.${ext}`;
    await env.FILES.put(key, buf, { httpMetadata: { contentType: type }, customMetadata: { owner: user.id } });
    return json({ src: "/api/diary/img/" + key }, 201);
  });

  on("GET", "/diary/img/:key", async ({ env, user, params }) => {
    const key = decodeURIComponent(params.key);
    if (!IMG_KEY.test(key) || !env.FILES) fail(404, "없는 사진이에요.");
    const obj = await env.FILES.get(key);
    if (!obj) fail(404, "없는 사진이에요.");
    const owner = obj.customMetadata?.owner;
    if (owner !== user.id) {
      await peer(env, user, owner); // 둘 다 일기 모임이 아니면 403
      const hit = await env.DB.prepare("SELECT 1 FROM diaries WHERE user_id = ? AND shared = 1 AND instr(blocks, ?) > 0 LIMIT 1").bind(owner, "/api/diary/img/" + key).first();
      if (!hit) fail(403, "비공개 일기의 사진이에요.");
    }
    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);
    h.set("cache-control", "private, no-store"); // 공개 → 비공개로 바뀌면 바로 못 보게
    h.set("x-content-type-options", "nosniff");
    return new Response(obj.body, { headers: h });
  });
}

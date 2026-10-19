// 대화방: 셋이 같이 쓰는 방 'all' 하나 + 둘만의 1:1 방 'dm:<uidA>:<uidB>' (아이디 정렬) + 이름을 부르면 끼어드는 AI.
//   GET  /room?room=&since=&limit=   메시지 (since 뒤 것만) + ai_name + unread + now
//   POST /room { room?, body, reply_to? }  내 메시지 저장 → AI 이름/@ai 를 불렀으면 AI 답도 같이
//   POST /room/ai { message_id }     AI 답 다시 시도 (사람마다 30초에 한 번)
//   DELETE /room/:id                 내 것만
//   PUT  /room/read { room?, at? }   여기까지 읽음 · GET /room/unread?room= → { unread, rooms:{...} }
//   GET/PUT /room/settings { ai_name }  AI 이름 (방 공통, 2~12자) → 'all' 에 system 메시지
// 방 권한: 팀 방('all' = 첫 팀 SWx2, 'team:<id>')은 그 팀 사람만, dm 방은 같은 팀인 두 사람만 (아니면 403). room 을 안 주면 'all'.
// AI는 그 방의 최근 40개 메시지와 창고 목록만 봐요. 개인 노트·일기·계획은 절대 안 보내요.
import { pushUsers } from "./push.js";
import { hubNotify, hubConnect } from "./hub.js";
import { TEXT_ORDER } from "./ai.js";
import { runAgent } from "./agent.js";
import { PEERS, isPeer, inTeam, roomTeam, teamMemberIds } from "./teams.js";

const AI_ORDER = TEXT_ORDER;   // Groq → Gemini → Cohere → MiMo → Zhipu → OpenRouter → Kilo
const AI_TIMEOUT = 45e3;      // AI 답 기다리는 최대 시간 (웹 검색 · 페이지 읽기를 하면 조금 더 걸려요)
const RETRY_GAP = 30e3;       // 다시 시도는 사람마다 30초에 한 번
const CONTEXT_MSGS = 40;      // AI가 보는 최근 메시지 수
const CONTEXT_ITEMS = 80;     // AI가 보는 창고 항목 수
const MAX_BODY = 2000;
const DEFAULT_LIMIT = 50, MAX_LIMIT = 200;
export const ALL = "all";
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const DM_RE = new RegExp(`^dm:(${UUID}):(${UUID})$`);
const TEAM_RE = /^team:[A-Za-z0-9-]{1,64}$/;
// 관리자 문의방: 'help:<회원 id>' — 그 회원과 관리자 모두(HSK · GYK)가 같이 봐요. 팀이 달라도 돼요
export const HELP_RE = new RegExp(`^help:(${UUID})$`);
export const helpRoom = (userId) => "help:" + userId;
const adminIds = async (env) => (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' AND state = 'active'").all()).results.map((r) => r.id);

const AT_AI_RE = /@ai(?![a-z0-9])/i;
// 이름을 불렀나: 한글은 단어 경계가 없어서 이름 문자열이 들어 있으면 부른 것으로 봐요 (대소문자 무시). '@ai' 도 됨
export const mentionsAi = (text, name) => {
  const t = String(text || "").toLowerCase();
  return AT_AI_RE.test(t) || (!!name && t.includes(name.toLowerCase()));
};

// 두 사람의 1:1 방 아이디 (순서 상관없이 같은 값)
export const dmRoom = (a, b) => (a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`);

// 방 아이디 검사 + 내가 들어갈 수 있는 방인지. 'all' 이거나 내 아이디가 든 dm 방만. 아니면 throw (fail)
export function checkRoom(room, user, fail) {
  if (room == null || room === "") return ALL;
  if (typeof room !== "string") fail(400, "방 아이디가 올바르지 않아요.");
  if (room === ALL || TEAM_RE.test(room) || HELP_RE.test(room)) return room;
  const m = DM_RE.exec(room);
  if (!m) fail(400, "방 아이디가 올바르지 않아요.");
  const [a, b] = [m[1], m[2]];
  if (a === b || a > b) fail(400, "1:1 방 아이디는 두 아이디를 정렬한 'dm:<작은 것>:<큰 것>' 이에요.");
  if (a !== user.id && b !== user.id) fail(403, "들어갈 수 없는 방이에요.");
  return room;
}
// 방에 들어갈 수 있나 (DB): 팀 방은 그 팀 사람, dm 은 상대와 같은 팀이어야 해요
export async function canEnter(env, room, user) {
  const h = HELP_RE.exec(room);
  if (h) return h[1] === user.id || (user.role === "admin" && !user.imp_by);
  const t = roomTeam(room);
  if (t) return inTeam(env, t, user.id);
  const m = DM_RE.exec(room);
  return !!m && isPeer(env, user.id, m[1] === user.id ? m[2] : m[1]);
}
const roomUserIds = async (env, room) => { const h = HELP_RE.exec(room); if (h) return [...new Set([h[1], ...(await adminIds(env))])]; const m = DM_RE.exec(room); return m ? [m[1], m[2]] : teamMemberIds(env, roomTeam(room)); };

// 방 메시지 한 줄 넣기 (창고의 '대화로 보내기' 도 이걸 써요)
export async function postRoomMessage(env, msg) {
  await env.DB.prepare(
    "INSERT INTO room_messages (id, room, user_id, kind, body, ref_id, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(msg.id, msg.room || ALL, msg.user_id ?? null, msg.kind || "text", msg.body, msg.ref_id ?? null, msg.reply_to ?? null, msg.created_at).run();
  const room = msg.room || ALL;
  // 실시간: 방 사람(나 포함 — 내 다른 탭도)에게 "새 메시지" 신호
  await hubNotify(env, await roomUserIds(env, room), { type: "room", room, from: msg.user_id ?? null, kind: msg.kind || "text" });
  return { ...msg, room };
}

export async function getAiName(env) {
  const row = await env.DB.prepare("SELECT value FROM room_settings WHERE key = 'ai_name'").first();
  return row?.value || "마피아";
}

// share 메시지에 창고 카드 붙이기 (항목이 지워졌으면 item: null)
async function attachItems(env, messages) {
  const ids = [...new Set(messages.filter((m) => m.kind === "share" && m.ref_id).map((m) => m.ref_id))];
  const found = new Map();
  if (ids.length) {
    const { results } = await env.DB.prepare(
      `SELECT id, kind, title, thumb, url, video_id FROM library_items WHERE id IN (${ids.map(() => "?").join(",")})`
    ).bind(...ids).all();
    for (const it of results) found.set(it.id, it);
  }
  return messages.map((m) => (m.kind === "share" ? { ...m, item: found.get(m.ref_id) || null } : m));
}

export function registerRoom(on, { json, body, fail, uid, now }) {
  const roomOf = async (env, v, user) => { const room = checkRoom(v, user, fail); if (!(await canEnter(env, room, user))) fail(403, "들어갈 수 없는 방이에요."); return room; };
  const readStmt = (env, userId, room, at) =>
    env.DB.prepare("INSERT INTO room_reads (user_id, room, last_read_at) VALUES (?, ?, ?) ON CONFLICT(user_id, room) DO UPDATE SET last_read_at = MAX(last_read_at, excluded.last_read_at)").bind(userId, room, at);
  const markRead = (env, userId, room, at) => readStmt(env, userId, room, at).run();
  const aiNameStmt = (env) => env.DB.prepare("SELECT value FROM room_settings WHERE key = 'ai_name'");
  const aiNameOf = (res) => res.results[0]?.value || "마피아";

  // 문의방 사람들 이름 (팀이 달라 ctx.users 에 없을 수 있어서)
  async function roomPeople(env, room) {
    const ids = await roomUserIds(env, room);
    const { results } = await env.DB.prepare(`SELECT id, username, display_name, color, avatar FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    return Object.fromEntries(results.map((u) => [u.id, u]));
  }
  // 방의 다른 사람들 (푸시 알림 대상): 'all' 은 나 빼고 모두, dm 은 상대 한 명
  async function roomMembers(env, room, me) {
    return (await roomUserIds(env, room)).filter((id) => id !== me);
  }
  // 내가 들어갈 수 있는 모든 방의 안 읽음: 'all' + 다른 멤버마다 dm 방 하나 (dmRoom 과 같은 규칙을 SQL 로 — 멤버 목록 + 개수를 쿼리 하나로)
  // ?1 = 나. 안 읽음 = 내 마지막 읽은 시각 뒤에 온 남의 메시지
  const MY_ROOMS = `WITH rooms(room, ord, last) AS (SELECT x.room, x.ord, COALESCE((SELECT last_read_at FROM room_reads rr WHERE rr.user_id = ?1 AND rr.room = x.room), 0) FROM (SELECT CASE WHEN tm.team_id = 'swx2' THEN '${ALL}' ELSE 'team:' || tm.team_id END AS room, 0 AS ord FROM team_members tm WHERE tm.user_id = ?1 UNION ALL SELECT CASE WHEN ?1 < id THEN 'dm:' || ?1 || ':' || id ELSE 'dm:' || id || ':' || ?1 END, rowid FROM users WHERE id != ?1 AND id IN ${PEERS("?1")} UNION ALL SELECT 'help:' || ?1, 900000 WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = ?1 AND role = 'admin') UNION ALL SELECT DISTINCT rm.room, 900001 FROM room_messages rm WHERE rm.room LIKE 'help:%' AND EXISTS (SELECT 1 FROM users WHERE id = ?1 AND role = 'admin')) x)`;
  const UNREAD = "(m.user_id IS NULL OR m.user_id != ?1) AND m.created_at > r.last"; // r.last 가 있어서 (room, created_at) 색인으로 범위만 읽어요
  const unreadStmt = (env, userId) => env.DB.prepare(`${MY_ROOMS} SELECT r.room, (SELECT COUNT(*) FROM room_messages m WHERE m.room = r.room AND ${UNREAD}) AS n FROM rooms r ORDER BY r.ord`).bind(userId);
  const unreadOf = (res) => Object.fromEntries(res.results.map((r) => [r.room, r.n]));

  // ---------- AI 답 만들기 ----------
  // 그 방 안의 것만 프롬프트에 넣어요: 최근 메시지(이름 붙여서) + 창고 목록(종류 · 제목 · 넣은 사람)
  async function buildPrompt(env, name, room, upto) {
    const ids = await roomUserIds(env, room);
    const [msgs, users, items] = await env.DB.batch([
      env.DB.prepare("SELECT user_id, kind, body, created_at FROM room_messages WHERE room = ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT ?").bind(room, upto, CONTEXT_MSGS),
      env.DB.prepare("SELECT id, display_name FROM users"),
      env.DB.prepare(`SELECT l.kind, l.title, u.display_name FROM library_items l LEFT JOIN users u ON u.id = l.added_by WHERE l.added_by IN (${ids.map(() => "?").join(",") || "NULL"}) ORDER BY l.created_at DESC LIMIT ?`).bind(...ids, CONTEXT_ITEMS),
    ]);
    const nameOf = new Map(users.results.map((u) => [u.id, u.display_name]));
    const KIND = { book: "책", link: "링크", video: "영상" };
    const lines = msgs.results.reverse().map((m) => {
      const who = m.kind === "ai" ? `${name}(AI)` : m.kind === "system" ? "시스템" : nameOf.get(m.user_id) || "떠난 멤버";
      const text = m.kind === "share" ? `[창고에 올림] ${m.body}` : m.body;
      return `${who}: ${text}`;
    });
    const shelf = items.results.length
      ? items.results.map((i) => `- ${KIND[i.kind] || i.kind} · ${i.title} · ${i.display_name || "떠난 멤버"}`).join("\n")
      : "(아직 비어 있어요)";
    const where = room.startsWith("dm:") ? "두 사람만 있는 1:1 방" : "팀 사람들이 다 있는 방";
    const system = `너는 공부 팀의 '대화방'에 있는 AI 친구 ${name}. 짧고 친근한 한국어, 마크다운 최소, 필요하면 목록. 방 안의 대화와 창고 목록, 그리고 웹(검색 · 페이지 읽기 도구)만 쓸 수 있고, 개인 노트·일기·계획은 볼 수 없다고 솔직히 말해. 웹 자료를 쓰면 끝에 출처 링크를 짧게.`;
    const prompt = `## 창고 목록\n${shelf}\n\n## 최근 대화 (${where}, 오래된 것부터)\n${lines.join("\n")}\n\n마지막 메시지에서 너(${name})를 불렀어. ${name}으로서 답만 써. 이름 접두어 없이.`;
    return { system, prompt };
  }

  // 메시지 하나에 대한 AI 답을 만들어 같은 방에 kind 'ai' 로 저장. 실패하면 throw (사람 메시지는 그대로 남아요)
  async function replyTo(env, msg) {
    const name = await getAiName(env);
    const { system, prompt } = await buildPrompt(env, name, msg.room, msg.created_at);
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error("AI 답이 45초 안에 오지 않았어요."), { status: 504 })), AI_TIMEOUT); });
    try {
      // 대화방 AI 도 에이전트처럼: 부른 메시지에 링크가 있으면 읽고, 조사가 필요한 말이면 웹을 찾아보고, 필요하면 스스로 더 검색해요
      const { text } = await Promise.race([runAgent(env, null, { system, messages: [{ role: "user", content: prompt }], tools: ["web_search", "read_page"], maxSteps: 3, preSearch: "auto", researchOn: msg.body }), timeout]);
      const clean = text.trim().slice(0, 4000);
      if (!clean) { const e = new Error("AI가 빈 답을 보냈어요."); e.status = 502; throw e; }
      return await postRoomMessage(env, { id: uid(), room: msg.room, user_id: null, kind: "ai", body: clean, ref_id: null, reply_to: msg.id, created_at: now() });
    } finally { clearTimeout(timer); }
  }

  // ---------- 메시지 ----------
  on("GET", "/room", async ({ env, q, user }) => {
    const room = await roomOf(env, q.get("room"), user);
    const since = Number(q.get("since"));
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.get("limit")) || DEFAULT_LIMIT));
    const after = Number.isFinite(since) && since > 0;
    // 메시지 · AI 이름 · 안 읽음을 왕복 한 번에 (창고 카드는 share 메시지가 있을 때만 한 번 더)
    const [res, name, unread] = await env.DB.batch([
      after ? env.DB.prepare("SELECT * FROM room_messages WHERE room = ? AND created_at > ? ORDER BY created_at, id LIMIT ?").bind(room, since, limit)
        : env.DB.prepare("SELECT * FROM room_messages WHERE room = ? ORDER BY created_at DESC, id DESC LIMIT ?").bind(room, limit),
      aiNameStmt(env), unreadStmt(env, user.id),
    ]);
    const rows = after ? res.results : res.results.reverse();
    const [messages, ai_name, rooms] = [await attachItems(env, rows), aiNameOf(name), unreadOf(unread)];
    const people = HELP_RE.test(room) ? await roomPeople(env, room) : undefined;
    return json({ room, messages, ai_name, unread: rooms[room] || 0, rooms, now: now(), ...(people ? { people } : {}) });
  });

  on("POST", "/room", async ({ req, env, user, ec }) => {
    const b = await body(req);
    const room = await roomOf(env, b.room, user);
    if (typeof b.body !== "string" || !b.body.trim()) fail(400, "메시지를 입력해 주세요.");
    const text = b.body.trim();
    if (text.length > MAX_BODY) fail(400, `메시지는 ${MAX_BODY}자까지 쓸 수 있어요.`);
    const reply_to = typeof b.reply_to === "string" && b.reply_to.length <= 64 ? b.reply_to : null;
    const message = await postRoomMessage(env, { id: uid(), room, user_id: user.id, kind: "text", body: text, ref_id: null, reply_to, created_at: now() });
    // 내가 보낸 건 읽은 것으로 · 알림 받을 사람 · AI 이름을 동시에 (서로 기다리지 않게)
    const [, members, aiName] = await Promise.all([markRead(env, user.id, room, message.created_at), roomMembers(env, room, user.id), getAiName(env)]);
    pushUsers(env, ec, members, { room }); // 다른 사람 기기에 알림
    const out = { message };
    if (!HELP_RE.test(room) && mentionsAi(text, aiName)) {
      try { out.ai = await replyTo(env, message); }
      catch (e) { out.ai_error = e.message || "AI 답을 받지 못했어요."; }
    }
    return json(out, 201);
  });

  // AI 답 다시 시도. 같은 사람은 30초에 한 번 (room_settings 'ai_last:<uid>' 에 시각 저장 — 워커 인스턴스가 여럿이라 메모리 대신 DB)
  on("POST", "/room/ai", async ({ req, env, user }) => {
    const b = await body(req);
    if (typeof b.message_id !== "string" || !b.message_id) fail(400, "어느 메시지인지 알려 주세요.");
    const msg = await env.DB.prepare("SELECT * FROM room_messages WHERE id = ?").bind(b.message_id).first();
    if (!msg) fail(404, "메시지를 찾을 수 없어요.");
    await roomOf(env, msg.room, user);   // 그 방의 멤버가 아니면 403
    if (msg.kind !== "text") fail(400, "사람이 쓴 메시지에만 답할 수 있어요.");
    if (!mentionsAi(msg.body, await getAiName(env))) fail(400, "AI를 부른 메시지가 아니에요.");
    const key = "ai_last:" + user.id, t = now();
    const last = Number((await env.DB.prepare("SELECT value FROM room_settings WHERE key = ?").bind(key).first())?.value || 0);
    if (t - last < RETRY_GAP) fail(429, `다시 시도는 ${Math.ceil((RETRY_GAP - (t - last)) / 1000)}초 뒤에 할 수 있어요.`);
    await env.DB.prepare("INSERT INTO room_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(t)).run();
    try { return json({ ai: await replyTo(env, msg) }); }
    catch (e) { fail(e.status && e.status >= 400 && e.status < 600 ? e.status : 502, e.message || "AI 답을 받지 못했어요."); }
  });

  on("DELETE", "/room/:id", async ({ env, params, user }) => {
    const msg = await env.DB.prepare("SELECT id, user_id FROM room_messages WHERE id = ?").bind(params.id).first();
    if (!msg) fail(404, "메시지를 찾을 수 없어요.");
    if (msg.user_id !== user.id) fail(403, "내 메시지만 지울 수 있어요.");
    await env.DB.prepare("DELETE FROM room_messages WHERE id = ?").bind(params.id).run();
    return json({ ok: true });
  });

  // ---------- 읽음 ----------
  on("PUT", "/room/read", async ({ req, env, user }) => {
    const b = await body(req);
    const room = await roomOf(env, b.room, user);
    let at = b.at == null ? now() : Math.round(Number(b.at));
    if (!Number.isFinite(at) || at <= 0) fail(400, "시각이 올바르지 않아요.");
    at = Math.min(at, now() + 60e3);
    const [, unread] = await env.DB.batch([readStmt(env, user.id, room, at), unreadStmt(env, user.id)]); // 읽음 저장 + 새 개수를 한 번에
    const rooms = unreadOf(unread);
    return json({ room, unread: rooms[room] || 0, rooms });
  });

  // Dock 배지용: 내가 들어갈 수 있는 방 전부. unread 는 room(기본 'all') 것
  // 실시간 연결 (웹소켓). 로그인한 사람만, 소켓은 사용자 id 로 묶여요
  // 관리자 문의방 목록 — 관리자: 글이 있는 모든 문의방(회원 이름 · 마지막 글 시각) · 회원: 내 문의방
  on("GET", "/room/help", async ({ env, user }) => {
    if (user.role !== "admin" || user.imp_by) return json({ mine: helpRoom(user.id), rooms: [] });
    const { results } = await env.DB.prepare("SELECT m.room, MAX(m.created_at) AS last_at, u.id, u.username, u.display_name, u.color, u.avatar FROM room_messages m JOIN users u ON 'help:' || u.id = m.room WHERE m.room LIKE 'help:%' GROUP BY m.room ORDER BY last_at DESC LIMIT 200").all();
    return json({ mine: null, rooms: results.map((r) => ({ room: r.room, last_at: r.last_at, user: { id: r.id, username: r.username, display_name: r.display_name, color: r.color, avatar: r.avatar } })) });
  });

  on("GET", "/room/ws", async ({ req, env, user }) => {
    if (req.headers.get("Upgrade") !== "websocket") fail(426, "웹소켓으로 연결해 주세요.");
    return hubConnect(env, req, user.id);
  });

  on("GET", "/room/unread", async ({ env, q, user }) => {
    const room = q.get("room") ? await roomOf(env, q.get("room"), user) : ALL; // 방을 안 주면 개수만 (팀이 없어도 돼요)
    // 안 읽음 개수 + 알림용 '안 읽은 것 중 가장 최근 메시지 한 개'(AI 이름 포함)를 왕복 한 번에
    const [unread, lastRes] = await env.DB.batch([
      unreadStmt(env, user.id),
      env.DB.prepare(`${MY_ROOMS} SELECT m.room, m.body, m.kind, m.user_id, u.display_name AS who, (SELECT value FROM room_settings WHERE key = 'ai_name') AS ai_name FROM room_messages m JOIN rooms r ON r.room = m.room LEFT JOIN users u ON u.id = m.user_id WHERE ${UNREAD} ORDER BY m.created_at DESC LIMIT 1`).bind(user.id),
    ]);
    const rooms = unreadOf(unread);
    const total = Object.values(rooms).reduce((a, n) => a + n, 0);
    // 알림용: 안 읽은 것 중 가장 최근 메시지 한 개 + 나를 @로 불렀는지
    let last = null;
    const m = total ? lastRes.results[0] : null;
    if (m) {
      const low = String(m.body || "").toLowerCase(), me = [user.display_name, user.username].filter(Boolean).map((x) => "@" + x.toLowerCase());
      last = { room: m.room, who: m.kind === "ai" ? m.ai_name || "마피아" : m.who || "누군가", body: String(m.body || "").slice(0, 140), mention: me.some((x) => low.includes(x)), dm: m.room.startsWith("dm:"), help: m.room.startsWith("help:"), forAdmin: m.room.startsWith("help:") && m.room !== "help:" + user.id };
    }
    return json({ room, unread: rooms[room] || 0, rooms, total, last });
  });

  // ---------- 설정 (방 공통) ----------
  on("GET", "/room/settings", async ({ env }) => json({ ai_name: await getAiName(env) }));

  on("PUT", "/room/settings", async ({ req, env, user }) => {
    const b = await body(req);
    const room = await roomOf(env, b.room, user);
    const name = typeof b.ai_name === "string" ? b.ai_name.trim() : "";
    if (name.length < 2 || name.length > 12) fail(400, "AI 이름은 2~12자로 지어 주세요.");
    if (/[@\s]/.test(name)) fail(400, "AI 이름에는 @와 띄어쓰기를 쓸 수 없어요.");
    await env.DB.prepare("INSERT INTO room_settings (key, value) VALUES ('ai_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(name).run();
    const message = await postRoomMessage(env, { id: uid(), room, user_id: null, kind: "system", body: `${user.display_name}가 AI 이름을 '${name}'로 바꿨어요`, ref_id: null, reply_to: null, created_at: now() });
    return json({ ai_name: name, message });
  });
}

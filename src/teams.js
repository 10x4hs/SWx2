// 팀: 누구나 만들고 초대 코드로 들어와요. 다른 사람의 것은 같은 팀 사람(peer)끼리만 보여요.
// PEERS(p) = 나 + 나와 팀을 하나라도 같이 하는 사람들의 id (SQL 하위 질의, p = 내 id 자리표시자 "?" 또는 "?1")
import { fail, json, body, now, uid, str } from "./http.js";

export const PEERS = (p) => `(WITH me(id) AS (SELECT ${p}) SELECT id FROM me UNION SELECT b.user_id FROM me JOIN team_members a ON a.user_id = me.id JOIN team_members b ON b.team_id = a.team_id)`; // 자리표시자는 한 번만 써요

export async function isPeer(env, me, other) {
  if (me === other) return true;
  return !!(await env.DB.prepare("SELECT 1 FROM team_members a JOIN team_members b ON b.team_id = a.team_id WHERE a.user_id = ? AND b.user_id = ? LIMIT 1").bind(me, other).first());
}
export const needPeer = async (env, me, other) => { if (!(await isPeer(env, me, other))) fail(404, "없는 사람이에요."); };
export async function peerIds(env, me) {
  const { results } = await env.DB.prepare(`SELECT ${"?1"} AS id UNION SELECT b.user_id FROM team_members a JOIN team_members b ON b.team_id = a.team_id WHERE a.user_id = ?1`).bind(me).all();
  return results.map((r) => r.id);
}
// 팀 채팅방: 'team:<id>' — 첫 팀(swx2)은 예전 이름 'all' 을 그대로 써요 (지난 대화 그대로)
export const teamRoom = (teamId) => (teamId === "swx2" ? "all" : "team:" + teamId);
export const roomTeam = (room) => (room === "all" ? "swx2" : room.startsWith("team:") ? room.slice(5) : null);
export const teamMemberIds = async (env, teamId) => (await env.DB.prepare("SELECT user_id FROM team_members WHERE team_id = ?").bind(teamId).all()).results.map((r) => r.user_id);
export const inTeam = async (env, teamId, userId) => !!(await env.DB.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?").bind(teamId, userId).first());

const newCode = () => [...crypto.getRandomValues(new Uint8Array(5))].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
const MAX_TEAMS = 10; // 한 사람이 들어갈 수 있는 팀

export function registerTeams(on) {
  // 내 팀들 (+ 팀원 · 내가 팀장이면 초대 코드)
  on("GET", "/teams", async ({ env, user }) => {
    const [ts, ms] = await env.DB.batch([
      env.DB.prepare("SELECT t.id, t.name, t.owner_id, t.code, t.created_at FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ? ORDER BY t.created_at").bind(user.id),
      env.DB.prepare("SELECT m.team_id, u.id, u.username, u.display_name FROM team_members m JOIN team_members me ON me.team_id = m.team_id AND me.user_id = ? JOIN users u ON u.id = m.user_id ORDER BY m.joined_at").bind(user.id),
    ]);
    const teams = ts.results.map((t) => ({ id: t.id, name: t.name, owner_id: t.owner_id, mine: t.owner_id === user.id, code: t.owner_id === user.id ? t.code : null, room: teamRoom(t.id), members: ms.results.filter((m) => m.team_id === t.id).map(({ team_id, ...m }) => m) }));
    return json({ teams });
  });
  on("POST", "/teams", async ({ req, env, user }) => {
    const b = await body(req);
    const name = str(b.name, 20, "팀 이름");
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM team_members WHERE user_id = ?").bind(user.id).first();
    if (n >= MAX_TEAMS) fail(400, `팀은 ${MAX_TEAMS}개까지 들어갈 수 있어요.`);
    const id = uid(), t = now(), code = newCode();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO teams (id, name, owner_id, code, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, name, user.id, code, t),
      env.DB.prepare("INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)").bind(id, user.id, t),
    ]);
    return json({ team: { id, name, code, room: teamRoom(id) } }, 201);
  });
  // 초대 코드로 들어가기
  on("POST", "/teams/join", async ({ req, env, user }) => {
    const b = await body(req);
    const code = String(b.code || "").trim().toLowerCase();
    const t = code && (await env.DB.prepare("SELECT id, name FROM teams WHERE code = ?").bind(code).first());
    if (!t) fail(404, "초대 코드가 맞지 않아요.");
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM team_members WHERE user_id = ?").bind(user.id).first();
    if (n >= MAX_TEAMS) fail(400, `팀은 ${MAX_TEAMS}개까지 들어갈 수 있어요.`);
    await env.DB.prepare("INSERT OR IGNORE INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)").bind(t.id, user.id, now()).run();
    return json({ team: { id: t.id, name: t.name, room: teamRoom(t.id) } });
  });
  // 팀장: 이름 바꾸기 · 초대 코드 새로 만들기
  on("PATCH", "/teams/:id", async ({ req, env, user, params }) => {
    const t = await ownTeam(env, params.id, user.id);
    const b = await body(req);
    const name = b.name !== undefined ? str(b.name, 20, "팀 이름") : t.name;
    const code = b.new_code ? newCode() : t.code;
    await env.DB.prepare("UPDATE teams SET name = ?, code = ? WHERE id = ?").bind(name, code, t.id).run();
    return json({ team: { id: t.id, name, code } });
  });
  // 나가기 (나) · 내보내기 (팀장이 다른 사람). 팀장이 나가면 가장 먼저 들어온 사람이 팀장, 아무도 없으면 팀이 없어져요
  on("DELETE", "/teams/:id/members/:uid", async ({ env, user, params }) => {
    const t = await env.DB.prepare("SELECT id, owner_id FROM teams WHERE id = ?").bind(params.id).first();
    if (!t || !(await inTeam(env, t.id, user.id))) fail(404, "없는 팀이에요.");
    if (params.uid !== user.id && t.owner_id !== user.id) fail(403, "팀장만 내보낼 수 있어요.");
    await env.DB.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").bind(t.id, params.uid).run();
    const left = await env.DB.prepare("SELECT user_id FROM team_members WHERE team_id = ? ORDER BY joined_at LIMIT 1").bind(t.id).first();
    if (!left) await env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(t.id).run();
    else if (params.uid === t.owner_id) await env.DB.prepare("UPDATE teams SET owner_id = ? WHERE id = ?").bind(left.user_id, t.id).run();
    return json({ ok: true });
  });
}
async function ownTeam(env, id, userId) {
  const t = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(id).first();
  if (!t || t.owner_id !== userId) fail(403, "팀장만 할 수 있어요.");
  return t;
}

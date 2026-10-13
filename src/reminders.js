// 데이터베이스 행 알림 (docs/blocks-schema.md "Reminders").
// 행 props._remind = { prop, time } → notes.remind_at (저장할 때 notes.js 가 계산). 크론이 한 시간마다(매시 10분) 지난 알림을 찾아
// 행 주인에게 "깨우기" 푸시를 보내요 (push.js 는 내용 없는 푸시라, 서비스 워커가 POST /reminders/take 로 무엇인지 읽어 띄워요).
//   POST /reminders/take → { reminders: [{ id, title, date, time, db_title }] } — 보냈지만 아직 안 띄운 것, 읽으면 띄운 걸로 표시
import { isDue } from "../public/js/blocks/dbview.js";
import { pushUsers } from "./push.js";

export const REMIND_CRON = "10 * * * *"; // src/cron.js 의 HOURLY (뉴스와 같은 크론)
const MAX_LATE = 26 * 3600e3;

export async function remindersCron(env, t = Date.now()) {
  const { results } = await env.DB.prepare("SELECT id, user_id, remind_at, reminded_at FROM notes WHERE remind_at IS NOT NULL AND reminded_at IS NULL AND remind_at <= ? AND remind_at > ? LIMIT 500")
    .bind(t, t - MAX_LATE).all();
  const due = results.filter((r) => isDue(r, t, MAX_LATE));
  if (!due.length) return { sent: 0 };
  await env.DB.batch(due.map((r) => env.DB.prepare("UPDATE notes SET reminded_at = ? WHERE id = ?").bind(t, r.id)));
  const users = [...new Set(due.map((r) => r.user_id))];
  await pushUsers(env, null, users, { room: "remind" });
  return { sent: due.length, users: users.length };
}

export function registerReminders(on, { json, fail }) {
  on("POST", "/reminders/take", async ({ env, user }) => {
    const { results } = await env.DB.prepare(
      `SELECT n.id, n.title, n.props, p.title AS db_title FROM notes n LEFT JOIN notes p ON p.id = n.parent_id
       WHERE n.user_id = ? AND n.reminded_at IS NOT NULL AND n.remind_seen IS NULL ORDER BY n.remind_at LIMIT 10`
    ).bind(user.id).all();
    if (results.length) await env.DB.batch(results.map((r) => env.DB.prepare("UPDATE notes SET remind_seen = ? WHERE id = ?").bind(Date.now(), r.id)));
    return json({ reminders: results.map((r) => { let p = {}; try { p = JSON.parse(r.props || "{}"); } catch {} const rm = p._remind || {}; return { id: r.id, title: r.title, db_title: r.db_title, date: p[rm.prop] || null, time: rm.time || null }; }) });
  });
  // 테스트용: 크론을 바로 한 번 돌려요 (로컬 개발에서만 — .dev.vars 의 PASSWORDLESS=1)
  on("POST", "/reminders/run", async ({ env, q }) => {
    if (env.PASSWORDLESS !== "1") fail(404, "없는 주소예요.");
    return json(await remindersCron(env, Number(q.get("now")) || Date.now()));
  });
}

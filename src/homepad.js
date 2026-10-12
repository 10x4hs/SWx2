// 홈 첫 화면의 글 쓰는 자리: 오늘의 다짐(셋이 봐요 · 날마다 한 줄) · 메모장(나만 봐요 · 한 장, 자동 저장)
import { kstToday } from "./lib/day.js";

const MAX_PLEDGE = 120;
const MAX_MEMO = 20000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerHomePad(on, { json, body, fail, now }) {
  // 오늘 셋의 다짐 + 내 최근 7일 다짐(이어 쓴 날 세기) + 내 메모
  on("GET", "/home/pad", async ({ env, user, q }) => {
    const day = DAY_RE.test(q.get("day") || "") ? q.get("day") : kstToday();
    const [today, mine, memo] = await env.DB.batch([
      env.DB.prepare("SELECT user_id, body, updated_at FROM pledges WHERE day = ?").bind(day),
      env.DB.prepare("SELECT day, body FROM pledges WHERE user_id = ? AND day <= ? ORDER BY day DESC LIMIT 30").bind(user.id, day),
      env.DB.prepare("SELECT body, updated_at FROM home_memos WHERE user_id = ?").bind(user.id),
    ]);
    // 오늘(또는 어제)부터 끊기지 않고 다짐을 쓴 날 수
    let streak = 0, d = day;
    const days = new Set(mine.results.map((r) => r.day));
    if (!days.has(d)) d = new Date(Date.parse(d + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
    while (days.has(d)) { streak++; d = new Date(Date.parse(d + "T00:00:00Z") - 864e5).toISOString().slice(0, 10); }
    const last = mine.results.find((r) => r.day < day) || null;
    return json({ day, pledges: today.results, streak, last, memo: memo.results[0]?.body || "", memo_at: memo.results[0]?.updated_at || null });
  });

  on("PUT", "/home/pledge", async ({ req, env, user }) => {
    const b = await body(req);
    const day = DAY_RE.test(b.day || "") && b.day >= kstToday(-1) && b.day <= kstToday(1) ? b.day : kstToday(); // 오늘 근처만 (시간대 차이 허용)
    if (b.text != null && typeof b.text !== "string") fail(400, "다짐 형식이 올바르지 않아요.");
    const text = String(b.text || "").replace(/\s+/g, " ").trim();
    if (text.length > MAX_PLEDGE) fail(400, `다짐은 ${MAX_PLEDGE}자까지예요.`);
    if (text) await env.DB.prepare(`INSERT INTO pledges (user_id, day, body, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, day) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`).bind(user.id, day, text, now()).run();
    else await env.DB.prepare("DELETE FROM pledges WHERE user_id = ? AND day = ?").bind(user.id, day).run();
    return json({ day, text: text || null });
  });

  on("PUT", "/home/memo", async ({ req, env, user }) => {
    const b = await body(req);
    if (typeof b.text !== "string") fail(400, "메모 형식이 올바르지 않아요.");
    if (b.text.length > MAX_MEMO) fail(400, `메모는 ${MAX_MEMO.toLocaleString()}자까지예요. 길면 노트로 보내 주세요.`);
    const t = now();
    await env.DB.prepare(`INSERT INTO home_memos (user_id, body, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`).bind(user.id, b.text, t).run();
    return json({ saved_at: t });
  });
}

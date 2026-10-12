// 일기: 하루 한 편, 본인만.
import { fail, json, body, now, DAY_RE, dayParam, yearParam } from "./http.js";

export function registerDiary(on) {
  on("GET", "/diary", async ({ env, q, user }) => {
    const day = q.get("day") || "";
    dayParam(day);
    const d = await env.DB.prepare("SELECT day, mood, body, updated_at FROM diaries WHERE user_id = ? AND day = ?").bind(user.id, day).first();
    return json({ diary: d || null });
  });

  on("PUT", "/diary", async ({ req, env, user }) => {
    const b = await body(req);
    dayParam(b.day);
    const mood = b.mood == null ? null : Math.round(Number(b.mood));
    if (mood !== null && !(mood >= 1 && mood <= 5)) fail(400, "기분은 1~5 중에서 골라 주세요.");
    const text = typeof b.body === "string" ? b.body : "";
    if (text.length > 20000) fail(400, "일기가 너무 길어요.");
    if (!text.trim() && mood === null) {
      await env.DB.prepare("DELETE FROM diaries WHERE user_id = ? AND day = ?").bind(user.id, b.day).run();
      return json({ diary: null });
    }
    const at = now();
    await env.DB.prepare(
      "INSERT INTO diaries (user_id, day, mood, body, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET mood = excluded.mood, body = excluded.body, updated_at = excluded.updated_at"
    ).bind(user.id, b.day, mood, text, at).run();
    return json({ diary: { day: b.day, mood, body: text, updated_at: at } });
  });

  // 잔디: 한 해 동안 일기를 쓴 날
  on("GET", "/diary/days", async ({ env, q, user }) => {
    const year = q.get("year") || "";
    yearParam(year);
    const { results } = await env.DB.prepare("SELECT day, mood, length(body) AS len FROM diaries WHERE user_id = ? AND day LIKE ? ORDER BY day")
      .bind(user.id, year + "-%").all();
    return json({ days: results });
  });

  on("GET", "/diary/list", async ({ env, q, user }) => {
    const before = DAY_RE.test(q.get("before") || "") ? q.get("before") : "9999-12-31";
    const { results } = await env.DB.prepare(
      "SELECT day, mood, substr(body, 1, 200) AS snippet, length(body) AS len, updated_at FROM diaries WHERE user_id = ? AND day < ? ORDER BY day DESC LIMIT 60"
    ).bind(user.id, before).all();
    return json({ entries: results });
  });
}

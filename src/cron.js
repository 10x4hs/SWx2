// 크론 나누기 (wrangler.jsonc triggers.crons — 무료 플랜은 5개까지라 딱 5개예요).
//   "5 15 * * *"   매일 00:05 (한국) — 지난 하루 자동 저장 · 논문 구역 정리
//   "0 13 * * SUN" 일요일 22:00 (한국) — 주간 회고 미리 만들기
//   "0 23 * * *"   매일 08:00 (한국) — 뉴스 요약 + 오늘 신문 초안 + 브리핑
//   "10 * * * *"   매시 10분 — DB 행 알림 + 뉴스 수집(피드 10) · 요약 5편 · 지난 60일 되채우기 한 걸음(5편) (예전 "0 * * * *" + "20 * * * *" 를 합쳤어요)
//   "10 14 * * *"  매일 23:10 (한국) — 오늘 신문 마감 (closed)
// 무료 플랜은 호출 한 번에 바깥 요청(fetch·AI) 50개까지 → 크론은 lib/budget.js 로 40개 안에서만 돌아요.
import { newsHourly, newsCron, newsClose, NEWS_BUDGET } from "./news.js";
import { remindersCron } from "./reminders.js";
import { weeklyReviewCron } from "./together.js";
import { autoSaveYesterday } from "./records.js";
import { cleanupPaperNotes } from "./papers.js";
import { kstToday } from "./lib/day.js";
import { withBudget } from "./lib/budget.js";

export const CRON = { SAVE: "5 15 * * *", WEEKLY: "0 13 * * SUN", NEWS_AM: "0 23 * * *", HOURLY: "10 * * * *", NEWS_CLOSE: "10 14 * * *" };

/** 크론 하나를 돌리고 { used(바깥 요청 수), limit, result } 를 돌려줘요. 시험(POST /api/cron/run)도 같은 길로 와요. */
export async function runCron(env, cron) {
  if (cron === CRON.HOURLY) return withBudget(NEWS_BUDGET, async () => {
    const reminders = await remindersCron(env).catch((e) => ({ error: String(e?.message || e) }));
    const news = await newsHourly(env).catch((e) => ({ error: String(e?.message || e) }));
    return { reminders, news };
  });
  if (cron === CRON.NEWS_AM) return withBudget(NEWS_BUDGET, () => newsCron(env, kstToday(0)));
  if (cron === CRON.NEWS_CLOSE) return withBudget(NEWS_BUDGET, () => newsClose(env, kstToday(0)));
  if (cron === CRON.WEEKLY) return withBudget(NEWS_BUDGET, () => weeklyReviewCron(env));
  return withBudget(NEWS_BUDGET, async () => ({ save: await autoSaveYesterday(env), papers: await cleanupPaperNotes(env, kstToday(0)) }));
}

export function registerCron(on, { json, fail }) {
  // 테스트용: 크론 하나를 바로 돌려요 (로컬 개발에서만 — .dev.vars 의 PASSWORDLESS=1). ?cron=hourly|am|close
  on("POST", "/cron/run", async ({ env, q }) => {
    if (env.PASSWORDLESS !== "1") fail(404, "없는 주소예요.");
    const key = { hourly: CRON.HOURLY, am: CRON.NEWS_AM, close: CRON.NEWS_CLOSE }[q.get("cron")];
    if (!key) fail(400, "cron=hourly|am|close");
    return json(await runCron(env, key));
  });
}

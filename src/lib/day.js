// 한국 시간(KST, UTC+9) 날짜 도구 — "오늘" 계산을 파일마다 따로 쓰던 걸 모았어요.
// 오늘(YYYY-MM-DD). offsetDays 로 어제(-1) · 내일(1) 도 구해요.
export const kstToday = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);

// 한국 시간 오늘. 로컬 테스트(PASSWORDLESS=1)에서만 x-papers-now 헤더로 날짜를 바꿀 수 있어요 (논문 · 책이 같은 헤더).
export function kstTodayReq(req, env) {
  const fake = env.PASSWORDLESS === "1" ? req.headers.get("x-papers-now") : null;
  if (fake && /^\d{4}-\d{2}-\d{2}$/.test(fake)) return fake;
  return kstToday();
}

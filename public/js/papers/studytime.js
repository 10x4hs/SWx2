// 공부 예상 시간 (public/papers/study-time.json — scripts/papers/study-time.mjs 가 실제 분량을 재서 만들어요)
let p = null;
export const loadStudyTime = () => (p ||= fetch("/papers/study-time.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
export const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`);

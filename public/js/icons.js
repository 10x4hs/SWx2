// Minimal 1.6px-stroke icon set.
const s = (d, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icon = {
  today: (z) => s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', z),
  plans: (z) => s('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', z),
  notes: (z) => s('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>', z),
  graph: (z) => s('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="9" cy="18" r="2.5"/><path d="M8.2 7.2l7.5.6M7 8.4l1.5 7.2M16.5 10l-5.8 6.3"/>', z),
  team: (z) => s('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.8.3 5 2.6 5 5.8"/>', z),
  search: (z) => s('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', z),
  plus: (z) => s('<path d="M12 5v14M5 12h14"/>', z),
  x: (z) => s('<path d="M6 6l12 12M18 6L6 18"/>', z),
  left: (z) => s('<path d="M15 18l-6-6 6-6"/>', z),
  right: (z) => s('<path d="M9 18l6-6-6-6"/>', z),
  trash: (z) => s('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', z),
  edit: (z) => s('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', z),
  share: (z) => s('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3"/>', z),
  lock: (z) => s('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', z),
  moon: (z) => s('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', z),
  sun: (z) => s('<circle cx="12" cy="12" r="4"/><path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21"/>', z),
  logout: (z) => s('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>', z),
  arrowRight: (z) => s('<path d="M5 12h14M13 6l6 6-6 6"/>', z),
  play: (z) => s('<path d="M7 5v14l11-7z"/>', z),
  pause: (z) => s('<path d="M8 5v14M16 5v14"/>', z),
  reset: (z) => s('<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/>', z),
  eye: (z) => s('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', z),
  split: (z) => s('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>', z),
  calendar: (z) => s('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', z),
  home: (z) => s('<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>', z),
  diary: (z) => s('<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><path d="M6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2M9 8h6M9 12h6"/>', z),
  spark: (z) => s('<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.9L12 16.5l-1.8-4.9L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>', z),
  later: (z) => s('<path d="M5 12h12M13 7l5 5-5 5"/><path d="M20 5v14"/>', z),
};

export const logo = (size = 26) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M4 25 C 9 13, 12 9, 16 9 C 20 9, 23 13, 28 25" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M9 25V11M23 25V11" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M3 25h26" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55"/>
</svg>`;

// ---------- 툴바용 앱 아이콘 (아이폰 홈 화면처럼 색 있는 둥근 사각형 + 한눈에 뜻이 보이는 그림) ----------
const g = (d, sw = 2) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
// 타일은 무채색, 그 앱을 상징하는 부분에만 차트와 같은 차분한 색 (--c-*)
const GLYPH = {
  home: g('<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V19a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1V9.5"/>'),
  search: g('<circle cx="10.5" cy="10.5" r="6"/><path d="m15.2 15.2 4.8 4.8"/>', 2.4),
  // 미리 알림처럼: 색 동그라미 3개 + 회색 줄
  plans: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="6" cy="6.5" r="2.3" fill="var(--c-blue)"/><circle cx="6" cy="12" r="2.3" fill="var(--c-green)"/><circle cx="6" cy="17.5" r="2.3" fill="var(--c-amber)"/><path d="M10.5 6.5h9M10.5 12h9M10.5 17.5h9" stroke="currentColor" stroke-opacity=".55" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  // 일기: 무채색 책 + 로즈 하트
  diary: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6z"/><path d="M6 3.5v17"/><path d="M12 9.2c-.9-1.4-3.2-.9-3.2.9 0 1.6 3.2 3.6 3.2 3.6s3.2-2 3.2-3.6c0-1.8-2.3-2.3-3.2-.9z" fill="var(--c-rose)" stroke="none"/></svg>`,
  // 그래프: 회색 선 + 보라 점
  graph: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 8.2 10.6 15M16.3 7.4 13.4 15.4M8.2 6.8l7.5-.6M14.5 16.8l3-1.2" stroke-opacity=".6"/><g fill="var(--c-violet)" stroke="none"><circle cx="6" cy="7" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="17.5" r="2.7"/><circle cx="19" cy="15" r="1.7"/></g></svg>`,
  // AI: 차트 색을 잇는 은은한 그라데이션 반짝임
  ai: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><defs><linearGradient id="ai-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--c-amber)"/><stop offset=".5" stop-color="var(--c-rose)"/><stop offset="1" stop-color="var(--c-blue)"/></linearGradient></defs><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" fill="url(#ai-g)"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="url(#ai-g)"/></svg>`,
  // 영어: 무채색 말풍선 + 청록 "En"
  english: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 4.5h13a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2h-7.3L7 20v-3.3H5.5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z"/><text x="12" y="13.9" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" font-size="8.6" font-weight="800" letter-spacing="-.2" fill="var(--c-teal)" stroke="none">En</text></svg>`,
  // 타이머: 살구색 스톱워치
  timer: g('<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.5M10 3h4M18.5 7l1.3-1.3"/>', 2),
};
// 타일 색은 CSS(--tile-bg / --tile-fg)가 정해요 — iOS 다크 모드 아이콘처럼 무채색, 그림으로 구분
export function appIcon(key, d = new Date()) {
  let inner;
  if (key === "today") inner = `<span class="cal-dow">${DOW_KO[d.getDay()]}요일</span><span class="cal-day">${d.getDate()}</span>`; // 달력 앱처럼 오늘 날짜
  else if (key === "notes") inner = `<span class="note-band"></span><span class="note-lines"></span>`;                             // 메모 앱처럼 노란 띠 + 줄
  else inner = GLYPH[key] || "";
  return `<span class="app-ic ic-${key}">${inner}</span>`;
}

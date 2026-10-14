// 경영 마이크로디그리 — 화면들이 같이 쓰는 작은 부품 (굵게 표시 · 이 기기 저장 · 뒤로 버튼 · 공부한 분 재기)
import { esc } from "../util.js";

export const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
export const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
export const back = (href, label) => `<a class="mb-back" href="${href}" aria-label="${esc(label)}"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9 2 4 7l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`;
export const hm = (m) => (m % 60 ? `${m >= 60 ? Math.floor(m / 60) + "시간 " : ""}${m % 60}분` : `${m / 60}시간`);
export const weeksOf = (i) => `${i * 2 + 1}–${i * 2 + 2}주`; // 모듈 i(0부터) 는 24주 중 2주
export const fmtNum = (v) => Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 4 });

// 이 화면에서 공부한 분: take() 할 때마다 지난번 기록 뒤로 흐른 시간을 분으로 돌려주고 나머지 초는 다음으로 넘겨요.
// 자리를 비운 시간까지 세지 않게 한 번에 cap 분까지만 세요.
export function meter(cap) {
  let t = Date.now(), rest = 0;
  return () => {
    const ms = Math.min(cap * 60000, Date.now() - t) + rest; t = Date.now();
    const n = Math.floor(ms / 60000); rest = ms - n * 60000; return n;
  };
}

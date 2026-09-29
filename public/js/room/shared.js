// 대화방 · 창고가 같이 쓰는 작은 도구들: 종류 아이콘 · 이름표 · 시간 글자 · URL 찾기 · 두 번 눌러 지우기
import { esc } from "../util.js";

export const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

export const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;
export const firstUrl = (s) => (String(s || "").match(URL_RE) || [null])[0];
export const isHttp = (u) => /^https?:\/\//i.test(String(u || ""));
export const isHttps = (u) => /^https:\/\//i.test(String(u || ""));
export const VIDEO_ID = /^[\w-]{11}$/;

export const KIND_LABEL = { book: "책", link: "링크", video: "영상" };
// 표시 이름표 — 영상은 "볼래요/보는 중/다 봤어요"
export const MARK_LABEL = {
  book: { todo: "읽을래요", doing: "읽는 중", done: "다 읽었어요" },
  link: { todo: "읽을래요", doing: "읽는 중", done: "다 읽었어요" },
  video: { todo: "볼래요", doing: "보는 중", done: "다 봤어요" },
};
export const MARK_ORDER = [null, "todo", "doing", "done"];
export const nextMark = (s) => MARK_ORDER[(MARK_ORDER.indexOf(s || null) + 1) % MARK_ORDER.length];

// 종류 아이콘: 무채색 선, 상징 부분만 차트 색 (책 살구 · 링크 파랑 · 영상 로즈)
const svg = (d, z = 20) => `<svg width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const kindIcon = (kind, z = 20) => kind === "book"
  ? svg(`<path d="M5 4.5h11a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"/><path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H18"/><path d="M9 4.5v7l2-1.5 2 1.5v-7" fill="var(--c-amber)" stroke="var(--c-amber)"/>`, z)
  : kind === "video"
    ? svg(`<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.2v5.6l4.8-2.8z" fill="var(--c-rose)" stroke="var(--c-rose)"/>`, z)
    : svg(`<path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3" stroke="var(--c-blue)"/>`, z);

export const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

// 시간 글자
const fmtTime = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
const fmtDate = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" });
const fmtDateY = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
export const timeOf = (ms) => fmtTime.format(new Date(ms));
export const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
export function dayLabel(ms) {
  const d = new Date(ms), now = new Date();
  const k = dayKey(ms);
  if (k === dayKey(now.getTime())) return "오늘";
  if (k === dayKey(now.getTime() - 864e5)) return "어제";
  return (d.getFullYear() === now.getFullYear() ? fmtDate : fmtDateY).format(d);
}
export function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "방금"; if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60); if (h < 24) return `${h}시간 전`;
  const d = Math.round(h / 24); return d < 7 ? `${d}일 전` : new Date(ms).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

// 썸네일: https 만, 리퍼러 안 보냄, 느긋하게 불러오기. 아니면 종류 아이콘.
export const thumbHTML = (url, alt, kind, cls = "") => isHttps(url)
  ? `<img class="${cls}" src="${esc(url)}" alt="${esc(alt || "")}" referrerpolicy="no-referrer" loading="lazy" decoding="async">`
  : `<span class="${cls} rm-kind-ic k-${esc(kind || "link")}" aria-hidden="true">${kindIcon(kind, 26)}</span>`;

// 글에서 URL 은 링크로, @이름 은 굵게. 나머지는 전부 이스케이프.
// people = { others: [이름…], me: "내 이름" } — 친구를 부른 @이름도 강조, 나를 부르면 더 진하게
export function richText(body, aiName, people = null) {
  const s = String(body || "");
  let out = "", last = 0;
  for (const m of s.matchAll(URL_RE)) {
    out += mention(s.slice(last, m.index), aiName, people);
    out += `<a href="${esc(m[0])}" target="_blank" rel="noopener noreferrer">${esc(m[0])}</a>`;
    last = m.index + m[0].length;
  }
  out += mention(s.slice(last), aiName, people);
  return out.replace(/\n/g, "<br>");
}
function mention(text, aiName, people) {
  const e = esc(text);
  const names = [aiName, "ai", ...(people?.others || []), ...(people?.me ? [people.me] : [])].filter(Boolean);
  if (!names.length) return e;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])(@(?:${names.map((n) => escRe(esc(n))).join("|")}))(?![\\p{L}\\p{N}_])`, "giu");
  const meAt = people?.me ? "@" + esc(people.me).toLowerCase() : null;
  return e.replace(re, (_, pre, at) => `${pre}<b class="rm-mention${meAt && at.toLowerCase() === meAt ? " me" : ""}">${at}</b>`);
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 지우기 버튼: 한 번 누르면 "한 번 더" 로 무장, 2.5초 안에 다시 누르면 실행 (앱 다른 곳과 같은 방식)
export function armDelete(btn, run, { label = "한 번 더 누르면 지워요" } = {}) {
  if (btn.classList.contains("armed")) { btn.classList.remove("armed"); clearTimeout(btn._arm); return run(); }
  btn.classList.add("armed");
  const prev = btn.getAttribute("aria-label");
  btn.dataset.prevLabel = prev || "";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  clearTimeout(btn._arm);
  btn._arm = setTimeout(() => { btn.classList.remove("armed"); btn.setAttribute("aria-label", btn.dataset.prevLabel || ""); btn.title = ""; }, 2500);
}

// 큐브 자르기: 이름 첫 글자
export const avatar = (user, cls = "") => user
  ? `<span class="av ${cls}" style="--c:${esc(user.color || "var(--m0)")}" title="${esc(user.display_name)}">${esc((String(user.display_name || "?").trim()[0] || "?").toUpperCase())}</span>`
  : `<span class="av ${cls}" style="--c:var(--ink-3)" title="나간 사람">?</span>`;

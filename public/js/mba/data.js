// 경영 마이크로디그리 — 내용 파일(public/mba/*.json) 읽기 · 하루 시간 설정 · 오늘의 순서
import { api } from "../api.js";

const cache = new Map();
export function getJSON(path) {
  if (!cache.has(path)) {
    const p = fetch(path).then((r) => { if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}
export const index = () => getJSON("/mba/index.json");
export const moduleDoc = (id) => getJSON(`/mba/${id}.json`);
export const company = () => getJSON("/mba/company.json");
export const words = () => getJSON("/mba/words.json");
export const kit = () => getJSON("/mba/kit.json");
export function state() { return api.mbaState().catch(() => ({ today: "", items: [], due: [], days: [] })); }

// 하루 시간 (이 기기에만 기억)
const KEY = "mb-minutes";
export function minutes() { try { const v = Number(localStorage.getItem(KEY)); return [15, 25, 40].includes(v) ? v : 25; } catch { return 25; } }
export function setMinutes(v) { try { localStorage.setItem(KEY, String(v)); } catch {} }

// 오늘의 순서 — 인출 → 복습 → 새 개념 → 적용 → 내일 한 줄 (research: Dunlosky 2013 · Roediger & Karpicke 2006 · Cepeda 2008)
// 분 배분 비율 자체를 검증한 연구는 없어요. 순서와 구성은 근거, 숫자는 제안이에요.
const SPLIT = { 15: [3, 3, 4, 4, 1], 25: [5, 5, 7, 7, 1], 40: [6, 8, 11, 13, 2] };
export const STEPS = [
  { key: "recall", name: "먼저 떠올리기", why: "읽기 전에 어제 배운 것을 빈 화면에 꺼내 봐요. 틀려도 괜찮아요.", src: "1주 뒤 기억 42% → 56% · Roediger & Karpicke 2006" },
  { key: "review", name: "지난 카드 다시 꺼내기", why: "1 · 3 · 7 · 21 · 60일 된 카드를 다시 풀어요. 맞히면 간격이 늘어나요.", src: "인출 · 간격 반복만 근거 '높음' · Dunlosky 2013" },
  { key: "learn", name: "새 개념 한 가지", why: "한 화면에 한 생각. 처음 보는 말은 한 번에 하나만 들여요.", src: "작업기억 부담 줄이기 · 인지 부하 이론" },
  { key: "apply", name: "내 일에 적용하기", why: "배운 개념으로 내 일(또는 하고 싶은 일)을 한 줄로 설명해 봐요.", src: "자기 설명 g=0.55 · 생성 효과 0.40 (메타분석)" },
  { key: "plan", name: "내일 한 줄", why: "내일 언제, 어디서 할지 한 줄로 정해요.", src: "실행 의도(if-then) · Gollwitzer" },
];
export const split = (m) => SPLIT[m] || SPLIT[25];

// 다음에 읽을 카드: 모듈 순서대로 아직 안 읽은 첫 카드
export function nextCard(idx, st) {
  const read = new Set((st.items || []).map((x) => x.module + "/" + x.card));
  for (const m of idx.modules) for (const c of m.cards) if (!read.has(m.id + "/" + c.id)) return { module: m, card: c };
  return null;
}
export function progressOf(m, st) {
  const read = new Set((st.items || []).filter((x) => x.module === m.id).map((x) => x.card));
  return { read: m.cards.filter((c) => read.has(c.id)).length, total: m.cards.length };
}

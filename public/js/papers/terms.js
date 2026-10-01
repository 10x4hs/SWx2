// 본문 속 용어 바로 설명 — 용어가 (절마다) 처음 나오는 자리에 점선 밑줄, 올리거나 누르면 그 자리에 설명 카드.
// 사전: 공통(public/papers/terms-common.json) + 논문별(content/<id>.terms.json, 없으면 그 논문의 glossary). 논문별이 우선이에요.
import { esc } from "../util.js";
import { icon } from "../icons.js";

// 너무 흔한 표기는 밑줄을 긋지 않아요 (카드 제목으로는 남아요)
const GENERIC = new Set(["희소", "밀집", "poly", "모델", "학습", "결과", "성능", "데이터", "입력", "출력", "추론", "예측", "정답", "점수", "특징", "단계", "구조", "방법", "실험", "학습률", "촘촘한"]);
let commonP = null;
const loadCommon = () => (commonP ||= fetch("/papers/terms-common.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { terms: [] })).catch(() => ({ terms: [] })));

// 사전 → { entries: Map(key → entry), rx: RegExp, byMatch: Map(표기 → key) }
export async function loadTerms(id, glossary = []) {
  const [common, own] = await Promise.all([
    loadCommon(),
    fetch(`/papers/content/${id}.terms.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const entries = new Map(), byMatch = new Map();
  const add = (t, scope) => {
    if (!t?.term || !t.easy) return;
    const key = t.term.toLowerCase();
    entries.set(key, { ...t, scope });
    for (const m of [t.term, ...(t.match || [])]) if (typeof m === "string" && m.trim().length >= 2 && !GENERIC.has(m.trim().toLowerCase())) byMatch.set(m.trim(), key);
  };
  for (const t of common.terms || []) add(t, "공통");
  const ownTerms = own?.terms?.length ? own.terms : glossary.map((g) => ({ term: g.term, match: [g.term], easy: g.easy }));
  for (const t of ownTerms) add(t, "이 논문"); // 같은 용어면 논문별이 덮어써요
  const ownKeys = new Set(ownTerms.map((t) => String(t.term || "").toLowerCase()));
  if (!byMatch.size) return { entries, rx: null, byMatch, ownKeys };
  // 긴 표기부터 (예: "일대일 헤드"가 "헤드"보다 먼저). 영문·숫자가 든 표기는 앞뒤가 영문·숫자가 아닐 때만
  const alts = [...byMatch.keys()].sort((a, b) => b.length - a.length).map((m) => {
    const e = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return /[A-Za-z0-9]/.test(m) ? `(?<![A-Za-z0-9])${e}(?![A-Za-z0-9])` : e;
  });
  return { entries, rx: new RegExp(alts.join("|"), "g"), byMatch, ownKeys };
}

const SKIP = "a, button, code, pre, textarea, input, select, summary, h1, h2, svg, .pp-term, .pp-opt, .pp-callout-k, .pp-deep-nav, .pp-toc, .pp-kw, .ppc-form, .ppc-quick, .ppc-head, .pp-pill, .pp-tag, .pp-stage, .faint.num, [data-noterm]";
const keyOf = (dict, s) => dict.byMatch.get(s) || dict.byMatch.get(s.replace(/\s+/g, " "));

// scope 하나 안에서 용어마다 첫 번째만 밑줄. seen 을 넘기면 여러 scope 가 함께 셀 수 있어요
// pageSeen 을 주면 공통 용어는 페이지 전체에서 한 번만 (기초 용어 밑줄이 절마다 되풀이되지 않게)
export function annotate(scope, dict, seen = new Set(), pageSeen = null) {
  if (!scope || !dict?.rx || scope.dataset.termed) return;
  scope.dataset.termed = "1";
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (!n.nodeValue.trim() || n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const node of nodes) {
    // 자세히 읽기의 절은 각자 따로 세요 (그 안에서 다시 처음 나오면 또 밑줄)
    if (node.parentElement?.closest("[data-termed]") !== scope) continue;
    const text = node.nodeValue;
    dict.rx.lastIndex = 0;
    let m, last = 0, frag = null;
    while ((m = dict.rx.exec(text))) {
      const key = keyOf(dict, m[0]);
      if (!key) continue;
      const set = pageSeen && !dict.ownKeys.has(key) ? pageSeen : seen;
      if (set.has(key)) continue;
      set.add(key);
      frag ||= document.createDocumentFragment();
      if (m.index > last) frag.append(text.slice(last, m.index));
      const el = document.createElement("span");
      el.className = "pp-term" + (dict.ownKeys.has(key) ? " own" : "");
      el.tabIndex = 0; el.setAttribute("role", "button"); el.dataset.k = key;
      el.textContent = m[0];
      frag.append(el);
      last = m.index + m[0].length;
    }
    if (frag) { if (last < text.length) frag.append(text.slice(last)); node.replaceWith(frag); }
  }
}

// 설명 카드 — 페이지에 하나만. onAsk(term) 은 "AI에게 더 묻기"
export function mountTermCard(root, getDict, onAsk) {
  const card = document.createElement("div");
  card.className = "pp-tcard"; card.hidden = true; card.setAttribute("role", "dialog");
  document.body.append(card);
  let cur = null, pinned = false, showT = 0, hideT = 0;

  function show(el, pin) {
    const dict = getDict(), e = dict?.entries.get(el.dataset.k);
    if (!e) return;
    clearTimeout(hideT);
    cur?.classList.remove("on");
    cur = el; pinned = pin; el.classList.add("on");
    card.innerHTML = `
      <div class="pp-tcard-top"><b>${esc(e.term)}</b><span class="pp-tcard-scope ${e.scope === "이 논문" ? "own" : ""}">${esc(e.scope)}</span>${pin ? `<button type="button" class="pp-tcard-x" aria-label="닫기">${icon.x(12)}</button>` : ""}</div>
      <p class="pp-tcard-easy">${esc(e.easy)}</p>
      ${e.more ? `<p class="pp-tcard-more">${esc(e.more)}</p>` : ""}
      ${e.example ? `<p class="pp-tcard-ex"><span>예</span>${esc(e.example)}</p>` : ""}
      <button type="button" class="pp-tcard-ask">${icon.spark(12)} AI에게 더 묻기</button>`;
    card.hidden = false;
    place(el);
    card.querySelector(".pp-tcard-ask").onclick = () => { hide(true); onAsk?.(e.term); };
    card.querySelector(".pp-tcard-x")?.addEventListener("click", () => hide(true));
  }
  function place(el) {
    const r = el.getBoundingClientRect(), w = Math.min(340, innerWidth - 24);
    card.style.width = w + "px";
    const h = card.offsetHeight;
    let left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12));
    let top = r.bottom + 8;
    if (top + h > innerHeight - 12 && r.top - h - 8 > 12) top = r.top - h - 8; // 아래 자리가 없으면 위로
    card.style.left = left + "px"; card.style.top = Math.max(12, top) + "px";
  }
  function hide(force = false) {
    if (pinned && !force) return;
    card.hidden = true; pinned = false;
    cur?.classList.remove("on"); cur = null;
  }
  const isTerm = (t) => t?.closest?.(".pp-term");
  const hover = matchMedia("(hover: hover)").matches;
  root.addEventListener("pointerover", (e) => {
    if (!hover || pinned) return;
    const el = isTerm(e.target); if (!el) return;
    clearTimeout(showT); showT = setTimeout(() => show(el, false), 140);
  });
  root.addEventListener("pointerout", (e) => {
    if (!hover || pinned || !isTerm(e.target)) return;
    clearTimeout(showT); hideT = setTimeout(() => { if (!card.matches(":hover")) hide(); }, 220);
  });
  card.addEventListener("pointerleave", () => { if (!pinned) hideT = setTimeout(() => hide(), 200); });
  root.addEventListener("click", (e) => {
    const el = isTerm(e.target); if (!el) return;
    e.preventDefault(); e.stopPropagation();
    if (cur === el && pinned) hide(true); else show(el, true);
  });
  root.addEventListener("keydown", (e) => { const el = isTerm(e.target); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); show(el, true); } });
  const outside = (e) => { if (!card.hidden && !card.contains(e.target) && !isTerm(e.target)) hide(true); };
  const esc_ = (e) => { if (e.key === "Escape") hide(true); };
  const onScroll = () => { if (!card.hidden && cur) { if (pinned) place(cur); else hide(); } };
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", esc_);
  root.closest(".main")?.addEventListener("scroll", onScroll, { passive: true });
  return () => { card.remove(); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", esc_); root.closest(".main")?.removeEventListener("scroll", onScroll); };
}

// 우선순위 1~5 · 예상 시간 — 체크리스트 · 목표 · 계획표가 같이 써요.
// 저장값은 예전 그대로(max · xhigh · high · medium · low)지만 화면은 1순위(가장 급함) ~ 5순위(여유) 로 보여요.
// 서버도 "1"~"5" 를 받아서 같은 값으로 바꿔 저장해요.
import { esc, hm, toast } from "./util.js";
import { openDrop } from "./ctxmenu.js";

export const PRIOS = [
  { k: "max", n: 1, label: "1순위", desc: "가장 급함" },
  { k: "xhigh", n: 2, label: "2순위", desc: "중요" },
  { k: "high", n: 3, label: "3순위", desc: "보통" },
  { k: "medium", n: 4, label: "4순위", desc: "나중에" },
  { k: "low", n: 5, label: "5순위", desc: "여유" },
];
const BY_K = Object.fromEntries(PRIOS.map((p) => [p.k, p]));
export const prioOf = (k) => BY_K[k] || null;
export const prioLabel = (k) => BY_K[k]?.label || "";
// 정렬용: 1순위가 가장 큰 값 (높은 것부터)
export const PRIO_RANK = { max: 5, xhigh: 4, high: 3, medium: 2, low: 1 };

// 추가 입력줄의 <select> — 비어 있으면 "우선순위"
export const prioSelect = (name = "priority", cur = "", cls = "select sm prio-sel") =>
  `<select class="${cls}" name="${name}" aria-label="우선순위"><option value="">우선순위</option>${PRIOS.map((p) => `<option value="${p.k}" ${cur === p.k ? "selected" : ""}>${p.label} · ${p.desc}</option>`).join("")}</select>`;

// 목록 줄의 알약 — 누르면 아래로 펼쳐져요 (openPrioDrop)
export const prioPill = (p, attr = "data-prio") =>
  `<button type="button" class="prio" ${attr}="${esc(p.id)}" data-p="${p.priority || ""}" aria-haspopup="menu" title="우선순위 고르기">${p.priority ? prioLabel(p.priority) : "우선순위"}</button>`;

export function openPrioDrop(anchor, cur, onPick) {
  openDrop(anchor, {
    label: "우선순위",
    items: [
      ...PRIOS.map((p) => ({ v: p.k, label: p.label, sub: p.desc, p: p.k, on: cur === p.k })),
      ...(cur ? [{ v: "", label: "없음", sub: "우선순위 지우기", on: false, clear: true }] : []),
    ],
    onPick,
  });
}

// ---------- 예상 시간 (체크리스트 — 시각 없이 '몇 시간 할지'만) ----------
export const HOURS = [30, 60, 90, 120, 180, 240, 300, 360, 480];
const hoursList = (cur) => (cur && !HOURS.includes(cur) ? [...HOURS, cur].sort((a, b) => a - b) : HOURS);

export const hoursSelect = (name = "mins", cur = null, cls = "select sm hours-sel") =>
  `<select class="${cls}" name="${name}" aria-label="예상 시간"><option value="">시간</option>${hoursList(cur).map((m) => `<option value="${m}" ${cur === m ? "selected" : ""}>${hm(m)}</option>`).join("")}<option value="custom">직접 입력…</option></select>`;

// 직접 적은 시간 읽기 → 분 (5분 단위, 5분~24시간). 못 읽으면 null
//   "1.5" · "2" (15 미만의 숫자 = 시간) · "90" (15 이상 = 분) · "1:30" · "1시간 30분" · "2h" · "45m" · "90분"
export function parseMins(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  let m = null, x;
  if ((x = s.match(/^(\d{1,2}):([0-5]\d)$/))) m = +x[1] * 60 + +x[2];
  else if ((x = s.match(/^(\d+(?:\.\d+)?) ?(?:시간|h|hr|hrs|시)(?: ?(\d+) ?(?:분|m|min)?)?$/))) m = +x[1] * 60 + (+x[2] || 0);
  else if ((x = s.match(/^(\d+(?:\.\d+)?) ?(?:분|m|min|mins)$/))) m = +x[1];
  else if ((x = s.match(/^(\d+(?:\.\d+)?)$/))) m = +x[1] < 15 ? +x[1] * 60 : +x[1];
  else if ((x = s.match(/^(\d+) ?분?반$/)) || (x = s.match(/^(\d+) ?시간 ?반$/))) m = +x[1] * 60 + 30;
  if (m === null || !isFinite(m)) return null;
  m = Math.round(m / 5) * 5;
  return m >= 5 && m <= 1440 ? m : null;
}
export const MINS_HINT = "예: 1.5 · 2시간 · 90분 · 1:30";

// 알약 자리에 작은 입력칸을 띄워 직접 적기. Enter = 저장 · Esc · 빈 채로 나가기 = 취소
export function inlineMins(anchor, cur, onPick) {
  const inp = document.createElement("input");
  inp.className = "input hrs-in"; inp.placeholder = MINS_HINT; inp.setAttribute("aria-label", "예상 시간 직접 입력"); inp.autocomplete = "off"; inp.inputMode = "decimal";
  inp.value = cur ? hm(cur) : "";
  anchor.hidden = true; anchor.after(inp); inp.focus(); inp.select();
  let fin = false;
  const finish = (commit, byBlur = false) => {
    if (fin) return;
    if (commit) {
      const v = inp.value.trim();
      if (v) {
        const m = parseMins(v);
        if (m !== null) { fin = true; inp.remove(); anchor.hidden = false; onPick(m); return; }
        toast(`시간을 못 읽었어요. ${MINS_HINT}`, "err");
        if (!byBlur) { inp.focus(); inp.select(); return; } // Enter 였으면 고쳐 적게 그대로 둬요
      }
    }
    fin = true; inp.remove(); anchor.hidden = false; if (!byBlur) anchor.focus?.({ preventScroll: true });
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); finish(true); } if (e.key === "Escape") { e.stopPropagation(); finish(false); } });
  inp.addEventListener("blur", () => setTimeout(() => finish(true, true), 0));
}

// 목록의 예상 시간 합계 (시각 있는 일정도 mins 가 있으면 같이)
export const sumMins = (list) => list.reduce((a, p) => a + (p.mins || 0), 0);

export const hoursPill = (p, attr = "data-hours") =>
  `<button type="button" class="prio hrs ${p.mins ? "" : "none"}" ${attr}="${esc(p.id)}" aria-haspopup="menu" title="예상 시간 고르기">${p.mins ? hm(p.mins) : "시간"}</button>`;

export function openHoursDrop(anchor, cur, onPick) {
  openDrop(anchor, {
    label: "예상 시간",
    items: [
      ...hoursList(cur).map((m) => ({ v: String(m), label: hm(m), on: cur === m })),
      { v: "custom", label: "직접 입력…", sub: "1.5 · 90분" },
      ...(cur ? [{ v: "", label: "없음", sub: "시간 지우기", clear: true }] : []),
    ],
    onPick: (v) => (v === "custom" ? inlineMins(anchor, cur, onPick) : onPick(v === "" ? null : +v)),
  });
}

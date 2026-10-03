// 지금 활동 상태 — 인스타처럼 직접 골라요. 프로필 동그라미 오른쪽 위에 작게 떠요.
// coding 이면 쓰는 AI 도구의 픽셀 캐릭터(Claude 의 Clawd 풍 · Codex · Gemini)가, 그 밖엔 작은 점이 떠요.
export const STATUSES = ["coding", "working", "studying", "reading", "resting", "sleeping", "away"];
export const TOOLS = [
  { k: "claude", label: "Claude" },
  { k: "codex", label: "Codex" },
  { k: "gemini", label: "Gemini" },
];

// 픽셀 그림: # = 몸, e = 눈, . = 빈칸. 색은 줄마다 (그라데이션은 줄 단위로)
const SPRITES = {
  // Clawd 풍 — 주황 네모 게: 넓은 몸 · 옆 집게 · 다리 넷
  claude: { rows: ["..#######..", "..#e###e#..", "###########", "..#######..", "..#.#.#.#.."], colors: ["#D97757"] },
  // Codex — 파란 동글 펫: 둥근 몸 · 짧은 발
  codex: { rows: ["..#####..", ".#######.", "##e###e##", "#########", ".#######.", ".##...##."], colors: ["#5B8DEF", "#4A7BE0", "#3F6FD6", "#3563C8", "#2C57B8", "#244CA6"] },
  // Gemini — 반짝이 별: 위아래 파랑 → 보라 → 분홍
  gemini: { rows: ["....#....", "...###...", "..#e#e#..", "#########", "..#####..", "...###...", "....#...."], colors: ["#4285F4", "#5A7FEA", "#7A78DC", "#9B72CB", "#B46CB0", "#C86896", "#D96570"] },
};
const EYE = "#1d1d1f";

export function sprite(k, cls = "") {
  const sp = SPRITES[k]; if (!sp) return "";
  const w = Math.max(...sp.rows.map((r) => r.length)), h = sp.rows.length;
  let rects = "";
  sp.rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === "#") rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${sp.colors[Math.min(y, sp.colors.length - 1)]}"/>`;
    else if (c === "e") rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${EYE}"/>`;
  }));
  return `<svg class="px ${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

export const statusText = (st) => !st ? "" : st.s + (st.s === "coding" && st.tools?.length ? " · " + st.tools.map((t) => TOOLS.find((x) => x.k === t)?.label || t).join(", ") : "");

// 동그라미 안에 붙는 배지 (avatar() 가 불러요)
export function statusBadge(st) {
  if (!st || !STATUSES.includes(st.s)) return "";
  const chars = st.s === "coding" ? (st.tools || []).filter((t) => SPRITES[t]) : [];
  const inner = chars.length ? chars.map((t) => sprite(t)).join("") : `<i class="st-dot"></i>`;
  return `<span class="av-st${chars.length ? " chars" : ""}" data-s="${st.s}" title="${statusText(st)}">${inner}</span>`;
}

// 내 메뉴 안의 상태 고르기. onPick(next | null)
export function statusPicker(st) {
  const cur = st?.s || "", tools = st?.tools || [];
  return `<div class="st-pick" role="group" aria-label="지금 활동 상태">
    <div class="st-row">${STATUSES.map((s) => `<button type="button" class="st-chip" data-st="${s}" aria-pressed="${cur === s}">${s}</button>`).join("")}${cur ? `<button type="button" class="st-chip st-clear" data-st="">clear</button>` : ""}</div>
    ${cur === "coding" ? `<div class="st-row st-tools">${TOOLS.map((t) => `<button type="button" class="st-chip st-tool" data-tool="${t.k}" aria-pressed="${tools.includes(t.k)}">${sprite(t.k)}${t.label}</button>`).join("")}</div>` : ""}
  </div>`;
}

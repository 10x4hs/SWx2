// CIM 카드 그리기 — 교재 본문 정리(renderBody) · 카드 한 장(cardHtml) · 한 줄 요약 · AI 에 보낼 글
//   카드: 메타 줄(★ · 과목 장 · 핵심 · 쪽 · 개정 확인 · 내 밑줄) · 제목 · 본문 · 왜 이 공식(라임 왼쪽 선) · 그림 · 이야기
import { CH } from "./meta.js";
import { NOTES } from "./notes.js";
import { FIGS } from "./figs.js";
import { esc } from "./ui.js";

const REV = /예금자\s*보호|Gross-?up|그로스업|귀속법인세|증권거래세\s*세율/;
const FORM = /^[A-Za-zΔσβαΣ∑][^가-힣]{0,6}\s*[=≈]|^[^가-힣]*[=≈][^가-힣]*$/; // 한글 없이 '=' 가 있는 짧은 줄 = 공식
const STRUCT = /^(TIP$|예$|용어 알아두기$|▶|\(\d+\)|[①-⑳])/;

// 교재 본문 → 읽기 쉬운 HTML
//   TIP(라임 바탕) · 용어 알아두기 · 예(옅은 회색) · ▶/(1) 소제목 · ① 동그라미 목록 · ㉠ · • 하위 항목 · 공식(회색 가운데) · '|' 표(첫 칸 회색)
//   교재의 주석 상자 때문에 끊긴 줄("등가수익률" / "은 4.5% × 2 …")은 다시 이어 붙여요
// marks: 교재 사진에서 옮긴 '내 밑줄' 구절 — 본문에서 처음 나온 자리만 잉크 밑줄 (TIP 은 빼고)
export function renderBody(txt, marks) {
  const L = [];
  for (const raw of String(txt || "").split("\n")) {
    const l = raw.trim(), prev = L.length ? L[L.length - 1].trim() : null;
    const open = prev && l && !prev.includes("|") && !/[.:!?)다음함임됨]$/.test(prev);
    if (open && /^(은|는|이|가|을|를|의|로|으로|와|과|에|에서)\s/.test(l) && prev.length <= 14 && !STRUCT.test(prev)) L[L.length - 1] = prev + l;
    // 조사로 시작하는 줄은 새 문장이 아니에요 ("…1개월 수익률" / "을 표시할 것") — 길이와 상관없이 앞줄에 붙여요 ('이 ·가'는 "이 식은"처럼 문장 첫머리일 수 있어 빼요)
    else if (open && /^(은|는|을|를|의|로|으로|와|과|에|에서)\s/.test(l)) L[L.length - 1] = L[L.length - 1].replace(/\s+$/, "") + l;
    else L.push(raw);
  }
  const re = marks?.length ? new RegExp([...marks].sort((a, b) => b.length - a.length).map((m) => esc(m).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
  const seen = new Set(); // 같은 구절은 처음 나온 자리만 (교재에서 그은 곳이 한 군데라서)
  const E = (t) => (re ? esc(t).replace(re, (m) => (seen.has(m) ? m : (seen.add(m), `<mark class="c-my" title="내 밑줄">${m}</mark>`))) : esc(t));
  const out = [], tip = [], term = [], ex = [];
  let mode = "";
  const flushEx = () => { if (ex.length) { out.push(`<div class="c-box ex"><span class="bl">예시</span><p>${ex.map(E).join("<br>")}</p></div>`); ex.length = 0; } };

  // 표: 한 줄이 '|' 로 끝나면 그 행이 닫혀요. 칸 안의 여러 줄은 줄바꿈으로, '|' 앞의 짧은 줄은 그 행 첫 칸으로
  const table = (i) => {
    const rows = []; let cur = null;
    const add = (t) => { cur[cur.length - 1] += (cur[cur.length - 1] ? "\n" : "") + t; };
    for (; i < L.length; i++) {
      const l = L[i].trim();
      if (l === "|") { if (cur) { rows.push(cur); cur = null; } continue; }
      if (l.includes("|")) {
        l.split("|").forEach((sg, k) => { sg = sg.trim(); if (k === 0) { if (cur) { if (sg) add(sg); } else cur = [sg]; } else cur.push(sg); });
        if (/\|$/.test(l)) { cur.pop(); rows.push(cur); cur = null; }
        continue;
      }
      if (!l) { if (cur) continue; break; }
      if (cur) { if (/^(▶|TIP$)/.test(l)) { rows.push(cur); cur = null; break; } add(l); continue; }
      let j = i; while (j < L.length && j - i < 3 && L[j].trim() && L[j].trim().length <= 30 && !L[j].includes("|") && !STRUCT.test(L[j].trim())) j++;
      if (j > i && j < L.length && L[j].includes("|")) { cur = [l]; continue; }
      break;
    }
    if (cur) rows.push(cur);
    const R = rows.filter((r) => r.some((c) => c));
    if (R.length) {
      const n = Math.max(...R.map((r) => r.length)), C = (c) => E(c).replace(/\n/g, "<br>");
      const head = R.length > 1 && n > 1 && R[0].length === n && R[0].every((c) => c && c.length <= 12);
      const tr = (r, tag) => `<tr>${r.map((c, k) => `<${tag}${tag === "th" ? ' scope="col"' : ""}${k === r.length - 1 && r.length < n ? ` colspan="${n - r.length + 1}"` : ""}>${C(c)}</${tag}>`).join("")}</tr>`;
      out.push(`<div class="c-tw"><table class="c-tbl${n === 1 ? " one" : ""}">${head ? `<thead>${tr(R[0], "th")}</thead>` : ""}<tbody>${R.slice(head ? 1 : 0).map((r) => tr(r, "td")).join("")}</tbody></table></div>`);
    }
    return i;
  };

  for (let i = 0; i < L.length; i++) {
    const raw = L[i], l = raw.trim();
    if (l === "TIP") { mode = "tip"; continue; }
    if (l === "용어 알아두기") { mode = "term"; continue; }
    if (l === "예") { flushEx(); mode = "ex"; continue; }
    if (mode === "tip") { if (!l || /^\(\d+\)|^▶/.test(l)) mode = ""; else { tip.push(l); continue; } }
    if (mode === "term") { if (!l) { mode = ""; continue; } if (/^\(\d+\)|^▶/.test(l)) mode = ""; else { term.push(raw); continue; } }
    if (mode === "ex") { if (!l || /^\(\d+\)|^[①-⑳]|^▶/.test(l)) { flushEx(); mode = ""; } else { ex.push(l); continue; } }
    if (l.includes("|")) { i = table(i) - 1; continue; }
    if (!l || l.startsWith("▶ 핵심포인트")) continue;
    let m;
    const s = l.startsWith("▶") ? l.replace(/^▶\s*/, "") : null;
    if (s != null && (m = s.match(/^\((\d+)\)\s*(.*)$/))) out.push(`<h4 class="c-sub"><span class="no">${m[1]}</span><span>${E(m[2])}</span></h4>`);
    else if (s != null) out.push(`<h4 class="c-sub">${E(s)}</h4>`);
    else if ((m = l.match(/^\((\d+)\)\s*(.*)$/))) out.push(`<h4 class="c-sub"><span class="no">${m[1]}</span><span>${E(m[2])}</span></h4>`);
    else if ((m = l.match(/^([①-⑳])\s*(.*)$/))) out.push(`<div class="c-li"><span class="dot" aria-hidden="true"></span><span>${E(m[2])}</span></div>`);
    else if (/^[㉠-㉭ⓐ-ⓩ·•\-]/.test(l)) out.push(`<div class="c-li2">${E(l)}</div>`);
    else if (l.length < 70 && FORM.test(l)) out.push(`<div class="c-formula">${E(l)}</div>`);
    else out.push(`<p>${E(l)}</p>`);
  }
  flushEx();
  const termHtml = term.map((r) => (/^\S/.test(r) && r.trim().length <= 24 ? `<b>${E(r.trim())}</b>` : E(r.trim()))).join("<br>");
  return (tip.length ? `<div class="c-box tip"><span class="bl">TIP</span><p>${esc(tip.join(" "))}</p></div>` : "")
    + (term.length ? `<div class="c-box term"><span class="bl">용어 알아두기</span><p>${termHtml}</p></div>` : "")
    + (out.length ? `<div class="c-text">${out.join("")}</div>` : "");
}

// 왜 이 공식 — 라임 왼쪽 선 하나 (상자 없이)
const whyBox = (w) => `<section class="c-why" aria-label="왜 이 공식일까"><b>왜 이 공식일까 · ${esc(w.t.split("—")[0].trim())}</b><div class="c-formula">${esc(w.f).replace(/\n/g, "<br>")}</div><p>${esc(w.why)}</p><p class="ex"><span>숫자로</span> ${esc(w.ex)}</p><p class="hook">${esc(w.hook)}</p></section>`;

export const isRev = (p) => REV.test(p.b) || p.q.some((q) => REV.test(q.q + q.x));
const chId = (p) => p.key.slice(0, p.key.indexOf("-"));
export const chLabel = (id) => `${CH[id].s}과목 ${CH[id].c}장`;

// 카드 한 장 (그림은 mountFigs 로 붙여요)
export function cardHtml(p) {
  const id = chId(p), N = NOTES;
  return `<article class="c-kp" id="k-${p.key}" data-key="${p.key}">
    <div class="c-meta num">${p.st ? `<b aria-label="중요도 ${p.st}">${"★".repeat(p.st)}</b>` : ""}<span>${chLabel(id)} · 핵심 ${p.n}${p.pg ? ` · ${esc(p.pg)}쪽` : ""}</span>${isRev(p) ? `<span class="c-tag" title="최근 바뀐 숫자가 있을 수 있어요. 숫자 외우기에서 확인하세요.">개정 확인</span>` : ""}${p.marks?.length ? `<span class="c-tag soft" title="교재에 직접 그은 밑줄을 옮겨 왔어요">내 밑줄</span>` : ""}</div>
    <h2>${esc(p.t)}</h2>
    ${renderBody(p.b, p.marks) || `<p class="c-empty">본문을 준비하고 있어요.</p>`}
    ${N.WHY[p.key] ? whyBox(N.WHY[p.key]) : ""}
    ${N.FIGS[p.key] ? `<div class="c-fig" data-fig="${N.FIGS[p.key]}"></div>` : ""}
    ${N.STORY[p.key] ? `<aside class="c-box story"><span class="bl">이야기</span><p>${esc(N.STORY[p.key])}</p></aside>` : ""}
  </article>`;
}
export function mountFigs(scope) {
  scope.querySelectorAll("[data-fig]").forEach((d) => { try { FIGS[d.dataset.fig].mount(d); } catch (e) { console.warn(e); } });
}

// 떠올리기용 한 줄: TIP 이 있으면 TIP, 없으면 본문 첫 문장
export function summary(p) {
  const L = String(p.b || "").split("\n").map((l) => l.trim());
  const t = L.indexOf("TIP");
  if (t >= 0 && L[t + 1]) return L[t + 1];
  const first = L.find((l) => l && !/^(▶|TIP$|예$|용어 알아두기$)/.test(l) && !l.includes("|") && l.length > 8);
  return (first || p.t).replace(/^\(\d+\)\s*|^[①-⑳]\s*/, "");
}
// AI 에 보낼 카드 글 (표 기호 · 빈 줄 정리, 길이는 서버에서도 잘라요)
export const cardText = (p) => String(p.b || "").replace(/\n{2,}/g, "\n").replace(/\s*\|\s*/g, " | ").slice(0, 3500);

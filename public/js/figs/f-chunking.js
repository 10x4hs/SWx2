// 그림: 청킹 — 같은 회의 노트를 세 가지로 잘라 보기 (Vector & Graph 05 — 카드 5 ~ 7)
//   opts.mode = "fixed"(기본, 고정 길이 + 오버랩) | "recursive"(문단 → 줄 → 문장) | "structure"(헤딩을 따라).
//   노트는 120자 — 카드 5 의 예(1,200자 · 500자 · 오버랩 50자)를 10분의 1로 줄였어요. 칸 하나 = 글자 하나(줄바꿈 ↵ 도 한 글자).
import { svg, g, text, rect, line, el, anim, show, slider, readout, C, SERIES, SERIES_SOFT } from "./kit.js";

const DOC = "# 10/14 기획\n\n## 안건\nAI 답변을 붙일지 정했어요.\n\n## 결정 사항\n출시일은 11월 3일이에요. 근거 링크를 꼭 달아요.\n\n## 할 일\n민재는 표가 든 노트를 다시 수집해요. 나는 평가용 골든셋을 써요.";
const N = DOC.length; // 120
const ANS = { s: DOC.indexOf("출시일은"), e: DOC.indexOf("이에요.") + 4 }; // "출시일은 11월 3일이에요."
const TITLE = DOC.slice(2, DOC.indexOf("\n"));
const W = 600, H = 380, X0 = 28, CW = 21, RH = 34, BH = 12, Y0 = 18, COLS = 26; // 폰에서도 읽히게 칸을 크게 (긴 줄은 접어요)

// 글자 칸 자리 (긴 줄은 26칸에서 접어요 · 빈 줄은 낮게)
function layout() {
  const cells = [], rows = [];
  let col = 0, y = Y0, row = { y, h: RH, blank: false };
  rows.push(row);
  const newRow = (h, blank = false) => { y += row.h; row = { y, h, blank }; rows.push(row); col = 0; };
  for (let i = 0; i < N; i++) {
    const ch = DOC[i];
    if (col >= COLS && ch !== "\n") newRow(RH);
    cells.push({ i, ch, x: X0 + col * CW, y: row.y, h: row.h, row: rows.length - 1 });
    col++;
    if (ch === "\n") { const nextBlank = DOC[i + 1] === "\n"; newRow(nextBlank ? BH : RH, nextBlank); if (nextBlank) { row.blank = true; } }
  }
  return { cells, rows };
}
const L = layout();
// 빈 줄의 ↵ 는 낮은 줄에 그려요
for (const c of L.cells) if (c.ch === "\n" && DOC[c.i - 1] === "\n") c.blankNl = true;

// ---------- 자르는 방법 ----------
// 고정 길이: 카드의 코드 그대로 — range(0, len, size − overlap) 마다 [i, i + size)
const fixedChunks = (size, ov) => { const step = Math.max(1, size - ov), out = []; for (let i = 0; i < N; i += step) out.push({ s: i, e: Math.min(N, i + size) }); return out; };
// 재귀 분할: 문단(빈 줄) → 줄 → 문장(마침표) → 단어. 크기를 넘는 조각만 다음 경계로 (카드 6 의 설명대로, 다시 합치지는 않아요)
const SEPS = [/\n\n/g, /\n/g, /(?<=\.) +/g, / +/g];
function splitBy(s, e, re) {
  const t = DOC.slice(s, e), out = []; let last = 0; re.lastIndex = 0; let m;
  while ((m = re.exec(t))) { if (m.index > last) out.push([s + last, s + m.index]); last = m.index + m[0].length; }
  if (last < t.length) out.push([s + last, e]);
  return out;
}
function tree(size) {
  const node = (s, e, level) => {
    const fit = e - s <= size, n = { s, e, level, fit, kids: null };
    if (!fit && level < 4) {
      let lv = level + 1, parts = splitBy(s, e, SEPS[lv - 1]);
      while (parts.length < 2 && lv < 4) { lv++; parts = splitBy(s, e, SEPS[lv - 1]); }
      if (parts.length > 1) n.kids = parts.map(([a, b]) => node(a, b, lv));
    }
    return n;
  };
  return splitBy(0, N, SEPS[0]).map(([a, b]) => node(a, b, 1));
}
// 깊이 D 까지 내려간 모습: 조각(맞음) · 너무 긴 조각(빨간 점선)
function recursiveView(size, D) {
  const chunks = [], long = [];
  const walk = (n) => { if (n.fit) chunks.push({ s: n.s, e: n.e, level: n.level }); else if (n.kids && n.kids[0].level <= D) n.kids.forEach(walk); else long.push({ s: n.s, e: n.e, level: n.level }); };
  tree(size).forEach(walk);
  return { chunks, long, deepest: Math.max(...chunks.map((c) => c.level), 1) };
}
// 구조: '## ' 헤딩마다 한 조각 (헤딩 + 그 아래 내용) · 맨 위 제목은 경로에 들어가요
function sections() {
  const out = []; let at = DOC.indexOf("\n## ");
  while (at >= 0) {
    const s = at + 1, next = DOC.indexOf("\n\n## ", s), e = next >= 0 ? next : N;
    out.push({ s, e, head: DOC.slice(s + 3, DOC.indexOf("\n", s)) });
    at = next >= 0 ? next + 1 : -1;
  }
  return out;
}
const SECS = sections();
const cutWhole = (chunks) => chunks.findIndex((c) => c.s <= ANS.s && c.e >= ANS.e);

const STEPS = {
  fixed: [
    { cap: `글을 일정한 길이로 잘라요. 이 노트는 ${N}자라서, 카드의 예(1,200자를 500자씩)를 10분의 1로 줄여 50자씩 잘라요(파랑 · 주황 · 초록 조각). 의미는 안 보고 글자 수만 세요.`, size: 50, ov: 0 },
    { cap: "겹침이 없으면 '출시일은 / 11월 3일'처럼 문장이 경계에서 잘려요. 어느 조각에도 답이 온전히 안 남아요.", size: 50, ov: 0, ans: 1 },
    { cap: `오버랩 5자를 주면 다음 조각이 5자 앞에서 시작해요(시작 ${fixedChunks(50, 5).map((c) => c.s).join(", ")}). 잘렸던 문장이 주황 조각 안에 통째로 들어가요. 노란 칸이 겹친 글자예요.`, size: 50, ov: 5, ans: 1 },
    { cap: "이제 직접 크기와 오버랩을 바꿔 보세요. 시작 위치는 '크기 − 오버랩'씩 앞으로 가요. 표나 코드 한가운데도 그냥 잘려요.", size: 50, ov: 5, ans: 1, free: 1 },
  ],
  recursive: [
    { cap: "먼저 빈 줄(문단)로 나눠요. 크기 30자 안에 드는 문단은 그대로 한 조각이에요(파란 조각). 넘치는 문단은 빨간 점선이에요.", size: 30, D: 1 },
    { cap: "30자를 넘는 문단만 줄바꿈으로 다시 나눠요(주황 조각). 짧은 문단은 건드리지 않아요.", size: 30, D: 2 },
    { cap: "그래도 넘치는 줄은 마침표(문장)로 나눠요(초록 조각). 그래서 문장이 중간에서 잘리지 않아요.", size: 30, D: 3 },
    { cap: "이제 직접 크기를 바꿔 보세요. 작을수록 더 작은 경계까지 내려가요. 제목 줄이 혼자 떨어지는 것도 보여요.", size: 30, D: 4, free: 1 },
  ],
  structure: [
    { cap: "마크다운 헤딩(##)이 이미 경계를 알려 줘요. 헤딩 하나와 그 아래 내용을 한 조각으로 묶어요.", path: 0 },
    { cap: `조각마다 앞에 헤딩 경로 '회의: ${TITLE} > 결정 사항' 같은 이름표를 붙여요.`, path: 1 },
    { cap: `그러면 '결정 사항'처럼 짧은 조각도 어느 회의(${TITLE})의 것인지 조각 안에 남아서 검색에 잡혀요.`, path: 1, query: 1 },
  ],
};
const modeOf = (o) => (STEPS[o.mode] ? o.mode : "fixed");
const LVNAME = ["", "문단", "줄", "문장", "단어"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  aspect: H / W,
  steps: (o) => STEPS[modeOf(o)].map((s) => s.cap),
  hint: "",
  mount(stage, f) {
    const mode = modeOf(f.opts), steps = STEPS[mode];
    const s = svg(stage, W, H, "회의 노트 120자를 칸에 한 글자씩 놓고, 조각(청크)을 색칠한 그림");
    let alive = true;
    const live = (i) => alive && f.step() === i;
    const bgG = g(s), markG = g(s), txtG = g(s), topG = g(s);
    // 글자
    for (const c of L.cells) {
      if (c.ch === "\n") { if (mode === "fixed") text(txtG, c.x + CW / 2, c.y + c.h / 2, "↵", { size: c.blankNl ? 11 : 15, anchor: "middle", fill: C.mute }); continue; }
      if (c.ch === " ") continue;
      text(txtG, c.x + CW / 2, c.y + c.h / 2 + 1, c.ch, { size: 18, anchor: "middle", weight: c.ch === "#" ? 700 : 500, fill: /#/.test(c.ch) ? C.sub : C.ink });
    }
    // 원고지처럼 아주 옅은 칸 (고정 길이만 — 글자 수를 세는 게 핵심이라서)
    if (mode === "fixed") for (const c of L.cells) el(bgG, "rect", { x: c.x + 0.5, y: c.y + 2, width: CW - 1, height: c.h - 4, rx: 2, fill: "none", stroke: C.grid, "stroke-width": 0.8 });
    const chunkG = g(bgG);

    // 칸 묶음(줄마다 이어진 칸) → 사각형들
    const runs = (a, b) => { const out = []; let cur = null; for (let i = a; i < b; i++) { const c = L.cells[i]; if (cur && cur.row === c.row && c.x === cur.x2) { cur.x2 = c.x + CW; } else { cur = { row: c.row, x: c.x, x2: c.x + CW, y: c.y, h: c.h }; out.push(cur); } } return out; };
    function fillRuns(a, b, fill, o = {}) {
      for (const r of runs(a, b)) {
        const y = o.half === 1 ? r.y + 2 : o.half === 2 ? r.y + r.h / 2 : r.y + 2, h = o.half ? r.h / 2 - 2 : r.h - 4;
        const e = rect(chunkG, r.x, y, r.x2 - r.x, h, { r: 3, fill, stroke: o.stroke || null, sw: o.sw || null });
        if (o.dash) e.setAttribute("stroke-dasharray", o.dash);
      }
    }
    // 조각 하나 = 글 선택처럼 한 덩어리 모양 (위아래 줄이 붙어 있어요) — 같은 색 조각이 붙어 있어도 테두리로 나뉘어 보여요
    function shape(a, b, fill, stroke, o = {}) {
      const rs = runs(a, b); if (!rs.length) return;
      const n = rs.length, top = rs[0].y + 2, bot = rs[n - 1].y + rs[n - 1].h - 2;
      const yT = (k) => (k === 0 ? top : rs[k].y), yB = (k) => (k === n - 1 ? bot : rs[k].y + rs[k].h);
      const P = [[rs[0].x, top], [rs[0].x2, top]];
      for (let k = 0; k < n; k++) { P.push([rs[k].x2, yB(k)]); if (k < n - 1) P.push([rs[k + 1].x2, yB(k)]); }
      P.push([rs[n - 1].x, bot]);
      for (let k = n - 1; k > 0; k--) { P.push([rs[k].x, yT(k)]); P.push([rs[k - 1].x, yT(k)]); }
      const d = "M" + P.map((q) => q.join(",")).join(" L") + " Z";
      el(o.parent || chunkG, "path", { d, fill, stroke, "stroke-width": o.width || 1.6, "stroke-linejoin": "round" });
    }
    function underline(a, b, col, off) { for (const r of runs(a, b)) el(chunkG, "line", { x1: r.x + 1, y1: r.y + r.h - 1 + off, x2: r.x2 - 1, y2: r.y + r.h - 1 + off, stroke: col, "stroke-width": 3, "stroke-linecap": "round" }); }
    function outline(a, b, col, dash) { for (const r of runs(a, b)) { const e = rect(markG, r.x - 1, r.y + 1, r.x2 - r.x + 2, r.h - 2, { r: 4, fill: "none", stroke: col, sw: 2.2 }); if (dash) e.setAttribute("stroke-dasharray", dash); } }
    function tag(i, label, col) { const c = L.cells[i]; const w = 12 + String(label).length * 8; rect(markG, c.x, c.y - 16, w, 15, { r: 7, fill: col }); text(markG, c.x + w / 2, c.y - 8, String(label), { size: 14, anchor: "middle", weight: 700, fill: C.bg }); }
    function cutMark(i, col) { // i 번째 글자 앞에 가위 줄
      const c = L.cells[Math.min(i, N - 1)], x = i >= N ? L.cells[N - 1].x + CW : c.x;
      el(markG, "line", { x1: x, y1: c.y - 3, x2: x, y2: c.y + c.h + 3, stroke: col, "stroke-width": 2.4, "stroke-linecap": "round" });
    }
    // 글자 폭은 브라우저에게 물어봐요 (못 재면 어림값)
    function measure(t, from, n, guess) { try { return n === t.textContent.length && from === 0 ? t.getComputedTextLength() : t.getSubStringLength(from, n); } catch { return guess; } }
    function markWord(parent, t, str, word, x, y) {
      const at = str.indexOf(word); if (at < 0) return;
      const x0 = at ? measure(t, 0, at, at * 9) : 0, w = measure(t, at, word.length, word.length * 9);
      parent.insertBefore(rect(parent, x + x0 - 2, y - 10, w + 4, 20, { r: 4, fill: C.hi }), t);
    }
    const ctl = f.controls();
    let size = steps[0].size, ov = steps[0].ov || 0, stepNow = 0, touched = false; // touched: 다이얼을 직접 움직였나 (안 움직였으면 앞 단계 설정 그대로)
    let sz = null, ovs = null;
    if (mode === "fixed") {
      // 오버랩은 크기의 절반까지만 (더 크면 조각이 너무 많아져요)
      sz = slider(ctl, { label: "크기", min: 10, max: 60, step: 5, value: 50, fmt: (v) => `${v}자` }, (v) => { size = v; if (ov > size / 2) { ov = Math.floor(size / 2); ovs.set(ov); } toFree(); });
      ovs = slider(ctl, { label: "오버랩", min: 0, max: 20, step: 1, value: 0, fmt: (v) => `${v}자` }, (v) => { ov = Math.min(v, Math.floor(size / 2)); if (ov !== v) ovs.set(ov); toFree(); });
    } else if (mode === "recursive") {
      sz = slider(ctl, { label: "크기", min: 21, max: 60, step: 1, value: 30, fmt: (v) => `${v}자` }, (v) => { size = v; toFree(); });
    }
    const ro = readout(ctl);
    function toFree() { touched = true; const last = steps.length - 1; if (stepNow !== last) f.goto(last); else draw(last); }

    // ---------- 그리기 ----------
    function draw(i, o = {}) {
      stepNow = i; const st = steps[i];
      chunkG.replaceChildren(); markG.replaceChildren(); topG.replaceChildren();
      if (mode === "fixed") return drawFixed(st, o);
      if (mode === "recursive") return drawRecursive(st, o);
      return drawStructure(st, o);
    }
    function drawFixed(st, o) {
      if (!(st.free && touched)) { size = st.size; ov = st.ov; sz?.set(size); ovs?.set(ov); }
      const sizeNow = size, ovNow = o.ov ?? ov;
      const ch = fixedChunks(sizeNow, ovNow);
      const cover = new Array(N).fill(0); ch.forEach((c) => { for (let i = c.s; i < c.e; i++) cover[i]++; });
      ch.forEach((c, k) => {
        const col = k % 3;
        // 겹친 글자는 노란 칸, 나머지는 조각 색
        let a = c.s;
        for (let i = c.s; i <= c.e; i++) {
          const over = i < c.e && cover[i] > 1;
          if (i === c.e || over !== (cover[a] > 1)) { if (i > a) fillRuns(a, i, cover[a] > 1 ? C.hi : SERIES_SOFT[col]); a = i; }
        }
        underline(c.s, c.e, SERIES[col], k % 2 ? 5 : 0);
      });
      for (const c of ch) if (c.e < N) cutMark(c.e, SERIES[ch.indexOf(c) % 3]);
      const whole = cutWhole(ch);
      if (st.ans) { // 답 문장: 초록 테두리 = 한 조각 안에 통째로 · 빨강 = 잘림
        const col = whole >= 0 ? C.ok : C.no, c = L.cells[ANS.e - 1];
        outline(ANS.s, ANS.e, col);
        el(markG, "circle", { cx: c.x + CW, cy: c.y + 2, r: 9, fill: col });
        text(markG, c.x + CW, c.y + 3, whole >= 0 ? "✓" : "✕", { size: 13, anchor: "middle", weight: 700, fill: C.bg });
      }
      const step = Math.max(1, sizeNow - ovNow);
      const CLS3 = ["a", "b", "c"], list = ch.length <= 6 ? ch.map((c, k) => `<span class="${CLS3[k % 3]}">조각 ${k + 1}</span> ${c.s}–${c.e - 1}`).join(" · ") : `시작 ${ch.map((c) => c.s).join(", ")}`;
      ro.set(`<div>크기 <b>${sizeNow}</b> · 오버랩 <b>${ovNow}</b> → 한 번에 ${step}자씩 앞으로 → 조각 <b>${ch.length}</b>개</div><div>${list}</div>
        ${st.ans ? `<div>'출시일은 11월 3일이에요.' → ${whole >= 0 ? `<span style="color:var(--fg-ok);font-weight:700">조각 ${whole + 1} 안에 통째로 ✓</span>` : `<span style="color:var(--fg-no);font-weight:700">조각 ${ch.findIndex((c) => c.e > ANS.s && c.s <= ANS.s) + 1} · ${ch.findIndex((c) => c.s > ANS.s && c.s < ANS.e) + 1}로 잘림 ✕</span>`}</div>` : ""}
        <div class="dim">${N}자 노트 · ↵ 줄바꿈도 한 글자 · 노란 칸 = 두 조각에 다 들어간 글자(겹침)</div>`);
    }
    function drawRecursive(st, o) {
      if (!(st.free && touched)) { size = st.size; sz?.set(size); }
      const sizeNow = size;
      const D = o.D ?? st.D, v = recursiveView(sizeNow, D);
      v.chunks.forEach((c) => { const col = c.level - 1; shape(c.s, c.e, SERIES_SOFT[col], SERIES[col]); });
      v.long.forEach((c) => {
        outline(c.s, c.e, C.no, "5 4");
        const rr = runs(c.s, c.e).sort((a, b) => a.x2 - b.x2)[0]; // 오른쪽이 가장 많이 빈 줄
        text(markG, rr.x2 + 10, rr.y + rr.h / 2, `${c.e - c.s}자 > ${sizeNow}자`, { size: 14, weight: 700, fill: C.no, cls: "halo" });
      });
      const used = [1, 2, 3, 4].map((lv) => v.chunks.some((c) => c.level === lv));
      const ladder = [1, 2, 3, 4].map((lv) => { const cls = ["", "a", "b", "c", "d"][lv]; return used[lv - 1] ? `<span class="${cls}">${LVNAME[lv]}</span>` : `<span class="dim">${LVNAME[lv]}</span>`; }).join(" → ");
      const lens = v.chunks.map((c) => c.e - c.s);
      ro.set(`<div>크기 <b>${sizeNow}</b>자 · 경계 순서: ${ladder}</div><div>조각 <b>${v.chunks.length}</b>개 (${lens.join(", ")}자)${v.long.length ? ` · <span style="color:var(--fg-no);font-weight:700">아직 넘치는 조각 ${v.long.length}개</span>` : ""}</div>${st.free && !used[3] ? `<div class="dim">단어 단계는 이 노트에선 안 써요 — 가장 긴 문장이 ${Math.max(...splitBy(0, N, /(?<=\.) +|\n+/g).map(([a, b]) => b - a))}자예요</div>` : ""}`);
    }
    function drawStructure(st, o) {
      const prog = o.p ?? 1;
      SECS.forEach((sec, k) => shape(sec.s, sec.e, SERIES_SOFT[k], SERIES[k]));
      // 제목 줄: 조각이 아니라 경로의 앞부분
      const t = L.cells[0], tEnd = L.cells[DOC.indexOf("\n") - 1];
      text(markG, tEnd.x + CW + 10, t.y + t.h / 2, "← 제목 (경로의 맨 앞)", { size: 14, weight: 600, fill: C.mute });
      if (st.path) SECS.forEach((sec, k) => {
        const hEnd = L.cells[DOC.indexOf("\n", sec.s) - 1], x = hEnd.x + CW + 12, y = hEnd.y + hEnd.h / 2, label = `회의: ${TITLE} > ${sec.head}`;
        const gg = g(topG); gg.style.opacity = String(prog); gg.setAttribute("transform", `translate(${(1 - prog) * 16},0)`);
        const t = text(gg, x + 9, y + 1, label, { size: 14, weight: 700, fill: SERIES[k] });
        const box = rect(gg, x, y - 12, measure(t, 0, label.length, label.length * 11) + 18, 24, { r: 6, fill: C.bg, stroke: SERIES[k], sw: 1.6 });
        gg.insertBefore(box, t);
        if (st.query) markWord(gg, t, label, TITLE.split(" ")[0], x + 9, y); // 질문과 겹치는 글자 '10/14' 에 노란 칸
      });
      if (st.query) { // 질문 말풍선 (마지막 짧은 줄 오른쪽 빈자리)
        const last = L.cells[N - 1], qx = last.x + CW + 34, qy = last.y + last.h / 2, q = "질문: 10/14 회의에서 정한 것?";
        const t = text(topG, qx + 14, qy + 1, q, { size: 14, weight: 600, fill: C.ink });
        const box = rect(topG, qx, qy - 14, measure(t, 0, q.length, 230) + 28, 28, { r: 14, fill: C.soft, stroke: C.line, sw: 1.2 });
        topG.insertBefore(box, t); markWord(topG, t, q, "10/14", qx + 14, qy);
        const dec = SECS.find((x) => x.head === "결정 사항");
        shape(dec.s, dec.e, "none", C.ink, { parent: markG, width: 3 });
      }
      ro.set(st.query
        ? `<div>질문의 '10/14' 는 <span class="b">결정 사항</span> 조각의 본문엔 없지만, 붙인 경로 '회의: ${TITLE} > 결정 사항' 에 있어요 → 이 조각이 잡혀요</div>`
        : `<div>조각 ${SECS.length}개 — ${SECS.map((x, k) => `<span class="${["a", "b", "c"][k]}">${x.head}</span> (${x.e - x.s}자)`).join(" · ")}</div><div class="dim">${st.path ? "경로는 조각 앞에 붙여 같이 임베딩하고, 제목·날짜는 메타데이터로도 넣어요" : "길이가 달라도 괜찮아요 — 한 덩어리 의미가 기준이에요"}</div>`);
    }

    let shown = -1;
    async function go(i, animate) {
      const from = shown; shown = i;
      if (!animate || from !== i - 1) { draw(i); return; }
      const st = steps[i];
      if (mode === "fixed" && i === 2) { // 오버랩이 0 → 5 로: 다음 조각 시작이 한 칸씩 앞으로 미끄러져요
        for (let k = 0; k <= st.ov; k++) { if (!live(i)) break; draw(i, { ov: k }); await sleep(k === 0 ? 300 : 170); }
      } else if (mode === "recursive" && i <= 2) { // 넘치던 조각이 쪼개져요
        draw(i, { D: steps[i - 1].D }); await sleep(450);
      } else if (mode === "structure" && i === 1) {
        await anim(600, (t) => draw(i, { p: t }));
      }
      if (alive) draw(i);
    }
    return { go, destroy() { alive = false; } };
  },
};

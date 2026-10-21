// 그림: 열린 세계 vs 닫힌 세계 — "적혀 있지 않으면 거짓인가, 모르는 건가?"
//   작은 지식 저장소(홍길동 알레르기 페니실린 …)에 "홍길동은 아스피린 알레르기가 없나?"를 물어요.
//   닫힌 세계(보통 DB · SQL): 없으면 거짓 → "없어요". 열린 세계(OWL · RDF): 안 적혔을 뿐 → "몰라요".
//   아래 단추로 두 세계를 바꿔 보면 같은 데이터에 답이 달라져요. 새 사실이 오거나(④) 닫는 규칙을 적으면(⑤) 또 달라져요.
import { svg, g, text, rect, line, anim, choice, readout, C } from "./kit.js";

const BASE = [
  ["홍길동", "알레르기", "페니실린"],
  ["홍길동", "종류", "환자"],
  ["김영희", "알레르기", "아스피린"],
  ["홍길동", "처방받음", "타이레놀"],
];
const NEW = ["홍길동", "알레르기", "아스피린"];
const STEPS = [
  "저장소에 사실 4개가 있어요. 질문: '홍길동은 아스피린 알레르기가 없나?' — '홍길동 알레르기 아스피린'이라는 줄은 어디에도 없어요.",
  "닫힌 세계(보통 데이터베이스): 적힌 것만 참, 안 적힌 건 거짓으로 봐요. 그래서 답은 '네, 없어요'.",
  "열린 세계(OWL · 시맨틱 웹): 안 적혔다고 거짓은 아니에요. 아직 모를 뿐 — 답은 '몰라요'.",
  "다른 병원 기록에서 '홍길동 알레르기 아스피린'이 들어왔어요. 닫힌 세계는 아까 '없어요'라고 했던 게 틀린 답이 됐고, 열린 세계는 모순 없이 '네, 있어요'로 바뀌어요.",
  "열린 세계에서 '없다'를 확실히 말하려면 그렇게 적어야 해요: '홍길동의 알레르기는 페니실린뿐이다'(닫는 규칙). 그러면 '없어요'가 확실한 답이 돼요.",
];

export default {
  aspect: 360 / 640,
  aspectNarrow: 580 / 380,
  steps: STEPS,
  hint: "아래 단추로 두 세계를 바꿔 보세요",
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 640, H = nar ? 580 : 360;
    const s = svg(stage, W, H, "작은 지식 저장소에 같은 질문을 했을 때 닫힌 세계와 열린 세계의 답");
    const kbG = g(s), qG = g(s), ctl = f.controls();
    let mode = "cwa", stepNow = 0;
    const pick = choice(ctl, [["cwa", "닫힌 세계 (DB)"], ["owa", "열린 세계 (OWL)"]], mode, (k) => {
      mode = k;
      if (stepNow === 1 || stepNow === 2 || stepNow === 0) f.goto(k === "cwa" ? 1 : 2); else draw(stepNow, true);
    }, "세계 고르기");
    const ro = readout(ctl);
    // 저장소 판
    const K = nar ? { x: 14, y: 12, w: 352, rh: 30 } : { x: 18, y: 20, w: 300, rh: 34 };
    const Q = nar ? { x: 14, y: 262, w: 352, h: 304 } : { x: 336, y: 20, w: 288, h: 322 };

    function answer(i) {
      if (i === 0) return { big: "?", c: C.mute, why: "아직 답하지 않았어요" };
      if (i === 3) return mode === "cwa" ? { big: "네, 있어요", c: C.c, why: "아까는 '없어요'라 했는데 — 틀렸던 거예요", warn: true } : { big: "네, 있어요", c: C.c, why: "아까 '몰라요'였으니 모순이 없어요" };
      if (i === 4) return mode === "cwa" ? { big: "네, 없어요", c: C.b, why: "닫힌 세계는 원래 '없음 = 거짓'이라 같은 답" } : { big: "네, 없어요 (확실)", c: C.b, why: "'페니실린뿐'이라고 적혀 있으니까요" };
      return mode === "cwa" ? { big: "네, 없어요", c: C.b, why: "적힌 게 없으니 거짓 → 알레르기 없음" } : { big: "몰라요", c: C.d, why: "적힌 게 없을 뿐, 거짓이라는 증거도 없어요" };
    }
    function draw(i, animate) {
      kbG.replaceChildren(); qG.replaceChildren();
      const facts = i >= 3 && i !== 4 ? [...BASE, NEW] : BASE;
      const closing = i === 4;
      // 저장소
      const kh = (facts.length + (closing ? 1 : 0)) * K.rh + 40;
      rect(kbG, K.x, K.y, K.w, kh, { r: 8, fill: C.soft, stroke: C.grid, sw: 1 });
      text(kbG, K.x + 12, K.y + 18, "지식 저장소", { size: 13, weight: 700, fill: C.sub });
      const fresh = [];
      facts.forEach((t, k) => {
        const y = K.y + 44 + k * K.rh, isNew = t === NEW, rowG = g(kbG);
        const hit = i >= 1 && t[0] === "홍길동" && t[1] === "알레르기";
        if (isNew) rect(rowG, K.x + 6, y - K.rh / 2 + 3, K.w - 12, K.rh - 6, { r: 4, fill: C.cSoft, stroke: C.c, sw: 1.2 });
        const cw = nar ? [62, 64] : [62, 74];
        text(rowG, K.x + 16, y, t[0], { size: 14, weight: 700 });
        text(rowG, K.x + 16 + cw[0], y, "–" + t[1] + "→", { size: 13, weight: 600, fill: C.a });
        text(rowG, K.x + 16 + cw[0] + cw[1] + 14, y, t[2], { size: 14, weight: 600 });
        if (hit && i < 4) text(rowG, K.x + K.w - 14, y, t[2] === "아스피린" ? "✓ 찾음" : "✗ 아님", { size: 12.5, anchor: "end", weight: 700, fill: t[2] === "아스피린" ? C.c : C.mute });
        if (isNew) fresh.push(rowG);
      });
      if (closing) {
        const y = K.y + 44 + facts.length * K.rh, cg = g(kbG);
        rect(cg, K.x + 6, y - K.rh / 2 + 3, K.w - 12, K.rh - 6, { r: 4, fill: C.bSoft, stroke: C.b, sw: 1.2 });
        text(cg, K.x + 16, y, nar ? "규칙: 홍길동 알레르기 = {페니실린}뿐" : "규칙: 홍길동 알레르기 = {페니실린}뿐", { size: 13, weight: 700, fill: C.b });
        fresh.push(cg);
      }
      // 질문 · 답
      rect(qG, Q.x, Q.y, Q.w, Q.h, { r: 8, fill: C.bg, stroke: C.line, sw: 1.2 });
      text(qG, Q.x + 14, Q.y + 22, "질문", { size: 13, weight: 700, fill: C.sub });
      text(qG, Q.x + 14, Q.y + 50, "홍길동은 아스피린", { size: 16, weight: 700 });
      text(qG, Q.x + 14, Q.y + 74, "알레르기가 없나?", { size: 16, weight: 700 });
      line(qG, Q.x + 14, Q.y + 96, Q.x + Q.w - 14, Q.y + 96, { color: C.grid });
      const showMode = i === 0 ? null : mode;
      text(qG, Q.x + 14, Q.y + 118, showMode === "cwa" ? "닫힌 세계의 답" : showMode === "owa" ? "열린 세계의 답" : "답", { size: 13, weight: 700, fill: showMode === "cwa" ? C.b : showMode === "owa" ? C.d : C.sub });
      const a = answer(i), ag = g(qG);
      text(ag, Q.x + 14, Q.y + 152, a.big, { size: nar ? 24 : 26, weight: 800, fill: a.c });
      const why = a.why, cut = nar ? 22 : 19;
      const wl = why.length > cut ? [why.slice(0, why.lastIndexOf(" ", cut) > 0 ? why.lastIndexOf(" ", cut) : cut), why.slice((why.lastIndexOf(" ", cut) > 0 ? why.lastIndexOf(" ", cut) : cut)).trim()] : [why];
      wl.forEach((l, k) => text(ag, Q.x + 14, Q.y + 188 + k * 22, l, { size: 13.5, weight: 600, fill: a.warn ? C.no : C.sub }));
      fresh.push(ag);
      if (i > 0) {
        // 두 세계를 나란히 (지금 고른 쪽이 진해요)
        const cy = Q.y + Q.h - 58, keep = mode, cg = g(qG);
        line(cg, Q.x + 14, cy - 14, Q.x + Q.w - 14, cy - 14, { color: C.grid });
        text(cg, Q.x + 14, cy + 4, "같은 질문, 두 세계", { size: 12, weight: 700, fill: C.mute });
        [["cwa", "닫힌", C.b], ["owa", "열린", C.d]].forEach(([m, nm, col], k) => {
          mode = m; const r = answer(i); mode = keep;
          const x = Q.x + 14 + k * (Q.w - 28) / 2, on = m === keep;
          text(cg, x, cy + 30, nm + ": " + r.big, { size: 14, weight: on ? 800 : 600, fill: on ? col : C.mute });
        });
      }
      pick.el.querySelectorAll("button").forEach((b) => (b.disabled = false));
      pick.set(mode);
      if (animate && fresh.length) { fresh.forEach((e) => (e.style.opacity = "0")); return anim(420, (t) => fresh.forEach((e) => (e.style.opacity = String(t)))).then(() => fresh.forEach((e) => (e.style.opacity = ""))); }
    }
    const READ = (i) => [
      `<div>찾는 줄: <b>홍길동 –알레르기→ 아스피린</b> — <span class="dim">저장소에 없어요</span></div>`,
      `<div><span class="b">닫힌 세계 가정(CWA)</span>: 저장소 = 세상 전부. 없으면 거짓 — <span class="dim">SQL 의 NOT EXISTS 가 이렇게 답해요</span></div>`,
      `<div><span class="d">열린 세계 가정(OWA)</span>: 저장소 = 세상의 일부. 없으면 '모름' — <span class="dim">여러 출처를 합치는 웹 · 지식그래프에 맞아요</span></div>`,
      `<div>새 사실 하나로 <span class="b">닫힌 세계</span>는 앞의 답을 뒤집었고, <span class="d">열린 세계</span>는 '모름 → 있음'으로 채웠을 뿐이에요</div>`,
      `<div>열린 세계에서도 <span class="b">닫는 규칙</span>(이것뿐 · 최대 몇 개)을 적으면 '없음'을 확실히 말할 수 있어요 — <span class="dim">알레르기 같은 안전 질문은 이렇게 해야 해요</span></div>`,
    ][i];
    return {
      go(i, animate) {
        stepNow = i;
        if (i === 1) mode = "cwa"; else if (i === 2) mode = "owa";
        ro.set(READ(i));
        return draw(i, animate);
      },
    };
  },
};

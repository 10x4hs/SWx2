// 그림: CI/CD 파이프라인 — 자동으로 도는 조립 라인 (Dev Flow 10 테스트와 배포 — 카드 5 · 6 · 7)
//   커밋(상자)이 빌드 → 단위 테스트 → 통합 테스트 → 스테이징 → 출시 버튼 → 운영을 차례로 지나요. 칸마다 일하고(막대) 통과(초록 ✓)하면 다음 칸으로.
//   테스트가 실패하면 그 칸이 빨개지고 라인이 멈춰요(main 빨간불). 고친 커밋이 들어오면 처음부터 다시 확인해요.
//   지속적 전달 = 출시 버튼을 사람이 눌러요 · 지속적 배포 = 버튼 없이 자동. 마지막 단계: [지속적 전달 | 지속적 배포] · 커밋 넣기 · 실패하는 커밋 넣기 · 출시 버튼
import { svg, g, text, line, circle, rect, path, loop, choice, readout, show, reduced, lerp, clamp, C } from "./kit.js";

const ST = [
  { t: "커밋", d: 0 },
  { t: "빌드", d: 650 },
  { t: "단위 테스트", two: ["단위", "테스트"], d: 650 },
  { t: "통합 테스트", two: ["통합", "테스트"], d: 750 },
  { t: "스테이징", d: 650 },
  { t: "출시 버튼", gate: 1, d: 0 },
  { t: "운영", d: 550 },
];
const GATE = 5, PROD = 6, MOVE = 360;
// 단계: mode(manual = 사람 버튼 · auto = 자동) · 들어올 커밋들 · cap(여기까지만) · 미리 깔린 상태 · 강조할 묶음(ci · cd · dep)
const STEPS = [
  { cap: "커밋을 합치면(push · PR) 파이프라인이 깨어나요. 변경(파란 상자)이 빌드 → 단위 테스트 → 통합 테스트를 자동으로 지나요.", mode: "manual", hi: "ci", toks: [{ n: 1, cap: 3 }] },
  { cap: "테스트가 하나라도 실패하면 그 칸이 빨개지고 라인이 멈춰요. main 이 빨간불이면 다른 일을 멈추고 이것부터 고쳐요.", mode: "manual", hi: "ci", toks: [{ n: 2, fail: 2 }] },
  { cap: "고친 커밋이 들어오면 처음부터 다시 확인해요. 모두 통과하면 운영과 닮은 스테이징까지 자동으로 가요.", mode: "manual", hi: "ci", pre: "red", toks: [{ n: 3, fix: 1, cap: 4 }] },
  { cap: "지속적 전달: 여기서 기다려요. 언제든 낼 수 있는 상태이고, 언제 낼지는 사람이 출시 버튼으로 정해요.", mode: "manual", hi: "cd", toks: [{ n: 3, fix: 1, from: 4 }], press: 1300 },
  { cap: "지속적 배포: 출시 버튼이 없어요. 파이프라인을 통과한 변경은 모두 자동으로 운영에 나가요.", mode: "auto", hi: "dep", toks: [{ n: 4 }], fast: 1.7 },
  { cap: "이제 직접 해 보세요. 전달과 배포를 고르고 커밋을 넣어 보세요. 실패하는 커밋도 넣어 볼 수 있어요.", user: 1 },
];
const LAST = STEPS.length - 1;
const SPAN = {
  ci: { a: 1, b: 3, t: "CI: 합칠 때마다 자동으로 빌드 · 테스트", tn: ["CI:", "합칠 때마다 자동으로", "빌드 · 테스트"] },
  cd: { a: 0, b: GATE, t: "지속적 전달: 언제든 낼 수 있게 준비 · 출시는 사람이 버튼", tn: ["지속적 전달:", "언제든 낼 수 있게 준비,", "출시는 사람이 버튼"] },
  dep: { a: 0, b: PROD, t: "지속적 배포: 통과하면 버튼 없이 운영까지 자동", tn: ["지속적 배포:", "통과하면 버튼 없이", "운영까지 자동"] },
};

export default {
  aspect: 330 / 580,
  aspectNarrow: 470 / 380,
  steps: STEPS.map((s) => s.cap),
  hint: "마지막 단계에서 커밋을 넣어 보세요",
  mount(stage, f) {
    const nar = !!f.narrow, W = nar ? 380 : 580, H = nar ? 470 : 330;
    const s = svg(stage, W, H, "커밋이 빌드, 테스트, 스테이징, 출시 버튼을 지나 운영으로 가는 파이프라인");
    // 칸 자리: 넓으면 한 줄로, 좁으면 위에서 아래로
    const BW = nar ? 150 : 62, BH = nar ? 42 : 52, BX0 = 20; // 좁은 판: 칸은 왼쪽 세로 줄, 상자는 칸 안 왼쪽에
    const at = (i) => (nar ? { x: BX0 + BW / 2, y: 30 + i * 61 + BH / 2 } : { x: 42 + i * 82.6, y: 128 });
    const rest = (i) => { const p = at(i); return nar ? [BX0 + 16, p.y] : [p.x, p.y - BH / 2 - 16]; }; // 상자가 서는 자리
    const trackG = g(s), boxG = g(s), spanG = g(s), tokG = g(s), topG = g(s);
    // 컨베이어 (상자가 지나가는 선)
    line(trackG, rest(0)[0], rest(0)[1], rest(PROD)[0], rest(PROD)[1], { color: C.line, width: 2, dash: "2 5" });
    if (!nar) for (let i = 0; i < PROD; i++) { const a = at(i), b = at(i + 1); line(trackG, a.x + BW / 2 + 3, a.y, b.x - BW / 2 - 3, b.y, { color: C.line, width: 1.6 }); }
    // 칸 (상태: idle · work · pass · fail)
    const box = ST.map((S, i) => {
      const p = at(i), gg = g(boxG);
      const r = rect(gg, p.x - BW / 2, p.y - BH / 2, BW, BH, { r: 8, fill: C.bg, stroke: C.line, sw: 1.6 });
      const lines = nar || !S.two ? [S.t] : S.two;
      const lab = lines.map((l, k) => text(gg, nar ? BX0 + 36 : p.x, p.y + (k - (lines.length - 1) / 2) * 17, l, { size: nar ? 15 : 14, weight: 600, anchor: nar ? "start" : "middle", fill: C.ink }));
      const barBg = rect(gg, p.x - BW / 2 + 6, p.y + BH / 2 - 8, BW - 12, 4, { r: 2, fill: C.soft }), bar = rect(gg, p.x - BW / 2 + 6, p.y + BH / 2 - 8, 0, 4, { r: 2, fill: C.a });
      // 통과 ✓ · 실패 ✕ 표시: 칸 오른쪽 위 모서리의 작은 동그라미
      const mk = g(gg), mkC = circle(mk, p.x + BW / 2 - 2, p.y - BH / 2 + 2, 9, { fill: C.c, stroke: C.bg, sw: 2 });
      const mark = text(mk, p.x + BW / 2 - 2, p.y - BH / 2 + 2.5, "", { size: 11, weight: 800, anchor: "middle", fill: C.bg });
      return { gg, r, lab, barBg, bar, mark, mk, mkC, p, state: "idle", prog: 0 };
    });
    // 출시 버튼 (지속적 전달) — 사람이 눌러요
    const gp = nar ? { x: BX0 + BW - 21, y: at(GATE).y } : at(GATE); // 좁은 판: 버튼은 칸 오른쪽 (왼쪽은 상자가 서는 자리)
    const btn = g(topG, { tabindex: "0", role: "button", "aria-label": "출시 버튼 누르기" });
    btn.style.cursor = "pointer";
    const BR = nar ? 15 : 17;
    const pulse = circle(btn, gp.x, gp.y, BR + 4, { fill: "none", stroke: C.b, sw: 2 });
    const btnC = circle(btn, gp.x, gp.y, BR, { fill: C.b, stroke: C.bg, sw: 2 });
    text(btn, gp.x, gp.y, "출시", { size: nar ? 13 : 14, weight: 700, anchor: "middle", fill: C.bg });
    const autoT = text(topG, gp.x, gp.y, "자동", { size: 15, weight: 700, anchor: "middle", fill: C.c });
    box[GATE].lab.forEach((t) => (t.style.display = "none"));
    const gateL = nar ? text(topG, BX0 + 36, gp.y, "", { size: 13, weight: 600, fill: C.sub }) : text(topG, gp.x, gp.y + BH / 2 + 16, "", { size: 14, weight: 600, anchor: "middle", fill: C.sub });
    // main 불 (오른쪽 위)
    const lightP = nar ? [W - 98, 22] : [W - 112, 26];
    const light = circle(topG, lightP[0], lightP[1], 7, { fill: C.ok });
    const lightT = text(topG, lightP[0] + 13, lightP[1], "main 초록불", { size: 14, weight: 700, fill: C.ok });
    if (!nar) text(topG, 18, 26, "사건(push · PR)이 일어나면 저절로 돌아요", { size: 14, weight: 600, fill: C.sub });
    // 묶음 표시 (CI · 지속적 전달 · 지속적 배포)
    const spans = {};
    for (const [k, S] of Object.entries(SPAN)) {
      const gg = g(spanG);
      if (!nar) {
        const y = { ci: 190, cd: 236, dep: 282 }[k], x1 = at(S.a).x - BW / 2, x2 = at(S.b).x + BW / 2;
        path(gg, `M${x1},${y - 6} V${y} H${x2} V${y - 6}`, { stroke: C.ink, width: 1.6 });
        const t = text(gg, x1, y + 16, S.t, { size: 14, weight: 700, fill: C.ink });
        spans[k] = { gg, t };
      } else {
        const x = BX0 + BW + 16, y1 = at(S.a).y - BH / 2, y2 = at(S.b).y + BH / 2;
        path(gg, `M${x - 6},${y1} H${x} V${y2} H${x - 6}`, { stroke: C.ink, width: 1.6 });
        S.tn.forEach((l, q) => text(gg, x + 10, (y1 + y2) / 2 + (q - 1) * 19, l, { size: 14, weight: q ? 500 : 700, fill: q ? C.sub : C.ink }));
        spans[k] = { gg };
      }
    }

    // ---------- 흐름 ----------
    const ro = readout(f.controls());
    let pressed = false, toks = [], mode = "manual", fast = 1, pressAfter = 0, waitT = 0, running = false, red = false, userMode = "manual", lastMsg = "";
    let roHtml = "";
    function tokEl(n, fix) {
      const gg = g(tokG);
      const r = rect(gg, -9, -9, 18, 18, { r: 4, fill: C.a, stroke: C.bg, sw: 1.5 });
      const lab = text(gg, 0, -18, `#${n}${fix ? " 고침" : ""}`, { size: 14, weight: 700, anchor: "middle", fill: C.a, cls: "halo" });
      if (nar) lab.style.display = "none"; // 좁은 판: 번호는 아래 읽기 칸에서
      return { gg, r, lab };
    }
    function addTok(o) {
      const T = { n: o.n, fix: !!o.fix, fail: o.fail ?? -1, cap: o.cap ?? 99, at: o.from ?? 0, ph: "work", t: 0, ...tokEl(o.n, o.fix), age: 0 };
      if (o.from) { for (let i = 0; i <= o.from; i++) setBox(i, "pass"); T.ph = "move"; T.t = 0; if (T.at >= T.cap) T.ph = "hold"; }
      else setBox(0, "work");
      toks.push(T);
      if (!o.from) note(T, o.fix ? "고친 커밋이 들어왔어요 → 처음부터 다시 확인" : "커밋이 들어왔어요");
      return T;
    }
    function setBox(i, st, p = 0) {
      const B = box[i]; B.state = st; B.prog = p;
      B.r.style.stroke = st === "work" ? C.a : st === "pass" ? C.c : st === "fail" ? C.no : C.line;
      B.r.style.fill = st === "pass" ? C.cSoft : st === "fail" ? C.bSoft : C.bg;
      B.r.setAttribute("stroke-width", st === "idle" ? 1.6 : 2.2);
      B.mark.textContent = st === "pass" ? "✓" : st === "fail" ? "✕" : "";
      B.mk.style.display = st === "pass" || st === "fail" ? "" : "none"; B.mkC.style.fill = st === "fail" ? C.no : C.c;
      const showBar = st === "work" && ST[i].d > 0;
      B.barBg.style.display = B.bar.style.display = showBar ? "" : "none";
      B.bar.setAttribute("width", (BW - 12) * clamp(p, 0, 1));
      B.lab.forEach((t) => (t.style.fill = st === "fail" ? C.no : C.ink));
    }
    function setRed(on) {
      red = on;
      const at0 = on ? Math.min(...toks.filter((T) => T.ph === "fail").map((T) => T.at), 99) : 99;
      box.forEach((B, i) => (B.gg.style.opacity = on && i > at0 ? "0.4" : "1")); // 빨간불: 뒤 칸은 멈춰요
      btnC.style.opacity = autoT.style.fillOpacity = gateL.style.opacity = on && GATE > at0 ? "0.4" : "1";
      light.style.fill = on ? C.no : C.ok; lightT.style.fill = on ? C.no : C.ok; lightT.textContent = on ? "main 빨간불" : "main 초록불";
    }
    const busyAt = (i, me) => toks.some((o) => o !== me && o.at === i && o.ph !== "done" && o.ph !== "gone");
    // 시간을 dt 만큼 흘려요 (그림 그리기와 따로 — 그래서 '바로 끝 모습'도 같은 규칙으로 계산해요)
    function advance(dt) {
      dt *= fast;
      let moving = false;
      for (const T of toks) {
        if (T.ph === "gone") continue;
        T.age += dt;
        if (T.ph === "work") {
          T.t += dt; moving = true;
          const d = ST[T.at].d;
          setBox(T.at, "work", d ? T.t / d : 1);
          if (T.t >= d) {
            if (T.fail === T.at) { T.ph = "fail"; setBox(T.at, "fail"); setRed(true); note(T, `${ST[T.at].t} ✕ 실패 → 라인이 멈췄어요`); continue; }
            setBox(T.at, "pass");
            if (T.at === PROD) { T.ph = "done"; note(T, "운영에 나갔어요 ✓"); continue; }
            if (T.at >= T.cap) { T.ph = "hold"; note(T, `${ST[T.at].t}까지 통과 ✓`); continue; }
            T.ph = "move"; T.t = 0;
          }
        } else if (T.ph === "move") {
          if (red || busyAt(T.at + 1, T)) continue; // 빨간불이면 아무것도 앞으로 안 가요
          T.t += dt; moving = true;
          if (T.t >= MOVE) {
            T.at += 1; T.t = 0;
            if (T.at === GATE) { T.ph = "wait"; waitT = 0; note(T, mode === "auto" ? "통과 → 자동으로 운영에" : "스테이징까지 통과 ✓ → 출시 버튼을 기다려요"); }
            else { T.ph = "work"; setBox(T.at, "work"); }
          }
        } else if (T.ph === "wait") {
          if (mode === "auto") { setBox(GATE, "pass"); T.ph = "move"; T.t = 0; moving = true; }
          else if (pressAfter) { waitT += dt; moving = true; if (waitT >= pressAfter) { press(); } }
        }
      }
      return moving;
    }
    function press() {
      const T = toks.find((o) => o.ph === "wait" && o.at === GATE);
      if (!T) return false;
      pressAfter = 0; pressed = true; setBox(GATE, "pass"); T.ph = "move"; T.t = 0; note(T, "사람이 출시 버튼을 눌렀어요");
      btnC.style.fill = C.ink; setTimeout(() => (btnC.style.fill = C.b), reduced() ? 0 : 220);
      return true;
    }
    let hist = [];
    function note(T, msg) { hist = [...hist.filter((h) => h.n === T.n), { n: T.n, msg }].slice(-3); lastMsg = `실행 #${T.n}${T.fix ? " (고침)" : ""}: ${hist.map((h) => h.msg).join(" → ")}`; }
    function draw() {
      for (const T of toks) {
        if (T.ph === "gone") { T.gg.style.display = "none"; continue; }
        let p = rest(T.at);
        if (T.ph === "move" && T.t > 0 && T.at < PROD) { const a = rest(T.at), b = rest(T.at + 1), k = clamp(T.t / MOVE, 0, 1); p = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; }
        T.gg.setAttribute("transform", `translate(${p[0]},${p[1]})`);
        const c = T.ph === "fail" ? C.no : T.ph === "done" ? C.c : C.a;
        T.r.style.fill = c; T.lab.style.fill = c;
        if (T.ph === "done" && T.fade) T.gg.style.opacity = String(clamp(1 - (T.age - T.doneAt) / 900, 0, 1));
      }
      const waiting = toks.some((o) => o.ph === "wait");
      pulse.style.opacity = mode === "manual" && waiting ? (reduced() ? "0.7" : String(0.35 + 0.35 * Math.sin(performance.now() / 260))) : "0"; // 사람을 기다리는 중
      gateL.textContent = mode === "auto" ? "버튼 없음" : waiting ? (nar ? "기다려요" : "사람을 기다려요") : pressed ? (nar ? "눌렀어요" : "사람이 눌렀어요") : "사람이 누름";
      const html = `<div>${lastMsg || "커밋을 기다려요"}</div><div><span class="dim">지켜야 할 약속: 깨진 빌드는 바로 고치기 · 빌드는 빠르게 (XP 기준 10분)</span></div>`;
      if (html !== roHtml) { roHtml = html; ro.set(html); } // 바뀔 때만 (읽어 주는 칸이 매번 다시 읽지 않게)
    }
    function gateLook() {
      show(btn, mode === "manual", 200); show(autoT, mode === "auto", 200);
      btn.style.pointerEvents = mode === "manual" ? "" : "none";
    }
    function highlight(hi) {
      for (const [k, S] of Object.entries(spans)) {
        const on = k === hi;
        if (nar) { S.gg.style.display = on ? "" : "none"; continue; }
        S.gg.style.opacity = on ? "1" : "0.38";
        if (S.t) S.t.setAttribute("font-weight", on ? 700 : 500);
      }
    }
    // 단계 처음 모습
    let userN = 5;
    function reset(S) {
      toks.forEach((T) => T.gg.remove()); toks = []; lastMsg = ""; hist = []; pressed = false;
      ST.forEach((_, i) => setBox(i, "idle"));
      setRed(false); pressAfter = S.press || 0; fast = S.fast || 1;
      mode = S.user ? userMode : S.mode; gateLook(); segM.set(mode);
      highlight(S.user ? (mode === "auto" ? "dep" : "cd") : S.hi);
      if (S.pre === "red") { // 앞 단계의 빨간 모습
        const T = addTok({ n: 2 }); T.at = 2; T.ph = "fail";
        setBox(0, "pass"); setBox(1, "pass"); setBox(2, "fail"); setRed(true);
      }
    }
    function start(S) {
      for (const o of S.toks || []) {
        if (o.fix) { const bad = toks.find((T) => T.ph === "fail"); if (bad) { bad.ph = "gone"; } setRed(false); ST.forEach((_, i) => setBox(i, "idle")); }
        addTok(o);
      }
    }
    const segM = choice(f.controls(), [["manual", "지속적 전달 (사람 버튼)"], ["auto", "지속적 배포 (자동)"]], "manual", (k) => { userMode = k; if (f.step() !== LAST) f.goto(LAST); else { mode = k; gateLook(); highlight(k === "auto" ? "dep" : "cd"); running = true; } }, "출시 방식");
    // 조절 칸의 단추들
    const btns = document.createElement("div"); btns.className = "fig-seg"; btns.setAttribute("role", "group"); btns.setAttribute("aria-label", "파이프라인에 넣기");
    btns.innerHTML = `<button type="button" data-a="ok">커밋 넣기</button><button type="button" data-a="bad">실패하는 커밋 넣기</button><button type="button" data-a="press">출시 버튼 누르기</button>`;
    f.controls().appendChild(btns);
    btns.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (f.step() !== LAST) { f.goto(LAST); return; }
      act(b.dataset.a);
    });
    function act(a) {
      if (a === "press") { if (mode === "manual") press(); running = true; return; }
      // 빨간불일 때 들어오는 정상 커밋 = 고침
      const fix = a === "ok" && red;
      if (fix) { const bad = toks.find((T) => T.ph === "fail"); if (bad) { bad.ph = "gone"; setBox(bad.at, "idle"); } setRed(false); hist = []; lastMsg = "실패한 커밋을 고쳤어요 → 라인이 다시 돌아요"; running = true; }
      if (toks.some((T) => T.at === 0 && T.ph !== "gone" && T.ph !== "done")) return; // 입구가 차 있으면 잠깐 기다려요
      const T = addTok({ n: userN++, fix, fail: a === "bad" ? [1, 2, 3][userN % 3] : -1 });
      T.fade = true; running = true;
    }
    btn.addEventListener("click", () => { if (f.step() !== LAST) { userMode = "manual"; f.goto(LAST); return; } press(); running = true; });
    btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); btn.dispatchEvent(new Event("click")); } });

    loop(stage, (dt) => {
      if (running && reduced()) { for (let k = 0; k < 2000 && advance(16); k++); running = false; } // 움직임 줄이기: 바로 끝 모습
      if (running) {
        running = advance(dt) || toks.some((T) => T.ph === "wait" && mode === "manual" && pressAfter);
        for (const T of toks) if (T.ph === "done" && T.fade) { T.doneAt ??= T.age; if (T.age - T.doneAt > 900) T.ph = "gone"; else running = true; }
      }
      draw();
    });
    function render(i, animate) {
      const S = STEPS[i];
      reset(S);
      if (S.user) { lastMsg = "아래 단추로 커밋을 넣어 보세요"; running = true; draw(); return; }
      start(S);
      if (!animate) { // 끝 모습까지 바로 계산
        for (let k = 0; k < 1500 && advance(16); k++);
        running = false;
      } else running = true;
      draw();
    }
    render(0, false);
    return { go: (i, animate) => render(i, animate) };
  },
};

// 그림: 비밀번호는 어떻게 저장하나 — 비밀번호 + 소금(salt) → 일부러 느린 해시 → 저장되는 값 (Dev Flow 07 로그인 · 권한 · 보안 — 카드 3)
//   한 방향(되돌릴 수 없음) → 사람마다 소금 → PBKDF2-SHA256 100,000번(내 앱 설정, 카드 그대로) → DB 에는 소금과 해시만
//   → 로그인은 다시 해시해서 같은지만 → 같은 비밀번호도 소금이 달라 저장 값이 달라요.
//   화면의 해시 값은 이 브라우저에서 진짜로 계산해요(WebCrypto). 소금은 늘 같은 그림이 되게 고정한 예시 값이에요.
import { svg, set, g, text, line, rect, path, arrowHead, ease, reduced, show, readout, rng, C } from "./kit.js";

const WW = 560, NW = 420, H = 340; // 넓은 칸 · 좁은 칸(폰 · 튜터, f.narrow) 너비
const PW = "doran2026!", WRONG = "doran2025!", ITER = 100000;

const STEPS = [
  "비밀번호는 그대로 저장하지 않아요. 한 방향 변환인 해시로 바꿔 저장해서, 결과로 원래 비밀번호를 되찾을 수 없어요.",
  "가입할 때 사람마다 무작위 소금(salt, 주황)을 만들어 비밀번호에 붙여요.",
  "그다음 일부러 느린 해시를 돌려요. 내 앱은 PBKDF2-SHA256 을 100,000번 반복해요 — 털린 DB 로 하나씩 맞혀 보기 어렵게요.",
  "DB 에는 소금과 해시 결과만 남아요. 비밀번호는 어디에도 없어요.",
  "로그인할 때는 입력한 비밀번호에 저장된 소금을 붙여 다시 해시하고, 저장된 값과 같은지만 봐요.",
  "같은 비밀번호를 쓰는 도윤도 소금이 달라서 저장된 값이 완전히 달라요. 한 사람 것을 맞혀도 다른 사람 것은 따로 맞혀야 해요.",
];

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
async function pbkdf2(pw, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, key, 256));
}
const short = (h, n = 8) => (h ? `${h.slice(0, n)}…` : "…");
const num = (n) => Math.round(n).toLocaleString("ko-KR");

// 자리

export default {
  aspect: H / WW,
  aspectNarrow: H / NW,
  steps: STEPS,
  async mount(stage, f) {
    // 자리 (좁은 칸이면 가로를 줄여요)
    const nar = !!f.narrow, W = nar ? NW : WW;
    const PB = { x: nar ? 10 : 16, y: 56, w: nar ? 132 : 160, h: 40 }, SB = { x: nar ? 10 : 16, y: 106, w: nar ? 132 : 160, h: 50 };
    const HB = { x: nar ? 158 : 214, y: 50, w: nar ? 120 : 136, h: 108 }, OB = { x: nar ? 292 : 398, y: 82, w: nar ? 122 : 146, h: 44 };
    const TB = { y: 206 }; // DB 표
    const COLX = nar ? { who: 18, salt: 58, pw: 172, hash: 292 } : { who: 24, salt: 96, pw: 252, hash: 398 };
    const dbRowY = (k) => TB.y + 52 + k * 32;
    const SX = SB.x + (nar ? 96 : 126), OX = OB.x + OB.w / 2; // 소금 · 해시 결과가 표로 내려가는 세로선
    const NS = nar ? 8 : 10, NH = nar ? 13 : 15, NO = nar ? 9 : 12; // 줄여 보여 줄 글자 수: 소금 · 표의 해시 · 결과 칸
    const s = svg(stage, W, H, "비밀번호와 소금이 느린 해시를 거쳐 저장되는 과정");
    // 값 계산 (진짜) — 소금은 고정 예시
    const r1 = rng(21), r2 = rng(58), mk = (r) => Array.from({ length: 16 }, () => Math.floor(r() * 256).toString(16).padStart(2, "0")).join("");
    const SALT = { a: mk(r1), b: mk(r2) };
    const V = { sha: "", a: "", b: "", wrong: "", ms: 0, ok: true };
    try {
      V.sha = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(PW)));
      const t0 = performance.now(); V.a = await pbkdf2(PW, SALT.a); V.ms = performance.now() - t0;
      V.b = await pbkdf2(PW, SALT.b); V.wrong = await pbkdf2(WRONG, SALT.a);
    } catch { V.ok = false; }

    const backG = g(s), boxG = g(s), flowG = g(s), dbG = g(s), tagG = g(s);
    // 비밀번호 칸
    const pwLab = text(boxG, PB.x, PB.y - 12, "비밀번호", { size: 14, weight: 700, fill: C.sub });
    rect(boxG, PB.x, PB.y, PB.w, PB.h, { r: 7, fill: C.bg, stroke: C.ink, sw: 1.6 });
    const pwT = text(boxG, PB.x + PB.w / 2, PB.y + PB.h / 2 + 1, PW, { size: 16, anchor: "middle", weight: 700, mono: true });
    // 소금 칸
    const saltG = g(boxG);
    rect(saltG, SB.x, SB.y, SB.w, SB.h, { r: 7, fill: C.bSoft, stroke: C.b, sw: 1.6 });
    const saltLab = text(saltG, SB.x + SB.w / 2, SB.y + 15, "", { size: 14, anchor: "middle", fill: C.b, weight: 600 });
    const saltT = text(saltG, SB.x + SB.w / 2, SB.y + 35, short(SALT.a, NS), { size: 15, anchor: "middle", weight: 700, mono: true, fill: C.b });
    // 해시 기계
    const hF = rect(boxG, HB.x, HB.y, HB.w, HB.h, { r: 10, fill: C.bg, stroke: C.line, sw: 1.6 });
    const hT1 = text(boxG, HB.x + HB.w / 2, HB.y + 22, "해시", { size: 16, anchor: "middle", weight: 700 });
    const hT2 = text(boxG, HB.x + HB.w / 2, HB.y + 44, "SHA-256", { size: 14, anchor: "middle", fill: C.sub, mono: true });
    const hT3 = text(boxG, HB.x + HB.w / 2, HB.y + 70, "", { size: 15, anchor: "middle", weight: 700, fill: C.a });
    rect(boxG, HB.x + 14, HB.y + 86, HB.w - 28, 8, { r: 4, fill: C.soft });
    const bar = rect(boxG, HB.x + 14, HB.y + 86, 0, 8, { r: 4, fill: C.a });
    // 저장되는 값
    const outLab = text(boxG, OB.x, OB.y - 12, "저장되는 값", { size: 14, weight: 700, fill: C.sub });
    const oF = rect(boxG, OB.x, OB.y, OB.w, OB.h, { r: 7, fill: C.bg, stroke: C.ink, sw: 1.6 });
    const outT = text(boxG, OB.x + OB.w / 2, OB.y + OB.h / 2 + 1, "", { size: 16, anchor: "middle", weight: 700, mono: true });
    // 화살표 (칸 사이)
    const aPw = path(backG, `M${PB.x + PB.w},${PB.y + PB.h / 2} L${HB.x - 4},${PB.y + PB.h / 2}`, { stroke: C.line, width: 2 });
    const aSalt = path(backG, `M${SB.x + SB.w},${SB.y + SB.h / 2} L${HB.x - 4},${SB.y + SB.h / 2}`, { stroke: C.line, width: 2 });
    const aOut = path(backG, `M${HB.x + HB.w},${OB.y + OB.h / 2} L${OB.x - 4},${OB.y + OB.h / 2}`, { stroke: C.line, width: 2 });
    [aPw, aSalt, aOut].forEach((a) => a.setAttribute("marker-end", arrowHead(s, C.line)));
    // 되돌리기 ✗ (한 방향)
    const backArc = g(backG);
    path(backArc, `M${OB.x + OB.w / 2},${OB.y - 28} C${OB.x + OB.w / 2},${4} ${PB.x + PB.w / 2 + 40},${4} ${PB.x + PB.w / 2 + 40},${PB.y - 22}`, { stroke: C.no, width: 1.8, dash: "6 5" }).setAttribute("marker-end", arrowHead(s, C.no));
    text(backArc, (OB.x + OB.w / 2 + PB.x + PB.w / 2 + 40) / 2, 38, "✗ 결과 → 비밀번호: 되돌릴 수 없어요", { size: 14, anchor: "middle", weight: 700, fill: C.no, cls: "fg-t halo" });

    // DB 표
    function drawDb(rows, o = {}) {
      dbG.replaceChildren();
      if (!rows.length) return;
      rect(dbG, 12, TB.y - 22, W - 24, 70 + rows.length * 32, { r: 9, fill: C.bg, stroke: C.line, sw: 1.4 });
      text(dbG, 24, TB.y, "DB · 사용자 표", { size: 14, weight: 700, fill: C.sub });
      text(dbG, COLX.who, TB.y + 24, "사람", { size: 14, fill: C.mute });
      text(dbG, COLX.salt, TB.y + 24, "소금", { size: 14, fill: C.b, weight: 600 });
      text(dbG, COLX.pw, TB.y + 24, "비밀번호", { size: 14, fill: C.mute });
      text(dbG, COLX.hash, TB.y + 24, "해시 결과", { size: 14, fill: C.sub, weight: 600 });
      line(dbG, 22, TB.y + 37, W - 22, TB.y + 37, { color: C.grid });
      rows.forEach((row, k) => {
        const y = dbRowY(k), hot = o.hot === k;
        if (hot) rect(dbG, 18, y - 13, W - 36, 26, { r: 5, fill: o.hotFill || C.aSoft });
        text(dbG, COLX.who, y, row.who, { size: 15, weight: 700 });
        text(dbG, COLX.salt, y, short(row.salt, NS), { size: 14, mono: true, fill: C.b, weight: 600 });
        text(dbG, COLX.pw, y, "없음", { size: 14, fill: C.mute });
        text(dbG, COLX.hash, y, short(row.hash, NH), { size: 14, mono: true, weight: 600, fill: o.hashCol?.[k] || C.ink });
      });
      if (o.diff) text(dbG, nar ? COLX.pw : COLX.pw + 54, (dbRowY(0) + dbRowY(1)) / 2 + 0.5, "≠ 해시가 달라요", { size: 14, weight: 700, fill: C.d, cls: "fg-t halo" });
    }

    const ro = readout(f.controls());
    let done = -1, run = 0;
    const mv = (ms, fn, ok) => new Promise((res) => {
      if (!ok()) { res(false); return; }
      if (!ms || reduced()) { fn(1); res(true); return; }
      const t0 = performance.now();
      const tick = (now) => { if (!ok() || !stage.isConnected) { res(false); return; } const t = Math.min(1, (now - t0) / ms); fn(ease.inOut(t)); if (t < 1) requestAnimationFrame(tick); else res(true); };
      requestAnimationFrame(tick);
    });
    // 해시 기계 돌리기: n 번(애니메이션은 숫자가 올라가요)
    async function crank(n, ms, color, ok, animate) {
      set(hF, { stroke: color, "stroke-width": 2.4 }); set(bar, { fill: color }); set(hT3, { fill: color });
      return mv(animate ? ms : 0, (u) => {
        set(bar, { width: (HB.w - 28) * u });
        hT3.textContent = n > 1 ? `${num(n * u)}번` : u >= 1 ? "1번" : "…";
      }, ok);
    }
    // 점 하나가 화살표를 따라 흘러요
    async function flow(d, color, ok, animate) {
      if (!ok()) return false;
      const p = path(flowG, d, { stroke: color, width: 2.6 });
      const L = p.getTotalLength ? p.getTotalLength() : 100;
      p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`;
      const res = await mv(animate ? 520 : 0, (u) => (p.style.strokeDashoffset = `${L * (1 - u)}`), ok);
      if (res) p.setAttribute("marker-end", arrowHead(s, color)); else p.remove();
      return res;
    }
    const tagAt = (x, y, str, color) => {
      const gg = g(tagG), w = str.length * 13 + 22;
      rect(gg, x - w / 2, y - 12, w, 24, { r: 12, fill: C.bg, stroke: color, sw: 1.4 });
      text(gg, x, y + 0.5, str, { size: 14, anchor: "middle", weight: 700, fill: color });
    };
    function base(i) {
      flowG.replaceChildren(); tagG.replaceChildren();
      show(backArc, i === 0, 0); show(saltG, i >= 1, 0); show(aSalt, i >= 1, 0);
      set(hF, { stroke: C.line, "stroke-width": 1.6 }); set(bar, { width: 0 }); set(oF, { stroke: C.ink, "stroke-width": 1.6 });
      hT1.textContent = i >= 2 ? "느린 해시" : "해시"; hT2.textContent = i >= 2 ? "PBKDF2-SHA256" : "SHA-256"; hT3.textContent = "";
      pwLab.textContent = i === 4 ? "입력한 비밀번호" : i === 5 ? "도윤의 비밀번호" : "서연의 비밀번호";
      if (i === 0) pwLab.textContent = "비밀번호";
      pwT.textContent = PW;
      saltLab.textContent = nar ? (i === 4 ? "DB 의 소금" : i === 5 ? "도윤의 소금" : "소금 · 무작위") : i === 4 ? "저장된 소금 · DB 에서" : i === 5 ? "도윤의 소금 · 서연과 다름" : "소금 · 사람마다 무작위";
      saltT.textContent = short(i === 5 ? SALT.b : SALT.a, NS);
      outLab.textContent = i === 4 ? "다시 계산한 값" : "저장되는 값"; outT.textContent = ""; set(outT, { fill: C.ink });
    }
    const M = (h) => `<span style="font-family:var(--fg-mono);font-size:13.5px;word-break:break-all">${h}</span>`;
    const noCrypto = V.ok ? "" : `<div class="dim">이 브라우저에서는 해시를 계산하지 못해서 값 자리를 비워 뒀어요.</div>`;

    async function go(i, animate) {
      if (i === done && animate) return;
      const tk = ++run, ok = () => tk === run && f.step() === i;
      done = -1; base(i);
      const rowsA = [{ who: "서연", salt: SALT.a, hash: V.a }];
      drawDb(i >= 3 ? (i === 5 ? [...rowsA, { who: "도윤", salt: SALT.b, hash: V.b }] : rowsA) : []);
      const inPw = `M${PB.x + PB.w},${PB.y + PB.h / 2} L${HB.x - 4},${PB.y + PB.h / 2}`, inSalt = `M${SB.x + SB.w},${SB.y + SB.h / 2} L${HB.x - 4},${SB.y + SB.h / 2}`;
      const toOut = `M${HB.x + HB.w},${OB.y + OB.h / 2} L${OB.x - 4},${OB.y + OB.h / 2}`;
      if (i === 0) {
        ro.set(`<div>SHA-256(“${PW}”) = ${M(short(V.sha, 24))}</div><div class="dim">같은 입력이면 늘 같은 결과 · 결과로 원래 입력을 되찾을 수는 없어요(한 방향).</div>${noCrypto}`);
        if (!(await flow(inPw, C.a, ok, animate))) return;
        if (!(await crank(1, 300, C.a, ok, animate))) return;
        if (!(await flow(toOut, C.a, ok, animate))) return;
        outT.textContent = short(V.sha, NO);
      } else if (i === 1) {
        ro.set(`<div>소금 = 사람마다 새로 만드는 무작위 값: ${M(`<span class="b">${short(SALT.a, 16)}</span>`)} <span class="dim">(예시)</span></div><div class="dim">비밀번호와 소금을 함께 해시해요. 소금은 비밀이 아니라서 DB 에 같이 둬요.</div>${noCrypto}`);
        if (animate) { saltG.style.opacity = "0"; if (!(await mv(500, (u) => (saltG.style.opacity = String(u)), ok))) return; }
        if (!(await flow(inPw, C.a, ok, animate))) return;
        if (!(await flow(inSalt, C.b, ok, animate))) return;
      } else if (i === 2) {
        const per = `${V.ms ? `이 기기에서 한 번 계산하는 데 <b>${num(V.ms)} ms</b> 걸렸어요. ` : ""}반복이 1번이면 약 10만 배 빨라요 — 털린 DB 로 맞혀 보는 쪽도 후보마다 10만 번씩 돌려야 해요.`;
        ro.set(`<div>PBKDF2-SHA256 · <b>100,000번</b> 반복 <span class="dim">(내 앱 SWx2 설정)</span> → ${M(short(V.a, 24))}</div><div>${per}</div><div class="dim">OWASP 권장: Argon2id · scrypt · bcrypt · PBKDF2 를 작업량을 조정해서. PBKDF2 는 이보다 많은 반복을 권해요.</div>${noCrypto}`);
        if (!(await flow(inPw, C.a, ok, animate))) return;
        if (!(await flow(inSalt, C.b, ok, animate))) return;
        if (!(await crank(ITER, 1800, C.a, ok, animate))) return;
        if (!(await flow(toOut, C.a, ok, animate))) return;
        outT.textContent = short(V.a, NO);
      } else if (i === 3) {
        ro.set(`<div>DB 에 남는 것: <span class="b">소금</span> + 해시 결과 · 비밀번호는 어디에도 없어요</div><div class="dim">안전성 확보조치 기준(고시 제2026-9호) 제7조: 비밀번호는 일방향 암호화(해시)해서 저장. 원래 비밀번호를 메일로 보내 줄 수 있다면 해시로 저장하지 않았다는 뜻이에요.</div>`);
        hT3.textContent = "100,000번"; set(bar, { width: HB.w - 28 }); outT.textContent = short(V.a, NO);
        drawDb(rowsA, { hot: 0 });
        if (!(await flow(`M${OX},${OB.y + OB.h} L${OX},${dbRowY(0) - 15}`, C.a, ok, animate))) return;
        if (!(await flow(`M${SX},${SB.y + SB.h} L${SX},${dbRowY(0) - 15}`, C.b, ok, animate))) return;
      } else if (i === 4) {
        ro.set(`<div>입력 “${PW}” + <span class="b">저장된 소금</span> → ${M(short(V.a, 20))} = 저장된 해시 <b class="c">✓ 로그인</b></div><div>틀린 입력 “${WRONG}” → ${M(short(V.wrong, 20))} <b class="b">✗ 달라요</b> <span class="dim">(한 글자만 달라도 전혀 다른 값)</span></div>${noCrypto}`);
        drawDb(rowsA, { hot: 0, hotFill: C.cSoft });
        if (!(await flow(`M${SX},${dbRowY(0) - 15} L${SX},${SB.y + SB.h + 2}`, C.b, ok, animate))) return;
        if (!(await flow(inPw, C.a, ok, animate))) return;
        if (!(await flow(inSalt, C.b, ok, animate))) return;
        if (!(await crank(ITER, 900, C.a, ok, animate))) return;
        if (!(await flow(toOut, C.a, ok, animate))) return;
        outT.textContent = short(V.a, NO);
        if (!(await flow(`M${OX},${OB.y + OB.h} L${OX},${dbRowY(0) - 15}`, C.c, ok, animate))) return;
        set(oF, { stroke: C.c, "stroke-width": 2.4 });
        tagAt(OX - (nar ? 52 : 62), OB.y + OB.h + (nar ? 46 : 34), "같아요 ✓", C.c);
      } else {
        ro.set(`<div>서연 · 도윤 둘 다 “${PW}” · <span class="b">소금</span>이 달라서 해시 결과가 달라요</div><div>${M(`서연 ${short(V.a, 16)}<br>도윤 ${short(V.b, 16)}`)}</div>${noCrypto}`);
        if (!(await flow(inPw, C.a, ok, animate))) return;
        if (!(await flow(inSalt, C.b, ok, animate))) return;
        if (!(await crank(ITER, 900, C.d, ok, animate))) return;
        if (!(await flow(toOut, C.d, ok, animate))) return;
        outT.textContent = short(V.b, NO); set(outT, { fill: C.d });
        drawDb([...rowsA, { who: "도윤", salt: SALT.b, hash: V.b }], { hot: 1, hotFill: C.dSoft, diff: 1, hashCol: [C.ink, C.d] });
        done = i; return;
      }
      done = i;
    }
    return { go, destroy() { run++; } };
  },
};

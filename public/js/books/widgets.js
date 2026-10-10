// AI 공부책 — 만져 보는 위젯 (BOOK_SPEC.md `widget`). 값은 전부 공식 그대로 계산해요. 설명용 가정은 위젯 안에 적어요.
import { $, $$, esc, inline, capOf } from "../papers/ez-core.js";

const fmt = (v, d = 1) => (Math.abs(v) >= 1e12 ? (v / 1e12).toFixed(d) + "조" : Math.abs(v) >= 1e8 ? (v / 1e8).toFixed(d) + "억" : Math.abs(v) >= 1e4 ? (v / 1e4).toFixed(d) + "만" : (+v).toLocaleString("ko-KR", { maximumFractionDigits: d }));
const softmax = (zs) => { const m = Math.max(...zs), e = zs.map((z) => Math.exp(z - m)), s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };
const bars = (rows) => `<div class="wg-bars">${rows.map((r) => `<div class="wg-bar" style="--w:${Math.max(1, r.p * 100)}%;${r.tone ? `--tc:var(--${r.tone});` : ""}"><span class="wg-bl">${esc(r.label)}</span><span class="wg-bt"><i></i></span><b>${(r.p * 100).toFixed(r.p < 0.1 ? 1 : 0)}%</b></div>`).join("")}</div>`;
const slider = (id, label, min, max, step, val, show) => `<label class="wg-sl"><span>${esc(label)}</span><input type="range" data-in="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><output data-out="${id}">${esc(show)}</output></label>`;

// ---------- BPE: 작은 한국어 말뭉치로 진짜 합치기 학습 ----------
const CORPUS = "오늘 날씨가 정말 좋아요 . 오늘은 비가 와요 . 날씨가 흐려요 . 모델은 글을 읽지 않아요 . 모델은 숫자를 계산해요 . 토큰은 글의 조각이에요 . 글을 조각으로 잘라요 . 한국어는 조각이 더 많아요 . 학습은 틀린 만큼 조금씩 고치기예요 . 다음 토큰을 맞혀요 . 다음 낱말을 맞혀요 . 나는 학교에 가요 . 나는 집에 가요 . 우리는 모델을 만들어요 . 작은 모델을 만들어요 . 큰 모델은 비싸요 . 데이터가 많아야 해요 . 좋은 데이터가 더 중요해요 . 어텐션은 앞 토큰을 봐요 . 트랜스포머는 층을 쌓아요 . 자비스를 만들어요 . 내 자비스는 내 노트를 알아요 . 음성으로 말해요 . 도구를 불러요 . 오늘 공부를 해요 . 내일도 공부를 해요 . 정말 재미있어요 . 정말 어려워요 .";
function trainBpe(corpus, maxMerges) {
  // 낱말 = 공백으로 나눔. 각 낱말은 '▁' 를 앞에 붙인 글자 배열 (낱말 시작 표시 · SentencePiece 방식)
  const words = new Map();
  corpus.split(/\s+/).filter(Boolean).forEach((w) => { const k = ["▁", ...w].join(" "); words.set(k, (words.get(k) || 0) + 1); });
  const merges = [];
  let cur = new Map(words);
  for (let m = 0; m < maxMerges; m++) {
    const pairs = new Map();
    cur.forEach((n, w) => { const s = w.split(" "); for (let i = 0; i + 1 < s.length; i++) { const p = s[i] + "\u0001" + s[i + 1]; pairs.set(p, (pairs.get(p) || 0) + n); } });
    let best = null, bn = 1;
    pairs.forEach((n, p) => { if (n > bn) { bn = n; best = p; } });
    if (!best) break;
    const [a, b] = best.split("\u0001");
    merges.push([a, b, bn]);
    const next = new Map();
    cur.forEach((n, w) => { const s = w.split(" "), o = []; for (let i = 0; i < s.length; i++) { if (i + 1 < s.length && s[i] === a && s[i + 1] === b) { o.push(a + b); i++; } else o.push(s[i]); } next.set(o.join(" "), (next.get(o.join(" ")) || 0) + n); });
    cur = next;
  }
  return merges;
}
function applyBpe(text, merges, k) {
  return text.split(/\s+/).filter(Boolean).flatMap((w) => {
    let s = ["▁", ...w];
    for (const [a, b] of merges.slice(0, k)) { const o = []; for (let i = 0; i < s.length; i++) { if (i + 1 < s.length && s[i] === a && s[i + 1] === b) { o.push(a + b); i++; } else o.push(s[i]); } s = o; }
    return s;
  });
}

const W = {
  bpe: {
    html: (b) => `<p class="wg-h">작은 말뭉치(문장 ${CORPUS.split(".").length - 1}개)로 BPE 를 지금 학습해요. 합치기 횟수를 늘리면 자주 붙어 다니는 글자들이 한 조각이 돼요.</p>
      ${slider("k", "합치기 횟수", 0, 80, 1, 30, "30")}
      <label class="wg-in"><span>내 문장</span><input type="text" data-in="text" value="${esc(b.text || "오늘 날씨가 정말 좋아요")}" maxlength="80"></label>
      <div class="wg-out" data-out="chips"></div><p class="wg-note" data-out="info"></p><p class="wg-note">여기선 글자에서 시작해요. GPT 계열은 바이트(byte)에서 시작해서 어떤 글자든 다룰 수 있어요. '▁' 는 낱말이 시작되는 자리예요.</p>`,
    wire: (el) => {
      const merges = trainBpe(CORPUS, 80);
      const draw = () => {
        const k = +$('[data-in="k"]', el).value, text = $('[data-in="text"]', el).value || " ";
        $('[data-out="k"]', el).value = k;
        const toks = applyBpe(text, merges, k);
        $('[data-out="chips"]', el).innerHTML = toks.map((t) => `<span class="pl-c">${esc(t)}</span>`).join("");
        const last = merges.slice(Math.max(0, k - 3), k).map(([a, b, n]) => `${a}+${b}(${n}번)`).join(" · ");
        $('[data-out="info"]', el).textContent = `조각 ${toks.length}개 · 글자 ${text.replace(/\s/g, "").length}개${k ? ` · 최근 합친 것: ${last}` : " · 아직 글자 그대로예요"}`;
      };
      el.addEventListener("input", draw); draw();
    },
  },
  temperature: {
    html: (b) => `<p class="wg-h">모델이 후보마다 매긴 점수(logit)를 온도로 나눈 뒤 softmax 로 확률을 만들어요. 온도가 낮으면 1등만, 높으면 골고루.</p>
      ${slider("T", "온도 (temperature)", 0.1, 2, 0.05, 1, "1.00")}<div data-out="bars"></div>
      <div class="wg-row"><button type="button" class="ez-btn" data-act="pick">확률대로 하나 뽑기</button><span class="wg-picks" data-out="picks"></span></div>`,
    wire: (el, b) => {
      const L = b.logits?.length ? b.logits : [{ text: "좋아요", z: 2.0 }, { text: "덥네요", z: 1.0 }, { text: "춥네요", z: 0.2 }, { text: "흐려요", z: -0.5 }, { text: "🙂", z: -1.5 }];
      const picks = [];
      const probs = () => softmax(L.map((x) => x.z / +$('[data-in="T"]', el).value));
      const draw = () => { const T = +$('[data-in="T"]', el).value; $('[data-out="T"]', el).value = T.toFixed(2); const p = probs(); $('[data-out="bars"]', el).innerHTML = bars(L.map((x, i) => ({ label: `${x.text} (점수 ${x.z})`, p: p[i], tone: i === 0 ? "c" : "a" }))); };
      el.addEventListener("input", draw);
      $('[data-act="pick"]', el).addEventListener("click", () => { const p = probs(); let r = Math.random(), i = 0; while (i < p.length - 1 && (r -= p[i]) > 0) i++; picks.unshift(L[i].text); $('[data-out="picks"]', el).innerHTML = picks.slice(0, 12).map((t, j) => `<span class="pl-c ${j ? "" : "hi"}">${esc(t)}</span>`).join(""); });
      draw();
    },
  },
  attention: {
    html: (b) => `<p class="wg-h">토큰을 고르면, 그 토큰이 앞 토큰들을 얼마나 보는지 softmax 로 비율이 나와요. 점수를 키우면(날카롭게) 1등에 몰려요.</p>
      <div class="wg-toks" data-out="toks"></div>${slider("s", "날카로움 (점수 ×)", 0.3, 3, 0.1, 1, "1.0")}<div data-out="bars"></div>`,
    wire: (el, b) => {
      const T = b.tokens?.length ? b.tokens : ["철수가", "영희에게", "책을", "줬다", "그는", "기뻤다"];
      const S = b.scores?.length ? b.scores : [[1], [0.5, 1], [0.2, 0.6, 1], [0.8, 0.9, 0.7, 1], [2.4, 1.2, 0.3, 0.6, 1], [0.4, 0.2, 0.1, 1.6, 2.0, 1]];
      let q = Math.min(T.length - 1, b.pick ?? 4);
      const draw = () => {
        const s = +$('[data-in="s"]', el).value; $('[data-out="s"]', el).value = s.toFixed(1);
        $('[data-out="toks"]', el).innerHTML = T.map((t, i) => `<button type="button" class="pl-c ${i === q ? "hi" : ""}" data-q="${i}">${esc(t)}</button>`).join("");
        const row = (S[q] || []).slice(0, q + 1), p = softmax(row.map((z) => z * s));
        $('[data-out="bars"]', el).innerHTML = bars(p.map((v, i) => ({ label: `${T[q]} → ${T[i]}`, p: v, tone: i === q ? "n" : "a" })));
      };
      el.addEventListener("input", draw);
      el.addEventListener("click", (e) => { const x = e.target.closest("[data-q]"); if (x) { q = +x.dataset.q; draw(); } });
      draw();
    },
  },
  loss: {
    html: () => `<p class="wg-h">정답 토큰에 매긴 확률이 낮을수록 벌점(손실)이 커져요. 벌점 = −log(정답 확률).</p>${slider("p", "정답에 준 확률", 0.01, 1, 0.01, 0.5, "50%")}<div class="wg-big" data-out="L"></div><p class="wg-note">자연로그 기준. 학습은 이 벌점이 줄어드는 방향으로 숫자(파라미터)를 조금씩 고치는 일이에요.</p>`,
    wire: (el) => { const draw = () => { const p = +$('[data-in="p"]', el).value; $('[data-out="p"]', el).value = Math.round(p * 100) + "%"; const L = -Math.log(p); $('[data-out="L"]', el).innerHTML = `벌점 <b>${L.toFixed(2)}</b><i style="--w:${Math.min(100, L / 4.6 * 100)}%"></i>`; }; el.addEventListener("input", draw); draw(); },
  },
  cost: {
    html: (b) => `<p class="wg-h">학습 계산량 ≈ 6 × N × D (파라미터 수 × 토큰 수). GPU 속도와 효율로 나누면 시간, 시간당 가격을 곱하면 돈이에요.</p>
      <div class="wg-presets">${(b.presets || [{ label: "노트북 장난감", n: 0.01, d: 0.2 }, { label: "nanochat 급", n: 0.56, d: 11 }, { label: "1B · 20B 토큰", n: 1, d: 20 }, { label: "Llama 3 8B", n: 8, d: 15000 }]).map((p, i) => `<button type="button" class="ez-btn" data-preset="${i}" data-n="${p.n}" data-d="${p.d}">${esc(p.label)}</button>`).join("")}</div>
      ${slider("n", "파라미터 N (십억 개)", -2, 2, 0.05, 0, "1.00B")}${slider("d", "학습 토큰 D (십억 개)", -1, 4.3, 0.05, 1.3, "20B")}
      ${slider("tf", "GPU 속도 (TFLOPS)", 10, 1000, 10, 990, "990")}${slider("mfu", "효율 (MFU %)", 10, 60, 5, 40, "40%")}${slider("price", "GPU 1시간 가격 ($)", 0.5, 5, 0.1, 2.5, "$2.5")}${slider("g", "GPU 개수", 1, 64, 1, 8, "8")}
      <div class="wg-grid" data-out="res"></div><p class="wg-note">990 TFLOPS = H100 bf16(밀집) 공칭값. 효율 40% 는 흔히 보는 값이고, 가격은 클라우드 시세예요. 실제는 데이터 준비 · 실패 · 평가 시간이 더 들어요.</p>`,
    wire: (el) => {
      const draw = () => {
        const N = Math.pow(10, +$('[data-in="n"]', el).value) * 1e9, D = Math.pow(10, +$('[data-in="d"]', el).value) * 1e9, tf = +$('[data-in="tf"]', el).value, mfu = +$('[data-in="mfu"]', el).value / 100, price = +$('[data-in="price"]', el).value, g = +$('[data-in="g"]', el).value;
        $('[data-out="n"]', el).value = (N / 1e9 < 0.1 ? (N / 1e6).toFixed(0) + "M" : (N / 1e9).toFixed(2) + "B"); $('[data-out="d"]', el).value = (D / 1e9 < 1 ? (D / 1e6).toFixed(0) + "M" : (D / 1e9).toFixed(D / 1e9 < 10 ? 1 : 0) + "B");
        $('[data-out="tf"]', el).value = tf; $('[data-out="mfu"]', el).value = Math.round(mfu * 100) + "%"; $('[data-out="price"]', el).value = "$" + price.toFixed(1); $('[data-out="g"]', el).value = g;
        const flops = 6 * N * D, gpuH = flops / (tf * 1e12 * mfu * 3600), wall = gpuH / g;
        $('[data-out="res"]', el).innerHTML = [["계산량", flops.toExponential(2) + " FLOPs"], ["GPU 시간", fmt(gpuH, 1) + " 시간"], ["실제 걸리는 시간", wall < 1 ? Math.round(wall * 60) + "분" : wall < 48 ? wall.toFixed(1) + "시간" : (wall / 24).toFixed(1) + "일"], ["돈", "$" + fmt(gpuH * price, 0)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
      };
      el.addEventListener("input", draw);
      el.addEventListener("click", (e) => { const p = e.target.closest("[data-preset]"); if (!p) return; $('[data-in="n"]', el).value = Math.log10(+p.dataset.n); $('[data-in="d"]', el).value = Math.log10(+p.dataset.d); draw(); });
      draw();
    },
  },
  memory: {
    html: () => `<p class="wg-h">학습 중엔 가중치만이 아니라 기울기와 Adam 의 상태까지 메모리에 있어야 해요. 파라미터 하나에 약 16바이트(혼합 정밀도 기준).</p>
      ${slider("n", "파라미터 N (십억 개)", -2, 2, 0.05, Math.log10(7), "7B")}<div class="wg-grid" data-out="res"></div><div data-out="bars"></div><p class="wg-note">가중치 bf16 2B + 기울기 bf16 2B + Adam m·v fp32 8B + fp32 원본 4B = 16B/파라미터. 계산 중간값(activation)은 빼고 셌어요 — 문맥 길이에 따라 더 들어요.</p>`,
    wire: (el) => {
      const draw = () => {
        const N = Math.pow(10, +$('[data-in="n"]', el).value) * 1e9; $('[data-out="n"]', el).value = N / 1e9 < 0.1 ? (N / 1e6).toFixed(0) + "M" : (N / 1e9).toFixed(1) + "B";
        const gb = (b) => (N * b / 1e9).toFixed(N * b / 1e9 < 10 ? 2 : 0) + " GB";
        $('[data-out="res"]', el).innerHTML = [["가중치 (bf16)", gb(2)], ["기울기 (bf16)", gb(2)], ["Adam 상태 (fp32 ×2)", gb(8)], ["fp32 원본", gb(4)], ["합계", gb(16)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
        const total = N * 16 / 1e9;
        $('[data-out="bars"]', el).innerHTML = `<p class="wg-note" style="text-align:left;margin:10px 0 4px">GPU 하나의 메모리와 비교 (가득 = 넘침)</p>` + bars([["Mac 16GB", 16], ["RTX 4090 24GB", 24], ["H100 80GB", 80], ["H200 141GB", 141]].map(([l, m]) => ({ label: l, p: Math.min(1, total / m), tone: total > m ? "b" : "c" })));
      };
      el.addEventListener("input", draw); draw();
    },
  },
  scaling: {
    html: () => `<p class="wg-h">같은 계산 예산이면 모델 크기와 토큰 수를 어떻게 나눌까? Chinchilla(2022)의 답: 토큰 D ≈ 20 × 파라미터 N.</p>
      ${slider("c", "계산 예산 (FLOPs, 10의 거듭제곱)", 17, 25, 0.1, 21, "1e21")}<div class="wg-grid" data-out="res"></div><p class="wg-note">C = 6ND, D = 20N 로 풀면 N = √(C/120). 요즘 공개 모델은 '작게 만들어 더 오래(토큰을 훨씬 많이)' 학습해요 — 쓰는 비용까지 생각하면 그게 싸서요.</p>`,
    wire: (el) => {
      const draw = () => { const C = Math.pow(10, +$('[data-in="c"]', el).value); $('[data-out="c"]', el).value = "1e" + (+$('[data-in="c"]', el).value).toFixed(1); const N = Math.sqrt(C / 120), D = 20 * N; $('[data-out="res"]', el).innerHTML = [["파라미터 N", N < 1e9 ? (N / 1e6).toFixed(0) + "M" : (N / 1e9).toFixed(1) + "B"], ["토큰 D", D < 1e9 ? (D / 1e6).toFixed(0) + "M" : D < 1e12 ? (D / 1e9).toFixed(0) + "B" : (D / 1e12).toFixed(1) + "T"], ["비율 D/N", "20"]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join(""); };
      el.addEventListener("input", draw); draw();
    },
  },
};

export const widgetHtml = (b, n) => (W[b.kind] ? `<div class="ez-fig wide ez-widget" data-widget="${esc(b.kind)}" data-wcfg='${esc(JSON.stringify(b))}'><p class="wg-k">직접 만져 보기</p>${W[b.kind].html(b)}${capOf(b)}</div>` : "");
export function wireWidgets(root) {
  $$("[data-widget]", root).forEach((el) => { try { W[el.dataset.widget]?.wire(el, JSON.parse(el.dataset.wcfg || "{}")); } catch (e) { console.warn("widget", e); } });
}

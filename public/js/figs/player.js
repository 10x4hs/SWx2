// 설명 그림 한 칸 — "그림 1-6 · 제목" + 그림판 + 지금 단계의 설명 한두 줄 + [◀ 이전] [▶ 재생] [다음 ▶] + 단계 점 + (있으면) 영상
//   넘기는 속도는 내가 정해요(분할 원리). 재생을 누르면 한 단계씩 넘어가고 마지막에서 멈춰요. ← → 키 · 화면 밖이면 멈춤 · 크게 보기.
//   그림 파일(f-<id>.js): export default { steps: ["설명", …], hint?, aspect?, aspectNarrow?, mount(stage, f) → { go(i, animate), destroy?() } }
//   aspect = 높이/너비. aspectNarrow 는 좁은 칸(480px 미만 — 폰 · 튜터 안)일 때 (f.narrow 가 true)
import { esc } from "../util.js";
import * as kit from "./kit.js";

const files = new Map();
const load = (id) => { if (!files.has(id)) files.set(id, import(`./f-${id}.js`).then((m) => m.default)); return files.get(id); };

// 영상 한 칸 (그림 아래 또는 혼자) — 누르면 그 자리에서 열려요 (youtube-nocookie · 자막 켜기)
export function videoMarkup(v) {
  if (!v?.id) return "";
  const meta = [v.channel, v.length, v.lang === "ko" ? "한국어" : "영어 · 자막"].filter(Boolean).map(esc).join(" · ");
  return `<div class="fig-video"><button type="button" class="fig-vbtn" data-video="${esc(v.id)}" data-start="${Number(v.start) || 0}" data-lang="${esc(v.lang || "")}" aria-expanded="false"><span class="fig-vplay" aria-hidden="true">▶</span><span><b>영상으로 보기</b><small>${esc(v.title || "")}${meta ? ` — ${meta}` : ""}</small></span></button><div class="fig-vbox" hidden></div>${v.why ? `<p class="fig-vwhy">${esc(v.why)}</p>` : ""}</div>`;
}
export function bindVideo(root) {
  if (root.__figv) return; root.__figv = true;
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".fig-vbtn"); if (!b || e.__figv) return;
    e.__figv = true; // 그림 칸과 카드가 둘 다 들어도 한 번만
    const box = b.nextElementSibling, open = box.hidden;
    if (open && !box.firstChild) {
      const q = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1", hl: "ko", cc_lang_pref: "ko", ...(b.dataset.lang === "ko" ? {} : { cc_load_policy: "1" }), ...(Number(b.dataset.start) ? { start: b.dataset.start } : {}) });
      box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.video)}?${q}" title="${esc(b.querySelector("small")?.textContent || "영상")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    }
    box.hidden = !open; b.setAttribute("aria-expanded", String(open));
  });
}

// slot 에 그림 하나: { id, no: "1-6", title, opts, video, compact }
export async function mountFigure(slot, p) {
  const def = await load(p.id).catch(() => null);
  if (!slot.isConnected && !p.detached) return () => {};
  if (!def) { slot.innerHTML = `<p class="fig-err">그림을 불러오지 못했어요 (${esc(p.id)}).</p>`; return () => {}; }
  const steps = typeof def.steps === "function" ? def.steps(p.opts || {}) : def.steps;
  const val = (v) => (typeof v === "function" ? v(p.opts || {}) : v); // aspect · aspectNarrow 도 모드마다 다르게 할 수 있어요
  const narrow = (slot.clientWidth || 600) < 480, ar = (narrow && val(def.aspectNarrow)) || val(def.aspect) || 0.6; // 폰 · 튜터처럼 좁은 칸: 그림이 고르면 더 세로로 긴 판
  const hint = typeof def.hint === "function" ? def.hint(p.opts || {}) : def.hint; // 모드마다 다른 안내도 돼요
  const n = steps.length, uid = "fg" + Math.random().toString(36).slice(2, 8);
  slot.innerHTML = `<figure class="fig${p.compact ? " compact" : ""}" tabindex="-1" aria-labelledby="${uid}-t" data-fig="${esc(p.id)}">
      <header class="fig-h"><span class="fig-no">그림 ${esc(p.no || "")}</span><b class="fig-t" id="${uid}-t">${esc(p.title || "")}</b><button type="button" class="fig-big" aria-label="크게 보기" title="크게 보기"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></header>
      <div class="fig-stage" style="aspect-ratio:${(1 / ar).toFixed(4)}"></div>
      <figcaption class="fig-cap" id="${uid}-c" aria-live="polite"><span class="fig-step"></span><span class="fig-cap-t"></span></figcaption>
      <div class="fig-ctl" hidden></div>
      ${n > 1 ? `<div class="fig-bar"><button type="button" class="fig-btn" data-prev aria-label="이전 단계">◀ 이전</button><button type="button" class="fig-btn fig-play" data-play aria-label="재생">▶ 재생</button><button type="button" class="fig-btn" data-next aria-label="다음 단계">다음 ▶</button>
        <span class="fig-dots" role="group" aria-label="단계로 가기">${steps.map((_, i) => `<button type="button" data-i="${i}" aria-label="${i + 1}단계"></button>`).join("")}</span>${hint ? `<span class="fig-hint">${esc(hint)}</span>` : ""}</div>` : hint ? `<div class="fig-bar"><span class="fig-hint">${esc(hint)}</span></div>` : ""}
      ${videoMarkup(p.video)}
    </figure>`;
  const fig = slot.querySelector(".fig"), stage = fig.querySelector(".fig-stage"), ctl = fig.querySelector(".fig-ctl");
  const capT = fig.querySelector(".fig-cap-t"), capN = fig.querySelector(".fig-step"), playB = fig.querySelector("[data-play]");
  let i = 0, playing = false, timer = 0, busy = Promise.resolve(), inst = null, alive = true;
  const f = {
    opts: p.opts || {}, kit, reduced: kit.reduced(), slot, figure: fig, narrow, // narrow: 좁은 칸이면 true — 그림이 확대한 viewBox 를 쓰라는 뜻
    // 그림 아래 조절 칸 (슬라이더 · 단추). 쓰면 보여요
    controls() { ctl.hidden = false; return ctl; },
    goto: (k) => go(k, true),
    step: () => i,
  };
  try { inst = (await def.mount(stage, f)) || {}; }
  catch (e) { console.error(e); stage.innerHTML = `<p class="fig-err">그림을 그리지 못했어요.</p>`; inst = {}; }
  function paint() {
    capT.textContent = steps[i] || ""; capN.textContent = n > 1 ? `${i + 1} / ${n}` : "";
    if (SK) try { sessionStorage.setItem(SK, String(i)); } catch {}
    fig.querySelectorAll(".fig-dots button").forEach((b, k) => { b.classList.toggle("on", k === i); b.classList.toggle("seen", k < i); b.setAttribute("aria-current", k === i ? "step" : "false"); });
    const prev = fig.querySelector("[data-prev]"), next = fig.querySelector("[data-next]");
    if (prev) prev.disabled = i === 0; if (next) next.disabled = i === n - 1;
    if (playB) { playB.textContent = playing ? "❚❚ 멈춤" : i === n - 1 ? "↺ 처음부터" : "▶ 재생"; playB.setAttribute("aria-label", playing ? "멈추기" : i === n - 1 ? "처음부터" : "재생"); }
  }
  function go(k, animate = true) {
    k = Math.max(0, Math.min(n - 1, k));
    if (k === i && animate) return busy;
    i = k; paint();
    const want = i; // 누른 그 단계로 (빨리 여러 번 눌러도 같은 단계를 두 번 그리지 않게)
    busy = busy.then(() => (want === i ? inst.go?.(want, animate && !kit.reduced()) : null)).catch(() => {});
    return busy;
  }
  function stopPlay() { playing = false; clearTimeout(timer); paint(); }
  function tickPlay() {
    clearTimeout(timer);
    if (!playing || !alive) return;
    if (i >= n - 1) { stopPlay(); return; }
    const len = (steps[i] || "").length, wait = Math.max(2600, Math.min(6500, 1400 + len * 55)); // 설명이 길면 오래
    timer = setTimeout(() => { if (!playing) return; go(i + 1).then(() => tickPlay()); }, wait);
  }
  fig.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || !fig.contains(b)) return;
    if (b.matches("[data-prev]")) { stopPlay(); go(i - 1); }
    else if (b.matches("[data-next]")) { stopPlay(); go(i + 1); }
    else if (b.matches("[data-play]")) { if (playing) stopPlay(); else { if (i === n - 1) go(0, false); playing = true; paint(); tickPlay(); } }
    else if (b.matches(".fig-dots button")) { stopPlay(); go(Number(b.dataset.i)); }
    else if (b.matches(".fig-big")) big();
  });
  fig.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, [role=slider], .fg-3d")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stopPlay(); go(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stopPlay(); go(i - 1); }
  });
  bindVideo(fig);
  // 화면 밖으로 나가면 재생을 멈춰요
  const io = new IntersectionObserver(([en]) => { if (!en.isIntersecting && playing) stopPlay(); }, { threshold: 0.15 });
  io.observe(fig);
  // 크게 보기: 그림 칸을 화면 가운데 큰 판으로 옮겼다가 닫으면 제자리로
  function big() {
    const dlg = document.createElement("dialog"); dlg.className = "fig-dlg";
    const ph = document.createComment("fig");
    fig.replaceWith(ph); dlg.appendChild(fig);
    const x = document.createElement("button"); x.type = "button"; x.className = "fig-dlg-x"; x.textContent = "닫기"; dlg.prepend(x);
    (slot.closest(".dv") || document.body).appendChild(dlg);
    dlg.dataset.swTheme = slot.closest("[data-sw-theme]")?.dataset.swTheme || "paper";
    const close = () => { dlg.close(); };
    x.addEventListener("click", close);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener("close", () => { ph.replaceWith(fig); dlg.remove(); fig.querySelector(".fig-big")?.focus(); }, { once: true });
    dlg.showModal();
  }
  // 처음 단계: 이 탭에서 보던 단계(다른 화면에 갔다 와도 그대로) → 없으면 opts.start (같은 그림을 다른 카드에서 다른 단계부터)
  const SK = p.key ? "fig-step:" + p.key : "";
  let seen = null; try { seen = SK ? sessionStorage.getItem(SK) : null; } catch {}
  i = Math.max(0, Math.min(n - 1, seen != null ? Number(seen) || 0 : Number(f.opts.start) || 0));
  paint();
  await inst.go?.(i, false);
  return () => { alive = false; stopPlay(); io.disconnect(); try { inst.destroy?.(); } catch {} };
}

// root 안의 모든 .fig-slot 을 채워요 (보일 때쯤 그려요 — 3D 가 여러 개여도 한꺼번에 무겁지 않게)
export function mountSlots(root, base = {}) {
  const stops = [], slots = [...root.querySelectorAll(".fig-slot:not([data-on])")];
  const io = new IntersectionObserver((ens) => {
    for (const en of ens) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const s = en.target; s.dataset.on = "1";
      const d = s.dataset;
      let opts = {}; try { opts = JSON.parse(d.opts || "{}"); } catch {}
      let video = null; try { video = d.video ? JSON.parse(d.video) : null; } catch {}
      mountFigure(s, { ...base, id: d.fig, no: d.no, title: d.title, opts, video, compact: d.compact === "1", key: d.key || "" }).then((stop) => stops.push(stop));
    }
  }, { rootMargin: "400px 0px" });
  slots.forEach((s) => io.observe(s));
  bindVideo(root);
  return () => { io.disconnect(); stops.forEach((f) => { try { f(); } catch {} }); };
}

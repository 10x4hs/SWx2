// 영상 노트 — 맨 위(인용 > … 또는 주소만 있는 첫 줄)에 YouTube 영상 하나가 걸린 노트를 Lilys 정리 화면처럼 한 화면에 (보기 모드)
//   왼쪽: 앱 안 영상(처음엔 썸네일, 누르면 재생) · 영상 정보 · 목차 · 접힌 스크립트(재생 중인 줄 강조, 줄을 누르면 그 시간으로)
//   오른쪽: 정리 — Lilys 정리(## 정리 본문)는 태그 줄 · 빈 칸(_(없음)_) · 목차 · 스크립트 링크 구역 · 안내 줄을 걷고, 다른 노트는 본문 그대로.
//           ⏱ · ▶ 링크는 작은 시간 버튼으로
//   스크립트 노트(줄마다 "[m:ss](…?t=N) 말…")를 열어도 같은 화면: 왼쪽엔 그 스크립트를 펼치고, 오른쪽엔 부모 노트의 정리
//   videoOf(body) → { id, quote, rest } | null
//   mountVideoNote(box, { note, children, load(id) → note, open(title), mark(el) }) → { destroy }
import { renderMarkdown } from "./md.js";
import { esc } from "./util.js";
import { icon } from "./icons.js";

const YT_RE = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^\s)#]*?&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/g;
const ids = (s) => [...new Set([...String(s || "").matchAll(YT_RE)].map((m) => m[1]))];
const idOf = (s) => ids(s)[0] || null;
// "?t=85" · "&t=1m25s" → 초 (시간이 없으면 null)
function secOf(url) {
  const v = /[?&#]t=([0-9hms.]+)/.exec(url || "")?.[1];
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.floor(+v);
  const p = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  return p ? (+p[1] || 0) * 3600 + (+p[2] || 0) * 60 + (+p[3] || 0) : null;
}
const clock = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
const toSec = (lab) => lab.split(":").reduce((a, x) => a * 60 + +x, 0);

// 맨 위 인용 덩어리에 영상이 딱 하나, 또는 첫 줄이 YouTube 주소 하나뿐 → 영상 노트 (여러 영상을 모은 노트는 그대로 둬요)
const BARE = /^\s*(?:<?(https?:\/\/\S+?)>?|\[[^\]\n]*\]\((https?:\/\/[^)\s]+)\))\s*$/;
export function videoOf(body) {
  const lines = String(body || "").split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (/^# /.test(lines[i] || "")) for (i++; i < lines.length && !lines[i].trim(); i++); // 맨 위 '# 제목' 한 줄은 건너뛰어요
  const b = BARE.exec(lines[i] || ""), url = b && (b[1] || b[2]);
  if (url && ids(url).length === 1) return { id: ids(url)[0], quote: `[YouTube 에서 열기](${url})`, rest: lines.slice(i + 1).join("\n") };
  const from = i;
  while (i < lines.length && lines[i].startsWith(">")) i++;
  const quote = lines.slice(from, i).join("\n"), v = ids(quote);
  return v.length === 1 ? { id: v[0], quote, rest: lines.slice(i).join("\n") } : null;
}

// 스크립트: 시간 링크로 시작하는 줄이 한 덩어리. 시간 없이 이어지는 줄은 앞 덩어리에 붙여요
const LINE = /^\s*(?:[-*]\s+)?\[(\d{1,2}(?::\d{2}){1,2})\]\(([^)\s]+)\)\s*(.*)$/;
export function parseScript(md) {
  const out = [];
  for (const l of String(md || "").split("\n")) {
    const m = LINE.exec(l);
    if (m) out.push({ t: secOf(m[2]) ?? toSec(m[1]), text: m[3].trim() });
    else if (out.length && l.trim() && !/^\s*[#>]/.test(l) && !/^_—.*_$/.test(l.trim())) out.at(-1).text += " " + l.trim(); // '_— claudemcp, …_' 서명 줄은 빼요
  }
  return out;
}

// Lilys 정리 다듬기 (## 구역 단위): 태그만 있는 줄 · 빈 칸 · 목차(왼쪽에 따로) · 스크립트 링크만 있는 구역은 빼고,
// '한 줄 결론'은 맨 위 강조 상자로, 뜻풀이 없는 핵심 키워드는 알약으로. Lilys 정리가 아니면 본문 그대로
const isLilys = (md) => /^## 정리 본문\s*$/m.test(md || "");
function tidy(md) {
  if (!isLilys(md)) return String(md || "").trim();
  const out = [];
  for (const part of String(md || "").split(/\n(?=## )/)) {
    const h = /^## +(.+)/.exec(part)?.[1].trim() || "", body = (h ? part.replace(/^## .*\n?/, "") : part).trim();
    if (!h) { const pre = body.split("\n").filter((l) => !/^\s*(#[^\s#]+\s*)+$/.test(l)).join("\n").trim(); if (pre) out.push(pre); continue; } // 태그는 제목 아래 줄에 이미 보여요
    if (!body || /^_\(.*\)_$/.test(body) || /^(목차|contents|toc)$/i.test(h)) continue;
    if (/^(?:[-*]\s*\[\[[^\]]*스크립트[^\]]*\]\][^\n]*\n?)+$/.test(body)) continue; // '원문' → 스크립트는 왼쪽에
    if (h === "정리 본문") { out.push(body.replace(/^_[^\n]*⏱[^\n]*_\s*(\n|$)/, "")); continue; } // 제목 대신 바로 1. 2. 3. 이 큰 제목
    if (/^한 줄 (결론|요약)$/.test(h)) { out.push(`<div class="vn-lead">\n\n${body}\n\n</div>`); continue; }
    const kws = h === "핵심 키워드" ? body.split("\n").map((l) => /^[-*]\s+\*\*([^*\n]+)\*\*\s*$/.exec(l.trim())?.[1]) : [];
    if (kws.length && kws.every(Boolean)) { out.push(`## ${h}\n\n<div class="vn-kw">${kws.map((k) => `<span>${esc(k)}</span>`).join("")}</div>`); continue; }
    out.push(part.trim());
  }
  return out.join("\n\n");
}

const sib = (n) => { let x = n.nextSibling; while (x && x.nodeType === 3 && !x.textContent.trim()) x = x.nextSibling; return x; };
// 이 영상의 시간 링크 → 시간 버튼. 그림 바로 아래의 영어 설명 줄은 그림 title 로, '▶ m:ss' 줄은 그림에 붙여 그림을 눌러도 그 시간으로
function decorate(root, id) {
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") || "";
    if (idOf(href) !== id) continue;
    const t = secOf(href);
    if (t == null) { a.target = "_blank"; a.rel = "noopener"; continue; }
    const b = document.createElement("button");
    b.type = "button"; b.className = "vn-ts"; b.dataset.t = t;
    b.textContent = (/▶/.test(a.textContent) ? "▶ " : "") + clock(t);
    b.title = clock(t) + " 부터 보기";
    a.replaceWith(b);
  }
  for (const img of root.querySelectorAll("img")) {
    img.loading = "lazy"; img.decoding = "async";
    const fig = document.createElement("figure");
    fig.className = "vn-fig";
    img.replaceWith(fig); fig.append(img);
    let n = sib(fig);
    while (n) {
      if (n.nodeName === "BR") { const x = sib(n); if (x && (x.nodeName === "EM" || x.classList?.contains("vn-ts"))) { n.remove(); n = x; continue; } break; }
      if (n.nodeName === "EM") { img.title = n.textContent.trim(); const x = sib(n); n.remove(); n = x; continue; }
      if (n.classList?.contains("vn-ts") && /▶/.test(n.textContent) && !fig.dataset.t) {
        fig.dataset.t = n.dataset.t; fig.classList.add("vn-shot"); fig.title = n.title;
        const cap = document.createElement("figcaption"); cap.textContent = n.textContent; fig.append(cap);
        const x = sib(n); n.remove(); n = x; continue;
      }
      break;
    }
    if (n?.nodeName === "BR") n.remove(); // 그림은 블록이라 뒤의 줄바꿈이 빈 줄이 돼요
    const p = fig.parentElement;
    if (p?.tagName === "P" && p.childNodes.length === 1) p.replaceWith(fig);
  }
}
const headText = (h) => { const c = h.cloneNode(true); c.querySelectorAll(".vn-ts").forEach((x) => x.remove()); return c.textContent.trim(); };
// 자막의 '>>'(말하는 사람 바뀜)은 줄을 바꿔 보여 줘요
const lineHtml = (t) => esc(t).replace(/^\s*&gt;&gt;\s*/, "").replace(/\s*&gt;&gt;\s*/g, "<br>— ");

// YouTube IFrame API — 처음 재생할 때 한 번만 불러요. 막히면 그냥 iframe 으로 (그땐 스크립트 따라가기만 빠져요)
let ytP = null;
function ytApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return (ytP ||= new Promise((ok, no) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); ok(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api"; s.async = true;
    s.onerror = () => { ytP = null; s.remove(); no(new Error("YouTube API")); };
    document.head.append(s);
    setTimeout(() => { if (!window.YT?.Player) { ytP = null; no(new Error("YouTube API 시간 초과")); } }, 8000);
  }));
}

export function mountVideoNote(box, { note, children = [], load, open, mark }) {
  const v = videoOf(note.body), side = box.querySelector(".vn-side"), main = box.querySelector(".vn-main");
  if (!v || !side || !main) return { destroy() {} };
  const id = v.id, mine = parseScript(v.rest), isScript = mine.length >= 3;
  let alive = true, P = null, ready = false, want = 0, fallback = false, tick = null, cur = -1, held = 0;
  let script = isScript ? mine : [], scriptId = null, inMain = false;

  side.innerHTML = `
    <div class="vn-player"><button type="button" class="vn-thumb" data-t="0" aria-label="영상 재생"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt=""><span class="vn-play">${icon.play(22)}</span></button></div>
    <div class="vn-info md"></div>
    <div class="vn-more"></div>`;
  const info = side.querySelector(".vn-info"), more = side.querySelector(".vn-more");
  info.innerHTML = renderMarkdown(v.quote.split("\n").map((l) => l.replace(/^> ?/, "")).filter((l) => !/^🖼/.test(l.trim())).join("\n"));
  decorate(info, id); mark?.(info);

  function drawMain(md, from) {
    inMain = false;
    main.classList.toggle("vn-lilys", isLilys(md));
    main.innerHTML = (from ? `<p class="vn-from">정리 · <a class="wikilink" href="#" data-wikilink="${esc(from.title)}">${esc(from.title)}</a></p>` : "") + renderMarkdown(tidy(md) || "_정리가 아직 없어요._");
    decorate(main, id); mark?.(main);
    drawMore();
  }
  // 정리를 못 찾은 스크립트 노트: 스크립트를 오른쪽에 읽기 좋게
  function drawScriptMain() {
    inMain = true;
    main.innerHTML = `<ol class="vn-lines vn-lines-main">${lines()}</ol>`;
    drawMore();
  }
  const lines = () => script.map((c) => `<li data-t="${c.t}"><button type="button" class="vn-time" data-t="${c.t}">${clock(c.t)}</button><span>${lineHtml(c.text)}</span></li>`).join("");
  function drawMore() {
    const hs = [...main.querySelectorAll(main.classList.contains("vn-lilys") ? "h3, h4" : "h1, h2, h3")], top = Math.min(...hs.map((h) => +h.tagName[1]));
    hs.forEach((h, k) => { h.id = "vn-h" + k; });
    const toc = hs.length > 1 ? `<details class="vn-toc"><summary>목차</summary><div class="vn-toc-l">${hs.map((h, k) => `<button type="button" class="${+h.tagName[1] > top ? "sub" : ""}" data-jump="vn-h${k}">${esc(headText(h))}</button>`).join("")}</div></details>` : "";
    const sc = script.length && !inMain ? `<details class="vn-script"${isScript ? " open" : ""}><summary>스크립트 <span class="faint">${script.length}</span></summary>${scriptId ? `<a class="vn-open" href="#/notes/${esc(scriptId)}">스크립트 노트로 열기</a>` : ""}<ol class="vn-lines">${lines()}</ol></details>` : "";
    more.innerHTML = toc + sc;
    cur = -1; sync();
  }

  if (isScript) {
    main.innerHTML = `<p class="faint">정리를 불러오는 중…</p>`;
    drawMore();
    const pid = note.parent_id;
    (pid ? load(pid) : Promise.reject()).then((p) => {
      if (!alive) return;
      const pv = videoOf(p?.body);
      if (pv?.id === id && parseScript(pv.rest).length < 3) drawMain(pv.rest, p); else drawScriptMain();
    }).catch(() => { if (alive) drawScriptMain(); });
  } else {
    drawMain(v.rest);
    const c = children.find((x) => /스크립트/.test(x.title || ""));
    if (c) load(c.id).then((n) => {
      if (!alive) return;
      const sv = videoOf(n?.body), s = parseScript(sv ? sv.rest : n?.body);
      if ((!sv || sv.id === id) && s.length) { script = s; scriptId = c.id; drawMore(); }
    }).catch(() => {});
  }

  // ---------- 재생 ----------
  const embed = (t) => `https://www.youtube-nocookie.com/embed/${id}?start=${Math.floor(t)}&autoplay=1&rel=0&playsinline=1`;
  async function play(t) {
    want = t; box.classList.add("playing");
    if (fallback) { const f = side.querySelector(".vn-player iframe"); if (f) f.src = embed(t); return; }
    if (P) { if (ready) { P.seekTo(t, true); P.playVideo(); } return; }
    const host = side.querySelector(".vn-player");
    host.innerHTML = `<div class="vn-yt"></div>`;
    try {
      const Y = await ytApi();
      if (!alive) return;
      P = new Y.Player(host.firstElementChild, {
        host: "https://www.youtube-nocookie.com", videoId: id, width: "100%", height: "100%",
        playerVars: { start: Math.floor(t), autoplay: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => { ready = true; e.target.seekTo(want, true); e.target.playVideo(); },
          onStateChange: (e) => { clearInterval(tick); tick = e.data === 1 ? setInterval(sync, 400) : null; sync(); },
        },
      });
    } catch {
      if (!alive) return;
      fallback = true;
      host.innerHTML = `<iframe src="${embed(t)}" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    }
  }
  // 재생 중인 스크립트 줄 강조 · 줄이 안 보이면 따라가요 (사용자가 막 스크롤했으면 4초 동안은 가만히)
  function sync() {
    const now = ready ? P?.getCurrentTime?.() : null;
    if (now == null || !script.length) return;
    let k = script.length - 1;
    while (k > 0 && script[k].t > now + 0.5) k--;
    if (k === cur) return;
    cur = k;
    for (const ol of box.querySelectorAll(".vn-lines")) {
      ol.querySelector("li.on")?.classList.remove("on");
      const li = ol.children[k];
      if (!li) continue;
      li.classList.add("on");
      if (Date.now() - held < 4000 || (!inMain && !li.closest("details")?.open)) continue;
      if (inMain) { const r = li.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) li.scrollIntoView({ block: "center", behavior: "smooth" }); continue; }
      const sc = ol.scrollHeight > ol.clientHeight + 1 ? ol : more, r = li.getBoundingClientRect(), s = sc.getBoundingClientRect(); // 넓은 화면은 왼쪽 칸 전체, 폰은 스크립트 목록이 스크롤돼요
      if (r.top < s.top + 8 || r.bottom > s.top + sc.clientHeight * 0.8) sc.scrollTo({ top: sc.scrollTop + r.top - s.top - sc.clientHeight / 3, behavior: "smooth" });
    }
  }

  const onClick = (e) => {
    const j = e.target.closest("[data-jump]");
    if (j) { e.preventDefault(); main.querySelector("#" + j.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const w = e.target.closest(".vn-side [data-wikilink]");
    if (w) { e.preventDefault(); open?.(w.dataset.wikilink); return; }
    const t = e.target.closest("[data-t]");
    if (t && !e.target.closest("a")) { e.preventDefault(); play(+t.dataset.t || 0); }
  };
  const onHold = (e) => { if (e.target.closest?.(".vn-lines")) held = Date.now(); };
  box.addEventListener("click", onClick);
  box.addEventListener("wheel", onHold, { passive: true });
  box.addEventListener("touchstart", onHold, { passive: true });

  return {
    destroy() {
      alive = false; clearInterval(tick);
      box.removeEventListener("click", onClick); box.removeEventListener("wheel", onHold); box.removeEventListener("touchstart", onHold);
      try { P?.destroy?.(); } catch {}
      P = null;
    },
  };
}

// Silicon Valley Mafia 원문 읽기 — HTML 에서 본문 단락만 (src/svm.js 의 GET /svm/source 가 써요)
//   사이트마다 본문 상자가 달라요: 아는 사이트는 그 상자 → 흔한 본문 상자(.entry-content 등) → article → main → body 순서로, 단락이 3개 넘게 나오는 첫 곳
//   HTMLRewriter 주의 (2026-10-30 확인): 한 요소에 onEndTag 를 여러 번 걸면 마지막 것만 불려요 → 모든 요소를 처리기 하나('*')로 받아 끝 알림을 한 번만 걸어요
//   생략된 끝 태그(</p> · </li>)에는 끝 알림이 없어서, 단락은 다음 단락이 시작할 때도 끊어요
const MAX_BLOCKS = 800;

const BODY_SEL = [
  [/(^|\.)unqualified-reservations\.org$/, "div.post-content"],
  [/\.substack\.com$/, "div.available-content"],
  [/(^|\.)cato-unbound\.org$/, "div.article-body"],
  [/(^|\.)a16z\.com$/, "div.js-article-content"],
  [/(^|\.)thenetworkstate\.com$/, "div.book-section"],
];
const COMMON = [".entry-content", "[itemprop=articleBody]", ".post-content", ".article-body", "article", "main", "body"];
// 본문 안이어도 건너뛰는 것: 스크립트 · 메뉴 · 공유 · 구독 단추 같은 것
const SKIP_TAGS = new Set(["script", "style", "noscript", "svg", "template", "iframe", "nav", "footer", "form", "button", "select"]);
const SKIP_CLS = ["sharedaddy", "share", "social", "subscription-widget-wrap", "subscription-widget", "button-wrapper", "captioned-button-wrap", "embedded-post-wrap", "digest-post-embed"];
const PAYWALL = ["div.paywall", "[data-testid=paywall]"];
// 앞 · 뒤 글로 가는 줄 (next » · « previous)
const NAV_LINE = /^(?:«\s*)?(?:next|previous|prev|older|newer)(?:\s+(?:post|entry))?(?:\s*»)?$/i;
// Substack 글 끝의 구독 · 공유 권유 줄
const CTA = /^(?:subscribe|share|leave a comment|give a gift subscription|thanks for reading)\b|why not:?$/i;
const KIND = { h1: "h", h2: "h", h3: "h", h4: "h", h5: "h", h6: "h", li: "li" };
const BLOCK = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "pre", "figcaption"]);

// 옛 blogspot 주소는 '옮겨졌어요' 안내뿐이라 영구 주소로 (www.unqualified-reservations.org/YYYY/MM/<slug>/)
export function canonical(u) {
  const m = /^https?:\/\/unqualified-reservations\.blogspot\.com\/(\d{4})\/(\d{2})\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/.exec(u);
  return m ? `https://www.unqualified-reservations.org/${m[1]}/${m[2]}/${m[3]}/` : u;
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", shy: "", raquo: "»", laquo: "«", rarr: "→", larr: "←", middot: "·", bull: "•", copy: "©", deg: "°", times: "×", eacute: "é", egrave: "è", aacute: "á", agrave: "à", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", ccedil: "ç", auml: "ä", ouml: "ö", uuml: "ü", iuml: "ï", szlig: "ß" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? m;
  const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  try { return String.fromCodePoint(n); } catch { return m; }
});
// 간단한 선택자만: 태그 · .클래스 · [속성=값] (자손 선택자 없이)
const parse = (sel) => { const m = /^([a-z0-9]*)(?:\.([\w-]+))?(?:\[([\w-]+)=([\w-]+)\])?$/i.exec(sel); return { tag: m[1] || null, cls: m[2] || null, attr: m[3] ? [m[3], m[4]] : null }; };
const hasClass = (el, c) => (" " + (el.getAttribute("class") || "") + " ").includes(" " + c + " ");
const hit = (el, p) => (!p.tag || el.tagName === p.tag) && (!p.cls || hasClass(el, p.cls)) && (!p.attr || el.getAttribute(p.attr[0]) === p.attr[1]);
const PAY = PAYWALL.map(parse);

/** HTML → { blocks: [{ k: "p" | "h" | "q" | "li", t }], paywall } */
export async function extract(html, host) {
  const own = BODY_SEL.find(([re]) => re.test(host))?.[1];
  const st = [...new Set([own, ...COMMON].filter(Boolean))].map((sel) => ({ sel, p: parse(sel), depth: 0, q: 0, cur: "p", buf: "", blocks: [] }));
  let skip = 0, paywall = false;
  const flush = (s) => {
    const t = decode(s.buf).replace(/\s+/g, " ").trim();
    s.buf = "";
    if (!t || s.blocks.length >= MAX_BLOCKS) return;
    s.blocks.push({ k: s.q > 0 ? "q" : s.cur, t });
  };
  const rw = new HTMLRewriter().on("*", {
    element(el) {
      const tag = el.tagName;
      if (el.canHaveContent === false) { if (tag === "br" && !skip) for (const s of st) if (s.depth > 0) s.buf += " "; return; }
      if (!paywall && PAY.some((p) => hit(el, p))) paywall = true;
      const isSkip = SKIP_TAGS.has(tag) || SKIP_CLS.some((c) => hasClass(el, c));
      const opened = st.filter((s) => hit(el, s.p));
      const isQ = tag === "blockquote", isBlock = BLOCK.has(tag);
      if (!isSkip && !opened.length && !isQ && !isBlock) return; // 끝에서 할 일이 없는 요소
      const active = st.filter((s) => s.depth > 0);
      if (isBlock || isQ) for (const s of active) { flush(s); if (isBlock) s.cur = KIND[tag] || "p"; if (isQ) s.q++; }
      for (const s of opened) { flush(s); s.depth++; }
      if (isSkip) skip++;
      el.onEndTag(() => { // 이 요소의 끝 알림은 여기 하나뿐
        if (isBlock || isQ) for (const s of active) { flush(s); if (isBlock) s.cur = "p"; if (isQ) s.q = Math.max(0, s.q - 1); }
        for (const s of opened) { flush(s); s.depth = Math.max(0, s.depth - 1); }
        if (isSkip) skip = Math.max(0, skip - 1);
      });
    },
  });
  rw.onDocument({ text(t) { if (skip) return; for (const s of st) if (s.depth > 0) s.buf += t.text; } });
  await rw.transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })).arrayBuffer();
  for (const s of st) {
    let b = s.blocks.filter((x) => (x.k !== "li" || x.t.split(" ").length > 2) && !NAV_LINE.test(x.t)); // 공유 단추 같은 한두 낱말 목록 · 앞뒤 글 링크는 빼요
    if (s.sel === "body" || s.sel === "main") b = b.filter((x) => x.k === "h" || x.t.length >= 40); // 바깥 상자는 메뉴 조각이 섞여서 짧은 줄은 빼요
    if (/\.substack\.com$/.test(host)) b = b.filter((x) => x.t.length > 90 || !CTA.test(x.t));
    if (b.filter((x) => x.k !== "h").length >= 3) return { blocks: b, paywall };
  }
  return { blocks: [], paywall };
}

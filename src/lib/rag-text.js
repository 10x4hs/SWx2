// 뜻으로 찾기의 글 다루기 (바깥 의존 없음 — node 시험(smoke)에서도 바로 불러요). src/rag.js 가 다시 내보내요.
const TARGET = 900, HARD = 1400, MIN = 200; // 노트 조각 글자 수 (≈ 200~500 토큰)
export const NOTE_MAX_CHUNKS = 60;          // 노트 하나에서 만드는 조각 최대 (뒤는 잘려요)

export const CIM_ORDER = ["s1c1", "s1c2", "s1c3", "s2c1", "s2c2", "s2c3", "s2c4", "s2c5", "s2c6", "s3c1", "s3c2", "s3c3", "s3c4", "s3c5", "s3c6", "s3c7", "s3c8", "s3c9", "s3c10"];
const cimBody = (b) => String(b || "").replace(/▶\s*핵심포인트 해설[^\n]*\n?/g, "").replace(/\n{3,}/g, "\n\n").trim();
export const cimHref = (key) => { const i = key.lastIndexOf("-"); return `#/cim/study/${key.slice(0, i)}/${key.slice(i + 1)}`; };

/** 장 JSON → CIM 카드 조각 + 문제 조각 (문제 id 는 public/js/cim/data.js 와 같게: q.k || `${key}-${i}`) */
export function cimRows(ch) {
  const id = `s${ch.s}c${ch.c}`, rows = [];
  for (const sec of ch.sec || []) for (const p of sec.p || []) {
    const key = `${id}-${p.n}`, path = `CIM > ${ch.s}과목 ${ch.c}장 ${ch.t} > ${sec.t} > ${p.t}`;
    rows.push({ id: "cim:" + key, source_type: "cim", source_id: key, title: p.t, path, text: cimBody(p.b) });
    (p.q || []).forEach((q, i) => {
      const qid = q.k || `${key}-${i}`;
      rows.push({ id: "cimq:" + qid, source_type: "cimq", source_id: key, title: p.t, path, text: [q.q, (q.o || []).join(" / "), q.x || ""].filter(Boolean).join("\n") });
    });
  }
  return rows;
}

function cleanMd(s) {
  return String(s || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/g, "$1")
    .replace(/\[\[([^\]|#\n]+)(?:[#|]([^\]\n]*))?\]\]/g, (_, t, l) => l || t)
    .replace(/^```.*$/gm, "")
    .replace(/<[^>\n]+>/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function splitLong(text) {
  // 긴 문단은 문장 단위로 TARGET 쯤에서 자르고, 앞 조각의 마지막 문장을 한 번 겹쳐요
  const sents = text.split(/(?<=[.!?。])\s+|\n/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  let cur = [];
  const len = (a) => a.reduce((n, x) => n + x.length + 1, 0);
  for (const s of sents) {
    if (cur.length && len(cur) + s.length > TARGET) { out.push(cur.join(" ")); cur = [cur[cur.length - 1]].filter((x) => x.length < 300); }
    if (s.length > HARD) { for (let i = 0; i < s.length; i += TARGET) out.push(s.slice(i, i + TARGET)); cur = []; continue; }
    cur.push(s);
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}
/** 노트 → [{ path, text }] (제목 > 절 경로, 300~1400자) */
export function chunkNote(title, body) {
  const lines = cleanMd(body).split("\n"), heads = [], secs = [];
  let cur = { path: title, lines: [] };
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (h) {
      if (cur.lines.join("").trim()) secs.push(cur);
      const lvl = h[1].length;
      while (heads.length && heads[heads.length - 1].lvl >= lvl) heads.pop();
      heads.push({ lvl, t: h[2].slice(0, 80) });
      cur = { path: [title, ...heads.map((x) => x.t)].join(" > "), lines: [] };
    } else cur.lines.push(line);
  }
  if (cur.lines.join("").trim()) secs.push(cur);
  const out = [];
  for (const sec of secs) {
    const blocks = sec.lines.join("\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    let buf = "";
    const flush = () => { if (buf.trim()) out.push({ path: sec.path, text: buf.trim() }); buf = ""; };
    for (const b of blocks) {
      if (b.length > HARD) { flush(); for (const piece of splitLong(b)) out.push({ path: sec.path, text: piece }); continue; }
      if (buf && buf.length + b.length + 2 > TARGET) flush();
      buf += (buf ? "\n\n" : "") + b;
    }
    flush();
  }
  // 아주 짧은 조각은 같은 절의 앞 조각에 붙여요
  const merged = [];
  for (const c of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.path === c.path && (c.text.length < MIN || prev.text.length < MIN) && prev.text.length + c.text.length < HARD) prev.text += "\n\n" + c.text;
    else merged.push({ ...c });
  }
  if (!merged.length) merged.push({ path: title, text: "" }); // 본문이 비어도 제목으로는 찾게
  return merged.slice(0, NOTE_MAX_CHUNKS);
}
const PARTICLES = ["에서", "으로", "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도"];
const stripParticle = (w) => { for (const p of PARTICLES) if (w.endsWith(p) && w.length - p.length >= 2) return w.slice(0, -p.length); return w; };
/** 검색어 → 낱말 (빈칸으로 나누고 조사를 떼요). 3글자 이상은 FTS MATCH, 2글자는 LIKE */
export function terms(q) {
  const words = String(q || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).map(stripParticle).filter((t) => t.length >= 2);
  return [...new Set(words)].slice(0, 16);
}

// 3글자 이상 낱말을 trigram 조각으로 나눠 OR 로 찾아요 ("제출하면" → 제출하 · 출하면) — 한국어는 어미가 붙어 낱말째로는 잘 안 맞아서
export const trigrams = (ts) => [...new Set(ts.flatMap((t) => Array.from({ length: t.length - 2 }, (_, i) => t.slice(i, i + 3))))].slice(0, 40);
/** 화면에 보일 한 줄 (검색어 낱말 근처) */
export function snippetOf(text, q, n = 120) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  let at = -1;
  for (const w of terms(q)) { at = low.indexOf(w); if (at >= 0) break; }
  const s = Math.max(0, at - 30);
  return (s ? "…" : "") + t.slice(s, s + n) + (s + n < t.length ? "…" : "");
}

/** 답의 근거 번호 검사: 없는 번호는 지우고, 실제로 단 번호를 돌려줘요 ([1, 2] · [1,2] 도 [1][2] 로) */
export function checkCites(text, n) {
  const used = new Set();
  const clean = String(text || "").replace(/\[(\d{1,2}(?:\s*[,，]\s*\d{1,2})*)\]/g, (m, inner) => {
    const ok = inner.split(/[,，]/).map((x) => Number(x.trim())).filter((k) => k >= 1 && k <= n);
    ok.forEach((k) => used.add(k));
    return ok.map((k) => `[${k}]`).join("");
  }).replace(/[ \t]+([.,!?])/g, "$1");
  return { text: clean, used };
}

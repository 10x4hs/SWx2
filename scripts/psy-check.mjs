// public/psy/*.json 검사: 스키마 · id 중복 · 참조 존재 · line 60자 · 근거 라벨 · 출처
// 사용: node scripts/psy-check.mjs   (문제가 있으면 exit 1)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "psy");
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const errs = [];
const err = (m) => errs.push(m);
const str = (v) => typeof v === "string" && v.trim().length > 0;

const TRACKS = ["persuasion", "argument", "business", "classical", "figures", "defense", "library"];
const EVIDENCE = ["strong", "mixed", "contested", "practitioner", "classical", "unverified"];
const CARD_TEXT = ["en", "ko", "line", "why", "example", "use", "counter"];
const YT = /^[A-Za-z0-9_-]{11}$/;

const { tracks, cards } = load("cards.json");
const { books } = load("books.json");
const { videos } = load("videos.json");
const { scenarios } = load("spar.json");

// 카드
const ids = new Map();
for (const c of cards) {
  const at = `card ${c.id}`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(c.id || "")) err(`${at}: id 형식`);
  if (ids.has(c.id)) err(`${at}: id 중복`);
  ids.set(c.id, c);
  if (!TRACKS.includes(c.track)) err(`${at}: track ${c.track}`);
  for (const k of CARD_TEXT) if (!str(c[k])) err(`${at}: ${k} 비어 있음`);
  if ([...(c.line || "")].length > 60) err(`${at}: line ${[...c.line].length}자 (>60)`);
  if (!EVIDENCE.includes(c.evidence)) err(`${at}: evidence ${c.evidence}`);
  if (!c.source || !str(c.source.cite)) err(`${at}: source.cite 없음`);
  const url = c.source?.url || "";
  if (url && !/^https?:\/\//.test(url)) err(`${at}: url 형식`);
  // URL이 없으면 '미확인'을 note에 남기거나 evidence를 unverified로 둔다
  if (!url && c.evidence !== "unverified" && !/미확인|확인하지 못/.test(c.note || "")) err(`${at}: url 없음 (note에 미확인 표시 필요)`);
  if (!Array.isArray(c.related)) err(`${at}: related 배열 아님`);
  if (c.track === "library" && !str(c.book)) err(`${at}: library 카드에 book 없음`);
  if (c.videos && !Array.isArray(c.videos)) err(`${at}: videos 배열 아님`);
}
const has = (id) => ids.has(id);
for (const c of cards) {
  for (const r of c.related || []) if (!has(r)) err(`card ${c.id}: related ${r} 없음`);
  if ((c.related || []).includes(c.id)) err(`card ${c.id}: 자기 자신을 related`);
}

// 트랙 순서
const seen = new Set();
if (tracks.map((t) => t.id).join() !== TRACKS.join()) err(`tracks 순서/목록: ${tracks.map((t) => t.id)}`);
for (const t of tracks) {
  for (const k of ["no", "en", "ko"]) if (!str(t[k])) err(`track ${t.id}: ${k}`);
  for (const id of t.order) {
    if (!has(id)) err(`track ${t.id}: order ${id} 없음`);
    else if (ids.get(id).track !== t.id) err(`track ${t.id}: ${id}는 ${ids.get(id).track} 카드`);
    if (seen.has(id)) err(`track ${t.id}: order ${id} 중복`);
    seen.add(id);
  }
}
for (const id of ids.keys()) if (!seen.has(id)) err(`card ${id}: 어느 track order에도 없음`);

// 책
const bookIds = new Set();
for (const b of books) {
  if (bookIds.has(b.id)) err(`book ${b.id}: id 중복`);
  bookIds.add(b.id);
  for (const k of ["en", "ko", "author", "shelf", "why"]) if (!str(b[k])) err(`book ${b.id}: ${k}`);
  if (!Number.isInteger(b.year)) err(`book ${b.id}: year`);
  for (const id of b.cards || []) {
    if (!has(id)) err(`book ${b.id}: card ${id} 없음`);
    else if (ids.get(id).book !== b.id) err(`book ${b.id}: card ${id}.book 불일치`);
  }
}
for (const c of cards) if (c.book && !bookIds.has(c.book)) err(`card ${c.id}: book ${c.book} 없음`);

// 영상
const vids = new Set();
for (const v of videos) {
  if (!YT.test(v.id)) err(`video ${v.id}: YouTube id 형식`);
  if (vids.has(v.id)) err(`video ${v.id}: 중복`);
  vids.add(v.id);
  for (const k of ["title", "channel", "lang", "kind", "why"]) if (!str(v[k])) err(`video ${v.id}: ${k}`);
  for (const t of v.tracks || []) if (!TRACKS.includes(t)) err(`video ${v.id}: track ${t}`);
  for (const id of v.covers || []) if (!has(id)) err(`video ${v.id}: covers ${id} 없음`);
}
for (const c of cards) for (const v of c.videos || []) if (!vids.has(v)) err(`card ${c.id}: video ${v} 없음`);

// 스파링
const sp = new Set();
for (const s of scenarios) {
  if (sp.has(s.id)) err(`spar ${s.id}: 중복`);
  sp.add(s.id);
  for (const k of ["title", "role", "goal", "opener"]) if (!str(s[k])) err(`spar ${s.id}: ${k}`);
  for (const id of s.cards || []) if (!has(id)) err(`spar ${s.id}: card ${id} 없음`);
}

const n = (k) => cards.filter((c) => c.evidence === k).length;
console.log(`psy: ${cards.length} cards · ${books.length} books · ${videos.length} videos · ${scenarios.length} scenarios`);
console.log(`evidence: ${EVIDENCE.map((k) => `${k} ${n(k)}`).join(" · ")} · no-url ${cards.filter((c) => !c.source?.url).length}`);
if (errs.length) {
  for (const e of errs.slice(0, 80)) console.error("✗ " + e);
  console.error(`${errs.length} problem(s)`);
  process.exit(1);
}
console.log("✓ psy content ok");

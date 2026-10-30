// Silicon Valley Mafia 내용 점검 (src/svm/data/*.json · 규격 src/svm/CONTENT_SPEC.md)
//   node scripts/svm-check.mjs            모양 · id · 서로 가리키는 것 (틀리면 실패)
//   node scripts/svm-check.mjs --net      + 영상 id 를 YouTube oEmbed 로, 주소를 실제로 열어 봐요 (느려요)
import { readFileSync } from "node:fs";

const DIR = new URL("../src/svm/data/", import.meta.url);
const errs = [], warns = [];
const bad = (m) => errs.push(m), warn = (m) => warns.push(m);
const read = (f) => { try { return JSON.parse(readFileSync(new URL(f, DIR), "utf8")); } catch (e) { bad(`${f}: ${e.message}`); return {}; } };
const core = read("core.json"), gray = read("gray.json"), lineage = read("lineage.json"), media = read("media.json"), guide = read("guide.json");
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, n) => typeof x === "string" && x.trim().length > 0 && (!n || x.length <= n);
const https = (u) => typeof u === "string" && /^https:\/\/[^\s]+$/.test(u);

const CONCEPTS = ["cathedral", "formalism", "neocameralism", "patchwork", "democracy", "universalism", "sovereignty", "monarchy", "rage", "exit", "nrx", "castes", "network-state", "redpill"];
const PEOPLE = ["yarvin", "carlyle", "burnham", "hoppe", "land", "thiel", "balaji", "andreessen", "vance", "masters", "alexander", "sandifer"];
const RELS = ["INFLUENCED", "INVESTED", "BACKED", "CITED", "PEER", "CRITIC", "DEBATED"];
const RANGE = { intro: [1, 2], core: [3, 7], gray: [8, 11], lineage: [12, 15] };

const essays = [...arr(core.essays), ...arr(gray.essays), ...arr(lineage.essays)];
const concepts = arr(core.concepts), people = arr(lineage.people), edges = arr(lineage.edges), videos = arr(media.videos), more = arr(media.more);
const cIds = new Set(concepts.map((c) => c.id)), pIds = new Set(people.map((p) => p.id)), eIds = new Set();

// 글
if (essays.length !== 15) bad(`글이 ${essays.length}편이에요 (15편이어야 해요)`);
const nos = new Set();
for (const e of essays) {
  const at = `글 ${e.id || "?"}`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id || "")) bad(`${at}: id 모양`);
  if (eIds.has(e.id)) bad(`${at}: id 가 겹쳐요`); eIds.add(e.id);
  if (!Number.isInteger(e.no) || nos.has(e.no)) bad(`${at}: no ${e.no} (1~15, 겹치면 안 돼요)`); nos.add(e.no);
  const rg = RANGE[e.section];
  if (!rg) bad(`${at}: section ${e.section}`); else if (e.no < rg[0] || e.no > rg[1]) bad(`${at}: ${e.section} 는 no ${rg[0]}~${rg[1]}`);
  for (const k of ["title", "ko", "venue", "core"]) if (!str(e[k])) bad(`${at}: ${k} 없음`);
  if (!str(e.sub, 60)) bad(`${at}: sub 없음 · 60자 넘음`); else if (e.sub.length > 40) warn(`${at}: sub ${e.sub.length}자 (40자 권장)`);
  if (str(e.core) && e.core.length > 80) warn(`${at}: core ${e.core.length}자 (60자 권장)`);
  if (!Number.isInteger(e.year)) bad(`${at}: year`);
  if (e.note != null && !str(e.note, 200)) bad(`${at}: note 는 한 줄(200자까지)`);
  if (arr(e.claims).some((c) => /확인하지 못했|공개되지 않아/.test(c))) warn(`${at}: claims 에 요약의 한계가 섞였어요 (note 로)`);
  if (!pIds.has(e.author)) bad(`${at}: author ${e.author} 가 인물에 없어요`);
  const cl = arr(e.claims); if (cl.length < 3 || cl.length > 5 || !cl.every((x) => str(x))) bad(`${at}: claims ${cl.length}개 (3~5)`);
  for (const q of arr(e.quotes)) { if (!str(q.en) || !str(q.ko)) bad(`${at}: 인용 en · ko`); if (!https(q.url)) bad(`${at}: 인용 url`); if (str(q.en) && q.en.split(/\s+/).length > 60) warn(`${at}: 인용이 ${q.en.split(/\s+/).length}단어 (50 이하 권장)`); }
  if (!arr(e.quotes).length) warn(`${at}: 인용 없음`);
  if (!str(e.sv?.text)) warn(`${at}: sv.text 없음`);
  for (const x of arr(e.sv?.refs)) if (!https(x.url)) bad(`${at}: sv.refs url`);
  if (!arr(e.critiques).length) warn(`${at}: 비판 없음`);
  for (const c of arr(e.critiques)) { if (!str(c.text)) bad(`${at}: 비판 text`); if (c.url && !https(c.url)) bad(`${at}: 비판 url`); }
  if (!arr(e.sources).length) bad(`${at}: sources 없음`);
  for (const s of arr(e.sources)) { if (!https(s.url)) bad(`${at}: source url ${s.url}`); if (/unqualified-reservations\.blogspot\.com/.test(s.url || "")) warn(`${at}: blogspot 주소 (서버가 .org 로 바꿔 읽어요)`); }
  for (const c of arr(e.concepts)) if (!cIds.has(c)) bad(`${at}: 개념 ${c} 없음`);
  for (const p of arr(e.people)) if (!pIds.has(p)) bad(`${at}: 인물 ${p} 없음`);
}
for (let i = 1; i <= 15; i++) if (!nos.has(i)) bad(`no ${i} 인 글이 없어요`);

// 개념
for (const id of CONCEPTS) if (!cIds.has(id)) bad(`개념 ${id} 없음`);
for (const c of concepts) { if (!str(c.name) || !str(c.short) || !str(c.en)) bad(`개념 ${c.id}: name · short · en`); if (!arr(c.terms).length) warn(`개념 ${c.id}: terms 없음`); }

// 인물 · 관계
for (const id of PEOPLE) if (!pIds.has(id)) warn(`인물 ${id} 없음`);
for (const p of people) { if (!/^[a-z]+$/.test(p.id || "")) bad(`인물 id ${p.id}`); if (!str(p.name) || !str(p.ko)) bad(`인물 ${p.id}: name · ko`); if (p.lineage != null && !Number.isInteger(p.lineage)) bad(`인물 ${p.id}: lineage`); }
for (const x of edges) { const at = `관계 ${x.a}→${x.b}`; if (!pIds.has(x.a) || !pIds.has(x.b)) bad(`${at}: 인물 없음`); if (!RELS.includes(x.rel)) bad(`${at}: rel ${x.rel}`); if (!https(x.url)) bad(`${at}: url`); }

// 영상 · 더 읽을 거리
const vIds = new Set();
for (const v of videos) {
  const at = `영상 ${v.id}`;
  if (!/^[A-Za-z0-9_-]{11}$/.test(v.id || "")) bad(`${at}: id 모양`);
  if (vIds.has(v.id)) bad(`${at}: 겹쳐요`); vIds.add(v.id);
  if (!str(v.title) || !str(v.channel)) bad(`${at}: title · channel`);
  for (const p of arr(v.people)) if (!pIds.has(p)) bad(`${at}: 인물 ${p} 없음`);
  for (const c of arr(v.concepts)) if (!cIds.has(c)) bad(`${at}: 개념 ${c} 없음`);
  for (const e of arr(v.essays)) if (!eIds.has(e)) bad(`${at}: 글 ${e} 없음`);
}
for (const q of arr(guide.questions)) { if (!str(q.q) || !str(q.a)) bad(`질문 ${q.q}: q · a`); if (!q.to && !arr(q.essays).length) bad(`질문 ${q.q}: 글이 없어요`); for (const e of arr(q.essays)) if (!eIds.has(e)) bad(`질문 ${q.q}: 글 ${e} 없음`); }
if (arr(guide.questions).length < 5) warn(`질문이 ${arr(guide.questions).length}개 (5개 넘게 권장)`);
const urls = new Set(essays.flatMap((e) => arr(e.sources).map((s) => s.url)));
for (const m of more) { if (!str(m.title) || !https(m.url)) bad(`더 읽을 거리 ${m.title}: title · url`); if (urls.has(m.url)) warn(`더 읽을 거리 ${m.title}: 핵심 15편과 같은 주소`); }

if (process.argv.includes("--net")) {
  const UA = { "user-agent": "Mozilla/5.0 (Macintosh) svm-check" };
  for (const v of videos) {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${v.id}&format=json`).catch(() => null);
    const j = r?.ok ? await r.json() : null;
    if (!j) bad(`영상 ${v.id}: oEmbed 실패 (${r?.status})`); else if (j.title !== v.title) warn(`영상 ${v.id}: 제목이 달라요 — "${j.title}"`);
  }
  const all = [...new Set([...essays.flatMap((e) => [...arr(e.sources).map((s) => s.url), ...arr(e.quotes).map((q) => q.url), ...arr(e.sv?.refs).map((x) => x.url), ...arr(e.critiques).map((c) => c.url)]), ...edges.map((x) => x.url), ...more.map((m) => m.url)].filter(https))];
  for (let i = 0; i < all.length; i += 8) {
    await Promise.all(all.slice(i, i + 8).map(async (u) => {
      const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!r) warn(`주소 안 열림: ${u}`); else if (r.status >= 400 && ![401, 403, 429].includes(r.status)) bad(`주소 ${r.status}: ${u}`);
    }));
  }
}

for (const w of warns) console.log("주의  " + w);
for (const e of errs) console.log("틀림  " + e);
console.log(`\n글 ${essays.length} · 개념 ${concepts.length} · 인물 ${people.length} · 관계 ${edges.length} · 영상 ${videos.length} · 더 읽을 거리 ${more.length} — 틀림 ${errs.length} · 주의 ${warns.length}`);
process.exitCode = errs.length ? 1 : 0;

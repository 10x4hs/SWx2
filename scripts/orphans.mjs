// 주인 없는 파일 · 벡터 찾기 — R2(FILES) 객체와 Vectorize 벡터 중 그것을 가진 D1 줄이 없어진 것.
//   node scripts/orphans.mjs                  로컬(wrangler dev 와 같은 .wrangler/state) R2 · D1 만 보고 목록만 (지우지 않아요)
//   node scripts/orphans.mjs --delete         로컬에서 찾은 고아 R2 객체를 지워요
//   node scripts/orphans.mjs --vectors --i-know  벡터도 봐요 — 로컬엔 벡터 저장소가 없어서 wrangler dev 가 쓰는 개발 색인(swx2-chunks-dev, Cloudflare)을 읽어요
//   node scripts/orphans.mjs --remote --i-know [--delete]   배포본(D1 dsm-mafia · R2 dsm-mafia-files · swx2-chunks). --i-know 없이는 거절해요
//   --min-age=HOURS (기본 24)                 그보다 최근에 올린 R2 객체는 건드리지 않아요 (올리고 아직 저장 전인 사진)
//
// 주인 규칙 (classifyR2 · classifyVectors — scripts/orphans.test.mjs 가 서버 없이 확인해요):
//   nf-<uuid>.<ext>     note_files.key                              (노트 첨부, src/files.js)
//   room-<uuid>.<ext>   room_messages.ref_id                        (대화방 사진 · 영상, src/room.js)
//   diary-<uuid>.<ext>  diaries.blocks · body 안의 "/api/diary/img/<key>"   (일기 사진, src/diary.js)
//   ann/<uuid>.<ext>    announcements.body 안의 "/api/ann/img/<name>" (공지 사진, src/admin.js)
//   그 밖의 키           모르는 모양 → 목록에만 따로, 절대 안 지워요
//   벡터 id             chunks.id 가 없거나, 노트 조각인데 notes 줄이 없으면 고아 (rag_tomb 에 있으면 크론이 곧 지울 것 — 따로 표시)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DIARY_REF = /\/api\/diary\/img\/(diary-[A-Za-z0-9-]+\.[a-z0-9]+)/g;
export const ANN_REF = /\/api\/ann\/img\/([A-Za-z0-9-]+\.[a-z0-9]+)/g;
export const refsIn = (texts, re) => { const out = new Set(); for (const t of texts) for (const m of String(t || "").matchAll(re)) out.add(m[1]); return out; };

/** R2 객체 → { orphans, unknown, young, kept }. refs = { noteFiles, roomRefs, diaryKeys, annNames } (Set), now · minAgeMs 로 최근 것은 빼요 */
export function classifyR2(objects, refs, { now = Date.now(), minAgeMs = 24 * 3600e3 } = {}) {
  const out = { orphans: [], unknown: [], young: [], kept: 0 };
  for (const o of objects) {
    const key = o.key, at = o.uploaded ? new Date(o.uploaded).getTime() : 0;
    let owned;
    if (/^nf-[A-Za-z0-9-]+\.[a-z0-9]+$/.test(key)) owned = refs.noteFiles.has(key);
    else if (/^room-[A-Za-z0-9-]+\.[a-z0-9]+$/.test(key)) owned = refs.roomRefs.has(key);
    else if (/^diary-[A-Za-z0-9-]+\.[a-z0-9]+$/.test(key)) owned = refs.diaryKeys.has(key);
    else if (/^ann\/[A-Za-z0-9-]+\.[a-z0-9]+$/.test(key)) owned = refs.annNames.has(key.slice(4));
    else { out.unknown.push(key); continue; }
    if (owned) { out.kept++; continue; }
    if (at && now - at < minAgeMs) { out.young.push(key); continue; }
    out.orphans.push(key);
  }
  return out;
}

/** 벡터 id → { orphans, tomb, kept }. chunks = Map(id → { source_type, source_id }), notes = Set(노트 id), tombs = Set(id) */
export function classifyVectors(ids, chunks, notes, tombs) {
  const out = { orphans: [], tomb: [], kept: 0 };
  for (const id of ids) {
    const c = chunks.get(id);
    const alive = c && (c.source_type !== "note" || notes.has(c.source_id));
    if (alive) out.kept++;
    else if (tombs.has(id)) out.tomb.push(id);
    else out.orphans.push(id);
  }
  return out;
}

// ---------- 실행 ----------
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const has = (a) => process.argv.includes(a);

// D1 · R2 만 붙는 작은 설정으로 열어요 (Durable Object · AI 같은 다른 바인딩은 안 붙여요). 로컬 = wrangler dev 와 같은 .wrangler/state/v3
async function openEnv(remote) {
  const { getPlatformProxy } = await import("wrangler");
  const dir = mkdtempSync(join(tmpdir(), "orphans-")), cfg = join(dir, "wrangler.json");
  writeFileSync(cfg, JSON.stringify({
    name: "swx2-orphans", compatibility_date: "2026-09-01",
    d1_databases: [{ binding: "DB", database_name: "dsm-mafia", database_id: "0303dd60-ab34-409f-b4e9-39aff1cde845", preview_database_id: "00000000-0000-0000-0000-000000000000", ...(remote ? { remote: true } : {}) }],
    r2_buckets: [{ binding: "FILES", bucket_name: "dsm-mafia-files", ...(remote ? { remote: true } : {}) }],
  }));
  const p = await getPlatformProxy(remote ? { configPath: cfg, persist: false } : { configPath: cfg, persist: { path: join(ROOT, ".wrangler/state/v3") }, remoteBindings: false });
  return { ...p, dispose: async () => { await p.dispose(); rmSync(dir, { recursive: true, force: true }); } };
}

async function listR2(bucket) {
  const all = []; let cursor;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    for (const o of page.objects) all.push({ key: o.key, uploaded: o.uploaded });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return all;
}

const wr = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
function listVectorIds(index) {
  const ids = []; let cursor;
  do {
    const raw = wr(["vectorize", "list-vectors", index, "--count", "1000", "--json", ...(cursor ? ["--cursor", cursor] : [])]);
    const d = JSON.parse(raw.slice(raw.indexOf("{")));
    for (const v of d.vectors || []) ids.push(typeof v === "string" ? v : v.id);
    cursor = d.isTruncated ? d.nextCursor : undefined;
  } while (cursor);
  return ids;
}

async function main() {
  const remote = has("--remote"), del = has("--delete"), withVec = remote || has("--vectors");
  const minAgeMs = Number((process.argv.find((a) => a.startsWith("--min-age=")) || "=24").split("=")[1]) * 3600e3;
  // Cloudflare 에 닿는 건 둘 다 --i-know 가 있어야 해요: --remote(배포본 D1 · R2 · Vectorize) · --vectors(개발 색인 swx2-chunks-dev)
  if ((remote || withVec) && !has("--i-know")) {
    console.error(`${remote ? "--remote 는 배포본(D1 · R2 · Vectorize)" : "--vectors 는 Cloudflare 의 개발 색인(swx2-chunks-dev)"}을 읽어요. 정말 그럴 거면 --i-know 를 같이 붙여 주세요. (지우기는 --delete 까지)`);
    process.exit(2);
  }
  if (!Number.isFinite(minAgeMs) || minAgeMs < 0) { console.error("--min-age=시간(숫자)"); process.exit(2); }
  console.log(`대상: ${remote ? "배포본 (remote)" : "로컬 (.wrangler/state)"} · ${del ? "찾은 고아를 지워요" : "목록만 (지우려면 --delete)"}`);
  const { env, dispose } = await openEnv(remote);
  try {
    const q = async (sql) => (await env.DB.prepare(sql).all()).results;
    // R2
    const objects = await listR2(env.FILES);
    const refs = {
      noteFiles: new Set((await q("SELECT key FROM note_files")).map((r) => r.key)),
      roomRefs: new Set((await q("SELECT ref_id FROM room_messages WHERE ref_id LIKE 'room-%'")).map((r) => r.ref_id)),
      diaryKeys: refsIn((await q("SELECT COALESCE(blocks, '') || ' ' || body AS t FROM diaries WHERE instr(COALESCE(blocks, '') || body, '/api/diary/img/') > 0")).map((r) => r.t), DIARY_REF),
      annNames: refsIn((await q("SELECT body FROM announcements WHERE instr(body, '/api/ann/img/') > 0")).map((r) => r.body), ANN_REF),
    };
    const r2 = classifyR2(objects, refs, { minAgeMs });
    console.log(`\nR2: 객체 ${objects.length}개 · 주인 있음 ${r2.kept} · 고아 ${r2.orphans.length} · 최근이라 건너뜀 ${r2.young.length} · 모르는 모양 ${r2.unknown.length}`);
    for (const k of r2.orphans) console.log("  고아  " + k);
    for (const k of r2.unknown) console.log("  모름  " + k + "  (안 지워요)");
    if (del && r2.orphans.length) {
      for (let i = 0; i < r2.orphans.length; i += 1000) await env.FILES.delete(r2.orphans.slice(i, i + 1000));
      console.log(`  → R2 고아 ${r2.orphans.length}개를 지웠어요`);
    }
    // Vectorize
    if (!withVec) console.log("\n벡터: 건너뜀 (로컬엔 벡터 저장소가 없어요 — 개발 색인까지 보려면 --vectors)");
    else {
      const index = remote ? "swx2-chunks" : "swx2-chunks-dev";
      const ids = listVectorIds(index);
      const chunks = new Map((await q("SELECT id, source_type, source_id FROM chunks")).map((r) => [r.id, r]));
      const notes = new Set((await q("SELECT id FROM notes")).map((r) => r.id));
      const tombs = new Set((await q("SELECT id FROM rag_tomb")).map((r) => r.id));
      const v = classifyVectors(ids, chunks, notes, tombs);
      console.log(`\n벡터 (${index}): ${ids.length}개 · 주인 있음 ${v.kept} · 고아 ${v.orphans.length} · 지울 차례(rag_tomb) ${v.tomb.length}`);
      for (const id of v.orphans) console.log("  고아  " + id);
      if (del && v.orphans.length) {
        for (let i = 0; i < v.orphans.length; i += 100) wr(["vectorize", "delete-vectors", index, "--ids", ...v.orphans.slice(i, i + 100)]);
        console.log(`  → 벡터 고아 ${v.orphans.length}개를 지웠어요`);
      }
    }
  } finally { await dispose(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch((e) => { console.error(e?.message || e); process.exit(1); });

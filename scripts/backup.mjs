#!/usr/bin/env node
// 운영 D1 백업 — 모든 실제 표의 데이터를 SQL 파일 하나로 받아 저장소 밖(기본 ~/Documents/swx2-backups)에 둬요.
//   npm run backup                 지금 백업 (deploy.sh 가 마이그레이션 직전에 자동으로 불러요)
//   npm run backup -- --keep 30    최근 30개만 남기고 오래된 건 지워요 (기본 14)
//   BACKUP_DIR=/path npm run backup
//
// 왜 이렇게 하나: `wrangler d1 export` 는 FTS5 가상 표(chunks_fts)가 있으면 DB 전체 내보내기에 실패해요.
// 그래서 sqlite_master 에서 실제 표만 골라 --table 로 넘기고, 데이터만(--no-schema) 받아요.
// 스키마는 migrations/ 가 정본이라 따로 안 받아요.
//
// 되살리기 (새 DB 기준):
//   1) npx wrangler d1 migrations apply <새 DB> --remote          스키마 + 빈 표
//   2) gunzip -k swx2-<시각>.sql.gz && npx wrangler d1 execute <새 DB> --remote --file swx2-<시각>.sql
//   3) npx wrangler d1 execute <새 DB> --remote --command "INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')"
// 같은 DB 를 몇 분 ~ 며칠 전으로 되돌릴 땐 이 파일보다 Time Travel 이 빨라요: 함께 적어 둔 .bookmark 를 쓰세요
//   npx wrangler d1 time-travel restore dsm-mafia --bookmark <bookmark>
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, createReadStream, createWriteStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";

const DB = "dsm-mafia";
const args = process.argv.slice(2);
const keep = Number(args[args.indexOf("--keep") + 1]) || 14;
const dir = process.env.BACKUP_DIR || join(homedir(), "Documents", "swx2-backups");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

const wr = (...a) => execFileSync("npx", ["wrangler", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });

// ---------- 긴 행 나누기 ----------
// D1 은 SQL 문 하나가 100KB 를 넘으면 받지 않아요 (SQLITE_TOOBIG). 앱은 값을 바인딩으로 넣어서 더 긴 노트 · 페이지 코드가 있는데,
// export 는 값을 SQL 글자로 풀어 한 줄에 써요 → 그대로는 되살릴 수 없어요.
// 그래서 긴 줄은 "긴 칸은 '' 로 INSERT" + "UPDATE 칸 = 칸 || '조각' WHERE 짧은 칸들" 여러 개로 바꿔요. 이어 붙이면 원래 값 그대로예요.
export const LIMIT = 90_000; // bytes, D1 한도 100KB 보다 여유 있게
const CHUNK = 30_000;        // 조각 하나의 글자 바이트 (+ 감싸는 글자 · WHERE)

// VALUES( … ) 안을 맨 바깥 쉼표로 나눠요 ('…' 안 · 괄호 안 쉼표는 그대로)
export function splitValues(s) {
  const out = []; let depth = 0, q = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "'") { if (s[i + 1] === "'") i++; else q = false; } continue; }
    if (c === "'") q = true;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out;
}

// 글자 하나를 바이트 한도 안의 조각들로 — '' 짝과 \n 같은 \ + 글자는 경계에서 자르지 않아요
function chunkLiteral(lit) {
  const parts = []; let cur = "", n = 0;
  for (let i = 0; i < lit.length; i++) {
    let tok = lit[i];
    if ((tok === "'" && lit[i + 1] === "'") || tok === "\\") tok += lit[++i] ?? "";
    else if (/[\ud800-\udbff]/.test(tok)) tok += lit[++i] ?? ""; // 이모지 같은 짝 글자
    const b = Buffer.byteLength(tok);
    if (n + b > CHUNK && cur) { parts.push(cur); cur = ""; n = 0; }
    cur += tok; n += b;
  }
  if (cur) parts.push(cur);
  return parts;
}

export function splitInsert(line) {
  if (Buffer.byteLength(line) < LIMIT) return [line];
  const m = line.match(/^INSERT INTO ("[^"]+") \(([^)]*)\) VALUES\((.*)\);$/s);
  if (!m) throw new Error(`긴 줄을 읽지 못했어요: ${line.slice(0, 80)}`);
  const [, table, colList] = m, cols = colList.split(","), vals = splitValues(m[3]);
  if (cols.length !== vals.length) throw new Error(`칸 수가 안 맞아요 (${table})`);
  const longIdx = vals.map((v, i) => (Buffer.byteLength(v) > 2_000 ? i : -1)).filter((i) => i >= 0);
  const where = vals.map((v, i) => (longIdx.includes(i) ? null : `${cols[i]} IS ${v}`)).filter(Boolean);
  if (!where.length) throw new Error(`긴 줄에 짧은 칸이 없어 찾을 수 없어요 (${table})`);
  const out = [`INSERT INTO ${table} (${colList}) VALUES(${vals.map((v, i) => (longIdx.includes(i) ? "''" : v)).join(",")});`];
  for (const i of longIdx) {
    const v = vals[i];
    if (/^X'/i.test(v)) throw new Error(`긴 blob 은 글자로 나눌 수 없어요 (${table}.${cols[i]})`);
    // 'lit'  또는  replace(replace('lit','\r',char(13)),'\n',char(10))  꼴
    const w = v.match(/^((?:replace\()*)'(.*)'((?:,'\\[rn]',char\(1[03]\)\))*)$/s);
    if (!w) throw new Error(`긴 값 모양을 몰라요 (${table}.${cols[i]}): ${v.slice(0, 60)}`);
    for (const part of chunkLiteral(w[2])) out.push(`UPDATE ${table} SET ${cols[i]} = ${cols[i]} || ${w[1]}'${part}'${w[3]} WHERE ${where.join(" AND ")};`);
  }
  for (const q of out) if (Buffer.byteLength(q) >= LIMIT) throw new Error(`나눠도 긴 문장이 남았어요 (${table})`);
  return out;
}

// 백업에서 빼는 표:FTS 가상 표와 그 그림자 표, D1/SQLite 내부 표, 마이그레이션 기록(되살릴 때 migrations apply 가 채워요)
export function pickTables(rows) {
  const virt = rows.filter((r) => /^CREATE VIRTUAL TABLE/i.test(r.sql || "")).map((r) => r.name);
  return rows.map((r) => r.name).filter((n) =>
    !virt.includes(n) && !virt.some((v) => n.startsWith(v + "_")) && !/^(sqlite_|_cf_|d1_)/.test(n)).sort();
}

// 되살릴 문장: 긴 줄은 나누고, INSERT 는 OR REPLACE 로 — migrations 가 미리 넣는 기본 행(room_settings 등)보다 백업 값이 이겨요
export const restoreLines = (line) => splitInsert(line).map((q) => q.replace(/^INSERT INTO /, "INSERT OR REPLACE INTO "));

// export 파일 → 긴 줄을 나눈 뒤 gzip 으로 (나눈 줄 수를 돌려줘요)
export async function packFile(src, dest) {
  let split = 0;
  async function* lines() {
    const rl = createInterface({ input: createReadStream(src, "utf8"), crlfDelay: Infinity });
    for await (const line of rl) { const parts = restoreLines(line); if (parts.length > 1) split++; yield parts.join("\n") + "\n"; }
  }
  await pipeline(Readable.from(lines()), createGzip(), createWriteStream(dest));
  return split;
}

async function main() {
  // node scripts/backup.mjs --pack <export.sql>  : 이미 받은 export 파일만 나눠서 .gz 로 (되살리기 연습용)
  if (args[0] === "--pack") { const n = await packFile(args[1], args[1] + ".gz"); console.log(`${args[1]}.gz · 긴 행 ${n}개 나눔`); return; }
  mkdirSync(dir, { recursive: true });
  const out = JSON.parse(wr("d1", "execute", DB, "--remote", "--json", "--command", "SELECT name, sql FROM sqlite_master WHERE type='table'"));
  const tables = pickTables(out[0].results);
  if (tables.length < 10) throw new Error(`표가 ${tables.length}개뿐이에요 — DB 이름이나 로그인을 확인해 주세요`);
  const bookmark = (() => { try { return JSON.parse(wr("d1", "time-travel", "info", DB, "--json")).bookmark; } catch { return ""; } })();

  const sql = join(dir, `swx2-${stamp}.sql`);
  wr("d1", "export", DB, "--remote", "--no-schema", "--output", sql, ...tables.flatMap((t) => ["--table", t]));
  const size = statSync(sql).size;
  if (size < 1024) throw new Error(`백업 파일이 너무 작아요 (${size} bytes) — 내보내기가 실패했을 수 있어요`);
  const split = await packFile(sql, sql + ".gz");
  unlinkSync(sql);
  writeFileSync(join(dir, `swx2-${stamp}.bookmark`), `${bookmark}\n`);

  // 오래된 것 정리 (짝 파일 .bookmark 도 같이)
  const olds = readdirSync(dir).filter((f) => /^swx2-\d{8}-\d{6}\.sql\.gz$/.test(f)).sort().reverse().slice(keep);
  for (const f of olds) { unlinkSync(join(dir, f)); try { unlinkSync(join(dir, f.replace(".sql.gz", ".bookmark"))); } catch {} }

  const gz = statSync(sql + ".gz").size;
  console.log(`백업 OK: ${sql}.gz (${(gz / 1024).toFixed(0)} KB · 표 ${tables.length}개${split ? ` · 긴 행 ${split}개는 나눠 담음` : ""})${bookmark ? `\nTime Travel 북마크: ${bookmark}` : ""}${olds.length ? `\n오래된 백업 ${olds.length}개 지웠어요 (최근 ${keep}개 유지)` : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("백업 실패:", e.stderr?.toString().trim() || e.message); process.exit(1); });

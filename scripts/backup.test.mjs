// node --test scripts/backup.test.mjs — 백업 파일이 D1 에 다시 들어가는지 (서버 없이 도는 단위 검사)
import test from "node:test";
import assert from "node:assert/strict";
import { splitValues, splitInsert, pickTables, restoreLines, LIMIT } from "./backup.mjs";

const big = (n, s = "가나다 abc\\n") => s.repeat(Math.ceil(n / s.length)).slice(0, n);
const bytes = (s) => Buffer.byteLength(s);

test("splitValues keeps quotes, '' escapes and nested replace() together", () => {
  assert.deepEqual(splitValues(`'a,b',NULL,3,replace('x''y\\n','\\n',char(10)),X'00ff'`),
    [`'a,b'`, "NULL", "3", `replace('x''y\\n','\\n',char(10))`, `X'00ff'`]);
});

test("short INSERT is left alone", () => {
  const s = `INSERT INTO "t" ("id","v") VALUES('1','hi');`;
  assert.deepEqual(splitInsert(s), [s]);
});

test("long INSERT becomes INSERT + appending UPDATEs, each under the limit, same text back", () => {
  const lit = big(300_000).replace(/'/g, "''") + "''끝";
  const s = `INSERT INTO "notes" ("id","user_id","body","n") VALUES('n1',7,replace(replace('${lit}','\\r',char(13)),'\\n',char(10)),NULL);`;
  const out = splitInsert(s);
  assert.ok(out.length > 3);
  for (const q of out) assert.ok(bytes(q) < LIMIT, `statement ${bytes(q)} bytes`);
  assert.match(out[0], /^INSERT INTO "notes" \("id","user_id","body","n"\) VALUES\('n1',7,'',NULL\);$/);
  for (const q of out.slice(1)) assert.match(q, /^UPDATE "notes" SET "body" = "body" \|\| replace\(replace\('.*','\\r',char\(13\)\),'\\n',char\(10\)\) WHERE "id" IS 'n1' AND "user_id" IS 7 AND "n" IS NULL;$/s);
  // 조각을 이으면 원래 글자 그대로 (escape '' 와 \n 이 조각 경계에서 끊기지 않아요)
  const chunks = out.slice(1).map((q) => q.match(/replace\(replace\('(.*)','\\r',char\(13\)\)/s)[1]);
  assert.equal(chunks.join(""), lit);
  for (const c of chunks) { assert.ok(!c.replace(/''/g, "").includes("'"), "a '' escape was cut"); assert.ok(!c.endsWith("\\"), "a \\n was cut"); }
});

test("long blob is refused instead of silently corrupted", () => {
  const s = `INSERT INTO "f" ("id","b") VALUES('1',X'${"ab".repeat(80_000)}');`;
  assert.throws(() => splitInsert(s), /blob/);
});

test("pickTables drops FTS virtual + shadow tables and internal tables", () => {
  const rows = [
    { name: "notes", sql: "CREATE TABLE notes(id)" },
    { name: "chunks_fts", sql: "CREATE VIRTUAL TABLE chunks_fts USING fts5(x)" },
    { name: "chunks_fts_data", sql: "CREATE TABLE 'chunks_fts_data'(id)" },
    { name: "chunks", sql: "CREATE TABLE chunks(rid)" },
    { name: "d1_migrations", sql: "CREATE TABLE d1_migrations(id)" },
    { name: "_cf_METADATA", sql: "CREATE TABLE _cf_METADATA(k)" },
    { name: "sqlite_sequence", sql: "CREATE TABLE sqlite_sequence(name,seq)" },
  ];
  assert.deepEqual(pickTables(rows), ["chunks", "notes"]);
});

test("restore lines replace seeded rows instead of failing on them", () => {
  assert.deepEqual(restoreLines(`INSERT INTO "room_settings" ("key","v") VALUES('a','1');`), [`INSERT OR REPLACE INTO "room_settings" ("key","v") VALUES('a','1');`]);
  assert.deepEqual(restoreLines(`PRAGMA defer_foreign_keys=TRUE;`), [`PRAGMA defer_foreign_keys=TRUE;`]);
  const long = restoreLines(`INSERT INTO "t" ("id","v") VALUES('1','${"x".repeat(120_000)}');`);
  assert.match(long[0], /^INSERT OR REPLACE INTO "t"/); assert.match(long[1], /^UPDATE "t"/);
});

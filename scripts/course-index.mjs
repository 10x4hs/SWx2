// 과정 목록(index.json) 만들기 · 검사 — 경영(mba) · SW 공간(dev · vg · onto · aip) 공용. 규칙은 scripts/lib/course-schema.mjs
//   node scripts/course-index.mjs [mba|dev|vg|onto|aip …]          public/<과정>/index.json 을 새로 써요 (과정을 안 적으면 전부)
//   node scripts/course-index.mjs [과정 …] --check                 모듈 파일 규칙 검사 + 목록이 낡았으면 실패 (npm test · CI · deploy.sh 가 불러요)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTERS, buildIndex } from "./lib/course-schema.mjs";

const PUB = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const args = process.argv.slice(2), CHECK = args.includes("--check");
const keys = args.filter((a) => !a.startsWith("--"));
for (const k of keys) if (!ADAPTERS[k]) { console.error(`모르는 과정: ${k} (${Object.keys(ADAPTERS).join(" · ")})`); process.exit(2); }
let failed = false;
for (const key of keys.length ? keys : Object.keys(ADAPTERS)) {
  const a = ADAPTERS[key], dir = join(PUB, a.dir), file = join(dir, "index.json");
  const read = (id) => { const f = join(dir, `${id}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
  const { text, problems, summary } = buildIndex(a, read);
  if (CHECK) {
    if (problems.length) { console.error(`${key} 모듈 파일 문제:\n  ` + problems.join("\n  ")); failed = true; continue; }
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) { console.error(`public/${a.dir}/index.json 이 낡았어요 → ${a.cmd}`); failed = true; continue; }
    console.log(summary + " 최신");
  } else {
    if (problems.length) console.warn(`주의 (${key}):\n  ` + problems.join("\n  "));
    writeFileSync(file, text);
    console.log("index.json 썼어요 — " + summary);
  }
}
if (failed) process.exit(1);

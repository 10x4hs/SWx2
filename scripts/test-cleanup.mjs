// 검사가 만든 임시 계정(t_…) 지우기 — 로컬 D1 만 (--remote 는 일부러 없어요). 계정을 지우면 계획 · 노트 · 일기 … 은 같이 지워져요 (ON DELETE CASCADE)
//   node scripts/test-cleanup.mjs              t_… 전부
//   node scripts/test-cleanup.mjs --stale      2시간 넘은 t_… 만 (지금 도는 다른 검사 것은 남겨요)
//   node scripts/test-cleanup.mjs --tag=abc    이름에 abc 가 들어간 t_… 만 (한 실행이 만든 것)
import { execFileSync } from "node:child_process";

const arg = (k) => process.argv.slice(2).find((a) => a.startsWith("--" + k))?.split("=")[1] ?? (process.argv.includes("--" + k) ? true : null);
const tag = arg("tag"), stale = arg("stale");
if (tag && !/^[a-z0-9_]+$/.test(tag)) { console.error("tag 는 영문 소문자 · 숫자만"); process.exit(1); }
let where = "username LIKE 't\\_%' ESCAPE '\\'";
if (tag) where += ` AND username LIKE '%${tag}%'`;
if (stale) where += ` AND created_at < ${Date.now() - 2 * 3600e3}`;
const out = execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--json", "--command", `DELETE FROM users WHERE ${where}; SELECT changes() AS n;`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
let n = "?"; try { n = JSON.parse(out).at(-1).results[0].n; } catch {}
console.log(`test-cleanup: 임시 계정 ${n}개 지웠어요 (${tag ? "tag " + tag : stale ? "2시간 넘은 것" : "t_… 전부"})`);

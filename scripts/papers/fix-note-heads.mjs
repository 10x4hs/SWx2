// 이미 넣은 논문 하위 노트의 첫 줄 안내를 새 문구로 (한 번만 쓰는 보정 스크립트)  node scripts/papers/fix-note-heads.mjs [--remote]
import { readFileSync, writeFileSync } from "node:fs"; import { execFileSync } from "node:child_process";
const REMOTE = process.argv.includes("--remote");
const run = (args) => execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", REMOTE ? "--remote" : "--local", ...args, ...(REMOTE ? ["--yes"] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const idx = JSON.parse(readFileSync("public/papers/index.json", "utf8"));
const rows = JSON.parse(run(["--json", "--command", "SELECT n.id, n.title, n.body FROM notes n JOIN study_seed_notes s ON s.note_id = n.id WHERE s.kind='papers' AND n.parent_id IS NOT NULL"]))[0].results;
const q = (x) => "'" + x.replace(/'/g, "''") + "'";
const sql = [];
for (const r of rows) {
  const p = idx.papers.find((x) => x.title === r.title); if (!p) continue;
  const b = r.body.replace(/^> 🔗 \*\*\[공부 페이지 열기\]\(([^)]+)\)\*\* · (.*)$/m, (_, link, rest) => `> 🔗 **[공부 페이지 열기 →](${link})** 쉬운 설명 · 그림 · 영상 · 퀴즈 · 3분 설명 · AI 튜터가 여기 있어요 (그래프에서 이 점을 두 번 눌러도 열려요)\n> ${rest}`);
  if (b !== r.body) sql.push(`UPDATE notes SET body = ${q(b)} WHERE id = ${q(r.id)};`);
}
if (!sql.length) { console.log("고칠 노트가 없어요."); process.exit(0); }
writeFileSync(".wrangler/fix-heads.sql", sql.join("\n") + "\n"); run(["--file", ".wrangler/fix-heads.sql"]); console.log(`고친 노트 ${sql.length}개 (${REMOTE ? "배포" : "로컬"})`);

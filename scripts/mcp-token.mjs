// MCP 연결 토큰 (Bearer) — 연결마다 하나. 원문은 지금 한 번만 보여 주고, DB 에는 SHA-256 만 저장해요.
//   node scripts/mcp-token.mjs <아이디> <연결 이름> [--remote] [--out 파일]  새로 만들기 (같은 이름이 있으면 바꿔요 → 옛 토큰은 무효)
//     --out 을 주면 토큰을 화면에 찍지 않고 그 파일(권한 600)에 { url, token } JSON 으로 저장해요
//   node scripts/mcp-token.mjs <아이디> --list [--remote]           그 사람의 연결 목록
//   node scripts/mcp-token.mjs <아이디> <연결 이름> --revoke [--remote]   끊기
// 연결 이름 예: claude-code · cursor · codex · laptop (작업판에 "누가 했는지"로 남아요)
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const REMOTE = args.includes("--remote"), LIST = args.includes("--list"), REVOKE = args.includes("--revoke");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const [username, agent] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
const die = (m) => { console.error("✖ " + m); process.exit(1); };
if (!username) die("아이디를 주세요. 예: node scripts/mcp-token.mjs hsk claude-code --remote");
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const d1 = (sql) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", REMOTE ? "--remote" : "--local", "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0].results;
const fmt = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "-");

const user = d1(`SELECT id, display_name FROM users WHERE username = ${q(username)}`)[0];
if (!user) die(`그런 아이디가 없어요: ${username}`);

if (LIST) {
  const rows = d1(`SELECT agent, created_at, last_used_at FROM api_tokens WHERE user_id = ${q(user.id)} ORDER BY created_at`);
  console.log(rows.length ? rows.map((r) => `- ${r.agent} · 만든 날 ${fmt(r.created_at)} · 마지막 사용 ${fmt(r.last_used_at)}`).join("\n") : "연결이 없어요.");
  process.exit(0);
}
if (!agent || !/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(agent)) die("연결 이름은 영문 · 숫자 · . _ - 로 32자까지예요 (예: claude-code).");
const name = agent.toLowerCase();
if (REVOKE) {
  d1(`DELETE FROM api_tokens WHERE user_id = ${q(user.id)} AND agent = ${q(name)}`);
  console.log(`끊었어요: ${user.display_name} · ${name}`);
  process.exit(0);
}
const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
d1(`INSERT INTO api_tokens (token_hash, user_id, agent, created_at) VALUES (${q(hash)}, ${q(user.id)}, ${q(name)}, ${Date.now()})
    ON CONFLICT (user_id, agent) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, last_used_at = NULL`);
const url = REMOTE ? "https://swx2.dsm-mafia.workers.dev/mcp" : "http://127.0.0.1:8787/mcp";
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ url, agent: name, user: username, token }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(OUT, 0o600);
  console.log(`${user.display_name} · ${name} 토큰을 만들었어요 → ${OUT} (권한 600, 화면에는 안 찍어요)\n  주소: ${url}`);
} else {
  console.log(`${user.display_name} · ${name} 토큰을 만들었어요 (지금만 보여요 — 잃어버리면 다시 만들어요)\n\n  주소:  ${url}\n  헤더:  Authorization: Bearer ${token}\n`);
}

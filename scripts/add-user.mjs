// 계정 만들기 / 비밀번호 바꾸기 (가입 신청 · 승인 없이 바로 쓰는 계정)
//   node scripts/add-user.mjs <아이디> <이름> <비밀번호> [--color=#E8552B] [--team=swx2] [--remote]
// --team 을 주면 그 팀에 넣어요 (팀이 없으면 혼자 써요).
// 같은 아이디가 있으면 이름·비밀번호만 바꿔요. --remote 를 붙이면 배포된 DB에 적용돼요.
// 스터디장이 정해 준 비밀번호라서, 그 사람은 첫 로그인 때 꼭 새 비밀번호로 바꿔야 해요 (must_change_pw = 1).
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
const [username, name, given] = args.filter((a) => !a.startsWith("--"));
if (!username || !name) {
  console.error("사용법: node scripts/add-user.mjs <아이디> <이름> [비밀번호] [--color=#4C6FFF] [--remote]");
  process.exit(1);
}
// 비밀번호를 비우면 무작위 값으로 채워요 (PASSWORDLESS=1 이면 아이디만으로 들어가요)
const password = given || randomBytes(18).toString("base64url");
if (!/^[a-z0-9_]{3,20}$/.test(username)) { console.error("아이디는 영문 소문자·숫자·_ 3~20자예요."); process.exit(1); }
// 임시 비밀번호라 짧아도 돼요(첫 로그인 때 8자 이상으로 바꿔야 해요). 4자 미만만 막아요.
if (password.length < 4) { console.error("비밀번호는 4자 이상이어야 해요."); process.exit(1); }
if (password.length < 8) console.warn("짧은 임시 비밀번호예요 — 그 사람은 첫 로그인 때 8자 이상으로 바꿔야 해요.");
const color = /^#[0-9a-fA-F]{6}$/.test(flags.color || "") ? flags.color : null;

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex"); // worker.js 와 같은 방식
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const palette = ["#E8552B", "#4C6FFF", "#14A38B"];
const colorSql = color ? q(color) : `(SELECT CASE (SELECT COUNT(*) FROM users) % 3 WHEN 0 THEN ${q(palette[0])} WHEN 1 THEN ${q(palette[1])} ELSE ${q(palette[2])} END)`;
const sql = `INSERT INTO users (id, username, display_name, color, pw_hash, pw_salt, must_change_pw, created_at)
VALUES (${q(randomUUID())}, ${q(username)}, ${q(name)}, ${colorSql}, ${q(hash)}, ${q(salt.toString("hex"))}, 1, ${Date.now()})
ON CONFLICT(username) DO UPDATE SET display_name = excluded.display_name, pw_hash = excluded.pw_hash, pw_salt = excluded.pw_salt, must_change_pw = 1, fail_count = 0, locked_until = 0${color ? ", color = excluded.color" : ""};
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ${q(username)});${flags.team ? `
INSERT OR IGNORE INTO team_members (team_id, user_id, joined_at) SELECT ${q(flags.team)}, id, ${Date.now()} FROM users WHERE username = ${q(username)} AND EXISTS (SELECT 1 FROM teams WHERE id = ${q(flags.team)});` : ""}`;

execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", flags.remote ? "--remote" : "--local", "--command", sql], { stdio: ["ignore", "ignore", "inherit"] });
console.log(`✓ ${name} (@${username}) 계정을 ${flags.remote ? "배포 DB" : "로컬 DB"}에 저장했어요. 첫 로그인 때 비밀번호를 바꾸게 돼요.`);

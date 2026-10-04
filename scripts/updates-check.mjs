// 배포 전: 업데이트 기록(public/updates.json)에 빠진 커밋이 있으면 알려 줘요 (막지는 않아요).
// chore · docs · test 커밋과 기록 자체를 고친 커밋은 빼요.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const { updates } = JSON.parse(readFileSync(new URL("../public/updates.json", import.meta.url), "utf8"));
const have = new Set(updates.flatMap((u) => u.commits || []));
const log = execFileSync("git", ["log", "--pretty=%h %s"], { encoding: "utf8" }).trim().split("\n");
const miss = log.filter((l) => { const [h, ...s] = l.split(" "); const msg = s.join(" "); return !have.has(h) && !/^(chore|docs|test)\b|\(updates\)/.test(msg); });
if (miss.length) console.log(`⚠ 업데이트 기록에 없는 커밋 ${miss.length}개 — public/updates.json 에 한 줄 추가해 주세요:\n` + miss.map((m) => "  " + m).join("\n"));
else console.log("✓ 업데이트 기록이 최신이에요.");

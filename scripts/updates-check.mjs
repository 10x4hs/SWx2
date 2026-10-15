// 배포 전: 업데이트 기록(public/updates.json)에 빠진 커밋이 있으면 알려 줘요 (막지는 않아요).
// chore · docs · test 커밋과 기록 자체를 고친 커밋은 빼요.
// 병합 커밋은 들여온 커밋이 모두 기록에 있거나 빼는 커밋이면 빼요 — 병합 커밋 번호는 병합 전엔 알 수 없어서, 안 그러면 병합할 때마다 하나씩 빠졌다고 나와요.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const { updates } = JSON.parse(readFileSync(new URL("../public/updates.json", import.meta.url), "utf8"));
const have = new Set(updates.flatMap((u) => u.commits || []));
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const rows = git("log", "--pretty=%H%x09%h%x09%P%x09%s").split("\n").map((l) => { const [H, h, P, s] = l.split("\t"); return { H, h, parents: P.split(" ").filter(Boolean), s }; });
const byH = new Map(rows.map((r) => [r.H, r]));
const skip = (r) => have.has(r.h) || /^(chore|docs|test)\b|\(updates\)/.test(r.s);
// 병합으로 들여온 커밋(첫 부모에는 없던 것) 중 병합이 아닌 커밋이 모두 기록에 있거나 빼는 커밋인가
const covered = (r) => git("rev-list", ...r.parents.slice(1), "^" + r.parents[0]).split("\n").filter(Boolean).map((H) => byH.get(H)).every((x) => !x || x.parents.length > 1 || skip(x));
const miss = rows.filter((r) => !skip(r) && !(r.parents.length > 1 && covered(r))).map((r) => `${r.h} ${r.s}`);
if (miss.length) console.log(`⚠ 업데이트 기록에 없는 커밋 ${miss.length}개 — public/updates.json 에 한 줄 추가해 주세요:\n` + miss.map((m) => "  " + m).join("\n"));
else console.log("✓ 업데이트 기록이 최신이에요.");

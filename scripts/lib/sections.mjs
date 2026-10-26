// 검사 구역(section) — smoke.mjs · e2e.mjs 의 덩어리마다 이름을 붙여 골라 돌려요.
//   SECTIONS=a,b        이 구역만 (이름 밖의 '바탕' 코드 — 로그인 · 계획 · 노트 — 는 늘 돌아요)
//   SKIP_SECTIONS=a,b   이 구역은 빼고
//   AI_MOCK=1           'ai-real' 표시가 붙은 구역(진짜 AI 답을 봐야 하는 것)은 건너뛰어요 (full 단계에서만)
//   SUMMARY_FILE=x.json 끝나면 구역별 통과/실패/시간을 JSON 으로 써요 (scripts/test.mjs 가 표로 모아요)
// 아무것도 안 주면 예전처럼 전부 돌아요.
import { writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";

// 여러 검사가 같이 돌면 로컬 D1(SQLite 파일)을 동시에 만지다 'database is locked' 로 한 번씩 실패해요.
// 그래서 로컬 D1 을 만지는 명령(wrangler d1 execute · add-user · mcp-token · test-cleanup)만 조금 쉬었다 다시 해요 (최대 6번).
// 잠겨서 실패한 쓰기는 반영되지 않았으니 다시 해도 두 번 들어가지 않아요. import 한 쪽에도 보이게 syncBuiltinESMExports.
{
  const cp = createRequire(import.meta.url)("node:child_process"), raw = cp.execFileSync;
  const local = (cmd, a = []) => (a.includes("d1") && a.includes("execute")) || a.some((x) => /scripts\/(add-user|mcp-token|test-cleanup)\.mjs$/.test(String(x)));
  const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  cp.execFileSync = function (cmd, a, o) {
    if (!local(cmd, a)) return raw.call(this, cmd, a, o);
    for (let i = 0; ; i++) {
      try { return raw.call(this, cmd, a, o); }
      catch (e) { if (i >= 5) throw e; nap(300 + Math.random() * 700 * (i + 1)); }
    }
  };
  syncBuiltinESMExports();
}

const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
const want = list(process.env.SECTIONS), skip = list(process.env.SKIP_SECTIONS);
export const aiMock = process.env.AI_MOCK === "1";
/** 진짜 AI 답을 봐야 하는 검사를 돌릴지 (SKIP_AI · AI_MOCK 이면 안 돌려요) */
export const aiReal = () => !process.env.SKIP_AI && !aiMock;

const stats = new Map(); // name → { pass, fail, ms, skipped }
let cur = "core";
const st = (n) => { if (!stats.has(n)) stats.set(n, { pass: 0, fail: 0, ms: 0, skipped: false }); return stats.get(n); };
st("core");
const t0 = Date.now();

/** ok() 가 부를 때마다 지금 구역에 숫자를 더해요 */
export function count(pass) { st(cur)[pass ? "pass" : "fail"]++; }

export const selected = (name, tags = []) =>
  !(want.length && !want.includes(name)) && !skip.includes(name) && !(tags.includes("ai-real") && !aiReal());

/** 이름 붙은 덩어리. 고르지 않았으면 SKIP, 안에서 터지면 FAIL 하나로 적고 다음 구역으로 넘어가요 */
export async function section(name, fn, { tags = [] } = {}) {
  const s = st(name);
  if (!selected(name, tags)) { s.skipped = true; console.log(`SKIP section ${name}${tags.length ? " [" + tags.join(",") + "]" : ""}`); return; }
  const prev = cur, t = Date.now();
  cur = name;
  try { await fn(); }
  catch (e) { console.log(`FAIL section ${name} crashed: ${String(e?.stack || e).split("\n").slice(0, 2).join(" ")}`); s.fail++; process.exitCode = 1; }
  finally { s.ms += Date.now() - t; cur = prev; }
}

export function writeSummary(extra = {}) {
  const rows = [...stats].map(([name, v]) => ({ name, ...v }));
  const core = st("core"); core.ms = Date.now() - t0 - rows.filter((r) => r.name !== "core").reduce((a, r) => a + r.ms, 0);
  const out = { ...extra, total_ms: Date.now() - t0, sections: [...stats].map(([name, v]) => ({ name, ...v })) };
  if (process.env.SUMMARY_FILE) writeFileSync(process.env.SUMMARY_FILE, JSON.stringify(out, null, 1));
  return out;
}

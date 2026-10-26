// 검사 한 곳에서: node scripts/test.mjs [quick|normal|full] (npm run test:quick · test:normal · test:full)
//   quick  — 바뀐 파일에 걸린 구역 + 바탕(로그인 · 홈 · 계획 넣기 · 노트 저장), 컴퓨터 화면만, 가짜 AI
//   normal — smoke 전부 + 바뀐 파일에 걸린 화면 구역 + 바탕, 컴퓨터 · 폰 같이, 가짜 AI
//   full   — 예전 그대로 전부 (smoke · e2e 모든 구역, 컴퓨터 · 폰), 진짜 AI
// 바뀐 파일 = git diff origin/main...HEAD + 아직 커밋 안 한 것 + 새 파일. 어느 구역인지는 scripts/test-map.json.
// 표에 없는 파일이 바뀌면 quick 은 normal 로 올라가요.
// 옵션: --base=http://… (이미 켠 서버 — 가짜 AI 는 그 서버를 --var AI_MOCK:1 로 켰을 때만) · --port=8828 · --shards=1 (화면 검사를 화면마다 몇 갈래로)
//       --ai=mock|real (기본: quick/normal 은 mock, full 은 real) · --only=smoke|e2e · --dry (고른 것만 보여 주기) · --files=a,b (바뀐 파일 대신 이 파일들로) · --env-file=…/.dev.vars
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (k, d = null) => { const a = args.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=").slice(1).join("=") : args.includes("--" + k) ? true : d; };
let tier = args.find((a) => !a.startsWith("--")) || "quick";
if (!["quick", "normal", "full"].includes(tier)) { console.error("단계는 quick · normal · full 중 하나예요."); process.exit(2); }
const asked = tier;
const T0 = Date.now();
const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean); } catch { return []; } };

// ---------- 무엇을 돌릴지 ----------
const MAP = JSON.parse(readFileSync(join(ROOT, "scripts/test-map.json"), "utf8"));
const names = (file) => [...readFileSync(join(ROOT, file), "utf8").matchAll(/\b(?:section|sec)\("([\w-]+)"/g)].map((m) => m[1]);
const ALL = { smoke: [...new Set(names("scripts/smoke.mjs"))], e2e: [...new Set(names("scripts/e2e.mjs"))] };
const changed = opt("files") ? String(opt("files")).split(",").filter(Boolean) : [...new Set([...git("diff", "--name-only", "origin/main...HEAD"), ...git("diff", "--name-only", "HEAD"), ...git("ls-files", "--others", "--exclude-standard")])];
const pick = { smoke: new Set(MAP.core.smoke), e2e: new Set(MAP.core.e2e) }, unknown = [];
for (const f of changed) {
  if (MAP.ignore.some((p) => f === p || f.startsWith(p))) continue;
  const hits = Object.entries(MAP.map).filter(([p]) => f === p || f.startsWith(p));
  if (!hits.length) { unknown.push(f); continue; }
  for (const [, v] of hits) for (const k of ["smoke", "e2e"]) for (const s of v[k] || []) pick[k].add(s);
}
// 앞 구역이 만든 것을 쓰는 구역(예: 노트 우클릭은 Brain 이 가져온 'AI & Dev' 개념을 써요)은 그 구역도 같이 — test-map.json 의 needs
for (const k of ["smoke", "e2e"]) for (let more = true; more;) { more = false; for (const s of [...pick[k]]) for (const n of MAP.needs?.[k]?.[s] || []) if (!pick[k].has(n)) { pick[k].add(n); more = true; } }
for (const k of ["smoke", "e2e"]) for (const s of pick[k]) if (s !== "*" && !ALL[k].includes(s)) console.warn(`test-map.json: ${k} 에 "${s}" 구역이 없어요`);
if (tier === "quick" && unknown.length) tier = "normal";
const sel = (k) => {
  if (tier === "full" || pick[k].has("*")) return null; // null = 전부
  if (k === "smoke" && tier === "normal") return null;
  return ALL[k].filter((s) => pick[k].has(s));
};
const ai = opt("ai", tier === "full" ? "real" : "mock");
const viewports = tier === "quick" ? ["desktop"] : ["desktop", "phone"];
const shards = Math.max(1, Number(opt("shards", 1)) || 1);
const only = opt("only");
const plan = { smoke: only === "e2e" ? false : sel("smoke"), e2e: only === "smoke" ? false : sel("e2e") }; // false = 안 돌림 · null = 전부
const show = (v) => (v === false ? "안 돌림" : v === null ? "전부" : v.length ? v.join(", ") : "(바탕만)");
console.log(`\n== 검사 단계 ${tier}${asked !== tier ? ` (${asked} → 표에 없는 파일: ${unknown.slice(0, 5).join(", ")})` : ""} · AI ${ai} · 화면 ${viewports.join("+")}${shards > 1 ? " ×" + shards : ""}`);
console.log(`   바뀐 파일 ${changed.length}개 · smoke: ${show(plan.smoke)}\n   e2e: ${show(plan.e2e)}`);
if (opt("dry")) process.exit(0);

// ---------- 서버 ----------
const port = Number(opt("port", 8828));
let BASE = opt("base"), server = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (u) => { try { return (await fetch(u + "/api/me")).status > 0; } catch { return false; } };
if (!BASE) {
  BASE = `http://127.0.0.1:${port}`;
  if (await up(BASE)) { console.error(`포트 ${port} 에 이미 서버가 있어요. --base=${BASE} 로 그 서버를 쓰거나 --port 를 바꿔 주세요.`); process.exit(2); }
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "dsm-mafia", "--local"], { cwd: ROOT, env: { ...process.env, CI: "1" }, stdio: "ignore" });
  const envFile = opt("env-file", process.env.DEV_VARS || null); // 없으면 wrangler 가 저장소의 .dev.vars 를 읽어요
  if (!envFile && !existsSync(join(ROOT, ".dev.vars"))) console.warn(".dev.vars 가 없어요 — PASSWORDLESS=1 이 없으면 로그인 검사가 실패해요 (--env-file=… 로 줄 수 있어요)");
  const wargs = ["wrangler", "dev", "--port", String(port), "--inspector-port", String(port + 500), ...(envFile ? ["--env-file", envFile] : []), ...(ai === "mock" ? ["--var", "AI_MOCK:1"] : []), "--var", "NEWS_FAKE_AI:1"];
  server = spawn("npx", wargs, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = ""; server.stdout.on("data", (d) => { log += d; }); server.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 120 && !(await up(BASE)); i++) await sleep(500);
  if (!(await up(BASE))) { console.error("서버가 켜지지 않았어요:\n" + log.slice(-2000)); stop(); process.exit(1); }
}
function stop() { if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch {} server = null; } }
process.on("SIGINT", () => { stop(); process.exit(130); });

// ---------- 정리 (시작) ----------
const cleanup = (...a) => { try { console.log(execFileSync("node", ["scripts/test-cleanup.mjs", ...a], { cwd: ROOT, encoding: "utf8" }).trim()); } catch {} };
cleanup("--stale");

// ---------- 돌리기 ----------
const dir = mkdtempSync(join(tmpdir(), "swx2-test-"));
const run = (label, script, env) => new Promise((resolve) => {
  const t = Date.now(), file = join(dir, label + ".json");
  const c = spawn("node", [script], { cwd: ROOT, env: { ...process.env, ...env, BASE, TEST_RUN: "1", SUMMARY_FILE: file, ...(ai === "mock" ? { AI_MOCK: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  const line = (d) => { out += d; for (const l of String(d).split("\n")) if (/^FAIL/.test(l) || process.env.VERBOSE) console.log(`[${label}] ${l}`); };
  c.stdout.on("data", line); c.stderr.on("data", (d) => { out += d; if (process.env.VERBOSE) process.stderr.write(d); });
  c.on("close", (code) => {
    let sum = null; try { sum = JSON.parse(readFileSync(file, "utf8")); } catch {}
    const pass = (out.match(/^PASS /gm) || []).length, fail = (out.match(/^FAIL /gm) || []).length;
    if (code && !fail) console.log(`[${label}] 끝났지만 코드 ${code}:\n` + out.split("\n").slice(-8).join("\n"));
    resolve({ label, code, pass, fail, ms: Date.now() - t, sum, log: join(dir, label + ".log"), out });
  });
});
const secEnv = (list) => (list === null ? {} : { SECTIONS: list.length ? list.join(",") : "-" });
const results = [];
try {
  if (plan.smoke !== false) results.push(await run("smoke", "scripts/smoke.mjs", secEnv(plan.smoke)));
  if (plan.e2e !== false) {
    const list = plan.e2e === null ? ALL.e2e : plan.e2e;
    const chunks = Array.from({ length: Math.min(shards, Math.max(1, list.length)) }, (_, i) => list.filter((_, j) => j % shards === i));
    const jobs = [];
    for (const vp of viewports) chunks.forEach((ch, i) => {
      const whole = plan.e2e === null && shards === 1;
      jobs.push(run(`e2e-${vp}${chunks.length > 1 ? "-" + (i + 1) : ""}`, "scripts/e2e.mjs", { E2E_VIEWPORTS: vp, E2E_WORKER: vp[0] + (chunks.length > 1 ? i + 1 : ""), ...(whole ? {} : secEnv(ch)) }));
    });
    results.push(...(await Promise.all(jobs)));
  }
} finally {
  cleanup("--stale");
  stop();
}

// ---------- 표 ----------
const { writeFileSync } = await import("node:fs");
for (const r of results) writeFileSync(r.log, r.out);
const pad = (s, n) => String(s).padEnd(n), sec = (ms) => (ms / 1000).toFixed(0) + "s";
console.log(`\n== 결과 · ${asked}${asked !== tier ? "→" + tier : ""} · AI ${ai}`);
console.log(pad("실행", 16) + pad("구역", 8) + pad("통과", 7) + pad("실패", 7) + "시간");
for (const r of results) {
  const ran = r.sum ? r.sum.sections.filter((s) => !s.skipped && s.name !== "core").length : "?";
  console.log(pad(r.label, 16) + pad(ran, 8) + pad(r.pass, 7) + pad(r.fail, 7) + sec(r.ms));
}
const P = results.reduce((a, r) => a + r.pass, 0), F = results.reduce((a, r) => a + r.fail, 0);
console.log(pad("합계", 16) + pad("", 8) + pad(P, 7) + pad(F, 7) + sec(Date.now() - T0) + " (서버 켜기 포함)");
const slow = results.flatMap((r) => (r.sum?.sections || []).filter((s) => !s.skipped).map((s) => ({ ...s, where: r.label }))).sort((a, b) => b.ms - a.ms).slice(0, 5);
if (slow.length) console.log("오래 걸린 구역: " + slow.map((s) => `${s.where}/${s.name} ${sec(s.ms)}`).join(" · "));
const failedSecs = results.flatMap((r) => (r.sum?.sections || []).filter((s) => s.fail).map((s) => `${r.label}/${s.name}(${s.fail})`));
if (failedSecs.length) console.log("실패한 구역: " + failedSecs.join(" · "));
console.log(`로그: ${dir}`);
process.exitCode = F || results.some((r) => r.code) ? 1 : 0;

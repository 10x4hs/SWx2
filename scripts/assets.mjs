// 앱 파일 목록 만들기 — 느린 길에서도 첫 화면이 빨리 뜨게
//   node scripts/assets.mjs          index.html 의 modulepreload 목록을 새로 써요 (app.js · pwa.js 가 부르는 모든 모듈)
//   node scripts/assets.mjs --check  목록이 낡았으면 실패 (npm test 가 불러요)
//   node scripts/assets.mjs --list   서비스 워커가 설치 때 미리 받아 둘 파일 목록(JSON) — deploy.sh 가 sw.js 에 찍어요
//   node scripts/assets.mjs --hashes 그 파일들(+ 첫 화면 "/")의 내용 지문(JSON) — SW 가 설치 때 받은 게 이번 배포본인지 맞춰 봐요
// 모듈은 서로를 부르는 사슬이라, 목록이 없으면 브라우저가 사슬 깊이(15단계 넘게)만큼 차례로 왕복해요.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const ENTRIES = ["/js/app.js", "/js/pwa.js"];
const START = "<!-- modulepreload:start (node scripts/assets.mjs 가 써요) -->", END = "<!-- modulepreload:end -->";

// import … from "x" · export … from "x" · import "x" (주석 줄은 건너뛰어요)
const IMPORT = /^\s*(?:import|export)\s(?:[^"';]*?\sfrom\s*)?["']([^"']+)["']/gm;
export function modules() {
  const seen = new Set(), todo = [...ENTRIES];
  while (todo.length) {
    const u = todo.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    const src = readFileSync(join(ROOT, u), "utf8");
    for (const [, spec] of src.matchAll(IMPORT)) if (spec.startsWith(".") || spec.startsWith("/")) todo.push(spec.startsWith("/") ? spec : posix.normalize(posix.join(posix.dirname(u), spec)));
  }
  return [...seen].filter((u) => !ENTRIES.includes(u)).sort();
}

const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => { const p = d + "/" + f; return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p]; });
// 한 화면에서만 쓰는 큰 파일은 설치 때 미리 받지 않아요 (느린 길에서 설치가 길어지지 않게) — 처음 열 때 받아서 캐시에 둬요
const LAZY = new Set(["/vendor/three.min.js"]);
export function precache() {
  return [...walk("/js"), ...walk("/vendor"), ...walk("/css"), "/styles.css"].filter((p) => /\.(m?js|css)$/.test(p) && !LAZY.has(p)).sort();
}

function block() {
  return [START, ...modules().map((u) => `  <link rel="modulepreload" href="${u}">`), "  " + END].join("\n");
}
const file = join(ROOT, "index.html"), html = readFileSync(file, "utf8");
const re = new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?" + END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const next = html.replace(re, block().trimStart());
const arg = process.argv[2];
if (arg === "--list") process.stdout.write(JSON.stringify(precache()));
// 지문 = SHA-256 앞 16자리. "/" 는 index.html (배포 직후 엣지가 옛 파일 · 새 파일을 섞어 줄 때가 있어서, SW 가 이걸로 걸러요)
else if (arg === "--hashes") { const h = (p) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex").slice(0, 16); process.stdout.write(JSON.stringify(Object.fromEntries([["/", h("/index.html")], ...precache().map((p) => [p, h(p)])]))); }
else if (arg === "--check") { if (next !== html || !re.test(html)) { console.error("index.html 의 modulepreload 목록이 낡았어요 → node scripts/assets.mjs"); process.exit(1); } console.log(`modulepreload ${modules().length}개 최신`); }
else { if (!re.test(html)) throw new Error("index.html 에 modulepreload 표시가 없어요"); writeFileSync(file, next); console.log(`modulepreload ${modules().length}개 썼어요`); }

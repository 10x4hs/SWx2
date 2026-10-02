// 앱 노트(옵시디언식 노트 · 그래프)에 공부 구역을 넣어요 — 셋 모두, 각자의 노트에.
//   node scripts/study-notes-seed.mjs [--remote] [--dry-run] [--only=papers|english]
//   📄 논문 공부  = 실시간 현황판 블록(<!-- papers:board -->) + 날짜별 16편 하위 페이지 (10-06 크론이 지워요)
//   🇺🇸 영어      = ENGLISH-OS 자료 노트를 폴더 = 페이지로 (개인 기록 · 서식 · 첨부는 빼요 — 개인 기록은 앱의 영어 탭에)
// 이미 넣은 사람은 건너뛰고(study_seed_notes), 같은 제목의 노트가 있으면 덮어쓰지 않아요. 두 번 돌려도 같아요.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REMOTE = process.argv.includes("--remote");
const DRY = process.argv.includes("--dry-run");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7) || null;
const EN_VAULT = process.env.ENGLISH_OS || ["/Users/prime/Documents/STUDY-OS/영어 공부", "/Users/prime/Documents/ENGLISH-OS"].find((p) => existsSync(p));
const PAPERS_ROOT = "📄 논문 공부", EN_ROOT = "🇺🇸 영어";
const d1 = (sql) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", REMOTE ? "--remote" : "--local", "--json", "--command", sql], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0].results;
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const die = (m) => { console.error("✖ " + m); process.exit(1); };

// 서버와 같은 규칙 (src/worker.js parseLinks · parseTags)
const parseLinks = (text) => [...new Set([...text.matchAll(/\[\[([^\[\]|#\n]+)(?:[#|][^\]\n]*)?\]\]/g)].map((m) => m[1].trim().slice(0, 120)).filter(Boolean))].slice(0, 200);
const parseTags = (text) => [...new Set([...text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "").matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu)].map((m) => m[1].slice(0, 40)))].slice(0, 50);
const badTitle = (t) => /[\[\]|#]/.test(t) || !t.trim() || t.length > 120;

// ---------- 📄 논문 공부 ----------
function paperTree() {
  const idx = JSON.parse(readFileSync(join(ROOT, "public/papers/index.json"), "utf8"));
  const byId = Object.fromEntries(idx.papers.map((p) => [p.id, p]));
  const stage = Object.fromEntries(idx.stages.map((s) => [s.n, s]));
  const title = (id) => byId[id].title;
  const days = idx.days.map((d) => `## ${d.label} · ${d.theme}\n\n${d.papers.map((id) => `[[${title(id)}]]`).join("\n")}`).join("\n\n");
  const root = {
    title: PAPERS_ROOT, parent: null,
    body: `> 🗓 **10.1 → 10.5 · 16편 × 3단계 (읽기 · 퀴즈 · 3분 설명)** · 셋이 같이
> 끝났다는 기준: ${idx.goal}
> 아래 판에서 체크하면 셋에게 똑같이 보여요. 공부는 [논문 스프린트](/#/papers) 에서 해요.

<!-- papers:board -->

${days}

## 파이프라인 한 줄

${idx.stages.map((s) => `${s.n}. **${s.label}** — ${s.why}`).join("\n")}

_10월 6일이 되면 이 구역(아래 페이지 포함)은 자동으로 지워져요._ #논문스프린트
`,
  };
  const kids = idx.days.flatMap((d) => d.papers.map((id) => {
    const p = byId[id], st = stage[p.stage];
    let c = {};
    try { c = JSON.parse(readFileSync(join(ROOT, `public/papers/content/${id}.json`), "utf8")); } catch {}
    const rel = (c.related || []).filter((r) => byId[r]).map((r) => `[[${title(r)}]]`);
    return {
      title: p.title, parent: PAPERS_ROOT,
      body: `> 🔗 **[공부 페이지 열기 →](/#/papers/${id})** 쉬운 설명 · 그림 · 영상 · 퀴즈 · 3분 설명 · AI 튜터가 여기 있어요 (그래프에서 이 점을 두 번 눌러도 열려요)\n> ${d.label} · ${st.n}번 칸 ${st.label} · ${p.year}
> ${String(c.one_line || p.field).replace(/\*\*/g, "")}

## 내가 이해한 것

-

## 헷갈린 점

-

## 3분 설명 연습

문제 → 아이디어 → 결과 → 우리 파이프라인 순서로 써 보고, 공부 페이지의 **3분 설명**에서 AI 채점을 받아요.

## 핵심어

${(c.keywords_3min || []).join(" · ") || "-"}

## 연결

[[${PAPERS_ROOT}]]${rel.length ? " · " + rel.join(" · ") : ""}

#논문스프린트 #${st.short}
`,
    };
  }));
  return [root, ...kids];
}

// ---------- 🇺🇸 영어 ----------
const SKIP_DIRS = new Set(["01 매일 기록", "서식", "첨부", "audio"]);
const SKIP_FILES = new Set(["README", "📊 내 진도", "내가 막힌 표현"]);
const APP_LINK = { "내가 막힌 표현": "[내가 막힌 표현](/#/english/phrases)", "📊 내 진도": "[영어 진도](/#/english/progress)", "오늘 기록 서식": "[오늘 기록](/#/english/today)" };
const CALLOUT = { tip: "💡", info: "ℹ️", note: "📝", todo: "✅", warning: "⚠️", caution: "⚠️", danger: "⛔", example: "📌", quote: "💬", question: "❓", success: "✅", abstract: "📋", important: "❗" };

function convert(md, known) {
  let s = md.replace(/\r\n?/g, "\n").replace(/^---\n[\s\S]*?\n---\n*/, "");               // YAML 머리
  s = s.replace(/%%[\s\S]*?%%/g, "");                                                        // 옵시디언 주석
  s = s.replace(/```dataview(?:js)?\n[\s\S]*?```/g, "> 📊 이 표는 앱의 [영어 › 진도](/#/english/progress) 탭에서 봐요.");
  s = s.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, t) => {                               // 그림 · 소리 · 노트 끼워 넣기
    const name = basename(t.trim());
    if (/\.(png|jpe?g|gif|webp|svg|mp3|m4a|wav|ogg|mp4|pdf)$/i.test(name)) return `_(첨부 ${name} — 옵시디언 볼트에만 있어요)_`;
    return `[[${name.replace(/\.md$/, "")}]]`;
  });
  s = s.replace(/\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?\]\]/g, (_, t, _h, alias) => {          // [[폴더/이름|별명]] → [[이름|별명]]
    const name = basename(t.trim()).replace(/\.md$/, "");
    const label = alias ? alias.slice(1) : "";
    if (APP_LINK[name]) return label ? APP_LINK[name].replace(/^\[[^\]]*\]/, `[${label}]`) : APP_LINK[name];
    if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return `[${label || name}](/#/english/today/${name})`;
    if (!known.has(name)) return label || name;                                                // 뺀 노트로 가는 링크는 글자만
    return label && label !== name ? `[[${name}|${label}]]` : `[[${name}]]`;
  });
  s = s.replace(/(?:^\|.*\|[ \t]*(?:\n|$))+/gm, (tbl) => {                                        // 표 → 목록 (편집기는 표를 글자로 보여 줘서)
    const rows = tbl.trim().split("\n").map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    const out = [];
    rows.forEach((cells, i) => {
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || !c)) return;                            // 구분 줄 · 빈 머리
      const line = cells.filter(Boolean).join(" — ");
      const head = i === 0 && rows[1] && rows[1].every((c) => /^:?-{2,}:?$/.test(c) || !c);
      out.push(head ? `**${line.replace(/\*\*/g, "")}**` : `- ${line}`);
    });
    return out.join("\n") + "\n";
  });
  s = s.replace(/^(>\s*)\[!(\w+)\][+-]?\s*(.*)$/gm, (_, g, type, title) => `${g}**${CALLOUT[type.toLowerCase()] || "📝"} ${title || type}**`); // 콜아웃
  return s.trim() + "\n";
}

function englishTree() {
  if (!EN_VAULT || !existsSync(EN_VAULT)) die("ENGLISH-OS 자료 폴더를 못 찾았어요. ENGLISH_OS=경로 로 알려 주세요.");
  const files = [];
  for (const top of readdirSync(EN_VAULT).sort()) {
    const p = join(EN_VAULT, top);
    if (top.startsWith(".") || SKIP_DIRS.has(top)) continue;
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p).sort()) if (f.endsWith(".md") && !SKIP_FILES.has(f.slice(0, -3))) files.push({ folder: top, title: f.slice(0, -3), path: join(p, f) });
    } else if (top.endsWith(".md") && !SKIP_FILES.has(top.slice(0, -3))) files.push({ folder: null, title: top.slice(0, -3), path: p });
  }
  const bad = files.filter((f) => badTitle(f.title));
  if (bad.length) die("노트 제목으로 못 쓰는 이름: " + bad.map((f) => f.title).join(", "));
  const folders = [...new Set(files.map((f) => f.folder).filter(Boolean))];
  const known = new Set([...files.map((f) => f.title), ...folders, EN_ROOT]);
  const start = files.find((f) => f.title === "📌 여기서 시작");
  const root = {
    title: EN_ROOT, parent: null,
    body: `> 🗣 **6개월 프리토킹 · 하루 3시간** — 옵시디언 ENGLISH-OS 자료를 앱 노트로 옮겼어요.
> 매일 기록 · 시간 재기 · 막힌 표현 · 복습 카드는 [영어 탭](/#/english) 에서 해요.

${start ? `[[${start.title}]]\n\n` : ""}## 구역

${folders.map((f) => `[[${f}]]`).join("\n")}

#영어
`,
  };
  const folderPages = folders.map((f) => ({
    title: f, parent: EN_ROOT,
    body: `${files.filter((x) => x.folder === f).map((x) => `[[${x.title}]]`).join("\n")}\n\n[[${EN_ROOT}]] 로 돌아가기 #영어\n`,
  }));
  const notes = files.map((f) => ({ title: f.title, parent: f.folder || EN_ROOT, body: convert(readFileSync(f.path, "utf8"), known) + (/(^|\s)#영어(\s|$)/.test(readFileSync(f.path, "utf8")) ? "" : "\n#영어\n") }));
  return [root, ...folderPages, ...notes];
}

// ---------- 넣기 ----------
const trees = {};
const kstToday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const UNTIL = JSON.parse(readFileSync(join(ROOT, "public/papers/index.json"), "utf8")).until;
if ((!ONLY || ONLY === "papers") && kstToday > UNTIL) console.log(`- 논문 스프린트는 ${UNTIL} 에 끝나서 논문 구역은 다시 넣지 않아요.`);
else if (!ONLY || ONLY === "papers") trees.papers = paperTree();
if (!ONLY || ONLY === "english") trees.english = englishTree();
for (const [k, t] of Object.entries(trees)) { const b = t.filter((n) => badTitle(n.title)); if (b.length) die(`${k}: 못 쓰는 제목 ${b.map((n) => n.title)}`); }

const users = d1("SELECT id, username, display_name FROM users ORDER BY created_at");
const titles = new Map();
for (const r of d1("SELECT user_id, id, title FROM notes")) titles.set(r.user_id + "\u0000" + r.title.toLowerCase(), r.id);
const seeded = new Set(d1("SELECT DISTINCT user_id, kind FROM study_seed_notes").map((r) => r.user_id + ":" + r.kind));

const sql = [];
let base = Date.now();
const BASE0 = base;
for (const u of users) {
  base = BASE0;
  for (const [kind, tree] of Object.entries(trees)) {
    if (seeded.has(u.id + ":" + kind)) { console.log(`- ${u.display_name}: ${kind} 이미 있어요`); continue; }
    const rootTitle = tree[0].title;
    if (titles.has(u.id + "\u0000" + rootTitle.toLowerCase())) { console.log(`- ${u.display_name}: '${rootTitle}' 노트가 이미 있어서 ${kind} 는 건너뛰어요`); continue; }
    const ids = new Map();
    let made = 0, kept = 0;
    // 뒤에서부터 시간을 매겨서 목록 맨 위가 뿌리 페이지가 되게
    tree.forEach((n, i) => {
      const key = u.id + "\u0000" + n.title.toLowerCase();
      if (titles.has(key)) { ids.set(n.title, titles.get(key)); kept++; return; }
      const id = randomUUID(), t = base - i * 1000;
      ids.set(n.title, id);
      const parent = n.parent ? ids.get(n.parent) : null;
      sql.push(`INSERT INTO notes (id, user_id, title, body, shared, parent_id, created_at, updated_at) VALUES (${q(id)}, ${q(u.id)}, ${q(n.title)}, ${q(n.body)}, 0, ${parent ? q(parent) : "NULL"}, ${t}, ${t});`);
      for (const l of parseLinks(n.body)) sql.push(`INSERT OR IGNORE INTO note_links (src_id, dst_title) VALUES (${q(id)}, ${q(l)});`);
      for (const g of parseTags(n.body)) sql.push(`INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (${q(id)}, ${q(g)});`);
      sql.push(`INSERT INTO study_seed_notes (note_id, user_id, kind, created_at) VALUES (${q(id)}, ${q(u.id)}, ${q(kind)}, ${t});`);
      made++;
    });
    console.log(`+ ${u.display_name}: ${kind} 노트 ${made}개${kept ? ` (같은 제목 ${kept}개는 그대로 둠)` : ""}`);
    base -= (tree.length + 5) * 1000; // 다음 구역은 그 아래로 (목록에서 섞이지 않게)
  }
}
if (!sql.length) { console.log("넣을 것이 없어요."); process.exit(0); }
const file = join(ROOT, ".wrangler", `study-seed-${Date.now()}.sql`);
writeFileSync(file, sql.join("\n") + "\n");
if (DRY) { console.log(`(dry-run) SQL ${sql.length}줄 → ${file}`); process.exit(0); }
execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", REMOTE ? "--remote" : "--local", "--file", file, ...(REMOTE ? ["--yes"] : [])], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
console.log(`끝! ${REMOTE ? "배포 DB" : "로컬 DB"} 에 넣었어요 (SQL ${sql.length}줄).`);

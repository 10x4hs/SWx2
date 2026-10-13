// 로컬 D1 에 뉴스 Signal Map 시험용 글을 심어요 (피드를 긁지 않고도 화면 · e2e 를 볼 수 있게).
//   node scripts/news-seed.mjs          → 피드 3개 · 줄기 5개 · 글 24편 · 오늘의 브리핑 (이미 있으면 덮어써요)
// 원격(--remote)에는 절대 쓰지 않아요.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const now = Date.now(), H = 36e5;
const q = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const day = new Date(now + 9 * H).toISOString().slice(0, 10);

const FEEDS = [["seed-f1", "War on the Rocks", "geopolitics"], ["seed-f2", "ChinaTalk", "china"], ["seed-f3", "Import AI", "ai"]];
const THREADS = [
  ["seed-t1", "us china chip controls", "미중 반도체 통제", "미국이 고급 칩 수출을 막고 중국이 자급으로 맞서는 흐름이에요. 지난주 규칙이 넓어진 뒤 네덜란드 · 일본이 따라붙었어요. 다음에 볼 것: 중국 SMIC 의 5nm 수율 발표."],
  ["seed-t2", "ukraine war", "우크라이나 전쟁", null],
  ["seed-t3", "taiwan strait", "대만 해협", null],
  ["seed-t4", "ai regulation eu", "EU AI 규제", null],
  ["seed-t5", "middle east energy", "중동 에너지", null],
];
// [thread, feed, hours ago, geo, title, one_liner]
const ITEMS = [
  ["seed-t1", "seed-f2", 2, ["US", "CN"], "Commerce widens AI chip export rule to cover cloud access", "미 상무부, 클라우드로 칩을 빌려 쓰는 길까지 막아요"],
  ["seed-t1", "seed-f2", 20, ["NL", "CN"], "ASML confirms new curbs on DUV servicing in China", "ASML, 중국 내 구형 장비 정비도 중단해요"],
  ["seed-t1", "seed-f3", 50, ["JP", "CN"], "Tokyo aligns photoresist export licensing with Washington", "일본, 감광액 수출 허가를 미국 기준에 맞춰요"],
  ["seed-t1", "seed-f2", 120, ["CN"], "SMIC ramps 5nm-class output despite yield problems", "SMIC 5나노급 생산 확대 — 수율은 30%대에 머물러요"],
  ["seed-t1", "seed-f2", 200, ["KR", "US"], "Samsung, SK Hynix get one-year waiver for China fabs", "삼성 · SK 중국 공장, 1년 유예를 다시 받았어요"],
  ["seed-t2", "seed-f1", 4, ["UA", "RU"], "Drone strikes hit Russian refineries for third night", "우크라 드론이 사흘째 러시아 정유소를 때렸어요"],
  ["seed-t2", "seed-f1", 30, ["PL", "UA"], "Poland opens new artillery shell line for Kyiv", "폴란드가 우크라용 포탄 생산 라인을 새로 열어요"],
  ["seed-t2", "seed-f1", 90, ["RU"], "Kremlin raises defense budget share to record 8%", "러시아 국방비가 예산의 8%로 역대 최고예요"],
  ["seed-t2", "seed-f1", 160, ["DE", "UA"], "Berlin debates long-range missile delivery again", "독일, 장거리 미사일 지원 논쟁이 다시 붙었어요"],
  ["seed-t3", "seed-f1", 6, ["TW", "CN"], "PLA drills encircle Taiwan after transit", "중국군, 미 군함 통과 뒤 대만 포위 훈련을 벌여요"],
  ["seed-t3", "seed-f2", 40, ["TW", "US"], "Taipei fast-tracks Harpoon coastal batteries", "대만, 해안 대함미사일 배치를 앞당겨요"],
  ["seed-t3", "seed-f1", 100, ["PH", "CN"], "Manila protests water cannon use near Scarborough", "필리핀, 스카버러 물대포 사건에 공식 항의해요"],
  ["seed-t4", "seed-f3", 8, ["BE"], "EU AI Office publishes draft code for frontier models", "EU AI 사무국, 최첨단 모델 행동 강령 초안을 냈어요"],
  ["seed-t4", "seed-f3", 70, ["FR", "BE"], "Paris pushes delay to AI Act general-purpose rules", "프랑스가 범용 AI 규정 시행을 늦추자고 해요"],
  ["seed-t4", "seed-f3", 140, ["GB"], "UK AI Security Institute shares eval results with labs", "영국 AI 안전연구소, 평가 결과를 연구소들과 공유해요"],
  ["seed-t5", "seed-f1", 10, ["SA", "IR"], "OPEC+ signals output hike as Iran exports climb", "OPEC+ 증산 신호 — 이란 수출이 늘어난 탓이에요"],
  ["seed-t5", "seed-f1", 60, ["IL", "IR"], "Strait of Hormuz insurance premiums double", "호르무즈 해협 보험료가 두 배로 뛰었어요"],
  ["seed-t5", "seed-f1", 130, ["AE"], "UAE signs gas deal with Japanese utilities", "UAE, 일본 전력사와 장기 가스 계약을 맺어요"],
  [null, "seed-f3", 3, ["US"], "Frontier lab releases open-weight reasoning model", "미국 연구소가 추론 모델 가중치를 공개했어요"],
  [null, "seed-f1", 12, ["IN", "PK"], "India and Pakistan resume back-channel talks", "인도 · 파키스탄 비밀 대화 채널이 다시 열렸어요"],
  [null, "seed-f2", 16, ["KP"], "North Korea tests solid-fuel engine", "북한이 고체연료 엔진 시험을 했어요"],
  [null, "seed-f1", 22, ["BR"], "Brazil hosts BRICS payments summit", "브라질, 브릭스 결제망 회의를 열어요"],
  [null, "seed-f3", 26, ["SG"], "Singapore data-center moratorium partly lifted", "싱가포르가 데이터센터 신규 허가를 일부 풀어요"],
  [null, "seed-f2", 30, ["VN", "CN"], "Vietnam courts Chinese EV makers", "베트남이 중국 전기차 공장 유치에 나섰어요"],
];
const RAW = (t, o) => `${t}. ${o}. Officials said the move reflects months of pressure and would be reviewed next quarter. Critics argue the measure may backfire, while supporters point to the data showing a 12 percent rise since January. The decision follows talks in Washington, Beijing and Brussels.`;

let sql = "DELETE FROM news_comments WHERE item_id LIKE 'seed-%';\nDELETE FROM news_reads WHERE item_id LIKE 'seed-%';\nDELETE FROM news_items WHERE id LIKE 'seed-%';\nDELETE FROM news_threads WHERE id LIKE 'seed-%';\n";
for (const [id, name, topic] of FEEDS) sql += `INSERT OR IGNORE INTO news_feeds (id, url, name, topic, created_at) VALUES (${q(id)}, ${q("https://example.com/" + id)}, ${q(name)}, ${q(topic)}, ${now});\n`;
for (const [id, key, title, story] of THREADS) sql += `INSERT INTO news_threads (id, key, title, story, story_at, created_at, updated_at) VALUES (${q(id)}, ${q(key)}, ${q(title)}, ${q(story)}, ${story ? now : "NULL"}, ${now}, ${now});\n`;
ITEMS.forEach(([t, f, h, geo, title, one], i) => {
  const at = now - h * H, kday = new Date(at + 9 * H).toISOString().slice(0, 10); // 신문 호는 한국 날짜(day) · 섹션으로 묶여요 (0038)
  const sec = { "seed-f1": "geopolitics", "seed-f2": "geopolitics", "seed-f3": "tech" }[f] || "ai";
  sql += `INSERT INTO news_items (id, feed_id, url, title, published_at, raw, one_liner, summary, section, day, geo, thread_id, created_at) VALUES (${q("seed-i" + i)}, ${q(f)}, ${q("https://example.com/a/" + i)}, ${q(title)}, ${at}, ${q(RAW(title, one))}, ${q(one)}, ${q(one + " 관계자들은 몇 달 동안 압박이 이어졌다고 말했어요. 다음 분기에 다시 검토해요.")}, ${q(sec)}, ${q(kday)}, ${q(JSON.stringify(geo))}, ${q(t)}, ${now});\n`;
});
sql += `INSERT OR REPLACE INTO news_briefs (day, headline, body, weights, item_count, created_at) VALUES (${q(day)}, ${q("칩 전선이 넓어졌어요")}, ${q("미국의 칩 통제가 클라우드까지 닿았고, 네덜란드 · 일본이 같은 날 보조를 맞췄어요. 글은 전쟁 쪽이 많지만 무게는 반도체에 실려 있어요.")}, '[]', ${ITEMS.length}, ${now});\n`;

const dir = mkdtempSync(join(tmpdir(), "news-seed-")), file = join(dir, "seed.sql");
writeFileSync(file, sql);
execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--file", file], { stdio: "inherit" });
console.log(`심었어요: 글 ${ITEMS.length}편 · 줄기 ${THREADS.length}개 (${day})`);

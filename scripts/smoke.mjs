// API smoke test against a running `wrangler dev` (default http://127.0.0.1:8787).
const BASE = process.env.BASE || "http://127.0.0.1:8787";
// 로컬 D1 을 다른 프로세스(wrangler d1 execute)로 만지는 몇 초 사이에 wrangler dev 가 쉬던 keep-alive 연결을 닫아요.
// 요청마다 새 연결을 쓰게 하고(connection: close), 그래도 끊기면 GET 만 한 번 더 보내요 — 쓰기 요청은 두 번 가면 안 되니까요.
const rawFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const o = { ...opts, headers: { ...(opts.headers || {}), connection: "close" } };
  try { return await rawFetch(url, o); }
  catch (e) {
    const code = e?.cause?.code || "", dropped = /ECONNRESET|UND_ERR_SOCKET|EPIPE/.test(code) || /other side closed/.test(String(e?.cause?.message || ""));
    if (!dropped || (o.method && o.method !== "GET")) throw e;
    await new Promise((r) => setTimeout(r, 300));
    return rawFetch(url, o);
  }
};
const jar = {};
async function call(who, method, path, body, headers = {}) {
  const r = await fetch(BASE + "/api" + path, {
    method, headers: { "content-type": "application/json", "x-trio": "1", cookie: jar[who] || "", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get("set-cookie"); if (sc) jar[who] = sc.split(";")[0];
  const data = await r.json().catch(() => null);
  return { status: r.status, data };
}
import { section, count, aiReal, aiMock, writeSummary } from "./lib/sections.mjs";
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); count(!!cond); if (!cond) process.exitCode = 1; };
for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/"); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

import { execFileSync } from "node:child_process";
import { applyView, remindAt, isDue } from "../public/js/blocks/dbview.js";
// ---------- 도구 줄 해석 · 거짓 "넣었어요" 검사 (모델 없이, 고정 입력) ----------
await section("agent-parse", async () => {
  const { parseToolCall, stripToolLines, CLAIM_RE } = await import("../src/agent.js");
  const T = (name) => ({ name, args: {} });
  const calls = [
    ['<<tool>>{"name":"a","args":{}}<</tool>>', "a"], ['<<tool>{"name":"day_plans","args":{"date":"2026-10-01"}}<</tool>>', "day_plans"],
    ['<<tool>>{"name":"add_plan","args":{"text":"논문 {x}"}}<</tool>', "add_plan"], ['<tool>{"name":"b","args":{}}</tool>', "b"],
    ['<<tool>>{"name":"c","args":{"q":"x"}}', "c"], ['```tool\n{"name":"d","args":{}}\n```', "d"],
    ['<dots_function_call> <invoke="add_plan"> <parameter name="date">2026-10-01</parameter> </invoke> </dots_function_call>', "add_plan"],
    ["그냥 글이에요", null],
  ];
  ok(calls.every(([t, n]) => (parseToolCall(t)?.name ?? null) === n), "agent: tool lines parsed even with missing brackets / xml");
  ok(calls.filter(([, n]) => n).every(([t]) => stripToolLines("앞 " + t + " 뒤") === "앞  뒤" || stripToolLines("앞 " + t + " 뒤") === "앞 뒤"), "agent: tool lines stripped from visible text");
  ok(["추가했어", "일정이 추가됐어", "이미 추가되어 있어", "넣어 뒀어", "등록했어요"].every((t) => CLAIM_RE.test(t)) && !CLAIM_RE.test("오늘은 10월 1일이야"), "agent: claim detector");
  // 사용자 페이지 브리지: 일기 친구 · 친구 일기는 막고, 점 조각(../ · %2e)으로 돌아가는 주소도 막아요
  const { pageApiBlock: B } = await import("../public/js/page-guard.js");
  const blocked = [["POST", "/diary/invite"], ["POST", "/x/../diary/invite/abc/accept"], ["DELETE", "/diary/link/abc"], ["GET", "/diary/circle"], ["GET", "/notes/%2e%2e/diary/of?user=a&day=2026-10-01"], ["POST", "/%2E%2E/auth/login"], ["GET", "/plans/./../auth/me"], ["GET", "/pages"]];
  const open = [["GET", "/plans?periods=D:2026-09-28"], ["PUT", "/diary"], ["GET", "/files/a.b.png"], ["POST", "/plans"]];
  ok(blocked.every(([m, p]) => B(m, p, false)) && open.every(([m, p]) => !B(m, p, false)) && B("GET", "/diary?day=2026-09-28", true) && B("POST", "/plans", true) && !B("GET", "/plans?periods=D:2026-09-28", true), "page bridge: diary friends · dot-segment paths blocked, normal paths open");
  void T;
});
// SW 과정 설명 그림 목록 (public/figs/map.json): 자리마다 있는 카드 · 있는 문단 · 있는 그림 파일 · 확인한 영상. 카드 순서는 index.json 과 모듈 파일이 같아야 '그림 N-M' 번호가 화면과 튜터에서 같아요
await section("figs", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const J = (p) => JSON.parse(readFileSync(new URL("../public" + p, import.meta.url)));
  const map = J("/figs/map.json"), bad = [];
  for (const [k, list] of Object.entries(map.place)) {
    const [course, mod, card] = k.split("/");
    let doc = null; try { doc = J(`/${course}/${mod}.json`); } catch {}
    const c = doc?.cards?.find((x) => x.id === card);
    if (!c) { bad.push(k + " 없는 카드"); continue; }
    for (const p of list) {
      if (p.fig && (!map.figs[p.fig] || !existsSync(new URL(`../public/js/figs/f-${p.fig}.js`, import.meta.url)))) bad.push(k + " 그림 " + p.fig);
      if (p.video && !map.videos[p.video]) bad.push(k + " 영상 " + p.video);
      if (!p.fig && !p.video) bad.push(k + " 빈 자리");
      const a = p.after ?? "end";
      if (!(Number.isInteger(a) ? a >= 0 && a < c.idea.length : ["lead", "steps", "code", "end"].includes(a)) || (a === "steps" && !c.steps?.length) || (a === "code" && !c.code)) bad.push(k + " after " + a);
    }
  }
  for (const course of ["vg", "dev", "onto", "aip"]) for (const m of J(`/${course}/index.json`).modules) { const doc = J(`/${course}/${m.id}.json`); if (doc.cards.map((c) => c.id).join() !== m.cards.map((c) => c.id).join()) bad.push(`${course}/${m.id} 카드 순서`); }
  const vids = Object.values(map.videos);
  ok(!bad.length && vids.every((v) => /^[\w-]{11}$/.test(v.id) && v.title && v.channel && ["ko", "en"].includes(v.lang)), `figs: map.json 자리 ${Object.keys(map.place).length}곳 · 그림 ${Object.keys(map.figs).length}개 · 영상 ${vids.length}개가 카드 · 파일과 맞아요${bad.length ? " — " + bad.slice(0, 4).join(" · ") : ""}`);
  const { figsOfModule } = await import("../src/mba.js");
  const ann = figsOfModule(map, "vg", J("/vg/vg-ann-index.json"), "c12").find((f) => f.id === "hnsw");
  ok(ann?.here && /^2-\d+$/.test(ann.no), `figs: 튜터 프롬프트의 그림 번호 — 이 카드에 있는 그림은 이 카드 번호 (${ann?.no})`);
});
const tag = Date.now().toString(36).slice(-5);
// 시작할 때: 2시간 넘게 남은 임시 계정(t_…)을 지워요 — 지난번에 중간에 멈춘 실행이 남긴 것 (지금 도는 다른 검사 것은 안 건드려요)
execFileSync("node", ["scripts/test-cleanup.mjs", "--stale"], { stdio: "ignore" });
const mk = (u, n, pw) => execFileSync("node", ["scripts/add-user.mjs", u, n, pw, "--team=swx2", "--features=all"], { stdio: "ignore" }); // 테스트 사람들은 한 팀 (서로 보기 검사)
// 로컬 D1 에 직접 묻기 (서버를 거치지 않고 저장된 값 확인)
const d1 = (sql) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0].results;
const sid = "q" + [...crypto.getRandomValues(new Uint8Array(2))].map((b) => String.fromCharCode(97 + (b % 26))).join(""); // 가입 아이디는 영문 3글자
let r = await call("a", "POST", "/auth/signup", { username: "x" + tag, password: "password1" });
ok(r.status === 400, "signup: id must be 3 letters");
r = await call("a", "POST", "/auth/signup", { username: sid, password: "password1" });
ok(r.status === 201 && r.data.pending === true, "signup creates a pending account");
r = await call("x", "POST", "/auth/login", { username: sid });
ok(r.status === 403 && r.data.account_state === "pending" && Array.isArray(r.data.approvals) && r.data.approvals.every((x) => x.approved === false), "pending account can't log in until admins approve · sees each admin's approval (none yet)");
d1(`DELETE FROM users WHERE username = '${sid}'`);
mk("t_a" + tag, "테스트A", "password1"); mk("t_b" + tag, "테스트B", "password2");
r = await call("x", "POST", "/auth/login", { username: "nobody" + tag }); ok(r.status === 401, "unknown id rejected");
r = await call("a", "POST", "/auth/login", { username: "t_a" + tag }); ok(r.status === 200, "login a by id only");
r = await call("b", "POST", "/auth/login", { username: "t_b" + tag }); ok(r.status === 200, "login b by id only");
r = await call("a", "GET", "/me"); ok(r.status === 200 && r.data.user.display_name === "테스트A", "me");
// 기능 잠금: 열린 기능이 없는 사람은 경영 · SW 과정 API 도 403 (Dock 자물쇠와 같게), 계획은 그대로
execFileSync("node", ["scripts/add-user.mjs", "t_l" + tag, "잠긴사람", "password1", "--team=swx2"], { stdio: "ignore" });
await call("l", "POST", "/auth/login", { username: "t_l" + tag });
for (const [p, f] of [["/mba/state", "biz"], ["/dev/state", "dev"], ["/vg/state", "dev"], ["/news/map", "news"], ["/apps/cim/state", "cim"]]) { r = await call("l", "GET", p); ok(r.status === 403 && r.data.locked === f, `locked: ${p} → 403 (${f})`); }
r = await call("l", "PUT", "/mba/read", { module: "accounting", card: "profit-vs-revenue" }); ok(r.status === 403, "locked: mba write → 403");
r = await call("l", "GET", "/plans?periods=D:2026-09-28"); ok(r.status === 200, "locked: plans stay open");
r = await call("l", "GET", "/diary?day=2026-09-28"); ok(r.status === 200, "free: diary is open to everyone (not a locked feature)");
r = await call("l", "GET", "/ai/models"); ok(r.status === 200, "free: AI for planning — model list open");
r = await call("l", "POST", "/ai/command", {}); ok(r.status !== 403, `free: AI for planning — /ai/command not locked (${r.status})`);
r = await call("l", "GET", "/ai/chats"); ok(r.status === 403 && r.data.locked === "ai", "locked: AI tab chats still need the ai feature");
r = await call("l", "POST", "/apps/cim/ask", { messages: [{ role: "user", content: "?" }] }); ok(r.status === 403 && r.data.locked === "cim", "locked: CIM AI tutor needs the cim feature");
r = await call("l", "GET", "/apps/ui/state"); ok(r.status === 200 && r.data.data === null, `free: 화면 꾸미기 (/apps/ui/state) is open to a user with no features (${r.status})`);
r = await call("l", "GET", "/search/semantic?q=" + encodeURIComponent("증권거래세 세율")); ok(r.status === 200 && Array.isArray(r.data.results) && !r.data.results.some((x) => x.type === "cim"), "semantic search: open to everyone (notes) · CIM cards only with the cim feature");
d1(`DELETE FROM users WHERE username = 't_l${tag}'`);
// Silicon Valley Mafia (#/svm): 관리자만 — 회원은 기능 · 체험이 다 열려 있어도 없는 주소(404), 관리자는 내용 · 기록 · 번역
await section("svm", async () => {
  const A = "t_sa" + tag, M = "t_sm" + tag;
  mk(A, "관리S", "password1"); mk(M, "회원S", "password1");
  d1(`UPDATE users SET role = 'admin' WHERE username = '${A}'`);
  d1(`UPDATE users SET trial_until = ${Date.now() + 3600e3} WHERE username = '${M}'`);
  try {
    for (const [k, u] of [["sa", A], ["sm", M]]) await call(k, "POST", "/auth/login", { username: u, password: "password1" });
    let r = await call("sa", "GET", "/svm/data");
    const D = r.data || {}, e0 = D.essays?.[0];
    ok(r.status === 200 && D.essays?.length === 15 && D.concepts?.length >= 14 && D.people?.length >= 8 && Array.isArray(D.videos) && Array.isArray(D.more), `svm: admin gets the content (${r.status} · ${D.essays?.length} essays)`);
    ok(D.essays?.every((e, i) => e.no === i + 1 && e.sources?.length && e.claims?.length >= 3), "svm: essays come sorted by no, each with sources and 3+ claims");
    for (const [m, p, b] of [["GET", "/svm/data"], ["GET", `/svm/source?id=${e0?.id}&part=0`], ["POST", "/svm/translate", { id: e0?.id, texts: ["x"] }], ["GET", "/apps/svm/state"], ["PUT", "/apps/svm/state", { data: { read: {} }, at: 0 }]]) {
      r = await call("sm", m, p, b); ok(r.status === 404, `svm: member with every feature + trial → 404 on ${m} ${p.split("?")[0]} (${r.status})`);
    }
    r = await call("sa", "PUT", "/apps/svm/state", { data: { v: 1, read: { [e0?.id]: 1 }, pos: {}, mode: "brief" }, at: 0 });
    const at = r.data?.updated_at;
    r = await call("sa", "GET", "/apps/svm/state");
    ok(r.status === 200 && r.data.data?.read?.[e0?.id] === 1 && r.data.data.mode === "brief" && r.data.updated_at === at, "svm: reading state saved per admin");
    r = await call("sa", "PUT", "/apps/svm/state", { data: { v: 1 }, at: 0 }); ok(r.status === 409, `svm: stale state write → 409 (${r.status})`);
    r = await call("sa", "GET", `/svm/source?id=${e0?.id}&part=99`); ok(r.status === 404, `svm: source part outside the list → 404 (${r.status})`);
    r = await call("sa", "GET", "/svm/source?id=nope&part=0"); ok(r.status === 404, "svm: unknown essay → 404");
    r = await call("sa", "POST", "/svm/translate", { id: e0?.id, texts: [] }); ok(r.status === 400, "svm: translate needs 1+ paragraphs");
    r = await call("sa", "POST", "/svm/translate", { id: e0?.id, texts: Array(13).fill("a") }); ok(r.status === 400, "svm: translate caps 12 paragraphs");
    r = await call("sa", "POST", "/svm/translate", { id: e0?.id, texts: ["a".repeat(3001)] }); ok(r.status === 400, "svm: translate caps 3000 chars a paragraph");
    if (aiMock) { r = await call("sa", "POST", "/svm/translate", { id: e0?.id, texts: ["Hello world", "Second"] }); ok(r.status === 200 && r.data.ko?.length === 2 && r.data.ko[0].startsWith("모의 번역"), `svm: translate (mock AI) → one Korean line per paragraph (${r.status})`); }
  } finally { d1(`DELETE FROM users WHERE username IN ('${A}', '${M}')`); }
});
// 관리자 두 사람: 기능 신청은 둘 다 승인해야 열림 · 시간 추가 · 추천 보너스 (로컬 진짜 관리자는 잠깐 member 로 내렸다가 되돌려요)
await section("admin", async () => {
  const r3 = () => [...crypto.getRandomValues(new Uint8Array(3))].map((b) => String.fromCharCode(97 + (b % 26))).join("");
  const idOf = (u) => d1(`SELECT id FROM users WHERE username = '${u}'`)[0]?.id;
  const admins0 = d1("SELECT id FROM users WHERE role = 'admin'").map((x) => x.id);
  const H = "t_h" + tag, G = "t_g" + tag, R = "t_r" + tag, REF = r3(), NEW = r3();
  mk(H, "관리H", "password1"); mk(G, "관리G", "password1"); mk(REF, "추천인", "password1");
  execFileSync("node", ["scripts/add-user.mjs", R, "신청자", "password1", "--team=swx2"], { stdio: "ignore" });
  d1(`UPDATE users SET role = 'admin' WHERE username IN ('${H}', '${G}')`);
  if (admins0.length) d1(`UPDATE users SET role = 'member' WHERE id IN (${admins0.map((i) => `'${i}'`).join(",")})`);
  try {
    for (const [k, u] of [["h", H], ["g", G], ["r", R]]) await call(k, "POST", "/auth/login", { username: u, password: "password1" });
    const rid = idOf(R), refId = idOf(REF);
    // 공지: 마크다운 원문 그대로 저장 · 돌려줘요 (그릴 때 HTML · 스크립트는 클라이언트에서 지워요 — e2e 가 확인)
    const annSrc = "# 제목\n- **굵게** [링크](https://example.com)\n<script>alert(1)</script>";
    const prevAnn = (await call("h", "GET", "/announcement")).data.announcement;
    r = await call("h", "POST", "/admin/announcements", { body: annSrc });
    const annGot = (await call("r", "GET", "/announcement")).data.announcement;
    ok(r.status === 201 && annGot?.body === annSrc, `announcement: markdown stored raw and returned (${r.status})`);
    r = await call("r", "POST", "/admin/announcements", { body: "x" }); ok(r.status === 403, "announcement: members cannot post");
    // 공지 여러 개: 쌓이고(새 것이 맨 위) · 고치기 · 순서 · 끄기 · 끝나는 때 지나면 회원 목록에서 빠져요 · 관리자만
    const a2 = (await call("h", "POST", "/admin/announcements", { body: "둘째 공지" })).data.announcement;
    const a3 = (await call("h", "POST", "/admin/announcements", { body: "끝난 공지", ends_at: Date.now() - 1000 })).data.announcement;
    let live = (await call("r", "GET", "/announcements")).data.announcements.map((x) => x.id);
    ok(live[0] === a2.id && live.includes(annGot?.id) && !live.includes(a3.id), `announcements: stacked newest first, ended one hidden (${live.length})`);
    r = await call("r", "GET", "/admin/announcements"); ok(r.status === 403, `announcements: admin list is admin-only (${r.status})`);
    r = await call("r", "PATCH", "/admin/announcements/" + a2.id, { body: "x" }); ok(r.status === 403, `announcements: members cannot edit (${r.status})`);
    r = await call("h", "PATCH", "/admin/announcements/" + a2.id, { body: "둘째 공지 (고침)" });
    ok(r.status === 200 && r.data.announcement.updated_at >= a2.updated_at && r.data.announcement.body === "둘째 공지 (고침)", `announcements: edit bumps updated_at (${r.status})`);
    await call("h", "POST", "/admin/announcements/order", { ids: [annGot.id, a2.id, a3.id] });
    live = (await call("r", "GET", "/announcements")).data.announcements.map((x) => x.id);
    ok(live[0] === annGot.id && live[1] === a2.id, `announcements: reorder (${live.slice(0, 2).join(",")})`);
    await call("h", "PATCH", "/admin/announcements/" + a2.id, { active: false });
    live = (await call("r", "GET", "/announcements")).data.announcements.map((x) => x.id);
    const adm = (await call("h", "GET", "/admin/announcements")).data.announcements.map((x) => x.id);
    ok(!live.includes(a2.id) && adm.includes(a2.id) && adm.includes(a3.id), "announcements: turned-off / ended stay in admin list only");
    ok((await call("r", "GET", "/announcement")).data.announcement?.id === annGot.id, "announcement (old API): still returns the top one");
    for (const x of [a2, a3]) await call("h", "DELETE", "/admin/announcements/" + x.id);
    ok(!(await call("h", "GET", "/admin/announcements")).data.announcements.some((x) => x.id === a2.id), "announcements: delete removes from admin list");
    if (annGot) await call("h", "DELETE", "/admin/announcements/" + annGot.id);
    // 공지 사진: 관리자만 · 이미지 4종만 · 5MB 까지, 올린 사진은 일반 회원도 받아요
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
    const up = async (who, type, buf) => { const x = await fetch(BASE + "/api/admin/ann-img", { method: "POST", headers: { "content-type": type, "x-trio": "1", cookie: jar[who] || "" }, body: buf }); return { status: x.status, data: await x.json().catch(() => null) }; };
    r = await up("r", "image/png", PNG); ok(r.status === 403, `ann image: members cannot upload (${r.status})`);
    r = await up("h", "text/html", Buffer.from("<b>x</b>")); ok(r.status === 400, `ann image: non-image type rejected (${r.status})`);
    r = await up("h", "image/png", Buffer.alloc(5 * 1024 * 1024 + 1)); ok(r.status === 400, `ann image: over 5MB rejected (${r.status})`);
    r = await up("h", "image/png", PNG);
    const img = r.data?.src ? await fetch(BASE + r.data.src, { headers: { cookie: jar.r } }) : null;
    const anon = r.data?.src ? await fetch(BASE + r.data.src) : null;
    ok(r.status === 201 && /^\/api\/ann\/img\/[0-9a-f-]+\.png$/.test(r.data.src) && img?.status === 200 && img.headers.get("content-type") === "image/png" && (await img.arrayBuffer()).byteLength === PNG.length && anon?.status === 401,
      `ann image: admin upload ${r.status} → member fetch ${img?.status} · logged-out ${anon?.status}`);
    if (prevAnn) d1(`UPDATE announcements SET active = 1, deleted_at = NULL WHERE id = '${prevAnn.id}'`);
    await call("r", "POST", "/features/request", { feature: "biz" });
    const req = (await call("h", "GET", "/admin/feature-requests")).data.requests.find((x) => x.user_id === rid && x.feature === "biz");
    r = await call("h", "POST", `/admin/feature-requests/${req.id}/approve`); ok(r.status === 200 && r.data.granted === false, "feature request: one admin approval is not enough");
    r = await call("r", "GET", "/mba/state"); ok(r.status === 403, "feature request: still locked after one admin");
    r = await call("g", "GET", "/admin/feature-requests"); ok(r.data.requests.find((x) => x.id === req.id)?.approvals.includes(H) && r.data.admins.length === 2, "feature request: list shows per-admin approvals");
    r = await call("g", "POST", `/admin/feature-requests/${req.id}/approve`); ok(r.data.granted === true, "feature request: second admin approval grants");
    r = await call("r", "GET", "/mba/state"); ok(r.status === 200, "feature request: open after both admins");
    await call("r", "POST", "/features/request", { feature: "ai" });
    const req2 = (await call("h", "GET", "/admin/feature-requests")).data.requests.find((x) => x.user_id === rid && x.feature === "ai");
    await call("h", "POST", `/admin/feature-requests/${req2.id}/approve`);
    r = await call("g", "POST", `/admin/feature-requests/${req2.id}/deny`); ok(r.status === 200 && d1(`SELECT status FROM feature_requests WHERE id = '${req2.id}'`)[0].status === "denied", "feature request: any admin can deny");
    // 시간 추가
    r = await call("h", "POST", `/admin/users/${rid}/time`, { scope: "dev", hours: 24 }); ok(r.status === 200 && Math.abs(r.data.until - Date.now() - 24 * 3600e3) < 120e3, "time: feature +24h");
    r = await call("r", "GET", "/dev/state"); ok(r.status === 200, "time: timed feature opens");
    r = await call("h", "POST", `/admin/users/${rid}/time`, { scope: "dev", hours: 72 }); ok(Math.abs(r.data.until - Date.now() - 96 * 3600e3) < 120e3, "time: extends from current expiry (24h + 3d)");
    ok(/개발 흐름.*사용 시간을 3일 늘려 줬어요 · \d+\/\d+ \d\d:\d\d까지/.test(d1(`SELECT body FROM room_messages WHERE room = 'help:${rid}' AND user_id IS NULL ORDER BY created_at DESC LIMIT 1`)[0]?.body || ""), "time: system message in user's help room");
    r = await call("h", "POST", `/admin/users/${rid}/time`, { scope: "biz", hours: 24 }); ok(r.data.permanent === true, "time: permanent grant is a no-op");
    r = await call("h", "POST", `/admin/users/${rid}/time`, { scope: "dev", hours: 5 }); ok(r.status === 400, "time: only 24 · 72 · 168 hours");
    r = await call("h", "POST", `/admin/users/${rid}/time`, { scope: "dev", hours: -72 }); ok(r.status === 200 && Math.abs(r.data.until - Date.now() - 24 * 3600e3) < 120e3, "time: subtract 3d from 4d leaves 1d");
    r = await call("h", "POST", `/admin/users/${rid}/time`, { scope: "dev", hours: -168 }); ok(r.data.until === null && !d1(`SELECT 1 FROM user_features WHERE user_id = '${rid}' AND feature = 'dev'`).length, "time: subtract past now ends the grant");
    r = await call("h", "POST", `/admin/users/${rid}/time`, { scope: "dev", hours: -24 }); ok(r.data.none === true, "time: nothing left to subtract");
    await call("h", "POST", `/admin/users/${rid}/time`, { scope: "dev", hours: 24 });
    d1(`UPDATE user_features SET expires_at = ${Date.now() - 1000} WHERE user_id = '${rid}' AND feature = 'dev'`);
    r = await call("r", "GET", "/dev/state"); ok(r.status === 403, "time: expired grant locks again");
    r = await call("h", "POST", `/admin/users/${rid}/time`, { scope: "all", hours: 168 }); ok(Math.abs(r.data.until - Date.now() - 168 * 3600e3) < 120e3, "time: all = trial +7d");
    r = await call("r", "GET", "/features"); ok(r.data.trial_until === d1(`SELECT trial_until FROM users WHERE id = '${rid}'`)[0].trial_until && r.data.open.includes("news"), "time: trial opens every feature");
    // 관리자 메시지: 글이 없던 회원 문의방에 관리자가 먼저 쓰기 · 단체 메시지는 회원마다 자기 문의방에 따로 (관리자 · 대신 들어간 세션은 못 보냄)
    {
      const hid = idOf(H), gid = idOf(G);
      await call("f", "POST", "/auth/login", { username: REF, password: "password1" });
      r = await call("h", "GET", `/room?room=help:${refId}`); ok(r.status === 200 && r.data.messages.length === 0 && r.data.people?.[refId]?.username === REF, "admin msg: admin opens a help room with no messages (people included)");
      r = await call("h", "POST", "/room", { room: "help:" + refId, body: "안녕하세요, 관리자예요" }); ok(r.status === 201 && r.data.message.user_id === hid, "admin msg: admin posts first in any help room as themselves");
      r = await call("h", "GET", "/room/help"); ok(r.data.rooms.some((x) => x.room === "help:" + refId), "admin msg: help room now in admin's 문의 list");
      r = await call("f", "GET", "/room/unread"); ok(r.data.rooms["help:" + refId] >= 1, "admin msg: user sees unread in their help room");
      r = await call("r", "POST", "/admin/message", { text: "x" }); ok(r.status === 403, "admin msg: non-admin POST /admin/message → 403");
      r = await call("h", "POST", "/admin/message", { text: "   " }); ok(r.status === 400, "admin msg: empty text → 400");
      r = await call("h", "POST", "/admin/message", { text: "가".repeat(2001) }); ok(r.status === 400, "admin msg: over 2000 chars → 400");
      r = await call("h", "POST", "/admin/message", { text: "x", ids: "all" }); ok(r.status === 400, "admin msg: bad ids → 400");
      const text = "단체 공지 " + tag;
      r = await call("h", "POST", "/admin/message", { text, ids: [rid, refId, gid] }); ok(r.status === 201 && r.data.sent === 2, `admin msg: broadcast to the chosen ids skips admins (sent ${r.data?.sent})`);
      ok([rid, refId].every((id) => d1(`SELECT user_id FROM room_messages WHERE room = 'help:${id}' AND body = '${text}' AND kind = 'text'`)[0]?.user_id === hid), "admin msg: each target's help room has the admin-authored message (D1)");
      ok(!d1(`SELECT 1 FROM room_messages WHERE room = 'help:${gid}' AND body = '${text}'`).length, "admin msg: no copy in an admin's help room");
      r = await call("r", "GET", `/room?room=help:${rid}`); ok(r.status === 200 && r.data.messages.some((m) => m.body === text && m.user_id === hid) && r.data.people?.[hid]?.username === H, "admin msg: user reads it in their own help room (admin's name)");
      r = await call("r", "GET", `/room?room=help:${refId}`); ok(r.status === 403, "admin msg: another user can't read someone else's help room");
      r = await call("r", "POST", "/room", { room: "help:" + refId, body: "엿보기" }); ok(r.status === 403, "admin msg: another user can't post in someone else's help room");
      r = await call("g", "GET", `/room?room=help:${refId}`); ok(r.status === 200 && r.data.messages.some((m) => m.body === text), "admin msg: the other admin sees it too");
      await call("hi", "POST", "/auth/login", { username: H, password: "password1" });
      await call("hi", "POST", `/admin/users/${rid}/impersonate`);
      r = await call("hi", "POST", "/admin/message", { text: "x", ids: [rid] }); ok(r.status === 403, "admin msg: not while impersonating → 403");
      r = await call("hi", "GET", `/room?room=help:${refId}`); ok(r.status === 403, "admin msg: impersonated session can't read other help rooms");
    }
    // 추천
    r = await call("x", "POST", "/auth/signup", { username: NEW, password: "password1", referrer: NEW }); ok(r.status === 400, "referral: not yourself");
    r = await call("x", "POST", "/auth/signup", { username: NEW, password: "password1", referrer: "t_h" }); ok(r.status === 400, "referral: unknown id rejected");
    r = await call("x", "POST", "/auth/signup", { username: NEW, password: "password1", referrer: REF }); ok(r.status === 201, "referral: signup with friend id");
    const nid = idOf(NEW);
    ok(d1(`SELECT referred_by FROM users WHERE id = '${nid}'`)[0].referred_by === refId, "referral: referred_by stored (D1)");
    await call("h", "POST", `/admin/users/${nid}/approve`);
    ok(!d1(`SELECT trial_until FROM users WHERE id = '${refId}'`)[0].trial_until, "referral: no bonus until both admins approve");
    r = await call("g", "POST", `/admin/users/${nid}/approve`); ok(r.data.active === true, "referral: account active after both admins");
    ok(Math.abs(d1(`SELECT trial_until FROM users WHERE id = '${refId}'`)[0].trial_until - Date.now() - 24 * 3600e3) < 120e3, "referral: referrer trial +24h");
    ok(/님이 SWx2 에 가입했어요 · 고마워요! 모든 Dock 체험 24시간이 추가됐어요/.test(d1(`SELECT body FROM room_messages WHERE room = 'help:${refId}' ORDER BY created_at DESC LIMIT 1`)[0]?.body || ""), "referral: thank-you message in referrer's help room");
    r = await call("h", "GET", "/admin/users"); ok(r.data.users.find((u) => u.id === nid)?.referrer === REF, "referral: admin list shows referrer");
  } finally {
    if (admins0.length) d1(`UPDATE users SET role = 'admin' WHERE id IN (${admins0.map((i) => `'${i}'`).join(",")})`);
    d1(`DELETE FROM users WHERE username IN ('${H}', '${G}', '${R}', '${REF}', '${NEW}')`);
  }
});
r = await call("x", "GET", "/me"); ok(r.status === 401, "anon rejected");
r = await fetch(BASE + "/api/plans", { method: "POST", headers: { cookie: jar.a, "content-type": "application/json" }, body: "{}" });
ok(r.status === 403, "csrf header required");

r = await call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-28", text: "영단어 50개", start: "08:00", mins: 60 });
ok(r.status === 201, "create day plan"); const pid = r.data.plan.id;
r = await call("a", "POST", "/plans", { scope: "day", period: r.data.plan.period, text: "우선순위 할 일", priority: "xhigh" }); ok(r.status === 201 && r.data.plan.priority === "xhigh", "plan priority: create xhigh");
{ const ppid = r.data.plan.id;
  r = await call("a", "PATCH", "/plans/" + ppid, { priority: "max" }); ok(r.status === 200 && r.data.plan.priority === "max", "plan priority: update to max");
  r = await call("a", "PATCH", "/plans/" + ppid, { priority: "urgent" }); ok(r.status === 400, "plan priority: unknown value → 400");
  // 쉽게 읽기: 다 읽으면 1일 뒤 복습 · 절반 이상 맞히면 다음 간격 · 못 맞히면 내일 다시
  r = await call("a", "GET", "/papers/easy"); ok(r.status === 200 && Array.isArray(r.data.items) && r.data.items.length === 0, "easy: empty state");
  r = await call("a", "PUT", "/papers/easy/read", { paper: "cmx", recall: 3, total: 5 });
  { const it = r.data.items?.find((x) => x.paper === "cmx"); ok(r.status === 200 && it?.stage === 1 && it.recall === 3 && it.due_day > r.data.today, "easy: read → stage 1, due tomorrow"); }
  r = await call("a", "PUT", "/papers/easy/read", { paper: "nope" }); ok(r.status === 400, "easy: unknown paper → 400");
  // 형광펜 · 메모: 만들기 → 내 것만 보임 → 색 · 메모 고치기 → 지우기
  r = await call("a", "POST", "/papers/marks", { paper: "cmx", sec: "glance", quote: "두 종류 정보를 섞는다", prefix: "는 ", suffix: ". 그래서", color: "green" });
  ok(r.status === 201 && r.data.mark?.color === "green" && r.data.mark.memo === "", "marks: create"); const mkid = r.data.mark?.id;
  r = await call("a", "POST", "/papers/marks", { paper: "cmx", sec: "glance", quote: "x", color: "purple" }); ok(r.status === 400, "marks: unknown color → 400");
  r = await call("a", "POST", "/papers/marks", { paper: "cmx", sec: "glance", quote: "   " }); ok(r.status === 400, "marks: empty quote → 400");
  r = await call("a", "GET", "/papers/marks?paper=cmx"); ok(r.status === 200 && r.data.marks.length === 1 && r.data.marks[0].id === mkid, "marks: list mine");
  r = await call("b", "GET", "/papers/marks?paper=cmx"); ok(r.status === 200 && r.data.marks.length === 0, "marks: private to me");
  r = await call("a", "GET", "/papers/marks?paper=cmx&mode=easy"); ok(r.status === 200 && r.data.marks.length === 0, "marks: easy mode separate");
  r = await call("a", "PATCH", "/papers/marks/" + mkid, { color: "rose", memo: "  왜 중요한지  " }); ok(r.status === 200 && r.data.mark.color === "rose" && r.data.mark.memo === "왜 중요한지", "marks: update color + memo");
  r = await call("b", "PATCH", "/papers/marks/" + mkid, { memo: "남의 것" }); ok(r.status === 404, "marks: others can't edit");
  r = await call("b", "DELETE", "/papers/marks/" + mkid); ok(r.status === 404, "marks: others can't delete");
  r = await call("a", "DELETE", "/papers/marks/" + mkid); ok(r.status === 200, "marks: delete");
  r = await call("a", "GET", "/papers/marks?paper=cmx"); ok(r.data.marks.length === 0, "marks: gone");
  r = await call("a", "PUT", "/papers/easy/review", { results: [{ paper: "cmx", correct: 2, total: 2 }] });
  { const it = r.data.items?.find((x) => x.paper === "cmx"); ok(r.status === 200 && it?.stage === 2 && it.reviews === 1, "easy: review pass → stage 2"); }
  r = await call("a", "PUT", "/papers/easy/review", { results: [{ paper: "cmx", correct: 0, total: 2 }] });
  { const it = r.data.items?.find((x) => x.paper === "cmx"); ok(it?.stage === 2 && it.reviews === 2, "easy: review fail keeps stage"); }
  r = await call("b", "GET", "/papers/easy"); ok(r.status === 200 && !r.data.items.some((x) => x.paper === "cmx"), "easy: private per user");
  r = await call("a", "PUT", "/papers/easy/review", { results: "x" }); ok(r.status === 400, "easy: bad results → 400");
  // AI 공부책: 장 단위 읽음 → 복습 → 실습 체크 (책 · 장 id 는 public/books/index.json 에 있어야 해요)
  // Dock 순서 · 숨긴 친구 페이지: 계정에 저장, 본인만, 모양이 틀리면 400
  r = await call("a", "PATCH", "/me", { dock_order: ["nav:room", "nav:home", "page:abc-123"] }); ok(r.status === 200 && r.data.user.dock_order.join() === "nav:room,nav:home,page:abc-123", "dock: save order");
  r = await call("a", "GET", "/me"); ok(r.data.user.dock_order[0] === "nav:room", "dock: /me shows order");
  r = await call("a", "PATCH", "/me", { dock_order: ["x:<script>"] }); ok(r.status === 400, "dock: bad key → 400");
  r = await call("a", "PATCH", "/me", { hidden_pages: ["pg-1", "pg-1", "pg-2"] }); ok(r.status === 200 && r.data.user.hidden_pages.join() === "pg-1,pg-2", "hidden pages: save (dedupe)");
  r = await call("a", "PATCH", "/me", { hidden_pages: "pg-1" }); ok(r.status === 400, "hidden pages: not array → 400");
  r = await call("a", "PATCH", "/me", { bio: "순서 유지 검사" }); ok(r.data.user.dock_order[0] === "nav:room" && r.data.user.hidden_pages.length === 2, "dock: other edits keep order + hidden");
  r = await call("b", "GET", "/me"); ok(!r.data.user.dock_order.length && !r.data.user.hidden_pages.length, "dock: per user");
  r = await call("a", "GET", "/users"); ok(r.data.users.every((u) => u.dock_order === undefined && u.hidden_pages === undefined), "dock: not exposed to friends");
  r = await call("a", "PATCH", "/me", { dock_order: null, hidden_pages: [] }); ok(r.status === 200 && !r.data.user.dock_order.length, "dock: reset");
  // Dock 폴더: { id: { name, items } } + dock_order 의 folder:<id>
  r = await call("a", "PATCH", "/me", { dock_order: ["folder:f1", "nav:home"], dock_folders: { f1: { name: " 공부  폴더 ", items: ["nav:room", "page:abc-123"] } } }); ok(r.status === 200 && r.data.user.dock_folders.f1?.name === "공부 폴더" && r.data.user.dock_folders.f1.items.length === 2 && r.data.user.dock_order[0] === "folder:f1", "dock folders: save");
  r = await call("a", "PATCH", "/me", { bio: "폴더 유지 검사" }); ok(r.data.user.dock_folders.f1?.items[0] === "nav:room", "dock folders: other edits keep folders");
  for (const [bad, why] of [[{ F1: { name: "a", items: ["nav:home"] } }, "bad id"], [{ f1: { name: "", items: ["nav:home"] } }, "empty name"], [{ f1: { name: "가".repeat(21), items: ["nav:home"] } }, "long name"], [{ f1: { name: "a", items: ["x:<b>"] } }, "bad key"], [{ f1: { name: "a", items: [] } }, "empty items"], [{ f1: { name: "a", items: Array.from({ length: 31 }, (_, i) => "page:p" + i) } }, "31 items"], [Object.fromEntries(Array.from({ length: 21 }, (_, i) => ["f" + i, { name: "a", items: ["page:q" + i] }])), "21 folders"], [{ f1: { name: "a", items: ["nav:home"] }, f2: { name: "b", items: ["nav:home"] } }, "same key twice"], [["nav:home"], "array"]]) {
    r = await call("a", "PATCH", "/me", { dock_folders: bad }); ok(r.status === 400, `dock folders: ${why} → 400`);
  }
  r = await call("a", "PATCH", "/me", { dock_order: null, dock_folders: null }); ok(r.status === 200 && !Object.keys(r.data.user.dock_folders).length, "dock folders: reset");
  r = await call("a", "PATCH", "/me", { graph_prefs: { basis: "tier", node: 1.5 } }); ok(r.status === 200 && r.data.user.graph_prefs.basis === "tier", "graph prefs: save");
  r = await call("a", "PATCH", "/me", { graph_prefs: [1, 2] }); ok(r.status === 400, "graph prefs: array → 400");
  r = await call("a", "PATCH", "/me", { graph_prefs: { big: "x".repeat(5000) } }); ok(r.status === 400, "graph prefs: too big → 400");
  r = await call("a", "PATCH", "/me", { graph_prefs: null }); ok(r.status === 200 && r.data.user.graph_prefs === null, "graph prefs: reset");
  // 내 AI 모델: 계정에 저장 → /me · /ai/my-model 에 보이고, 모르는 id 는 400, "" 이면 자동으로
  r = await call("a", "GET", "/ai/models"); ok(r.status === 200 && r.data.models.some((m) => m.id === "groq" && Array.isArray(m.chain) && m.chain.length), "ai model: list has chains");
  r = await call("a", "PATCH", "/me", { ai_model: "groq" }); ok(r.status === 200 && r.data.user.ai_model === "groq", "ai model: set groq");
  r = await call("a", "GET", "/me"); ok(r.data.user.ai_model === "groq", "ai model: /me shows it");
  r = await call("a", "GET", "/ai/my-model"); ok(r.status === 200 && r.data.model === "groq" && r.data.label === "Groq GPT-OSS", "ai model: my-model label");
  r = await call("a", "PATCH", "/me", { ai_model: "gpt-9" }); ok(r.status === 400, "ai model: unknown id → 400");
  r = await call("a", "PATCH", "/me", { display_name: r.data?.user?.display_name || "테스트A" }); r = await call("a", "GET", "/me"); ok(r.data.user.ai_model === "groq", "ai model: other profile edits keep it");
  r = await call("b", "GET", "/me"); ok(!r.data.user.ai_model, "ai model: per user");
  r = await call("a", "PATCH", "/me", { ai_model: "" }); ok(r.status === 200 && r.data.user.ai_model === null, "ai model: clear → auto");
  r = await call("a", "GET", "/books/state"); ok(r.status === 200 && Array.isArray(r.data.items) && Array.isArray(r.data.tasks), "books: state");
  r = await call("a", "PUT", "/books/read", { book: "big", chapter: "question", recall: 3, total: 4 });
  { const it = r.data.items?.find((x) => x.book === "big" && x.chapter === "question"); ok(r.status === 200 && it?.stage === 1 && it.recall === 3 && it.due_day > r.data.today, "books: read → stage 1, due tomorrow"); }
  r = await call("a", "PUT", "/books/read", { book: "big", chapter: "nope" }); ok(r.status === 400, "books: unknown chapter → 400");
  r = await call("a", "PUT", "/books/review", { results: [{ book: "big", chapter: "question", correct: 2, total: 3 }] });
  { const it = r.data.items?.find((x) => x.chapter === "question"); ok(r.status === 200 && it?.stage === 2 && it.reviews === 1, "books: review pass → stage 2"); }
  r = await call("a", "PUT", "/books/review", { results: [{ book: "big", chapter: "question", correct: 1, total: 3 }] });
  { const it = r.data.items?.find((x) => x.chapter === "question"); ok(it?.stage === 2 && it.reviews === 2, "books: review fail keeps stage"); }
  r = await call("a", "PUT", "/books/task", { task: "big/data-tokens/1" }); ok(r.status === 200 && r.data.tasks.includes("big/data-tokens/1"), "books: task done");
  r = await call("a", "PUT", "/books/task", { task: "big/data-tokens/1", done: false }); ok(r.status === 200 && !r.data.tasks.includes("big/data-tokens/1"), "books: task undone");
  r = await call("a", "PUT", "/books/task", { task: "../x" }); ok(r.status === 400, "books: bad task → 400");
  r = await call("b", "GET", "/books/state"); ok(r.status === 200 && !r.data.items.some((x) => x.book === "big"), "books: private per user");
  // CIM (#/cim): 사람별 저장 (user_app_state) — 통째로 쓰고, 다른 기기가 먼저 썼으면 409 + 서버 값 (화면이 합쳐서 다시 보내요)
  r = await call("a", "GET", "/apps/cim/state"); ok(r.status === 200 && r.data.data === null && r.data.updated_at === 0, "cim: empty state");
  r = await call("a", "PUT", "/apps/cim/state", { data: { v: 2, ans: { "s3c6-13-0": [1, 0, 1] } }, at: 0 }); const cimAt = r.data.updated_at; ok(r.status === 200 && cimAt > 0, "cim: first save");
  r = await call("a", "GET", "/apps/cim/state"); ok(r.status === 200 && r.data.data.ans["s3c6-13-0"][0] === 1 && r.data.updated_at === cimAt, "cim: state round-trips");
  r = await call("a", "PUT", "/apps/cim/state", { data: { v: 2 }, at: 0 }); ok(r.status === 409 && r.data.updated_at === cimAt && r.data.data.ans["s3c6-13-0"], "cim: stale write → 409 with the server copy");
  r = await call("a", "PUT", "/apps/cim/state", { data: { v: 2, ans: { "s3c6-13-0": [1, 1, 0] } }, at: cimAt }); ok(r.status === 200 && r.data.updated_at > cimAt, "cim: write on the latest copy");
  r = await call("a", "PUT", "/apps/cim/state", { data: [1], at: 0 }); ok(r.status === 400, "cim: data must be an object");
  r = await call("a", "PUT", "/apps/cim/state", { data: { big: "x".repeat(600_001) }, at: 0 }); ok(r.status === 413, "cim: too big → 413");
  r = await call("a", "GET", "/apps/nope/state"); ok(r.status === 404, "cim: unknown app → 404");
  r = await call("b", "GET", "/apps/cim/state"); ok(r.status === 200 && r.data.data === null, "cim: private per user");
  // 화면 꾸미기 (/apps/ui/state, js/theme.js): 잠금 없이 누구나 · 로그인 필요 · 4KB 까지 · 사람별 · 409 면 서버 값
  r = await call("anon", "GET", "/apps/ui/state"); ok(r.status === 401, "ui: logged out → 401");
  r = await call("anon", "PUT", "/apps/ui/state", { data: { theme: "light" }, at: 0 }); ok(r.status === 401, "ui: logged-out write → 401");
  r = await call("a", "PUT", "/apps/ui/state", { data: { theme: "auto", wall: "sage", accent: "blue", glass: "clear", solid: true }, at: 0 }); const uiAt = r.data?.updated_at; ok(r.status === 200 && uiAt > 0, "ui: first save");
  r = await call("a", "GET", "/apps/ui/state"); ok(r.status === 200 && r.data.data.wall === "sage" && r.data.data.accent === "blue" && r.data.updated_at === uiAt, "ui: state round-trips");
  r = await call("a", "PUT", "/apps/ui/state", { data: { theme: "dark" }, at: 0 }); ok(r.status === 409 && r.data.updated_at === uiAt && r.data.data.wall === "sage", "ui: stale write → 409 with the server copy");
  r = await call("a", "PUT", "/apps/ui/state", { data: { big: "x".repeat(4_001) }, at: uiAt }); ok(r.status === 413, "ui: over 4 KB → 413");
  r = await call("b", "GET", "/apps/ui/state"); ok(r.status === 200 && r.data.data === null && r.data.updated_at === 0, "ui: private per user");
  r = await call("b", "PUT", "/apps/ui/state", { data: { accent: "pink" }, at: 0 }); ok(r.status === 200, "ui: b saves its own");
  r = await call("a", "GET", "/apps/ui/state"); ok(r.data?.data?.accent === "blue" && r.data.updated_at === uiAt, "ui: b's save leaves a's copy alone");
  // CIM AI 튜터 (POST /apps/cim/ask): 질문이 없으면 400 (AI 를 부르기 전에 막아요)
  r = await call("a", "POST", "/apps/cim/ask", { messages: [], context: { kind: "card", title: "검사" } }); ok(r.status === 400, "cim ask: empty question → 400");
  // ---------- 뜻으로 찾기 (GET /search/semantic) · 근거 달린 튜터 (src/rag.js · migrations/0067) ----------
  {
    const { terms, chunkNote, cimRows, cimHref, checkCites } = await import("../src/lib/rag-text.js"); // 바깥 의존 없는 글 다루기만 (rag.js 는 워커 전용)
    ok(JSON.stringify(terms("국세기본법에서 기한은 공휴일이면")) === JSON.stringify(["국세기본법", "기한", "공휴일이면"]) && terms("a b").length === 0, "rag: query terms split on spaces, trailing particles stripped, <2 chars dropped");
    const ch = chunkNote("긴 노트", "# 가\n" + "첫 문단입니다. ".repeat(40) + "\n\n## 나\n둘째 절 내용\n\n![](x.png) [[링크 노트|별칭]]");
    ok(ch.length >= 2 && ch[0].path === "긴 노트 > 가" && ch.some((c) => c.path === "긴 노트 > 가 > 나" && /별칭/.test(c.text) && !/x\.png/.test(c.text)) && ch.every((c) => c.text.length <= 1400), "rag: notes chunked by heading path (≤1400 chars, images dropped, wikilink label kept)");
    ok(chunkNote("빈 노트", "").length === 1, "rag: empty note still gets one title chunk");
    const rows = cimRows({ s: 1, c: 1, t: "장", sec: [{ t: "절", p: [{ n: 3, t: "카드", b: "▶ 핵심포인트 해설 · 카드\n본문", q: [{ q: "문제?", o: ["가", "나"], a: 0, x: "해설" }, { k: "s1c1-9-0", q: "옮긴 문제", o: [], a: 0 }] }] }] });
    ok(rows[0].id === "cim:s1c1-3" && rows[0].text === "본문" && rows[0].path === "CIM > 1과목 1장 장 > 절 > 카드" && rows[1].id === "cimq:s1c1-3-0" && rows[2].id === "cimq:s1c1-9-0" && rows[2].source_id === "s1c1-3" && cimHref("s3c10-12") === "#/cim/study/s3c10/12", "rag: CIM card = one chunk (boilerplate stripped) · question ids match data.js (q.k kept) · card href");
    const cc = checkCites("세율은 0.05%예요 [1]. 지어낸 번호 [7]. 둘 다 [1, 2].", 2);
    ok(cc.text === "세율은 0.05%예요 [1]. 지어낸 번호. 둘 다 [1][2]." && [...cc.used].join() === "1,2", "cim ask: citations outside the source list are dropped, lists normalized");
    r = await call("anon", "GET", "/search/semantic?q=x"); ok(r.status === 401, "semantic search: login required");
    r = await call("a", "GET", "/search/semantic?q=" + encodeURIComponent("   ")); ok(r.status === 400, "semantic search: empty query → 400");
    r = await call("b", "GET", "/rag/status"); ok(r.status === 403, "rag admin API: members get 403");
    const secret = "zq" + tag + "비밀노트";
    r = await call("a", "POST", "/notes", { title: "듀레이션 메모 " + tag, body: `${secret} 채권 가격이 금리에 얼마나 민감한지 나타내요.` });
    const sNote = r.data?.note?.id;
    let seen = null;
    for (let i = 0; i < 20 && !seen; i++) { await new Promise((res) => setTimeout(res, 300)); r = await call("a", "GET", "/search/semantic?q=" + encodeURIComponent(secret)); seen = r.data?.results?.find((x) => x.id === sNote); }
    ok(seen && seen.type === "note" && seen.href === "#/notes/" + sNote && seen.via.includes("fts"), "semantic search: my new note is found right after saving (D1 FTS, before vectors arrive)");
    r = await call("b", "GET", "/search/semantic?q=" + encodeURIComponent(secret)); ok(r.status === 200 && !r.data.results.some((x) => x.id === sNote), "semantic search: user B never sees user A's note");
    r = await call("b", "GET", "/search/semantic?q=" + encodeURIComponent("채권 가격 금리 민감 듀레이션 " + tag)); ok(r.status === 200 && !r.data.results.some((x) => x.type === "note" && x.id === sNote), "semantic search: isolation holds for meaning-style queries too");
    const aId = (await call("a", "GET", "/me")).data.user.id;
    const ck = d1(`SELECT user_id, source_type FROM chunks WHERE source_id = '${sNote}'`);
    ok(ck.length >= 1 && ck.every((c) => c.source_type === "note" && c.user_id === aId), "rag: note chunks stored in D1 with the owner's user_id");
    r = await call("a", "DELETE", "/notes/" + sNote);
    let left = 1;
    for (let i = 0; i < 20 && left; i++) { await new Promise((res) => setTimeout(res, 300)); left = d1(`SELECT COUNT(*) n FROM chunks WHERE source_id = '${sNote}'`)[0].n; }
    ok(left === 0, "rag: deleting a note removes its chunks (vectors go to rag_tomb)");
    // 근거 달린 튜터: 지금 카드(key)는 언제나 [1], 근거 칩 주소는 카드 화면으로
    r = await call("a", "POST", "/apps/cim/ask?stream=0", { messages: [{ role: "user", content: "기한이 공휴일이면 언제까지예요?" }], context: { kind: "card", key: "s1c1-1", chapter: "1과목 1장", title: "기간과 기한 및 서류의 송달" } });
    ok(r.status === 200 && Array.isArray(r.data.sources) && r.data.sources[0]?.n === 1 && r.data.sources[0].href === "#/cim/study/s1c1/1" && r.data.sources.every((x) => !("text" in x)) && typeof r.data.text === "string", `cim ask: returns numbered sources with hrefs (${r.status} · ${r.data?.sources?.length} sources · cited ${r.data?.sources?.filter((x) => x.cited).length})`);
  }
  // ---------- 관계 종류 · decide() (src/onto.js · src/decide.js · migrations/0068) ----------
  {
    const D = await import("../src/decide.js");
    const V = await import("../src/lib/onto-vocab.js");
    const Q = D.normalizeQuestions({ x: { type: "choice", instructions: "?", criteria: { a: "A", b: "B" } } });
    ok(Object.keys(Q.x.criteria).join() === "a,b,unknown", "decide: choice questions always get 'unknown'");
    let threw = false; try { D.normalizeQuestions({ x: { type: "nope" } }); } catch { threw = true; } ok(threw, "decide: unknown question type is rejected");
    const protos = { a: [1, 0, 0], b: [0, 1, 0] };
    const p1 = D.protoProbs([0.9, 0.1, 0], protos), p2 = D.protoProbs([0.9, 0.1, 0], protos);
    ok(JSON.stringify(p1) === JSON.stringify(p2) && p1.choice === "a" && "unknown" in p1.probabilities && p1.confidence > 0.5, `decide embed-proto: deterministic, picks nearest prototype, unknown in probabilities (conf ${p1.confidence})`);
    ok(D.protoProbs([0, 0, 1], protos).choice === "unknown", "decide embed-proto: far from every prototype → unknown");
    // 개인 자료(private) 길: Groq 만. 키가 없으면 아무 데도 보내지 않고 unknown
    const realFetch = globalThis.fetch, hits = [];
    globalThis.fetch = async (u, o) => { hits.push(String(u)); if (String(u).includes("api.groq.com")) { const k = hits.filter((h) => h.includes("groq")).length; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { x: { answer: k === 3 ? "b" : "a", why: "근거" } } }) } }], usage: { total_tokens: 10 } }), { status: 200, headers: { "content-type": "application/json" } }); } return new Response("{}", { status: 500 }); };
    const qx = { x: { type: "choice", instructions: "?", criteria: { a: "A", b: "B" } } };
    try {
      let d = await D.decide({}, { state: "비밀 노트", questions: qx, engine: "llm" });
      ok(d.answers.x.choice === "unknown" && d.answers.x.confidence === 0 && hits.length === 0, "decide private: no Groq key → unknown, nothing sent anywhere");
      d = await D.decide({ GROQ_API_KEY: "k", GEMINI_API_KEY: "g" }, { state: "비밀 노트", questions: qx, engine: "llm" });
      ok(hits.length === 3 && hits.every((h) => h.includes("api.groq.com")) && d.answers.x.choice === "a" && Math.abs(d.answers.x.confidence - 0.667) < 0.01 && d.answers.x.probabilities.unknown === 0, `decide private: 3 Groq samples only → vote share confidence (${d.answers.x.confidence})`);
      hits.length = 0;
      d = await D.decide({ JEV_API_KEY: "j", DECIDE_SHADOW: "laya", LAYA_URL: "http://laya" }, { state: "비밀 노트", questions: qx, engine: "jev" });
      ok(d.answers.x.choice === "unknown" && !hits.some((h) => h.includes("typesafe") || h.includes("laya")), "decide private: Jev/Laya (main or shadow) never get private text without DECIDE_EXT_PRIVATE=1");
      d = await D.decide({}, { questions: qx, engine: "jev" });
      ok(d.answers.x.choice === "unknown" && hits.length === 0, "decide: Jev engine without JEV_API_KEY → unknown");
    } finally { globalThis.fetch = realFetch; }
    ok(JSON.stringify(V.readRelChoice("example_of_inv")) === JSON.stringify({ rel: "example_of", swap: true }) && V.readRelChoice("none") === null && V.readRelChoice("unknown") === null && V.outcomeLabel("x", "y", "y", "x", "part_of") === "part_of_inv" && V.outcomeLabel("x", "y", "y", "x", "related") === "related", "onto vocab: _inv choices flip direction · outcome labels follow the asked direction");

    const n1 = (await call("a", "POST", "/notes", { title: "콜옵션 " + tag, body: "정해진 가격(행사가)에 기초자산을 살 수 있는 권리예요. 주가가 행사가보다 오르면 이익이고, 손실은 낸 프리미엄까지예요." })).data.note;
    const n2 = (await call("a", "POST", "/notes", { title: "파생상품 " + tag, body: "가치가 기초자산에서 나오는 상품이에요." })).data.note;
    const n3 = (await call("a", "POST", "/notes", { title: "풋옵션 " + tag, body: "정해진 가격에 팔 수 있는 권리예요.", parent_id: n2.id })).data.note;
    r = await call("a", "PUT", "/rels", { src_id: n1.id, dst_id: n2.id, rel: "example_of" });
    ok(r.status === 200 && r.data.rel.rel === "example_of" && r.data.rel.status === "confirmed" && r.data.prev === null, "rels: set a typed relation on my own notes");
    r = await call("a", "PUT", "/rels", { src_id: n1.id, dst_id: n2.id, rel: "friend_of" }); ok(r.status === 400, "rels: unknown relation → 400");
    r = await call("b", "PUT", "/rels", { src_id: n1.id, dst_id: n2.id, rel: "is_a" }); ok(r.status === 404, "rels: someone else's notes → 404");
    r = await call("a", "PUT", "/rels", { src_id: n2.id, dst_id: n1.id, rel: "is_a" });
    ok(r.status === 200 && r.data.prev?.rel === "example_of" && d1(`SELECT COUNT(*) n FROM note_rel WHERE src_id IN ('${n1.id}','${n2.id}') AND dst_id IN ('${n1.id}','${n2.id}')`)[0].n === 1, "rels: one row per pair, reversing the direction updates it (prev returned for undo)");
    r = await call("a", "PUT", "/rels", { ...r.data.prev, restore: true });
    ok(r.status === 200 && r.data.rel.rel === "example_of" && r.data.rel.src_id === n1.id, "rels: restore puts the previous row back (undo)");
    ok((await call("a", "GET", "/notes/" + n1.id)).data.note.body === "정해진 가격(행사가)에 기초자산을 살 수 있는 권리예요. 주가가 행사가보다 오르면 이익이고, 손실은 낸 프리미엄까지예요.", "rels: setting a relation never changes the note body");
    r = await call("a", "GET", "/graph");
    ok(r.data.rels?.some((x) => x.src_id === n1.id && x.dst_id === n2.id && x.rel === "example_of") && typeof r.data.rel_suggested === "number", "graph: confirmed relations come with the graph (+ inbox count)");
    r = await call("b", "GET", "/graph"); ok(!r.data.rels?.some((x) => x.src_id === n1.id), "graph: other people's relations stay hidden");
    // AI 제안 (제안함): 확정 · 다른 종류 · 거절 — 거절한 쌍은 남아서 다시 제안되지 않아요
    const aId = (await call("a", "GET", "/me")).data.user.id, s1 = "rs1" + tag, s2 = "rs2" + tag, t0 = Date.now();
    d1(`INSERT INTO note_rel (id, user_id, src_id, dst_id, rel, status, origin, confidence, evidence, created_at, updated_at) VALUES ('${s1}', '${aId}', '${n3.id}', '${n2.id}', 'part_of', 'suggested', 'ai', 0.82, '근거 한 줄', ${t0}, ${t0}), ('${s2}', '${aId}', '${n3.id}', '${n1.id}', 'contrasts_with', 'suggested', 'ai', 0.7, NULL, ${t0}, ${t0})`);
    r = await call("a", "GET", "/rels");
    ok(r.status === 200 && r.data.counts.suggested === 2 && r.data.rels[0].id === s1 && r.data.rels[0].src_title === "풋옵션 " + tag && r.data.rels[0].ko === "부분", "inbox: suggestions listed with titles · Korean label · highest confidence first");
    r = await call("b", "GET", "/rels"); ok(!r.data.rels.some((x) => x.id === s1), "inbox: only my own suggestions");
    r = await call("b", "PATCH", "/rels/" + s1, { action: "confirm" }); ok(r.status === 404, "inbox: can't confirm someone else's suggestion");
    r = await call("a", "PATCH", "/rels/" + s1, { action: "confirm", rel: "example_of" });
    ok(r.status === 200 && r.data.rel.status === "confirmed" && r.data.rel.rel === "example_of" && r.data.rel.origin === "ai", "inbox: '다른 종류' confirms with the human's type");
    r = await call("a", "PATCH", "/rels/" + s2, { action: "reject" });
    ok(r.status === 200 && r.data.rel.status === "rejected", "inbox: reject");
    r = await call("a", "GET", "/rels?status=all");
    ok(!r.data.rels.some((x) => x.id === s2) && d1(`SELECT status FROM note_rel WHERE id = '${s2}'`)[0]?.status === "rejected", "inbox: rejected pair kept (never re-suggested) but hidden from lists and graph");
    r = await call("a", "DELETE", `/rels/pair?a=${n2.id}&b=${n1.id}`); ok(r.status === 200 && r.data.prev?.rel === "example_of", "rels: delete by pair (undo of a fresh relation)");
    // 새 노트 자리 제안 · 판정 기록
    r = await call("a", "GET", `/notes/${n3.id}/sort`); ok(r.status === 200 && r.data.show === false && r.data.reason === "not-root", "sort chip: only for top-level (Unsorted) notes");
    r = await call("a", "GET", `/notes/${n2.id}/sort`); ok(r.status === 200 && r.data.show === false && r.data.reason === "short", "sort chip: one-line notes never get a chip (cold-start prototypes misjudge short text)");
    r = await call("a", "GET", `/notes/${n1.id}/sort`); ok(r.status === 200 && typeof r.data.show === "boolean" && (r.data.reason === "no-ai" || (r.data.log_id && "unknown" in (r.data.probabilities || {}))), `sort chip: embed-proto over 5 concepts + unknown (${r.data.concept} ${r.data.confidence})`);
    if (r.data.log_id) {
      const lid = r.data.log_id;
      r = await call("b", "POST", `/notes/${n1.id}/sort`, { log_id: lid, picked: "AI & Dev" }); ok(r.status === 404, "sort chip: can't answer someone else's suggestion");
      r = await call("a", "POST", `/notes/${n1.id}/sort`, { log_id: lid, picked: null });
      ok(r.status === 200 && d1(`SELECT outcome FROM decide_log WHERE id = '${lid}'`)[0]?.outcome === "rejected", "sort chip: '아니요' is recorded as the human outcome");
      r = await call("a", "GET", `/notes/${n1.id}/sort`); ok(r.data.show === false && r.data.reason === "answered", "sort chip: never asked again once answered");
    }
    r = await call("a", "GET", "/decide/stats"); ok(r.status === 403, "decide stats: admins only");
    r = await call("a", "POST", "/decide/run", { questions: qx }); ok(r.status === 403, "decide run (eval API): admins only");
    await call("a", "DELETE", "/notes/" + n3.id); await call("a", "DELETE", "/notes/" + n1.id); await call("a", "DELETE", "/notes/" + n2.id);
    ok(d1(`SELECT COUNT(*) n FROM note_rel WHERE id IN ('${s1}','${s2}')`)[0].n === 0, "rels: deleting a note removes its relations");
  }
  // 경영 마이크로디그리: 카드 읽음 → 복습(1 → 3 → 7 → 21 → 60일) → 하루 기록 (모듈 · 카드 id 는 public/mba/index.json 에 있어야 해요)
  r = await call("a", "GET", "/mba/state"); ok(r.status === 200 && Array.isArray(r.data.items) && Array.isArray(r.data.due) && Array.isArray(r.data.days), "mba: state");
  r = await call("a", "PUT", "/mba/read", { module: "accounting", card: "profit-vs-revenue", correct: 2, total: 3 });
  { const it = r.data.items?.find((x) => x.module === "accounting" && x.card === "profit-vs-revenue"); ok(r.status === 200 && it?.stage === 1 && it.correct === 2 && it.due_day > r.data.today, "mba: read → stage 1, due tomorrow"); }
  r = await call("a", "PUT", "/mba/read", { module: "accounting", card: "nope" }); ok(r.status === 400, "mba: unknown card → 400");
  r = await call("a", "PUT", "/mba/read", { module: "../x", card: "profit-vs-revenue" }); ok(r.status === 400, "mba: bad module id → 400");
  r = await call("a", "PUT", "/mba/read", { module: "accounting", card: "profit-vs-revenue", correct: 4, total: 3 }); ok(r.status === 400, "mba: correct > total → 400");
  r = await call("a", "PUT", "/mba/review", { results: [{ module: "accounting", card: "profit-vs-revenue", correct: 1, total: 1 }] });
  { const it = r.data.items?.find((x) => x.card === "profit-vs-revenue"); ok(r.status === 200 && it?.stage === 2 && it.reviews === 1, "mba: review pass → stage 2 (3일 뒤)"); }
  r = await call("a", "PUT", "/mba/review", { results: [{ module: "accounting", card: "profit-vs-revenue", correct: 0, total: 1 }] });
  { const it = r.data.items?.find((x) => x.card === "profit-vs-revenue"); ok(it?.stage === 1 && it.reviews === 2 && it.due_day > r.data.today, "mba: review fail → one stage back, tomorrow"); }
  r = await call("a", "PUT", "/mba/review", { results: "x" }); ok(r.status === 400, "mba: review without list → 400");
  r = await call("a", "PUT", "/mba/day", { minutes: 12 }); r = await call("a", "PUT", "/mba/day", { minutes: 5, plan: "내일 아침 지하철에서 퀴즈" });
  { const d = r.data.days?.find((x) => x.day === r.data.today); ok(r.status === 200 && d?.minutes === 17 && d.plan === "내일 아침 지하철에서 퀴즈", "mba: day minutes add up + plan"); }
  r = await call("a", "PUT", "/mba/day", {}); ok(r.status === 400, "mba: empty day → 400");
  // 개발 흐름 마이크로디그리: 같은 모양의 /dev/* — dev_* 표에 따로 남고, 경영 기록과 섞이지 않아요
  { const di = await (await fetch(BASE + "/dev/index.json")).json(), dm = di.modules.find((m) => m.id === "security") || di.modules[0], dc = dm.cards[0].id;
    ok(di.modules.length === 12 && di.modules.every((m) => m.cards.length === 20 && m.cases.length === 2 && m.problems.length === 15), "dev: 12 modules × 20 cards · 2 cases · 15 problems");
    r = await call("a", "GET", "/dev/state"); ok(r.status === 200 && Array.isArray(r.data.items) && Array.isArray(r.data.due), "dev: state");
    r = await call("a", "PUT", "/dev/read", { module: dm.id, card: dc, correct: 1, total: 2 });
    { const it = r.data.items?.find((x) => x.module === dm.id && x.card === dc); ok(r.status === 200 && it?.stage === 1 && it.due_day > r.data.today, "dev: read → stage 1, due tomorrow"); }
    r = await call("a", "GET", "/mba/state"); ok(!r.data.items.some((x) => x.module === dm.id && x.card === dc), "dev: reads stay out of mba state");
    r = await call("a", "PUT", "/dev/read", { module: "accounting", card: "profit-vs-revenue" }); ok(r.status === 400, "dev: mba module id → 400");
    r = await call("a", "PUT", "/dev/review", { results: [{ module: dm.id, card: dc, correct: 1, total: 1 }] });
    { const it = r.data.items?.find((x) => x.card === dc && x.module === dm.id); ok(it?.stage === 2 && it.reviews === 1, "dev: review pass → stage 2"); }
    r = await call("a", "PUT", "/dev/done", { module: dm.id, item: dm.problems[0].id, kind: "problem", score: 1, total: 1 }); ok(r.status === 200 && r.data.done.some((x) => x.item === dm.problems[0].id && x.score === 1), "dev: meeting problem done");
    r = await call("a", "PUT", "/dev/done", { module: dm.id, item: "nope", kind: "case" }); ok(r.status === 400, "dev: unknown case → 400");
    r = await call("a", "PUT", "/dev/day", { minutes: 9, plan: "내일 회의실 2문제" }); { const d = r.data.days?.find((x) => x.day === r.data.today); ok(d?.minutes === 9 && d.plan === "내일 회의실 2문제", "dev: day minutes + plan"); }
    r = await call("b", "GET", "/dev/state"); ok(r.status === 200 && !r.data.items.some((x) => x.card === dc && x.module === dm.id), "dev: private per user");
    r = await call("a", "POST", "/dev/ask?stream=0", { module: dm.id, card: "week", messages: [] }); ok(r.status === 400, "dev: AI 질문 (week) without question → 400");
    r = await call("a", "POST", "/dev/ask?stream=0", { module: "nope", card: "week", messages: [{ role: "user", content: "x" }] }); ok(r.status === 400, "dev: AI 질문 (week) unknown module → 400");
    r = await call("a", "POST", "/mba/ask?stream=0", { module: "accounting", card: "week", messages: [{ role: "user", content: "x" }] }); ok(r.status === 400, "mba: no week scope (dev only) → 400"); }
  // 케이스 · 연습문제 · 강의 끝냄 (v2) — id 는 index.json 에서 골라요
  { const mi = await (await fetch(BASE + "/mba/index.json")).json(), mm = mi.modules.find((m) => m.cases?.length && m.problems?.length && m.lectures?.length);
    ok(mi.modules.every((m) => m.cards.length >= 30), "mba: every module has 30+ cards");
    if (!mm) ok(false, "mba: index has a module with cases · problems · lectures");
    else {
      const pr = mm.problems[0].id, cs = mm.cases[0].id, lc = mm.lectures[0].id;
      r = await call("a", "PUT", "/mba/done", { module: mm.id, item: pr, kind: "problem", score: 1, total: 1 });
      ok(r.status === 200 && r.data.done?.some((x) => x.item === pr && x.kind === "problem" && x.score === 1 && x.total === 1), "mba: problem done with score");
      r = await call("a", "PUT", "/mba/done", { module: mm.id, item: pr, kind: "problem", score: 0, total: 1 });
      ok(r.data.done?.filter((x) => x.item === pr).length === 1 && r.data.done.find((x) => x.item === pr).score === 0, "mba: problem retry keeps last attempt");
      r = await call("a", "PUT", "/mba/done", { module: mm.id, item: cs, kind: "case" }); ok(r.status === 200 && r.data.done?.some((x) => x.item === cs && x.kind === "case"), "mba: case done");
      r = await call("a", "PUT", "/mba/done", { module: mm.id, item: cs, kind: "case", done: false }); ok(r.status === 200 && !r.data.done?.some((x) => x.item === cs), "mba: case undo");
      r = await call("a", "PUT", "/mba/done", { module: mm.id, item: lc, kind: "lecture" }); ok(r.status === 200 && r.data.done?.some((x) => x.item === lc && x.kind === "lecture"), "mba: lecture done");
      r = await call("a", "PUT", "/mba/done", { module: mm.id, item: "nope", kind: "case" }); ok(r.status === 400, "mba: unknown item → 400");
      r = await call("a", "PUT", "/mba/done", { module: mm.id, item: pr, kind: "case" }); ok(r.status === 400, "mba: item with wrong kind → 400");
      r = await call("a", "PUT", "/mba/done", { module: mm.id, item: pr, kind: "problem", score: 2, total: 1 }); ok(r.status === 400, "mba: score > total → 400");
      r = await call("a", "PUT", "/mba/done", { module: mm.id, item: pr, kind: "quiz" }); ok(r.status === 400, "mba: bad kind → 400");
      r = await call("b", "GET", "/mba/state"); ok(r.status === 200 && !(r.data.done || []).length, "mba: done is private per user");
    }
  }
  r = await call("b", "GET", "/mba/state"); ok(r.status === 200 && !r.data.items.length && !r.data.days.length && Array.isArray(r.data.done), "mba: private per user");
  r = await call("a", "POST", "/mba/ask", { module: "accounting", card: "nope", messages: [{ role: "user", content: "?" }] }); ok(r.status === 400, "mba: ask unknown card → 400");
  r = await call("a", "POST", "/mba/ask", { module: "accounting", card: "profit-vs-revenue", messages: [] }); ok(r.status === 400, "mba: ask without question → 400");
  // 1~5순위 (1 = 가장 급함) 로도 받아요 — 저장은 예전 값 그대로
  r = await call("a", "PATCH", "/plans/" + ppid, { priority: "1" }); ok(r.status === 200 && r.data.plan.priority === "max", "plan priority: '1' → max");
  r = await call("a", "PATCH", "/plans/" + ppid, { priority: 5 }); ok(r.status === 200 && r.data.plan.priority === "low", "plan priority: 5 → low");
  r = await call("a", "PATCH", "/plans/" + ppid, { priority: 3 }); ok(r.status === 200 && r.data.plan.priority === "high", "plan priority: 3 → high");
  r = await call("a", "PATCH", "/plans/" + ppid, { priority: 0 }); ok(r.status === 400, "plan priority: 0 → 400");
  r = await call("a", "PATCH", "/plans/" + ppid, { priority: "" }); ok(r.status === 200 && r.data.plan.priority === null, "plan priority: '' clears");
  // 체크리스트 예상 시간: 시각 없이 mins 만
  // 계획 길이는 1분 단위 (예전엔 5분 미만을 막았어요)
  r = await call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-27", text: "3분 스트레칭", start: "07:03", mins: 3 }); ok(r.status === 201 && r.data.plan.mins === 3 && r.data.plan.start === "07:03", "plan mins: 3분 · 07:03 ok");
  { const sid = r.data.plan.id;
    r = await call("a", "PATCH", "/plans/" + sid, { mins: 1 }); ok(r.status === 200 && r.data.plan.mins === 1, "plan mins: 1분으로 고치기");
    await call("a", "DELETE", "/plans/" + sid); }
  r = await call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-27", text: "0분", start: "07:10", mins: 0 }); ok(r.status === 400, "plan mins: 0분 → 400");
  r = await call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-28", text: "예상 시간 있는 할 일", mins: 120, priority: 2 });
  ok(r.status === 201 && r.data.plan.start === null && r.data.plan.mins === 120 && r.data.plan.priority === "xhigh", "checklist: mins without start + priority 2");
  { const hid = r.data.plan.id;
    r = await call("a", "PATCH", "/plans/" + hid, { mins: null }); ok(r.status === 200 && r.data.plan.mins === null, "checklist: mins null clears");
    r = await call("a", "PATCH", "/plans/" + hid, { mins: 3 }); ok(r.status === 200 && r.data.plan.mins === 3, "checklist: mins 3 → 3분 (1분 단위)");
    r = await call("a", "PATCH", "/plans/" + hid, { mins: 0 }); ok(r.status === 400, "checklist: mins 0 → 400");
    await call("a", "DELETE", "/plans/" + hid); }
  r = await call("a", "PATCH", "/plans/" + ppid, { start: "14:35", mins: 5 }); ok(r.status === 200 && r.data.plan.start === "14:35" && r.data.plan.mins === 5, "plan: 5-minute slot");
  // 못함(빨간 표시): 켜면 끝냄은 꺼지고, 끝냄을 켜면 못함이 꺼지고, 다른 날로 미루면 지워져요
  r = await call("a", "PATCH", "/plans/" + ppid, { done: true }); r = await call("a", "PATCH", "/plans/" + ppid, { missed: true }); ok(r.status === 200 && r.data.plan.missed === 1 && r.data.plan.done === 0, "missed: on clears done");
  r = await call("a", "GET", "/plans?periods=" + r.data.plan.period); ok(r.data.plans.find((x) => x.id === ppid)?.missed === 1, "missed: saved");
  r = await call("a", "PATCH", "/plans/" + ppid, { done: true }); ok(r.data.plan.done === 1 && r.data.plan.missed === 0, "missed: done clears missed");
  r = await call("a", "PATCH", "/plans/" + ppid, { missed: true }); r = await call("a", "PATCH", "/plans/" + ppid, { period: "D:2031-01-02" }); ok(r.data.plan.missed === 0, "missed: moving to another day clears it");
  r = await call("a", "PUT", "/records/self", { day: "2026-09-28", self: 150 }); ok(r.status === 400, "self score: out of range → 400");
  r = await call("a", "PUT", "/records/self", { day: "2026-09-28", self: 85 }); ok(r.status === 200 && r.data.self === 85, "self score: saved 85");
  r = await call("a", "GET", "/records/recent?to=2026-09-28&days=7"); ok(r.status === 200 && Array.isArray(r.data.days) && r.data.days.every((d) => "ai_score" in d), "records/recent: returns AI score field");
  r = await call("a", "PUT", "/records/self", { day: "2026-09-28", self: null }); ok(r.status === 200 && r.data.self === null, "self score: cleared");
  r = await call("a", "GET", "/plans?days=2026-09-20..2026-09-30"); ok(r.status === 200 && r.data.plans.some((p) => p.period === "D:2026-09-28"), "plans: day range in one request");
  r = await call("a", "GET", "/plans?days=2026-01-01..2026-12-31"); ok(r.status === 200 && r.data.plans.length === 0, "plans: day range over 62 days ignored");
  await call("a", "DELETE", "/plans/" + ppid); }
r = await call("a", "POST", "/plans", { scope: "year", period: "Y:2026", text: "정보처리기사 합격" }); ok(r.status === 201, "create year plan");
r = await call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-27", text: "어제 못한 일" }); ok(r.status === 201, "create yesterday plan");
r = await call("a", "POST", "/plans", { scope: "day", period: "2026-09-28", text: "bad" }); ok(r.status === 400, "bad period rejected");
r = await call("a", "PATCH", "/plans/" + pid, { done: true }); ok(r.data.plan.done === 1, "toggle done");
if (jar.b) { r = await call("b", "PATCH", "/plans/" + pid, { done: false }); ok(r.status === 403, "other user cannot edit plan"); }
r = await call("a", "POST", "/plans/carry", { scope: "day", from: "D:2026-09-27", to: "D:2026-09-28" }); ok(r.data.moved === 1, "carry over");
r = await call("a", "GET", "/plans?periods=D:2026-09-28,Y:2026"); ok(r.data.plans.length === 3, "list plans: " + r.data.plans.length);
r = await call("a", "GET", "/plans/heatmap?year=2026"); ok(r.data.days.length === 1 && r.data.days[0].done === 1, "heatmap");
r = await call("a", "GET", "/summary?periods=D:2026-09-28"); ok(r.data.rows.length >= 1, "summary");

r = await call("a", "POST", "/logs", { day: "2026-09-28", at: "09:10", text: "단어 끝!", kind: "done" }); ok(r.status === 201, "create log");
r = await call("a", "GET", "/logs?day=2026-09-28"); ok(r.data.logs.length === 1, "list logs");

r = await call("a", "POST", "/notes", { title: "자료구조", body: "# 자료구조\n스택과 큐 #cs #자료구조\n[[알고리즘]] 참고" }); ok(r.status === 201, "create note"); const n1 = r.data.note.id;
r = await call("a", "POST", "/notes", { title: "알고리즘", body: "정렬 정리. [[자료구조]]로 돌아가기 #cs" }); ok(r.status === 201, "create note 2"); const n2 = r.data.note.id;
r = await call("a", "POST", "/notes", { title: "자료구조", body: "" }); ok(r.status === 409, "duplicate title 409");
r = await call("a", "GET", "/notes/" + n2); ok(r.data.backlinks.length === 1 && r.data.backlinks[0].id === n1, "backlinks");
r = await call("a", "GET", "/tags"); ok(r.data.tags.find((t) => t.tag === "cs")?.count === 2, "tags");
r = await call("a", "GET", "/graph"); ok(r.data.nodes.length >= 2 && r.data.edges.length >= 2, "graph");
r = await call("a", "GET", "/search?q=" + encodeURIComponent("스택")); ok(r.data.notes.some((n) => n.id === n1) && !r.data.notes.some((n) => n.id === n2), "search");
r = await call("a", "GET", "/notes/resolve?title=" + encodeURIComponent("알고리즘")); ok(r.data.id === n2, "resolve");
// v14: 그래프에서 클릭으로 연결 → 본문 끝 "## 연결" 에 [[제목]] · 끊기 · 페이지(parent_id) · 경로
r = await call("a", "POST", "/notes/" + n2 + "/link", { title: "그래프 연결" }); ok(r.status === 200 && r.data.added && /## 연결\n- \[\[그래프 연결\]\]\n$/.test(r.data.note.body), "link: appends [[title]] under ## 연결");
r = await call("a", "POST", "/notes/" + n2 + "/link", { title: "그래프 연결" }); ok(r.status === 200 && r.data.added === false, "link: same title twice → added false");
r = await call("a", "POST", "/notes/" + n2 + "/link", { title: "알고리즘" }); ok(r.status === 400, "link: self → 400");
r = await call("a", "GET", "/graph"); ok(r.data.edges.some((e) => e.src_id === n2 && e.dst_title === "그래프 연결"), "link: shows up in /graph edges");
r = await call("a", "DELETE", "/notes/" + n2 + "/link?title=" + encodeURIComponent("그래프 연결")); ok(r.status === 200 && r.data.removed && !r.data.note.body.includes("## 연결") && !r.data.note.body.includes("그래프 연결"), "unlink: removes line and empty ## 연결");
r = await call("b", "POST", "/notes/" + n2 + "/link", { title: "x" }); ok(r.status === 404, "link: other's note → 404");
r = await call("a", "POST", "/notes", { title: "하위 페이지", parent_id: n1, body: "# 하위" }); ok(r.status === 201 && r.data.note.parent_id === n1, "page: create with parent_id"); const pg = r.data.note.id;
r = await call("a", "GET", "/notes/" + pg); ok(r.data.crumbs.length === 1 && r.data.crumbs[0].id === n1, "page: crumbs");
r = await call("a", "GET", "/notes/" + n1); ok(r.data.children.length === 1 && r.data.children[0].id === pg, "page: children");
r = await call("a", "POST", "/notes", { title: "부모 없음", parent_id: "nope" }); ok(r.status === 404, "page: unknown parent → 404");
r = await call("a", "PUT", "/notes/" + pg, { parent_id: pg }); ok(r.status === 400, "page: self parent → 400");
r = await call("a", "PUT", "/notes/" + pg, { parent_id: null }); ok(r.status === 200 && r.data.note.parent_id === null, "page: move to top");
// ---------- 할 일 보드 (2026-10-24): 새 칸(칸 · 프로젝트 · 마감일 · 작은 할 일 · 메모 · 순서) · 검사 · 남의 것 · '완료' 칸 = done ----------
await section("board", async () => {
  const M = await import("../public/js/board/model.js");
  const P = (b) => call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-28", text: "보드 검사", ...b });
  let r = await P({ project: "  논문  ", due: "2026-09-30", subtasks: [{ t: " 읽기 ", d: true }, { t: "정리" }], note: "메모", status: "doing", sort: 5 });
  const bp = r.data?.plan;
  ok(r.status === 201 && bp.project === "논문" && bp.due === "2026-09-30" && bp.status === "doing" && bp.note === "메모" && bp.sort === 5 && bp.done === 0, "board: POST takes status · project · due · note · sort");
  ok(Array.isArray(bp?.subtasks) && bp.subtasks.length === 2 && bp.subtasks[0].t === "읽기" && bp.subtasks[0].d === 1 && bp.subtasks[1].d === 0, "board: subtasks trimmed + d as 0/1");
  r = await P({ status: "done" }); const bd = r.data?.plan;
  ok(r.status === 201 && bd.done === 1 && bd.done_at > 0 && bd.status === "done", "board: POST into 완료 → done 1 + done_at");
  r = await P({}); const old = r.data?.plan;
  ok(r.status === 201 && old.status === null && old.project === null && old.due === null && old.subtasks === null && old.note === null, "board: old-style POST leaves new fields empty");
  const bad = [[{ project: "x".repeat(31) }, "project > 30"], [{ due: "2026-9-1" }, "due format"], [{ subtasks: Array.from({ length: 21 }, (_, i) => ({ t: "s" + i })) }, "subtasks > 20"], [{ subtasks: ["str"] }, "subtask not object"],
    [{ subtasks: [{ t: "x".repeat(101) }] }, "subtask > 100"], [{ subtasks: [{ t: "  " }] }, "empty subtask"], [{ subtasks: { t: "a" } }, "subtasks not list"], [{ note: "x".repeat(2001) }, "note > 2000"], [{ status: "Bad Id!" }, "status format"], [{ sort: "abc" }, "sort NaN"]];
  for (const [b, why] of bad) { r = await call("a", "PATCH", "/plans/" + bp.id, b); ok(r.status === 400, "board: PATCH rejects " + why); }
  r = await P({ due: "2026-13-01" }); ok(r.status === 400, "board: POST rejects bad due");
  // '완료' 칸 ↔ done 맞추기
  r = await call("a", "PATCH", "/plans/" + bp.id, { status: "done" }); ok(r.status === 200 && r.data.plan.done === 1 && r.data.plan.done_at > 0 && r.data.plan.status === "done", "board: move into 완료 → done 1");
  r = await call("a", "PATCH", "/plans/" + bp.id, { status: "doing", sort: 7.5 }); ok(r.status === 200 && r.data.plan.done === 0 && r.data.plan.done_at === null && r.data.plan.sort === 7.5, "board: move out of 완료 → done 0 + sort saved");
  r = await call("a", "PATCH", "/plans/" + bp.id, { done: true }); ok(r.data?.plan?.status === "done" && r.data.plan.done === 1, "board: list check → status done");
  r = await call("a", "PATCH", "/plans/" + bp.id, { done: false }); ok(r.data?.plan?.status === null && r.data.plan.done === 0, "board: list uncheck → back to 할 일 (status null)");
  r = await call("a", "PATCH", "/plans/" + bp.id, { status: "done" }); r = await call("a", "PATCH", "/plans/" + bp.id, { missed: true }); ok(r.data?.plan?.status === null && r.data.plan.done === 0 && r.data.plan.missed === 1, "board: 못함 from 완료 → status cleared");
  r = await call("a", "PATCH", "/plans/" + bp.id, { missed: false, status: null, subtasks: [{ t: "a", d: 1 }, { t: "b", d: 1 }, { t: "c", d: 0 }], project: "", note: null }); ok(r.status === 200 && r.data.plan.project === null && r.data.plan.subtasks.length === 3, "board: PATCH subtasks · empty project → null");
  r = await call("a", "PATCH", "/plans/" + old.id, { done: true }); ok(r.data?.plan?.done === 1 && r.data.plan.status === "done", "board: old row check still works");
  r = await call("a", "GET", "/plans?periods=D:2026-09-28"); ok(r.status === 200 && Array.isArray(r.data.plans.find((x) => x.id === bp.id)?.subtasks), "board: GET /plans returns subtasks as a list");
  // 보드 목록: 열린 일 + 끝낸 일, 시간 있는 일정 · 못함은 빼요 · 내 것만
  const timed = (await call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-28", text: "시간 일정", start: "09:00", mins: 30 })).data.plan;
  const far = (await call("a", "POST", "/plans", { scope: "day", period: "D:2026-01-02", text: "먼 옛날", due: "2026-01-05" })).data.plan;
  const farNo = (await call("a", "POST", "/plans", { scope: "day", period: "D:2026-01-02", text: "먼 옛날 그냥" })).data.plan;
  r = await call("a", "GET", "/plans/board?since=2026-09-01&done_since=0"); const ids = (r.data?.plans || []).map((x) => x.id);
  ok(r.status === 200 && ids.includes(bp.id) && ids.includes(bd.id) && ids.includes(old.id) && ids.includes(far.id) && !ids.includes(farNo.id) && !ids.includes(timed.id), "board: GET /plans/board = open since · due/status any day · done · no timed");
  r = await call("a", "GET", "/plans/board?since=2026-09-01&done_since=" + (Date.now() + 60000)); ok(!(r.data?.plans || []).some((x) => x.id === bd.id), "board: done_since hides older done");
  r = await call("a", "GET", "/plans/board?since=bad"); ok(r.status === 400, "board: bad since 400");
  r = await call("b", "GET", "/plans/board?since=2026-01-01&done_since=0"); ok(r.status === 200 && !(r.data?.plans || []).some((x) => x.id === bp.id), "board: others can't see my board items");
  r = await call("b", "PATCH", "/plans/" + bp.id, { status: "doing" }); ok(r.status === 403, "board: others can't move my card");
  r = await call("b", "PATCH", "/plans/" + bp.id, { subtasks: [] }); ok(r.status === 403, "board: others can't edit my subtasks");
  // 칸 설정
  r = await call("a", "GET", "/plans/board/cols"); ok(r.status === 200 && r.data.cols.map((c) => c.id).join() === "todo,doing,done" && r.data.updated_at === 0, "board cols: default 할 일 · 진행 중 · 완료");
  r = await call("a", "PUT", "/plans/board/cols", { cols: [{ id: "todo", name: "할 일" }, { id: "doing", name: "진행" }] }); ok(r.status === 400, "board cols: can't remove 완료");
  r = await call("a", "PUT", "/plans/board/cols", { cols: [{ id: "todo", name: "할 일" }, { id: "todo", name: "또" }, { id: "done", name: "완료" }] }); ok(r.status === 400, "board cols: duplicate id 400");
  r = await call("a", "PUT", "/plans/board/cols", { cols: [{ id: "todo", name: "" }, { id: "done", name: "완료" }] }); ok(r.status === 400, "board cols: empty name 400");
  r = await call("a", "PUT", "/plans/board/cols", { cols: Array.from({ length: 9 }, (_, i) => ({ id: i ? (i === 8 ? "done" : "c-" + i) : "todo", name: "칸" + i })) }); ok(r.status === 400, "board cols: max 8");
  r = await call("a", "PUT", "/plans/board/cols", { tags: { 논문: "neon" } }); ok(r.status === 400, "board cols: bad tag color 400");
  r = await call("a", "PUT", "/plans/board/cols", { cols: [{ id: "todo", name: "할 것" }, { id: "doing", name: "진행 중" }, { id: "c-review", name: "검토" }, { id: "done", name: "완료" }], tags: { 논문: "violet" } });
  ok(r.status === 200 && r.data.cols.length === 4 && r.data.cols[0].name === "할 것" && r.data.tags.논문 === "violet", "board cols: rename + custom column + tag color");
  await call("a", "PATCH", "/plans/" + bp.id, { status: "c-review" });
  r = await call("a", "PUT", "/plans/board/cols", { cols: [{ id: "todo", name: "할 것" }, { id: "doing", name: "진행 중" }, { id: "done", name: "완료" }] });
  ok(r.status === 200 && r.data.moved === 1 && r.data.tags.논문 === "violet", "board cols: removing a column moves its cards (tags kept)");
  r = await call("a", "GET", "/plans?periods=D:2026-09-28"); ok(r.data.plans.find((x) => x.id === bp.id)?.status === null, "board cols: moved card is back in 할 일");
  r = await call("b", "GET", "/plans/board/cols"); ok(r.status === 200 && r.data.cols.length === 3 && r.data.cols[0].name === "할 일" && !r.data.tags.논문, "board cols: per user");
  // 계산 (화면 없이)
  const t = new Date(2026, 9, 21); // 수요일
  const L = [{ id: "1", period: "D:2026-10-21", done: 0, sort: 2 }, { id: "2", period: "D:2026-10-10", due: "2026-10-20", done: 0, status: "doing", sort: 1, project: "논문", priority: "max" },
    { id: "3", period: "D:2026-10-21", done: 1, done_at: new Date(2026, 9, 20).getTime(), status: "done", project: "영어" }, { id: "4", period: "D:2026-10-30", due: "2026-10-25", done: 0, status: "gone", subtasks: [{ t: "검토", d: 1 }, { t: "b", d: 0 }] }];
  const k = M.kpis(L, t);
  ok(k.open === 3 && k.dueWeek === 2 && k.late === 1 && k.doneWeek === 1 && k.projects === 1, "board model: KPIs (open · due this week · late · done this week)");
  const ids3 = ["todo", "doing", "done"];
  ok(M.colOf(L[0], ids3) === "todo" && M.colOf(L[1], ids3) === "doing" && M.colOf(L[2], ids3) === "done" && M.colOf(L[3], ids3) === "todo", "board model: column of a card (unknown column → 할 일)");
  ok(M.filterList(L, { range: "today" }, t).map((x) => x.id).join() === "1,2,3" && M.filterList(L, { range: "week" }, t).map((x) => x.id).join() === "1,2,3,4", "board model: 오늘 / 이번 주 (late shows in both)");
  ok(M.filterList(L, { project: "-" }, t).length === 2 && M.filterList(L, { prio: "urgent" }, t).length === 1 && M.filterList(L, { q: "검토" }, t)[0]?.id === "4" && M.filterList(L, { kpi: "late" }, t)[0]?.id === "2", "board model: project · priority · search (subtasks) · KPI filter");
  ok(M.sortBetween(1, 3) === 2 && M.sortBetween(null, 10) < 10 && M.sortBetween(10, null) > 10 && M.sortBetween(null, null, 99) === 99 && M.sortBetween(4, 4) > 4, "board model: sort between neighbours");
  ok(M.subProgress(L[3]).join("/") === "1/2" && M.tagColor("논문") === M.tagColor("논문") && M.tagColor("논문", { 논문: "teal" }) === "teal", "board model: subtask progress · stable tag colours");
  for (const x of [bp, bd, old, timed, far, farNo]) await call("a", "DELETE", "/plans/" + x.id);
});

// ---------- 노트 우클릭 메뉴 (note-menu.js) — 이름 바꾸기는 내 다른 노트의 [[링크]] 도 · 지우면 하위는 한 칸 위로 · 내 하위 아래로 옮기기는 400 ----------
await section("note-menu", async () => {
  const T = (s) => `${s} ${tag}`, OLD = T("옛 이름"), NEW = T("새 이름");
  const add = async (who, b) => (await call(who, "POST", "/notes", b)).data?.note?.id;
  const x = await add("a", { title: OLD, body: "본문" });
  const l1 = await add("a", { title: T("링크 1"), body: `앞 [[${OLD}]] 과 [[${OLD}|별칭]] · [[${OLD}#절]] · [[ ${OLD.toUpperCase()} ]] · [[${OLD} 아님]] 끝` });
  const l2 = await add("a", { title: T("링크 2"), blocks: { v: 1, blocks: [{ type: "paragraph", text: `블록 속 [[${OLD}]]` }, { type: "page", props: { note_id: x, title: OLD } }] } });
  const bo = await add("b", { title: T("남의 노트"), body: `[[${OLD}]] 은 b 의 것` });
  r = await call("a", "PUT", "/notes/" + x, { title: NEW });
  ok(r.status === 200 && r.data.note.title === NEW && r.data.relinked?.length === 2 && [l1, l2].every((id) => r.data.relinked.includes(id)), `rename: relinks my other notes (${r.data?.relinked?.length})`);
  r = await call("a", "GET", "/notes/" + l1); const b1 = r.data.note.body;
  ok(b1 === `앞 [[${NEW}]] 과 [[${NEW}|별칭]] · [[${NEW}#절]] · [[${NEW}]] · [[${OLD} 아님]] 끝`, "rename: [[old]] · [[old|alias]] · [[old#h]] · [[ OLD ]] → new title, a longer title stays");
  r = await call("a", "GET", "/notes/" + l2); const d2 = JSON.parse(r.data.note.blocks).blocks;
  ok(d2[0].text === `블록 속 [[${NEW}]]` && d2[1].props.title === NEW && r.data.note.body.includes(`[[${NEW}]]`) && !r.data.note.body.includes(OLD), "rename: block text · sub-page block title · body mirror follow");
  r = await call("a", "GET", "/notes/" + x); ok([l1, l2].every((id) => r.data.backlinks.some((y) => y.id === id)), "rename: backlinks follow (note_links refreshed)");
  r = await call("a", "GET", "/notes/" + l1 + "/versions"); const v1 = r.data.versions?.[0];
  r = v1 ? await call("a", "GET", `/notes/${l1}/versions/${v1.id}`) : { data: {} };
  ok(r.data.version?.body?.includes(`[[${OLD}|별칭]]`), "rename: linking note keeps its old text in page history");
  r = await call("b", "GET", "/notes/" + bo); ok(r.data.note.body === `[[${OLD}]] 은 b 의 것`, "rename: other users' notes untouched");
  // 지우기: 하위는 지운 노트의 부모 밑으로 (예전엔 맨 위로 흩어졌어요)
  const g = await add("a", { title: T("조부모"), body: "" }), p = await add("a", { title: T("부모"), body: "", parent_id: g });
  const c1 = await add("a", { title: T("자식 1"), body: "", parent_id: p }), c2 = await add("a", { title: T("자식 2"), body: "", parent_id: p });
  r = await call("b", "DELETE", "/notes/" + p); ok(r.status === 404, "delete: other user's note → 404");
  r = await call("a", "DELETE", "/notes/" + p);
  const par = async (id) => (await call("a", "GET", "/notes/" + id)).data?.note?.parent_id;
  ok(r.status === 200 && await par(c1) === g && await par(c2) === g, "delete: children move up to the deleted note's parent");
  r = await call("a", "DELETE", "/notes/" + p); ok(r.status === 404, "delete: twice → 404");
  // 옮기기: 내 하위 · 그 아래로는 400, 형제 밑 · 맨 위는 돼요
  const gc = await add("a", { title: T("손자"), body: "", parent_id: c1 });
  r = await call("a", "PUT", "/notes/" + g, { parent_id: c1 }); ok(r.status === 400, "move: under own child → 400");
  r = await call("a", "PUT", "/notes/" + g, { parent_id: gc }); ok(r.status === 400 && await par(g) === null, "move: under own grandchild → 400 (nothing changed)");
  r = await call("a", "PUT", "/notes/" + g, { parent_id: bo }); ok(r.status === 404, "move: under other user's note → 404");
  r = await call("a", "PUT", "/notes/" + c2, { parent_id: c1 }); ok(r.status === 200 && r.data.note.parent_id === c1, "move: under a sibling");
  r = await call("a", "PUT", "/notes/" + c1, { parent_id: null }); ok(r.status === 200 && r.data.note.parent_id === null, "move: to the top level");
  r = await call("a", "GET", "/notes/" + c1); ok(r.data.crumbs.length === 0 && r.data.children.length === 2, "move: top-level note keeps its children");
  r = await call("a", "DELETE", "/notes/" + c1); ok(r.status === 200 && await par(gc) === null && await par(c2) === null, "delete: children of a top-level note become top-level");
});
// ---------- 블록 노트 (docs/blocks-schema.md): 블록 저장 → body 마크다운 사본 · 링크 · 태그 ----------
await section("blocks", async () => {
  const doc = { v: 1, blocks: [
    { id: "b_1", type: "h2", text: "블록 제목", props: {}, children: [] },
    { id: "b_2", type: "toggle", text: "접기", props: {}, children: [{ id: "b_3", type: "paragraph", text: "안쪽 [[자료구조]] #블록태그", props: {}, children: [] }] },
    { id: "b_4", type: "callout", text: "팁", props: { icon: "🔥" }, children: [] },
  ] };
  r = await call("a", "POST", "/notes", { title: "블록 노트 " + tag, blocks: doc });
  const bn = r.data?.note?.id;
  ok(r.status === 201 && /<details><summary>접기<\/summary>/.test(r.data.note.body) && /> \[!note\] 🔥 팁/.test(r.data.note.body), "blocks: create → body mirror (toggle · callout)");
  r = await call("a", "GET", "/notes/" + n1); ok(r.data.backlinks.some((x) => x.id === bn), "blocks: [[link]] inside a toggle indexed as backlink");
  r = await call("a", "GET", "/notes/" + bn); ok(r.data.tags.includes("블록태그") && JSON.parse(r.data.note.blocks).blocks.length === 3 && r.data.note.kind === "page", "blocks: GET returns blocks · kind · tags");
  const base = r.data.note.updated_at;
  doc.blocks[1].children[0].text = "링크 없음";
  r = await call("a", "PUT", "/notes/" + bn, { blocks: doc, base_updated_at: base }); ok(r.status === 200 && !/자료구조/.test(r.data.note.body), "blocks: PUT regenerates mirror");
  r = await call("a", "GET", "/notes/" + n1); ok(!r.data.backlinks.some((x) => x.id === bn), "blocks: removed link un-indexed");
  r = await call("a", "PUT", "/notes/" + bn, { blocks: doc, base_updated_at: base }); ok(r.status === 409 && r.data.note?.id === bn, "blocks: stale base_updated_at → 409");
  r = await call("a", "PUT", "/notes/" + bn, { blocks: { v: 1, blocks: [{ type: "divider", children: [{ type: "paragraph" }] }] } }); ok(r.status === 400, "blocks: children on divider → 400");
  r = await call("a", "PUT", "/notes/" + bn, { blocks: { v: 1, blocks: [{ type: "nope" }] } }); ok(r.status === 400, "blocks: unknown type → 400");
  r = await call("a", "PUT", "/notes/" + bn, { blocks: { v: 2, blocks: [] } }); ok(r.status === 400, "blocks: bad version → 400");
  r = await call("a", "PUT", "/notes/" + bn, { body: "그냥 마크다운" }); ok(r.status === 200 && r.data.note.blocks === null, "blocks: markdown save drops blocks");
  r = await call("a", "PUT", "/notes/" + bn, { blocks: doc }); r = await call("a", "POST", "/notes/" + bn + "/link", { title: "알고리즘" });
  r = await call("a", "GET", "/notes/" + bn); ok(r.data.note.blocks === null && /\[\[알고리즘\]\]/.test(r.data.note.body), "blocks: body-only write elsewhere drops stale blocks");
  // 색 (schema v2): 글자 색 · 형광펜은 text 안 태그 그대로, 블록 색은 props.color
  r = await call("a", "POST", "/notes", { title: "색 노트 " + tag, blocks: { v: 1, blocks: [{ type: "paragraph", text: 'a <span class="c-red">빨강</span> <mark class="bg-yellow">노랑</mark>', props: { color: "blue_background" } }, { type: "h2", text: "x", props: { color: "hotpink" } }] } });
  { const bl = JSON.parse(r.data.note.blocks).blocks; ok(r.status === 201 && /<span class="c-red">빨강<\/span>/.test(r.data.note.body) && bl[0].props.color === "blue_background" && !bl[1].props.color, "colors: inline spans kept in mirror · block color kept · bad color dropped"); }
  // 데이터베이스: 만들기 · 행(하위 노트 + props) · 스키마 · 보기
  r = await call("a", "POST", "/notes", { title: "할 일 DB " + tag, kind: "database" });
  const db = r.data?.note?.id, schema = r.data?.note?.db ? JSON.parse(r.data.note.db) : null;
  ok(r.status === 201 && r.data.note.kind === "database" && schema.props[0].type === "status" && schema.views.some((v) => v.type === "board"), "db: create with default schema + table/board views");
  r = await call("a", "POST", "/notes", { title: "제목 없음", parent_id: db, props: { status: "진행 중", date: "2026-10-13", tags: ["a", "b"], bogus: 1 }, unique_title: true });
  const row1 = r.data?.note?.id;
  ok(r.status === 201 && JSON.parse(r.data.note.props).status === "진행 중" && !("bogus" in JSON.parse(r.data.note.props)), "db: create row with props (unknown keys dropped)");
  r = await call("a", "POST", "/notes", { title: "제목 없음", parent_id: db, unique_title: true }); const row2 = r.data?.note?.id;
  ok(r.status === 201 && r.data.note.title !== "제목 없음", "db: unique_title adds a suffix");
  r = await call("a", "PUT", "/notes/" + row1, { props: { status: "완료", date: "bad" } }); const p1 = JSON.parse(r.data.note.props);
  ok(r.status === 200 && p1.status === "완료" && p1.date === "2026-10-13" && p1.tags.length === 2, "db: update row props (merge, bad date ignored)");
  r = await call("a", "GET", "/notes/" + db); ok(r.data.children.length === 2 && r.data.children.some((c) => c.props && JSON.parse(c.props).status === "완료") && /\| \[\[제목 없음\]\] \| 완료 \|/.test(r.data.note.body), "db: GET returns rows · body mirror table");
  r = await call("a", "PUT", "/notes/" + n1, { props: { status: "완료" } }); ok(r.status === 400, "db: props on a non-row → 400");
  schema.views.push({ id: "v3", name: "By status", type: "board", group_by: "status" });
  schema.props.push({ key: "done", name: "Done", type: "checkbox" });
  r = await call("a", "PUT", "/notes/" + db, { db: schema }); ok(r.status === 200 && JSON.parse(r.data.note.db).views.length === 3, "db: edit schema / views");
  schema.views[0].filters = [{ prop: "status", op: "is", value: "완료" }, { prop: "nope", op: "is", value: "x" }, { prop: "title", op: "bogus" }, { prop: "title", op: "is_not_empty" }];
  schema.views[0].sorts = [{ prop: "date", dir: "desc" }]; schema.views[0].group_by = "tags";
  schema.views.push({ id: "vc", name: "Cal", type: "calendar" });
  r = await call("a", "PUT", "/notes/" + db, { db: schema }); { const v = JSON.parse(r.data.note.db).views; ok(v[0].filters.length === 2 && v[0].filters[1].op === "not_empty" && v[0].sorts[0].dir === "desc" && v[0].group_by === "tags" && v.find((x) => x.id === "vc")?.date_prop === "date", "db: view filters (bad ones dropped) · sorts · table group · calendar date_by saved"); }
  { const { applyView } = await import("../public/js/blocks/md.js"); /* same function as dbview.js (re-export) */ const sc = JSON.parse(r.data.note.db); const rs = [{ title: "a", props: { status: "완료", date: "2026-01-02" } }, { title: "b", props: { status: "시작 전" } }, { title: "c", props: { status: "완료", date: "2026-03-01" } }];
    ok(applyView(rs, sc, sc.views[0]).map((x) => x.title).join() === "c,a", "db: applyView filters AND + sorts"); }
  r = await call("a", "GET", "/notes"); ok(!r.data.notes.some((x) => x.id === row1) && r.data.notes.some((x) => x.id === db), "db: rows hidden from the notes list (shown under their DB)");
  r = await call("a", "PUT", "/notes/" + db, { db: { props: [{ key: "Bad Key", type: "text" }] } }); ok(r.status === 400, "db: bad prop key → 400");
  r = await call("a", "DELETE", "/notes/" + row2); r = await call("a", "GET", "/notes/" + db); ok(r.data.children.length === 1, "db: delete row");
  r = await call("b", "PUT", "/notes/" + row1, { props: { status: "시작 전" } }); ok(r.status === 404, "db: other user cannot edit rows");
  // 보기: 필터 · 정렬 · 묶기 · 달력 (서버가 검증해요)
  const s2 = JSON.parse((await call("a", "GET", "/notes/" + db)).data.note.db);
  s2.views[0].filters = [{ prop: "status", op: "is", value: "완료" }, { prop: "date", op: "after", value: "2026-01-01" }, { prop: "status", op: "gt", value: 3 }, { prop: "nope", op: "is", value: "x" }, { prop: "date", op: "before", value: "bad" }];
  s2.views[0].sorts = [{ prop: "date", dir: "desc" }, { prop: "title", dir: "up" }, { prop: "date", dir: "asc" }];
  s2.views[0].group_by = "tags";
  s2.views.push({ id: "cal", name: "Calendar", type: "calendar", date_prop: "date" }, { id: "cal2", name: "C2", type: "calendar", date_prop: "status" });
  r = await call("a", "PUT", "/notes/" + db, { db: s2 }); const vs = JSON.parse(r.data?.note?.db || "{}").views || [];
  ok(r.status === 200 && JSON.stringify(vs[0].filters) === JSON.stringify([{ prop: "status", op: "is", value: "완료" }, { prop: "date", op: "after", value: "2026-01-01" }])
    && JSON.stringify(vs[0].sorts) === JSON.stringify([{ prop: "date", dir: "desc" }, { prop: "title", dir: "asc" }]) && vs[0].group_by === "tags", "db views: filters/sorts/group saved, bad ones dropped");
  ok(vs.find((v) => v.id === "cal")?.date_prop === "date" && vs.find((v) => v.id === "cal2")?.date_prop === "date", "db views: calendar date_prop validated (non-date → first date prop)");
  r = await call("a", "GET", "/notes/" + db); ok(JSON.parse(r.data.note.db).views[0].filters.length === 2, "db views: persisted");
  const rows = [{ id: 1, title: "b", props: { status: "완료", date: "2026-03-01" } }, { id: 2, title: "a", props: { status: "완료", date: "2026-05-01" } }, { id: 3, title: "c", props: { status: "시작 전", date: "2026-06-01" } }, { id: 4, title: "d", props: { status: "완료" } }];
  const shown = applyView(rows, JSON.parse(r.data.note.db), JSON.parse(r.data.note.db).views[0]).map((x) => x.id);
  ok(shown.join() === "2,1", "db views: applyView filters (AND) + sorts → " + shown.join());
  ok(applyView(rows, { props: s2.props }, { sorts: [{ prop: "date", dir: "asc" }] }).map((x) => x.id).join() === "1,2,3,4", "db views: empty values sort last");
  // 달력에서 카드를 다른 날로 옮기면 날짜 속성이 바뀌어요
  r = await call("a", "PUT", "/notes/" + row1, { props: { date: "2026-10-20" } }); ok(r.status === 200 && JSON.parse(r.data.note.props).date === "2026-10-20", "db calendar: move card → date prop updated");
  // 알림: props._remind → remind_at, 크론(매시) 이 보내고, 서비스 워커가 한 번만 가져가요
  ok(remindAt({ date: "2026-10-20", _remind: { prop: "date", time: "09:00" } }) === Date.parse("2026-10-20T00:00:00Z"), "reminder: remind_at = date + time in KST");
  const T0 = Date.parse("2026-10-20T00:00:00Z");
  ok(isDue({ remind_at: T0 }, T0 + 1) && !isDue({ remind_at: T0 }, T0 - 1) && !isDue({ remind_at: T0, reminded_at: 1 }, T0 + 1) && !isDue({ remind_at: T0 }, T0 + 27 * 3600e3), "reminder: due selection (past · unsent · not too late)");
  r = await call("a", "PUT", "/notes/" + row1, { props: { _remind: { prop: "date", time: "09:00" } } });
  ok(r.status === 200 && r.data.note.remind_at === T0 && JSON.parse(r.data.note.props)._remind.time === "09:00", "reminder: saved on row");
  r = await call("a", "PUT", "/notes/" + row1, { props: { _remind: { prop: "status", time: "09:00" } } }); ok(!JSON.parse(r.data.note.props)._remind && r.data.note.remind_at === null, "reminder: non-date prop rejected (cleared)");
  r = await call("a", "PUT", "/notes/" + row1, { props: { _remind: { prop: "date", time: "25:99" } } }); ok(JSON.parse(r.data.note.props)._remind.time === "09:00", "reminder: bad time → 09:00");
  r = await call("a", "POST", "/reminders/run?now=" + (T0 - 1000)); ok(r.status === 200 && !(r.data.sent > 0 && (await call("a", "POST", "/reminders/take")).data.reminders.some((x) => x.id === row1)), "reminder: not sent before time");
  r = await call("a", "POST", "/reminders/run?now=" + (T0 + 60e3)); ok(r.status === 200 && r.data.sent >= 1, "reminder: cron sends when due");
  r = await call("a", "POST", "/reminders/take"); ok(r.data.reminders.some((x) => x.id === row1 && x.date === "2026-10-20" && x.db_title === "할 일 DB " + tag), "reminder: owner takes it once");
  r = await call("a", "POST", "/reminders/take"); ok(!r.data.reminders.some((x) => x.id === row1), "reminder: not delivered twice");
  r = await call("b", "POST", "/reminders/take"); ok(!r.data.reminders.some((x) => x.id === row1), "reminder: other user never sees it");
  r = await call("a", "POST", "/reminders/run?now=" + (T0 + 120e3)); ok(!r.data.sent, "reminder: cron does not resend");
});
r = await call("a", "POST", "/ai/ask", { note_id: n1, question: "" }); ok(r.status === 400, "ai/ask: empty question → 400");
r = await call("a", "POST", "/ai/plan", { messages: [] }); ok(r.status === 400, "ai/plan: no messages → 400");
r = await call("a", "POST", "/ai/command", { text: "" }); ok(r.status === 400, "ai/command: empty → 400");
// 이미지 붙이기: 형식이 틀리거나 너무 많으면 AI 를 부르기 전에 400
const BAD_IMG = ["data:text/plain;base64,QUJD"];
r = await call("a", "POST", "/ai/command", { text: "넣어 줘", images: BAD_IMG }); ok(r.status === 400, "images: ai/command bad type → 400");
r = await call("a", "POST", "/ai/ask", { note_id: n1, question: "뭐야", images: BAD_IMG }); ok(r.status === 400, "images: ai/ask bad type → 400");
r = await call("a", "POST", "/ai/generate", { topic: "x", images: BAD_IMG }); ok(r.status === 400, "images: ai/generate bad type → 400");
r = await call("a", "POST", "/ai/plan", { messages: [{ role: "user", content: "계획" }], images: BAD_IMG }); ok(r.status === 400, "images: ai/plan bad type → 400");
r = await call("a", "POST", "/ai/chat", { message: "뭐야", images: Array(5).fill("data:image/png;base64,iVBORw0KGgo=") }); ok(r.status === 400, "images: ai/chat more than 4 → 400");
r = await call("a", "POST", "/ai/generate", { topic: "" }); ok(r.status === 400, "ai/generate: no topic and no image → 400");
r = await call("a", "GET", "/push/key"); ok(r.status === 200 && ("key" in r.data), "push/key: returns key or null");
r = await call("a", "POST", "/push/subscribe", { endpoint: "http://bad", keys: {} }); ok(r.status === 400, "push/subscribe: non-https endpoint → 400");
r = await call("a", "POST", "/push/subscribe", { endpoint: "https://push.example.test/sub/abc", keys: { p256dh: "x", auth: "y" } }); ok(r.status === 200, "push/subscribe: saved");
r = await call("a", "DELETE", "/push/subscribe", { endpoint: "https://push.example.test/sub/abc" }); ok(r.status === 200, "push/subscribe: removed");
if (jar.b) {
  r = await call("b", "GET", "/notes/" + n1); ok(r.status === 404, "private note hidden from b");
  await call("a", "PUT", "/notes/" + n1, { shared: true });
  r = await call("b", "GET", "/notes/" + n1); ok(r.status === 404, "note stays private even if shared (charts only between members)");
  r = await call("b", "PUT", "/notes/" + n1, { body: "hack" }); ok(r.status === 403 || r.status === 404, "b cannot edit a's note");
}
r = await call("a", "POST", "/logs", { day: "2026-09-28", at: "10:00", text: "집중 25분", kind: "focus", mins: 25 });
r = await call("a", "GET", "/logs/focus?from=2026-09-28&to=2026-09-28"); ok(r.data.days.some((d) => d.mins === 25), "focus minutes");

// ---- Dock customize (per account) ----
r = await call("a", "PUT", "/custom/" + encodeURIComponent("nav:brain"), { css: ".host-brain{opacity:.9}", js: "" }); ok(r.data.custom?.slot === "nav:brain", "custom saved");
r = await call("a", "GET", "/custom"); ok(r.data.custom.some((x) => x.slot === "nav:brain" && x.css.includes("opacity")), "custom read");
r = await call("b", "GET", "/custom"); ok(!r.data.custom.some((x) => x.slot === "nav:brain"), "custom private to owner");
r = await call("a", "PUT", "/custom/" + encodeURIComponent("evil slot"), { css: "x" }); ok(r.status === 400, "bad custom slot rejected");
r = await call("a", "DELETE", "/custom/" + encodeURIComponent("nav:brain")); r = await call("a", "GET", "/custom"); ok(!r.data.custom.length, "custom reset");
r = await call("a", "GET", "/files/notion-missing.png"); ok(r.status === 404, "missing file 404");
r = await call("x", "GET", "/files/notion-missing.png"); ok(r.status === 401, "files need login");
// ---- note attachments (raw PUT body, owner-only read, risky types as attachment) ----
await section("note-files", async () => {
  const raw = (who, method, path, body, type) => fetch(BASE + "/api" + path, { method, headers: { "content-type": type, "x-trio": "1", cookie: jar[who] || "" }, body });
  const nid = (await call("a", "POST", "/notes", { title: "smoke-files " + Date.now(), body: "" })).data.note.id;
  let f = await raw("b", "PUT", `/notes/${nid}/files?name=a.txt`, "hi", "text/plain"); ok(f.status === 404, "note file: other user can't upload to my note");
  f = await raw("a", "PUT", `/notes/${nid}/files?name=x.svg`, '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>', "image/svg+xml");
  const svg = await f.json(); ok(f.status === 201 && !svg.image, "note file: svg uploaded, not inline");
  f = await raw("a", "GET", svg.src.slice(4)); ok(f.headers.get("content-type") === "application/octet-stream" && /^attachment/.test(f.headers.get("content-disposition")) && f.headers.get("x-content-type-options") === "nosniff", "note file: svg served as attachment");
  f = await raw("b", "GET", svg.src.slice(4)); ok(f.status === 404, "note file: other user can't read");
  f = await raw("b", "GET", "/files/" + svg.src.split("/").pop()); ok(f.status === 404, "note file: not readable via /files");
  f = await raw("a", "PUT", `/notes/${nid}/files?name=big.bin`, new Uint8Array(25 * 1024 * 1024 + 1), "application/octet-stream"); ok(f.status === 413, "note file: >25MB → 413");
  await call("a", "DELETE", "/notes/" + nid);
});
// ---- diary ----
r = await call("a", "PUT", "/diary", { day: "2026-09-28", mood: 4, body: "오늘은 괜찮았다" }); ok(r.data.diary?.mood === 4, "diary saved");
r = await call("a", "GET", "/diary?day=2026-09-28"); ok(r.data.diary?.body === "오늘은 괜찮았다", "diary read");
r = await call("b", "GET", "/diary?day=2026-09-28"); ok(r.data.diary === null, "diary private to owner");
r = await call("a", "PUT", "/diary", { day: "2026-09-28", mood: 9 }); ok(r.status === 400, "bad mood rejected");
r = await call("a", "GET", "/diary/list"); ok(r.data.entries.length === 1, "diary list");
// 일기 친구: 같은 팀이어도 아이디로 초대하고 상대가 수락하기 전엔 서로의 일기를 못 봐요
await section("diary", async () => {
  const ida = (await call("a", "GET", "/me")).data.user.id, idb = (await call("b", "GET", "/me")).data.user.id, D = "2026-09-29";
  await call("b", "PUT", "/diary", { day: D, mood: 3, body: "b 의 공개 일기", shared: true });
  r = await call("a", "GET", `/diary/of?user=${idb}&day=${D}`); ok(r.status === 403, "diary friends: same team without invite → 403");
  r = await call("a", "POST", "/diary/invite", { username: "t_a" + tag }); ok(r.status === 400, "diary friends: can't invite yourself");
  r = await call("a", "POST", "/diary/invite", { username: "nobody" + tag }); ok(r.status === 404, "diary friends: unknown id → 404");
  r = await call("a", "POST", "/diary/invite", { username: "T_B" + tag }); ok(r.status === 201 && r.data.pending === true && r.data.locked === false, "diary friends: invite by id (any case) → pending");
  r = await call("b", "GET", "/diary/circle"); ok(r.data.invites.incoming.some((x) => x.id === ida && x.at > 0) && r.data.members.length === 1 && r.data.members[0].id === idb, "diary friends: invitee sees the invite, not a friend yet");
  r = await call("a", "GET", "/diary/circle"); ok(r.data.invites.outgoing.some((x) => x.id === idb), "diary friends: inviter sees it waiting");
  r = await call("a", "GET", `/diary/of?user=${idb}&day=${D}`); ok(r.status === 403, "diary friends: still 403 while pending");
  r = await call("a", "POST", `/diary/invite/${idb}/accept`); ok(r.status === 404, "diary friends: inviter can't accept their own invite");
  r = await call("b", "POST", `/diary/invite/${ida}/accept`); ok(r.status === 200, "diary friends: invitee accepts");
  r = await call("a", "GET", `/diary/of?user=${idb}&day=${D}`); ok(r.data.diary?.body === "b 의 공개 일기", "diary friends: friend reads a shared day");
  r = await call("b", "GET", `/diary/of?user=${ida}&day=2026-09-28`); ok(r.status === 200 && r.data.diary?.private === true && r.data.diary.body === undefined, "diary friends: unshared day shows a lock only");
  r = await call("a", "POST", "/diary/invite", { username: "t_b" + tag }); ok(r.status === 409, "diary friends: already friends → 409");
  r = await call("b", "DELETE", `/diary/link/${ida}`); ok(r.status === 200, "diary friends: either side can unlink");
  r = await call("a", "GET", `/diary/of?user=${idb}&day=${D}`); ok(r.status === 403, "diary friends: 403 again after unlink");
  await call("b", "POST", "/diary/invite", { username: "t_a" + tag });
  r = await call("a", "POST", "/diary/invite", { username: "t_b" + tag }); ok(r.data.accepted === true, "diary friends: inviting each other connects at once");
  await call("a", "DELETE", `/diary/link/${idb}`);
  await call("b", "PUT", "/diary", { day: D, mood: null, body: "" });
});

// ---- 서로는 차트만 + 하루 기록 ----
await section("peers", async () => {
  const me = (await call("a", "GET", "/me")).data.user;
  const pp = (await call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-28", text: "a만 아는 계획", start: "08:00", mins: 30 })).data.plan;
  r = await call("b", "GET", `/plans?periods=D:2026-09-28&user=${me.id}`); ok(r.data.plans.some((p) => p.id === pp.id && p.text === "a만 아는 계획"), "b sees a's open plans with text (plans_open, 9a605b7)");
  // 닫아 두면(plans_open = false) 친구에게는 빈 목록 + closed — 예전 '모양만 보기' 검사를 이걸로 바꿨어요 (2026-10-26)
  await call("a", "PATCH", "/me", { plans_open: false });
  r = await call("b", "GET", `/plans?periods=D:2026-09-28&user=${me.id}`); ok(r.data.closed === true && r.data.plans.length === 0, "b sees nothing when a's plans are closed");
  await call("a", "PATCH", "/me", { plans_open: true });
  r = await call("b", "GET", `/logs?day=2026-09-28&user=${me.id}`); ok(r.status === 403, "b cannot read a's logs");
  // 연간 히트맵도 계획을 닫아 둔(not open) 친구 것은 못 봐요 (GET /plans 와 같은 규칙)
  r = await call("b", "GET", `/plans/heatmap?year=2026&user=${me.id}`); ok(r.status === 200 && !r.data.closed && r.data.days.some((d) => d.period === "D:2026-09-28"), "heatmap: b sees a's daily counts while open");
  await call("a", "PATCH", "/me", { plans_open: false });
  r = await call("b", "GET", `/plans/heatmap?year=2026&user=${me.id}`); ok(r.status === 200 && r.data.closed === true && r.data.days.length === 0, "heatmap: closed plans → no counts for b");
  r = await call("a", "GET", "/plans/heatmap?year=2026"); ok(r.status === 200 && r.data.days.some((d) => d.period === "D:2026-09-28"), "heatmap: a still sees own counts while closed");
  await call("a", "PATCH", "/me", { plans_open: true });
  r = await call("a", "POST", "/records", { day: "2026-09-28" }); ok(r.status === 200 && r.data.record.total >= 1, "a saves a day record");
  r = await call("a", "GET", "/records?day=2026-09-28"); ok(r.data.record?.data.plans.some((p) => p.text === "a만 아는 계획"), "record keeps plan text for owner");
  // 못함으로 표시한 계획은 하루 기록에도 missed 로 남아야 AI 채점이 '못함'으로 읽어요 (예전엔 빠졌어요)
  await call("a", "PATCH", `/plans/${pp.id}`, { missed: true });
  await call("a", "POST", "/records", { day: "2026-09-28" });
  r = await call("a", "GET", "/records?day=2026-09-28"); ok(r.data.record?.data.plans.find((p) => p.text === "a만 아는 계획")?.missed === true, "record keeps missed flag (AI score reads 못함)");
  await call("a", "PATCH", `/plans/${pp.id}`, { missed: false });
  r = await call("b", "GET", "/records?day=2026-09-28"); ok(r.data.record === null, "b cannot see a's record");
  r = await call("a", "GET", "/records/days?year=2026"); ok(r.data.days.some((d) => d.day === "2026-09-28"), "record days list");
});

// ---- 영어 (ENGLISH-OS) ----
await section("english", async () => {
  const D = "2026-09-29";
  r = await call("a", "PUT", "/english/day", { day: D, blocks: { words: 55, sound: 30, speak: 70, recall: 20 }, checks: [true, false, true], newwords: 32, mistakes: 3, mood: "좋음", sentence: "I just moved here from Korea.", note: "첫날" });
  ok(r.status === 200 && r.data.day?.minutes === 175 && r.data.day?.spoken === 100, "english day: minutes/spoken computed by server");
  r = await call("a", "PUT", "/english/day", { day: "2026-10-03", blocks: { words: 70, sound: 45, speak: 120, pattern: 40, review: 25 } });
  ok(r.data.day?.minutes === 300 && r.data.day?.blocks.pattern === 40 && r.data.day?.blocks.recall === 0, "english weekend day keeps extra blocks");
  r = await call("a", "PUT", "/english/day", { day: D, mood: "최고" }); ok(r.status === 400, "english bad mood rejected");
  r = await call("a", "PUT", "/english/day", { day: D, blocks: { words: 601 } }); ok(r.status === 400, "english block > 600 rejected");
  r = await call("a", "PUT", "/english/day", { day: D, note: "x".repeat(2001) }); ok(r.status === 400, "english long note rejected");
  r = await call("a", "GET", "/english/day?day=" + D); ok(r.data.day?.sentence === "I just moved here from Korea." && r.data.day?.checks[2] === true, "english day read back");
  r = await call("b", "GET", "/english/day?day=" + D); ok(r.status === 200 && r.data.day === null, "english day private to owner");
  r = await call("a", "GET", "/english/days?from=2026-09-28&to=2026-10-05");
  ok(r.data.days?.length === 2 && r.data.days[0].day === D && r.data.days[1].minutes === 300, "english days range");
  r = await call("a", "GET", "/english/days?from=2026-01-01&to=2027-03-01"); ok(r.status === 400, "english days range > 400 rejected");
  r = await call("a", "PUT", "/english/day", { day: "2026-10-03", blocks: {}, checks: [false] }); ok(r.data.day === null, "english empty day deletes row");
  r = await call("a", "GET", "/english/days?from=2026-09-28&to=2026-10-05"); ok(r.data.days.length === 1, "english deleted day gone");

  r = await call("a", "POST", "/english/phrases", { day: D, ko: "그거 제가 할게요", en: "I'll take care of it.", chunk: "take care of it" });
  ok(r.status === 201 && r.data.phrase?.id, "english phrase added"); const ph = r.data.phrase?.id;
  r = await call("a", "POST", "/english/phrases", { en: "no korean" }); ok(r.status === 400, "english phrase needs ko");
  await call("a", "POST", "/english/phrases", { ko: "두 번째" });
  r = await call("a", "GET", "/english/phrases"); ok(r.data.phrases?.length === 2 && r.data.phrases[0].ko === "두 번째", "english phrases newest first");
  r = await call("b", "GET", "/english/phrases"); ok(r.data.phrases?.length === 0, "english phrases private");
  r = await call("b", "DELETE", "/english/phrases/" + ph); ok(r.status === 404, "b cannot delete a's phrase");
  r = await call("a", "DELETE", "/english/phrases/" + ph); ok(r.status === 200, "english phrase deleted");
  r = await call("a", "GET", "/english/phrases"); ok(r.data.phrases.length === 1, "english phrase list after delete");

  const review = (result, today = D, card_id = "s:12") => call("a", "POST", "/english/cards/review", { card_id, result, today });
  r = await review("good"); ok(r.data.card?.box === 1 && r.data.card?.due === "2026-09-30", "leitner good: box 1, due +1");
  r = await review("good"); ok(r.data.card?.box === 2 && r.data.card?.due === "2026-10-01", "leitner good: box 2, due +2");
  for (let i = 0; i < 4; i++) r = await review("good");
  ok(r.data.card?.box === 5 && r.data.card?.due === "2026-10-14" && r.data.card?.reps === 6, "leitner caps at box 5, due +15");
  r = await review("again", "2026-10-14"); ok(r.data.card?.box === 1 && r.data.card?.due === "2026-10-15" && r.data.card?.reps === 7, "leitner again: back to box 1");
  r = await review("meh"); ok(r.status === 400, "leitner bad result rejected");
  r = await review("good", D, "x".repeat(41)); ok(r.status === 400, "leitner card id > 40 rejected");
  r = await call("a", "GET", "/english/cards"); ok(r.data.cards?.length === 1 && r.data.cards[0].card_id === "s:12", "english cards list");
  r = await call("b", "GET", "/english/cards"); ok(r.data.cards?.length === 0, "english cards private");
  r = await fetch(BASE + "/english/data.json"); const ed = await r.json().catch(() => null);
  ok(r.status === 200 && ed?.sentences?.length === 60 && ed?.patterns?.length === 91, "english data.json served");
});

// ---- 캘린더: 날짜별 할 일 · 하루 한 페이지 ----
await section("calendar", async () => {
  const F = "2027-01-15";
  let r = await call("a", "POST", "/plans", { scope: "day", period: "D:" + F, text: "캘린더 할 일", start: "09:30" });
  const pid = r.data.plan?.id;
  await call("a", "POST", "/plans", { scope: "day", period: "D:" + F, text: "두 번째 할 일" });
  await call("a", "PATCH", "/plans/" + pid, { done: true });
  await call("a", "POST", "/logs", { day: F, at: "10:00", text: "집중", kind: "focus", mins: 40 });
  await call("a", "PUT", "/diary", { day: F, mood: 4, body: "캘린더 일기" });
  r = await call("a", "GET", `/calendar?from=2027-01-01&to=2027-01-31`);
  const c = r.data.days?.[F];
  ok(r.status === 200 && c?.total === 2 && c?.done === 1 && c?.todos[0]?.text === "캘린더 할 일" && c?.focus === 40 && c?.mood === 4, "calendar month: todos, done, focus, diary per day");
  r = await call("a", "GET", "/calendar/day?day=" + F);
  ok(r.status === 200 && r.data.plans?.length === 2 && r.data.logs?.length === 1 && r.data.diary?.body === "캘린더 일기", "calendar day page bundles plans, logs, diary");
  r = await call("b", "GET", `/calendar?from=2027-01-01&to=2027-01-31`); ok(r.status === 200 && !r.data.days?.[F], "calendar private to owner");
  r = await call("b", "GET", "/calendar/day?day=" + F); ok(r.data.plans?.length === 0 && !r.data.diary, "calendar day private to owner");
  r = await call("a", "GET", "/calendar?from=2027-01-01&to=2027-03-31"); ok(r.status === 400, "calendar range > 43 days rejected");
  r = await call("a", "GET", "/calendar/day?day=2027-02-30"); ok(r.status === 400, "calendar impossible date rejected");
});

// ---- 할 일별 집중 (logs.plan_id → plans.focus_mins) · 주간 회고 숫자 ----
await section("focus", async () => {
  const W = "2027-W10", D1 = "2027-03-08", D2 = "2027-03-09";
  const aid = (await call("a", "GET", "/me")).data.user.id, bid = (await call("b", "GET", "/me")).data.user.id;
  const p1 = (await call("a", "POST", "/plans", { scope: "day", period: "D:" + D1, text: "회고용 할 일", start: "09:00", mins: 60 })).data.plan.id;
  await call("a", "POST", "/plans", { scope: "day", period: "D:" + D2, text: "못 끝낸 일" });
  await call("a", "PATCH", "/plans/" + p1, { done: true });
  r = await call("a", "POST", "/logs", { day: D1, at: "09:00", text: "집중", kind: "focus", mins: 30, plan_id: p1 });
  ok(r.status === 201 && r.data.log?.plan_id === p1, "log carries plan_id");
  await call("a", "POST", "/logs", { day: D2, at: "10:00", text: "집중", kind: "focus", mins: 15, plan_id: p1 });
  await call("a", "POST", "/logs", { day: "2027-03-10", at: "11:00", text: "메모만", kind: "note" });
  r = await call("a", "POST", "/logs", { day: D1, at: "12:00", text: "x", kind: "focus", mins: 5, plan_id: "no-such-plan" }); ok(r.status === 400, "log with unknown plan_id rejected (400)");
  r = await call("a", "POST", "/logs", { day: D1, at: "12:00", text: "x", kind: "focus", mins: 5, plan_id: 123 }); ok(r.status === 400, "log with non-string plan_id rejected (400)");
  r = await call("b", "POST", "/logs", { day: D1, at: "12:00", text: "x", kind: "focus", mins: 5, plan_id: p1 }); ok(r.status === 403, "log on someone else's plan rejected (403)");
  r = await call("a", "GET", `/plans?periods=D:${D1},D:${D2}`);
  ok(r.data.plans.find((p) => p.id === p1)?.focus_mins === 45 && r.data.plans.every((p) => typeof p.focus_mins === "number"), "plans carry focus_mins (30+15=45)");
  r = await call("b", "GET", `/plans?periods=D:${D1}&user=${aid}`);
  ok(r.data.plans.find((p) => p.id === p1)?.focus_mins === 45 && r.data.plans.find((p) => p.id === p1)?.text === "회고용 할 일", "friends (open plans) see focus_mins with the plan");
  const p3 = (await call("a", "POST", "/plans", { scope: "day", period: "D:" + D2, text: "지울 할 일" })).data.plan.id;
  const l3 = (await call("a", "POST", "/logs", { day: D2, at: "13:00", text: "집중", kind: "focus", mins: 0, plan_id: p3 })).data.log.id;
  await call("a", "DELETE", "/plans/" + p3);
  r = await call("a", "GET", "/logs?day=" + D2); ok(r.data.logs.some((l) => l.id === l3 && l.plan_id === null), "deleting a plan keeps its logs (plan_id → null)");
  r = await call("a", "GET", "/calendar/day?day=" + D1); ok(r.data.study_mins === 30 && r.data.logs.some((l) => l.plan_id === p1), "calendar day: study_mins + log plan_id");

  await call("a", "PUT", "/english/day", { day: "2027-03-11", blocks: { words: 40 } });
  await call("a", "PUT", "/diary", { day: "2027-03-12", mood: 3, body: "회고에 안 나와야 하는 비밀 일기" });
  const rec = (await call("a", "POST", "/records", { day: D1 })).data.record;
  r = await call("a", "GET", "/review/week?week=" + W);
  const ma = r.data.members?.find((m) => m.user_id === aid), mb = r.data.members?.find((m) => m.user_id === bid);
  ok(r.status === 200 && r.data.week === W && r.data.from === "2027-03-08" && r.data.to === "2027-03-14", "review week range (Mon~Sun)");
  ok(ma && ma.plans_done === 1 && ma.plans_total === 2 && ma.focus_mins === 45 && ma.english_mins === 40 && ma.study_mins === 85,
    `review numbers: plans ${ma?.plans_done}/${ma?.plans_total}, focus ${ma?.focus_mins}, english ${ma?.english_mins}, study ${ma?.study_mins}`);
  ok(ma?.diary_days === 1 && ma?.active_days === 5 && ma?.score_avg === rec.score && ma?.cheers === 0, `review numbers: diary ${ma?.diary_days}, active ${ma?.active_days}, score ${ma?.score_avg}`);
  ok(mb && mb.study_mins === 0 && mb.score_avg === null && r.data.mine === null, "review: zero row for idle member, mine null before AI");
  r = await call("b", "GET", "/review/week?week=" + W);
  ok(r.data.members?.find((m) => m.user_id === aid)?.study_mins === 85 && !JSON.stringify(r.data).includes("비밀 일기"), "b sees a's numbers only (no text)");
  r = await call("a", "GET", "/review/week?week=2027-W53"); ok(r.status === 400, "review: week that doesn't exist rejected");
  r = await call("a", "GET", "/review/week?week=2026-W53"); ok(r.status === 200 && r.data.from === "2026-12-28", "review: 2026 has a W53");
  r = await call("a", "GET", "/review/week?week=2026-40"); ok(r.status === 400, "review: bad week format rejected");
  r = await call("a", "POST", "/review/week/ai", { week: "nope" }); ok(r.status === 400, "review ai: bad week rejected before calling AI");
  r = await call("a", "POST", "/review/week/ai", { week: "2031-W02" }); ok(r.status === 400, "review ai: empty week → 400, no AI call");
});

// ---- 지금 공부 중 ----
await section("studying", async () => {
  const aid = (await call("a", "GET", "/me")).data.user.id;
  const t = Date.now();
  r = await call("a", "PUT", "/presence", { state: "focus", ends_at: t + 25 * 60e3, label: "비밀 과목" });
  ok(r.status === 200 && r.data.presence?.focus === true && !JSON.stringify(r.data).includes("비밀"), "presence focus set (label dropped)");
  const started = r.data.presence?.started_at;
  r = await call("b", "GET", "/presence"); const pa = r.data.members?.find((m) => m.user_id === aid);
  ok(r.status === 200 && typeof r.data.now === "number" && pa?.focus === true && pa.started_at === started, "b sees a is focusing");
  ok(pa && Object.keys(pa).sort().join() === "ends_at,focus,started_at,user_id", "presence members carry only user_id/focus/started_at/ends_at");
  r = await call("a", "PUT", "/presence", { state: "focus", ends_at: t + 30 * 60e3 }); ok(r.data.presence?.started_at === started, "presence: re-focus keeps started_at");
  r = await call("a", "PUT", "/presence", { state: "focus", ends_at: t - 1000 }); ok(r.status === 400, "presence: past ends_at rejected");
  r = await call("a", "PUT", "/presence", { state: "sleep" }); ok(r.status === 400, "presence: bad state rejected");
  r = await call("a", "PUT", "/presence", { state: "idle" }); ok(r.status === 200 && r.data.presence?.focus === false, "presence idle");
  r = await call("b", "GET", "/presence"); ok(r.data.members.find((m) => m.user_id === aid)?.focus === false, "b sees a idle");
  await call("a", "PUT", "/presence", { state: "focus", ends_at: Date.now() + 1200 });
  await new Promise((res) => setTimeout(res, 1600));
  r = await call("b", "GET", "/presence"); const ex = r.data.members.find((m) => m.user_id === aid);
  ok(ex?.focus === false && ex.started_at === null, "presence: expired focus reads as not focusing");
});

// ---- 응원 ----
await section("cheer", async () => {
  const aid = (await call("a", "GET", "/me")).data.user.id, bid = (await call("b", "GET", "/me")).data.user.id;
  r = await call("a", "POST", "/cheers", { to: bid }); ok(r.status === 201 && r.data.cheer?.to_id === bid, "cheer sent (201)");
  r = await call("a", "POST", "/cheers", { to: bid }); ok(r.status === 409, "cheer twice same day → 409");
  r = await call("a", "POST", "/cheers", { to: aid }); ok(r.status === 400, "cheer myself → 400");
  r = await call("a", "POST", "/cheers", { to: "no-such-user" }); ok(r.status === 404, "cheer unknown user → 404");
  r = await call("a", "POST", "/cheers", {}); ok(r.status === 400, "cheer without to → 400");
  r = await call("b", "GET", "/cheers"); ok(r.data.received?.length === 1 && r.data.received[0].from_id === aid && r.data.sent.length === 0, "b received a's cheer today");
  r = await call("a", "GET", "/cheers?day=" + r.data.day); ok(r.data.sent?.includes(bid) && r.data.received.length === 0, "a sees cheer as sent");
  r = await call("a", "GET", "/cheers?day=2026-02-30"); ok(r.status === 400, "cheers: impossible day rejected");
  r = await call("b", "GET", "/review/week"); ok(r.status === 200 && r.data.members.find((m) => m.user_id === bid)?.cheers >= 1, "review (this week) counts cheers received");
});

// ---- 첫 로그인 비밀번호 바꾸기 (must_change_pw) ----
// 로컬은 PASSWORDLESS=1 이라 이 표시를 무시해요. "x-trio-strict: 1" 헤더를 붙이면 배포본처럼 검사해요 (더 엄격해지기만 하는 테스트용 스위치).
await section("must-change-pw", async () => {
  const cu = "t_c" + tag, S = { "x-trio-strict": "1" };
  mk(cu, "테스트C", "password3");
  ok(d1(`SELECT must_change_pw FROM users WHERE username = '${cu}'`)[0]?.must_change_pw === 1, "add-user sets must_change_pw = 1 (D1)");
  r = await call("c", "POST", "/auth/login", { username: cu }); ok(r.status === 200 && r.data.user.must_change_pw === false, "PASSWORDLESS: login says must_change_pw false");
  r = await call("c", "GET", "/plans?periods=D:2026-09-28"); ok(r.status === 200, "PASSWORDLESS: not blocked");
  r = await call("c", "GET", "/me", null, S); ok(r.status === 200 && r.data.user.must_change_pw === true, "strict: /me says must_change_pw true");
  r = await call("c", "GET", "/plans?periods=D:2026-09-28", null, S);
  ok(r.status === 403 && r.data.must_change_password === true && r.data.error === "먼저 비밀번호를 바꿔 주세요.", "strict: other APIs blocked with must_change_password");
  r = await call("c", "PUT", "/presence", { state: "idle" }, S); ok(r.status === 403 && r.data.must_change_password === true, "strict: writes blocked too");
  r = await call("c", "GET", "/users", null, S); ok(r.status === 200, "strict: /users still open");
  r = await call("c", "PATCH", "/me", { display_name: "테스트C" }, S); ok(r.status === 200, "strict: PATCH /me still open");
  r = await call("c", "POST", "/auth/password", { current: "password3", next: "password3" }, S); ok(r.status === 400, "strict: same password rejected");
  r = await call("c", "POST", "/auth/password", { current: "password3", next: "1234567" }, S); ok(r.status === 400, "strict: short password rejected");
  r = await call("c", "POST", "/auth/password", { current: "password3", next: "fresh-pass-9" }, S); ok(r.status === 200, "strict: password changed");
  ok(d1(`SELECT must_change_pw FROM users WHERE username = '${cu}'`)[0]?.must_change_pw === 0, "password change clears must_change_pw (D1)");
  r = await call("c", "GET", "/plans?periods=D:2026-09-28", null, S); ok(r.status === 200, "strict: unblocked after change");
  r = await call("c", "GET", "/me", null, S); ok(r.data.user.must_change_pw === false, "strict: /me says must_change_pw false after change");
});

// ---- 비밀번호 바꾸기 ----
await section("password", async () => {
  let r = await call("a", "POST", "/auth/password", { current: "wrong-pass", next: "newpassword1" }); ok(r.status === 403, "password change: wrong current rejected");
  r = await call("a", "POST", "/auth/password", { current: "password1", next: "short" }); ok(r.status === 400, "password change: short new rejected");
  r = await call("a", "POST", "/auth/password", { current: "password1", next: "password1" }); ok(r.status === 400, "password change: same as current rejected");
  r = await call("x", "POST", "/auth/password", { current: "password1", next: "newpassword1" }); ok(r.status === 401, "password change: login required");
  await call("a2", "POST", "/auth/login", { username: "t_a" + tag });
  r = await call("a", "POST", "/auth/password", { current: "password1", next: "newpassword1" });
  ok(r.status === 200 && r.data.signed_out >= 1, "password changed, other sessions signed out: " + r.data.signed_out);
  r = await call("a2", "GET", "/me"); ok(r.status === 401, "other device logged out after change");
  r = await call("a", "GET", "/me"); ok(r.status === 200, "this device stays logged in");
  r = await call("a", "POST", "/auth/password", { current: "password1", next: "another-pass" }); ok(r.status === 403, "old password no longer works");
  r = await call("a", "POST", "/auth/password", { current: "newpassword1", next: "password1" }); ok(r.status === 200, "new password works (changed back)");
});

// ---- 대화방 · 창고 (v6) ----
r = await call("a", "GET", "/room"); ok(r.status === 200 && Array.isArray(r.data.messages) && typeof r.data.ai_name === "string" && typeof r.data.now === "number", "room: list shape · ai_name=" + r.data.ai_name);
const roomT0 = r.data.now;
r = await call("a", "POST", "/room", { body: "" }); ok(r.status === 400, "room: empty body 400");
r = await call("a", "POST", "/room", { body: "오늘 뭐 공부해?" }); ok(r.status === 201 && r.data.message.kind === "text" && !("ai" in r.data) && !("ai_error" in r.data), "room: plain message, no ai key");
const rm1 = r.data.message;
r = await call("a", "POST", "/room", { body: "@ai 한 줄로 인사해 줘" });
ok(r.status === 201 && r.data.message.body.startsWith("@ai"), "room: mention stored (ai " + (r.data.ai ? "answered" : r.data.ai_error ? "error: " + r.data.ai_error.slice(0, 40) : "skipped") + ")");
const rm2 = r.data.message, rmAi = r.data.ai;
if (!process.env.SKIP_AI) ok(!!rmAi && rmAi.kind === "ai" && rmAi.user_id === null && rmAi.reply_to === rm2.id, "room: ai reply saved: " + (rmAi?.body || r.data.ai_error || "").replace(/\s+/g, " ").slice(0, 60));
r = await call("b", "GET", "/room?since=" + rm1.created_at); ok(r.status === 200 && r.data.messages.every((m) => m.created_at > rm1.created_at) && r.data.messages.some((m) => m.id === rm2.id), "room: since returns only newer (" + r.data.messages.length + ")");
r = await call("b", "GET", "/room/unread"); const unreadB = r.data.unread; ok(unreadB >= 2, "room: b unread counts a's messages: " + unreadB);
r = await call("a", "GET", "/room/unread"); ok(r.data.unread === (rmAi ? 1 : 0), "room: a's own messages not counted (unread=" + r.data.unread + ")");
r = await call("b", "PUT", "/room/read", {}); ok(r.status === 200 && r.data.unread === 0, "room: read resets unread");
r = await call("b", "POST", "/room/ai", { message_id: rm1.id }); ok(r.status === 400, "room: retry on non-mention 400");
r = await call("b", "POST", "/room/ai", { message_id: "nope" }); ok(r.status === 404, "room: retry on missing 404");
r = await call("b", "DELETE", "/room/" + rm1.id); ok(r.status === 403, "room: delete other's 403");
r = await call("a", "DELETE", "/room/" + rm1.id); ok(r.status === 200, "room: delete own");
r = await call("a", "DELETE", "/room/" + rm1.id); ok(r.status === 404, "room: delete again 404");
r = await call("a", "PUT", "/room/settings", { ai_name: "a" }); ok(r.status === 400, "room: ai_name too short 400");
r = await call("a", "PUT", "/room/settings", { ai_name: "@마피아" }); ok(r.status === 400, "room: ai_name with @ 400");
r = await call("a", "PUT", "/room/settings", { ai_name: "   " }); ok(r.status === 400, "room: ai_name blank 400");
const prevAiName = (await call("a", "GET", "/room/settings")).data.ai_name;
r = await call("a", "PUT", "/room/settings", { ai_name: "테스트봇" + tag.slice(-2) });
ok(r.status === 200 && r.data.message.kind === "system" && r.data.message.body.includes("테스트A") && r.data.message.body.includes(r.data.ai_name), "room: settings → system message: " + r.data.message.body);
r = await call("b", "GET", "/room"); ok(r.data.ai_name === "테스트봇" + tag.slice(-2), "room: ai_name visible to b");
const sysMsgId = r.data.messages.find((m) => m.kind === "system")?.id;
r = await call("a", "DELETE", "/room/" + sysMsgId); ok(r.status === 403, "room: cannot delete system message");
r = await call("a", "PUT", "/room/settings", { ai_name: prevAiName }); ok(r.status === 200, "room: ai_name restored to " + prevAiName);

// 1:1 방: 두 사람만, 셋째는 403. 안 읽음은 방마다
mk("t_d" + tag, "테스트D", "password3"); r = await call("d", "POST", "/auth/login", { username: "t_d" + tag }); ok(r.status === 200, "room: third user login");
const uidA = (await call("a", "GET", "/me")).data.user.id, uidB = (await call("b", "GET", "/me")).data.user.id;
const dm = uidA < uidB ? `dm:${uidA}:${uidB}` : `dm:${uidB}:${uidA}`, dmRev = uidA < uidB ? `dm:${uidB}:${uidA}` : `dm:${uidA}:${uidB}`;
r = await call("a", "POST", "/room", { room: "dm:x:y", body: "hi" }); ok(r.status === 400, "room: bad room id 400");
r = await call("a", "POST", "/room", { room: dmRev, body: "hi" }); ok(r.status === 400, "room: unsorted dm id 400");
r = await call("a", "POST", "/room", { room: `dm:${uidA}:${uidA}`, body: "hi" }); ok(r.status === 400, "room: dm with self 400");
r = await call("a", "POST", "/room", { room: [uidA, "00000000-0000-4000-8000-000000000000"].sort().join(":").replace(/^/, "dm:"), body: "hi" }); ok(r.status === 403, "room: dm with someone outside my teams 403");
r = await call("a", "POST", "/room", { room: dm, body: "둘만 얘기하자" }); ok(r.status === 201 && r.data.message.room === dm, "room: dm message posted");
const dm1 = r.data.message;
r = await call("d", "GET", "/room?room=" + dm); ok(r.status === 403, "room: third user cannot read dm");
r = await call("d", "POST", "/room", { room: dm, body: "나도" }); ok(r.status === 403, "room: third user cannot post in dm");
r = await call("d", "PUT", "/room/read", { room: dm }); ok(r.status === 403, "room: third user cannot mark dm read");
r = await call("b", "GET", "/room?room=" + dm); ok(r.status === 200 && r.data.room === dm && r.data.messages.some((m) => m.id === dm1.id) && r.data.unread === 1, "room: b reads dm, unread=1");
r = await call("b", "GET", "/room"); ok(!r.data.messages.some((m) => m.id === dm1.id), "room: dm message not in 'all'");
r = await call("b", "GET", "/room/unread"); ok(r.data.rooms[dm] === 1 && r.data.unread === r.data.rooms.all && typeof r.data.total === "number", "room: unread per room · " + JSON.stringify(r.data.rooms));
r = await call("d", "GET", "/room/unread"); ok(!(dm in r.data.rooms) && "all" in r.data.rooms, "room: third user's rooms exclude others' dm");
r = await call("b", "PUT", "/room/read", { room: dm }); ok(r.status === 200 && r.data.rooms[dm] === 0, "room: read per room resets only that room");
r = await call("b", "POST", "/room", { body: "그룹에도 하나" }); ok(r.status === 201 && r.data.message.room === "all", "room: default room is 'all'");
const grp1 = r.data.message;
r = await call("b", "POST", "/room/ai", { message_id: dm1.id }); ok(r.status === 400, "room: dm retry rule same (non-mention 400)");

// 대화방 사진 · 영상: 파일 그대로 올리기 → kind image, 방 밖 사람은 403, 형식 검사, 지우면 파일도
await section("room-media", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const up = (who, room, buf, type, caption = "") => fetch(BASE + "/api/room/media?" + new URLSearchParams({ room, caption }), { method: "POST", headers: { "content-type": type, "x-trio": "1", cookie: jar[who] || "" }, body: buf }).then(async (x) => ({ status: x.status, data: await x.json().catch(() => null) }));
  const get = (who, key, h = {}) => fetch(BASE + "/api/room/media/" + encodeURIComponent(key), { headers: { cookie: jar[who] || "", ...h } });
  r = await up("a", dm, png, "image/png", "사진 하나");
  ok(r.status === 201 && r.data.message.kind === "image" && r.data.message.body === "사진 하나" && /^room-.+\.png$/.test(r.data.message.ref_id), "room media: png → image message");
  const im = r.data?.message || {};
  let f = await get("b", im.ref_id); ok(f.status === 200 && f.headers.get("content-type") === "image/png" && /private/.test(f.headers.get("cache-control") || "") && (await f.arrayBuffer()).byteLength === png.length, "room media: peer gets file (private)");
  f = await get("b", im.ref_id, { range: "bytes=0-3" }); ok(f.status === 206 && f.headers.get("content-range") === `bytes 0-3/${png.length}` && (await f.arrayBuffer()).byteLength === 4, "room media: range 206");
  f = await get("d", im.ref_id); ok(f.status === 403, "room media: outsider 403");
  r = await call("b", "GET", "/room?room=" + dm); ok(r.data.messages.some((m) => m.id === im.id && m.kind === "image") && r.data.unread >= 1, "room media: b sees image message, unread counts");
  r = await up("a", dm, Buffer.from("hello"), "text/plain"); ok(r.status === 400, "room media: wrong type 400");
  r = await up("a", dm, Buffer.from("not a png at all"), "image/png"); ok(r.status === 400, "room media: fake png (magic bytes) 400");
  r = await up("d", dm, png, "image/png"); ok(r.status === 403, "room media: outsider cannot upload");
  r = await call("a", "DELETE", "/room/" + im.id); ok(r.status === 200, "room media: delete");
  f = await get("a", im.ref_id); ok(f.status === 404, "room media: file gone after delete");
});

// 창고
r = await call("a", "POST", "/library/preview", {}); ok(r.status === 400, "library: preview needs url or title");
r = await call("a", "POST", "/library/preview", { url: "http://127.0.0.1:1/" }); ok(r.status === 400, "library: preview blocks private host");
r = await call("a", "POST", "/library/preview", { url: "ftp://example.com/x" }); ok(r.status === 400, "library: preview blocks non-http");
r = await call("a", "POST", "/library/preview", { url: "https://youtu.be/dQw4w9WgXcQ?t=3" });
ok(r.status === 200 && r.data.kind === "video" && r.data.video_id === "dQw4w9WgXcQ" && r.data.thumb.startsWith("https://i.ytimg.com/") && (r.data.title || r.data.warning), "library: youtube preview · " + (r.data.title || r.data.warning));
r = await call("a", "POST", "/library/preview", { title: "Clean Code" }); ok(r.status === 200 && r.data.kind === "book" && (r.data.candidates.length >= 1 || r.data.warning), "library: book preview · " + (r.data.author || r.data.warning));
// 진짜 창고와 겹치지 않게 이 실행만의 영상 아이디 (11자, 저장은 oEmbed 를 안 불러요)
const vid = ("t" + tag + "00000").slice(0, 11);
r = await call("a", "POST", "/library", { kind: "video", url: `https://www.youtube.com/watch?v=${vid}&t=9`, title: "테스트 영상 " + tag, share: true });
ok(r.status === 201 && r.data.item?.video_id === vid && r.data.item.url === `https://www.youtube.com/watch?v=${vid}` && r.data.item.thumb?.includes("hqdefault") && r.data.message?.kind === "share", "library: create video (url canonical) + share message");
if (r.status !== 201) { console.log("FAIL library: create failed (" + r.status + " " + (r.data?.error || "") + ") — 뒤 창고 검사를 건너뜀"); process.exitCode = 1; }
const li1 = r.data.item, shareMsg = r.data.message;
r = await call("b", "POST", "/library", { kind: "link", url: `https://youtu.be/${vid}`, title: "중복" }); ok(r.status === 409 && r.data.item?.id === li1?.id, "library: duplicate url 409 with existing item");
r = await call("a", "POST", "/library", { kind: "book", title: "테스트 책 " + tag, author: "저자", note: "읽고 싶어요" }); ok(r.status === 201 && r.data.item.my?.note === "읽고 싶어요" && r.data.item.my.state === null, "library: create book with note");
const li2 = r.data.item;
r = await call("a", "POST", "/library", { kind: "zine", title: "x" }); ok(r.status === 400, "library: bad kind 400");
r = await call("a", "POST", "/library", { kind: "link", title: "x", thumb: "http://a.b/c.png" }); ok(r.status === 400, "library: http thumb 400");
r = await call("b", "PUT", "/library/" + li1.id + "/mark", { state: "todo" }); ok(r.status === 200 && r.data.mark.state === "todo", "library: mark upsert todo");
r = await call("b", "PUT", "/library/" + li1.id + "/mark", { state: "done", note: "봤어요" }); ok(r.data.mark.state === "done" && r.data.mark.note === "봤어요", "library: mark update done+note");
r = await call("b", "PUT", "/library/" + li1.id + "/mark", { state: "doing" }); ok(r.data.mark.state === "doing" && r.data.mark.note === "봤어요", "library: state change keeps note");
r = await call("b", "PUT", "/library/" + li1.id + "/mark", { state: "bad" }); ok(r.status === 400, "library: bad state 400");
r = await call("b", "GET", "/library?kind=video"); const gi = r.data.items.find((i) => i.id === li1.id);
ok(r.status === 200 && gi && gi.marks.length === 1 && gi.my?.state === "doing" && !r.data.items.some((i) => i.kind !== "video"), "library: list kind filter + marks + my");
r = await call("a", "GET", "/library?q=" + encodeURIComponent("테스트 책")); ok(r.data.items.some((i) => i.id === li2.id) && !r.data.items.some((i) => i.id === li1.id), "library: q search");
r = await call("a", "GET", "/library?q=" + encodeURIComponent(tag)); ok(r.data.items.length >= 2 && r.data.items[0].id === li2.id, "library: newest first");
r = await call("b", "PUT", "/library/" + li1.id + "/mark", { state: null }); ok(r.status === 200 && r.data.mark === null, "library: mark null deletes");
r = await call("b", "GET", "/library?kind=video"); ok(r.data.items.find((i) => i.id === li1.id).marks.length === 0, "library: mark gone from list");
r = await call("b", "POST", "/library/" + li2.id + "/share"); ok(r.status === 201 && r.data.message.kind === "share" && r.data.message.item?.id === li2.id, "library: share by other member");
const shareMsg2 = r.data.message;
r = await call("a", "POST", "/library/" + li2.id + "/share", { room: dm }); ok(r.status === 201 && r.data.message.room === dm, "library: share into dm room");
const shareDm = r.data.message;
r = await call("d", "POST", "/library/" + li2.id + "/share", { room: dm }); ok(r.status === 403, "library: third user cannot share into others' dm");
r = await call("d", "POST", "/library", { kind: "link", title: "x", share: dm }); ok(r.status === 403, "library: create+share into forbidden dm 403 (nothing saved)");
r = await call("b", "GET", "/room?room=" + dm); ok(r.data.messages.find((m) => m.id === shareDm.id)?.item?.id === li2.id, "room: dm share carries item");
r = await call("a", "GET", "/room"); const sm = r.data.messages.find((m) => m.id === shareMsg.id);
ok(sm && sm.item && sm.item.id === li1.id && sm.item.kind === "video" && sm.item.url === li1.url && "thumb" in sm.item, "room: share message carries item");
r = await call("b", "DELETE", "/library/" + li1.id); ok(r.status === 403, "library: delete by non-owner 403");
r = await call("a", "DELETE", "/library/" + li1.id); ok(r.status === 200, "library: delete own");
r = await call("a", "GET", "/room"); ok(r.data.messages.find((m) => m.id === shareMsg.id)?.item === null, "room: share message item:null after delete");
r = await call("a", "DELETE", "/library/" + li2.id); ok(r.status === 200, "library: delete book");
// 정리: 이 시험이 만든 방 메시지 지우기 (AI·system 은 내 것이 아니라 API 로는 못 지워요 → 아래 D1 청소)
for (const id of [rm2.id, shareMsg.id, dm1.id, shareDm.id]) await call("a", "DELETE", "/room/" + id);
for (const id of [shareMsg2.id, grp1.id]) await call("b", "DELETE", "/room/" + id);
execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM room_messages WHERE created_at >= ${roomT0} AND user_id IS NULL`], { stdio: "ignore" });
r = await call("a", "GET", "/room?since=" + (roomT0 - 1)); const dmLeft = (await call("a", "GET", "/room?room=" + dm + "&since=" + (roomT0 - 1))).data.messages.length;
ok(r.data.messages.length === 0 && dmLeft === 0, "room: test messages cleaned up");

// ---- AI ----
r = await call("a", "GET", "/ai/models"); ok(r.data.models.length >= 5, "ai models: " + r.data.models.filter((m) => m.available).map((m) => m.id).join(","));
async function ask(model, message, chat_id) {
  const res = await fetch(BASE + "/api/ai/chat", { method: "POST", headers: { "content-type": "application/json", "x-trio": "1", cookie: jar.a },
    body: JSON.stringify({ model, message, chat_id, day: "2026-09-28", time: "10:00", periods: { day: "D:2026-09-28", year: "Y:2026" } }) });
  const text = await res.text();
  const ev = text.split("\n\n").filter((b) => b.startsWith("data: ")).map((b) => JSON.parse(b.slice(6)));
  return { status: res.status, ev, out: (m) => ev.filter((e) => e.type === "delta" && e.model === m).map((e) => e.text).join("") };
}
await section("ai", async () => {
  let a = await ask("all", "[[자료구조]] 노트 기준으로 스택을 한 문장으로 설명해 줘");
  const meta = a.ev.find((e) => e.type === "meta");
  ok(a.status === 200 && meta?.chat_id, "ai stream started");
  ok(["gemini", "groq", "cohere"].every((m) => meta?.targets?.includes(m)), "ai compare = " + (meta?.targets || []).join("+"));
  for (const m of meta?.targets || []) {
    const err = a.ev.find((e) => e.type === "error" && e.model === m);
    ok(a.out(m).length > 5, `ai ${m} answered: ${(a.out(m) || err?.message || "").replace(/\s+/g, " ").slice(0, 60)}`);
  }
  a = await ask("gemini", "방금 설명을 5단어 이내로 줄여 줘", meta.chat_id);
  ok(a.out("gemini").length > 0, "ai follow-up in same chat");
  r = await call("a", "GET", "/ai/chats/" + meta.chat_id); ok(r.data.messages.length >= 4, "chat saved: " + r.data.messages.length + " messages");
  // 새 회사 넷 (Zhipu · OpenRouter · Kilo · Ollama): 한 마디씩. 한도(429)면 PASS 로 표시만, 서버에 키가 없으면 건너뜀
  const avail = Object.fromEntries((await call("a", "GET", "/ai/models")).data.models.map((m) => [m.id, m.available]));
  for (const m of ["zhipu", "openrouter", "kilo", "ollama"]) {
    if (!avail[m]) { console.log(`SKIP ai ${m}: 서버에 키가 없어요 (.dev.vars 를 읽은 뒤 다시 시작해야 해요)`); continue; }
    const x = await ask(m, "한 단어로 인사해 줘");
    const err = x.ev.find((e) => e.type === "error" && e.model === m), done = x.ev.find((e) => e.type === "done" && e.model === m);
    const limited = err && /한도|429|붐벼/.test(err.message);
    ok(x.out(m).length > 0 || limited, `ai ${m} answered: ${(x.out(m) || err?.message || "").replace(/\s+/g, " ").slice(0, 60)}${limited ? " (한도 → PASS 표시만)" : ""}${done?.used ? " · " + done.used : ""}`);
    const mm = x.ev.find((e) => e.type === "meta"); if (mm?.chat_id) await call("a", "DELETE", "/ai/chats/" + mm.chat_id);
  }
  r = await call("b", "GET", "/ai/chats/" + meta.chat_id); ok(r.status === 404, "chat private to owner");
  // AI 두뇌: 대화 → 개념 노트 + 목차, 전체 정리 → 주제·태그·링크를 노트에 써넣기
  r = await call("a", "POST", "/ai/generate", { chat_id: meta.chat_id });
  ok(r.status === 201 && r.data.notes?.length >= 1 && r.data.moc_id, `ai generate from chat: ${r.data.topic || r.data.error} · ${r.data.notes?.length || 0} notes`);
  r = await call("a", "POST", "/ai/organize", {});
  ok(r.status === 200 && r.data.updated >= 1, `ai organize: ${r.data.updated || r.data.error} notes → ${(r.data.topics || []).join(", ")}`);
  r = await call("a", "GET", "/graph"); ok(r.data.nodes.some((n) => n.topic), "graph nodes carry topics");
  const org = r.data.nodes.find((n) => n.topic && !n.title.startsWith("MOC · "));
  r = await call("a", "GET", "/notes/" + org.id); ok(r.data.note.body.includes("<!-- ai:start -->") && r.data.tags.length >= 1, "ai block written into note");
  r = await call("a", "POST", "/ai/organize", {}); ok(r.status === 200 && (r.data.updated >= 1), "ai organize again (block replaced, not duplicated)");
  r = await call("a", "GET", "/notes/" + org.id); ok((r.data.note.body.match(/<!-- ai:start -->/g) || []).length === 1, "only one ai block");
  r = await call("b", "POST", "/ai/organize", { note_id: org.id }); ok(r.status === 404 || r.status === 400, "cannot organize someone else's note");
  r = await call("a", "DELETE", "/ai/chats/" + meta.chat_id); ok(r.status === 200, "delete chat");
  // 주간 회고 AI: 내 기록만으로 4~8줄, 일기 본문은 안 보냄
  r = await call("a", "POST", "/review/week/ai", { week: "2027-W10" });
  const lines = (r.data.review?.body || "").split("\n");
  ok(r.status === 200 && lines.length >= 1 && lines.length <= 8 && r.data.review.created_at > 0, `review ai: ${lines.length} lines · ${(lines[0] || r.data.error || "").slice(0, 50)}`);
  r = await call("a", "GET", "/review/week?week=2027-W10"); ok(r.data.mine?.body === lines.join("\n"), "review ai saved as mine");
  r = await call("b", "GET", "/review/week?week=2027-W10"); ok(r.data.mine === null, "review text private to owner");
  r = await call("a", "POST", "/review/week/ai", { week: "2027-W10" }); ok(r.status === 429, "review ai: regenerate too fast → 429");
  // 이미지: 빨간 8x8 PNG → 이미지 읽기 단계가 먼저 돌고 답에 색이 나와요
  const { deflateSync, crc32 } = await import("node:zlib");
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])) >>> 0); return Buffer.concat([len, Buffer.from(t), d, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array(8).fill([255, 0, 0]).flat())])));
  const RED = "data:image/png;base64," + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
  r = await call("a", "POST", "/ai/ask", { note_id: n1, question: "이 이미지는 무슨 색이야? 한 단어로", images: [RED] });
  ok(r.status === 200 && r.data.steps?.[0]?.name === "read_image" && /빨|red|적색/i.test(r.data.text), "images: ai/ask reads image → " + String(r.data.text || r.data.error).replace(/\s+/g, " ").slice(0, 40));
  // 에이전트: 글에 링크가 있으면 먼저 읽어요 (AI 비서도)
  r = await call("a", "POST", "/ai/command", { text: "https://example.com 이 페이지 제목이 뭐야? 계획은 넣지 마", today: "2027-03-01", day: "2027-03-01" });
  ok(r.status === 200 && r.data.steps?.some((x) => x.name === "read_page") && !r.data.changed, "agent: ai/command reads link → " + String(r.data.text || r.data.error).replace(/\s+/g, " ").slice(0, 50));
  // 대화방 AI: 이름을 부르면 kind 'ai' 메시지가 같이 와요 (방 안의 것만 봄)
  const aiName = (await call("a", "GET", "/room/settings")).data.ai_name;
  r = await call("a", "POST", "/room", { body: `@${aiName} 안녕, 한 줄로 인사해줘` });
  ok(r.status === 201 && r.data.ai?.kind === "ai" && r.data.ai.body.length > 0, "room ai: " + (r.data.ai?.body || r.data.ai_error || "").replace(/\s+/g, " ").slice(0, 60));
  r = await call("a", "POST", "/room/ai", { message_id: r.data.message.id }); ok(r.status === 200 && r.data.ai?.kind === "ai", "room ai: retry makes another reply");
  r = await call("a", "POST", "/room/ai", { message_id: r.data.ai.reply_to }); ok(r.status === 429, "room ai: retry too fast → 429");
  execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", "DELETE FROM room_messages WHERE created_at >= " + roomT0], { stdio: "ignore" });
}, { tags: ["ai-real"] });
// (SKIP_AI=1 · AI_MOCK=1 이면 위 구역은 SKIP 으로 찍혀요)


// ---------- 논문 스프린트 ----------
await section("papers", async () => {
  const D = { "x-papers-now": "2026-10-02" };
  const aId = (await call("a", "GET", "/me")).data.user.id;
  const mine = (d) => d.members.find((m) => m.user_id === aId); // 이름은 겹칠 수 있어서 id 로
  r = await call("a", "PUT", "/papers/check", { paper: "yolov10", step: "read", done: true }, D);
  ok(r.status === 200 && mine(r.data)?.checks.yolov10?.read > 0, "papers: check read");
  r = await call("a", "PUT", "/papers/check", { paper: "nope", step: "read", done: true }, D); ok(r.status === 400, "papers: unknown paper → 400");
  r = await call("a", "PUT", "/papers/check", { paper: "yolov10", step: "sleep", done: true }, D); ok(r.status === 400, "papers: unknown step → 400");
  r = await call("a", "POST", "/papers/quiz", { paper: "yolov10", correct: 3 }, D); ok(r.status === 200 && !r.data.passed && !mine(r.data).checks.yolov10?.quiz, "papers: quiz 3/5 does not check");
  r = await call("a", "POST", "/papers/quiz", { paper: "yolov10", correct: 5 }, D); ok(r.data.passed && mine(r.data).checks.yolov10.quiz_score === 5, "papers: quiz 5/5 checks with score");
  r = await call("a", "POST", "/papers/quiz", { paper: "yolov10", correct: 4 }, D); ok(mine(r.data).checks.yolov10.quiz_score === 5, "papers: quiz keeps best score");
  r = await call("b", "GET", "/papers/progress", null, D); ok(r.status === 200 && mine(r.data)?.done === 2 && r.data.total === 48, "papers: friend sees my progress");
  r = await call("a", "PUT", "/papers/note", { paper: "yolov10", text: "NMS 없이 학습 때만 여러 상자" }, D); ok(r.status === 200, "papers: note saved");
  r = await call("b", "GET", "/papers/progress", null, D); ok(mine(r.data).notes.yolov10?.startsWith("NMS"), "papers: friend sees my note");
  r = await call("b", "PUT", "/papers/note", { paper: "yolov10", text: "x".repeat(301) }, D); ok(r.status === 400, "papers: note too long → 400");
  r = await call("a", "POST", "/papers/explain", { paper: "yolov10", text: "짧아요" }, D); ok(r.status === 400, "papers: explain too short → 400");
  // 옵시디언 토큰
  r = await call("a", "POST", "/papers/obsidian", null, D);
  const tok = (r.data.url || "").split("#t=")[1];
  ok(r.status === 200 && tok && r.data.markdown.includes("<iframe"), "papers: obsidian note with token");
  r = await call("x", "GET", "/papers/t/" + tok, null, D); ok(r.status === 200 && r.data.me && mine(r.data)?.checks.yolov10?.read, "papers: token reads progress without login");
  r = await call("x", "PUT", "/papers/t/" + tok + "/check", { paper: "bytetrack", step: "read", done: true }, D); ok(r.status === 200 && mine(r.data).checks.bytetrack?.read, "papers: token can check own step");
  r = await call("a", "POST", "/papers/obsidian", null, D);
  r = await call("x", "GET", "/papers/t/" + tok, null, D); ok(r.status === 404, "papers: old token revoked after re-issue");
  r = await call("x", "GET", "/papers/t/short", null, D); ok(r.status === 404, "papers: malformed token → 404");
  // 끝난 뒤 (10-06)
  const E = { "x-papers-now": "2026-10-06" };
  r = await call("a", "PUT", "/papers/check", { paper: "sam", step: "read", done: true }, E); ok(r.status === 410, "papers: writes closed after 10-05 → 410");
  r = await call("a", "GET", "/papers/progress", null, E); ok(r.status === 200 && r.data.ended === true, "papers: progress still readable, ended flag");
  r = await call("a", "PUT", "/papers/check", { paper: "yolov10", step: "read", done: false }, D); ok(r.status === 200 && !mine(r.data).checks.yolov10?.read, "papers: uncheck");
  if (aiReal()) { // 진짜 AI 답 (full 단계만)
    { // 스트리밍(SSE): delta 가 여러 번 오고 end 로 끝나요
      const res = await fetch(BASE + "/api/papers/ask", { method: "POST", headers: { "content-type": "application/json", "x-trio": "1", cookie: jar.a, ...D }, body: JSON.stringify({ paper: "yolov10", messages: [{ role: "user", content: "IoU 가 뭐예요? 한 문장으로" }] }) });
      const raw = await res.text(), evs = raw.split("\n\n").filter((x) => x.startsWith("data: ")).map((x) => JSON.parse(x.slice(6)));
      const end = evs.find((e) => e.type === "end");
      ok(res.headers.get("content-type")?.includes("text/event-stream") && evs.filter((e) => e.type === "delta").length > 1 && end?.text?.length > 0, `papers ask stream: ${evs.length} events → ${(end?.text || evs.find((e) => e.type === "error")?.message || "").replace(/\s+/g, " ").slice(0, 50)}`);
    }
    r = await call("a", "POST", "/papers/ask?stream=0", { paper: "yolov10", messages: [{ role: "user", content: "NMS 가 뭐예요? 한 문장으로" }] }, D);
    ok(r.status === 200 && r.data.text?.length > 0, "papers ask: " + (r.data.text || r.data.error || "").replace(/\s+/g, " ").slice(0, 60));
    r = await call("a", "POST", "/papers/explain", { paper: "yolov10", text: "YOLOv10은 겹치는 상자를 지우는 NMS 후처리 때문에 배포가 느려지는 문제를 풀었어요. 학습 때는 한 물체에 여러 예측을 연결하는 one-to-many 헤드와 하나만 연결하는 one-to-one 헤드를 같이 학습하고, 두 헤드의 매칭 기준을 맞춰요. 추론 때는 one-to-one 헤드만 써서 NMS 가 필요 없어요. COCO 에서 비슷한 정확도로 지연이 줄었어요. 우리 RKNN 보드에서는 CPU 후처리가 줄어들어 좋아요." }, D);
    ok(r.status === 200 && r.data.score >= 50, "papers explain: good answer scores ≥ 50 → " + (r.data.score ?? r.data.error));
  }
  // 노트의 '📄 논문 공부' 구역: 10-05 까지는 그대로, 10-06 에 뿌리 · 넣어 준 페이지 · 그 아래 직접 만든 페이지까지 지우고 영어 구역은 남겨요
  r = await call("a", "POST", "/notes", { title: "t 논문 뿌리 " + tag, body: "<!-- papers:board -->\n" }); const pr = r.data.note.id;
  r = await call("a", "POST", "/notes", { title: "t 영어 뿌리 " + tag, body: "#영어\n" }); const er = r.data.note.id;
  d1(`INSERT INTO study_seed_notes (note_id, user_id, kind, created_at) VALUES ('${pr}', '${aId}', 'papers', 1), ('${er}', '${aId}', 'english', 1)`);
  r = await call("a", "POST", "/notes", { title: "t 내가 만든 하위 " + tag, body: "메모", parent_id: pr }); const kid = r.data.note.id;
  r = await call("a", "POST", "/papers/cleanup", null, D); ok(r.status === 200 && r.data.deleted === 0, "papers notes: kept during sprint");
  r = await call("a", "POST", "/papers/cleanup", null, E); ok(r.status === 200 && r.data.deleted >= 2, "papers notes: cleanup after 10-05 deletes " + r.data.deleted);
  r = await call("a", "GET", "/notes/" + pr); ok(r.status === 404, "papers notes: root gone");
  r = await call("a", "GET", "/notes/" + kid); ok(r.status === 404, "papers notes: child page gone too");
  r = await call("a", "GET", "/notes/" + er); ok(r.status === 200, "papers notes: english zone untouched");
  await call("a", "DELETE", "/notes/" + er);
  execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", "DELETE FROM paper_checks; DELETE FROM paper_notes; DELETE FROM paper_tokens;"], { stdio: "ignore" });
});

// ---------- MCP (/mcp) ----------
await section("mcp", async () => {
  const tok = (name) => execFileSync("node", ["scripts/mcp-token.mjs", "t_a" + tag, name], { encoding: "utf8" }).match(/Bearer ([A-Za-z0-9_-]+)/)[1];
  const TA = tok("smoke-a"), TB = tok("smoke-b");
  const mcp = async (t, method, params, id = 1) => {
    const res = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", ...(t ? { authorization: "Bearer " + t } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const tool = async (t, name, args = {}) => { const r = await mcp(t, "tools/call", { name, arguments: args }); return { err: !!r.data?.result?.isError, text: r.data?.result?.content?.[0]?.text || "" }; };
  r = await mcp(null, "initialize", {}); ok(r.status === 401, "mcp: no token → 401");
  r = await mcp("x".repeat(43), "initialize", {}); ok(r.status === 401, "mcp: wrong token → 401");
  r = await mcp(TA, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
  ok(r.data?.result?.protocolVersion === "2025-03-26" && r.data.result.serverInfo?.name === "swx2", "mcp: initialize echoes supported protocol");
  { const res = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + TA }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }); ok(res.status === 202, "mcp: notification → 202"); }
  r = await mcp(TA, "tools/list"); ok(r.data?.result?.tools?.length >= 14 && r.data.result.tools.every((t) => t.inputSchema?.type === "object"), "mcp: tools/list with schemas");
  r = await mcp(TA, "nope/method"); ok(r.data?.error?.code === -32601, "mcp: unknown method → -32601");
  let t = await tool(TA, "whoami"); ok(t.text.includes("smoke-a") && t.text.includes("테스트A"), "mcp: whoami knows user + agent");
  t = await tool(TA, "paper_read", { paper: "YOLOv10", part: "deep" }); ok(!t.err && t.text.includes("목차"), "mcp: paper_read deep toc");
  t = await tool(TA, "paper_read", { paper: "nope" }); ok(t.err, "mcp: unknown paper → isError");
  t = await tool(TA, "task_add", { title: "스모크 작업", assignee: "smoke-b" }); const tid = (t.text.match(/\[([0-9a-f]{8})\]/) || [])[1]; ok(!!tid, "mcp: task_add");
  t = await tool(TB, "task_claim", { id: tid }); ok(!t.err, "mcp: other agent claims");
  t = await tool(TA, "task_claim", { id: tid }); ok(t.err && t.text.includes("smoke-b"), "mcp: claimed task is protected");
  t = await tool(TA, "task_update", { id: tid, note: "메모만" }); ok(!t.err, "mcp: others can still leave a note");
  t = await tool(TB, "task_update", { id: tid, status: "done", result: "끝" }); ok(!t.err, "mcp: owner finishes");
  t = await tool(TA, "task_get", { id: tid }); ok(t.text.includes("smoke-b: 맡음") && t.text.includes("smoke-a: 메모만") && t.text.includes("done"), "mcp: log records who did what");
  t = await tool(TA, "note_write", { title: "t mcp 노트 " + tag, body: "첫 줄", mode: "create" }); ok(!t.err, "mcp: note create");
  t = await tool(TB, "note_write", { title: "t mcp 노트 " + tag, body: "둘째 줄" }); t = await tool(TA, "note_read", { title: "t mcp 노트 " + tag });
  ok(t.text.includes("첫 줄") && t.text.includes("둘째 줄") && t.text.includes("smoke-b"), "mcp: append keeps body + signs agent");
  t = await tool(TA, "note_write", { title: "t mcp 노트 " + tag, body: "x", mode: "create" }); ok(t.err, "mcp: create on existing title → isError");
  { // 옮기기: 있는 노트에 parent_title + 빈 body → 상위만 바뀌고 본문은 그대로
    await tool(TA, "note_write", { title: "t mcp 상위 " + tag, body: "상위", mode: "create" });
    t = await tool(TA, "note_write", { title: "t mcp 노트 " + tag, body: "", parent_title: "t mcp 상위 " + tag }); ok(!t.err && /옮겼어요/.test(t.text || ""), "mcp: note move under a parent");
    t = await tool(TA, "note_read", { title: "t mcp 상위 " + tag }); ok(/하위 t mcp 노트/.test(t.text || ""), "mcp: moved note is a child of the parent");
    t = await tool(TA, "note_write", { title: "t mcp 노트 " + tag, body: "", parent_title: "없는 상위 " + tag }); ok(t.err, "mcp: move to a missing parent → isError");
    t = await tool(TA, "note_write", { title: "t mcp 노트 " + tag, body: "" }); ok(t.err, "mcp: empty body without parent → isError");
  }
  execFileSync("node", ["scripts/mcp-token.mjs", "t_a" + tag, "smoke-b", "--revoke"], { stdio: "ignore" });
  r = await mcp(TB, "tools/list"); ok(r.status === 401, "mcp: revoked token → 401");
  // 웹 화면에서 각자 토큰 받기 (친구들도)
  r = await call("b", "POST", "/mcp/tokens", { name: "Bad Name!" }); ok(r.status === 400, "mcp tokens: bad name → 400");
  r = await call("b", "POST", "/mcp/tokens", { name: "b-laptop" }); const TBB = r.data?.token;
  ok(r.status === 201 && TBB?.length >= 40 && r.data.url.endsWith("/mcp"), "mcp tokens: friend creates own token");
  r = await call("b", "GET", "/mcp/tokens"); ok(r.data.tokens.some((t) => t.agent === "b-laptop") && !JSON.stringify(r.data).includes(TBB), "mcp tokens: list never shows the secret");
  r = await call("a", "GET", "/mcp/tokens"); ok(!r.data.tokens.some((t) => t.agent === "b-laptop"), "mcp tokens: list is per user");
  t = await tool(TBB, "whoami"); ok(t.text.includes("테스트B") && t.text.includes("b-laptop"), "mcp tokens: friend token acts as friend");
  r = await call("b", "DELETE", "/mcp/tokens/b-laptop"); ok(r.data?.removed === true, "mcp tokens: revoke");
  r = await mcp(TBB, "tools/list"); ok(r.status === 401, "mcp tokens: revoked from web → 401");
});

// ---------- 프로필 바꾸기 ----------
await section("profile", async () => {
  r = await call("a", "PATCH", "/me", { display_name: "테스트A2", bio: "  논문   16편  ", day_goal: 300 });
  ok(r.status === 200 && r.data.user.display_name === "테스트A2" && r.data.user.bio === "논문 16편" && r.data.user.day_goal === 300, "profile: name + bio (tidied) + goal saved");
  r = await call("b", "GET", "/users"); ok(r.data.users.some((u) => u.display_name === "테스트A2" && u.bio === "논문 16편"), "profile: friends see new name + bio");
  r = await call("a", "PATCH", "/me", { bio: "x".repeat(41) }); ok(r.status === 400, "profile: bio over 40 → 400");
  r = await call("a", "PATCH", "/me", { display_name: "x".repeat(13) }); ok(r.status === 400, "profile: name over 12 → 400");
  r = await call("a", "PATCH", "/me", { display_name: "테스트A", bio: "" }); ok(r.data.user.bio === null, "profile: empty bio clears");
  r = await call("a", "GET", "/me"); ok(r.data.user.display_name === "테스트A" && "bio" in r.data.user, "profile: /me returns bio");
  // 프로필 사진: 앱이 줄여 보낸 data URL 만, 80KB 까지, null 로 지우기
  const PIC = "data:image/jpeg;base64," + Buffer.from("x".repeat(600)).toString("base64");
  r = await call("a", "PATCH", "/me", { avatar: PIC }); ok(r.status === 200 && r.data.user.avatar === PIC, "profile: photo saved");
  r = await call("b", "GET", "/users"); ok(r.data.users.some((u) => u.display_name === "테스트A" && u.avatar === PIC), "profile: friends get the photo");
  r = await call("a", "GET", "/me"); ok(r.data.user.avatar === PIC, "profile: /me returns photo");
  r = await call("a", "PATCH", "/me", { avatar: "https://evil.example/x.jpg" }); ok(r.status === 400, "profile: non-data-URL photo → 400");
  r = await call("a", "PATCH", "/me", { avatar: "data:text/html;base64,PHNjcmlwdD4=" }); ok(r.status === 400, "profile: non-image data URL → 400");
  r = await call("a", "PATCH", "/me", { avatar: "data:image/jpeg;base64," + "A".repeat(80_001) }); ok(r.status === 400, "profile: photo over 80KB → 400");
  r = await call("a", "PATCH", "/me", { display_name: "테스트A" }); ok(r.data.user.avatar === PIC, "profile: other edits keep the photo");
  r = await call("a", "PATCH", "/me", { avatar: null }); ok(r.status === 200 && r.data.user.avatar === null, "profile: null removes photo");
});

// ---------- 홈: 오늘의 다짐(셋이 봐요) · 메모장(나만) ----------
await section("home", async () => {
  const aId = (await call("a", "GET", "/me")).data.user.id;
  r = await call("a", "PUT", "/home/pledge", { text: "  논문   2편 끝내고 잔다  " }); ok(r.status === 200 && r.data.text === "논문 2편 끝내고 잔다", "pad: pledge saved (spaces tidied)");
  r = await call("b", "GET", "/home/pad"); ok(r.data.pledges.some((p) => p.user_id === aId && p.body === "논문 2편 끝내고 잔다"), "pad: friend sees my pledge");
  r = await call("a", "PUT", "/home/pledge", { text: "x".repeat(121) }); ok(r.status === 400, "pad: pledge over 120 chars → 400");
  r = await call("a", "PUT", "/home/memo", { text: "나만 보는 메모" }); ok(r.status === 200 && r.data.saved_at > 0, "pad: memo saved");
  r = await call("a", "GET", "/home/pad"); ok(r.data.memo === "나만 보는 메모" && r.data.streak >= 1, "pad: memo + streak back");
  r = await call("b", "GET", "/home/pad"); ok(r.data.memo !== "나만 보는 메모", "pad: friend can't read my memo");
  r = await call("a", "PUT", "/home/memo", { text: 5 }); ok(r.status === 400, "pad: memo must be text");
  r = await call("a", "PUT", "/home/pledge", { text: "" }); r = await call("b", "GET", "/home/pad"); ok(!r.data.pledges.some((p) => p.user_id === aId), "pad: empty pledge removes it");
});

// ---------- OAuth 2.1 (ChatGPT · claude.ai 커넥터) ----------
await section("oauth", async () => {
  const { createHash, randomBytes } = await import("node:crypto");
  const USER = "t_b" + tag, PASS = "";
  const b64 = (b) => b.toString("base64url");

  // 1) 발견
  let r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
  const wa = r.headers.get("www-authenticate") || ""; ok(r.status === 401 && /resource_metadata="([^"]+)"/.test(wa), "oauth: 401 + WWW-Authenticate resource_metadata");
  const prm = await (await fetch(wa.match(/resource_metadata="([^"]+)"/)[1])).json(); ok(prm.resource === BASE + "/mcp" && prm.authorization_servers?.[0] === BASE, "oauth: protected resource metadata");
  const as = await (await fetch(prm.authorization_servers[0] + "/.well-known/oauth-authorization-server")).json(); ok(as.code_challenge_methods_supported.includes("S256") && as.registration_endpoint, "oauth: authorization server metadata");
  // 2) 등록
  const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
  r = await fetch(as.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "ChatGPT", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post", grant_types: ["authorization_code", "refresh_token"] }) });
  const cl = await r.json(); ok(r.status === 201 && cl.client_id && cl.client_secret, "oauth: dynamic client registration");
  r = await fetch(as.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "evil", redirect_uris: ["http://evil.example/cb"] }) }); ok(r.status === 400, "oauth: register rejects non-https redirect");
  // 3) 로그인 · 허용 (브라우저 흉내)
  const verifier = b64(randomBytes(32)), challenge = b64(createHash("sha256").update(verifier).digest());
  const params = { response_type: "code", client_id: cl.client_id, redirect_uri: REDIRECT, state: "st123", code_challenge: challenge, code_challenge_method: "S256", scope: "mcp", resource: BASE + "/mcp" };
  r = await fetch(as.authorization_endpoint + "?" + new URLSearchParams(params), { redirect: "manual" }); const h1 = await r.text();
  ok(r.status === 200 && h1.includes("로그인") && r.headers.get("x-frame-options") === "DENY", "oauth: authorize shows login page (no framing)");
  r = await fetch(as.authorization_endpoint + "?" + new URLSearchParams({ ...params, redirect_uri: "https://evil.example/cb" }), { redirect: "manual" }); ok(r.status === 400, "oauth: authorize rejects unregistered redirect");
  r = await fetch(as.authorization_endpoint, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE }, body: new URLSearchParams({ ...params, action: "login", username: USER, password: PASS }) });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0]; const h2 = await r.text();
  ok(r.status === 200 && h2.includes("허용") && cookie.startsWith("trio_session="), "oauth: login → consent page + session cookie");
  r = await fetch(as.authorization_endpoint, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example", cookie }, body: new URLSearchParams({ ...params, action: "allow" }) });
  ok(r.status === 403, "oauth: allow from another site → 403");
  r = await fetch(as.authorization_endpoint, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, cookie }, body: new URLSearchParams({ ...params, action: "allow" }) });
  const loc = new URL(r.headers.get("location")); const code = loc.searchParams.get("code");
  ok(r.status === 302 && loc.origin + loc.pathname === REDIRECT && loc.searchParams.get("state") === "st123" && code, "oauth: allow → redirect with code + state");
  // 4) 토큰
  const tok = (b) => fetch(as.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cl.client_id, client_secret: cl.client_secret, ...b }) }).then(async (x) => ({ s: x.status, d: await x.json() }));
  let t = await tok({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: "wrong" + verifier }); ok(t.s === 400 && t.d.error === "invalid_grant", "oauth: wrong PKCE verifier rejected");
  // (틀린 verifier 시도로 코드가 이미 쓰였으므로) 새 코드 받기
  r = await fetch(as.authorization_endpoint, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, cookie }, body: new URLSearchParams({ ...params, action: "allow" }) });
  const code2 = new URL(r.headers.get("location")).searchParams.get("code");
  t = await tok({ grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT, code_verifier: verifier }); ok(t.s === 200 && t.d.access_token && t.d.refresh_token && t.d.token_type === "Bearer", "oauth: code + PKCE → tokens");
  const T1 = t.d;
  let t2 = await tok({ grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT, code_verifier: verifier }); ok(t2.s === 400, "oauth: code replay rejected");
  r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + T1.access_token }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  ok(r.status === 401, "oauth: code replay also revokes tokens from that code");
  // 다시 정상 흐름
  r = await fetch(as.authorization_endpoint, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, cookie }, body: new URLSearchParams({ ...params, action: "allow" }) });
  t = await tok({ grant_type: "authorization_code", code: new URL(r.headers.get("location")).searchParams.get("code"), redirect_uri: REDIRECT, code_verifier: verifier }); const T = t.d;
  r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + T.access_token }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }) });
  const who = (await r.json()).result?.content?.[0]?.text || ""; ok(r.status === 200 && who.includes("@" + USER) && who.includes("chatgpt"), "oauth: OAuth token works on /mcp as the user (agent=chatgpt)");
  t = await tok({ grant_type: "refresh_token", refresh_token: T.refresh_token }); ok(t.s === 200 && t.d.access_token !== T.access_token, "oauth: refresh → new tokens");
  t2 = await tok({ grant_type: "refresh_token", refresh_token: T.refresh_token }); ok(t2.s === 400, "oauth: old refresh token rejected (rotation)");
  r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + T.access_token }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }); ok(r.status === 401, "oauth: old access token dead after refresh");
  r = await fetch(as.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.d.refresh_token, client_id: cl.client_id, client_secret: "nope" }) }); ok(r.status === 401, "oauth: wrong client secret → 401");
  // 앱에서 끊기
  r = await fetch(BASE + "/api/mcp/tokens", { headers: { cookie } }); const list = await r.json(); ok(list.oauth?.some((o) => o.client_name === "ChatGPT"), "oauth: grant listed in MCP panel API");
  r = await fetch(BASE + "/api/mcp/oauth/" + cl.client_id, { method: "DELETE", headers: { cookie, "x-trio": "1" } }); ok((await r.json()).removed, "oauth: revoke from app");
  r = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + t.d.access_token }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }); ok(r.status === 401, "oauth: revoked grant → 401");
  
});

// ---------- 뉴스 Signal Map: 지도 · 토론(2단) · 🤖 반박 · 반박 알림 (wrangler dev --var NEWS_FAKE_AI:1 이면 AI 없이) ----------
await section("news-map", async () => {
  const fid = "smk-f" + tag, iid = "smk-i" + tag, t0 = Date.now();
  d1(`INSERT INTO news_feeds (id, url, name, topic, created_at) VALUES ('${fid}', 'https://example.com/${fid}', 'Smoke Feed', 'china', ${t0})`);
  d1(`INSERT INTO news_items (id, feed_id, url, title, published_at, raw, one_liner, geo, created_at) VALUES ('${iid}', '${fid}', 'https://example.com/${iid}', 'Beijing tightens rare earth smoke export', ${t0 - 3600e3}, 'China said on Monday it will tighten rare earth exports. Washington called the move coercive.', '중국이 희토류 수출을 죄어요', '["CN","US"]', ${t0})`);
  const uid2 = "smk-u" + tag;
  d1(`INSERT INTO news_items (id, feed_id, url, title, published_at, dated, raw, created_at) VALUES ('${uid2}', '${fid}', 'https://example.com/${uid2}', 'Undated smoke item', ${t0}, 0, 'x', ${t0})`);
  const yday = new Date(t0 + 9 * 3600e3 - 864e5).toISOString().slice(0, 10);
  const hadToday = d1(`SELECT day FROM news_briefs WHERE day = '${new Date(t0 + 9 * 3600e3).toISOString().slice(0, 10)}'`).length;
  d1(`INSERT OR IGNORE INTO news_briefs (day, headline, body, weights, item_count, created_at) VALUES ('${yday}', 'smoke brief', '', '[]', 0, ${t0})`);
  r = await call("a", "GET", "/news/map");
  ok(r.data.brief && r.data.brief.day && (hadToday || r.data.brief.day === yday), "news: map falls back to latest briefing with its date");
  ok(r.data.live.find((i) => i.id === uid2)?.dated === 0, "news: undated item flagged dated=0 (shown as 'new')");
  d1(`DELETE FROM news_items WHERE id = '${uid2}'`); if (!hadToday) d1(`DELETE FROM news_briefs WHERE day = '${yday}' AND headline = 'smoke brief'`);
  r = await call("a", "GET", "/news/map"); ok(r.status === 200 && Array.isArray(r.data.signals) && Array.isArray(r.data.threads) && typeof r.data.count === "number", "news: map shape");
  const sig = r.data.signals.find((s) => s.id === iid) || r.data.live.find((s) => s.id === iid);
  ok(sig && sig.geo.includes("CN") && Array.isArray(sig.readers), "news: map item has geo + readers");
  r = await call("a", "POST", `/news/item/${iid}/comments`, { body: "희토류는 협상 카드일 뿐이에요" }); ok(r.status === 200 && r.data.comment.stance === "memo" && r.data.notified.length === 0, "news: memo saved, nobody notified");
  const memo = r.data.comment;
  r = await call("b", "POST", `/news/item/${iid}/comments`, { body: "카드가 아니라 실제 공급 차단이에요", stance: "rebut", parent_id: memo.id });
  ok(r.status === 200 && r.data.comment.stance === "rebut" && r.data.notified.length === 1 && r.data.notified[0] === uidA, "news: friend's rebut notifies memo author (push trigger)");
  const reply = r.data.comment;
  r = await call("a", "POST", `/news/item/${iid}/comments`, { body: "3단?", stance: "agree", parent_id: reply.id }); ok(r.status === 400, "news: depth limit — no reply to a reply");
  r = await call("a", "POST", `/news/item/${iid}/comments`, { body: "내 메모에 내가 동의", stance: "agree", parent_id: memo.id }); ok(r.status === 200 && r.data.notified.length === 0, "news: own reply does not notify self");
  r = await call("a", "POST", `/news/item/${iid}/comments`, { body: "  " }); ok(r.status === 400, "news: empty comment 400");
  r = await call("b", "POST", `/news/comments/${memo.id}/ai-rebut`);
  ok(r.status === 200 && r.data.comment.ai === 1 && r.data.comment.stance === "rebut" && r.data.notified[0] === uidA, "news: AI rebut returned + notifies memo author");
  ok(d1(`SELECT ai, stance FROM news_comments WHERE parent_id = '${memo.id}' AND ai = 1`).length === 1, "news: AI rebut stored with ai=1 (D1)");
  ok(/^1\. .+\n> .+\n2\. /m.test(r.data.comment.body), "news: AI rebut = numbered counter-points, each with an evidence line");
  r = await call("b", "POST", `/news/comments/${memo.id}/ai-rebut`); ok(r.status === 409, "news: only one AI rebut per memo");
  r = await call("b", "POST", `/news/comments/${reply.id}/ai-rebut`); ok(r.status === 400, "news: AI rebut only on memos");
  r = await call("b", "PATCH", `/news/item/${iid}`, { read: true, flagged: true });
  r = await call("a", "GET", `/news/item/${iid}`);
  ok(r.status === 200 && r.data.comments.length === 4 && r.data.item.readers.includes(uidB) && r.data.item.stars.includes(uidB), "news: item has discussion + read/star marks of friends");
  r = await call("a", "GET", "/news/items?filter=all&balance=0&limit=200"); const li = r.data.items.find((i) => i.id === iid);
  ok(li && li.comments === 4 && li.disputed === true, "news: list shows 💬 count + ⚡ disputed");
  r = await call("a", "GET", "/news/inbox"); ok(r.status === 200 && r.data.n === 2 && r.data.last, "news: inbox has 2 replies from others");
  await call("a", "PUT", "/news/inbox/seen"); r = await call("a", "GET", "/news/inbox"); ok(r.data.n === 0, "news: inbox cleared after seen");
  r = await call("b", "DELETE", `/news/comments/${memo.id}`); ok(r.status === 404, "news: cannot delete others' memo");
  r = await call("a", "POST", "/news/threads", { title: "희토류 스모크", keywords: ["rare earth smoke"] }); ok(r.status === 200 && r.data.attached >= 1, "news: manual thread back-attaches by keyword");
  const th = r.data.id;
  r = await call("a", "GET", `/news/thread/${th}`); ok(r.status === 200 && r.data.items.some((i) => i.id === iid), "news: thread timeline lists item");
  r = await call("a", "POST", `/news/thread/${th}/story`); ok(r.status === 200 && typeof r.data.story === "string" && r.data.story.length > 0, "news: story so far generated");
  r = await call("a", "DELETE", `/news/comments/${memo.id}`); ok(r.status === 200, "news: delete own memo");
  ok(d1(`SELECT COUNT(*) AS n FROM news_comments WHERE item_id = '${iid}'`)[0].n === 0, "news: replies go with the memo");
  d1(`DELETE FROM news_threads WHERE id = '${th}'`); d1(`DELETE FROM news_items WHERE id = '${iid}'`); d1(`DELETE FROM news_feeds WHERE id = '${fid}'`);
});

// ---------- 뉴스 신문(하루 한 부) · 되채우기 · 크론 예산 (wrangler dev --var NEWS_FAKE_AI:1) ----------
await section("news-edition", async () => {
  const { sectionOf, kstDay } = await import("../src/news.js");
  ok(sectionOf("semi") === "tech" && sectionOf("macro") === "economy" && sectionOf("energy") === "economy" && sectionOf("china") === "geopolitics" && sectionOf("europe") === "geopolitics" && sectionOf("ai") === "ai" && sectionOf("china", "ai") === "ai" && sectionOf("ai", "bogus") === "ai", "edition: topic → section map (AI tag overrides)");
  ok(kstDay(Date.parse("2026-10-12T15:30:00Z")) === "2026-10-13" && kstDay(Date.parse("2026-10-12T14:59:00Z")) === "2026-10-12", "edition: item day = KST date");
  // 예산 포장: 한도를 넘는 fetch 는 막혀요 (Node 에서 같은 모듈)
  const { withBudget, BudgetError } = await import("../src/lib/budget.js");
  let blocked = null;
  const rb = await withBudget(3, async () => { for (let i = 0; i < 5; i++) { try { await fetch(BASE + "/"); } catch (e) { blocked = e; break; } } });
  ok(rb.used === 3 && blocked instanceof BudgetError, "budget: 4th fetch over a limit of 3 is refused");

  const t0 = Date.now(), D = kstDay(t0 - 58 * 864e5), DT = Date.parse(D + "T03:00:00Z"); // 그날 정오(한국)
  // 지난 실행이 남긴 smk- 줄 · 그날 신문부터 지워요
  d1(`DELETE FROM news_editions WHERE day IN (SELECT DISTINCT day FROM news_items WHERE id LIKE 'smk-%')`);
  d1(`DELETE FROM news_items WHERE id LIKE 'smk-%'`); d1(`DELETE FROM news_feeds WHERE id LIKE 'smk-f%'`); d1(`DELETE FROM news_jobs WHERE name = 'backfill'`);
  const fs = "smk-fs" + tag, fa = "smk-fa" + tag;
  d1(`INSERT INTO news_feeds (id, url, name, topic, created_at) VALUES ('${fs}', 'http://127.0.0.1:1/${fs}', 'Smoke Semi', 'semi', ${t0}), ('${fa}', 'http://127.0.0.1:1/${fa}', 'Smoke AI', 'ai', ${t0})`);
  const ids = [0, 1, 2, 3, 4].map((n) => `smk-e${n}${tag}`);
  d1(`INSERT INTO news_items (id, feed_id, url, title, published_at, raw, created_at, day, section) VALUES ` + ids.map((id, n) =>
    `('${id}', '${n < 3 ? fs : fa}', 'https://example.com/${id}', 'Smoke edition story ${n} TSMC Taiwan', ${DT + n * 60e3}, 'TSMC in Taiwan said story ${n}.', ${t0}, '${D}', '${n < 3 ? "tech" : "ai"}')`).join(","));
  // 되채우기: 가장 오래된 날(D)부터 — 요약 → 마감 신문
  // AI 가 계속 답을 안 주는 글(가짜 AI: 제목에 NOANSWER) → 두 번째에 건너뛰기, 그날은 3걸음 규칙 없이 마감
  const D0 = kstDay(t0 - 59 * 864e5), nx = "smk-nx" + tag;
  // 지난 실행이 남긴 smk- 줄 · 그날 신문을 먼저 지우고, D0 보다 오래된 날(60일 창 안)에 남은 '마감 안 된' 다른 글은 잠깐 마감 자리로 막아요
  // (되채우기는 가장 오래된 날부터 고르니, 남은 줄이 있으면 우리 날 대신 그날을 골라서 실패했어요 — 2026-10-26)
  const blockDays = d1(`SELECT DISTINCT i.day, e.status FROM news_items i LEFT JOIN news_editions e ON e.day = i.day WHERE i.day >= '${kstDay(t0 - 60 * 864e5)}' AND i.day < '${D0}' AND (e.day IS NULL OR e.status <> 'closed')`);
  const holdNew = blockDays.filter((x) => !x.status).map((x) => x.day), holdDraft = blockDays.filter((x) => x.status).map((x) => x.day);
  const inList = (a) => a.map((d) => `'${d}'`).join(",");
  if (holdNew.length) d1(`INSERT INTO news_editions (day, headline, status, item_count, built_at) VALUES ${holdNew.map((d) => `('${d}', 'smk-hold', 'closed', 0, 0)`).join(",")}`);
  if (holdDraft.length) d1(`UPDATE news_editions SET status = 'closed' WHERE day IN (${inList(holdDraft)})`);
  d1(`INSERT INTO news_items (id, feed_id, url, title, published_at, raw, created_at, day, section) VALUES ('${nx}', '${fa}', 'https://example.com/${nx}', 'NOANSWER smoke', ${Date.parse(D0 + "T03:00:00Z")}, 'x', ${t0}, '${D0}', 'ai')`);
  r = await call("a", "POST", "/news/backfill"); ok(r.data.day === D0 && r.data.built === false && r.data.todo === 1, "backfill: no answer once → retried later");
  r = await call("a", "POST", "/news/backfill"); ok(r.data.day === D0 && r.data.built === true && r.data.stuck < 3, "backfill: no answer twice → item skipped, day closes normally");
  ok(d1(`SELECT sum_skip, summary FROM news_items WHERE id = '${nx}'`)[0].sum_skip === 1, "backfill: skipped item flagged sum_skip=1, summary null (D1)");
  r = await call("a", "POST", "/news/backfill");
  ok(r.status === 200 && r.data.day === D && r.data.summed === 5 && r.data.built === true && r.data.subrequests <= 40, "backfill: step summarizes the oldest day and closes its edition");
  ok(d1(`SELECT COUNT(*) AS n FROM news_items WHERE day = '${D}' AND summary IS NOT NULL AND one_liner IS NOT NULL`)[0].n === 5, "backfill: summary + one_liner stored (D1)");
  const built1 = d1(`SELECT built_at, status FROM news_editions WHERE day = '${D}'`)[0];
  ok(built1?.status === "closed", "backfill: edition row closed (D1)");
  r = await call("a", "POST", "/news/backfill");
  ok(r.status === 200 && r.data.day !== D && d1(`SELECT built_at FROM news_editions WHERE day = '${D}'`)[0].built_at === built1.built_at, "backfill: idempotent — closed day is not rebuilt");
  r = await call("a", "GET", `/news/edition/${D}`);
  const E = r.data;
  ok(r.status === 200 && E.status === "closed" && E.headline && E.front.length >= 3 && E.front.length <= 5 && E.front.every((f) => f.item.summary && typeof f.why === "string"), "edition: front 3–5 with summaries");
  ok(E.sections.tech.length === 3 && E.sections.ai.length === 2 && E.sections.geopolitics.length === 0 && E.sections.economy.length === 0 && Array.isArray(E.late) && E.count === 5, "edition: sections from feed topics");
  ok(E.sections.tech[0].readers && typeof E.sections.tech[0].comments === "number" && E.sections.tech[0].summary, "edition: items carry summary + readers + comments");
  r = await call("a", "GET", `/news/editions?from=${kstDay(t0 - 60 * 864e5)}&to=${kstDay(t0)}`);
  const L = r.data.editions.find((e) => e.day === D);
  ok(r.status === 200 && L && L.counts.tech === 3 && L.counts.ai === 2 && L.items === 5 && L.status === "closed", "editions: list with counts");
  r = await call("a", "GET", "/news/edition/2026-13-99x"); ok(r.status === 400, "edition: bad day 400");
  r = await call("a", "GET", "/news/edition/today"); ok(r.status === 200 && ["live", "draft", "closed"].includes(r.data.status), "edition: today works (live before any build)");

  // 크론 예산: 피드 14곳(전부 실패하는 주소) + 요약 안 된 글 30편이 있어도 크론마다 바깥 요청 40개 안
  const many = Array.from({ length: 14 }, (_, n) => `('smk-fm${n}${tag}', 'http://127.0.0.1:1/m${n}${tag}', 'Smoke M${n}', 'macro', ${t0})`);
  d1(`INSERT INTO news_feeds (id, url, name, topic, created_at) VALUES ${many.join(",")}`);
  d1(`INSERT INTO news_items (id, feed_id, url, title, published_at, raw, created_at, day, section) VALUES ` + Array.from({ length: 30 }, (_, n) =>
    `('smk-c${n}${tag}', '${fa}', 'https://example.com/c${n}${tag}', 'Smoke cron story ${n}', ${t0 - n * 60e3}, 'x', ${t0}, '${kstDay(t0 - n * 60e3)}', 'ai')`).join(","));
  for (const c of ["hourly", "am", "close"]) {
    r = await call("a", "POST", `/cron/run?cron=${c}`);
    ok(r.status === 200 && r.data.limit === 40 && r.data.used > 0 && r.data.used <= 40, `cron ${c}: ${r.data?.used} subrequests ≤ 40`);
  }
  ok(d1(`SELECT status FROM news_editions WHERE day = '${kstDay(Date.now())}'`)[0]?.status === "closed", "cron close: today's edition closed");
  r = await call("a", "POST", "/cron/run?cron=am"); ok(d1(`SELECT status FROM news_editions WHERE day = '${kstDay(Date.now())}'`)[0]?.status === "closed", "cron am: draft never reopens a closed edition");
  d1(`DELETE FROM news_items WHERE id LIKE 'smk-%${tag}'`); d1(`DELETE FROM news_feeds WHERE id LIKE 'smk-f%${tag}'`);
  d1(`DELETE FROM news_editions WHERE day = '${D}' OR day = '${D0}' OR day = '${kstDay(Date.now())}'`); d1(`DELETE FROM news_jobs`);
  d1(`DELETE FROM news_editions WHERE headline = 'smk-hold'`);
  if (holdDraft.length) d1(`UPDATE news_editions SET status = 'draft' WHERE day IN (${inList(holdDraft)})`);
});

// ---------- 페이지 파일: sandbox iframe 은 쿠키가 없어서 /pf/<id>/~<토큰>/ 으로 불러요 ----------
await section("page-files", async () => {
  const files = { "index.html": '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body>hi</body></html>', "style.css": "body{color:red}" };
  const pa = (await call("a", "POST", "/pages", { title: "파일 토큰", files })).data.page;
  const pa2 = (await call("a", "POST", "/pages", { title: "다른 페이지", files })).data.page;
  const raw = (path, cookie) => fetch(BASE + path, { headers: cookie ? { cookie } : {} });
  r = await raw(`/pf/${pa.id}/style.css`); ok(r.status === 401, "pf: no cookie, no token → 401 (what a sandbox iframe used to get)");
  r = await raw(`/pf/${pa.id}/style.css`, jar.a); ok(r.status === 200, "pf: cookie still works");
  const t = await call("a", "GET", `/pages/${pa.id}/file-token`); ok(t.status === 200 && t.data.token, "pf: file token issued to owner");
  r = await raw(`/pf/${pa.id}/~${t.data.token}/style.css`); ok(r.status === 200 && (await r.text()).includes("red"), "pf: token loads style.css without cookie");
  r = await raw(`/pf/${pa.id}/~${t.data.token}/index.html`); ok(r.status === 200 && (await r.text()).includes("/js/page-bridge.js"), "pf: token loads index.html with bridge");
  r = await raw(`/pf/${pa2.id}/~${t.data.token}/style.css`); ok(r.status === 401, "pf: token is bound to one page");
  r = await raw(`/pf/${pa.id}/~${t.data.token.slice(0, -2)}xx/style.css`); ok(r.status === 401, "pf: tampered token → 401");
  r = await call("b", "GET", `/pages/${pa.id}/file-token`); ok(r.status === 404, "pf: no token for someone else's private page");
  await call("a", "DELETE", `/pages/${pa.id}`); await call("a", "DELETE", `/pages/${pa2.id}`);
});

// ---------- 개인 API 키 + /api/v1 (바깥 사이트, 키만 · CORS *) ----------
await section("apikeys", async () => {
  const v1 = (path, h = {}, method = "GET") => fetch(BASE + "/api/v1" + path, { method, headers: h });
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const plan = (await call("a", "POST", "/plans", { scope: "day", period: "D:" + today, text: "v1 계획 " + tag })).data.plan;
  const k = await call("a", "POST", "/apikeys", { name: "smoke" });
  ok(k.status === 201 && /^swx2_/.test(k.data.secret) && k.data.key.prefix === k.data.secret.slice(0, 10), "apikey: created, secret shown once");
  const H = { authorization: "Bearer " + k.data.secret };
  r = await v1("/plans/today", H); let d = await r.json();
  ok(r.status === 200 && d.date === today && d.plans.some((p) => p.id === plan.id && p.text === plan.text), "v1: plans/today with key returns my plan");
  ok(r.headers.get("access-control-allow-origin") === "*", "v1: CORS * on GET");
  r = await v1(`/plans?from=${today}&to=${today}`, H); d = await r.json(); ok(r.status === 200 && d.plans.some((p) => p.id === plan.id), "v1: plans range");
  r = await v1("/plans?from=2026-01-01&to=2026-06-01", H); ok(r.status === 400, "v1: range over 62 days 400");
  r = await v1("/me", H); d = await r.json(); ok(r.status === 200 && d.user.id && !("role" in d.user), "v1: me");
  r = await v1("/plans/today"); ok(r.status === 401, "v1: no key 401");
  r = await v1("/plans/today", { cookie: jar.a }); ok(r.status === 401, "v1: cookie only 401");
  r = await v1("/plans/today", { origin: "https://example.com", "access-control-request-method": "GET", "access-control-request-headers": "authorization" }, "OPTIONS");
  ok(r.status === 204 && r.headers.get("access-control-allow-origin") === "*" && /authorization/i.test(r.headers.get("access-control-allow-headers") || ""), "v1: CORS preflight");
  r = await v1("/plans/today", H, "POST"); ok(r.status === 405, "v1: write method 405");
  r = await fetch(BASE + "/api/plans?periods=D:" + today, { headers: H }); ok(r.status === 401, "apikey: can't call /api/plans");
  r = await fetch(BASE + "/api/notes", { headers: H }); ok(r.status === 401, "apikey: can't call /api/notes");
  r = await call("b", "DELETE", "/apikeys/" + k.data.key.id); ok(r.status === 404, "apikey: others can't revoke my key");
  const meId = (await call("a", "GET", "/me")).data.user.id;
  d1(`UPDATE users SET state = 'suspended' WHERE id = '${meId}'`);
  r = await v1("/plans/today", H); ok(r.status === 401, "v1: suspended user 401");
  d1(`UPDATE users SET state = 'active' WHERE id = '${meId}'`);
  r = await call("a", "GET", "/apikeys"); ok(r.status === 200 && r.data.keys.length === 1 && !("key_hash" in r.data.keys[0]) && r.data.keys[0].last_used_at, "apikey: list (no hash, last used)");
  for (let i = 0; i < 4; i++) await call("a", "POST", "/apikeys", { name: "more" + i });
  r = await call("a", "POST", "/apikeys", { name: "sixth" }); ok(r.status === 400, "apikey: max 5 per user");
  for (const x of (await call("a", "GET", "/apikeys")).data.keys) await call("a", "DELETE", "/apikeys/" + x.id);
  r = await v1("/plans/today", H); ok(r.status === 401, "v1: revoked key 401");
  await call("a", "DELETE", "/plans/" + plan.id);
});

// 개인 자료 공급사 (서버 없이 — fetch 를 잠깐 가짜로 바꿔서 확인해요)
{ const { privacyChecks } = await import("./privacy-check.mjs"); await privacyChecks(ok); }

r = await call("a", "POST", "/auth/logout"); r = await call("a", "GET", "/me"); ok(r.status === 401, "logout");

// 끝날 때: 이 실행이 만든 임시 계정만 (test.mjs 로 여럿이 같이 돌 때 남의 것을 지우지 않게). 혼자 돌면 예전처럼 t_… 전부
execFileSync("node", ["scripts/test-cleanup.mjs", ...(process.env.TEST_RUN ? ["--tag=" + tag] : [])], { stdio: "ignore" });
console.log("cleaned up test users");
writeSummary({ script: "smoke" });

// API smoke test against a running `wrangler dev` (default http://127.0.0.1:8787).
const BASE = process.env.BASE || "http://127.0.0.1:8787";
// 로컬 D1 을 다른 프로세스(wrangler d1 execute)로 만지는 몇 초 사이에 wrangler dev 가 쉬던 연결을 닫아요.
// 그 연결을 다시 쓰면 ECONNRESET 이 나서, 연결이 끊긴 경우에만 한 번 더 보내요 (앱 응답 오류는 그대로 둬요).
const rawFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  try { return await rawFetch(url, opts); }
  catch (e) {
    const code = e?.cause?.code || "";
    if (!/ECONNRESET|UND_ERR_SOCKET|EPIPE/.test(code) && !/other side closed/.test(String(e?.cause?.message || ""))) throw e;
    await new Promise((r) => setTimeout(r, 300));
    return rawFetch(url, opts);
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
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };
for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/"); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

import { execFileSync } from "node:child_process";
// ---------- 도구 줄 해석 · 거짓 "넣었어요" 검사 (모델 없이, 고정 입력) ----------
{
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
  void T;
}
const tag = Date.now().toString(36).slice(-5);
const mk = (u, n, pw) => execFileSync("node", ["scripts/add-user.mjs", u, n, pw], { stdio: "ignore" });
// 로컬 D1 에 직접 묻기 (서버를 거치지 않고 저장된 값 확인)
const d1 = (sql) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0].results;
let r = await call("a", "POST", "/auth/signup", { username: "x" + tag, password: "password1", display_name: "x", invite: "trio-2026" });
ok(r.status === 403, "signup is closed");
mk("t_a" + tag, "테스트A", "password1"); mk("t_b" + tag, "테스트B", "password2");
r = await call("x", "POST", "/auth/login", { username: "nobody" + tag }); ok(r.status === 401, "unknown id rejected");
r = await call("a", "POST", "/auth/login", { username: "t_a" + tag }); ok(r.status === 200, "login a by id only");
r = await call("b", "POST", "/auth/login", { username: "t_b" + tag }); ok(r.status === 200, "login b by id only");
r = await call("a", "GET", "/me"); ok(r.status === 200 && r.data.user.display_name === "테스트A", "me");
r = await call("x", "GET", "/me"); ok(r.status === 401, "anon rejected");
r = await fetch(BASE + "/api/plans", { method: "POST", headers: { cookie: jar.a, "content-type": "application/json" }, body: "{}" });
ok(r.status === 403, "csrf header required");

r = await call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-28", text: "영단어 50개", start: "08:00", mins: 60 });
ok(r.status === 201, "create day plan"); const pid = r.data.plan.id;
r = await call("a", "POST", "/plans", { scope: "day", period: r.data.plan.period, text: "우선순위 할 일", priority: "xhigh" }); ok(r.status === 201 && r.data.plan.priority === "xhigh", "plan priority: create xhigh");
{ const ppid = r.data.plan.id;
  r = await call("a", "PATCH", "/plans/" + ppid, { priority: "max" }); ok(r.status === 200 && r.data.plan.priority === "max", "plan priority: update to max");
  r = await call("a", "PATCH", "/plans/" + ppid, { priority: "urgent" }); ok(r.status === 400, "plan priority: unknown value → 400");
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

// ---- diary ----
r = await call("a", "PUT", "/diary", { day: "2026-09-28", mood: 4, body: "오늘은 괜찮았다" }); ok(r.data.diary?.mood === 4, "diary saved");
r = await call("a", "GET", "/diary?day=2026-09-28"); ok(r.data.diary?.body === "오늘은 괜찮았다", "diary read");
r = await call("b", "GET", "/diary?day=2026-09-28"); ok(r.data.diary === null, "diary private to owner");
r = await call("a", "PUT", "/diary", { day: "2026-09-28", mood: 9 }); ok(r.status === 400, "bad mood rejected");
r = await call("a", "GET", "/diary/list"); ok(r.data.entries.length === 1, "diary list");

// ---- 서로는 차트만 + 하루 기록 ----
{
  const me = (await call("a", "GET", "/me")).data.user;
  const pp = (await call("a", "POST", "/plans", { scope: "day", period: "D:2026-09-28", text: "a만 아는 계획", start: "08:00", mins: 30 })).data.plan;
  r = await call("b", "GET", `/plans?periods=D:2026-09-28&user=${me.id}`); ok(r.data.plans.some((p) => p.id === pp.id && p.text === ""), "b sees a's plan shape without text");
  r = await call("b", "GET", `/logs?day=2026-09-28&user=${me.id}`); ok(r.status === 403, "b cannot read a's logs");
  r = await call("a", "POST", "/records", { day: "2026-09-28" }); ok(r.status === 200 && r.data.record.total >= 1, "a saves a day record");
  r = await call("a", "GET", "/records?day=2026-09-28"); ok(r.data.record?.data.plans.some((p) => p.text === "a만 아는 계획"), "record keeps plan text for owner");
  r = await call("b", "GET", "/records?day=2026-09-28"); ok(r.data.record === null, "b cannot see a's record");
  r = await call("a", "GET", "/records/days?year=2026"); ok(r.data.days.some((d) => d.day === "2026-09-28"), "record days list");
}

// ---- 영어 (ENGLISH-OS) ----
{
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
}

// ---- 캘린더: 날짜별 할 일 · 하루 한 페이지 ----
{
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
}

// ---- 할 일별 집중 (logs.plan_id → plans.focus_mins) · 주간 회고 숫자 ----
{
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
  ok(r.data.plans.find((p) => p.id === p1)?.focus_mins === 45 && r.data.plans.every((p) => p.text === ""), "others see focus_mins but no text");
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
}

// ---- 지금 공부 중 ----
{
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
}

// ---- 응원 ----
{
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
}

// ---- 첫 로그인 비밀번호 바꾸기 (must_change_pw) ----
// 로컬은 PASSWORDLESS=1 이라 이 표시를 무시해요. "x-trio-strict: 1" 헤더를 붙이면 배포본처럼 검사해요 (더 엄격해지기만 하는 테스트용 스위치).
{
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
}

// ---- 비밀번호 바꾸기 ----
{
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
}

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
r = await call("a", "POST", "/room", { room: [uidA, "00000000-0000-4000-8000-000000000000"].sort().join(":").replace(/^/, "dm:"), body: "hi" }); ok(r.status === 404, "room: dm with unknown member 404");
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
if (!process.env.SKIP_AI) {
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
} else {
  console.log("SKIP ai chat · brain · weekly review ai (SKIP_AI=1)");
}

// ---------- 논문 스프린트 ----------
{
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
  if (!process.env.SKIP_AI) {
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
}

// ---------- MCP (/mcp) ----------
{
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
  ok(r.data?.result?.protocolVersion === "2025-03-26" && r.data.result.serverInfo?.name === "dsm-mafia", "mcp: initialize echoes supported protocol");
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
}

// ---------- OAuth 2.1 (ChatGPT · claude.ai 커넥터) ----------
{
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
  
}

r = await call("a", "POST", "/auth/logout"); r = await call("a", "GET", "/me"); ok(r.status === 401, "logout");

execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", "DELETE FROM users WHERE username LIKE 't\\_%' ESCAPE '\\'"], { stdio: "ignore" });
console.log("cleaned up test users");

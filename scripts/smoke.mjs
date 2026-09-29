// API smoke test against a running `wrangler dev` (default http://127.0.0.1:8787).
const BASE = process.env.BASE || "http://127.0.0.1:8787";
const jar = {};
async function call(who, method, path, body) {
  const r = await fetch(BASE + "/api" + path, {
    method, headers: { "content-type": "application/json", "x-trio": "1", cookie: jar[who] || "" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get("set-cookie"); if (sc) jar[who] = sc.split(";")[0];
  const data = await r.json().catch(() => null);
  return { status: r.status, data };
}
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };
for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/"); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

import { execFileSync } from "node:child_process";
const tag = Date.now().toString(36).slice(-5);
const mk = (u, n, pw) => execFileSync("node", ["scripts/add-user.mjs", u, n, pw], { stdio: "ignore" });
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
}

r = await call("a", "POST", "/auth/logout"); r = await call("a", "GET", "/me"); ok(r.status === 401, "logout");

execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", "DELETE FROM users WHERE username LIKE 't\\_%' ESCAPE '\\'"], { stdio: "ignore" });
console.log("cleaned up test users");

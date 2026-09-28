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
  r = await call("b", "GET", "/notes/" + n1); ok(r.status === 200, "shared note visible to b");
  r = await call("b", "PUT", "/notes/" + n1, { body: "hack" }); ok(r.status === 403, "b cannot edit a's note");
}
r = await call("a", "POST", "/logs", { day: "2026-09-28", at: "10:00", text: "집중 25분", kind: "focus", mins: 25 });
r = await call("a", "GET", "/logs/focus?from=2026-09-28&to=2026-09-28"); ok(r.data.days.some((d) => d.mins === 25), "focus minutes");

// ---- diary ----
r = await call("a", "PUT", "/diary", { day: "2026-09-28", mood: 4, body: "오늘은 괜찮았다" }); ok(r.data.diary?.mood === 4, "diary saved");
r = await call("a", "GET", "/diary?day=2026-09-28"); ok(r.data.diary?.body === "오늘은 괜찮았다", "diary read");
r = await call("b", "GET", "/diary?day=2026-09-28"); ok(r.data.diary === null, "diary private to owner");
r = await call("a", "PUT", "/diary", { day: "2026-09-28", mood: 9 }); ok(r.status === 400, "bad mood rejected");
r = await call("a", "GET", "/diary/list"); ok(r.data.entries.length === 1, "diary list");

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
  for (const m of ["gemini", "mimo"]) {
    const err = a.ev.find((e) => e.type === "error" && e.model === m);
    ok(a.out(m).length > 5, `ai ${m} answered: ${(a.out(m) || err?.message || "").replace(/\s+/g, " ").slice(0, 60)}`);
  }
  a = await ask("gemini", "방금 설명을 5단어 이내로 줄여 줘", meta.chat_id);
  ok(a.out("gemini").length > 0, "ai follow-up in same chat");
  r = await call("a", "GET", "/ai/chats/" + meta.chat_id); ok(r.data.messages.length >= 4, "chat saved: " + r.data.messages.length + " messages");
  r = await call("b", "GET", "/ai/chats/" + meta.chat_id); ok(r.status === 404, "chat private to owner");
  r = await call("a", "DELETE", "/ai/chats/" + meta.chat_id); ok(r.status === 200, "delete chat");
}

r = await call("a", "POST", "/auth/logout"); r = await call("a", "GET", "/me"); ok(r.status === 401, "logout");

execFileSync("npx", ["wrangler", "d1", "execute", "study-trio", "--local", "--command", "DELETE FROM users WHERE username LIKE 't\\_%' ESCAPE '\\'"], { stdio: "ignore" });
console.log("cleaned up test users");

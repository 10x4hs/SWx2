// MCP 서버 (/mcp, Streamable HTTP · JSON 응답) — 어떤 MCP 클라이언트든(에이전트 · IDE · 데스크톱 앱) 앱을 같이 써요. Cloudflare 에서 돌아요.
// 로그인: Authorization: Bearer <토큰> (scripts/mcp-token.mjs 가 연결마다 하나씩 만들어요). 토큰 = 그 사람 + 연결 이름(agent).
// 도구는 앱 API 를 안에서 그대로 불러요(internal) — 검증 · 권한이 웹 화면과 같아요. 공용 작업판(agent_tasks)만 여기서 직접 다뤄요.

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const STATUSES = ["todo", "doing", "blocked", "done"];
const MAX_LOG = 60;

const INSTRUCTIONS = `Dsm-mafia — 셋이 쓰는 공부 앱(논문 스프린트 · 노트 · 계획)이에요. 이 연결은 한 사람의 계정으로, 에이전트 이름(whoami)이 붙어요.
여러 에이전트가 같이 일할 때는 **작업판**으로 나눠요 (whoami 의 에이전트 이름이 곧 내 이름):
1) 시작할 때 tasks_list 로 열린 일을 보고, 2) 할 일을 고르면 task_claim 으로 맡고(다른 에이전트가 맡은 일은 건드리지 않기),
3) 중간 진행은 task_update(note) 로 짧게 남기고, 4) 끝나면 task_update(status="done", result=무엇을 했는지 · 어디에 남겼는지).
큰 일을 나누려면 task_add(assignee=다른 에이전트 이름 | "anyone"). 결과물(정리 글 등)은 note_write 로 노트에 남기고 result 에 노트 제목을 적어요.
논문 자료는 papers_overview → paper_read(part="summary"|"deep"|"terms", section) 순서로 읽어요. 사용자의 글은 쉬운 한국어 해요체로 써요.`;

const S = (props, required = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });

const TOOLS = [
  { name: "whoami", description: "이 연결이 누구(사용자)이고 어떤 에이전트로 붙었는지, 오늘 날짜(한국 시간).", inputSchema: S({}) },
  // ---- 논문 ----
  { name: "papers_overview", description: "논문 스프린트(10.1–10.5, 16편) 일정 · 파이프라인 단계 · 셋의 진도(읽기/퀴즈/3분 설명).", inputSchema: S({}) },
  { name: "paper_read", description: "논문 자료 읽기. part=summary(요약 · 퀴즈 · 대본) | deep(원문 절별 해설 — section 없이 부르면 목차, section 을 주면 그 절 전체) | terms(용어 사전).",
    inputSchema: S({ paper: str("논문 id(yolov10 …) 또는 제목(YOLOv10)"), part: str("summary | deep | terms", { enum: ["summary", "deep", "terms"] }), section: str("deep 의 절 id (목차에서)") }, ["paper"]) },
  { name: "paper_check", description: "내 진도 체크: 논문 한 편의 단계(read | quiz | explain)를 켜거나 끄기. 셋에게 보여요.",
    inputSchema: S({ paper: str("논문 id 또는 제목"), step: str("read | quiz | explain", { enum: ["read", "quiz", "explain"] }), done: { type: "boolean", description: "기본 true" } }, ["paper", "step"]) },
  // ---- 노트 ----
  { name: "notes_search", description: "내 노트 찾기(제목 · 앞부분). query 없이 부르면 최근 노트.", inputSchema: S({ query: str("찾을 말"), limit: { type: "integer", minimum: 1, maximum: 50 } }) },
  { name: "note_read", description: "노트 하나 읽기 (마크다운 원문).", inputSchema: S({ title: str("노트 제목"), id: str("노트 id") }) },
  { name: "note_write", description: "노트 쓰기. mode=create(새로, 같은 제목이 있으면 실패) | append(끝에 덧붙이기, 기본) | replace(본문 통째로 바꾸기). [[제목]] 링크 · #태그는 그래프에 이어져요.",
    inputSchema: S({ title: str("노트 제목 ([ ] | # 은 못 써요)"), body: str("마크다운 본문"), mode: str("create | append | replace", { enum: ["create", "append", "replace"] }), parent_title: str("create 일 때 상위 페이지 제목 (선택)") }, ["title", "body"]) },
  // ---- 계획 ----
  { name: "plans_list", description: "그날의 계획(시간표 · 체크리스트). day 없으면 오늘.", inputSchema: S({ day: str("YYYY-MM-DD") }) },
  { name: "plan_add", description: "그날 계획 넣기. start(HH:MM)와 mins 를 주면 시간표, start 없으면 체크리스트(mins 만 주면 예상 시간).",
    inputSchema: S({ text: str("할 일"), day: str("YYYY-MM-DD (기본 오늘)"), start: str("HH:MM"), mins: { type: "integer", minimum: 5, maximum: 720 }, priority: { type: ["integer", "string"], description: "우선순위 1(가장 급함) ~ 5(여유). 예전 이름 low|medium|high|xhigh|max 도 돼요" } }, ["text"]) },
  // ---- 공용 작업판 ----
  { name: "tasks_list", description: "에이전트 공용 작업판. status=open(기본: todo · doing · blocked) | all | todo | doing | blocked | done.", inputSchema: S({ status: str("open | all | todo | doing | blocked | done") }) },
  { name: "task_get", description: "작업 하나의 전체 내용과 진행 기록.", inputSchema: S({ id: str("작업 id (앞 6글자 이상)") }, ["id"]) },
  { name: "task_add", description: "작업판에 일 올리기. assignee 로 누가 하면 좋을지(에이전트 이름 또는 anyone).",
    inputSchema: S({ title: str("한 줄 제목"), detail: str("무엇을 · 어디까지 · 끝난 기준"), assignee: str("에이전트 이름 또는 anyone") }, ["title"]) },
  { name: "task_claim", description: "작업 맡기 (status=doing, claimed_by=나). 다른 에이전트가 하는 중이면 실패 — force=true 로만 가져와요.",
    inputSchema: S({ id: str("작업 id"), force: { type: "boolean" } }, ["id"]) },
  { name: "task_update", description: "진행 기록 남기기 · 상태 바꾸기. 끝낼 땐 status=done 과 result(무엇을 했고 어디에 남겼는지).",
    inputSchema: S({ id: str("작업 id"), status: str("todo | doing | blocked | done", { enum: STATUSES }), note: str("진행 기록 한두 줄"), result: str("끝낸 결과 요약") }, ["id"]) },
];

class ToolError extends Error {}
const bad = (m) => { throw new ToolError(m); };
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const kstTime = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STEP_MARK = (c = {}) => ["read", "quiz", "explain"].map((k) => (c[k] ? "✓" : "·")).join("");

export function mcpTools() { return TOOLS; }

export async function handleMcp(req, env, ec, deps) {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  if (req.method === "GET") return new Response("이 MCP 서버는 POST 만 받아요 (Streamable HTTP, JSON 응답).", { status: 405, headers: { allow: "POST, DELETE" } });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST, DELETE" } });

  const auth = (req.headers.get("authorization") || "").match(/^Bearer\s+([A-Za-z0-9_-]{32,64})$/);
  const who = auth ? await deps.tokenUser(env, auth[1]) : null;
  if (!who) {
    // OAuth 클라이언트(ChatGPT 등)는 이 헤더를 보고 인증 서버를 찾아가요 (RFC 9728)
    const origin = new URL(req.url).origin;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "로그인이 필요해요. OAuth 로 연결하거나, 앱의 프로필 → MCP 연결에서 받은 Bearer 토큰을 넣어 주세요." } }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "www-authenticate": `Bearer realm="dsm-mafia", resource_metadata="${origin}/.well-known/oauth-protected-resource"${auth ? ', error="invalid_token"' : ""}` },
    });
  }

  let msg;
  try { msg = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON 이 아니에요." } }, 400); }
  const batch = Array.isArray(msg), list = batch ? msg : [msg];
  const out = [];
  for (const m of list) {
    const r = await one(m, env, ec, deps, who, req);
    if (r) out.push(r);
  }
  if (!out.length) return new Response(null, { status: 202 });
  return json(batch ? out : out[0]);
}

async function one(m, env, ec, deps, who, req) {
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return m?.id != null ? { jsonrpc: "2.0", id: m.id, error: { code: -32600, message: "잘못된 요청이에요." } } : null;
  const reply = (result) => (m.id == null ? null : { jsonrpc: "2.0", id: m.id, result });
  const error = (code, message) => (m.id == null ? null : { jsonrpc: "2.0", id: m.id, error: { code, message } });
  switch (m.method) {
    case "initialize": {
      const want = m.params?.protocolVersion;
      return reply({ protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "dsm-mafia", title: "Dsm-mafia 공부 앱", version: "1.0.0" }, instructions: INSTRUCTIONS });
    }
    case "ping": return reply({});
    case "tools/list": return reply({ tools: TOOLS });
    case "tools/call": {
      const name = m.params?.name, args = m.params?.arguments || {};
      if (!TOOLS.some((t) => t.name === name)) return error(-32602, `없는 도구예요: ${name}`);
      try {
        const text = await CALL[name](args, { env, ec, deps, who, origin: new URL(req.url).origin });
        return reply({ content: [{ type: "text", text: String(text) }] });
      } catch (e) {
        const msgText = e instanceof ToolError || e?.status ? e.message : "서버에서 문제가 생겼어요: " + (e?.message || e);
        if (!(e instanceof ToolError) && !e?.status) console.error("mcp", name, e);
        return reply({ content: [{ type: "text", text: msgText }], isError: true });
      }
    }
    default:
      if (m.method.startsWith("notifications/")) return null;
      return error(-32601, `모르는 방법이에요: ${m.method}`);
  }
}

// ---------- 도구 ----------
const asset = async (c, path) => {
  const r = await c.env.ASSETS.fetch(new Request(new URL(path, c.origin)));
  return r.ok ? r.json() : null;
};
async function paperOf(c, key) {
  const idx = await asset(c, "/papers/index.json");
  const k = String(key || "").trim().toLowerCase();
  const p = idx.papers.find((x) => x.id === k || x.title.toLowerCase() === k || x.title.toLowerCase().replace(/[\s.-]/g, "") === k.replace(/[\s.-]/g, ""));
  if (!p) bad(`논문을 못 찾았어요: ${key}. 쓸 수 있는 것: ${idx.papers.map((x) => x.id).join(", ")}`);
  return { idx, p };
}
const api = async (c, method, path, body) => {
  const r = await c.deps.internal(c.env, c.ec, c.origin, c.who.user, method, path, body);
  if (r.status >= 400) bad(r.data?.error || `요청 실패 (${r.status})`);
  return r.data;
};
const plain = (s) => String(s || "").replace(/\*\*/g, "");
const shortId = (id) => id.slice(0, 8);

async function taskOf(c, id) {
  const k = String(id || "").trim();
  if (k.length < 6) bad("작업 id 를 6글자 이상 적어 주세요.");
  const { results } = await c.env.DB.prepare("SELECT * FROM agent_tasks WHERE user_id = ? AND id LIKE ? LIMIT 2").bind(c.who.user.id, k + "%").all();
  if (!results.length) bad(`작업을 못 찾았어요: ${k}`);
  if (results.length > 1) bad("그 앞글자로 시작하는 작업이 여럿이에요. 더 길게 적어 주세요.");
  return results[0];
}
const taskLine = (t) => `- [${shortId(t.id)}] **${t.title}** — ${t.status}${t.claimed_by ? ` · 맡음: ${t.claimed_by}` : ""} · 담당 희망: ${t.assignee} · ${kstTime(t.updated_at)}`;
async function saveTask(c, t, logText) {
  let log = [];
  try { log = JSON.parse(t.log || "[]"); } catch {}
  if (logText) log.push({ at: Date.now(), agent: c.who.agent, text: String(logText).slice(0, 1000) });
  log = log.slice(-MAX_LOG);
  t.updated_at = Date.now();
  await c.env.DB.prepare("UPDATE agent_tasks SET status = ?, claimed_by = ?, result = ?, log = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(t.status, t.claimed_by, t.result, JSON.stringify(log), t.updated_at, t.id, c.who.user.id).run();
  return t;
}

const CALL = {
  async whoami(_, c) {
    return `사용자: ${c.who.user.display_name} (@${c.who.user.username})\n에이전트: ${c.who.agent}\n오늘(한국 시간): ${kstDay()}\n\n${INSTRUCTIONS}`;
  },

  async papers_overview(_, c) {
    const idx = await asset(c, "/papers/index.json"), prog = await api(c, "GET", "/papers/progress");
    const byId = Object.fromEntries(idx.papers.map((p) => [p.id, p]));
    const me = prog.members.find((m) => m.user_id === c.who.user.id);
    const lines = [`# 논문 스프린트 ${idx.start} → ${idx.until} (${prog.ended ? "끝남" : `오늘 ${prog.today}`})`, `끝났다는 기준: ${idx.goal}`, `표시: 읽기·퀴즈·3분설명 (✓ = 끝냄)`, ""];
    lines.push("## 셋의 진도", ...prog.members.map((m) => `- ${m.name}${m.user_id === me?.user_id ? " (나)" : ""}: ${m.done}/${prog.total}칸`), "");
    for (const d of idx.days) {
      lines.push(`## ${d.label} — ${d.theme}${d.day === prog.today ? " ← 오늘" : ""}`);
      for (const id of d.papers) lines.push(`- ${byId[id].title} (\`${id}\`, ${idx.stages.find((s) => s.n === byId[id].stage).label}) — ${prog.members.map((m) => `${m.name} ${STEP_MARK(m.checks[id])}`).join(" · ")}`);
      lines.push("");
    }
    lines.push("## 파이프라인", idx.stages.map((s) => `${s.n}. ${s.label}`).join(" → "));
    return lines.join("\n");
  },

  async paper_read(a, c) {
    const { p } = await paperOf(c, a.paper);
    const part = a.part || "summary";
    if (part === "terms") {
      const t = await asset(c, `/papers/content/${p.id}.terms.json`);
      if (!t) bad("이 논문 용어 사전이 아직 없어요.");
      return `# ${p.title} 용어 (${t.terms.length}개)\n\n` + t.terms.map((x) => `- **${x.term}** — ${x.easy}${x.more ? ` ${x.more}` : ""}${x.example ? ` (예: ${x.example})` : ""}`).join("\n");
    }
    if (part === "deep") {
      const d = await asset(c, `/papers/content/${p.id}.deep.json`);
      if (!d) bad("이 논문의 자세히 읽기가 아직 없어요.");
      if (!a.section) {
        return [`# ${p.title} — 자세히 읽기 목차 (${d.sections.length}절, 약 ${d.reading_minutes || "?"}분)`, "section 에 아래 id 를 넣어 다시 부르면 그 절 전체를 읽어요.", "",
          ...d.sections.map((s) => `- \`${s.id}\` ${s.title} — ${s.summary || ""} (${s.source || ""})`),
          "", "## 처음부터 끝까지 (숫자 예시)", d.walkthrough || "-", "", "## 자주 묻는 질문", ...(d.faq || []).map((f) => `- Q. ${f.q}\n  A. ${f.a}`), "", "## 연결", d.connections || "-"].join("\n");
      }
      const s = d.sections.find((x) => x.id === a.section);
      if (!s) bad(`그런 절이 없어요: ${a.section}. 목차: ${d.sections.map((x) => x.id).join(", ")}`);
      return [`# ${p.title} · ${s.title}`, `(${s.source || ""}) ${s.summary || ""}`, "", s.body,
        s.how_it_works?.length ? `\n### 어떻게 작동하나\n${s.how_it_works.map((h, i) => `${i + 1}. ${h}`).join("\n")}` : "",
        s.why ? `\n### 왜 이렇게 설계했나\n${s.why}` : "",
        s.tables?.length ? `\n### 표\n${s.tables.map((t) => `- ${t.name} (${t.compares || ""}): ${t.takeaway || ""} ${t.numbers ? `[${t.numbers}]` : ""}`).join("\n")}` : "",
        s.pitfalls?.length ? `\n### 흔한 오해\n${s.pitfalls.map((x) => `- ${x}`).join("\n")}` : "",
        s.check ? `\n### 스스로 확인\n${s.check}` : ""].filter(Boolean).join("\n");
    }
    const x = await asset(c, `/papers/content/${p.id}.json`);
    if (!x) bad("이 논문 자료가 아직 없어요.");
    return [`# ${x.full_title || x.title} (${x.year}, ${x.venue || ""})`, `분야: ${x.field} · 앱 페이지: ${c.origin}/#/papers/${p.id}`, "",
      `**한 줄**: ${plain(x.one_line)}`, `**쉽게 말하면**: ${plain(x.analogy).replace(/^\s*쉽게 말하면\s*[—–:,-]?\s*/, "")}`, "", "## 무엇이 문제였나", plain(x.problem), "",
      "## 핵심 아이디어", ...(x.idea || []).map((i, n) => `${n + 1}. **${plain(i.title)}** — ${plain(i.body)}`), "",
      "## 결과", ...(x.results || []).map((r) => `- ${r.label}: ${r.value} (${r.note || ""})`), "",
      "## 우리 파이프라인에서", plain(x.pipeline_role), "", "## 조심할 점", ...(x.caveats || []).map((v) => `- ${plain(v)}`), "",
      "## 3분 설명 대본", plain(x.script_3min), "", `핵심어: ${(x.keywords_3min || []).join(" · ")}`, "",
      "## 퀴즈 (정답 포함)", ...(x.quiz || []).map((q, n) => `${n + 1}. ${plain(q.q)}\n${q.choices.map((ch, j) => `   ${"ABCD"[j]}. ${plain(ch)}`).join("\n")}\n   정답 ${"ABCD"[q.answer]} — ${plain(q.why)}`), "",
      "## 영상", ...(x.videos || []).map((v) => `- ${v.title} (${v.channel}, ${v.lang}) https://www.youtube.com/watch?v=${v.youtube}`), "",
      `원문: ${x.links?.arxiv || ""} · 코드: ${x.links?.code || ""}`].join("\n");
  },

  async paper_check(a, c) {
    const { p } = await paperOf(c, a.paper);
    const r = await api(c, "PUT", "/papers/check", { paper: p.id, step: a.step, done: a.done !== false });
    const me = r.members.find((m) => m.user_id === c.who.user.id);
    return `${p.title} · ${a.step} ${a.done !== false ? "체크했어요" : "체크를 풀었어요"}. 지금 ${STEP_MARK(me?.checks[p.id])} · 전체 ${me?.done}/${r.total}칸`;
  },

  async notes_search(a, c) {
    const { notes } = await api(c, "GET", "/notes");
    const q = String(a.query || "").trim().toLowerCase(), lim = Math.min(50, a.limit || 20);
    const hit = (q ? notes.filter((n) => n.title.toLowerCase().includes(q) || (n.snippet || "").toLowerCase().includes(q)) : notes).slice(0, lim);
    if (!hit.length) return q ? `'${a.query}' 가 들어간 노트가 없어요.` : "노트가 없어요.";
    return hit.map((n) => `- ${n.title} (id ${n.id}) — ${String(n.snippet || "").replace(/\s+/g, " ").slice(0, 90)}`).join("\n");
  },

  async note_read(a, c) {
    let id = a.id;
    if (!id && a.title) id = (await api(c, "GET", "/notes/resolve?title=" + encodeURIComponent(a.title))).id;
    if (!id) bad(a.title ? `'${a.title}' 노트가 없어요.` : "title 이나 id 를 주세요.");
    const { note, children = [], backlinks = [] } = await api(c, "GET", "/notes/" + encodeURIComponent(id));
    return [`# ${note.title}`, `id ${note.id} · 수정 ${kstTime(note.updated_at)}${children.length ? ` · 하위 ${children.map((x) => x.title).join(", ")}` : ""}${backlinks.length ? ` · 여기로 오는 링크 ${backlinks.length}개` : ""}`, "", note.body].join("\n");
  },

  async note_write(a, c) {
    const mode = a.mode || "append", title = String(a.title || "").trim(), body = String(a.body || "");
    if (!title || !body.trim()) bad("title 과 body 를 주세요.");
    const found = (await api(c, "GET", "/notes/resolve?title=" + encodeURIComponent(title))).id;
    if (mode === "create" || !found) {
      if (found) bad(`'${title}' 노트가 이미 있어요. mode="append" 나 "replace" 로 써 주세요.`);
      let parent_id = null;
      if (a.parent_title) { parent_id = (await api(c, "GET", "/notes/resolve?title=" + encodeURIComponent(a.parent_title))).id; if (!parent_id) bad(`상위 페이지 '${a.parent_title}' 가 없어요.`); }
      const r = await api(c, "POST", "/notes", { title, body: body.trimEnd() + `\n\n_— ${c.who.agent}, ${kstTime(Date.now())}_\n`, parent_id });
      return `새 노트를 만들었어요: ${title} (id ${r.note.id}) · ${c.origin}/#/notes/${r.note.id}`;
    }
    const { note } = await api(c, "GET", "/notes/" + encodeURIComponent(found));
    const next = mode === "replace" ? body : `${note.body.trimEnd()}\n\n${body.trim()}\n\n_— ${c.who.agent}, ${kstTime(Date.now())}_\n`;
    await api(c, "PUT", "/notes/" + encodeURIComponent(found), { body: next });
    return `${mode === "replace" ? "본문을 바꿨어요" : "끝에 덧붙였어요"}: ${title} · ${c.origin}/#/notes/${found}`;
  },

  async plans_list(a, c) {
    const day = DAY.test(a.day || "") ? a.day : kstDay();
    const { plans } = await api(c, "GET", "/plans?periods=D:" + day);
    if (!plans.length) return `${day} 계획이 없어요.`;
    const PRIO_N = { max: 1, xhigh: 2, high: 3, medium: 4, low: 5 };
    const fmt = (p) => `- [${p.done ? "x" : " "}] ${p.start ? `${p.start} (${p.mins || "?"}분) ` : p.mins ? `(예상 ${p.mins}분) ` : ""}${p.text}${p.priority ? ` · ${PRIO_N[p.priority]}순위` : ""}`;
    const timed = plans.filter((p) => p.start), todo = plans.filter((p) => !p.start);
    return [`# ${day}`, timed.length ? "## 시간표" : "", ...timed.map(fmt), todo.length ? "## 체크리스트" : "", ...todo.map(fmt)].filter(Boolean).join("\n");
  },

  async plan_add(a, c) {
    const day = DAY.test(a.day || "") ? a.day : kstDay();
    const r = await api(c, "POST", "/plans", { scope: "day", period: "D:" + day, text: a.text, ...(a.start ? { start: a.start, mins: a.mins || 30 } : a.mins ? { mins: a.mins } : {}), ...(a.priority ? { priority: a.priority } : {}) });
    return `${day}에 넣었어요: ${r.plan.start ? r.plan.start + " " : ""}${r.plan.text}`;
  },

  async tasks_list(a, c) {
    const st = a.status || "open";
    const where = st === "all" ? "" : st === "open" ? "AND status != 'done'" : STATUSES.includes(st) ? "AND status = ?" : bad("status 는 open | all | todo | doing | blocked | done 이에요.");
    const stmt = c.env.DB.prepare(`SELECT * FROM agent_tasks WHERE user_id = ? ${where} ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'blocked' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END, updated_at DESC LIMIT 80`);
    const { results } = await (STATUSES.includes(st) ? stmt.bind(c.who.user.id, st) : stmt.bind(c.who.user.id)).all();
    if (!results.length) return st === "open" ? "열린 작업이 없어요. task_add 로 올려요." : "작업이 없어요.";
    return `작업판 (${st}) · 나는 ${c.who.agent}\n` + results.map(taskLine).join("\n");
  },

  async task_get(a, c) {
    const t = await taskOf(c, a.id);
    let log = []; try { log = JSON.parse(t.log || "[]"); } catch {}
    return [taskLine(t), `id ${t.id} · 올린 이: ${t.created_by} · ${kstTime(t.created_at)}`, "", t.detail || "(설명 없음)", t.result ? `\n결과: ${t.result}` : "",
      log.length ? `\n## 진행 기록\n${log.map((l) => `- ${kstTime(l.at)} ${l.agent}: ${l.text}`).join("\n")}` : ""].join("\n");
  },

  async task_add(a, c) {
    const title = String(a.title || "").trim().slice(0, 200);
    if (!title) bad("title 을 주세요.");
    const assignee = /^[a-z0-9][a-z0-9._-]{0,31}$/i.test(String(a.assignee || "")) ? String(a.assignee).toLowerCase() : "anyone";
    const t = { id: crypto.randomUUID(), now: Date.now() };
    await c.env.DB.prepare("INSERT INTO agent_tasks (id, user_id, title, detail, assignee, status, log, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?)")
      .bind(t.id, c.who.user.id, title, a.detail ? String(a.detail).slice(0, 4000) : null, assignee, JSON.stringify([{ at: t.now, agent: c.who.agent, text: "올림" }]), c.who.agent, t.now, t.now).run();
    return `올렸어요 [${shortId(t.id)}] ${title} · 담당 희망: ${assignee}`;
  },

  async task_claim(a, c) {
    const t = await taskOf(c, a.id);
    if (t.status === "done") bad("이미 끝난 작업이에요.");
    if (t.status === "doing" && t.claimed_by && t.claimed_by !== c.who.agent && !a.force) bad(`${t.claimed_by} 가 하는 중이에요. 정말 가져오려면 force=true.`);
    const from = t.claimed_by && t.claimed_by !== c.who.agent ? ` (${t.claimed_by} 에게서 가져옴)` : "";
    t.status = "doing"; t.claimed_by = c.who.agent;
    await saveTask(c, t, "맡음" + from);
    return `맡았어요 [${shortId(t.id)}] ${t.title}${from}`;
  },

  async task_update(a, c) {
    const t = await taskOf(c, a.id);
    if (a.status && !STATUSES.includes(a.status)) bad("status 는 todo | doing | blocked | done 이에요.");
    if (!a.status && !a.note && !a.result) bad("status · note · result 중 하나는 주세요.");
    if (t.status === "doing" && t.claimed_by && t.claimed_by !== c.who.agent && a.status) bad(`${t.claimed_by} 가 맡은 작업이에요. 기록(note)만 남길 수 있어요.`);
    const bits = [];
    if (a.status) { bits.push(`${t.status} → ${a.status}`); t.status = a.status; if (a.status === "doing" && !t.claimed_by) t.claimed_by = c.who.agent; if (a.status === "todo") t.claimed_by = null; }
    if (a.result) { t.result = String(a.result).slice(0, 4000); bits.push("결과: " + t.result.slice(0, 200)); }
    if (a.note) bits.push(String(a.note));
    await saveTask(c, t, bits.join(" · "));
    return `기록했어요 [${shortId(t.id)}] ${t.title} — ${t.status}${t.claimed_by ? ` · ${t.claimed_by}` : ""}`;
  },
};

// ---------- 내 MCP 연결 (웹 화면에서 각자 토큰 받기 · 끊기) ----------
// 원문 토큰은 만들 때 한 번만 돌려주고, DB 에는 SHA-256 만. 연결 이름(agent)은 사람마다 겹치지 않게(같은 이름이면 새 토큰으로 바꿔요).
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const MAX_TOKENS = 10;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function registerMcpTokens(on, { json, body, fail, now }) {
  on("GET", "/mcp/tokens", async ({ env, url, user }) => {
    const [{ results }, { results: grants }] = await env.DB.batch([
      env.DB.prepare("SELECT agent, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at").bind(user.id),
      env.DB.prepare(`SELECT c.client_id, c.client_name, MIN(t.created_at) AS created_at, MAX(t.last_used_at) AS last_used_at FROM oauth_tokens t JOIN oauth_clients c ON c.client_id = t.client_id
        WHERE t.user_id = ? AND t.refresh_expires > ? GROUP BY c.client_id ORDER BY created_at`).bind(user.id, now()),
    ]);
    return json({ url: new URL("/mcp", url.origin).toString(), tokens: results, oauth: grants, tools: TOOLS.map((t) => ({ name: t.name, description: t.description })) });
  });
  // OAuth 로 붙은 앱(ChatGPT 등) 끊기: 그 앱이 받은 내 토큰을 전부 지워요
  on("DELETE", "/mcp/oauth/:client", async ({ env, user, params }) => {
    const r = await env.DB.prepare("DELETE FROM oauth_tokens WHERE user_id = ? AND client_id = ?").bind(user.id, params.client).run();
    return json({ removed: (r.meta?.changes || 0) > 0 });
  });
  on("POST", "/mcp/tokens", async ({ req, env, url, user }) => {
    const b = await body(req);
    const name = String(b.name || "").trim().toLowerCase();
    if (!NAME_RE.test(name)) fail(400, "연결 이름은 영문 소문자 · 숫자 · . _ - 로 32자까지예요 (예: claude-code, cursor, laptop).");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ? AND agent != ?").bind(user.id, name).first();
    if (n.n >= MAX_TOKENS) fail(400, `연결은 ${MAX_TOKENS}개까지예요. 안 쓰는 연결을 먼저 끊어 주세요.`);
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare(`INSERT INTO api_tokens (token_hash, user_id, agent, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, agent) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, last_used_at = NULL`).bind(await sha256(token), user.id, name, now()).run();
    return json({ name, token, url: new URL("/mcp", url.origin).toString() }, 201);
  });
  on("DELETE", "/mcp/tokens/:name", async ({ env, user, params }) => {
    const r = await env.DB.prepare("DELETE FROM api_tokens WHERE user_id = ? AND agent = ?").bind(user.id, String(params.name).toLowerCase()).run();
    return json({ removed: (r.meta?.changes || 0) > 0 });
  });
}

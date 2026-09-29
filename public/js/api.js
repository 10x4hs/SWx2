// Thin fetch wrapper for the Worker API.

export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-trio": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/me" && !path.startsWith("/auth")) window.dispatchEvent(new CustomEvent("trio:logout"));
    throw new ApiError(res.status, data.error || "요청을 처리하지 못했어요.", data);
  }
  return data;
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "")).toString();

export const api = {
  me: () => request("GET", "/me"),
  login: (username, password) => request("POST", "/auth/login", { username, password }),
  signup: (b) => request("POST", "/auth/signup", b),
  logout: () => request("POST", "/auth/logout"),
  updateMe: (b) => request("PATCH", "/me", b),
  users: () => request("GET", "/users"),

  plans: (periods, user) => request("GET", "/plans?" + qs({ periods: periods.join(","), user })),
  addPlan: (b) => request("POST", "/plans", b),
  updatePlan: (id, b) => request("PATCH", "/plans/" + id, b),
  deletePlan: (id) => request("DELETE", "/plans/" + id),
  carry: (scope, from, to) => request("POST", "/plans/carry", { scope, from, to }),
  heatmap: (year, user) => request("GET", "/plans/heatmap?" + qs({ year, user })),
  summary: (periods) => request("GET", "/summary?" + qs({ periods: periods.join(",") })),

  logs: (day, user) => request("GET", "/logs?" + qs({ day, user })),
  addLog: (b) => request("POST", "/logs", b),
  updateLog: (id, b) => request("PATCH", "/logs/" + id, b),
  deleteLog: (id) => request("DELETE", "/logs/" + id),

  notes: (tag) => request("GET", "/notes?" + qs({ tag })),
  note: (id) => request("GET", "/notes/" + id),
  resolve: (title) => request("GET", "/notes/resolve?" + qs({ title })),
  addNote: (b) => request("POST", "/notes", b),
  saveNote: (id, b) => request("PUT", "/notes/" + id, b),
  deleteNote: (id) => request("DELETE", "/notes/" + id),
  graph: () => request("GET", "/graph"),
  organize: (note_id) => request("POST", "/ai/organize", { note_id }),
  generate: (b) => request("POST", "/ai/generate", b),
  tags: () => request("GET", "/tags"),
  search: (q) => request("GET", "/search?" + qs({ q })),
  focus: (from, to, user) => request("GET", "/logs/focus?" + qs({ from, to, user })),

  diary: (day) => request("GET", "/diary?" + qs({ day })),
  saveDiary: (b) => request("PUT", "/diary", b),
  diaryDays: (year) => request("GET", "/diary/days?" + qs({ year })),
  diaries: (before) => request("GET", "/diary/list?" + qs({ before })),
  record: (day) => request("GET", "/records?" + qs({ day })),
  saveRecord: (day) => request("POST", "/records", { day }),
  recordDays: (year) => request("GET", "/records/days?" + qs({ year })),

  // 영어 (ENGLISH-OS) — 나만 보는 하루 기록 · 막힌 표현 · 복습 카드
  englishDay: (day) => request("GET", "/english/day?" + qs({ day })),
  saveEnglishDay: (b) => request("PUT", "/english/day", b),
  englishDays: (from, to) => request("GET", "/english/days?" + qs({ from, to })),
  phrases: () => request("GET", "/english/phrases"),
  addPhrase: (b) => request("POST", "/english/phrases", b),
  deletePhrase: (id) => request("DELETE", "/english/phrases/" + encodeURIComponent(id)),
  cards: () => request("GET", "/english/cards"),
  reviewCard: (b) => request("POST", "/english/cards/review", b),

  aiModels: () => request("GET", "/ai/models"),
  chats: () => request("GET", "/ai/chats"),
  chat: (id) => request("GET", "/ai/chats/" + id),
  renameChat: (id, title) => request("PATCH", "/ai/chats/" + id, { title }),
  deleteChat: (id) => request("DELETE", "/ai/chats/" + id),
};

// AI 답을 스트리밍으로 받아요. onEvent({type, model, text, ...})
export async function streamChat(payload, onEvent, signal) {
  let res;
  try {
    res = await fetch("/api/ai/chat", {
      method: "POST", credentials: "same-origin", signal,
      headers: { "content-type": "application/json", "x-trio": "1" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    if (e.name === "AbortError") return;
    throw new ApiError(0, "서버에 연결할 수 없어요.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) window.dispatchEvent(new CustomEvent("trio:logout"));
    throw new ApiError(res.status, data.error || "질문을 보내지 못했어요.");
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = block.split("\n").find((l) => l.startsWith("data: "));
        if (line) { try { onEvent(JSON.parse(line.slice(6))); } catch {} }
      }
    }
  } catch (e) { if (e.name !== "AbortError") throw e; }
}

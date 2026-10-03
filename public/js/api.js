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
    // 스터디장이 정해 준 비밀번호를 아직 안 바꿨으면: 비밀번호 창을 띄우고, 화면마다 오류를 띄우지 않게 조용히 실패해요
    if (res.status === 403 && data.must_change_password) {
      window.dispatchEvent(new CustomEvent("trio:must-change"));
      throw new ApiError(403, "", data);
    }
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
  changePassword: (current, next) => request("POST", "/auth/password", { current, next }),
  updateMe: (b) => request("PATCH", "/me", b),
  users: () => request("GET", "/users"),

  plans: (periods, user, days) => request("GET", "/plans?" + qs({ periods: periods.join(","), user, days })), // days = "YYYY-MM-DD..YYYY-MM-DD"
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
  linkNote: (id, title) => request("POST", "/notes/" + id + "/link", { title }),
  unlinkNote: (id, title) => request("DELETE", "/notes/" + id + "/link?" + qs({ title })),
  askAi: (b) => request("POST", "/ai/ask", b),
  planAi: (b) => request("POST", "/ai/plan", b),
  aiCommand: (b) => request("POST", "/ai/command", b),
  pushKey: () => request("GET", "/push/key"),
  pushSubscribe: (b) => request("POST", "/push/subscribe", b),
  pushUnsubscribe: (b) => request("DELETE", "/push/subscribe", b),
  graph: () => request("GET", "/graph"),
  organize: (note_id, model) => request("POST", "/ai/organize", { note_id, model }),
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
  saveSelfScore: (day, self) => request("PUT", "/records/self", { day, self }),
  recentRecords: (to, days = 14) => request("GET", "/records/recent?" + qs({ to, days })),
  recordDays: (year) => request("GET", "/records/days?" + qs({ year })),

  // 캘린더 — 한 달 칸 요약 · 하루 한 페이지 (본인만)
  calendar: (from, to) => request("GET", "/calendar?" + qs({ from, to })),
  calendarDay: (day) => request("GET", "/calendar/day?" + qs({ day })),

  // 같이 하기 — 숫자·상태만 (내용은 비공개)
  presence: () => request("GET", "/presence"),
  setPresence: (b) => request("PUT", "/presence", b),
  cheers: (day) => request("GET", "/cheers?" + qs({ day })),
  cheer: (to) => request("POST", "/cheers", { to }),
  reviewWeek: (week) => request("GET", "/review/week?" + qs({ week })),
  reviewWeekAi: (week) => request("POST", "/review/week/ai", { week }),

  // 영어 (ENGLISH-OS) — 나만 보는 하루 기록 · 막힌 표현 · 복습 카드
  englishDay: (day) => request("GET", "/english/day?" + qs({ day })),
  saveEnglishDay: (b) => request("PUT", "/english/day", b),
  englishDays: (from, to) => request("GET", "/english/days?" + qs({ from, to })),
  phrases: () => request("GET", "/english/phrases"),
  addPhrase: (b) => request("POST", "/english/phrases", b),
  deletePhrase: (id) => request("DELETE", "/english/phrases/" + encodeURIComponent(id)),
  cards: () => request("GET", "/english/cards"),
  reviewCard: (b) => request("POST", "/english/cards/review", b),
  papersProgress: () => request("GET", "/papers/progress"),
  easyState: () => request("GET", "/papers/easy"),
  easyRead: (paper, recall, total) => request("PUT", "/papers/easy/read", { paper, recall, total }),
  easyReview: (results) => request("PUT", "/papers/easy/review", { results }),
  paperCheck: (paper, step, done) => request("PUT", "/papers/check", { paper, step, done }),
  paperNote: (paper, text) => request("PUT", "/papers/note", { paper, text }),
  paperQuiz: (paper, correct) => request("POST", "/papers/quiz", { paper, correct }),
  paperExplain: (paper, text) => request("POST", "/papers/explain", { paper, text }),
  paperAsk: (paper, messages) => request("POST", "/papers/ask?stream=0", { paper, messages }),
  papersObsidian: () => request("POST", "/papers/obsidian"),
  homePad: (day) => request("GET", "/home/pad" + (day ? "?day=" + day : "")),
  savePledge: (text, day) => request("PUT", "/home/pledge", { text, day }),
  saveMemo: (text) => request("PUT", "/home/memo", { text }),
  mcpTokens: () => request("GET", "/mcp/tokens"),
  mcpCreate: (name) => request("POST", "/mcp/tokens", { name }),
  mcpRevoke: (name) => request("DELETE", "/mcp/tokens/" + encodeURIComponent(name)),
  mcpRevokeOAuth: (client) => request("DELETE", "/mcp/oauth/" + encodeURIComponent(client)),

  // 대화방 (셋이 같이 쓰는 방 하나) · 창고 (책 · 링크 · 영상)
  // room: 'all'(우리 셋) 또는 'dm:<id>:<id>'(두 사람, id 정렬). 안 주면 'all'.
  room: (since, limit, room) => request("GET", "/room?" + qs({ since, limit, room })),
  sendRoom: (b) => request("POST", "/room", b),
  retryRoomAi: (message_id, room) => request("POST", "/room/ai", { message_id, room }),
  deleteRoomMessage: (id, room) => request("DELETE", "/room/" + encodeURIComponent(id) + "?" + qs({ room })),
  readRoom: (at, room) => request("PUT", "/room/read", { at, room }),
  roomUnread: () => request("GET", "/room/unread"),
  roomSettings: (b) => request("PUT", "/room/settings", b),
  libraryPreview: (b) => request("POST", "/library/preview", b),
  library: (kind, q) => request("GET", "/library?" + qs({ kind, q })),
  addLibrary: (b) => request("POST", "/library", b),
  markLibrary: (id, b) => request("PUT", "/library/" + encodeURIComponent(id) + "/mark", b),
  shareLibrary: (id) => request("POST", "/library/" + encodeURIComponent(id) + "/share"),
  deleteLibrary: (id) => request("DELETE", "/library/" + encodeURIComponent(id)),

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
    if (res.status === 403 && data.must_change_password) { window.dispatchEvent(new CustomEvent("trio:must-change")); throw new ApiError(403, "", data); }
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

// 논문 튜터 답을 글자 단위로 받아요. onEvent({type:"delta"|"reset"|"end"|"error", …})
export async function streamPaperAsk(paper, messages, onEvent, signal) {
  let res;
  try {
    res = await fetch("/api/papers/ask", { method: "POST", credentials: "same-origin", signal, headers: { "content-type": "application/json", "x-trio": "1" }, body: JSON.stringify({ paper, messages }) });
  } catch (e) { if (e.name === "AbortError") return; throw new ApiError(0, "서버에 연결할 수 없어요."); }
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw new ApiError(res.status, data.error || "질문을 보내지 못했어요.", data); }
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

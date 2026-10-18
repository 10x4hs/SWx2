// Thin fetch wrapper for the Worker API.

export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}

// 화면을 막 열 때(navStart 뒤 1.5초, 아직 아무것도 누르지 않았을 때) 부른 GET 은 x-swr 를 붙여요
// → 서비스 워커가 받아 둔 답을 바로 주고 뒤에서 새로 받아요 (sw.js). 그 밖의 GET(누르고 나서 · 실시간 새로고침)은 늘 서버 먼저.
// 대화방(/room)은 실시간이라 언제나 서버 먼저.
let swrUntil = 0;
export function navStart() { swrUntil = performance.now() + 1500; }
for (const t of ["pointerdown", "keydown"]) addEventListener(t, () => { swrUntil = 0; }, { capture: true, passive: true });

async function request(method, path, body) {
  let res;
  const headers = { "content-type": "application/json", "x-trio": "1" };
  if (method === "GET" && performance.now() < swrUntil && !path.startsWith("/room")) headers["x-swr"] = "1";
  try {
    res = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers,
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
  unimpersonate: () => request("POST", "/auth/unimpersonate"),
  teams: () => request("GET", "/teams"),
  createTeam: (name) => request("POST", "/teams", { name }),
  joinTeam: (code) => request("POST", "/teams/join", { code }),
  updateTeam: (id, b) => request("PATCH", `/teams/${id}`, b),
  leaveTeam: (id, uid) => request("DELETE", `/teams/${id}/members/${uid}`),
  adminUsers: () => request("GET", "/admin/users"),
  adminApprove: (id) => request("POST", `/admin/users/${id}/approve`),
  adminReject: (id) => request("POST", `/admin/users/${id}/reject`),
  adminSuspend: (id, on) => request("POST", `/admin/users/${id}/suspend`, { on }),
  adminDelete: (id) => request("DELETE", `/admin/users/${id}`),
  adminResetPassword: (id) => request("POST", `/admin/users/${id}/reset-password`),
  adminImpersonate: (id) => request("POST", `/admin/users/${id}/impersonate`),
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
  importNotes: (items) => request("POST", "/notes/import", { items }),
  saveNote: (id, b) => request("PUT", "/notes/" + id, b),
  noteVersions: (id) => request("GET", "/notes/" + id + "/versions"),
  noteVersion: (id, vid) => request("GET", "/notes/" + id + "/versions/" + vid),
  restoreNote: (id, vid) => request("POST", "/notes/" + id + "/versions/" + vid + "/restore"),
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
  aiPage: (b) => request("POST", "/ai/page", b), // { purpose, hub? } 새 페이지 · { note_id, instruction } 고쳐 쓰기
  // Dock 사용자 페이지 (sandbox iframe 에서 도는 HTML 한 파일)
  pages: () => request("GET", "/pages"),
  page: (id) => request("GET", "/pages/" + encodeURIComponent(id)),
  pageVersions: (id) => request("GET", `/pages/${encodeURIComponent(id)}/versions`),
  addPage: (b) => request("POST", "/pages", b),
  updatePage: (id, b) => request("PATCH", "/pages/" + encodeURIComponent(id), b),
  deletePage: (id) => request("DELETE", "/pages/" + encodeURIComponent(id)),
  reorderPages: (ids) => request("POST", "/pages/reorder", { ids }),
  restorePage: (id, version_id) => request("POST", `/pages/${encodeURIComponent(id)}/restore`, { version_id }),
  aiPageCode: (b) => request("POST", "/ai/page-code", b), // { purpose } 새 페이지 · { page_id, instruction } 고치기
  embedCheck: (url) => request("GET", "/embed-check?" + qs({ url })), // 그 사이트가 iframe 을 허용하는지
  proxyToken: () => request("GET", "/proxy-token"), // 내장 브라우저(프록시) 1시간 토큰
  pageState: (id) => request("GET", `/pages/${encodeURIComponent(id)}/state`),
  savePageState: (id, data) => request("PUT", `/pages/${encodeURIComponent(id)}/state`, { data }),
  pageStates: (id) => request("GET", `/pages/${encodeURIComponent(id)}/state/all`),
  pageFileToken: (id) => request("GET", `/pages/${encodeURIComponent(id)}/file-token`), // sandbox iframe 은 쿠키가 없어서 파일 주소에 넣는 12시간 토큰
  siteMeta: (url) => request("GET", "/site-meta?" + qs({ url })), // 사이트 제목 · 파비콘
  raw: request, // 사용자 페이지 브리지가 그대로 넘겨요
  tags: () => request("GET", "/tags"),
  search: (q) => request("GET", "/search?" + qs({ q })),
  focus: (from, to, user) => request("GET", "/logs/focus?" + qs({ from, to, user })),

  custom: () => request("GET", "/custom"),
  saveCustom: (slot, b) => request("PUT", "/custom/" + encodeURIComponent(slot), b),
  resetCustom: (slot) => request("DELETE", "/custom/" + encodeURIComponent(slot)),
  diary: (day) => request("GET", "/diary?" + qs({ day })),
  saveDiary: (b) => request("PUT", "/diary", b),
  // 일기 사진: 파일 그대로(JSON 아님) 올려요 → { src: "/api/diary/img/…" }
  diaryImage: async (blob) => {
    let res;
    try { res = await fetch("/api/diary/img", { method: "POST", credentials: "same-origin", headers: { "content-type": blob.type || "image/jpeg", "x-trio": "1" }, body: blob }); }
    catch { throw new ApiError(0, "서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || "사진을 올리지 못했어요.", data);
    return data;
  },
  diaryDays: (year) => request("GET", "/diary/days?" + qs({ year })),
  diaries: (before) => request("GET", "/diary/list?" + qs({ before })),
  // 일기 모임(서로 보기) — 모임 밖이면 403. 남의 비공개 날은 { day, private: true } 만 와요
  diaryCircle: () => request("GET", "/diary/circle"),
  diaryOf: (user, day) => request("GET", "/diary/of?" + qs({ user, day })),
  diaryOfDays: (user, year) => request("GET", "/diary/of/days?" + qs({ user, year })),
  diaryOfList: (user, before) => request("GET", "/diary/of/list?" + qs({ user, before })),
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
  // AI 공부책 (#/books) — 장 단위 읽음 · 복습 · 실습 체크
  booksState: () => request("GET", "/books/state"),
  bookRead: (book, chapter, recall, total) => request("PUT", "/books/read", { book, chapter, recall, total }),
  bookReview: (results) => request("PUT", "/books/review", { results }),
  mbaState: () => request("GET", "/mba/state"),
  mbaRead: (module, card, correct, total) => request("PUT", "/mba/read", { module, card, correct, total }),
  mbaReview: (results) => request("PUT", "/mba/review", { results }),
  mbaDay: (minutes, plan) => request("PUT", "/mba/day", { minutes, ...(plan != null ? { plan } : {}) }),
  mbaDone: (module, item, kind, score, total, done = true) => request("PUT", "/mba/done", { module, item, kind, score, total, ...(done ? {} : { done: false }) }),
  devState: () => request("GET", "/dev/state"),
  devRead: (module, card, correct, total) => request("PUT", "/dev/read", { module, card, correct, total }),
  devReview: (results) => request("PUT", "/dev/review", { results }),
  devDay: (minutes, plan) => request("PUT", "/dev/day", { minutes, ...(plan != null ? { plan } : {}) }),
  devDone: (module, item, kind, score, total, done = true) => request("PUT", "/dev/done", { module, item, kind, score, total, ...(done ? {} : { done: false }) }),
  bookTask: (task, done) => request("PUT", "/books/task", { task, done }),
  paperCheck: (paper, step, done) => request("PUT", "/papers/check", { paper, step, done }),
  paperNote: (paper, text) => request("PUT", "/papers/note", { paper, text }),
  // 형광펜 · 메모 (본인만)
  paperMarks: (paper, mode = "page") => request("GET", "/papers/marks?" + qs({ paper, mode })),
  addPaperMark: (b) => request("POST", "/papers/marks", b),
  updatePaperMark: (id, b) => request("PATCH", "/papers/marks/" + id, b),
  deletePaperMark: (id) => request("DELETE", "/papers/marks/" + id),
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
  // 뉴스 Signal Map (#/news)
  newsMap: () => request("GET", "/news/map"),
  newsEditions: () => request("GET", "/news/editions"),
  newsEdition: (day) => request("GET", "/news/edition/" + day),
  newsBackfill: () => request("POST", "/news/backfill", {}),
  newsWorld: (days) => request("GET", "/news/world?days=" + (days || 7)),
  newsCompanies: () => request("GET", "/news/companies"),
  newsCompanySub: (key, on) => request("PUT", "/news/companies/" + key, { on }),
  newsCompany: (key) => request("GET", "/news/company/" + key),
  newsHistory: (before) => request("GET", "/news/history?days=7" + (before ? "&before=" + before : "")),
  newsSearch: (q) => request("GET", "/news/search?limit=60&q=" + encodeURIComponent(q)),
  newsUsage: (days) => request("GET", "/news/usage?days=" + (days || 30)),
  newsLibrary: (kind) => request("GET", "/news/library?kind=" + kind),
  newsLeaderboard: () => request("GET", "/news/leaderboard"),
  newsPrefs: (b) => request("PUT", "/news/prefs", b),
  newsSummarizeMany: (ids) => request("POST", "/news/summarize", { ids }),
  newsSummarize: (id) => request("POST", "/news/item/" + id + "/summarize", {}),
  newsRecentComments: (n) => request("GET", "/news/comments/recent?limit=" + (n || 30)),
  newsItem: (id) => request("GET", "/news/item/" + id),
  newsDeep: (id) => request("POST", "/news/item/" + id + "/deep", {}),
  newsMark: (id, b) => request("PATCH", "/news/item/" + id, b),
  newsThread: (id) => request("GET", "/news/thread/" + id),
  newsStory: (id) => request("POST", "/news/thread/" + id + "/story", {}),
  newsComment: (id, b) => request("POST", "/news/item/" + id + "/comments", b),
  newsAiRebut: (cid) => request("POST", "/news/comments/" + cid + "/ai-rebut", {}),
  newsDelComment: (cid) => request("DELETE", "/news/comments/" + cid),
  newsSeen: () => request("PUT", "/news/inbox/seen", {}),
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
// AI 공부책 튜터 — /books/ask 로, 나머지는 논문 튜터와 같아요
export function streamBookAsk(book, chapter, messages, onEvent, signal, level) {
  return streamAsk("/api/books/ask", { book, chapter, messages, ...(level ? { level } : {}) }, onEvent, signal);
}
// 경영 마이크로디그리 튜터 — /mba/ask. context = 화면의 지금 값(슬라이더 등) 한 줄
export function streamMbaAsk(module, card, messages, onEvent, signal, level, context) {
  return streamAsk("/api/mba/ask", { module, card, messages, ...(level ? { level } : {}), ...(context ? { context } : {}) }, onEvent, signal);
}
// 개발 흐름 마이크로디그리 튜터 — /dev/ask (경영 튜터와 같은 모양)
export function streamDevAsk(module, card, messages, onEvent, signal, level, context) {
  return streamAsk("/api/dev/ask", { module, card, messages, ...(level ? { level } : {}), ...(context ? { context } : {}) }, onEvent, signal);
}
export function streamPaperAsk(paper, messages, onEvent, signal, level) {
  return streamAsk("/api/papers/ask", { paper, messages, ...(level ? { level } : {}) }, onEvent, signal);
}
async function streamAsk(path, payload, onEvent, signal) {
  let res;
  try {
    res = await fetch(path, { method: "POST", credentials: "same-origin", signal, headers: { "content-type": "application/json", "x-trio": "1" }, body: JSON.stringify(payload) });
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

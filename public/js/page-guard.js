// 사용자 페이지(브리지)가 내 세션으로 부를 수 있는 앱 API — page-runner.js 가 써요. 막으면 그 까닭(글), 괜찮으면 null.
// 허용 목록(allowlist)이에요: 아래 표에 없는 주소는 다 막아요 (/admin · /ai · /room · /auth · /apikeys · /mcp · 다른 페이지 …).
//   - 내 페이지: 페이지 규칙(src/pages.js BRIDGE_GUIDE)에 적힌 것만 — 계획 · 노트 읽기/쓰기 · 영어 · 기록 · 이 페이지 저장소
//   - 남이 공유한 페이지(readonly): 이 페이지 저장소 · /me · /users 만 (내 노트 · 계획 · 일기를 남의 코드가 읽지 못하게)
// 주소는 fetch 가 하듯 먼저 정리해 봐요: '/x/../auth' · '%2e%2e' 같은 점 조각으로 아래 검사를 비켜 가지 못하게 정리 전후가 같아야 해요.
const ID = "[A-Za-z0-9_-]{1,64}";
const OWN = {
  GET: [
    "/plans", "/plans/heatmap", "/summary", "/notes", `/notes/${ID}`, "/search", "/tags", "/graph",
    "/english/day", "/english/days", "/papers/progress", "/logs/focus", "/diary", "/records/recent", "/users", "/me",
    "/files/[\\w.-]{1,120}",
  ],
  POST: ["/plans", "/notes"],
  PATCH: [`/plans/${ID}`],
  PUT: [`/notes/${ID}`, "/english/day", "/diary"],
  DELETE: [`/plans/${ID}`],
};
const SHARED = { GET: ["/users", "/me"] };
const re = (list) => new RegExp(`^(?:${list.join("|")})$`);
const OWN_RE = Object.fromEntries(Object.entries(OWN).map(([m, l]) => [m, re(l)]));
const SHARED_RE = Object.fromEntries(Object.entries(SHARED).map(([m, l]) => [m, re(l)]));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function pageApiBlock(method, path, { readonly = true, pageId = "" } = {}) {
  path = String(path || "");
  const bad = "이 주소는 페이지에서 못 써요.";
  if (!/^\/[\w\-./?=&%:,+@]*$/.test(path)) return bad;
  const u = new URL("/api" + path, "http://app.invalid");
  if (u.pathname + u.search !== "/api" + path) return bad;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return "모르는 method";
  const p = u.pathname.slice(4);
  // 이 페이지의 사람별 저장소는 어느 쪽이든 (trio.store · trio.others 와 같은 것)
  if (pageId && new RegExp(`^/pages/${esc(encodeURIComponent(pageId))}/state(?:/all)?$`).test(p) && (method === "GET" || (method === "PUT" && !p.endsWith("/all")))) return null;
  const table = readonly ? SHARED_RE : OWN_RE;
  if (table[method]?.test(p)) return null;
  return readonly ? "남이 공유한 페이지는 이 페이지 저장소 · 내 이름(/me) · 멤버(/users)만 쓸 수 있어요." : bad;
}

// 남이 공유한 페이지에 돌려줄 때는 이름 · 색 같은 공개 칸만 (기능 · Dock 설정 · 상태 같은 건 빼요)
const pub = (u) => (u && typeof u === "object" ? { id: u.id, username: u.username, display_name: u.display_name, color: u.color } : u);
export function pageApiFilter(method, path, data, readonly) {
  if (!readonly || method !== "GET" || !data || typeof data !== "object") return data;
  const p = String(path || "").split("?")[0];
  if (p === "/me") return { user: pub(data.user) };
  if (p === "/users") return { users: (Array.isArray(data.users) ? data.users : []).map(pub) };
  return data;
}

// 라우트 표와 등록 함수. 등록 순서가 곧 매칭 순서예요 (겹치는 주소는 순서 · 메서드로만 갈려요) — 순서를 바꾸지 마세요.
export const routes = [];
export const on = (method, pattern, handler, opts = {}) =>
  routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), handler, auth: opts.auth !== false });

// 메서드 + 경로("/api" 뺀 것)로 첫 번째로 맞는 라우트를 찾아요 → { r, m } (없으면 null)
export function match(method, path) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = path.match(r.re);
    if (m) return { r, m };
  }
  return null;
}

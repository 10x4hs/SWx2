// 모든 모듈이 같이 쓰는 작은 도구: 에러 · 응답 · 요청 검사. HttpError 클래스는 여기 한 곳에만 있어야 해요 (instanceof 검사가 모듈을 가로질러 쓰여요)

export const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
// extra: 에러 몸통에 같이 실어 보낼 값 (예: { must_change_password: true })
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
export async function body(req) {
  try { return await req.json(); } catch { fail(400, "요청 형식이 올바르지 않아요."); }
}
export const now = () => Date.now();
export const uid = () => crypto.randomUUID();
export const str = (v, max, name) => {
  if (typeof v !== "string") fail(400, `${name}을(를) 입력해 주세요.`);
  const s = v.trim();
  if (!s) fail(400, `${name}을(를) 입력해 주세요.`);
  if (s.length > max) fail(400, `${name}은(는) ${max}자까지 쓸 수 있어요.`);
  return s;
};
// 쿼리·본문 값 검사 (틀리면 400) — 라우트마다 같은 줄을 쓰던 걸 모았어요
export const dayParam = (v) => { if (!DAY_RE.test(v || "")) fail(400, "날짜 형식이 올바르지 않아요."); };
export const yearParam = (v) => { if (!/^\d{4}$/.test(v || "")) fail(400, "연도를 알려 주세요."); };

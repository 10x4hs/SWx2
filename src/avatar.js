// 프로필 사진: users.avatar 에 data URL 로 저장해요 (80KB 까지). 목록 · /me 에는 사진 대신 주소만 보내요.
//   avatar: "/api/avatar/<id>?v=<버전>" — 버전은 사진 내용에서 SQL 로 바로 뽑아요 (길이 · 가운데 · 끝 글자), 사진이 바뀌면 주소도 바뀌어요
//   → 브라우저가 한 번 받은 사진은 1년 동안 다시 묻지 않아요 (immutable). 매 요청마다 80KB 를 DB 에서 읽어 JSON 에 넣던 걸 없앴어요
// 볼 수 있는 사람은 전과 같아요: 나 · 같은 팀(PEERS) · 관리자는 누구나 · 관리자 사진은 누구나 (문의방에서 보이던 그대로)
import { PEERS } from "./teams.js";

// 버전: 사진 data URL 의 길이 + 가운데 12글자 + 끝 12글자 (SQL 에서 계산 → 사진 본문은 워커로 안 와요)
export const AVATAR_V = (col = "avatar") => `CASE WHEN ${col} IS NULL THEN NULL ELSE length(${col}) || '.' || substr(${col}, length(${col}) / 2, 12) || substr(${col}, -12) END`;
const tidy = (v) => String(v).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
export const avatarUrl = (id, v) => (v ? `/api/avatar/${encodeURIComponent(id)}?v=${tidy(v)}` : null);

const DATA = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const YEAR = 365 * 86400;

export function registerAvatar(on, { fail }) {
  on("GET", "/avatar/:id", async ({ req, env, user, params, q }) => {
    const id = params.id;
    // 나 · 관리자는 바로, 아니면 같은 팀이거나 관리자 사진일 때만 (못 보면 없는 것처럼 404)
    const seeAll = id === user.id || (user.role === "admin" && !user.imp_by);
    const row = await env.DB.prepare(
      `SELECT avatar, ${AVATAR_V()} AS v FROM users t WHERE t.id = ?1 AND t.avatar IS NOT NULL AND (?3 = 1 OR t.role = 'admin' OR t.id IN ${PEERS("?2")})`
    ).bind(id, user.id, seeAll ? 1 : 0).first();
    const m = row && DATA.exec(row.avatar);
    if (!m) fail(404, "사진이 없어요.");
    const etag = `"${tidy(row.v)}"`, fresh = q.get("v") === tidy(row.v);
    // 지금 버전 주소면 1년 그대로 · 옛 주소(사진이 바뀐 뒤)면 매번 확인 (ETag 로 304)
    const headers = { etag, "cache-control": fresh ? `private, max-age=${YEAR}, immutable` : "private, no-cache", "x-content-type-options": "nosniff", vary: "cookie" };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, { headers: { ...headers, "content-type": m[1] } });
  });
}

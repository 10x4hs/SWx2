// 해시·인코딩 공용 도구 — 세션 · OAuth · MCP · 논문 토큰이 같은 걸 써요 (예전엔 파일마다 복사해 뒀어요).
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// 노트 이미지 · 첨부 파일 (R2 FILES). 로그인한 셋만 받아요. 키는 "notion-<블록 id>.png" 처럼 슬래시 없는 이름
import { fail } from "./http.js";

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export function registerFiles(on) {
  on("GET", "/files/:key", async ({ env, params }) => {
    const key = decodeURIComponent(params.key);
    if (!KEY_RE.test(key) || !env.FILES) fail(404, "No such file.");
    const obj = await env.FILES.get(key);
    if (!obj) fail(404, "No such file.");
    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);
    h.set("cache-control", "private, max-age=31536000, immutable"); // 키마다 내용이 바뀌지 않아요
    h.set("x-content-type-options", "nosniff");
    return new Response(obj.body, { headers: h });
  });
}

// 노트 이미지 · 첨부 파일 (R2 FILES). 키는 "notion-<블록 id>.png" 처럼 슬래시 없는 이름
// /files/:key — Notion 에서 가져온 이미지 (로그인한 누구나). 주인이 적힌 파일(일기 · 방 · 노트 첨부)은 여기서 안 내줘요.
// /notes/:id/files (PUT) · /notes/file/:key (GET) — 노트에 올린 사진 · 파일. 노트는 본인만 보니 파일도 올린 사람만 받아요.
import { fail, json, now, uid } from "./http.js";

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const NF_KEY = /^nf-[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;
export const NOTE_FILE_MAX = 25 * 1024 * 1024;     // 한 파일 25MB
export const NOTE_FILE_QUOTA = 1024 * 1024 * 1024; // 사람마다 1GB
// 화면 안에서 바로 보여 줘도 되는 형식 (내용이 진짜 그 형식인지 앞 바이트로 확인해요). SVG · HTML 을 비롯한 나머지는 모두 내려받기로만
const INLINE = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47]], "image/jpeg": [[0xff, 0xd8, 0xff]], "image/gif": [[0x47, 0x49, 0x46, 0x38]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
};
const startsWith = (u8, sig) => sig.every((b, i) => u8[i] === b);
const extOf = (name) => (/\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1] || "bin").toLowerCase();
const cleanName = (s) => (s || "").replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(0, 200) || "file";

export function registerFiles(on) {
  on("GET", "/files/:key", async ({ env, params }) => {
    const key = decodeURIComponent(params.key);
    if (!KEY_RE.test(key) || !env.FILES) fail(404, "No such file.");
    const obj = await env.FILES.get(key);
    if (!obj || obj.customMetadata?.owner) fail(404, "No such file."); // 주인이 있는 파일은 각자의 주소로만
    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);
    h.set("cache-control", "private, max-age=31536000, immutable"); // 키마다 내용이 바뀌지 않아요
    h.set("x-content-type-options", "nosniff");
    return new Response(obj.body, { headers: h });
  });

  // 올리기: 몸통 = 파일 그대로, ?name=파일 이름, content-type = 파일 형식
  on("PUT", "/notes/:id/files", async ({ req, env, user, params, q }) => {
    if (!env.FILES) fail(500, "파일 저장소가 없어요.");
    const note = await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").bind(params.id, user.id).first();
    if (!note) fail(404, "노트를 찾을 수 없어요.");
    const big = () => fail(413, "파일이 너무 커요 (한 개에 25MB 까지).");
    const full = () => fail(413, "저장 공간(1GB)이 다 찼어요. 관리자에게 정리를 부탁해 주세요.", { quota: true });
    const len = Number(req.headers.get("content-length")) || 0;
    if (len > NOTE_FILE_MAX) big();
    const used = (await env.DB.prepare("SELECT coalesce(sum(size), 0) AS n FROM note_files WHERE user_id = ?").bind(user.id).first()).n;
    if (used + len > NOTE_FILE_QUOTA) full();
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) fail(400, "빈 파일이에요.");
    if (buf.byteLength > NOTE_FILE_MAX) big();
    if (used + buf.byteLength > NOTE_FILE_QUOTA) full();
    const name = cleanName(q.get("name"));
    let type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type)) type = "application/octet-stream";
    const head = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
    const inline = INLINE[type]?.some((s) => startsWith(head, s)) || false; // 형식과 내용이 맞을 때만 화면에 보여요
    const key = `nf-${uid()}.${extOf(name)}`;
    await env.FILES.put(key, buf, { httpMetadata: { contentType: inline ? type : "application/octet-stream" }, customMetadata: { owner: user.id, note: note.id } });
    try {
      await env.DB.prepare("INSERT INTO note_files (key, user_id, note_id, name, type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(key, user.id, note.id, name, type, buf.byteLength, now()).run();
    } catch (e) { await env.FILES.delete(key); throw e; }
    return json({ src: "/api/notes/file/" + key, name, size: buf.byteLength, mime: type, image: inline && type.startsWith("image/"), pdf: inline && type === "application/pdf" }, 201);
  });

  // 받기: 올린 사람만. 사진 · PDF 는 화면에, 나머지는 내려받기 (?dl=1 이면 무엇이든 내려받기)
  on("GET", "/notes/file/:key", async ({ env, user, params, q }) => {
    const key = decodeURIComponent(params.key);
    if (!NF_KEY.test(key) || !env.FILES) fail(404, "없는 파일이에요.");
    const row = await env.DB.prepare("SELECT name FROM note_files WHERE key = ? AND user_id = ?").bind(key, user.id).first();
    if (!row) fail(404, "없는 파일이에요."); // 남의 파일도 '없다'로 (있는지조차 알리지 않아요)
    const obj = await env.FILES.get(key);
    if (!obj) fail(404, "없는 파일이에요.");
    const stored = obj.httpMetadata?.contentType || "application/octet-stream";
    const inline = stored in INLINE && q.get("dl") !== "1";
    const h = new Headers();
    h.set("content-type", stored);
    h.set("etag", obj.httpEtag);
    h.set("cache-control", "private, max-age=31536000, immutable");
    h.set("x-content-type-options", "nosniff");
    const ascii = row.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    h.set("content-disposition", `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`);
    if (stored !== "application/pdf") h.set("content-security-policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    return new Response(obj.body, { headers: h });
  });
}

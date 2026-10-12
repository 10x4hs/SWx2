// 노트 · 그래프 · 태그 · 검색. indexStmts · MAX_NOTE 는 brain.js 에도 넘겨줘요 (worker.js 참고).
import { fail, json, body, now, uid, str } from "./http.js";

export const MAX_NOTE = 200_000;

const VISIBLE = "(n.user_id = ?1)"; // 노트는 본인만 봐요 (서로는 차트만)
function parseLinks(text) {
  const out = new Set();
  for (const m of text.matchAll(/\[\[([^\[\]|#\n]+)(?:[#|][^\]\n]*)?\]\]/g)) {
    const t = m[1].trim();
    if (t) out.add(t.slice(0, 120));
  }
  return [...out].slice(0, 200);
}
function parseTags(text) {
  const clean = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const out = new Set();
  for (const m of clean.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu)) out.add(m[1].slice(0, 40));
  return [...out].slice(0, 50);
}
export function indexStmts(env, id, text) {
  return [
    env.DB.prepare("DELETE FROM note_links WHERE src_id = ?").bind(id),
    env.DB.prepare("DELETE FROM note_tags WHERE note_id = ?").bind(id),
    ...parseLinks(text).map((t) => env.DB.prepare("INSERT OR IGNORE INTO note_links (src_id, dst_title) VALUES (?, ?)").bind(id, t)),
    ...parseTags(text).map((t) => env.DB.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?, ?)").bind(id, t)),
  ];
}
async function indexNote(env, id, text) {
  await env.DB.batch(indexStmts(env, id, text));
}
// 노트 제목: 길이 검사 + 링크 문법([[ ]] | #)과 겹치는 글자 막기
const noteTitle = (v, name) => { const t = str(v, 120, name); if (/[\[\]|#]/.test(t)) fail(400, "제목에는 [ ] | # 를 쓸 수 없어요."); return t; };
async function visibleNote(env, id, user) {
  const n = await env.DB.prepare(`SELECT n.* FROM notes n WHERE n.id = ?2 AND ${VISIBLE}`).bind(user.id, id).first();
  if (!n) fail(404, "노트를 찾을 수 없어요.");
  return n;
}

// 그래프에서 클릭으로 연결: 본문 끝 "## 연결" 아래에 [[제목]] 한 줄을 적어요 (옵시디언처럼 노트 안에서도 보이게)
const LINK_HEAD = "## 연결";
function addLinkLine(text, title) {
  const t = text.replace(/\s+$/, "");
  const re = new RegExp("\\[\\[" + title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:[#|][^\\]]*)?\\]\\]", "i");
  if (re.test(t)) return null;
  // AI 구역은 맨 끝에 두는 규칙이라 그 앞에 끼워 넣어요
  const ai = t.indexOf("<!-- ai:start -->");
  const head = ai >= 0 ? t.slice(0, ai).replace(/\s+$/, "") : t, tail = ai >= 0 ? "\n\n" + t.slice(ai) : "";
  const idx = head.lastIndexOf("\n" + LINK_HEAD);
  const section = idx >= 0 || head.startsWith(LINK_HEAD);
  return (section ? head + "\n- [[" + title + "]]" : head + (head ? "\n\n" : "") + LINK_HEAD + "\n- [[" + title + "]]") + tail + "\n";
}
function removeLink(text, title) {
  const q = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = text.replace(new RegExp("^[ \\t]*[-*][ \\t]*\\[\\[" + q + "(?:[#|][^\\]]*)?\\]\\][ \\t]*\\n?", "gim"), "");
  out = out.replace(new RegExp("\\[\\[" + q + "(?:#[^\\]|]*)?(?:\\|([^\\]]+))?\\]\\]", "gi"), (_, label) => label || title);
  out = out.replace(new RegExp("(^|\\n)" + LINK_HEAD + "[ \\t]*\\n(?=\\s*(?:\\n|$|<!--))", ""), "$1"); // 빈 연결 절은 지워요
  return out.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "\n");
}
async function relink(env, n, text) {
  await env.DB.batch([
    env.DB.prepare("UPDATE notes SET body = ?, updated_at = ? WHERE id = ?").bind(text, now(), n.id),
    ...indexStmts(env, n.id, text),
  ]);
  return { ...n, body: text, updated_at: now() };
}
export function registerNotes(on) {
  on("GET", "/notes", async ({ env, user, q }) => {
    const tag = q.get("tag");
    const sql = tag
      ? `SELECT n.id, n.user_id, n.title, n.shared, n.parent_id, n.updated_at, substr(n.body, 1, 160) AS snippet FROM notes n JOIN note_tags t ON t.note_id = n.id AND t.tag = ?2 WHERE ${VISIBLE} ORDER BY n.updated_at DESC`
      : `SELECT n.id, n.user_id, n.title, n.shared, n.parent_id, n.updated_at, substr(n.body, 1, 160) AS snippet FROM notes n WHERE ${VISIBLE} ORDER BY n.updated_at DESC`;
    const stmt = tag ? env.DB.prepare(sql).bind(user.id, tag) : env.DB.prepare(sql).bind(user.id);
    const { results } = await stmt.all();
    return json({ notes: results });
  });

  // 한꺼번에 가져오기 (Brain → Import): items = [{ title, body, parent_title }] 를 위에서부터 (부모가 먼저).
  // 같은 제목이 이미 있으면 새로 만들지 않고, 그 노트가 맨 위(부모 없음)일 때만 parent_title 아래로 옮겨요 → 다시 올려도 안전해요.
  on("POST", "/notes/import", async ({ req, env, user }) => {
    const b = await body(req);
    const items = Array.isArray(b.items) ? b.items.slice(0, 40) : fail(400, "items 가 필요해요.");
    const list = items.map((it) => ({ title: noteTitle(it?.title, "제목"), body: typeof it?.body === "string" ? it.body.slice(0, MAX_NOTE) : "", parent: typeof it?.parent_title === "string" && it.parent_title.trim() ? it.parent_title.trim() : null }));
    const want = [...new Set(list.flatMap((x) => [x.title, x.parent].filter(Boolean)).map((t) => t.toLowerCase()))];
    const ids = new Map(); // 소문자 제목 → { id, parent_id }
    if (want.length) {
      const { results } = await env.DB.prepare(`SELECT id, title, parent_id FROM notes WHERE user_id = ? AND lower(title) IN (${want.map(() => "?").join(",")})`).bind(user.id, ...want).all();
      for (const r of results) ids.set(r.title.toLowerCase(), r);
    }
    const stmts = [];
    let created = 0, moved = 0, kept = 0;
    for (const x of list) {
      const parent = x.parent ? ids.get(x.parent.toLowerCase()) : null;
      const have = ids.get(x.title.toLowerCase());
      if (have) {
        if (parent && !have.parent_id && parent.id !== have.id) { stmts.push(env.DB.prepare("UPDATE notes SET parent_id = ? WHERE id = ? AND user_id = ?").bind(parent.id, have.id, user.id)); have.parent_id = parent.id; moved++; } else kept++;
        continue;
      }
      const n = { id: uid(), title: x.title, parent_id: parent?.id || null, t: now() };
      stmts.push(env.DB.prepare("INSERT INTO notes (id, user_id, title, body, shared, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)").bind(n.id, user.id, n.title, x.body, n.parent_id, n.t, n.t), ...indexStmts(env, n.id, x.body));
      ids.set(x.title.toLowerCase(), { id: n.id, parent_id: n.parent_id });
      created++;
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ created, moved, kept });
  });

  on("GET", "/notes/resolve", async ({ env, user, q }) => {
    const title = String(q.get("title") || "").trim();
    if (!title) fail(400, "제목을 알려 주세요.");
    const n = await env.DB.prepare(
      `SELECT n.id FROM notes n WHERE n.title = ?2 COLLATE NOCASE AND ${VISIBLE} ORDER BY CASE WHEN n.user_id = ?1 THEN 0 ELSE 1 END LIMIT 1`
    ).bind(user.id, title).first();
    return json({ id: n ? n.id : null });
  });

  on("GET", "/notes/:id", async ({ env, user, params }) => {
    // 노트 · 백링크 · 태그 · 하위 노트 · 위 경로를 왕복 한 번에. 모두 내 노트(user_id = 나)만 보고, 노트가 없으면 나머지는 버리고 404
    const [nr, back, tags, children, up] = await env.DB.batch([
      env.DB.prepare(`SELECT n.* FROM notes n WHERE n.id = ?2 AND ${VISIBLE}`).bind(user.id, params.id),
      env.DB.prepare(
        `SELECT n.id, n.user_id, n.title, substr(n.body, 1, 160) AS snippet FROM note_links l JOIN notes n ON n.id = l.src_id
       WHERE l.dst_title = (SELECT title FROM notes WHERE id = ?2 AND user_id = ?1) AND n.id != ?2 AND ${VISIBLE} ORDER BY n.updated_at DESC`
      ).bind(user.id, params.id),
      env.DB.prepare("SELECT tag FROM note_tags WHERE note_id = ?").bind(params.id),
      env.DB.prepare("SELECT id, title, updated_at FROM notes WHERE parent_id = ? AND user_id = ? ORDER BY created_at").bind(params.id, user.id),
      // 위로 올라가는 경로 (부모 › 조부모 …, 최대 6단계) — 재귀 쿼리 하나로
      env.DB.prepare(
        `WITH RECURSIVE up(id, title, parent_id, depth) AS (
         SELECT p.id, p.title, p.parent_id, 1 FROM notes c JOIN notes p ON p.id = c.parent_id AND p.user_id = ?1 WHERE c.id = ?2 AND c.user_id = ?1
         UNION ALL SELECT p.id, p.title, p.parent_id, up.depth + 1 FROM up JOIN notes p ON p.id = up.parent_id AND p.user_id = ?1 WHERE up.depth < 6
       ) SELECT id, title FROM up ORDER BY depth DESC`
      ).bind(user.id, params.id),
    ]);
    const n = nr.results[0];
    if (!n) fail(404, "노트를 찾을 수 없어요.");
    return json({ note: n, backlinks: back.results, tags: tags.results.map((t) => t.tag), children: children.results, crumbs: up.results });
  });

  on("POST", "/notes", async ({ req, env, user }) => {
    const b = await body(req);
    const title = noteTitle(b.title, "제목");
    const text = typeof b.body === "string" ? b.body.slice(0, MAX_NOTE) : "";
    const dup = await env.DB.prepare("SELECT id FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE").bind(user.id, title).first();
    if (dup) return json({ error: "같은 제목의 노트가 이미 있어요.", id: dup.id }, 409);
    let parent_id = null;
    if (typeof b.parent_id === "string" && b.parent_id) {
      const p = await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").bind(b.parent_id, user.id).first();
      if (!p) fail(404, "상위 노트를 찾을 수 없어요.");
      parent_id = p.id;
    }
    const n = { id: uid(), user_id: user.id, title, body: text, shared: b.shared ? 1 : 0, parent_id, created_at: now(), updated_at: now() };
    await env.DB.prepare("INSERT INTO notes (id, user_id, title, body, shared, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(n.id, n.user_id, n.title, n.body, n.shared, n.parent_id, n.created_at, n.updated_at).run();
    await indexNote(env, n.id, text);
    return json({ note: n }, 201);
  });

  on("PUT", "/notes/:id", async ({ req, env, user, params }) => {
    const n = await visibleNote(env, params.id, user);
    const b = await body(req);
    const next = { ...n };
    if (b.title !== undefined) {
      next.title = noteTitle(b.title, "제목");
      const dup = await env.DB.prepare("SELECT id FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE AND id != ?").bind(user.id, next.title, n.id).first();
      if (dup) fail(409, "같은 제목의 노트가 이미 있어요.");
    }
    if (typeof b.body === "string") {
      if (b.body.length > MAX_NOTE) fail(400, "노트가 너무 길어요. 나눠서 저장해 주세요.");
      next.body = b.body;
    }
    if (b.shared !== undefined) next.shared = b.shared ? 1 : 0;
    if (b.parent_id !== undefined) {
      if (b.parent_id === null || b.parent_id === "") next.parent_id = null;
      else {
        if (b.parent_id === n.id) fail(400, "자기 자신 아래에 둘 수 없어요.");
        const p = await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").bind(b.parent_id, user.id).first();
        if (!p) fail(404, "상위 노트를 찾을 수 없어요.");
        next.parent_id = p.id;
      }
    }
    next.updated_at = now();
    await env.DB.prepare("UPDATE notes SET title = ?, body = ?, shared = ?, parent_id = ?, updated_at = ? WHERE id = ?")
      .bind(next.title, next.body, next.shared, next.parent_id ?? null, next.updated_at, n.id).run();
    if (typeof b.body === "string") await indexNote(env, n.id, next.body);
    return json({ note: next });
  });
  on("POST", "/notes/:id/link", async ({ req, env, user, params }) => {
    const n = await visibleNote(env, params.id, user);
    const b = await body(req);
    const title = noteTitle(b.title, "연결할 노트 제목");
    if (title.toLowerCase() === n.title.toLowerCase()) fail(400, "자기 자신과는 연결할 수 없어요.");
    const text = addLinkLine(n.body || "", title);
    if (text === null) return json({ note: n, added: false });
    if (text.length > MAX_NOTE) fail(400, "노트가 너무 길어요.");
    return json({ note: await relink(env, n, text), added: true });
  });
  on("DELETE", "/notes/:id/link", async ({ env, user, params, q }) => {
    const n = await visibleNote(env, params.id, user);
    const title = String(q.get("title") || "").trim();
    if (!title) fail(400, "끊을 연결의 제목을 알려 주세요.");
    const text = removeLink(n.body || "", title);
    if (text === n.body) return json({ note: n, removed: false });
    return json({ note: await relink(env, n, text), removed: true });
  });

  on("DELETE", "/notes/:id", async ({ env, user, params }) => {
    const r = await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(params.id, user.id).run();
    if (!r.meta.changes) fail(404, "노트를 찾을 수 없어요.");
    return json({ ok: true });
  });

  on("GET", "/graph", async ({ env, user }) => {
    const [nodes, edges] = await env.DB.batch([
      env.DB.prepare(`SELECT n.id, n.user_id, n.title, n.topic, n.parent_id, (SELECT group_concat(t.tag) FROM note_tags t WHERE t.note_id = n.id) AS tags FROM notes n WHERE ${VISIBLE}`).bind(user.id),
      env.DB.prepare(`SELECT l.src_id, l.dst_title FROM note_links l JOIN notes n ON n.id = l.src_id WHERE ${VISIBLE}`).bind(user.id),
    ]);
    return json({ nodes: nodes.results, edges: edges.results });
  });

  on("GET", "/tags", async ({ env, user }) => {
    const { results } = await env.DB.prepare(
      `SELECT t.tag, COUNT(*) AS count FROM note_tags t JOIN notes n ON n.id = t.note_id WHERE ${VISIBLE} GROUP BY t.tag COLLATE NOCASE ORDER BY count DESC, t.tag LIMIT 100`
    ).bind(user.id).all();
    return json({ tags: results });
  });

  on("GET", "/search", async ({ env, user, q }) => {
    const term = String(q.get("q") || "").trim().slice(0, 60);
    if (!term) return json({ notes: [], plans: [] });
    const like = "%" + term.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    const [notes, plans] = await env.DB.batch([
      env.DB.prepare(
        `SELECT n.id, n.user_id, n.title, substr(n.body, max(1, instr(lower(n.body), lower(?3)) - 30), 110) AS snippet
       FROM notes n WHERE ${VISIBLE} AND (n.title LIKE ?2 ESCAPE '\\' OR n.body LIKE ?2 ESCAPE '\\')
       ORDER BY CASE WHEN n.title LIKE ?2 ESCAPE '\\' THEN 0 ELSE 1 END, n.updated_at DESC LIMIT 12`
      ).bind(user.id, like, term),
      env.DB.prepare("SELECT id, scope, period, text, done FROM plans WHERE user_id = ?1 AND text LIKE ?2 ESCAPE '\\' ORDER BY created_at DESC LIMIT 8")
        .bind(user.id, like),
    ]);
    return json({ notes: notes.results, plans: plans.results });
  });
}

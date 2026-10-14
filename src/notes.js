// 노트 · 그래프 · 태그 · 검색. indexStmts · MAX_NOTE 는 brain.js 에도 넘겨줘요 (worker.js 참고).
import { fail, json, body, now, uid, str } from "./http.js";
// 블록 ⇄ 마크다운은 브라우저 편집기와 같은 파일을 써요 (wrangler 가 함께 묶어요)
import { remindAt } from "../public/js/blocks/dbview.js";
import { blocksToMd, validateDoc, MAX_BLOCKS_JSON, validateDb, defaultDb, cleanRowProps, dbToMd } from "../public/js/blocks/md.js";

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
// ---------- blocks · databases ----------
const parseJson = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
function readBlocks(v) {
  let doc;
  try { doc = validateDoc(v); } catch (e) { fail(400, e.message); }
  const text = JSON.stringify(doc);
  if (text.length > MAX_BLOCKS_JSON) fail(400, "페이지가 너무 커요. 나눠서 저장해 주세요.");
  const md = blocksToMd(doc);
  if (md.length > MAX_NOTE) fail(400, "노트가 너무 길어요. 나눠서 저장해 주세요.");
  return { text, md };
}
function readDb(v) { try { return validateDb(v); } catch (e) { fail(400, e.message); } }
// 데이터베이스 body = 행 표(마크다운) — 검색 · AI · 그래프가 계속 보도록. updated_at 은 건드리지 않아요 (열린 화면과 충돌하지 않게)
async function refreshDbMirror(env, dbId, userId) {
  const d = await env.DB.prepare("SELECT id, db FROM notes WHERE id = ? AND user_id = ? AND kind = 'database'").bind(dbId, userId).first();
  if (!d) return;
  const { results } = await env.DB.prepare("SELECT title, props FROM notes WHERE parent_id = ? AND user_id = ? ORDER BY created_at").bind(dbId, userId).all();
  const md = dbToMd(parseJson(d.db), results.map((r) => ({ title: r.title, props: parseJson(r.props) || {} }))).slice(0, MAX_NOTE);
  await env.DB.batch([env.DB.prepare("UPDATE notes SET body = ? WHERE id = ?").bind(md, dbId), ...indexStmts(env, dbId, md)]);
}
async function parentDb(env, parentId, userId) {
  if (!parentId) return null;
  const p = await env.DB.prepare("SELECT id, kind, db FROM notes WHERE id = ? AND user_id = ?").bind(parentId, userId).first();
  return p && p.kind === "database" ? { id: p.id, db: parseJson(p.db) } : null;
}
// "제목 없음" 이 이미 있으면 "제목 없음 2" … (새 행 · 하위 페이지 블록)
async function freeTitle(env, userId, title) {
  for (let i = 1; i < 60; i++) {
    const t = i === 1 ? title : `${title.slice(0, 112)} ${i}`;
    const dup = await env.DB.prepare("SELECT id FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE").bind(userId, t).first();
    if (!dup) return t;
  }
  fail(409, "같은 제목의 노트가 너무 많아요.");
}

// ---------- 페이지 기록 (note_versions, 0046) ----------
// 저장 직전 상태를 남겨요: 같은 노트는 10분에 한 번만 (force 면 늘 — 되돌리기 직전) · 마지막 기록과 같으면 건너뛰고 · 최신 30개만.
// INSERT … SELECT 로 D1 안에서 복사하니 큰 본문도 문장 크기(100KB) 한도에 걸리지 않아요.
const SNAP_GAP = 10 * 60_000, SNAP_KEEP = 30;
function snapStmts(env, noteId, force) {
  return [
    env.DB.prepare(`INSERT INTO note_versions (id, note_id, user_id, title, blocks, body, created_at)
      SELECT ?1, n.id, n.user_id, n.title, n.blocks, coalesce(n.body, ''), ?3 FROM notes n WHERE n.id = ?2 AND coalesce(n.kind, 'page') != 'database'
      AND (?4 OR NOT EXISTS (SELECT 1 FROM note_versions v WHERE v.note_id = ?2 AND v.created_at > ?3 - ${SNAP_GAP}))
      AND NOT EXISTS (SELECT 1 FROM (SELECT title, body FROM note_versions WHERE note_id = ?2 ORDER BY created_at DESC LIMIT 1) l WHERE l.title = n.title AND l.body = coalesce(n.body, ''))`)
      .bind(uid(), noteId, now(), force ? 1 : 0),
    env.DB.prepare(`DELETE FROM note_versions WHERE note_id = ?1 AND id NOT IN (SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ${SNAP_KEEP})`).bind(noteId),
  ];
}
// "+120 / −40 chars": 앞뒤 같은 부분을 빼고 남은 길이
function diffSize(a, b) {
  let i = 0, j = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return { add: b.length - i - j, del: a.length - i - j };
}

export function registerNotes(on) {
  on("GET", "/notes", async ({ env, user, q }) => {
    const tag = q.get("tag");
    const sql = tag
      ? `SELECT n.id, n.user_id, n.title, n.shared, n.parent_id, n.kind, n.updated_at, substr(n.body, 1, 160) AS snippet FROM notes n JOIN note_tags t ON t.note_id = n.id AND t.tag = ?2 WHERE ${VISIBLE} AND NOT EXISTS (SELECT 1 FROM notes p WHERE p.id = n.parent_id AND p.kind = 'database') ORDER BY n.updated_at DESC`
      : `SELECT n.id, n.user_id, n.title, n.shared, n.parent_id, n.kind, n.updated_at, substr(n.body, 1, 160) AS snippet FROM notes n WHERE ${VISIBLE} AND NOT EXISTS (SELECT 1 FROM notes p WHERE p.id = n.parent_id AND p.kind = 'database') ORDER BY n.updated_at DESC`;
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
        `SELECT n.id, n.user_id, n.title, substr(n.body, max(1, instr(lower(n.body), lower('[[' || (SELECT title FROM notes WHERE id = ?2))) - 60), 180) AS snippet FROM note_links l JOIN notes n ON n.id = l.src_id
       WHERE l.dst_title = (SELECT title FROM notes WHERE id = ?2 AND user_id = ?1) AND n.id != ?2 AND ${VISIBLE} ORDER BY n.updated_at DESC`
      ).bind(user.id, params.id),
      env.DB.prepare("SELECT tag FROM note_tags WHERE note_id = ?").bind(params.id),
      env.DB.prepare("SELECT id, title, kind, props, updated_at FROM notes WHERE parent_id = ? AND user_id = ? ORDER BY created_at").bind(params.id, user.id),
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
    // 보통 노트 · 블록 노트(blocks) · 데이터베이스(kind: "database") · 데이터베이스 행(parent 가 데이터베이스 + props)
    const b = await body(req);
    let title = noteTitle(b.title, "제목");
    let text = typeof b.body === "string" ? b.body.slice(0, MAX_NOTE) : "", blocks = null, kind = "page", db = null, props = null;
    if (b.blocks !== undefined && b.blocks !== null) { const r = readBlocks(b.blocks); blocks = r.text; text = r.md; }
    if (b.kind === "database") { kind = "database"; db = readDb(b.db || defaultDb()); text = ""; blocks = null; }
    if (b.unique_title) title = await freeTitle(env, user.id, title);
    const dup = await env.DB.prepare("SELECT id FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE").bind(user.id, title).first();
    if (dup) return json({ error: "같은 제목의 노트가 이미 있어요.", id: dup.id }, 409);
    let parent_id = null, pdb = null;
    if (typeof b.parent_id === "string" && b.parent_id) {
      const p = await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").bind(b.parent_id, user.id).first();
      if (!p) fail(404, "상위 노트를 찾을 수 없어요.");
      parent_id = p.id;
      pdb = await parentDb(env, parent_id, user.id);
      if (pdb) props = JSON.stringify(cleanRowProps(b.props, pdb.db));
    }
    const n = { id: uid(), user_id: user.id, title, body: text, shared: b.shared ? 1 : 0, parent_id, created_at: now(), updated_at: now(), blocks, kind, props, db: db ? JSON.stringify(db) : null, remind_at: props ? remindAt(JSON.parse(props)) : null };
    await env.DB.prepare("INSERT INTO notes (id, user_id, title, body, shared, parent_id, created_at, updated_at, blocks, kind, props, db, remind_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(n.id, n.user_id, n.title, n.body, n.shared, n.parent_id, n.created_at, n.updated_at, n.blocks, n.kind, n.props, n.db, n.remind_at).run();
    await indexNote(env, n.id, text);
    if (pdb) await refreshDbMirror(env, pdb.id, user.id);
    return json({ note: n }, 201);
  });

  on("PUT", "/notes/:id", async ({ req, env, user, params }) => {
    const n = await visibleNote(env, params.id, user);
    const b = await body(req);
    // 다른 탭 · 기기에서 먼저 고쳤으면 덮어쓰지 않아요 (base_updated_at = 내가 마지막으로 받은 updated_at)
    if (typeof b.base_updated_at === "number" && b.base_updated_at !== n.updated_at) return json({ error: "다른 곳에서 먼저 고친 노트예요. 새로 불러올게요.", note: n }, 409);
    const next = { ...n };
    if (b.title !== undefined) {
      next.title = noteTitle(b.title, "제목");
      const dup = await env.DB.prepare("SELECT id FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE AND id != ?").bind(user.id, next.title, n.id).first();
      if (dup) fail(409, "같은 제목의 노트가 이미 있어요.");
    }
    let bodyChanged = false;
    if (b.blocks !== undefined && b.blocks !== null) {
      if (n.kind === "database") fail(400, "데이터베이스에는 블록을 넣을 수 없어요.");
      const r = readBlocks(b.blocks); next.blocks = r.text; next.body = r.md; bodyChanged = true;
    } else if (typeof b.body === "string") {
      if (b.body.length > MAX_NOTE) fail(400, "노트가 너무 길어요. 나눠서 저장해 주세요.");
      next.body = b.body; next.blocks = null; bodyChanged = true; // 마크다운으로 고치면 블록은 다음에 열 때 다시 만들어요
    }
    if (b.db !== undefined) {
      if (n.kind !== "database") fail(400, "데이터베이스가 아니에요.");
      next.db = JSON.stringify(readDb(b.db));
    }
    const pdb = b.props !== undefined || b.title !== undefined ? await parentDb(env, n.parent_id, user.id) : null;
    if (b.props !== undefined) {
      if (!pdb) fail(400, "데이터베이스 안의 페이지만 속성을 가질 수 있어요.");
      const np = cleanRowProps(b.props, pdb.db, parseJson(n.props) || {});
      next.props = JSON.stringify(np);
      // 알림 시각이 바뀌면 다시 보낼 수 있게 보낸 기록을 지워요
      const ra = remindAt(np);
      if (ra !== (n.remind_at ?? null)) { next.remind_at = ra; next.reminded_at = null; next.remind_seen = null; }
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
    if (bodyChanged || next.title !== n.title) await env.DB.batch(snapStmts(env, n.id, b.snapshot === true)); // 고치기 전 상태를 기록에 (snapshot: true 면 10분 안이어도)
    await env.DB.prepare("UPDATE notes SET title = ?, body = ?, shared = ?, parent_id = ?, updated_at = ?, blocks = ?, props = ?, db = ?, remind_at = ?, reminded_at = ?, remind_seen = ? WHERE id = ?")
      .bind(next.title, next.body, next.shared, next.parent_id ?? null, next.updated_at, next.blocks ?? null, next.props ?? null, next.db ?? null, next.remind_at ?? null, next.reminded_at ?? null, next.remind_seen ?? null, n.id).run();
    if (bodyChanged) await indexNote(env, n.id, next.body);
    if (pdb && (b.props !== undefined || next.title !== n.title)) await refreshDbMirror(env, pdb.id, user.id);
    if (b.db !== undefined) { await refreshDbMirror(env, n.id, user.id); next.body = (await env.DB.prepare("SELECT body FROM notes WHERE id = ?").bind(n.id).first())?.body ?? next.body; }
    return json({ note: next });
  });

  // 페이지 기록: 목록 · 하나 · 되돌리기 — 노트를 읽고 고칠 수 있는 사람(지금은 본인)만
  on("GET", "/notes/:id/versions", async ({ env, user, params }) => {
    const n = await visibleNote(env, params.id, user);
    const { results } = await env.DB.prepare("SELECT v.id, v.created_at, v.user_id, v.title, v.body, u.display_name, u.color FROM note_versions v LEFT JOIN users u ON u.id = v.user_id WHERE v.note_id = ? ORDER BY v.created_at DESC").bind(n.id).all();
    const versions = results.map((v, i) => {
      const older = results[i + 1]?.body ?? "", d = diffSize(older, v.body || "");
      return { id: v.id, created_at: v.created_at, user: { id: v.user_id, display_name: v.display_name, color: v.color }, title: v.title, size: (v.body || "").length, add: d.add, del: d.del, summary: `+${d.add} / −${d.del} chars` };
    });
    return json({ versions });
  });
  const versionOf = async (env, n, vid) => {
    const v = await env.DB.prepare("SELECT * FROM note_versions WHERE id = ? AND note_id = ?").bind(vid, n.id).first();
    if (!v) fail(404, "그 기록을 찾을 수 없어요.");
    return v;
  };
  on("GET", "/notes/:id/versions/:vid", async ({ env, user, params }) => {
    const n = await visibleNote(env, params.id, user);
    return json({ version: await versionOf(env, n, params.vid) });
  });
  on("POST", "/notes/:id/versions/:vid/restore", async ({ env, user, params }) => {
    const n = await visibleNote(env, params.id, user);
    const v = await versionOf(env, n, params.vid);
    // 제목이 그 사이 다른 노트와 겹치면 지금 제목을 그대로 둬요
    const dup = v.title !== n.title && await env.DB.prepare("SELECT id FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE AND id != ?").bind(user.id, v.title, n.id).first();
    const next = { ...n, title: dup ? n.title : v.title, body: v.body || "", blocks: v.blocks ?? null, updated_at: now() };
    await env.DB.batch([
      ...snapStmts(env, n.id, true), // 되돌리기 전 지금 상태를 먼저 남겨요
      env.DB.prepare("UPDATE notes SET title = ?, body = ?, blocks = ?, updated_at = ? WHERE id = ?").bind(next.title, next.body, next.blocks, next.updated_at, n.id),
      ...indexStmts(env, n.id, next.body),
    ]);
    return json({ note: next, kept_title: !!dup });
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
    const parent = await env.DB.prepare("SELECT parent_id FROM notes WHERE id = ? AND user_id = ?").bind(params.id, user.id).first();
    const r = await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(params.id, user.id).run();
    if (!r.meta.changes) fail(404, "노트를 찾을 수 없어요.");
    if (parent?.parent_id && await parentDb(env, parent.parent_id, user.id)) await refreshDbMirror(env, parent.parent_id, user.id);
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

// 할 일 보드 (#/checklist 의 '보드' 보기, 2026-10-24) — 체크리스트 할 일에 붙는 보드 칸 · 프로젝트 · 마감일 · 작은 할 일 · 메모와 사람별 칸 설정.
//   boardFields(b, into)   POST · PATCH 본문의 새 칸 검사 (틀리면 400)
//   syncDone(b, p, next)   '완료' 칸 = done 1 — 칸을 옮기든 체크를 하든 둘이 언제나 같게 맞춰요
//   GET  /plans/board?since=YYYY-MM-DD&done_since=ms   내 열린 할 일(since 부터 · 마감일/칸이 있으면 날짜 상관없이) + done_since 뒤에 끝낸 할 일
//   GET  /plans/board/cols                              { cols, tags, updated_at }  (없으면 기본 세 칸)
//   PUT  /plans/board/cols { cols, tags }               칸 이름 바꾸기 · 더하기 · 지우기(그 칸의 할 일은 '할 일' 칸으로) · 프로젝트 색
import { fail, json, body, now, DAY_RE } from "./http.js";

export const DEFAULT_COLS = [{ id: "todo", name: "할 일" }, { id: "doing", name: "진행 중" }, { id: "done", name: "완료" }];
export const TAG_COLORS = ["blue", "green", "amber", "rose", "violet", "teal", "orange", "gray"];
const COL_ID = /^[a-z0-9-]{1,24}$/;
const MAX_COLS = 8, MAX_SUBS = 20;

const text = (v, max, name) => {
  if (v === null) return null;
  if (typeof v !== "string") fail(400, `${name} 형식이 올바르지 않아요.`);
  const s = v.trim();
  if (s.length > max) fail(400, `${name}은(는) ${max}자까지 쓸 수 있어요.`);
  return s || null;
};

export function boardFields(b, into) {
  if (b.status !== undefined) {
    if (b.status !== null && (typeof b.status !== "string" || !COL_ID.test(b.status))) fail(400, "보드 칸 이름이 올바르지 않아요.");
    into.status = b.status;
  }
  if (b.project !== undefined) into.project = text(b.project, 30, "프로젝트");
  if (b.due !== undefined) {
    if (b.due !== null && b.due !== "" && !DAY_RE.test(b.due)) fail(400, "마감일은 YYYY-MM-DD 형식이에요.");
    into.due = b.due || null;
  }
  if (b.note !== undefined) into.note = text(b.note, 2000, "메모");
  if (b.subtasks !== undefined) {
    const s = b.subtasks;
    if (s !== null && !Array.isArray(s)) fail(400, "작은 할 일은 목록이어야 해요.");
    if (s && s.length > MAX_SUBS) fail(400, `작은 할 일은 ${MAX_SUBS}개까지예요.`);
    const list = (s || []).map((x) => {
      if (!x || typeof x !== "object" || typeof x.t !== "string") fail(400, "작은 할 일 형식이 올바르지 않아요.");
      const t = x.t.trim();
      if (!t) fail(400, "작은 할 일 내용을 적어 주세요.");
      if (t.length > 100) fail(400, "작은 할 일은 100자까지 쓸 수 있어요.");
      return { t, d: x.d ? 1 : 0 };
    });
    into.subtasks = list.length ? JSON.stringify(list) : null;
  }
  if (b.sort !== undefined) {
    const n = Number(b.sort);
    if (b.sort === null || typeof b.sort === "boolean" || !Number.isFinite(n)) fail(400, "순서 값이 올바르지 않아요.");
    into.sort = n;
  }
}

// b = 요청 본문, p = 지금 행, next = 바꿀 행 (b.done · b.missed 는 이미 반영된 뒤)
export function syncDone(b, p, next) {
  if (b.status !== undefined) {
    if (next.status === "done") { if (!p.done) next.done_at = now(); next.done = 1; next.missed = 0; }
    else if (next.done) { next.done = 0; next.done_at = null; }
  } else if (b.done !== undefined || b.missed !== undefined) {
    if (next.done) next.status = "done";
    else if (next.status === "done") next.status = null; // 체크를 풀면 '할 일' 칸으로
  }
}

// 행 → 화면에 보낼 모양 (subtasks 는 JSON 글 → 목록)
export function outPlan(p) {
  if (!p) return p;
  let subs = null;
  if (typeof p.subtasks === "string") { try { subs = JSON.parse(p.subtasks); } catch { subs = null; } }
  else if (Array.isArray(p.subtasks)) subs = p.subtasks;
  return { ...p, subtasks: subs };
}

function cleanCols(cols) {
  if (!Array.isArray(cols) || cols.length < 2 || cols.length > MAX_COLS) fail(400, `칸은 2~${MAX_COLS}개예요.`);
  const seen = new Set();
  const out = cols.map((c) => {
    if (!c || typeof c !== "object" || typeof c.id !== "string" || !COL_ID.test(c.id)) fail(400, "칸 id 가 올바르지 않아요.");
    if (seen.has(c.id)) fail(400, "같은 칸이 두 번 있어요.");
    seen.add(c.id);
    const name = typeof c.name === "string" ? c.name.trim() : "";
    if (!name) fail(400, "칸 이름을 적어 주세요.");
    if (name.length > 20) fail(400, "칸 이름은 20자까지 쓸 수 있어요.");
    return { id: c.id, name };
  });
  if (!seen.has("todo") || !seen.has("done")) fail(400, "'할 일' 칸과 '완료' 칸은 지울 수 없어요.");
  return out;
}
function cleanTags(tags) {
  if (tags === undefined || tags === null) return {};
  if (typeof tags !== "object" || Array.isArray(tags)) fail(400, "프로젝트 색 형식이 올바르지 않아요.");
  const e = Object.entries(tags);
  if (e.length > 60) fail(400, "프로젝트 색은 60개까지예요.");
  const out = {};
  for (const [k, v] of e) {
    const name = String(k).trim();
    if (!name || name.length > 30) fail(400, "프로젝트 이름은 30자까지예요.");
    if (!TAG_COLORS.includes(v)) fail(400, "고를 수 없는 색이에요.");
    out[name] = v;
  }
  return out;
}
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

export function registerBoard(on) {
  on("GET", "/plans/board", async ({ env, q, user }) => {
    const since = q.get("since") || "";
    if (!DAY_RE.test(since)) fail(400, "since=YYYY-MM-DD 형식이에요.");
    const doneSince = Number(q.get("done_since") || 0);
    if (!Number.isFinite(doneSince) || doneSince < 0) fail(400, "done_since 가 올바르지 않아요.");
    const { results } = await env.DB.prepare(
      `SELECT * FROM plans WHERE user_id = ? AND scope = 'day' AND start IS NULL AND (
         (done = 0 AND missed = 0 AND (period >= ? OR due IS NOT NULL OR status IS NOT NULL))
         OR (done = 1 AND done_at >= ?)
       ) ORDER BY sort, created_at LIMIT 500`
    ).bind(user.id, "D:" + since, doneSince).all();
    return json({ plans: results.map(outPlan) });
  });

  on("GET", "/plans/board/cols", async ({ env, user }) => {
    const r = await env.DB.prepare("SELECT cols, tags, updated_at FROM task_board WHERE user_id = ?").bind(user.id).first();
    return json({ cols: r ? parse(r.cols, DEFAULT_COLS) : DEFAULT_COLS, tags: r ? parse(r.tags, {}) : {}, updated_at: r?.updated_at || 0 });
  });

  on("PUT", "/plans/board/cols", async ({ req, env, user }) => {
    const b = await body(req);
    const prev = await env.DB.prepare("SELECT cols, tags FROM task_board WHERE user_id = ?").bind(user.id).first();
    const oldCols = prev ? parse(prev.cols, DEFAULT_COLS) : DEFAULT_COLS;
    const cols = b.cols === undefined ? oldCols : cleanCols(b.cols);
    const tags = b.tags === undefined ? (prev ? parse(prev.tags, {}) : {}) : cleanTags(b.tags);
    const t = now();
    const gone = oldCols.map((c) => c.id).filter((id) => !cols.some((c) => c.id === id));
    const stmts = [env.DB.prepare("INSERT INTO task_board (user_id, cols, tags, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET cols = excluded.cols, tags = excluded.tags, updated_at = excluded.updated_at")
      .bind(user.id, JSON.stringify(cols), JSON.stringify(tags), t)];
    // 지운 칸의 할 일은 '할 일' 칸(status NULL)으로
    if (gone.length) stmts.push(env.DB.prepare(`UPDATE plans SET status = NULL, updated_at = ? WHERE user_id = ? AND status IN (${gone.map(() => "?").join(",")})`).bind(t, user.id, ...gone));
    const res = await env.DB.batch(stmts);
    return json({ cols, tags, updated_at: t, moved: gone.length ? res[1].meta.changes || 0 : 0 });
  });
}

// 계획 되돌리기 — 하루 계획표(day.js) · 홈 시계(home.js) 가 같이 써요. 기록은 undo.js 의 "plan" 묶음.
//   const pu = planUndo(ctx)     화면이 닫힐 때 pu.dispose()
//   pu.patched(id, before, after, label)   시각 · 길이 · 이름 · 끝냄/못함 · 우선순위 · 미루기(period)
//   pu.added(plans, label)                 추가 · 붙여넣기 (되돌리기 = 지우기, 다시 = 그대로 다시 만들기)
//   pu.deleted(plan, label)               지우기 (되돌리기 = 다시 만들고 끝냄/못함까지, id 는 새 것으로 바꿔 기억)
//   pu.patchedMany([{ id, before, after }], label) · pu.deletedMany(plans, label)   여러 개를 한 번에 (고른 것 묶기 · 옮기기 · 지우기)
// 되돌릴 때 서버 값이 우리가 바꾼 값과 다르면(그 사이 다른 곳에서 고침) 덮어쓰지 않아요 — PATCH 의 expect (서버가 409)
// 서버에도 반대 요청을 보내고, 끝나면 ctx.changed("plans") 로 떠 있는 화면이 다시 불러와요.
import { api } from "./api.js";
import { undoScope, resolveId, remap } from "./undo.js";

const norm = (k, v) => (k === "done" || k === "missed" ? !!v : v ?? null);
const pickOld = (p, keys) => Object.fromEntries(keys.map((k) => [k, norm(k, p?.[k])]));

// 지운 계획을 다시: POST 는 끝냄 · 못함을 받지 않아서 만든 뒤 PATCH
export async function recreatePlan(s) {
  // 보드 칸 · 프로젝트 · 마감일 · 작은 할 일 · 메모 · 순서도 그대로 (할 일 보드, 2026-10-24)
  const board = { ...(s.status ? { status: s.status } : {}), ...(s.project ? { project: s.project } : {}), ...(s.due ? { due: s.due } : {}), ...(Array.isArray(s.subtasks) && s.subtasks.length ? { subtasks: s.subtasks } : {}), ...(s.note ? { note: s.note } : {}), ...(Number.isFinite(s.sort) ? { sort: s.sort } : {}) };
  const { plan } = await api.addPlan({ scope: s.scope || "day", period: s.period, text: s.text, ...(s.start ? { start: s.start } : {}), ...(s.mins ? { mins: s.mins } : {}), ...(s.color ? { color: s.color } : {}), ...(s.priority ? { priority: s.priority } : {}), ...(s.group_id ? { group_id: s.group_id } : {}), ...board });
  if (s.done) await api.updatePlan(plan.id, { done: true });
  else if (s.missed) await api.updatePlan(plan.id, { missed: true });
  remap(s.id, plan.id);
  return plan;
}
// 지금 서버에 있는 모습 (다시 하기용) — 못 찾으면 적어 둔 그대로
async function current(s) {
  try { const { plans } = await api.plans([s.period]); return plans.find((x) => x.id === resolveId(s.id)) || s; } catch { return s; }
}

function diff(id, before, after) {
  const b = {}, a = {};
  for (const k of Object.keys(after)) { b[k] = norm(k, before[k]); a[k] = norm(k, after[k]); }
  return JSON.stringify(a) === JSON.stringify(b) ? null : { id, b, a };
}
// to = "b"(되돌리기) | "a"(다시 하기). 지금 서버 값이 반대쪽 값이어야만 바꿔요 (아니면 409 → 되돌리지 않았다고 알려요)
async function apply(ds, to) {
  const from = to === "b" ? "a" : "b";
  await Promise.all(ds.map((d) => api.updatePlan(resolveId(d.id), { ...d[to], expect: d[from] })));
}

export function planUndo(ctx) {
  const u = undoScope("plan");
  const done = () => ctx.changed("plans");
  return {
    dispose: () => u.dispose(),
    pickOld,
    // also = { undo?, redo? }: 같이 되돌릴 것 (예: 끝냄과 함께 적힌 실행 기록 지우기)
    patched(id, before, after, label, also = {}) {
      const d = diff(id, before, after); if (!d) return;
      u.push({ label, undo: async () => { await apply([d], "b"); await also.undo?.(); done(); }, redo: async () => { await apply([d], "a"); await also.redo?.(); done(); } });
    },
    patchedMany(list, label) {
      const ds = list.map((x) => diff(x.id, x.before, x.after)).filter(Boolean); if (!ds.length) return;
      u.push({ label, undo: async () => { await apply(ds, "b"); done(); }, redo: async () => { await apply(ds, "a"); done(); } });
    },
    deletedMany(list, label) {
      const ss = list.map((p) => ({ ...p })); if (!ss.length) return;
      u.push({
        label,
        undo: async () => { for (const s of ss) await recreatePlan(s); done(); },
        redo: async () => { await Promise.all(ss.map((s) => api.deletePlan(resolveId(s.id)).catch((e) => { if (e.status !== 404) throw e; }))); done(); },
      });
    },
    added(plans, label) {
      let snaps = plans.map((p) => ({ ...p }));
      u.push({
        label,
        undo: async () => { snaps = await Promise.all(snaps.map(current)); await Promise.all(snaps.map((s) => api.deletePlan(resolveId(s.id)).catch((e) => { if (e.status !== 404) throw e; }))); done(); },
        redo: async () => { for (const s of snaps) await recreatePlan(s); done(); },
      });
    },
    deleted(p, label) {
      const s = { ...p };
      u.push({
        label,
        undo: async () => { await recreatePlan(s); done(); },
        redo: async () => { await api.deletePlan(resolveId(s.id)).catch((e) => { if (e.status !== 404) throw e; }); done(); },
      });
    },
  };
}

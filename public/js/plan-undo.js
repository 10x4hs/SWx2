// 계획 되돌리기 — 하루 계획표(day.js) · 홈 시계(home.js) 가 같이 써요. 기록은 undo.js 의 "plan" 묶음.
//   const pu = planUndo(ctx)     화면이 닫힐 때 pu.dispose()
//   pu.patched(id, before, after, label)   시각 · 길이 · 이름 · 끝냄/못함 · 우선순위 · 미루기(period)
//   pu.added(plans, label)                 추가 · 붙여넣기 (되돌리기 = 지우기, 다시 = 그대로 다시 만들기)
//   pu.deleted(plan, label)               지우기 (되돌리기 = 다시 만들고 끝냄/못함까지, id 는 새 것으로 바꿔 기억)
// 서버에도 반대 요청을 보내고, 끝나면 ctx.changed("plans") 로 떠 있는 화면이 다시 불러와요.
import { api } from "./api.js";
import { undoScope, resolveId, remap } from "./undo.js";

const norm = (k, v) => (k === "done" || k === "missed" ? !!v : v ?? null);
const pickOld = (p, keys) => Object.fromEntries(keys.map((k) => [k, norm(k, p?.[k])]));

// 지운 계획을 다시: POST 는 끝냄 · 못함을 받지 않아서 만든 뒤 PATCH
export async function recreatePlan(s) {
  const { plan } = await api.addPlan({ scope: s.scope || "day", period: s.period, text: s.text, ...(s.start ? { start: s.start } : {}), ...(s.mins ? { mins: s.mins } : {}), ...(s.color ? { color: s.color } : {}), ...(s.priority ? { priority: s.priority } : {}) });
  if (s.done) await api.updatePlan(plan.id, { done: true });
  else if (s.missed) await api.updatePlan(plan.id, { missed: true });
  remap(s.id, plan.id);
  return plan;
}
// 지금 서버에 있는 모습 (다시 하기용) — 못 찾으면 적어 둔 그대로
async function current(s) {
  try { const { plans } = await api.plans([s.period]); return plans.find((x) => x.id === resolveId(s.id)) || s; } catch { return s; }
}

export function planUndo(ctx) {
  const u = undoScope("plan");
  const done = () => ctx.changed("plans");
  return {
    dispose: () => u.dispose(),
    pickOld,
    // also = { undo?, redo? }: 같이 되돌릴 것 (예: 끝냄과 함께 적힌 실행 기록 지우기)
    patched(id, before, after, label, also = {}) {
      const b = {}, a = {};
      for (const k of Object.keys(after)) { b[k] = norm(k, before[k]); a[k] = norm(k, after[k]); }
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      u.push({ label, undo: async () => { await api.updatePlan(resolveId(id), b); await also.undo?.(); done(); }, redo: async () => { await api.updatePlan(resolveId(id), a); await also.redo?.(); done(); } });
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

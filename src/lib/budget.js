// 바깥 요청(subrequest) 예산 — Workers 무료 플랜은 호출 한 번에 fetch 50개까지예요 (AI 호출도 fetch 라 같이 세요).
// 크론 하나를 withBudget(40, fn) 으로 감싸면 그 안에서 나가는 fetch 를 세고, 40개를 넘기려 하면 fetch 를 막아요(에러).
// AsyncLocalStorage(nodejs_als) 로 "이 호출의 몫"만 세요 — 같은 isolate 의 다른 요청이 섞이지 않게.
// 시험용 가짜 AI(NEWS_FAKE_AI=1)는 fetch 를 안 하니 charge() 로 1개씩 직접 셉니다 → 시험에서도 실제와 같은 수가 나와요.
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage();
const rawFetch = globalThis.fetch;

export class BudgetError extends Error {}

function take(n = 1) {
  const b = als.getStore();
  if (!b) return;
  if (b.used + n > b.limit) throw new BudgetError(`subrequest budget ${b.limit} reached`);
  b.used += n;
}

globalThis.fetch = function countedFetch(...args) {
  try { take(1); } catch (e) { return Promise.reject(e); }
  // 예산 안(크론 · 되채우기)에서는 응답 없는 AI 공급사 하나가 전체를 붙잡지 않게 90초 상한을 붙여요
  if (als.getStore() && !(args[1] && args[1].signal)) {
    args = [args[0], { ...(args[1] || {}), signal: AbortSignal.timeout(90000) }];
  }
  return rawFetch.apply(this, args);
};

/** 가짜 AI 처럼 fetch 없이 "한 번 부른 셈" 칠 때 */
export const charge = (n = 1) => take(n);
/** 남은 몫 (예산 밖이면 Infinity) */
export const left = () => { const b = als.getStore(); return b ? b.limit - b.used : Infinity; };
export const used = () => als.getStore()?.used || 0;

/** fn 을 limit 개 예산 안에서 돌려요. 안쪽에서 또 부르면 바깥 예산을 그대로 써요(중첩 안 늘어남). */
export async function withBudget(limit, fn) {
  const outer = als.getStore();
  if (outer) return { result: await fn(), used: outer.used, limit: outer.limit };
  const b = { limit, used: 0 };
  const result = await als.run(b, fn);
  return { result, used: b.used, limit };
}

// 기능 잠금 (화면): 관리자 말고는 뉴스 · 대화방 · 계획만 기본. 잠긴 기능은 독에 자물쇠, 들어가면 '사용 신청' 화면.
// 서버 쪽 같은 목록은 src/features.js — 화면을 숨겨도 서버가 한 번 더 막아요.
import { api } from "./api.js";
import { esc, toast } from "./util.js";

// 화면(view) → 기능
export function featureOfRoute(r) {
  if (["brain", "graph", "notes"].includes(r.view)) return "brain";
  if (["ai", "planner"].includes(r.view)) return "ai";
  if (["diary", "diaryRoom"].includes(r.view)) return "diary";
  if (["english", "papers", "books"].includes(r.view) || (r.view === "page" && r.place === "study")) return "study";
  if (r.view === "mba") return "biz";
  if (r.view === "dev") return "dev";
  if (r.view === "page") return "pages";
  return null;
}
export const NAV_FEATURE = { brain: "brain", study: "study", diary: "diary", biz: "biz", dev: "dev" };
export const isOpen = (ctx, f) => !f || ctx.me?.role === "admin" || (ctx.features?.open || []).includes(f);

export async function loadFeatures(ctx) {
  try { ctx.features = await api.features(); } catch { ctx.features = { all: {}, open: [], pending: [] }; }
}
// 잠긴 화면: 자물쇠 + 사용 신청 (이미 신청했으면 기다리는 중)
export function mountLocked(host, ctx, f) {
  const name = ctx.features?.all?.[f] || f;
  const draw = () => {
    const pending = (ctx.features?.pending || []).includes(f);
    host.innerHTML = `<div class="lock-view"><div class="lock-ic" aria-hidden="true">🔒</div><h1>${esc(name)}</h1>
      <p class="faint">이 기능은 잠겨 있어요. 사용 신청을 하면 관리자가 확인하고 열어 줘요.</p>
      ${pending ? `<p class="lock-wait">신청했어요 · 관리자 승인을 기다리는 중</p>` : `<textarea class="input lock-note" maxlength="200" rows="2" placeholder="쓰려는 이유 (선택)"></textarea><button type="button" class="btn lock-go">사용 신청</button>`}</div>`;
    host.querySelector(".lock-go")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        await api.requestFeature(f, host.querySelector(".lock-note")?.value || "");
        (ctx.features.pending ||= []).push(f);
        toast("사용 신청을 보냈어요."); draw();
      } catch (err) { e.target.disabled = false; toast(err.message, "err"); }
    });
  };
  draw();
  return () => {};
}

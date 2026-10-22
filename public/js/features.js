// 기능 잠금 (화면): 관리자 말고는 일기 · 대화방 · 계획 · 노트만 기본. 잠긴 기능은 독에 자물쇠, 들어가면 '사용 신청' 화면.
// 서버 쪽 같은 목록은 src/features.js — 화면을 숨겨도 서버가 한 번 더 막아요.
import { api } from "./api.js";
import { esc, toast } from "./util.js";

// 화면(view) → 기능
export function featureOfRoute(r) {
  if (r.view === "ai") return "ai"; // AI 계획(planner)은 누구나 — 계획 짤 때 AI 를 쓰게
  if (r.view === "news") return "news";
  if (["english", "papers", "books"].includes(r.view) || (r.view === "page" && r.place === "study")) return "study";
  if (r.view === "mba") return "biz";
  if (r.view === "dev") return "dev";
  if (r.view === "cim") return "cim";
  if (r.view === "page") return "pages";
  return null;
}
export const NAV_FEATURE = { study: "study", news: "news", biz: "biz", dev: "dev", cim: "cim" };
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
      ${pending ? `<p class="lock-wait">신청했어요 · 관리자 승인을 기다리는 중</p>` : `<textarea class="input lock-note" maxlength="200" rows="2" placeholder="쓰려는 이유 (선택)"></textarea><button type="button" class="btn lock-go">사용 신청</button>`}
      <a class="lock-ask" href="#/room/help">관리자에게 물어보기 →</a></div>`;
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

// 관리자 '시간 추가' (관리자 화면 · 문의방이 같이 써요): 범위(전체 Dock · 기능 하나) + 24시간 · 3일 · 7일
const TIME_OPTS = [[24, "+24시간"], [72, "+3일"], [168, "+7일"], [-24, "−24시간"], [-72, "−3일"], [-168, "−7일"]]; // 빼기 = 잘못 늘렸을 때
export const timeForm = (all) => `<div class="adm-time" role="group" aria-label="사용 시간 추가"><span class="faint">시간 추가</span><select class="input adm-time-scope" aria-label="범위"><option value="all">전체 Dock</option>${Object.entries(all || {}).map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join("")}</select>${TIME_OPTS.map(([h, l]) => `<button type="button" class="btn sm${h < 0 ? " ghost" : ""}" data-hours="${h}"${h < 0 ? ` title="잘못 늘렸을 때 빼요"` : ""}>${l}</button>`).join("")}</div>`;
export async function addTime(btn, userId) {
  const scope = btn.closest(".adm-time").querySelector(".adm-time-scope").value;
  btn.disabled = true;
  try { const r = await api.adminAddTime(userId, scope, Number(btn.dataset.hours)); toast(r.permanent || r.none ? r.message : (Number(btn.dataset.hours) < 0 ? "줄였어요" : "늘렸어요") + " · 문의방으로 알려 줬어요"); return r; }
  catch (e) { toast(e.message, "err"); return null; } finally { btn.disabled = false; }
}

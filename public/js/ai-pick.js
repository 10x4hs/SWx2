// AI 모델 고르기 + 웹 검색 켜기 — 어디서든(일정 AI 비서 · 노트 AI · 편집기 · 계획 AI) 같은 설정을 써요.
// 모델은 계정에 저장돼요(users.ai_model · PATCH /me) — 다른 기기에서도, 자정 AI 점수 · 주간 회고도 이 모델을 먼저 써요.
// localStorage trio-ai-pick = { model, web } 는 빠르게 그리려는 사본이고, 로그인할 때 syncAiPrefs(me) 로 계정 값에 맞춰요. web 은 이 기기에만.
import { api } from "./api.js";
import { esc, toast } from "./util.js";

const KEY = "trio-ai-pick";
let cache = null; // 모델 목록은 한 번만 받아요
export function aiPrefs() { try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return { model: typeof v.model === "string" ? v.model : "", web: v.web === true }; } catch { return { model: "", web: false }; } }
export function setAiPrefs(p) {
  const before = aiPrefs().model;
  try { localStorage.setItem(KEY, JSON.stringify({ ...aiPrefs(), ...p })); } catch {}
  if (p.model !== undefined && p.model !== before) {
    api.updateMe({ ai_model: p.model || "" }).catch((e) => toast(e.message || "AI 모델을 저장하지 못했어요.", "err"));
    window.dispatchEvent(new CustomEvent("trio:ai-model", { detail: { model: p.model || "" } })); // 같은 화면의 다른 고르기 칸도 맞춰요
  }
}
// 로그인 · 내 정보가 바뀌면 계정의 모델로 맞춰요 (서버 값이 기준)
export function syncAiPrefs(me) { if (!me) return; try { localStorage.setItem(KEY, JSON.stringify({ ...aiPrefs(), model: me.ai_model || "" })); } catch {} }
export async function aiModels() { if (!cache) cache = api.aiModels().then((r) => r.models.filter((m) => m.id !== "all")).catch(() => []); return cache; }
// 실제로 답한 모델 이름(예: openai/gpt-oss-120b) → 고르기 목록의 이름 { pick, label } (계산식 점수는 "formula")
export async function whoAnswered(used) {
  if (!used) return null;
  if (used === "formula") return { pick: null, label: "계산식 (AI 가 바빠서)" };
  const m = (await aiModels()).find((x) => x.id === used || (x.chain || []).includes(used));
  return m ? { pick: m.id, label: m.label } : { pick: null, label: used };
}
export async function modelName(id) { if (!id) return "자동 (되는 모델)"; return (await aiModels()).find((m) => m.id === id)?.label || id; }

// host 에 <select> + 🌐 토글을 그려요. opts: { onChange(prefs), web: true|false(토글 표시), compact }
export function mountAiPick(host, opts = {}) {
  const p = aiPrefs();
  host.classList.add("ai-pick");
  host.innerHTML = `${opts.label ? `<span class="ai-pick-l">${esc(opts.label)}</span>` : ""}<select class="select sm" aria-label="AI 모델" title="어느 AI 로 할지 · 계정에 저장돼서 다른 기기 · 자정 AI 점수 · 주간 회고도 이 모델을 먼저 써요"><option value="">자동 (되는 모델)</option></select>${opts.web === false ? "" : `<button type="button" class="ai-web" aria-pressed="${p.web}" title="웹 먼저 찾기 · 켜면 먼저 웹을 검색하고 답해요 (꺼도 AI 가 필요하면 스스로 검색해요)">${globe()}<span>웹</span></button>`}`;
  const sel = host.querySelector("select"), web = host.querySelector(".ai-web");
  aiModels().then((models) => {
    sel.innerHTML = `<option value="">자동 (되는 모델)</option>` + models.map((m) => `<option value="${esc(m.id)}" ${m.id === p.model ? "selected" : ""} ${m.available ? "" : "disabled"}>${esc(m.label)}${m.available ? "" : " (키 없음)"}</option>`).join("");
    if (!models.some((m) => m.id === p.model && m.available)) sel.value = "";
  });
  sel.addEventListener("change", () => { setAiPrefs({ model: sel.value }); opts.onChange?.(aiPrefs()); });
  // 다른 곳에서 모델을 바꾸면 이 칸도 따라가요 (화면에서 빠지면 듣기를 그만둬요)
  const follow = (e) => { if (!host.isConnected) return window.removeEventListener("trio:ai-model", follow); if (sel.value !== e.detail.model) sel.value = e.detail.model; };
  window.addEventListener("trio:ai-model", follow);
  web?.addEventListener("click", () => { const on = web.getAttribute("aria-pressed") !== "true"; web.setAttribute("aria-pressed", String(on)); setAiPrefs({ web: on }); opts.onChange?.(aiPrefs()); });
  return { get: aiPrefs };
}
export const globe = (z = 13) => `<svg width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`;
// 도구 실행 기록을 작은 칩으로
export const TOOL_KO = { web_search: "웹 검색", read_page: "페이지 읽기", search_notes: "노트 찾기", read_note: "노트 읽기", my_plans: "내 계획", read_image: "이미지 읽기", day_plans: "계획 보기", add_plan: "계획 넣기", update_plan: "계획 고치기", delete_plan: "계획 지우기" };
export function stepsHTML(steps) {
  if (!steps?.length) return "";
  return `<div class="ai-steps">${steps.map((s) => `<span class="ai-step" title="${esc(JSON.stringify(s.args || {}))}">${s.name === "web_search" || s.name === "read_page" ? globe(11) : s.name === "read_image" ? "🖼" : "·"} ${esc(TOOL_KO[s.name] || s.name)}${s.args?.q ? `: <b>${esc(String(s.args.q).slice(0, 40))}</b>` : s.args?.url ? `: <b>${esc(String(s.args.url).replace(/^https?:\/\//, "").slice(0, 40))}</b>` : s.args?.title ? `: <b>${esc(s.args.title)}</b>` : ""}${s.summary ? `<small> · ${esc(String(s.summary).slice(0, 60))}</small>` : ""}</span>`).join("")}</div>`;
}

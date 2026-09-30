// AI 모델 고르기 + 웹 검색 켜기 — 어디서든(노트 AI · 편집기 · 계획 AI · 채팅) 같은 설정을 써요.
// 고른 값은 localStorage 에 있어요: trio-ai-pick = { model: "groq", web: false }. model 은 서버 /ai/models 의 id (all 은 채팅 비교용이라 여기선 안 써요).
import { api } from "./api.js";
import { esc } from "./util.js";

const KEY = "trio-ai-pick";
let cache = null; // 모델 목록은 한 번만 받아요
export function aiPrefs() { try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return { model: typeof v.model === "string" ? v.model : "", web: v.web === true }; } catch { return { model: "", web: false }; } }
export function setAiPrefs(p) { try { localStorage.setItem(KEY, JSON.stringify({ ...aiPrefs(), ...p })); } catch {} }
export async function aiModels() { if (!cache) cache = api.aiModels().then((r) => r.models.filter((m) => m.id !== "all")).catch(() => []); return cache; }

// host 에 <select> + 🌐 토글을 그려요. opts: { onChange(prefs), web: true|false(토글 표시), compact }
export function mountAiPick(host, opts = {}) {
  const p = aiPrefs();
  host.classList.add("ai-pick");
  host.innerHTML = `<select class="select sm" aria-label="AI 모델" title="어느 AI 로 할지"><option value="">자동 (되는 모델)</option></select>${opts.web === false ? "" : `<button type="button" class="ai-web" aria-pressed="${p.web}" title="웹 먼저 찾기 · 켜면 먼저 웹을 검색하고 답해요 (꺼도 AI 가 필요하면 스스로 검색해요)">${globe()}<span>웹</span></button>`}`;
  const sel = host.querySelector("select"), web = host.querySelector(".ai-web");
  aiModels().then((models) => {
    sel.innerHTML = `<option value="">자동 (되는 모델)</option>` + models.map((m) => `<option value="${esc(m.id)}" ${m.id === p.model ? "selected" : ""} ${m.available ? "" : "disabled"}>${esc(m.label)}${m.available ? "" : " (키 없음)"}</option>`).join("");
    if (!models.some((m) => m.id === p.model && m.available)) sel.value = "";
  });
  sel.addEventListener("change", () => { setAiPrefs({ model: sel.value }); opts.onChange?.(aiPrefs()); });
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

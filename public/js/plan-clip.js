// 계획 복사 · 붙여넣기 (⌘C · ⌘V, 윈도우는 Ctrl) — 하루 계획표와 홈 시계가 같이 써요.
// 복사: 고른(없으면 마우스를 올린) 계획을 이 탭에 기억하고, 시스템 클립보드에도 "14:00–15:25 영어 회화" 줄로 넣어요 (메모 · 대화에 붙여 넣기).
// 붙여넣기: 마우스가 시간표 위면 그 시각부터(여러 개면 간격 그대로), 아니면 원래 시각에. 클립보드 글이 방금 복사한 줄과 같으면
// 그 계획(길이 · 우선순위까지), 다른 글이면 이 줄 모양("HH:MM–HH:MM 이름")일 때만 계획으로 읽어요.
// 되돌리기(⌘Z · ⌘⇧Z)는 화면 쪽 paste 가 공용 기록(undo.js · plan-undo.js)에 넣어요 — 시간 제한 없이, 다른 계획 고치기와 같은 줄에서.
import { toast } from "./util.js";

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
const pad = (n) => String(n).padStart(2, "0");
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const toTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const lineOf = (p) => `${p.start}–${toTime(Math.min(1440, toMin(p.start) + p.mins))} ${p.text}`;
const typingNow = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
const textSelected = () => { const s = window.getSelection?.(); return !!s && !s.isCollapsed && String(s).trim() !== ""; };

let clip = null; // { items: [{ text, start, mins, priority }], text } — 화면을 옮겨도(다른 날 · 홈) 이 탭에선 그대로

// 클립보드 글 → 붙일 계획들 (방금 복사한 것과 같으면 그대로, 아니면 "HH:MM–HH:MM 이름" 줄만)
function fromText(text) {
  const t = (text || "").trim();
  if (!t) return null;
  if (clip && t === clip.text) return clip.items;
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 30) return null;
  const items = [];
  for (const l of lines) {
    const m = /^(\d{1,2}):(\d{2})\s*[–~-]\s*(\d{1,2}):(\d{2})\s+(.+)$/.exec(l);
    if (!m) return null;
    const s = +m[1] * 60 + +m[2], e = +m[3] * 60 + +m[4];
    if (s >= 1440 || e <= s || e > 1440) return null;
    items.push({ text: m[5].slice(0, 200), start: toTime(s), mins: e - s, priority: "" });
  }
  return items;
}
// 붙일 시각으로 옮기기: at(분)이 있으면 가장 이른 계획이 그 시각에 오게 같이 옮기고, 없으면 원래 시각. 24시를 넘는 건 빼요
function shiftTo(items, at) {
  const first = Math.min(...items.map((p) => toMin(p.start))), d = at == null ? 0 : at - first;
  return items.map((p) => ({ ...p, m: toMin(p.start) + d })).filter((p) => p.m >= 0 && p.m < 1440).map(({ m, ...p }) => ({ ...p, start: toTime(m) }));
}

// opts: active() → 이 화면이 지금 받나 · pick() → 복사할 계획들 [{ text, start, mins, priority }]
//       target() → 붙일 곳 { at: 분 | null } (못 붙이면 null) · paste(list) → Promise<새 id 들> (되돌리기 기록도 paste 가 남겨요)
export function mountPlanClip(opts) {
  let pending = null; // ⌘V 를 눌렀는데 paste 이벤트가 안 오는 브라우저면 잠깐 뒤 이 탭에 기억한 복사본으로
  async function put(items) {
    const t = opts.target();
    if (!t) return;
    const list = shiftTo(items, t.at);
    if (!list.length) { toast("붙일 수 있는 계획이 없어요 (24시를 넘어요)."); return; }
    try {
      const ids = await opts.paste(list);
      toast(`붙여 넣었어요 · 계획 ${ids.length}개${t.at == null ? "" : ` · ${list[0].start}부터`} (${MOD}Z 되돌리기)`);
    } catch (e) { toast(e.message || "붙여 넣지 못했어요.", "err"); }
  }
  const onKey = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !opts.active() || typingNow()) return;
    const k = e.key.toLowerCase();
    if (k === "c") {
      if (textSelected()) return; // 글을 고른 채 복사하면 원래대로
      const items = (opts.pick() || []).filter((p) => /^\d\d:\d\d$/.test(p.start || "")).map((p) => ({ text: p.text, start: p.start, mins: p.mins || 30, priority: p.priority || "" })).sort((a, b) => toMin(a.start) - toMin(b.start));
      if (!items.length) return;
      e.preventDefault();
      clip = { items, text: items.map(lineOf).join("\n") };
      navigator.clipboard?.writeText(clip.text).catch(() => {});
      toast(`복사했어요 · 계획 ${items.length}개 — 붙일 시각에 마우스를 대고 ${MOD}V`);
    } else if (k === "v") {
      if (!clip) return;
      clearTimeout(pending);
      pending = setTimeout(() => { pending = null; put(clip.items); }, 80);
    }
  };
  const onPaste = (e) => {
    clearTimeout(pending); pending = null; // paste 이벤트를 주는 브라우저면 이것만 따라요 (기억한 복사본 대신 지금 클립보드 글로)
    if (!opts.active() || typingNow()) return;
    const items = fromText(e.clipboardData?.getData("text/plain"));
    if (!items) return; // 계획 줄이 아니면 원래대로
    e.preventDefault();
    put(items);
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("paste", onPaste);
  return () => {
    clearTimeout(pending);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("paste", onPaste);
  };
}

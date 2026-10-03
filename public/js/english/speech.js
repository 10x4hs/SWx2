// 소리 — 브라우저 음성 합성(🔊 듣기)과 음성 인식(🎙 따라 말하기). 둘 다 없으면 버튼을 숨겨요.
import { store } from "./data.js";

const RATE_KEY = "trio-en-rate";
// 무채색 선 아이콘 (UI 에는 색을 넣지 않아요)
const ic = (d, z = 16) => `<svg width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const speakerIcon = (z) => ic('<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>', z);
export const micIcon = (z) => ic('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>', z);

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const canListen = () => !!SR;

export const getRate = () => (store.get(RATE_KEY, 1) === 0.8 ? 0.8 : 1);
export const setRate = (r) => store.set(RATE_KEY, r === 0.8 ? 0.8 : 1);

// 미국 영어 목소리 하나 고르기 (목록은 늦게 올 수 있어요)
let voice = null;
function pickVoice() {
  if (!canSpeak()) return null;
  const vs = speechSynthesis.getVoices().filter((v) => /^en[-_]US/i.test(v.lang));
  voice = vs.find((v) => /Samantha|Google US English|Aria|Jenny/i.test(v.name)) || vs.find((v) => v.localService) || vs[0] || null;
  return voice;
}
if (canSpeak()) { pickVoice(); speechSynthesis.addEventListener?.("voiceschanged", pickVoice); }

// 한 문장 읽기 → 다 읽으면 끝나는 Promise
export function speak(text, { rate = getRate() } = {}) {
  if (!canSpeak() || !text) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = "en-US"; u.rate = rate;
    if (voice || pickVoice()) u.voice = voice;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
export const stopSpeaking = () => { if (canSpeak()) speechSynthesis.cancel(); };

// 따라 말하기 — onText(글자, 끝남?) 로 알려줘요. 돌려준 함수로 멈춰요.
export function listen({ onText, onEnd, onError }) {
  if (!SR) { onError?.("이 브라우저는 음성 인식을 지원하지 않아요."); return () => {}; }
  const rec = new SR();
  rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
    }
    onText?.((finalText + interim).trim(), false);
  };
  rec.onerror = (e) => onError?.(e.error === "not-allowed" ? "마이크 사용을 허락해 주세요." : e.error === "no-speech" ? "소리가 들리지 않았어요. 다시 해 볼까요?" : "음성 인식이 멈췄어요.");
  rec.onend = () => onEnd?.(finalText.trim());
  try { rec.start(); } catch { onError?.("음성 인식을 시작하지 못했어요."); }
  return () => { try { rec.stop(); } catch {} };
}

// 단어 겹침 % — 목표 문장의 단어 중 몇 개를 말했는지 (순서는 보지 않아요)
const words = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
export function overlap(target, said) {
  const t = words(target), bag = new Map();
  for (const w of words(said)) bag.set(w, (bag.get(w) || 0) + 1);
  if (!t.length) return 0;
  let hit = 0;
  for (const w of t) { const c = bag.get(w) || 0; if (c) { hit++; bag.set(w, c - 1); } }
  return Math.round((hit / t.length) * 100);
}

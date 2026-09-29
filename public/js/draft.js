// 쓰던 글 붙잡아 두기 — 다른 화면에 갔다 와도 입력창의 글이 그대로 남아요 (이 기기의 localStorage, 보내면 지워요).
// keepDraft(input, key) → { clear() }. key 가 바뀌는 곳(방·대화별)은 rebind(newKey) 로 바꿔요.
const P = "trio-draft:";
const get = (k) => { try { return localStorage.getItem(P + k) || ""; } catch { return ""; } };
const put = (k, v) => { try { if (v) localStorage.setItem(P + k, v.slice(0, 8000)); else localStorage.removeItem(P + k); } catch {} };

export function keepDraft(input, key) {
  let k = key, t = 0;
  const restore = () => { const v = get(k); if (v && !input.value) { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); } };
  const onInput = () => { clearTimeout(t); t = setTimeout(() => put(k, input.value), 250); };
  input.addEventListener("input", onInput);
  input.addEventListener("blur", () => put(k, input.value));
  restore();
  return {
    clear() { clearTimeout(t); put(k, ""); },
    rebind(next) { if (next === k) return; put(k, input.value); k = next; input.value = ""; restore(); },
  };
}

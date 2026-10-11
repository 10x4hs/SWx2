// 친구가 공개한 페이지를 '내 화면에서만' 숨기기 (Dock 아이콘 · 공부 과목 탭). 계정에 저장돼요 (users.hidden_pages · PATCH /me).
// 친구 쪽에는 아무 변화가 없어요. 다시 보이게 하려면 프로필 → 숨긴 페이지.
import { api } from "./api.js";
import { toast } from "./util.js";

let me = null; // app.js 가 로그인 때 알려 줘요
export function setHiddenMe(m) { me = m; }
export const isHidden = (p) => !!(me && p && !p.mine && (me.hidden_pages || []).includes(p.id));

async function save(next, msg) {
  const r = await api.updateMe({ hidden_pages: next });
  me.hidden_pages = r.user.hidden_pages;
  window.dispatchEvent(new CustomEvent("trio:me", { detail: { ...me, ...r.user } }));
  window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "pages" } })); // Dock · 공부 탭이 다시 그려요
  if (msg) toast(msg);
}
export async function hidePage(p) {
  if (!me || p.mine) return;
  try { await save([...new Set([...(me.hidden_pages || []), p.id])], `'${p.title}' 를 내 화면에서 숨겼어요. 프로필 → 숨긴 페이지에서 다시 보이게 할 수 있어요.`); }
  catch (e) { toast(e.message || "숨기지 못했어요.", "err"); }
}
export async function unhidePage(id) {
  if (!me) return;
  try { await save((me.hidden_pages || []).filter((x) => x !== id), "다시 보여요."); }
  catch (e) { toast(e.message || "바꾸지 못했어요.", "err"); }
}

// Dock 아이콘 우클릭 → Customize: 화면마다 내 CSS · HTML · JS 를 원본 위에 덮어씌워요 (본인 계정만, 원본 파일은 그대로).
//   CSS  — 늘 켜져 있어요 (한 <style> 에 모아요). 화면만 바꾸려면 .host-<view> 로 시작하면 돼요
//   HTML — 화면(nav:*)은 맨 위에 끼워 넣고, 버튼(ui:*)은 아이콘을 바꿔요
//   JS   — 화면은 열릴 때마다, 버튼은 그려질 때 한 번. (el, ctx, api) 를 받고, 함수를 돌려주면 화면을 닫을 때 불러요
import { api } from "./api.js";
import { esc, toast } from "./util.js";
import { icon } from "./icons.js";
import { openMenu } from "./ctxmenu.js";

let ctx, map = {};
// 버튼(ui:*) 칸 → 셀렉터 · 이름 · 원본 파일
const UI = {
  "ui:search": { sel: "#open-palette", name: "Search", src: "/js/palette.js" },
  "ui:add": { sel: ".rail-add", name: "Add page", src: "/js/views/page.js" },
  "ui:timer": { sel: "#timer-btn", name: "Focus timer", src: "/js/focus-timer.js", keep: "#timer-mini" },
  "ui:me": { sel: "#me-btn", name: "Profile", src: "/js/profile-edit.js" },
};
const VIEW_SRC = { home: "home", calendar: "calendar", brain: "brain", room: "room", study: "study", notes: "notes", books: "books" };
const slotOf = (el) => el.closest("[data-dock^='nav:']")?.dataset.dock || Object.keys(UI).find((k) => el.closest(UI[k].sel)) || null;
const nameOf = (slot) => UI[slot]?.name || (document.querySelector(`[data-dock="${slot}"]`)?.dataset.tip || slot.slice(4)).split(" · ")[0];
const srcOf = (slot) => UI[slot]?.src || (VIEW_SRC[slot.slice(4)] ? `/js/views/${VIEW_SRC[slot.slice(4)]}.js` : null);

export async function initCustomize(c) {
  ctx = c;
  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest(".rail") || e.target.closest("[data-page]")) return; // 사용자 페이지는 dock.js 메뉴가 맡아요
    const slot = slotOf(e.target); if (!slot) return;
    openMenu(e, {
      title: nameOf(slot),
      items: [{ k: "edit", label: "Customize…" }, ...(map[slot] ? [{ sep: true }, { k: "reset", label: "Reset to original", danger: true }] : [])],
      onPick: (k) => (k === "edit" ? openEditor(slot) : reset(slot)),
    });
  });
}

// 로그인 때 한 번 (enter)
export async function loadCustom() {
  try { map = Object.fromEntries(((await api.custom()).custom || []).map((x) => [x.slot, x])); } catch { map = {}; }
  applyCss();
  applyUi();
}
function applyCss(preview) {
  let st = document.getElementById("custom-css");
  if (!st) { st = document.createElement("style"); st.id = "custom-css"; document.head.append(st); }
  const all = { ...map, ...(preview ? { [preview.slot]: preview } : {}) };
  st.textContent = Object.values(all).map((x) => x.css ? `/* ${x.slot} */\n${x.css}` : "").join("\n");
}
const run = (code, el, slot) => { try { return new Function("el", "ctx", "api", code)(el, ctx, api); } catch (err) { toast(`Custom JS error (${nameOf(slot)}): ${err.message}`, "err"); } };

// 버튼들: 원래 아이콘을 기억해 뒀다가 HTML 로 바꾸고, JS 는 그려질 때 한 번
export function applyUi(only) {
  for (const [slot, u] of Object.entries(UI)) {
    if (only && only !== slot) continue;
    const el = document.querySelector(u.sel); if (!el) continue;
    if (el.dataset.orig === undefined) el.dataset.orig = el.innerHTML;
    const c = map[slot];
    const kept = u.keep && el.querySelector(u.keep); // 타이머 남은 시간처럼 다른 코드가 쓰는 칸은 살려 둬요
    el.innerHTML = c?.html?.trim() ? c.html : el.dataset.orig;
    if (kept) el.querySelector(u.keep)?.remove(), el.append(kept);
    if (c?.js?.trim() && el.dataset.ran !== String(c.updated_at)) { el.dataset.ran = String(c.updated_at); run(c.js, el, slot); }
  }
}

// 화면이 열린 뒤 (app.js route) — 돌려준 함수는 화면을 닫을 때 불러요
export function afterMount(view, host) {
  const c = map["nav:" + view]; if (!c) return null;
  if (c.html?.trim()) host.insertAdjacentHTML("afterbegin", `<div class="custom-html">${c.html}</div>`);
  if (!c.js?.trim()) return null;
  const r = run(c.js, host, "nav:" + view);
  return typeof r === "function" ? r : null;
}

async function reset(slot) {
  try { await api.resetCustom(slot); delete map[slot]; applyCss(); applyUi(); toast("Back to original."); ctx.redraw?.(); } catch (err) { toast(err.message || "Failed."); }
}

function openEditor(slot) {
  if (document.querySelector(".cz-back")) return;
  const cur = map[slot] || { css: "", html: "", js: "" }, isUi = slot.startsWith("ui:"), src = srcOf(slot);
  const scope = isUi ? UI[slot].sel : `.host-${slot.slice(4)}`;
  const hint = {
    css: `/* Only you see this. Scope to this screen with ${scope} */\n`,
    html: isUi ? "<!-- Replaces the icon -->" : "<!-- Inserted at the top of the screen -->",
    js: isUi ? "// el = the button · ctx · api. Runs once." : "// el = the screen · ctx · api. Runs on open. Return a function to clean up.",
  };
  const back = document.createElement("div");
  back.className = "palette-back cz-back";
  back.innerHTML = `
    <div class="cz glass" role="dialog" aria-modal="true" aria-labelledby="cz-title">
      <header class="cz-head"><h2 id="cz-title">Customize <span>${esc(nameOf(slot))}</span></h2><button class="icon-btn sm" type="button" data-close aria-label="Close">${icon.x(16)}</button></header>
      <nav class="cz-tabs" role="tablist">${["css", "html", "js"].map((t, i) => `<button type="button" role="tab" data-t="${t}" aria-selected="${i === 0}">${t.toUpperCase()}${cur[t]?.trim() ? "<i></i>" : ""}</button>`).join("")}${src ? `<button type="button" role="tab" data-t="src" aria-selected="false">Source</button>` : ""}</nav>
      ${["css", "html", "js"].map((t, i) => `<textarea class="cz-code" data-p="${t}" spellcheck="false" placeholder="${esc(hint[t])}"${i ? " hidden" : ""}>${esc(cur[t] || "")}</textarea>`).join("")}
      ${src ? `<pre class="cz-code cz-src" data-p="src" hidden>Loading ${esc(src)}…</pre>` : ""}
      <footer class="cz-foot"><small>Only on your account · originals stay intact</small><span>${map[slot] ? `<button class="btn ghost" type="button" data-reset>Reset</button>` : ""}<button class="btn ghost" type="button" data-close>Cancel</button><button class="btn accent" type="button" data-save>Save</button></span></footer>
    </div>`;
  document.body.append(back);
  const ta = (t) => back.querySelector(`[data-p="${t}"]`), val = () => ({ slot, css: ta("css").value, html: ta("html").value, js: ta("js").value });
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); applyCss(); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); }
    else if (e.key === "Tab" && e.target.matches("textarea.cz-code")) { e.preventDefault(); e.target.setRangeText("  ", e.target.selectionStart, e.target.selectionEnd, "end"); }
  };
  document.addEventListener("keydown", onKey, true);
  ta("css").addEventListener("input", () => applyCss(val())); // CSS 는 치는 대로 미리 보여요
  back.querySelector(".cz-tabs").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    back.querySelectorAll("[data-t]").forEach((x) => x.setAttribute("aria-selected", x === b));
    back.querySelectorAll("[data-p]").forEach((x) => { x.hidden = x.dataset.p !== b.dataset.t; });
    if (b.dataset.t === "src" && !ta("src").dataset.done) {
      try { ta("src").textContent = await (await fetch(src)).text(); ta("src").dataset.done = "1"; } catch { ta("src").textContent = "Couldn't load the source."; }
    }
  });
  async function save() {
    const v = val();
    try {
      const r = await api.saveCustom(slot, v);
      if (r.custom) map[slot] = r.custom; else delete map[slot];
      close(); applyUi(isUi ? slot : undefined); toast("Saved · only you see it."); if (!isUi) ctx.redraw?.();
    } catch (err) { toast(err.message || "Failed to save."); }
  }
  back.addEventListener("click", (e) => {
    if (e.target === back || e.target.closest("[data-close]")) close();
    else if (e.target.closest("[data-save]")) save();
    else if (e.target.closest("[data-reset]")) { close(); reset(slot); }
  });
  ta("css").focus();
}

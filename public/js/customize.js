// Dock 아이콘 우클릭 → Customize: 화면마다 내 CSS · HTML · JS 를 원본 위에 덮어씌워요 (본인 계정만, 원본 파일은 그대로).
//   CSS  — 늘 켜져 있어요 (한 <style> 에 모아요). 화면만 바꾸려면 .host-<view> 로 시작하면 돼요
//   HTML — 화면(nav:*)은 맨 위에 끼워 넣고, 버튼(ui:*)은 아이콘을 바꿔요
//   JS   — 화면은 열릴 때마다, 버튼은 그려질 때 한 번. (el, ctx, api) 를 받고, 함수를 돌려주면 화면을 닫을 때 불러요
import { api } from "./api.js";
import { esc, toast } from "./util.js";
import { icon, appIcon } from "./icons.js";
import { openMenu } from "./ctxmenu.js";
import { folderItems, folderPick } from "./dock-folders.js";

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
      items: [{ k: "name", label: "Rename & icon…" }, { k: "edit", label: "Customize…" }, ...(map[slot] ? [{ sep: true }, { k: "reset", label: "Reset to original", danger: true }] : []), ...folderItems(slot)],
      onPick: (k) => (k.startsWith("fold-") ? folderPick(k, slot, e) : k === "name" ? openRename(slot) : k === "edit" ? openEditor(slot) : reset(slot)),
    });
  });
}

// 로그인 때 한 번 (enter)
export async function loadCustom() {
  try { map = Object.fromEntries(((await api.custom()).custom || []).map((x) => [x.slot, x])); } catch { map = {}; }
  applyCss();
  applyUi();
  applyDock();
  // Dock 은 순서를 바꾸거나 배지가 바뀔 때 다시 그려져요 — 그때마다 내 이름 · 아이콘을 다시 입혀요
  const rail = document.querySelector(".rail");
  if (rail && !rail.dataset.czObs) { rail.dataset.czObs = "1"; let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(applyDock, 30); }).observe(rail, { childList: true, subtree: true }); }
}

// ---------- 이름 · 아이콘 ----------
const ICON_KEYS = ["home", "today", "plans", "notes", "brain", "study", "papers", "english", "ai", "room", "news", "search", "timer"];
const elOf = (slot) => (UI[slot] ? document.querySelector(UI[slot].sel) : document.querySelector(`[data-dock="${slot}"]`));
function iconHtml(v) {
  if (!v) return "";
  if (v.startsWith("app:")) return appIcon(v.slice(4));
  if (v.startsWith("emoji:")) return `<span class="app-ic cz-ic-emoji">${esc(v.slice(6))}</span>`;
  if (v.startsWith("url:")) return `<span class="app-ic cz-ic-img"><img src="${esc(v.slice(4))}" alt="" referrerpolicy="no-referrer"></span>`;
  return "";
}
function applyDock() {
  for (const slot of new Set([...Object.keys(map), ...Object.keys(UI), ...[...document.querySelectorAll("[data-dock^='nav:']")].map((e) => e.dataset.dock)])) {
    const el = elOf(slot); if (!el) continue;
    const c = map[slot], sig = `${c?.label || ""}|${c?.icon || ""}`;
    if (el.dataset.czSig === sig) continue;
    if (el.dataset.czTip === undefined) { el.dataset.czTip = el.dataset.tip || ""; el.dataset.czAria = el.getAttribute("aria-label") || ""; }
    el.dataset.tip = c?.label || el.dataset.czTip;
    el.setAttribute("aria-label", c?.label || el.dataset.czAria);
    const ic = el.querySelector(":scope > .app-ic, :scope > .cz-ic");
    if (ic && ic.dataset.czOrig === undefined) ic.dataset.czOrig = ic.outerHTML;
    if (ic) { const next = c?.icon ? iconHtml(c.icon) : ic.dataset.czOrig; const orig = ic.dataset.czOrig; const tmp = document.createElement("span"); tmp.innerHTML = next; const n = tmp.firstElementChild; if (n) { n.dataset.czOrig = orig; n.classList.add("cz-ic"); ic.replaceWith(n); } }
    el.dataset.czSig = sig;
  }
}
export function openRename(slot) {
  if (document.querySelector(".cz-back")) return;
  const cur = map[slot] || {}, el = elOf(slot);
  let pick = cur.icon || "";
  const orig = (el?.dataset.czTip ?? el?.dataset.tip ?? "").split(" · ")[0] || nameOf(slot);
  const back = document.createElement("div");
  back.className = "palette-back cz-back";
  back.innerHTML = `
    <div class="cz cz-rn glass" role="dialog" aria-modal="true" aria-labelledby="cz-rn-t">
      <header class="cz-head"><h2 id="cz-rn-t">Rename & icon <span>${esc(orig)}</span></h2><button class="icon-btn sm" type="button" data-close aria-label="Close">${icon.x(16)}</button></header>
      <div class="cz-rn-b">
        <label class="cz-rn-l" for="cz-rn-name">Name</label>
        <input id="cz-rn-name" class="cz-rn-in" maxlength="40" placeholder="${esc(orig)}" value="${esc(cur.label || "")}">
        <p class="cz-rn-l">Icon</p>
        <div class="cz-rn-grid" role="radiogroup" aria-label="Icon">
          <button type="button" class="cz-rn-o" data-ic="" aria-pressed="${!pick}" title="Original">${el?.querySelector(".cz-ic, .app-ic")?.dataset.czOrig || "↺"}<small>Original</small></button>
          ${ICON_KEYS.map((k) => `<button type="button" class="cz-rn-o" data-ic="app:${k}" aria-pressed="${pick === "app:" + k}" title="${k}">${appIcon(k)}</button>`).join("")}
        </div>
        <div class="cz-rn-row"><label class="cz-rn-l" for="cz-rn-emoji">Emoji</label><input id="cz-rn-emoji" class="cz-rn-in sm" maxlength="8" placeholder="🔥" value="${esc(pick.startsWith("emoji:") ? pick.slice(6) : "")}"></div>
        <div class="cz-rn-row"><label class="cz-rn-l" for="cz-rn-url">Image URL</label><input id="cz-rn-url" class="cz-rn-in" placeholder="https://…/icon.png" value="${esc(pick.startsWith("url:") ? pick.slice(4) : "")}"></div>
        <div class="cz-rn-prev"><span>Preview</span><span class="rail-btn cz-rn-p" id="cz-rn-p"></span><b id="cz-rn-pn"></b></div>
      </div>
      <footer class="cz-foot"><small>Only on your account</small><span><button class="btn ghost" type="button" data-clear>Use original</button><button class="btn ghost" type="button" data-close>Cancel</button><button class="btn accent" type="button" data-save>Save</button></span></footer>
    </div>`;
  document.body.append(back);
  const $ = (q) => back.querySelector(q);
  const prev = () => { $("#cz-rn-p").innerHTML = pick ? iconHtml(pick) : (el?.querySelector(".cz-ic, .app-ic")?.dataset.czOrig || el?.querySelector(".app-ic")?.outerHTML || ""); $("#cz-rn-pn").textContent = $("#cz-rn-name").value.trim() || orig; back.querySelectorAll("[data-ic]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.ic === pick)); };
  prev();
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } else if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); save(); } };
  document.addEventListener("keydown", onKey, true);
  $("#cz-rn-name").addEventListener("input", prev);
  $("#cz-rn-emoji").addEventListener("input", (e) => { const v = e.target.value.trim(); pick = v ? "emoji:" + v : ""; $("#cz-rn-url").value = ""; prev(); });
  $("#cz-rn-url").addEventListener("input", (e) => { const v = e.target.value.trim(); pick = /^https:\/\//.test(v) ? "url:" + v : ""; $("#cz-rn-emoji").value = ""; prev(); });
  async function save(clear) {
    const label = clear ? "" : $("#cz-rn-name").value.trim(), ic = clear ? "" : pick;
    try {
      const r = await api.saveCustom(slot, { css: cur.css || "", html: cur.html || "", js: cur.js || "", label, icon: ic });
      if (r.custom) map[slot] = r.custom; else delete map[slot];
      close(); applyDock(); toast(clear ? "Back to the original name and icon." : "Saved · only you see it.");
    } catch (err) { toast(err.message || "Failed to save."); }
  }
  back.addEventListener("click", (e) => {
    const o = e.target.closest("[data-ic]");
    if (o) { pick = o.dataset.ic; $("#cz-rn-emoji").value = ""; $("#cz-rn-url").value = ""; prev(); return; }
    if (e.target === back || e.target.closest("[data-close]")) close();
    else if (e.target.closest("[data-save]")) save();
    else if (e.target.closest("[data-clear]")) save(true);
  });
  $("#cz-rn-name").focus();
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
    delete el.dataset.czSig; // 아이콘을 다시 그렸으니 이름 · 아이콘도 다시 입혀요
  }
  applyDock();
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
  try { await api.resetCustom(slot); delete map[slot]; applyCss(); applyUi(); applyDock(); toast("Back to original."); ctx.redraw?.(); } catch (err) { toast(err.message || "Failed."); }
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
  const ta = (t) => back.querySelector(`[data-p="${t}"]`), val = () => ({ slot, css: ta("css").value, html: ta("html").value, js: ta("js").value, label: cur.label || "", icon: cur.icon || "" });
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

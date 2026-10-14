// Brain — 노트 + 공부를 한 나무로. 맨 위엔 큰 개념 5개만, 점을 누르면 그 안으로 (#/brain/<id>).
//   하위가 있는 점: 안으로 · 하위가 없는 노트: 노트 페이지 · 공부 점: 원래 공부 화면
//   점 · 오른쪽 목록을 오른쪽 클릭(폰은 길게 누르기) → 노트 메뉴 (note-menu.js)
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { mountGraph } from "../graph/obsidian.js";
import { buildBrain, levelOf } from "../graph/brain-data.js";
import { openNoteMenu, bindNoteMenu, withoutGone } from "../note-menu.js";

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let tree = null, raw = null, parents = new Map(), stop = null, drawn = "", focus = r.id || null, alive = true;
  root.innerHTML = `
    <div class="brain">
      <header class="brain-bar">
        <nav class="brain-crumbs" aria-label="Path" data-crumbs></nav>
        <div class="brain-actions" data-actions></div>
      </header>
      <div class="brain-body">
        <div class="brain-graph" data-graph><p class="og-loading">Loading…</p></div>
        <aside class="brain-list" aria-label="Pages" data-list></aside>
      </div>
    </div>`;
  const hrefOf = (n) => n.href || (n.kids ? "#/brain/" + encodeURIComponent(n.id) : "#/notes/" + n.id);
  // 메뉴에 넘길 점: 나무(tree.N)의 종류(개념 · 공부 · 노트) + 받은 노트의 진짜 부모. Open = 누른 것과 같아요
  const pointOf = (id) => { const t = tree?.N.get(id); return t && { id, title: t.title, kind: t.kind, note: !!t.note, parent_id: parents.get(id) || null }; };
  const menu = { ctx, open: (p) => ctx.go(hrefOf({ id: p.id, href: tree.N.get(p.id)?.href, kids: tree.kids.get(p.id)?.length })) };

  function draw() {
    if (!tree || !alive) return;
    const L = levelOf(tree, focus);
    if (focus && !L.here) { focus = null; return draw(); }
    $("[data-crumbs]", root).innerHTML = [`<a href="#/brain">Brain</a>`, ...L.crumbs.map((c, i) => i === L.crumbs.length - 1 ? `<b>${esc(c.title)}</b>` : `<a href="#/brain/${encodeURIComponent(c.id)}">${esc(c.title)}</a>`)].join(`<i aria-hidden="true">›</i>`);
    $("[data-actions]", root).innerHTML = (L.here?.note ? `<a class="btn" href="#/notes/${esc(L.here.id)}">Open page</a>` : "")
      + `<a class="btn" href="#/brain/graph" title="All notes grouped into concepts">Graph view</a>`
      + `<button class="btn" type="button" data-new>+ New page</button>`
      + (focus ? "" : `<label class="btn" title="Import a brain JSON file ({ items: [{ title, body, parent_title }] })">Import<input type="file" accept=".json,application/json" data-import hidden></label>`);
    $("[data-list]", root).innerHTML = L.items.length
      ? `<ul>${L.items.map((n) => `<li><a href="${esc(hrefOf(n))}" data-id="${esc(n.id)}"><i style="background:${L.types[n.type]?.color || "#9aa0a6"}"></i><span>${esc(n.title)}</span>${n.kids ? `<small>${n.kids}</small>` : n.href ? `<small>↗</small>` : ""}</a></li>`).join("")}</ul>`
      : `<p class="brain-empty">Nothing inside yet.</p>`;
    const sig = JSON.stringify([L.data, L.types]);
    if (sig === drawn) return; // 같은 층 · 같은 점이면 그래프를 다시 놓지 않아요 (지운 뒤 서버 답 · 친구 상태 새로고침에 튀지 않게)
    stop?.(); drawn = sig;
    stop = mountGraph($("[data-graph]", root), {
      data: L.data, types: L.types, scope: "brain", empty: "Nothing inside yet.",
      prefs: { ...(ctx.me.graph_prefs || {}), open: false },
      savePrefs: async (p) => { try { const res = await api.updateMe({ graph_prefs: { ...p, open: ctx.me.graph_prefs?.open } }); ctx.me.graph_prefs = res.user.graph_prefs; } catch {} },
      onOpen: (n) => ctx.go(hrefOf(n)),
      onMenu: (n, e) => { const p = pointOf(n.id); if (p) openNoteMenu(e, p, menu); },
    });
  }
  // 받아 둔 것(raw)으로 나무를 다시 — 지우는 중인 노트는 빼고 그 하위는 한 칸 위로 (지우기 · Undo 는 다시 받지 않고 이것만)
  function build() {
    if (!raw || !alive) return;
    const notes = withoutGone(raw.g.nodes || []);
    parents = new Map(notes.map((n) => [n.id, n.parent_id]));
    tree = buildBrain({ notes, edges: raw.g.edges || [], subjects: (raw.pages.pages || []).filter((p) => p.place === "study") });
    draw();
  }
  async function load() {
    try {
      const [g, pages] = await Promise.all([api.graph(), api.pages().catch(() => ({ pages: [] }))]);
      if (!alive) return;
      raw = { g, pages }; build();
    } catch (e) { if (alive) { stop?.(); stop = null; drawn = ""; $("[data-graph]", root).innerHTML = `<p class="og-loading">Could not load the brain. ${esc(e.message || "")}</p>`; } }
  }
  bindNoteMenu($("[data-list]", root), "a[data-id]", (a) => pointOf(a.dataset.id), menu);
  root.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-new]")) return;
    const title = prompt("New page title"); if (!title?.trim()) return;
    const parent = levelOf(tree, focus).here;
    try { const res = await api.addNote({ title: title.trim(), body: "", parent_id: parent?.note ? parent.id : null }); ctx.go("#/notes/" + res.note.id); }
    catch (err) { toast(err.message || "Could not create the page.", "err"); }
  });
  // Import: 부모가 먼저인 순서 그대로 40개씩 보내요. 같은 제목은 건너뛰니 중간에 끊겨도 다시 올리면 돼요
  root.addEventListener("change", async (e) => {
    const input = e.target.closest("[data-import]"); if (!input?.files?.[0]) return;
    let items;
    try { items = JSON.parse(await input.files[0].text()).items; if (!Array.isArray(items)) throw new Error("items is missing"); }
    catch (err) { toast("Not a brain import file: " + (err.message || ""), "err"); input.value = ""; return; }
    const sum = { created: 0, moved: 0, kept: 0 };
    try {
      for (let i = 0; i < items.length; i += 40) {
        const r = await api.importNotes(items.slice(i, i + 40));
        sum.created += r.created; sum.moved += r.moved; sum.kept += r.kept;
        toast(`Importing… ${Math.min(i + 40, items.length)} / ${items.length}`);
      }
      toast(`Imported: ${sum.created} new · ${sum.moved} moved · ${sum.kept} already there`);
    } catch (err) { toast(`Stopped at ${sum.created + sum.moved + sum.kept} / ${items.length}: ${err.message || ""} — upload again to continue.`, "err"); }
    input.value = ""; ctx.changed?.("notes"); load();
  });
  const onChanged = (e) => (e.detail?.note?.local ? build() : load());
  window.addEventListener("trio:changed", onChanged);
  inst = { update: (nr) => { focus = nr.id || null; draw(); } };
  load();
  return () => { alive = false; inst = null; stop?.(); window.removeEventListener("trio:changed", onChanged); };
}

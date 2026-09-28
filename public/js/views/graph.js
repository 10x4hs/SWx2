// 그래프 — Second Brain. 노트가 #태그별 성운으로 모여 떠 있어요. WebGL이 없으면 2D 그래프로.
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { openByTitle } from "./notes.js";
import * as flat from "./graph2d.js";

export function mount(root, ctx, r) {
  let three = null, stop = null, labels = [];
  root.innerHTML = `
    <div class="brain" id="brain">
      <div class="brain-gl" id="bgl"></div>
      <div class="brain-hud">
        <div class="bh-tl">
          <span class="eyebrow">Graph // notes · links · tags</span>
          <ul class="bh-clusters" id="clusters"></ul>
        </div>
        <div class="bh-tr" id="owners"></div>
        <div class="bh-bl">
          <h1 class="brain-title">Second Brain</h1>
          <p class="bh-stats mono" id="stats"></p>
        </div>
        <div class="bh-br mono">DRAG 회전 · WHEEL 확대 · CLICK 열기</div>
      </div>
      <div class="brain-labels" id="labels"></div>
      <div class="brain-tip" id="tip" hidden></div>
    </div>`;

  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const resolve = (v) => { const m = /^var\((--[\w-]+)\)$/.exec(v || ""); return m ? cssVar(m[1]) || "#ffffff" : v || "#ffffff"; };

  async function start() {
    let mod;
    try { mod = await import("../three/brain3d.js"); const { supportsWebGL } = await import("../three/ring3d.js"); if (!supportsWebGL()) throw 0; }
    catch { root.innerHTML = ""; stop = flat.mount(root, ctx, r); return; }
    if (!root.isConnected) return;
    const data = await api.graph().catch((e) => { toast(e.message, "err"); return { nodes: [], edges: [] }; });
    // 노드 · 유령 노드(아직 없는 [[링크]]) · 태그 무리
    const byTitle = new Map(), nodes = data.nodes.map((n) => {
      const node = { id: n.id, title: n.title, user_id: n.user_id, cluster: (n.tags || "").split(",")[0] || "태그 없음", color: "#ffffff", deg: 0 };
      const k = n.title.toLowerCase(); if (!byTitle.has(k) || n.user_id === ctx.me.id) byTitle.set(k, node);
      return node;
    });
    const idx = new Map(nodes.map((n) => [n.id, n])), links = [];
    for (const e of data.edges) {
      const s = idx.get(e.src_id); if (!s) continue;
      let t = byTitle.get(e.dst_title.toLowerCase());
      if (!t) { t = { id: "ghost:" + e.dst_title, title: e.dst_title, ghost: true, cluster: s.cluster, color: "#6a6b70", deg: 0 }; byTitle.set(e.dst_title.toLowerCase(), t); nodes.push(t); }
      if (t !== s) { links.push([s, t]); s.deg++; t.deg++; }
    }
    // 멤버 톤: 다크 우주라서 밝은 쪽으로
    const tone = ["#ffffff", "#b9c6d4", "#8e959d"];
    ctx.users.forEach((u, i) => nodes.filter((n) => n.user_id === u.id).forEach((n) => (n.color = tone[i % 3])));
    const counts = new Map(); nodes.forEach((n) => counts.set(n.cluster, (counts.get(n.cluster) || 0) + 1));
    const clusters = [...counts].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));

    $("#stats", root).textContent = `${data.nodes.length} NOTES · ${links.length} LINKS · ${clusters.length} CLUSTERS`;
    $("#clusters", root).innerHTML = clusters.slice(0, 10).map((c, i) => `<li><button type="button" data-cluster="${i}"><span>${c.key === "태그 없음" ? c.key : "#" + esc(c.key)}</span><b>${c.count}</b></button></li>`).join("");
    $("#owners", root).innerHTML = ctx.users.map((u, i) => `<span><i style="background:${tone[i % 3]}"></i>${esc(u.username.toUpperCase())}</span>`).join("") + `<span><i class="ghost"></i>없는 노트</span>`;
    if (!data.nodes.length) {
      $("#bgl", root).innerHTML = `<p class="brain-empty">노트에 <code>[[다른 노트]]</code> 와 <code>#태그</code> 를 쓰면 여기에 성운이 생겨요. <a href="#/notes">노트 쓰러 가기</a></p>`;
      return;
    }

    three = mod.mountBrain3D($("#bgl", root), {
      onPick: (n) => (n.ghost ? openByTitle(ctx, n.title) : ctx.go("#/notes/" + n.id)),
      onHover: (n) => {
        const tip = $("#tip", root);
        if (!n) { tip.hidden = true; return; }
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(n.title)}</b><span>${n.ghost ? "아직 없는 노트 · 눌러서 만들기" : `${n.cluster === "태그 없음" ? "" : "#" + esc(n.cluster) + " · "}연결 ${n.deg}`}</span>`;
      },
      onFrame: (project, hover) => {
        // 태그 무리 이름 + 가리킨 노트 툴팁 위치
        labels.forEach((l) => { const s = project(l.c.pos); l.el.style.transform = `translate(${s.x}px, ${s.y}px)`; l.el.style.opacity = s.z > 1 ? 0 : 1; });
        if (hover) { const s = project(hover.pos); $("#tip", root).style.transform = `translate(${s.x + 14}px, ${s.y - 10}px)`; }
      },
    });
    three.build({ nodes, links, clusters });
    $("#labels", root).innerHTML = clusters.slice(0, 12).map((c) => `<span class="bl">${c.key === "태그 없음" ? "" : "#" + esc(c.key)}</span>`).join("");
    labels = [...$("#labels", root).children].map((el, i) => ({ el, c: clusters[i] }));
    root.addEventListener("click", (e) => { const b = e.target.closest("[data-cluster]"); if (b) three.focus(clusters[+b.dataset.cluster]); });
  }
  start();
  return () => { three?.destroy(); stop?.(); };
}

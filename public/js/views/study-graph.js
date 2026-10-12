// Study 탭의 '그래프' 화면 — 영어 · 논문 · AI · 과목 페이지마다 그 과목만 옵시디언 그래프로
import { api } from "../api.js";
import { toast } from "../util.js";
import { mountGraph } from "../graph/obsidian.js";
import { papersGraph, booksGraph, englishGraph, pageGraph } from "../graph/study-data.js";

const LOAD = { papers: papersGraph, books: booksGraph, english: englishGraph };

export function mountStudyGraph(host, ctx, which) {
  let stop = null, alive = true;
  host.innerHTML = `<div class="og-wrap"><p class="og-loading">그래프 그리는 중…</p></div>`;
  const wrap = host.firstElementChild;
  (async () => {
    try {
      const d = which.startsWith("page:") ? await pageGraph(which.slice(5)) : await LOAD[which]();
      if (!alive) return;
      stop = mountGraph(wrap, {
        data: d, types: d.types, empty: d.empty, scope: which.startsWith("page:") ? "page" : which,
        prefs: ctx.me.graph_prefs,
        savePrefs: async (p) => { try { const r = await api.updateMe({ graph_prefs: p }); ctx.me.graph_prefs = r.user.graph_prefs; } catch (e) { toast(e.message || "그래프 설정을 저장하지 못했어요.", "err"); } },
        onOpen: (n) => n.href && ctx.go(n.href),
      });
    } catch (e) { if (alive) wrap.innerHTML = `<p class="og-loading">그래프를 불러오지 못했어요. ${String(e.message || "")}</p>`; }
  })();
  return () => { alive = false; stop?.(); };
}

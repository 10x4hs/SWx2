// 그림 모아 보기 (#/sw/<과정>/figs · #/sw/<과정>/figs/<그림>) — 이 과정의 설명 그림을 장 순서대로. 그림마다 그 카드로 가는 길.
//   그림 하나만 보는 주소는 목록에 아직 없는 새 그림도 그려 봐요 (만들면서 확인할 때).
import { esc } from "../util.js";
import { index, topbar, C } from "./data.js";
import { loadMap, moduleFigs, slotHtml } from "../figs/catalog.js";
import { mountSlots } from "../figs/player.js";

export function mountFigs(host, ctx, arg) {
  let alive = true, stop = null;
  // #/sw/<과정>/figs/<그림>~mode=l2&start=2 — 그림 하나를 옵션과 같이 (만들면서 확인할 때)
  const [one, raw] = String(arg || "").split("~"), labOpts = raw ? Object.fromEntries(new URLSearchParams(raw)) : null;
  const crumbs = one ? [{ t: "그림 모아 보기", href: `${C.base}/figs` }, { t: one }] : [{ t: "그림 모아 보기" }];
  host.innerHTML = `${topbar("", "", crumbs)}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [map, idx] = await Promise.all([loadMap(), index()]);
    if (!alive) return;
    const mods = idx.modules.map((m) => ({ m, list: moduleFigs(map, C.key, m).filter((p) => p.fig && (!one || p.fig === one)) })).filter((x) => x.list.length);
    const total = mods.reduce((n, x) => n + x.list.length, 0);
    const lab = one && (!total || labOpts) ? `<section class="figs-mod"><div class="fig-slot" data-fig="${esc(one)}" data-no="—" data-title="${esc(map.figs?.[one]?.title || one)}" data-opts="${esc(JSON.stringify(labOpts || {}))}"><div class="fig-ph">${esc(one)}</div></div></section>` : "";
    if (labOpts) mods.length = 0;
    host.innerHTML = `${topbar("", "", crumbs)}
      <div class="figs">
        <header class="figs-h"><h1>그림 모아 보기</h1><p>${esc(C.name)}에서 글로만은 어려운 곳을 그림으로 설명해요. ${total ? `그림 ${total}개` : ""} · 한 단계씩 넘기거나, 직접 끌어 보거나, 3D 는 돌려 봐요.</p></header>
        ${mods.map(({ m, list }) => `<section class="figs-mod" aria-labelledby="fm-${esc(m.id)}"><h2 id="fm-${esc(m.id)}"><span class="toc-no">${m.no}</span>${esc(m.title)}</h2>
          ${list.map((p) => `${slotHtml(p)}<p class="figs-go"><a href="${C.base}/${m.id}/${p.card}">이 그림이 있는 카드 · ${esc(p.cardTitle)} →</a></p>`).join("")}</section>`).join("")}
        ${lab}
      </div>`;
    stop = mountSlots(host);
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("", "", crumbs)}<p class="dv-err">불러오지 못했어요. ${esc(e?.message || "")}</p>`; });
  return () => { alive = false; stop?.(); };
}

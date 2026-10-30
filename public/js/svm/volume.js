// 권 차례 (승인 시안 v3) — 왼쪽: 표지 · 권 소개 · 이 권의 말 / 오른쪽: 장 목록(음반 트랙처럼 큰 장 번호 · 제목 · 영상 · 요약 분) · 앞뒤 권
import { data, volume, volColor, pad2 } from "./model.js";
import { st } from "./store.js";
import { cover } from "./shelf.js";
import { esc } from "../util.js";

function html(id) {
  const D = data(), v = volume(id), S = st();
  if (!v) return `<p class="sv-wait">없는 권이에요. <a class="sv-link" href="#/svm">서재로</a></p>`;
  const i = D.sections.findIndex((s) => s.id === id), prev = D.sections[i - 1], next = D.sections[i + 1];
  const words = [...new Set(v.list.flatMap((e) => e.concepts || []))].map((c) => D.C.get(c)).filter(Boolean);
  const row = (e) => {
    const read = !!S?.read?.[e.id], pos = S?.pos?.[e.id] || 0;
    return `<a class="sv-tl" href="#/svm/read/${esc(e.id)}" data-s="${read ? "read" : pos ? "reading" : ""}">
      <span class="sv-tl-no sv-mono">${pad2(e.no)}</span>
      <span class="sv-ti"><b>${esc(e.ko || e.title)}${read ? ` <i class="sv-mono">✓ READ</i>` : pos ? ` <i class="sv-mono on">● ${pos}%</i>` : ""}</b><small>${esc(e.title)} · ${esc(e.year || "")}${e.sub ? ` · ${esc(e.sub)}` : ""}</small></span>
      <span class="sv-mono sv-tl-v">${e.vids.length ? "▶ " + e.vids.length : "—"}</span>
      <span class="sv-mono sv-tl-m">${pad2(e.mins)}m</span>
    </a>`;
  };
  return `<div class="sv-volpg" style="--vc:${volColor(id)}">
    <aside class="sv-vol-side">
      ${cover(id, { big: true, link: false })}
      <p class="sv-vol-about">${esc(v.about || "")}</p>
      <div class="sv-vol-words"><span class="sv-label sv-mono">IN THIS VOLUME</span><p>${words.map((c) => `<a href="#/svm/glossary/${esc(c.id)}">${esc(c.name)}</a>`).join("")}</p></div>
    </aside>
    <section class="sv-vol-main" aria-label="차례">
      <div class="sv-tl sv-tl-h sv-mono" aria-hidden="true"><span>CH</span><span>제목</span><span>영상</span><span class="sv-tl-m">요약</span></div>
      ${v.list.map(row).join("")}
      <nav class="sv-vol-nav sv-mono" aria-label="앞뒤 권">${prev ? `<a href="#/svm/v/${esc(prev.id)}">← VOL.${esc(prev.no)} ${esc(prev.name)}</a>` : `<a href="#/svm">← LIBRARY</a>`}${next ? `<a class="nx" href="#/svm/v/${esc(next.id)}">VOL.${esc(next.no)} ${esc(next.name)} →</a>` : `<a class="nx" href="#/svm">LIBRARY →</a>`}</nav>
    </section>
  </div>`;
}

export function mountVolume(host, r, env) {
  const draw = (id) => { host.innerHTML = html(id); const v = volume(id); env.crumb(v ? `<a href="#/svm">/ LIBRARY</a> <span style="color:${volColor(id)}">/ VOL.${esc(v.no)} ${esc(v.name)}</span>` : ""); };
  draw(r.id);
  return { update(nr) { draw(nr.id); env.scroller()?.scrollTo?.({ top: 0 }); return true; } };
}

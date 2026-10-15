// 개발 흐름 — 문서 지도: 흐름 칸마다 문서 · 고른 문서의 누가/언제/대표의 결정 · 두런 PRD · ERD 견본(종이) · 한국 ↔ 글로벌 이름 대응표
import { $$, esc } from "../util.js";
import { docsDoc, md, topbar } from "./data.js";

export function mountDocs(host, ctx) {
  let alive = true, pick = "prd";
  host.innerHTML = `${topbar("docs")}<p class="dv-loading">불러오는 중…</p>`;
  docsDoc().then((D) => {
    if (!alive) return;
    const head = (h) => `<div class="dv-tb">${h.map(([k, v]) => `<div><span class="m">${esc(k)}</span>${esc(v)}</div>`).join("")}</div>`;
    const sample = (s) => s === "erd"
      ? `${head(D.erd.head)}<p style="margin:20px 0 16px">${md(D.erd.intro)}</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px">${D.erd.tables.map(([n, cols]) => `<div class="dv-ent"><b>${esc(n)}</b>${cols.map((c) => `<div>${esc(c)}</div>`).join("")}</div>`).join("")}</div><p style="margin:18px 0 0"><span class="dv-note">대표가 볼 곳: delete_after</span> ${md(D.erd.note)}</p>`
      : `${head(D.prd.head)}${D.prd.sections.map(([h, t, n]) => `<h2 style="margin-top:24px">${esc(h)}</h2><p>${md(t)}${n ? ` <span class="dv-note">${esc(n)}</span>` : ""}</p>`).join("")}`;
    function draw() {
      const c = D.docs[pick];
      host.innerHTML = `${topbar("docs")}
        <section class="dv-wrap" style="padding-top:40px"><div class="m acc">문서 지도 · 언제 · 누가 · 왜</div><h1 style="margin:12px 0 14px">회사에서 만나는 문서는<br>흐름의 어느 칸에 있을까</h1>
          <p class="kr" style="font-size:18px;line-height:1.75;color:var(--dv-sub);max-width:720px;margin:0">문서 이름은 회사마다 달라도 하는 일은 같아요. 칸에서 문서를 누르면 누가 쓰고 대표가 무엇을 정하는지 나와요.</p>
          <p class="kr dim" style="font-size:14px;line-height:1.7;margin:10px 0 0">왜 견본부터? 처음엔 완성된 예시를 읽고, 그다음 내 것을 쓰는 순서가 초보의 부담을 줄여요 (Sweller &amp; Cooper, 1985).</p></section>
        <section class="dv-wrap" style="padding-top:32px"><div style="overflow-x:auto;padding-bottom:8px"><div class="dv-lane">${D.stages.map(([s, ks]) => `<div><span class="m" style="color:var(--dv-ink)">${esc(s)}</span>${ks.map((k) => `<button class="dv-doc${k === pick ? " on" : ""}" data-k="${k}" aria-pressed="${k === pick}">${esc(D.docs[k].name)}</button>`).join("")}</div>`).join("")}</div></div></section>
        <section class="dv-wrap" style="padding-top:32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(520px,100%),1fr));gap:24px;align-items:start">
          <div class="dv-paper" style="padding:40px clamp(20px,4vw,48px)">${c.sample ? sample(c.sample) : `<div class="m">견본</div><h2 style="margin-top:8px">${esc(c.name)}</h2><p>이 문서의 두런 견본은 <a href="#/dev/${c.module}">해당 주</a>의 카드와 ‘금요일에 쓸 것’에 있어요. 위 칸에서 PRD나 ERD를 누르면 견본 전체를 볼 수 있어요.</p>`}
            <p class="m" style="margin:24px 0 0">두런은 가상 회사 · 숫자 자리는 비워 둠</p></div>
          <div style="display:flex;flex-direction:column;gap:16px">
            <div class="dv-panel"><div class="m">고른 문서</div><h2 style="margin-top:10px;font-size:24px">${esc(c.name)}</h2><table class="dv-tbl"><tbody><tr><th>누가 쓰나</th><td>${esc(c.who)}</td></tr><tr><th>누가 승인</th><td>${esc(c.ok)}</td></tr><tr><th>언제</th><td>${esc(c.when)}</td></tr><tr><th>대표의 결정</th><td>${esc(c.decide)}</td></tr></tbody></table><a class="dv-btn ghost" style="margin-top:14px" href="#/dev/${c.module}">이 문서를 배우는 주로</a></div>
            <div class="dv-panel" style="overflow-x:auto"><div class="m">이름 대응표 · 한국 공공 SI ↔ 글로벌 스타트업</div><table class="dv-tbl" style="margin-top:8px;min-width:420px"><thead><tr><th>한국에서</th><th>글로벌에서</th><th>메모</th></tr></thead><tbody>${D.map.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>
              <p class="kr dim" style="font-size:13px;line-height:1.7;margin:12px 0 0">${esc(D.srd)} 출처 · 과기정통부고시 2023-15 · 감리기준 2024-53 · ISO/IEC/IEEE 29148:2018</p></div>
          </div>
        </section>`;
      $$("[data-k]", host).forEach((b) => b.addEventListener("click", () => { pick = b.dataset.k; draw(); }));
    }
    draw();
  }).catch(() => { if (alive) host.innerHTML = `${topbar("docs")}<p class="dv-err">불러오지 못했어요.</p>`; });
  return () => { alive = false; };
}

// 개발 흐름 — 회의실: 그날의 회의 장면 3개(지난 주 내용과 섞인 문제 포함). 대표로서 하나 고르면 종이 위에 해설이 열려요.
import { $$, esc, toast } from "../util.js";
import { api } from "../api.js";
import { moduleDoc, state, doneSet, md, srcList, topbar } from "./data.js";

export function mountMeeting(host, ctx, modId, dayArg) {
  let alive = true;
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [doc, st] = await Promise.all([moduleDoc(modId), state()]);
    if (!alive) return;
    let done = doneSet(st);
    const day = Math.min(5, Math.max(1, Number(dayArg) || 1)), list = doc.problems.filter((p) => p.day === day);
    host.innerHTML = `${topbar("")}
      <div class="dv-wrap" style="max-width:1040px;padding-top:40px">
        <div class="m acc">회의실 · ${esc(doc.no)} ${esc(doc.title)} · ${day}일째</div>
        <h1 style="margin:12px 0 10px">대표로서 무엇을 정할까요?</h1>
        <p class="kr" style="font-size:16px;line-height:1.75;color:var(--dv-sub);margin:0">두런의 회의 장면이에요. 보기를 고르기 전에 이유를 한 줄 떠올려 보세요. <span class="dim">(섞어 풀기 — 지난 주 내용도 나와요 · Rohrer &amp; Taylor, 2007)</span></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px" role="group" aria-label="날">${[1, 2, 3, 4, 5].map((d) => `<a class="dv-chip${d === day ? " on" : ""}" style="display:inline-flex;align-items:center;text-decoration:none" href="#/dev/${modId}/practice/${d}"${d === day ? ' aria-current="page"' : ""}>${d}일</a>`).join("")}</div>
        ${list.map((p) => `<section class="dv-sec" style="padding-top:48px" data-p="${esc(p.id)}">
          <div class="m">${esc(p.id.toUpperCase())}${p.mixed ? " · 지난 주와 섞임" : ""}${done.has(modId + "/" + p.id) ? " · 풀었음" : ""}</div>
          <h2 style="margin:8px 0 12px">${esc(p.title)}</h2>
          <div>${p.scene.map((l) => `<div class="dv-say"><div style="display:flex;flex-direction:column;gap:4px"><span class="kr" style="font-weight:600">${esc(l.name)}</span><span class="m">${esc(l.role)}</span></div><p>${md(l.text)}</p></div>`).join("")}</div>
          <h3 style="margin:24px 0 12px">${md(p.q)}</h3>
          <div style="display:flex;flex-direction:column;gap:10px">${p.options.map((o, i) => `<button class="dv-mopt" data-o="${i}"><span class="m" style="font-size:14px;color:var(--dv-ink)">${esc(o.k || "ABCD"[i])}</span><span>${md(o.t)}</span></button>`).join("")}</div>
          <div class="dv-paper" hidden style="margin-top:24px;padding:32px 36px" data-ex></div>
        </section>`).join("")}
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:48px"><span style="display:inline-flex;gap:10px;flex-wrap:wrap"><a class="dv-btn ghost" href="#/dev/${modId}">이 주로</a><a class="dv-btn ghost" href="#/dev/ask/${modId}">AI에게 묻기</a></span>${day < 5 ? `<a class="dv-btn ghost" href="#/dev/${modId}/practice/${day + 1}">${day + 1}일 회의실 →</a>` : ""}</div>
      </div>`;
    $$("[data-p]", host).forEach((sec) => sec.addEventListener("click", async (e) => {
      const b = e.target.closest(".dv-mopt"); if (!b || sec.dataset.answered) return;
      sec.dataset.answered = "1";
      const p = list.find((x) => x.id === sec.dataset.p), i = Number(b.dataset.o), o = p.options[i], ok = !!o.ok;
      $$(".dv-mopt", sec).forEach((x, j) => { x.disabled = true; if (p.options[j].ok) x.classList.add("pick"); });
      const ex = sec.querySelector("[data-ex]"); ex.hidden = false;
      ex.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><span class="m">해설</span><span class="m" style="color:${ok ? "#1B7A4B" : "#9A5B00"}">${ok ? "추천하는 답" : "다시 생각해 볼 답"}</span></div>
        <h3 style="margin:10px 0 12px;color:var(--dv-pink);font-size:20px">${md(o.why)}</h3>
        ${p.options.filter((x, j) => j !== i).map((x) => `<p style="font-size:15px"><b>${esc(x.k)}</b> ${md(x.why)}</p>`).join("")}
        <p>${md(p.explain)}</p>
        ${p.sources?.length ? `<p class="dv-src" style="margin:12px 0 0">출처 · ${srcList(p.sources)}</p>` : ""}`;
      try { const s = await api.devDone(modId, p.id, "problem", ok ? 1 : 0, 1); done = doneSet(s); } catch (x) { toast(x.message || "기록하지 못했어요.", "err"); }
    }));
  })().catch(() => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">불러오지 못했어요.</p>`; });
  return () => { alive = false; };
}

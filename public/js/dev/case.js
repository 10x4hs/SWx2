// 개발 흐름 — 사례: 핵심 숫자 · 타임라인 · 어디서 막혔나(흐름의 어느 칸) · 그때 대표라면?(먼저 적고 해설) · 그 뒤 · 출처
import { $, $$, esc, toast } from "../util.js";
import { moduleDoc, state, doneSet, md, srcList, topbar, C, cApi } from "./data.js";

export function mountCase(host, ctx, modId, caseId) {
  let alive = true;
  host.innerHTML = `${topbar("")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [doc, st] = await Promise.all([moduleDoc(modId), state()]);
    if (!alive) return;
    const k = doc.cases.find((x) => x.id === caseId);
    if (!k) { host.innerHTML = `${topbar("")}<p class="dv-err">없는 사례예요. <a href="${C.base}/${esc(modId)}">이 주로</a></p>`; return; }
    const done = doneSet(st).has(modId + "/" + caseId), key = `dv-case-${modId}-${caseId}`;
    let notes = {}; try { notes = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
    host.innerHTML = `${topbar("")}
      <section class="dv-wrap" style="padding-top:40px">
        <div class="m acc">사례 · ${esc(doc.no)} ${esc(doc.title)}${k.when ? ` · ${esc(k.when)}` : ""}</div>
        <h1 style="margin:14px 0 16px">${esc(k.title)}</h1>
        <p class="kr" style="font-size:18px;line-height:1.75;color:var(--dv-sub);max-width:760px;margin:0">${md(k.lead)}</p>
        ${k.facts?.length ? `<div class="dv-facts" style="margin-top:32px">${k.facts.map((f) => `<div><span class="m">${esc(f.label)}</span><span class="dv-big" style="font-size:32px">${esc(f.value)}</span>${f.src ? `<span class="dim" style="font-size:13px">${esc(f.src)}</span>` : ""}</div>`).join("")}</div>` : ""}
      </section>
      <section class="dv-wrap" style="padding-top:40px"><div class="dv-paper" style="max-width:1000px;margin:0 auto">
        <div class="m">타임라인</div><h2 style="margin-top:8px">무슨 일이 있었나</h2>
        <ol class="dv-tl">${k.timeline.map((t) => `<li class="${t.hot ? "hot" : ""}"><span class="t">${esc(t.t)}</span><p style="margin:0">${md(t.text)}</p></li>`).join("")}</ol>
        ${k.causes?.length ? `<h2>어디서 막혔나</h2><div class="dv-cause">${k.causes.map((c) => `<div><span class="dv-stagetag">${esc(c.stage)}</span><h3 style="margin-top:12px;color:var(--dv-pink)">${esc(c.title)}</h3><p>${md(c.text)}</p></div>`).join("")}</div>` : ""}
        <h2>그때 ${C.role}라면?</h2>
        ${k.questions.map((q, i) => `<div class="dv-q" data-i="${i}"><h3 style="color:var(--dv-pink)">${md(q.q)}</h3><textarea aria-label="내 답 ${i + 1}" placeholder="먼저 내 답을 한두 줄 적어요">${esc(notes[i] || "")}</textarea><div style="margin-top:10px"><button class="dv-pbtn" data-show="${i}" aria-expanded="false">해설 보기</button></div><p hidden data-a="${i}" style="margin:12px 0 0">${md(q.a)}</p></div>`).join("")}
        ${k.after?.length ? `<h2>그 뒤에 바뀐 것</h2><ul>${k.after.map((a) => `<li>${md(a)}</li>`).join("")}</ul>` : ""}
        <div style="margin-top:40px;padding-top:18px;border-top:1px solid var(--dv-pline)"><div class="m">출처 · 2026-10-15 확인</div><p class="dv-src" style="margin:8px 0 0">${srcList(k.sources)}${k.caveat ? `<br>${esc(k.caveat)}` : ""}</p></div>
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:28px"><span style="display:inline-flex;gap:10px;flex-wrap:wrap"><a class="dv-pbtn" style="display:inline-flex;align-items:center;text-decoration:none" href="${C.base}/${modId}">이 주로</a><a class="dv-pbtn" style="display:inline-flex;align-items:center;text-decoration:none" href="${C.base}/ask/${modId}">AI에게 묻기</a></span><button class="dv-btn" id="dv-cdone">${done ? "다시 끝냈어요" : "사례 끝냈어요"}</button></div>
      </div></section>`;
    $$(".dv-q textarea", host).forEach((t) => t.addEventListener("input", () => { notes[t.closest(".dv-q").dataset.i] = t.value.slice(0, 1500); try { localStorage.setItem(key, JSON.stringify(notes)); } catch {} }));
    $$("[data-show]", host).forEach((b) => b.addEventListener("click", () => { const a = $(`[data-a="${b.dataset.show}"]`, host), open = a.hidden; a.hidden = !open; b.setAttribute("aria-expanded", open); b.textContent = open ? "해설 접기" : "해설 보기"; }));
    $("#dv-cdone", host).addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await cApi.done(modId, caseId, "case"); b.textContent = "기록했어요"; toast("사례를 끝냈어요"); } catch (x) { b.disabled = false; toast(x.message || "기록하지 못했어요.", "err"); }
    });
  })().catch(() => { if (alive) host.innerHTML = `${topbar("")}<p class="dv-err">불러오지 못했어요.</p>`; });
  return () => { alive = false; };
}

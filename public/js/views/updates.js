// 업데이트 기록 — #/updates. 우리가 체감하는 기능 묶음 하나 = 업데이트 1번 (public/updates.json).
// 위: 몇 번 · 며칠 · 커밋 수 + 날마다 막대. 아래: 날짜별 카드(새 기능 · 고침 · 디자인), 눌러서 바로 가 보기.
// 마지막으로 본 날 이후 생긴 건 "새로" 표시 (이 브라우저에만 기억).
import { $, $$, esc } from "../util.js";
import { icon } from "../icons.js";

const KIND = { new: { label: "새 기능", cls: "new" }, fix: { label: "고침", cls: "fix" }, design: { label: "디자인", cls: "design" } };
const DOW = "일월화수목금토";
const dayLabel = (d) => { const t = new Date(d + "T00:00:00"); return `${t.getMonth() + 1}월 ${t.getDate()}일 ${DOW[t.getDay()]}요일`; };
const SEEN = "trio-updates-seen";
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// admin: true 인 기록은 관리자에게만 (관리자 전용 기능 — 예: Silicon Valley Mafia)
const forMe = (list, me) => list.filter((u) => !u.admin || me?.role === "admin");
export async function unseenCount(me) {
  try { const { updates } = await (await fetch("/updates.json", { cache: "no-cache" })).json(); const seen = store.get(SEEN) || ""; return forMe(updates, me).filter((u) => u.date > seen).length; } catch { return 0; }
}

export function mount(root, ctx) {
  let filter = "all", data = null;
  const seen = store.get(SEEN) || "";
  root.innerHTML = `<div class="upd"><header class="upd-head"><button type="button" class="icon-btn back-btn" id="upd-back" aria-label="뒤로">${icon.left(18)}</button><span class="eyebrow">업데이트 기록</span></header><div id="upd-body"><p class="faint">불러오는 중…</p></div></div>`;
  $("#upd-back", root).addEventListener("click", () => window.trioBack?.());
  function draw() {
    const all = data.updates, list = filter === "all" ? all : all.filter((u) => u.kind === filter);
    const days = [...new Set(all.map((u) => u.date))].sort();
    const byDay = days.map((d) => ({ d, n: all.filter((u) => u.date === d).length }));
    const max = Math.max(...byDay.map((x) => x.n));
    const commits = new Set(all.flatMap((u) => u.commits || [])).size;
    const count = (k) => all.filter((u) => u.kind === k).length;
    const groups = [...new Set(list.map((u) => u.date))].sort().reverse();
    $("#upd-body", root).innerHTML = `
      <section class="upd-hero">
        <div class="upd-big"><b class="num">${all.length}</b><span>번 업데이트했어요</span></div>
        <p class="upd-sub">${dayLabel(days[0]).replace(/ \S+요일$/, "")}부터 ${days.length}일 동안 · 커밋 ${commits}개 · 새 기능 ${count("new")} · 고침 ${count("fix")} · 디자인 ${count("design")}</p>
        <div class="upd-bars" aria-label="날마다 업데이트 수">${byDay.map((x) => `<div class="upd-bar" title="${esc(dayLabel(x.d))} · ${x.n}번"><span class="num">${x.n}</span><i style="--h:${(x.n / max) * 100}%"></i><em>${+x.d.slice(8)}일</em></div>`).join("")}</div>
      </section>
      <div class="upd-filter" role="tablist">${[["all", `전체 ${all.length}`], ["new", `새 기능 ${count("new")}`], ["fix", `고침 ${count("fix")}`], ["design", `디자인 ${count("design")}`]].map(([k, l]) => `<button type="button" role="tab" class="chip ${filter === k ? "on" : ""}" data-f="${k}" aria-selected="${filter === k}">${esc(l)}</button>`).join("")}</div>
      ${groups.map((d) => `<section class="upd-day"><h2 class="upd-date">${esc(dayLabel(d))}<span class="faint"> · ${list.filter((u) => u.date === d).length}개</span></h2>
        <ol class="upd-list">${list.filter((u) => u.date === d).map((u) => { const k = KIND[u.kind] || KIND.new, fresh = seen && u.date > seen; return `<li class="upd-item ${k.cls}">
          <div class="upd-top"><span class="upd-kind ${k.cls}">${k.label}</span>${fresh ? `<span class="upd-fresh">새로</span>` : ""}<b>${esc(u.title)}</b></div>
          <p>${esc(u.body)}</p>
          <div class="upd-foot">${u.href ? `<a class="upd-go" href="${esc(u.href)}">가 보기 ${icon.right(13)}</a>` : ""}${u.commits?.length ? `<span class="faint num" title="${esc(u.commits.join(" · "))}">커밋 ${u.commits.length}개</span>` : ""}</div></li>`; }).join("")}</ol></section>`).join("")}
      <p class="faint upd-note">업데이트 1번 = 우리가 체감하는 기능 묶음 하나예요 (자잘한 커밋 여러 개가 한 번으로 묶일 수 있어요).</p>`;
    $$("[data-f]", root).forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; draw(); }));
  }
  fetch("/updates.json", { cache: "no-cache" }).then((r) => r.json()).then((j) => {
    j.updates = forMe(j.updates, ctx.me);
    data = j; draw();
    store.set(SEEN, j.updates.map((u) => u.date).sort().pop()); // 여기까지 봤어요
    window.dispatchEvent(new CustomEvent("trio:updates-seen"));
  }).catch(() => { $("#upd-body", root).innerHTML = `<p class="faint">기록을 불러오지 못했어요.</p>`; });
  return () => {};
}

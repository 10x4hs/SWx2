// 뉴스 — 하루 한 호(號) 신문. #/news (오늘) · #/news/<YYYY-MM-DD> · #/news/item/<id>
// 왼쪽: 오늘 · 60일 달력 · 오늘 움직인 줄기 · 별표 | 가운데: 그날 호(제호 → 헤드라인 → 1면 → 줄기 → 섹션 4개 → 다 봤어요) | 오른쪽: 기사 읽기 칸
// 폰은 신문 → 기사로 넘어가요. 키보드: j/k 다음·이전 기사 · [ ] 어제·내일 · s 별표 · Esc 닫기.
// 디자인 근거: docs/news-design-direction.md (refs.gallery). 움직임은 짧은 투명도 전환만.
import { api } from "../api.js";
import { esc, toast } from "../util.js";
import { icon } from "../icons.js";

const SECTIONS = [["ai", "AI"], ["geopolitics", "Geopolitics"], ["tech", "Chips & Tech"], ["economy", "Economy"]];
const kstDay = (t = Date.now()) => new Date(t + 9 * 36e5).toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmtLong = (d) => new Date(d + "T12:00:00+09:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Seoul" });
const fmtShort = (d) => new Date(d + "T12:00:00+09:00").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Seoul" });
const hhmm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
const when = (it) => (it.dated === 0 ? "new" : hhmm(it.published_at));
// 요약(2~3문장)을 문장 단위로 나눠 불릿으로
const bullets = (s) => String(s || "").split(/(?<=[.!?다요])\s+(?=\S)/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

let inst = null;
export function update(r) { inst?.route(r); }

export function mount(root, ctx, r) {
  root.innerHTML = `
    <div class="np" id="np">
      <aside class="np-rail" aria-label="Editions">
        <a class="np-brand" href="#/news">The Trio <em>Daily</em></a>
        <nav class="np-nav">
          <a href="#/news" data-go="today">Today</a>
          <button type="button" data-filter="starred">Starred</button>
        </nav>
        <section class="np-cal" aria-label="Last 60 days"><h3>Editions</h3><div class="np-cal-grid" id="np-cal"></div></section>
        <section class="np-threads" aria-label="Threads"><h3>Threads today</h3><ul id="np-threads"></ul></section>
      </aside>
      <main class="np-paper" id="np-paper" tabindex="-1"><p class="np-loading">Printing today's edition…</p></main>
      <aside class="np-reader" id="np-reader" aria-label="Article" hidden></aside>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const paper = $("#np-paper"), reader = $("#np-reader"), np = $("#np");
  let alive = true, ed = null, list = [], editions = [], cur = null, starredOnly = false;
  const user = (id) => ctx.user(id) || { display_name: "?", color: "var(--m0)" };
  const items = new Map();

  // ---------- 달력 (최근 60일) ----------
  async function loadEditions() {
    try {
      const d = await api.newsEditions();
      editions = [...(d.editions || []).map((e) => ({ ...e, kind: e.status })), ...(d.pending || []).map((p) => ({ day: p.day, items: p.items, kind: "pending" }))];
    } catch { editions = []; }
    drawCal();
  }
  function drawCal() {
    const by = new Map(editions.map((e) => [e.day, e]));
    const today = kstDay(), days = [];
    for (let i = 59; i >= 0; i--) days.push(kstDay(Date.now() - i * 864e5));
    const lead = (new Date(days[0] + "T12:00:00+09:00").getUTCDay() + 6) % 7; // 월요일 시작
    $("#np-cal").innerHTML = `${["M", "T", "W", "T", "F", "S", "S"].map((w) => `<b>${w}</b>`).join("")}${"<i></i>".repeat(lead)}${days.map((d) => {
      const e = by.get(d), n = e?.items || 0, lvl = !n ? 0 : n < 6 ? 1 : n < 15 ? 2 : 3;
      return `<a href="#/news/${d}" class="np-cd l${lvl}${d === today ? " is-today" : ""}${ed?.day === d ? " is-on" : ""}${e?.kind === "closed" ? " is-closed" : ""}" title="${fmtShort(d)}${n ? ` · ${n} stories` : ""}" aria-label="${fmtShort(d)}">${+d.slice(8)}</a>`;
    }).join("")}`;
  }

  // ---------- 그날 호 ----------
  async function loadEdition(day) {
    paper.innerHTML = `<p class="np-loading">Printing ${day === kstDay() ? "today's" : fmtShort(day)} edition…</p>`;
    try { ed = await api.newsEdition(day === kstDay() ? "today" : day); }
    catch (e) { if (alive) paper.innerHTML = `<p class="np-loading">${esc(e.message)}</p>`; return; }
    if (!alive) return;
    items.clear();
    const all = [...(ed.front || []).map((f) => f.item), ...SECTIONS.flatMap(([k]) => ed.sections?.[k] || []), ...(ed.late || [])];
    for (const it of all) if (it && !items.has(it.id)) items.set(it.id, it);
    drawPaper(); drawThreads(); drawCal();
    paper.scrollTop = 0;
  }
  const mark = (it) => {
    const read = it.readers?.includes(ctx.me.id), star = it.stars?.includes(ctx.me.id);
    const others = (it.readers || []).filter((u) => u !== ctx.me.id);
    return { read, star, others };
  };
  const avatars = (ids) => ids.map((id) => { const u = user(id); return `<i class="np-av" style="--c:${u.color}" title="${esc(u.display_name)} read this">${esc((u.display_name || "?")[0])}</i>`; }).join("");
  const chips = (it) => {
    const th = it.thread_id && (ed.threads || []).find((t) => t.id === it.thread_id);
    return `${th ? `<span class="np-chip">${esc(th.title)}</span>` : ""}${it.comments ? `<span class="np-chip">💬 ${it.comments}</span>` : ""}${it.disputed ? `<span class="np-chip np-chip-hot" title="Friends disagree">⚡ disputed</span>` : ""}`;
  };
  const row = (it) => {
    const m = mark(it);
    if (starredOnly && !m.star) return "";
    return `<li class="np-item${m.read ? " is-read" : ""}${cur === it.id ? " is-on" : ""}" data-id="${it.id}">
      <a href="#/news/item/${it.id}" class="np-item-a">
        <span class="np-meta">${m.read ? "" : `<i class="np-dot" aria-label="Unread"></i>`}${esc(it.feed)} · <time>${when(it)}</time></span>
        <span class="np-title">${esc(it.one_liner || it.title)}</span>
        <span class="np-sum">${esc(bullets(it.summary).find((b) => b.replace(/[\s.]+$/, "") !== String(it.one_liner || "").replace(/[\s.…]+$/, "")) || (it.one_liner ? it.title : ""))}</span>
        <span class="np-row-foot">${chips(it)}<span class="np-avs">${avatars(m.others)}</span></span>
      </a>
      <button class="np-star${m.star ? " on" : ""}" type="button" data-star="${it.id}" aria-pressed="${m.star}" aria-label="Star">★</button>
    </li>`;
  };
  function drawPaper() {
    const isToday = ed.day === kstDay();
    const status = ed.status === "closed" ? `Closed ${ed.built_at ? hhmm(ed.built_at) : ""}` : ed.status === "draft" ? "Morning edition · updating" : "Live · not yet printed";
    const no = Math.max(1, Math.round((new Date(ed.day) - new Date("2026-08-14")) / 864e5) + 1);
    const front = (ed.front || []).filter((f) => f.item);
    const lead = front[0];
    const rest = front.slice(1);
    list = [];
    const push = (it) => { if (it && !list.includes(it.id)) list.push(it.id); };
    front.forEach((f) => push(f.item));
    const secs = SECTIONS.map(([k, label]) => {
      const its = (ed.sections?.[k] || []).filter((it) => !front.some((f) => f.item.id === it.id));
      its.forEach(push);
      const rows = its.map(row).join("");
      return rows ? `<section class="np-sec" id="sec-${k}"><h2 class="np-sec-h"><span>${label}</span><small>${its.length}</small></h2><ul class="np-list">${rows}</ul></section>` : "";
    }).join("");
    (ed.late || []).forEach(push);
    const unread = list.filter((id) => !items.get(id)?.readers?.includes(ctx.me.id)).length;
    paper.innerHTML = `
      <header class="np-mast">
        <div class="np-mast-top">
          <a class="np-day-btn" href="${ed.prev ? "#/news/" + ed.prev : "#"}" ${ed.prev ? "" : 'aria-disabled="true"'} aria-label="Previous day">‹ ${ed.prev ? fmtShort(ed.prev) : ""}</a>
          <span class="np-mast-meta">No. ${no} · ${ed.count || list.length} stories · ${status}</span>
          <a class="np-day-btn" href="${ed.next ? "#/news/" + ed.next : "#"}" ${ed.next ? "" : 'aria-disabled="true"'} aria-label="Next day">${ed.next ? fmtShort(ed.next) : ""} ›</a>
        </div>
        <h1 class="np-date">${fmtLong(ed.day)}${isToday ? ` <span class="np-today">Today</span>` : ""}</h1>
        <nav class="np-secnav">${SECTIONS.map(([k, l]) => `<a href="#sec-${k}" data-jump="sec-${k}">${l} <small>${(ed.sections?.[k] || []).length}</small></a>`).join("")}<span class="np-unread">${unread ? `${unread} unread` : "All read"}</span></nav>
      </header>
      ${ed.headline ? `<section class="np-lead"><h2 class="np-headline">${esc(ed.headline)}</h2>${ed.lede ? `<p class="np-lede">${esc(ed.lede)}</p>` : ""}</section>` : `<section class="np-lead np-lead-empty"><p>Today's edition prints at <b>23:10</b>. Stories below are arriving live.</p></section>`}
      ${lead ? `<section class="np-front">
        <article class="np-top${mark(lead.item).read ? " is-read" : ""}" data-id="${lead.item.id}">
          <a href="#/news/item/${lead.item.id}">
            <span class="np-meta">${esc(lead.item.feed)} · <time>${when(lead.item)}</time></span>
            <h3>${esc(lead.item.one_liner || lead.item.title)}</h3>
            ${(() => { const rest = bullets(lead.item.summary).filter((b) => b.replace(/[\s.…]+$/, "") !== String(lead.item.one_liner || "").replace(/[\s.…]+$/, "")).join(" "); return rest ? `<p class="np-top-sum">${esc(rest)}</p>` : ""; })()}
            ${lead.why ? `<p class="np-why"><b>Why it matters</b> ${esc(lead.why)}</p>` : ""}
            <span class="np-row-foot">${chips(lead.item)}<span class="np-avs">${avatars(mark(lead.item).others)}</span></span>
          </a>
        </article>
        ${rest.length ? `<ol class="np-front-list">${rest.map((f) => `<li class="${mark(f.item).read ? "is-read" : ""}" data-id="${f.item.id}"><a href="#/news/item/${f.item.id}"><span class="np-meta">${esc(f.item.feed)} · <time>${when(f.item)}</time></span><b>${esc(f.item.one_liner || f.item.title)}</b>${f.why ? `<span class="np-why-s">${esc(f.why)}</span>` : ""}</a></li>`).join("")}</ol>` : ""}
      </section>` : ""}
      ${(ed.threads || []).length ? `<section class="np-moves"><h2 class="np-sec-h"><span>How the threads moved</span></h2><ul>${ed.threads.map((t) => `<li><b>${esc(t.title)}</b><span>${esc(t.move || "")}</span><small>${t.n || ""}</small></li>`).join("")}</ul></section>` : ""}
      ${secs}
      ${(ed.late || []).length ? `<section class="np-sec"><h2 class="np-sec-h"><span>Late additions</span><small>${ed.late.length}</small></h2><ul class="np-list">${ed.late.map(row).join("")}</ul></section>` : ""}
      <footer class="np-end">${list.length ? (unread ? `${unread} stories left in this edition.` : `You're all caught up for ${fmtShort(ed.day)}.`) : "No stories for this day."}${ed.prev ? ` <a href="#/news/${ed.prev}">Read ${fmtShort(ed.prev)} ›</a>` : ""}</footer>`;
  }
  function drawThreads() {
    $("#np-threads").innerHTML = (ed.threads || []).map((t) => `<li><b>${esc(t.title)}</b><span>${esc(t.move || "")}</span></li>`).join("") || `<li class="np-faint">No thread moved today.</li>`;
  }

  // ---------- 기사 읽기 칸 ----------
  async function openItem(id) {
    cur = id;
    paper.querySelectorAll("[data-id]").forEach((el) => el.classList.toggle("is-on", el.dataset.id === id));
    reader.hidden = false; np.classList.add("has-reader");
    const known = items.get(id);
    reader.innerHTML = `<div class="np-r-in"><button class="np-back" type="button" data-close>‹ Edition</button><p class="np-loading">Opening…</p></div>`;
    let d;
    try { d = await api.newsItem(id); } catch (e) { reader.innerHTML = `<div class="np-r-in"><button class="np-back" type="button" data-close>‹ Edition</button><p class="np-loading">${esc(e.message)}</p></div>`; return; }
    if (!alive || cur !== id) return;
    const it = { ...known, ...d.item, summary: known?.summary || d.item.summary };
    const star = () => (it.stars || []).includes(ctx.me.id);
    const norm = (x) => String(x || "").replace(/[\s.。…]+$/g, "").trim();
    const sum = bullets(it.summary).filter((b) => norm(b) !== norm(it.one_liner)); // 첫 문장이 제목(한 줄 요약)과 같으면 빼요
    reader.innerHTML = `<div class="np-r-in">
      <button class="np-back" type="button" data-close>‹ Edition</button>
      <span class="np-meta">${esc(it.feed)} · ${it.dated === 0 ? "undated" : `${fmtShort(kstDay(it.published_at))} ${hhmm(it.published_at)} KST`}</span>
      <h2 class="np-r-title">${esc(it.one_liner || it.title)}</h2>
      ${it.one_liner ? `<p class="np-r-orig" lang="en">${esc(it.title)}</p>` : ""}
      ${sum.length ? `<section class="np-r-sum"><h4>Summary</h4><ul>${sum.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : ""}
      <div class="np-r-acts">
        <button class="np-btn${star() ? " on" : ""}" type="button" id="np-r-star" aria-pressed="${star()}">★ ${star() ? "Starred" : "Star"}</button>
        <button class="np-btn" type="button" id="np-r-deep">${d.deep ? "Deep summary ✓" : "Deep summary"}</button>
        <a class="np-btn" href="${esc(it.url)}" target="_blank" rel="noopener">Original ${icon.external(13)}</a>
        <span class="np-avs" title="Read by">${avatars((it.readers || []).filter((u) => u !== ctx.me.id))}</span>
      </div>
      <section class="np-r-deep" id="np-r-deep-box"${d.deep ? "" : " hidden"}></section>
      ${d.excerpt ? `<details class="np-r-ex"><summary>Original excerpt</summary><p lang="en">${esc(d.excerpt)}</p></details>` : ""}
      <section class="np-talk"><h4>Discussion <small id="np-talk-n"></small></h4>
        <form class="np-compose" id="np-compose"><textarea name="b" rows="2" maxlength="2000" placeholder="Leave a memo — your take in one or two lines"></textarea><button class="np-btn np-btn-pri" type="submit">Post memo</button></form>
        <div id="np-talk"></div>
      </section>
    </div>`;
    const paintDeep = (deep) => {
      const el = reader.querySelector("#np-r-deep-box"); el.hidden = false;
      el.innerHTML = `<h4>Deep summary</h4><ul>${(deep.summary || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>${deep.why ? `<p class="np-why"><b>Why it matters</b> ${esc(deep.why)}</p>` : ""}`;
    };
    if (d.deep) paintDeep(d.deep);
    reader.querySelector("#np-r-deep").addEventListener("click", async (e) => {
      if (d.deep) return; const b = e.currentTarget; b.disabled = true; b.textContent = "Reading the article…";
      try { const r2 = await api.newsDeep(id); d.deep = r2.deep || r2; paintDeep(d.deep); b.textContent = "Deep summary ✓"; }
      catch (err) { toast(err.message, "err"); b.disabled = false; b.textContent = "Deep summary"; }
    });
    reader.querySelector("#np-r-star").addEventListener("click", () => toggleStar(id));
    talk(id, d.comments || []);
    if (!(it.readers || []).includes(ctx.me.id)) {
      api.newsMark(id, { read: true }).then(() => {
        const k = items.get(id); if (k) { k.readers = [...(k.readers || []), ctx.me.id]; repaintRow(id); }
      }).catch(() => {});
    }
    reader.scrollTop = 0;
  }
  function closeReader() {
    cur = null; reader.hidden = true; np.classList.remove("has-reader");
    paper.querySelectorAll(".is-on[data-id]").forEach((el) => el.classList.remove("is-on"));
  }
  function repaintRow(id) {
    const it = items.get(id); if (!it) return;
    paper.querySelectorAll(`[data-id="${id}"]`).forEach((el) => {
      if (el.matches("li.np-item")) { const tmp = document.createElement("ul"); tmp.innerHTML = row(it); const n = tmp.firstElementChild; if (n) el.replaceWith(n); }
      else el.classList.toggle("is-read", !!it.readers?.includes(ctx.me.id));
    });
    const u = paper.querySelector(".np-unread"); if (u) { const n = list.filter((x) => !items.get(x)?.readers?.includes(ctx.me.id)).length; u.textContent = n ? `${n} unread` : "All read"; }
  }
  async function toggleStar(id) {
    const it = items.get(id) || { stars: [] }; const on = !(it.stars || []).includes(ctx.me.id);
    it.stars = on ? [...(it.stars || []), ctx.me.id] : (it.stars || []).filter((u) => u !== ctx.me.id);
    repaintRow(id);
    const b = reader.querySelector("#np-r-star"); if (b && cur === id) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.textContent = `★ ${on ? "Starred" : "Star"}`; }
    try { await api.newsMark(id, { flagged: on }); } catch (err) { toast(err.message, "err"); }
  }

  // ---------- 토론: 메모 → 반박 · 동의 (2단) · 🤖 AI 반박 ----------
  function talk(itemId, comments) {
    let all = comments.slice();
    const box = reader.querySelector("#np-talk");
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 6e4)); return m < 60 ? m + "m" : m < 2880 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; };
    const head = (c, ai) => { const u = user(c.user_id); return ai ? `<i class="np-av np-av-ai">🤖</i><b>AI</b><span>rebut · asked by ${esc(u.display_name)} · ${ago(c.created_at)}</span>` : `<i class="np-av" style="--c:${u.color}">${esc((u.display_name || "?")[0])}</i><b>${esc(u.display_name)}</b><span>${c.stance} · ${ago(c.created_at)}</span>`; };
    const del = (c) => (c.user_id === ctx.me.id && !c.ai ? `<button class="np-del" data-del="${c.id}" type="button" aria-label="Delete">${icon.trash(13)}</button>` : "");
    const body = (s) => esc(s).replace(/\n?^&gt; (.+)$\n?/gm, "<q>$1</q>").replace(/\n/g, "<br>");
    const paint = () => {
      const memos = all.filter((c) => !c.parent_id);
      reader.querySelector("#np-talk-n").textContent = all.length ? `${all.length}${all.some((c) => c.stance === "rebut") ? " · ⚡ disputed" : ""}` : "";
      box.innerHTML = memos.map((m) => {
        const kids = all.filter((c) => c.parent_id === m.id), hasAi = kids.some((k) => k.ai);
        return `<article class="np-memo" data-id="${m.id}">
          <header>${head(m)}${del(m)}</header><p>${body(m.body)}</p>
          <div class="np-memo-acts"><button type="button" class="np-chip-btn r" data-reply="rebut">Rebut</button><button type="button" class="np-chip-btn g" data-reply="agree">Agree</button>${hasAi ? "" : `<button type="button" class="np-chip-btn" data-ai="${m.id}">🤖 AI rebut</button>`}</div>
          ${kids.map((k) => `<div class="np-reply ${k.stance}${k.ai ? " ai" : ""}"><header>${head(k, k.ai)}${del(k)}</header><p>${body(k.body)}</p></div>`).join("")}
        </article>`;
      }).join("") || `<p class="np-faint">No memos yet.</p>`;
    };
    const sync = () => { const it = items.get(itemId); if (!it) return; it.comments = all.length; it.disputed = all.some((c) => c.stance === "rebut"); repaintRow(itemId); };
    paint();
    reader.querySelector("#np-compose").addEventListener("submit", async (e) => {
      e.preventDefault(); const ta = e.target.b, b = ta.value.trim(); if (!b) return; ta.disabled = true;
      try { const { comment } = await api.newsComment(itemId, { body: b }); all.push(comment); ta.value = ""; paint(); sync(); } catch (err) { toast(err.message, "err"); }
      ta.disabled = false;
    });
    box.addEventListener("click", async (e) => {
      const memo = e.target.closest(".np-memo"), rep = e.target.closest("[data-reply]");
      if (rep && memo) {
        memo.querySelector(".np-rform")?.remove();
        const stance = rep.dataset.reply;
        memo.insertAdjacentHTML("beforeend", `<form class="np-rform ${stance}"><textarea rows="2" maxlength="2000" placeholder="${stance === "rebut" ? "Why is this wrong?" : "What makes it right?"}"></textarea><button class="np-btn" type="submit">${stance === "rebut" ? "Rebut" : "Agree"}</button></form>`);
        const f = memo.querySelector(".np-rform"); f.querySelector("textarea").focus();
        f.addEventListener("submit", async (ev) => {
          ev.preventDefault(); const b = f.querySelector("textarea").value.trim(); if (!b) return;
          try { const { comment } = await api.newsComment(itemId, { body: b, stance, parent_id: memo.dataset.id }); all.push(comment); paint(); sync(); } catch (err) { toast(err.message, "err"); }
        });
        return;
      }
      const ai = e.target.closest("[data-ai]");
      if (ai) {
        ai.disabled = true; ai.textContent = "🤖 reading…";
        try { const { comment } = await api.newsAiRebut(ai.dataset.ai); all.push(comment); paint(); sync(); } catch (err) { toast(err.message, "err"); ai.disabled = false; ai.textContent = "🤖 AI rebut"; }
        return;
      }
      const d = e.target.closest("[data-del]");
      if (d) { try { await api.newsDelComment(d.dataset.del); all = all.filter((c) => c.id !== d.dataset.del && c.parent_id !== d.dataset.del); paint(); sync(); } catch (err) { toast(err.message, "err"); } }
    });
  }

  // ---------- 이벤트 ----------
  root.addEventListener("click", (e) => {
    const s = e.target.closest("[data-star]"); if (s) { e.preventDefault(); toggleStar(s.dataset.star); return; }
    if (e.target.closest("[data-close]")) { e.preventDefault(); ctx.go(ed ? (ed.day === kstDay() ? "#/news" : "#/news/" + ed.day) : "#/news"); return; }
    const j = e.target.closest("[data-jump]"); if (j) { e.preventDefault(); paper.querySelector("#" + j.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const f = e.target.closest("[data-filter]"); if (f) { starredOnly = !starredOnly; f.classList.toggle("on", starredOnly); if (ed) drawPaper(); return; }
    if (e.target.closest('[aria-disabled="true"]')) e.preventDefault();
  });
  const onKey = (e) => {
    if (e.target.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = cur ? list.indexOf(cur) : -1;
    if (e.key === "j" || e.key === "k") { const n = list[e.key === "j" ? i + 1 : Math.max(0, i - 1)]; if (n) { e.preventDefault(); ctx.go("#/news/item/" + n); } }
    else if (e.key === "[" && ed?.prev) ctx.go("#/news/" + ed.prev);
    else if (e.key === "]" && ed?.next) ctx.go("#/news/" + ed.next);
    else if (e.key === "s" && cur) toggleStar(cur);
    else if (e.key === "Escape" && cur) ctx.go(ed?.day === kstDay() ? "#/news" : "#/news/" + ed.day);
  };
  document.addEventListener("keydown", onKey);

  // ---------- 주소 ----------
  async function route(rr) {
    if (rr.sub === "item" && rr.id) {
      if (!ed) await loadEdition(store.get("np-day") || kstDay());
      openItem(rr.id);
      return;
    }
    const day = rr.day && DAY_RE.test(rr.day) ? rr.day : kstDay();
    store.set("np-day", day);
    closeReader();
    if (!ed || ed.day !== day) await loadEdition(day);
  }
  inst = { route };
  loadEditions();
  route(r);
  api.newsSeen?.().catch(() => {});
  return () => { alive = false; inst = null; document.removeEventListener("keydown", onKey); };
}

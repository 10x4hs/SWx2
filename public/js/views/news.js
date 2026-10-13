// 뉴스 Signal Map — #/news · #/news/item/<id> · #/news/thread/<id>
// 처음 열면(하루 한 번) 3~5초 브리핑: 날짜 · "Today, N signals" · 신호 문장이 타자처럼 찍히고, 글자가 입자로 흩어져
// 지구본 위 그 나라로 날아가요. 그 뒤는 지도 홈 — 왼쪽 오늘의 신호, 가운데 지구본(신호 점 · 줄기 호), 오른쪽 실시간 목록.
// 같은 날 다시 오면 0.8초 인트로 (Space · 클릭으로 건너뛰기). prefers-reduced-motion 이면 인트로 없이 바로 지도.
// 지구본(three.js)은 이 화면을 열 때만 CDN 에서 불러요 (news/globe.js).
import { api } from "../api.js";
import { esc, toast } from "../util.js";
import { icon } from "../icons.js";

const REDUCED = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

const ago = (t) => {
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return m + "m";
  const h = Math.round(m / 60);
  return h < 48 ? h + "h" : Math.round(h / 24) + "d";
};
const longDay = (d = new Date()) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).toUpperCase();
const shortDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const pad2 = (n) => String(n).padStart(2, "0");
// 피드에 날짜가 없던 글(dated=0)은 "1m" 같은 가짜 시간 대신 NEW (published_at 은 처음 본 시각이라 정렬은 그대로)
const when = (it) => (it.dated === 0 ? "new" : ago(it.published_at));

let inst = null;
export function update(r) { inst?.route(r); }

export function mount(root, ctx, r) {
  const reduced = REDUCED();
  root.innerHTML = `
    <div class="nw" id="nw">
      <div class="nw-grid">
        <aside class="nw-left" aria-label="Today's signals">
          <header class="nw-head">
            <span class="nw-eyebrow"><i class="nw-live-dot"></i>${longDay()}</span>
            <h1 class="nw-count" id="nw-count">Acquiring signals…</h1>
            <p class="nw-brief" id="nw-brief"></p>
          </header>
          <ol class="nw-signals" id="nw-signals"></ol>
        </aside>
        <section class="nw-stage" aria-label="Signal map">
          <div class="nw-globe" id="nw-globe"></div>
          <div class="nw-hud nw-hud-tl"><span>SIGNAL MAP</span><span id="nw-hud-n">—</span></div>
          <div class="nw-hud nw-hud-br"><span><i class="lg lg-a"></i>signal</span><span><i class="lg lg-h"></i>disputed</span><span><i class="lg lg-t"></i>thread</span></div>
          <div class="nw-tip" id="nw-tip" hidden></div>
        </section>
        <aside class="nw-right" aria-label="Live">
          <header class="nw-head nw-head-sm"><span class="nw-eyebrow"><i class="nw-live-dot"></i>LIVE</span></header>
          <ul class="nw-live" id="nw-live"></ul>
        </aside>
      </div>
      <section class="nw-panel" id="nw-panel" aria-hidden="true"><div class="nw-panel-in" id="nw-panel-in"></div></section>
      <canvas class="nw-intro" id="nw-intro" aria-hidden="true"></canvas>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const nw = $("#nw"), panel = $("#nw-panel"), pin = $("#nw-panel-in"), tip = $("#nw-tip");
  let data = null, globe = null, alive = true, panelFrom = null, cur = r;
  const user = (id) => ctx.user(id) || { display_name: "?", color: "var(--m0)" };
  const items = new Map();

  // ---------- 지구본 (늦게 불러요) ----------
  const globeReady = import("../news/globe.js")
    .then((m) => m.createGlobe($("#nw-globe"), {
      reduced,
      onHover: (u) => { globe?.highlight(u ? (u.kind === "spot" ? { code: u.code } : { thread: u.id }) : null); showTip(u); },
      onPick: (u) => pickMap(u),
    }))
    .then((g) => { if (!alive) { g.destroy(); return null; } globe = g; if (data) paintGlobe(); nw.classList.add("globe-on"); return g; })
    .catch((e) => { console.warn("globe", e); $("#nw-globe").innerHTML = `<p class="nw-globe-err">Globe unavailable offline</p>`; return null; });

  // ---------- 데이터 ----------
  const load = () => api.newsMap().then((d) => {
    data = d;
    for (const it of [...d.signals, ...d.live]) items.set(it.id, it);
    paintLists();
    if (globe) paintGlobe();
    return d;
  });
  const first = load().catch((e) => { $("#nw-count").textContent = "No signal"; toast(e.message, "err"); return null; });
  api.newsSeen().catch(() => {});

  // ---------- 인트로 ----------
  const today = new Date().toISOString().slice(0, 10);
  const full = store.get("nw-intro") !== today;
  if (reduced) nw.classList.add("ready");
  else first.then((d) => d && intro(full, d)).catch(() => nw.classList.add("ready"));

  // ---------- 화면 그리기 ----------
  const flags = (geo) => (geo || []).slice(0, 3).map((c) => `<span class="nw-cc">${esc(c)}</span>`).join("");
  const marks = (it) => {
    const dots = (it.readers || []).map((id) => `<i class="nw-rd" style="--c:${user(id).color}" title="${esc(user(id).display_name)} read"></i>`).join("");
    const stars = (it.stars || []).map((id) => `<i class="nw-st" style="--c:${user(id).color}" title="${esc(user(id).display_name)} starred">★</i>`).join("");
    return dots || stars ? `<span class="nw-marks">${dots}${stars}</span>` : "";
  };
  const badges = (it) => `${it.comments ? `<span class="nw-b">💬 ${it.comments}</span>` : ""}${it.disputed ? `<span class="nw-b nw-b-hot" title="Disputed">⚡</span>` : ""}`;
  const threadOf = (id) => data?.threads.find((t) => t.id === id);

  function paintLists() {
    const n = data.count;
    $("#nw-count").innerHTML = `Today, <b>${n}</b> signal${n === 1 ? "" : "s"}`;
    $("#nw-brief").textContent = data.brief?.headline ? `${data.brief.day && data.brief.day !== data.day ? `[${shortDate(Date.parse(data.brief.day))}] ` : ""}${data.brief.headline} — ${data.brief.body || ""}` : "";
    $("#nw-hud-n").textContent = `${pad2(data.signals.length)} SIG · ${pad2(data.threads.length)} THR`;
    $("#nw-signals").innerHTML = data.signals.map((s, i) => {
      const th = threadOf(s.thread_id);
      return `<li class="nw-sig${s.readers?.includes(ctx.me.id) ? " is-read" : ""}" style="--i:${i}" data-id="${s.id}" data-code="${esc(s.geo?.[0] || "")}" data-thread="${th ? th.id : ""}" tabindex="0">
        <div class="nw-sig-top"><span class="nw-idx">${pad2(i + 1)}</span>${flags(s.geo)}<span class="nw-ago">${when(s)}</span></div>
        <p class="nw-one">${esc(s.one_liner || s.title)}</p>
        <p class="nw-orig">${esc(s.title)}</p>
        <div class="nw-sig-foot">${th ? `<span class="nw-thr">⟿ ${esc(th.title)} · ${th.n}</span>` : `<span class="nw-feed">${esc(s.feed)}</span>`}${badges(s)}${marks(s)}</div>
      </li>`;
    }).join("") || `<li class="nw-empty">No signals in the last 36h. Feeds refresh hourly.</li>`;
    $("#nw-live").innerHTML = data.live.map((it, i) => `
      <li class="nw-li${it.readers?.includes(ctx.me.id) ? " is-read" : ""}" style="--i:${i}" data-id="${it.id}" data-code="${esc(it.geo?.[0] || "")}" tabindex="0">
        <span class="nw-li-t${it.dated === 0 ? " is-new" : ""}">${when(it)}</span>
        <div class="nw-li-b"><p>${esc(it.one_liner || it.title)}</p><span class="nw-feed">${esc(it.feed)} ${flags(it.geo)}</span></div>
        <span class="nw-li-x">${badges(it)}${marks(it)}</span>
      </li>`).join("");
  }

  function paintGlobe() {
    const spot = new Map();
    for (const it of [...data.signals, ...data.live]) {
      for (const c of (it.geo || []).slice(0, 2)) {
        const s = spot.get(c) || { code: c, n: 0, disputed: false };
        s.n += 1; s.disputed ||= !!it.disputed; spot.set(c, s);
      }
    }
    globe.setData({ spots: [...spot.values()], arcs: data.threads.filter((t) => t.geo.length >= 2).map((t) => ({ id: t.id, codes: t.geo })) });
  }

  function showTip(u) {
    if (!u || !data) { tip.hidden = true; return; }
    let html = "";
    if (u.kind === "spot") {
      const list = [...items.values()].filter((it) => it.geo?.includes(u.code)).slice(0, 3);
      html = `<b>${esc(u.code)}</b> · ${list.length} signal${list.length === 1 ? "" : "s"}${list.map((it) => `<span>${esc(it.one_liner || it.title)}</span>`).join("")}`;
    } else {
      const t = threadOf(u.id);
      html = t ? `<b>⟿ ${esc(t.title)}</b> · ${t.n} articles<span>${t.geo.join(" → ")}</span>` : "";
    }
    tip.innerHTML = html; tip.hidden = !html;
  }

  function pickMap(u) {
    if (u.kind === "arc") return ctx.go("#/news/thread/" + u.id);
    // 그 나라의 가장 굵은 줄기 → 없으면 가장 새 글
    const list = [...items.values()].filter((it) => it.geo?.includes(u.code)).sort((a, b) => b.published_at - a.published_at);
    const withT = list.map((it) => threadOf(it.thread_id)).filter(Boolean).sort((a, b) => b.n - a.n)[0];
    if (withT) ctx.go("#/news/thread/" + withT.id);
    else if (list[0]) ctx.go("#/news/item/" + list[0].id);
  }

  // 카드 hover → 지도 점 밝히기 · 그 나라로 돌리기
  let hoverT = null;
  const onOver = (e) => {
    const li = e.target.closest("[data-id]"); if (!li || !globe) return;
    const code = li.dataset.code, th = li.dataset.thread;
    globe.highlight(th ? { code, thread: th } : { code });
    clearTimeout(hoverT); hoverT = setTimeout(() => code && globe.focus(code), 180);
  };
  const onOut = (e) => { if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) { globe?.highlight(null); clearTimeout(hoverT); } };
  const onOpen = (e) => {
    const li = e.target.closest("[data-id]"); if (!li) return;
    if (e.type === "keydown" && e.key !== "Enter") return;
    if (li.dataset.thread) ctx.go("#/news/thread/" + li.dataset.thread);
    else ctx.go("#/news/item/" + li.dataset.id);
  };
  for (const id of ["#nw-signals", "#nw-live"]) {
    const el = $(id);
    el.addEventListener("pointerover", onOver); el.addEventListener("pointerout", onOut);
    el.addEventListener("click", onOpen); el.addEventListener("keydown", onOpen);
  }

  // ---------- 패널 (줄기 · 글) ----------
  function openPanel(html) {
    clearTimeout(hoverT);
    pin.innerHTML = html;
    panel.setAttribute("aria-hidden", "false");
    nw.classList.add("panel-on");
    pin.scrollTop = 0;
  }
  function closePanel() {
    panel.setAttribute("aria-hidden", "true");
    nw.classList.remove("panel-on");
    globe?.highlight(null);
  }
  const panelHead = (eyebrow, back) => `
    <div class="nw-p-bar">
      ${back ? `<a class="nw-p-back" href="${back.href}">${icon.left(14)} ${esc(back.label)}</a>` : `<span class="nw-eyebrow">${eyebrow}</span>`}
      <a class="nw-p-x" href="#/news" aria-label="Close">${icon.x(16)}</a>
    </div>`;

  async function showThread(id) {
    openPanel(`${panelHead("THREAD")}<div class="nw-skel"></div>`);
    let d;
    try { d = await api.newsThread(id); } catch (e) { pin.innerHTML = `${panelHead("THREAD")}<p class="nw-empty">${esc(e.message)}</p>`; return; }
    if (cur.sub !== "thread" || cur.id !== id) return;
    panelFrom = { href: "#/news/thread/" + id, label: d.thread.title };
    const its = d.items, codes = [...new Set(its.flatMap((i) => i.geo || []))];
    globe?.highlight({ thread: id, code: codes[0] }); if (codes[0]) globe?.focus(codes[0]);
    const span = its.length ? `${shortDate(its[0].published_at)} → ${shortDate(its[its.length - 1].published_at)}` : "";
    openPanel(`${panelHead(`THREAD · ${its.length} ARTICLES`)}
      <h2 class="nw-p-title">${esc(d.thread.title)}</h2>
      <p class="nw-p-meta">${span} · ${codes.slice(0, 5).map((c) => `<span class="nw-cc">${esc(c)}</span>`).join("")}</p>
      <section class="nw-story"><span class="nw-eyebrow">AI · STORY SO FAR</span><p id="nw-story">${d.thread.story ? esc(d.thread.story) : `<span class="nw-shimmer">Reading ${its.length} articles…</span>`}</p></section>
      <ol class="nw-tl">${its.slice().reverse().map((it, i) => `
        <li class="nw-tl-i" style="--i:${i}" data-id="${it.id}"><time>${shortDate(it.published_at)}</time>
          <a href="#/news/item/${it.id}"><p class="nw-one">${esc(it.one_liner || it.title)}</p><span class="nw-feed">${esc(it.feed)} ${flags(it.geo)}</span><span class="nw-tl-x">${badges(it)}${marks(it)}</span></a></li>`).join("")}</ol>`);
    if (d.thread.stale || !d.thread.story) {
      api.newsStory(id).then((s) => { const el = pin.querySelector("#nw-story"); if (el && s.story) typeInto(el, s.story); else if (el && !d.thread.story) el.textContent = "Story unavailable right now."; }).catch(() => {});
    }
  }

  async function showItem(id) {
    openPanel(`${panelHead("ARTICLE")}<div class="nw-skel"></div>`);
    let d;
    try { d = await api.newsItem(id); } catch (e) { pin.innerHTML = `${panelHead("ARTICLE")}<p class="nw-empty">${esc(e.message)}</p>`; return; }
    if (cur.sub !== "item" || cur.id !== id) return;
    const it = d.item;
    if (it.geo?.[0]) { globe?.highlight({ code: it.geo[0], thread: it.thread_id }); globe?.focus(it.geo[0]); }
    const back = panelFrom && it.thread_id && panelFrom.href.endsWith(it.thread_id) ? panelFrom : d.thread ? { href: "#/news/thread/" + d.thread.id, label: d.thread.title } : null;
    let mine = d.mine || {};
    const starBtn = () => `<button class="nw-btn${mine.flagged ? " on" : ""}" id="nw-star" type="button" style="--c:${ctx.me.color}">★ ${mine.flagged ? "Starred" : "Star"}</button>`;
    openPanel(`${panelHead("ARTICLE", back)}
      <p class="nw-p-meta"><span class="nw-feed">${esc(it.feed)}</span> · ${it.dated === 0 ? "undated · first seen " + ago(it.published_at) + " ago" : ago(it.published_at) + " ago"} · ${flags(it.geo)}</p>
      <h2 class="nw-p-title nw-p-title-en">${esc(it.title)}</h2>
      <p class="nw-ko">${esc(it.one_liner || "요약을 준비하는 중이에요.")}</p>
      <div class="nw-acts" id="nw-acts">${starBtn()}<button class="nw-btn" id="nw-deep-btn" type="button">${d.deep ? "Deep summary ✓" : "Deep summary"}</button><a class="nw-btn" href="${esc(it.url)}" target="_blank" rel="noopener">Source ${icon.external(13)}</a><span class="nw-acts-marks" id="nw-marks"></span></div>
      <section class="nw-deep" id="nw-deep"${d.deep ? "" : " hidden"}></section>
      <section class="nw-talk">
        <header><span class="nw-eyebrow">DISCUSSION</span><span class="nw-talk-n" id="nw-talk-n"></span></header>
        <div id="nw-talk"></div>
        <form class="nw-compose" id="nw-compose"><textarea name="b" rows="2" placeholder="Leave a memo — what do you make of this?" maxlength="2000"></textarea><button class="nw-btn nw-btn-go" type="submit">Post memo</button></form>
      </section>`);
    const paintMarks = () => { pin.querySelector("#nw-marks").innerHTML = marks(it); };
    const paintDeep = (deep) => {
      const el = pin.querySelector("#nw-deep"); el.hidden = false;
      el.innerHTML = `<span class="nw-eyebrow">DEEP SUMMARY</span><ul>${deep.summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>${deep.why ? `<p class="nw-why">${esc(deep.why)}</p>` : ""}${deep.numbers?.length ? `<div class="nw-nums">${deep.numbers.map((n) => `<span>${esc(n)}</span>`).join("")}</div>` : ""}`;
    };
    if (d.deep) paintDeep(d.deep);
    // 열면 읽음 — 셋에게 내 점이 보여요
    if (!mine.read) {
      api.newsMark(id, { read: true }).then(() => {
        mine.read = 1; if (!it.readers.includes(ctx.me.id)) it.readers.push(ctx.me.id); paintMarks();
        const li = items.get(id); if (li && !li.readers.includes(ctx.me.id)) { li.readers.push(ctx.me.id); paintLists(); }
      }).catch(() => {});
    }
    paintMarks();
    pin.querySelector("#nw-acts").addEventListener("click", async (e) => {
      if (e.target.closest("#nw-star")) {
        const v = !mine.flagged; mine.flagged = v ? 1 : 0;
        it.stars = v ? [...new Set([...it.stars, ctx.me.id])] : it.stars.filter((x) => x !== ctx.me.id);
        e.target.closest("#nw-star").outerHTML = starBtn(); paintMarks();
        const li = items.get(id); if (li) { li.stars = it.stars; paintLists(); }
        api.newsMark(id, { flagged: v }).catch((err) => toast(err.message, "err"));
      }
      if (e.target.closest("#nw-deep-btn")) {
        const b = e.target.closest("#nw-deep-btn"); b.disabled = true; b.innerHTML = `<span class="nw-shimmer">Reading the full text…</span>`;
        const res = await api.newsDeep(id).catch((err) => ({ error: err.message }));
        b.disabled = false; b.textContent = res.deep ? "Deep summary ✓" : "Deep summary";
        if (res.deep) paintDeep(res.deep); else toast(res.error || "요약을 만들지 못했어요.", "err");
      }
    });
    talk(id, d.comments);
  }

  // ---------- 토론: 메모 → 반박(빨강) · 동의(초록), 2단 ----------
  function talk(itemId, comments) {
    let list = comments.slice();
    const box = pin.querySelector("#nw-talk");
    const when = (t) => `${ago(t)} ago`;
    const paint = () => {
      const memos = list.filter((c) => !c.parent_id);
      pin.querySelector("#nw-talk-n").textContent = list.length ? `💬 ${list.length}${list.some((c) => c.stance === "rebut") ? " · ⚡ disputed" : ""}` : "";
      box.innerHTML = memos.map((m) => {
        const kids = list.filter((c) => c.parent_id === m.id), u = user(m.user_id), hasAi = kids.some((k) => k.ai);
        return `<article class="nw-memo" data-id="${m.id}">
          <header><i class="nw-av" style="--c:${u.color}">${esc((u.display_name || "?")[0])}</i><b>${esc(u.display_name)}</b><span>memo · ${when(m.created_at)}</span>${m.user_id === ctx.me.id ? `<button class="nw-del" data-del="${m.id}" type="button" aria-label="Delete">${icon.trash(13)}</button>` : ""}</header>
          <p>${esc(m.body)}</p>
          <div class="nw-memo-acts"><button type="button" class="nw-chip nw-chip-r" data-reply="rebut">Rebut</button><button type="button" class="nw-chip nw-chip-g" data-reply="agree">Agree</button>${hasAi ? "" : `<button type="button" class="nw-chip nw-chip-ai" data-ai="${m.id}">🤖 AI rebut</button>`}</div>
          ${kids.map((k) => { const ku = user(k.user_id); return `<div class="nw-reply nw-${k.stance}${k.ai ? " is-ai" : ""}">
            <header>${k.ai ? `<i class="nw-av nw-av-ai">🤖</i><b>AI</b><span>rebut · asked by ${esc(ku.display_name)} · ${when(k.created_at)}</span>` : `<i class="nw-av" style="--c:${ku.color}">${esc((ku.display_name || "?")[0])}</i><b>${esc(ku.display_name)}</b><span>${k.stance} · ${when(k.created_at)}</span>`}${k.user_id === ctx.me.id && !k.ai ? `<button class="nw-del" data-del="${k.id}" type="button" aria-label="Delete">${icon.trash(13)}</button>` : ""}</header>
            <p>${esc(k.body).replace(/\n?^&gt; (.+)$\n?/gm, '<q>$1</q>')}</p></div>`; }).join("")}
        </article>`;
      }).join("") || `<p class="nw-faint">No memos yet. Be the first to read between the lines.</p>`;
    };
    const syncCounts = () => {
      const li = items.get(itemId); if (!li) return;
      li.comments = list.length; li.disputed = list.some((c) => c.stance === "rebut"); paintLists(); if (globe) paintGlobe();
    };
    paint();
    pin.querySelector("#nw-compose").addEventListener("submit", async (e) => {
      e.preventDefault();
      const ta = e.target.b, body = ta.value.trim(); if (!body) return;
      ta.disabled = true;
      try { const { comment } = await api.newsComment(itemId, { body }); list.push({ ...comment, display_name: ctx.me.display_name }); ta.value = ""; paint(); syncCounts(); }
      catch (err) { toast(err.message, "err"); }
      ta.disabled = false;
    });
    box.addEventListener("click", async (e) => {
      const memo = e.target.closest(".nw-memo");
      const rep = e.target.closest("[data-reply]");
      if (rep && memo) {
        memo.querySelector(".nw-rform")?.remove();
        const stance = rep.dataset.reply;
        memo.insertAdjacentHTML("beforeend", `<form class="nw-rform nw-${stance}"><textarea rows="2" maxlength="2000" placeholder="${stance === "rebut" ? "Why is this wrong?" : "What makes it right?"}"></textarea><button class="nw-btn" type="submit">${stance === "rebut" ? "Rebut" : "Agree"}</button></form>`);
        const f = memo.querySelector(".nw-rform"); f.querySelector("textarea").focus();
        f.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const body = f.querySelector("textarea").value.trim(); if (!body) return;
          try { const { comment } = await api.newsComment(itemId, { body, stance, parent_id: memo.dataset.id }); list.push(comment); paint(); syncCounts(); }
          catch (err) { toast(err.message, "err"); }
        });
        return;
      }
      const ai = e.target.closest("[data-ai]");
      if (ai) {
        ai.disabled = true; ai.innerHTML = `<span class="nw-shimmer">🤖 reading the article…</span>`;
        try { const { comment } = await api.newsAiRebut(ai.dataset.ai); list.push(comment); paint(); syncCounts(); }
        catch (err) { toast(err.message, "err"); ai.disabled = false; ai.textContent = "🤖 AI rebut"; }
        return;
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        try { await api.newsDelComment(del.dataset.del); list = list.filter((c) => c.id !== del.dataset.del && c.parent_id !== del.dataset.del); paint(); syncCounts(); }
        catch (err) { toast(err.message, "err"); }
      }
    });
  }

  function typeInto(el, text) {
    if (reduced) { el.textContent = text; return; }
    el.textContent = ""; let i = 0;
    const step = () => { if (!alive || !el.isConnected) return; i = Math.min(text.length, i + 2); el.textContent = text.slice(0, i); if (i < text.length) setTimeout(step, 14); };
    step();
  }

  // ---------- 인트로: 타자 → 입자 → 지구본 ----------
  function intro(isFull, d) {
    const cv = $("#nw-intro"), g = cv.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const box = nw.getBoundingClientRect();
    cv.width = box.width * dpr; cv.height = box.height * dpr;
    g.scale(dpr, dpr);
    nw.classList.add("intro-on");
    const W = box.width, H = box.height, phone = W < 760;
    const lines = d.signals.slice(0, phone ? 3 : 5);
    const accent = getComputedStyle(nw).getPropertyValue("--nw-accent").trim() || "#5ef0ff";
    const big = phone ? 30 : 52, small = phone ? 14 : 17;
    const x0 = phone ? 20 : Math.max(48, W * 0.12), y0 = H * (phone ? 0.5 : 0.28);
    const head = `Today, ${d.count} signal${d.count === 1 ? "" : "s"}`;
    let stop = false, raf = 0;
    const skip = () => { stop = true; };
    const onKey = (e) => { if (e.code === "Space" || e.key === "Escape" || e.key === "Enter") { e.preventDefault(); skip(); } };
    addEventListener("keydown", onKey); cv.addEventListener("pointerdown", skip);
    const T_TYPE = isFull ? 2400 : 120, T_HOLD = isFull ? 450 : 120, T_FLY = isFull ? 1300 : 560;
    const lineY = (i) => y0 + big * 0.9 + 26 + i * (small * 2.05);
    const drawText = (p) => {
      g.clearRect(0, 0, W, H);
      g.textBaseline = "alphabetic";
      g.fillStyle = "rgba(160,190,210,.75)"; g.font = `500 ${phone ? 11 : 12}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      g.fillText(`${longDay()}  ·  SIGNAL BRIEFING`, x0, y0 - big - 8);
      g.fillStyle = "#eaf6ff"; g.font = `600 ${big}px Geist, Pretendard, system-ui, sans-serif`;
      g.fillText(head.slice(0, Math.ceil(head.length * Math.min(1, p * 4))), x0, y0);
      g.font = `400 ${small}px Pretendard, system-ui, sans-serif`;
      const per = 1 / Math.max(1, lines.length);
      lines.forEach((s, i) => {
        const lp = Math.max(0, Math.min(1, (p - 0.22 - i * per * 0.7) / (per * 0.9)));
        if (lp <= 0) return;
        const txt = `${(s.geo?.[0] || "··").padEnd(3)} ${s.one_liner || s.title}`, n = Math.ceil(txt.length * lp);
        g.fillStyle = accent; g.fillText(txt.slice(0, 3), x0, lineY(i));
        g.fillStyle = "rgba(220,235,245,.92)"; g.fillText(txt.slice(3, n), x0 + small * 2.2, lineY(i));
        if (lp < 1) { g.fillStyle = accent; g.fillRect(x0 + small * 2.2 + g.measureText(txt.slice(3, n)).width + 3, lineY(i) - small + 2, 2, small); }
      });
    };
    const t0 = performance.now();
    let parts = null;
    const makeParticles = async () => {
      await Promise.race([globeReady, new Promise((r) => setTimeout(r, 400))]);
      const img = g.getImageData(0, 0, cv.width, cv.height).data;
      const step = Math.max(2, Math.round((isFull ? 3 : 4) * dpr));
      const stage = $("#nw-globe").getBoundingClientRect(), cx = stage.left + stage.width / 2 - box.left, cy = stage.top + stage.height / 2 - box.top;
      const targetFor = (row) => {
        const i = lines.findIndex((_, k) => Math.abs(row - lineY(k)) < small);
        const code = i >= 0 ? lines[i].geo?.[0] : lines[Math.floor(Math.random() * lines.length)]?.geo?.[0];
        const p = code && globe?.project(code);
        if (p && p.visible) return { x: p.x - box.left, y: p.y - box.top };
        const a = Math.random() * Math.PI * 2, rr = Math.min(stage.width, stage.height) * 0.3 * Math.sqrt(Math.random());
        return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
      };
      parts = [];
      for (let y = 0; y < cv.height; y += step) for (let x = 0; x < cv.width; x += step) {
        const k = (y * cv.width + x) * 4;
        if (img[k + 3] > 120) {
          const px = x / dpr, py = y / dpr, t = targetFor(py);
          parts.push({ x: px, y: py, sx: px, sy: py, tx: t.x + (Math.random() - 0.5) * 8, ty: t.y + (Math.random() - 0.5) * 8, d: Math.random() * 0.35, c: img[k] > 150 && img[k + 2] > 200 && img[k] < 140 ? accent : "#dff3ff", w: (Math.random() - 0.5) * 120 });
          if (parts.length > 9000) break;
        }
      }
    };
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let flyAt = 0, making = false;
    const finish = () => {
      cancelAnimationFrame(raf);
      removeEventListener("keydown", onKey);
      store.set("nw-intro", today);
      nw.classList.add("ready"); nw.classList.remove("intro-on");
      setTimeout(() => { cv.width = cv.height = 0; }, 400);
    };
    const frame = (now) => {
      if (!alive) return;
      if (stop) return finish();
      const t = now - t0;
      if (t < T_TYPE + T_HOLD) { drawText(Math.min(1, t / T_TYPE)); raf = requestAnimationFrame(frame); return; }
      if (!parts) { if (!making) { making = true; drawText(1); makeParticles().then(() => { flyAt = performance.now(); }); } raf = requestAnimationFrame(frame); return; }
      const p = (now - flyAt) / T_FLY;
      if (p >= 1) return finish();
      if (p > 0.55) nw.classList.add("ready");
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      for (const q of parts) {
        const lp = Math.max(0, Math.min(1, (p - q.d * 0.6) / (1 - q.d * 0.6))), e = ease(lp);
        const bend = Math.sin(e * Math.PI) * q.w;
        q.x = q.sx + (q.tx - q.sx) * e + bend * 0.35; q.y = q.sy + (q.ty - q.sy) * e - Math.abs(bend) * 0.25;
        g.globalAlpha = lp < 0.9 ? 0.95 : (1 - lp) * 9;
        g.fillStyle = q.c;
        const s = lp < 0.15 ? 1.6 : 1.1;
        g.fillRect(q.x, q.y, s, s);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // ---------- 주소 ----------
  function route(next) {
    cur = next;
    if (next.sub === "thread" && next.id) showThread(next.id);
    else if (next.sub === "item" && next.id) showItem(next.id);
    else { closePanel(); panelFrom = null; }
  }
  route(r);
  const onEsc = (e) => { if (e.key === "Escape" && nw.classList.contains("panel-on") && !nw.classList.contains("intro-on")) ctx.go("#/news"); };
  addEventListener("keydown", onEsc);
  const refresh = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 5 * 60e3);

  inst = { route };
  return () => {
    alive = false; inst = null;
    removeEventListener("keydown", onEsc); clearInterval(refresh); clearTimeout(hoverT);
    globe?.destroy();
  };
}

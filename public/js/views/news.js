// 뉴스 — 하루 한 호. #/news (오늘) · #/news/<YYYY-MM-DD> · #/news/item/<id>
// 한 줄로 내려 읽는 구성: 위 유리 막대(날짜 · 어제/내일 · 달력) → 헤드라인 → 분야 고르기(전체 · AI · 지정학 · 기술 · 경제) → 기사 목록.
// 기사를 누르면 오른쪽(폰은 아래)에서 유리 시트가 올라와요: 한국어 요약 · 원문 · 별표 · 토론(메모 · 반박 · 동의 · AI 반박).
// 키보드: j/k 다음·이전 기사 · [ ] 어제·내일 · s 별표 · Esc 닫기. 근거: docs/news-design-direction.md (refs.gallery + 애플 유리 재질)
import { api } from "../api.js";
import { esc, toast } from "../util.js";
import { icon } from "../icons.js";

const SECTIONS = [["all", "전체"], ["ai", "AI"], ["geopolitics", "지정학"], ["tech", "기술"], ["economy", "경제"]];
const SEC_KO = Object.fromEntries(SECTIONS);
const kstDay = (t = Date.now()) => new Date(t + 9 * 36e5).toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayKo = (d) => { const x = new Date(d + "T12:00:00+09:00"); return `${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일 ${WEEK[x.getUTCDay()]}요일`; };
const dayShort = (d) => { const x = new Date(d + "T12:00:00+09:00"); return `${x.getUTCMonth() + 1}.${x.getUTCDate()}`; };
const hhmm = (t) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
const when = (it) => (it.dated === 0 ? "새 글" : hhmm(it.published_at));
const strip = (s) => String(s || "").replace(/[\s.。…]+$/g, "").trim();
const sentences = (s) => String(s || "").split(/(?<=[.!?다요])\s+(?=\S)/).map((x) => x.trim()).filter(Boolean);
// 보이는 제목: 한국어 제목 → 한 줄 요약 → 원문 제목
const titleOf = (it) => it.title_ko || it.one_liner || it.title;
const isKo = (s) => /[가-힣]/.test(s || "");
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

let inst = null;
export function update(r) { inst?.route(r); }

export function mount(root, ctx, r) {
  root.innerHTML = `
    <div class="gn" id="gn">
      <div class="gn-aura" aria-hidden="true"><i></i><i></i><i></i></div>
      <main class="gn-scroll" id="gn-scroll" tabindex="-1">
        <header class="gn-bar glass">
          <a class="gn-nav" id="gn-prev" href="#" aria-label="어제">${chev("l")}</a>
          <button class="gn-date" id="gn-date" type="button" aria-haspopup="dialog" aria-expanded="false"><span id="gn-date-t">오늘</span>${chev("d")}</button>
          <a class="gn-nav" id="gn-next" href="#" aria-label="내일">${chev("r")}</a>
        </header>
        <div class="gn-cal glass" id="gn-cal" hidden role="dialog" aria-label="지난 60일"></div>
        <div class="gn-page" id="gn-page"><p class="gn-soft">불러오는 중…</p></div>
      </main>
    </div>`;
  // 기사 시트는 body 에 붙여요 — 앱 껍데기(host · main)가 transform · 흐림을 써서 그 안의 position: fixed 가 화면이 아니라 긴 목록을 기준으로 잡혀요
  const portal = document.createElement("div");
  portal.className = "gn gn-portal";
  portal.innerHTML = `<div class="gn-scrim" id="gn-scrim" hidden></div><aside class="gn-sheet glass" id="gn-sheet" aria-label="기사" hidden></aside>`;
  document.body.append(portal);
  const $ = (s) => root.querySelector(s);
  const page = $("#gn-page"), sheet = portal.querySelector("#gn-sheet"), gn = portal, cal = $("#gn-cal"), scrim = portal.querySelector("#gn-scrim");
  let alive = true, ed = null, list = [], editions = [], cur = null, sec = store.get("gn-sec") || "all", starred = false;
  const user = (id) => ctx.user(id) || { display_name: "?", color: "var(--m0)" };
  const items = new Map();
  const mine = (it) => ({ read: !!it.readers?.includes(ctx.me.id), star: !!it.stars?.includes(ctx.me.id), others: (it.readers || []).filter((u) => u !== ctx.me.id) });
  const avs = (ids) => ids.map((id) => { const u = user(id); return `<i class="gn-av" style="--c:${u.color}" title="${esc(u.display_name)}">${esc((u.display_name || "?")[0])}</i>`; }).join("");

  // ---------- 달력 (위 날짜를 누르면 내려와요) ----------
  async function loadEditions() {
    try { const d = await api.newsEditions(); editions = [...(d.editions || []), ...(d.pending || []).map((p) => ({ day: p.day, items: p.items, status: "pending" }))]; } catch { editions = []; }
  }
  function drawCal() {
    const by = new Map(editions.map((e) => [e.day, e])), today = kstDay(), days = [];
    for (let i = 59; i >= 0; i--) days.push(kstDay(Date.now() - i * 864e5));
    const lead = new Date(days[0] + "T12:00:00+09:00").getUTCDay();
    cal.innerHTML = `<div class="gn-cal-h">지난 60일 <small>진할수록 기사가 많아요</small></div><div class="gn-cal-g">${WEEK.map((w) => `<b>${w}</b>`).join("")}${"<i></i>".repeat(lead)}${days.map((d) => {
      const n = by.get(d)?.items || 0, l = !n ? 0 : n < 6 ? 1 : n < 15 ? 2 : 3;
      return `<a href="#/news/${d}" class="gn-cd l${l}${d === today ? " today" : ""}${ed?.day === d ? " on" : ""}" title="${dayKo(d)}${n ? ` · ${n}편` : ""}">${+d.slice(8)}</a>`;
    }).join("")}</div>`;
  }
  const toggleCal = (open = cal.hidden) => { if (open) { drawCal(); } cal.hidden = !open; $("#gn-date").setAttribute("aria-expanded", open); };

  // ---------- 그날 호 ----------
  async function loadEdition(day) {
    page.innerHTML = `<p class="gn-soft">${day === kstDay() ? "오늘" : dayKo(day)} 신문을 펼치는 중…</p>`;
    try { ed = await api.newsEdition(day === kstDay() ? "today" : day); }
    catch (e) { if (alive) page.innerHTML = `<p class="gn-soft">${esc(e.message)}</p>`; return; }
    if (!alive) return;
    items.clear();
    for (const it of [...(ed.front || []).map((f) => f.item), ...SECTIONS.slice(1).flatMap(([k]) => ed.sections?.[k] || []), ...(ed.late || [])]) if (it && !items.has(it.id)) items.set(it.id, it);
    $("#gn-date-t").textContent = day === kstDay() ? `오늘 · ${dayShort(day)}` : dayKo(day);
    const nav = (el, d) => { el.href = d ? "#/news/" + d : "#"; el.classList.toggle("off", !d); };
    nav($("#gn-prev"), ed.prev); nav($("#gn-next"), ed.next);
    draw();
    $("#gn-scroll").scrollTop = 0;
  }
  const secItems = (k) => {
    const all = k === "all" ? [...items.values()] : (ed.sections?.[k] || []).map((it) => items.get(it.id) || it);
    return all.filter((it) => !starred || mine(it).star).sort((a, b) => b.published_at - a.published_at);
  };
  function row(it) {
    const m = mine(it), t = titleOf(it);
    const sub = sentences(it.summary).find((s) => strip(s) !== strip(t)) || (isKo(t) ? "" : "번역 준비 중이에요");
    return `<li class="gn-item${m.read ? " read" : ""}${cur === it.id ? " on" : ""}" data-id="${it.id}">
      <a class="gn-item-a" href="#/news/item/${it.id}">
        <span class="gn-meta">${m.read ? "" : `<i class="gn-dot" aria-label="안 읽음"></i>`}<span>${esc(it.feed)}</span><span>${when(it)}</span>${sec === "all" && it.section ? `<span class="gn-tag">${SEC_KO[it.section] || ""}</span>` : ""}</span>
        <span class="gn-t"${isKo(t) ? "" : ' lang="en"'}>${esc(t)}</span>
        ${sub ? `<span class="gn-s">${esc(sub)}</span>` : ""}
        ${it.comments || it.disputed || m.others.length ? `<span class="gn-foot">${it.comments ? `<span class="gn-pill">메모 ${it.comments}</span>` : ""}${it.disputed ? `<span class="gn-pill hot">의견 갈림</span>` : ""}<span class="gn-avs">${avs(m.others)}</span></span>` : ""}
      </a>
      <button class="gn-star${m.star ? " on" : ""}" type="button" data-star="${it.id}" aria-pressed="${m.star}" aria-label="별표">${starSvg()}</button>
    </li>`;
  }
  function draw() {
    const shown = secItems(sec);
    list = shown.map((it) => it.id);
    const total = items.size, unread = [...items.values()].filter((it) => !mine(it).read).length;
    const lead = (ed.front || []).find((f) => f.item);
    const head = ed.headline || (lead ? titleOf(lead.item) : "오늘 들어온 소식");
    const showLead = lead && sec === "all" && !starred && strip(titleOf(lead.item)) !== strip(head); // 헤드라인과 같은 문장이면 1면 카드는 빼요
    const counts = Object.fromEntries(SECTIONS.map(([k]) => [k, k === "all" ? total : (ed.sections?.[k] || []).length]));
    const status = ed.status === "closed" ? "마감된 호" : ed.status === "draft" ? "아침판 · 계속 채워져요" : "오늘 밤 11시 10분에 마감돼요";
    page.innerHTML = `
      <section class="gn-hero">
        <p class="gn-kicker">${esc(status)} · ${total}편${unread ? ` · <b>${unread}편 안 읽음</b>` : " · 다 읽었어요"}</p>
        <h1 class="gn-h1">${esc(head)}</h1>
        ${ed.lede ? `<p class="gn-lede">${esc(ed.lede)}</p>` : !showLead && lead?.why ? `<p class="gn-lede">${esc(lead.why)}</p>` : ""}
      </section>
      ${showLead ? `<a class="gn-lead glass" href="#/news/item/${lead.item.id}" data-id="${lead.item.id}">
        <span class="gn-meta"><span class="gn-tag strong">1면</span><span>${esc(lead.item.feed)}</span><span>${when(lead.item)}</span></span>
        <span class="gn-lead-t">${esc(titleOf(lead.item))}</span>
        ${lead.why ? `<span class="gn-lead-why">${esc(lead.why)}</span>` : ""}
      </a>` : ""}
      ${(ed.threads || []).length && sec === "all" && !starred ? `<section class="gn-threads"><h2 class="gn-h2">오늘 움직인 흐름</h2><ul>${ed.threads.map((t) => `<li><b>${esc(t.title)}</b><span>${esc(t.move || "")}</span></li>`).join("")}</ul></section>` : ""}
      <nav class="gn-seg glass" role="tablist" aria-label="분야">${SECTIONS.map(([k, l]) => `<button type="button" role="tab" data-sec="${k}" aria-selected="${sec === k}">${l}<small>${counts[k]}</small></button>`).join("")}<button type="button" class="gn-seg-star" data-starred aria-pressed="${starred}" aria-label="별표만">${starSvg()}</button></nav>
      ${shown.length ? `<ul class="gn-list">${shown.map(row).join("")}</ul>` : `<p class="gn-empty">${starred ? "별표한 기사가 없어요." : sec === "ai" ? "오늘은 아직 AI 소식이 없어요. 매시간 새로 모아요." : "이 분야는 아직 비어 있어요."}</p>`}
      <footer class="gn-end">${unread ? `${unread}편 남았어요` : "오늘 신문은 여기까지예요"}${ed.prev ? ` · <a href="#/news/${ed.prev}">${dayKo(ed.prev)} 신문 보기</a>` : ""}</footer>`;
  }

  // ---------- 기사 시트 ----------
  async function openItem(id) {
    cur = id;
    page.querySelectorAll("[data-id]").forEach((el) => el.classList.toggle("on", el.dataset.id === id));
    sheet.hidden = false; scrim.hidden = false; requestAnimationFrame(() => gn.classList.add("sheet-on"));
    const known = items.get(id);
    sheet.innerHTML = `<div class="gn-sh">${sheetHead()}<p class="gn-soft">여는 중…</p></div>`;
    let d;
    try { d = await api.newsItem(id); } catch (e) { sheet.innerHTML = `<div class="gn-sh">${sheetHead()}<p class="gn-soft">${esc(e.message)}</p></div>`; return; }
    if (!alive || cur !== id) return;
    const it = { ...known, ...d.item, summary: known?.summary || d.item.summary, title_ko: known?.title_ko || d.item.title_ko };
    const t = titleOf(it), sum = sentences(it.summary).filter((s) => strip(s) !== strip(t));
    const star = () => (it.stars || []).includes(ctx.me.id);
    sheet.innerHTML = `<div class="gn-sh">
      ${sheetHead()}
      <span class="gn-meta"><span>${esc(it.feed)}</span><span>${it.dated === 0 ? "날짜 없음" : `${dayShort(kstDay(it.published_at))} ${hhmm(it.published_at)}`}</span>${it.section ? `<span class="gn-tag">${SEC_KO[it.section] || ""}</span>` : ""}</span>
      <h2 class="gn-sh-t">${esc(t)}</h2>
      ${t !== it.title ? `<p class="gn-sh-orig" lang="en">${esc(it.title)}</p>` : ""}
      ${sum.length ? `<section class="gn-card"><h3>요약</h3><ul>${sum.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : `<section class="gn-card"><p class="gn-soft">아직 요약 전이에요. 잠시 뒤에 채워져요.</p></section>`}
      <div class="gn-acts">
        <button class="gn-btn${star() ? " on" : ""}" type="button" id="gn-sh-star" aria-pressed="${star()}">${starSvg()}<span>${star() ? "별표함" : "별표"}</span></button>
        <button class="gn-btn" type="button" id="gn-sh-deep">${d.deep ? "자세히 ✓" : "자세히 읽기"}</button>
        <a class="gn-btn" href="${esc(it.url)}" target="_blank" rel="noopener">원문 ${icon.external(13)}</a>
        <span class="gn-avs" title="읽은 친구">${avs((it.readers || []).filter((u) => u !== ctx.me.id))}</span>
      </div>
      <section class="gn-card" id="gn-deep"${d.deep ? "" : " hidden"}></section>
      <section class="gn-talk"><h3>토론 <small id="gn-talk-n"></small></h3>
        <form class="gn-compose" id="gn-compose"><textarea name="b" rows="2" maxlength="2000" placeholder="내 생각을 한두 줄로 남겨요"></textarea><button class="gn-btn pri" type="submit">메모 남기기</button></form>
        <div id="gn-talk"></div>
      </section>
    </div>`;
    const paintDeep = (deep) => { const el = sheet.querySelector("#gn-deep"); el.hidden = false; el.innerHTML = `<h3>자세히</h3><ul>${(deep.summary || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>${deep.why ? `<p class="gn-why">왜 중요해요? ${esc(deep.why)}</p>` : ""}`; };
    if (d.deep) paintDeep(d.deep);
    sheet.querySelector("#gn-sh-deep").addEventListener("click", async (e) => {
      if (d.deep) return; const b = e.currentTarget; b.disabled = true; b.textContent = "읽는 중…";
      try { const r2 = await api.newsDeep(id); d.deep = r2.deep || r2; paintDeep(d.deep); b.textContent = "자세히 ✓"; }
      catch (err) { toast(err.message, "err"); b.disabled = false; b.textContent = "자세히 읽기"; }
    });
    sheet.querySelector("#gn-sh-star").addEventListener("click", () => toggleStar(id));
    talk(id, d.comments || []);
    if (!(it.readers || []).includes(ctx.me.id)) api.newsMark(id, { read: true }).then(() => { const k = items.get(id); if (k) { k.readers = [...(k.readers || []), ctx.me.id]; repaint(id); } }).catch(() => {});
    sheet.scrollTop = 0;
  }
  const sheetHead = () => `<div class="gn-sh-top"><span class="gn-grab" aria-hidden="true"></span><button class="gn-x" type="button" data-close aria-label="닫기">${icon.x(16)}</button></div>`;
  function closeSheet() {
    cur = null; gn.classList.remove("sheet-on"); scrim.hidden = true;
    setTimeout(() => { if (!cur) sheet.hidden = true; }, 220);
    page.querySelectorAll(".on[data-id]").forEach((el) => el.classList.remove("on"));
  }
  function repaint(id) {
    const it = items.get(id); if (!it) return;
    page.querySelectorAll(`li.gn-item[data-id="${id}"]`).forEach((el) => { const tmp = document.createElement("ul"); tmp.innerHTML = row(it); el.replaceWith(tmp.firstElementChild); });
    const k = page.querySelector(".gn-kicker b"); const n = [...items.values()].filter((x) => !mine(x).read).length;
    if (k) k.textContent = n ? `${n}편 안 읽음` : "다 읽었어요";
  }
  async function toggleStar(id) {
    const it = items.get(id) || { stars: [] }, on = !(it.stars || []).includes(ctx.me.id);
    it.stars = on ? [...(it.stars || []), ctx.me.id] : (it.stars || []).filter((u) => u !== ctx.me.id);
    repaint(id);
    const b = sheet.querySelector("#gn-sh-star"); if (b && cur === id) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.querySelector("span").textContent = on ? "별표함" : "별표"; }
    try { await api.newsMark(id, { flagged: on }); } catch (err) { toast(err.message, "err"); }
  }

  // ---------- 토론 ----------
  function talk(itemId, comments) {
    let all = comments.slice();
    const box = sheet.querySelector("#gn-talk");
    const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 6e4)); return m < 60 ? m + "분 전" : m < 2880 ? Math.round(m / 60) + "시간 전" : Math.round(m / 1440) + "일 전"; };
    const KIND = { memo: "메모", rebut: "반박", agree: "동의" };
    const head = (c, ai) => { const u = user(c.user_id); return ai ? `<i class="gn-av ai">AI</i><b>AI 반박</b><span>${esc(u.display_name)} 요청 · ${ago(c.created_at)}</span>` : `<i class="gn-av" style="--c:${u.color}">${esc((u.display_name || "?")[0])}</i><b>${esc(u.display_name)}</b><span>${KIND[c.stance] || ""} · ${ago(c.created_at)}</span>`; };
    const del = (c) => (c.user_id === ctx.me.id && !c.ai ? `<button class="gn-del" data-del="${c.id}" type="button" aria-label="지우기">${icon.trash(13)}</button>` : "");
    const body = (s) => esc(s).replace(/\n?^&gt; (.+)$\n?/gm, "<q>$1</q>").replace(/\n/g, "<br>");
    const paint = () => {
      const memos = all.filter((c) => !c.parent_id);
      sheet.querySelector("#gn-talk-n").textContent = all.length ? `${all.length}${all.some((c) => c.stance === "rebut") ? " · 의견 갈림" : ""}` : "";
      box.innerHTML = memos.map((m) => {
        const kids = all.filter((c) => c.parent_id === m.id), hasAi = kids.some((k) => k.ai);
        return `<article class="gn-memo" data-id="${m.id}"><header>${head(m)}${del(m)}</header><p>${body(m.body)}</p>
          <div class="gn-memo-acts"><button type="button" class="gn-chip r" data-reply="rebut">반박</button><button type="button" class="gn-chip g" data-reply="agree">동의</button>${hasAi ? "" : `<button type="button" class="gn-chip" data-ai="${m.id}">AI 반박 받기</button>`}</div>
          ${kids.map((k) => `<div class="gn-reply ${k.stance}${k.ai ? " ai" : ""}"><header>${head(k, k.ai)}${del(k)}</header><p>${body(k.body)}</p></div>`).join("")}</article>`;
      }).join("") || `<p class="gn-soft">아직 메모가 없어요.</p>`;
    };
    const sync = () => { const it = items.get(itemId); if (!it) return; it.comments = all.length; it.disputed = all.some((c) => c.stance === "rebut"); repaint(itemId); };
    paint();
    sheet.querySelector("#gn-compose").addEventListener("submit", async (e) => {
      e.preventDefault(); const ta = e.target.b, b = ta.value.trim(); if (!b) return; ta.disabled = true;
      try { const { comment } = await api.newsComment(itemId, { body: b }); all.push(comment); ta.value = ""; paint(); sync(); } catch (err) { toast(err.message, "err"); }
      ta.disabled = false;
    });
    box.addEventListener("click", async (e) => {
      const memo = e.target.closest(".gn-memo"), rep = e.target.closest("[data-reply]");
      if (rep && memo) {
        memo.querySelector(".gn-rform")?.remove();
        const stance = rep.dataset.reply;
        memo.insertAdjacentHTML("beforeend", `<form class="gn-rform ${stance}"><textarea rows="2" maxlength="2000" placeholder="${stance === "rebut" ? "어디가 틀렸나요?" : "어디가 맞나요?"}"></textarea><button class="gn-btn" type="submit">${stance === "rebut" ? "반박하기" : "동의하기"}</button></form>`);
        const f = memo.querySelector(".gn-rform"); f.querySelector("textarea").focus();
        f.addEventListener("submit", async (ev) => {
          ev.preventDefault(); const b = f.querySelector("textarea").value.trim(); if (!b) return;
          try { const { comment } = await api.newsComment(itemId, { body: b, stance, parent_id: memo.dataset.id }); all.push(comment); paint(); sync(); } catch (err) { toast(err.message, "err"); }
        });
        return;
      }
      const ai = e.target.closest("[data-ai]");
      if (ai) { ai.disabled = true; ai.textContent = "기사 읽는 중…"; try { const { comment } = await api.newsAiRebut(ai.dataset.ai); all.push(comment); paint(); sync(); } catch (err) { toast(err.message, "err"); ai.disabled = false; ai.textContent = "AI 반박 받기"; } return; }
      const d = e.target.closest("[data-del]");
      if (d) { try { await api.newsDelComment(d.dataset.del); all = all.filter((c) => c.id !== d.dataset.del && c.parent_id !== d.dataset.del); paint(); sync(); } catch (err) { toast(err.message, "err"); } }
    });
  }

  // ---------- 이벤트 ----------
  const back = () => ctx.go(ed && ed.day !== kstDay() ? "#/news/" + ed.day : "#/news");
  const onClick = (e) => {
    const s = e.target.closest("[data-star]"); if (s) { e.preventDefault(); toggleStar(s.dataset.star); return; }
    if (e.target.closest("[data-close]") || e.target === scrim) { e.preventDefault(); back(); return; }
    const b = e.target.closest("[data-sec]"); if (b) { sec = b.dataset.sec; store.set("gn-sec", sec); draw(); return; }
    if (e.target.closest("[data-starred]")) { starred = !starred; draw(); return; }
    if (e.target.closest("#gn-date")) { toggleCal(); return; }
    if (e.target.closest(".gn-nav.off")) { e.preventDefault(); return; }
    if (!cal.hidden && !e.target.closest("#gn-cal")) toggleCal(false);
  };
  root.addEventListener("click", onClick);
  portal.addEventListener("click", onClick);
  const onKey = (e) => {
    if (e.target.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = cur ? list.indexOf(cur) : -1;
    if (e.key === "j" || e.key === "k") { const n = list[e.key === "j" ? i + 1 : Math.max(0, i - 1)]; if (n) { e.preventDefault(); ctx.go("#/news/item/" + n); } }
    else if (e.key === "[" && ed?.prev) ctx.go("#/news/" + ed.prev);
    else if (e.key === "]" && ed?.next) ctx.go("#/news/" + ed.next);
    else if (e.key === "s" && cur) toggleStar(cur);
    else if (e.key === "Escape") { if (!cal.hidden) toggleCal(false); else if (cur) back(); }
  };
  document.addEventListener("keydown", onKey);

  async function route(rr) {
    toggleCal(false);
    if (rr.sub === "item" && rr.id) { if (!ed) await loadEdition(store.get("gn-day") || kstDay()); openItem(rr.id); return; }
    const day = rr.day && DAY_RE.test(rr.day) ? rr.day : kstDay();
    store.set("gn-day", day);
    if (cur) closeSheet();
    if (!ed || ed.day !== day) await loadEdition(day);
  }
  inst = { route };
  loadEditions();
  route(r);
  api.newsSeen?.().catch(() => {});
  return () => { alive = false; inst = null; document.removeEventListener("keydown", onKey); portal.remove(); };
}

function chev(dir) {
  const d = { l: "M14.5 5.5 8 12l6.5 6.5", r: "M9.5 5.5 16 12l-6.5 6.5", d: "M6.5 9.5 12 15l5.5-5.5" }[dir];
  return `<svg viewBox="0 0 24 24" width="${dir === "d" ? 14 : 18}" height="${dir === "d" ? 14 : 18}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
function starSvg() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.6l-5.1 2.6 1-5.6-4.1-4 5.7-.8z" fill="currentColor"/></svg>`;
}

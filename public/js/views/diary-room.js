// 일기 — 일기 친구끼리 같이 보는 일기 페이지 (#/diary). 일기 친구 = 아이디로 초대하고 상대가 수락한 사람 — 서버도 친구가 아니면 막아요(403).
// 위: ‹ 날짜 › · [내 일기 | 친구 일기 …] 탭 · 받은 초대(수락 · 거절). 내 일기는 쓰기(기분 + 글 + 공개/비공개, 자동 저장), 친구 일기는 읽기만 — 비공개 날은 자물쇠만.
// 옆: '일기 친구' 칸 — 아이디로 초대 · 보낸 초대 취소 · 친구 끊기.
// 탭 아래: 그 사람의 올해 잔디(비공개 날은 자물쇠 칸) · 옆: 지난 일기. 주소: #/diary/<날짜> · #/diary/u/<사람 id>/<날짜>
import { api } from "../api.js";
import { $, esc, ymd, parseYmd, addDays, today, DOW, toast } from "../util.js";
import { icon } from "../icons.js";
import { mountDiary, renderDiaryRead, MOODS } from "../diary.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_KEY = "trio-diary-friends-note"; // 처음 열 때 안내를 닫았는지 (이 기기에만)
const longDate = (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
const shortDate = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
const moodChip = (v) => { const m = MOODS.find((x) => x.v === v); return m ? `<span class="chip">${esc(m.label)}</span>` : ""; };
const lockChip = (t = "비공개") => `<span class="chip dr-lockchip">${icon.lock(11)}${t}</span>`;
// 목록 · 글자 수용 글: 마크다운 사진 · 태그 · 기호를 빼요
const plainText = (s) => (s || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<[^>]+>/g, "").replace(/[*_~`#>]+/g, "").replace(/\s+/g, " ").trim();
const noteOff = () => { try { return localStorage.getItem(NOTE_KEY) === "1"; } catch { return false; } };

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  const me = ctx.me.id, todayStr = ymd(today());
  let who = r.who || me, day = DAY_RE.test(r.day || "") ? r.day : todayStr, members = null, invites = { incoming: [], outgoing: [] }, stopEditor = null, stopRead = null, alive = true;
  const nameOf = (id) => { const u = members?.find((m) => m.id === id) || ctx.user(id); return u?.display_name || u?.username || "친구"; };
  const href = (w, d) => (w === me ? `#/diary/${d}` : `#/diary/u/${encodeURIComponent(w)}/${d}`);
  root.innerHTML = `<div class="dy dr"><p class="faint">불러오는 중…</p></div>`;

  const nm = (u) => esc(u.display_name || u.username);
  // 일기 친구 칸: 친구(끊기) · 보낸 초대(취소) · 아이디로 초대
  const friendsCard = (others) => `<section class="dy-card glass dr-friends" id="dr-friends"><h2>일기 친구</h2>
      <p class="faint dr-fr-sub">서로 수락한 친구는 내가 '공개'로 둔 날의 일기를 지난 날까지 모두 볼 수 있어요.</p>
      <ul class="dr-fr-list">${others.map((m) => `<li><span class="dr-fr-n">${nm(m)}<small>@${esc(m.username)}</small></span><button type="button" class="btn sm ghost" data-unlink="${esc(m.id)}" data-name="${nm(m)}">끊기</button></li>`).join("")}
        ${invites.outgoing.map((m) => `<li class="wait"><span class="dr-fr-n">${nm(m)}<small>@${esc(m.username)} · 수락 기다리는 중</small></span><button type="button" class="btn sm ghost" data-unlink="${esc(m.id)}">취소</button></li>`).join("")}
        ${others.length || invites.outgoing.length ? "" : `<li class="faint">아직 일기 친구가 없어요. 아이디로 초대해 보세요.</li>`}</ul>
      <form class="dr-invite" id="dr-invite"><input class="input" id="dr-invite-in" name="username" maxlength="20" placeholder="친구 아이디 (예: gyk)" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="초대할 친구 아이디" required><button class="btn sm accent" id="dr-invite-b">초대</button></form>
    </section>`;

  function shell() {
    const others = members.filter((m) => m.id !== me);
    root.innerHTML = `
      <div class="dy dr">
        <header class="dy-top">
          <div class="dy-when"><span class="eyebrow">일기 · ${esc(members.map((m) => (m.username || "").toUpperCase()).join(" · "))}</span><h1 class="dy-date" id="dr-date"></h1></div>
          <div class="pager">
            <a class="icon-btn sm" id="dr-prev" aria-label="전날 일기">${icon.left(16)}</a>
            <a class="btn sm ghost" id="dr-today">오늘</a>
            <a class="icon-btn sm" id="dr-next" aria-label="다음날 일기">${icon.right(16)}</a>
          </div>
        </header>
        <nav class="dr-tabs" role="tablist" aria-label="누구의 일기">
          <a role="tab" data-who="${esc(me)}">내 일기</a>${others.map((m) => `<a role="tab" data-who="${esc(m.id)}">${nm(m)} 일기</a>`).join("")}
          <button type="button" class="dr-add" data-invite-go>${icon.plus(13)}일기 친구</button>
        </nav>
        ${invites.incoming.map((m) => `<div class="dr-inv glass" role="status"><p><b>${nm(m)}</b><span class="faint"> @${esc(m.username)}</span> 님이 일기 친구 초대를 보냈어요. 수락하면 서로 '공개'로 둔 날의 일기를 지난 날까지 볼 수 있어요.</p><div class="dr-inv-acts"><button type="button" class="btn sm accent" data-accept="${esc(m.id)}">수락</button><button type="button" class="btn sm ghost" data-unlink="${esc(m.id)}">거절</button></div></div>`).join("")}
        ${noteOff() ? "" : `<div class="dr-note glass" role="note"><p><b>일기는 초대해서 이어진 친구끼리만 서로 볼 수 있어요.</b> 아이디로 초대하고 상대가 수락하면, 서로 '공개'로 둔 날의 일기를 (지난 날까지) 읽어요. 같은 팀이어도 초대 없이는 못 봐요. 힘든 날은 '비공개'로 — 친구에겐 자물쇠만 보여요. 언제든 끊을 수 있어요.</p><button type="button" class="icon-btn sm" data-note-x aria-label="안내 닫기">${icon.x(14)}</button></div>`}
        <section class="dy-card glass dr-year"><h2 class="dy-h2" id="dr-grass-h">올해</h2><div id="dr-grass"><p class="faint">불러오는 중…</p></div></section>
        <div class="dy-cols">
          <section class="dy-paper glass" id="dr-paper" aria-live="polite"></section>
          <aside class="dy-side">
            ${friendsCard(others)}
            <section class="dy-card glass"><h2>지난 일기</h2><ul class="dy-list" id="dr-list"><li class="faint">불러오는 중…</li></ul></section>
          </aside>
        </div>
      </div>`;
    root.querySelector("[data-note-x]")?.addEventListener("click", (e) => { try { localStorage.setItem(NOTE_KEY, "1"); } catch {} e.currentTarget.closest(".dr-note").remove(); });
    root.querySelector("[data-invite-go]").addEventListener("click", () => { const i = $("#dr-invite-in", root); i.scrollIntoView({ block: "center", behavior: "smooth" }); i.focus({ preventScroll: true }); });
    $("#dr-invite", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const i = $("#dr-invite-in", root), b = $("#dr-invite-b", root), name = i.value.trim().toLowerCase();
      if (!name) return;
      b.disabled = true;
      try { const r = await api.diaryInvite(name); toast(r.accepted ? `@${name} 님도 나를 초대해 둬서 바로 이어졌어요` : r.locked ? `@${name} 님에게 초대를 보냈어요 · 아직 일기가 잠겨 있어서, 열리면 초대가 보여요` : `@${name} 님에게 초대를 보냈어요 · 수락하면 이어져요`); await load(); }
      catch (x) { b.disabled = false; toast(x.message || "초대하지 못했어요.", "err"); }
    });
    root.querySelectorAll("[data-accept]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api.diaryAccept(b.dataset.accept); toast("일기 친구가 됐어요"); await load(); } catch (x) { b.disabled = false; toast(x.message || "수락하지 못했어요.", "err"); }
    }));
    root.querySelectorAll("[data-unlink]").forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.name && !confirm(`${b.dataset.name} 님과 일기 친구를 끊을까요? 서로의 일기를 더는 볼 수 없어요.`)) return;
      b.disabled = true;
      try { await api.diaryUnlink(b.dataset.unlink); await load(); } catch (x) { b.disabled = false; toast(x.message || "하지 못했어요.", "err"); }
    }));
  }

  // 가운데: 내 일기는 편집기, 상대 일기는 읽기 (공개 → 기분 · 글, 비공개 → 자물쇠, 안 씀 → 빈 칸)
  async function drawPaper() {
    stopEditor?.(); stopEditor = null; stopRead?.(); stopRead = null;
    const paper = $("#dr-paper", root);
    if (who === me) {
      const partners = members.filter((m) => m.id !== me).map((m) => m.display_name || m.username).join(" · ");
      stopEditor = mountDiary(paper, day, { rows: 18, share: partners, onSaved: () => { drawSide(); ctx.changed?.("diary"); } });
      return;
    }
    paper.innerHTML = `<p class="faint">불러오는 중…</p>`;
    const d0 = day, w0 = who;
    try {
      const { diary } = await api.diaryOf(who, day);
      if (!alive || d0 !== day || w0 !== who) return;
      const name = esc(nameOf(who));
      paper.innerHTML = !diary ? `<div class="dr-empty"><b>이날 ${name}님은 일기를 쓰지 않았어요.</b></div>`
        : diary.private ? `<div class="dr-lock">${icon.lock(28)}<b>비공개로 둔 날이에요</b><p class="faint">${name}님이 이날 일기를 비공개로 두었어요.</p></div>`
        : `<article class="dr-read"><div class="dr-read-top">${moodChip(diary.mood)}<span class="faint">${plainText(diary.body).length.toLocaleString()}자</span></div><div class="dr-read-doc"></div></article>`;
      const rd = paper.querySelector(".dr-read-doc"); if (rd) stopRead = renderDiaryRead(rd, diary);
    } catch (e) { paper.innerHTML = `<p class="faint">${esc(e.message || "불러오지 못했어요.")}</p>`; }
  }

  // 위: 그 사람의 올해 잔디 (비공개 날은 자물쇠 칸) · 옆: 지난 일기
  async function drawSide() {
    const year = +day.slice(0, 4), w0 = who;
    $("#dr-grass-h", root).textContent = `${year}년 · ${who === me ? "내 일기" : nameOf(who) + " 일기"}`;
    try {
      const [{ days }, { entries }] = await Promise.all([api.diaryOfDays(who, String(year)), api.diaryOfList(who)]);
      if (!alive || w0 !== who) return;
      const map = new Map(days.map((x) => [x.day, x]));
      const jan1 = new Date(year, 0, 1), start = addDays(jan1, -jan1.getDay());
      let cells = "";
      for (let wk = 0; wk < 54; wk++) for (let k = 0; k < 7; k++) {
        const dt = addDays(start, wk * 7 + k);
        if (dt.getFullYear() !== year) continue;
        const ds = ymd(dt), x = map.get(ds), fut = ds > todayStr;
        const cls = !x ? "" : x.private ? " lock" : ` m${x.mood || 0}${x.shared === false ? " priv" : ""}`;
        const tip = `${shortDate(ds)}${!x ? "" : x.private ? " · 비공개" : x.shared === false ? " · 비공개 (나만)" : ""}`;
        cells += fut ? `<span class="g fut" style="grid-column:${wk + 1};grid-row:${k + 1}"></span>`
          : `<a class="g${cls}${ds === day ? " sel" : ""}" href="${href(who, ds)}" style="grid-column:${wk + 1};grid-row:${k + 1}" title="${tip}" aria-label="${tip}"></a>`;
      }
      $("#dr-grass", root).innerHTML = `<div class="dr-grass-wrap"><div class="dr-grass">${cells}</div></div><p class="dr-key faint"><i class="g m3"></i>쓴 날 <i class="g ${who === me ? "m3 priv" : "lock"}"></i>비공개${who === me ? " (나만)" : ""}</p>`;
      $("#dr-list", root).innerHTML = entries.length ? entries.slice(0, 30).map((e) => `<li><a href="${href(who, e.day)}" ${e.day === day ? 'aria-current="page"' : ""}><b>${esc(shortDate(e.day))}</b>${e.private ? lockChip() : `${moodChip(e.mood)}${e.shared === false ? lockChip("나만") : ""}<span class="sn">${esc(plainText(e.snippet).slice(0, 70))}</span>`}</a></li>`).join("")
        : `<li class="faint">${who === me ? "아직 쓴 일기가 없어요." : "아직 볼 수 있는 일기가 없어요."}</li>`;
    } catch (e) { $("#dr-grass", root).innerHTML = `<p class="faint">${esc(e.message || "불러오지 못했어요.")}</p>`; }
  }

  function open() {
    const dt = parseYmd(day);
    $("#dr-date", root).textContent = longDate(dt);
    root.querySelectorAll("[data-who]").forEach((a) => { const on = a.dataset.who === who; a.href = href(a.dataset.who, day); a.setAttribute("aria-selected", String(on)); });
    $("#dr-prev", root).href = href(who, ymd(addDays(dt, -1)));
    $("#dr-next", root).href = href(who, ymd(addDays(dt, 1)));
    $("#dr-today", root).href = href(who, todayStr);
    $("#dr-next", root).toggleAttribute("aria-disabled", day >= todayStr);
    drawPaper(); drawSide();
    if (who === me) setTimeout(() => root.querySelector(".diary-text")?.focus({ preventScroll: true }), 60);
  }

  // 나 + 일기 친구 · 받은/보낸 초대를 읽고 화면을 다시 그려요 (쓰던 일기는 편집기를 닫을 때 먼저 저장돼요)
  async function load() {
    const c = await api.diaryCircle();
    if (!alive) return;
    members = c.members; invites = c.invites || { incoming: [], outgoing: [] };
    if (!members.some((m) => m.id === who)) who = me; // 친구가 아닌 사람 주소면 내 일기로
    shell(); open();
  }
  const start = () => load().catch((e) => {
    if (!alive) return;
    root.innerHTML = e?.status === 403
      ? `<div class="dy dr"><div class="dr-blocked glass">${icon.lock(28)}<b>이 일기 페이지는 일기 기능이 열린 사람만 쓸 수 있어요.</b><a class="btn sm" href="#/calendar/diary/${todayStr}">내 일기 쓰기</a></div></div>`
      : `<div class="dy dr"><div class="dr-blocked glass"><b>일기를 불러오지 못했어요.</b><p class="faint">${esc(e?.message || "")}</p><button type="button" class="btn sm" data-retry>다시 불러오기</button></div></div>`;
    root.querySelector("[data-retry]")?.addEventListener("click", () => { root.innerHTML = `<div class="dy dr"><p class="faint">불러오는 중…</p></div>`; start(); });
  });
  start();

  inst = {
    update(rr) {
      if (!members) return;
      const w = rr.who && members.some((m) => m.id === rr.who) ? rr.who : me, d = DAY_RE.test(rr.day || "") ? rr.day : todayStr;
      if (w === who && d === day) return;
      who = w; day = d; open();
    },
  };
  return () => { alive = false; stopEditor?.(); stopRead?.(); inst = null; };
}

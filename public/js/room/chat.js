// 대화 탭: 셋이 같이 쓰는 방 하나. 3초(보일 때) · 30초(숨겨질 때) 폴링, @이름 으로 AI 부르기.
import { api } from "../api.js";
import { keepDraft } from "../draft.js";
import { live } from "../live.js";
import { $, esc, toast } from "../util.js";
import { icon } from "../icons.js";
import { renderMarkdown } from "../md.js";
import { richText, firstUrl, timeOf, dayKey, dayLabel, thumbHTML, KIND_LABEL, armDelete, avatar } from "./shared.js";

const GROUP_GAP = 5 * 60 * 1000; // 같은 사람이 5분 안에 이어 쓰면 한 묶음
const NEAR = 120;                 // 바닥에서 이만큼 안쪽이면 "바닥에 있다" 고 봐요

// env: { ctx, getAiName(), onAiName(name), toLibrary(url), viewItem(id), getRoom(), onRoomInfo(r) }
// 방은 'all'(우리 셋) 또는 'dm:<id>:<id>'. setRoom() 으로 바꾸면 목록을 비우고 새로 받아요.
export function mountChat(el, env) {
  const { ctx } = env;
  const S = { msgs: new Map(), since: null, unreadFrom: null, aiErr: null, busy: false, pendingRead: false, timer: null, alive: true };

  el.innerHTML = `
    <div class="rm-chat">
      <div class="rm-list" id="rm-list" tabindex="0" aria-label="메시지">
        <div class="rm-msgs" id="rm-msgs"><p class="faint rm-loading">불러오는 중…</p></div>
      </div>
      <button class="rm-newpill" id="rm-newpill" type="button" hidden>새 메시지 ↓</button>
      <div class="rm-typing" id="rm-typing" hidden aria-live="polite"><span class="rm-ai-av">${icon.spark(13)}</span><span id="rm-typing-t"></span><i class="typing"><span></span><span></span><span></span></i></div>
      <form class="rm-compose" id="rm-compose" autocomplete="off">
        <div class="rm-chip" id="rm-chip" hidden role="listbox" aria-label="부를 사람"><span id="rm-chip-list"></span><span class="faint">Tab · ↑↓ 로 고르기</span></div>
        <div class="rm-compose-box">
          <textarea id="rm-ta" rows="1" placeholder="메시지… Enter 보냄 · Shift+Enter 줄바꿈" aria-label="메시지 입력" maxlength="2000"></textarea>
          <button class="btn ghost sm rm-call" type="button" id="rm-call" title="AI 이름을 넣어 불러요">${icon.spark(13)}AI 부르기</button>
          <button class="btn ghost sm rm-bell" type="button" id="rm-bell" hidden title="새 메시지가 오면 이 기기에 알림을 보내요">🔔 알림 켜기</button>
          <button class="btn accent sm" type="submit" id="rm-send">보내기</button>
        </div>
      </form>
    </div>`;

  // ---------- 푸시 알림 켜기 (기기마다 한 번) ----------
  (async () => {
    const bell = el.querySelector("#rm-bell");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    let key = null; try { key = (await api.pushKey()).key; } catch {}
    if (!key) return;
    const reg = await navigator.serviceWorker.ready.catch(() => null); if (!reg) return;
    const cur = await reg.pushManager.getSubscription().catch(() => null);
    const draw = (on) => { bell.hidden = false; bell.textContent = on ? "🔔 알림 켜짐" : "🔔 알림 켜기"; bell.dataset.on = on ? "1" : ""; bell.title = on ? "이 기기에 새 메시지 알림이 와요 · 누르면 꺼요" : "새 메시지가 오면 이 기기에 알림을 보내요"; };
    draw(!!cur && Notification.permission === "granted");
    if (cur && Notification.permission === "granted") { try { await api.pushSubscribe(cur.toJSON()); } catch {} } // 서버에 다시 등록(비밀번호 초기화 등으로 지워졌을 수 있어요)
    const toKey = (b64) => { const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
    bell.addEventListener("click", async () => {
      try {
        if (bell.dataset.on) { const sub = await reg.pushManager.getSubscription(); if (sub) { await api.pushUnsubscribe({ endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } draw(false); toast("이 기기의 알림을 껐어요."); return; }
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return toast("브라우저에서 알림을 허용해 주어야 해요.", "err");
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
        await api.pushSubscribe(sub.toJSON()); draw(true); toast("새 메시지가 오면 이 기기로 알림이 와요.");
      } catch (e) { toast(e.message || "알림을 켜지 못했어요.", "err"); }
    });
  })();
  const list = $("#rm-list", el), msgsEl = $("#rm-msgs", el), pill = $("#rm-newpill", el), typing = $("#rm-typing", el), ta = $("#rm-ta", el), chip = $("#rm-chip", el), chipList = $("#rm-chip-list", el);

  const me = () => ctx.me.id;
  const room = () => env.getRoom?.() || "all";
  const aiName = () => env.getAiName() || "마피아";
  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < NEAR;
  const toBottom = () => { list.scrollTop = list.scrollHeight; pill.hidden = true; };
  const visible = () => document.visibilityState === "visible" && S.alive;
  const sorted = () => [...S.msgs.values()].sort((a, b) => a.created_at - b.created_at || String(a.id).localeCompare(String(b.id)));
  const mentionNames = () => ({ others: ctx.users.filter((u) => u.id !== ctx.me.id).map((u) => u.display_name), me: ctx.me.display_name });
  const mentions = (body) => {
    const n = aiName().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`@ai(?![\\p{L}\\p{N}_])|@${n}|(^|\\s)${n}[,!?\\s]`, "iu").test(body);
  };

  // ---------- 그리기 ----------
  function msgHTML(m, prev) {
    const mine = m.user_id && m.user_id === me();
    if (m.kind === "system") return `<div class="rm-sys" data-id="${esc(m.id)}"><span>${esc(m.body)}</span></div>`;
    const cont = !!prev && prev.kind !== "system" && prev.user_id === m.user_id && (prev.kind === "ai") === (m.kind === "ai")
      && dayKey(prev.created_at) === dayKey(m.created_at) && m.created_at - prev.created_at < GROUP_GAP;
    const ai = m.kind === "ai";
    const who = ai ? aiName() : (ctx.user(m.user_id)?.display_name || "나간 사람");
    const av = ai ? `<span class="rm-ai-av" aria-hidden="true">${icon.spark(14)}</span>` : avatar(ctx.user(m.user_id), "sm");
    const url = !ai && m.kind === "text" ? firstUrl(m.body) : null;
    let body;
    if (ai) body = `<div class="rm-bubble md rm-md">${renderMarkdown(m.body)}</div>`;
    else if (m.kind === "share") body = shareHTML(m);
    else body = `<div class="rm-bubble">${richText(m.body, aiName(), mentionNames())}</div>`;
    const tools = [
      url ? `<button type="button" class="icon-btn sm" data-lib="${esc(url)}" aria-label="창고에 넣기" title="창고에 넣기">${icon.plus(14)}</button>` : "",
      mine ? `<button type="button" class="icon-btn sm danger" data-del="${esc(m.id)}" aria-label="지우기" title="지우기">${icon.trash(14)}</button>` : "",
    ].join("");
    const err = S.aiErr && S.aiErr.message_id === m.id ? `<div class="rm-aierr">AI가 답하지 못했어요 · <button type="button" class="linkbtn" data-retry="${esc(m.id)}">다시 시도</button></div>` : "";
    return `<article class="rm-msg ${mine ? "mine" : ai ? "ai" : "theirs"}${cont ? " cont" : ""}" data-id="${esc(m.id)}" title="${esc(timeOf(m.created_at))}">
      <div class="rm-av">${cont ? "" : av}</div>
      <div class="rm-body">
        ${cont ? "" : `<header class="rm-who"><b>${esc(who)}</b><time>${esc(timeOf(m.created_at))}</time></header>`}
        <div class="rm-line">${body}${tools ? `<span class="rm-tools">${tools}</span>` : ""}</div>
        ${err}
      </div>
    </article>`;
  }
  function shareHTML(m) {
    const it = m.item;
    if (!it) return `<div class="rm-bubble faint">${richText(m.body, aiName(), mentionNames())}</div>`;
    return `<div class="rm-share" data-item="${esc(it.id)}">
      <span class="rm-share-th">${thumbHTML(it.thumb, "", it.kind, "rm-share-img")}</span>
      <span class="rm-share-t">
        <span class="rm-share-k">${esc(KIND_LABEL[it.kind] || it.kind)}</span>
        ${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>` : `<b>${esc(it.title)}</b>`}
        <button type="button" class="linkbtn" data-view="${esc(it.id)}">창고에서 보기</button>
      </span>
    </div>`;
  }
  function render() {
    const arr = sorted();
    if (!arr.length) {
      msgsEl.innerHTML = `<div class="rm-empty"><span class="rm-ai-av lg">${icon.spark(18)}</span><p><b>아직 메시지가 없어요.</b><br>첫 인사를 남겨 보세요. <b>@${esc(aiName())}</b> 를 부르면 AI가 끼어들어요.</p></div>`;
      return;
    }
    const stick = nearBottom();
    const top = list.scrollTop;
    let html = "", prev = null;
    for (const m of arr) {
      if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) { html += `<div class="rm-day"><span>${esc(dayLabel(m.created_at))}</span></div>`; prev = null; }
      if (S.unreadFrom && m.id === S.unreadFrom) html += `<div class="rm-day new"><span>여기부터 새 메시지</span></div>`;
      html += msgHTML(m, prev);
      prev = m;
    }
    msgsEl.innerHTML = html;
    list.scrollTop = stick ? list.scrollHeight : top;
  }

  // ---------- 읽음 ----------
  async function markRead() {
    if (!S.pendingRead || !visible() || !nearBottom()) return;
    S.pendingRead = false;
    try { await api.readRoom(Date.now(), room()); ctx.changed("room"); } catch {}
  }

  // ---------- 폴링 ----------
  function merge(r, { first = false } = {}) {
    const incoming = r.messages || [];
    if (r.ai_name) env.onAiName(r.ai_name);
    env.onRoomInfo?.(r);
    let fresh = 0, others = 0;
    for (const m of incoming) { if (!S.msgs.has(m.id)) { fresh++; if (m.user_id !== me()) others++; } S.msgs.set(m.id, m); }
    const maxAt = incoming.reduce((a, m) => Math.max(a, m.created_at || 0), 0);
    S.since = r.now || Math.max(S.since || 0, maxAt) || S.since;
    if (first) {
      const nonMine = sorted().filter((m) => m.user_id !== me());
      const n = Math.min(Number(r.unread) || 0, nonMine.length);
      if (n > 0) { S.unreadFrom = nonMine[nonMine.length - n].id; S.pendingRead = true; }
      render(); toBottom(); markRead();
      return;
    }
    if (!fresh) return;
    const stick = nearBottom();
    if (others) {
      S.pendingRead = true;
      if (!stick && !S.unreadFrom) S.unreadFrom = sorted().find((m) => m.user_id !== me() && incoming.some((x) => x.id === m.id))?.id || null;
    }
    render();
    if (stick) { toBottom(); markRead(); } else if (others) pill.hidden = false;
  }
  async function poll(first = false) {
    if (!S.alive) return;
    clearTimeout(S.timer);
    const rid = room();
    try { const r = await api.room(first ? undefined : S.since, undefined, rid); if (rid !== room()) return; merge(r, { first }); }
    catch (e) { if (first) msgsEl.innerHTML = `<p class="faint rm-loading">${esc(e.message || "불러오지 못했어요.")} <button type="button" class="linkbtn" id="rm-retry">다시 시도</button></p>`; }
    if (!S.alive) return;
    // 실시간 연결이 살아 있으면 폴링은 예비로만 (20초), 끊겼으면 예전처럼 3초
    S.timer = setTimeout(() => poll(), document.visibilityState !== "visible" ? 30000 : live.open ? 20000 : 3000);
  }
  const onVis = () => { if (document.visibilityState === "visible") { poll(); markRead(); } };
  document.addEventListener("visibilitychange", onVis);
  const onPing = () => { if (S.alive) { clearTimeout(S.timer); poll(); } }; // 푸시가 "새 메시지" 라고 깨우면 바로 받아요
  window.addEventListener("room-ping", onPing);
  const onLive = (e) => { if (S.alive && e.detail?.room === room()) { clearTimeout(S.timer); poll(); } else if (S.alive) env.onOtherRoom?.(e.detail?.room); };
  window.addEventListener("room-live", onLive);

  // ---------- 보내기 ----------
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; };
  async function send() {
    const body = ta.value.trim();
    if (!body || S.busy) return;
    S.busy = true; $("#rm-send", el).disabled = true;
    const callsAi = mentions(body);
    if (callsAi) { $("#rm-typing-t", el).textContent = `${aiName()}가 쓰는 중…`; typing.hidden = false; }
    ta.value = ""; draft.clear(); grow(); chip.hidden = true;
    try {
      const r = await api.sendRoom({ body, room: room() });
      if (r.message) S.msgs.set(r.message.id, r.message);
      if (r.ai) S.msgs.set(r.ai.id, r.ai);
      S.aiErr = r.ai_error && r.message ? { message_id: r.message.id, text: r.ai_error } : null;
      render(); toBottom();
    } catch (e) { toast(e.message || "보내지 못했어요.", "err"); ta.value = body; grow(); }
    finally { S.busy = false; typing.hidden = true; if (el.isConnected) { $("#rm-send", el).disabled = false; ta.focus(); } }
  }
  async function retryAi(id) {
    $("#rm-typing-t", el).textContent = `${aiName()}가 쓰는 중…`; typing.hidden = false;
    try { const { ai } = await api.retryRoomAi(id, room()); if (ai) S.msgs.set(ai.id, ai); S.aiErr = null; render(); toBottom(); }
    catch (e) { toast(e.message || "AI가 또 답하지 못했어요.", "err"); }
    finally { typing.hidden = true; }
  }

  // @ 자동완성: 캐럿 앞이 "@" 나 "@이" 면 이 방에서 부를 수 있는 사람(친구 + AI) 후보를 보여요
  const peers = () => { const r = room(); const ids = r.startsWith("dm:") ? r.slice(3).split(":") : ctx.users.map((u) => u.id); return ctx.users.filter((u) => u.id !== ctx.me.id && ids.includes(u.id)); };
  const candidates = () => [...peers().map((u) => ({ name: u.display_name, color: u.color, kind: "friend" })), { name: aiName(), kind: "ai" }];
  let sugg = [], suggI = 0;
  function atMatch() {
    const before = ta.value.slice(0, ta.selectionStart);
    const m = /(^|\s)@([^\s@]*)$/.exec(before);
    if (!m) return null;
    const q = m[2].toLowerCase();
    const list = candidates().filter((c) => !q || c.name.toLowerCase().startsWith(q) || (c.kind === "ai" && "ai".startsWith(q)));
    return list.length ? { start: before.length - m[2].length - 1, end: ta.selectionStart, list } : null;
  }
  function drawChip(m) {
    chip.hidden = !m; if (!m) { sugg = []; return; }
    if (sugg.map((x) => x.name).join() !== m.list.map((x) => x.name).join()) suggI = 0;
    sugg = m.list;
    chipList.innerHTML = sugg.map((c, i) => `<button type="button" class="chip${i === suggI ? " on" : ""}" data-pick="${i}" role="option" aria-selected="${i === suggI}">${c.kind === "ai" ? icon.spark(11) : `<i class="dot" style="--c:${esc(c.color || "#999")}"></i>`}@${esc(c.name)}</button>`).join("");
  }
  function insertMention(range, name = aiName()) {
    const r = range || { start: ta.selectionStart, end: ta.selectionEnd };
    const pre = ta.value.slice(0, r.start), post = ta.value.slice(r.end);
    const ins = `@${name} `;
    ta.value = pre + (pre && !/\s$/.test(pre) ? " " : "") + ins + post;
    const pos = ta.value.length - post.length;
    ta.setSelectionRange(pos, pos); ta.focus(); chip.hidden = true; sugg = []; grow();
    ta.dispatchEvent(new Event("input"));
  }
  ta.addEventListener("input", () => { grow(); drawChip(atMatch()); });
  const draft = keepDraft(ta, "room:" + room()); // 방마다 쓰던 글이 남게
  ta.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (!chip.hidden && sugg.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); suggI = (suggI + (e.key === "ArrowDown" ? 1 : -1) + sugg.length) % sugg.length; drawChip(atMatch()); return; }
    if ((e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) && !chip.hidden && sugg.length) { e.preventDefault(); insertMention(atMatch(), sugg[suggI].name); return; }
    if (e.key === "Escape" && !chip.hidden) { chip.hidden = true; return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  ta.addEventListener("blur", () => setTimeout(() => { if (!chip.contains(document.activeElement)) chip.hidden = true; }, 150));
  chip.addEventListener("mousedown", (e) => { const b = e.target.closest("[data-pick]"); if (!b) return; e.preventDefault(); insertMention(atMatch(), sugg[+b.dataset.pick]?.name); });
  $("#rm-call", el).addEventListener("click", () => { if (mentions(ta.value)) ta.focus(); else insertMention(); });
  $("#rm-compose", el).addEventListener("submit", (e) => { e.preventDefault(); send(); });

  list.addEventListener("scroll", () => { if (nearBottom()) { pill.hidden = true; markRead(); } });
  pill.addEventListener("click", () => { toBottom(); markRead(); });
  el.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-del],[data-lib],[data-view],[data-retry],#rm-retry");
    if (!t) return;
    if (t.id === "rm-retry") return poll(true);
    if (t.dataset.retry) return retryAi(t.dataset.retry);
    if (t.dataset.lib) return env.toLibrary(t.dataset.lib);
    if (t.dataset.view) return env.viewItem(t.dataset.view);
    if (t.dataset.del) armDelete(t, async () => {
      try { await api.deleteRoomMessage(t.dataset.del, room()); S.msgs.delete(t.dataset.del); render(); toast("메시지를 지웠어요."); }
      catch (x) { toast(x.message || "지우지 못했어요.", "err"); }
    });
  });

  poll(true);
  return {
    stop() { S.alive = false; clearTimeout(S.timer); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("room-ping", onPing); window.removeEventListener("room-live", onLive); },
    refresh() { poll(); },
    // 방 바꾸기: 목록 · 읽음 상태를 비우고 처음부터
    setRoom() { draft.rebind("room:" + room()); grow(); clearTimeout(S.timer); S.msgs.clear(); S.since = null; S.unreadFrom = null; S.aiErr = null; S.pendingRead = false; pill.hidden = true; typing.hidden = true; msgsEl.innerHTML = `<p class="faint rm-loading">불러오는 중…</p>`; poll(true); },
    rename() { render(); },
    focus() { ta.focus(); },
  };
}

// 대화방 — 우리 셋 방 + 1:1 방(두 사람) + 공통 창고(책 · 링크 · 영상).
// 주소: #/room (마지막 탭) · #/room/chat (첫 팀 방) · #/room/team/<팀 id> · #/room/dm/<상대 id> (1:1, 같은 팀 사람) · #/room/library[/<항목 id>].
// 탭·방 전환은 판을 다시 만들지 않아요. AI 이름 설정은 방 모두에 공통이에요.
import { api } from "../api.js";
import { $, esc, toast } from "../util.js";
import { icon } from "../icons.js";
import { mountChat } from "../room/chat.js";
import { mountLibrary } from "../room/library.js";
import { store, avatar } from "../room/shared.js";

const TAB_KEY = "trio-room-tab";
const TABS = [{ key: "chat", label: "대화" }, { key: "library", label: "창고" }];
const tabOf = (t) => (TABS.some((x) => x.key === t) ? t : null);

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let tab = tabOf(r.tab) || tabOf(store.get(TAB_KEY)) || "chat";
  const dmId = (other) => "dm:" + [ctx.me.id, other].sort().join(":");
  const others = () => ctx.users.filter((u) => u.id !== ctx.me.id);
  const teams = () => ctx.teams || [];
  // 팀이 없고 같은 팀 사람도 없으면 방이 없어요 (null)
  const firstRoom = () => teams()[0]?.room || (others()[0] ? dmId(others()[0].id) : null);
  const roomOf = (dm, team) => (team && teams().some((t) => t.id === team) ? teams().find((t) => t.id === team).room : dm && others().some((u) => u.id === dm) ? dmId(dm) : firstRoom());
  let roomId = roomOf(r.dm, r.team);
  let aiName = "마피아", chat = null, lib = null, unreadMap = {};
  if (!r.tab && !r.dm && !r.team) history.replaceState(null, "", "#/room/" + tab);

  root.innerHTML = `
    <div class="rm" id="rm">
      <header class="rm-head">
        <div class="rm-head-l">
          <h1 class="h2">대화방</h1>
          <nav class="seg" role="tablist" aria-label="대화방 탭">
            ${TABS.map((t) => `<a role="tab" href="#/room/${t.key}" data-tab="${t.key}">${t.label}</a>`).join("")}
          </nav>
        </div>
        <div class="rm-head-r" id="rm-ai" aria-live="polite"></div>
      </header>
      <div class="rm-pane rm-chatwrap" id="rm-pane-chat" hidden>
        <nav class="rm-rooms" id="rm-rooms" aria-label="방 고르기"></nav>
        <div class="rm-chat-host" id="rm-chat-host"></div>
      </div>
      <div class="rm-pane" id="rm-pane-library" hidden></div>
    </div>`;
  const paneChat = $("#rm-pane-chat", root), paneLib = $("#rm-pane-library", root), aiEl = $("#rm-ai", root), roomsEl = $("#rm-rooms", root);

  // ---------- 방 목록: 우리 셋 + 다른 멤버마다 1:1 ----------
  const badge = (n) => n > 0 ? `<span class="rm-unread" aria-label="안 읽음 ${n}개">${n > 99 ? "99+" : n}</span>` : "";
  function drawRooms() {
    const all = teams().map((t) => `<a class="rm-room${roomId === t.room ? " on" : ""}" href="#/room/team/${encodeURIComponent(t.id)}" data-room="${esc(t.room)}" ${roomId === t.room ? 'aria-current="true"' : ""}>
      <span class="rm-room-av all">${icon.home(14)}</span><span class="rm-room-n">${esc(t.name)}</span>${badge(Number(unreadMap[t.room]) || 0)}</a>`).join("");
    const dms = others().map((u) => { const id = dmId(u.id); return `<a class="rm-room${roomId === id ? " on" : ""}" href="#/room/dm/${encodeURIComponent(u.id)}" data-room="${esc(id)}" ${roomId === id ? 'aria-current="true"' : ""}>
      ${avatar(u, "sm")}<span class="rm-room-n">${esc(u.display_name)}</span>${badge(Number(unreadMap[id]) || 0)}</a>`; }).join("");
    roomsEl.innerHTML = all + dms || `<p class="faint rm-none">아직 팀이 없어요. 프로필 메뉴 → <b>팀</b>에서 팀을 만들거나 초대 코드로 들어가요.</p>`;
  }
  // rooms: { all: n, "dm:..": n } — GET /room 응답마다 같이 오고, 읽음 처리 뒤(trio:changed room)엔 따로 한 번 받아요
  function takeRooms(r) {
    if (!r) return;
    if (r.rooms) unreadMap = { ...r.rooms };
    else if (typeof r.unread === "number") unreadMap.all = r.unread;
    unreadMap[roomId] = 0; // 지금 보고 있는 방은 읽는 중
    drawRooms();
  }
  async function refreshUnread() { try { takeRooms(await api.roomUnread()); } catch {} }
  const onChanged = (e) => { if (e.detail?.kind === "room") refreshUnread(); };
  window.addEventListener("trio:changed", onChanged);

  // ---------- 머리 오른쪽: "AI 이름: 마피아 ✎" → 인라인 입력 ----------
  function drawAi(editing = false) {
    if (tab !== "chat") { aiEl.innerHTML = ""; return; }
    if (!editing) {
      aiEl.innerHTML = `<span class="rm-ai-name">AI 이름: <b>${esc(aiName)}</b></span><button type="button" class="icon-btn sm" id="rm-ai-edit" aria-label="AI 이름 바꾸기" title="AI 이름 바꾸기 (방 모두에 같아요)">${icon.edit(14)}</button>`;
      $("#rm-ai-edit", aiEl).addEventListener("click", () => drawAi(true));
      return;
    }
    aiEl.innerHTML = `<form class="rm-ai-form" id="rm-ai-form"><label class="faint" for="rm-ai-in">AI 이름</label><input class="input" id="rm-ai-in" value="${esc(aiName)}" minlength="2" maxlength="12" required aria-describedby="rm-ai-help"><button class="btn accent sm" type="submit">저장</button><button class="btn ghost sm" type="button" id="rm-ai-cancel">취소</button><small id="rm-ai-help" class="faint">2~12자 · 셋 모두 · 모든 방</small></form>`;
    const inp = $("#rm-ai-in", aiEl);
    inp.focus(); inp.select();
    $("#rm-ai-cancel", aiEl).addEventListener("click", () => drawAi(false));
    inp.addEventListener("keydown", (e) => { if (e.key === "Escape") drawAi(false); });
    $("#rm-ai-form", aiEl).addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = inp.value.trim();
      if (v.length < 2 || v.length > 12) { toast("AI 이름은 2~12자로 정해 주세요.", "err"); return; }
      if (v === aiName) { drawAi(false); return; }
      try {
        const res = await api.roomSettings({ ai_name: v, room: roomId });
        aiName = res?.ai_name || v;
        toast(`AI 이름을 '${aiName}' 로 바꿨어요.`);
        drawAi(false); chat?.rename(); chat?.refresh();
      } catch (x) { toast(x.message || "이름을 바꾸지 못했어요.", "err"); }
    });
  }

  function paintTabs() {
    root.querySelectorAll("[data-tab]").forEach((a) => {
      const on = a.dataset.tab === tab;
      a.setAttribute("aria-selected", String(on));
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("#rm", root).dataset.tab = tab;
  }
  const env = {
    ctx,
    onOtherRoom: () => refreshUnread(), // 다른 방에 새 메시지 → 방 목록 배지 바로
    getAiName: () => aiName,
    getRoom: () => roomId,
    onAiName: (n) => { if (n && n !== aiName) { aiName = n; if (!$("#rm-ai-form", aiEl)) drawAi(false); } },
    onRoomInfo: takeRooms,
    // 대화의 "창고에 넣기" → 창고 탭으로, 넣기 칸에 URL 채움
    toLibrary: (url) => { go("library"); lib.addUrl(url); },
    // share 카드의 "창고에서 보기" → 창고 탭에서 그 항목으로
    viewItem: (id) => { go("library"); lib.focusItem(id); },
    // 창고에서 대화로 보냈으면(우리 셋 방) 대화가 바로 새 것을 받아요
    onShared: () => chat?.refresh(),
  };
  function ensure() {
    if (tab === "chat" && !chat && roomId) chat = mountChat($("#rm-chat-host", root), env);
    if (tab === "library" && !lib) lib = mountLibrary(paneLib, env);
  }
  function show(focusId) {
    store.set(TAB_KEY, tab);
    paintTabs();
    const hadLib = !!lib;
    ensure();
    paneChat.hidden = tab !== "chat";
    paneLib.hidden = tab !== "library";
    drawRooms();
    drawAi(false);
    if (tab === "library") { if (hadLib) lib.refresh(); if (focusId) lib.focusItem(focusId); } // 이미 있던 창고는 새로 받고(다른 사람이 넣은 것), 그 뒤 하이라이트
  }
  function setRoom(id) {
    if (id === roomId) return;
    roomId = id;
    drawRooms();
    chat?.setRoom();
  }
  function hashFor(t, rid) { const tm = teams().find((x) => x.room === rid); return t === "library" ? "#/room/library" : !rid ? "#/room/chat" : tm ? "#/room/team/" + encodeURIComponent(tm.id) : "#/room/dm/" + encodeURIComponent(rid.split(":").slice(1).find((x) => x !== ctx.me.id)); }
  function go(t) { if (t !== tab) { tab = t; history.replaceState(null, "", hashFor(t, roomId)); show(); } }

  inst = {
    update(nr) {
      const t = tabOf(nr.tab) || tab;
      if (!nr.tab && !nr.dm && !nr.team) history.replaceState(null, "", hashFor(t, roomId));
      const rid = nr.dm !== undefined || nr.team ? roomOf(nr.dm, nr.team) : t === "chat" && nr.tab === "chat" ? firstRoom() : roomId;
      const sameTab = t === tab;
      tab = t;
      if (!sameTab) show(nr.id || null);
      else if (t === "library" && nr.id) lib.focusItem(nr.id);
      if (t === "chat") setRoom(rid);
    },
  };
  show(r.id || null);
  return () => { chat?.stop(); lib?.stop(); window.removeEventListener("trio:changed", onChanged); inst = null; };
}

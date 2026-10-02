// 홈 첫 화면의 글 쓰는 자리 — 위쪽 가운데(시계 왼쪽)
//   오늘의 다짐: 밑줄 하나짜리 입력칸. 날마다 한 줄, 셋이 봐요. Enter · 다른 곳 누르면 저장. 친구 칩을 누르면 그 친구 화면으로.
//   메모장: 나만 봐요. 줄 공책, 쓰는 대로 저장(0.7초 뒤), ⌘S 로 바로 저장, "노트로 보내기".
import { api } from "./api.js";
import { esc, initial, toast, avatar } from "./util.js";
import { icon } from "./icons.js";

const OPEN_KEY = "trio-memo-open";
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const hm = (ms) => new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

export function mountPad(host, ctx, { onPickWho } = {}) {
  let who = ctx.me.id, data = null, alive = true, okT = 0;
  let memo = { text: "", savedAt: null, dirty: false, saving: false, error: false };
  let memoOpen = store.get(OPEN_KEY) === "1", saveT = 0;
  const day = kstDay();

  host.innerHTML = `<div class="pad-pledge" id="pad-pledge"></div><div class="pad-memo-wrap" id="pad-memo-wrap"></div>`;
  const pledgeEl = host.querySelector("#pad-pledge"), memoWrap = host.querySelector("#pad-memo-wrap");
  const mine = () => who === ctx.me.id;
  const pledgeOf = (id) => data?.pledges.find((p) => p.user_id === id)?.body || "";

  // ---------- 오늘의 다짐 ----------
  function paintPledge() {
    if (!data) { pledgeEl.innerHTML = ""; return; }
    const u = ctx.user(who) || ctx.me, text = pledgeOf(who);
    // 내 화면: 입력칸 하나 · 친구 화면: 그 친구의 다짐 (읽기만)
    const line = mine()
      ? `<form class="pad-edit" id="pad-form"><input class="pad-input" id="pad-input" maxlength="120" value="${esc(text)}" placeholder="Motivation" aria-label="Motivation (셋이 봐요)" autocomplete="off" enterkeyhint="done"><span class="pad-ok" id="pad-ok" aria-hidden="true">${icon.check(14)}</span></form>`
      : `<p class="pad-text ${text ? "" : "empty"}">${avatar(u, "sm")}${esc(text || "아직 Motivation 이 없어요")}</p>`;
    // 친구들의 오늘 다짐 (내 화면에서만) — 누르면 그 친구 화면으로
    const others = mine() ? ctx.users.filter((x) => x.id !== ctx.me.id) : [];
    const friends = others.length ? `<div class="pad-friends">${others.map((x) => {
      const t = pledgeOf(x.id);
      return `<button type="button" class="pad-friend ${t ? "" : "none"}" data-friend="${esc(x.id)}" style="--c:${esc(x.color)}" title="${esc(x.display_name)} · ${esc(t || "아직 안 썼어요")}">
        ${avatar(x, "sm")}<span class="pad-friend-t">${esc(t || "아직")}</span></button>`;
    }).join("")}</div>` : "";
    const memoBtn = mine() ? `<button type="button" class="pad-memo-btn ${memoOpen ? "on" : ""}" id="pad-memo-btn" aria-expanded="${memoOpen}" aria-controls="pad-memo">${icon.notes(14)} 메모${memo.text.trim() ? `<span class="num">${memo.text.length.toLocaleString()}자</span>` : ""}</button>` : "";
    pledgeEl.innerHTML = `${line}<div class="pad-row">${friends}${memoBtn}</div>`;
    bindPledge();
  }
  function bindPledge() {
    const form = pledgeEl.querySelector("#pad-form");
    if (form) {
      const inp = form.querySelector("#pad-input");
      form.addEventListener("submit", (e) => { e.preventDefault(); savePledge(inp.value); inp.blur(); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Escape") { inp.value = pledgeOf(ctx.me.id); inp.blur(); } });
      inp.addEventListener("blur", () => savePledge(inp.value));
    }
    pledgeEl.querySelectorAll("[data-friend]").forEach((b) => b.addEventListener("click", () => onPickWho?.(b.dataset.friend)));
    pledgeEl.querySelector("#pad-memo-btn")?.addEventListener("click", () => { memoOpen = !memoOpen; store.set(OPEN_KEY, memoOpen ? "1" : "0"); paintPledge(); paintMemo(); if (memoOpen) memoWrap.querySelector("textarea")?.focus(); });
  }
  async function savePledge(raw) {
    const text = String(raw || "").replace(/\s+/g, " ").trim(), before = pledgeOf(ctx.me.id);
    if (text === before) return;
    const set = (t) => { data.pledges = data.pledges.filter((p) => p.user_id !== ctx.me.id); if (t) data.pledges.push({ user_id: ctx.me.id, body: t }); };
    set(text);
    try {
      await api.savePledge(text, day);
      // 저장되면 입력칸 끝에 ✓ 가 잠깐 (화면은 다시 그리지 않아요 — 쓰던 자리 그대로)
      const ok = pledgeEl.querySelector("#pad-ok");
      if (ok) { ok.classList.add("on"); clearTimeout(okT); okT = setTimeout(() => ok.classList.remove("on"), 1400); }
    } catch (e) {
      set(before);
      const inp = pledgeEl.querySelector("#pad-input"); if (inp && document.activeElement !== inp) inp.value = before;
      toast(e.message || "다짐을 저장하지 못했어요.", "err");
    }
  }

  // ---------- 메모장 (나만) ----------
  function status() {
    if (memo.saving) return "저장 중…";
    if (memo.error) return `<button type="button" class="pad-retry" id="pad-retry">저장 못 했어요 · 다시</button>`;
    if (memo.dirty) return "쓰는 중…";
    return memo.savedAt ? `저장됨 ${hm(memo.savedAt)}` : "나만 봐요";
  }
  function paintMemo() {
    if (!mine() || !memoOpen || !data) { memoWrap.innerHTML = ""; return; }
    if (memoWrap.querySelector("#pad-memo")) { memoWrap.querySelector("#pad-status").innerHTML = status(); memoWrap.querySelector("#pad-len").textContent = `${memo.text.length.toLocaleString()}자`; bindRetry(); return; }
    memoWrap.innerHTML = `
      <section class="pad-memo glass" id="pad-memo" aria-label="메모장 (나만 봐요)">
        <div class="pad-memo-head"><b>메모</b><span class="pad-scope">나만 봐요</span><span class="pad-status" id="pad-status" aria-live="polite">${status()}</span>
          <button type="button" class="icon-btn sm" id="pad-memo-x" aria-label="메모 닫기">${icon.x(14)}</button></div>
        <textarea class="pad-paper" id="pad-paper" spellcheck="false" placeholder="생각나는 대로 적어요. 할 일 · 아이디어 · 오늘 배운 것…">${esc(memo.text)}</textarea>
        <div class="pad-memo-foot"><span class="faint num" id="pad-len">${memo.text.length.toLocaleString()}자</span><span class="faint">⌘S 바로 저장</span><span class="grow"></span>
          <button type="button" class="btn ghost sm" id="pad-to-note">${icon.notes(13)} 노트로 보내기</button></div>
      </section>`;
    const ta = memoWrap.querySelector("#pad-paper");
    ta.addEventListener("input", () => { memo.text = ta.value; memo.dirty = true; memo.error = false; paintMemo(); paintMemoBtn(); clearTimeout(saveT); saveT = setTimeout(saveMemo, 700); });
    ta.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); clearTimeout(saveT); saveMemo(); } });
    memoWrap.querySelector("#pad-memo-x").addEventListener("click", () => { memoOpen = false; store.set(OPEN_KEY, "0"); flush(); paintPledge(); paintMemo(); });
    memoWrap.querySelector("#pad-to-note").addEventListener("click", toNote);
    bindRetry();
  }
  const paintMemoBtn = () => { const b = pledgeEl.querySelector("#pad-memo-btn"); if (b) b.innerHTML = `${icon.notes(14)} 메모${memo.text.trim() ? `<span class="num">${memo.text.length.toLocaleString()}자</span>` : ""}`; };
  const bindRetry = () => memoWrap.querySelector("#pad-retry")?.addEventListener("click", saveMemo);
  async function saveMemo() {
    if (!memo.dirty || memo.saving) return;
    memo.saving = true; memo.dirty = false; paintMemo();
    const sent = memo.text;
    try { const r = await api.saveMemo(sent); memo.savedAt = r.saved_at; memo.error = false; }
    catch (e) { memo.error = true; memo.dirty = true; toast(e.message || "메모를 저장하지 못했어요.", "err"); }
    finally { memo.saving = false; if (memo.text !== sent) memo.dirty = true; if (alive) paintMemo(); if (memo.dirty && !memo.error) { clearTimeout(saveT); saveT = setTimeout(saveMemo, 700); } }
  }
  const flush = () => { clearTimeout(saveT); if (memo.dirty) saveMemo(); };
  async function toNote() {
    const text = memo.text.trim();
    if (!text) { toast("메모가 비어 있어요."); return; }
    const d = new Date(), title = `메모 ${day} ${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    try {
      const r = await api.addNote({ title, body: text + "\n\n#메모\n" });
      toast("노트로 보냈어요. 메모장은 그대로 둬요.");
      if (confirm("노트로 보냈어요. 지금 그 노트를 열까요?")) ctx.go("#/notes/" + r.note.id);
    } catch (e) { toast(e.message || "노트로 보내지 못했어요.", "err"); }
  }
  async function load() {
    try {
      data = await api.homePad(day);
      if (!memo.dirty) { memo.text = data.memo || ""; memo.savedAt = data.memo_at; }
    } catch { data = data || { pledges: [], streak: 0, last: null, memo: "" }; }
    if (!alive) return;
    paintPledge(); paintMemo();
  }
  load();
  return {
    setWho(id) { who = id; paintPledge(); paintMemo(); },
    refresh: load,
    destroy() { alive = false; flush(); },
  };
}

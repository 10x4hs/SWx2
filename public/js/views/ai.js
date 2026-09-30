// AI 채팅: 대화방 목록 · 모델 고르기(전체 비교 포함) · 스트리밍 답 · 노트로 저장
import { keepDraft } from "../draft.js";
import { api, streamChat } from "../api.js";
import { $, esc, toast, ymd, today, nowTime, periodKey, debounce } from "../util.js";
import { icon } from "../icons.js";
import { renderMarkdown } from "../md.js";
import { openByTitle } from "./notes.js";
import { aiPrefs, setAiPrefs, globe, stepsHTML } from "../ai-pick.js";
import { attachImages, splitImageNote } from "../imgattach.js";

const MODEL_KEY = "trio-ai-model", CTX_KEY = "trio-ai-context", PREFILL_KEY = "trio-ai-prefill", LAST_KEY = "trio-ai-last";
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const LABEL = { gemini: "Gemini", "gemini-pro": "Gemini Pro", mimo: "MiMo", "mimo-pro": "MiMo Pro", groq: "Groq", cohere: "Cohere" };
const COMPARE = ["gemini", "groq", "cohere"]; // 서버가 /ai/models 의 all.targets 로 알려주면 그걸 써요
const SUGGEST = [
  "오늘 계획 중에 뭐부터 하면 좋을까?",
  "이번 주 진행 상황을 점검하고 조언해 줘",
  "[[SQL]] 노트를 요약하고 퀴즈 3개 내 줘",
  "정규화 3NF를 쉬운 예시로 설명해 줘",
];
const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "방금"; if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60); if (h < 24) return `${h}시간 전`;
  const d = Math.round(h / 24); return d < 7 ? `${d}일 전` : new Date(ms).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
};

// 영어 페이지 등에서 "AI 튜터로 시작" → { text, model } 을 한 번만 읽고 지워요 (새 대화일 때만)
function takePrefill() {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PREFILL_KEY);
    const v = JSON.parse(raw);
    return v && typeof v.text === "string" && v.text.trim() ? { text: v.text.slice(0, 4000), model: typeof v.model === "string" ? v.model : null } : null;
  } catch { return null; }
}

export function mount(root, ctx, r) {
  const prefill = r.id ? null : takePrefill();
  // 다른 화면에 갔다 와도 보던 대화로 (#/ai/new 는 새 대화)
  const startId = r.id === "new" ? null : r.id || (prefill ? null : store.get(LAST_KEY, "") || null);
  const S = { chats: [], models: [], model: store.get(MODEL_KEY, "all"), useCtx: store.get(CTX_KEY, "1") === "1", chatId: startId, turns: [], busy: false, abort: null };
  if (startId && !r.id) history.replaceState(null, "", "#/ai/" + startId);
  let ctxOverride = !!prefill;
  if (prefill) S.useCtx = false; // 이 대화만 내 기록을 보내지 않아요 (저장된 설정은 그대로)

  root.innerHTML = `
    <div class="chat" id="chat">
      <aside class="chat-list" aria-label="대화 목록">
        <div class="top">
          <div class="row" style="justify-content:space-between"><h1 class="h2">AI 튜터</h1>
            <a class="btn sm accent" href="#/ai/new">${icon.plus(14)}새 대화</a></div>
        </div>
        <ul id="cl"></ul>
      </aside>
      <section class="convo" aria-label="대화">
        <header class="convo-bar">
          <a class="icon-btn sm" href="#/ai" id="convo-back" aria-label="대화 목록">${icon.left(16)}</a>
          <span class="convo-title" id="convo-title">새 대화</span>
          <label class="switch" title="내 계획·기록·노트를 AI에게 함께 보내요">
            <input type="checkbox" id="use-ctx" ${S.useCtx ? "checked" : ""}><span></span>내 기록 참고
          </label>
          <select class="select" id="model" aria-label="AI 모델"></select>
          <button type="button" class="ai-web" id="use-web" aria-pressed="${aiPrefs().web}" title="웹 먼저 찾기 · 켜면 질문마다 먼저 웹을 검색하고 답해요 (꺼도 AI 가 필요하면 스스로 검색해요)">${globe(13)}<span>웹</span></button>
          <a class="btn sm ghost" href="#/planner" title="대화로 계획 짜기">${icon.plans(14)}계획 AI</a>
          <button class="btn sm ai-btn" type="button" id="to-notes" hidden title="이 대화에서 배운 내용을 서로 연결된 개념 노트로 만들어요">${icon.spark(14)}노트로 정리</button>
        </header>
        <div class="convo-body" id="body"><div class="convo-inner" id="turns"></div></div>
        <form class="composer" id="composer">
          <div class="att-tray" id="att" hidden></div>
          <div class="composer-box">
            <button class="icon-btn att-btn" type="button" id="att-btn" aria-label="이미지 붙이기" title="이미지 붙이기 · 붙여넣기(⌘V) · 끌어다 놓기도 돼요">${icon.image(18)}</button>
            <textarea id="q" rows="1" maxlength="4000" placeholder="궁금한 걸 물어보세요. [[노트 제목]]을 쓰면 그 노트를 읽고 답해요." aria-label="질문"></textarea>
            <button class="send" type="submit" id="send" aria-label="보내기">${icon.arrowRight(18)}</button>
          </div>
          <p class="composer-hint"><kbd>Enter</kbd> 보내기 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 줄바꿈 · 사진은 붙여넣기 · AI 가 필요하면 웹을 찾아봐요 · 답은 틀릴 수 있어요</p>
        </form>
      </section>
    </div>`;

  const q = $("#q", root), body = $("#body", root);
  const draft = keepDraft(q, "ai"); // 나갔다 와도 쓰던 질문이 남게
  const att = attachImages({ tray: $("#att", root), button: $("#att-btn", root), paste: [q], drop: [$("#composer", root)] });

  // ---------- chat list ----------
  function drawList() {
    $("#cl", root).innerHTML = S.chats.length ? S.chats.map((c) => `
      <li><a href="#/ai/${c.id}" ${c.id === S.chatId ? 'aria-current="page"' : ""}>
        <span class="t">${esc(c.title)}</span><span class="s">${esc(c.model === "all" ? "전체 비교" : LABEL[c.model] || c.model)} · ${ago(c.updated_at)}</span>
      </a><button class="icon-btn sm danger" type="button" data-delchat="${c.id}" aria-label="대화 삭제">${icon.trash(14)}</button></li>`).join("")
      : `<li class="faint" style="padding:10px 12px;font-size:13px">아직 대화가 없어요</li>`;
  }
  async function loadList() { try { S.chats = (await api.chats()).chats; drawList(); } catch (e) { toast(e.message, "err"); } }

  // ---------- models ----------
  async function loadModels() {
    try {
      const { models } = await api.aiModels();
      S.models = models;
      if (!models.some((m) => m.id === S.model && m.available)) S.model = (models.find((m) => m.available) || models[0]).id;
      $("#model", root).innerHTML = models.map((m) => `<option value="${m.id}" ${m.id === S.model ? "selected" : ""} ${m.available ? "" : "disabled"}>${esc(m.label)}${m.available ? "" : " (키 없음)"}</option>`).join("");
    } catch (e) { toast(e.message, "err"); }
  }

  // ---------- turns ----------
  // turn = { q, answers: { [model]: { text, reasoning, status, error, done } } }
  function groupMessages(messages) {
    const turns = [];
    for (const m of messages) {
      if (m.role === "user") turns.push({ q: m.content, target: m.model, answers: {} });
      else if (turns.length) turns[turns.length - 1].answers[m.model] = { text: m.content, done: true };
    }
    return turns;
  }
  function askHTML(t) {
    const { q: text, note, n } = splitImageNote(t.q);
    const thumbs = t.images?.length ? `<div class="ask-imgs">${t.images.map((u) => `<img src="${esc(u)}" alt="첨부 이미지">`).join("")}</div>` : "";
    const chip = note ? `<details class="ask-note"><summary>${icon.image(12)} 이미지 ${n}장 · AI 가 읽은 내용</summary><div class="md">${renderMarkdown(note)}</div></details>` : "";
    return `${thumbs}<div class="bubble">${esc(text)}</div>${!thumbs && chip ? chip : ""}`;
  }
  function answerHTML(model, a, i) {
    const html = a.text ? renderMarkdown(a.text) : a.error ? "" : `<p class="typing"><span></span><span></span><span></span></p>`;
    return `<article class="ans ${a.done ? "done" : "live"}" data-turn="${i}" data-model="${model}">
      <header><span class="chip">${esc(LABEL[model] || model)}</span>${a.status ? `<span class="faint" style="font-size:12px">${esc(a.status)}</span>` : ""}</header>
      ${stepsHTML(a.steps)}
      ${a.reasoning ? `<details class="think"${a.text ? "" : " open"}><summary>생각 과정</summary><div>${esc(a.reasoning.slice(-4000))}</div></details>` : ""}
      ${a.error ? `<p class="ans-err">${esc(a.error)}</p>` : ""}
      <div class="md">${html}</div>
      ${a.done && a.text ? `<footer>
        <button class="btn ghost sm" type="button" data-copy>복사</button>
        <button class="btn ghost sm" type="button" data-save>${icon.notes(14)}노트로 저장</button>
      </footer>` : ""}
    </article>`;
  }
  function drawTurns() {
    const el = $("#turns", root);
    if (!S.turns.length) {
      el.innerHTML = `
        <div class="hello">
          <span class="serif">Ask anything</span>
          <h2 class="h1">${esc(ctx.me.display_name)}님, 무엇이 궁금한가요?</h2>
          <p class="muted">${S.useCtx ? "오늘 계획과 목표, 관련 노트를 함께 읽고 답해요." : "내 기록 없이 일반 질문으로 답해요."} ${aiPrefs().web ? "웹 먼저 찾기를 켜 두어서 질문마다 먼저 검색해요." : "필요하면 AI 가 스스로 웹을 찾아보고 답해요."} 사진을 붙여넣어도 돼요. ${S.model === "all" ? `${compareTargets().map((m) => LABEL[m] || m).join(" · ")} 답을 나란히 비교해요.` : ""}</p>
          <div class="sugg">${SUGGEST.map((s) => `<button type="button" class="sugg-btn" data-sugg="${esc(s)}">${esc(s)}</button>`).join("")}</div>
        </div>`;
      return;
    }
    el.innerHTML = S.turns.map((t, i) => {
      const models = Object.keys(t.answers);
      return `<div class="turn">
        <div class="ask">${askHTML(t)}</div>
        <div class="answers ${models.length > 1 ? `cols n${models.length}` : ""}">${models.map((m) => answerHTML(m, t.answers[m], i)).join("")}</div>
      </div>`;
    }).join("");
    el.querySelectorAll(".md a[data-wikilink]").forEach((a) => a.classList.add("wikilink"));
  }
  const nearBottom = () => body.scrollHeight - body.scrollTop - body.clientHeight < 140;
  const toBottom = () => { body.scrollTop = body.scrollHeight; };
  const redraw = debounce(() => { const stick = nearBottom(); drawTurns(); if (stick) toBottom(); }, 40);

  async function openChat(id) {
    S.chatId = id; S.turns = []; store.set(LAST_KEY, id || "");
    $("#chat", root).classList.toggle("has-chat", !!id);
    $("#to-notes", root).hidden = !id;
    if (!id) { $("#convo-title", root).textContent = "새 대화"; drawTurns(); drawList(); q.focus(); return; }
    try {
      const { chat, messages } = await api.chat(id);
      S.turns = groupMessages(messages);
      $("#convo-title", root).textContent = chat.title;
      if (S.models.some((m) => m.id === chat.model && m.available)) { S.model = chat.model; $("#model", root).value = chat.model; }
      drawTurns(); drawList(); toBottom();
    } catch (e) { store.set(LAST_KEY, ""); if (e.status !== 404) toast(e.message, "err"); ctx.go("#/ai/new"); }
  }

  function compareTargets() { return S.models.find((m) => m.id === "all")?.targets || COMPARE; }

  // ---------- send ----------
  async function send(text) {
    text = text.trim();
    const images = att.list();
    if ((!text && !images.length) || S.busy) return;
    S.busy = true; setBusy(true);
    const turn = { q: text || "이 이미지를 보고 설명해 줘.", images, target: S.model, answers: {} };
    const targets = S.model === "all" ? compareTargets() : [S.model];
    targets.forEach((m) => (turn.answers[m] = { text: "", reasoning: "", done: false, steps: [] }));
    S.turns.push(turn);
    q.value = ""; draft.clear(); att.clear(); autosize();
    drawTurns(); toBottom();
    const t = today();
    S.abort = new AbortController();
    try {
      await streamChat({
        chat_id: S.chatId, message: text, images, model: S.model, use_context: S.useCtx, web: aiPrefs().web,
        day: ymd(t), time: nowTime(),
        periods: { day: periodKey("day", t), week: periodKey("week", t), month: periodKey("month", t), year: periodKey("year", t) },
      }, (ev) => {
        const a = ev.model && turn.answers[ev.model];
        if (ev.type === "meta") {
          const fresh = !S.chatId;
          S.chatId = ev.chat_id; store.set(LAST_KEY, ev.chat_id);
          $("#convo-title", root).textContent = ev.title;
          for (const m of ev.skipped || []) { if (turn.answers[m]) Object.assign(turn.answers[m], { done: true, error: "이 모델의 키가 설정되지 않았어요." }); }
          if (fresh) { history.replaceState(null, "", "#/ai/" + ev.chat_id); loadList(); }
        } else if (a && ev.type === "delta") { a.text += ev.text; a.status = ""; }
        else if (a && ev.type === "reasoning") a.reasoning += ev.text;
        else if (a && ev.type === "reset") a.text = "";   // 글을 쓰다가 도구를 부르면 그 글은 지우고 이어서
        else if (a && ev.type === "tool") { a.steps.push(ev); a.status = ""; }
        else if (a && ev.type === "status") a.status = ev.text;
        else if (a && ev.type === "done") { if (ev.changed) window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "plans" } })); a.done = true; a.status = ev.used && ev.fallback !== false && !ev.used.includes("3.8-flash") && !ev.used.includes("2.6-flash") ? ev.used : ""; } // 대신 답한 모델만 표시
        else if (a && ev.type === "error") { a.done = true; a.error = ev.message; }
        redraw();
      }, S.abort.signal);
      for (const a of Object.values(turn.answers)) if (!a.done) { a.done = true; if (!a.text) a.error = "답이 중간에 끊겼어요."; }
    } catch (e) {
      for (const a of Object.values(turn.answers)) if (!a.done) { a.done = true; a.error = e.message; }
      toast(e.message, "err");
    } finally {
      S.busy = false; S.abort = null; setBusy(false);
      redraw.flush(); loadList();
    }
  }
  function setBusy(on) {
    const b = $("#send", root);
    b.classList.toggle("stop", on);
    b.setAttribute("aria-label", on ? "멈추기" : "보내기");
    b.innerHTML = on ? `<span class="stop-sq"></span>` : icon.arrowRight(18);
  }
  const autosize = () => { q.style.height = "auto"; q.style.height = Math.min(220, q.scrollHeight) + "px"; };

  async function saveAsNote(turnIdx, model) {
    const t = S.turns[turnIdx], a = t.answers[model];
    const base = t.q.replace(/[\[\]|#\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "AI 답변";
    const bodyText = `# ${base}\n\n> 질문: ${t.q.replace(/\n/g, " ")}\n> 답: ${LABEL[model] || model} · ${ymd(new Date())}\n\n${a.text}\n\n#AI`;
    for (let i = 1; i < 20; i++) {
      try {
        const { note } = await api.addNote({ title: i === 1 ? base : `${base} ${i}`, body: bodyText });
        ctx.refreshSide();
        toast("노트로 저장했어요.");
        return note;
      } catch (e) { if (e.status !== 409) { toast(e.message, "err"); return; } }
    }
  }

  // ---------- events ----------
  $("#composer", root).addEventListener("submit", (e) => {
    e.preventDefault();
    if (S.busy) { S.abort?.abort(); return; }
    send(q.value);
  });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!S.busy) send(q.value); } });
  q.addEventListener("input", autosize);
  $("#model", root).addEventListener("change", (e) => { S.model = e.target.value; store.set(MODEL_KEY, S.model); if (!S.turns.length) drawTurns(); });
  $("#use-web", root).addEventListener("click", (e) => { const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; e.currentTarget.setAttribute("aria-pressed", String(on)); setAiPrefs({ web: on }); if (!S.turns.length) drawTurns(); });
  $("#use-ctx", root).addEventListener("change", (e) => { S.useCtx = e.target.checked; store.set(CTX_KEY, S.useCtx ? "1" : "0"); if (!S.turns.length) drawTurns(); });
  root.addEventListener("click", async (e) => {
    const sg = e.target.closest("[data-sugg]");
    if (sg) { send(sg.dataset.sugg); return; }
    const del = e.target.closest("[data-delchat]");
    if (del) {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.classList.add("armed"); setTimeout(() => { delete del.dataset.armed; del.classList.remove("armed"); }, 2500); toast("한 번 더 누르면 대화를 지워요."); return; }
      try { await api.deleteChat(del.dataset.delchat); if (store.get(LAST_KEY, "") === del.dataset.delchat) store.set(LAST_KEY, ""); if (S.chatId === del.dataset.delchat) ctx.go("#/ai/new"); await loadList(); } catch (ex) { toast(ex.message, "err"); }
      return;
    }
    const ans = e.target.closest(".ans");
    if (ans && e.target.closest("[data-copy]")) {
      const a = S.turns[+ans.dataset.turn].answers[ans.dataset.model];
      try { await navigator.clipboard.writeText(a.text); toast("복사했어요."); } catch { toast("복사하지 못했어요.", "err"); }
      return;
    }
    if (ans && e.target.closest("[data-save]")) { saveAsNote(+ans.dataset.turn, ans.dataset.model); return; }
    const w = e.target.closest("[data-wikilink]");
    if (w) { e.preventDefault(); openByTitle(ctx, w.dataset.wikilink); }
  });
  $("#convo-title", root).addEventListener("dblclick", (e) => {
    if (!S.chatId) return;
    const el = e.currentTarget, old = el.textContent;
    el.contentEditable = "true"; el.focus(); document.getSelection().selectAllChildren(el);
    const done = async (commit) => {
      el.contentEditable = "false"; el.onkeydown = el.onblur = null;
      const v = el.textContent.trim();
      if (!commit || !v || v === old) { el.textContent = old; return; }
      try { await api.renameChat(S.chatId, v.slice(0, 60)); loadList(); } catch (ex) { el.textContent = old; toast(ex.message, "err"); }
    };
    el.onkeydown = (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); done(true); } if (ev.key === "Escape") done(false); };
    el.onblur = () => done(true);
  });

  // 대화 → 개념 노트 여러 개 + 목차 (AI가 만들고 서로 [[링크]])
  $("#to-notes", root).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!S.chatId || btn.disabled || S.busy) return;
    const html = btn.innerHTML;
    btn.disabled = true; btn.classList.add("busy"); btn.innerHTML = `${icon.spark(14)}정리 중…`;
    try {
      const r = await api.generate({ chat_id: S.chatId });
      toast(`'${r.topic}' 노트 ${r.notes.length}개로 정리했어요.`);
      ctx.refreshSide(); ctx.changed("notes");
      ctx.go("#/notes/" + (r.moc_id || r.notes[0]?.id || ""));
    } catch (ex) { toast(ex.message, "err"); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove("busy"); btn.innerHTML = html; } }
  });

  const onHash = () => {
    const m = location.hash.match(/^#\/ai(?:\/([^/]+))?$/);
    const want = m ? (m[1] === "new" ? null : m[1] || null) : undefined;
    if (m && want !== S.chatId && !S.busy) {
      if (ctxOverride) { ctxOverride = false; S.useCtx = store.get(CTX_KEY, "1") === "1"; $("#use-ctx", root).checked = S.useCtx; } // 다른 대화로 가면 원래 설정으로
      openChat(want);
    }
  };
  window.addEventListener("hashchange", onHash);

  loadModels().then(() => {
    if (prefill?.model && S.models.some((m) => m.id === prefill.model && m.available)) { S.model = prefill.model; $("#model", root).value = prefill.model; }
    return openChat(S.chatId);
  }).then(() => {
    if (!prefill) return;
    q.value = prefill.text; autosize(); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
  });
  loadList();

  return () => { S.abort?.abort(); window.removeEventListener("hashchange", onHash); };
}

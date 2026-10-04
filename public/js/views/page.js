// Dock 사용자 페이지 — #/p/new (목적 적어 AI 로 만들기) · #/p/<id> (보기 · 내 것이면 옆 패널에서 AI 대화로 고치기 · 코드 · 버전)
import { api } from "../api.js";
import { $, $$, esc, toast } from "../util.js";
import { icon } from "../icons.js";
import { mountRunner } from "../page-runner.js";
import { aiPrefs } from "../ai-pick.js";

const when = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const EXAMPLES = ["이번 주 영어 공부 시간을 막대그래프로, 오늘 목표까지 남은 시간도", "단어 암기 카드 — 내가 넣은 단어를 뒤집어 외우고 외운 건 체크", "오늘 계획 중 아직 안 한 것만 큰 글씨로, 하나씩 끝냄 누르기", "논문 16편 진도를 셋이 나란히 보는 판", "포모도로 타이머 + 끝나면 집중 기록 남기기"];

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let id = null, page = null, stopRun = null, panel = null, chat = [];
  const busy = (btn, label, on) => { if (!btn) return; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label; btn.disabled = true; } else { btn.textContent = btn.dataset.l || btn.textContent; btn.disabled = false; } };

  // ---------- 새 페이지 ----------
  function drawNew() {
    root.innerHTML = `
      <div class="view upage-new">
        <header class="vhead"><div class="title"><span class="eyebrow">Dock 페이지 추가</span><h1 class="h1">무엇을 만들까요?</h1>
          <p class="faint">하고 싶은 걸 한두 문장으로 적으면 AI 가 화면을 짜요. 만든 뒤에도 옆 대화로 계속 고칠 수 있어요. 계획 · 노트 · 영어 · 논문 데이터를 읽고 쓸 수 있어요.</p></div></header>
        <form class="card upage-form" id="np-form">
          <textarea class="input" id="np-purpose" rows="3" maxlength="1000" placeholder="예: ${esc(EXAMPLES[0])}" aria-label="페이지 목적"></textarea>
          <div class="upage-ex">${EXAMPLES.map((x) => `<button type="button" class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join("")}</div>
          <div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
            <span class="faint">AI 가 1~2분 걸릴 수 있어요 · 정교한 화면은 Claude Code 에서 <code>page_write</code> 로도 만들 수 있어요</span>
            <div class="row" style="gap:8px"><button class="btn ghost" type="button" id="np-blank">빈 페이지로</button><button class="btn accent" type="submit">AI 로 만들기</button></div>
          </div>
        </form>
      </div>`;
    const ta = $("#np-purpose", root); ta.focus();
    root.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { ta.value = b.dataset.ex; ta.focus(); }));
    $("#np-blank", root).addEventListener("click", async () => {
      const purpose = ta.value.trim();
      const r = await api.addPage({ title: purpose.slice(0, 12) || "새 페이지", purpose, code: `<!doctype html>\n<html lang="ko">\n<head><title>새 페이지</title></head>\n<body>\n  <h2>✨ 새 페이지</h2>\n  <p>오른쪽 '코드' 탭에서 직접 짜거나, 'AI 에게' 칸에 바꾸고 싶은 걸 적어 보세요.</p>\n  <script>\n    trio.api("GET", "/plans?periods=D:" + trio.today).then((r) => { document.body.insertAdjacentHTML("beforeend", "<p>오늘 계획 " + r.plans.length + "개</p>"); });\n  </script>\n</body>\n</html>` });
      ctx.changed("pages"); ctx.go("#/p/" + r.page.id);
    });
    $("#np-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const purpose = ta.value.trim(); if (!purpose) return ta.focus();
      const btn = e.currentTarget.querySelector("button[type=submit]"); busy(btn, "페이지 짜는 중…", true);
      try {
        const r = await api.aiPageCode({ purpose, model: aiPrefs().model || undefined });
        toast(r.reply || "만들었어요."); ctx.changed("pages"); ctx.go("#/p/" + r.page.id);
      } catch (err) { toast(err.message || "만들지 못했어요."); busy(btn, "", false); }
    });
  }

  // ---------- 보기 ----------
  async function open(pid) {
    stopRun?.(); stopRun = null; id = pid; chat = [];
    root.innerHTML = `<div class="upage"><div class="upage-bar glass" id="up-bar"></div><div class="upage-main"><div class="upage-host" id="up-host"></div><aside class="upage-panel glass" id="up-panel" hidden></aside></div></div>`;
    try { page = (await api.page(pid)).page; } catch (e) { root.innerHTML = `<div class="view"><p class="faint">${esc(e.message || "페이지를 열 수 없어요.")}</p></div>`; return; }
    drawBar(); run();
  }
  const mine = () => page && page.user_id === ctx.me.id;
  function run() { stopRun?.(); stopRun = mountRunner($("#up-host", root), ctx, page); }
  function drawBar() {
    const owner = ctx.user(page.user_id);
    $("#up-bar", root).innerHTML = `
      <span class="upage-ic">${esc(page.icon || "✨")}</span><b class="upage-title">${esc(page.title)}</b>
      <span class="faint upage-sub">${mine() ? (page.shared ? "셋에게 공개" : "나만") : `${esc(owner?.display_name || "")} 의 페이지 · 읽기만`}</span>
      <span class="spacer"></span>
      <button class="icon-btn" type="button" id="up-reload" title="다시 불러오기">${icon.reset(16)}</button>
      ${mine() ? `<button class="btn sm ${panel ? "accent" : "ghost"}" type="button" id="up-edit">${icon.spark(14)} 고치기</button>` : ""}`;
    $("#up-reload", root).addEventListener("click", run);
    $("#up-edit", root)?.addEventListener("click", () => togglePanel(panel ? null : "ai"));
  }

  // ---------- 옆 패널: AI 대화 · 코드 · 버전 · 설정 ----------
  function togglePanel(tab) {
    panel = tab; const el = $("#up-panel", root); el.hidden = !tab; drawBar();
    if (tab) drawPanel();
  }
  async function drawPanel() {
    const el = $("#up-panel", root);
    el.innerHTML = `
      <nav class="seg up-tabs" role="tablist">${[["ai", "AI 에게"], ["code", "코드"], ["versions", "버전"], ["settings", "설정"]].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${panel === k}">${l}</button>`).join("")}<button class="icon-btn" type="button" id="up-close" aria-label="닫기">${icon.x(14)}</button></nav>
      <div class="up-body" id="up-body"></div>`;
    el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { panel = b.dataset.tab; drawPanel(); }));
    $("#up-close", el).addEventListener("click", () => togglePanel(null));
    const body = $("#up-body", el);
    if (panel === "ai") {
      body.innerHTML = `<div class="up-chat" id="up-chat">${chat.length ? chat.map((m) => `<div class="up-msg ${m.role}">${esc(m.text)}</div>`).join("") : `<p class="faint">바꾸고 싶은 걸 적으면 페이지를 고쳐요. 예: "막대를 파이로 바꿔 줘" · "오늘 날짜를 위에 크게" · "버튼을 더 크게, 색은 초록"</p>`}</div>
        <form class="up-ask" id="up-ask"><textarea class="input" id="up-in" rows="2" maxlength="1000" placeholder="AI 에게: 어떻게 고칠까요?"></textarea><button class="btn sm accent" type="submit">고치기</button></form>`;
      const chatEl = $("#up-chat", body); chatEl.scrollTop = chatEl.scrollHeight;
      $("#up-ask", body).addEventListener("submit", async (e) => {
        e.preventDefault();
        const inp = $("#up-in", body), instruction = inp.value.trim(); if (!instruction) return inp.focus();
        const btn = e.currentTarget.querySelector("button"); busy(btn, "고치는 중…", true);
        chat.push({ role: "me", text: instruction }); drawPanel();
        try {
          const r = await api.aiPageCode({ page_id: page.id, instruction, model: aiPrefs().model || undefined });
          page = r.page; chat.push({ role: "ai", text: r.reply || "고쳤어요." }); ctx.changed("pages"); drawBar(); run();
        } catch (err) { chat.push({ role: "ai", text: "실패: " + (err.message || "다시 시도해 주세요.") }); }
        if (panel === "ai") drawPanel();
      });
      $("#up-in", body).addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("#up-ask", body).requestSubmit(); } });
    } else if (panel === "code") {
      body.innerHTML = `<p class="faint">HTML 한 파일이에요. <code>window.trio</code> 브리지로 앱 데이터를 읽고 써요 (<a href="#" id="up-guide">규칙 보기</a>). 저장하면 바로 다시 그려요 · 이전 코드는 '버전'에 남아요.</p>
        <textarea class="input up-code" id="up-code" spellcheck="false">${esc(page.code || "")}</textarea>
        <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn sm ghost" type="button" id="up-code-run">저장 없이 미리보기</button><button class="btn sm accent" type="button" id="up-code-save">저장</button></div>`;
      $("#up-guide", body).addEventListener("click", async (e) => { e.preventDefault(); const g = (await api.raw("GET", "/pages/guide")).guide; body.insertAdjacentHTML("afterbegin", `<pre class="up-guide">${esc(g)}</pre>`); });
      $("#up-code-run", body).addEventListener("click", () => { const code = $("#up-code", body).value; stopRun?.(); stopRun = mountRunner($("#up-host", root), ctx, { ...page, code }); });
      $("#up-code-save", body).addEventListener("click", async (e) => {
        busy(e.currentTarget, "저장 중…", true);
        try { page = (await api.updatePage(page.id, { code: $("#up-code", body).value, note: "코드 탭에서 직접 고침" })).page; toast("저장했어요."); ctx.changed("pages"); run(); }
        catch (err) { toast(err.message); }
        busy(e.currentTarget, "", false);
      });
    } else if (panel === "versions") {
      body.innerHTML = `<p class="faint">불러오는 중…</p>`;
      const { versions } = await api.pageVersions(page.id);
      body.innerHTML = versions.length ? `<ul class="up-vers">${versions.map((v) => `<li><span><b>${when(v.created_at)}</b> <span class="faint">· ${esc(v.note || "")} · ${Math.round(v.size / 1000)}k</span></span><button class="btn sm ghost" type="button" data-restore="${v.id}">이 버전으로</button></li>`).join("")}</ul>` : `<p class="faint">아직 이전 버전이 없어요. 고칠 때마다 여기 쌓여요.</p>`;
      body.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => {
        busy(b, "되돌리는 중…", true);
        try { page = (await api.restorePage(page.id, b.dataset.restore)).page; toast("되돌렸어요. (되돌리기 전 코드도 버전에 남아요)"); run(); drawPanel(); } catch (err) { toast(err.message); busy(b, "", false); }
      }));
    } else if (panel === "settings") {
      body.innerHTML = `<form class="up-set" id="up-set">
        <label>이름<input class="input" name="title" value="${esc(page.title)}" maxlength="40"></label>
        <label>아이콘 (이모지 하나)<input class="input" name="icon" value="${esc(page.icon)}" maxlength="2" style="width:80px"></label>
        <label>목적<textarea class="input" name="purpose" rows="2" maxlength="1000">${esc(page.purpose || "")}</textarea></label>
        <label class="row" style="gap:8px"><input type="checkbox" name="shared" ${page.shared ? "checked" : ""}> 셋에게 공개 (친구는 보기만 · 쓰기는 안 돼요)</label>
        <div class="row" style="justify-content:space-between"><button class="btn sm danger ghost" type="button" id="up-del">${icon.trash(14)} 삭제</button><button class="btn sm accent" type="submit">저장</button></div>
      </form>`;
      $("#up-set", body).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = e.currentTarget;
        try { page = (await api.updatePage(page.id, { title: f.title.value, icon: f.icon.value, purpose: f.purpose.value, shared: f.shared.checked })).page; toast("저장했어요."); ctx.changed("pages"); drawBar(); } catch (err) { toast(err.message); }
      });
      $("#up-del", body).addEventListener("click", async () => {
        if (!confirm(`'${page.title}' 페이지를 지울까요? 되돌릴 수 없어요.`)) return;
        await api.deletePage(page.id); toast("지웠어요."); ctx.changed("pages"); ctx.go("#/");
      });
    }
  }

  inst = { update: (nr) => { const next = nr.id || "new"; if (next === "new") { if (id !== "new") { stopRun?.(); stopRun = null; id = "new"; drawNew(); } } else if (next !== id) open(next); } };
  if (!r.id || r.id === "new") { id = "new"; drawNew(); } else open(r.id);
  return () => { stopRun?.(); inst = null; };
}

// Dock 사용자 페이지 — #/p/new (목적 적어 AI 로 만들기) · #/p/<id> (보기 · 내 것이면 옆 패널에서 AI 대화로 고치기 · 코드 · 버전)
import { api } from "../api.js";
import { $, $$, esc, toast } from "../util.js";
import { icon } from "../icons.js";
import { mountRunner } from "../page-runner.js";
import { aiPrefs, mountAiPick } from "../ai-pick.js";

const model = () => aiPrefs().model || "gemini"; // 긴 코드 출력은 Gemini 가 가장 안정적

const when = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let id = null, page = null, stopRun = null, panel = null, chat = [], S_file = "index.html";
  const busy = (btn, label, on) => { if (!btn) return; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label; btn.disabled = true; } else { btn.textContent = btn.dataset.l || btn.textContent; btn.disabled = false; } };

  // ---------- 새 페이지 ----------
  function drawNew() {
    root.innerHTML = `
      <div class="view upage-new">
        <h1 class="upage-hello">무엇을 만들까요?</h1>
        <form class="composer" id="np-form">
          <textarea class="composer-ta" id="np-purpose" rows="1" maxlength="1000" placeholder="하고 싶은 화면을 한두 문장으로 적어 주세요" aria-label="페이지 목적"></textarea>
          <div class="composer-row">
            <span id="np-pick"></span>
            <span class="spacer"></span>
            <button class="composer-blank" type="button" id="np-blank">빈 페이지</button>
            <button class="composer-send" type="submit" aria-label="AI 로 만들기" title="AI 로 만들기">${icon("send")}</button>
          </div>
        </form>
        <form class="urlbar" id="nu-form">
          ${icon("external")}<input class="urlbar-in" id="nu-url" type="url" placeholder="또는 URL 붙여넣기" aria-label="사이트 주소"><button class="urlbar-go" type="submit">Add URL</button>
        </form>
      </div>`;
    const ta = $("#np-purpose", root); ta.focus();
    mountAiPick($("#np-pick", root), { web: false });
    $("#nu-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = $("#nu-url", root).value.trim(); if (!url) return $("#nu-url", root).focus();
      try { const host = new URL(url).hostname.replace(/^www\./, ""); const r = await api.addPage({ kind: "url", url, title: host.slice(0, 40), icon: "🔗", purpose: url }); ctx.changed("pages"); ctx.go("#/p/" + r.page.id); }
      catch (err) { toast(err.message || "주소가 이상해요."); }
    });
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 240) + "px"; };
    ta.addEventListener("input", grow); grow();
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#np-form", root).requestSubmit(); } });
    $("#np-blank", root).addEventListener("click", async () => {
      const purpose = ta.value.trim();
      const r = await api.addPage({ title: purpose.slice(0, 12) || "새 페이지", purpose }); // 서버가 index.html · style.css · app.js 뼈대를 넣어요
      ctx.changed("pages"); ctx.go("#/p/" + r.page.id);
    });
    $("#np-form", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      const purpose = ta.value.trim(); if (!purpose) return ta.focus();
      const btn = e.currentTarget.querySelector("button[type=submit]"); btn.disabled = true; ta.disabled = true; ta.placeholder = "페이지 짜는 중… 1~2분 걸릴 수 있어요";
      try {
        const r = await api.aiPageCode({ purpose, model: model() });
        toast(r.reply || "만들었어요."); ctx.changed("pages"); ctx.go("#/p/" + r.page.id);
      } catch (err) { toast(err.message || "만들지 못했어요."); btn.disabled = false; ta.disabled = false; ta.placeholder = "하고 싶은 화면을 한두 문장으로 적어 주세요"; }
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
      ${page.kind === "url" ? `<a class="btn sm ghost" href="${esc(page.url)}" target="_blank" rel="noopener noreferrer">${icon.external(14)} 새 창으로</a>` : ""}
      <button class="icon-btn" type="button" id="up-reload" title="다시 불러오기">${icon.reset(16)}</button>
      ${mine() ? `<button class="btn sm ${panel ? "accent" : "ghost"}" type="button" id="up-edit">${icon.spark(14)} 고치기</button>` : ""}`;
    $("#up-reload", root).addEventListener("click", run);
    $("#up-edit", root)?.addEventListener("click", () => togglePanel(panel ? null : "ai"));
  }

  // ---------- 옆 패널: AI 대화 · 코드 · 버전 · 설정 ----------
  function togglePanel(tab) {
    if (tab && page.kind === "url") tab = "settings"; // URL 페이지는 설정만
    panel = tab; const el = $("#up-panel", root); el.hidden = !tab; drawBar();
    if (tab) drawPanel();
  }
  async function drawPanel() {
    const el = $("#up-panel", root);
    el.innerHTML = `
      <nav class="seg up-tabs" role="tablist">${(page.kind === "url" ? [["settings", "설정"]] : [["ai", "AI 에게"], ["code", "코드"], ["versions", "버전"], ["settings", "설정"]]).map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${panel === k}">${l}</button>`).join("")}<button class="icon-btn" type="button" id="up-close" aria-label="닫기">${icon.x(14)}</button></nav>
      <div class="up-body" id="up-body"></div>`;
    el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { panel = b.dataset.tab; drawPanel(); }));
    $("#up-close", el).addEventListener("click", () => togglePanel(null));
    const body = $("#up-body", el);
    if (panel === "ai") {
      body.innerHTML = `<div class="up-chat" id="up-chat">${chat.length ? chat.map((m) => `<div class="up-msg ${m.role}">${esc(m.text)}</div>`).join("") : `<p class="faint">바꾸고 싶은 걸 적으면 페이지를 고쳐요. 예: "막대를 파이로 바꿔 줘" · "오늘 날짜를 위에 크게" · "버튼을 더 크게, 색은 초록"</p>`}</div>
        <div class="row" style="gap:8px;align-items:center;font-size:12.5px"><span class="faint">AI 모델</span><span id="up-pick"></span></div>
        <form class="up-ask" id="up-ask"><textarea class="input" id="up-in" rows="2" maxlength="1000" placeholder="AI 에게: 어떻게 고칠까요? (⌘↩ 보내기)"></textarea><button class="btn sm accent" type="submit">고치기</button></form>`;
      mountAiPick($("#up-pick", body), { web: false });
      const chatEl = $("#up-chat", body); chatEl.scrollTop = chatEl.scrollHeight;
      $("#up-ask", body).addEventListener("submit", async (e) => {
        e.preventDefault();
        const inp = $("#up-in", body), instruction = inp.value.trim(); if (!instruction) return inp.focus();
        const btn = e.currentTarget.querySelector("button"); busy(btn, "고치는 중…", true);
        chat.push({ role: "me", text: instruction }); drawPanel();
        try {
          const r = await api.aiPageCode({ page_id: page.id, instruction, model: model() });
          page = r.page; chat.push({ role: "ai", text: r.reply || "고쳤어요." }); ctx.changed("pages"); drawBar(); run();
        } catch (err) { chat.push({ role: "ai", text: "실패: " + (err.message || "다시 시도해 주세요.") }); }
        if (panel === "ai") drawPanel();
      });
      $("#up-in", body).addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("#up-ask", body).requestSubmit(); } });
    } else if (panel === "code") {
      // 파일 탭: index.html · style.css · app.js … + 새 파일 · 지우기. 저장하면 다시 그려요, 이전 묶음은 '버전'에
      const files = { ...(page.files || {}) }; let cur = S_file in files ? S_file : "index.html";
      const draw = () => {
        const names = Object.keys(files).sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
        body.innerHTML = `<div class="up-files">${names.map((n) => `<button type="button" class="up-file${n === cur ? " on" : ""}" data-f="${esc(n)}">${esc(n)}</button>`).join("")}<button type="button" class="up-file add" id="up-f-add" title="새 파일">${icon.plus(12)}</button></div>
          <textarea class="input up-code" id="up-code" spellcheck="false" aria-label="${esc(cur)}">${esc(files[cur] ?? "")}</textarea>
          <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="faint" style="font-size:12px">상대 경로 그대로 · 외부 CDN · 폰트 · 이미지 다 돼요 · <a href="#" id="up-guide">브리지 규칙</a></span>
            <div class="row" style="gap:6px">${cur !== "index.html" ? `<button class="btn sm ghost danger" type="button" id="up-f-del">${esc(cur)} 지우기</button>` : ""}<button class="btn sm ghost" type="button" id="up-code-run">저장 없이 미리보기</button><button class="btn sm accent" type="button" id="up-code-save">저장</button></div></div>`;
        const ta = $("#up-code", body);
        ta.addEventListener("input", () => { files[cur] = ta.value; });
        ta.addEventListener("keydown", (e) => { if (e.key === "Tab") { e.preventDefault(); const a = ta.selectionStart, b = ta.selectionEnd; ta.value = ta.value.slice(0, a) + "  " + ta.value.slice(b); ta.selectionStart = ta.selectionEnd = a + 2; files[cur] = ta.value; } });
        body.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { cur = S_file = b.dataset.f; draw(); }));
        $("#up-f-add", body).addEventListener("click", () => { const n = prompt("파일 이름 (예: about.html · chart.js · data.json)"); if (!n) return; const name = n.trim().replace(/^\.?\//, ""); if (!/^[\w\-. /]{1,120}$/.test(name) || name.includes("..")) return toast("이름은 글자 · 숫자 · -_./ 만 써요."); if (!(name in files)) files[name] = ""; cur = S_file = name; draw(); });
        $("#up-f-del", body)?.addEventListener("click", () => { if (!confirm(`${cur} 를 지울까요?`)) return; delete files[cur]; removed.add(cur); cur = S_file = "index.html"; draw(); });
        $("#up-guide", body).addEventListener("click", async (e) => { e.preventDefault(); const g = (await api.raw("GET", "/pages/guide")).guide; body.insertAdjacentHTML("afterbegin", `<pre class="up-guide">${esc(g)}</pre>`); });
        $("#up-code-run", body).addEventListener("click", () => { stopRun?.(); stopRun = mountRunner($("#up-host", root), ctx, page, { preview: files }); });
        $("#up-code-save", body).addEventListener("click", async (e) => {
          busy(e.currentTarget, "저장 중…", true);
          const patch = { ...files }; for (const r of removed) if (!(r in files)) patch[r] = null;
          try { page = (await api.updatePage(page.id, { files: patch, note: "코드 탭에서 직접 고침" })).page; removed.clear(); toast("저장했어요."); ctx.changed("pages"); run(); }
          catch (err) { toast(err.message); }
          busy(e.currentTarget, "", false);
        });
      };
      const removed = new Set();
      draw();
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
        ${page.kind === "url" ? `<label>주소<input class="input" name="url" type="url" value="${esc(page.url || "")}"></label>` : `<label>목적<textarea class="input" name="purpose" rows="2" maxlength="1000">${esc(page.purpose || "")}</textarea></label>`}
        <label class="row" style="gap:8px"><input type="checkbox" name="shared" ${page.shared ? "checked" : ""}> 셋에게 공개 (친구는 보기만 · 쓰기는 안 돼요)</label>
        <div class="row" style="justify-content:space-between"><button class="btn sm danger ghost" type="button" id="up-del">${icon.trash(14)} 삭제</button><button class="btn sm accent" type="submit">저장</button></div>
      </form>`;
      $("#up-set", body).addEventListener("submit", async (e) => {
        e.preventDefault(); const f = e.currentTarget;
        try { page = (await api.updatePage(page.id, { title: f.title.value, icon: f.icon.value, ...(page.kind === "url" ? { url: f.url.value } : { purpose: f.purpose.value }), shared: f.shared.checked })).page; toast("저장했어요."); ctx.changed("pages"); drawBar(); run(); } catch (err) { toast(err.message); }
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

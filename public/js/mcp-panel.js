// MCP 연결 (프로필 메뉴 → "MCP 연결"): 각자 자기 토큰을 받고 · 보고 · 끊어요.
// 토큰은 만들 때 한 번만 보여요. 어떤 MCP 클라이언트든(Claude Code · Cursor · VS Code · 그 밖의 앱) 주소 + 헤더로 붙어요.
import { api } from "./api.js";
import { esc, toast } from "./util.js";
import { icon } from "./icons.js";

const fmt = (ms) => (ms ? new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "아직 안 씀");

function snippets(url, token, name) {
  const h = `Authorization: Bearer ${token}`;
  return [
    { k: "주소", v: url },
    { k: "헤더", v: h },
    { k: "Claude Code", v: `claude mcp add --transport http swx2 ${url} --header "${h}"` },
    { k: "Cursor · VS Code (mcp.json)", v: JSON.stringify({ mcpServers: { "swx2": { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2) },
    { k: "원격 연결이 안 되는 앱 (stdio)", v: `npx -y mcp-remote ${url} --header "${h}"` },
  ].map((s) => ({ ...s, name }));
}

export function openMcpPanel(ctx) {
  if (document.querySelector(".mcp-back")) return;
  const prevFocus = document.activeElement;
  const back = document.createElement("div");
  back.className = "palette-back pw-back mcp-back";
  back.innerHTML = `
    <section class="pw-dialog glass mcp-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-title">
      <div class="pw-head"><h2 id="mcp-title">MCP 연결</h2><button class="icon-btn sm" type="button" data-close aria-label="닫기">${icon.x(16)}</button></div>
      <p class="pw-help">AI 에이전트 · 에디터(Claude Code, Cursor, VS Code 등)가 <b>내 계정</b>으로 논문 자료 · 노트 · 계획 · 에이전트 작업판을 쓰게 해요.
        연결마다 토큰을 하나씩 만들고, 안 쓰면 끊어요. 서버는 앱과 같이 클라우드에서 돌아요.</p>
      <div class="mcp-body" id="mcp-body"><p class="faint">불러오는 중…</p></div>
    </section>`;
  document.body.append(back);
  const body = back.querySelector("#mcp-body");
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) close(); });

  let info = null, fresh = null, widget = null; // widget = 방금 만든 위젯 연결 주소 (triowidget://…) // fresh = 방금 만든 토큰 (이 창이 닫히면 다시 못 봐요)

  function paint() {
    const list = info.tokens.length
      ? `<ul class="mcp-list">${info.tokens.map((t) => `<li><span class="mcp-name">${esc(t.agent)}</span><span class="faint">만든 날 ${esc(fmt(t.created_at))} · 마지막 사용 ${esc(fmt(t.last_used_at))}</span>
          <button class="btn ghost sm" type="button" data-renew="${esc(t.agent)}" title="새 토큰으로 바꾸면 옛 토큰은 바로 못 써요">새 토큰</button>
          <button class="btn ghost sm mcp-revoke" type="button" data-revoke="${esc(t.agent)}">끊기</button></li>`).join("")}</ul>`
      : `<p class="faint">아직 연결이 없어요.</p>`;
    body.innerHTML = `
      ${fresh ? `<div class="mcp-fresh" role="status">
          <b>${esc(fresh.name)} 토큰을 만들었어요 — 지금만 보여요.</b> 창을 닫기 전에 복사해서 쓰는 앱에 넣어 주세요. 잃어버리면 '새 토큰'으로 다시 만들면 돼요.
          ${snippets(fresh.url, fresh.token, fresh.name).map((s, i) => `<div class="mcp-snip"><div class="mcp-snip-k">${esc(s.k)}<button class="btn ghost sm" type="button" data-copy="${i}">복사</button></div><pre>${esc(s.v)}</pre></div>`).join("")}
        </div>` : ""}
      <h3 class="mcp-h">Mac 위젯</h3>
      <div class="mcp-oauth-how">바탕화면 위젯 + 맥 알림(집중 시작 · 끝 · 자동 집중)을 띄우는 TrioWidget 앱이에요.
        <ol class="mcp-steps"><li><a class="btn sm" href="/downloads/TrioWidget.zip" download>TrioWidget 받기 (Mac)</a> → 압축을 풀어요.</li>
        <li><b>설치.command</b> 를 <b>오른쪽 클릭 → 열기 → 열기</b> (처음 한 번만 이렇게 해요). 앱이 설치되고 켜져요. 열기가 막히면 <b>시스템 설정 → 개인정보 보호 및 보안</b> 맨 아래 <b>그래도 열기</b>.</li>
        <li>알림 허용 창이 뜨면 <b>허용</b>. 그다음 아래 버튼을 누르면 내 계정에 연결돼요.</li></ol>
        ${widget ? `<div class="mcp-widget-go"><a class="btn accent sm" href="${esc(widget)}">TrioWidget 에 연결</a><button class="btn ghost sm" type="button" data-copy-widget>연결 주소 복사</button></div><p class="faint">이 주소는 지금만 보여요. 앱의 '연결 주소 붙여 넣기'에 넣어도 돼요.</p>`
          : `<div class="mcp-widget-go"><button class="btn sm" type="button" data-widget>${info.tokens.some((t) => t.agent === "mac-widget") ? "다시 연결 (새 토큰)" : "위젯 연결 만들기"}</button></div>`}</div>
      <h3 class="mcp-h">Windows · 다른 컴퓨터</h3>
      <div class="mcp-oauth-how">설치할 것 없이 Chrome 이나 Edge 로 돼요. 집중 시작 · 끝 · 자동 집중이 Windows 알림(오른쪽 아래)으로 와요.
        <ol class="mcp-steps"><li>Chrome · Edge 로 SWx2 에 로그인 → 주소창 오른쪽 <b>설치(⊕) 아이콘</b> → 설치 (작업 표시줄에 앱처럼 생겨요)</li>
        <li>아래 버튼 → 알림 <b>허용</b> → 테스트 알림이 뜨면 끝</li>
        <li>창을 닫아도 오게: 브라우저 설정 → 시스템 → <b>앱을 닫아도 백그라운드 앱 계속 실행</b> 켜기 · Windows 설정 → 알림에서 Chrome/Edge 켜기</li></ol>
        <div class="mcp-widget-go"><button class="btn sm" type="button" data-push-test>알림 켜고 테스트</button></div></div>
            <h3 class="mcp-h">ChatGPT · claude.ai 처럼 OAuth 로 붙는 앱</h3>
      <div class="mcp-oauth-how">그 앱의 커넥터(연결) 추가 화면에 서버 주소 <code>${esc(info.url)}</code> 를 넣고 인증을 <b>OAuth</b> 로 두면,
        이 앱의 로그인 · 허용 화면이 떠요. 내 아이디로 로그인해서 <b>허용</b>을 누르면 끝이에요. 토큰을 따로 만들 필요 없어요.</div>
      ${info.oauth?.length ? `<ul class="mcp-list">${info.oauth.map((o) => `<li><span class="mcp-name">${esc(o.client_name)}</span><span class="faint">OAuth · 허용한 날 ${esc(fmt(o.created_at))} · 마지막 사용 ${esc(fmt(o.last_used_at))}</span>
          <button class="btn ghost sm mcp-revoke" type="button" data-revoke-oauth="${esc(o.client_id)}" data-label="${esc(o.client_name)}">끊기</button></li>`).join("")}</ul>` : `<p class="faint">OAuth 로 붙은 앱이 아직 없어요.</p>`}
      <h3 class="mcp-h">토큰으로 붙는 앱 (Claude Code · Cursor · VS Code …)</h3>${list}
      <form class="mcp-new" id="mcp-new"><input class="input" name="name" placeholder="연결 이름 (예: claude-code, cursor, laptop)" maxlength="32" autocomplete="off" required pattern="[a-z0-9][a-z0-9._\\-]{0,31}">
        <button class="btn accent sm" type="submit">${icon.plus(14)} 토큰 만들기</button></form>
      <p class="faint mcp-note">이름은 영문 소문자 · 숫자 · . _ - 만. 같은 이름으로 다시 만들면 옛 토큰은 바로 못 써요. 토큰은 내 계정 권한이라 남에게 주지 마세요.</p>
      <details class="mcp-tools"><summary>쓸 수 있는 도구 ${info.tools.length}개</summary><ul>${info.tools.map((t) => `<li><code>${esc(t.name)}</code> — ${esc(t.description)}</li>`).join("")}</ul></details>
      <p class="faint mcp-note">서버 주소 <code>${esc(info.url)}</code></p>`;
    body.querySelector("[data-push-test]")?.addEventListener("click", async () => {
      // 이 브라우저를 푸시 구독 (닫혀 있어도 '집중 끝'이 오게) → 바로 테스트 알림
      try {
        if (!("Notification" in window)) return toast("이 브라우저는 알림을 못 띄워요.", "err");
        if ((await Notification.requestPermission()) !== "granted") return toast("알림이 막혀 있어요. 주소창 왼쪽 자물쇠 → 알림 → 허용.", "err");
        await (await import("./auto-focus.js")).askPush();
        const reg = await navigator.serviceWorker?.getRegistration();
        const opt = { body: "이렇게 집중 시작 · 끝을 알려 드려요", icon: "/icons/icon-192.png", tag: "swx2-test" };
        reg ? await reg.showNotification("SWx2 알림 테스트", opt) : new Notification("SWx2 알림 테스트", opt);
        toast("테스트 알림을 보냈어요. 안 보이면 Windows 설정 → 알림을 확인해요.");
      } catch (e) { toast(e.message, "err"); }
    });
    body.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      const s = snippets(fresh.url, fresh.token, fresh.name)[+b.dataset.copy];
      try { await navigator.clipboard.writeText(s.v); b.textContent = "복사됨"; setTimeout(() => (b.textContent = "복사"), 1500); } catch { toast("복사하지 못했어요. 글자를 직접 골라 복사해 주세요.", "err"); }
    }));
    body.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`'${b.dataset.revoke}' 연결을 끊을까요? 그 토큰을 쓰는 앱은 바로 접속이 안 돼요.`)) return;
      try { await api.mcpRevoke(b.dataset.revoke); if (fresh?.name === b.dataset.revoke) fresh = null; await load(); toast("끊었어요."); } catch (e) { toast(e.message, "err"); }
    }));
    body.querySelectorAll("[data-revoke-oauth]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`'${b.dataset.label}' 연결을 끊을까요? 그 앱에서 다시 허용해야 쓸 수 있어요.`)) return;
      try { await api.mcpRevokeOAuth(b.dataset.revokeOauth); await load(); toast("끊었어요."); } catch (e) { toast(e.message, "err"); }
    }));
    body.querySelector("[data-widget]")?.addEventListener("click", async () => {
      try { const t = await api.mcpCreate("mac-widget"); widget = `triowidget://connect?base=${encodeURIComponent(location.origin)}&token=${encodeURIComponent(t.token)}`; await load(); }
      catch (e) { toast(e.message, "err"); }
    });
    body.querySelector("[data-copy-widget]")?.addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(widget); e.currentTarget.textContent = "복사됨"; } catch { toast("복사하지 못했어요.", "err"); }
    });
    body.querySelectorAll("[data-renew]").forEach((b) => b.addEventListener("click", () => create(b.dataset.renew, true)));
    body.querySelector("#mcp-new").addEventListener("submit", (e) => { e.preventDefault(); create(e.currentTarget.name.value.trim().toLowerCase()); });
  }
  async function create(name, renew = false) {
    if (!name) return;
    if (renew && !confirm(`'${name}' 의 새 토큰을 만들까요? 지금 쓰는 토큰은 바로 못 써요.`)) return;
    try { fresh = await api.mcpCreate(name); await load(); }
    catch (e) { toast(e.message, "err"); }
  }
  async function load() {
    try { info = await api.mcpTokens(); paint(); }
    catch (e) { body.innerHTML = `<p class="pw-err">${esc(e.message || "불러오지 못했어요.")}</p>`; }
  }
  load();
  void ctx;
}

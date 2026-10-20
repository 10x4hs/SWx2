// 입장 화면 — 구름 위 유리 알약 하나. 아이디 → 비밀번호 순서로 같은 자리에서 바뀌어요.
import { api } from "../api.js";
import { $, esc } from "../util.js";

const arrow = `<svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><path d="M1 7h17M12 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function mountAuth(root, { onDone }) {
  // step: user → pass (로그인) / s-user → s-pass → s-pass2 (가입 신청)
  let step = "user", username = "", signup = false, pw1 = "";
  document.body.classList.add("at-gate");
  root.innerHTML = `
    <div class="gate" id="gate">
      <div class="gate-media" aria-hidden="true"></div>
      <div class="gate-veil" aria-hidden="true"></div>
      <p class="gate-mark">SWx2</p>
      <form class="gate-form" id="gate-form" autocomplete="on" novalidate>
        <div class="pill" id="pill">
          <button type="button" class="pill-who" id="pill-who" hidden aria-label="아이디 다시 입력"></button>
          <label class="sr" for="gate-input" id="gate-label">아이디</label>
          <input class="pill-input" id="gate-input" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="아이디">
          <button class="pill-go" type="submit" aria-label="다음">${arrow}</button>
        </div>
        <p class="gate-msg" id="gate-msg" role="alert"></p>
        <div class="gate-status" id="gate-status" hidden aria-live="polite"></div>
      </form>
      <p class="gate-foot"><span id="gate-note">함께 쓰는 공부 공간</span> · <button type="button" class="gate-switch" id="gate-switch">가입 신청</button></p>
    </div>`;

  const gate = $("#gate", root), form = $("#gate-form", root), input = $("#gate-input", root);
  const pill = $("#pill", root), who = $("#pill-who", root), msg = $("#gate-msg", root), label = $("#gate-label", root), status = $("#gate-status", root);
  // 가입 승인 현황: 관리자마다 승인했는지 + [다시 확인] (비밀번호는 이 화면에서만 잠깐 들고 있어요)
  let again = null;
  const showStatus = (name, list = [], creds = null) => {
    const done = list.filter((a) => a.approved).length;
    again = creds;
    status.hidden = false; msg.textContent = "";
    status.innerHTML = `<p class="gs-h">@${esc(name)} · 가입 승인 기다리는 중</p>
      <ul class="gs-list">${list.map((a) => `<li class="${a.approved ? "ok" : ""}"><b>${esc(a.admin.toUpperCase())}</b><span>${a.approved ? "✓ 승인했어요" : "아직 확인 전"}</span></li>`).join("")}</ul>
      <p class="gs-note">${done} / ${list.length} 승인 · 모두 승인하면 바로 들어올 수 있어요</p>
      ${creds ? `<button type="button" class="gs-again" id="gs-again">다시 확인</button>` : ""}`;
    status.querySelector("#gs-again")?.addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "확인 중…";
      try { const { user } = await api.login(again.u, again.p); again = null; status.hidden = true; gate.classList.add("leaving"); setTimeout(() => { document.body.classList.remove("at-gate"); onDone(user); }, 650); }
      catch (ex) { if (ex.data?.account_state === "pending") showStatus(again.u, ex.data.approvals, again); else { status.hidden = true; shake(ex.message); } }
    });
  };
  const setHas = () => pill.classList.toggle("has", input.value.length > 0);

  const sw = $("#gate-switch", root), note = $("#gate-note", root);
  const setMode = (on) => {
    signup = on; pw1 = ""; msg.textContent = "";
    sw.textContent = on ? "로그인" : "가입 신청";
    note.textContent = on ? "관리자 두 사람이 승인하면 들어와요 · 관리자는 계정 · 팀 · 계획을 볼 수 있어요" : "함께 쓰는 공부 공간";
    toUser();
  };
  sw.addEventListener("click", () => setMode(!signup));
  const toUser = () => {
    step = signup ? "s-user" : "user";
    who.hidden = true;
    input.type = "text"; input.name = "username"; input.autocomplete = "username";
    input.placeholder = signup ? "새 아이디 (영문 3글자 · 예: hsk)" : "아이디"; label.textContent = "아이디";
    input.value = username; setHas(); input.focus();
  };
  const toPass = (again = false) => {
    step = signup ? (again ? "s-pass2" : "s-pass") : "pass";
    who.hidden = false; who.textContent = username;
    input.type = "password"; input.name = "password"; input.autocomplete = signup ? "new-password" : "current-password";
    input.placeholder = signup ? (again ? "비밀번호 한 번 더" : "비밀번호 (8자 이상)") : "비밀번호"; label.textContent = "비밀번호";
    input.value = ""; setHas(); input.focus();
  };
  const toRef = () => {
    step = "s-ref"; who.hidden = false; who.textContent = username;
    input.type = "text"; input.name = "referrer"; input.autocomplete = "off";
    input.placeholder = "친구 아이디 (선택 · 없으면 그냥 →)"; label.textContent = "친구 아이디 (선택)";
    input.value = ""; setHas(); input.focus();
  };
  const shake = (text) => {
    msg.textContent = text;
    pill.classList.remove("shake"); void pill.offsetWidth; pill.classList.add("shake");
  };

  input.addEventListener("input", () => { setHas(); msg.textContent = ""; });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape" && step !== "user" && step !== "s-user") toUser(); if (e.key === "Backspace" && /pass/.test(step) && !input.value) toUser(); });
  who.addEventListener("click", toUser);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (signup) {
      if (step === "s-user") {
        if (!/^[a-z]{3}$/.test(v.toLowerCase())) return shake("아이디는 영문 3글자예요 (예: hsk).");
        username = v.toLowerCase(); return toPass();
      }
      if (step === "s-pass") { if (input.value.length < 8) return shake("비밀번호는 8자 이상이어야 해요."); pw1 = input.value; return toPass(true); }
      if (step === "s-pass2") { if (input.value !== pw1) { toPass(); return shake("두 비밀번호가 달라요. 다시 입력해 주세요."); } return toRef(); }
      // 마지막: 추천한 친구 아이디 (선택) — 비워 두고 → 를 누르면 그냥 가입 신청
      const ref = v.toLowerCase();
      if (ref && !/^[a-z]{3}$/.test(ref)) return shake("친구 아이디는 영문 3글자예요. 없으면 비워 두세요.");
      pill.classList.add("busy");
      try {
        const r = await api.signup({ username, password: pw1, ...(ref ? { referrer: ref } : {}) });
        pill.classList.remove("busy"); setMode(false); showStatus(username, r.approvals || [], { u: username, p: pw1 });
      } catch (ex) { pill.classList.remove("busy"); if (/친구/.test(ex.message)) toRef(); else toUser(); shake(ex.message); }
      return;
    }
    if (step === "user") {
      if (!v) return shake("아이디를 입력해 주세요.");
      username = v.toLowerCase();
    } else if (!input.value) return shake("비밀번호를 입력해 주세요.");
    pill.classList.add("busy");
    try {
      // 아이디만으로 들어가요. 서버가 비밀번호를 요구하도록 설정돼 있으면 그때 비밀번호 칸으로 바꿔요
      const { user } = await api.login(username, step === "pass" ? input.value : undefined);
      gate.classList.add("leaving");
      setTimeout(() => { document.body.classList.remove("at-gate"); onDone(user); }, 650);
    } catch (ex) {
      pill.classList.remove("busy");
      if (step === "user" && ex.data?.need_password) return toPass();
      if (ex.data?.account_state === "pending") { const p = step === "pass" ? input.value : undefined; input.value = ""; setHas(); return showStatus(username, ex.data.approvals || [], { u: username, p }); }
      if (step === "pass") { input.value = ""; setHas(); }
      shake(ex.message);
    }
  });

  const media = $(".gate-media", root);
  const img = new Image();
  const reveal = () => gate.classList.add("ready");
  img.onload = reveal; img.onerror = reveal;
  img.src = "/assets/login/clouds-golden-cumulus.jpg";
  media.style.backgroundImage = `url("${esc(img.src)}")`;
  setTimeout(reveal, 2000);
  // 처음엔 선명한 구름을 보여주고, 아무 글자나 치면 입력창으로 들어가요
  const wake = (e) => { if (document.activeElement !== input && e.key.length === 1 && !e.metaKey && !e.ctrlKey) input.focus(); };
  document.addEventListener("keydown", wake);
  const off = new MutationObserver(() => { if (!gate.isConnected) { document.removeEventListener("keydown", wake); off.disconnect(); } });
  off.observe(root, { childList: true });
}

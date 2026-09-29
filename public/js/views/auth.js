// 입장 화면 — 구름 위 유리 알약 하나. 아이디 → 비밀번호 순서로 같은 자리에서 바뀌어요.
import { api } from "../api.js";
import { $, esc } from "../util.js";

const arrow = `<svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><path d="M1 7h17M12 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function mountAuth(root, { onDone }) {
  let step = "user", username = "";
  document.body.classList.add("at-gate");
  root.innerHTML = `
    <div class="gate" id="gate">
      <div class="gate-media" aria-hidden="true"></div>
      <div class="gate-veil" aria-hidden="true"></div>
      <p class="gate-mark">Dsm-mafia</p>
      <form class="gate-form" id="gate-form" autocomplete="on" novalidate>
        <div class="pill" id="pill">
          <button type="button" class="pill-who" id="pill-who" hidden aria-label="아이디 다시 입력"></button>
          <label class="sr" for="gate-input" id="gate-label">아이디</label>
          <input class="pill-input" id="gate-input" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="아이디">
          <button class="pill-go" type="submit" aria-label="다음">${arrow}</button>
        </div>
        <p class="gate-msg" id="gate-msg" role="alert"></p>
      </form>
      <p class="gate-foot">세 사람만의 공부 공간</p>
    </div>`;

  const gate = $("#gate", root), form = $("#gate-form", root), input = $("#gate-input", root);
  const pill = $("#pill", root), who = $("#pill-who", root), msg = $("#gate-msg", root), label = $("#gate-label", root);
  const setHas = () => pill.classList.toggle("has", input.value.length > 0);

  const toUser = () => {
    step = "user";
    who.hidden = true;
    input.type = "text"; input.name = "username"; input.autocomplete = "username";
    input.placeholder = "아이디"; label.textContent = "아이디";
    input.value = username; setHas(); input.focus();
  };
  const toPass = () => {
    step = "pass";
    who.hidden = false; who.textContent = username;
    input.type = "password"; input.name = "password"; input.autocomplete = "current-password";
    input.placeholder = "비밀번호"; label.textContent = "비밀번호";
    input.value = ""; setHas(); input.focus();
  };
  const shake = (text) => {
    msg.textContent = text;
    pill.classList.remove("shake"); void pill.offsetWidth; pill.classList.add("shake");
  };

  input.addEventListener("input", () => { setHas(); msg.textContent = ""; });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape" && step === "pass") toUser(); if (e.key === "Backspace" && step === "pass" && !input.value) toUser(); });
  who.addEventListener("click", toUser);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = input.value.trim();
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

// 팀 — #/teams · 초대 링크 #/teams/join/<코드>. 내 팀 목록(팀원 · 초대 코드 · 나가기), 팀 만들기, 코드로 들어가기.
// 다른 사람의 계획 · 채팅 · 논문 체크 · 공유 페이지는 같은 팀 사람끼리만 보여요. 팀이 없어도 혼자 쓸 수 있어요.
import { api } from "../api.js";
import { esc, toast } from "../util.js";

export function mount(root, ctx, r) {
  let teams = [], alive = true;
  root.innerHTML = `<div class="tm"><header class="tm-head"><h1>팀</h1><p class="faint">같은 팀 사람끼리 계획 · 대화 · 공유 페이지를 같이 봐요. 팀이 없어도 혼자 쓸 수 있어요.</p></header>
    <div class="tm-forms">
      <form class="tm-form" data-f="create"><label for="tm-name">새 팀 만들기</label><div><input class="input" id="tm-name" maxlength="20" placeholder="팀 이름" required><button class="btn sm">만들기</button></div></form>
      <form class="tm-form" data-f="join"><label for="tm-code">초대 코드로 들어가기</label><div><input class="input" id="tm-code" maxlength="20" placeholder="초대 코드" autocapitalize="off" spellcheck="false" required><button class="btn sm">들어가기</button></div></form>
    </div>
    <div class="tm-list"><p class="faint">불러오는 중…</p></div></div>`;
  const list = root.querySelector(".tm-list");

  // 팀이 바뀌면 앱 전체(멤버 목록 · 대화방)도 새로 받아요
  const reloadApp = () => setTimeout(() => location.reload(), 600);
  const draw = () => {
    list.innerHTML = teams.length ? teams.map((t) => {
      const link = t.code ? `${location.origin}/#/teams/join/${t.code}` : "";
      return `<section class="tm-card" data-id="${esc(t.id)}">
        <h2>${esc(t.name)}${t.mine ? ` <small class="faint">팀장</small>` : ""}</h2>
        <ul class="tm-members">${t.members.map((m) => `<li data-uid="${esc(m.id)}">${esc(m.display_name || m.username)} <small class="faint">@${esc(m.username)}${m.id === t.owner_id ? " · 팀장" : ""}</small>${t.mine && m.id !== ctx.me.id ? ` <button type="button" class="btn sm ghost" data-act="kick">내보내기</button>` : ""}</li>`).join("")}</ul>
        ${t.code ? `<p class="tm-code">초대 코드 <code>${esc(t.code)}</code> <button type="button" class="btn sm ghost" data-act="copy" data-link="${esc(link)}">초대 링크 복사</button> <button type="button" class="btn sm ghost" data-act="newcode">코드 새로 만들기</button></p>` : ""}
        <div class="tm-acts"><a class="btn sm ghost" href="#/room/team/${encodeURIComponent(t.id)}">팀 대화방</a><button type="button" class="btn sm ghost danger" data-act="leave">팀 나가기</button></div>
      </section>`;
    }).join("") : `<p class="faint">아직 팀이 없어요. 위에서 팀을 만들거나 친구에게 받은 초대 코드를 넣어요.</p>`;
  };
  const load = () => api.teams().then((d) => { if (!alive) return; teams = d.teams; ctx.teams = teams; draw(); }).catch((e) => { list.innerHTML = `<p class="faint">${esc(e.message)}</p>`; });

  root.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-f]"); if (!f) return;
    e.preventDefault();
    const input = f.querySelector("input"), v = input.value.trim(); if (!v) return;
    try {
      if (f.dataset.f === "create") { await api.createTeam(v); toast("팀을 만들었어요. 초대 코드를 친구에게 보내요."); }
      else { const { team } = await api.joinTeam(v); toast(`'${team.name}' 팀에 들어왔어요.`); }
      input.value = ""; await load(); reloadApp();
    } catch (err) { toast(err.message, "err"); }
  });
  list.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id, t = teams.find((x) => x.id === id);
    try {
      if (b.dataset.act === "copy") { await navigator.clipboard.writeText(b.dataset.link); toast("초대 링크를 복사했어요."); return; }
      if (b.dataset.act === "newcode") { if (!confirm("코드를 새로 만들면 예전 코드 · 링크로는 못 들어와요. 바꿀까요?")) return; await api.updateTeam(id, { new_code: true }); }
      if (b.dataset.act === "kick") { const uid = b.closest("[data-uid]").dataset.uid; if (!confirm("이 사람을 팀에서 내보낼까요?")) return; await api.leaveTeam(id, uid); }
      if (b.dataset.act === "leave") { if (!confirm(`'${t.name}' 팀에서 나갈까요?`)) return; await api.leaveTeam(id, ctx.me.id); await load(); reloadApp(); return; }
      await load();
    } catch (err) { toast(err.message, "err"); }
  });

  // 초대 링크로 왔으면 코드를 채우고 물어봐요
  if (r.code) {
    root.querySelector("#tm-code").value = r.code;
    history.replaceState(null, "", "#/teams");
    load().then(() => { if (confirm("초대받은 팀에 들어갈까요?")) root.querySelector('[data-f="join"]').requestSubmit(); });
  } else load();
  return () => { alive = false; };
}

// 관리자 — #/admin (HSK · GYK 만). 숫자(가입자 · 대기 · 정지 · 최근 7일 접속) + 회원 표.
// 가입 대기: 관리자 두 사람이 모두 '승인'해야 들어와요. 회원: 들어가기(비밀번호 없이 그 회원 화면으로) · 임시 비밀번호 · 정지 · 삭제
import { api } from "../api.js";
import { esc, toast } from "../util.js";

const STATE = { pending: "승인 대기", active: "활성", suspended: "정지" };
const ago = (t) => {
  if (!t) return "—";
  const m = Math.round((Date.now() - t) / 60e3);
  return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};
const day = (t) => (t ? new Date(t).toLocaleDateString("ko-KR") : "—");

export function mount(root, ctx) {
  if (ctx.me?.role !== "admin" || ctx.me?.impersonated_by) { root.innerHTML = `<div class="adm"><p class="faint">관리자만 볼 수 있어요.</p></div>`; return () => {}; }
  let data = null, alive = true;
  root.innerHTML = `<div class="adm"><header class="adm-head"><h1>관리자</h1><p class="faint">가입 승인 · 회원 관리</p></header><div class="adm-body"><p class="faint">불러오는 중…</p></div></div>`;
  const body = root.querySelector(".adm-body");

  const row = (u) => {
    const mine = u.approvals.includes(ctx.me.username), admin = u.role === "admin";
    const acts = u.state === "pending"
      ? `<button type="button" class="btn sm" data-act="approve" ${mine ? "disabled" : ""}>${mine ? "승인함" : "승인"}</button><button type="button" class="btn sm ghost" data-act="reject">거절</button>`
      : admin ? `<span class="faint">관리자</span>`
      : `${u.state === "active" ? `<button type="button" class="btn sm" data-act="impersonate">들어가기</button>` : ""}<button type="button" class="btn sm ghost" data-act="reset">임시 비밀번호</button><button type="button" class="btn sm ghost" data-act="suspend">${u.state === "suspended" ? "정지 풀기" : "정지"}</button><button type="button" class="btn sm ghost danger" data-act="delete">삭제</button>`;
    return `<tr data-id="${esc(u.id)}" data-name="${esc(u.username)}" class="st-${u.state}">
      <td><b>${esc(u.display_name || u.username)}</b><small>@${esc(u.username)}${admin ? " · 관리자" : ""}</small></td>
      <td><span class="adm-state">${STATE[u.state] || u.state}</span>${u.state === "pending" ? `<small>승인 ${u.approvals.length}/${data.admins.length}${u.approvals.length ? " · " + u.approvals.map(esc).join(", ") : ""}</small>` : ""}</td>
      <td>${day(u.created_at)}</td>
      <td>${ago(u.last_seen_at)}</td>
      <td>${u.must_change_pw ? "임시 (바꿔야 함)" : "설정됨"}<small>${u.pw_changed_at ? "바꾼 날 " + day(u.pw_changed_at) : ""}${u.locked_until > Date.now() ? " · 잠김" : ""}</small></td>
      <td><div class="adm-acts">${acts}</div></td></tr>`;
  };
  const draw = () => {
    const s = data.stats;
    body.innerHTML = `
      <div class="adm-stats">${[["가입자", s.total], ["활성", s.active], ["승인 대기", s.pending], ["정지", s.suspended], ["최근 7일 접속", s.seen_week]].map(([k, v]) => `<div class="adm-stat"><b>${v}</b><span>${k}</span></div>`).join("")}</div>
      <p class="adm-temp" hidden></p>
      <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>회원</th><th>상태</th><th>가입</th><th>최근 접속</th><th>비밀번호</th><th></th></tr></thead>
      <tbody>${data.users.map(row).join("")}</tbody></table></div>`;
  };
  const load = () => api.adminUsers().then((d) => { if (!alive) return; data = d; draw(); }).catch((e) => { body.innerHTML = `<p class="faint">${esc(e.message)}</p>`; });

  body.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const tr = b.closest("tr"), id = tr.dataset.id, name = tr.dataset.name, act = b.dataset.act;
    if (act === "delete" && !confirm(`@${name} 계정과 모든 기록을 지울까요? 되돌릴 수 없어요.`)) return;
    if (act === "reject" && !confirm(`@${name} 가입 신청을 거절할까요?`)) return;
    if (act === "reset" && !confirm(`@${name} 에게 임시 비밀번호를 만들까요? 그 회원의 로그인은 모두 풀려요.`)) return;
    b.disabled = true;
    try {
      if (act === "approve") { const r = await api.adminApprove(id); toast(r.active ? `@${name} 이제 들어올 수 있어요` : "승인했어요. 다른 관리자 승인을 기다려요"); }
      if (act === "reject") await api.adminReject(id);
      if (act === "suspend") await api.adminSuspend(id, !tr.classList.contains("st-suspended"));
      if (act === "delete") await api.adminDelete(id);
      if (act === "reset") {
        const { temp_password } = await api.adminResetPassword(id);
        await load();
        const p = body.querySelector(".adm-temp");
        p.hidden = false;
        p.innerHTML = `@${esc(name)} 임시 비밀번호: <code>${esc(temp_password)}</code> — 지금만 보여요. 다음 로그인 때 새 비밀번호로 바꾸게 돼요.`;
        return;
      }
      if (act === "impersonate") { await api.adminImpersonate(id); location.hash = "#/"; location.reload(); return; }
      await load();
    } catch (err) { b.disabled = false; toast(err.message, "err"); }
  });
  load();
  return () => { alive = false; };
}

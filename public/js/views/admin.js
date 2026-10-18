// 관리자 — #/admin (HSK · GYK 만). 숫자(가입자 · 대기 · 정지 · 최근 7일 접속) + 회원 표 + 회원 일정 + 팀 전체 + 공지.
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
  root.innerHTML = `<div class="adm"><header class="adm-head"><h1>관리자</h1><p class="faint">가입 승인 · 회원 · 팀 · 일정 · 공지</p></header><div class="adm-body"><p class="faint">불러오는 중…</p></div></div>`;
  const body = root.querySelector(".adm-body");

  const row = (u) => {
    const mine = u.approvals.includes(ctx.me.username), admin = u.role === "admin";
    const plansBtn = u.state !== "pending" ? `<button type="button" class="btn sm ghost" data-act="plans">일정</button>` : "";
    const acts = u.state === "pending"
      ? `<button type="button" class="btn sm" data-act="approve" ${mine ? "disabled" : ""}>${mine ? "승인함" : "승인"}</button><button type="button" class="btn sm ghost" data-act="reject">거절</button>`
      : admin ? `${plansBtn}<span class="faint">관리자</span>`
      : `${plansBtn}${u.state === "active" ? `<button type="button" class="btn sm" data-act="impersonate">들어가기</button>` : ""}<button type="button" class="btn sm ghost" data-act="reset">임시 비밀번호</button><button type="button" class="btn sm ghost" data-act="suspend">${u.state === "suspended" ? "정지 풀기" : "정지"}</button><button type="button" class="btn sm ghost danger" data-act="delete">삭제</button>`;
    return `<tr data-id="${esc(u.id)}" data-name="${esc(u.username)}" class="st-${u.state}">
      <td><b>${esc(u.display_name || u.username)}</b><small>@${esc(u.username)}${admin ? " · 관리자" : ""}</small></td>
      <td><span class="adm-state">${STATE[u.state] || u.state}</span>${u.state === "pending" ? `<small>승인 ${u.approvals.length}/${data.admins.length}${u.approvals.length ? " · " + u.approvals.map(esc).join(", ") : ""}</small>` : ""}</td>
      <td>${u.teams.length ? u.teams.map(esc).join(", ") : '<span class="faint">혼자</span>'}</td>
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
      <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>회원</th><th>상태</th><th>팀</th><th>가입</th><th>최근 접속</th><th>비밀번호</th><th></th></tr></thead>
      <tbody>${data.users.map(row).join("")}</tbody></table></div>
      <section class="adm-sec" id="adm-plans" hidden></section>
      <section class="adm-sec"><h2>공지</h2><p class="faint">모든 사람 화면 위에 떠요. 새로 올리면 예전 공지는 내려가요.</p>
        <div class="adm-ann-now"></div>
        <form class="adm-ann"><input class="input" maxlength="300" placeholder="공지 내용 (300자까지)" required><button class="btn sm">올리기</button></form></section>
      <section class="adm-sec"><h2>팀</h2><div class="adm-teams"><p class="faint">불러오는 중…</p></div></section>`;
    drawAnn(); loadTeams();
  };
  // 공지
  let ann = null;
  const drawAnn = () => { const el = body.querySelector(".adm-ann-now"); if (el) el.innerHTML = ann ? `<p class="adm-ann-cur">지금 공지: <b>${esc(ann.body)}</b> <button type="button" class="btn sm ghost" data-ann-off="${esc(ann.id)}">내리기</button></p>` : `<p class="faint">지금 공지 없음</p>`; };
  api.announcement().then((d) => { ann = d.announcement; drawAnn(); }).catch(() => {});
  body.addEventListener("submit", async (e) => {
    if (!e.target.closest(".adm-ann")) return;
    e.preventDefault();
    const inp = e.target.querySelector("input"), v = inp.value.trim(); if (!v) return;
    try { ann = (await api.adminAnnounce(v)).announcement; inp.value = ""; drawAnn(); toast("공지를 올렸어요."); } catch (err) { toast(err.message, "err"); }
  });
  // 팀 전체
  const loadTeams = () => api.adminTeams().then(({ teams }) => {
    const el = body.querySelector(".adm-teams"); if (!el) return;
    el.innerHTML = teams.length ? teams.map((t) => `<div class="adm-team"><b>${esc(t.name)}</b> <small class="faint">팀장 @${esc(t.owner || "—")} · 코드 ${esc(t.code)} · ${day(t.created_at)}</small>
      <div class="adm-team-m">${t.members.map((m) => `<span>${esc(m.display_name || m.username)} <small class="faint">@${esc(m.username)}</small></span>`).join("")}</div></div>`).join("") : '<p class="faint">아직 팀이 없어요.</p>';
  }).catch(() => {});
  // 한 회원의 일정: 오늘부터 7일
  const ymdK = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  async function showPlans(id, name, from = ymdK(Date.now())) {
    const sec = body.querySelector("#adm-plans"); sec.hidden = false;
    const to = ymdK(Date.parse(from) + 6 * 864e5);
    sec.innerHTML = `<h2>@${esc(name)} 일정</h2><p><input type="date" class="input" value="${from}" data-plans-from> 부터 7일</p><p class="faint">불러오는 중…</p>`;
    sec.dataset.id = id; sec.dataset.name = name;
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const { plans } = await api.adminPlans(id, from, to);
      const byDay = {};
      for (const p of plans) (byDay[p.period.slice(2)] ||= []).push(p);
      sec.querySelector("p.faint").outerHTML = Object.keys(byDay).length ? Object.entries(byDay).map(([d, ps]) => `<div class="adm-day"><b>${d}</b><ul>${ps.map((p) => `<li class="${p.done ? "done" : ""}">${p.start ? `<span class="mono">${esc(p.start)}</span> ` : ""}${esc(p.text)}${p.mins ? ` <small class="faint">${p.mins}분</small>` : ""}${p.done ? " ✓" : ""}</li>`).join("")}</ul></div>`).join("") : '<p class="faint">이 기간에 계획이 없어요.</p>';
    } catch (err) { toast(err.message, "err"); }
  }
  body.addEventListener("change", (e) => { const i = e.target.closest("[data-plans-from]"); if (i?.value) { const sec = body.querySelector("#adm-plans"); showPlans(sec.dataset.id, sec.dataset.name, i.value); } });
  const load = () => api.adminUsers().then((d) => { if (!alive) return; data = d; draw(); }).catch((e) => { body.innerHTML = `<p class="faint">${esc(e.message)}</p>`; });

  body.addEventListener("click", async (e) => {
    const off = e.target.closest("[data-ann-off]");
    if (off) { try { await api.adminAnnounceOff(off.dataset.annOff); ann = null; drawAnn(); } catch (err) { toast(err.message, "err"); } return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "plans") { const tr = b.closest("tr"); showPlans(tr.dataset.id, tr.dataset.name); return; }
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

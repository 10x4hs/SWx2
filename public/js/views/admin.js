// 관리자 — #/admin (HSK · GYK 만). 숫자(가입자 · 대기 · 정지 · 최근 7일 접속) + 회원 표 + 회원 일정 + 팀 전체 + 공지.
// 가입 대기: 관리자 두 사람이 모두 '승인'해야 들어와요. 회원: 들어가기(비밀번호 없이 그 회원 화면으로) · 임시 비밀번호 · 정지 · 삭제
import { api } from "../api.js";
import { esc, toast } from "../util.js";

const FEAT_SHORT = { study: "공부", diary: "일기", ai: "AI", biz: "경영", dev: "개발", pages: "페이지", mcp: "MCP" };
const STATE = { pending: "승인 대기", active: "활성", suspended: "정지" };
const ago = (t) => {
  if (!t) return "—";
  const m = Math.round((Date.now() - t) / 60e3);
  return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};
const day = (t) => (t ? new Date(t).toLocaleDateString("ko-KR") : "—");

export function mount(root, ctx) {
  if (ctx.me?.role !== "admin" || ctx.me?.impersonated_by) { root.innerHTML = `<div class="adm"><p class="faint">관리자만 볼 수 있어요.</p></div>`; return () => {}; }
  let data = null, alive = true, feats = { all: {}, requests: [], granted: [] };
  root.innerHTML = `<div class="adm"><header class="adm-head"><h1>관리자</h1><p class="faint">회원 승인 · 기능 · 공지 · 팀</p></header><div class="adm-body"><p class="faint">불러오는 중…</p></div></div>`;
  const body = root.querySelector(".adm-body");

  let tab = "users", filter = "all", q = "", open = "";
  const MENU = (u) => `<details class="adm-more"><summary class="btn sm ghost" aria-label="@${esc(u.username)} 더 보기" title="더 보기">⋯</summary><div class="adm-menu">
      ${u.state !== "pending" ? `<button type="button" data-act="plans">일정 보기</button>` : ""}
      <button type="button" data-act="excuse" title="그날은 뉴스 연속 출석이 끊기지 않아요">출석 인정</button>
      ${u.role !== "admin" ? `<button type="button" data-act="reset">임시 비밀번호</button><button type="button" data-act="suspend">${u.state === "suspended" ? "정지 풀기" : "정지"}</button><hr><button type="button" class="danger" data-act="delete">삭제</button>` : ""}</div></details>`;
  const row = (u) => {
    const mine = u.approvals.includes(ctx.me.username), admin = u.role === "admin";
    const keys = Object.keys(feats.all || {}), on = keys.filter((k) => (feats.granted || []).some((g) => g.user_id === u.id && g.feature === k));
    const main = u.state === "pending"
      ? `<button type="button" class="btn sm adm-ok" data-act="approve" ${mine ? "disabled" : ""}>${mine ? "승인함" : "승인"}</button><button type="button" class="btn sm adm-no" data-act="reject">거절</button>`
      : !admin && u.state === "active" ? `<button type="button" class="btn sm adm-go" data-act="impersonate">들어가기</button>` : "";
    const trial = u.trial_until > Date.now() ? `<span class="adm-badge trial">체험 ${Math.max(1, Math.round((u.trial_until - Date.now()) / 3600e3))}시간</span>` : "";
    const aps = u.state === "pending" ? `<div class="adm-aps" aria-label="관리자 승인 ${u.approvals.length}/${data.admins.length}">${data.admins.map((a) => { const ok = u.approvals.includes(a), t = u.approval_at?.[a]; return `<span class="adm-ap${ok ? " ok" : ""}${a === ctx.me.username ? " me" : ""}" title="${ok && t ? new Date(t).toLocaleString("ko-KR") : "아직"}"><b>${esc(a.toUpperCase())}</b>${ok ? "✓ 승인" : "대기"}</span>`; }).join("")}</div>` : "";
    const chips = admin ? '<span class="faint">관리자는 전부 열려 있어요</span>' : keys.map((k) => `<button type="button" class="adm-chip${on.includes(k) ? " on" : ""}" data-feat="${k}" aria-pressed="${on.includes(k)}" title="${esc(feats.all[k])} — 눌러서 ${on.includes(k) ? "닫기" : "열기"}">${on.includes(k) ? "✓ " : ""}${esc(FEAT_SHORT[k] || k)}</button>`).join("");
    const pw = u.must_change_pw ? `<span class="adm-badge warn" title="다음 로그인 때 바꿔야 해요">임시 비밀번호</span>` : "";
    const lock = u.locked_until > Date.now() ? `<span class="adm-badge bad">잠김</span>` : "";
    const isOpen = open === u.id;
    return `<tr data-id="${esc(u.id)}" data-name="${esc(u.username)}" class="adm-row st-${u.state}${isOpen ? " open" : ""}">
      <td class="adm-who"><b>${esc(u.display_name || u.username)}</b><small>@${esc(u.username)}${admin ? " · 관리자" : ""}</small></td>
      <td><div class="adm-badges"><span class="adm-badge st">${STATE[u.state] || u.state}</span>${trial}${pw}${lock}</div>${aps}</td>
      <td class="adm-col-team">${u.teams.length ? u.teams.map(esc).join(", ") : '<span class="faint">혼자</span>'}</td>
      <td><button type="button" class="adm-feat-sum" data-toggle aria-expanded="${isOpen}">${admin ? "전부" : `${on.length}/${keys.length}`} <span aria-hidden="true">${isOpen ? "▴" : "▾"}</span></button></td>
      <td class="adm-col-seen"><span title="가입 ${day(u.created_at)}">${ago(u.last_seen_at)}</span><small>가입 ${day(u.created_at)}</small></td>
      <td><div class="adm-acts">${main}${MENU(u)}</div></td></tr>
      ${isOpen ? `<tr class="adm-detail" data-id="${esc(u.id)}" data-name="${esc(u.username)}"><td colspan="6"><div class="adm-detail-in"><div><h3>기능 열기 · 닫기</h3><div class="adm-feats">${chips}</div></div><div class="adm-detail-meta"><span>비밀번호 ${u.must_change_pw ? "임시 (바꿔야 함)" : "설정됨"}${u.pw_changed_at ? " · 바꾼 날 " + day(u.pw_changed_at) : ""}</span><span>가입 ${day(u.created_at)}</span></div></div></td></tr>` : ""}`;
  };
  const shown = () => data.users.filter((u) => (filter === "all" || u.state === filter) && (!q || `${u.username} ${u.display_name || ""}`.toLowerCase().includes(q)));
  const drawRows = () => {
    const tb = body.querySelector(".adm-table tbody"); if (!tb) return;
    const list = shown();
    tb.innerHTML = list.length ? list.map(row).join("") : `<tr><td colspan="6" class="faint adm-empty">맞는 회원이 없어요.</td></tr>`;
    body.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-selected", b.dataset.filter === filter));
  };
  const draw = () => {
    const s = data.stats, n = feats.requests.length;
    const TABS = [["users", "회원", s.pending], ["reqs", "기능 신청", n], ["ann", "공지", 0], ["teams", "팀", 0]];
    body.innerHTML = `
      <nav class="adm-tabs" role="tablist">${TABS.map(([k, l, c]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}${c ? ` <span class="adm-count">${c}</span>` : ""}</button>`).join("")}</nav>
      <section class="adm-pane" data-pane="users" ${tab === "users" ? "" : "hidden"}>
        <div class="adm-stats">${[["all", "가입자", s.total], ["active", "활성", s.active], ["pending", "승인 대기", s.pending], ["suspended", "정지", s.suspended]].map(([k, l, v]) => `<button type="button" class="adm-stat k-${k}" data-filter="${k}" aria-selected="${filter === k}"><b>${v}</b><span>${l}</span></button>`).join("")}<div class="adm-stat k-week"><b>${s.seen_week}</b><span>최근 7일 접속</span></div></div>
        <p class="adm-temp" hidden></p>
        <div class="adm-tools"><input class="input adm-search" type="search" placeholder="이름 · 아이디 찾기" value="${esc(q)}" aria-label="회원 찾기"></div>
        <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>회원</th><th>상태</th><th class="adm-col-team">팀</th><th>기능</th><th class="adm-col-seen">최근 접속</th><th></th></tr></thead><tbody></tbody></table></div>
        <section class="adm-sec" id="adm-plans" hidden></section>
      </section>
      <section class="adm-pane" data-pane="reqs" ${tab === "reqs" ? "" : "hidden"}>${n ? feats.requests.map((r) => `<div class="adm-req" data-req="${esc(r.id)}"><div><b>${esc(r.display_name || r.username)}</b> <small class="faint">@${esc(r.username)}</small> → <span class="adm-badge">${esc(feats.all[r.feature] || r.feature)}</span>${r.note ? `<p class="adm-req-note">"${esc(r.note)}"</p>` : ""}</div><div class="adm-acts"><button type="button" class="btn sm adm-ok" data-dec="approve">승인</button><button type="button" class="btn sm adm-no" data-dec="deny">거절</button></div></div>`).join("") : '<p class="faint">새 신청 없음</p>'}</section>
      <section class="adm-pane" data-pane="ann" ${tab === "ann" ? "" : "hidden"}><p class="faint">모든 사람 화면 맨 위에 빨간 띠로 떠요. 새로 올리면 예전 공지는 내려가요.</p>
        <div class="adm-ann-now"></div>
        <form class="adm-ann"><input class="input" maxlength="300" placeholder="공지 내용 (300자까지)" required><button class="btn sm">올리기</button></form></section>
      <section class="adm-pane" data-pane="teams" ${tab === "teams" ? "" : "hidden"}><div class="adm-teams"><p class="faint">불러오는 중…</p></div></section>`;
    drawRows(); drawAnn(); loadTeams();
  };
  body.addEventListener("input", (e) => { if (e.target.matches(".adm-search")) { q = e.target.value.trim().toLowerCase(); drawRows(); } });
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
  const load = () => Promise.all([api.adminUsers(), api.adminFeatureRequests().catch(() => feats)]).then(([d, fr]) => { if (!alive) return; data = d; feats = fr; draw(); }).catch((e) => { body.innerHTML = `<p class="faint">${esc(e.message)}</p>`; });

  body.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; body.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === t)); body.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== tab; }); return; }
    const f = e.target.closest("[data-filter]");
    if (f) { filter = f.dataset.filter; drawRows(); return; }
    const tg = e.target.closest("[data-toggle]");
    if (tg) { const id = tg.closest("tr").dataset.id; open = open === id ? "" : id; drawRows(); return; }
    if (e.target.closest(".adm-menu [data-act]")) e.target.closest("details")?.removeAttribute("open");
    const dec = e.target.closest("[data-dec]");
    if (dec) { try { await api.adminDecideFeature(dec.closest("[data-req]").dataset.req, dec.dataset.dec); toast(dec.dataset.dec === "approve" ? "열어 줬어요." : "거절했어요."); await load(); } catch (err) { toast(err.message, "err"); } return; }
    const chip = e.target.closest("[data-feat]");
    if (chip) { try { await api.adminSetFeature(chip.closest("tr").dataset.id, chip.dataset.feat, !chip.classList.contains("on")); await load(); } catch (err) { toast(err.message, "err"); } return; }
    const off = e.target.closest("[data-ann-off]");
    if (off) { try { await api.adminAnnounceOff(off.dataset.annOff); ann = null; drawAnn(); } catch (err) { toast(err.message, "err"); } return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "plans") { const tr = b.closest("tr"); showPlans(tr.dataset.id, tr.dataset.name); return; }
    if (b.dataset.act === "excuse") {
      const tr = b.closest("tr"), y = new Date(Date.now() + 9 * 3600e3 - 864e5).toISOString().slice(0, 10);
      const d = prompt(`@${tr.dataset.name} 뉴스 출석을 인정할 날 (YYYY-MM-DD)`, y); if (!d) return;
      try { await api.adminNewsExcuse(tr.dataset.id, d.trim()); toast(`@${tr.dataset.name} ${d.trim()} 출석을 인정했어요 · 연속이 이어져요`); } catch (err) { toast(err.message, "err"); }
      return;
    }
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
        p.scrollIntoView({ block: "center" });
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

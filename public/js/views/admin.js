// 관리자 — #/admin (HSK · GYK 만). 숫자(가입자 · 대기 · 정지 · 최근 7일 접속) + 회원 표 + 회원 일정 + 팀 전체 + 공지.
// 가입 대기: 관리자 두 사람이 모두 '승인'해야 들어와요. 회원: 들어가기(비밀번호 없이 그 회원 화면으로) · 임시 비밀번호 · 정지 · 삭제
import { api } from "../api.js";
import { esc, toast } from "../util.js";
import { timeForm, addTime } from "../features.js";
import { Marked } from "/vendor/marked.esm.js";
import DOMPurify from "/vendor/purify.es.mjs";

// 공지 마크다운 → 안전한 HTML (미리보기 · 맨 위 띠의 '자세히' 시트가 같이 써요). 원문 HTML 은 버리고, 링크는 http(s)·mailto 만 새 탭으로
const annMd = new Marked({ gfm: true, breaks: true });
annMd.use({ renderer: { html: () => "" } });
export const ANN_IMG_SRC = /^\/api\/ann\/img\/[0-9a-f-]{8,64}\.(png|jpg|webp|gif)$/;
export function annHtml(src) {
  const frag = DOMPurify.sanitize(annMd.parse(String(src || "")), { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ["style", "form", "input", "iframe", "picture", "source", "svg"], FORBID_ATTR: ["style", "srcset"] });
  // 사진은 우리 공지 사진 주소(/api/ann/img/…)만 남겨요
  frag.querySelectorAll("img").forEach((im) => {
    const src = im.getAttribute("src") || "";
    if (!ANN_IMG_SRC.test(src)) return im.remove();
    for (const a of [...im.attributes]) if (!["src", "alt"].includes(a.name)) im.removeAttribute(a.name);
    im.loading = "lazy"; im.className = "ann-img";
  });
  frag.querySelectorAll("a").forEach((a) => {
    if (!/^(https?:|mailto:)/i.test(a.getAttribute("href") || "")) return a.replaceWith(...a.childNodes);
    a.target = "_blank"; a.rel = "noopener noreferrer";
  });
  const box = document.createElement("div"); box.append(frag);
  return box.innerHTML;
}

const FEAT_SHORT = { study: "공부", ai: "AI", biz: "경영", dev: "개발", pages: "페이지", mcp: "MCP", news: "뉴스", cim: "CIM" };
const until = (t) => { const d = new Date(t); return `~${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}까지`; };
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

  let tab = "users", filter = "all", q = "", open = "", timeFor = "";
  // 단체 메시지: 열림 · 글 · 받는 사람('all' | 'shown') · 확인 단계
  const bc = { open: false, text: "", to: "all", confirm: false, busy: false };
  const MENU = (u) => `<details class="adm-more"><summary class="btn sm ghost" aria-label="@${esc(u.username)} 더 보기" title="더 보기">⋯</summary><div class="adm-menu">
      ${u.role !== "admin" && u.state !== "pending" ? `<button type="button" data-act="message" title="그 회원의 'SWx2 관리자' 방에서 내 이름으로 대화해요">메시지 보내기</button>` : ""}
      ${u.state !== "pending" ? `<button type="button" data-act="plans">일정 보기</button>` : ""}
      <button type="button" data-act="excuse" title="그날은 뉴스 연속 출석이 끊기지 않아요">출석 인정</button>
      ${u.role !== "admin" && u.state === "active" ? `<button type="button" data-act="time">시간 추가</button>` : ""}
      ${u.role !== "admin" ? `<button type="button" data-act="reset">임시 비밀번호</button><button type="button" data-act="suspend">${u.state === "suspended" ? "정지 풀기" : "정지"}</button><hr><button type="button" class="danger" data-act="delete">삭제</button>` : ""}</div></details>`;
  const row = (u) => {
    const mine = u.approvals.includes(ctx.me.username), admin = u.role === "admin";
    const keys = Object.keys(feats.all || {}), mineG = (feats.granted || []).filter((g) => g.user_id === u.id), on = keys.filter((k) => mineG.some((g) => g.feature === k));
    const exp = Object.fromEntries(mineG.filter((g) => g.expires_at).map((g) => [g.feature, g.expires_at]));
    const main = u.state === "pending"
      ? `<button type="button" class="btn sm adm-ok" data-act="approve" ${mine ? "disabled" : ""}>${mine ? "승인함" : "승인"}</button><button type="button" class="btn sm adm-no" data-act="reject">거절</button>`
      : !admin && u.state === "active" ? `<button type="button" class="btn sm adm-go" data-act="impersonate">들어가기</button>` : "";
    const trial = u.trial_until > Date.now() ? `<span class="adm-badge trial">체험 ${Math.max(1, Math.round((u.trial_until - Date.now()) / 3600e3))}시간</span>` : "";
    const aps = u.state === "pending" ? `<div class="adm-aps" aria-label="관리자 승인 ${u.approvals.length}/${data.admins.length}">${data.admins.map((a) => { const ok = u.approvals.includes(a), t = u.approval_at?.[a]; return `<span class="adm-ap${ok ? " ok" : ""}${a === ctx.me.username ? " me" : ""}" title="${ok && t ? new Date(t).toLocaleString("ko-KR") : "아직"}"><b>${esc(a.toUpperCase())}</b>${ok ? "✓ 승인" : "대기"}</span>`; }).join("")}</div>` : "";
    const chips = admin ? '<span class="faint">관리자는 전부 열려 있어요</span>' : keys.map((k) => `<button type="button" class="adm-chip${on.includes(k) ? " on" : ""}" data-feat="${k}" aria-pressed="${on.includes(k)}" title="${esc(feats.all[k])}${exp[k] ? " · " + until(exp[k]) : ""} — 눌러서 ${on.includes(k) ? "닫기" : exp[k] ? "계속 열기" : "열기"}">${on.includes(k) ? "✓ " : ""}${esc(FEAT_SHORT[k] || k)}${exp[k] ? ` <small>${until(exp[k])}</small>` : ""}</button>`).join("");
    const pw = u.must_change_pw ? `<span class="adm-badge warn" title="다음 로그인 때 바꿔야 해요">임시 비밀번호</span>` : "";
    const lock = u.locked_until > Date.now() ? `<span class="adm-badge bad">잠김</span>` : "";
    const isOpen = open === u.id;
    return `<tr data-id="${esc(u.id)}" data-name="${esc(u.username)}" class="adm-row st-${u.state}${isOpen ? " open" : ""}">
      <td class="adm-who"><b>${esc(u.display_name || u.username)}</b><small>@${esc(u.username)}${admin ? " · 관리자" : ""}${u.referrer ? ` · 추천: @${esc(u.referrer)}` : ""}</small></td>
      <td><div class="adm-badges"><span class="adm-badge st">${STATE[u.state] || u.state}</span>${trial}${pw}${lock}</div>${aps}</td>
      <td class="adm-col-team">${u.teams.length ? u.teams.map(esc).join(", ") : '<span class="faint">혼자</span>'}</td>
      <td><button type="button" class="adm-feat-sum" data-toggle aria-expanded="${isOpen}">${admin ? "전부" : `${on.length}/${keys.length}`} <span aria-hidden="true">${isOpen ? "▴" : "▾"}</span></button></td>
      <td class="adm-col-seen"><span title="가입 ${day(u.created_at)}">${ago(u.last_seen_at)}</span><small>가입 ${day(u.created_at)}</small></td>
      <td><div class="adm-acts">${main}${MENU(u)}</div></td></tr>
      ${timeFor === u.id ? `<tr class="adm-detail" data-id="${esc(u.id)}" data-name="${esc(u.username)}"><td colspan="6">${timeForm(feats.all)}</td></tr>` : ""}
      ${isOpen ? `<tr class="adm-detail" data-id="${esc(u.id)}" data-name="${esc(u.username)}"><td colspan="6"><div class="adm-detail-in"><div><h3>기능 열기 · 닫기</h3><div class="adm-feats">${chips}</div></div><div class="adm-detail-meta"><span>비밀번호 ${u.must_change_pw ? "임시 (바꿔야 함)" : "설정됨"}${u.pw_changed_at ? " · 바꾼 날 " + day(u.pw_changed_at) : ""}</span><span>가입 ${day(u.created_at)}</span></div></div></td></tr>` : ""}`;
  };
  // 기능 신청도 관리자 모두가 승인해야 열려요 — 관리자마다 ✓ / 대기
  const reqAps = (r) => `<div class="adm-aps" aria-label="관리자 승인 ${(r.approvals || []).length}/${(feats.admins || []).length}">${(feats.admins || []).map((a) => { const ok = (r.approvals || []).includes(a), t = r.approval_at?.[a]; return `<span class="adm-ap${ok ? " ok" : ""}${a === ctx.me.username ? " me" : ""}" title="${ok && t ? new Date(t).toLocaleString("ko-KR") : "아직"}"><b>${esc(a.toUpperCase())}</b>${ok ? "✓ 승인" : "대기"}</span>`; }).join("")}</div>`;
  const shown = () => data.users.filter((u) => (filter === "all" || u.state === filter) && (!q || `${u.username} ${u.display_name || ""}`.toLowerCase().includes(q)));
  // 단체 메시지를 받을 수 있는 사람: 활성 회원(관리자 빼고) · 'shown' 이면 지금 필터 · 찾기 결과 안에서만
  const bcAll = () => data.users.filter((u) => u.role !== "admin" && u.state === "active");
  const bcShown = () => shown().filter((u) => u.role !== "admin" && u.state === "active");
  const bcTargets = () => (bc.to === "shown" ? bcShown() : bcAll());
  const drawBc = () => {
    const el = body.querySelector(".adm-bc"); if (!el) return;
    el.hidden = !bc.open;
    body.querySelector("[data-bc-toggle]")?.setAttribute("aria-expanded", String(bc.open));
    if (!bc.open) { el.innerHTML = ""; return; }
    const n = bcTargets().length, na = bcAll().length, ns = bcShown().length;
    el.innerHTML = bc.confirm
      ? `<p class="adm-bc-ask"><b>${n}명</b>에게 보낼까요? 회원마다 'SWx2 관리자' 방에 따로 가서 서로는 못 봐요.</p>
        <blockquote class="adm-bc-quote">${esc(bc.text)}</blockquote>
        <div class="adm-bc-row"><button type="button" class="btn sm accent" data-bc="go" ${bc.busy ? "disabled" : ""}>${bc.busy ? "보내는 중…" : "보내기"}</button><button type="button" class="btn sm ghost" data-bc="back" ${bc.busy ? "disabled" : ""}>고치기</button></div>`
      : `<label class="adm-bc-lab" for="adm-bc-text">모두에게 메시지 <small class="faint">회원마다 'SWx2 관리자' 방에 내 이름으로 따로 가요</small></label>
        <textarea class="input adm-bc-text" id="adm-bc-text" rows="3" maxlength="2000" placeholder="보낼 내용 (2000자까지)">${esc(bc.text)}</textarea>
        <div class="adm-bc-row" role="radiogroup" aria-label="받는 사람">
          <label class="adm-bc-to"><input type="radio" name="adm-bc-to" value="all" ${bc.to === "all" ? "checked" : ""}> 모두 <small class="faint" data-bc-n="all">${na}명</small></label>
          <label class="adm-bc-to"><input type="radio" name="adm-bc-to" value="shown" ${bc.to === "shown" ? "checked" : ""}> 지금 보이는 사람들 <small class="faint" data-bc-n="shown">${ns}명</small></label>
        </div>
        <p class="faint adm-bc-note">관리자 · 승인 대기 · 정지 회원은 빠져요.</p>
        <div class="adm-bc-row"><button type="button" class="btn sm accent" data-bc="next" ${bc.text.trim() && n ? "" : "disabled"}>보내기</button><button type="button" class="btn sm ghost" data-bc="close">닫기</button></div>`;
  };
  // 필터 · 찾기가 바뀌면 사람 수만 고쳐요 (쓰던 글 · 커서는 그대로)
  const bcCounts = () => {
    const el = body.querySelector(".adm-bc"); if (!el || !bc.open) return;
    if (bc.confirm) { bc.confirm = false; drawBc(); return; } // 확인 중에 대상이 바뀌면 다시 확인
    const a = el.querySelector('[data-bc-n="all"]'), sh = el.querySelector('[data-bc-n="shown"]'), nx = el.querySelector('[data-bc="next"]');
    if (a) a.textContent = bcAll().length + "명";
    if (sh) sh.textContent = bcShown().length + "명";
    if (nx) nx.disabled = !bc.text.trim() || !bcTargets().length;
  };
  const drawRows = () => {
    bcCounts();
    const tb = body.querySelector(".adm-table tbody"); if (!tb) return;
    const list = shown();
    tb.innerHTML = list.length ? list.map(row).join("") : `<tr><td colspan="6" class="faint adm-empty">맞는 회원이 없어요.</td></tr>`;
    body.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-selected", b.dataset.filter === filter));
  };
  const draw = () => {
    const s = data.stats, n = feats.requests.length;
    const TABS = [["users", "회원", s.pending], ["reqs", "기능 신청", n], ["ann", "공지", 0], ["teams", "팀", 0], ["decide", "AI 판정", 0]];
    body.innerHTML = `
      <nav class="adm-tabs" role="tablist">${TABS.map(([k, l, c]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}${c ? ` <span class="adm-count">${c}</span>` : ""}</button>`).join("")}</nav>
      <section class="adm-pane" data-pane="users" ${tab === "users" ? "" : "hidden"}>
        <div class="adm-stats">${[["all", "가입자", s.total], ["active", "활성", s.active], ["pending", "승인 대기", s.pending], ["suspended", "정지", s.suspended]].map(([k, l, v]) => `<button type="button" class="adm-stat k-${k}" data-filter="${k}" aria-selected="${filter === k}"><b>${v}</b><span>${l}</span></button>`).join("")}<div class="adm-stat k-week"><b>${s.seen_week}</b><span>최근 7일 접속</span></div></div>
        <p class="adm-temp" hidden></p>
        <div class="adm-tools"><input class="input adm-search" type="search" placeholder="이름 · 아이디 찾기" value="${esc(q)}" aria-label="회원 찾기"><button type="button" class="btn sm" data-bc-toggle aria-expanded="${bc.open}" aria-controls="adm-bc">모두에게 메시지</button></div>
        <div class="adm-bc" id="adm-bc" hidden></div>
        <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>회원</th><th>상태</th><th class="adm-col-team">팀</th><th>기능</th><th class="adm-col-seen">최근 접속</th><th></th></tr></thead><tbody></tbody></table></div>
        <section class="adm-sec" id="adm-plans" hidden></section>
      </section>
      <section class="adm-pane" data-pane="reqs" ${tab === "reqs" ? "" : "hidden"}>${n ? feats.requests.map((r) => `<div class="adm-req" data-req="${esc(r.id)}"><div><b>${esc(r.display_name || r.username)}</b> <small class="faint">@${esc(r.username)}</small> → <span class="adm-badge">${esc(feats.all[r.feature] || r.feature)}</span>${r.note ? `<p class="adm-req-note">"${esc(r.note)}"</p>` : ""}</div>${reqAps(r)}<div class="adm-acts"><button type="button" class="btn sm adm-ok" data-dec="approve" ${(r.approvals || []).includes(ctx.me.username) ? "disabled" : ""}>${(r.approvals || []).includes(ctx.me.username) ? "승인함" : "승인"}</button><button type="button" class="btn sm adm-no" data-dec="deny">거절</button></div></div>`).join("") : '<p class="faint">새 신청 없음</p>'}</section>
      <section class="adm-pane" data-pane="ann" ${tab === "ann" ? "" : "hidden"}><p class="faint">켜 둔 공지가 모든 사람 화면 맨 위에 빨간 띠로 줄줄이 떠요 (위에서부터 3줄 · 나머지는 "+N개 더"). 고치면 닫았던 사람에게도 다시 떠요.</p>
        <div class="adm-ann-now adm-ann-list"></div>
        <form class="adm-ann"><input type="hidden" class="adm-ann-id"><textarea class="input adm-ann-text" rows="6" maxlength="4000" placeholder="# 제목&#10;내용을 마크다운으로 써요" required></textarea>
          <div class="adm-ann-pv ann-md" hidden></div>
          <label class="adm-ann-end">끝나는 날 <input type="date" class="input adm-ann-date" aria-label="공지 끝나는 날"> <small class="faint">이 날이 지나면 자동으로 안 보여요 · 비우면 계속</small></label>
          <p class="faint adm-ann-hint"># 제목 · **굵게** · *기울임* · - 목록 · [글자](https://주소) · \`코드\` · 사진은 끌어다 놓거나 붙여 넣어도 돼요 — 첫 줄이 띠에 떠요</p>
          <div class="adm-acts"><button type="button" class="btn sm ghost" data-ann-img>사진 넣기</button><input type="file" class="adm-ann-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><button type="button" class="btn sm ghost" data-ann-pv aria-pressed="false">미리보기</button><button type="button" class="btn sm ghost" data-ann-cancel hidden>새로 쓰기</button><button class="btn sm">올리기</button></div></form></section>
      <section class="adm-pane" data-pane="teams" ${tab === "teams" ? "" : "hidden"}><div class="adm-teams"><p class="faint">불러오는 중…</p></div></section>
      <section class="adm-pane" data-pane="decide" ${tab === "decide" ? "" : "hidden"}><div class="adm-decide"><p class="faint">불러오는 중…</p></div></section>`;
    drawRows(); drawBc(); drawAnn(); loadTeams(); loadDecide();
  };
  body.addEventListener("input", (e) => {
    if (e.target.matches(".adm-search")) { q = e.target.value.trim().toLowerCase(); drawRows(); }
    if (e.target.matches(".adm-bc-text")) { bc.text = e.target.value; bcCounts(); }
  });
  // 공지
  let anns = [], editId = "";
  const kday = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);   // 끝나는 때(ms) → 한국 날짜
  const kend = (d) => (d ? Date.parse(d + "T23:59:59.999+09:00") : null);     // 날짜 → 그날 끝 (한국 시간)
  const drawAnn = () => {
    const el = body.querySelector(".adm-ann-now"); if (!el) return;
    const t = Date.now();
    el.innerHTML = anns.length ? anns.map((a, i) => {
      const ended = a.ends_at != null && a.ends_at <= t, on = a.active && !ended;
      return `<div class="adm-ann-row ${on ? "" : "is-off"} ${a.id === editId ? "is-edit" : ""}" data-ann-row="${esc(a.id)}">
        <span class="adm-ann-t">${esc(a.body.split("\n").find((l) => l.trim()) || "")}</span>
        <span class="adm-badge">${ended ? "끝남" : a.active ? "보임" : "꺼짐"}</span>${a.ends_at != null ? `<small class="faint">~${kday(a.ends_at)}</small>` : ""}
        <button type="button" class="btn sm ghost" data-ann-mv="-1" ${i ? "" : "disabled"} aria-label="위로">↑</button><button type="button" class="btn sm ghost" data-ann-mv="1" ${i < anns.length - 1 ? "" : "disabled"} aria-label="아래로">↓</button>
        <button type="button" class="btn sm ghost" data-ann-act>${a.active ? "끄기" : "켜기"}</button><button type="button" class="btn sm ghost" data-ann-edit>고치기</button><button type="button" class="btn sm ghost" data-ann-off="${esc(a.id)}">지우기</button></div>`;
    }).join("") : `<p class="faint">지금 공지 없음</p>`;
  };
  const loadAnn = () => api.adminAnnouncements().then((d) => { anns = d.announcements || []; drawAnn(); }).catch(() => {});
  loadAnn();
  const annForm = (a) => {
    const f = body.querySelector(".adm-ann"); if (!f) return;
    editId = a?.id || ""; annPv(false);
    f.querySelector(".adm-ann-id").value = editId;
    f.querySelector("textarea").value = a?.body || "";
    f.querySelector(".adm-ann-date").value = a?.ends_at != null ? kday(a.ends_at) : "";
    f.querySelector("button:not([type])").textContent = a ? "고친 것 저장" : "올리기";
    f.querySelector("[data-ann-cancel]").hidden = !a;
    drawAnn();
    if (a) f.querySelector("textarea").focus();
  };
  body.addEventListener("submit", async (e) => {
    if (!e.target.closest(".adm-ann")) return;
    e.preventDefault();
    const inp = e.target.querySelector("textarea"), v = inp.value.trim(); if (!v) return;
    const ends_at = kend(e.target.querySelector(".adm-ann-date").value);
    try {
      if (editId) { await api.adminAnnUpdate(editId, { body: v, ends_at }); toast("공지를 고쳤어요."); }
      else { await api.adminAnnounce(v, { ends_at }); toast("공지를 올렸어요."); }
      annForm(null); await loadAnn();
    } catch (err) { toast(err.message, "err"); }
  });
  body.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-ann-row]");
    if (e.target.closest("[data-ann-cancel]")) return annForm(null);
    if (!row) return;
    const i = anns.findIndex((a) => a.id === row.dataset.annRow), a = anns[i]; if (!a) return;
    try {
      if (e.target.closest("[data-ann-edit]")) return annForm(a);
      if (e.target.closest("[data-ann-act]")) { await api.adminAnnUpdate(a.id, { active: !a.active }); await loadAnn(); }
      const mv = e.target.closest("[data-ann-mv]");
      if (mv) {
        const j = i + Number(mv.dataset.annMv); if (j < 0 || j >= anns.length) return;
        [anns[i], anns[j]] = [anns[j], anns[i]]; drawAnn();
        await api.adminAnnOrder(anns.map((x) => x.id));
      }
    } catch (err) { toast(err.message, "err"); loadAnn(); }
  });
  // 미리보기: 켜면 쓴 마크다운을 그려서 보여 줘요
  const annPv = (on) => {
    const f = body.querySelector(".adm-ann"); if (!f) return;
    const pv = f.querySelector(".adm-ann-pv"), b = f.querySelector("[data-ann-pv]");
    pv.hidden = !on; f.querySelector("textarea").hidden = on; b.setAttribute("aria-pressed", on); b.textContent = on ? "고쳐 쓰기" : "미리보기";
    if (on) pv.innerHTML = annHtml(f.querySelector("textarea").value) || '<p class="faint">비어 있어요</p>';
  };
  // 사진: 버튼 · 끌어다 놓기 · 붙여 넣기 → 올리고 커서 자리에 ![](주소)
  const annImgs = async (files) => {
    const ta = body.querySelector(".adm-ann textarea"); if (!ta) return;
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const { src } = await api.annImage(f);
        const at = ta.selectionStart ?? ta.value.length, md = `${at && ta.value[at - 1] !== "\n" ? "\n" : ""}![](${src})\n`;
        ta.setRangeText(md, at, ta.selectionEnd ?? at, "end"); ta.focus();
      } catch (err) { toast(err.message, "err"); }
    }
  };
  body.addEventListener("click", (e) => { if (e.target.closest("[data-ann-img]")) body.querySelector(".adm-ann-file")?.click(); });
  body.addEventListener("change", (e) => { if (e.target.matches(".adm-ann-file")) { annImgs([...e.target.files]); e.target.value = ""; } });
  body.addEventListener("paste", (e) => { if (!e.target.matches(".adm-ann textarea")) return; const fs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/")); if (fs.length) { e.preventDefault(); annImgs(fs); } });
  body.addEventListener("dragover", (e) => { if (e.target.matches(".adm-ann textarea")) e.preventDefault(); });
  body.addEventListener("drop", (e) => { if (!e.target.matches(".adm-ann textarea") || !e.dataTransfer?.files?.length) return; e.preventDefault(); annImgs([...e.dataTransfer.files]); });
  body.addEventListener("click", (e) => { const b = e.target.closest("[data-ann-pv]"); if (b) annPv(b.getAttribute("aria-pressed") !== "true"); });
  // 팀 전체
  const loadTeams = () => api.adminTeams().then(({ teams }) => {
    const el = body.querySelector(".adm-teams"); if (!el) return;
    el.innerHTML = teams.length ? teams.map((t) => `<div class="adm-team"><b>${esc(t.name)}</b> <small class="faint">팀장 @${esc(t.owner || "—")} · 코드 ${esc(t.code)} · ${day(t.created_at)}</small>
      <div class="adm-team-m">${t.members.map((m) => `<span>${esc(m.display_name || m.username)} <small class="faint">@${esc(m.username)}</small></span>`).join("")}</div></div>`).join("") : '<p class="faint">아직 팀이 없어요.</p>';
  }).catch(() => {});
  // AI 판정 (src/decide.js · GET /decide/stats): 엔진 · 질문 종류별로 사람 결과와 맞은 비율 · 확신 구간별 정확도
  const KIND = { rel_type: "관계 제안", rel_guess: "연결할 때 짐작", concept_sort: "새 노트 자리", route: "튜터 길 고르기", test: "평가" };
  const pc = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
  const loadDecide = () => api.decideStats().then((d) => {
    const el = body.querySelector(".adm-decide"); if (!el) return;
    const tbl = (head, rows) => `<div class="adm-table-wrap"><table class="adm-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${head.length}" class="faint">아직 기록이 없어요</td></tr>`}</tbody></table></div>`;
    const c = d.config || {};
    el.innerHTML = `<p class="faint">지난 ${d.days}일 · 맞음 = 사람이 확정 · 거절 · 다른 종류로 고른 답과 같은 비율. 노트 글은 적지 않아요.</p>
      ${tbl(["질문", "엔진", "판정", "사람 결과", "맞음", "평균 확신", "모름"], d.engines.map((r) => `<tr><td>${esc(KIND[r.kind] || r.kind)}</td><td class="mono">${esc(r.engine)}</td><td>${r.n}</td><td>${r.judged}</td><td><b>${pc(r.accuracy)}</b></td><td>${pc(r.avg_conf)}</td><td>${r.unknowns}</td></tr>`))}
      <h3 class="adm-h3">확신 구간별</h3>
      ${tbl(["질문", "엔진", "확신", "사람 결과", "맞음"], d.calibration.map((r) => `<tr><td>${esc(KIND[r.kind] || r.kind)}</td><td class="mono">${esc(r.engine)}</td><td class="mono">${esc(r.bucket)}</td><td>${r.judged}</td><td>${pc(r.accuracy)}</td></tr>`))}
      ${d.shadow.length ? `<h3 class="adm-h3">그림자 비교</h3>${tbl(["질문", "그림자 엔진", "판정", "같은 답", "맞음"], d.shadow.map((r) => `<tr><td>${esc(KIND[r.kind] || r.kind)}</td><td class="mono">${esc(r.engine)}</td><td>${r.n}</td><td>${pc(r.agreement)}</td><td>${pc(r.accuracy)}</td></tr>`))}` : ""}
      <p class="faint adm-decide-cfg">설정 · 그림자 ${esc(c.shadow || "끔")} · Jev ${c.jev ? "있음" : "없음"} · Laya ${c.laya ? "있음" : "없음"} · 개인 자료 바깥 전송 ${c.ext_private ? "허용" : "막음"} · 튜터 길 ${esc(c.route || "log")} · embed-proto T=${c.proto?.T} floor=${c.proto?.floor}</p>`;
  }).catch((e) => { const el = body.querySelector(".adm-decide"); if (el) el.innerHTML = `<p class="faint">${esc(e.message || "불러오지 못했어요.")}</p>`; });
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
  body.addEventListener("change", (e) => { if (e.target.name === "adm-bc-to") { bc.to = e.target.value; bcCounts(); } });
  body.addEventListener("change", (e) => { const i = e.target.closest("[data-plans-from]"); if (i?.value) { const sec = body.querySelector("#adm-plans"); showPlans(sec.dataset.id, sec.dataset.name, i.value); } });
  const load = () => Promise.all([api.adminUsers(), api.adminFeatureRequests().catch(() => feats)]).then(([d, fr]) => { if (!alive) return; data = d; feats = fr; draw(); }).catch((e) => { body.innerHTML = `<p class="faint">${esc(e.message)}</p>`; });

  body.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; body.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === t)); body.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== tab; }); return; }
    if (e.target.closest("[data-bc-toggle]")) { bc.open = !bc.open; bc.confirm = false; drawBc(); if (bc.open) body.querySelector(".adm-bc-text")?.focus(); return; }
    const bcb = e.target.closest("[data-bc]");
    if (bcb) {
      const a = bcb.dataset.bc;
      if (a === "close") { bc.open = false; bc.confirm = false; drawBc(); body.querySelector("[data-bc-toggle]")?.focus(); }
      if (a === "next" && bc.text.trim() && bcTargets().length) { bc.confirm = true; drawBc(); body.querySelector('[data-bc="go"]')?.focus(); }
      if (a === "back") { bc.confirm = false; drawBc(); body.querySelector(".adm-bc-text")?.focus(); }
      if (a === "go" && !bc.busy) {
        bc.busy = true; drawBc();
        try {
          const { sent } = await api.adminMessage(bc.text.trim(), bc.to === "shown" ? bcShown().map((u) => u.id) : null);
          toast(`${sent}명에게 보냈어요.`);
          Object.assign(bc, { open: false, text: "", confirm: false, busy: false }); drawBc();
        } catch (err) { bc.busy = false; drawBc(); toast(err.message, "err"); }
      }
      return;
    }
    const f = e.target.closest("[data-filter]");
    if (f) { filter = f.dataset.filter; drawRows(); return; }
    const tg = e.target.closest("[data-toggle]");
    if (tg) { const id = tg.closest("tr").dataset.id; open = open === id ? "" : id; drawRows(); return; }
    if (e.target.closest(".adm-menu [data-act]")) e.target.closest("details")?.removeAttribute("open");
    const dec = e.target.closest("[data-dec]");
    if (dec) { try { const r = await api.adminDecideFeature(dec.closest("[data-req]").dataset.req, dec.dataset.dec); toast(dec.dataset.dec !== "approve" ? "거절했어요." : r.granted ? "열어 줬어요." : "승인했어요. 다른 관리자 승인을 기다려요"); await load(); } catch (err) { toast(err.message, "err"); } return; }
    const chip = e.target.closest("[data-feat]");
    if (chip) { try { await api.adminSetFeature(chip.closest("tr").dataset.id, chip.dataset.feat, !chip.classList.contains("on")); await load(); } catch (err) { toast(err.message, "err"); } return; }
    const off = e.target.closest("[data-ann-off]");
    if (off) { if (!confirm("이 공지를 지울까요?")) return; try { await api.adminAnnounceOff(off.dataset.annOff); if (editId === off.dataset.annOff) annForm(null); await loadAnn(); } catch (err) { toast(err.message, "err"); } return; }
    const hb = e.target.closest("[data-hours]");
    if (hb) { if (await addTime(hb, hb.closest("tr").dataset.id)) { timeFor = ""; await load(); } return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "time") { const id = b.closest("tr").dataset.id; timeFor = timeFor === id ? "" : id; drawRows(); return; }
    if (b.dataset.act === "message") { location.hash = "#/room/help/" + encodeURIComponent(b.closest("tr").dataset.id); return; }
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

// 보드 카드 자세히 — 컴퓨터는 오른쪽 서랍, 폰은 아래에서 올라오는 시트.
// 이름 · 칸 · 프로젝트(색) · 우선순위 · 마감일 · 하는 날 · 작은 할 일 · 메모 · 지우기. 바꿀 때마다 바로 저장(하나씩 ⌘Z 로 되돌려요).
//   const sh = openSheet({ p, cols, tags, projects, colOf, on: { patch(after, label), move(col), del(), tag(name, color), close() } })
//   sh.refresh(p, cols, tags)   되돌리기 · 다른 곳에서 바뀌면 다시 그려요 · sh.close()
import { esc, ymd, today, addDays } from "../util.js";
import { icon } from "../icons.js";
import { COLORS, tagColor, subProgress, dayOf } from "./model.js";

export const PRIO_CHIPS = [
  { k: "max", n: 1, label: "긴급" }, { k: "xhigh", n: 2, label: "높음" }, { k: "high", n: 3, label: "보통" },
  { k: "medium", n: 4, label: "나중에" }, { k: "low", n: 5, label: "여유" },
];
const COLOR_NAME = { blue: "파랑", green: "초록", amber: "노랑", rose: "분홍", violet: "보라", teal: "청록", orange: "주황", gray: "회색" };

export function openSheet({ p, cols, tags, projects, colOf, on }) {
  const host = document.createElement("div");
  host.className = "tb-sheet"; host.setAttribute("role", "dialog"); host.setAttribute("aria-modal", "true"); host.setAttribute("aria-label", "할 일 자세히");
  document.body.appendChild(host);
  const back = document.activeElement;
  let cur = p, C = cols, T = tags;

  function draw() {
    const [d, n] = subProgress(cur), proj = cur.project || "", col = colOf(cur), subs = cur.subtasks || [];
    const t = ymd(today());
    host.innerHTML = `
      <div class="tb-sheet-back" data-x></div>
      <section class="tb-panel">
        <header class="tb-s-top">
          <label class="tb-s-col"><span class="sr-only">칸</span><select class="select sm" data-f="col">${C.map((c) => `<option value="${esc(c.id)}"${c.id === col ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
          <button type="button" class="icon-btn" data-x aria-label="닫기">${icon.x(16)}</button>
        </header>
        <textarea class="tb-s-title" data-f="text" rows="2" maxlength="200" aria-label="할 일 이름">${esc(cur.text)}</textarea>
        <div class="tb-props">
          <span class="tb-pk">프로젝트</span>
          <div class="tb-pv">
            <input class="input sm" data-f="project" list="tb-projects" maxlength="30" placeholder="프로젝트 없음" value="${esc(proj)}" aria-label="프로젝트">
            <datalist id="tb-projects">${projects.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
            ${proj ? `<span class="tb-dots" role="group" aria-label="프로젝트 색">${COLORS.map((c) => `<button type="button" class="tb-dot${tagColor(proj, T) === c ? " on" : ""}" data-color="${c}" style="--tc:var(--tb-${c})" aria-label="${COLOR_NAME[c]}" aria-pressed="${tagColor(proj, T) === c}"></button>`).join("")}</span>` : ""}
          </div>
          <span class="tb-pk">우선순위</span>
          <div class="tb-pv tb-prios" role="group" aria-label="우선순위">
            <button type="button" class="tb-pchip${cur.priority ? "" : " on"}" data-prio="" aria-pressed="${!cur.priority}">없음</button>
            ${PRIO_CHIPS.map((c) => `<button type="button" class="tb-pchip p-${c.k}${cur.priority === c.k ? " on" : ""}" data-prio="${c.k}" aria-pressed="${cur.priority === c.k}">${c.n} ${c.label}</button>`).join("")}
          </div>
          <span class="tb-pk">마감일</span>
          <div class="tb-pv">
            <input class="input sm" type="date" data-f="due" value="${esc(cur.due || "")}" aria-label="마감일">
            <span class="tb-quick">${[["오늘", t], ["내일", ymd(addDays(today(), 1))], ["다음 주", ymd(addDays(today(), 7))]].map(([l, v]) => `<button type="button" class="btn sm ghost" data-due="${v}">${l}</button>`).join("")}${cur.due ? `<button type="button" class="btn sm ghost" data-due="">지우기</button>` : ""}</span>
          </div>
          <span class="tb-pk">하는 날</span>
          <div class="tb-pv"><input class="input sm" type="date" data-f="period" value="${esc(dayOf(cur) || "")}" aria-label="하는 날"><span class="faint tb-hint">체크리스트의 그날 목록에 떠요</span></div>
        </div>
        <section class="tb-subs">
          <h3>작은 할 일 ${n ? `<span class="tb-subn">${d}/${n}</span>` : ""}</h3>
          ${n ? `<span class="tb-bar tb-bar-lg"><i style="--f:${(d / n) * 100}%"></i></span>` : ""}
          <ul>${subs.map((s, i) => `<li class="${s.d ? "done" : ""}"><input type="checkbox" class="check" data-sub="${i}" ${s.d ? "checked" : ""} aria-label="${esc(s.t)} 끝냄"><span class="tb-sub-t" data-subedit="${i}" title="두 번 눌러 고치기">${esc(s.t)}</span><button type="button" class="icon-btn sm" data-subdel="${i}" aria-label="작은 할 일 지우기">${icon.x(12)}</button></li>`).join("")}</ul>
          ${n < 20 ? `<form class="tb-subadd" autocomplete="off"><input class="input sm" name="t" maxlength="100" placeholder="작은 할 일 더하기 · Enter" aria-label="작은 할 일 더하기"></form>` : `<p class="faint">작은 할 일은 20개까지예요.</p>`}
        </section>
        <section class="tb-notes">
          <h3>메모</h3>
          <textarea class="textarea" data-f="note" rows="4" maxlength="2000" placeholder="자세한 내용 · 링크">${esc(cur.note || "")}</textarea>
        </section>
        <footer class="tb-s-foot">
          <button type="button" class="btn sm ghost danger" data-del>${icon.trash ? icon.trash(14) : ""} 지우기</button>
          <span class="faint">⌘Z 로 되돌려요</span>
        </footer>
      </section>`;
  }
  draw();
  requestAnimationFrame(() => host.classList.add("in"));
  host.querySelector(".tb-s-title")?.focus({ preventScroll: true });

  const subs = () => (cur.subtasks || []).map((s) => ({ ...s }));
  const val = (f) => host.querySelector(`[data-f="${f}"]`);
  function commit(f) {
    const el = val(f); if (!el) return;
    const v = el.value.trim();
    if (f === "text") { if (!v) { el.value = cur.text; return; } if (v !== cur.text) on.patch({ text: v }, "이름"); }
    if (f === "project" && v !== (cur.project || "")) on.patch({ project: v || null }, "프로젝트");
    if (f === "note" && v !== (cur.note || "")) on.patch({ note: v || null }, "메모");
    if (f === "due" && (v || null) !== (cur.due || null)) on.patch({ due: v || null }, "마감일");
    if (f === "period" && v && v !== dayOf(cur)) on.patch({ period: "D:" + v }, "하는 날");
  }
  host.addEventListener("change", (e) => {
    const f = e.target.dataset.f;
    if (f === "col") return on.move(e.target.value);
    if (f === "due" || f === "period" || f === "project") return commit(f);
    const si = e.target.dataset.sub;
    if (si != null) { const s = subs(); s[+si].d = e.target.checked ? 1 : 0; on.patch({ subtasks: s }, "작은 할 일"); }
  });
  host.addEventListener("focusout", (e) => { const f = e.target.dataset?.f; if (f === "text" || f === "note") commit(f); });
  // Esc 는 초점이 어디 있든 (다시 그려서 초점이 body 로 갔어도) 시트를 닫아요
  const onEsc = (e) => { if (e.key === "Escape" && !host.contains(e.target) && !document.querySelector(".cm")) { e.preventDefault(); close(); } };
  document.addEventListener("keydown", onEsc);
  host.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (e.target.matches("input, textarea") && e.target.dataset.f === "text") e.target.value = cur.text; close(); return; }
    if (e.key === "Enter" && !e.isComposing && e.target.dataset.f === "text") { e.preventDefault(); e.target.blur(); }
  });
  host.addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = e.target.t, t = inp.value.trim(); if (!t) return;
    on.patch({ subtasks: [...subs(), { t, d: 0 }] }, "작은 할 일 더하기");
    inp.value = "";
    setTimeout(() => host.querySelector(".tb-subadd input")?.focus(), 0);
  });
  host.addEventListener("click", (e) => {
    if (e.target.closest("[data-x]")) return close();
    const pr = e.target.closest("[data-prio]");
    if (pr) { const v = pr.dataset.prio || null; if (v !== (cur.priority || null)) on.patch({ priority: v }, "우선순위"); return; }
    const dq = e.target.closest("[data-due]");
    if (dq) { const v = dq.dataset.due || null; if (v !== (cur.due || null)) on.patch({ due: v }, "마감일"); return; }
    const sd = e.target.closest("[data-subdel]");
    if (sd) { const s = subs(); s.splice(+sd.dataset.subdel, 1); on.patch({ subtasks: s }, "작은 할 일 지우기"); return; }
    const c = e.target.closest("[data-color]");
    if (c && cur.project) { on.tag(cur.project, c.dataset.color); return; }
    if (e.target.closest("[data-del]")) { on.del(); close(); }
  });
  host.addEventListener("dblclick", (e) => {
    const t = e.target.closest("[data-subedit]"); if (!t) return;
    const i = +t.dataset.subedit, inp = document.createElement("input");
    inp.className = "input sm"; inp.maxLength = 100; inp.value = cur.subtasks[i].t;
    t.replaceWith(inp); inp.focus(); inp.select();
    let fin = false;
    const done = (save) => { if (fin) return; fin = true; const v = inp.value.trim(); if (save && v && v !== cur.subtasks[i].t) { const s = subs(); s[i].t = v; on.patch({ subtasks: s }, "작은 할 일"); } else draw(); };
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); done(true); } if (ev.key === "Escape") { ev.stopPropagation(); done(false); } });
    inp.addEventListener("blur", () => done(true));
  });

  let closed = false;
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener("keydown", onEsc);
    const a = document.activeElement; if (a && host.contains(a) && a.dataset?.f) commit(a.dataset.f);
    host.classList.remove("in"); host.classList.add("out");
    setTimeout(() => host.remove(), 180);
    on.close?.();
    back?.focus?.({ preventScroll: true });
  }
  return {
    id: () => cur.id,
    refresh(np, nc = C, nt = T) {
      if (closed) return;
      cur = np; C = nc; T = nt;
      // 글 칸에서 쓰는 중이면 그 칸 글은 그대로 두고 다시 그려요
      const a = document.activeElement, f = a && host.contains(a) ? a.dataset?.f : null, keep = f ? { f, v: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
      const sub = a && host.contains(a) && a.closest(".tb-subadd") ? a.value : null;
      draw();
      if (keep) { const el = val(keep.f); if (el) { el.value = keep.v; el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch {} } }
      if (sub !== null) { const el = host.querySelector(".tb-subadd input"); if (el) { el.value = sub; el.focus({ preventScroll: true }); } }
    },
    close,
    closed: () => closed,
  };
}

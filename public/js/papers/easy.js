// 쉽게 읽기 (앱 안) — 중3~고1 눈높이 스크롤 설명. 내용: /papers/content/<id>.easy.json (규격 scripts/papers/EASY_SPEC.md)
//   #/papers/easy           16편 목록 + 오늘 복습할 차례
//   #/papers/<id>/easy      한 편
//   #/papers/easy/review    섞어서 복습 퀴즈
// 기억에 오래 남게 학습 과학 근거대로 짰어요 (EASY_SPEC.md '학습 과학'):
//   ① 읽기 전에 짐작하기(사전 시험) ② 핵심 낱말 먼저(사전 훈련) ③ 짧은 장 + 그림 + 강조(분할 · 이중 부호화 · 신호)
//   ④ 중간 퀴즈 + 바로 해설(인출 연습 + 피드백) ⑤ 끝에서 책 덮고 말해 보기 → 정리와 맞춰 보기(생성 · 자기 설명)
//   ⑥ 1 → 3 → 7일 간격 복습, 여러 논문 문제를 섞어서(간격 · 교차 연습)
import { api } from "../api.js";
import { toast } from "../util.js";
import { chatMarkup, mountChat } from "./chat.js";
import { fillFigtr } from "./figtr.js";
import { mountMarks } from "./marks.js";
import { loadStudyTime, fmtMin } from "./studytime.js";
import { $, $$, esc, store, getJSON, md, inline, blocks, quizHtml, answer, wireMotion, wireZoom, wireProgress, wireToc, bar, STAGE } from "./ez-core.js";
const idxP = () => getJSON("/papers/index.json");
const easyOf = (id) => getJSON(`/papers/content/${encodeURIComponent(id)}.easy.json`);

// ---------- 한 편 ----------
const EASY_QUICK = ["처음부터 아주 쉽게 3문장으로", "방금 읽은 걸 다른 비유로", "이게 왜 필요한지 예를 들어 줘", "헷갈리는 말 하나 풀어 줘", "확인 문제 하나 더 내 줘"];
export function mountEasy(host, ctx, id) {
  let stops = [], alive = true;
  host.innerHTML = `<div class="ezw">${bar()}<main class="ez"><p class="ez-loading">불러오는 중…</p></main></div>`;
  // AI 버튼 · 패널은 앱 화면 틀 밖(body)에 붙여요 — 틀 안에 있으면 잘려서 안 보여요
  const portal = document.createElement("div"); portal.className = "ezw ez-portal";
  portal.innerHTML = `<button type="button" class="ez-ai-fab" id="ez-ai-fab" aria-expanded="false" aria-controls="ez-ai"><img class="ez-ai-logo" src="/img/claude.svg" alt="" width="20" height="20">AI에게 물어보기</button>
    <aside class="ez-ai" id="ez-ai" aria-label="AI 튜터 (쉽게)" hidden><div class="ez-ai-head"><img class="ez-ai-logo" src="/img/claude.svg" alt="" width="18" height="18"><b>AI 튜터</b><span>중3 ~ 고1 눈높이로 답해요</span><button type="button" class="ez-link" id="ez-ai-x">닫기</button></div>
      ${chatMarkup("mini", { quick: EASY_QUICK, sub: "쉽게 읽기 모드", empty: "모르는 걸 바로 물어봐요. 본문 글자를 드래그하면 그 문장을 인용해서 물어볼 수 있어요. 장 제목 옆 '물어보기'를 눌러도 돼요.", ph: "예: 인코더가 정확히 뭐예요?" })}</aside>`;
  document.body.append(portal); stops.push(() => portal.remove());
  const root = $(".ezw", host), main = $(".ez", root), panel = $("#ez-ai", portal), fab = $("#ez-ai-fab", portal);
  const openAi = (on = true) => { panel.hidden = !on; fab.setAttribute("aria-expanded", on ? "true" : "false"); root.classList.toggle("ai-open", on); if (on) setTimeout(() => $(".ppc-in", panel)?.focus({ preventScroll: true }), 50); };
  // 패널 입력창에 글을 넣고 바로 보내기
  const askAi = (text) => { openAi(true); const ta = $(".ppc-in", panel); ta.value = text; $("[data-ppc-form]", panel).requestSubmit(); };
  fab.addEventListener("click", () => openAi(panel.hidden));
  $("#ez-ai-x", portal).addEventListener("click", () => openAi(false));
  stops.push(mountChat(portal, id, main, null, { level: "easy" }));
  const onSelc = () => { const t = getSelection()?.toString().trim(); fab.classList.toggle("pulse", !!(t && t.length >= 4 && main.contains(getSelection().anchorNode) && panel.hidden)); };
  document.addEventListener("selectionchange", onSelc); stops.push(() => document.removeEventListener("selectionchange", onSelc));
  (async () => {
    let d, idx, st;
    let tm = null;
    try { [d, idx, st, tm] = await Promise.all([easyOf(id), idxP(), api.easyState().catch(() => null), loadStudyTime()]); }
    catch { main.innerHTML = `<p class="ez-err">이 논문의 쉽게 읽기를 불러오지 못했어요. <a href="#/papers/easy">목록으로</a></p>`; return; }
    if (!alive) return;
    const B = blocks(`/papers/fig/${encodeURIComponent(id)}/`);
    const quizzes = d.sections.flatMap((s) => s.body.filter((b) => b.t === "quiz"));
    const pre = quizzes.slice(0, 2), mine = st?.items?.find((x) => x.paper === id);
    const guessKey = `ez-guess-${id}`, guesses = JSON.parse(store.get(guessKey) || "{}");
    const order = idx.papers.map((p) => p.id), i = order.indexOf(id), next = idx.papers[i + 1];
    let qn = 0;
    $(".ez-brand span", root).textContent = d.title;
    main.innerHTML = `
      <section class="ez-hero"><p class="ez-kicker">${esc(d.kicker || d.title)}</p><h1>${inline(d.headline)}</h1><p class="ez-lead">${inline(d.lead || "")}</p>
        <p class="ez-meta"><span title="${esc(tm?.method || "")}">예상 <b>${esc(fmtMin(tm?.papers?.[id]?.easy || d.minutes || 15))}</b> (분량을 재서 계산)</span><span>중3 ~ 고1 눈높이</span>${mine ? `<span>${mine.stage >= 4 ? "복습까지 끝냈어요" : `다음 복습 <b>${md(mine.due_day)}</b>`}</span>` : ""}</p>
        ${pre.length ? `<div class="ez-pre" id="ez-pre"><p class="ez-pre-k">읽기 전에 1분</p><p class="ez-pre-h">먼저 짐작해 보세요. 틀려도 괜찮아요.</p>
          <p class="ez-pre-s">답을 모르는 채로 먼저 골라 보면, 읽으면서 답을 만났을 때 더 오래 기억나요. 정답은 본문 속 같은 문제에서 알려 줘요.</p>
          ${pre.map((q, k) => `<div class="qz" data-pre="${k}"><p class="qz-k">짐작 ${k + 1}</p><p class="qz-q">${inline(q.q)}</p><div class="qz-c">${q.choices.map((c, j) => `<button type="button" data-g="${j}" class="${guesses[k] === j ? "pick" : ""}">${inline(c)}</button>`).join("")}</div></div>`).join("")}</div>` : ""}
        ${d.words?.length ? `<div class="ez-pre"><p class="ez-pre-k">먼저 알아 둘 말</p><p class="ez-pre-s" style="margin:0">처음 보는 말 몇 개만 미리 익혀 두면, 본문에서는 원리에만 집중할 수 있어요.</p>
          <div class="ez-words-pre">${d.words.slice(0, 4).map((w) => `<div><b>${esc(w.term)}</b><span>${inline(w.easy)}</span></div>`).join("")}</div></div>` : ""}
      </section>
      ${d.sections.map((s, k) => `<section class="ez-sec" id="ez-s${k + 1}"><p class="ez-n">${String(k + 1).padStart(2, "0")}<button type="button" class="ez-ask" data-ask="${k}" title="이 장을 AI에게 물어보기">AI에게 물어보기</button></p><h2>${inline(s.title)}</h2>${s.body.map((b) => { try { return B[b.t] ? B[b.t](b, b.t === "quiz" ? qn++ : 0) : ""; } catch { return ""; } }).join("")}</section>`).join("")}
      <section class="ez-sec" id="ez-recall-sec"><div class="ez-recall" id="ez-recall">
        <p class="ez-n">책 덮고 말해 보기</p><h2>보지 않고, 친구에게 설명하듯 3줄로 써 보세요.</h2>
        <p class="ez-recall-s">"${esc(d.title)}는 무엇을 하고, 어떻게, 얼마나 좋아졌나?" 스스로 떠올리는 순간이 다시 읽기보다 기억에 훨씬 오래 남아요. 다 쓰면 정리와 맞춰 볼게요.</p>
        <textarea id="ez-recall-t" placeholder="예: ○○는 … 하는 모델이에요. … 해서 … 가 좋아졌어요." aria-label="기억해서 설명 쓰기"></textarea>
        <div class="ez-row"><button type="button" class="ez-btn primary" id="ez-recall-go">다 썼어요 · 정리와 맞춰 보기</button><button type="button" class="ez-btn" id="ez-recall-skip">그냥 정리 보기</button></div>
        <div id="ez-recap" hidden></div></div></section>
      <section class="ez-sec">${d.words?.length ? `<div class="ez-words"><h3>이 페이지에 나온 말</h3><dl>${d.words.map((w) => `<dt>${esc(w.term)}</dt><dd>${inline(w.easy)}</dd>`).join("")}</dl></div>` : ""}
        <nav class="ez-next" aria-label="다음으로"><h3>다음으로</h3><div class="ez-next-row">
          <a class="ez-btn primary" href="#/papers/${esc(id)}">이 논문 이어 공부하기 <small>퀴즈 · 3분 설명 · 자세히 읽기</small></a>
          ${next ? `<a class="ez-btn" href="#/papers/${esc(next.id)}/easy">다음 논문 <small>${esc(next.title)}</small> →</a>` : ""}
          <a class="ez-btn" href="#/papers/easy">16편 목록</a></div></nav></section>`;
    // ① 짐작 — 고르기만 (정답은 안 알려 줘요). 본문의 같은 문제를 풀면 "처음 짐작"을 같이 보여 줘요
    $("#ez-pre", main)?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]"); if (!b) return;
      const k = +b.closest("[data-pre]").dataset.pre; guesses[k] = +b.dataset.g; store.set(guessKey, JSON.stringify(guesses));
      $$("[data-g]", b.closest("[data-pre]")).forEach((x) => x.classList.toggle("pick", x === b));
    });
    // ④ 본문 퀴즈
    main.addEventListener("click", (e) => {
      const ak = e.target.closest("[data-ask]");
      if (ak) { const s = d.sections[+ak.dataset.ask]; askAi(`${+ak.dataset.ask + 1}장 "${s.title.replace(/\*\*|\{[abc]:|\}/g, "")}" 을 더 쉽게, 다른 예를 들어 설명해 줘.`); return; }
      const b = e.target.closest(".ez-sec [data-c]"); if (!b || b.disabled) return;
      const q = b.closest(".qz"), k = +q.dataset.quiz.slice(1);
      answer(q, +b.dataset.c);
      if (k < pre.length && guesses[k] != null) { const g = document.createElement("span"); g.className = "ez-guess"; g.textContent = `읽기 전 짐작: ${String.fromCharCode(9312 + guesses[k])} ${guesses[k] === +q.dataset.a ? "— 처음부터 맞혔어요" : "— 읽고 나서 바로잡았어요"}`; $(".qz-w", q).append(g); }
    });
    // ⑤ 떠올리기 → 정리 맞춰 보기 → 저장(간격 복습 시작)
    const points = d.recap?.points || [];
    const reveal = (wrote) => {
      const box = $("#ez-recap", main), text = $("#ez-recall-t", main).value.trim();
      $("#ez-recall-go", main).disabled = true; $("#ez-recall-skip", main).disabled = true; $("#ez-recall-t", main).readOnly = true;
      box.hidden = false;
      box.innerHTML = `${wrote && text ? `<p class="ez-my">${esc(text)}</p>` : ""}
        <h3 class="pp-h3" style="margin:22px 0 6px">${inline(d.recap?.title || "정리")}</h3><p>${inline(d.recap?.text || "")}</p>
        ${points.length ? `<p class="ez-recall-s" style="margin:16px 0 0">${wrote ? "내가 떠올린 것에 체크해 보세요. 빠진 것만 다시 보면 돼요." : "핵심이에요. 다음에는 먼저 써 보고 맞춰 보세요."}</p>
          <ul class="ez-check">${points.map((p, j) => `<li><label><input type="checkbox" data-pt="${j}" ${wrote ? "" : "disabled"}><span>${inline(p)}</span></label></li>`).join("")}</ul>` : ""}
        <div class="ez-row"><button type="button" class="ez-btn primary" id="ez-save">다 읽었어요 · 복습 예약하기</button>${wrote && text ? `<button type="button" class="ez-btn" id="ez-ai-check">AI에게 내 설명 확인받기</button>` : ""}</div><div id="ez-saved"></div>`;
      $("#ez-ai-check", box)?.addEventListener("click", () => askAi(`내가 책을 덮고 쓴 설명이에요. 맞는 점 1~2개, 틀리거나 빠진 점 1~2개를 중학생 눈높이로 짧게 알려 줘:\n"${text.slice(0, 800)}"`));
      $("#ez-save", box).addEventListener("click", async (ev) => {
        ev.currentTarget.disabled = true;
        const got = wrote ? $$("[data-pt]:checked", box).length : null;
        try {
          const s2 = await api.easyRead(id, got, wrote ? points.length : null), me2 = s2.items.find((x) => x.paper === id);
          $("#ez-saved", box).innerHTML = `<p class="ez-saved">${wrote ? `핵심 ${points.length}개 중 <b>${got}개</b>를 스스로 떠올렸어요. ` : ""}<b>${md(me2.due_day)}</b>에 섞어서 복습할 차례가 와요. 1일 → 3일 → 7일 간격으로 다시 꺼내 보면 오래 가요.</p>`;
          window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "papers" } }));
        } catch (x) { ev.currentTarget.disabled = false; toast(x.message || "저장하지 못했어요.", "err"); }
      });
    };
    $("#ez-recall-go", main).addEventListener("click", () => { if (!$("#ez-recall-t", main).value.trim()) { toast("한 줄이라도 먼저 써 보세요. 틀려도 괜찮아요."); $("#ez-recall-t", main).focus(); return; } reveal(true); });
    $("#ez-recall-skip", main).addEventListener("click", () => reveal(false));
    wireZoom(main);
    fillFigtr(main, id);
    // 형광펜 · 메모 (장마다 id="ez-s1" … 로 위치를 기억해요)
    const marks = mountMarks(main, { paper: id, mode: "easy", onAsk: (q) => askAi(`"${q.slice(0, 400)}"\n이 부분이 무슨 뜻이에요? 중학생 눈높이로 예를 들어 설명해 주세요.`) });
    stops.push(() => marks.stop(), wireMotion(root), wireProgress(root), wireToc(root, main, d));
  })();
  return () => { alive = false; stops.forEach((f) => f?.()); };
}

export function mountEasyList(host, ctx) {
  let alive = true, stops = [];
  host.innerHTML = `<div class="ezw">${bar("중3 ~ 고1 눈높이")}<main class="ez"><p class="ez-loading">불러오는 중…</p></main></div>`;
  const root = $(".ezw", host), main = $(".ez", root);
  (async () => {
    const [idx, st, tm] = await Promise.all([idxP(), api.easyState().catch(() => ({ items: [], due: [], today: "" })), loadStudyTime()]);
    const heads = await Promise.all(idx.papers.map((p) => easyOf(p.id).then((d) => d.headline.replace(/\n/g, " ")).catch(() => null)));
    if (!alive) return;
    const rows = new Map(st.items.map((r) => [r.paper, r])), byStage = {};
    idx.papers.forEach((p, i) => (byStage[p.stage] ||= []).push({ ...p, head: heads[i] }));
    let n = 0; const stages = Object.keys(byStage).sort((a, b) => a - b);
    const done = st.items.length;
    main.innerHTML = `<section class="ez-hero"><p class="ez-kicker">엣지 비전 논문 16편</p><h1>어려운 논문을,<br>중학생도 따라올 수 있게.</h1>
      <p class="ez-lead">읽기 전에 짐작하고, 그림으로 원리를 보고, 책을 덮고 직접 말해 본 뒤, 며칠 간격을 두고 섞어서 다시 꺼내요. 기억 연구에서 오래 남는다고 확인된 순서 그대로예요.</p>
      <p class="ez-meta"><span>읽은 논문 <b>${done}</b> / ${idx.papers.length}</span>${tm ? `<span title="${esc(tm.method)}">16편 쉽게 읽기 예상 <b>${esc(fmtMin(Object.values(tm.papers).reduce((a, x) => a + x.easy, 0)))}</b></span>` : ""}<span>전문가용 해설은 각 논문의 "자세히 읽기"에 있어요</span></p>
      ${st.due.length ? `<div class="ez-due"><b>오늘 복습할 차례 ${st.due.length}편</b><span>${st.due.map((x) => esc(idx.papers.find((p) => p.id === x)?.title || x)).join(" · ")} — 문제를 섞어서 5분이면 끝나요.</span><a class="ez-btn primary" href="#/papers/easy/review">섞어서 복습하기</a></div>`
        : done ? `<div class="ez-due"><b>오늘은 복습할 차례가 없어요</b><span>다음 복습: ${esc(md(st.items.filter((r) => r.stage < 4).map((r) => r.due_day).sort()[0] || st.today || "2026-10-05"))}. 미리 해 봐도 돼요.</span><a class="ez-btn" href="#/papers/easy/review">미리 복습하기</a></div>` : ""}
    </section>
    ${stages.map((s) => { const x = idx.stages?.find((t) => t.n === +s); return `<p class="ez-stage">${s}단계${x ? ` · ${esc(x.label)}` : ""}</p><ul class="ez-list">${byStage[s].map((p) => `<li class="${p.head ? "" : "soon"}"><a href="#/papers/${esc(p.id)}/easy"><span class="n">${String(++n).padStart(2, "0")}</span><span><b>${esc(p.title)}</b><span class="h">${esc(p.head || "준비 중이에요")}</span></span><span class="tagc"><span class="tag">${esc(p.field || "")}${tm?.papers?.[p.id] ? ` · ${esc(fmtMin(tm.papers[p.id].easy))}` : ""}</span>${STAGE(rows.get(p.id), st.today)}</span></a></li>`).join("")}</ul>`; }).join("")}`;
    stops.push(wireMotion(root), wireProgress(root));
  })().catch(() => { main.innerHTML = `<p class="ez-err">목록을 불러오지 못했어요.</p>`; });
  return () => { alive = false; stops.forEach((f) => f?.()); };
}

// ---------- 섞어서 복습 (간격 + 교차 + 인출) ----------
export function mountEasyReview(host, ctx) {
  let alive = true;
  host.innerHTML = `<div class="ezw">${bar("섞어서 복습")}<main class="ez"><div class="ez-rv"><p class="ez-loading">문제 고르는 중…</p></div></main></div>`;
  const root = $(".ezw", host), box = $(".ez-rv", root);
  (async () => {
    const [idx, st] = await Promise.all([idxP(), api.easyState()]);
    let pool = st.due.length ? st.due : st.items.filter((r) => r.stage < 4).map((r) => r.paper);
    if (!pool.length) pool = st.items.map((r) => r.paper);
    if (!pool.length) { box.innerHTML = `<h2>아직 읽은 논문이 없어요.</h2><p>한 편을 끝까지 읽고 "복습 예약하기"를 누르면, 하루 뒤부터 여기서 섞어서 복습해요.</p><a class="ez-btn primary" href="#/papers/easy">16편 목록</a>`; return; }
    const papers = await Promise.all(pool.map((id) => easyOf(id).then((d) => ({ id, d })).catch(() => null)));
    // 논문마다 2문제(본문 퀴즈 중 무작위) → 전부 섞기. 같은 논문이 연달아 나오지 않게 한 번 더 흩어요
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    let qs = papers.filter(Boolean).flatMap(({ id, d }) => shuffle(d.sections.flatMap((s) => s.body.filter((b) => b.t === "quiz"))).slice(0, 2).map((q) => ({ id, title: d.title, q })));
    qs = shuffle(qs);
    for (let i = 1; i < qs.length; i++) if (qs[i].id === qs[i - 1].id) { const j = qs.findIndex((x, k) => k > i && x.id !== qs[i].id); if (j > 0) [qs[i], qs[j]] = [qs[j], qs[i]]; }
    if (!alive) return;
    const res = {};
    let k = 0;
    const draw = () => {
      if (k >= qs.length) return finish();
      const it = qs[k];
      box.innerHTML = `<div class="ez-rv-top"><span>${k + 1} / ${qs.length}</span><span>${st.due.length ? "오늘 복습할 차례" : "미리 복습"} · ${papers.filter(Boolean).length}편 섞음</span></div><div class="ez-rv-bar"><i style="width:${(k / qs.length) * 100}%"></i></div>
        <p class="ez-rv-from">${esc(it.title)}</p>${quizHtml(it.q, "rv", "기억해서 고르기")}<div class="ez-row" id="ez-rv-next" hidden><button type="button" class="ez-btn primary">${k + 1 < qs.length ? "다음 문제" : "결과 보기"}</button></div>`;
      $(".qz", box).addEventListener("click", (e) => {
        const b = e.target.closest("[data-c]"); if (!b || b.disabled) return;
        const ok = answer($(".qz", box), +b.dataset.c);
        const r = (res[it.id] ||= { paper: it.id, correct: 0, total: 0 }); r.total++; if (ok) r.correct++;
        $("#ez-rv-next", box).hidden = false; $("#ez-rv-next button", box).focus();
      });
      $("#ez-rv-next button", box).addEventListener("click", () => { k++; draw(); });
    };
    const finish = async () => {
      const list = Object.values(res);
      box.innerHTML = `<h2>복습 끝!</h2><div class="ez-rv-sum">${list.map((r) => `<div><span>${esc(qs.find((x) => x.id === r.paper).title)}</span><b>${r.correct} / ${r.total}${!st.due.includes(r.paper) ? "" : r.correct * 2 >= r.total ? " · 다음 간격으로" : " · 내일 한 번 더"}</b></div>`).join("")}</div><p id="ez-rv-msg" class="ez-recall-s">저장하는 중…</p><div class="ez-row"><a class="ez-btn primary" href="#/papers/easy">16편 목록</a></div>`;
      if (!st.due.length) { $("#ez-rv-msg", box).textContent = "미리 한 복습이라 복습 날짜는 그대로 둬요. 틀린 문제는 그 논문을 다시 훑어보세요."; return; }
      try { await api.easyReview(list); $("#ez-rv-msg", box).textContent = "절반 이상 맞힌 논문은 다음 간격(3일 → 7일)으로, 아닌 논문은 내일 다시 나와요."; window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "papers" } })); }
      catch (x) { $("#ez-rv-msg", box).textContent = x.message || "저장하지 못했어요."; }
    };
    draw();
  })().catch((e) => { box.innerHTML = `<p class="ez-err">${esc(e.message || "불러오지 못했어요.")}</p>`; });
  wireMotion(root);
  return () => { alive = false; };
}

// AI 공부책 (공부 스위치의 AI 탭) — 내용: /books/index.json · /books/<book>.json (규격 scripts/books/BOOK_SPEC.md)
//   #/books                     책장 (오늘 할 일 · 이어 읽기 · 4주 실습 · 책마다 장 목록)
//   #/books/<book>/<chapter>    한 장 — 먼저 추측 → 그림이 연기 → 한 줄+정확한 말 → 만져 보기 → 책 덮고 말해 보기 → 자비스 연결 → 이번 주 실습
//   #/books/review              오늘 복습할 장의 퀴즈를 섞어서 다시 풀기 (절반 이상 → 다음 간격)
//   #/books/words               내 용어 사전 (읽은 장에서 만난 말)
// 장 위의 '깊게' 스위치를 켜면 수식 · 원어 · 논문 근거 · 코드(deep 블록)가 보여요. 복습 규칙은 논문 쉽게 읽기와 같아요 (1 → 3 → 7일).
import { api, streamBookAsk } from "../api.js";
import { toast } from "../util.js";
import { chatMarkup, mountChat } from "../papers/chat.js";
import { $, $$, esc, store, getJSON, md, inline, plain, blocks, quizHtml, answer, wireMotion, wireZoom, wireProgress, wireToc, bar, capOf } from "../papers/ez-core.js";
import { widgetHtml, wireWidgets } from "./widgets.js";

const idxB = () => getJSON("/books/index.json");
const bookOf = (id) => getJSON(`/books/${encodeURIComponent(id)}.json`);
const BAR = { href: "#/books", label: "AI 공부책" };
const key = (b, c) => `${b}/${c}`;
const WEEK = { 1: "1주 · 토크나이저 · 데이터 · 작은 GPT", 2: "2주 · 사전학습 · 손실 곡선 · 공개 모델 실행", 3: "3주 · 자비스 뼈대 — 검색 · 도구 · 음성", 4: "4주 · 내 모델 SFT → 뇌 교체 · 평가" };
const COLOR = { rose: "#D94C6B", violet: "#7A55D3", blue: "#1F6FD1", teal: "#1C9A98", green: "#22955B", amber: "#D28A1A", sand: "#9A7B55" };

// 코드 색: 파이썬 · 셸 정도만 (주석 · 문자열 · 숫자 · 키워드)
const KW = /\b(def|class|return|import|from|as|if|elif|else|for|while|in|not|and|or|with|try|except|lambda|yield|pass|break|continue|True|False|None|print|range|len|self|torch|np)\b/g;
function hi(code) {
  const TOK = /(#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/g;
  return esc(code).replace(TOK, (m) => (m.startsWith("#") ? `<span class="c">${m}</span>` : /^\d/.test(m) ? `<span class="n">${m}</span>` : `<span class="s">${m}</span>`)).replace(KW, (m) => `<span class="k">${m}</span>`);
}
// 공통 블록 + 책 전용(widget · code · formula · deep)
function bookBlocks(book) {
  const B = blocks(`/books/fig/${encodeURIComponent(book)}/`);
  let wn = 0;
  B.widget = (b) => widgetHtml(b, wn++);
  B.code = (b) => `<details class="ez-code"${b.open ? " open" : ""}><summary><span class="ez-code-k">코드</span>${esc(b.title || "직접 해 보기")}<small>${esc(b.lang || "")}</small></summary><pre><code>${hi(String(b.code || ""))}</code></pre>${b.note ? `<p class="ez-note" style="text-align:left">${inline(b.note)}</p>` : ""}</details>`;
  B.formula = (b) => `<div class="ez-formula"><code>${esc(b.text || "")}</code>${b.note ? `<p class="ez-note">${inline(b.note)}</p>` : ""}</div>`;
  B.deep = (b) => `<div class="ez-deep"><p class="ez-deep-k">깊게${b.title ? ` · ${esc(b.title)}` : ""}</p>${(b.body || []).map((x) => { try { return B[x.t] && x.t !== "deep" ? B[x.t](x, 0) : ""; } catch { return ""; } }).join("")}</div>`;
  return B;
}
const stageOf = (r, today) => (!r ? "" : r.stage >= 4 ? `<span class="ez-stage-b s4">복습 끝</span>` : r.due_day <= today ? `<span class="ez-stage-b due">복습할 차례</span>` : `<span class="ez-stage-b s${r.stage}">${r.stage === 1 ? "읽음" : `복습 ${r.stage - 1}회`} · ${md(r.due_day)}</span>`);
const chTitle = (idx, b, c) => { const bk = idx.books.find((x) => x.id === b); const ch = bk?.chapters.find((x) => x.id === c); return ch ? { book: bk, ch } : null; };

// ---------- 책장 ----------
export function mountShelf(host, ctx) {
  let alive = true, stops = [];
  host.innerHTML = `<div class="ezw bk">${bar("나만의 자비스까지", BAR)}<main class="ez"><p class="ez-loading">불러오는 중…</p></main></div>`;
  const root = $(".ezw", host), main = $(".ez", root);
  (async () => {
    const [idx, st] = await Promise.all([idxB(), api.booksState().catch(() => ({ items: [], due: [], today: "", tasks: [] }))]);
    if (!alive) return;
    const rows = new Map(st.items.map((r) => [key(r.book, r.chapter), r]));
    const all = idx.books.flatMap((b) => b.chapters.map((c) => ({ b, c })));
    const read = all.filter(({ b, c }) => rows.has(key(b.id, c.id))).length;
    const last = store.get("bk-last"), lastAt = last ? chTitle(idx, ...last.split("/")) : null;
    const nextUnread = all.find(({ b, c }) => !rows.has(key(b.id, c.id)));
    const weeks = [1, 2, 3, 4].map((w) => ({ w, items: all.filter(({ c }) => c.week === w) }));
    const tasksDone = (b, c) => st.tasks.filter((t) => t.startsWith(key(b, c) + "/")).length;
    main.innerHTML = `<section class="ez-hero"><p class="ez-kicker">AI 공부책 · ${idx.books.length}권 ${all.length}장</p><h1>AI 가 어떻게 만들어지고 돌아가는지,<br>1달 뒤 내 자비스까지.</h1>
      <p class="ez-lead">장마다 먼저 추측하고, 그림이 원리를 연기하고, 한 줄로 정리한 뒤 직접 만져 보고, 책을 덮고 말해 봐요. 깊게 스위치를 켜면 수식 · 논문 · 코드가 나와요. 1 → 3 → 7일 뒤에 퀴즈를 다시 풀어야 다음 단계로 가요.</p>
      <p class="ez-meta"><span>읽은 장 <b>${read}</b> / ${all.length}</span><span>전체 약 <b>${Math.round(idx.books.reduce((a, b) => a + b.minutes, 0) / 60 * 10) / 10}시간</b></span><a class="ez-link" href="#/books/words">내 용어 사전</a></p>
      ${st.due.length ? `<div class="ez-due"><b>오늘 복습할 장 ${st.due.length}개</b><span>${st.due.map((d) => esc(chTitle(idx, d.book, d.chapter)?.ch.title || d.chapter)).join(" · ")} — 문제를 섞어서 다시 풀어요. 절반 이상 맞혀야 다음 간격으로 가요.</span><a class="ez-btn primary" href="#/books/review">복습하기</a></div>`
        : read ? `<div class="ez-due"><b>오늘은 복습할 장이 없어요</b><span>다음 복습: ${esc(md(st.items.filter((r) => r.stage < 4).map((r) => r.due_day).sort()[0] || st.today))}. 미리 해 봐도 돼요.</span><a class="ez-btn" href="#/books/review">미리 복습하기</a></div>` : ""}
      ${lastAt || nextUnread ? `<div class="bk-resume">${lastAt ? `<a class="ez-btn primary" href="#/books/${esc(last)}">이어 읽기 <small>《${esc(lastAt.book.title)}》 ${esc(lastAt.ch.title)}</small></a>` : ""}${nextUnread && (!last || key(nextUnread.b.id, nextUnread.c.id) !== last) ? `<a class="ez-btn" href="#/books/${esc(nextUnread.b.id)}/${esc(nextUnread.c.id)}">다음 안 읽은 장 <small>${esc(nextUnread.c.title)}</small></a>` : ""}</div>` : ""}
    </section>
    ${weeks.some((w) => w.items.length) ? `<section class="bk-weeks"><p class="ez-stage">4주 · 뇌 교체형 자비스 만들기</p><div class="bk-week-row">${weeks.map(({ w, items }) => `<div class="bk-week"><b>${esc(WEEK[w])}</b>${items.length ? `<ul>${items.map(({ b, c }) => `<li><a href="#/books/${esc(b.id)}/${esc(c.id)}">${esc(c.title)}</a>${c.build ? `<span class="bk-task ${tasksDone(b.id, c.id) ? "on" : ""}">실습${tasksDone(b.id, c.id) ? " ✓" : ""}</span>` : ""}</li>`).join("")}</ul>` : `<span class="faint">곧 올라와요</span>`}</div>`).join("")}</div></section>` : ""}
    ${idx.books.map((b) => `<section class="bk-book" id="bk-${esc(b.id)}" style="--bc:${COLOR[b.color] || COLOR.blue}"><p class="ez-stage"><span class="bk-n">${b.n ?? ""}권</span> ${esc(b.title)}<span class="bk-min">${esc(b.chapters.length)}장 · 약 ${Math.round(b.minutes)}분</span></p>
      <h2 class="bk-head">${inline(b.headline)}</h2><p class="bk-why">${inline(b.why)}</p>
      <ul class="ez-list">${b.chapters.map((c, i) => `<li><a href="#/books/${esc(b.id)}/${esc(c.id)}"><span class="n">${String(i + 1).padStart(2, "0")}</span><span><b>${esc(c.title)}</b><span class="h">${c.week ? `${c.week}주차 · ` : ""}약 ${c.minutes}분 · 퀴즈 ${c.quizzes}개${c.build ? " · 실습" : ""}</span></span><span class="tagc">${stageOf(rows.get(key(b.id, c.id)), st.today)}</span></a></li>`).join("")}</ul></section>`).join("")}`;
    stops.push(wireMotion(root), wireProgress(root));
  })().catch((e) => { main.innerHTML = `<p class="ez-err">책장을 불러오지 못했어요. ${esc(e.message || "")}</p>`; });
  return () => { alive = false; stops.forEach((f) => f?.()); };
}

// ---------- 한 장 ----------
const QUICK = ["처음부터 아주 쉽게 3문장으로", "방금 읽은 걸 다른 비유로", "수식으로 정확히 말하면?", "내 자비스에서는 이걸 어디에 써요?", "확인 문제 하나 더 내 줘"];
export function mountChapter(host, ctx, bookId, chId) {
  let stops = [], alive = true, deep = store.get("bk-deep") === "on";
  const sw = () => `<button type="button" class="ez-link" id="bk-deep" aria-pressed="${deep}" title="켜면 수식 · 원어 용어 · 논문 근거 · 코드가 본문에 들어와요"><span class="ez-sw ${deep ? "on" : ""}" aria-hidden="true"><i></i></span><span class="ez-sw-t">${deep ? "깊게" : "쉽게"}</span></button>`;
  host.innerHTML = `<div class="ezw bk${deep ? " deep" : ""}">${bar("", { ...BAR, right: sw() })}<main class="ez"><p class="ez-loading">불러오는 중…</p></main></div>`;
  const portal = document.createElement("div"); portal.className = "ezw ez-portal";
  const chatOpts = { level: deep ? "deep" : "easy", quick: QUICK, sub: "AI 공부책", empty: "모르는 걸 바로 물어봐요. 장 제목 옆 '물어보기'를 눌러도 돼요. 깊게 스위치가 켜져 있으면 수식까지 답해요.", ph: "예: 어텐션이 정확히 뭐예요?", stream: (id, msgs, ev, sig, level) => streamBookAsk(bookId, chId, msgs, ev, sig, level) };
  portal.innerHTML = `<button type="button" class="ez-ai-fab" id="ez-ai-fab" aria-expanded="false" aria-controls="ez-ai"><img class="ez-ai-logo" src="/img/claude.svg" alt="" width="20" height="20">AI에게 물어보기</button>
    <aside class="ez-ai" id="ez-ai" aria-label="AI 튜터" hidden><div class="ez-ai-head"><img class="ez-ai-logo" src="/img/claude.svg" alt="" width="18" height="18"><b>AI 튜터</b><span id="bk-ai-sub">${deep ? "깊게 모드 — 수식까지" : "쉽게 모드"}</span><button type="button" class="ez-link" id="ez-ai-x">닫기</button></div>${chatMarkup("mini", chatOpts)}</aside>`;
  document.body.append(portal); stops.push(() => portal.remove());
  const root = $(".ezw", host), main = $(".ez", root), panel = $("#ez-ai", portal), fab = $("#ez-ai-fab", portal);
  const openAi = (on = true) => { panel.hidden = !on; fab.setAttribute("aria-expanded", on ? "true" : "false"); root.classList.toggle("ai-open", on); if (on) setTimeout(() => $(".ppc-in", panel)?.focus({ preventScroll: true }), 50); };
  const askAi = (text) => { openAi(true); const ta = $(".ppc-in", panel); ta.value = text; $("[data-ppc-form]", panel).requestSubmit(); };
  fab.addEventListener("click", () => openAi(panel.hidden));
  $("#ez-ai-x", portal).addEventListener("click", () => openAi(false));
  stops.push(mountChat(portal, key(bookId, chId), main, null, chatOpts));
  const setDeep = (on) => { deep = on; store.set("bk-deep", on ? "on" : "off"); root.classList.toggle("deep", on); chatOpts.level = on ? "deep" : "easy"; $("#bk-ai-sub", portal).textContent = on ? "깊게 모드 — 수식까지" : "쉽게 모드"; const b = $("#bk-deep", root); if (b) { b.outerHTML = sw(); $("#bk-deep", root).addEventListener("click", () => setDeep(!deep)); } };
  $("#bk-deep", root).addEventListener("click", () => setDeep(!deep));
  (async () => {
    let d, idx, st;
    try { [d, idx, st] = await Promise.all([bookOf(bookId), idxB(), api.booksState().catch(() => null)]); }
    catch { main.innerHTML = `<p class="ez-err">이 장을 불러오지 못했어요. <a href="#/books">책장으로</a></p>`; return; }
    if (!alive) return;
    const ci = d.chapters.findIndex((c) => c.id === chId), c = d.chapters[ci];
    if (!c) { main.innerHTML = `<p class="ez-err">없는 장이에요. <a href="#/books">책장으로</a></p>`; return; }
    const next = d.chapters[ci + 1], bi = idx.books.findIndex((b) => b.id === bookId), nextBook = next ? null : idx.books[bi + 1];
    const B = bookBlocks(bookId);
    const quizzes = c.sections.flatMap((s) => s.body.filter((b) => b.t === "quiz"));
    const pre = quizzes.slice(0, 2), mine = st?.items?.find((x) => x.book === bookId && x.chapter === chId);
    const guessKey = `bk-guess-${bookId}-${chId}`, guesses = JSON.parse(store.get(guessKey) || "{}");
    const tasks = new Set(st?.tasks || []);
    let qn = 0;
    store.set("bk-last", key(bookId, chId));
    $(".ez-brand span", root).textContent = `${d.title} · ${ci + 1}장`;
    main.innerHTML = `
      <section class="ez-hero"><p class="ez-kicker">${esc(d.kicker || d.title)} · ${ci + 1} / ${d.chapters.length}${c.week ? ` · ${c.week}주차` : ""}</p><h1>${inline(c.headline || c.title)}</h1><p class="ez-lead">${inline(c.lead || "")}</p>
        <p class="ez-meta"><span>약 <b>${esc(c.minutes || 12)}분</b></span><span>퀴즈 ${quizzes.length}개</span>${mine ? `<span>${mine.stage >= 4 ? "복습까지 끝냈어요" : `다음 복습 <b>${md(mine.due_day)}</b>`}</span>` : ""}</p>
        ${pre.length ? `<div class="ez-pre" id="ez-pre"><p class="ez-pre-k">읽기 전에 1분</p><p class="ez-pre-h">먼저 짐작해 보세요. 틀려도 괜찮아요.</p>
          <p class="ez-pre-s">답을 모르는 채로 먼저 골라 보면, 읽으면서 답을 만났을 때 더 오래 기억나요.</p>
          ${pre.map((q, k) => `<div class="qz" data-pre="${k}"><p class="qz-k">짐작 ${k + 1}</p><p class="qz-q">${inline(q.q)}</p><div class="qz-c">${q.choices.map((ch, j) => `<button type="button" data-g="${j}" class="${guesses[k] === j ? "pick" : ""}">${inline(ch)}</button>`).join("")}</div></div>`).join("")}</div>` : ""}
        ${c.words?.length ? `<div class="ez-pre"><p class="ez-pre-k">먼저 알아 둘 말</p><div class="ez-words-pre">${c.words.slice(0, 4).map((w) => `<div><b>${esc(w.term)}${w.en ? ` <i>${esc(w.en)}</i>` : ""}</b><span>${inline(w.easy)}</span></div>`).join("")}</div></div>` : ""}
      </section>
      ${c.sections.map((s, k) => `<section class="ez-sec" id="ez-s${k + 1}"><p class="ez-n">${String(k + 1).padStart(2, "0")}<button type="button" class="ez-ask" data-ask="${k}">AI에게 물어보기</button></p><h2>${inline(s.title)}</h2>${s.body.map((b) => { try { return B[b.t] ? B[b.t](b, b.t === "quiz" ? qn++ : 0) : ""; } catch (e) { console.warn(e); return ""; } }).join("")}</section>`).join("")}
      <section class="ez-sec" id="ez-recall-sec"><div class="ez-recall" id="ez-recall">
        <p class="ez-n">책 덮고 말해 보기</p><h2>보지 않고, 친구에게 설명하듯 3줄로 써 보세요.</h2>
        <p class="ez-recall-s">"${esc(plain(c.title))}" — 무엇이고, 왜 그렇게 하고, 자비스에선 어디에 쓰나? 떠올리는 순간이 다시 읽기보다 오래 남아요.</p>
        <textarea id="ez-recall-t" placeholder="예: 토큰은 … 이고, … 해서 … 가 돼요." aria-label="기억해서 설명 쓰기"></textarea>
        <div class="ez-row"><button type="button" class="ez-btn primary" id="ez-recall-go">다 썼어요 · 정리와 맞춰 보기</button><button type="button" class="ez-btn" id="ez-recall-skip">그냥 정리 보기</button></div>
        <div id="ez-recap" hidden></div></div>
        ${c.jarvis ? `<aside class="ez-box key bk-jarvis"><span class="k">자비스에서는</span><p>${inline(c.jarvis)}</p></aside>` : ""}</section>
      ${c.build ? `<section class="ez-sec" id="ez-build"><p class="ez-n">${c.week ? `${c.week}주차 ` : ""}실습</p><h2>${inline(c.build.title)}</h2>${c.build.note ? `<p class="ez-recall-s">${inline(c.build.note)}</p>` : ""}
        <ol class="bk-build">${c.build.steps.map((s, i) => { const t = `${key(bookId, chId)}/${i + 1}`; return `<li><label class="bk-step"><input type="checkbox" data-task="${esc(t)}" ${tasks.has(t) ? "checked" : ""}><span>${inline(s.text)}</span></label>${s.code ? B.code({ code: s.code, lang: s.lang || "bash", title: s.title || "명령 · 코드", open: true }) : ""}</li>`; }).join("")}</ol></section>` : ""}
      <section class="ez-sec">${c.words?.length ? `<div class="ez-words"><h3>이 장에 나온 말</h3><dl>${c.words.map((w) => `<dt>${esc(w.term)}${w.en ? ` <i>${esc(w.en)}</i>` : ""}</dt><dd>${inline(w.easy)}${w.deep ? `<span class="bk-wdeep">${inline(w.deep)}</span>` : ""}</dd>`).join("")}</dl></div>` : ""}
        <nav class="ez-next" aria-label="다음으로"><h3>다음으로</h3><div class="ez-next-row">
          ${next ? `<a class="ez-btn primary" href="#/books/${esc(bookId)}/${esc(next.id)}">다음 장 <small>${esc(next.title)}</small> →</a>` : nextBook ? `<a class="ez-btn primary" href="#/books/${esc(nextBook.id)}/${esc(nextBook.chapters[0].id)}">다음 책 <small>《${esc(nextBook.title)}》</small> →</a>` : ""}
          <a class="ez-btn" href="#/books">책장</a><a class="ez-btn" href="#/books/words">내 용어 사전</a></div></nav></section>`;
    $("#ez-pre", main)?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]"); if (!b) return;
      const k = +b.closest("[data-pre]").dataset.pre; guesses[k] = +b.dataset.g; store.set(guessKey, JSON.stringify(guesses));
      $$("[data-g]", b.closest("[data-pre]")).forEach((x) => x.classList.toggle("pick", x === b));
    });
    main.addEventListener("click", (e) => {
      const ak = e.target.closest("[data-ask]");
      if (ak) { const s = c.sections[+ak.dataset.ask]; askAi(`${+ak.dataset.ask + 1}절 "${plain(s.title)}" 을 ${deep ? "정확한 용어와 수식으로" : "더 쉽게, 다른 예를 들어"} 설명해 줘.`); return; }
      const b = e.target.closest(".ez-sec [data-c]"); if (!b || b.disabled) return;
      const q = b.closest(".qz"), k = +q.dataset.quiz.slice(1);
      answer(q, +b.dataset.c);
      if (k < pre.length && guesses[k] != null) { const g = document.createElement("span"); g.className = "ez-guess"; g.textContent = `읽기 전 짐작: ${String.fromCharCode(9312 + guesses[k])} ${guesses[k] === +q.dataset.a ? "— 처음부터 맞혔어요" : "— 읽고 나서 바로잡았어요"}`; $(".qz-w", q).append(g); }
    });
    main.addEventListener("change", async (e) => {
      const cb = e.target.closest("[data-task]"); if (!cb) return;
      try { await api.bookTask(cb.dataset.task, cb.checked); } catch (x) { cb.checked = !cb.checked; toast(x.message || "저장하지 못했어요.", "err"); }
    });
    const points = c.recap?.points || [];
    const reveal = (wrote) => {
      const box = $("#ez-recap", main), text = $("#ez-recall-t", main).value.trim();
      $("#ez-recall-go", main).disabled = true; $("#ez-recall-skip", main).disabled = true; $("#ez-recall-t", main).readOnly = true;
      box.hidden = false;
      box.innerHTML = `${wrote && text ? `<p class="ez-my">${esc(text)}</p>` : ""}
        <h3 class="pp-h3" style="margin:22px 0 6px">${inline(c.recap?.title || "정리")}</h3><p>${inline(c.recap?.text || "")}</p>
        ${points.length ? `<p class="ez-recall-s" style="margin:16px 0 0">${wrote ? "내가 떠올린 것에 체크해 보세요. 빠진 것만 다시 보면 돼요." : "핵심이에요. 다음에는 먼저 써 보고 맞춰 보세요."}</p>
          <ul class="ez-check">${points.map((p, j) => `<li><label><input type="checkbox" data-pt="${j}" ${wrote ? "" : "disabled"}><span>${inline(p)}</span></label></li>`).join("")}</ul>` : ""}
        <div class="ez-row"><button type="button" class="ez-btn primary" id="ez-save">다 읽었어요 · 복습 예약하기</button>${wrote && text ? `<button type="button" class="ez-btn" id="ez-ai-check">AI에게 내 설명 확인받기</button>` : ""}</div><div id="ez-saved"></div>`;
      $("#ez-ai-check", box)?.addEventListener("click", () => askAi(`내가 책을 덮고 쓴 설명이에요. 맞는 점 1~2개, 틀리거나 빠진 점 1~2개를 짧게 알려 줘:\n"${text.slice(0, 800)}"`));
      $("#ez-save", box).addEventListener("click", async (ev) => {
        ev.currentTarget.disabled = true;
        const got = wrote ? $$("[data-pt]:checked", box).length : null;
        try {
          const s2 = await api.bookRead(bookId, chId, got, wrote ? points.length : null), me2 = s2.items.find((x) => x.book === bookId && x.chapter === chId);
          $("#ez-saved", box).innerHTML = `<p class="ez-saved">${wrote ? `핵심 ${points.length}개 중 <b>${got}개</b>를 스스로 떠올렸어요. ` : ""}<b>${md(me2.due_day)}</b>에 이 장의 퀴즈를 다시 풀 차례가 와요. 절반 이상 맞히면 3일 → 7일로 넓어져요.</p>`;
          window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "books" } }));
        } catch (x) { ev.currentTarget.disabled = false; toast(x.message || "저장하지 못했어요.", "err"); }
      });
    };
    $("#ez-recall-go", main).addEventListener("click", () => { if (!$("#ez-recall-t", main).value.trim()) { toast("한 줄이라도 먼저 써 보세요. 틀려도 괜찮아요."); $("#ez-recall-t", main).focus(); return; } reveal(true); });
    $("#ez-recall-skip", main).addEventListener("click", () => reveal(false));
    wireZoom(main); wireWidgets(main);
    const toc = [["ez-top", "시작 · 짐작해 보기"], ...c.sections.map((s, k) => [`ez-s${k + 1}`, `${String(k + 1).padStart(2, "0")}  ${plain(s.title)}`]), ["ez-recall-sec", "책 덮고 말해 보기"], ...(c.build ? [["ez-build", "이번 주 실습"]] : [])];
    stops.push(wireMotion(root), wireProgress(root), wireToc(root, main, toc));
  })();
  return () => { alive = false; stops.forEach((f) => f?.()); };
}

// ---------- 복습: 오늘 due 인 장마다 퀴즈 3개를 섞어서 ----------
export function mountReview(host, ctx) {
  let alive = true;
  host.innerHTML = `<div class="ezw bk">${bar("복습", BAR)}<main class="ez"><div class="ez-rv"><p class="ez-loading">문제 고르는 중…</p></div></main></div>`;
  const root = $(".ezw", host), box = $(".ez-rv", root);
  (async () => {
    const [idx, st] = await Promise.all([idxB(), api.booksState()]);
    let pool = st.due.length ? st.due : st.items.filter((r) => r.stage < 4).map((r) => ({ book: r.book, chapter: r.chapter }));
    if (!pool.length) pool = st.items.map((r) => ({ book: r.book, chapter: r.chapter }));
    if (!pool.length) { box.innerHTML = `<h2>아직 읽은 장이 없어요.</h2><p>한 장을 끝까지 읽고 "복습 예약하기"를 누르면, 하루 뒤부터 여기서 퀴즈를 다시 풀어요.</p><a class="ez-btn primary" href="#/books">책장</a>`; return; }
    const books = new Map(); await Promise.all([...new Set(pool.map((p) => p.book))].map((b) => bookOf(b).then((d) => books.set(b, d)).catch(() => null)));
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    let qs = pool.flatMap(({ book, chapter }) => { const c = books.get(book)?.chapters.find((x) => x.id === chapter); if (!c) return []; return shuffle(c.sections.flatMap((s) => s.body.filter((b) => b.t === "quiz"))).slice(0, 3).map((q) => ({ id: key(book, chapter), book, chapter, title: `${books.get(book).title} · ${plain(c.title)}`, q })); });
    qs = shuffle(qs);
    for (let i = 1; i < qs.length; i++) if (qs[i].id === qs[i - 1].id) { const j = qs.findIndex((x, k) => k > i && x.id !== qs[i].id); if (j > 0) [qs[i], qs[j]] = [qs[j], qs[i]]; }
    if (!alive) return;
    const res = {};
    let k = 0;
    const dueKeys = new Set(st.due.map((d) => key(d.book, d.chapter)));
    const draw = () => {
      if (k >= qs.length) return finish();
      const it = qs[k];
      box.innerHTML = `<div class="ez-rv-top"><span>${k + 1} / ${qs.length}</span><span>${st.due.length ? "오늘 복습할 차례" : "미리 복습"} · ${pool.length}장 섞음</span></div><div class="ez-rv-bar"><i style="width:${(k / qs.length) * 100}%"></i></div>
        <p class="ez-rv-from">${esc(it.title)}</p>${quizHtml(it.q, "rv", "기억해서 고르기")}<div class="ez-row" id="ez-rv-next" hidden><button type="button" class="ez-btn primary">${k + 1 < qs.length ? "다음 문제" : "결과 보기"}</button></div>`;
      $(".qz", box).addEventListener("click", (e) => {
        const b = e.target.closest("[data-c]"); if (!b || b.disabled) return;
        const ok = answer($(".qz", box), +b.dataset.c);
        const r = (res[it.id] ||= { book: it.book, chapter: it.chapter, title: it.title, correct: 0, total: 0 }); r.total++; if (ok) r.correct++;
        $("#ez-rv-next", box).hidden = false; $("#ez-rv-next button", box).focus();
      });
      $("#ez-rv-next button", box).addEventListener("click", () => { k++; draw(); });
    };
    const finish = async () => {
      const list = Object.values(res);
      box.innerHTML = `<h2>복습 끝!</h2><div class="ez-rv-sum">${list.map((r) => `<div><span>${esc(r.title)}</span><b>${r.correct} / ${r.total}${!dueKeys.has(key(r.book, r.chapter)) ? "" : r.correct * 2 >= r.total ? " · 다음 간격으로" : " · 내일 한 번 더"}</b></div>`).join("")}</div><p id="ez-rv-msg" class="ez-recall-s">저장하는 중…</p><div class="ez-row"><a class="ez-btn primary" href="#/books">책장</a></div>`;
      if (!st.due.length) { $("#ez-rv-msg", box).textContent = "미리 한 복습이라 복습 날짜는 그대로 둬요. 틀린 문제는 그 장을 다시 훑어보세요."; return; }
      try { await api.bookReview(list.map(({ book, chapter, correct, total }) => ({ book, chapter, correct, total }))); $("#ez-rv-msg", box).textContent = "절반 이상 맞힌 장은 다음 간격(3일 → 7일)으로, 아닌 장은 내일 다시 나와요."; window.dispatchEvent(new CustomEvent("trio:changed", { detail: { kind: "books" } })); }
      catch (x) { $("#ez-rv-msg", box).textContent = x.message || "저장하지 못했어요."; }
    };
    draw();
  })().catch((e) => { box.innerHTML = `<p class="ez-err">${esc(e.message || "불러오지 못했어요.")}</p>`; });
  wireMotion(root);
  return () => { alive = false; };
}

// ---------- 내 용어 사전: 읽은 장에서 만난 말 (전체 보기도 돼요) ----------
export function mountWords(host, ctx) {
  let alive = true;
  host.innerHTML = `<div class="ezw bk">${bar("내 용어 사전", BAR)}<main class="ez"><p class="ez-loading">불러오는 중…</p></main></div>`;
  const root = $(".ezw", host), main = $(".ez", root);
  (async () => {
    const [idx, st] = await Promise.all([idxB(), api.booksState().catch(() => ({ items: [] }))]);
    const books = await Promise.all(idx.books.map((b) => bookOf(b.id).catch(() => null)));
    if (!alive) return;
    const read = new Set(st.items.map((r) => key(r.book, r.chapter)));
    const all = [];
    books.filter(Boolean).forEach((d) => d.chapters.forEach((c) => (c.words || []).forEach((w) => all.push({ ...w, book: d.title, ch: plain(c.title), href: `#/books/${d.id}/${c.id}`, read: read.has(key(d.id, c.id)) }))));
    let onlyRead = all.some((w) => w.read), q = "";
    const draw = () => {
      const list = all.filter((w) => (!onlyRead || w.read) && (!q || (w.term + (w.en || "") + w.easy).toLowerCase().includes(q)));
      $("#bk-wl", main).innerHTML = list.length ? `<dl>${list.map((w) => `<dt>${esc(w.term)}${w.en ? ` <i>${esc(w.en)}</i>` : ""}</dt><dd>${inline(w.easy)}${w.deep ? `<span class="bk-wdeep">${inline(w.deep)}</span>` : ""}<a class="bk-wfrom" href="${esc(w.href)}">${esc(w.book)} · ${esc(w.ch)}</a></dd>`).join("")}</dl>` : `<p class="faint">${onlyRead ? "아직 읽은 장이 없어요. 한 장을 읽으면 여기에 낱말이 쌓여요." : "찾는 말이 없어요."}</p>`;
      $("#bk-wn", main).textContent = `${list.length}개`;
    };
    main.innerHTML = `<section class="ez-hero"><p class="ez-kicker">내 용어 사전</p><h1>읽은 장에서 만난 말, <span id="bk-wn"></span></h1><p class="ez-lead">쉬운 뜻 아래에 정확한 뜻(깊게)이 같이 있어요. 낱말을 누르면 나온 장으로 가요.</p>
      <div class="ez-row"><input type="search" id="bk-ws" class="bk-search" placeholder="낱말 찾기" aria-label="낱말 찾기"><label class="bk-only"><input type="checkbox" id="bk-only" ${onlyRead ? "checked" : ""}> 읽은 장의 말만</label></div></section><section class="ez-sec ez-words" id="bk-wl"></section>`;
    $("#bk-ws", main).addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
    $("#bk-only", main).addEventListener("change", (e) => { onlyRead = e.target.checked; draw(); });
    draw();
  })().catch((e) => { main.innerHTML = `<p class="ez-err">${esc(e.message || "불러오지 못했어요.")}</p>`; });
  return () => { alive = false; };
}

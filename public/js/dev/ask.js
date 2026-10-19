// 개발 흐름 — AI 질문 탭 (${C.base}/ask[/<모듈>]): 고른 주 전체(두런 장면 · 목표 · 카드 20장 · 사례)를 보고 답하는 튜터.
// 카드 화면 옆 튜터와 같은 채팅 부품이고, 대화는 주마다 따로 기억해요. 본문 글자를 긁으면 그 문장으로 물어볼 수 있어요.
import { $, esc } from "../util.js";
import { streamCourseAsk } from "../api.js";
import { chatMarkup, mountChat } from "../papers/chat.js";
import { index, state, position, topbar, C, cApi } from "./data.js";


export function mountAsk(host, ctx, modId) {
  let alive = true, stop = null, deep = false;
  host.innerHTML = `${topbar("ask")}<p class="dv-loading">불러오는 중…</p>`;
  (async () => {
    const [idx, st] = await Promise.all([index(), state()]);
    if (!alive) return;
    const m = idx.modules.find((x) => x.id === modId) || idx.modules[position(idx, st).i];
    host.innerHTML = `${topbar("ask")}
      <div class="dv-wrap dv-askpage" id="dv-askpage">
        <div class="m acc">AI 질문 · ${m.no} ${esc(m.title)}</div>
        <h1 style="margin:12px 0 10px">공부하다 막히면 바로 물어봐요</h1>
        <p class="kr" style="font-size:16px;line-height:1.75;color:var(--dv-sub);margin:0;max-width:760px">AI가 이 주의 이야기 장면 · 목표 · 카드 20장 · 사례를 보고 답해요. 판단을 묻는 질문에는 정답부터 주지 않고 기준을 먼저 보여 줘요. 자료에 없는 사실은 지어내지 않고 “확인이 필요해요”라고 해요.</p>
        <nav class="dv-askmods" aria-label="어느 주를 물어볼까요">${idx.modules.map((x) => `<a class="dv-chip${x.id === m.id ? " on" : ""}" href="${C.base}/ask/${x.id}"${x.id === m.id ? ' aria-current="page"' : ""}>${x.no} ${esc(x.short)}</a>`).join("")}</nav>
        <div class="dv-askbox" id="dv-ask">
          <div class="dv-askbar"><span class="kr dim" style="font-size:14px">“${esc(m.q)}”</span><span style="display:inline-flex;align-items:center;gap:8px"><span class="m">답 수준</span><button class="dv-chip" id="dv-lv" aria-pressed="false" style="height:36px;padding:0 12px">쉽게</button></span></div>
          ${chatMarkup("full", { quick: C.quickWeek, sub: `${m.no} ${m.title}`, empty: "이번 주에 궁금한 걸 물어보세요. 카드에서 읽은 문장을 붙여 넣어도 돼요.", ph: C.ph })}
        </div>
        <p class="kr dim" style="font-size:13px;line-height:1.7;margin:14px 0 0">카드 한 장을 깊게 물어보려면 카드 화면 오른쪽 튜터를 써요 · <a href="${C.base}/${m.id}">${m.no}주차로 가기</a></p>
      </div>`;
    const opts = { level: "easy", quick: C.quickWeek, stream: (id, msgs, ev, sig, level) => streamCourseAsk(C.key, m.id, "week", msgs, ev, sig, level, "") };
    stop = mountChat($("#dv-ask", host), `${C.key}-ask-${m.id}`, $("#dv-askpage", host), null, opts) || null;
    $("#dv-lv", host).addEventListener("click", (e) => { deep = !deep; opts.level = deep ? "deep" : "easy"; e.currentTarget.setAttribute("aria-pressed", deep); e.currentTarget.textContent = deep ? "깊게" : "쉽게"; });
  })().catch((e) => { if (alive) host.innerHTML = `${topbar("ask")}<p class="dv-err">불러오지 못했어요. ${esc(e?.message || "")}</p>`; });
  return () => { alive = false; try { stop?.(); } catch {} };
}

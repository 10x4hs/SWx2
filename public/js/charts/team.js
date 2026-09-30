// 홈 5쪽 "우리 셋" — 한 주를 셋이 나란히. 숫자는 셋 다(공부 시간 · 계획 달성), 회고 글은 나만.
// 막대 색 = 멤버 색(--m0~2). 진한 막대 = 한 것, 회색 = 남은 계획. UI(탭·버튼)는 무채색.
import { esc, hm, initial, pct } from "../util.js";
import { icon } from "../icons.js";
import { renderMarkdown } from "../md.js";

const short = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
const ZERO = { plans_done: 0, plans_total: 0, focus_mins: 0, english_mins: 0, study_mins: 0, diary_days: 0, active_days: 0, score_avg: null, cheers: 0 };

// data = GET /review/week 응답 (없으면 불러오는 중), users = 가입 순서(색 순서), meId
export function teamWeek({ data, users, meId, off, weekNo, from, to, busy, error }) {
  const seg = `<nav class="seg wk-seg" aria-label="어느 주">
      <button type="button" data-wk="-1" aria-pressed="${off === -1}">지난주</button>
      <button type="button" data-wk="0" aria-pressed="${off === 0}">이번 주</button>
    </nav>`;
  const head = `<header class="wk-head">
      <div><h2 class="wk-title">우리 셋 · ${weekNo}주차</h2><p class="wk-range">${short(from)} – ${short(to)} · ${off === 0 ? "이번 주" : "지난주"}</p></div>
      ${seg}
    </header>`;
  if (!data) {
    return `<div class="wk" data-wk-page>${head}<p class="wk-empty">${error ? `불러오지 못했어요. ${esc(error)}` : "불러오는 중…"}</p></div>`;
  }
  const rows = users.map((u, i) => ({ u, i, m: { ...ZERO, ...(data.members || []).find((x) => x.user_id === u.id) } }));
  const maxStudy = Math.max(60, ...rows.map((r) => r.m.study_mins || 0));
  const label = rows.map(({ u, m }) => `${u.username.toUpperCase()} 공부 ${hm(m.study_mins)}, 계획 ${m.plans_done}/${m.plans_total}`).join(" · ");
  const chart = `<div class="wk-chart" role="img" aria-label="${esc(label)}">
    ${rows.map(({ u, i, m }) => {
      const sw = ((m.study_mins || 0) / maxStudy) * 100, pr = m.plans_total ? m.plans_done / m.plans_total : 0;
      const facts = [m.active_days ? `공부한 날 ${m.active_days}일` : "", m.score_avg != null ? `평균 ${Math.round(m.score_avg)}점` : "", m.diary_days ? `일기 ${m.diary_days}일` : "", m.cheers ? `👏 ${m.cheers}` : ""].filter(Boolean).join(" · ");
      return `<div class="wk-row" style="--c:var(--m${i % 3})">
        <span class="wk-who"><span class="av sm" style="--c:var(--m${i % 3})">${esc(initial(u.display_name))}</span><b>${esc(u.username.toUpperCase())}</b>${u.id === meId ? "<small>나</small>" : ""}</span>
        <div class="wk-bars">
          <div class="wk-bar" title="공부 시간 = 집중 ${hm(m.focus_mins)} + 영어 ${hm(m.english_mins)}"><span>공부</span><i><b style="width:${sw.toFixed(1)}%"></b></i><em>${m.study_mins ? hm(m.study_mins) : "—"}</em></div>
          <div class="wk-bar plan" title="이번 주에 끝낸 계획 ${m.plans_done}개 / 전체 ${m.plans_total}개"><span>계획</span><i><b style="width:${(pr * 100).toFixed(1)}%"></b></i><em>${m.plans_total ? `${m.plans_done}/${m.plans_total} · ${pct(pr)}%` : "—"}</em></div>
        </div>
        <span class="wk-facts">${facts || "아직 기록이 없어요"}</span>
      </div>`;
    }).join("")}
  </div>`;
  const mine = data.mine;
  const ai = `<section class="wk-ai" aria-labelledby="wk-ai-t">
      <div class="wk-ai-h"><h3 id="wk-ai-t">내 AI 회고</h3><span>${icon.lock(12)} 나만 봐요</span></div>
      ${mine?.body
        ? `<div class="wk-ai-body md">${renderMarkdown(mine.body)}</div>
           <button class="btn sm ghost" type="button" id="wk-ai-btn" ${busy ? "disabled" : ""}>${icon.spark(14)}${busy ? "다시 돌아보는 중…" : "다시 만들기"}</button>`
        : `<p class="wk-ai-empty">AI가 <b>내 기록만</b>(계획 · 실행 기록 · 영어 · 노트 제목)으로 한 주를 짧게 돌아봐 줘요.${off === 0 ? " 일요일 밤 10시에 자동으로도 만들어져요." : ""}</p>
           <button class="btn sm accent" type="button" id="wk-ai-btn" ${busy ? "disabled" : ""}>${icon.spark(14)}${busy ? "AI가 한 주를 돌아보는 중…" : "AI 회고 만들기"}</button>`}
    </section>`;
  return `<div class="wk" data-wk-page>${head}${chart}${ai}
    <p class="wk-note">숫자는 셋이 같이 봐요. 회고 글은 나만 보고, 일기는 AI에 절대 보내지 않아요.</p></div>`;
}

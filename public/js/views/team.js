// 우리 셋: 멤버별 연·월·주·오늘 진행과 오늘 타임라인
import { api } from "../api.js";
import { $, esc, ymd, today, periodKey, elapsed, dayScore, pct, initial, toMin, nowTime, toast, hm } from "../util.js";

export function mount(root, ctx) {
  const t = today();
  const keys = { year: periodKey("year", t), month: periodKey("month", t), week: periodKey("week", t), day: periodKey("day", t) };
  root.innerHTML = `
    <div class="view">
      <header class="vhead">
        <div class="title">
          <span class="eyebrow">Together · ${ctx.users.length}명</span>
          <h1 class="h1">우리 셋, 지금 어디쯤</h1>
        </div>
        <div class="row faint" style="font-size:12.5px">올해 ${pct(elapsed(keys.year))}% · 이번 달 ${pct(elapsed(keys.month))}% · 이번 주 ${pct(elapsed(keys.week))}% 지났어요</div>
      </header>
      <div class="grid-3" id="mates"></div>
      ${ctx.users.length < 3 ? `<p class="empty">아직 ${3 - ctx.users.length}명이 더 가입할 수 있어요. 초대 코드를 친구에게 알려 주세요.</p>` : ""}
    </div>`;

  async function load() {
    try {
      const { rows } = await api.summary(Object.values(keys));
      const data = await Promise.all(ctx.users.map(async (u) => {
        const [p, l] = await Promise.all([api.plans([keys.day], u.id), api.logs(ymd(t), u.id)]);
        return { u, plans: p.plans, logs: l.logs };
      }));
      const rate = (uid, k) => { const r = rows.find((x) => x.user_id === uid && x.period === k); return r && r.total ? { v: r.done / r.total, txt: `${r.done}/${r.total}` } : { v: 0, txt: "–" }; };
      const nowM = toMin(nowTime());
      $("#mates", root).innerHTML = data.map(({ u, plans, logs }) => {
        const sc = dayScore(plans, u.day_goal), me = u.id === ctx.me.id;
        const blocks = plans.filter((p) => p.start).map((p) => {
          const s = Math.max(360, toMin(p.start)), e = Math.min(1440, toMin(p.start) + (p.mins || 30));
          if (e <= 360) return "";
          return `<i class="${p.done ? "done" : ""}" style="left:${((s - 360) / 1080) * 100}%;width:${Math.max(.8, ((e - s) / 1080) * 100)}%" title="${esc(p.start + " " + p.text)}"></i>`;
        }).join("");
        const m = (label, r) => `<div class="meter"><span>${label}</span><div class="bar"><i style="width:${pct(r.v)}%"></i></div><em>${r.txt}</em></div>`;
        return `
          <section class="panel mate" style="--me:${esc(u.color)}${me ? ";border-color:" + esc(u.color) : ""}">
            <div class="mate-top">
              <span class="av lg" style="--c:${esc(u.color)}">${esc(initial(u.display_name))}</span>
              <div class="who"><b>${esc(u.display_name)}</b><span class="faint" style="font-size:12px">${me ? "나" : "@" + esc(u.username)}</span></div>
              <div class="score"><b>${sc.score ?? "–"}</b><span>TODAY</span></div>
            </div>
            <div style="display:grid;gap:8px">
              ${m("올해", rate(u.id, keys.year))}${m("이번 달", rate(u.id, keys.month))}${m("이번 주", rate(u.id, keys.week))}
              <div class="meter"><span>오늘</span><div class="bar"><i style="width:${pct(sc.exec)}%"></i></div><em>${sc.count ? `${sc.doneCount}/${sc.count}` : "–"}</em></div>
            </div>
            <div style="display:grid;gap:4px">
              <div class="mini-day" aria-label="오늘 시간표">${blocks}${nowM >= 360 ? `<span class="now" style="left:${((nowM - 360) / 1080) * 100}%"></span>` : ""}</div>
              <div class="mini-axis"><span>06</span><span>12</span><span>18</span><span>24</span></div>
            </div>
            <div style="display:grid;gap:6px">
              <span class="eyebrow">오늘 기록 · ${logs.length}</span>
              ${logs.length ? `<ul>${logs.slice(-4).map((l) => `<li><time>${esc(l.at)}</time><span>${esc(l.text)}</span></li>`).join("")}</ul>` : `<span class="faint" style="font-size:13px">아직 기록이 없어요</span>`}
            </div>
            <a class="btn ghost sm" href="${me ? "#/today" : `#/u/${u.id}/today/${ymd(t)}`}">${me ? "내 하루 열기" : "하루 보기"} · ${hm(sc.planned)} 계획</a>
          </section>`;
      }).join("");
    } catch (e) { toast(e.message, "err"); }
  }
  load();
  const tick = setInterval(load, 60_000);
  return () => clearInterval(tick);
}

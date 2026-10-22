// CIM 시험 — 큰 줄 네 개만: 오답 다시 풀기 · 문제 풀기 · 모의고사 · 숫자 외우기
//   #/cim/exam                 네 줄
//   #/cim/exam/quiz            문제 풀기 고르기 (장 또는 섞어서 · 문제 수)
//   #/cim/exam/ch/<장>/<수>     장별 (수 = 10 · 20 · 999 전부)
//   #/cim/exam/mix/<장,장,…>[/<수>]  섞어서 (기본 30)
//   #/cim/exam/due · /wrong    오늘 돌아온 오답 · 오답노트 전체
//   #/cim/exam/mock            모의고사 100문항 · 120분 (mock.js)
//   #/cim/exam/cards           숫자 외우기 (cards.js)
import { st, dueIds, wrongIds, seenIn } from "./store.js";
import { CH, ORDER, CALC, LAW, TOTAL_Q, chOf } from "./meta.js";
import { chapters, QI, QS_BY } from "./data.js";
import { NOTES } from "./notes.js";
import { runQuiz, interleave } from "./quiz.js";
import { mountMock } from "./mock.js";
import { mountCards } from "./cards.js";
import { setAi } from "./ai.js";
import { esc, shuffle, loading, errorBox } from "./ui.js";
import { toast } from "../util.js";

const MIX = { calc: ["계산 파트 섞어서", CALC], law: ["법규 · 윤리 · 세제 섞어서", LAW], all: ["전체 섞어서", ORDER] };
const opt = (href, title, sub, hot, attrs = "") => `<a class="c-big press${hot ? " hot" : ""}" href="${href}" ${attrs}><b>${title}</b><span>${sub}</span><span class="arrow" aria-hidden="true">→</span></a>`;

export function mountExam(host, r) {
  let stop = null;
  if (r.id === "mock") return mountMock(host);
  if (r.id === "cards") return mountCards(host);
  if (r.id === "quiz") setup();
  else if (["ch", "mix", "due", "wrong"].includes(r.id)) run(r);
  else home();

  function home() {
    const S = st(), due = dueIds().length, wn = wrongIds().length;
    const w = due ? opt("#/cim/exam/due", "오답 다시 풀기", `오늘 돌아온 문제 ${due}개`, true) : wn ? opt("#/cim/exam/wrong", "오답 다시 풀기", `오늘은 없어요 · 오답노트 ${wn}개 전체`, false) : opt("#/cim/exam/due", "오답 다시 풀기", "틀린 문제가 아직 없어요", false, 'aria-disabled="true" data-off');
    host.innerHTML = `<div class="c-exam"><h1>시험</h1>
      ${w}
      ${opt("#/cim/exam/quiz", "문제 풀기", `장을 고르거나 섞어서 · ${TOTAL_Q.toLocaleString("ko-KR")}문제`, false)}
      ${opt("#/cim/exam/mock", "모의고사", S.run ? "진행 중 · 이어서 풀기" : "실전처럼 100문항 · 120분", !!S.run)}
      ${opt("#/cim/exam/cards", "숫자 외우기", `세율 · 기간 · 한도 ${NOTES.NUMS.length}장`, false)}
    </div>`;
    host.querySelector("[data-off]")?.addEventListener("click", (e) => { e.preventDefault(); toast("틀린 문제가 생기면 여기서 다시 풀어요."); });
    setAi({ kind: "general", topic: `시험 탭 · 오늘 돌아온 오답 ${due}개 · 오답노트 ${wn}개` });
  }

  function setup() {
    let n = "20";
    host.innerHTML = `<div class="c-exam"><div class="c-shead"><a class="c-ghost press" href="#/cim/exam">← 시험</a><span></span></div><h1>문제 풀기</h1>
      <label class="c-field"><span>어떤 장?</span><select id="c-ch">
        <optgroup label="섞어서">${Object.entries(MIX).map(([k, [t]]) => `<option value="mix:${k}">${t}</option>`).join("")}</optgroup>
        ${[1, 2, 3].map((s) => `<optgroup label="${s}과목">${ORDER.filter((id) => CH[id].s === s).map((id) => `<option value="${id}">${CH[id].c}장 ${esc(CH[id].t)} (${seenIn(id)}/${CH[id].nq})</option>`).join("")}</optgroup>`).join("")}
      </select></label>
      <div class="c-field"><span id="c-n-l">몇 문제?</span><div class="c-seg" role="group" aria-labelledby="c-n-l" id="c-n">${[["10", "10개"], ["20", "20개"], ["999", "전부"]].map(([v, t]) => `<button type="button" class="press" data-n="${v}" aria-pressed="${v === n}">${t}</button>`).join("")}</div></div>
      <button type="button" class="c-go press" data-start>시작 <span>→</span></button></div>`;
    host.onclick = (e) => {
      const b = e.target.closest("[data-n]"); if (b) { n = b.dataset.n; host.querySelectorAll("#c-n [data-n]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); return; }
      if (e.target.closest("[data-start]")) { const v = host.querySelector("#c-ch").value; location.hash = v.startsWith("mix:") ? `#/cim/exam/mix/${MIX[v.slice(4)][1].join(",")}/${n === "999" ? 60 : n}` : `#/cim/exam/ch/${v}/${n}`; }
    };
    setAi({ kind: "general", topic: "문제 풀기 고르기" });
  }

  async function run(r) {
    const mode = r.id, arg = r.sub || "";
    let ids = [], label = "";
    if (mode === "ch" && ORDER.includes(arg)) { ids = [arg]; label = `${CH[arg].c}장 ${CH[arg].t}`; }
    else if (mode === "mix") { ids = arg.split(",").filter((x) => ORDER.includes(x)); label = "섞어서"; }
    else if (mode === "due") { ids = dueIds().map(chOf); label = "오늘 오답"; }
    else if (mode === "wrong") { ids = wrongIds().map(chOf); label = "오답노트"; }
    host.innerHTML = `<div class="c-session" id="c-run">${loading("문제 불러오는 중")}</div>`;
    const box = host.querySelector("#c-run");
    try { await chapters(ids, (k, t) => { if (t > 1) box.innerHTML = loading(`문제 불러오는 중 <span class="num">${k}/${t}</span>`); }); }
    catch (e) { box.innerHTML = errorBox(esc(e.message)); return; }
    if (!host.isConnected) return;
    let qs = [];
    if (mode === "ch") qs = shuffle(QS_BY[arg] || []).slice(0, +r.item || 20);
    else if (mode === "mix") qs = interleave(ids, +r.item || 30);
    else if (mode === "due") qs = shuffle(dueIds().map((id) => QI[id]).filter(Boolean));
    else if (mode === "wrong") qs = shuffle(wrongIds().map((id) => QI[id]).filter(Boolean));
    if (!qs.length) { toast(mode === "due" ? "오늘 다시 볼 오답이 없어요." : "문제가 없어요."); location.replace("#/cim/exam"); return; }
    stop = runQuiz(box, qs, { title: label, back: mode === "ch" || mode === "mix" ? "#/cim/exam/quiz" : "#/cim/exam" });
  }
  return { stop: () => stop?.() };
}

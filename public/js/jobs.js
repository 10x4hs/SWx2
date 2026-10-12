// 백그라운드 AI 작업 — 화면(view)과 떼어 놓고 돌려요. 다른 화면으로 가도 계속되고, 끝나면 알림 카드(열기 버튼)가 떠요.
// 서버 쪽 작업은 요청이 끊겨도 끝까지 가요(페이지는 만들어져요). 여기서는 결과를 받아 알려 주는 역할.
import { $, esc } from "./util.js";

const jobs = new Map(); let seq = 0;
function tray() {
  let el = $("#jobs-tray");
  if (!el) { el = document.createElement("div"); el.id = "jobs-tray"; el.className = "jobs-tray"; document.body.appendChild(el); }
  return el;
}
function draw() {
  const el = tray(), list = [...jobs.values()];
  el.innerHTML = list.map((j) => `<div class="job ${j.state}" data-job="${j.id}">
      <span class="job-dot"></span><span class="job-label">${esc(j.state === "running" ? j.label : j.result?.text || j.error || j.label)}</span>
      ${j.state === "done" && j.result?.go ? `<button type="button" class="job-go" data-go="${esc(j.result.go)}">열기</button>` : ""}
      ${j.state !== "running" ? `<button type="button" class="job-x" data-x="${j.id}" aria-label="닫기">✕</button>` : ""}
    </div>`).join("");
  el.hidden = !list.length;
}
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]"); if (go) { location.hash = go.dataset.go; jobs.delete(+go.closest("[data-job]").dataset.job); draw(); return; }
  const x = e.target.closest("[data-x]"); if (x) { jobs.delete(+x.dataset.x); draw(); }
});
// { label, task: () => Promise, onDone(result) → { text, go } | void, onFail(err) }
export function runJob({ label, task, onDone, onFail }) {
  const id = ++seq, j = { id, label, state: "running", startedAt: Date.now() };
  jobs.set(id, j); draw();
  task().then((r) => {
    let result = null; try { result = onDone?.(r) || null; } catch (e) { console.error(e); }
    j.state = "done"; j.result = result || { text: `${label} — 끝났어요.` }; draw();
    if (!result?.go) setTimeout(() => { if (jobs.get(id)?.state === "done") { jobs.delete(id); draw(); } }, 8000);
  }).catch((err) => {
    j.state = "failed"; j.error = `${label} — 실패: ${err?.message || "다시 시도해 주세요."}`; draw();
    try { onFail?.(err); } catch {}
  });
  return id;
}

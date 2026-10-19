// SW 공간 — #/sw (과정 목록) · #/sw/<과정> (그 과정 홈) · #/sw/<과정>/today · docs · ask[/<모듈>] · <모듈> (한 주)
//   #/sw/<과정>/<모듈>/<카드> · <모듈>/case/<사례> · <모듈>/practice[/<날>] (회의실) — 과정: dev(개발 흐름) · vg(Vector & Graph)
//   옛 주소 #/dev/… 는 #/sw/dev/… 와 같아요
//   뒤에는 장면(stage.js) 하나가 화면을 옮겨도 그대로 깔려 있고, 화면마다 모드만 바꿔요 (홈 = 전체 장면, 공부 화면 = 흐리게)
import { mountSw } from "../dev/sw.js";
import { mountHome } from "../dev/home.js";
import { mountVgHome } from "../dev/vghome.js";
import { mountWeek } from "../dev/week.js";
import { mountCard } from "../dev/card.js";
import { mountCase } from "../dev/case.js";
import { mountMeeting } from "../dev/meeting.js";
import { mountToday } from "../dev/today.js";
import { mountDocs } from "../dev/docs.js";
import { mountAsk } from "../dev/ask.js";
import { COURSES, setCourse } from "../dev/data.js";
import { createStage } from "../dev/stage.js";
import { playIntro } from "../dev/intro.js";

let inst = null;
export function update(r) { inst?.update(r); }

export function mount(root, ctx, r) {
  let cur = null, stop = null, alive = true;
  // 장면 칸: 스크롤해도 화면에 붙어 있게(sticky) 두고, 내용은 그 위로 지나가요
  const bg = document.createElement("div");
  bg.className = "sw-bg";
  const page = document.createElement("div");
  root.replaceChildren(bg, page);
  const main = root.closest(".main");
  const fit = () => { const hh = main?.clientHeight || innerHeight; bg.style.height = hh + "px"; bg.style.marginBottom = -hh + "px"; root.style.setProperty("--sw-h", hh + "px"); };
  const ro = new ResizeObserver(fit); if (main) ro.observe(main); fit();
  let stage = null, want = null;
  const ready = createStage(bg).then((s) => { if (!alive) { s?.destroy(); return null; } stage = s; if (want) stage?.mode(...want); return s; });
  // 화면이 장면을 부를 때: 장면이 아직 준비 전이면 기억해 뒀다가 준비되면 바로
  const scene = {
    mode: (...a) => { want = a; stage?.mode(...a); },
    focus: (i) => stage?.focus(i),
    accent: (k) => stage?.accent(k),
    ready,
  };

  // 세션 첫 방문: HUD 조준경 → 끝나면 흩어진 입자가 모여요
  const stopIntro = playIntro(root, () => ready.then((s) => s?.reveal()));

  function show(course, id, sub, item) {
    const key = `${course || ""}/${id || ""}/${sub || ""}/${item || ""}`;
    if (stop && cur === key) return;
    stop?.();
    cur = key;
    const host = document.createElement("div");
    host.className = "dv";
    if (course && !COURSES[course]) course = null;
    host.dataset.course = course || "sw";
    if (course) setCourse(course);
    page.replaceChildren(host);
    const home = !course || !id;
    if (!home) scene.mode("dim", { accent: course === "dev" ? "dev" : "vg" });
    const c = { ...ctx, scene };
    stop = !course ? mountSw(host, c)
      : id === "today" ? mountToday(host, c)
      : id === "ask" ? mountAsk(host, c, sub)
      : id === "docs" && COURSES[course].docs ? mountDocs(host, c)
      : id && sub === "case" && item ? mountCase(host, c, id, item)
      : id && sub === "practice" ? mountMeeting(host, c, id, item)
      : id && sub ? mountCard(host, c, id, sub)
      : id ? mountWeek(host, c, id)
      : course === "dev" ? mountHome(host, c)
      : mountVgHome(host, c);
    main?.scrollTo?.({ top: 0 });
  }
  const go = (x) => show(x.course || null, x.id || null, x.sub || null, x.item || null);
  inst = { update: go };
  go(r);
  return () => { alive = false; stopIntro(); stop?.(); stage?.destroy(); ro.disconnect(); inst = null; };
}

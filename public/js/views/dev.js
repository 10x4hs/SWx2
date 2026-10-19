// SW 공간 — #/sw (과정 목록) · #/sw/<과정> (그 과정 홈) · #/sw/<과정>/today · docs · ask[/<모듈>] · <모듈> (한 주)
//   #/sw/<과정>/<모듈>/<카드> · <모듈>/case/<사례> · <모듈>/practice[/<날>] (회의실) — 과정: dev(개발 흐름) · vg(Vector & Graph)
//   옛 주소 #/dev/… 는 #/sw/dev/… 와 같아요
//   뒤에는 3D 세계(world3d.js) 하나가 화면을 옮겨도 그대로 깔려 있고, 화면마다 모드만 바꿔요
//   (#/sw = 과정 판 · #/sw/<과정> = 모듈 유리 패널 · 그 안쪽 = 책 안 — 판 속으로 들어가면 다음 화면이 그 안에서 시작해요)
import { mountSw } from "../dev/sw.js";
import { mountCourse } from "../dev/course.js";
import { mountWeek } from "../dev/week.js";
import { mountCard } from "../dev/card.js";
import { mountCase } from "../dev/case.js";
import { mountMeeting } from "../dev/meeting.js";
import { mountToday } from "../dev/today.js";
import { mountDocs } from "../dev/docs.js";
import { mountAsk } from "../dev/ask.js";
import { COURSES, setCourse } from "../dev/data.js";
import { createWorld } from "../dev/world3d.js";
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
  let world = null, want = null;
  const ready = createWorld(bg, { scroller: main || document.scrollingElement }).then((w) => { if (!alive) { w?.destroy(); return null; } world = w; if (want) w[want[0]](...want[1]); return w; });
  // 화면이 세계를 부를 때: 아직 준비 전이면 기억해 뒀다가 준비되면 바로
  const scene = {
    show: (...a) => { want = ["show", a]; world?.show(...a); },
    inside: (...a) => { want = ["inside", a]; world?.inside(...a); },
    dive: () => world?.dive() || Promise.resolve(),
    goTo: (i) => world?.goTo(i),
    ready,
  };

  // 세션 첫 방문: HUD 조준경 → 끝나면 흩어진 입자가 모여요
  const stopIntro = playIntro(root, () => ready.then((w) => w?.reveal()));

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
    if (!home) scene.inside({ tint: course });
    const c = { ...ctx, scene };
    stop = !course ? mountSw(host, c)
      : id === "today" ? mountToday(host, c)
      : id === "ask" ? mountAsk(host, c, sub)
      : id === "docs" && COURSES[course].docs ? mountDocs(host, c)
      : id && sub === "case" && item ? mountCase(host, c, id, item)
      : id && sub === "practice" ? mountMeeting(host, c, id, item)
      : id && sub ? mountCard(host, c, id, sub)
      : id ? mountWeek(host, c, id)
      : mountCourse(host, c, course);
    main?.scrollTo?.({ top: 0 });
  }
  const go = (x) => show(x.course || null, x.id || null, x.sub || null, x.item || null);
  inst = { update: go };
  go(r);
  return () => { alive = false; stopIntro(); stop?.(); world?.destroy(); ro.disconnect(); inst = null; };
}

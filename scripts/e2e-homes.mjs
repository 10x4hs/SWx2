// ㉙ Dock 의 두 집 (2026-11-17) — Plan · Obsidian 탭 줄
//   · Plan 화면(시간표 · 체크리스트 · 보드 · 목표 · AI로 짜기)마다 같은 탭 줄, 지금 탭 표시, Dock 'Plan' 불 (목표 · AI로 짜기도)
//   · 어느 Plan 화면에서든 다른 탭으로 한 번에 · Obsidian(지도 · 노트 · 그래프)도 같은 식, Dock 'Obsidian' 불
//   · 360px 폰: 탭 줄이 한 줄 (글자가 세로로 쪼개지지 않음) · 가로 넘침 없음 · 옛 주소도 그대로 열려요
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PLAN = [["cal", "#/calendar", ".cal-view"], ["list", "#/checklist/list", "#ck-list"], ["board", "#/checklist/board", ".tb-col"], ["goals", "#/goals/week", ".gl"], ["ai", "#/planner", ".pl"]];
const BRAIN = [["map", "#/brain", ".brain"], ["notes", "#/notes", "#notes"], ["graph", "#/brain/graph", "#obs"]];

export async function homesE2E({ p, go, ok, tv, w, h, getErrs }) {
  const state = () => p.evaluate(() => ({
    cur: document.querySelector(".home-tabs [aria-current='page']")?.dataset.tab || null,
    n: document.querySelectorAll(".home-tabs").length,
    dock: document.querySelector("a.rail-btn[aria-current='page']")?.dataset.nav || null,
  }));
  const homes = [["Plan", PLAN, "calendar"], ["Obsidian", BRAIN, "brain"]];
  for (const [name, tabs, nav] of homes) {
    // 1) 화면마다: 탭 줄 하나 · 지금 탭 · Dock 불
    const bad = [];
    for (const [k, hash, sel] of tabs) {
      await go(hash, sel);
      const s = await state();
      if (s.n !== 1 || s.cur !== k || s.dock !== nav) bad.push(`${hash}: 탭줄 ${s.n} · 지금 ${s.cur} · Dock ${s.dock}`);
    }
    ok(!bad.length, `${tv} · ${name} — 화면마다 탭 줄 · 지금 탭 · Dock '${name}' 불${bad.length ? " — " + bad.join(" | ") : ""}`);
    // 2) 어느 화면에서든 다른 탭으로 한 번에
    const miss = [];
    for (const [from, hash, fsel] of tabs) {
      for (const [to, , sel] of tabs) {
        if (to === from) continue;
        await go(hash, fsel);
        await p.click(`.home-tabs [data-tab="${to}"]`);
        const got = await p.waitForSelector(sel, { timeout: 6000 }).then(() => true, () => false);
        await sleep(250);
        const s = await state();
        if (!got || s.cur !== to || s.dock !== nav) miss.push(`${from}→${to}: 화면 ${got} · 지금 ${s.cur} · Dock ${s.dock}`);
      }
    }
    ok(!miss.length, `${tv} · ${name} — 탭 ${tabs.length}개 서로 한 번에 (${tabs.length * (tabs.length - 1)}번)${miss.length ? " — " + miss.join(" | ") : ""}`);
  }

  // 3) 360px: 한 줄 · 쪼개짐 없음 · 가로 넘침 없음
  if (w < 861) {
    await p.setViewportSize({ width: 360, height: h });
    const bad = [];
    for (const [, tabs] of homes) for (const [k, hash, sel] of tabs) {
      await go(hash, sel);
      const m = await p.evaluate(() => {
        const bar = document.querySelector(".home-tabs"), links = [...bar.querySelectorAll("a")];
        const one = links.every((a) => { const r = a.getBoundingClientRect(); return r.height < 44 && r.width > 24 && a.getClientRects().length === 1; });
        const mid = links.map((a) => { const r = a.getBoundingClientRect(); return (r.top + r.bottom) / 2; }), row = Math.max(...mid) - Math.min(...mid) < 6; // 같은 줄 = 세로 가운데가 같아요
        const ai = bar.querySelector(".home-tabs-ai")?.getBoundingClientRect();
        return { one, row, over: document.documentElement.scrollWidth > innerWidth + 1, ai: !ai || (ai.left >= 0 && ai.right <= innerWidth) };
      });
      if (!m.one || !m.row || m.over || !m.ai) bad.push(`${k}: 한 줄 ${m.row} · 안 쪼개짐 ${m.one} · 넘침 ${m.over} · AI 버튼 ${m.ai}`);
    }
    await p.setViewportSize({ width: w, height: h });
    ok(!bad.length, `${tv} · 360px 탭 줄 — 한 줄 · 글자 안 쪼개짐 · 가로 넘침 없음${bad.length ? " — " + bad.join(" | ") : ""}`);
  }

  // 4) 옛 주소
  const day = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const old = [["#/calendar/" + day, "cal"], ["#/calendar/m/" + day.slice(0, 7), "cal"], ["#/calendar/year", "cal"], ["#/checklist/" + day, "list"], ["#/goals", "goals"], ["#/plans/month", "goals"], ["#/planner/week", "ai"], ["#/graph", "map"], ["#/notes/tag/x", "notes"]];
  const broke = [];
  for (const [hash, k] of old) {
    await go(hash, 1600);
    const s = await state();
    if (s.cur !== k) broke.push(`${hash} → ${s.cur}`);
  }
  const errs = getErrs().filter((e) => !/Failed to load resource|favicon/.test(e));
  ok(!broke.length && !errs.length, `${tv} · 옛 주소 ${old.length}개 그대로 열려요${broke.length ? " — " + broke.join(" | ") : ""}${errs.length ? " — 오류 " + errs[0] : ""}`);
}

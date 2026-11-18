// ㉚ 폰 세로로도 (2026-11-18) — "가로로 돌려야 일정 · 뉴스레터가 제대로 보여요"
//   · 하루 일정: 카드 안 내용이 카드 밖으로 안 삐져나가요 (360px) · 시간표 폭이 화면의 75% 이상 (390px)
//   · 뉴스레터: 위 메뉴(Today · World · … · Comments)가 모두 화면 안에 보여요 (숨은 칸 없음 · 글자가 세로로 쪼개지지 않음)
//   · 일기: 1년 칸 표가 고른 날(오늘)이 보이는 쪽으로 열려요
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export async function portraitE2E({ p, go, ok, tv }) {
  const vs = p.viewportSize();
  try {
    for (const W of [360, 390]) {
      await p.setViewportSize({ width: W, height: 800 });
      // 1) 하루 일정
      await go("#/calendar/" + todayStr(), 2200);
      await p.waitForSelector("#dp-grid", { timeout: 10000 }).catch(() => {});
      const day = await p.evaluate(() => {
        const page = document.querySelector(".cal-page"), grid = document.querySelector("#dp-grid");
        if (!page || !grid) return { miss: true };
        const pr = page.getBoundingClientRect(), cs = getComputedStyle(page), inner = pr.right - parseFloat(cs.borderRightWidth);
        const kids = [...page.children].filter((c) => c.getBoundingClientRect().width).map((c) => [String(c.className).split(" ")[0], Math.round(c.getBoundingClientRect().right - inner)]);
        const out = kids.filter(([, d]) => d > 1);
        const wide = out.length ? [...page.querySelectorAll("*")].map((e) => [e, e.getBoundingClientRect().width]).filter(([e, w]) => w > pr.width && ![...e.children].some((c) => c.getBoundingClientRect().width >= w - 1)).slice(0, 3).map(([e, w]) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}=${Math.round(w)}:${(e.textContent || "").trim().slice(0, 30)}`).join(" / ") : "";
        return { wide, out: out.length ? Math.max(...out.map(([, d]) => d)) : 0, who: out.map(([c, d]) => c + "+" + d).join(","), page: Math.round(pr.width), grid: Math.round(grid.getBoundingClientRect().width), W: innerWidth };
      });
      ok(!day.miss && day.out === 0 && (W < 390 || day.grid >= day.W * 0.75),
        `${tv} ${W}px · 하루 일정 — 카드 밖으로 ${day.out ?? "?"}px${day.who ? " (" + day.who + ") ← " + day.wide : ""} · 카드 ${day.page} · 시간표 폭 ${day.grid}/${day.W}`);
      // 2) 뉴스레터 위 메뉴
      await go("#/news", 2500);
      await p.waitForSelector(".gn-views a", { timeout: 10000 }).catch(() => {});
      const nv = await p.evaluate(() => {
        const as = [...document.querySelectorAll(".gn-views a")], lh = (a) => parseFloat(getComputedStyle(a).lineHeight) || 20;
        const hidden = as.filter((a) => { const r = a.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; }).map((a) => a.textContent.trim());
        const broken = as.filter((a) => a.getBoundingClientRect().height > lh(a) * 1.6 + 8).map((a) => a.textContent.trim());
        return { n: as.length, hidden, broken };
      });
      ok(nv.n >= 5 && !nv.hidden.length && !nv.broken.length, `${tv} ${W}px · 뉴스레터 메뉴 ${nv.n}칸 — 화면 밖 [${nv.hidden.join(", ")}] · 쪼개짐 [${nv.broken.join(", ")}]`);
      // 3) 일기 1년 표
      await go("#/diary", 2500);
      await p.waitForSelector(".dr-grass .g.sel", { timeout: 10000 }).catch(() => {});
      const dg = await p.evaluate(() => {
        const sel = document.querySelector(".dr-grass .g.sel"), wrap = document.querySelector(".dr-grass-wrap");
        if (!sel || !wrap) return { miss: true };
        const s = sel.getBoundingClientRect(), w = wrap.getBoundingClientRect();
        return { inView: s.left >= Math.max(w.left, 0) - 1 && s.right <= Math.min(w.right, innerWidth) + 1, scroll: Math.round(wrap.scrollLeft), wrapR: Math.round(w.right) };
      });
      ok(!dg.miss && dg.inView, `${tv} ${W}px · 일기 1년 표 — 고른 날이 화면에 보여요 ${dg.inView} (옆으로 ${dg.scroll}px · 표 오른쪽 끝 ${dg.wrapR}/${W})`);
    }
  } finally { if (vs) await p.setViewportSize(vs); }
}

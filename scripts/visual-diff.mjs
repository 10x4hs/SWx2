// Visual diff for CSS-only refactors: screenshot shared screens, then pixel-diff two runs.
//   BASE=http://127.0.0.1:8807 USER_ID=t_wdes node scripts/visual-diff.mjs shoot <dir>   # needs a running `wrangler dev`
//   SCREENS=apps … shoot <dir>                                                         # per-app screens (news, mba, sw, cim, psy, svm, papers, books)
//   node scripts/visual-diff.mjs diff <beforeDir> <afterDir>                           # % changed pixels per shot
// Time is frozen, motion reduced, animations off and service workers blocked so two runs of the same code match.
import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [mode, a, b] = process.argv.slice(2);
const APP_SCREENS = [["news", "#/news"], ["mba", "#/mba"], ["sw", "#/sw"], ["swdev", "#/sw/dev"], ["cim", "#/cim"], ["psy", "#/psy"], ["svm", "#/svm"], ["papers", "#/papers"], ["easy", "#/papers/easy"], ["books", "#/books"]];
const SHARED_SCREENS = [["home", "#/"], ["plan", "#/calendar"], ["notes", "#/notes"], ["brain", "#/brain"], ["settings", "#/settings"], ["study", "#/study"], ["news", "#/news"]];
const SCREENS = process.env.SCREENS === "apps" ? APP_SCREENS : SHARED_SCREENS; // SCREENS=apps = per-app sheets
const VIEWS = [["desktop", 1300, 900], ["phone", 390, 844]];
const H = { "x-trio": "1", "content-type": "application/json" };
const FREEZE = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";

async function shoot(dir) {
  const BASE = process.env.BASE || "http://127.0.0.1:8807", user = process.env.USER_ID || "t_wdes";
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const scheme of ["light", "dark"]) for (const [vp, w, h] of VIEWS) {
      // the account keeps its own theme (user_app_state 'ui') and would override the local one — clear it so colorScheme wins
      execFileSync("npx", ["wrangler", "d1", "execute", "dsm-mafia", "--local", "--command", `DELETE FROM user_app_state WHERE app = 'ui' AND user_id = (SELECT id FROM users WHERE username = '${user.replace(/'/g, "")}')`], { stdio: "ignore" });
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: "reduce", serviceWorkers: "block", deviceScaleFactor: 1 });
      await ctx.request.post(BASE + "/api/auth/login", { headers: H, data: { username: user, password: "password1" } });
      await ctx.addInitScript((t) => { try { localStorage.setItem("trio-ui", JSON.stringify({ theme: t })); localStorage.setItem("trio-theme", t); } catch {} }, scheme);
      const p = await ctx.newPage();
      await p.clock.setFixedTime(new Date("2026-11-16T10:00:00+09:00"));
      for (const [name, hash] of SCREENS) {
        await p.goto("about:blank");
        await p.goto(BASE + "/" + hash, { timeout: 20000 }).catch(() => {});
        await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        await p.addStyleTag({ content: FREEZE });
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(1200);
        await p.screenshot({ path: path.join(dir, `${name}-${vp}-${scheme}.png`), animations: "disabled" });
        if (name === "home") { // the Dock alone, so a change there is not drowned out by the page
          const dock = p.locator(".rail.dock, .rail").first();
          if (await dock.count()) await dock.screenshot({ path: path.join(dir, `dock-${vp}-${scheme}.png`), animations: "disabled" });
        }
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
}

async function raw(f) { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }

async function diff(d1, d2) {
  const rows = [];
  for (const f of fs.readdirSync(d1).filter((x) => x.endsWith(".png")).sort()) {
    if (!fs.existsSync(path.join(d2, f))) { rows.push([f, "missing"]); continue; }
    const [x, y] = [await raw(path.join(d1, f)), await raw(path.join(d2, f))];
    if (x.w !== y.w || x.h !== y.h) { rows.push([f, `size ${x.w}x${x.h} → ${y.w}x${y.h}`]); continue; }
    let any = 0, big = 0;
    for (let i = 0; i < x.data.length; i += 4) {
      const m = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]));
      if (m > 0) any++;
      if (m > 24) big++;
    }
    const n = x.w * x.h;
    rows.push([f, ((any / n) * 100).toFixed(3) + "%", ((big / n) * 100).toFixed(3) + "%"]);
  }
  console.log("shot | changed px (any) | changed px (>24/255)");
  for (const r of rows) console.log(r.join(" | "));
}

if (mode === "shoot") await shoot(a);
else if (mode === "diff") await diff(a, b);
else console.log("usage: visual-diff.mjs shoot <dir> | diff <before> <after>");

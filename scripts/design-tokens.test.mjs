// Shared sheets use the type scale in tokens.css: a font size within 0.5px of a step must be the token (DESIGN.md §3).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROOT = process.env.DESIGN_ROOT ? new URL("file://" + process.env.DESIGN_ROOT.replace(/\/?$/, "/")) : new URL("../public/", import.meta.url); // DESIGN_ROOT = another checkout, to prove the check
const SHARED = ["styles.css", ...["pwa", "books", "customize", "blocks", "db", "video-note", "theme", "island", "board", "actions"].map((n) => `css/${n}.css`)];
const tokens = fs.readFileSync(new URL("css/tokens.css", ROOT), "utf8");
const STEPS = Object.fromEntries([...tokens.matchAll(/(--fs-[a-z0-9]+):\s*([\d.]+)px/g)].map((m) => [m[1], +m[2]]));

test("tokens.css defines the type scale", () => {
  assert.ok(Object.keys(STEPS).length >= 8, "about 8+ --fs-* steps");
  assert.equal(STEPS["--fs-2xs"], 11, "floor 11px");
  assert.equal(STEPS["--fs-sm"], 12.5, "label floor 12.5px");
});

test("shared sheets use --fs-* for sizes on (or within 0.5px of) a step", () => {
  const bad = [];
  for (const f of SHARED) {
    const css = fs.readFileSync(new URL(f, ROOT), "utf8");
    const sizes = [...css.matchAll(/font-size\s*:\s*([\d.]+)px/g), ...css.matchAll(/(?:^|[\s;{])font\s*:\s*(?:(?:italic|normal|bold|\d{3})\s+)*([\d.]+)px/g)];
    for (const m of sizes) if (Object.values(STEPS).some((s) => Math.abs(s - +m[1]) <= 0.5)) bad.push(`${f}: ${m[0].trim()}`);
    for (const [, v] of css.matchAll(/var\((--fs-[a-z0-9]+)\)/g)) if (!(v in STEPS)) bad.push(`${f}: unknown ${v}`);
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} raw sizes that should be tokens`);
});

// Per-app sheets: same type rule, and every colour lives in a custom property (palette at the top of each sheet).
const APPS = ["news", "mba", "psy", "dev", "svm", "cim", "easy", "papers"].map((n) => `css/${n}.css`);
const rawSizes = (css) => [...css.matchAll(/font-size\s*:\s*([\d.]+)px/g), ...css.matchAll(/(?:^|[\s;{])font\s*:\s*(?:(?:italic|normal|bold|\d{3})\s+)*([\d.]+)px/g)];

// off-step sizes (13.5, 14.5 …) stay raw on purpose: no visible change
test("per-app sheets use --fs-* for sizes exactly on a step", () => {
  const bad = [];
  for (const f of APPS) {
    const css = fs.readFileSync(new URL(f, ROOT), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of rawSizes(css)) if (Object.values(STEPS).includes(+m[1])) bad.push(`${f}: ${m[0].trim()}`);
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} raw sizes that should be tokens`);
});

test("per-app sheets keep hex colours in custom properties only", () => {
  const bad = [];
  for (const f of APPS) {
    const css = fs.readFileSync(new URL(f, ROOT), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const d of css.split(/[;{}]/)) {
      if (/^\s*--[\w-]+\s*:/.test(d) || !d.includes(":")) continue;
      const val = d.slice(d.indexOf(":") + 1).replace(/var\(--[\w-]+\s*,[^)]*\)/g, ""); // var() fallbacks are fine
      for (const [h] of val.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) bad.push(`${f}: ${h} in ${d.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} raw hex colours outside a palette variable`);
});

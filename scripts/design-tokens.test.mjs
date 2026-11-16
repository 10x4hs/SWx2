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

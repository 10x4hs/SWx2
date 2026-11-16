// node --test — leftover merge-conflict markers in tracked code (one slipped into styles.css on 2026-11-16 and silently dropped a rule)
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

test("no merge-conflict markers in tracked code", () => {
  const files = execFileSync("git", ["ls-files", "*.js", "*.mjs", "*.css", "*.html", "*.json", "*.sql", "*.sh"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const bad = [];
  for (const f of files) {
    let s; try { s = fs.readFileSync(f, "utf8"); } catch { continue; }
    s.split("\n").forEach((l, i) => { if (/^(<{7}|={7}|>{7})(\s|$)/.test(l)) bad.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(bad, []);
});

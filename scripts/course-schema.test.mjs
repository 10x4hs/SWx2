// course-schema: one schema + adapters for the card courses (mba · dev · vg · onto · aip)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { ADAPTERS, buildIndex, ID } from "./lib/course-schema.mjs";
import { readSet, doneSet } from "../public/js/course/load.js";

const reader = (a) => (id) => { const f = `public/${a.dir}/${id}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };

test("every course adapter rebuilds its committed index.json byte for byte", () => {
  for (const [k, a] of Object.entries(ADAPTERS)) {
    const r = buildIndex(a, reader(a));
    assert.deepEqual(r.problems, [], k);
    assert.equal(r.text, readFileSync(`public/${a.dir}/index.json`, "utf8"), k);
  }
});

test("shared index shape: modules with id/no and four item lists of valid ids", () => {
  for (const [k, a] of Object.entries(ADAPTERS)) {
    const { index } = buildIndex(a, reader(a));
    assert.ok(Number.isInteger(index.version) && index.modules.length, k);
    for (const m of index.modules) {
      assert.match(m.no, /^\d\d$/);
      for (const kind of ["cards", "cases", "problems", "lectures"]) for (const x of m[kind]) assert.ok(ID.test(x.id), `${k}/${m.id}/${x.id}`);
    }
  }
});

test("missing module file and broken card are reported, not thrown", () => {
  const sw = ADAPTERS.vg, real = reader(sw);
  const r = buildIndex(sw, (id) => (id === "vg-rag" ? null : id === "vg-embeddings" ? { ...real(id), cards: [{ id: "case", day: 1 }] } : real(id)));
  assert.ok(r.problems.some((p) => p.startsWith("vg-rag.json")));
  assert.ok(r.problems.some((p) => p.includes("카드 id case")));
  assert.ok(r.problems.some((p) => p.includes("카드 1장")));
  const mba = ADAPTERS.mba, mr = reader(mba);
  const r2 = buildIndex(mba, (id) => (id === "finance" ? { ...mr(id), lectures: [{ id: "x1", url: "http://a" }] } : mr(id)));
  assert.deepEqual(r2.problems, ["finance: x1: 강의 주소"]);
});

test("progress keys are <module>/<item> for every course", () => {
  const st = { items: [{ module: "accounting", card: "a1" }], done: [{ module: "vg-rag", item: "p1" }] };
  assert.ok(readSet(st).has("accounting/a1"));
  assert.ok(doneSet(st).has("vg-rag/p1"));
  assert.equal(readSet({}).size, 0);
});

// node --test scripts/orphans.test.mjs — 주인 없는 R2 객체 · 벡터 고르기 (서버 · wrangler 없이 도는 단위 검사)
import test from "node:test";
import assert from "node:assert/strict";
import { classifyR2, classifyVectors, refsIn, DIARY_REF, ANN_REF } from "./orphans.mjs";

const NOW = Date.parse("2026-11-16T00:00:00Z"), OLD = new Date(NOW - 3 * 864e5), NEW = new Date(NOW - 3600e3);
const refs = (o = {}) => ({ noteFiles: new Set(), roomRefs: new Set(), diaryKeys: new Set(), annNames: new Set(), ...o });

test("refsIn pulls image keys out of diary blocks and announcement markdown", () => {
  const blocks = JSON.stringify([{ t: "img", src: "/api/diary/img/diary-1a2b-3c.jpg" }, { t: "p", x: "글 /api/diary/img/diary-zz.png 끝" }]);
  assert.deepEqual([...refsIn([blocks, null], DIARY_REF)].sort(), ["diary-1a2b-3c.jpg", "diary-zz.png"]);
  assert.deepEqual([...refsIn(["# 공지\n![](/api/ann/img/abc-1.webp)"], ANN_REF)], ["abc-1.webp"]);
});

test("classifyR2 keeps owned objects, flags old unowned ones, never touches unknown keys", () => {
  const objs = [
    { key: "nf-aaa.png", uploaded: OLD }, { key: "nf-bbb.png", uploaded: OLD },
    { key: "room-ccc.mp4", uploaded: OLD }, { key: "room-ddd.jpg", uploaded: OLD },
    { key: "diary-eee.jpg", uploaded: OLD }, { key: "diary-fff.jpg", uploaded: OLD },
    { key: "ann/ggg.png", uploaded: OLD }, { key: "ann/hhh.png", uploaded: OLD },
    { key: "notion/legacy.png", uploaded: OLD }, { key: "nf-../x", uploaded: OLD },
  ];
  const r = classifyR2(objs, refs({ noteFiles: new Set(["nf-aaa.png"]), roomRefs: new Set(["room-ccc.mp4"]), diaryKeys: new Set(["diary-eee.jpg"]), annNames: new Set(["ggg.png"]) }), { now: NOW });
  assert.deepEqual(r.orphans, ["nf-bbb.png", "room-ddd.jpg", "diary-fff.jpg", "ann/hhh.png"]);
  assert.deepEqual(r.unknown, ["notion/legacy.png", "nf-../x"]);
  assert.equal(r.kept, 4);
});

test("classifyR2 skips objects uploaded inside the min-age window (photo not saved yet)", () => {
  const r = classifyR2([{ key: "diary-new.jpg", uploaded: NEW }, { key: "diary-old.jpg", uploaded: OLD }], refs(), { now: NOW, minAgeMs: 24 * 3600e3 });
  assert.deepEqual(r.young, ["diary-new.jpg"]);
  assert.deepEqual(r.orphans, ["diary-old.jpg"]);
  assert.deepEqual(classifyR2([{ key: "diary-new.jpg", uploaded: NEW }], refs(), { now: NOW, minAgeMs: 0 }).orphans, ["diary-new.jpg"]);
});

test("classifyVectors: missing chunk or deleted note = orphan, tomb ids are reported apart", () => {
  const chunks = new Map([["n1#0", { source_type: "note", source_id: "n1" }], ["n2#0", { source_type: "note", source_id: "n2" }], ["cim:1", { source_type: "cim", source_id: "c1" }]]);
  const v = classifyVectors(["n1#0", "n2#0", "cim:1", "gone#0", "dead#1"], chunks, new Set(["n1"]), new Set(["dead#1"]));
  assert.deepEqual(v.orphans, ["n2#0", "gone#0"]);
  assert.deepEqual(v.tomb, ["dead#1"]);
  assert.equal(v.kept, 2);
});

// 책 파일들에서 책장 목록(public/books/index.json)을 만들어요: node scripts/books/index.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../public/books/", import.meta.url));
const books = readdirSync(ROOT).filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => JSON.parse(readFileSync(ROOT + f, "utf8")))
  .sort((a, b) => (a.n ?? 99) - (b.n ?? 99))
  .map((d) => ({
    id: d.id, n: d.n ?? null, title: d.title, short: d.short, color: d.color, headline: d.headline, lead: d.lead, why: d.why,
    minutes: d.chapters.reduce((a, c) => a + (c.minutes || 12), 0),
    chapters: d.chapters.map((c) => ({ id: c.id, title: c.title, minutes: c.minutes || 12, week: c.week ?? null, build: !!c.build, quizzes: c.sections.flatMap((s) => s.body).filter((b) => b.t === "quiz").length })),
  }));
const out = { title: "AI 공부책", updated: new Date().toISOString().slice(0, 10), books };
writeFileSync(ROOT + "index.json", JSON.stringify(out, null, 1) + "\n");
console.log(`index.json: 책 ${books.length}권 · 장 ${books.reduce((a, b) => a + b.chapters.length, 0)}개`);

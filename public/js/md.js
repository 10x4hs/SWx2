// Markdown → safe HTML, with Obsidian-style [[wikilinks]], #tags and - [ ] tasks.
import { marked } from "/vendor/marked.esm.js";
import DOMPurify from "/vendor/purify.es.mjs";
import { esc } from "./util.js";

marked.use({
  gfm: true,
  breaks: true,
  extensions: [
    {
      name: "wikilink",
      level: "inline",
      start: (src) => src.indexOf("[["),
      tokenizer(src) {
        const m = /^\[\[([^\[\]|#\n]+)(?:#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/.exec(src);
        if (m) return { type: "wikilink", raw: m[0], target: m[1].trim(), label: (m[2] || m[1]).trim() };
      },
      renderer: (t) => `<a class="wikilink" href="#" data-wikilink="${esc(t.target)}">${esc(t.label)}</a>`,
    },
    {
      name: "tag",
      level: "inline",
      start: (src) => { const m = /(^|[\s(])#[\p{L}_]/u.exec(src); return m ? m.index + m[1].length : undefined; },
      tokenizer(src) {
        const m = /^#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/u.exec(src);
        if (m) return { type: "tag", raw: m[0], tag: m[1] };
      },
      renderer: (t) => `<a class="tag" href="#" data-tag="${esc(t.tag)}">#${esc(t.tag)}</a>`,
    },
  ],
});

export function renderMarkdown(src) {
  const html = marked.parse(src || "");
  return DOMPurify.sanitize(html, { ADD_ATTR: ["data-wikilink", "data-tag", "target"] });
}

// 노트 본문에서 제목(h1~h3) 목록 뽑기 — 개요 패널용
export function outline(src) {
  return (src || "").split("\n").map((l) => /^(#{1,3})\s+(.+)/.exec(l)).filter(Boolean).map((m) => ({ level: m[1].length, text: m[2].trim() }));
}

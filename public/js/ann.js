// 관리자 공지 — 맨 위 띠(app.js) · 관리자 화면 미리보기(views/admin.js)가 같이 써요.
import { Marked } from "/vendor/marked.esm.js";
import DOMPurify from "/vendor/purify.es.mjs";

// 공지 마크다운 → 안전한 HTML (미리보기 · 맨 위 띠의 '자세히' 시트가 같이 써요). 원문 HTML 은 버리고, 링크는 http(s)·mailto 만 새 탭으로
const annMd = new Marked({ gfm: true, breaks: true });
annMd.use({ renderer: { html: () => "" } });
export const ANN_IMG_SRC = /^\/api\/ann\/img\/[0-9a-f-]{8,64}\.(png|jpg|webp|gif)$/;
export function annHtml(src) {
  const frag = DOMPurify.sanitize(annMd.parse(String(src || "")), { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ["style", "form", "input", "iframe", "picture", "source", "svg"], FORBID_ATTR: ["style", "srcset"] });
  // 사진은 우리 공지 사진 주소(/api/ann/img/…)만 남겨요
  frag.querySelectorAll("img").forEach((im) => {
    const src = im.getAttribute("src") || "";
    if (!ANN_IMG_SRC.test(src)) return im.remove();
    for (const a of [...im.attributes]) if (!["src", "alt"].includes(a.name)) im.removeAttribute(a.name);
    im.loading = "lazy"; im.className = "ann-img";
  });
  frag.querySelectorAll("a").forEach((a) => {
    if (!/^(https?:|mailto:)/i.test(a.getAttribute("href") || "")) return a.replaceWith(...a.childNodes);
    a.target = "_blank"; a.rel = "noopener noreferrer";
  });
  const box = document.createElement("div"); box.append(frag);
  return box.innerHTML;
}

// 이미지 붙이기 — 사진 버튼 · 붙여넣기(⌘V) · 끌어다 놓기. AI 채팅 · AI 비서 입력줄 · 노트 AI · 노드 만들기 어디서든 같은 모양.
// 브라우저에서 긴 변 1600px JPEG 로 줄여 data URL 로 보내요 (보통 한 장 200~500KB). 서버가 이미지를 글로 옮겨 어떤 모델이든 답해요.
import { esc, toast } from "./util.js";

export const MAX_IMAGES = 4;
const SIDE = 1600;

export async function shrink(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { // createImageBitmap 을 못 쓰는 형식이면 <img> 로
    const url = URL.createObjectURL(file);
    try { bmp = await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; }); }
    catch { throw new Error("이 이미지 형식은 읽을 수 없어요. (png · jpg · webp)"); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, SIDE / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); // 투명 PNG 도 흰 바탕으로 (글자가 잘 보이게)
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c.toDataURL("image/jpeg", 0.86);
}

export const imageFiles = (dt) => [...(dt?.files || [])].filter((f) => f.type.startsWith("image/"));
export function pickImages() {
  return new Promise((ok) => {
    const inp = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", multiple: true });
    inp.addEventListener("change", () => ok([...inp.files]), { once: true });
    inp.click();
  });
}

// tray(미리보기 자리) · button(사진 버튼) · paste(붙여넣기 받을 요소들) · drop(끌어다 놓기 받을 요소들)
// → { list(): data URL 배열, clear(), add(files) }
export function attachImages({ tray, button, paste = [], drop = [], max = MAX_IMAGES, onChange } = {}) {
  let imgs = [];
  const draw = () => {
    if (!tray) return;
    tray.hidden = !imgs.length;
    tray.innerHTML = imgs.map((u, i) => `<span class="att"><img src="${esc(u)}" alt="첨부 이미지 ${i + 1}"><button type="button" data-att-x="${i}" aria-label="이미지 빼기">✕</button></span>`).join("");
    onChange?.(imgs.length);
  };
  async function add(files) {
    files = files.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;
    const room = max - imgs.length;
    if (room <= 0) { toast(`이미지는 ${max}장까지 붙일 수 있어요.`, "err"); return; }
    if (files.length > room) toast(`이미지는 ${max}장까지라서 ${room}장만 붙였어요.`);
    for (const f of files.slice(0, room)) { try { imgs.push(await shrink(f)); } catch (e) { toast(e.message, "err"); } }
    draw();
  }
  button?.addEventListener("click", async () => add(await pickImages()));
  tray?.addEventListener("click", (e) => { const x = e.target.closest("[data-att-x]"); if (!x) return; imgs.splice(+x.dataset.attX, 1); draw(); });
  for (const el of paste) el.addEventListener("paste", (e) => { const fs = imageFiles(e.clipboardData); if (fs.length) { e.preventDefault(); add(fs); } });
  for (const el of drop) {
    el.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) { e.preventDefault(); el.classList.add("drop-on"); } });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop-on"); });
    el.addEventListener("drop", (e) => { el.classList.remove("drop-on"); const fs = imageFiles(e.dataTransfer); if (fs.length) { e.preventDefault(); add(fs); } });
  }
  draw();
  return { list: () => [...imgs], clear: () => { imgs = []; draw(); }, add };
}

// 저장된 질문에 붙은 "[첨부 이미지 N장 — …]" 부분은 접어서 보여 줘요
export function splitImageNote(text) {
  const i = String(text).indexOf("\n\n[첨부 이미지 ");
  if (i < 0) return { q: text, note: "", n: 0 };
  const note = text.slice(i + 2), n = +(/\[첨부 이미지 (\d+)장/.exec(note)?.[1] || 1);
  return { q: text.slice(0, i), note: note.replace(/^\[[^\]]*\]\n?/, ""), n };
}

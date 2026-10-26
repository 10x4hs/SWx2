// ㉗ 노트 사진 · 파일 (2026-10-26) — e2e.mjs 가 컴퓨터 · 폰 크기마다 불러요 (임시 노트를 만들었다가 지워요)
//   1) PNG 끌어다 놓기 → 사진 블록이 실제로 뜸 (naturalWidth > 0)
//   2) txt 붙여 넣기 → 파일 카드 · 내려받기 = attachment
//   3) PDF 끌어다 놓기 → 미리보기 iframe · '크게 보기' 로 커짐
//   4) ⌘Z(Ctrl+Z) 로 블록이 빠지고 ⌘⇧Z 로 돌아옴 · 넣자마자 ⌘Z 도 · 25MB 넘는 파일은 올리지 않고 알림
//   5) 다시 열어도 그대로
// Ctrl 을 써요: macOS 의 Playwright 는 Meta+Z 에 브라우저 '실행 취소' 명령을 따로 보내서 검사가 흐려져요 (편집기는 Ctrl+Z 도 같게 받아요)
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";

export async function noteFilesE2E({ p, ctx, ok, tv, BASE, H }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const id = (await (await ctx.request.post(BASE + "/api/notes", { headers: H, data: { title: "검사 첨부 " + Date.now(), body: "hello" } })).json()).note.id;
  try {
    await p.goto("about:blank"); await p.goto(BASE + "/#/notes/" + id);
    await p.waitForSelector(".nb-doc .nb", { timeout: 15000 });
    const count = () => p.evaluate(() => ({ img: document.querySelectorAll(".nb-doc .nb-img img").length, file: document.querySelectorAll(".nb-doc .nb-body.nb-file").length, pdf: document.querySelectorAll(".nb-doc .nb-file-pdf").length }));
    const drop = (f, last = false) => p.evaluate(([f, last, PNG]) => {
      const body = f.png ? Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0)) : f.size ? new Uint8Array(f.size) : f.text;
      const dt = new DataTransfer(); dt.items.add(new File([body], f.name, { type: f.type }));
      const t = last ? [...document.querySelectorAll(".nb-doc .nb")].at(-1) : document.querySelector(".nb-doc .nb");
      t.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      t.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, [f, last, PNG]);
    await drop({ png: true, name: "dot.png", type: "image/png" });
    const imgOk = await p.waitForFunction(() => { const i = document.querySelector(".nb-doc .nb-img img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 }).then(() => true, () => false);
    ok(imgOk, `${tv} · 노트 첨부: PNG 끌어다 놓기 → 사진이 떠요`);
    await p.locator(".nb-doc .nb-text").first().click();
    await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["hello file"], "memo.txt", { type: "text/plain" })); document.activeElement.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt })); });
    await p.waitForSelector(".nb-doc .nb-file .nb-file-dl", { timeout: 10000 }).catch(() => {});
    const dl = await p.evaluate(() => { const a = document.querySelector(".nb-doc .nb-file .nb-file-dl"); return a && { href: a.getAttribute("href"), name: document.querySelector(".nb-file-meta b")?.textContent }; });
    const got = dl && await ctx.request.get(BASE + dl.href);
    ok(dl?.name === "memo.txt" && got?.ok() && (await got.text()) === "hello file" && /^attachment/.test(got.headers()["content-disposition"] || ""), `${tv} · 노트 첨부: txt 붙여 넣기 → 파일 카드 · 내려받기`);
    await drop({ text: PDF, name: "doc.pdf", type: "application/pdf" }, true);
    await p.waitForSelector(".nb-doc .nb-file-pdf", { timeout: 10000 }).catch(() => {});
    const h0 = await p.evaluate(() => document.querySelector(".nb-file-pdf")?.getBoundingClientRect().height || 0);
    await p.locator(".nb-file-open").click().catch(() => {});
    const h1 = await p.evaluate(() => document.querySelector(".nb-file-pdf")?.getBoundingClientRect().height || 0);
    ok(h0 > 0 && h1 > h0, `${tv} · 노트 첨부: PDF → 미리보기 · 크게 보기 (${Math.round(h0)} → ${Math.round(h1)})`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${tv} · 노트 첨부: 옆으로 넘치지 않아요`);
    await p.locator(".nb-doc .nb-text").first().click();
    await p.keyboard.press("Control+z"); await p.keyboard.press("Control+z"); await sleep(200);
    let c = await count(); const undone = c.pdf === 0 && c.file === 1;
    await p.keyboard.press("Control+Shift+z"); await sleep(200);
    c = await count();
    ok(undone && c.pdf === 1, `${tv} · 노트 첨부: ⌘Z 로 PDF 블록이 빠지고 ⌘⇧Z 로 돌아와요`);
    await drop({ text: "zip", name: "a.zip", type: "application/zip" });
    await p.waitForFunction(() => [...document.querySelectorAll(".nb-file-meta b")].some((b) => b.textContent === "a.zip"), null, { timeout: 8000 }).catch(() => {});
    await p.keyboard.press("Control+z"); await sleep(200);
    ok(!(await p.evaluate(() => [...document.querySelectorAll(".nb-file-meta b")].some((b) => b.textContent === "a.zip"))), `${tv} · 노트 첨부: 넣자마자 ⌘Z 도 그 블록을 빼요`);
    await drop({ size: 26 * 1024 * 1024, name: "huge.bin", type: "application/octet-stream" });
    const big = await p.waitForFunction(() => [...document.querySelectorAll(".toast.err")].some((t) => /너무 커요/.test(t.textContent)), null, { timeout: 4000 }).then(() => true, () => false);
    ok(big, `${tv} · 노트 첨부: 25MB 넘는 파일은 '너무 커요' 알림`);
    await sleep(2500); // 저장 (debounce)
    await p.reload(); await p.waitForSelector(".nb-doc .nb", { timeout: 15000 }); await sleep(800);
    c = await count();
    const nw = await p.evaluate(() => document.querySelector(".nb-doc .nb-img img")?.naturalWidth || 0);
    ok(c.img === 1 && c.file === 2 && c.pdf === 1 && nw > 0, `${tv} · 노트 첨부: 다시 열어도 그대로 ${JSON.stringify(c)}`);
  } finally {
    await ctx.request.delete(BASE + "/api/notes/" + id, { headers: H }).catch(() => {});
  }
}

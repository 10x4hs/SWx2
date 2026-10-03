#!/usr/bin/env python3
"""논문 PDF → 그림 잘라내기 (PyMuPDF)

  fig.py find  <pdf>                         그림·표 캡션 위치를 쪽마다 보여 줘요
  fig.py page  <pdf> <쪽> <out.png>           한 쪽 전체를 그려요 (눈으로 확인용, 쪽은 1부터)
  fig.py auto  <pdf> <쪽> "<캡션 머리>" <out.jpg> [--zoom 2.4] [--no-caption]
                                              캡션 위(또는 아래) 그림 영역을 짐작해서 잘라요
  fig.py crop  <pdf> <쪽> x0 y0 x1 y1 <out.jpg> [--zoom 2.4]
                                              좌표(pt, 왼쪽 위 0,0)로 직접 잘라요
자른 뒤에는 꼭 이미지를 열어서 잘 잘렸는지 보고, 아니면 crop 으로 고쳐요.
"""
import re
import sys

import fitz  # PyMuPDF

CAP_RE = re.compile(r"^\s*(Figure|Fig\.|Table|그림|표)\s*([0-9]+|[A-Z]?[0-9]+)\s*[.:|]?", re.I)


def captions(page):
    out = []
    for b in page.get_text("blocks"):
        x0, y0, x1, y1, text = b[:5]
        if CAP_RE.match(text):
            out.append((fitz.Rect(x0, y0, x1, y1), " ".join(text.split())[:90]))
    return out


def save(page, clip, out, zoom):
    clip = clip & page.rect
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
    if out.lower().endswith((".jpg", ".jpeg")):
        pix.save(out, jpg_quality=84)
    else:
        pix.save(out)
    print(f"saved {out}  {pix.width}x{pix.height}px  clip=({clip.x0:.0f},{clip.y0:.0f},{clip.x1:.0f},{clip.y1:.0f})")


def graphics_rects(page):
    rects = [fitz.Rect(r["bbox"]) for r in page.get_image_info()]
    for d in page.get_drawings():
        r = fitz.Rect(d["rect"])
        if r.width > 2 or r.height > 2:
            rects.append(r)
    return rects


def auto(page, head, out, zoom, keep_caption):
    caps = [c for c in captions(page) if c[1].lower().startswith(head.lower())]
    if not caps:
        sys.exit(f"'{head}' 캡션을 이 쪽에서 못 찾았어요. find 로 확인하세요.")
    cap, text = caps[0]
    is_table = text.lower().startswith(("table", "표"))
    # 본문 문단(길고 여러 줄) = 그림 경계
    body = []
    for b in page.get_text("blocks"):
        r = fitz.Rect(b[:4])
        if r == cap or CAP_RE.match(b[4]):
            continue
        if b[4].count("\n") >= 2 and r.width > page.rect.width * 0.35 and len(b[4]) > 160:
            body.append(r)
    cols = fitz.Rect(min(cap.x0, page.rect.width * 0.5), 0, max(cap.x1, page.rect.width * 0.5), 0)
    if is_table:  # 표 캡션은 보통 위에 있어요 → 캡션 아래 영역
        below = [r for r in body if r.y0 > cap.y1 + 4]
        lo = min([r.y0 for r in below], default=page.rect.y1 - 30)
        region = fitz.Rect(page.rect.x0 + 30, cap.y0, page.rect.x1 - 30, lo)
    else:  # 그림 캡션은 아래 → 캡션 위 영역
        above = [r for r in body if r.y1 < cap.y0 - 4 and r.x1 > cols.x0 - 60 and r.x0 < cols.x1 + 60]
        hi = max([r.y1 for r in above], default=page.rect.y0 + 30)
        region = fitz.Rect(page.rect.x0 + 20, hi, page.rect.x1 - 20, cap.y0)
    g = [r for r in graphics_rects(page) if r.intersects(region)]
    clip = fitz.Rect(region)
    if g:
        u = fitz.Rect(g[0])
        for r in g[1:]:
            u |= r
        clip = u & region
        # 그림 속 글자(축 이름 등)도 포함
        for b in page.get_text("blocks"):
            r = fitz.Rect(b[:4])
            if r.intersects(region) and not r.contains(clip) and r not in body:
                clip |= r & region
    if keep_caption:
        clip |= cap
    clip = fitz.Rect(clip.x0 - 6, clip.y0 - 6, clip.x1 + 6, clip.y1 + 6)
    save(page, clip, out, zoom)


def main(a):
    if len(a) < 2:
        sys.exit(__doc__)
    cmd, pdf = a[0], fitz.open(a[1])
    zoom = 2.4
    if "--zoom" in a:
        zoom = float(a[a.index("--zoom") + 1])
    if cmd == "find":
        for i, p in enumerate(pdf, 1):
            for r, t in captions(p):
                print(f"p{i:>3}  y={r.y0:5.0f}-{r.y1:5.0f}  x={r.x0:4.0f}-{r.x1:4.0f}  {t}")
        print(f"(쪽 크기 {pdf[0].rect.width:.0f}x{pdf[0].rect.height:.0f}pt, {pdf.page_count}쪽)")
    elif cmd == "page":
        p = pdf[int(a[2]) - 1]
        save(p, p.rect, a[3], 1.6)
    elif cmd == "auto":
        auto(pdf[int(a[2]) - 1], a[3], a[4], zoom, "--no-caption" not in a)
    elif cmd == "crop":
        x0, y0, x1, y1 = map(float, a[3:7])
        save(pdf[int(a[2]) - 1], fitz.Rect(x0, y0, x1, y1), a[7], zoom)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])

# 논문 학습 자료 만들기 — 규칙서 (에이전트용)

셋(친구 3명)이 2026-10-01 ~ 10-05 에 16편을 공부해요. 목표: **편당 3분 안에 "무슨 문제 → 어떤 아이디어 → 결과 → 우리 파이프라인에서 어디에 쓰이는지"를 말할 수 있기.**
읽는 사람은 딥러닝 기초는 알지만 이 논문들은 처음 보는 학생이에요. **쉽게, 짧은 문장, 비유 먼저, 용어는 처음 나올 때 풀어서.** 말투는 해요체("~해요", "~이에요").

## 우리 파이프라인 (모든 논문을 여기에 연결해서 설명해요)
RGB 카메라 + 열화상 카메라 → ① **RGB·열화상 융합**(CMX, M-SpecGene) → ② **시각 인코더/특징**(DINO, DINOv3, C-RADIOv4) → ③ **객체 탐지**(YOLOv10, RT-DETRv4) · **영역 분할**(SAM, SAM 3) → ④ **객체 추적**(ByteTrack, FDTA) → ⑤ **영상·시간 모델링**(VideoMAE, V-JEPA 2.1) → ⑥ **적은 데이터로 맞추기·증류**(AdaptFormer, C-RADIOv4) → ⑦ **INT8 양자화·ONNX·RKNN 보드 배포**(Integer-only Quantization, IPTQ-ViT)
Rockchip NPU(RKNN) 보드에서 실시간으로 도는 게 최종 목표예요.

## 입력 자료
- 한국어 해설: `/Users/prime/Downloads/논문/<분야 폴더>/<연도>_<이름>_한국어해설.md` (꼭 먼저 읽어요 — 쪽 번호, 표 번호, 링크가 있어요)
- 한국어 번역 PDF(있는 것만): 같은 폴더의 `_한국어번역.pdf`
- 영어 원문: `/Users/prime/Downloads/논문/논문원문_모음/<연도>_<이름>_영문원문.pdf`
- 원문 텍스트는 PyMuPDF 로 읽어요: `PY=/private/tmp/claude-501/-Users-prime-Desktop-PRJ-Demo-study-trio/4b51a1ec-2e78-40c6-ae9b-9844ae6505d3/scratchpad/venv/bin/python` → `$PY -c "import fitz;d=fitz.open('...');print(d[0].get_text())"` (필요한 쪽만)

## 만들 것 (논문 하나당)
1. `public/papers/content/<id>.json` — 아래 모양 그대로
2. `public/papers/fig/<id>/f1.jpg, f2.jpg …` — 원문 그림 2~4장 (저작권 걱정 없음, 셋만 봐요)
   - `$PY scripts/papers/fig.py find <pdf>` → 캡션 위치, `$PY scripts/papers/fig.py auto <pdf> <쪽> "Figure 2" public/papers/fig/<id>/f1.jpg` → 자동 자르기
   - **자른 뒤 반드시 Read 로 이미지를 열어 확인**하고, 잘못 잘렸으면 `crop <pdf> <쪽> x0 y0 x1 y1 <out>` 로 고쳐요. 그림 전체 + 캡션이 들어가게.
   - 고르는 기준: 전체 구조도(가장 중요) · 핵심 아이디어 그림 · 결과 그래프(속도-정확도 등). 표는 결과 이해에 꼭 필요할 때만 1장.
   - 파일은 한 장 400KB 이하 (크면 `--zoom 1.8`)
3. `public/papers/fig/<id>/diagram.svg` — **직접 그린 한국어 설명 그림 1장** (원문 그림보다 쉬운 버전, 핵심 흐름만)
   - `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 H">` (H 는 300~480), 폭 800 기준, 글자 14~16px
   - 색·글꼴을 직접 쓰지 말고 **클래스만** 써요 (앱이 다크/라이트 테마로 칠해요):
     - 상자: `<rect class="dg-box" rx="12" …>` / 강조 상자: `class="dg-box c-blue"` (`c-blue c-green c-amber c-rose c-violet c-teal`)
     - 글자: `<text class="dg-t">` (본문) · `class="dg-t b"`(굵게) · `class="dg-s"`(작은 회색 설명) · 가운데 정렬은 `text-anchor="middle"`
     - 화살표: `<path class="dg-a" d="…" marker-end="url(#ah-<id>)"/>` · 점선 화살표 `class="dg-a dash"`
     - 화살촉 정의: `<defs><marker id="ah-<id>" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="dg-ah" d="M0,0 L10,5 L0,10 z"/></marker></defs>`
     - 영역 배경(묶음): `<rect class="dg-zone" rx="16" …>` · 그 위 라벨 `class="dg-s"`
   - `fill=`, `stroke=`, `style=`, `font-family=` 속성은 쓰지 마요(화살표 path 의 `fill="none"` 만 허용). `<script>`, `<foreignObject>`, 외부 이미지 금지.
   - 글자가 상자 밖으로 넘치지 않게 — 한국어 한 글자 ≈ 15px 폭으로 계산해요.
4. **영상 2~3개** (유튜브) — WebSearch 로 찾아요. 우선순위: 한국어 논문 리뷰(PR-12, 딥러닝논문읽기모임, DSBA 연구실 등) → 영어 설명(Yannic Kilcher, AI Coffee Break with Letitia, 저자 발표, 학회 발표) → 공식 데모.
   - **반드시 확인**: WebFetch 로 `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json` 을 열어 제목·채널이 맞는지 봐요. 안 열리면(404) 버려요. 그 논문을 다루는 영상만(비슷한 다른 버전 모델 영상이면 note 에 그렇게 적어요).
   - 최신 논문(2026)이라 영상이 없으면 관련 기반 개념 영상(예: FDTA → 다중 객체 추적 개념, JEPA 개념)으로 1~2개 채우고 `note` 에 "이 논문 자체 영상은 아직 없어서 기반 개념 영상" 이라고 적어요.

## JSON 모양 (`public/papers/content/<id>.json`)
```json
{
  "id": "yolov10",
  "title": "YOLOv10",
  "full_title": "YOLOv10: Real-Time End-to-End Object Detection",
  "year": 2024,
  "venue": "NeurIPS 2024",
  "field": "객체 탐지",
  "stage": 3,
  "one_line": "한 줄 요약 (40자 안팎)",
  "analogy": "쉽게 말하면 — 일상 비유 2~3문장",
  "problem": "무엇이 문제였나 (3~5문장)",
  "idea": [
    { "title": "아이디어 1 이름 (짧게)", "body": "2~4문장, 쉬운 말" }
  ],
  "diagram": { "src": "diagram.svg", "caption": "그림 설명 한 줄" },
  "figures": [
    { "src": "f1.jpg", "caption": "원문 Figure 2 — 무엇을 보여 주는지 한국어 1~2문장 + 어디를 보면 되는지", "page": 4 }
  ],
  "results": [
    { "label": "COCO AP (N 모델)", "value": "38.5", "note": "T4·TensorRT FP16 기준 지연 1.84ms · 원문 Table 1" }
  ],
  "pipeline_role": "우리 파이프라인에서 어디에·왜 쓰이는지 (3~4문장, RKNN 배포 관점 포함)",
  "caveats": ["주의점/한계 1문장씩, 2~4개"],
  "script_3min": "3분 발표 대본 (700~900자, 문제→아이디어→결과→우리에게 순서, 말하듯이). 문단은 \n\n 로 나눠요",
  "keywords_3min": ["3분 설명에 꼭 들어가야 할 핵심어 4~6개"],
  "quiz": [
    { "q": "질문", "choices": ["보기1", "보기2", "보기3", "보기4"], "answer": 0, "why": "정답 이유 1~2문장" }
  ],
  "glossary": [ { "term": "NMS", "easy": "겹치는 상자 중 하나만 남기는 후처리" } ],
  "videos": [
    { "youtube": "VIDEO_ID", "title": "oEmbed 로 확인한 실제 제목", "channel": "채널명", "lang": "ko|en", "minutes": 18, "note": "무엇을 보면 좋은지 한 줄" }
  ],
  "links": { "arxiv": "https://arxiv.org/abs/…", "pdf": "https://arxiv.org/pdf/…", "code": "https://github.com/…" },
  "related": ["bytetrack", "rtdetrv4"]
}
```
- `quiz` 는 **5문제**. 외우기 문제(연도·숫자)는 최대 1개, 나머지는 "왜"·"무엇이 달라지나"를 묻는 이해 문제. 오답 보기도 그럴듯하게. 정답 위치(answer)는 문제마다 섞어요.
- `glossary` 4~8개, `idea` 2~4개, `results` 2~4개, `figures` 2~4개.
- 본문 글자에는 `**굵게**` 만 써도 돼요(다른 마크다운 금지). 수식은 글로 풀어서 (`IoU` 같은 약어는 OK).
- **숫자·결과는 원문(표/쪽)에서 확인한 것만**. 확인 못 한 건 쓰지 않아요. 해설 md 와 원문이 다르면 원문을 따라요.
- `stage` 는 위 파이프라인 번호(1~7). `related` 는 아래 id 중에서.

## id 목록
yolov10 · rtdetrv4 · dino · dinov3 · sam · sam3 · bytetrack · fdta · videomae · vjepa21 · cmx · mspecgene · adaptformer · cradiov4 · intquant · iptqvit

## 끝나면
`$PY -c "import json;json.load(open('public/papers/content/<id>.json'))"` 로 JSON 이 깨지지 않았는지 확인하고, 만든 파일 목록 + 영상 확인 결과 + 불확실한 점만 짧게 보고해요. 다른 논문 파일·앱 코드는 건드리지 마요.

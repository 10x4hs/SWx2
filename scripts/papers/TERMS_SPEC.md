# 용어 사전(terms) — 규칙서 (에이전트용)

공부 페이지는 본문에 **용어가 처음 나오는 자리**에 점선 밑줄을 긋고, 누르면 설명 카드를 띄워요. 그 카드에 들어갈 사전을 만들어요.
읽는 사람은 딥러닝 기초만 아는 학생이에요. **쉬운 한국어 해요체, 짧게, 비유 하나**.

## 파일
- 공통 사전: `public/papers/terms-common.json` — 아래 "공통 용어" 목록 담당 에이전트만 만들어요
- 논문별 사전: `public/papers/content/<id>.terms.json` — 그 논문 담당 에이전트가 만들어요

## 모양 (두 파일 같음)
```json
{
  "id": "yolov10",          // 공통 사전은 "common"
  "terms": [
    {
      "term": "NMS",                                   // 카드 제목
      "match": ["NMS", "Non-Maximum Suppression", "비최대 억제"],  // 본문에 **실제로 쓰인 글자 그대로** (밑줄 칠 대상). 2글자 이상
      "easy": "겹친 상자 여러 개 중 점수가 제일 높은 하나만 남기고 지우는 후처리예요.",   // 1~2문장
      "more": "왜 중요한지 · 이 논문에서 어떤 역할인지 2~4문장. 공통 사전은 '이 프로젝트 논문들에서 어떻게 쓰이는지'.",
      "example": "같은 사람에게 상자 3개(0.9, 0.8, 0.6) → 0.9 하나만 남겨요"   // 선택, 숫자 예시 환영
    }
  ]
}
```

## 고르는 기준
- 논문별: `public/papers/content/<id>.json` 과 `<id>.deep.json` 의 **모든 글**(one_line, analogy, problem, idea, results, pipeline_role, caveats, script_3min, quiz, sections[].body/how_it_works/why/tables/pitfalls, walkthrough, faq, connections)을 훑어서, 학생이 멈칫할 **전문 용어 · 약어 · 모듈 이름 · 손실 이름 · 데이터셋 · 지표**를 30~60개. 기존 `glossary` 항목은 꼭 포함(더 자세히 다시 써도 돼요).
- 공통 용어 목록에 있는 것은 논문별 사전에 넣지 마요(공통 사전이 맡아요). 단, 그 논문에서 **특별한 뜻**으로 쓰이면 넣어도 돼요(논문별이 우선해요).
- `match` 는 본문에 실제 나오는 표기를 다 적어요 (영어/한국어/약어, 띄어쓰기 변형). 흔한 일반 단어(예: "모델", "학습", "결과")는 match 에 넣지 마요 — 밑줄이 너무 많아져요.
- 숫자는 원문 기준. 모르면 쓰지 마요.

## 공통 용어 (terms-common.json 담당만)
Transformer · ViT(Vision Transformer) · 어텐션/셀프 어텐션 · 크로스 어텐션 · 토큰 · 패치 · 임베딩 · CNN/합성곱 · 백본 · 넥 · 헤드 · 인코더 · 디코더 · 특징(feature)/특징 맵 · 채널 · 해상도/스트라이드 · 사전학습 · 미세조정 · 자기지도학습 · 지도학습 · 선형 탐침(linear probe) · k-NN 평가 · 제로샷 · 퓨샷 · 손실 함수 · 교차 엔트로피 · 경사 하강/역전파 · 학습률 · 배치 · 에폭 · 과적합 · 정규화(LayerNorm/BatchNorm) · 활성화 함수(ReLU/GELU) · Softmax · MLP · 잔차 연결 · 파라미터 · FLOPs · 지연 시간(latency) · 처리량/FPS · 바운딩 박스 · IoU · 정밀도/재현율 · AP · mAP · mIoU · COCO · ImageNet · 분할(semantic/instance) · 마스크 · 증류(지식 증류) · 교사/학생 모델 · EMA · 양자화 · INT8 · FP32/FP16 · ONNX · TensorRT · RKNN · NPU · 엣지 디바이스 · 소거 실험(ablation) · SOTA · 데이터 증강 · 마스킹 · 오토인코더 · 대조 학습 · 다중 모달 · RGB · 열화상(thermal) · 융합(fusion)
(60~80개. 위 목록을 다 넣고, 필요하면 더해요.)

## 끝나면
`python3 -c "import json;d=json.load(open('<파일>'));print(len(d['terms']))"` 로 확인하고 개수 · 불확실한 점만 짧게 보고해요. 다른 파일은 건드리지 마요.

## 작업 방식 (꼭 지켜요 — 한 번에 큰 파일을 쓰다 멈추는 일이 있었어요)
1. 논문 **한 편씩** 끝내고 바로 그 파일을 저장해요. 두 번째 논문은 그다음에.
2. 큰 JSON 을 통째로 읽지 말고, 먼저 스크립트로 후보를 뽑아요:
   `python3 scripts/papers/term_candidates.py <id>` → 본문에 자주 나오는 영문 약어 · 괄호 속 원어 · 굵은 글씨 용어와 등장 횟수, 그리고 기존 glossary.
   필요한 부분만 grep 으로 확인해요.
3. 파일은 **Bash heredoc 이 아니라 Write 도구로**, 30~45개면 충분해요. `more` 는 2~3문장.

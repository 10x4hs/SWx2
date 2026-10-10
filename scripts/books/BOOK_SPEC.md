# AI 공부책 (`public/books/<book>.json`) 규격

공부 스위치의 **AI** 탭(`#/books`)이 읽는 파일이에요. 논문 쉽게 읽기(`scripts/papers/EASY_SPEC.md`)의 블록을 그대로 쓰고, 네 가지(play · widget · code · deep)를 더했어요.
`node scripts/books/check-books.mjs` 가 기계로 볼 수 있는 규칙을 검사하고, `node scripts/books/index.mjs` 가 `index.json` 을 만들어요.

## 누구를 위한 책인가

- 독자는 한 명: **1달 안에 '뇌 교체형 자비스'를 만들려는 사람.** Python · 수학은 익숙하지만 딥러닝 · LLM 은 처음이에요. GPU 는 없고 돈은 거의 안 써요(Colab 무료 · 맥).
- 뇌 교체형 = 자비스 뼈대(검색 · 도구 · 음성 · 기억)의 뇌 자리에 처음엔 공개 모델(Ollama)을 꽂고, 바닥부터 직접 만든 작은 모델이 자라면 교체해요.
- 목표는 "이해"가 아니라 **"1달 뒤에 쓸 수 있는 기억"** 이에요. 그래서 장마다 다섯 박자를 지켜요.

## 장의 다섯 박자 (화면이 자동으로 붙이는 것 · 내용이 줘야 하는 것)

| 박자 | 화면 | 내용 파일이 주는 것 |
|---|---|---|
| ① 먼저 추측 | 첫 퀴즈 2개를 정답 없이 먼저 보여 줘요 | `quiz` 중 앞 2개가 "읽기 전에 찍어 볼 만한" 문제 |
| ② 그림이 연기 | `play` · `scene` 이 단계별로 재생돼요 (▶ 다음 단계) | 장마다 `play` 또는 `scene` ≥ 1 |
| ③ 한 줄 + 정확한 말 | 카드식 한 줄 뒤에 용어(한국어 · 원어) | `callout kind:key` 한 줄 + `words[{term, en, easy, deep}]` |
| ④ 만져 보기 | `widget` | 장마다 `widget` ≥ 1 (없으면 `bars` · `grids` 로 숫자 감각) |
| ⑤ 말해 보기 → 자비스 연결 | 책 덮고 쓰기 → `recap.points` 체크 → `jarvis` 한 줄 | `recap`, `jarvis` |
| 깊게 | 장 위 스위치를 켜면 `deep` 블록이 보여요 | 장마다 `deep` ≥ 1 (수식 · 논문 근거 · 코드 · 함정) |
| 빡빡하게 | 퀴즈 3개 이상, 복습 때 다시 풀어 절반 이상 맞아야 다음 단계 | `quiz` ≥ 3 |

## 글의 수준

- 기본(쉽게)은 EASY_SPEC 의 규칙 그대로: 짧은 문장 해요체, 비유 먼저, 용어는 처음 나올 때 그 자리에서 풀기, 수식 없이. 한 문단 2~4문장, 400자 이하.
- **다만 독자는 Python · 수학을 알아요.** `deep` 안에서는 수식 · 원어 용어 · 논문 이름 · 코드를 마음껏 써요. 쉽게 본문에도 원어는 괄호로 한 번 붙여요: "어텐션(attention)".
- 숫자는 출처가 있는 것만. 설명용으로 지어낸 숫자 · 그림에는 `note` 에 "설명용 예시" 를 붙여요. 논문 · 보고서 수치는 `note` 에 출처(논문 이름 · 연도)를 적어요.
- 장 하나 = 10~15분. 섹션 4~7개. 한 장에 아이디어 하나.

## 파일 모양

```json
{
  "id": "how", "n": 2, "title": "작동 원리", "short": "원리", "color": "blue",
  "kicker": "2권 · 작동 원리", "headline": "모델은 글을 읽지 않아요.\n숫자를 계산해요.", "lead": "토큰에서 어텐션까지…",
  "why": "책장에 보이는 한 줄: 이 책을 왜 읽나",
  "chapters": [
    {
      "id": "tokens", "title": "사람은 낱말로, 모델은 토큰으로", "minutes": 12, "week": 1,
      "headline": "두 줄 이내 \\n 가능", "lead": "장 머리 한 문단",
      "sections": [ { "title": "…", "body": [ /* 블록 */ ] } ],
      "recap": { "title": "…", "text": "5~8문장", "points": ["핵심 3~5개"] },
      "jarvis": "자비스에서 이게 쓰이는 자리 한 줄 (예: 내 노트를 검색할 때 질문도 토큰으로 잘라 임베딩해요)",
      "words": [ { "term": "토큰", "en": "token", "easy": "모델이 읽는 글 조각", "deep": "BPE · 유니그램 등 서브워드 단위. 어휘 크기 3만~15만" } ],
      "build": { "title": "1주차 실습 ① 토크나이저 학습", "steps": [ { "text": "…", "code": "python …" } ], "note": "Colab 무료 · 20분" }
    }
  ]
}
```

- `color`: rose · violet · blue · teal · green · amber · sand (책장 색).
- `week`(선택): 1~4. 그 주 실습과 짝이에요. `build` 는 주차 실습이 붙는 장에만.
- `words` 는 장마다 5~12개. `deep` 은 선택이지만 전문 용어엔 꼭.
- 책의 `headline` · `lead` 는 책장과 책 머리에 보여요.

## 블록 (`body` 안) — EASY_SPEC 의 블록 전부 + 아래 넷

EASY_SPEC: `p` · `compare` · `flow` · `grids` · `bars` · `scale` · `steps` · `analogy` · `callout(kind warn|tip|key)` · `quiz{q,choices,answer,why}` · `scene`. (`figure` 는 `public/books/fig/<book>/` 안의 파일.)

### `play` — 칩이 줄에 놓이고, 단계마다 생기고 · 밝아지고 · 선으로 이어지는 '원리 재생'
토큰이 하나씩 예측되는 모습, 어텐션이 어느 토큰을 얼마나 보는지, 역전파가 뒤에서 앞으로 번지는 모습처럼 **"무엇이 무엇을 보고, 무엇이 새로 생기는지"** 를 보여 줄 때 써요.
```json
{ "t": "play", "rows": [
    { "id": "in", "label": "입력", "items": [ { "id": "t1", "text": "오늘" }, { "id": "t2", "text": "날씨가" }, { "id": "t3", "text": "정말" } ] },
    { "id": "out", "label": "다음 토큰 후보", "items": [] }
  ],
  "steps": [
    { "text": "앞 토큰 셋을 봐요.", "hi": ["t1", "t2", "t3"] },
    { "text": "후보마다 확률을 매겨요.", "add": [ { "row": "out", "id": "c1", "text": "좋아요", "v": 0.62, "tone": "c" }, { "row": "out", "id": "c2", "text": "덥네요", "v": 0.21 } ], "link": [ { "from": "t3", "to": "c1", "w": 0.62 }, { "from": "t3", "to": "c2", "w": 0.21 } ] },
    { "text": "가장 높은 걸 붙이고 다시 시작해요.", "add": [ { "row": "in", "id": "t4", "text": "좋아요", "tone": "c" } ], "remove": ["c1", "c2"], "hi": ["t4"], "link": [] }
  ], "caption": "…", "note": "확률은 설명용 예시예요" }
```
- `items`/`add`: `{id, text, tone?(a|b|c|d|n), v?(0~1 → 칩 안 막대와 %)}`. `set`: 같은 id 의 text · v · tone 바꾸기.
- `hi` · `link` 는 그 단계의 값으로 **바뀌어요**(안 쓰면 비움). `add` · `remove` · `set` 은 쌓여요. 단계 3~8개.

### `widget` — 직접 만져 보기 (숫자 감각)
```json
{ "t": "widget", "kind": "bpe", "caption": "…" }
```
`kind`:
- `bpe` — 작은 한국어 말뭉치로 진짜 BPE 를 브라우저에서 학습해요. 합치기 횟수 슬라이더 · 내 문장 넣기 → 조각으로 잘라 보여 줘요. (`text`: 기본 문장)
- `temperature` — 후보 5개의 점수(`logits`: [{text, z}])에 온도 슬라이더 → 확률 막대, "뽑기" 버튼.
- `attention` — 토큰 몇 개(`tokens`)와 점수표(`scores`: 행=질문 토큰, 열=보는 토큰)를 주면, 토큰을 고를 때 softmax 로 비율이 나와요. 날카로움 슬라이더.
- `loss` — 정답 확률 슬라이더 → 벌점 −log p.
- `cost` — 파라미터 N · 토큰 D · GPU 속도 · 효율 · 시간당 가격 → 6ND 로 GPU 시간과 돈. (`presets`: [{label, n, d}])
- `memory` — 파라미터 수 · 정밀도 → 가중치 · 기울기 · Adam 상태 메모리(GB).
- `scaling` — 계산 예산 슬라이더 → Chinchilla 비율(D ≈ 20N)의 N · D.
값은 모두 공식 그대로 계산해요. 설명용 가정(효율 · 가격)은 위젯 안에 적혀요.

### `code` — 접힌 코드 (직접 해 보기)
```json
{ "t": "code", "lang": "python", "title": "어텐션 한 줄", "code": "w = softmax(q @ k.T / d**0.5)\\nout = w @ v", "note": "numpy 기준" }
```

### `deep` — 깊게 스위치를 켤 때만 보이는 묶음
```json
{ "t": "deep", "title": "수식으로", "body": [ { "t": "p", "text": "…" }, { "t": "formula", "text": "Attention(Q,K,V) = softmax(QKᵀ/√d)V" }, { "t": "code", … } ] }
```
안에는 `p` · `formula{text, note?}` · `code` · `callout` · `bars` · `steps` · `widget` · `grids` · `flow` · `compare` 를 넣어요 (quiz · play · scene · deep 은 안 돼요). 논문 근거는 `callout kind:tip` 에 "Vaswani et al. 2017" 처럼.

## 검사 규칙 (`check-books.mjs`)

- 장: 섹션 4~7, `quiz` ≥ 3, `play`+`scene` ≥ 1, `deep` ≥ 1, `widget` 또는 (`bars`|`grids`) ≥ 1, `recap.points` 3~5, `jarvis` 있음, `words` 5~12, 문단 ≤ 420자, 블록 종류가 목록 안.
- `play`: rows 1~4, 단계 2~8, 모든 id 가 존재, `v`·`w` 는 0~1.
- `widget.kind` 가 목록 안.
- 책: `id`·`title`·`short`·`color`·`headline`·`lead`·`why`, 장 3~8.

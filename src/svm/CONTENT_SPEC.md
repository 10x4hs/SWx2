# Silicon Valley Mafia — 내용 규격 (Curtis Yarvin 모음)

관리자(HSK · GYK)만 보는 Dock 앱 `#/svm` 의 내용이에요. 서버가 `GET /api/svm/data` 로만 내보내요 (`public/` 에 두지 않아요 — 주소만 알면 누구나 열 수 있어서).
파일 넷을 `src/svm/data.js` 가 합쳐요. 점검: `node scripts/svm-check.mjs`

| 파일 | 담는 것 |
|---|---|
| `data/core.json` | `essays` (01 입문 · 02 핵심 개념) + `concepts` (개념 사전) |
| `data/gray.json` | `essays` (03 최근 Gray Mirror) |
| `data/lineage.json` | `essays` (04 계보) + `people` (인물) + `edges` (인물 사이 관계) |
| `data/media.json` | `videos` (YouTube) + `more` (더 읽을 거리) |

모든 파일은 하나의 JSON 객체예요. 주석 · 끝 쉼표는 쓸 수 없어요.

## 글쓰기 규칙

- 본문(요약 · 논지 · 비판 · 소개)은 **한국어 한다체**("~라고 본다", "~이다")로 써요. 화면 단추 같은 짧은 말만 해요체예요.
- 야빈의 주장은 **전하는 말투**로 써요("야빈은 ~라고 주장한다"). 맞다 · 틀리다는 `critiques` 에서 출처를 달아 따로 다뤄요.
- 사람 이름은 이렇게 적어요: 커티스 야빈 · 멘시우스 몰드버그 · 피터 틸 · 닉 랜드 · 발라지 스리니바산 · 마크 앤드리슨 · JD 밴스 · 토머스 칼라일 · 제임스 버넘 · 한스헤르만 호페 · 스콧 알렉산더.
- **지어내지 않아요.** 인용(`quotes[].en`)은 원문 페이지에서 그대로 복사한 글자만 써요. 원문을 열지 못했으면 인용을 넣지 않아요. 사실 주장(투자 · 만남 · 발언)에는 `refs` 나 `url` 로 출처를 달아요.
- 분량: `claims` 3~5개(각 1~3문장), `quotes` 1~3개(각 50단어 이하 — 짧은 인용만), `critiques` 1~3개.

## `essays[]` — 글 하나

```json
{
  "id": "open-letter",
  "no": 1,
  "section": "intro",
  "title": "An Open Letter to Open-Minded Progressives",
  "ko": "열린 마음의 진보주의자에게 보내는 공개편지",
  "sub": "민주주의는 정말 최선인가 — 14장짜리 입문 연재",
  "author": "yarvin",
  "venue": "Unqualified Reservations",
  "year": 2008,
  "words": 120000,
  "concepts": ["democracy", "universalism"],
  "people": ["thiel"],
  "core": "한 줄 핵심 (60자 이내, 한다체)",
  "claims": ["논지 1", "논지 2", "논지 3"],
  "quotes": [{ "en": "원문 그대로", "ko": "자연스러운 번역", "where": "Chapter 1", "url": "https://그 문장이 있는 페이지" }],
  "sv": { "text": "왜 실리콘밸리가 읽나 — 2~4문장", "refs": [{ "label": "출처 이름", "url": "https://..." }] },
  "critiques": [{ "text": "대표 반론 1~2문장", "by": "스콧 알렉산더", "label": "The Anti-Reactionary FAQ", "url": "https://..." }],
  "sources": [{ "label": "Chapter 1: The Wavefunction", "url": "https://원문 페이지" }]
}
```

- `id`: 영어 소문자 + `-` (예: `formalist-manifesto`). 파일 사이에서 겹치면 안 돼요.
- `no`: 1~15. 01 입문 = 1~2 · 02 핵심 개념 = 3~7 · 03 Gray Mirror = 8~11 · 04 계보 = 12~15.
- `section`: `intro` · `core` · `gray` · `lineage`.
- `sub`: 목록 한 줄 설명 (40자 이내).
- `author`: 아래 인물 id (야빈 글이면 `yarvin`).
- `words`: 원문 길이 어림값 (모르면 `null`).
- `note` (선택): 요약의 한계 한 줄 — 예: "유료 구간(…이후)은 공개되지 않아 요약에서 뺐다." 논지(`claims`)에는 글 자신의 주장만 넣어요.
- `concepts`: 아래 개념 id 만. `people`: 이 글과 실리콘밸리를 잇는 인물 id.
- `sources`: "원문 + 번역" 탭이 서버에서 그때그때 불러와 번역하는 원문 페이지. 연재면 편마다 하나씩, 순서대로 넣어요. 원문 사이트 주소를 그대로 써요(Unqualified Reservations 는 영구 주소 `https://www.unqualified-reservations.org/YYYY/MM/<slug>/` — blogspot 은 '옮겨졌어요' 안내만 남았어요, Gray Mirror 는 `https://graymirror.substack.com/p/...`).
- 읽는 시간은 화면이 글자 수로 계산해요 — 적지 않아요.

## 정해 둔 id

인물(`people[].id`, `author`, `edges`):
`yarvin` · `carlyle` · `burnham` · `hoppe` · `land` · `thiel` · `balaji` · `andreessen` · `vance` · `masters` · `alexander` · `sandifer` (계보 담당이 더 넣을 수 있어요 — 영어 소문자 한 단어)

개념(`concepts[].id`, `essays[].concepts`, `videos[].concepts`):
`cathedral` · `formalism` · `neocameralism` · `patchwork` · `democracy` · `universalism` · `sovereignty` · `monarchy` · `rage` · `exit` · `nrx` · `castes` · `network-state` · `redpill`

## `concepts[]` — 개념 사전 (core.json)

```json
{ "id": "cathedral", "en": "CATHEDRAL", "name": "대성당", "short": "대학 · 언론이 합의를 만드는 구조 (40자 이내)", "long": "3~5문장 풀이", "terms": ["대성당", "Cathedral"] }
```

- `terms`: 글 안에서 이 말이 나오면 화면이 점선 밑줄을 긋고 풀이를 띄워요. 한국어 · 영어 표기를 다 넣어요.

## `people[]` · `edges[]` — 인물 지도 (lineage.json)

```json
{ "id": "thiel", "name": "Peter Thiel", "ko": "피터 틸", "role": "PayPal · Palantir 공동창업자 · 투자자", "years": "1967–", "short": "한 줄 (40자 이내)", "bio": "야빈과의 관계를 중심으로 2~4문장", "lineage": 4, "refs": [{ "label": "...", "url": "https://..." }] }
```

- `lineage`: 서재 위 '계보' 줄의 순서 (1 뿌리 → 5 지금). 줄에 안 나오면 `null`. 같은 숫자는 한 칸에 같이 나와요.

```json
{ "a": "thiel", "b": "yarvin", "rel": "INVESTED", "ko": "야빈의 스타트업 Tlön(Urbit)에 투자", "url": "https://출처", "weak": false }
```

- `rel`: `INFLUENCED` (a 가 b 에 영향) · `INVESTED` · `BACKED` (후원 · 멘토) · `CITED` (a 가 b 를 인용) · `PEER` · `CRITIC` (a 가 b 를 비판) · `DEBATED`.
- `weak: true` = 간접적이거나 논쟁 중인 관계 (점선).

## `videos[]` — 관련 영상 (media.json)

```json
{ "id": "YouTube 11자 id", "title": "oEmbed 제목 그대로", "channel": "oEmbed author_name", "year": 2025, "people": ["yarvin"], "concepts": ["monarchy"], "about": "무슨 영상이고 왜 볼 만한지 1~2문장", "start": 0, "essays": [] }
```

- id 는 반드시 `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json` 로 확인해요 (제목 · 채널이 그 답과 같아야 해요).
- `start`: 이 영상에서 볼 곳(초). 확인 못 했으면 0.
- `essays`: 관련 글 id (나중에 채워도 돼요).

## `more[]` — 더 읽을 거리 (media.json)

```json
{ "title": "원제", "ko": "한 줄 설명 (40자 이내)", "author": "yarvin", "venue": "Unqualified Reservations", "year": 2009, "url": "https://...", "concepts": ["exit"] }
```

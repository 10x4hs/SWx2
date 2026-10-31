# Psychology 콘텐츠 규격

`public/psy/*.json`이 Psychology 앱(#/psy)의 모든 콘텐츠예요. 고친 뒤에는 `node scripts/psy-check.mjs`를 돌려요.

## cards.json
- `tracks`: 7개 고정 순서 (persuasion · argument · business · classical · figures · defense · library). `order`가 학습 순서이고, 모든 카드는 정확히 한 track의 order에 들어가요.
- `cards[]`: `id`(kebab-case, 유일) · `track` · `group?` · `en` · `ko` · `line`(60자 이하) · `why` · `example` · `use` · `counter` · `source:{cite,url}` · `evidence` · `note?` · `related:[ids]` · `videos?:[ytid]` · `more?:[{cite,url}]`(보조 근거) · `book?`(library 카드).
- `evidence`: strong(메타분석·반복 재현) · mixed(효과는 있으나 조건부) · contested(재현 실패·논쟁) · practitioner(실무 책·현장 기법) · classical(고전 원전·사전 정의) · unverified(출처 미확인).
- `source.url`이 비어 있으면 `evidence`가 unverified이거나 `note`에 "미확인"을 적어요.

## books.json
`{id,en,ko,author,year,shelf,why,url?,cards:[ids]}`. 각 원칙 카드는 `track:"library"`, `book:<책 id>`예요.

## videos.json
`{id(YouTube 11자),title,channel,lang,tracks,covers:[card ids],kind,why,mins?}`. 공식 채널이 아닌 재업로드 영상은 넣지 않아요.

## spar.json
`{id,title,role,goal,opener,cards?:[ids]}`. `cards`는 이 장면에서 쓸 만한 기법 카드예요.

## 출처 확인 (2026-10-31)
DOI는 Crossref API, 책은 Open Library, 국어 수사법은 표준국어대사전 검색, 고전은 Perseus · The Latin Library · ctext · Silva Rhetoricae 페이지로 확인했어요. FTC · RAND · LessWrong처럼 자동 요청을 막는 사이트는 검색 결과로 주소만 확인했어요.

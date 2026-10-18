# 일기를 Notion 처럼 — 설계

2026-10-18 · 승인: 사용자 ("응 바로 시작해")

## 무엇을
- 새 일기는 노트의 블록 편집기(`createBlockEditor`)로. 하위 페이지 · 데이터베이스는 빼요(`hide`). 예전 글 일기(blocks 없음 + body 있음)는 예전 글 상자 그대로.
- 글씨 크기: 글자(`<span class="fs-s|l|xl">`, 선택 도구 막대) · 블록(`props.size`, ⋮⋮ 메뉴) · 일기 전체(`doc.size`, 가- 가+). 노트 편집기에서도 같은 글자 · 블록 크기.
- 사진: 붙여 넣기 · 끌어다 놓기 · '이미지 올리기'(`opts.uploadImage`). 긴 변 1600px 로 줄여 올리고, 모서리를 끌어 `props.width`(%).

## 서버
- 마이그레이션 0052: `diaries.blocks` (JSON). PUT /diary 가 blocks 를 받으면 `validateDoc` 으로 검사하고 body 는 `blocksToMd` 로 만들어요(잔디 · 목록 · 검색용).
- 사진: `POST /api/diary/img` (원본 바이트, jpg · png · webp · gif, 6MB) → R2 `diary-<uuid>.<ext>`, 주인은 customMetadata. `GET /api/diary/img/:key` — 주인은 늘, 일기 모임 상대는 공개한 일기 blocks 에 그 주소가 있을 때만, 그 밖엔 403. `cache-control: private, no-store`.

## 검사
- 화면: 제목 블록 · 글자 크게 · 사진 붙여 넣기 · 전체 크게 → 저장 · 새로 고침 후 그대로. 상대 화면 읽기 전용 + 사진.
- 사진 권한: 공개 — 주인 200 · 상대 200 · 모임 밖 403, 비공개 — 상대 403. 잘못된 형식 400. 예전 글 일기 → 글 상자.

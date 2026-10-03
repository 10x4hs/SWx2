# Grill: 휴대폰 최적화 + 활동 상태
Date: 2026-10-04

## Intent
휴대폰에서도 앱을 편하게 쓰고, 인스타처럼 "지금 뭐 하는 중"을 서로 보여 주기. 코딩 중이면 쓰는 AI 도구 캐릭터가 프로필 오른쪽 위에 뜸.

## Constraints
- 상태 문구는 이모지 없이 미니멀한 영어 (coding, working, studying, sleeping …).
- 캐릭터는 로고가 아니라 "진짜 캐릭터" 느낌.

## Key decisions
- Decision: 모바일은 하루 계획표부터. 추가 창 작음/가려짐, 우클릭 메뉴 불가, 블록 좁음, 스크롤 시 UI 겹침을 고친다. Reason: 가장 불편한 화면. Alternative considered: 전 화면 동시.
- Decision: 상태는 직접 고르기만 (자동 전환·만료 없음). Alternative considered: 타이머 연동 자동, 시간 지정.
- Decision: coding 상태에서 Claude/Codex/Gemini 중 쓰는 도구를 골라(여럿 가능) 캐릭터 표시. Alternative considered: 셋 항상, 랜덤.
- Decision: 캐릭터는 Clawd(Claude Code 주황 픽셀 게)를 기준으로 한 픽셀 스타일 세트. Codex = 파란 펫 느낌, Gemini = 파랑·보라 반짝이. Reason: Codex/Gemini CLI엔 뚜렷한 공식 캐릭터가 없음(웹 조사).
- Decision: 상태는 모든 프로필 사진에 표시 (작은 곳은 점, 큰 곳은 캐릭터+단어).

## Surfaced assumptions
- 공식 캐릭터 이미지는 그대로 복제하지 않고 직접 그린 픽셀 SVG를 씀.

## Out of scope
- 상태 변경 푸시 알림, 자동 상태.

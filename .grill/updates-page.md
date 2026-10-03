# Grill: 업데이트 기록 페이지
Date: 2026-10-03

## Intent
지금까지 이 앱을 몇 번, 무엇을 바꿨는지 셋이 한눈에 보고, 새 기능으로 바로 가 볼 수 있게 한다.

## Key decisions
- Decision: 업데이트 1번 = 사용자가 체감하는 기능 단위 묶음. Reason: 커밋은 자잘한 정리까지 세고, 요청 기록은 9/28~29가 없음. Alternative considered: 커밋 1개 · 요청 1개 · 배포 1개.
- Decision: 보는 사람 = 우리 셋 모두, 쉬운 한국어 공지 겸 기록. Reason: 친구들도 새 기능을 알아야 씀. Alternative considered: 나만 보는 개발 로그.
- Decision: 앞으로는 배포할 때마다 기록이 빠졌는지 검사해서 한 줄씩 쌓는다.

## Surfaced assumptions
- 커밋 기록(9/28~)이 가장 완전한 출처다. 배포 기록은 Cloudflare에 최근 것만 남는다.

## Open questions
- 친구 각자가 요청한 업데이트를 따로 표시할지 (지금은 요청자 기록이 없음).

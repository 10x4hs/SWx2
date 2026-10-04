# Dsm-mafia 데스크톱 (Mac)

왼쪽은 공부 앱(dsm-mafia), 오른쪽은 진짜 브라우저 탭. YouTube 재생 · 구글 로그인 전부 돼요 (Chromium 내장).
웹 앱 코드는 그대로이고, 웹 앱의 **URL 페이지**는 데스크톱 안에서 오른쪽 탭으로 열려요.

## 만들기 (한 사람이 한 번)
```
cd desktop
npm install
npm start          # 바로 실행해 보기
npm run dist       # dist/Dsm-mafia-*.dmg (Intel + Apple Silicon 통합)
```
`icon.png`(1024×1024) 를 두면 앱 아이콘이 돼요. 없으면 Electron 기본 아이콘.

## 친구에게 나눠 주기
1. `dist/Dsm-mafia-0.1.0-universal.dmg` 를 GitHub Releases 나 드라이브에 올려요.
2. 친구는 dmg 를 열어 앱을 Applications 로 끌어다 놓아요.
3. 서명이 없어서 처음 열 때 "확인되지 않은 개발자" 가 떠요 → 앱을 **오른쪽 클릭 → 열기** (한 번만). 그래도 안 되면 터미널에서
   ```
   xattr -cr /Applications/Dsm-mafia.app
   ```

## 단축키
⌘T 새 탭 · ⌘W 탭 닫기 · ⌘L 주소줄 · ⌘B 사이드바 접기 · ⌘R 새로고침 · ⌘⇧R 앱 새로고침

## 다른 서버 주소로
`TRIO_URL=http://localhost:8787/ npm start`

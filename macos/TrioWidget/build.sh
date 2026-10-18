#!/bin/sh
# TrioWidget 빌드 → /Applications 에 설치 → 실행. 필요: Xcode, xcodegen (brew install xcodegen)
set -e
cd "$(dirname "$0")"
xcodegen -q
xcodebuild -project TrioWidget.xcodeproj -scheme TrioWidget -configuration Release -derivedDataPath build build | grep -E "error:|BUILD"
pkill -x TrioWidget 2>/dev/null || true
rm -rf /Applications/TrioWidget.app
cp -R build/Build/Products/Release/TrioWidget.app /Applications/
open /Applications/TrioWidget.app

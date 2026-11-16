#!/usr/bin/env bash
# 한 번에 배포하기: 관문 검사 → (필요하면) 운영 DB 백업 → 원격 마이그레이션 → 배포 → 주소 출력
#   npm run deploy:all            (= npm run deploy)
#   SKIP_E2E=1 npm run deploy     급할 때만: 화면 검사(test.mjs quick)를 건너뛰어요 — 나머지 관문은 그대로
#   DEPLOY_ANY_REF=1 ...          origin/main 이 아닌 커밋을 일부러 올릴 때만
# 비밀값(AI 키 등)은 더 이상 배포 때 올리지 않아요 → 바꿀 때만 npm run secrets:push
# 여러 번 돌려도 괜찮아요(이미 있는 DB·적용된 마이그레이션은 건너뛰어요).
set -euo pipefail
cd "$(dirname "$0")/.."

DB=dsm-mafia
CONFIG=wrangler.jsonc
BACKUP_DIR="${BACKUP_DIR:-$HOME/Documents/swx2-backups}"
export CI=1   # wrangler 가 "정말 할까요?" 묻지 않게

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
die() { printf '\033[31m✘ %s\033[0m\n' "$1" >&2; exit 1; }

# 배포가 잠시 고치는 파일들(sw.js 버전 · index.html 미리 받기 목록 · 공부 시간표): 끝나면(실패해도) 원래대로 돌려 git 을 깨끗하게 둬요
TMP="$(mktemp -d)"
STAMPED=(public/sw.js public/index.html public/papers/study-time.json)
for f in "${STAMPED[@]}"; do mkdir -p "$TMP/$(dirname "$f")"; cp "$f" "$TMP/$f"; done
restore() { for f in "${STAMPED[@]}"; do cp "$TMP/$f" "$f" 2>/dev/null || true; done; rm -rf "$TMP"; }
trap restore EXIT

# 0) 관문 — 하나라도 실패하면 운영은 손대지 않고 멈춰요
step "관문 검사"
git fetch -q origin main
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "커밋 안 한 변경이 있어요. 커밋하거나 되돌린 뒤 다시 배포해 주세요."
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && [ -z "${DEPLOY_ANY_REF:-}" ]; then
  die "지금 커밋($(git rev-parse --short HEAD))이 origin/main($(git rev-parse --short origin/main))이 아니에요. 'git switch --detach origin/main' 뒤에 배포하거나, 일부러면 DEPLOY_ANY_REF=1."
fi
echo "커밋 $(git rev-parse --short HEAD) · 깨끗함"
# 문법: 모든 JS 를 node --check (여러 개를 함께)
BAD="$(git ls-files 'src/*.js' 'public/*.js' 'scripts/*.mjs' 'scripts/*.js' | xargs -P 8 -I{} sh -c 'node --check "{}" 2>/dev/null || echo "{}"')"
[ -z "$BAD" ] || die "문법 오류: $BAD"
echo "JS 문법 OK ($(git ls-files 'src/*.js' 'public/*.js' 'scripts/*.mjs' 'scripts/*.js' | wc -l | tr -d ' ')개)"
node scripts/assets.mjs --check > /dev/null || die "assets --check 실패 (node scripts/assets.mjs --check)"
for a in "" vg onto aip; do node scripts/dev-index.mjs $a --check > /dev/null || die "dev-index $a --check 실패"; done
node scripts/mba-index.mjs --check > /dev/null || die "mba-index --check 실패"
node --test scripts/*.test.mjs > /dev/null 2>&1 || die "단위 검사 실패 (node --test scripts/*.test.mjs)"
echo "내용 · 단위 검사 OK"
if [ -z "${SKIP_E2E:-}" ]; then
  node scripts/test.mjs quick --files=README.md --port=8829 > "$TMP/quick.log" 2>&1 || { tail -n 30 "$TMP/quick.log" >&2; die "화면 검사(test.mjs quick) 실패 — 위 로그를 봐 주세요"; }
  grep -E "^합계" "$TMP/quick.log" | tail -n 1 || true
else
  echo "⚠ SKIP_E2E: 화면 검사를 건너뛰었어요"
fi
node scripts/updates-check.mjs > "$TMP/updates.log" 2>&1 || true; head -n 1 "$TMP/updates.log"   # 업데이트 기록 안내 (막지는 않아요)

# 1) 로그인 확인
step "Cloudflare 로그인 확인"
WHO="$(npx wrangler whoami 2>&1 || true)"
echo "$WHO" | grep -q "You are logged in" || die "로그인이 필요해요. 먼저 'npx wrangler login' 을 실행해 주세요."
echo "로그인 OK"

# 2) D1 데이터베이스: 없으면 만들고, id 를 wrangler.jsonc 에 써 넣어요
db_id() { npx wrangler d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const d=j.find(x=>x.name===process.argv[1]);process.stdout.write(d?(d.uuid||d.id||""):"")}catch{}})' "$DB"; }
step "D1 데이터베이스 '$DB'"
ID="$(db_id)"
if [ -z "$ID" ]; then
  echo "없어서 새로 만들어요 (위치: 아시아·태평양)"
  npx wrangler d1 create "$DB" --location apac < /dev/null > /dev/null
  ID="$(db_id)"
fi
[ -n "$ID" ] || die "D1 id 를 찾지 못했어요. 'npx wrangler d1 list' 로 확인해 주세요."
echo "id: $ID"
if ! grep -q "\"database_id\": \"$ID\"" "$CONFIG"; then
  node -e '
    const fs = require("fs"), [f, id] = process.argv.slice(1);
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/"database_id":\s*"[^"]*"/, `"database_id": "${id}"`));
  ' "$CONFIG" "$ID"
  echo "$CONFIG 에 id 를 써 넣었어요"
fi

# 3) 되돌릴 자리 남기기: Time Travel 북마크는 늘, 전체 백업은 마이그레이션이 있거나 마지막 백업이 하루 넘었을 때
step "되돌릴 자리"
BOOKMARK="$(npx wrangler d1 time-travel info "$DB" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).bookmark||"")}catch{}})')"
[ -n "$BOOKMARK" ] && echo "Time Travel 북마크: $BOOKMARK" || echo "⚠ 북마크를 못 읽었어요"
MLIST="$(npx wrangler d1 migrations list "$DB" --remote < /dev/null 2>&1 || true)"
PENDING="$(echo "$MLIST" | grep -Eo '[0-9]{4}_[A-Za-z0-9_-]+\.sql' || true)"
# 목록을 못 읽으면(네트워크 등) "없음"으로 여기지 않고 백업부터 해요
if [ -z "$PENDING" ] && ! echo "$MLIST" | grep -qi "no migrations"; then PENDING="(목록을 못 읽음)"; fi
LAST="$(ls -t "$BACKUP_DIR"/swx2-*.sql.gz 2>/dev/null | head -n 1 || true)"
if [ -n "$PENDING" ] || [ -z "$LAST" ] || [ -n "$(find "$LAST" -mtime +0 2>/dev/null)" ]; then
  [ -n "$PENDING" ] && echo "새 마이그레이션: $(echo "$PENDING" | tr '\n' ' ')"
  node scripts/backup.mjs || die "백업 실패 — 운영 DB 는 손대지 않았어요"
else
  echo "마이그레이션 없음 · 최근 백업: $(basename "$LAST")"
fi

# 4) 원격 마이그레이션 (이미 적용된 건 알아서 건너뛰어요)
step "원격 DB 마이그레이션"
node scripts/papers/study-time.mjs > /dev/null && echo "공부 예상 시간 다시 쟀어요"
npx wrangler d1 migrations apply "$DB" --remote < /dev/null

# 5) 배포 — 서비스 워커 버전을 배포 시각으로 찍어요 → 친구들 브라우저가 새 파일을 받아요
step "Worker 배포"
STAMP="v$(date +%Y%m%d%H%M%S)"
node scripts/assets.mjs   # index.html 의 modulepreload 목록 (모듈을 한 번에 받게)
node -e 'const fs=require("fs"),[f,v,l,h]=process.argv.slice(1);fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/const VERSION = "[^"]*"/,`const VERSION = "${v}"`).replace(/const PRECACHE = \[[^\]]*\]/,`const PRECACHE = ${l}`).replace(/const HASHES = \{[^}]*\}/,`const HASHES = ${h}`))' public/sw.js "$STAMP" "$(node scripts/assets.mjs --list)" "$(node scripts/assets.mjs --hashes)"
grep -q "const VERSION = \"$STAMP\"" public/sw.js && ! grep -q "const PRECACHE = \[\]" public/sw.js && ! grep -q "const HASHES = {}" public/sw.js || die "sw.js 에 버전 · 목록을 찍지 못했어요"
echo "sw 버전: $STAMP"
if ! OUT="$(npx wrangler deploy --tag "$(git rev-parse --short HEAD)" --message "$(git log -1 --pretty=%s | cut -c1-90)" < /dev/null 2>&1)"; then
  echo "$OUT" >&2
  printf '\n배포가 실패했어요. 마이그레이션은 이미 적용됐을 수 있어요. 되돌리려면:\n  코드:  npx wrangler rollback\n  DB:    npx wrangler d1 time-travel restore %s --bookmark %s\n' "$DB" "${BOOKMARK:-<북마크>}" >&2
  exit 1
fi
echo "$OUT" | grep -Ev "^\s*$" | tail -n 6
URL="$(echo "$OUT" | grep -Eo 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -n 1 || true)"

step "끝!"
if [ -n "$URL" ]; then echo "주소: $URL"; else echo "주소는 Cloudflare 대시보드 > Workers > $DB 에서 확인해 주세요."; fi
echo "되돌리기: 코드 'npx wrangler rollback' · DB 'npx wrangler d1 time-travel restore $DB --bookmark ${BOOKMARK:-…}'"

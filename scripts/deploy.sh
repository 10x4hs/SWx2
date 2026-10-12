#!/usr/bin/env bash
# 한 번에 배포하기: D1 만들기(없을 때만) → 원격 마이그레이션 → 배포 → 비밀값 올리기 → 주소 출력
#   npm run deploy:all
# 여러 번 돌려도 괜찮아요(이미 있는 DB·적용된 마이그레이션은 건너뛰어요). 비밀값은 화면에 찍지 않아요.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=dsm-mafia
CONFIG=wrangler.jsonc
VARS=.dev.vars
SECRETS=(GEMINI_API_KEY GROQ_API_KEY COHERE_API_KEY MIMO_API_KEY OPENROUTER_API_KEY ZHIPU_API_KEY KILO_API_KEY OLLAMA_API_KEY VAPID_PRIVATE_KEY INVITE_CODE)   # PASSWORDLESS 는 절대 안 올려요
export CI=1   # wrangler 가 "정말 할까요?" 묻지 않게

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

# 1) 로그인 확인
step "Cloudflare 로그인 확인"
WHO="$(npx wrangler whoami 2>&1 || true)"
if ! echo "$WHO" | grep -q "You are logged in"; then
  echo "로그인이 필요해요. 먼저 'npx wrangler login' 을 실행해 주세요." >&2
  exit 1
fi
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
if [ -z "$ID" ]; then echo "D1 id 를 찾지 못했어요. 'npx wrangler d1 list' 로 확인해 주세요." >&2; exit 1; fi
echo "id: $ID"
if ! grep -q "\"database_id\": \"$ID\"" "$CONFIG"; then
  node -e '
    const fs = require("fs"), [f, id] = process.argv.slice(1);
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/"database_id":\s*"[^"]*"/, `"database_id": "${id}"`));
  ' "$CONFIG" "$ID"
  echo "$CONFIG 에 id 를 써 넣었어요"
fi

# 3) 원격 마이그레이션 (이미 적용된 건 알아서 건너뛰어요)
step "원격 DB 마이그레이션"
node scripts/updates-check.mjs || true
node scripts/papers/study-time.mjs > /dev/null && echo "공부 예상 시간 다시 쟀어요"
npx wrangler d1 migrations apply "$DB" --remote < /dev/null

# 4) 배포 (비밀값을 올리려면 Worker 가 먼저 있어야 해서 배포부터 해요)
step "Worker 배포"
# 서비스 워커 버전을 배포 시각으로 찍어요 → 친구들 브라우저가 새 파일을 받아요
# (찍은 버전은 배포에만 쓰고, 끝나면 원래 파일로 되돌려서 git 이 깨끗하게 남아요)
STAMP="v$(date +%Y%m%d%H%M%S)"
cp public/sw.js /tmp/dsm-sw.js.orig
trap 'cp /tmp/dsm-sw.js.orig public/sw.js 2>/dev/null || true' EXIT
node scripts/assets.mjs   # index.html 의 modulepreload 목록 (모듈을 한 번에 받게)
# 서비스 워커가 설치 때 코드 전체를 한 벌로 받아 두게 목록도 찍어요
node -e 'const fs=require("fs"),[f,v,l]=process.argv.slice(1);fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/const VERSION = "[^"]*"/,`const VERSION = "${v}"`).replace(/const PRECACHE = \[[^\]]*\]/,`const PRECACHE = ${l}`))' public/sw.js "$STAMP" "$(node scripts/assets.mjs --list)"
grep -q "const VERSION = \"$STAMP\"" public/sw.js && ! grep -q "const PRECACHE = \[\]" public/sw.js || { echo "sw.js 에 버전 · 목록을 찍지 못했어요" >&2; exit 1; }
echo "sw 버전: $STAMP"
OUT="$(npx wrangler deploy < /dev/null 2>&1)" || { echo "$OUT" >&2; exit 1; }
cp /tmp/dsm-sw.js.orig public/sw.js
echo "$OUT" | grep -Ev "^\s*$" | tail -n 8
URL="$(echo "$OUT" | grep -Eo 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -n 1 || true)"

# 5) 비밀값: .dev.vars 에 있는 것만, 값은 파이프로만 넘겨요
step "비밀값 올리기"
[ -f "$VARS" ] || { echo "$VARS 가 없어요. README 의 'AI 키' 부분을 보고 만들어 주세요." >&2; exit 1; }
for NAME in "${SECRETS[@]}"; do
  v="$(grep -E "^${NAME}=" "$VARS" | tail -n 1 | cut -d= -f2- || true)"
  v="${v%\"}"; v="${v#\"}"
  if [ -z "$v" ]; then echo "- $NAME: .dev.vars 에 없어서 건너뛰어요"; continue; fi
  if printf '%s' "$v" | npx wrangler secret put "$NAME" > /dev/null 2>&1; then echo "- $NAME: 올림"; else echo "- $NAME: 실패 (다시 돌려 보세요)" >&2; fi
done
unset v

step "끝!"
if [ -n "$URL" ]; then echo "주소: $URL"; else echo "주소는 Cloudflare 대시보드 > Workers > $DB 에서 확인해 주세요."; fi
echo "배포본은 비밀번호가 있어야 로그인돼요. 계정: npm run user:add -- <아이디> <이름> <비밀번호> --remote"

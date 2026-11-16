#!/usr/bin/env bash
# 운영 비밀값 올리기 — 키를 바꿨을 때만 돌려요 (배포 때마다 자동으로 올리지 않아요: 로컬 .dev.vars 의 테스트 키가 운영 키를 덮지 않게)
#   npm run secrets:push                  .dev.vars 에 있는 것 전부 (하나씩 확인)
#   npm run secrets:push -- GROQ_API_KEY  이 이름만
# 값은 화면에 찍지 않고 파이프로만 넘겨요. PASSWORDLESS 는 절대 안 올려요.
set -euo pipefail
cd "$(dirname "$0")/.."
VARS=.dev.vars
ALL=(GEMINI_API_KEY GROQ_API_KEY COHERE_API_KEY MIMO_API_KEY OPENROUTER_API_KEY ZHIPU_API_KEY KILO_API_KEY OLLAMA_API_KEY VAPID_PRIVATE_KEY INVITE_CODE)
[ -f "$VARS" ] || { echo "$VARS 가 없어요." >&2; exit 1; }
NAMES=("$@"); [ ${#NAMES[@]} -gt 0 ] || NAMES=("${ALL[@]}")
fail=0
for NAME in "${NAMES[@]}"; do
  [ "$NAME" = PASSWORDLESS ] && { echo "- PASSWORDLESS 는 올리지 않아요"; continue; }
  v="$(grep -E "^${NAME}=" "$VARS" | tail -n 1 | cut -d= -f2- || true)"; v="${v%\"}"; v="${v#\"}"
  if [ -z "$v" ]; then echo "- $NAME: .dev.vars 에 없어서 건너뛰어요"; continue; fi
  if [ $# -eq 0 ] && [ -t 0 ]; then read -r -p "- $NAME 올릴까요? [y/N] " a; [ "$a" = y ] || { echo "  건너뜀"; continue; }; fi
  if printf '%s' "$v" | npx wrangler secret put "$NAME" > /dev/null 2>&1; then echo "- $NAME: 올림"; else echo "- $NAME: 실패" >&2; fail=1; fi
done
unset v
exit $fail

#!/bin/zsh
# Lilys 영상 정리 노트의 이미지(52장)를 R2 버킷 dsm-mafia-files 에 올려요.
# 키: lilys-<영상ID>-<파일명>  → 앱에서는 /api/files/<키> 로 보여요 (로그인한 사람만).
# 다시 돌려도 같은 키를 덮어쓸 뿐이라 안전해요.
cd "$(dirname "$0")/.." || exit 1
DIR="$HOME/Documents/dsm-mafia-brain/media/lilys"
ok=0; bad=0
for f in "$DIR"/*/*; do
  vid=$(basename "$(dirname "$f")"); name=$(basename "$f"); key="lilys-$vid-$name"
  case "$name" in *.png) ct=image/png;; *) ct=image/jpeg;; esac
  if npx wrangler r2 object put "dsm-mafia-files/$key" --file "$f" --content-type "$ct" --remote >/dev/null 2>&1; then ok=$((ok+1)); else bad=$((bad+1)); echo "실패 $key"; fi
done
echo "올림 $ok · 실패 $bad (52 · 0 이어야 해요)"

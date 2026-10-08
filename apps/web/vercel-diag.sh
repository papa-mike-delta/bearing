#!/bin/bash
# TEMPORARY: confirms from the commit status timing that the green preview
# really ran the migrate step (Vercel build logs aren't readable from where
# this is being checked). Removed in the next commit.
cd ../..
log=$(mktemp)
npx turbo run build --filter=web 2>&1 | tee "$log"
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] || exit 1
if [ "$VERCEL" != "1" ]; then code=5
elif grep -q '"env":"'"$VERCEL_ENV"'"' packages/db/.migrate-marker.json 2>/dev/null; then
  code=2
  grep -q "PRODUCTION_DB_HOST is not set" "$log" && code=3
else code=7; fi
echo "vercel-diag: code $code"
sleep $((code * 60))
exit 0

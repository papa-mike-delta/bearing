#!/bin/bash
# TEMPORARY: Vercel build logs aren't readable from where this is being
# debugged, so the failing build sleeps 60s x code before exiting 1; the
# commit status timestamps give the code. Removed in the next commit.
cd ../..
log=$(mktemp)
npx turbo run build --filter=web 2>&1 | tee "$log"
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] && exit 0
if ! grep -q "db migrate" "$log"; then code=8
elif grep -q "refused: POSTGRES_URL_NON_POOLING is not set" "$log"; then
  if [ -n "$POSTGRES_URL_UNPOOLED" ]; then code=1
  elif [ -n "$DATABASE_URL_UNPOOLED" ]; then code=2
  else code=3; fi
elif grep -q "refused:" "$log"; then code=4
elif grep -q "db migrate: failed" "$log"; then code=5
elif grep -q "did not apply database migrations" "$log"; then code=6
else code=7; fi
echo "vercel-diag: code $code"
sleep $((code * 60))
exit 1

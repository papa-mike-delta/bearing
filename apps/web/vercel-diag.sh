#!/bin/bash
# TEMPORARY: Vercel build logs aren't readable from where this is being
# debugged, so the failing build sleeps 60s x code before exiting 1; the
# commit status timestamps give the code. Removed in a later commit.
cd ../..
log=$(mktemp)
npx turbo run build --filter=web 2>&1 | tee "$log"
rc=${PIPESTATUS[0]}
[ "$rc" -eq 0 ] && exit 0
code=1
case "$(node -v)" in v24.*) code=$((code + 1)) ;; esac
grep -q "EBADDEVENGINES" "$log" && code=$((code + 2))
grep -q "ENOENT" "$log" && code=$((code + 4))
grep -q "@repo/db:db:migrate:vercel" "$log" && code=$((code + 8))
echo "vercel-diag: code $code"
sleep $((code * 60))
exit 1

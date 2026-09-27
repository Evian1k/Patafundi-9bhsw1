#!/usr/bin/env bash
# Task 11: revert FundiHub brand -> PataFundi (display strings + logo restore; functional code untouched)
set -euo pipefail
cd "$(dirname "$0")/.."

# 1) Restore original PataFundi logo components + index.html from pre-rebrand commit 6ee9cd0
git checkout 6ee9cd0 -- frontend/index.html frontend/src/assets/logo.tsx frontend/src/components/brand/BrandLogo.tsx
echo "[1/4] logo components + index.html restored from 6ee9cd0"

# 2) Remove the rebrand-only SVG favicon (old index.html does not reference it)
if [ -f frontend/public/favicon.svg ]; then
  git rm -q frontend/public/favicon.svg
  echo "[2/4] rebrand favicon.svg removed"
else
  echo "[2/4] favicon.svg already absent"
fi

# 3) Case-aware rename of brand strings in code (order matters: longest first)
FILES=$(grep -ril "fundihub" \
    frontend/src apps/customer-mobile apps/fundi-mobile packages/shared/src \
    backend/src backend/scripts scripts \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.css" --include="*.json" \
    2>/dev/null | grep -v node_modules || true)
COUNT=0
for f in $FILES; do
  sed -i 's/FUNDIHUB/PATAFUNDI/g; s/FundiHub/PataFundi/g; s/fundihub/patafundi/g' "$f"
  COUNT=$((COUNT+1))
done
echo "[3/4] renamed brand strings in $COUNT code files"

# 4) Operational docs (worklog.md intentionally left as historical record)
for f in DEMO_ACCOUNTS.md README.md; do
  if [ -f "$f" ] && grep -qil "fundihub" "$f"; then
    sed -i 's/FUNDIHUB/PATAFUNDI/g; s/FundiHub/PataFundi/g; s/fundihub/patafundi/g' "$f"
    echo "  docs updated: $f"
  fi
done
echo "[4/4] docs updated"

echo "=== remaining fundihub refs (should be worklog/migrations/history only) ==="
grep -ril "fundihub" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.pgdata --exclude-dir=dist --exclude-dir=.zscripts 2>/dev/null | head -10 || echo "(none)"

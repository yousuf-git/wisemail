#!/usr/bin/env bash
# Remove leftover Next.js build output / caches (including archived tree). Safe to re-run.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

removed=0
for path in \
  .next \
  .next-e2e \
  .next-prod2 \
  .vercel \
  archive/next-web/.next \
  archive/next-web/.next-e2e
do
  if [[ -e "$path" ]]; then
    rm -rf "$path"
    echo "removed $path"
    removed=1
  fi
done

shopt -s nullglob
for path in .next-*; do
  rm -rf "$path"
  echo "removed $path"
  removed=1
done
for path in archive/next-web/.next-*; do
  rm -rf "$path"
  echo "removed $path"
  removed=1
done
shopt -u nullglob

find . -name 'tsconfig.tsbuildinfo' -not -path './node_modules/*' -not -path './.git/*' -delete 2>/dev/null || true
find . -name '.tsbuildinfo' -not -path './node_modules/*' -not -path './.git/*' -delete 2>/dev/null || true

if [[ "$removed" -eq 0 ]]; then
  echo "nothing to remove"
fi

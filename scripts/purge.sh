#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
echo "Purging node_modules, build artifacts, and caches..."

rm -rf node_modules

for dir in apps packages modules docs; do
  if [ -d "$dir" ]; then
    find "$dir" -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true
    find "$dir" -name "dist" -type d -prune -exec rm -rf {} + 2>/dev/null || true
    find "$dir" -name ".turbo" -type d -prune -exec rm -rf {} + 2>/dev/null || true
    find "$dir" -name ".next" -type d -prune -exec rm -rf {} + 2>/dev/null || true
    find "$dir" -name "coverage" -type d -prune -exec rm -rf {} + 2>/dev/null || true
    find "$dir" -name "*.tsbuildinfo" -type f -delete 2>/dev/null || true
  fi
done

rm -rf .turbo

echo "Done. Run pnpm install to reinstall."

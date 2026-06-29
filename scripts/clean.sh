#!/usr/bin/env bash
# Remove node_modules, build outputs, and Turbo/Next caches (does not touch local env or generated setup files).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Cleaning node_modules, build artifacts, and caches..."

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

rm -rf .turbo coverage

echo "Done. Run pnpm install (or pnpm ci) to reinstall dependencies."

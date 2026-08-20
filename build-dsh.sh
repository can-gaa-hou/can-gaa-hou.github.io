#!/bin/bash
# Build DeepSeek Harness documentation site and copy output to dsh/
set -e

echo "==> Installing dependencies (if needed)..."
cd "$(dirname "$0")/deepseek-harness"
pnpm install --ignore-scripts --frozen-lockfile

echo "==> Building VitePress docs with base /dsh/..."
DOCS_BASE=/dsh/ pnpm --filter @deepseek-ai/website run build

echo "==> Copying output to dsh/..."
rm -rf ../dsh
mkdir -p ../dsh
cp -r website/.dist/* ../dsh/

echo "==> Done! DSH docs are ready at dsh/"
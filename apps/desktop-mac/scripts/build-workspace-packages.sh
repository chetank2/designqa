#!/usr/bin/env bash
set -euo pipefail

echo "📦 Building workspace packages..."
cd "$(dirname "$0")/../../.."
cd packages/mcp-client && pnpm build
cd ../compare-engine && pnpm build

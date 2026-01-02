#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Launching DesignQA with logging..."
node dist/main/index.js 2>&1 | tee -a "$HOME/Library/Logs/DesignQA/main-process.log"

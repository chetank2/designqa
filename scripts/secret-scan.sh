#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_SECRET_SCAN:-}" == "1" ]]; then
  echo "⚠️  Secret scan skipped (ALLOW_SECRET_SCAN=1)."
  exit 0
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "❌ ripgrep (rg) is required for the secret scan."
  exit 1
fi

files=$(git diff --cached --name-only --diff-filter=ACM)
if [[ -z "$files" ]]; then
  exit 0
fi

found=false

token_pattern='(figd_[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})'

is_skippable_path() {
  local path="$1"
  case "$path" in
    docs/*|**/docs/*|tests/*|**/tests/*|**/*.md|**/*.txt|**/*.example|**/*.sample) return 0 ;;
    **/*.png|**/*.jpg|**/*.jpeg|**/*.gif|**/*.svg|**/*.pdf) return 0 ;;
    *) return 1 ;;
  esac
}

for file in $files; do
  if is_skippable_path "$file"; then
    continue
  fi

  content=$(git show ":$file" || true)
  if [[ -z "$content" ]]; then
    continue
  fi

  if echo "$content" | rg -n -S "$token_pattern"; then
    echo "❌ Potential secret token detected in staged file: $file"
    found=true
  fi

  if echo "$content" | rg -n -S '^(FIGMA_MCP_SERVICE_TOKEN|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY|CREDENTIAL_ENCRYPTION_KEY|LOCAL_CREDENTIAL_KEY)='; then
    if ! echo "$content" | rg -n -S '^(FIGMA_MCP_SERVICE_TOKEN|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY|CREDENTIAL_ENCRYPTION_KEY|LOCAL_CREDENTIAL_KEY)=(your_|example|changeme|xxx)'; then
      echo "❌ Secret-like env var detected in staged file: $file"
      found=true
    fi
  fi
done

if [[ "$found" == "true" ]]; then
  echo "🚫 Commit blocked. Remove secrets or set ALLOW_SECRET_SCAN=1 to bypass."
  exit 1
fi

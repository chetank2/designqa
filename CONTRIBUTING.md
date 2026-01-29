# Contributing to DesignQA

Thanks for your interest in contributing! This guide covers local setup, workflow, and PR expectations.

## Quick Start

1. Fork and clone the repo.
2. Enable Corepack (for pnpm):
   ```bash
   corepack enable
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Copy environment template and configure:
   ```bash
   cp .env.example .env
   ```

## Local Development

- Backend:
  ```bash
  pnpm run dev:backend
  ```
- Frontend:
  ```bash
  pnpm run dev:frontend
  ```

## Code Quality

- Lint:
  ```bash
  pnpm lint
  ```
- Typecheck:
  ```bash
  pnpm typecheck
  ```

## Pre-commit Secret Scan (Optional)

Enable the repo hook:
```bash
git config core.hooksPath .githooks
```

This runs a lightweight secret scan on staged files. To bypass in rare cases:
```bash
ALLOW_SECRET_SCAN=1 git commit -m "..."
```

## Pull Request Guidelines

- Keep PRs focused and scoped.
- Update docs and examples when behavior changes.
- Add tests where possible; if not, explain why in the PR.
- Ensure lint/typecheck pass locally.
- Avoid committing secrets or real tokens; use `.env.example`.

## Commit Message Style

Use clear, descriptive commits. Conventional commits are welcome but not required.

## Reporting Issues

Please include:
- Repro steps
- Expected vs actual behavior
- Logs or screenshots (redact secrets)
- OS and Node version

## Security

If you believe you’ve found a security issue, follow `SECURITY.md` instead of filing a public issue.

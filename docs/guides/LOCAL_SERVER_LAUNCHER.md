# DesignQA Local Server Launcher

The launcher is a minimal app that starts the embedded backend on `http://localhost:3847`
and opens the browser once the health check is ready. It ships without the full desktop
UI and is intended for users who only need the local web app.

## What it does

- Starts the embedded backend on port 3847.
- Waits for `/api/health` to respond.
- Opens the default browser to `http://localhost:3847`.
- Keeps running to keep the server alive.

## Build & Package

From the repo root:

```bash
pnpm run build:launcher
pnpm run package:launcher:mac   # or :win / :all
```

## Notes

- The launcher bundles the backend + frontend dist into `saas-backend`.
- If you change the frontend, re-run `pnpm run build:launcher` before packaging.
- The launcher respects the same environment variables used by the desktop app.

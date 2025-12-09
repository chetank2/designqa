# Render Deployment Guide

This project now includes a Render blueprint (`render.yaml`) plus a matching `.renderignore` so you can reuse all of the Docker optimizations that were created for Railway builds (skip Chromium download, install dependencies before copying the full repo, etc.). Follow the steps below to keep Render deploys under ~5 minutes even on the free tier.

## 1. Use Docker Deployments

1. Push this repo (with `render.yaml` and `.renderignore`) to GitHub.
2. In Render click **New +** → **Blueprint** and select the repo.
3. Render will detect `render.yaml` and create a single Docker-based web service that points to the existing `Dockerfile`. No extra build or start commands are required because `CMD ["npm", "start"]` is already defined.

> Prefer Docker mode instead of the default “Node” runtime. The Dockerfile already handles `npm ci`, the Vite build, and Puppeteer’s native dependencies. Reusing it prevents Render from repeating those expensive steps in every deploy.

## 2. Environment Variables

Set these in the newly created service before the first deploy:

### Required Variables

| Key | Value | Description |
| --- | --- | --- |
| `NODE_ENV` | `production` | Production environment |
| `PORT` | `3847` | Server port (Render sets automatically, but good to have) |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `true` | Saves several minutes of build time |
| `FIGMA_API_KEY` | `figd_your_token_here` | **REQUIRED** - Your Figma Personal Access Token |
| `FIGMA_CONNECTION_MODE` | `figma` | **Recommended**: Use Remote MCP mode (`https://mcp.figma.com/mcp`) |
| `FIGMA_CONNECTION_MODE` | `api` | Alternative: Use direct REST API mode (simpler, no MCP protocol) |
| `FIGMA_MCP_URL` | `https://mcp.figma.com/mcp` | Optional: Custom Remote MCP URL (only if using `figma` mode) |
| `ENABLE_LOCAL_MCP` | `false` | Disable local MCP (not available in Render) |

### Optional: Supabase Configuration

| Key | Value | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Only if using Supabase for user auth/history |
| `VITE_SUPABASE_ANON_KEY` | `your_anon_key` | Only if using Supabase |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Server-side Supabase URL |
| `SUPABASE_SERVICE_KEY` | `your_service_key` | Server-side Supabase service key |

> **Important**: The blueprint marks secrets with `sync: false`, so Render will prompt you to enter them.

### Why These Settings?

- **`FIGMA_CONNECTION_MODE=figma`** (Recommended): Uses Figma's Remote MCP service (`https://mcp.figma.com/mcp`) - provides full MCP protocol features, works perfectly in Render.com
- **`FIGMA_CONNECTION_MODE=api`** (Alternative): Uses direct REST API calls - simpler but no MCP protocol features
- **`ENABLE_LOCAL_MCP=false`**: Prevents failed connection attempts to localhost MCP server (Figma Desktop not available in Render)
- **Supabase**: Optional - only needed if you want user authentication and persistent comparison history

> **💡 Tip**: Use `FIGMA_CONNECTION_MODE=figma` to get the full MCP experience (same as Desktop MCP) in your cloud deployment!

See [MCP_DOCKER_RENDER.md](./MCP_DOCKER_RENDER.md) for detailed explanation of MCP modes and Remote MCP.

## 3. Render Ignore Rules

`.renderignore` mirrors `.dockerignore` and keeps multi-gigabyte folders (docs, reports, SQLite data, screenshots, etc.) out of the upload bundle. Render uploads the ignored files before the build even starts, so keeping this list in sync is critical for short deploy times.

If you ever add new bulky directories (large exports, logs, screenshots) make sure they’re listed in both `.renderignore` and `.dockerignore`.

## 4. Health Check & Monitoring

- The blueprint configures `healthCheckPath: /api/health`, which matches the enhanced health endpoint defined in `src/core/server/index.js`.
- Render considers the deploy healthy once this endpoint returns HTTP 200. You can use the same endpoint for uptime monitoring or alerts.

## 5. Useful Local Checks

Before pushing to Render:

```bash
# Ensure Docker build still works locally
docker build -t designqa:render-test .

# Run containers if you want to simulate Render (with Remote MCP - recommended)
docker run --rm -p 3847:3847 \
  -e NODE_ENV=production \
  -e PORT=3847 \
  -e FIGMA_CONNECTION_MODE=figma \
  -e FIGMA_API_KEY=your_token_here \
  -e ENABLE_LOCAL_MCP=false \
  designqa:render-test

# OR test with direct API mode (alternative)
docker run --rm -p 3847:3847 \
  -e NODE_ENV=production \
  -e PORT=3847 \
  -e FIGMA_CONNECTION_MODE=api \
  -e FIGMA_API_KEY=your_token_here \
  -e ENABLE_LOCAL_MCP=false \
  designqa:render-test

# Test health endpoint
curl http://localhost:3847/api/health
```

Keeping the Docker build green locally guarantees the Render deploy will succeed because Render uses the exact same Dockerfile.

> **Note**: The MCP connection warning (`ECONNREFUSED 127.0.0.1:3845`) is expected and normal - the app will automatically use Figma API mode instead.

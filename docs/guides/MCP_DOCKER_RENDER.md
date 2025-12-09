# Figma MCP in Docker & Render.com - Complete Guide

## Why Figma MCP Doesn't Work in Docker (Local Mode)

### The Problem

When running in Docker, the application tries to connect to **Figma Desktop App** running on your local machine at `http://127.0.0.1:3845/mcp`. However:

1. **Network Isolation**: Docker containers run in isolated network namespaces
2. **Localhost Access**: `127.0.0.1` inside a Docker container refers to the container itself, NOT your host machine
3. **No Figma Desktop**: Even if you could access the host, Figma Desktop App isn't installed inside the container

### The Error You See

```
❌ Connection failed: TypeError: fetch failed
Error: connect ECONNREFUSED 127.0.0.1:3845
```

This is **expected and normal** - the container cannot reach Figma Desktop on your host.

## Will MCP Work in Render.com?

**Short Answer**: Yes, but you need to use **Remote MCP mode** (not local Desktop mode).

### Render.com Environment

- ✅ **Supports**: Remote MCP via Figma API (`FIGMA_CONNECTION_MODE=api` or `figma`)
- ❌ **Does NOT support**: Local Desktop MCP (no Figma Desktop installed)

### How to Configure for Render.com

You have **two options** for Render.com:

#### Option 1: Remote MCP Mode (Recommended) ⭐

**Best for**: Full MCP protocol features, same interface as Desktop MCP

```bash
# Use Remote MCP mode (recommended)
FIGMA_CONNECTION_MODE=figma

# Your Figma Personal Access Token (REQUIRED)
FIGMA_API_KEY=figd_your_token_here

# Optional: Custom Remote MCP URL (defaults to https://mcp.figma.com/mcp)
FIGMA_MCP_URL=https://mcp.figma.com/mcp

# Disable local MCP health checks
ENABLE_LOCAL_MCP=false
```

**What you get:**
- Full MCP protocol support
- Access to MCP tools (`get_code`, `get_metadata`, `get_variable_defs`, etc.)
- Same interface as Desktop MCP
- Works perfectly in Docker and Render.com

#### Option 2: Direct API Mode

**Best for**: Simpler setup, direct REST API calls

```bash
# Use direct API mode
FIGMA_CONNECTION_MODE=api

# Your Figma Personal Access Token (REQUIRED)
FIGMA_API_KEY=figd_your_token_here

# Disable local MCP health checks
ENABLE_LOCAL_MCP=false
```

**What you get:**
- Direct REST API calls to Figma
- Simpler implementation
- No MCP protocol overhead
- Still works great for most use cases

### MCP Connection Modes Explained

| Mode | Connection Type | Works in Docker? | Works in Render? | Requires | Description |
|------|----------------|------------------|------------------|----------|-------------|
| `desktop` | Local Figma Desktop App | ❌ No | ❌ No | Figma Desktop running locally | Connects to `http://127.0.0.1:3845/mcp` |
| `api` | Figma REST API (Direct) | ✅ Yes | ✅ Yes | `FIGMA_API_KEY` token | Direct REST API calls, no MCP protocol |
| `figma` | **Remote MCP (Cloud)** | ✅ Yes | ✅ Yes | `FIGMA_API_KEY` token | **Uses Figma's Remote MCP service at `https://mcp.figma.com/mcp`** |

### Remote MCP (`figma` mode) - Recommended for Render.com

**Remote MCP** is Figma's cloud-hosted MCP service that provides the same MCP protocol interface as Desktop MCP, but accessible over HTTPS.

**Advantages of Remote MCP:**
- ✅ Full MCP protocol support (same as Desktop MCP)
- ✅ Works in Docker and cloud deployments
- ✅ No need for Figma Desktop App
- ✅ Uses Bearer token authentication
- ✅ Provides MCP tools like `get_code`, `get_metadata`, `get_variable_defs`, etc.

**How it works:**
- Connects to `https://mcp.figma.com/mcp` (configurable via `FIGMA_MCP_URL`)
- Uses `Authorization: Bearer <token>` header for authentication
- Supports all MCP protocol features (tools, resources, notifications)
- Session-based communication with session IDs

**Configuration:**
```bash
FIGMA_CONNECTION_MODE=figma          # Use Remote MCP mode
FIGMA_API_KEY=figd_your_token       # Your Figma Personal Access Token
FIGMA_MCP_URL=https://mcp.figma.com/mcp  # Optional, defaults to this URL
```

**Difference from `api` mode:**
- `api` mode: Direct REST API calls (simpler, but no MCP protocol features)
- `figma` mode: Remote MCP protocol (full MCP features, same interface as Desktop MCP)

## Do You Need Supabase?

### Short Answer: **Optional but Recommended**

### Without Supabase

✅ **Works**: Basic functionality
- Figma API extraction
- Web extraction  
- Comparison features
- Local storage (SQLite in Docker, memory in Render)

❌ **Limited**: 
- No user authentication
- No persistent comparison history
- No multi-user support
- No secure credential storage

### With Supabase

✅ **Full Features**:
- User authentication
- Persistent comparison history
- Multi-user support
- Secure credential storage (Vault)
- Better scalability

### When to Use Supabase

**Use Supabase if**:
- You need user accounts/login
- You want to save comparison history
- Multiple users will use the app
- You want secure token storage

**Skip Supabase if**:
- Single-user deployment
- No need for persistent storage
- Just testing/development

## Configuration for Render.com Deployment

### Minimum Required Variables

**Option A: Remote MCP (Recommended)**
```bash
NODE_ENV=production
PORT=3847
FIGMA_CONNECTION_MODE=figma          # Use Remote MCP
FIGMA_API_KEY=figd_your_token_here
ENABLE_LOCAL_MCP=false
```

**Option B: Direct API**
```bash
NODE_ENV=production
PORT=3847
FIGMA_CONNECTION_MODE=api           # Use direct REST API
FIGMA_API_KEY=figd_your_token_here
ENABLE_LOCAL_MCP=false
```

### With Supabase (Recommended)

```bash
# Core settings
NODE_ENV=production
PORT=3847
FIGMA_CONNECTION_MODE=api
FIGMA_API_KEY=figd_your_token_here
ENABLE_LOCAL_MCP=false

# Supabase configuration
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
SUPABASE_ANON_KEY=your_anon_key

# Frontend build variables (set BEFORE first deploy)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Testing Locally in Docker

### Test with Remote MCP Mode (Recommended)

```bash
# Build image
docker build -t designqa:latest .

# Run with Remote MCP mode (like Render will)
docker run -p 3847:3847 \
  -e NODE_ENV=production \
  -e PORT=3847 \
  -e FIGMA_CONNECTION_MODE=figma \
  -e FIGMA_API_KEY=your_token_here \
  -e ENABLE_LOCAL_MCP=false \
  designqa:latest
```

### Test with Direct API Mode (Alternative)

```bash
# Run with direct API mode
docker run -p 3847:3847 \
  -e NODE_ENV=production \
  -e PORT=3847 \
  -e FIGMA_CONNECTION_MODE=api \
  -e FIGMA_API_KEY=your_token_here \
  -e ENABLE_LOCAL_MCP=false \
  designqa:latest
```

### Expected Behavior

✅ **Will Work**:
- Server starts successfully
- Figma API extraction works
- Web extraction works
- Comparison features work

⚠️ **Expected Warnings** (can ignore):
- `MCP connection failed` - This is normal, app falls back to API mode
- `Supabase not configured` - Only if you didn't set Supabase vars

## Summary

1. **Docker Local MCP**: Doesn't work (expected) - containers can't access host's Figma Desktop
2. **Render.com Remote MCP**: ✅ **Will work perfectly** with `FIGMA_CONNECTION_MODE=figma` + `FIGMA_API_KEY`
3. **Render.com Direct API**: ✅ **Will also work** with `FIGMA_CONNECTION_MODE=api` + `FIGMA_API_KEY`
4. **Supabase**: Optional but recommended for production features

### Quick Setup for Render.com (Remote MCP - Recommended)

1. Set `FIGMA_CONNECTION_MODE=figma` in Render environment variables (uses Remote MCP)
2. Set `FIGMA_API_KEY=your_token` in Render environment variables  
3. Set `ENABLE_LOCAL_MCP=false` in Render environment variables
4. (Optional) Configure Supabase if you need user accounts/history

### Quick Setup for Render.com (Direct API - Alternative)

1. Set `FIGMA_CONNECTION_MODE=api` in Render environment variables (uses direct REST API)
2. Set `FIGMA_API_KEY=your_token` in Render environment variables  
3. Set `ENABLE_LOCAL_MCP=false` in Render environment variables
4. (Optional) Configure Supabase if you need user accounts/history

**Recommendation**: Use `FIGMA_CONNECTION_MODE=figma` for Remote MCP to get full MCP protocol features! 🚀

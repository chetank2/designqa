# Figma MCP in Docker & Render.com - Complete Guide

## Cloud-Only Deployment

This application is designed for cloud deployments only. **Local desktop MCP mode is not supported**. All deployments must use either:

1. **Remote MCP** (`FIGMA_CONNECTION_MODE=figma`) - Recommended
2. **Direct API** (`FIGMA_CONNECTION_MODE=api`) - Alternative

## MCP Configuration for Cloud Deployments

### Render.com / Railway / Docker Environment

- ✅ **Supports**: Remote MCP via Figma API (`FIGMA_CONNECTION_MODE=figma`)
- ✅ **Supports**: Direct REST API (`FIGMA_CONNECTION_MODE=api`)
- ❌ **Does NOT support**: Local Desktop MCP (not available in cloud deployments)

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
```

**What you get:**
- Direct REST API calls to Figma
- Simpler implementation
- No MCP protocol overhead
- Still works great for most use cases

### MCP Connection Modes Explained

| Mode | Connection Type | Works in Docker? | Works in Render? | Requires | Description |
|------|----------------|------------------|------------------|----------|-------------|
| `api` | Figma REST API (Direct) | ✅ Yes | ✅ Yes | `FIGMA_API_KEY` token | Direct REST API calls, no MCP protocol |
| `figma` | **Remote MCP (Cloud)** | ✅ Yes | ✅ Yes | `FIGMA_API_KEY` token | **Uses Figma's Remote MCP service at `https://mcp.figma.com/mcp`** |

**Note**: `desktop` mode is no longer supported. Use `figma` (Remote MCP) or `api` (Direct API) instead.

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

❌ **Not Supported**: Supabase is required for cloud deployments
- The application requires Supabase for database and storage
- Set up a Supabase project before deploying

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

**Supabase is Required**:
- All cloud deployments require Supabase
- Database and storage are provided by Supabase
- User authentication and data persistence depend on Supabase

## Configuration for Render.com Deployment

### Minimum Required Variables

**Option A: Remote MCP (Recommended)**
```bash
NODE_ENV=production
PORT=3847
FIGMA_CONNECTION_MODE=figma          # Use Remote MCP
FIGMA_API_KEY=figd_your_token_here
```

**Option B: Direct API**
```bash
NODE_ENV=production
PORT=3847
FIGMA_CONNECTION_MODE=api           # Use direct REST API
FIGMA_API_KEY=figd_your_token_here
```

### With Supabase (Recommended)

```bash
# Core settings
NODE_ENV=production
PORT=3847
FIGMA_CONNECTION_MODE=figma  # Use 'figma' for Remote MCP or 'api' for direct API
FIGMA_API_KEY=figd_your_token_here

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
  -e SUPABASE_URL=https://xxx.supabase.co \
  -e SUPABASE_SERVICE_KEY=your_service_key \
  -e SUPABASE_ANON_KEY=your_anon_key \
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
  -e SUPABASE_URL=https://xxx.supabase.co \
  -e SUPABASE_SERVICE_KEY=your_service_key \
  -e SUPABASE_ANON_KEY=your_anon_key \
  designqa:latest
```

### Expected Behavior

✅ **Will Work**:
- Server starts successfully
- Figma API extraction works
- Web extraction works
- Comparison features work

⚠️ **Required Configuration**:
- Supabase must be configured (SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY)
- FIGMA_API_KEY must be set
- FIGMA_CONNECTION_MODE must be set to 'figma' or 'api'

## Summary

1. **Cloud Deployments Only**: This application is designed for cloud deployments (Render/Railway/Docker)
2. **Remote MCP**: ✅ **Recommended** - Use `FIGMA_CONNECTION_MODE=figma` + `FIGMA_API_KEY` for full MCP protocol features
3. **Direct API**: ✅ **Alternative** - Use `FIGMA_CONNECTION_MODE=api` + `FIGMA_API_KEY` for simpler REST API calls
4. **Supabase Required**: All deployments require Supabase for database and storage

### Quick Setup for Render.com / Railway (Remote MCP - Recommended)

1. Set `FIGMA_CONNECTION_MODE=figma` in environment variables (uses Remote MCP)
2. Set `FIGMA_API_KEY=your_token` in environment variables  
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` in environment variables
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in environment variables (for frontend)

### Quick Setup for Render.com / Railway (Direct API - Alternative)

1. Set `FIGMA_CONNECTION_MODE=api` in environment variables (uses direct REST API)
2. Set `FIGMA_API_KEY=your_token` in environment variables  
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` in environment variables
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in environment variables (for frontend)

**Recommendation**: Use `FIGMA_CONNECTION_MODE=figma` for Remote MCP to get full MCP protocol features! 🚀

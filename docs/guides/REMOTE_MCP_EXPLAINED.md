# Remote MCP: How It Works in Docker & Render.com

> Note: This guide references `FIGMA_*` env vars for Figma API/MCP. If you are not using Figma API/MCP, you can ignore those variables and steps.

## Quick Answer

**Yes!** Remote MCP works in both Docker and Render.com. Here's how:

## Understanding Remote MCP

### What is Remote MCP?

Remote MCP is **Figma's cloud-hosted MCP service** that your application connects to over HTTPS.

- **Service Location**: `https://mcp.figma.com/mcp` (hosted by Figma)
- **Client Code**: Included in your Docker image and Render deployment
- **Connection**: HTTPS requests from your app to Figma's servers

### Architecture Diagram

```
┌─────────────────┐         HTTPS          ┌──────────────────────┐
│                 │ ────────────────────> │                      │
│  Your Docker    │   Authorization:      │  Figma Remote MCP    │
│  Container      │   Bearer <token>      │  Service             │
│  (Render.com)    │                       │  mcp.figma.com/mcp   │
│                 │ <──────────────────── │                      │
└─────────────────┘      MCP Protocol     └──────────────────────┘
     │                                            
     │ Contains:                                  
     │ - RemoteMCPClient.js                       
     │ - Connection logic                          
     │ - Token authentication                      
     └─────────────────────────────────────────────
```

## Is Remote MCP Present in Docker?

### ✅ YES - The Client Code is Present

**What's in your Docker image:**
- ✅ `RemoteMCPClient` class (`src/figma/RemoteMCPClient.js`)
- ✅ Connection logic to `https://mcp.figma.com/mcp`
- ✅ Authentication with Bearer tokens
- ✅ MCP protocol implementation

**What's NOT in Docker:**
- ❌ The Remote MCP service itself (it's hosted by Figma)
- ❌ Figma Desktop App (not needed for Remote MCP)

### How It Works

1. **Your Docker container** runs your application
2. **Your application** contains `RemoteMCPClient` code
3. **RemoteMCPClient** makes HTTPS requests to `https://mcp.figma.com/mcp`
4. **Figma's servers** respond with MCP protocol data

## Does It Work in Render.com?

### ✅ YES - Works Perfectly!

**Same as Docker:**
- ✅ `RemoteMCPClient` code is deployed to Render
- ✅ Makes HTTPS requests to `https://mcp.figma.com/mcp`
- ✅ Uses Bearer token authentication
- ✅ Full MCP protocol support

**Why it works:**
- Remote MCP is accessed over **public HTTPS** (internet)
- No localhost/network restrictions
- Works from anywhere with internet access

## Comparison: What's Where?

| Component | Docker Container | Render.com | Figma Servers |
|-----------|------------------|------------|---------------|
| **RemoteMCPClient code** | ✅ Included | ✅ Included | ❌ N/A |
| **Connection logic** | ✅ Included | ✅ Included | ❌ N/A |
| **Remote MCP Service** | ❌ Not included | ❌ Not included | ✅ Hosted at `mcp.figma.com` |
| **Can connect to Remote MCP?** | ✅ Yes (HTTPS) | ✅ Yes (HTTPS) | ✅ N/A (it IS the service) |

## How to Enable Remote MCP

### In Docker

```bash
docker run -p 3847:3847 \
  -e NODE_ENV=production \
  -e FIGMA_CONNECTION_MODE=figma \
  -e FIGMA_API_KEY=your_token_here \
  designqa:latest
```

**What happens:**
1. Container starts with `RemoteMCPClient` code
2. App detects `FIGMA_CONNECTION_MODE=figma`
3. Creates `RemoteMCPClient` instance
4. Connects to `https://mcp.figma.com/mcp` over HTTPS
5. Authenticates with Bearer token
6. ✅ Remote MCP works!

### In Render.com

**Set environment variables:**
```bash
FIGMA_CONNECTION_MODE=figma
FIGMA_API_KEY=your_token_here
```

**What happens:**
1. Render deploys your app (includes `RemoteMCPClient` code)
2. App detects `FIGMA_CONNECTION_MODE=figma`
3. Creates `RemoteMCPClient` instance
4. Connects to `https://mcp.figma.com/mcp` over HTTPS
5. Authenticates with Bearer token
6. ✅ Remote MCP works!

## Network Requirements

### What You Need

- ✅ **Outbound HTTPS access** (to `mcp.figma.com`)
- ✅ **Internet connectivity** (Docker/Render both have this)
- ✅ **Valid Figma token** (`FIGMA_API_KEY`)

### What You DON'T Need

- ❌ Figma Desktop App installed
- ❌ Localhost access (`127.0.0.1:3845`)
- ❌ Special network configuration
- ❌ VPN or private network

## Testing Remote MCP

### Test in Docker

```bash
# Build and run
docker build -t designqa:latest .
docker run -p 3847:3847 \
  -e NODE_ENV=production \
  -e FIGMA_CONNECTION_MODE=figma \
  -e FIGMA_API_KEY=your_token \
  designqa:latest

# Check logs - you should see:
# 🔄 Connecting to remote Figma MCP...
# 🔑 Remote MCP session established
# ✅ Remote MCP client connected successfully
```

### Test in Render.com

1. Set environment variables:
   - `FIGMA_CONNECTION_MODE=figma`
   - `FIGMA_API_KEY=your_token`
2. Deploy
3. Check logs - same success messages as Docker

## Summary

| Question | Answer |
|----------|--------|
| **Is Remote MCP code in Docker?** | ✅ Yes - `RemoteMCPClient` is included |
| **Can Docker connect to Remote MCP?** | ✅ Yes - via HTTPS to `mcp.figma.com` |
| **Is Remote MCP code in Render?** | ✅ Yes - `RemoteMCPClient` is deployed |
| **Can Render connect to Remote MCP?** | ✅ Yes - via HTTPS to `mcp.figma.com` |
| **Does Remote MCP work in both?** | ✅ Yes - works identically in both! |

## Key Takeaway

**Remote MCP is a cloud service** that your application (running in Docker or Render) **connects to over HTTPS**. The client code is part of your application, but the service itself is hosted by Figma. This is why it works perfectly in both Docker and Render.com - they just need internet access! 🚀

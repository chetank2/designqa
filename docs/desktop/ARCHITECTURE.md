# Desktop App Architecture

## Overview

The DesignQA Desktop Apps provide a multiplatform solution that connects to Figma Desktop MCP locally while maintaining integration with the SaaS backend when online.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (Electron)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────┐                │
│  │   Renderer   │─────────▶│   Main       │                │
│  │  (React UI)  │◀─────────│   Process    │                │
│  └──────────────┘           └──────────────┘                │
│                                    │                         │
│                                    ▼                         │
│                          ┌─────────────────┐                 │
│                          │ Embedded Server │                 │
│                          │   (Express)     │                 │
│                          └─────────────────┘                 │
│                                    │                         │
│                    ┌───────────────┴───────────────┐       │
│                    │                               │         │
│                    ▼                               ▼         │
│          ┌──────────────────┐          ┌──────────────────┐ │
│          │ DesktopMCPClient │          │  Compare Engine  │ │
│          │  (WebSocket)     │          │   (Shared)       │ │
│          └──────────────────┘          └──────────────────┘ │
│                    │                                         │
│                    ▼                                         │
│          ┌──────────────────┐                                │
│          │ Figma Desktop    │                                │
│          │ MCP Server       │                                │
│          │ (ws://localhost) │                                │
│          └──────────────────┘                                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ (Optional)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    SaaS Backend                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Desktop    │  │   Remote     │  │   Proxy     │      │
│  │ Registration│  │   MCP        │  │   MCP       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Component Overview

### Desktop App Structure

```
apps/desktop-mac/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # App entry point
│   │   ├── server.ts      # Embedded Express server
│   │   └── mcp-bridge.ts  # Desktop MCP connection manager
│   └── renderer/          # React UI (reuses saas-frontend)
│       └── main.tsx
└── package.json
```

### MCP Client Package

```
packages/mcp-client/
├── src/
│   ├── MCPClient.ts           # Unified interface
│   ├── DesktopMCPClient.ts    # Local WebSocket client
│   ├── RemoteMCPClient.ts     # Remote HTTPS client
│   ├── ProxyMCPClient.ts      # Proxy REST client
│   ├── discovery/             # Platform-specific discovery
│   │   ├── macos-discovery.ts
│   │   └── windows-discovery.ts
│   └── auth/
│       └── keychain.ts        # OS keychain integration
└── __tests__/
    └── mock-mcp-server.ts     # Testing utilities
```

## MCP Client Priority

The system uses a priority-based fallback mechanism:

1. **Desktop MCP** (Priority 0) - Local WebSocket connection
2. **Proxy MCP** (Priority 1) - Proxy service
3. **Remote MCP** (Priority 2) - Direct HTTPS connection

## Connection Flow

1. Desktop app starts → Embedded Express server initializes
2. DesktopMCPClient discovers Figma Desktop MCP port
3. User logs into SaaS (optional)
4. Desktop app registers with SaaS backend
5. SaaS frontend shows "Desktop MCP" toggle when available
6. User enables toggle → Comparisons use desktop MCP

## Extending MCP Clients

To add a new MCP client implementation:

1. Implement the `IMCPClient` interface from `MCPClient.ts`
2. Add discovery logic if needed
3. Update `mcp-config.js` to include the new client
4. Add extraction method to `UnifiedFigmaExtractor`

Example:

```typescript
import { IMCPClient, MCPConnectionState } from '@designqa/mcp-client';

export class CustomMCPClient implements IMCPClient {
  public initialized = false;
  public connectionState = MCPConnectionState.DISCONNECTED;

  async connect(): Promise<boolean> {
    // Implementation
  }

  async disconnect(): Promise<void> {
    // Implementation
  }

  // ... implement other interface methods
}
```

## Debug Instructions

### Enable Debug Logging

Set environment variable:
```bash
DEBUG=mcp:*
```

### Test Desktop MCP Connection

```typescript
import { DesktopMCPClient } from '@designqa/mcp-client';
import { discoverMCPPort } from '@designqa/mcp-client/discovery';

const discovery = await discoverMCPPort();
console.log('Discovered port:', discovery.port);

const client = new DesktopMCPClient({ port: discovery.port });
await client.connect();
await client.initialize();

const tools = await client.listTools();
console.log('Available tools:', tools);
```

### Mock Server Testing

```typescript
import { MockMCPServer } from '@designqa/mcp-client/__tests__/mock-mcp-server';

const server = new MockMCPServer({ port: 3846 });
await server.start();

// Test your client against mock server
// ...

await server.stop();
```

## Platform-Specific Notes

### macOS
- Checks `/Applications/Figma.app/Contents/Info.plist` for MCP port
- Uses `lsof` to scan ports
- Stores tokens in macOS Keychain

### Windows
- Checks Windows Registry: `HKEY_CURRENT_USER\Software\Figma\Desktop\MCPPort`
- Uses `netstat` to scan ports
- Stores tokens in Windows Credential Manager (DPAPI)

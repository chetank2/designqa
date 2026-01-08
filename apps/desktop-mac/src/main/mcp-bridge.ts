/**
 * MCP Bridge
 * Manages Desktop MCP client connection and exposes it to the embedded server
 */

// NOTE: Figma Desktop MCP speaks HTTP/SSE on `/mcp`.
// The embedded backend connects directly via its HTTP MCP client.
// This bridge is kept lightweight to avoid relying on OS-level discovery tools
// (ps/lsof) that can be restricted in hardened/sandboxed app contexts.

let desktopMCPClient: unknown | null = null;
let mcpPort: number | null = null;
let mcpServerReachable: boolean = false;

/**
 * Verify MCP server is reachable at the given port
 */
async function verifyMCPServer(port: number): Promise<boolean> {
  try {
    const url = `http://127.0.0.1:${port}/mcp`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    
    // Any response (even errors) indicates the server is reachable
    return response.status >= 200 && response.status < 500;
  } catch (error) {
    // Network errors mean server is not reachable
    return false;
  }
}

/**
 * Initialize MCP bridge and verify Figma Desktop MCP is reachable
 */
export async function initializeMCPBridge(): Promise<void> {
  try {
    const portRaw = process.env.FIGMA_MCP_PORT || '3845';
    const port = parseInt(portRaw, 10);
    mcpPort = Number.isFinite(port) ? port : 3845;

    // Verify MCP server is reachable
    // Removed: console.log(`🔍 Verifying Desktop MCP server at http://127.0.0.1:${mcpPort}/mcp...`);
    mcpServerReachable = await verifyMCPServer(mcpPort);

    if (mcpServerReachable) {
      // Removed: console.log(`✅ Desktop MCP server verified at port ${mcpPort}`);
    } else {
      console.warn(`⚠️ Desktop MCP server not reachable at port ${mcpPort} - ensure Figma Desktop is running with MCP enabled`);
    }

    // Create a status object for the backend to check
    const bridgeStatus = {
      port: mcpPort,
      reachable: mcpServerReachable,
      initialized: mcpServerReachable,
      url: `http://127.0.0.1:${mcpPort}/mcp`
    };

    desktopMCPClient = bridgeStatus;
    if (typeof process !== 'undefined') {
      (process as any).__designqa_mcp_bridge_client = bridgeStatus;
    }

    // Removed: console.log(`🔌 Desktop MCP bridge ready (backend will connect) at ${bridgeStatus.url}`);
  } catch (error) {
    console.error('❌ Failed to initialize MCP bridge:', error);
    mcpServerReachable = false;
    desktopMCPClient = null;
    // Clear process reference on failure
    if (typeof process !== 'undefined') {
      (process as any).__designqa_mcp_bridge_client = null;
    }
  }
}

/**
 * Get Desktop MCP client instance
 */
export function getDesktopMCPClient(): unknown | null {
  return desktopMCPClient;
}

/**
 * Get Desktop MCP port
 */
export function getDesktopMCPPort(): number | null {
  return mcpPort;
}

/**
 * Check if Desktop MCP is available
 */
export async function isDesktopMCPAvailable(): Promise<boolean> {
  try {
    if (mcpPort && mcpServerReachable) {
      return true;
    }
    // Re-verify if we don't have a cached result
    if (mcpPort) {
      mcpServerReachable = await verifyMCPServer(mcpPort);
      return mcpServerReachable;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if Desktop MCP is connected
 */
export function isDesktopMCPConnected(): boolean {
  // Bridge does not hold a live connection; backend owns the connection.
  // But we can report if the server is reachable
  return mcpServerReachable;
}

/**
 * Get MCP connection status
 */
export function getMCPStatus(): { connected: boolean; port: number | null; initialized: boolean; reachable: boolean } {
  return {
    connected: mcpServerReachable,
    port: mcpPort,
    initialized: mcpServerReachable,
    reachable: mcpServerReachable
  };
}

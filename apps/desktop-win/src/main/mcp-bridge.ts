/**
 * MCP Bridge (Windows)
 * Manages Desktop MCP client connection and exposes it to the embedded server
 * Windows-specific implementation
 */

import { DesktopMCPClient } from '@designqa/mcp-client';
import { discoverMCPPort, isFigmaRunning } from '@designqa/mcp-client/discovery';

let desktopMCPClient: DesktopMCPClient | null = null;
let mcpPort: number | null = null;

/**
 * Initialize MCP bridge
 */
export async function initializeMCPBridge(): Promise<void> {
  try {
    console.log('🔍 Checking for Desktop MCP (Windows)...');

    const figmaRunning = await isFigmaRunning();
    if (!figmaRunning) {
      console.warn('⚠️ Figma Desktop app is not running');
      return;
    }

    const discovery = await discoverMCPPort();
    if (!discovery.port) {
      console.warn('⚠️ Desktop MCP port not found');
      return;
    }

    mcpPort = discovery.port;
    console.log(`✅ Desktop MCP found on port ${mcpPort}`);

    // Create DesktopMCPClient but don't connect yet (lazy connection)
    desktopMCPClient = new DesktopMCPClient({
      port: mcpPort!,
      autoDiscover: false
    });

    console.log('✅ MCP bridge initialized (Windows)');
  } catch (error) {
    console.error('❌ Failed to initialize MCP bridge:', error);
  }
}

/**
 * Get Desktop MCP client instance
 */
export function getDesktopMCPClient(): DesktopMCPClient | null {
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
    const running = await isFigmaRunning();
    if (!running) return false;

    const discovery = await discoverMCPPort();
    return discovery.port !== null;
  } catch {
    return false;
  }
}

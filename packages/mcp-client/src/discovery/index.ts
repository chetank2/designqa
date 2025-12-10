/**
 * Platform-agnostic MCP discovery
 */

import * as os from 'os';

let macosDiscovery: typeof import('./macos-discovery.js');
let windowsDiscovery: typeof import('./windows-discovery.js');

export interface DiscoveryResult {
  port: number | null;
  method: string;
  error?: string;
}

/**
 * Discover Figma Desktop MCP port (platform-agnostic)
 */
export async function discoverMCPPort(): Promise<DiscoveryResult> {
  const platform = os.platform();

  if (platform === 'darwin') {
    if (!macosDiscovery) {
      macosDiscovery = await import('./macos-discovery.js');
    }
    return macosDiscovery.discoverMCPPort();
  } else if (platform === 'win32') {
    if (!windowsDiscovery) {
      windowsDiscovery = await import('./windows-discovery.js');
    }
    return windowsDiscovery.discoverMCPPort();
  }

  // Linux/other platforms - try port scan
  return {
    port: null,
    method: 'not-supported',
    error: `Platform ${platform} not supported for automatic discovery`
  };
}

/**
 * Check if Figma Desktop app is running
 */
export async function isFigmaRunning(): Promise<boolean> {
  const platform = os.platform();

  if (platform === 'darwin') {
    if (!macosDiscovery) {
      macosDiscovery = await import('./macos-discovery.js');
    }
    return macosDiscovery.isFigmaRunning();
  } else if (platform === 'win32') {
    if (!windowsDiscovery) {
      windowsDiscovery = await import('./windows-discovery.js');
    }
    return windowsDiscovery.isFigmaRunning();
  }

  return false;
}

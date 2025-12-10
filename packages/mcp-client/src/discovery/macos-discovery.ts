/**
 * macOS-specific MCP discovery
 * Discovers Figma Desktop MCP server port
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const DEFAULT_PORTS = [3845, 8080, 3000, 9000];
const FIGMA_APP_PATH = '/Applications/Figma.app';
const PLIST_PATH = `${FIGMA_APP_PATH}/Contents/Info.plist`;

export interface DiscoveryResult {
  port: number | null;
  method: 'plist' | 'port-scan' | 'not-found';
  error?: string;
}

/**
 * Read port from Figma app plist file
 */
function readPortFromPlist(): number | null {
  try {
    if (!existsSync(PLIST_PATH)) {
      return null;
    }

    const plistContent = readFileSync(PLIST_PATH, 'utf-8');
    
    // Look for MCP port in plist (common patterns)
    const mcpPortMatch = plistContent.match(/MCPPort["\s]*[:=]["\s]*(\d+)/i);
    if (mcpPortMatch) {
      return parseInt(mcpPortMatch[1], 10);
    }

    // Alternative: check for URL patterns
    const urlMatch = plistContent.match(/127\.0\.0\.1:(\d+)/);
    if (urlMatch) {
      return parseInt(urlMatch[1], 10);
    }

    return null;
  } catch (error) {
    console.warn('Failed to read plist:', error);
    return null;
  }
}

/**
 * Check if a port is listening
 */
function checkPort(port: number): boolean {
  try {
    // Use lsof to check if port is in use
    execSync(`lsof -i :${port}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan common ports for MCP server
 */
function scanPorts(): number | null {
  for (const port of DEFAULT_PORTS) {
    if (checkPort(port)) {
      // Try to verify it's actually an MCP server by checking if it responds
      // For now, just return the first listening port
      return port;
    }
  }
  return null;
}

/**
 * Discover Figma Desktop MCP port on macOS
 */
export async function discoverMCPPort(): Promise<DiscoveryResult> {
  // Method 1: Try reading from plist
  const plistPort = readPortFromPlist();
  if (plistPort) {
    return {
      port: plistPort,
      method: 'plist'
    };
  }

  // Method 2: Scan common ports
  const scannedPort = scanPorts();
  if (scannedPort) {
    return {
      port: scannedPort,
      method: 'port-scan'
    };
  }

  return {
    port: null,
    method: 'not-found',
    error: 'Figma Desktop MCP port not found'
  };
}

/**
 * Check if Figma Desktop app is running
 */
export function isFigmaRunning(): boolean {
  try {
    execSync('pgrep -x Figma', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

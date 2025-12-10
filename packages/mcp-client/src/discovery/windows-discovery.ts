/**
 * Windows-specific MCP discovery
 * Discovers Figma Desktop MCP server port
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const DEFAULT_PORTS = [3845, 8080, 3000, 9000];
const REGISTRY_PATH = 'HKEY_CURRENT_USER\\Software\\Figma\\Desktop';

export interface DiscoveryResult {
  port: number | null;
  method: 'registry' | 'port-scan' | 'not-found';
  error?: string;
}

/**
 * Read port from Windows registry
 */
function readPortFromRegistry(): number | null {
  try {
    const result = execSync(
      `reg query "${REGISTRY_PATH}" /v MCPPort`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    
    const match = result.match(/MCPPort\s+REG_SZ\s+(\d+)/i);
    if (match) {
      return parseInt(match[1], 10);
    }

    return null;
  } catch (error) {
    // Registry key doesn't exist or access denied
    return null;
  }
}

/**
 * Check if a port is listening (Windows)
 */
function checkPort(port: number): boolean {
  try {
    // Use netstat to check if port is listening
    const result = execSync(`netstat -an | findstr ":${port}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    return result.includes('LISTENING');
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
      return port;
    }
  }
  return null;
}

/**
 * Discover Figma Desktop MCP port on Windows
 */
export async function discoverMCPPort(): Promise<DiscoveryResult> {
  // Method 1: Try reading from registry
  const registryPort = readPortFromRegistry();
  if (registryPort) {
    return {
      port: registryPort,
      method: 'registry'
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
 * Check if Figma Desktop app is running (Windows)
 */
export function isFigmaRunning(): boolean {
  try {
    execSync('tasklist /FI "IMAGENAME eq Figma.exe"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return true;
  } catch {
    return false;
  }
}

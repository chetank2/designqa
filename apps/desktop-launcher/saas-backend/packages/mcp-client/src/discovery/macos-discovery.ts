/**
 * macOS-specific MCP discovery
 * Discovers Figma Desktop MCP server port
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import WebSocket from 'ws';
import http from 'http';

const DEFAULT_PORTS = [3845, 3846, 3847, 5500, 8080, 3000, 9000];
const FIGMA_APP_PATH = '/Applications/Figma.app';
const PLIST_PATH = `${FIGMA_APP_PATH}/Contents/Info.plist`;

export interface DiscoveryResult {
  port: number | null;
  method: 'plist' | 'port-scan' | 'env' | 'default' | 'not-found';
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
 * Try WebSocket handshake against the candidate port
 */
async function verifyWebSocketServer(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 2000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      });
      
      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Try HTTP/SSE style probe (Figma exposes MCP over HTTP)
 */
async function verifyHttpServer(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'GET',
        path: '/mcp',
        timeout: 2000
      },
      (res) => {
        // Any response indicates the port is serving HTTP
        res.resume();
        resolve(true);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.end();
  });
}

/**
 * Verify if a port is actually running an MCP server by attempting WebSocket connection
 * and falling back to HTTP probing.
 */
async function verifyMCPServer(port: number): Promise<boolean> {
  if (await verifyWebSocketServer(port)) {
    return true;
  }

  return verifyHttpServer(port);
}

/**
 * Scan common ports for MCP server with verification
 */
async function scanPorts(): Promise<number | null> {
  const candidatePorts = new Set<number>();

  // Allow manual override from environment
  if (process.env.FIGMA_MCP_PORT) {
    const envPorts = process.env.FIGMA_MCP_PORT.split(',')
      .map((value) => parseInt(value.trim(), 10))
      .filter((value) => !Number.isNaN(value));
    envPorts.forEach((port) => candidatePorts.add(port));
  }

  // Try to detect ports from running Figma processes via lsof
  try {
    const lsofOutput = execSync('lsof -nP -iTCP -sTCP:LISTEN', { encoding: 'utf-8' });
    const figmaLines = lsofOutput
      .split('\n')
      .filter((line) => /figma/i.test(line));

    for (const line of figmaLines) {
      const match = line.match(/:(\d+)\s+\(LISTEN\)/);
      if (match) {
        candidatePorts.add(parseInt(match[1], 10));
      }
    }
  } catch (error) {
    console.warn('⚠️ Failed to scan ports via lsof:', error instanceof Error ? error.message : error);
  }

  // Add defaults last so they are lowest priority
  DEFAULT_PORTS.forEach((port) => candidatePorts.add(port));

  for (const port of candidatePorts) {
    if (checkPort(port)) {
      const isValid = await verifyMCPServer(port);
      if (isValid) {
        return port;
      }
    }
  }
  return null;
}

/**
 * Discover Figma Desktop MCP port on macOS
 */
export async function discoverMCPPort(): Promise<DiscoveryResult> {
  // Always prioritize FIGMA_MCP_PORT or default 3845 before any other detection.
  const forcedPorts = process.env.FIGMA_MCP_PORT
    ? process.env.FIGMA_MCP_PORT.split(',')
        .map((value) => parseInt(value.trim(), 10))
        .filter((value) => !Number.isNaN(value))
    : [3845];

  for (const port of forcedPorts) {
    if (await verifyMCPServer(port)) {
      return {
        port,
        method: process.env.FIGMA_MCP_PORT ? 'env' : 'default'
      };
    }
  }

  // Method 1: Try reading from plist and verify
  const plistPort = readPortFromPlist();
  if (plistPort) {
    const isValid = await verifyMCPServer(plistPort);
    if (isValid) {
      return {
        port: plistPort,
        method: 'plist'
      };
    }
  }

  // Method 2: Scan common ports with verification
  const scannedPort = await scanPorts();
  if (scannedPort) {
    return {
      port: scannedPort,
      method: 'port-scan'
    };
  }

  return {
    port: null,
    method: 'not-found',
    error: 'Figma Desktop MCP port not found. Please ensure Figma is running with Dev Mode enabled.'
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

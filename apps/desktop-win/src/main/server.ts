/**
 * Embedded Express Server (Windows)
 * Reuses saas-backend server with local configuration
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { app } from 'electron';

// Dynamic import for dotenv to handle missing package gracefully
let dotenv: typeof import('dotenv') | null = null;
async function loadDotenvModule() {
  if (!dotenv) {
    try {
      dotenv = await import('dotenv');
    } catch (error) {
      console.warn('⚠️ dotenv package not found, environment variables will use defaults');
      // Create a minimal dotenv-like object
      dotenv = {
        config: () => ({ parsed: {} })
      } as any;
    }
  }
  return dotenv;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve backend server path for both development and production
 */
function getBackendServerPath(): string {
  // In development: relative to source
  if (process.env.NODE_ENV === 'development' || __dirname.includes('src')) {
    return '../../../saas-backend/src/core/server/index.js';
  }
  
  // In production: backend files are copied to saas-backend/ in the app bundle
  // They should be unpacked from ASAR, so try unpacked location first
  const resourcesPath = process.resourcesPath || __dirname;
  
  // Try unpacked location first (if backend is unpacked from ASAR)
  const unpackedPath = join(resourcesPath, 'app.asar.unpacked', 'saas-backend/src/core/server/index.js');
  if (existsSync(unpackedPath)) {
    // Use file:// URL for absolute paths in dynamic import
    return `file://${unpackedPath}`;
  }
  
  // Try relative path from dist/main (in app.asar)
  // dist/main/server.js -> saas-backend/src/core/server/index.js
  const relativePath = '../../../saas-backend/src/core/server/index.js';
  
  // Fallback to relative path
  return relativePath;
}

/**
 * Load environment variables for desktop app
 */
async function loadDesktopEnv() {
  // Try to load dotenv - it should be available in node_modules
  try {
    const dotenvModule = await loadDotenvModule();
    if (!dotenvModule) {
      console.warn('⚠️ dotenv module not available');
      return;
    }
    const envPaths = [
      join(__dirname, '../../../.env'),
      join(__dirname, '../../../../.env')
    ];

    for (const envPath of envPaths) {
      if (existsSync(envPath)) {
        dotenvModule.config({ path: envPath });
        console.log(`📄 Loaded environment from: ${envPath}`);
        break;
      }
    }
  } catch (error) {
    console.warn('⚠️ Could not load dotenv:', error);
    // Continue without dotenv - environment variables can be set via process.env
  }

  // Set desktop-specific defaults
  process.env.DEPLOYMENT_MODE = 'desktop';
  process.env.RUNNING_IN_ELECTRON = 'true';
  process.env.DATABASE_URL = process.env.DATABASE_URL || join(__dirname, '../../../data/app.db');

  // Provide a stable writable base directory to the embedded backend (for puppeteer profiles, screenshots, etc.).
  if (!process.env.DESIGNQA_USER_DATA_DIR) {
    process.env.DESIGNQA_USER_DATA_DIR = app.getPath('userData');
  }
  if (!process.env.PERSIST_BROWSER_SESSIONS) {
    process.env.PERSIST_BROWSER_SESSIONS = 'true';
  }
  
  // Disable Supabase for desktop mode unless explicitly configured
  if (!process.env.SUPABASE_URL) {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
  }
}

// Track server instance for graceful shutdown
let serverInstance: any = null;

/**
 * Start embedded server
 * @returns {Promise<{ port: number; server: any }>} Port number and server instance
 */
export async function startEmbeddedServer(): Promise<{ port: number; server: any }> {
  // If server is already running, return existing instance
  if (serverInstance) {
    return { port: 3847, server: serverInstance };
  }

  await loadDesktopEnv();

  // Use port from env or default
  const port = parseInt(process.env.PORT || '3847', 10);

  try {
    // Dynamically import backend server
    let backendPath = getBackendServerPath();
    console.log(`📦 Loading backend server from: ${backendPath}`);
    
    // In production, resolve absolute path for unpacked files
    if (process.resourcesPath && backendPath.startsWith('file://')) {
      // Already a file:// URL, use as-is
      const backendModule = await import(backendPath);
      const startServer = backendModule.startServer;
      
      if (!startServer) {
        throw new Error(`startServer function not found. Available exports: ${Object.keys(backendModule).join(', ')}`);
      }
      
      const server = await startServer(port);
      serverInstance = server;
      console.log(`✅ Embedded server running on http://localhost:${port}`);
      return { port, server };
    }
    
    // For relative paths, use normal import
    const backendModule = await import(backendPath);
    const startServer = backendModule.startServer;
    
    if (!startServer) {
      throw new Error(`startServer function not found in ${backendPath}. Available exports: ${Object.keys(backendModule).join(', ')}`);
    }
    
    const server = await startServer(port);
    serverInstance = server;
    console.log(`✅ Embedded server running on http://localhost:${port}`);
    return { port, server };
  } catch (error) {
    console.error('❌ Failed to start embedded server:', error);
    console.error('Backend path attempted:', getBackendServerPath());
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
    }
    throw error;
  }
}

/**
 * Stop embedded server
 * @returns {Promise<void>}
 */
export async function stopEmbeddedServer(): Promise<void> {
  if (!serverInstance) {
    console.log('⚠️ No server instance to stop');
    return;
  }

  const server = serverInstance;
  return new Promise((resolve, reject) => {
    try {
      if (!server.listening) {
        console.log('⚠️ Server is not listening');
        serverInstance = null;
        resolve();
        return;
      }

      console.log('🛑 Stopping embedded server...');
      server.close((err: any) => {
        if (err) {
          console.error('❌ Error stopping server:', err);
          reject(err);
          return;
        }
        console.log('✅ Embedded server stopped');
        serverInstance = null;
        resolve();
      });

      // Force close after 5 seconds
      setTimeout(() => {
        if (serverInstance === server) {
          console.log('⚠️ Force closing server after timeout');
          serverInstance = null;
          resolve();
        }
      }, 5000);
    } catch (error) {
      console.error('❌ Error in stopEmbeddedServer:', error);
      serverInstance = null;
      reject(error);
    }
  });
}

/**
 * Get server status
 * @returns {{ running: boolean; port: number | null }}
 */
export function getServerStatus(): { running: boolean; port: number | null } {
  if (!serverInstance || !serverInstance.listening) {
    return { running: false, port: null };
  }

  const address = serverInstance.address();
  const port = typeof address === 'object' && address ? address.port : null;
  return { running: true, port };
}

/**
 * Check if cloud backend is reachable
 * @param {string} url - Backend URL to check
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if backend is reachable
 */
export async function checkCloudBackend(url: string, timeout: number): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    // Try to fetch with timeout
    const response = await fetch(url, { 
      signal: controller.signal,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    clearTimeout(timeoutId);
    // Network error, timeout, or abort
    return false;
  }
}

/**
 * Embedded Express Server
 * Reuses saas-backend server with local configuration
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { Server } from 'http';

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

// Track server instance for graceful shutdown
let serverInstance: Server | null = null;

/**
 * Resolve backend server path for both development and production
 */
function getBackendServerPath(): { path: string; isAbsolute: boolean; packageJsonPath?: string } {
  // In development: relative to source
  if (process.env.NODE_ENV === 'development' || __dirname.includes('src')) {
    return {
      path: '../../../saas-backend/src/core/server/index.js',
      isAbsolute: false,
      packageJsonPath: '../../../saas-backend/package.json'
    };
  }
  
  // In production: backend files are copied to saas-backend/ in the app bundle
  // They should be unpacked from ASAR
  const resourcesPath = process.resourcesPath || __dirname;

  const candidates = [
    {
      label: 'app.asar.unpacked',
      root: join(resourcesPath, 'app.asar.unpacked', 'saas-backend')
    },
    {
      label: 'resources/saas-backend',
      root: join(resourcesPath, 'saas-backend')
    },
    {
      label: 'app.asar',
      root: join(resourcesPath, 'app.asar', 'saas-backend')
    }
  ];

  const serverSuffix = join('src', 'core', 'server', 'index.js');

  const resolveCandidate = (root: string) => {
    const serverPath = join(root, serverSuffix);
    const packageJson = join(root, 'package.json');
    const nodeModules = join(root, 'node_modules');
    return { serverPath, packageJson, nodeModules };
  };

  // Prefer an entrypoint that sits next to its node_modules (ESM package resolution needs this).
  for (const candidate of candidates) {
    const { serverPath, packageJson, nodeModules } = resolveCandidate(candidate.root);
    if (!existsSync(serverPath)) continue;
    if (existsSync(nodeModules) && existsSync(packageJson)) {
      console.log(`✅ Found backend at (${candidate.label}):`, serverPath);
      console.log(`✅ Found backend package.json at (${candidate.label}):`, packageJson);
      console.log(`✅ Found backend node_modules at (${candidate.label}):`, nodeModules);
      return { path: serverPath, isAbsolute: true, packageJsonPath: packageJson };
    }
  }

  // Next best: has package.json (ESM), even if node_modules is missing (will fail with a clearer error later).
  for (const candidate of candidates) {
    const { serverPath, packageJson } = resolveCandidate(candidate.root);
    if (!existsSync(serverPath)) continue;
    if (existsSync(packageJson)) {
      console.log(`✅ Found backend at (${candidate.label}):`, serverPath);
      console.log(`✅ Found backend package.json at (${candidate.label}):`, packageJson);
      return { path: serverPath, isAbsolute: true, packageJsonPath: packageJson };
    }
  }

  // Last resort: server file exists but no package.json (likely to trigger ESM import errors).
  for (const candidate of candidates) {
    const { serverPath, packageJson } = resolveCandidate(candidate.root);
    if (!existsSync(serverPath)) continue;
    console.warn(`⚠️ Found backend at (${candidate.label}) but package.json is missing:`, packageJson);
    return { path: serverPath, isAbsolute: true, packageJsonPath: packageJson };
  }
  
  // Fallback to relative path from dist/main
  console.warn('⚠️ Backend not found in expected locations, using relative path');
  return {
    path: '../../../saas-backend/src/core/server/index.js',
    isAbsolute: false,
    packageJsonPath: '../../../saas-backend/package.json'
  };
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
    
    // Try multiple locations for .env file
    const { app } = await import('electron');
    const userDataPath = app.getPath('userData');
    const homePath = app.getPath('home');

    // Provide a stable writable base directory to the embedded backend (for puppeteer profiles, screenshots, etc.).
    if (!process.env.DESIGNQA_USER_DATA_DIR) {
      process.env.DESIGNQA_USER_DATA_DIR = userDataPath;
    }
    if (!process.env.PERSIST_BROWSER_SESSIONS) {
      process.env.PERSIST_BROWSER_SESSIONS = 'true';
    }
    
    const envPaths = [
      join(userDataPath, '.env'),           // ~/Library/Application Support/DesignQA/.env
      join(homePath, '.designqa.env'),      // ~/.designqa.env
      join(__dirname, '../../../.env'),     // Development location
      join(__dirname, '../../../../.env')   // Alternative development location
    ];

    let loaded = false;
    for (const envPath of envPaths) {
      if (existsSync(envPath)) {
        dotenvModule.config({ path: envPath });
        console.log(`📄 Loaded environment from: ${envPath}`);
        loaded = true;
        break;
      }
    }
    
    if (!loaded) {
      console.log('ℹ️ No .env file found. Using system environment variables or defaults.');
      console.log(`💡 To set custom env vars, create: ${join(homePath, '.designqa.env')}`);
    }
  } catch (error) {
    console.warn('⚠️ Could not load dotenv:', error);
    // Continue without dotenv - environment variables can be set via process.env
  }

  // Set desktop-specific defaults
  console.log('🖥️ Setting DEPLOYMENT_MODE=desktop');
  process.env.DEPLOYMENT_MODE = 'desktop';

  // Mark that we are running inside Electron so backend enables desktop-specific code paths
  console.log('🖥️ Setting RUNNING_IN_ELECTRON=true');
  process.env.RUNNING_IN_ELECTRON = 'true';

  // Force the embedded backend to always bind to the desktop port.
  process.env.PORT = '3847';
  
  // Also set FIGMA_CONNECTION_MODE to desktop to ensure MCP config uses desktop path
  console.log('🖥️ Setting FIGMA_CONNECTION_MODE=desktop');
  process.env.FIGMA_CONNECTION_MODE = 'desktop';

  // Desktop MCP defaults (Figma Desktop uses 3845)
  if (!process.env.FIGMA_MCP_PORT) {
    process.env.FIGMA_MCP_PORT = '3845';
  }
  if (!process.env.FIGMA_DESKTOP_MCP_URL) {
    process.env.FIGMA_DESKTOP_MCP_URL = `http://127.0.0.1:${process.env.FIGMA_MCP_PORT}/mcp`;
  }

  // Enable MCP by default in desktop/local mode
  if (!process.env.MCP_ENABLED) {
    process.env.MCP_ENABLED = 'true';
  }
  if (!process.env.ENABLE_LOCAL_MCP) {
    process.env.ENABLE_LOCAL_MCP = 'true';
  }
  
  process.env.DATABASE_URL = process.env.DATABASE_URL || join(__dirname, '../../../data/app.db');
  console.log('💾 Database path:', process.env.DATABASE_URL);
  
  // Disable Supabase for desktop mode unless explicitly configured
  if (!process.env.SUPABASE_URL) {
    console.log('☁️ Supabase disabled for desktop mode');
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
  } else {
    console.log('☁️ Supabase explicitly configured, keeping enabled');
  }
}

/**
 * Start embedded server
 * @returns {Promise<{ port: number; server: Server }>} Port number and server instance
 */
export async function startEmbeddedServer(): Promise<{ port: number; server: Server }> {
  // If server is already running, return existing instance
  if (serverInstance && serverInstance.listening) {
    const address = serverInstance.address();
    const port = typeof address === 'object' && address ? address.port : 3847;
    return { port, server: serverInstance };
  }

  await loadDesktopEnv();
  
  // For ES modules, Node.js resolves node_modules relative to the importing file
  // We need to ensure backend node_modules are accessible
  // Check if backend node_modules exist and log for debugging
  const resourcesPath = process.resourcesPath || __dirname;
  const backendBasePath = join(resourcesPath, 'app.asar.unpacked', 'saas-backend');
  const backendNodeModules = join(backendBasePath, 'node_modules');
  const backendPackageJson = join(backendBasePath, 'package.json');
  
  // Set process.cwd() to backend directory so backend can find frontend/dist
  // This is critical for frontend file serving in Electron
  const originalCwd = process.cwd();
  if (existsSync(backendBasePath)) {
    process.chdir(backendBasePath);
    console.log(`📁 Changed working directory to backend: ${backendBasePath}`);
    console.log(`📁 process.cwd() is now: ${process.cwd()}`);
  } else {
    console.warn(`⚠️ Backend base path not found: ${backendBasePath}`);
  }
  
  console.log('📦 Checking backend dependencies...');
  console.log('📦 Backend node_modules path:', backendNodeModules);
  console.log('📦 Backend node_modules exists:', existsSync(backendNodeModules));
  
  if (existsSync(backendPackageJson)) {
    try {
      const pkg = JSON.parse(readFileSync(backendPackageJson, 'utf-8'));
      const deps = Object.keys(pkg.dependencies || {}).slice(0, 5);
      console.log('📦 Backend dependencies (sample):', deps.join(', '));
      if (pkg.type !== 'module') {
        throw new Error(
          `Backend package.json at ${backendPackageJson} must include "type": "module" for ES module imports.`
        );
      }
    } catch (err) {
      // Treat invalid/missing ESM config as fatal; otherwise the dynamic import will fail with a confusing message.
      throw new Error(
        `Backend module import failed. Ensure ${backendPackageJson} exists and has "type": "module".`
      );
    }
  } else {
    throw new Error(
      `Backend module import failed. Ensure ${backendPackageJson} exists and has "type": "module".`
    );
  }
  
  if (!existsSync(backendNodeModules)) {
    console.error('❌ Backend node_modules not found at:', backendNodeModules);
    console.error('❌ This will cause module resolution failures');
    console.error('❌ Make sure backend dependencies are installed and unpacked from ASAR');
    throw new Error(
      `Backend dependencies missing at ${backendNodeModules}. ` +
      `Rebuild the desktop app after running the backend dependency install step.`
    );
  } else {
    // Check if express exists
    const expressPath = join(backendNodeModules, 'express');
    console.log('📦 Express module exists:', existsSync(expressPath));
    if (!existsSync(expressPath)) {
      console.error('❌ Express not found in backend node_modules');
      console.error('❌ Backend dependencies may not be installed correctly');
      throw new Error(
        `Backend dependency 'express' is missing at ${expressPath}. ` +
        `Rebuild the desktop app to ensure saas-backend/node_modules is packaged.`
      );
    }
  }

  // Use port from env or default
  const port = parseInt(process.env.PORT || '3847', 10);

  try {
    // Dynamically import backend server
    const backendInfo = getBackendServerPath();
    console.log(`📦 Loading backend server from: ${backendInfo.path}`);
    console.log(`📦 Path type: ${backendInfo.isAbsolute ? 'absolute' : 'relative'}`);
    
    // Verify package.json exists for ES module support
    if (backendInfo.packageJsonPath) {
      const packageJsonExists = backendInfo.isAbsolute 
        ? existsSync(backendInfo.packageJsonPath)
        : existsSync(join(__dirname, backendInfo.packageJsonPath));
      
      if (!packageJsonExists) {
        console.warn(`⚠️ Backend package.json not found at: ${backendInfo.packageJsonPath}`);
        console.warn('⚠️ This may cause ES module import to fail');
      } else {
        // Verify it has "type": "module"
        try {
          const packageJsonPath = backendInfo.isAbsolute 
            ? backendInfo.packageJsonPath!
            : join(__dirname, backendInfo.packageJsonPath!);
          const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
          const packageJson = JSON.parse(packageJsonContent);
          if (packageJson.type !== 'module') {
            console.warn(`⚠️ Backend package.json does not have "type": "module"`);
          } else {
            console.log('✅ Backend package.json has "type": "module"');
          }
        } catch (err) {
          console.warn('⚠️ Could not verify package.json:', err);
        }
      }
    }
    
    // For ES modules, Node.js needs to find package.json with "type": "module"
    // When using file:// URLs, Node.js looks for package.json in parent directories
    let importPath: string;
    if (backendInfo.isAbsolute) {
      // Use Node.js pathToFileURL for proper file:// URL construction
      // Node.js will automatically look for package.json in parent directories
      importPath = pathToFileURL(backendInfo.path).href;
    } else {
      // Relative paths work as-is with dynamic import
      importPath = backendInfo.path;
    }
    
    console.log(`📦 Import URL: ${importPath}`);
    
    let backendModule;
    try {
      backendModule = await import(importPath);
    } catch (importError: any) {
      // Handle import errors specifically
      const importErrorMessage = importError instanceof Error ? importError.message : String(importError);
      console.error('❌ Failed to import backend module:', importErrorMessage);
      console.error('Backend path:', backendInfo.path);
      console.error('Import path:', importPath);

      // Best-effort diagnostics about ESM config
      let packageJsonPathResolved: string | null = null;
      let packageJsonExists = false;
      let packageJsonType: string | null = null;
      if (backendInfo.packageJsonPath) {
        packageJsonPathResolved = backendInfo.isAbsolute
          ? backendInfo.packageJsonPath
          : join(__dirname, backendInfo.packageJsonPath);
        packageJsonExists = existsSync(packageJsonPathResolved);
        if (packageJsonExists) {
          try {
            const packageJsonContent = readFileSync(packageJsonPathResolved, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            packageJsonType = typeof packageJson.type === 'string' ? packageJson.type : null;
          } catch {
            packageJsonType = null;
          }
        }
        console.error('Package.json path:', packageJsonPathResolved);
        console.error('Package.json exists:', packageJsonExists);
        console.error('Package.json type:', packageJsonType);
      }
      
      // Check if file exists
      if (backendInfo.isAbsolute && !existsSync(backendInfo.path)) {
        throw new Error(`Backend server file not found at: ${backendInfo.path}. Make sure backend files are copied correctly.`);
      }
      
      // Check for module type errors - provide helpful guidance
      if (importErrorMessage.includes('Cannot use import statement') || 
          importErrorMessage.includes('Unexpected token') ||
          importErrorMessage.includes('module')) {
        const helpfulMsg = backendInfo.packageJsonPath
          ? (
              packageJsonExists && packageJsonType === 'module'
                ? `Backend module import failed even though ${packageJsonPathResolved} has "type": "module". ` +
                  `This usually means the backend entrypoint and its package.json are not being resolved as a single ESM package at runtime ` +
                  `(common cause: importing from app.asar while package.json/node_modules live in app.asar.unpacked). ` +
                  `Error: ${importErrorMessage}`
                : `Backend module import failed. Ensure ${packageJsonPathResolved || backendInfo.packageJsonPath} exists and has "type": "module". ` +
                  `Detected type: ${packageJsonType ?? 'missing/unknown'}. Error: ${importErrorMessage}`
            )
          : `Backend module import failed. The backend file may not be properly configured as an ES module. Error: ${importErrorMessage}`;
        throw new Error(helpfulMsg);
      }
      
      throw new Error(`Failed to load backend server: ${importErrorMessage}`);
    }
    
    console.log('📦 Backend module loaded successfully');
    const startServerFn = backendModule.startServer || backendModule.default?.startServer;
    
    if (!startServerFn) {
      const availableExports = Object.keys(backendModule).join(', ');
      console.error('❌ startServer function not found in backend module');
      console.error('Available exports:', availableExports);
      throw new Error(`startServer function not found. Available exports: ${availableExports}`);
    }
    
    console.log('🚀 Calling startServer function...');
    const server = await startServerFn(port);
    
    if (!server) {
      console.error('❌ startServer returned null or undefined');
      throw new Error('startServer function did not return a server instance');
    }
    
    console.log('🔍 Checking if server is listening...');
    const address = server.address();
    if (!address) {
      console.error('❌ Server instance created but not listening');
      throw new Error('Server created but server.address() returned null - server may not be listening');
    }
    
    const actualPort = typeof address === 'object' ? address.port : port;
    console.log(`✅ Server is listening on port ${actualPort}`);
    console.log(`✅ Server address:`, address);
    
    serverInstance = server;
    console.log(`✅ Embedded server running on http://localhost:${actualPort}`);
    
    // Verify server responds to health check
    console.log('🏥 Verifying health endpoint...');
    try {
      const healthResponse = await fetch(`http://localhost:${actualPort}/api/health`, {
        signal: AbortSignal.timeout(5000)
      });
      if (healthResponse.ok) {
        console.log('✅ Health check passed - server is fully operational');
      } else {
        console.warn(`⚠️ Health check returned status ${healthResponse.status}`);
      }
    } catch (healthError) {
      console.warn('⚠️ Health check failed:', healthError instanceof Error ? healthError.message : String(healthError));
      console.warn('Server may still be starting up...');
    }
    
    return { port: actualPort, server };
  } catch (error) {
    console.error('═'.repeat(80));
    console.error('❌ FATAL: Failed to start embedded server');
    console.error('═'.repeat(80));
    console.error('Error:', error);
    console.error('Backend path info:', getBackendServerPath());
    console.error('Resources path:', process.resourcesPath);
    console.error('Current __dirname:', __dirname);
    console.error('PORT:', port);
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error name:', error.name);
      // Log full stack trace to help debug
      if (error.stack) {
        console.error('Full stack trace:');
        console.error(error.stack);
      }
    }
    
    // Check common failure points
    const backendInfo = getBackendServerPath();
    if (backendInfo.isAbsolute) {
      console.error('File exists check:', existsSync(backendInfo.path));
      if (backendInfo.packageJsonPath) {
        console.error('Package.json exists:', existsSync(backendInfo.packageJsonPath));
      }
    }
    
    console.error('═'.repeat(80));
    
    // Re-throw with detailed message (keep original for debugging)
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Server startup failed: ${errorMessage}`);
  }
}

/**
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
      server.close((err) => {
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

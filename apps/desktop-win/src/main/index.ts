/**
 * Electron Main Process
 * Entry point for DesignQA Desktop App (Windows)
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { startEmbeddedServer, stopEmbeddedServer, getServerStatus, checkCloudBackend } from './server.js';
import { initializeMCPBridge } from './mcp-bridge.js';
import { saveFigmaApiKey, getFigmaApiKey, deleteFigmaApiKey, hasApiKey } from './api-key-storage.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let serverPort: number = 3847;
let isServerRunning = false;
const UPDATE_CHECK_TIMEOUT_MS = 6000;

/**
 * Get saved mode preference from file storage
 */
function getSavedMode(): 'cloud' | 'local' {
  const configPath = path.join(app.getPath('userData'), 'app-mode.json');
  try {
    if (existsSync(configPath)) {
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.mode === 'local' ? 'local' : 'cloud';
    }
  } catch (error) {
    console.warn('Could not read saved mode preference:', error);
  }
  return 'cloud'; // Default to cloud mode
}

/**
 * Save mode preference
 */
function saveMode(mode: 'cloud' | 'local'): void {
  const configPath = path.join(app.getPath('userData'), 'app-mode.json');
  try {
    const fs = require('fs');
    fs.writeFileSync(configPath, JSON.stringify({ mode }), 'utf-8');
  } catch (error) {
    console.warn('Could not save mode preference:', error);
  }
}

/**
 * Get cloud app URL
 */
const DEFAULT_CLOUD_APP_URL = 'https://designqa.onrender.com';

function getCloudAppUrl(): string {
  const configuredUrl = process.env.CLOUD_APP_URL || process.env.VITE_API_URL;
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      console.warn('Invalid CLOUD_APP_URL/VITE_API_URL provided, falling back to default');
    }
  }
  return DEFAULT_CLOUD_APP_URL;
}

async function showDialog(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  if (mainWindow) {
    return dialog.showMessageBox(mainWindow, options);
  }
  return dialog.showMessageBox(options);
}

function getUpdateRepo(): string | null {
  const repo = process.env.DESIGNQA_GITHUB_REPO || process.env.GITHUB_REPO;
  if (!repo) {
    return null;
  }
  const trimmed = repo.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeVersion(raw: string): string {
  return raw.replace(/^v/i, '').split('-')[0].trim();
}

function compareVersions(a: string, b: string): number {
  const aParts = normalizeVersion(a).split('.').map(part => parseInt(part, 10) || 0);
  const bParts = normalizeVersion(b).split('.').map(part => parseInt(part, 10) || 0);
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i += 1) {
    const left = aParts[i] ?? 0;
    const right = bParts[i] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }

  return 0;
}

async function checkForUpdates(): Promise<void> {
  const repo = getUpdateRepo();
  if (!repo) {
    console.log('ℹ️ Update check skipped (DESIGNQA_GITHUB_REPO not set).');
    return;
  }

  const currentVersion = normalizeVersion(app.getVersion());
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github+json'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`⚠️ Update check failed with status ${response.status}`);
      return;
    }

    const data = await response.json();
    const latestTag = typeof data?.tag_name === 'string' ? data.tag_name : data?.name;
    if (!latestTag) {
      console.warn('⚠️ Update check did not return a release tag.');
      return;
    }

    const latestVersion = normalizeVersion(latestTag);
    if (compareVersions(latestVersion, currentVersion) <= 0) {
      console.log(`✅ App is up to date (v${currentVersion}).`);
      return;
    }

    const releaseUrl = data?.html_url || `https://github.com/${repo}/releases/latest`;
    const dialogResult = await showDialog({
      type: 'info',
      buttons: ['Download Update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Available',
      message: `Version ${latestVersion} is available.`,
      detail: `You are currently on version ${currentVersion}. Download the update from GitHub Releases.`
    });

    if (dialogResult.response === 0 && releaseUrl) {
      await shell.openExternal(releaseUrl);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Update check failed: ${message}`);
  }
}

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    backgroundColor: '#ffffff'
  });

  // Load URL based on mode and environment
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    // In dev, always use Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
    return;
  }

  // In production, load the LOCAL renderer build (dist/renderer/index.html)
  const rendererPath = path.join(__dirname, '../renderer/index.html');
  
  if (existsSync(rendererPath)) {
    console.log('📦 Loading local renderer from:', rendererPath);
    mainWindow.loadFile(rendererPath);
  } else {
    // Fallback to cloud URL if local renderer not found
    console.warn('⚠️ Local renderer not found, falling back to cloud URL');
    const cloudUrl = getCloudAppUrl();
    console.log('☁️ Loading from cloud:', cloudUrl);
    mainWindow.loadURL(cloudUrl);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Setup IPC handlers for mode switching
 */
function setupIpcHandlers() {
  // Start local server
  ipcMain.handle('mode:start-local-server', async () => {
    try {
      if (isServerRunning) {
        const status = getServerStatus();
        return { success: true, port: status.port, alreadyRunning: true };
      }

      const result = await startEmbeddedServer();
      serverPort = result.port;
      isServerRunning = true;
      
      // Initialize MCP bridge when server starts
      await initializeMCPBridge();
      
      return { success: true, port: result.port };
    } catch (error: any) {
      console.error('Failed to start local server:', error);
      return { success: false, error: error.message || 'Failed to start server' };
    }
  });

  // Stop local server
  ipcMain.handle('mode:stop-local-server', async () => {
    try {
      if (!isServerRunning) {
        return { success: true, alreadyStopped: true };
      }

      await stopEmbeddedServer();
      isServerRunning = false;
      return { success: true };
    } catch (error: any) {
      console.error('Failed to stop local server:', error);
      return { success: false, error: error.message || 'Failed to stop server' };
    }
  });

  // Get server status
  ipcMain.handle('mode:get-status', async () => {
    const status = getServerStatus();
    isServerRunning = status.running;
    return status;
  });

  // Save mode preference
  ipcMain.handle('mode:save-preference', async (_, mode: 'cloud' | 'local') => {
    saveMode(mode);
    return { success: true };
  });

  // Get mode preference
  ipcMain.handle('mode:get-preference', async () => {
    return { mode: getSavedMode() };
  });

  // Figma API Key handlers
  ipcMain.handle('apikey:save', async (_, apiKey: string) => {
    try {
      saveFigmaApiKey(apiKey);
      
      // Set environment variable for immediate use
      process.env.FIGMA_API_KEY = apiKey;
      
      return { success: true };
    } catch (error: any) {
      console.error('Failed to save API key:', error);
      return { success: false, error: error.message || 'Failed to save API key' };
    }
  });

  ipcMain.handle('apikey:get', async () => {
    try {
      const apiKey = getFigmaApiKey();
      return { success: true, apiKey };
    } catch (error: any) {
      console.error('Failed to get API key:', error);
      return { success: false, error: error.message || 'Failed to get API key' };
    }
  });

  ipcMain.handle('apikey:delete', async () => {
    try {
      deleteFigmaApiKey();
      delete process.env.FIGMA_API_KEY;
      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete API key:', error);
      return { success: false, error: error.message || 'Failed to delete API key' };
    }
  });

  ipcMain.handle('apikey:has', async () => {
    try {
      const exists = hasApiKey();
      return { success: true, hasKey: exists };
    } catch (error: any) {
      console.error('Failed to check API key:', error);
      return { success: false, error: error.message || 'Failed to check API key' };
    }
  });
}

/**
 * Initialize the application
 */
async function initialize() {
  try {
    console.log('🚀 Starting DesignQA Desktop App (Windows)...');

    // Setup IPC handlers first
    setupIpcHandlers();

    // Create window after initialization
    app.whenReady().then(async () => {

      // Load API key and set as environment variable if available
      const savedApiKey = getFigmaApiKey();
      if (savedApiKey) {
        process.env.FIGMA_API_KEY = savedApiKey;
        console.log('🔑 Loaded Figma API key from storage');
      }

      // Auto-detect cloud backend availability
      console.log('🔍 Checking cloud backend availability...');
      // Increased timeout to 8s to handle Render.com cold starts
      const cloudAvailable = await checkCloudBackend('https://designqa.onrender.com/api/health', 8000);
      
      if (cloudAvailable) {
        console.log('☁️ Cloud backend is available - starting in Cloud Mode');
        saveMode('cloud');
        isServerRunning = false;
      } else {
        console.log('⚠️ Cloud backend not reachable - starting in Local Mode');
        try {
          const result = await startEmbeddedServer();
          serverPort = result.port;
          isServerRunning = true;
          console.log(`✅ Embedded server started on port ${serverPort}`);

          // Initialize MCP bridge for Desktop Figma MCP
          await initializeMCPBridge();
          console.log('✅ MCP bridge initialized');
          
          saveMode('local');
        } catch (error) {
          console.error('❌ Failed to start embedded server:', error);
          console.log('⚠️ Falling back to Cloud Mode without server');
          saveMode('cloud');
          // Don't quit - let user try cloud mode
        }
      }

      createWindow();
      void checkForUpdates();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      // On Windows, quit when all windows are closed
      app.quit();
    });

    app.on('before-quit', async () => {
      console.log('🛑 Shutting down...');
      if (isServerRunning) {
        try {
          await stopEmbeddedServer();
        } catch (error) {
          console.error('Error stopping server:', error);
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    app.quit();
  }
}

// Initialize on startup
initialize();

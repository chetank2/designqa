/**
 * Electron Main Process
 * Entry point for DesignQA Desktop App (macOS)
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { startEmbeddedServer, stopEmbeddedServer, getServerStatus, checkCloudBackend } from './server.js';
import { initializeMCPBridge } from './mcp-bridge.js';
import { saveFigmaApiKey, getFigmaApiKey, deleteFigmaApiKey, hasApiKey } from './api-key-storage.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import fs from 'fs';
import util from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEarlyLogPath(): string {
  try {
    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Logs', 'DesignQA', 'main-process.log');
    }
    return path.join(os.homedir(), '.designqa', 'logs', 'main-process.log');
  } catch {
    return path.join(process.cwd(), 'designqa-main-process.log');
  }
}

function appendEarlyLog(message: string) {
  try {
    const logPath = getEarlyLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, message);
  } catch {
    // ignore
  }
}

function getEarlyLogDir(): string {
  return path.dirname(getEarlyLogPath());
}

function setupFileLogging() {
  const logDir = getEarlyLogDir();
  const mainLogPath = path.join(logDir, 'main-process.log');
  const localLogPath = path.join(logDir, 'local-server.log');

  let mainStream: fs.WriteStream | null = null;
  let localStream: fs.WriteStream | null = null;

  const openStreams = () => {
    if (mainStream && localStream) return;
    try {
      fs.mkdirSync(logDir, { recursive: true });
      mainStream = fs.createWriteStream(mainLogPath, { flags: 'a' });
      localStream = fs.createWriteStream(localLogPath, { flags: 'a' });
    } catch {
      mainStream = null;
      localStream = null;
    }
  };

  const writeLine = (level: 'log' | 'warn' | 'error', args: unknown[]) => {
    try {
      openStreams();
      const stamp = new Date().toISOString();
      const rendered = util.format(...(args as any[]));
      const line = `[${stamp}] [${level}] ${rendered}\n`;
      mainStream?.write(line);
      localStream?.write(line);
    } catch {
      // ignore
    }
  };

  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info ? console.info.bind(console) : console.log.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
  };

  console.log = (...args: any[]) => {
    original.log(...args);
    writeLine('log', args);
  };
  console.warn = (...args: any[]) => {
    original.warn(...args);
    writeLine('warn', args);
  };
  console.error = (...args: any[]) => {
    original.error(...args);
    writeLine('error', args);
  };
  console.info = (...args: any[]) => {
    original.info(...args);
    writeLine('log', args);
  };
  console.debug = (...args: any[]) => {
    original.debug(...args);
    writeLine('log', args);
  };

  // Make sure we have at least one line so users can find the file.
  writeLine('log', [`📝 Logging to ${mainLogPath} (and ${localLogPath})`]);
}

// Enable file logging as early as possible (before app.whenReady()) so startup failures are captured.
setupFileLogging();

process.on('uncaughtException', (error) => {
  const stamp = new Date().toISOString();
  const payload =
    `\n[${stamp}] uncaughtException\n` +
    `message: ${error?.message || String(error)}\n` +
    `stack:\n${error?.stack || '(no stack)'}\n`;
  appendEarlyLog(payload);
  // Keep Electron default dialog, but ensure we persist details for debugging.
});

process.on('unhandledRejection', (reason) => {
  const stamp = new Date().toISOString();
  const payload =
    `\n[${stamp}] unhandledRejection\n` +
    `reason: ${reason instanceof Error ? reason.message : String(reason)}\n` +
    `stack:\n${reason instanceof Error ? reason.stack : '(no stack)'}\n`;
  appendEarlyLog(payload);
});

let mainWindow: BrowserWindow | null = null;
let serverPort: number = 3847;
let isServerRunning = false;
const ALWAYS_SHOW_MODE_DIALOG = true;
const UPDATE_CHECK_TIMEOUT_MS = 6000;

/**
 * Get saved mode preference from localStorage equivalent
 * In Electron, we'll use a simple file-based storage or default to cloud
 */
function getSavedMode(): 'cloud' | 'local' {
  // Try to read from a simple config file
  const configPath = path.join(app.getPath('userData'), 'app-mode.json');
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
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
    writeFileSync(configPath, JSON.stringify({ mode }), 'utf-8');
    // Removed: console.log(`✅ Saved mode preference: ${mode}`);
  } catch (error) {
    console.error('❌ Could not save mode preference:', error);
  }
}

function showDialogSync(options: Electron.MessageBoxSyncOptions): number {
  if (mainWindow) {
    return dialog.showMessageBoxSync(mainWindow, options);
  }
  return dialog.showMessageBoxSync(options);
}

async function showDialog(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  if (mainWindow) {
    return dialog.showMessageBox(mainWindow, options);
  }
  return dialog.showMessageBox(options);
}

function promptForMode(): 'cloud' | 'local' {
  const response = showDialogSync({
    type: 'question',
    buttons: ['Local Mode (Recommended)', 'Cloud Mode'],
    defaultId: 0,
    cancelId: 0,
    title: 'Choose Startup Mode',
    message: 'How would you like to run DesignQA?',
    detail: 'Local mode runs the embedded server on this machine. Cloud mode requires remote MCP support.'
  });

  return response === 1 ? 'cloud' : 'local';
}

function resolveStartupMode(): 'cloud' | 'local' {
  const savedMode = getSavedMode();
  const hasSavedMode = existsSync(path.join(app.getPath('userData'), 'app-mode.json'));
  const shouldPrompt = ALWAYS_SHOW_MODE_DIALOG || !hasSavedMode;

  if (shouldPrompt) {
    const chosenMode = promptForMode();
    if (chosenMode === 'cloud') {
      showDialogSync({
        type: 'info',
        buttons: ['OK'],
        defaultId: 0,
        title: 'Cloud Mode Unavailable',
        message: 'Cloud mode is not available yet.',
        detail: 'DesignQA currently requires local MCP. The app will start in local mode.'
      });
      saveMode('local');
      return 'local';
    }

    saveMode('local');
    return 'local';
  }

  return savedMode;
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
    // Removed: console.log('ℹ️ Update check skipped (DESIGNQA_GITHUB_REPO not set).');
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
      // Removed: console.log(`✅ App is up to date (v${currentVersion}).`);
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

function loadMainWindowContent() {
  if (!mainWindow) return;

  // Load URL based on mode and environment
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    // In dev, always use Vite dev server
    // #region agent log
    // Removed: console.log('[DEBUG] loadMainWindowContent: Dev mode, loading http://localhost:5173');
    // #endregion
    mainWindow.loadURL('http://localhost:5173');
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.openDevTools();
    }
    return;
  }

  // In production, load the frontend through the backend server
  // This ensures assets are served correctly and all paths resolve properly
  // The backend server serves frontend files from frontend/dist
  if (isServerRunning) {
    const localServerUrl = `http://localhost:${serverPort}`;
    // #region agent log
    // Removed: console.log(`[DEBUG] loadMainWindowContent: Server running, loading ${localServerUrl}, isServerRunning=${isServerRunning}, serverPort=${serverPort}`);
    // #endregion
    console.log('📦 Loading frontend from backend server:', localServerUrl);
    mainWindow.loadURL(localServerUrl).catch((error) => {
      // #region agent log
      // Removed: console.log(`[DEBUG] loadMainWindowContent: Failed to load from server, error:`, error);
      // #endregion
      console.error('❌ Failed to load from backend server:', error);
      if (!mainWindow) return;
      // Fallback: try loading file directly
      const rendererPath = path.join(__dirname, '../renderer/index.html');
      if (existsSync(rendererPath)) {
        // #region agent log
        // Removed: console.log(`[DEBUG] loadMainWindowContent: Falling back to loadFile: ${rendererPath}`);
        // #endregion
        console.log('📦 Falling back to loading file directly:', rendererPath);
        mainWindow.loadFile(rendererPath);
      } else {
        // Final fallback to cloud URL
        // #region agent log
        // Removed: console.log(`[DEBUG] loadMainWindowContent: Final fallback to cloud URL`);
        // #endregion
        console.warn('⚠️ Falling back to cloud URL');
        const cloudUrl = getCloudAppUrl();
        mainWindow.loadURL(cloudUrl);
      }
    });
    return;
  }

  // Server not running yet, try loading file directly
  const rendererPath = path.join(__dirname, '../renderer/index.html');
  if (existsSync(rendererPath)) {
    // #region agent log
    // Removed: console.log(`[DEBUG] loadMainWindowContent: Server not running, loading file: ${rendererPath}, isServerRunning=${isServerRunning}`);
    // #endregion
    console.log('📦 Loading local renderer from file:', rendererPath);
    mainWindow.loadFile(rendererPath);
  } else {
    // Fallback to cloud URL
    // #region agent log
    // Removed: console.log(`[DEBUG] loadMainWindowContent: Renderer not found, falling back to cloud`);
    // #endregion
    console.warn('⚠️ Local renderer not found, falling back to cloud URL');
    const cloudUrl = getCloudAppUrl();
    // Removed: console.log('☁️ Loading from cloud:', cloudUrl);
    mainWindow.loadURL(cloudUrl);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Preload script lives under dist/preload after build
      preload: path.join(__dirname, '../preload/preload.js')
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    resizable: true,
    minWidth: 800,
    minHeight: 600
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Prevent in-app "window.open(...)" from spawning duplicate Electron windows.
  // Open external links in the user's default browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      shell.openExternal(url);
    } catch {
      // ignore
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      // #region agent log
      const origin = mainWindow?.webContents?.getURL() || 'N/A';
      // Removed: console.log(`[DEBUG] will-navigate: ${url}, current: ${origin}`);
      // #endregion
      const parsed = new URL(url);
      const isLocal =
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
        // allow any local port (local mode switches ports sometimes)
        parsed.protocol === 'http:';
      const isFileProtocol = parsed.protocol === 'file:';
      
      // #region agent log
      // Removed: console.log(`[DEBUG] will-navigate check: isLocal=${isLocal}, isFileProtocol=${isFileProtocol}, protocol=${parsed.protocol}`);
      // #endregion
      
      if (isFileProtocol) {
        // #region agent log
        // Removed: console.log(`[DEBUG] will-navigate: Blocking file:// navigation to ${url}`);
        // #endregion
        event.preventDefault();
        return;
      }
      
      if (!isLocal && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
        // #region agent log
        // Removed: console.log(`[DEBUG] will-navigate: Opening external URL ${url}`);
        // #endregion
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch (error) {
      // #region agent log
      // Removed: console.log(`[DEBUG] will-navigate error:`, error);
      // #endregion
      // ignore
    }
  });

  loadMainWindowContent();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Setup IPC handlers for mode switching
 */
function setupIpcHandlers() {
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (!url || typeof url !== 'string') return false;
    try {
      // Allow http(s) and file URLs; block everything else.
      const parsed = new URL(url);
      if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return false;
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });

  // Start local server
  ipcMain.handle('mode:start-local-server', async () => {
    try {
      // Removed: console.log('═'.repeat(80));
      // Removed: console.log('🚀 IPC: mode:start-local-server called');
      // Removed: console.log('═'.repeat(80));

      if (isServerRunning) {
        const status = getServerStatus();
        // Removed: console.log('ℹ️ Server already running:', status);
        return { success: true, port: status.port, alreadyRunning: true };
      }

      // Removed: console.log('Starting embedded server...');
      const result = await startEmbeddedServer();
      serverPort = result.port;
      isServerRunning = true;

      // Removed: console.log(`✅ Server started successfully on port ${serverPort}`);

      // Verify server is actually listening
      const status = getServerStatus();
      if (!status.running) {
        throw new Error('Server startup returned success but getServerStatus() shows not running');
      }

      // Removed: console.log('Server status check passed:', status);

      // Initialize MCP bridge when server starts
      // Removed: console.log('Initializing MCP bridge...');
      await initializeMCPBridge();
      console.log('✅ MCP bridge initialized');

      // Removed: console.log('═'.repeat(80));
      console.log('✅ Local server startup complete');
      // Removed: console.log('═'.repeat(80));

      return { success: true, port: result.port };
    } catch (error: any) {
      console.error('═'.repeat(80));
      console.error('❌ IPC: mode:start-local-server FAILED');
      console.error('═'.repeat(80));
      console.error('Error:', error);

      // Log full error details for debugging
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }

      // Return a user-friendly error message
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      console.error('Returning error to renderer:', errorMessage);
      console.error('═'.repeat(80));

      return { success: false, error: errorMessage };
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
      // Sanitize error to prevent serialization issues
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      const sanitizedError = errorMessage.replace(/import\s+.*?from|export\s+.*?from/gi, '[module reference]');
      return { success: false, error: sanitizedError || 'Failed to stop server' };
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

  // MCP status handler
  ipcMain.handle('mcp:status', async () => {
    const { getMCPStatus } = await import('./mcp-bridge.js');
    return getMCPStatus();
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

  // App version handler
  ipcMain.handle('app:version', async () => {
    try {
      return {
        success: true,
        version: app.getVersion(),
        name: app.getName(),
        isDevMode: process.env.NODE_ENV === 'development'
      };
    } catch (error: any) {
      console.error('Failed to get app version:', error);
      return {
        success: false,
        error: error.message || 'Failed to get app version'
      };
    }
  });
}

/**
 * Initialize the application
 */
async function initialize() {
  try {
    // Removed: console.log('🚀 Starting DesignQA Desktop App...');

    // Setup IPC handlers first
    setupIpcHandlers();

    // Create window after initialization
    app.whenReady().then(async () => {
      createWindow();

      // Load API key and set as environment variable if available
      const savedApiKey = getFigmaApiKey();

      if (savedApiKey) {
        process.env.FIGMA_API_KEY = savedApiKey;
        // Removed: console.log('🔑 Loaded Figma API key from storage');
      }

      // Check if we have a saved mode preference
      const startupMode = resolveStartupMode();
      const hasSavedMode = existsSync(path.join(app.getPath('userData'), 'app-mode.json'));

      if (hasSavedMode) {
        // Removed: console.log(`ℹ️ Using startup mode preference: ${startupMode}`);
        if (startupMode === 'local') {
          // Removed: console.log('🚀 Starting in Local Mode (User Preference)...');
          try {
            const result = await startEmbeddedServer();
            serverPort = result.port;
            isServerRunning = true;
            // Removed: console.log(`✅ Embedded server started on port ${serverPort}`);

            // Verify server is actually listening
            const status = getServerStatus();
            if (!status.running) {
              throw new Error('Server startup returned success but getServerStatus() shows not running');
            }

            // Initialize MCP bridge for Desktop Figma MCP
            await initializeMCPBridge();
            console.log('✅ MCP bridge initialized');
          } catch (error) {
            console.error('═'.repeat(80));
            console.error('❌ Failed to start embedded server during initialization');
            console.error('═'.repeat(80));
            console.error('Error:', error);
            if (error instanceof Error) {
              console.error('Error message:', error.message);
              console.error('Error stack:', error.stack);
            }
            console.error('═'.repeat(80));
            // Set state to allow manual server start via UI
            isServerRunning = false;
            serverPort = 3847;
            // Don't change mode - user wanted local, let them try to start manually
          }
        } else {
          // Cloud mode preference - but still need server for UI
          // Start server even in cloud mode (server is required for desktop app)
          console.log('🚀 Starting embedded server (Cloud Mode preference)...');
          try {
            const result = await startEmbeddedServer();
            serverPort = result.port;
            isServerRunning = true;

            // Verify server is actually listening
            const status = getServerStatus();
            if (!status.running) {
              throw new Error('Server startup returned success but getServerStatus() shows not running');
            }

            // Initialize MCP bridge
            await initializeMCPBridge();
            console.log('✅ MCP bridge initialized');
          } catch (error) {
            console.error('═'.repeat(80));
            console.error('❌ FATAL: Failed to start embedded server');
            console.error('═'.repeat(80));
            console.error('Error:', error);
            if (error instanceof Error) {
              console.error('Error message:', error.message);
              console.error('Error stack:', error.stack);
            }
            console.error('═'.repeat(80));
            // Server is required - show error and quit
            app.quit();
          }
        }
      } else {
        // First run: Always start embedded server (required for desktop app to function)
        // Cloud check only determines data storage preference, not server startup
        console.log('🚀 Starting embedded server...');
        try {
          const result = await startEmbeddedServer();
          serverPort = result.port;
          isServerRunning = true;

          // Verify server is actually listening
          const status = getServerStatus();
          if (!status.running) {
            throw new Error('Server startup returned success but getServerStatus() shows not running');
          }

          // Initialize MCP bridge for Desktop Figma MCP
          await initializeMCPBridge();
          console.log('✅ MCP bridge initialized');

          // Check cloud availability for mode preference (non-blocking)
          checkCloudBackend('https://designqa.onrender.com/api/health', 5000).then((cloudAvailable) => {
            if (cloudAvailable) {
              saveMode('cloud');
            } else {
              saveMode('local');
            }
          }).catch(() => {
            saveMode('local');
          });
        } catch (error) {
          console.error('═'.repeat(80));
          console.error('❌ FATAL: Failed to start embedded server');
          console.error('═'.repeat(80));
          console.error('Error:', error);
          if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
          }
          console.error('═'.repeat(80));
          // Server is required - show error and quit
          app.quit();
        }
      }

      // Ensure we load the final mode after startup checks complete.
      loadMainWindowContent();
      void checkForUpdates();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('before-quit', async () => {
      // Removed: console.log('🛑 Shutting down...');
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

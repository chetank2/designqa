/**
 * Electron Main Process
 * Entry point for DesignQA Desktop App (macOS)
 */

import { app, BrowserWindow } from 'electron';
import { startEmbeddedServer } from './server.js';
import { initializeMCPBridge } from './mcp-bridge.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let serverPort: number = 3847;

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
      preload: path.join(__dirname, '../../preload/preload.js')
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff'
  });

  // Load the embedded server URL
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://localhost:${serverPort}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize the application
 */
async function initialize() {
  try {
    console.log('🚀 Starting DesignQA Desktop App...');

    // Start embedded Express server
    serverPort = await startEmbeddedServer();
    console.log(`✅ Embedded server started on port ${serverPort}`);

    // Initialize MCP bridge
    await initializeMCPBridge();
    console.log('✅ MCP bridge initialized');

    // Create window after server is ready
    app.whenReady().then(() => {
      createWindow();

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
      console.log('🛑 Shutting down...');
      // Cleanup can be added here
    });

  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    app.quit();
  }
}

// Initialize on startup
initialize();

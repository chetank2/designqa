/**
 * DesignQA Local Server Launcher
 * Starts the embedded backend and opens the browser once ready.
 */

import { app, shell, Event } from 'electron';
import http from 'http';
import { startEmbeddedServer, stopEmbeddedServer } from './server.js';

const DEFAULT_PORT = 3847;
const HEALTH_PATH = '/api/health';
const HEALTH_TIMEOUT_MS = 45000;
const HEALTH_POLL_INTERVAL_MS = 750;

let openedBrowser = false;
let serverPort = DEFAULT_PORT;

function requestSingleInstance(): boolean {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    return false;
  }
  app.on('second-instance', () => {
    openBrowser();
  });
  return true;
}

function openBrowser() {
  if (openedBrowser) return;
  openedBrowser = true;
  const url = `http://localhost:${serverPort}`;
  shell.openExternal(url).catch(() => {
    // Ignore browser launch errors; user can open manually.
  });
}

function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        {
          host: '127.0.0.1',
          port,
          path: HEALTH_PATH,
          timeout: 2000
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            res.resume();
            resolve();
            return;
          }
          res.resume();
          retry();
        }
      );

      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('Health check timed out'));
        return;
      }
      setTimeout(attempt, HEALTH_POLL_INTERVAL_MS);
    };

    attempt();
  });
}

async function startLauncher() {
  try {
    const server = await startEmbeddedServer();
    serverPort = server.port || DEFAULT_PORT;
  } catch (error) {
    console.error('Failed to start embedded server:', error);
    openBrowser();
    return;
  }

  try {
    await waitForHealth(serverPort, HEALTH_TIMEOUT_MS);
    openBrowser();
  } catch (error) {
    console.warn('Health check failed:', error);
    openBrowser();
  }
}

if (!requestSingleInstance()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    if (app.dock && typeof app.dock.hide === 'function') {
      app.dock.hide();
    }
    await startLauncher();
  });
}

app.on('activate', () => {
  openBrowser();
});

app.on('before-quit', async () => {
  try {
    await stopEmbeddedServer();
  } catch {
    // Ignore shutdown errors.
  }
});

app.on('window-all-closed', (event: Event) => {
  // Keep the process alive to host the local server.
  event.preventDefault();
});

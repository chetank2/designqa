#!/usr/bin/env node

/**
 * DesignQA Server - SaaS Mode
 * Cloud-only implementation for Railway deployment
 */

import { startServer } from './src/core/server/index.js';
import { shutdownBrowserPool } from './src/browser/BrowserPool.js';
import { shutdownResourceManager } from './src/utils/ResourceManager.js';

// Use Railway's PORT or default to 3847
const PORT = process.env.PORT || 3847;

/**
 * Start the server
 */
async function main() {
  try {
    console.log('🚀 Starting DesignQA Server (SaaS Mode)...');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Start the server
    const server = await startServer(PORT);

    // Store server reference for graceful shutdown
    global.serverInstance = server;

    console.log('✅ Server started successfully');

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Track active extractions for graceful shutdown
let isShuttingDown = false;
let activeExtractions = 0;

global.trackExtraction = {
  start: () => activeExtractions++,
  end: () => activeExtractions--,
  getActive: () => activeExtractions
};

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n📡 Received ${signal}, initiating graceful shutdown...`);

  // Wait for active extractions to complete
  const waitForExtractions = async () => {
    if (activeExtractions > 0) {
      console.log(`⏳ Waiting for ${activeExtractions} active extraction(s) to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return waitForExtractions();
    }
  };

  await waitForExtractions();

  console.log('🛑 Shutting down resources...');

  try {
    // Shutdown browser pool
    await shutdownBrowserPool();

    // Shutdown resource manager
    await shutdownResourceManager();

    // Close server
    if (global.serverInstance && typeof global.serverInstance.close === 'function') {
      await new Promise((resolve) => {
        global.serverInstance.close(() => {
          console.log('✅ Server closed');
          resolve();
        });
      });
    }

    console.log('✅ Graceful shutdown complete');
    process.exit(0);

  } catch (error) {
    console.error('⚠️ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
main();

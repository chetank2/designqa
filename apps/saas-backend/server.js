#!/usr/bin/env node

/**
 * DesignQA Server - SaaS Mode
 * Cloud-only implementation for Railway deployment
 */

// Load environment variables from .env file (for local development)
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure immediate log output - unbuffer stdout/stderr for real-time terminal display
if (process.stdout.isTTY) {
  process.stdout.setEncoding('utf8');
}
if (process.stderr.isTTY) {
  process.stderr.setEncoding('utf8');
}

// Try to load .env file from backend directory, then root
const envPaths = [
  join(__dirname, '.env'),
  join(__dirname, '../../.env')
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`📄 Loaded environment from: ${envPath}`);
    break;
  }
}

import { startServer } from './src/core/server/index.js';
import { shutdownBrowserPool } from './src/browser/BrowserPool.js';
import { shutdownResourceManager } from './src/utils/ResourceManager.js';
import { validateEnvironment } from './src/config/environmentValidator.js';

// Use Railway's PORT or default to 3847
const PORT = process.env.PORT || 3847;

/**
 * Start the server
 */
async function main() {
  try {
    console.log('🚀 Starting DesignQA Server (SaaS Mode)...');

    // Validate environment configuration
    console.log('🔍 Validating environment configuration...');
    let config;
    try {
      config = validateEnvironment();
      console.log('✅ Environment validation passed');
    } catch (error) {
      console.error('❌ Environment validation failed:', error.message);
      console.error('\n📋 To create an environment template:');
      console.error('  npm run generate-env-template');
      process.exit(1);
    }

    console.log(`📡 Port: ${config.port}`);
    console.log(`🌐 Environment: ${config.nodeEnv}`);
    console.log(`🗄️  Database: ${config.database.mode}`);
    console.log(`☁️  Cloud deployment: ${config.isCloud ? 'Yes' : 'No'}`);

    // Start the server
    const server = await startServer(config.port, config);

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

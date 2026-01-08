#!/usr/bin/env node

/**
 * Test embedded server startup to debug Mac app issues
 */

import { startEmbeddedServer } from './apps/desktop-mac/src/main/server.js';

console.log('Testing embedded server startup...');
console.log('Current working directory:', process.cwd());
console.log('process.env.NODE_ENV:', process.env.NODE_ENV);
console.log('__dirname equivalent:', import.meta.url);

// Set up environment like Electron would
process.env.DEPLOYMENT_MODE = 'desktop';
process.env.RUNNING_IN_ELECTRON = 'true';
process.env.PORT = '3847';

try {
  console.log('Starting embedded server...');
  const result = await startEmbeddedServer();
  console.log('✅ Server started successfully!');
  console.log('Port:', result.port);
  console.log('Server listening:', result.server.listening);

  // Test the server
  const response = await fetch(`http://localhost:${result.port}/api/health`);
  console.log('Health check status:', response.status);
  console.log('Health check response:', await response.text());

  // Stop the server
  result.server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });

} catch (error) {
  console.error('❌ Failed to start embedded server:');
  console.error(error);
  if (error.stack) {
    console.error('Stack trace:');
    console.error(error.stack);
  }
  process.exit(1);
}
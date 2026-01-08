#!/usr/bin/env node

import { startEmbeddedServer } from './apps/desktop-mac/src/main/server.js';

console.log('🧪 Testing Mac app embedded server startup...');

// Set up environment like Electron would
process.env.DEPLOYMENT_MODE = 'desktop';
process.env.RUNNING_IN_ELECTRON = 'true';
process.env.PORT = '3847';

// Change to the Mac app saas-backend directory like Electron would
process.chdir('./apps/desktop-mac/saas-backend');
console.log('📁 Changed directory to:', process.cwd());

try {
  console.log('🚀 Starting embedded server...');
  const result = await startEmbeddedServer();
  console.log('✅ Server started successfully!');
  console.log('📡 Port:', result.port);

  // Test the server
  const response = await fetch(`http://localhost:${result.port}/api/health`);
  console.log('🏥 Health check status:', response.status);
  console.log('📄 Health check response:', await response.text());

  // Stop the server
  result.server.close(() => {
    console.log('🛑 Server stopped');
    process.exit(0);
  });

} catch (error) {
  console.error('❌ Failed to start embedded server:');
  console.error(error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
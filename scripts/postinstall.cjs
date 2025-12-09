const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper to determine if we should skip running electron-builder
const shouldSkipElectronSetup = () => {
  if (process.env.VERCEL) return true;
  if (process.env.CI === 'true') return true;
  if (process.env.SKIP_ELECTRON_POSTINSTALL === 'true') return true;
  if (process.env.DOCKER_BUILD === 'true') return true;
  return false;
};

if (shouldSkipElectronSetup()) {
  console.log('Skipping electron-builder install-app-deps (non-desktop environment detected).');
  process.exit(0);
}

// Check if electron-builder is available
try {
  console.log('Running electron-builder install-app-deps...');
  execSync('electron-builder install-app-deps', { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to run electron-builder install-app-deps.');
  console.error(error.message);
  process.exit(0);
}

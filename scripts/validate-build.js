#!/usr/bin/env node
/**
 * Build validation script
 * Validates that all versions are synchronized before building
 * Can be used in CI/CD pipelines to catch version inconsistencies
 */

import { checkVersionConsistency } from './sync-version.js';

console.log('🔍 Validating build prerequisites...');

// Check version consistency
const inconsistencies = checkVersionConsistency();

if (inconsistencies.length > 0) {
  console.log('❌ Build validation failed: Version inconsistencies detected');
  inconsistencies.forEach(pkg => {
    console.log(`   ${pkg.path}: ${pkg.currentVersion} (expected: ${pkg.expectedVersion})`);
  });
  console.log('\nRun "npm run version:sync" to fix inconsistencies before building');
  process.exit(1);
}

// Additional build checks could go here
console.log('✅ Build validation passed');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 18) {
  console.log('⚠️ Warning: Node.js 18+ is recommended for optimal performance');
}

console.log(`📋 Build environment:
   Node.js: ${nodeVersion}
   Platform: ${process.platform}
   Arch: ${process.arch}
   Working directory: ${process.cwd()}
`);

console.log('🚀 Ready for build!');
#!/usr/bin/env node
/**
 * Post-version script
 * Automatically syncs all package versions after npm version command
 * This script should be called in the "postversion" npm script
 */

import { syncVersions } from './sync-version.js';

console.log('🔄 Post-version: Syncing all packages...');

try {
  const result = syncVersions();
  console.log(`✅ Version sync complete. Updated ${result.updated.length} packages.`);

  if (result.failed.length > 0) {
    console.log(`❌ Failed to update ${result.failed.length} packages`);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Post-version sync failed:', error.message);
  process.exit(1);
}
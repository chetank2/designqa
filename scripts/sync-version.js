#!/usr/bin/env node
/**
 * Version synchronization script
 * Syncs version numbers across all packages in the monorepo
 * Uses root package.json as single source of truth
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const ROOT_PACKAGE_PATH = path.join(WORKSPACE_ROOT, 'package.json');

// All packages that should have synchronized versions
const PACKAGES_TO_SYNC = [
  'apps/saas-backend/package.json',
  'apps/saas-frontend/package.json',
  'apps/desktop-mac/package.json',
  'apps/desktop-win/package.json',
  'apps/chrome-extension/package.json',
  'packages/compare-engine/package.json',
  'packages/mcp-client/package.json'
];

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`❌ Failed to read ${filePath}:`, error.message);
    process.exit(1);
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  } catch (error) {
    console.error(`❌ Failed to write ${filePath}:`, error.message);
    process.exit(1);
  }
}

function getCurrentVersion() {
  const rootPackage = readJsonFile(ROOT_PACKAGE_PATH);
  if (!rootPackage.version) {
    console.error('❌ Root package.json missing version field');
    process.exit(1);
  }
  return rootPackage.version;
}

function checkVersionConsistency() {
  const rootVersion = getCurrentVersion();
  const inconsistentPackages = [];

  console.log(`🔍 Checking version consistency (root: ${rootVersion})`);

  for (const packagePath of PACKAGES_TO_SYNC) {
    const fullPath = path.join(WORKSPACE_ROOT, packagePath);

    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  Package not found: ${packagePath}`);
      continue;
    }

    const packageData = readJsonFile(fullPath);
    if (packageData.version !== rootVersion) {
      inconsistentPackages.push({
        path: packagePath,
        currentVersion: packageData.version,
        expectedVersion: rootVersion
      });
    }
  }

  return inconsistentPackages;
}

function syncVersions(targetVersion = null) {
  const rootVersion = targetVersion || getCurrentVersion();
  const updated = [];
  const failed = [];

  console.log(`🔄 Syncing all packages to version ${rootVersion}`);

  // Update root package.json if target version specified
  if (targetVersion) {
    console.log(`📝 Updating root package.json to ${targetVersion}`);
    const rootPackage = readJsonFile(ROOT_PACKAGE_PATH);
    rootPackage.version = targetVersion;
    writeJsonFile(ROOT_PACKAGE_PATH, rootPackage);
  }

  // Sync all child packages
  for (const packagePath of PACKAGES_TO_SYNC) {
    const fullPath = path.join(WORKSPACE_ROOT, packagePath);

    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  Skipping missing package: ${packagePath}`);
      continue;
    }

    try {
      const packageData = readJsonFile(fullPath);
      const oldVersion = packageData.version;

      if (oldVersion !== rootVersion) {
        packageData.version = rootVersion;
        writeJsonFile(fullPath, packageData);
        updated.push({ path: packagePath, from: oldVersion, to: rootVersion });
        console.log(`✅ Updated ${packagePath}: ${oldVersion} → ${rootVersion}`);
      } else {
        console.log(`✓  ${packagePath}: already ${rootVersion}`);
      }
    } catch (error) {
      failed.push({ path: packagePath, error: error.message });
      console.error(`❌ Failed to update ${packagePath}:`, error.message);
    }
  }

  return { updated, failed };
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('🔧 DesignQA Version Sync Tool\n');

  switch (command) {
    case '--check':
      {
        const inconsistencies = checkVersionConsistency();
        if (inconsistencies.length === 0) {
          console.log('✅ All packages have consistent versions');
          process.exit(0);
        } else {
          console.log('❌ Found version inconsistencies:');
          inconsistencies.forEach(pkg => {
            console.log(`   ${pkg.path}: ${pkg.currentVersion} (expected: ${pkg.expectedVersion})`);
          });
          console.log('\nRun "npm run version:sync" to fix inconsistencies');
          process.exit(1);
        }
      }
      break;

    case '--set':
      {
        const targetVersion = args[1];
        if (!targetVersion) {
          console.error('❌ Please specify a version: npm run version:set 2.1.0');
          process.exit(1);
        }

        if (!/^\d+\.\d+\.\d+/.test(targetVersion)) {
          console.error('❌ Invalid version format. Expected: X.Y.Z');
          process.exit(1);
        }

        const result = syncVersions(targetVersion);
        console.log(`\n✅ Version sync complete. Updated ${result.updated.length} packages.`);

        if (result.failed.length > 0) {
          console.log(`❌ Failed to update ${result.failed.length} packages`);
          process.exit(1);
        }
      }
      break;

    default:
      {
        // Default: sync all packages to root version
        const result = syncVersions();
        console.log(`\n✅ Version sync complete. Updated ${result.updated.length} packages.`);

        if (result.failed.length > 0) {
          console.log(`❌ Failed to update ${result.failed.length} packages`);
          process.exit(1);
        }
      }
      break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { syncVersions, checkVersionConsistency, getCurrentVersion };
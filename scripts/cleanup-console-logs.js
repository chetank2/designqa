#!/usr/bin/env node
/**
 * Script to clean up production console.log statements
 * Keeps console.error, console.warn, and specific debug patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Patterns to keep (don't remove these)
const keepPatterns = [
  /console\.(error|warn|info)/g,
  /console\.log\(['"]❌/g,  // Error indicators
  /console\.log\(['"]⚠️/g,  // Warning indicators
  /console\.log\(['"]✅/g,  // Success indicators
  /console\.log\(['"]🔧/g,  // Setup indicators
  /console\.log\(['"]📦/g,  // Package indicators
  /console\.log.*password.*generated/gi, // Generated password logs
  /process\.env\.NODE_ENV === ['"]development['"]/g // Development-only logs
];

// Directories to process
const processDirectories = [
  'apps/saas-backend/src',
  'apps/saas-frontend/src',
  'apps/desktop-mac/src',
  'apps/desktop-win/src',
  'packages'
];

// File extensions to process
const extensions = ['.js', '.ts', '.tsx', '.jsx'];

let totalFilesProcessed = 0;
let totalLogsRemoved = 0;

function shouldKeepLog(line) {
  return keepPatterns.some(pattern => pattern.test(line));
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let modified = false;
  let removedInFile = 0;

  const processedLines = lines.map(line => {
    // Match console.log statements
    const consoleLogMatch = line.match(/^(\s*)console\.log\(/);

    if (consoleLogMatch && !shouldKeepLog(line)) {
      // Check if it's a single-line console.log
      if (line.includes(');')) {
        modified = true;
        removedInFile++;
        return `${consoleLogMatch[1]}// Removed: ${line.trim()}`;
      }
      // For multi-line console.log, we'll need more complex handling
      // For now, comment it out
      modified = true;
      removedInFile++;
      return `${consoleLogMatch[1]}// ${line.trim()}`;
    }

    return line;
  });

  if (modified) {
    fs.writeFileSync(filePath, processedLines.join('\n'));
    console.log(`✅ Processed ${filePath}: removed ${removedInFile} console.log statements`);
    totalLogsRemoved += removedInFile;
  }

  totalFilesProcessed++;
}

function walkDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and other unwanted directories
      if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
        walkDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) {
        processFile(fullPath);
      }
    }
  }
}

function main() {
  console.log('🧹 Starting console.log cleanup...\n');

  for (const dir of processDirectories) {
    const fullPath = path.join(projectRoot, dir);
    if (fs.existsSync(fullPath)) {
      console.log(`Processing directory: ${dir}`);
      walkDirectory(fullPath);
    } else {
      console.log(`⚠️ Directory not found: ${dir}`);
    }
  }

  console.log(`\n📊 Cleanup Summary:`);
  console.log(`   Files processed: ${totalFilesProcessed}`);
  console.log(`   Console.log statements removed: ${totalLogsRemoved}`);
  console.log(`\n✅ Console.log cleanup completed!`);

  if (totalLogsRemoved > 0) {
    console.log('\n📝 Next steps:');
    console.log('   1. Review the changes in your version control');
    console.log('   2. Test the application to ensure functionality is intact');
    console.log('   3. Commit the changes if everything works correctly');
  }
}

main();
#!/usr/bin/env node
/**
 * Import/Export Validation Script
 * Checks for import/export mismatches in the codebase
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const errors = [];
const warnings = [];

/**
 * Extract exports from a file
 */
function extractExports(filePath, content) {
  const exports = {
    named: new Set(),
    default: false,
    all: false
  };

  // Named exports: export function/const/class/let/var
  const namedExportRegex = /export\s+(?:function|const|let|var|class|async\s+function)\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.named.add(match[1]);
  }

  // export { ... }
  const exportListRegex = /export\s*\{([^}]+)\}/g;
  while ((match = exportListRegex.exec(content)) !== null) {
    const items = match[1].split(',').map(s => s.trim().split('as')[0].trim());
    items.forEach(item => {
      if (item && item !== 'default') {
        exports.named.add(item);
      }
    });
  }

  // export default
  if (/export\s+default/.test(content)) {
    exports.default = true;
  }

  // export * from
  if (/export\s+\*\s+from/.test(content)) {
    exports.all = true;
  }

  return exports;
}

/**
 * Extract imports from a file
 */
function extractImports(filePath, content) {
  const imports = [];

  // import { ... } from '...'
  const namedImportRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = namedImportRegex.exec(content)) !== null) {
    const items = match[1].split(',').map(s => s.trim().split('as')[0].trim());
    const fromPath = match[2];
    items.forEach(item => {
      if (item && item !== 'default') {
        imports.push({
          name: item,
          from: resolveImportPath(filePath, fromPath),
          type: 'named'
        });
      }
    });
  }

  // import default from '...'
  const defaultImportRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = defaultImportRegex.exec(content)) !== null) {
    const name = match[1];
    const fromPath = match[2];
    // Skip if it's actually a named import (has {})
    if (!match[0].includes('{')) {
      imports.push({
        name,
        from: resolveImportPath(filePath, fromPath),
        type: 'default'
      });
    }
  }

  return imports;
}

/**
 * Resolve import path to absolute path
 */
function resolveImportPath(fromFile, importPath) {
  if (importPath.startsWith('.')) {
    const fromDir = dirname(fromFile);
    let resolved = join(fromDir, importPath);
    
    // Try different extensions
    const extensions = ['.js', '.ts', '/index.js', '/index.ts'];
    for (const ext of extensions) {
      if (importPath.endsWith('.js') || importPath.endsWith('.ts')) {
        return resolved;
      }
      const withExt = resolved + ext;
      if (statSync(withExt).isFile()) {
        return withExt;
      }
    }
    return resolved;
  }
  return importPath; // External package
}

/**
 * Check if file exists
 */
function fileExists(filePath) {
  try {
    const extensions = ['', '.js', '.ts', '/index.js', '/index.ts'];
    for (const ext of extensions) {
      const fullPath = filePath + ext;
      if (statSync(fullPath).isFile()) {
        return fullPath;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate imports against exports
 */
function validateImports(filePath, imports, allExports) {
  imports.forEach(imp => {
    if (imp.from.startsWith('.')) {
      // Local import
      const targetFile = fileExists(imp.from);
      if (!targetFile) {
        errors.push(`❌ ${filePath}: Cannot resolve import "${imp.name}" from "${imp.from}"`);
        return;
      }

      const targetExports = allExports.get(targetFile);
      if (!targetExports) {
        warnings.push(`⚠️  ${filePath}: Could not parse exports from "${targetFile}"`);
        return;
      }

      if (imp.type === 'named' && !targetExports.named.has(imp.name) && !targetExports.all) {
        errors.push(`❌ ${filePath}: Import "${imp.name}" not exported from "${targetFile}"`);
      } else if (imp.type === 'default' && !targetExports.default && !targetExports.all) {
        errors.push(`❌ ${filePath}: Default import not exported from "${targetFile}"`);
      }
    }
  });
}

/**
 * Recursively scan directory for JS/TS files
 */
function scanDirectory(dir, fileMap, allExports) {
  const entries = readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath, fileMap, allExports);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        fileMap.set(fullPath, content);
        allExports.set(fullPath, extractExports(fullPath, content));
      } catch (error) {
        warnings.push(`⚠️  Could not read ${fullPath}: ${error.message}`);
      }
    }
  }
}

/**
 * Main validation function
 */
function main() {
  const srcDir = join(__dirname, '../src');
  const fileMap = new Map();
  const allExports = new Map();

  console.log('📦 Scanning files for exports...');
  scanDirectory(srcDir, fileMap, allExports);
  console.log(`✓ Found ${fileMap.size} files\n`);

  console.log('🔍 Validating imports...');
  fileMap.forEach((content, filePath) => {
    const imports = extractImports(filePath, content);
    validateImports(filePath, imports, allExports);
  });

  console.log('\n📊 Results:\n');
  
  if (errors.length > 0) {
    console.log('❌ ERRORS FOUND:\n');
    errors.forEach(err => console.log(err));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS:\n');
    warnings.forEach(warn => console.log(warn));
    console.log('');
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ No import/export mismatches found!');
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();

#!/usr/bin/env node
/**
 * Import/Export Validation Script
 * Checks for import/export mismatches in the codebase
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const errors = [];
const warnings = [];

function stripAlias(token) {
  return token.replace(/\s+as\s+[A-Za-z0-9_$]+$/i, '').trim();
}

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
    const items = match[1].split(',').map(stripAlias);
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
    const items = match[1].split(',').map(stripAlias);
    const fromPath = match[2];
    const isLocal = fromPath.startsWith('.');
    const resolvedFrom = resolveImportPath(filePath, fromPath);
    items.forEach(item => {
      if (item && item !== 'default') {
        imports.push({
          name: item,
          from: resolvedFrom,
          type: 'named',
          isLocal,
          source: fromPath
        });
      }
    });
  }

  // import default from '...'
  const defaultImportRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = defaultImportRegex.exec(content)) !== null) {
    const name = match[1];
    const fromPath = match[2];
    const isLocal = fromPath.startsWith('.');
    const resolvedFrom = resolveImportPath(filePath, fromPath);
    // Skip if it's actually a named import (has {})
    if (!match[0].includes('{')) {
      imports.push({
        name,
        from: resolvedFrom,
        type: 'default',
        isLocal,
        source: fromPath
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
    return join(fromDir, importPath);
  }
  return importPath; // External package
}

/**
 * Check if file exists
 */
function fileExists(filePath) {
  const hasExtension = filePath.endsWith('.js') || filePath.endsWith('.ts');
  const candidates = hasExtension
    ? [filePath]
    : [
        filePath,
        `${filePath}.js`,
        `${filePath}.ts`,
        join(filePath, 'index.js'),
        join(filePath, 'index.ts')
      ];

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Validate imports against exports
 */
function validateImports(filePath, imports, allExports) {
  imports.forEach(imp => {
    if (!imp.isLocal) {
      return;
    }

    const targetFile = fileExists(imp.from);
    if (!targetFile) {
      errors.push(`❌ ${filePath}: Cannot resolve import "${imp.name}" from "${imp.source}"`);
      return;
    }

    const targetExports = allExports.get(targetFile);
    if (!targetExports) {
      warnings.push(`⚠️  ${filePath}: Could not parse exports from "${targetFile}"`);
      return;
    }

    if (imp.type === 'named' && !targetExports.named.has(imp.name) && !targetExports.all) {
      errors.push(`❌ ${filePath}: Import "${imp.name}" not exported from "${imp.source}"`);
    } else if (imp.type === 'default' && !targetExports.default && !targetExports.all) {
      errors.push(`❌ ${filePath}: Default import from "${imp.source}" is missing a default export`);
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
